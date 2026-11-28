/**
 * The Concierge Send review (B7): draft → review (`ready`) → a person presses
 * Send → one delivery per recipient on their one frozen channel.
 *
 * - Nothing leaves Duna before `confirmConciergeSend`, and that needs the
 *   content hash the person reviewed. The hash covers the text, the kind and
 *   every recipient's single channel or reason, recomputed from the live
 *   roster at send time: if anyone joined, left, connected or opted out, the
 *   send is refused (CONFLICT) and the review is refreshed.
 * - AI may draft (`draftedBy: "duna"`, shown on the review); only a signed-in
 *   person with `messages:write` confirms. No other path sends.
 * - The message is posted to the thread through the existing messaging
 *   service as the club, attributed to the person (safety screening, roster
 *   sync, push and audit all run there). Outside channels are queued as
 *   `concierge.deliver` workflow jobs.
 * - Audit rows carry ids and counts; a message body never reaches a log.
 */
import { createHash } from "node:crypto";
import {
  auditLog,
  conciergeDeliveries,
  conciergeSendProposals,
  conciergeSendRecipients,
  conversationMessages,
  getDatabase,
  getTransactionalDatabase,
  messagingConversationParticipants,
  messagingConversations,
  organizations,
  people,
  workflowJobs,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { ApiActor } from "../../context";
import { sendConversationMessage } from "../../messaging-service";
import {
  loadChannelAvailability,
  type ChannelAvailabilityMap,
} from "./availability";
import type { ConciergeMessageKind } from "./channel-choice";
import {
  conciergeContentHash,
  GUARDIAN_NOTE,
  resolveRecipients,
  type ResolvedRecipient,
} from "./recipients";
import { ConciergeError, type ConciergeChannel } from "./types";

export const PROPOSAL_TTL_MS = 15 * 60_000;
export const CONCIERGE_DELIVER_JOB = "concierge.deliver";

type ProposalRow = typeof conciergeSendProposals.$inferSelect;
type ConversationRow = typeof messagingConversations.$inferSelect;

export interface PersonRef {
  readonly personId: string;
  readonly displayName: string;
  readonly initials?: string;
}

export function initialsOf(name: string): string | undefined {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return /^[A-Z]{1,3}$/.test(letters) ? letters : undefined;
}

export function personRef(person: {
  readonly id: string;
  readonly displayName: string;
}): PersonRef {
  const initials = initialsOf(person.displayName);
  return {
    personId: person.id,
    displayName: person.displayName,
    ...(initials ? { initials } : {}),
  };
}

/** A UUID derived from a stable string (the thread message id of a send). */
export function stableUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The club's thread, or NOT_FOUND (another club's id looks the same as a missing one). */
export async function loadClubThread(
  organizationId: string,
  conversationId: string,
): Promise<ConversationRow> {
  const [row] = await getDatabase()
    .select({ conversation: messagingConversations })
    .from(messagingConversations)
    .innerJoin(
      messagingConversationParticipants,
      and(
        eq(
          messagingConversationParticipants.conversationId,
          messagingConversations.id,
        ),
        eq(messagingConversationParticipants.principalType, "organization"),
        eq(messagingConversationParticipants.organizationId, organizationId),
        isNull(messagingConversationParticipants.leftAt),
      ),
    )
    .where(
      and(
        eq(messagingConversations.id, conversationId),
        eq(messagingConversations.status, "open"),
      ),
    )
    .limit(1);
  if (!row) throw new ConciergeError("NOT_FOUND", "Thread not found.");
  return row.conversation;
}

async function loadProposalRow(
  organizationId: string,
  proposalId: string,
): Promise<ProposalRow> {
  const row = await getDatabase().query.conciergeSendProposals.findFirst({
    where: and(
      eq(conciergeSendProposals.id, proposalId),
      eq(conciergeSendProposals.organizationId, organizationId),
    ),
  });
  if (!row) throw new ConciergeError("NOT_FOUND", "Send not found.");
  return row;
}

const confirmedStatuses = new Set([
  "confirmed",
  "sending",
  "sent",
  "partially-failed",
]);

/** The contract shape of one proposal (two queries). */
export async function proposalOutput(row: ProposalRow) {
  const database = getDatabase();
  const recipientRows = await database
    .select()
    .from(conciergeSendRecipients)
    .where(eq(conciergeSendRecipients.proposalId, row.id));
  const personIds = [
    row.authorPersonId,
    ...(row.confirmedByPersonId ? [row.confirmedByPersonId] : []),
    ...recipientRows.flatMap((recipient) => [
      recipient.personId,
      ...(recipient.guardianOfPersonId ? [recipient.guardianOfPersonId] : []),
    ]),
  ];
  const personRows = await database
    .select({ id: people.id, displayName: people.displayName })
    .from(people)
    .where(inArray(people.id, [...new Set(personIds)]));
  const byId = new Map(personRows.map((person) => [person.id, person]));
  const ref = (id: string) =>
    personRef(byId.get(id) ?? { id, displayName: "Duna member" });
  const recipients = recipientRows
    .sort((left, right) => left.personId.localeCompare(right.personId))
    .map((recipient) => ({
      recipientId: recipient.id,
      person: ref(recipient.personId),
      ...(recipient.guardianOfPersonId
        ? { guardianOf: ref(recipient.guardianOfPersonId) }
        : {}),
      ...(recipient.channel
        ? { channel: recipient.channel as ConciergeChannel }
        : {
            unreachableReason:
              recipient.unreachableReason as ResolvedRecipient["unreachableReason"],
          }),
    }));
  return {
    proposalId: row.id,
    conversationId: row.conversationId,
    author: ref(row.authorPersonId),
    draftedBy: row.draftedBy as "person" | "duna",
    body: row.body,
    contentHash: row.contentHash,
    status: row.status as
      | "draft"
      | "ready"
      | "confirmed"
      | "sending"
      | "sent"
      | "partially-failed"
      | "cancelled"
      | "expired",
    recipients,
    recipientCount: row.recipientCount,
    unreachableCount: row.unreachableCount,
    ...(row.guardianNote ? { guardianNote: row.guardianNote } : {}),
    ...(row.confirmedByPersonId && row.confirmedAt
      ? {
          confirmedBy: ref(row.confirmedByPersonId),
          confirmedAt: row.confirmedAt.toISOString(),
        }
      : {}),
    ...(row.messageId ? { messageId: row.messageId } : {}),
    ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export type ConciergeProposalOutput = Awaited<ReturnType<typeof proposalOutput>>;

function summary(recipients: readonly ResolvedRecipient[]) {
  return {
    recipientCount: recipients.length,
    unreachableCount: recipients.filter((r) => !r.channel).length,
    guardianNote: recipients.some((r) => r.guardianOfPersonId)
      ? GUARDIAN_NOTE
      : null,
  };
}

type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

async function replaceRecipients(
  transaction: Transaction,
  proposalId: string,
  recipients: readonly ResolvedRecipient[],
  now: Date,
) {
  await transaction
    .delete(conciergeSendRecipients)
    .where(eq(conciergeSendRecipients.proposalId, proposalId));
  if (recipients.length === 0) return;
  for (let index = 0; index < recipients.length; index += 1000) {
    await transaction.insert(conciergeSendRecipients).values(
      recipients.slice(index, index + 1000).map((recipient) => ({
        proposalId,
        personId: recipient.personId,
        guardianOfPersonId: recipient.guardianOfPersonId,
        channel: recipient.channel,
        unreachableReason: recipient.unreachableReason,
        createdAt: now,
      })),
    );
  }
}

async function audit(
  executor: Pick<Transaction, "insert">,
  input: {
    readonly organizationId: string;
    readonly actorPersonId: string;
    readonly action: string;
    readonly proposalId: string;
    readonly conversationId: string;
    readonly reason: string;
    readonly requestId: string;
    readonly now: Date;
  },
) {
  await executor.insert(auditLog).values({
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    actorType: "user",
    action: input.action,
    entityType: "concierge_send_proposal",
    entityId: input.proposalId,
    reason: input.reason,
    traceId: input.requestId,
    conversationId: input.conversationId,
    createdAt: input.now,
  });
}

/** Create a reviewed-ready Send card for a club thread. Sends nothing. */
export async function draftConciergeSend(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly conversationId: string;
  readonly body: string;
  readonly draftedBy: "person" | "duna";
  readonly kind?: ConciergeMessageKind;
  readonly source?: string;
  readonly requestId: string;
  readonly now: Date;
  readonly availability?: ChannelAvailabilityMap;
}): Promise<ConciergeProposalOutput> {
  const conversation = await loadClubThread(
    input.organizationId,
    input.conversationId,
  );
  const kind = input.kind ?? "conversation";
  const availability =
    input.availability ??
    (await loadChannelAvailability({ organizationId: input.organizationId }));
  const recipients = await resolveRecipients({
    organizationId: input.organizationId,
    conversation,
    authorPersonId: input.actor.personId,
    kind,
    availability,
    now: input.now,
  });
  const contentHash = conciergeContentHash({
    body: input.body,
    kind,
    recipients,
  });
  const counts = summary(recipients);
  const row = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [proposal] = await transaction
        .insert(conciergeSendProposals)
        .values({
          organizationId: input.organizationId,
          conversationId: conversation.id,
          authorPersonId: input.actor.personId,
          draftedBy: input.draftedBy,
          source: input.source,
          messageKind: kind,
          body: input.body,
          contentHash,
          status: "ready",
          recipientCount: counts.recipientCount,
          unreachableCount: counts.unreachableCount,
          guardianNote: counts.guardianNote,
          expiresAt: new Date(input.now.getTime() + PROPOSAL_TTL_MS),
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning();
      await replaceRecipients(transaction, proposal!.id, recipients, input.now);
      await audit(transaction, {
        organizationId: input.organizationId,
        actorPersonId: input.actor.personId,
        action: "concierge.send_drafted",
        proposalId: proposal!.id,
        conversationId: conversation.id,
        reason: `Send review prepared for ${counts.recipientCount} recipients (${counts.unreachableCount} cannot be reached)${input.draftedBy === "duna" ? "; drafted by Duna" : ""}${input.source ? `; from ${input.source}` : ""}.`,
        requestId: input.requestId,
        now: input.now,
      });
      return proposal!;
    },
  );
  log.info("concierge.send.drafted", {
    organizationId: input.organizationId,
    proposalId: row.id,
    recipients: counts.recipientCount,
    unreachable: counts.unreachableCount,
    draftedBy: input.draftedBy,
  });
  return proposalOutput(row);
}

/** Read a Send card; an unconfirmed card past its expiry becomes `expired`. */
export async function loadConciergeProposal(input: {
  readonly organizationId: string;
  readonly proposalId: string;
  readonly now: Date;
}): Promise<ConciergeProposalOutput> {
  let row = await loadProposalRow(input.organizationId, input.proposalId);
  row = await expireIfStale(row, input.now);
  return proposalOutput(row);
}

async function expireIfStale(row: ProposalRow, now: Date): Promise<ProposalRow> {
  if (
    (row.status === "ready" || row.status === "draft") &&
    row.expiresAt &&
    row.expiresAt.getTime() <= now.getTime()
  ) {
    const [expired] = await getDatabase()
      .update(conciergeSendProposals)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(conciergeSendProposals.id, row.id),
          inArray(conciergeSendProposals.status, ["ready", "draft"]),
        ),
      )
      .returning();
    return expired ?? row;
  }
  return row;
}

function requireEditable(row: ProposalRow) {
  if (row.status !== "ready" && row.status !== "draft") {
    throw new ConciergeError(
      "CONFLICT",
      row.status === "expired"
        ? "This review expired. Start it again."
        : "This send can no longer be changed.",
    );
  }
}

async function recompute(input: {
  readonly row: ProposalRow;
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly body: string;
  readonly requested: ReadonlyMap<string, ConciergeChannel>;
  readonly now: Date;
}) {
  const conversation = await loadClubThread(
    input.organizationId,
    input.row.conversationId,
  );
  const kind = input.row.messageKind as ConciergeMessageKind;
  const recipients = await resolveRecipients({
    organizationId: input.organizationId,
    conversation,
    authorPersonId: input.row.authorPersonId,
    kind,
    availability: await loadChannelAvailability({
      organizationId: input.organizationId,
    }),
    requested: input.requested,
    now: input.now,
  });
  return {
    conversation,
    kind,
    recipients,
    contentHash: conciergeContentHash({ body: input.body, kind, recipients }),
  };
}

async function storedChannels(
  proposalId: string,
): Promise<Map<string, ConciergeChannel>> {
  const rows = await getDatabase()
    .select({
      personId: conciergeSendRecipients.personId,
      channel: conciergeSendRecipients.channel,
    })
    .from(conciergeSendRecipients)
    .where(eq(conciergeSendRecipients.proposalId, proposalId));
  return new Map(
    rows.flatMap((row) =>
      row.channel ? [[row.personId, row.channel as ConciergeChannel]] : [],
    ),
  );
}

async function saveRecomputed(input: {
  readonly row: ProposalRow;
  readonly body: string;
  readonly recipients: readonly ResolvedRecipient[];
  readonly contentHash: string;
  readonly now: Date;
}): Promise<ProposalRow> {
  const counts = summary(input.recipients);
  return getTransactionalDatabase().transaction(async (transaction) => {
    const [updated] = await transaction
      .update(conciergeSendProposals)
      .set({
        body: input.body,
        contentHash: input.contentHash,
        status: "ready",
        recipientCount: counts.recipientCount,
        unreachableCount: counts.unreachableCount,
        guardianNote: counts.guardianNote,
        expiresAt: new Date(input.now.getTime() + PROPOSAL_TTL_MS),
        updatedAt: input.now,
      })
      .where(
        and(
          eq(conciergeSendProposals.id, input.row.id),
          inArray(conciergeSendProposals.status, ["ready", "draft"]),
        ),
      )
      .returning();
    if (!updated) {
      throw new ConciergeError("CONFLICT", "This send can no longer be changed.");
    }
    await replaceRecipients(
      transaction,
      input.row.id,
      input.recipients,
      input.now,
    );
    return updated;
  });
}

/** Change the text of a card under review (a new content hash). */
export async function editConciergeDraft(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly proposalId: string;
  readonly body: string;
  readonly now: Date;
}): Promise<ConciergeProposalOutput> {
  const row = await expireIfStale(
    await loadProposalRow(input.organizationId, input.proposalId),
    input.now,
  );
  requireEditable(row);
  const fresh = await recompute({
    row,
    actor: input.actor,
    organizationId: input.organizationId,
    body: input.body,
    requested: await storedChannels(row.id),
    now: input.now,
  });
  return proposalOutput(
    await saveRecomputed({ row, body: input.body, ...fresh, now: input.now }),
  );
}

/** Switch one recipient's channel on the review, within the same rules. */
export async function setConciergeRecipientChannel(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly proposalId: string;
  readonly recipientId: string;
  readonly channel: ConciergeChannel;
  readonly now: Date;
}): Promise<ConciergeProposalOutput> {
  const row = await expireIfStale(
    await loadProposalRow(input.organizationId, input.proposalId),
    input.now,
  );
  requireEditable(row);
  const recipient = await getDatabase().query.conciergeSendRecipients.findFirst(
    {
      where: and(
        eq(conciergeSendRecipients.id, input.recipientId),
        eq(conciergeSendRecipients.proposalId, row.id),
      ),
    },
  );
  if (!recipient) throw new ConciergeError("NOT_FOUND", "Recipient not found.");
  const requested = await storedChannels(row.id);
  requested.set(recipient.personId, input.channel);
  const fresh = await recompute({
    row,
    actor: input.actor,
    organizationId: input.organizationId,
    body: row.body,
    requested,
    now: input.now,
  });
  const chosen = fresh.recipients.find(
    (candidate) => candidate.personId === recipient.personId,
  );
  if (chosen?.channel !== input.channel) {
    throw new ConciergeError(
      "BAD_REQUEST",
      "That channel cannot reach this person right now.",
    );
  }
  return proposalOutput(
    await saveRecomputed({ row, body: row.body, ...fresh, now: input.now }),
  );
}

export async function cancelConciergeSend(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly proposalId: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<ConciergeProposalOutput> {
  const row = await loadProposalRow(input.organizationId, input.proposalId);
  if (row.status === "cancelled") return proposalOutput(row);
  requireEditable(row);
  const cancelled = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [updated] = await transaction
        .update(conciergeSendProposals)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(
          and(
            eq(conciergeSendProposals.id, row.id),
            inArray(conciergeSendProposals.status, ["ready", "draft"]),
          ),
        )
        .returning();
      if (!updated) {
        throw new ConciergeError("CONFLICT", "This send was already confirmed.");
      }
      await audit(transaction, {
        organizationId: input.organizationId,
        actorPersonId: input.actor.personId,
        action: "concierge.send_cancelled",
        proposalId: row.id,
        conversationId: row.conversationId,
        reason: "A person cancelled the send before confirming it.",
        requestId: input.requestId,
        now: input.now,
      });
      return updated;
    },
  );
  return proposalOutput(cancelled);
}

/**
 * A person presses Send. Valid only for the hash they reviewed and only while
 * the live roster still produces that hash. Re-entrant: a repeat with the
 * same hash returns the sent card; it never sends twice.
 */
export async function confirmConciergeSend(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly proposalId: string;
  readonly contentHash: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<ConciergeProposalOutput> {
  let row = await expireIfStale(
    await loadProposalRow(input.organizationId, input.proposalId),
    input.now,
  );
  if (confirmedStatuses.has(row.status)) {
    if (row.contentHash === input.contentHash) return proposalOutput(row);
    throw new ConciergeError("CONFLICT", "This send was already confirmed.");
  }
  if (row.status === "cancelled")
    throw new ConciergeError("CONFLICT", "This send was cancelled.");
  if (row.status === "expired")
    throw new ConciergeError("CONFLICT", "This review expired. Review it again.");
  if (row.contentHash !== input.contentHash) {
    throw new ConciergeError(
      "CONFLICT",
      "The message changed. Review it again.",
    );
  }
  const fresh = await recompute({
    row,
    actor: input.actor,
    organizationId: input.organizationId,
    body: row.body,
    requested: await storedChannels(row.id),
    now: input.now,
  });
  if (fresh.contentHash !== row.contentHash) {
    await saveRecomputed({
      row,
      body: row.body,
      recipients: fresh.recipients,
      contentHash: fresh.contentHash,
      now: input.now,
    });
    log.info("concierge.send.stale", {
      organizationId: input.organizationId,
      proposalId: row.id,
    });
    throw new ConciergeError(
      "CONFLICT",
      "Who receives this changed since you reviewed it. Review it again.",
    );
  }
  const reachable = fresh.recipients.filter((recipient) => recipient.channel);
  if (reachable.length === 0) {
    throw new ConciergeError(
      "PRECONDITION_FAILED",
      "Nobody in this thread can be reached right now.",
    );
  }
  const [claimed] = await getDatabase()
    .update(conciergeSendProposals)
    .set({
      status: "confirmed",
      confirmedByPersonId: input.actor.personId,
      confirmedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(conciergeSendProposals.id, row.id),
        eq(conciergeSendProposals.status, "ready"),
        eq(conciergeSendProposals.contentHash, input.contentHash),
      ),
    )
    .returning();
  if (!claimed) {
    row = await loadProposalRow(input.organizationId, input.proposalId);
    if (confirmedStatuses.has(row.status) && row.contentHash === input.contentHash)
      return proposalOutput(row);
    throw new ConciergeError("CONFLICT", "This send changed. Review it again.");
  }
  let message;
  try {
    message = await sendConversationMessage({
      actor: input.actor,
      asPrincipal: "organization",
      requestId: input.requestId,
      now: input.now,
      message: {
        conversationId: row.conversationId,
        clientMessageId: stableUuid(`concierge-proposal:${row.id}`),
        kind: fresh.kind === "operational" ? "announcement" : "text",
        body: row.body,
        widgets: [],
        attachmentUploadIds: [],
      },
    });
  } catch (error) {
    await getDatabase()
      .update(conciergeSendProposals)
      .set({
        status: "ready",
        confirmedByPersonId: null,
        confirmedAt: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(conciergeSendProposals.id, row.id),
          eq(conciergeSendProposals.status, "confirmed"),
        ),
      );
    throw error;
  }
  const published = message.status === "published";
  const jobIds: string[] = [];
  const finished = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const recipientRows = await transaction
        .select({
          id: conciergeSendRecipients.id,
          personId: conciergeSendRecipients.personId,
        })
        .from(conciergeSendRecipients)
        .where(eq(conciergeSendRecipients.proposalId, row.id));
      const recipientIdOf = new Map(
        recipientRows.map((recipient) => [recipient.personId, recipient.id]),
      );
      let outside = 0;
      for (const recipient of reachable) {
        const recipientId = recipientIdOf.get(recipient.personId);
        if (!recipientId) continue;
        const isDuna = recipient.channel === "duna";
        const [delivery] = await transaction
          .insert(conciergeDeliveries)
          .values({
            organizationId: input.organizationId,
            proposalId: row.id,
            recipientId,
            messageId: message.id,
            personId: recipient.personId,
            channel: recipient.channel!,
            endpointId: isDuna ? null : (recipient.endpointId ?? null),
            status: isDuna && published ? "sent" : "queued",
            attempts: isDuna && published ? 1 : 0,
            ...(isDuna && published ? { sentAt: input.now } : {}),
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoNothing()
          .returning({ id: conciergeDeliveries.id });
        if (!delivery || isDuna) continue;
        outside += 1;
        const [job] = await transaction
          .insert(workflowJobs)
          .values({
            kind: CONCIERGE_DELIVER_JOB,
            idempotencyKey: `concierge-delivery:${delivery.id}`,
            organizationId: input.organizationId,
            personId: input.actor.personId,
            payload: { deliveryId: delivery.id },
            maximumAttempts: 8,
            traceId: input.requestId,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoNothing()
          .returning({ id: workflowJobs.id });
        if (job) jobIds.push(job.id);
      }
      const [updated] = await transaction
        .update(conciergeSendProposals)
        .set({
          status: outside > 0 ? "sending" : "sent",
          messageId: message.id,
          updatedAt: input.now,
        })
        .where(eq(conciergeSendProposals.id, row.id))
        .returning();
      await audit(transaction, {
        organizationId: input.organizationId,
        actorPersonId: input.actor.personId,
        action: "concierge.send_confirmed",
        proposalId: row.id,
        conversationId: row.conversationId,
        reason: `A person confirmed the send: ${reachable.length} recipients reachable (${outside} on an outside channel), ${fresh.recipients.length - reachable.length} cannot be reached.`,
        requestId: input.requestId,
        now: input.now,
      });
      return updated!;
    },
  );
  log.info("concierge.send.confirmed", {
    organizationId: input.organizationId,
    proposalId: row.id,
    recipients: fresh.recipients.length,
    reachable: reachable.length,
    outside: jobIds.length,
    screening: !published,
  });
  kickDeliveryJobs(jobIds);
  return proposalOutput(finished);
}

/** Start the queued outside deliveries now; the workflow cron is the backstop. */
function kickDeliveryJobs(jobIds: readonly string[]) {
  if (jobIds.length === 0 || process.env.VITEST) return;
  const task = import("../../workflows")
    .then(({ processWorkflowJobById }) =>
      Promise.allSettled(jobIds.map((id) => processWorkflowJobById(id))),
    )
    .catch(() => undefined);
  if (process.env.VERCEL) {
    void import("@vercel/functions")
      .then(({ waitUntil }) => waitUntil(task))
      .catch(() => undefined);
  }
}

/**
 * Per-person delivery for one send: the frozen channel and its state. In-app
 * delivery is read from the thread itself (published, delivered and read
 * watermarks), so it is never stale.
 */
export async function loadConciergeDeliveries(input: {
  readonly organizationId: string;
  readonly proposalId: string;
}) {
  const row = await loadProposalRow(input.organizationId, input.proposalId);
  const database = getDatabase();
  const deliveries = await database
    .select({
      delivery: conciergeDeliveries,
      displayName: people.displayName,
    })
    .from(conciergeDeliveries)
    .innerJoin(people, eq(people.id, conciergeDeliveries.personId))
    .where(eq(conciergeDeliveries.proposalId, row.id));
  const message = row.messageId
    ? await database.query.conversationMessages.findFirst({
        where: eq(conversationMessages.id, row.messageId),
        columns: { sequence: true, status: true },
      })
    : undefined;
  const watermarks =
    message && deliveries.length > 0
      ? await database
          .select({
            personId: messagingConversationParticipants.personId,
            lastRead: messagingConversationParticipants.lastReadSequence,
            lastDelivered:
              messagingConversationParticipants.lastDeliveredSequence,
          })
          .from(messagingConversationParticipants)
          .where(
            and(
              eq(
                messagingConversationParticipants.conversationId,
                row.conversationId,
              ),
              eq(messagingConversationParticipants.principalType, "user"),
              inArray(
                messagingConversationParticipants.personId,
                deliveries.map((entry) => entry.delivery.personId),
              ),
            ),
          )
      : [];
  const watermarkOf = new Map(
    watermarks.flatMap((entry) =>
      entry.personId ? [[entry.personId, entry] as const] : [],
    ),
  );
  return {
    proposalId: row.id,
    deliveries: deliveries
      .sort((left, right) =>
        left.delivery.personId.localeCompare(right.delivery.personId),
      )
      .map(({ delivery, displayName }) => {
        let status = delivery.status as
          | "queued"
          | "sent"
          | "delivered"
          | "read"
          | "failed"
          | "not-enabled"
          | "provider-not-configured"
          | "skipped";
        let errorCode = delivery.errorCode ?? undefined;
        if (delivery.channel === "duna" && message) {
          const mark = watermarkOf.get(delivery.personId);
          if (message.status === "held" || message.status === "removed") {
            status = "failed";
            errorCode = "safety-held";
          } else if (message.status === "screening") status = "queued";
          else if (mark && mark.lastRead >= message.sequence) status = "read";
          else if (mark && mark.lastDelivered >= message.sequence)
            status = "delivered";
          else status = "sent";
        }
        return {
          deliveryId: delivery.id,
          recipientId: delivery.recipientId,
          person: personRef({ id: delivery.personId, displayName }),
          channel: delivery.channel as ConciergeChannel,
          status,
          ...(errorCode ? { errorCode } : {}),
          attempts: delivery.attempts,
          ...(delivery.sentAt ? { sentAt: delivery.sentAt.toISOString() } : {}),
          ...(delivery.deliveredAt
            ? { deliveredAt: delivery.deliveredAt.toISOString() }
            : {}),
          ...(delivery.readAt ? { readAt: delivery.readAt.toISOString() } : {}),
        };
      }),
  };
}

/** The club's display name (for outside-channel text). */
export async function organizationName(organizationId: string) {
  const row = await getDatabase().query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { name: true },
  });
  return row?.name ?? "Your club";
}
