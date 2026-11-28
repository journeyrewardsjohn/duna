/**
 * Concierge inbound (B7): a reply on any outside channel returns to the
 * right thread, posted as that person, through the existing messaging
 * service (membership, blocks, guardian coverage and safety screening are
 * checked again for every message).
 *
 * - Webhooks are verified by signature before anything is read, and stored
 *   once per provider event id (a replay is acknowledged, never re-posted).
 * - Phone channels (iMessage, WhatsApp) share one Duna line, so the thread is
 *   the one thread that person was messaged on that channel in the last 14
 *   days. More than one candidate is ambiguous and is never guessed.
 * - Email carries a signed per-delivery token in the reply-to address, and
 *   the sender must be the address that delivery went to.
 * - Anything that cannot be routed safely is quarantined (held in
 *   `webhook_events`) for staff review: unknown senders, ambiguous threads,
 *   sender mismatches, people who lost access.
 * - STOP / UNSUBSCRIBE (and the usual variants) revoke that destination on
 *   that channel at once and are recorded per channel.
 * - Message text is stored for review and posting, never logged.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  conciergeDeliveries,
  conciergeMessageChannels,
  conciergeSendProposals,
  getDatabase,
  people,
  personChannelEndpoints,
  webhookEvents,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { ApiActor } from "../../context";
import {
  MessagingError,
  sendConversationMessage,
} from "../../messaging-service";
import { withProviderCall } from "../../observability";
import { revokeConciergeEndpoint } from "./channels";
import {
  applyConciergeDeliveryStatus,
  deliveryIdFromReplyToken,
} from "./delivery";
import { stableUuid } from "./proposals";
import type { ConciergeOutsideChannel } from "./types";

export const OPT_OUT_KEYWORDS =
  /^(stop|stopall|stop all|unsubscribe|cancel|end|quit|optout|opt out|opt-out|revoke)$/i;
const THREAD_WINDOW_MS = 14 * 24 * 60 * 60_000;

export type InboundDisposition =
  | "posted"
  | "opted-out"
  | "duplicate"
  | "quarantined-unknown-sender"
  | "quarantined-ambiguous"
  | "quarantined-sender-mismatch"
  | "quarantined-access"
  | "quarantined-unsupported"
  | "status-applied"
  | "ignored";

/**
 * Svix-style webhook signature (Sent.dm and Resend both use it):
 * base64(HMAC-SHA256(base64-decoded secret without `whsec_`,
 * `${id}.${timestamp}.${rawBody}`)), header `v1,<sig>` tokens separated by
 * spaces, timestamp within five minutes.
 */
export function verifySvixSignature(input: {
  readonly secret: string | undefined;
  readonly id: string | null;
  readonly timestamp: string | null;
  readonly signature: string | null;
  readonly rawBody: string;
  readonly now: Date;
}): boolean {
  if (!input.secret || !input.id || !input.timestamp || !input.signature)
    return false;
  const seconds = Number(input.timestamp);
  if (
    !Number.isFinite(seconds) ||
    Math.abs(input.now.getTime() / 1000 - seconds) > 300
  )
    return false;
  const material = input.secret.startsWith("whsec_")
    ? input.secret.slice(6)
    : input.secret;
  let key: Buffer;
  try {
    key = Buffer.from(material, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = Buffer.from(
    `v1,${createHmac("sha256", key)
      .update(`${input.id}.${input.timestamp}.${input.rawBody}`)
      .digest("base64")}`,
  );
  return input.signature.split(" ").some((token) => {
    const given = Buffer.from(token.trim());
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Record a provider event once; false when it was already processed. */
async function claimEvent(input: {
  readonly provider: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}): Promise<{ readonly id: string; readonly fresh: boolean }> {
  const database = getDatabase();
  const [inserted] = await database
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      providerEventId: input.eventId.slice(0, 192),
      eventType: input.eventType.slice(0, 128),
      payload: input.payload,
      signatureVerified: true,
      status: "received",
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted) return { id: inserted.id, fresh: true };
  const existing = await database.query.webhookEvents.findFirst({
    where: and(
      eq(webhookEvents.provider, input.provider),
      eq(webhookEvents.providerEventId, input.eventId.slice(0, 192)),
    ),
  });
  return {
    id: existing?.id ?? "",
    fresh: !existing?.processedAt,
  };
}

async function finishEvent(
  id: string,
  disposition: InboundDisposition,
  extra: Record<string, unknown> = {},
) {
  if (!id) return;
  await getDatabase()
    .update(webhookEvents)
    .set({
      status: disposition.startsWith("quarantined") ? "held" : "processed",
      payload: sql`${webhookEvents.payload} || ${JSON.stringify({ disposition, ...extra })}::jsonb`,
      processedAt: new Date(),
    })
    .where(eq(webhookEvents.id, id));
}

async function actorFor(personId: string): Promise<ApiActor | undefined> {
  const person = await getDatabase().query.people.findFirst({
    where: and(eq(people.id, personId), eq(people.status, "active")),
    columns: { id: true, displayName: true, isMinor: true },
  });
  if (!person || person.isMinor) return undefined;
  return {
    personId: person.id,
    displayName: person.displayName,
    roles: ["player"],
    scopes: ["messages:read", "messages:write"],
    ageBand: "adult",
    isDemo: false,
  };
}

async function postAs(input: {
  readonly personId: string;
  readonly conversationId: string;
  readonly channel: ConciergeOutsideChannel;
  readonly text: string;
  readonly eventId: string;
}): Promise<InboundDisposition> {
  const actor = await actorFor(input.personId);
  if (!actor) return "quarantined-access";
  try {
    const message = await sendConversationMessage({
      actor,
      asPrincipal: "user",
      requestId: `concierge-inbound:${input.eventId}`,
      message: {
        conversationId: input.conversationId,
        clientMessageId: stableUuid(`concierge-inbound:${input.eventId}`),
        kind: "text",
        body: input.text.slice(0, 4000),
        widgets: [],
        attachmentUploadIds: [],
      },
    });
    await getDatabase()
      .insert(conciergeMessageChannels)
      .values({ messageId: message.id, channel: input.channel })
      .onConflictDoNothing();
    return "posted";
  } catch (error) {
    if (error instanceof MessagingError) return "quarantined-access";
    throw error;
  }
}

/** Revoke every connected endpoint for this destination on this channel. */
async function optOut(
  channel: ConciergeOutsideChannel,
  destination: string,
  now: Date,
) {
  const rows = await getDatabase()
    .select({
      id: personChannelEndpoints.id,
      personId: personChannelEndpoints.personId,
    })
    .from(personChannelEndpoints)
    .where(
      and(
        eq(personChannelEndpoints.channel, channel),
        eq(personChannelEndpoints.destination, destination),
        sql`${personChannelEndpoints.status} <> 'revoked'`,
      ),
    );
  for (const row of rows) {
    await revokeConciergeEndpoint({
      personId: row.personId,
      endpointId: row.id,
      reason: "opt-out",
      now,
    });
  }
  return rows.length;
}

/** A reply from a phone number on iMessage or WhatsApp. */
export async function routeConciergePhoneInbound(input: {
  readonly channel: "imessage" | "whatsapp";
  readonly from: string;
  readonly text: string;
  readonly eventId: string;
  readonly hasMedia?: boolean;
  readonly now: Date;
}): Promise<InboundDisposition> {
  const text = input.text.trim();
  if (OPT_OUT_KEYWORDS.test(text)) {
    const revoked = await optOut(input.channel, input.from, input.now);
    log.info("concierge.inbound.opt_out", {
      channel: input.channel,
      endpoints: revoked,
    });
    return "opted-out";
  }
  if (input.hasMedia || !text) return "quarantined-unsupported";
  const endpoints = await getDatabase()
    .select({ personId: personChannelEndpoints.personId })
    .from(personChannelEndpoints)
    .where(
      and(
        eq(personChannelEndpoints.channel, input.channel),
        eq(personChannelEndpoints.destination, input.from),
        eq(personChannelEndpoints.status, "connected"),
      ),
    );
  const personIds = [...new Set(endpoints.map((row) => row.personId))];
  if (personIds.length === 0) return "quarantined-unknown-sender";
  if (personIds.length > 1) return "quarantined-ambiguous";
  const threads = await getDatabase()
    .selectDistinct({ conversationId: conciergeSendProposals.conversationId })
    .from(conciergeDeliveries)
    .innerJoin(
      conciergeSendProposals,
      eq(conciergeSendProposals.id, conciergeDeliveries.proposalId),
    )
    .where(
      and(
        eq(conciergeDeliveries.personId, personIds[0]!),
        eq(conciergeDeliveries.channel, input.channel),
        gt(
          conciergeDeliveries.createdAt,
          new Date(input.now.getTime() - THREAD_WINDOW_MS),
        ),
      ),
    )
    .limit(2);
  if (threads.length !== 1) return "quarantined-ambiguous";
  return postAs({
    personId: personIds[0]!,
    conversationId: threads[0]!.conversationId,
    channel: input.channel,
    text,
    eventId: input.eventId,
  });
}

/** A reply by email, addressed to `reply+<token>@<reply domain>`. */
export async function routeConciergeEmailInbound(input: {
  readonly from: string;
  readonly to: readonly string[];
  readonly text: string;
  readonly eventId: string;
  readonly now: Date;
}): Promise<{
  disposition: InboundDisposition;
  organizationId?: string;
  conversationId?: string;
}> {
  const token = input.to
    .map((address) => /reply\+([^@\s>]+)@/i.exec(address)?.[1])
    .find(Boolean);
  const deliveryId = token ? deliveryIdFromReplyToken(token) : undefined;
  if (!deliveryId) return { disposition: "quarantined-unknown-sender" };
  const [found] = await getDatabase()
    .select({
      delivery: conciergeDeliveries,
      destination: personChannelEndpoints.destination,
      conversationId: conciergeSendProposals.conversationId,
    })
    .from(conciergeDeliveries)
    .innerJoin(
      conciergeSendProposals,
      eq(conciergeSendProposals.id, conciergeDeliveries.proposalId),
    )
    .leftJoin(
      personChannelEndpoints,
      eq(personChannelEndpoints.id, conciergeDeliveries.endpointId),
    )
    .where(eq(conciergeDeliveries.id, deliveryId))
    .limit(1);
  if (!found) return { disposition: "quarantined-unknown-sender" };
  const scope = {
    organizationId: found.delivery.organizationId ?? undefined,
    conversationId: found.conversationId,
  };
  const sender = /<?([^<>\s]+@[^<>\s]+)>?\s*$/
    .exec(input.from)?.[1]
    ?.toLowerCase();
  if (!sender || sender !== found.destination?.toLowerCase()) {
    return { disposition: "quarantined-sender-mismatch", ...scope };
  }
  const text = stripQuotedReply(input.text);
  if (OPT_OUT_KEYWORDS.test(text.trim())) {
    await optOut("email", sender, input.now);
    return { disposition: "opted-out", ...scope };
  }
  if (!text.trim()) return { disposition: "quarantined-unsupported", ...scope };
  return {
    disposition: await postAs({
      personId: found.delivery.personId,
      conversationId: found.conversationId,
      channel: "email",
      text,
      eventId: input.eventId,
    }),
    ...scope,
  };
}

/** Drop the quoted original below a reply ("On … wrote:" or "> " lines). */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line.trim()) || line.startsWith(">")) break;
    if (/^-{2,}\s*Original Message/i.test(line.trim())) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

const sentDmEventSchema = z.object({
  event: z.string().max(64),
  payload: z
    .object({
      message_id: z.string().max(192).optional(),
      inbound_number: z.string().max(24).optional(),
      outbound_number: z.string().max(24).optional(),
      text: z.string().max(20000).nullish(),
      channel: z.string().max(16).optional(),
      message_status: z.string().max(24).optional(),
      reason_code: z.string().max(64).nullish(),
      media: z.unknown().optional(),
    })
    .passthrough(),
});

function sentDmStatus(
  value: string | undefined,
): "sent" | "delivered" | "read" | "failed" | undefined {
  switch (value) {
    case "SENT":
      return "sent";
    case "DELIVERED":
      return "delivered";
    case "READ":
      return "read";
    case "FAILED":
    case "FILTERED":
    case "BLOCKED":
    case "CANCELLED":
      return "failed";
    default:
      return undefined;
  }
}

/** WhatsApp webhook (Sent.dm): inbound replies and delivery status. */
export async function receiveConciergeWhatsappWebhook(input: {
  readonly rawBody: string;
  readonly headers: Headers;
  readonly now: Date;
}): Promise<{
  readonly status: number;
  readonly disposition?: InboundDisposition;
}> {
  const secret = process.env.SENT_DM_WEBHOOK_SECRET?.trim();
  if (!secret) return { status: 503 };
  const header = (v2: string, v1: string) =>
    input.headers.get(v2) ?? input.headers.get(v1);
  const id = header("webhook-id", "x-webhook-id");
  if (
    !verifySvixSignature({
      secret,
      id,
      timestamp: header("webhook-timestamp", "x-webhook-timestamp"),
      signature: header("webhook-signature", "x-webhook-signature"),
      rawBody: input.rawBody,
      now: input.now,
    })
  )
    return { status: 401 };
  let parsed;
  try {
    parsed = sentDmEventSchema.safeParse(JSON.parse(input.rawBody));
  } catch {
    return { status: 400 };
  }
  if (!parsed.success) return { status: 400 };
  const { event, payload } = parsed.data;
  if (event !== "message.received") {
    const status = sentDmStatus(payload.message_status);
    if (!status || !payload.message_id || payload.channel !== "whatsapp")
      return { status: 200, disposition: "ignored" };
    await applyConciergeDeliveryStatus({
      channel: "whatsapp",
      handle: payload.message_id,
      status,
      ...(payload.reason_code ? { errorCode: payload.reason_code } : {}),
      now: input.now,
    });
    return { status: 200, disposition: "status-applied" };
  }
  if (payload.channel !== "whatsapp" || !payload.inbound_number)
    return { status: 200, disposition: "ignored" };
  const claimed = await claimEvent({
    provider: "sent-dm",
    eventId: id!,
    eventType: event,
    payload: {
      channel: "whatsapp",
      from: payload.inbound_number,
      text: payload.text ?? "",
    },
  });
  if (!claimed.fresh) return { status: 200, disposition: "duplicate" };
  const disposition = await routeConciergePhoneInbound({
    channel: "whatsapp",
    from: payload.inbound_number,
    text: payload.text ?? "",
    eventId: claimed.id,
    hasMedia: Boolean(payload.media),
    now: input.now,
  });
  await finishEvent(claimed.id, disposition);
  log.info("concierge.inbound.routed", { channel: "whatsapp", disposition });
  return { status: 200, disposition };
}

const resendEventSchema = z.object({
  type: z.string().max(64),
  data: z
    .object({
      email_id: z.string().max(192).optional(),
      from: z.string().max(400).optional(),
      to: z.array(z.string().max(400)).max(50).optional(),
      text: z.string().max(100_000).nullish(),
    })
    .passthrough(),
});

async function fetchReceivedEmailText(emailId: string): Promise<string> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "";
  try {
    return await withProviderCall("email", "emails.receiving.get", async () => {
      const response = await fetch(
        `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
        {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok)
        throw Object.assign(new Error("Resend receiving lookup failed"), {
          status: response.status,
        });
      const body = (await response.json()) as { text?: unknown };
      return typeof body.text === "string" ? body.text : "";
    });
  } catch {
    return "";
  }
}

/** Email webhook (Resend): inbound replies and delivery events. */
export async function receiveConciergeEmailWebhook(input: {
  readonly rawBody: string;
  readonly headers: Headers;
  readonly now: Date;
}): Promise<{
  readonly status: number;
  readonly disposition?: InboundDisposition;
}> {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return { status: 503 };
  const id = input.headers.get("svix-id");
  if (
    !verifySvixSignature({
      secret,
      id,
      timestamp: input.headers.get("svix-timestamp"),
      signature: input.headers.get("svix-signature"),
      rawBody: input.rawBody,
      now: input.now,
    })
  )
    return { status: 401 };
  let parsed;
  try {
    parsed = resendEventSchema.safeParse(JSON.parse(input.rawBody));
  } catch {
    return { status: 400 };
  }
  if (!parsed.success) return { status: 400 };
  const { type, data } = parsed.data;
  if (type !== "email.received") {
    const status =
      type === "email.delivered"
        ? "delivered"
        : type === "email.bounced" || type === "email.failed"
          ? "failed"
          : type === "email.opened"
            ? "read"
            : undefined;
    if (!status || !data.email_id)
      return { status: 200, disposition: "ignored" };
    await applyConciergeDeliveryStatus({
      channel: "email",
      handle: data.email_id,
      status,
      ...(status === "failed" ? { errorCode: "bounced" } : {}),
      now: input.now,
    });
    return { status: 200, disposition: "status-applied" };
  }
  const claimed = await claimEvent({
    provider: "resend",
    eventId: id!,
    eventType: type,
    payload: { channel: "email", emailId: data.email_id ?? null },
  });
  if (!claimed.fresh) return { status: 200, disposition: "duplicate" };
  const text =
    data.text ??
    (data.email_id ? await fetchReceivedEmailText(data.email_id) : "");
  const routed = await routeConciergeEmailInbound({
    from: data.from ?? "",
    to: data.to ?? [],
    text,
    eventId: claimed.id,
    now: input.now,
  });
  await finishEvent(claimed.id, routed.disposition, {
    ...(routed.organizationId ? { organizationId: routed.organizationId } : {}),
    ...(routed.conversationId ? { conversationId: routed.conversationId } : {}),
    ...(routed.disposition.startsWith("quarantined")
      ? { text: text.slice(0, 4000) }
      : {}),
  });
  log.info("concierge.inbound.routed", {
    channel: "email",
    disposition: routed.disposition,
  });
  return { status: 200, disposition: routed.disposition };
}

/** Quarantined replies a club's staff may review (attributable to the club only). */
export async function listConciergeQuarantine(organizationId: string) {
  const rows = await getDatabase()
    .select({
      id: webhookEvents.id,
      payload: webhookEvents.payload,
      createdAt: webhookEvents.createdAt,
    })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.status, "held"),
        sql`${webhookEvents.provider} IN ('resend', 'sent-dm', 'sendblue')`,
        sql`${webhookEvents.payload}->>'organizationId' = ${organizationId}`,
      ),
    )
    .orderBy(desc(webhookEvents.createdAt))
    .limit(50);
  return rows.map((row) => ({
    quarantineId: row.id,
    channel: String(row.payload.channel ?? "email"),
    reason: String(row.payload.disposition ?? "quarantined"),
    ...(typeof row.payload.conversationId === "string"
      ? { conversationId: row.payload.conversationId }
      : {}),
    text: String(row.payload.text ?? "").slice(0, 4000),
    receivedAt: row.createdAt.toISOString(),
  }));
}

/** Staff dismiss a quarantined reply after reviewing it. */
export async function dismissConciergeQuarantine(
  organizationId: string,
  quarantineId: string,
) {
  const [row] = await getDatabase()
    .update(webhookEvents)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(webhookEvents.id, quarantineId),
        eq(webhookEvents.status, "held"),
        sql`${webhookEvents.payload}->>'organizationId' = ${organizationId}`,
      ),
    )
    .returning({ id: webhookEvents.id });
  if (!row) return { dismissed: false };
  return { dismissed: true };
}
