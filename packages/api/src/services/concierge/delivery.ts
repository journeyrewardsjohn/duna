/**
 * Concierge outside-channel delivery worker (B7): the `concierge.deliver`
 * workflow job, one per delivery record. It sends exactly what was confirmed
 * to the destination frozen at confirmation, on the same channel every
 * attempt (retries with the workflow backoff, never a channel switch), and
 * never contacts a provider while the channel is switched off or has no
 * production values.
 *
 * Before every attempt it checks again: the thread message cleared safety
 * screening, the person is still in the thread (someone who cancelled stops
 * receiving), and the endpoint is still connected (an opt-out wins).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  conciergeDeliveries,
  conciergeSendProposals,
  conversationMessages,
  getDatabase,
  messagingConversationParticipants,
  messagingConversations,
  people,
  personChannelEndpoints,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { canonicalPublicWebUrl } from "../../public-web-url";
import { conciergeAdapters } from "./adapters";
import { loadChannelAvailability } from "./availability";
import { organizationName } from "./proposals";
import type { ConciergeOutsideChannel } from "./types";

type DeliveryStatus = (typeof conciergeDeliveries.$inferSelect)["status"];

export class ConciergeRetryLater extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ConciergeRetryLater";
  }
}

function replySecret(): string | undefined {
  const value = process.env.CONCIERGE_REPLY_SECRET?.trim();
  return value && value.length >= 32 ? value : undefined;
}

/** A reply token naming one delivery, signed so it cannot be guessed. */
export function replyTokenFor(deliveryId: string): string | undefined {
  const secret = replySecret();
  if (!secret) return undefined;
  const signature = createHmac("sha256", secret)
    .update(deliveryId)
    .digest("hex")
    .slice(0, 16);
  return `${deliveryId}.${signature}`;
}

export function deliveryIdFromReplyToken(token: string): string | undefined {
  const secret = replySecret();
  const match =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{16})$/i.exec(
      token.trim(),
    );
  if (!secret || !match) return undefined;
  const expected = createHmac("sha256", secret)
    .update(match[1]!.toLowerCase())
    .digest("hex")
    .slice(0, 16);
  const given = Buffer.from(match[2]!.toLowerCase());
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted)
    ? match[1]!.toLowerCase()
    : undefined;
}

/** The text a person receives outside Duna. Plain text, attributed to coach and club. */
export function outsideText(input: {
  readonly club: string;
  readonly author: string;
  readonly body: string;
  readonly link: string;
}): string {
  return `${input.club}: ${input.body}\n\n${input.author}, ${input.club}\nReply here, or open the thread in Duna: ${input.link}`;
}

async function setStatus(
  deliveryId: string,
  from: readonly DeliveryStatus[],
  values: Partial<typeof conciergeDeliveries.$inferInsert>,
  now: Date,
) {
  await getDatabase()
    .update(conciergeDeliveries)
    .set({ ...values, updatedAt: now })
    .where(
      and(
        eq(conciergeDeliveries.id, deliveryId),
        inArray(conciergeDeliveries.status, [...from]),
      ),
    );
}

/**
 * `sending` → `sent` or `partially-failed` once no outside delivery is still
 * queued (in-app delivery is read from the thread itself).
 */
export async function settleConciergeProposal(proposalId: string, now: Date) {
  const rows = await getDatabase()
    .select({ status: conciergeDeliveries.status })
    .from(conciergeDeliveries)
    .where(
      and(
        eq(conciergeDeliveries.proposalId, proposalId),
        ne(conciergeDeliveries.channel, "duna"),
      ),
    );
  if (rows.some((row) => row.status === "queued")) return;
  const failed = rows.some((row) =>
    ["failed", "not-enabled", "provider-not-configured", "skipped"].includes(
      row.status,
    ),
  );
  await getDatabase()
    .update(conciergeSendProposals)
    .set({ status: failed ? "partially-failed" : "sent", updatedAt: now })
    .where(
      and(
        eq(conciergeSendProposals.id, proposalId),
        inArray(conciergeSendProposals.status, ["sending", "confirmed"]),
      ),
    );
}

/** Workflow handler for `concierge.deliver`. Throws only to retry the same channel. */
export async function processConciergeDelivery(
  payload: Readonly<Record<string, unknown>>,
  now = new Date(),
): Promise<DeliveryStatus | "already-settled"> {
  const deliveryId = payload.deliveryId;
  if (typeof deliveryId !== "string")
    throw new Error("Concierge delivery job has no delivery id.");
  const lastAttempt =
    typeof payload.jobAttempts === "number" &&
    typeof payload.maximumAttempts === "number" &&
    payload.jobAttempts >= payload.maximumAttempts;
  const database = getDatabase();
  const [found] = await database
    .select({
      delivery: conciergeDeliveries,
      proposal: conciergeSendProposals,
      message: {
        status: conversationMessages.status,
        conversationId: conversationMessages.conversationId,
      },
    })
    .from(conciergeDeliveries)
    .innerJoin(
      conciergeSendProposals,
      eq(conciergeSendProposals.id, conciergeDeliveries.proposalId),
    )
    .leftJoin(
      conversationMessages,
      eq(conversationMessages.id, conciergeDeliveries.messageId),
    )
    .where(eq(conciergeDeliveries.id, deliveryId))
    .limit(1);
  if (!found || found.delivery.status !== "queued") return "already-settled";
  const { delivery, proposal, message } = found;
  const channel = delivery.channel as ConciergeOutsideChannel;
  const settle = async (
    status: DeliveryStatus,
    values: Partial<typeof conciergeDeliveries.$inferInsert> = {},
  ) => {
    await setStatus(delivery.id, ["queued"], { status, ...values }, now);
    await settleConciergeProposal(proposal.id, now);
    log.info("concierge.delivery.settled", {
      organizationId: proposal.organizationId ?? undefined,
      deliveryId: delivery.id,
      channel,
      status,
      errorCode: values.errorCode ?? undefined,
    });
    return status;
  };
  if (!message || message.status === "held" || message.status === "removed")
    return settle("skipped", { errorCode: "safety-held" });
  if (message.status === "screening") {
    if (lastAttempt)
      return settle("failed", { errorCode: "safety-screening-timeout" });
    throw new ConciergeRetryLater("Waiting for safety screening.");
  }
  const [member] = await database
    .select({ id: messagingConversationParticipants.id })
    .from(messagingConversationParticipants)
    .where(
      and(
        eq(
          messagingConversationParticipants.conversationId,
          proposal.conversationId,
        ),
        eq(messagingConversationParticipants.principalType, "user"),
        eq(messagingConversationParticipants.personId, delivery.personId),
        isNull(messagingConversationParticipants.leftAt),
      ),
    )
    .limit(1);
  if (!member) return settle("skipped", { errorCode: "left-thread" });
  const endpoint = delivery.endpointId
    ? await database.query.personChannelEndpoints.findFirst({
        where: eq(personChannelEndpoints.id, delivery.endpointId),
      })
    : undefined;
  if (
    !endpoint ||
    endpoint.status !== "connected" ||
    endpoint.personId !== delivery.personId ||
    endpoint.channel !== channel ||
    !endpoint.destination
  )
    return settle("skipped", { errorCode: "consent-withdrawn" });
  const availability = await loadChannelAvailability({
    organizationId: proposal.organizationId ?? undefined,
  });
  if (availability[channel] === "not-enabled") return settle("not-enabled");
  if (availability[channel] === "provider-not-configured")
    return settle("provider-not-configured");
  const [conversation, author, club] = await Promise.all([
    database.query.messagingConversations.findFirst({
      where: eq(messagingConversations.id, proposal.conversationId),
      columns: { title: true },
    }),
    database.query.people.findFirst({
      where: eq(people.id, proposal.authorPersonId),
      columns: { displayName: true },
    }),
    organizationName(proposal.organizationId ?? ""),
  ]);
  const link = canonicalPublicWebUrl(
    `/app/messages?thread=${proposal.conversationId}`,
  );
  const authorName = author?.displayName ?? "Your coach";
  const token = channel === "email" ? replyTokenFor(delivery.id) : undefined;
  const replyDomain = process.env.CONCIERGE_EMAIL_REPLY_DOMAIN?.trim();
  const result = await conciergeAdapters[channel].send({
    to: endpoint.destination,
    subject: `${club}: ${conversation?.title ?? "Message"}`,
    text: outsideText({ club, author: authorName, body: proposal.body, link }),
    ...(token && replyDomain
      ? { replyTo: `reply+${token}@${replyDomain}` }
      : {}),
    idempotencyKey: `concierge-delivery-${delivery.id}`,
    statusCallbackUrl: canonicalPublicWebUrl(
      `/api/concierge/sendblue/status?delivery=${delivery.id}`,
    ),
    template: "message",
    templateParameters: {
      club,
      author: authorName,
      message: proposal.body,
      link,
    },
  });
  const attempts = delivery.attempts + 1;
  switch (result.kind) {
    case "sent":
      return settle("sent", {
        attempts,
        sentAt: now,
        ...(result.handle ? { providerMessageHandle: result.handle } : {}),
      });
    case "not-configured":
      return settle("provider-not-configured");
    case "rejected":
    case "outcome-unknown":
      return settle("failed", { attempts, errorCode: result.errorCode });
    case "transient":
      if (lastAttempt)
        return settle("failed", { attempts, errorCode: result.errorCode });
      await setStatus(
        delivery.id,
        ["queued"],
        { attempts, errorCode: result.errorCode },
        now,
      );
      throw new ConciergeRetryLater(
        `Provider did not accept the delivery (${result.errorCode}).`,
      );
  }
}

const progress: Readonly<Record<string, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * A provider status callback, matched by the frozen channel and the
 * provider's message handle (and the delivery id when the callback carries
 * it). Idempotent and forward-only: a replay or an out-of-order callback
 * never moves a delivery backwards.
 */
export async function applyConciergeDeliveryStatus(input: {
  readonly channel: ConciergeOutsideChannel;
  readonly handle: string;
  readonly status: "sent" | "delivered" | "read" | "failed";
  readonly deliveryId?: string;
  readonly errorCode?: string;
  readonly now: Date;
}): Promise<"applied" | "ignored" | "not-found"> {
  const database = getDatabase();
  const row = await database.query.conciergeDeliveries.findFirst({
    where: and(
      eq(conciergeDeliveries.channel, input.channel),
      eq(conciergeDeliveries.providerMessageHandle, input.handle),
      ...(input.deliveryId
        ? [eq(conciergeDeliveries.id, input.deliveryId)]
        : []),
    ),
  });
  if (!row) return "not-found";
  if (input.status === "failed") {
    if (row.status !== "sent" && row.status !== "queued") return "ignored";
  } else if (
    row.status === "failed" ||
    (progress[row.status] ?? 99) >= progress[input.status]!
  ) {
    return "ignored";
  }
  await database
    .update(conciergeDeliveries)
    .set({
      status: input.status,
      ...(input.status === "delivered" ? { deliveredAt: input.now } : {}),
      ...(input.status === "read"
        ? { readAt: input.now, deliveredAt: row.deliveredAt ?? input.now }
        : {}),
      ...(input.status === "failed"
        ? { errorCode: (input.errorCode ?? "provider-failed").slice(0, 64) }
        : {}),
      updatedAt: input.now,
    })
    .where(
      and(
        eq(conciergeDeliveries.id, row.id),
        eq(conciergeDeliveries.status, row.status),
      ),
    );
  if (input.status === "failed")
    await settleConciergeProposal(row.proposalId, input.now);
  return "applied";
}
