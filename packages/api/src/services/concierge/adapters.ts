/**
 * Concierge channel adapters (B7) behind ONE interface. Each outside channel
 * answers the typed `not-configured` result (never an error, never an HTTP
 * call) while its production values are absent, which is the case until the
 * owner approves and sets them (docs/plan/production-readiness.md).
 *
 * - email: Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`), the transactional
 *   sender the repo already uses; replies come back to a per-delivery
 *   reply-to address when `CONCIERGE_EMAIL_REPLY_DOMAIN` is set.
 * - imessage: Sendblue, the same API shape as the existing one-to-one pilot
 *   (`sendblue-outbox.ts`): `send-message` with the line in `from_number`.
 * - whatsapp: Sent.dm (`SENT_DM_API_KEY` / `SENT_DM_API`), the same client
 *   shape as `sent.ts`, on the `whatsapp` channel with an approved template
 *   (business-initiated WhatsApp messages must use one).
 *
 * `duna` (in-app + push) has no adapter here: it is the thread itself and the
 * existing Expo push workflow.
 *
 * Every call runs inside `withProviderCall`; message text never reaches a
 * log. Retries never switch channel: the delivery worker retries the same
 * adapter, and only when the outcome is known not to have been accepted.
 */
import { withProviderCall } from "../../observability";
import { providerStatus } from "../../provider-readiness";
import { providerFor } from "./availability";
import type { ConciergeOutsideChannel } from "./types";

export interface ConciergeOutboundMessage {
  /** The frozen destination (email address or E.164 number). Never logged. */
  readonly to: string;
  readonly text: string;
  /** Email subject; ignored by phone channels. */
  readonly subject: string;
  /** Email reply-to so a reply returns to the thread. */
  readonly replyTo?: string;
  readonly idempotencyKey: string;
  /** Provider status callback (Sendblue). */
  readonly statusCallbackUrl?: string;
  /** Template parameters for channels that need one (WhatsApp). */
  readonly templateParameters: Readonly<Record<string, string>>;
  /** Which approved WhatsApp template: a thread message or a one-time code. */
  readonly template: "message" | "verification";
}

export type ConciergeAdapterResult =
  | { readonly kind: "sent"; readonly handle?: string }
  /** The provider refused it for good (bad destination, policy). */
  | { readonly kind: "rejected"; readonly errorCode: string }
  /** Not accepted, safe to retry on the same channel. */
  | { readonly kind: "transient"; readonly errorCode: string }
  /** It may have been accepted; never retried automatically. */
  | { readonly kind: "outcome-unknown"; readonly errorCode: string }
  | { readonly kind: "not-configured" };

export interface ConciergeChannelAdapter {
  readonly channel: ConciergeOutsideChannel;
  isConfigured(): boolean;
  send(message: ConciergeOutboundMessage): Promise<ConciergeAdapterResult>;
}

/** Non-2xx provider answer, carrying the status so `withProviderCall` can classify it. */
class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode: string | undefined,
  ) {
    super(`Provider answered HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

type Fetch = typeof fetch;
let fetchImplementation: Fetch = (...args) => fetch(...args);

/** Tests replace the network with recorded fixtures; never a real provider. */
export function setConciergeFetchForTests(next: Fetch | undefined): void {
  fetchImplementation = next ?? ((...args) => fetch(...args));
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/**
 * POST JSON inside `withProviderCall`. Maps the answer to an adapter result:
 * 2xx sent; 429 / 5xx transient only when the provider honours idempotency
 * keys (otherwise outcome-unknown); other 4xx rejected; a network failure or
 * timeout is transient with an idempotency key, outcome-unknown without.
 */
async function postJson(input: {
  readonly provider: ConciergeOutsideChannel;
  readonly operation: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly idempotent: boolean;
  readonly handleOf: (payload: unknown) => string | undefined;
}): Promise<ConciergeAdapterResult> {
  try {
    return await withProviderCall(
      providerFor[input.provider],
      input.operation,
      async () => {
        const response = await fetchImplementation(input.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...input.headers },
          body: JSON.stringify(input.body),
          signal: AbortSignal.timeout(12_000),
        });
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
          const code =
            payload && typeof payload === "object"
              ? (payload as { error_code?: unknown; name?: unknown }).error_code
              : undefined;
          throw new ProviderHttpError(
            response.status,
            typeof code === "string" ? code.slice(0, 40) : undefined,
          );
        }
        return { kind: "sent" as const, handle: input.handleOf(payload) };
      },
    );
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      if (error.status === 429 || error.status >= 500) {
        return input.idempotent || error.status === 429
          ? { kind: "transient", errorCode: `http-${error.status}` }
          : { kind: "outcome-unknown", errorCode: `http-${error.status}` };
      }
      if (error.status === 401 || error.status === 403) {
        return { kind: "transient", errorCode: "provider-auth" };
      }
      return {
        kind: "rejected",
        errorCode: error.providerCode ?? `http-${error.status}`,
      };
    }
    return input.idempotent
      ? { kind: "transient", errorCode: "network" }
      : { kind: "outcome-unknown", errorCode: "network" };
  }
}

const handleFrom =
  (...paths: readonly (readonly string[])[]) =>
  (payload: unknown): string | undefined => {
    for (const path of paths) {
      let cursor: unknown = payload;
      for (const key of path) {
        if (Array.isArray(cursor)) cursor = cursor[Number(key)];
        else if (cursor && typeof cursor === "object")
          cursor = (cursor as Record<string, unknown>)[key];
        else cursor = undefined;
      }
      if (typeof cursor === "string" && cursor.length > 0)
        return cursor.slice(0, 192);
    }
    return undefined;
  };

export const emailAdapter: ConciergeChannelAdapter = {
  channel: "email",
  isConfigured: () => providerStatus("email") !== "not-configured",
  async send(message) {
    const key = env("RESEND_API_KEY");
    const from = env("RESEND_FROM_EMAIL");
    if (!key || !from) return { kind: "not-configured" };
    return postJson({
      provider: "email",
      operation: "emails.send",
      url: "https://api.resend.com/emails",
      headers: {
        authorization: `Bearer ${key}`,
        "Idempotency-Key": message.idempotencyKey,
      },
      body: {
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      },
      idempotent: true,
      handleOf: handleFrom(["id"]),
    });
  },
};

/** The first configured Sendblue line (`SENDBLUE_PHONE_NUMBERS`, comma separated). */
export function conciergeImessageLine(): string | undefined {
  return (env("SENDBLUE_PHONE_NUMBERS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .find((value) => /^\+[1-9]\d{7,14}$/.test(value));
}

export const imessageAdapter: ConciergeChannelAdapter = {
  channel: "imessage",
  isConfigured: () => providerStatus("imessage") !== "not-configured",
  async send(message) {
    const key = env("SENDBLUE_API_KEY");
    const secret = env("SENDBLUE_API_SECRET");
    const line = conciergeImessageLine();
    if (!key || !secret || !line) return { kind: "not-configured" };
    // Sendblue has no idempotency key: an unknown outcome is never retried.
    return postJson({
      provider: "imessage",
      operation: "send-message",
      url: "https://api.sendblue.com/api/send-message",
      headers: { "sb-api-key-id": key, "sb-api-secret-key": secret },
      body: {
        number: message.to,
        from_number: line,
        content: message.text,
        ...(message.statusCallbackUrl
          ? { status_callback: message.statusCallbackUrl }
          : {}),
      },
      idempotent: false,
      handleOf: handleFrom(["message_handle"]),
    });
  },
};

export const whatsappAdapter: ConciergeChannelAdapter = {
  channel: "whatsapp",
  isConfigured: () => providerStatus("whatsapp") !== "not-configured",
  async send(message) {
    const key = env("SENT_DM_API") ?? env("SENT_DM_API_KEY");
    if (!key) return { kind: "not-configured" };
    const verification = message.template === "verification";
    const templateId = env(
      verification
        ? "SENT_DM_WHATSAPP_VERIFY_TEMPLATE_ID"
        : "SENT_DM_WHATSAPP_TEMPLATE_ID",
    );
    const templateName = verification
      ? (env("SENT_DM_WHATSAPP_VERIFY_TEMPLATE_NAME") ??
        "duna_verification_code")
      : (env("SENT_DM_WHATSAPP_TEMPLATE_NAME") ?? "duna_concierge_message");
    return postJson({
      provider: "whatsapp",
      operation: "messages.send",
      url: "https://api.sent.dm/v3/messages",
      headers: { "x-api-key": key, "Idempotency-Key": message.idempotencyKey },
      body: {
        to: [message.to],
        channel: ["whatsapp"],
        template: {
          ...(templateId ? { id: templateId } : { name: templateName }),
          parameters: message.templateParameters,
        },
        sandbox: process.env.SENT_DM_SANDBOX === "true",
      },
      idempotent: true,
      handleOf: handleFrom(
        ["data", "0", "message_id"],
        ["data", "0", "id"],
        ["message_id"],
      ),
    });
  },
};

export const conciergeAdapters: Readonly<
  Record<ConciergeOutsideChannel, ConciergeChannelAdapter>
> = {
  email: emailAdapter,
  imessage: imessageAdapter,
  whatsapp: whatsappAdapter,
};
