/**
 * Delivery receipts and opt-outs from the text-message provider
 * (INVITE-SMS), for the thin route `apps/web/app/api/invites/sms/webhook`.
 *
 * Prelude webhooks (docs.prelude.so/notify/v2/documentation/webhook,
 * read 28 November 2026):
 * - signed with RSASSA-PSS / SHA-256 (MGF1 SHA-256) over the RAW body bytes;
 *   header `X-Webhook-Signature: rsassa-pss-sha256=<base64url>`; verified
 *   with the PEM public key from the dashboard (`PRELUDE_WEBHOOK_PUBLIC_KEY`);
 * - envelope `{ id, type, payload, created_at }`; retried with back-off for
 *   up to two weeks until we answer 200; events may arrive out of order;
 * - `transactional.message.{created,submitted,pending_delivery,delivered,
 *   failed,unknown}`; a `failed` event with `next_retry_at` is not final;
 * - `marketing.subscription.{stop,start,help}` (`payload.from` is the
 *   person's number) and `marketing.subscription.carrier_disconnect`
 *   (`payload.phone_number`), sent to the subscription config's callback.
 *
 * Every event is verified before it is read, recorded once in
 * `webhook_events` (provider `prelude`, the event id) WITHOUT any number or
 * text, and applied forward-only: `delivered` is never overwritten.
 */
import { constants, createPublicKey, verify } from "node:crypto";
import {
  getDatabase,
  inviteSmsMessages,
  isDatabaseConfigured,
  webhookEvents,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, eq, ne, or } from "drizzle-orm";
import { z } from "zod";
import { suppress, unsuppressAfterStart } from "./sms-invites";
import { destinationHash, normalisePhone } from "./sms-text";

export const PRELUDE_SIGNATURE_HEADER = "x-webhook-signature";

function publicKey(): string | undefined {
  const raw = process.env.PRELUDE_WEBHOOK_PUBLIC_KEY?.trim();
  if (!raw) return undefined;
  return raw.includes("\\n") ? raw.replaceAll("\\n", "\n") : raw;
}

export function isInviteSmsWebhookConfigured(): boolean {
  return Boolean(publicKey());
}

/** RSASSA-PSS SHA-256 over the raw body, as the provider documents. */
export function verifyPreludeSignature(
  rawBody: Uint8Array,
  header: string | null,
  publicKeyPem: string,
): boolean {
  if (!header || !header.startsWith("rsassa-pss-sha256=")) return false;
  try {
    const signature = Buffer.from(
      header.slice("rsassa-pss-sha256=".length),
      "base64url",
    );
    if (signature.length === 0) return false;
    return verify(
      "sha256",
      rawBody,
      {
        key: createPublicKey(publicKeyPem),
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_AUTO,
      },
      signature,
    );
  } catch {
    return false;
  }
}

const envelopeSchema = z.object({
  id: z.string().min(1).max(192),
  type: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const messagePayloadSchema = z.object({
  id: z.string().max(160).optional(),
  message_id: z.string().max(160).optional(),
  correlation_id: z.string().max(80).optional(),
  status: z.string().max(40).optional(),
  reason: z.string().max(48).optional(),
  channel: z.string().max(16).optional(),
  next_retry_at: z.string().optional(),
});

type Outcome = { readonly status: number; readonly duplicate?: boolean };

export async function receiveInviteSmsWebhook(input: {
  readonly rawBody: Uint8Array;
  readonly signature: string | null;
  readonly now: Date;
}): Promise<Outcome> {
  const key = publicKey();
  if (!key) {
    log.warn("invites.sms.webhook.skipped", {
      reason: "provider-not-configured",
    });
    return { status: 503 };
  }
  if (!verifyPreludeSignature(input.rawBody, input.signature, key)) {
    log.warn("invites.sms.webhook.rejected", { reason: "signature" });
    return { status: 401 };
  }
  let parsed: z.infer<typeof envelopeSchema>;
  try {
    const result = envelopeSchema.safeParse(
      JSON.parse(Buffer.from(input.rawBody).toString("utf8")),
    );
    if (!result.success) return { status: 400 };
    parsed = result.data;
  } catch {
    return { status: 400 };
  }
  if (!isDatabaseConfigured()) return { status: 503 };
  const database = getDatabase();
  const message = messagePayloadSchema.safeParse(parsed.payload);
  const [recorded] = await database
    .insert(webhookEvents)
    .values({
      provider: "prelude",
      providerEventId: parsed.id,
      eventType: parsed.type,
      // Ids and states only: never a number or message text.
      payload: message.success
        ? {
            messageId: message.data.message_id ?? message.data.id ?? null,
            correlationId: message.data.correlation_id ?? null,
            status: message.data.status ?? null,
            reason: message.data.reason ?? null,
          }
        : {},
      signatureVerified: true,
      status: "processed",
      processedAt: input.now,
      createdAt: input.now,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!recorded) return { status: 200, duplicate: true };

  if (parsed.type.startsWith("transactional.message.") && message.success) {
    await applyDeliveryEvent(parsed.type, message.data, input.now);
  } else if (
    parsed.type === "marketing.subscription.stop" ||
    parsed.type === "marketing.subscription.start" ||
    parsed.type === "marketing.subscription.carrier_disconnect"
  ) {
    const raw =
      parsed.type === "marketing.subscription.carrier_disconnect"
        ? parsed.payload.phone_number
        : parsed.payload.from;
    const number = typeof raw === "string" ? normalisePhone(raw) : undefined;
    if (number?.ok) {
      const hash = destinationHash(number.e164);
      if (parsed.type === "marketing.subscription.start") {
        await unsuppressAfterStart(hash);
      } else {
        await suppress(
          hash,
          parsed.type === "marketing.subscription.stop"
            ? "stop-keyword"
            : "carrier-disconnect",
          input.now,
        );
      }
    }
  }
  log.info("invites.sms.webhook.processed", {
    eventId: parsed.id,
    eventType: parsed.type,
  });
  return { status: 200 };
}

async function applyDeliveryEvent(
  type: string,
  payload: z.infer<typeof messagePayloadSchema>,
  now: Date,
): Promise<void> {
  const providerMessageId =
    type === "transactional.message.created"
      ? payload.id
      : (payload.message_id ?? payload.id);
  const correlation =
    payload.correlation_id && /^[0-9a-f-]{36}$/i.test(payload.correlation_id)
      ? payload.correlation_id.toLowerCase()
      : undefined;
  const matchers = [
    ...(providerMessageId
      ? [eq(inviteSmsMessages.providerMessageId, providerMessageId)]
      : []),
    ...(correlation ? [eq(inviteSmsMessages.id, correlation)] : []),
  ];
  if (matchers.length === 0) return;
  const target = or(...matchers);
  const database = getDatabase();
  const channel =
    payload.channel && /^[a-z]{2,16}$/.test(payload.channel)
      ? payload.channel
      : undefined;
  const base = {
    lastEventAt: now,
    updatedAt: now,
    ...(channel ? { channel } : {}),
  };
  if (type === "transactional.message.delivered") {
    await database
      .update(inviteSmsMessages)
      .set({
        ...base,
        status: "delivered",
        deliveredAt: now,
        failureCode: null,
        ...(providerMessageId ? { providerMessageId } : {}),
      })
      .where(target);
    return;
  }
  if (type === "transactional.message.failed") {
    if (payload.next_retry_at) return; // not final; a later event settles it
    await database
      .update(inviteSmsMessages)
      .set({
        ...base,
        status: "failed",
        failureCode: (payload.reason ?? payload.status ?? "failed").slice(
          0,
          48,
        ),
      })
      .where(and(target, ne(inviteSmsMessages.status, "delivered")));
    return;
  }
  // created / submitted / pending_delivery: an unknown outcome was accepted.
  await database
    .update(inviteSmsMessages)
    .set({
      ...base,
      status: "sent",
      failureCode: null,
      ...(providerMessageId && type === "transactional.message.created"
        ? { providerMessageId }
        : {}),
    })
    .where(and(target, eq(inviteSmsMessages.status, "sending")));
  if (channel) {
    await database
      .update(inviteSmsMessages)
      .set({ channel, updatedAt: now })
      .where(target);
  }
}
