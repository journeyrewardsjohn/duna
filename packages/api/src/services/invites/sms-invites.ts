/**
 * Invitations by text message (INVITE-SMS): preview → confirm → send, and
 * the sender's delivery states. See docs/product/invites.md.
 *
 * Rules enforced here, server-side:
 * - only a signed-in adult (router: `adultProcedure`) who hosts or is booked
 *   into the subject; anyone else's subject answers "not found";
 * - at most eight chosen contacts; only their names and numbers are
 *   received, never an address book;
 * - a junior's number (an account under 18 with that number, or a club
 *   invitation marked as a minor) is never texted: the guardian flow applies;
 * - the suppression list (STOP, carrier disconnect, provider "unsubscribed")
 *   is honoured at preview and again at send;
 * - per-sender (20 a day) and per-number (3 a day) limits, database-backed;
 * - the send must quote the preview's hash: a changed subject, link or list
 *   is refused as stale; `confirmed: true` and an idempotency key are
 *   required (router);
 * - ONE transactional text per ready recipient, nothing else.
 *
 * Logs carry ids, counts and outcomes only: never a number, a name or the
 * text. Numbers are kept only where the invitation already keeps them; this
 * module stores a hash and the last four digits.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  getDatabase,
  inviteSmsMessages,
  people,
  smsSuppressions,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { invitesDemo } from "@duna/core/demo/invites";
import { currentAgeBand } from "../../age-band";
import { canonicalJson } from "../../canonical";
import type { ApiActor } from "../../context";
import { consumeRateLimit } from "../../rate-limit";
import { canonicalPublicWebUrl } from "../../public-web-url";
import {
  INVITE_SMS_PREVIEW_TTL_MINUTES,
  type InviteSmsBlockReason,
  type InviteSmsPreview,
  type InviteSmsPreviewInput,
  type InviteSmsSendInput,
  type InviteSmsSendResult,
  type InviteSmsStatus,
  type InviteSmsStatusRecipient,
} from "../../contracts/invites";
import { inviteSmsProvider } from "./sms-provider";
import {
  destinationHash,
  inviteDetails,
  inviterShortName,
  lastFour,
  normalisePhone,
  renderInviteSms,
  type InviteSmsKind,
} from "./sms-text";
import {
  InviteSmsError,
  claimUrl,
  resolveInviteSubject,
  type RecipientLink,
  type ResolvedInviteSubject,
} from "./subjects";

export { InviteSmsError } from "./subjects";

export const INVITE_SMS_LIMITS = {
  /** Texts one person may send in a rolling day. */
  perSenderPerDay: 20,
  /** Invitation texts one number may receive in a rolling day, from anyone. */
  perDestinationPerDay: 3,
} as const;

const DAY_MS = 24 * 60 * 60_000;
/** The provider stops trying after this (it allows at most 24 hours). */
const MESSAGE_EXPIRY_MS = 60 * 60_000;
const DELIVERED_STATES = ["sending", "sent", "delivered"] as const;

export type InviteSmsSendState = InviteSmsPreview["sendState"];

export const INVITE_SMS_WEBHOOK_PATH = "/api/invites/sms/webhook";

function masked(e164: string | undefined): string {
  return e164 ? `•••• ${lastFour(e164)}` : "";
}

interface PlannedRecipient {
  readonly index: number;
  readonly name: string;
  readonly e164?: string;
  readonly hash?: string;
  readonly block?: InviteSmsBlockReason;
  readonly link?: Exclude<RecipientLink, { kind: "none" }>;
  readonly token?: string;
  readonly text?: string;
  readonly variables?: Readonly<Record<string, string>>;
}

interface Plan {
  readonly recipients: readonly PlannedRecipient[];
  readonly previewHash: string;
}

/** The hash a send must quote: subject, sender and every line of the preview. */
export function previewHashOf(input: {
  readonly senderPersonId: string;
  readonly kind: InviteSmsKind;
  readonly subjectId: string;
  readonly recipients: readonly PlannedRecipient[];
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        v: 1,
        sender: input.senderPersonId,
        kind: input.kind,
        subject: input.subjectId,
        recipients: input.recipients.map((recipient) => ({
          name: recipient.name,
          hash: recipient.hash ?? null,
          block: recipient.block ?? null,
          text: recipient.text ?? null,
        })),
      }),
    )
    .digest("hex");
}

/** Normalise, de-duplicate (first wins) and mark unreadable numbers. */
export function readRecipients(
  recipients: InviteSmsPreviewInput["recipients"],
): PlannedRecipient[] {
  const seen = new Set<string>();
  return recipients.map((recipient, index) => {
    const name = recipient.name.trim().slice(0, 80);
    const normalised = normalisePhone(recipient.phoneE164);
    if (!normalised.ok) return { index, name, block: "invalid-number" };
    if (seen.has(normalised.e164)) {
      return {
        index,
        name,
        e164: normalised.e164,
        hash: destinationHash(normalised.e164),
        block: "already-invited",
      };
    }
    seen.add(normalised.e164);
    return {
      index,
      name,
      e164: normalised.e164,
      hash: destinationHash(normalised.e164),
    };
  });
}

interface Facts {
  readonly suppressed: ReadonlySet<string>;
  readonly juniors: ReadonlySet<string>;
  readonly ownNumber?: string;
  readonly alreadyInvited: ReadonlySet<string>;
  readonly senderSentToday: number;
  readonly destinationSentToday: ReadonlyMap<string, number>;
}

/** Apply the blocks and the links; pure given the facts. */
export function planRecipients(input: {
  readonly recipients: readonly PlannedRecipient[];
  readonly facts: Facts;
  readonly linkFor: (e164: string, token: string) => RecipientLink;
  readonly tokens: ReadonlyMap<string, string>;
  readonly inviter: string;
  readonly details: string;
}): PlannedRecipient[] {
  let senderBudget =
    INVITE_SMS_LIMITS.perSenderPerDay - input.facts.senderSentToday;
  return input.recipients.map((recipient) => {
    if (recipient.block || !recipient.e164 || !recipient.hash) return recipient;
    const block = (reason: InviteSmsBlockReason): PlannedRecipient => ({
      ...recipient,
      block: reason,
    });
    if (recipient.e164 === input.facts.ownNumber) return block("own-number");
    if (input.facts.suppressed.has(recipient.hash)) return block("opted-out");
    if (input.facts.juniors.has(recipient.e164)) return block("junior");
    if (input.facts.alreadyInvited.has(recipient.hash)) {
      return block("already-invited");
    }
    const token = input.tokens.get(recipient.hash) ?? randomUUID();
    const link = input.linkFor(recipient.e164, token);
    if (link.kind === "none") return block("not-on-invitation");
    if (link.kind === "existing" && link.junior) return block("junior");
    if (
      senderBudget <= 0 ||
      (input.facts.destinationSentToday.get(recipient.hash) ?? 0) >=
        INVITE_SMS_LIMITS.perDestinationPerDay
    ) {
      return block("rate-limited");
    }
    senderBudget -= 1;
    const variables = {
      inviter: input.inviter,
      details: input.details,
      link: claimUrl(link.path),
    };
    return {
      ...recipient,
      link,
      ...(link.kind === "new-participant" ? { token } : {}),
      variables,
      text: renderInviteSms(variables),
    };
  });
}

async function loadFacts(input: {
  readonly actor: ApiActor;
  readonly kind: InviteSmsKind;
  readonly subjectId: string;
  readonly recipients: readonly PlannedRecipient[];
  readonly now: Date;
}): Promise<Facts & { readonly sender: typeof people.$inferSelect }> {
  const database = getDatabase();
  const hashes = input.recipients.flatMap((r) => (r.hash ? [r.hash] : []));
  const numbers = input.recipients.flatMap((r) => (r.e164 ? [r.e164] : []));
  const since = new Date(input.now.getTime() - DAY_MS);
  const [sender, suppressed, accounts, invited, senderCount, perDestination] =
    await Promise.all([
      database.query.people.findFirst({
        where: eq(people.id, input.actor.personId),
      }),
      hashes.length
        ? database
            .select({ hash: smsSuppressions.destinationHash })
            .from(smsSuppressions)
            .where(inArray(smsSuppressions.destinationHash, hashes))
        : [],
      numbers.length
        ? database
            .select({
              phoneE164: people.phoneE164,
              birthDate: people.birthDate,
              ageBand: people.ageBand,
              isMinor: people.isMinor,
            })
            .from(people)
            .where(inArray(people.phoneE164, numbers))
        : [],
      hashes.length
        ? database
            .select({ hash: inviteSmsMessages.destinationHash })
            .from(inviteSmsMessages)
            .where(
              and(
                eq(inviteSmsMessages.senderPersonId, input.actor.personId),
                eq(inviteSmsMessages.inviteKind, input.kind),
                eq(inviteSmsMessages.subjectId, input.subjectId),
                inArray(inviteSmsMessages.destinationHash, hashes),
                inArray(inviteSmsMessages.status, [...DELIVERED_STATES]),
              ),
            )
        : [],
      database
        .select({ count: sql<number>`count(*)::int` })
        .from(inviteSmsMessages)
        .where(
          and(
            eq(inviteSmsMessages.senderPersonId, input.actor.personId),
            gt(inviteSmsMessages.sentAt, since),
          ),
        ),
      hashes.length
        ? database
            .select({
              hash: inviteSmsMessages.destinationHash,
              count: sql<number>`count(*)::int`,
            })
            .from(inviteSmsMessages)
            .where(
              and(
                inArray(inviteSmsMessages.destinationHash, hashes),
                gt(inviteSmsMessages.sentAt, since),
              ),
            )
            .groupBy(inviteSmsMessages.destinationHash)
        : [],
    ]);
  if (!sender)
    throw new InviteSmsError("NOT_FOUND", "Your profile was not found.");
  return {
    sender,
    ownNumber: sender.phoneE164 ?? undefined,
    suppressed: new Set(suppressed.map((row) => row.hash)),
    juniors: new Set(
      accounts
        .filter((account) => {
          const band = currentAgeBand(account, input.now);
          return band === "under-13" || band === "teen" || account.isMinor;
        })
        .flatMap((account) => (account.phoneE164 ? [account.phoneE164] : [])),
    ),
    alreadyInvited: new Set(invited.map((row) => row.hash)),
    senderSentToday: senderCount[0]?.count ?? 0,
    destinationSentToday: new Map(
      perDestination.map((row) => [row.hash, row.count]),
    ),
  };
}

async function buildPlan(input: {
  readonly actor: ApiActor;
  readonly kind: InviteSmsKind;
  readonly subjectId: string;
  readonly recipients: InviteSmsPreviewInput["recipients"];
  readonly tokens: ReadonlyMap<string, string>;
  readonly now: Date;
}): Promise<{ plan: Plan; subject: ResolvedInviteSubject }> {
  const subject = await resolveInviteSubject({
    actor: input.actor,
    kind: input.kind,
    subjectId: input.subjectId,
    now: input.now,
  });
  const read = readRecipients(input.recipients);
  const facts = await loadFacts({ ...input, recipients: read });
  const recipients = planRecipients({
    recipients: read,
    facts,
    linkFor: subject.linkFor,
    tokens: input.tokens,
    inviter: inviterShortName(facts.sender),
    details: subject.details,
  });
  return {
    subject,
    plan: {
      recipients,
      previewHash: previewHashOf({
        senderPersonId: input.actor.personId,
        kind: input.kind,
        subjectId: subject.subjectId,
        recipients,
      }),
    },
  };
}

function toPreview(
  plan: Plan,
  expiresAt: Date,
  sendState: InviteSmsSendState,
): InviteSmsPreview {
  const recipients = plan.recipients.map((recipient) => ({
    index: recipient.index,
    name: recipient.name,
    maskedNumber: masked(recipient.e164),
    state: recipient.block ? ("blocked" as const) : ("ready" as const),
    ...(recipient.block ? { reason: recipient.block } : {}),
    ...(recipient.text ? { text: recipient.text } : {}),
  }));
  return {
    previewHash: plan.previewHash,
    expiresAt: expiresAt.toISOString(),
    sendState,
    readyCount: recipients.filter((r) => r.state === "ready").length,
    recipients,
  };
}

export async function previewInviteSms(input: {
  readonly actor: ApiActor;
  readonly request: InviteSmsPreviewInput;
  readonly sendState: InviteSmsSendState;
  readonly now: Date;
}): Promise<InviteSmsPreview> {
  const { plan, subject } = await buildPlan({
    actor: input.actor,
    kind: input.request.inviteKind,
    subjectId: input.request.subjectId,
    recipients: input.request.recipients,
    tokens: new Map(),
    now: input.now,
  });
  const expiresAt = new Date(
    input.now.getTime() + INVITE_SMS_PREVIEW_TTL_MINUTES * 60_000,
  );
  const ready = plan.recipients.filter((r) => !r.block && r.hash && r.e164);
  if (ready.length > 0) {
    await getDatabase()
      .insert(inviteSmsMessages)
      .values(
        ready.map((recipient) => ({
          senderPersonId: input.actor.personId,
          organizationId: subject.organizationId,
          inviteKind: subject.kind,
          subjectId: subject.subjectId,
          previewHash: plan.previewHash,
          destinationHash: recipient.hash!,
          destinationLast4: lastFour(recipient.e164!),
          recipientName: recipient.name,
          claimToken: recipient.token ?? null,
          invitationRef:
            recipient.link?.kind === "existing"
              ? recipient.link.invitationRef
              : null,
          status: "previewed",
          previewExpiresAt: expiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          inviteSmsMessages.senderPersonId,
          inviteSmsMessages.previewHash,
          inviteSmsMessages.destinationHash,
        ],
        set: { previewExpiresAt: expiresAt, updatedAt: input.now },
        setWhere: eq(inviteSmsMessages.status, "previewed"),
      });
  }
  log.info("invites.sms.previewed", {
    inviteKind: subject.kind,
    subjectId: subject.subjectId,
    count: plan.recipients.length,
    readyCount: ready.length,
  });
  return toPreview(plan, expiresAt, input.sendState);
}

/** Demo mode: the same text building from fixtures; no database, no send. */
export function previewInviteSmsDemo(input: {
  readonly request: InviteSmsPreviewInput;
  readonly sendState: InviteSmsSendState;
  readonly now: Date;
}): InviteSmsPreview {
  const facts = invitesDemo.subjects[input.request.inviteKind];
  const details = inviteDetails({
    kind: input.request.inviteKind,
    title: "title" in facts ? facts.title : undefined,
    place: facts.place,
    startsAt: facts.startsAt ? new Date(facts.startsAt) : undefined,
    timeZone: facts.timeZone,
  });
  const read = readRecipients(input.request.recipients);
  const recipients = planRecipients({
    recipients: read,
    facts: {
      suppressed: new Set([destinationHash(invitesDemo.optedOutE164)]),
      juniors: new Set(),
      alreadyInvited: new Set(),
      senderSentToday: 0,
      destinationSentToday: new Map(),
    },
    linkFor: () => ({
      kind: "existing",
      path: facts.path,
      invitationRef: "demo",
    }),
    tokens: new Map(),
    inviter: inviterShortName(invitesDemo.inviter),
    details,
  });
  const plan: Plan = {
    recipients,
    previewHash: previewHashOf({
      senderPersonId: "demo",
      kind: input.request.inviteKind,
      subjectId: input.request.subjectId,
      recipients,
    }),
  };
  return toPreview(
    plan,
    new Date(input.now.getTime() + INVITE_SMS_PREVIEW_TTL_MINUTES * 60_000),
    input.sendState,
  );
}

function statusOf(
  row: typeof inviteSmsMessages.$inferSelect,
): InviteSmsStatusRecipient {
  const known: readonly string[] = [
    "sending",
    "sent",
    "delivered",
    "failed",
    "not-configured",
  ];
  const state = (
    known.includes(row.status) ? row.status : "skipped"
  ) as InviteSmsStatusRecipient["state"];
  return {
    id: row.id,
    name: row.recipientName,
    maskedNumber: `•••• ${row.destinationLast4}`,
    state,
    ...(row.blockReason
      ? { reason: row.blockReason as InviteSmsBlockReason }
      : {}),
    ...(row.failureCode ? { failureCode: row.failureCode } : {}),
    ...(row.sentAt ? { sentAt: row.sentAt.toISOString() } : {}),
    ...(row.deliveredAt ? { deliveredAt: row.deliveredAt.toISOString() } : {}),
  };
}

/**
 * Send the previewed texts. The caller has checked the flag and the provider
 * and wraps this in the idempotency store (same key → same answer).
 */
export async function sendInviteSms(input: {
  readonly actor: ApiActor;
  readonly request: InviteSmsSendInput;
  readonly requestId: string;
  readonly now: Date;
}): Promise<InviteSmsSendResult> {
  const database = getDatabase();
  const previewed = await database
    .select()
    .from(inviteSmsMessages)
    .where(
      and(
        eq(inviteSmsMessages.senderPersonId, input.actor.personId),
        eq(inviteSmsMessages.previewHash, input.request.previewHash),
      ),
    );
  const stale = () =>
    new InviteSmsError(
      "CONFLICT",
      "This invitation changed since you reviewed it. Review it again before sending.",
    );
  if (
    previewed.length === 0 ||
    previewed.some(
      (row) => row.status !== "previewed" || row.previewExpiresAt <= input.now,
    )
  ) {
    throw stale();
  }
  const tokens = new Map(
    previewed.flatMap((row) =>
      row.claimToken ? [[row.destinationHash, row.claimToken] as const] : [],
    ),
  );
  const { plan, subject } = await buildPlan({
    actor: input.actor,
    kind: input.request.inviteKind,
    subjectId: input.request.subjectId,
    recipients: input.request.recipients,
    tokens,
    now: input.now,
  });
  if (plan.previewHash !== input.request.previewHash) throw stale();

  const rowByHash = new Map(previewed.map((row) => [row.destinationHash, row]));
  const provider = inviteSmsProvider();
  const callbackUrl = canonicalPublicWebUrl(INVITE_SMS_WEBHOOK_PATH);
  const results: InviteSmsStatusRecipient[] = [];
  let sentCount = 0;

  for (const recipient of plan.recipients) {
    const row = recipient.hash ? rowByHash.get(recipient.hash) : undefined;
    if (recipient.block || !row || !recipient.e164 || !recipient.link) {
      results.push({
        id: row?.id ?? `skipped-${recipient.index}`,
        name: recipient.name,
        maskedNumber: masked(recipient.e164),
        state: "skipped",
        ...(recipient.block ? { reason: recipient.block } : {}),
      });
      continue;
    }
    const [senderLimit, destinationLimit] = await Promise.all([
      consumeRateLimit({
        key: `invite-sms:sender:${input.actor.personId}`,
        capacity: INVITE_SMS_LIMITS.perSenderPerDay,
        refillPerMinute: INVITE_SMS_LIMITS.perSenderPerDay / 1440,
        now: input.now,
      }),
      consumeRateLimit({
        key: `invite-sms:destination:${recipient.hash}`,
        capacity: INVITE_SMS_LIMITS.perDestinationPerDay,
        refillPerMinute: INVITE_SMS_LIMITS.perDestinationPerDay / 1440,
        now: input.now,
      }),
    ]);
    if (!senderLimit.allowed || !destinationLimit.allowed) {
      const [updated] = await database
        .update(inviteSmsMessages)
        .set({
          status: "blocked",
          blockReason: "rate-limited",
          updatedAt: input.now,
        })
        .where(eq(inviteSmsMessages.id, row.id))
        .returning();
      results.push(statusOf(updated ?? row));
      continue;
    }

    let invitationRef =
      recipient.link.kind === "existing" ? recipient.link.invitationRef : null;
    if (recipient.link.kind === "new-participant" && recipient.token) {
      invitationRef = await subject.materialise({
        e164: recipient.e164,
        name: recipient.name,
        token: recipient.token,
        now: input.now,
      });
    }
    await database
      .update(inviteSmsMessages)
      .set({
        status: "sending",
        invitationRef,
        sendIdempotencyKey: input.request.idempotencyKey,
        updatedAt: input.now,
      })
      .where(eq(inviteSmsMessages.id, row.id));

    const outcome = await provider.send({
      to: recipient.e164,
      variables: recipient.variables!,
      correlationId: row.id,
      callbackUrl,
      expiresAt: new Date(input.now.getTime() + MESSAGE_EXPIRY_MS),
    });

    const patch: Partial<typeof inviteSmsMessages.$inferInsert> = {
      updatedAt: input.now,
    };
    let mirrored: "sent" | "failed" | "queued" | undefined;
    switch (outcome.kind) {
      case "sent":
        Object.assign(patch, {
          status: "sent",
          providerMessageId: outcome.providerMessageId,
          sentAt: input.now,
        });
        mirrored = "sent";
        sentCount += 1;
        break;
      case "outcome-unknown":
        // Possibly accepted: counted against limits, settled by the webhook.
        Object.assign(patch, { sentAt: input.now, failureCode: outcome.code });
        mirrored = "queued";
        break;
      case "rejected":
      case "transient":
        Object.assign(patch, { status: "failed", failureCode: outcome.code });
        mirrored = "failed";
        if (outcome.code === "unsubscribed") {
          await suppress(recipient.hash!, "provider-unsubscribed", input.now);
        }
        break;
      case "not-configured":
        Object.assign(patch, { status: "not-configured" });
        break;
    }
    const [updated] = await database
      .update(inviteSmsMessages)
      .set(patch)
      .where(eq(inviteSmsMessages.id, row.id))
      .returning();
    if (mirrored && invitationRef) {
      await subject.recordDelivery({
        invitationRef,
        outcome: mirrored,
        providerMessageId:
          outcome.kind === "sent" ? outcome.providerMessageId : undefined,
        now: input.now,
      });
    }
    log.info("invites.sms.send.completed", {
      messageId: row.id,
      inviteKind: subject.kind,
      subjectId: subject.subjectId,
      outcome: outcome.kind,
      ...("code" in outcome ? { reason: outcome.code } : {}),
    });
    results.push(statusOf(updated ?? row));
  }

  // Preview rows for numbers no longer in the list never send.
  const used = new Set(
    plan.recipients.flatMap((r) => (r.hash ? [r.hash] : [])),
  );
  const leftovers = previewed
    .filter((row) => !used.has(row.destinationHash))
    .map((row) => row.id);
  if (leftovers.length) {
    await database
      .update(inviteSmsMessages)
      .set({ status: "blocked", blockReason: "not-on-invitation" })
      .where(inArray(inviteSmsMessages.id, leftovers));
  }
  return { sentCount, recipients: results };
}

export async function inviteSmsStatus(input: {
  readonly actor: ApiActor;
  readonly kind: InviteSmsKind;
  readonly subjectId: string;
}): Promise<InviteSmsStatus> {
  const rows = await getDatabase()
    .select()
    .from(inviteSmsMessages)
    .where(
      and(
        eq(inviteSmsMessages.senderPersonId, input.actor.personId),
        eq(inviteSmsMessages.inviteKind, input.kind),
        eq(inviteSmsMessages.subjectId, input.subjectId),
        notInArray(inviteSmsMessages.status, ["previewed"]),
      ),
    )
    .orderBy(desc(inviteSmsMessages.updatedAt))
    .limit(50);
  return { recipients: rows.map(statusOf) };
}

export async function suppress(
  hash: string,
  source:
    "stop-keyword" | "carrier-disconnect" | "provider-unsubscribed" | "link",
  now: Date,
): Promise<void> {
  await getDatabase()
    .insert(smsSuppressions)
    .values({ destinationHash: hash, source, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: smsSuppressions.destinationHash,
      set: { source, updatedAt: now },
    });
}

export async function unsuppressAfterStart(hash: string): Promise<void> {
  // START re-subscribes only what STOP removed; a carrier disconnect stays.
  await getDatabase()
    .delete(smsSuppressions)
    .where(
      and(
        eq(smsSuppressions.destinationHash, hash),
        eq(smsSuppressions.source, "stop-keyword"),
      ),
    );
}
