import { timingSafeEqual } from "node:crypto";
import {
  getDatabase,
  getTransactionalDatabase,
  isDatabaseConfigured,
  webhookEvents,
} from "@duna/db";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  parseChannelLinkCode,
  processVerifiedChannelInbound,
} from "./messaging-channel-link";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
export const sendblueInboundSchema = z.object({
  message_handle: z.string().min(1).max(160),
  is_outbound: z.literal(false),
  status: z.literal("RECEIVED"),
  from_number: phone,
  to_number: phone,
  sendblue_number: phone.optional(),
  content: z.string().max(20000).default(""),
  media_url: z.string().max(2000).optional(),
  group_id: z.string().max(192).nullish(),
  opted_out: z.boolean().optional(),
  date_sent: z.string().max(80).optional(),
  participants: z.array(phone).max(200).optional(),
  group_display_name: z.string().max(240).nullish(),
  is_reaction: z.boolean().optional(),
});

export function authenticateSendblueWebhook(
  provided: string | null,
  expected: string | undefined,
): boolean {
  if (!provided || !expected || expected.length < 32) return false;
  const actualBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function classifySendblueInbound(
  payload: unknown,
  allowedNumbers: readonly string[],
) {
  const parsed = sendblueInboundSchema.parse(payload);
  if (
    !allowedNumbers.includes(parsed.to_number) ||
    (parsed.sendblue_number && parsed.sendblue_number !== parsed.to_number)
  ) {
    throw new Error("Inbound endpoint is not configured for Duna.");
  }
  const optedOut =
    parsed.opted_out === true ||
    /^(stop|unsubscribe|cancel|end|quit)$/i.test(parsed.content.trim());
  return {
    payload: parsed,
    disposition: optedOut
      ? "opted-out"
      : parsed.group_id
        ? "group-review"
        : "identity-required",
  } as const;
}

/** Durable ingress: an unverified phone is not a Duna identity. Only verified channel bindings can reach an existing authorized conversation.
 * No agent invocation, external media fetch or outbound send is created.
 * Group payloads remain preserved for qualification rather than being discarded. */
export async function receiveSendblueInbound(
  payload: unknown,
  allowedNumbers: readonly string[],
) {
  if (!isDatabaseConfigured())
    throw new Error("Messaging storage is unavailable.");
  const incoming = classifySendblueInbound(payload, allowedNumbers);
  const providerEventId = `${incoming.payload.to_number}:${incoming.payload.message_handle}`;
  const storedPayload = {
    ...incoming.payload,
    content: parseChannelLinkCode(incoming.payload.content)
      ? "[Channel linking code]"
      : incoming.payload.content,
    routingDisposition: incoming.disposition,
  };
  const inserted = await getDatabase()
    .insert(webhookEvents)
    .values({
      provider: "sendblue",
      providerEventId,
      eventType: "message.received",
      payload: storedPayload,
      signatureVerified: true,
      status: "received",
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return getTransactionalDatabase().transaction(async (transaction) => {
    const [event] = await transaction
      .select()
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, "sendblue"),
          eq(webhookEvents.providerEventId, providerEventId),
        ),
      )
      .for("update");
    if (!event) throw new Error("Inbound receipt was not persisted.");
    if (event.processedAt)
      return {
        duplicate: true,
        disposition: String(event.payload.routingDisposition),
      };
    const disposition = await processVerifiedChannelInbound({
      senderPhone: incoming.payload.from_number,
      endpoint: incoming.payload.to_number,
      content: incoming.payload.content,
      clientMessageId: event.id,
      optedOut: incoming.disposition === "opted-out",
      group: Boolean(incoming.payload.group_id),
      media:
        Boolean(incoming.payload.media_url) ||
        incoming.payload.is_reaction === true ||
        incoming.payload.content.length > 10000,
    });
    await transaction
      .update(webhookEvents)
      .set({
        status: ["linked", "delivered", "opted-out"].includes(disposition)
          ? "processed"
          : "held",
        payload: { ...storedPayload, routingDisposition: disposition },
        processedAt: new Date(),
      })
      .where(eq(webhookEvents.id, event.id));
    return { duplicate: inserted.length === 0, disposition };
  });
}
