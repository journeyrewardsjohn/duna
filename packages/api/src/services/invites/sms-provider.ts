/**
 * The text-message provider behind ONE small interface (INVITE-SMS).
 *
 * Implementation: Prelude Notify v2 (documentation read 28 November 2026):
 * - `POST https://api.prelude.dev/v2/notify`, `Authorization: Bearer <v2 key>`
 *   (docs.prelude.so/notify/v2/documentation/introduction,
 *   docs.prelude.so/notify/v2/api-reference/send-a-message).
 * - Body: `to` (E.164), `template_id` (required; an approved template),
 *   `variables` (exactly the template's variables), optional `from` (an
 *   approved sender), `callback_url` (delivery webhooks), `correlation_id`
 *   (max 80, echoed in webhooks), `expires_at` (RFC 3339, max 24 hours),
 *   `preferred_channel` (`sms`, `rcs`, `whatsapp`; falls back when the
 *   channel is unavailable).
 * - The API has NO idempotency key, so a timeout or 5xx is an unknown
 *   outcome: it is never retried automatically; the `correlation_id` (our
 *   row id) lets a later delivery webhook settle it.
 * - 400 errors carry `code`: `invalid_phone_number`, `unsubscribed`,
 *   `template_not_found`, `invalid_template_variables`, … (the code is kept,
 *   the message is not).
 *
 * The key is read from `PRELUDE_API_KEY` at call time and never logged; the
 * template from `PRELUDE_INVITE_TEMPLATE_ID`. Without both the client answers
 * `not-configured` and makes no call. Tests replace `fetch` with recorded
 * fixtures (`setInviteSmsFetchForTests`); nothing calls the provider in
 * tests or locally without a key.
 */
import { withProviderCall } from "../../observability";

export const PRELUDE_NOTIFY_URL = "https://api.prelude.dev/v2/notify";

export interface InviteSmsSendRequest {
  /** E.164; never logged. */
  readonly to: string;
  readonly variables: Readonly<Record<string, string>>;
  /** Our row id, echoed by the provider in delivery events. */
  readonly correlationId: string;
  readonly callbackUrl?: string;
  readonly expiresAt: Date;
}

export type InviteSmsSendResult =
  | {
      readonly kind: "sent";
      readonly providerMessageId: string;
    }
  /** Refused for good: invalid number, unsubscribed, template problems. */
  | { readonly kind: "rejected"; readonly code: string }
  /** Not accepted (rate limited, authentication); safe to try again later. */
  | { readonly kind: "transient"; readonly code: string }
  /** May have been accepted; never retried automatically. */
  | { readonly kind: "outcome-unknown"; readonly code: string }
  | { readonly kind: "not-configured" };

export interface InviteSmsProvider {
  isConfigured(): boolean;
  send(request: InviteSmsSendRequest): Promise<InviteSmsSendResult>;
}

/** Typed provider failure so `withProviderCall` can classify by status. */
export class InviteSmsProviderError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode: string | undefined,
  ) {
    super(`Text-message provider answered HTTP ${status}`);
    this.name = "InviteSmsProviderError";
  }
}

type Fetch = typeof fetch;
let fetchImplementation: Fetch = (...args) => fetch(...args);

export function setInviteSmsFetchForTests(next: Fetch | undefined): void {
  fetchImplementation = next ?? ((...args) => fetch(...args));
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function inviteSmsProviderConfigured(): boolean {
  return Boolean(env("PRELUDE_API_KEY") && env("PRELUDE_INVITE_TEMPLATE_ID"));
}

const PREFERRED_CHANNELS = new Set(["sms", "rcs", "whatsapp"]);

export const preludeInviteSmsProvider: InviteSmsProvider = {
  isConfigured: inviteSmsProviderConfigured,
  async send(request) {
    const key = env("PRELUDE_API_KEY");
    const templateId = env("PRELUDE_INVITE_TEMPLATE_ID");
    if (!key || !templateId) return { kind: "not-configured" };
    const from = env("PRELUDE_SENDER_ID");
    const preferred = env("PRELUDE_PREFERRED_CHANNEL")?.toLowerCase();
    const body = {
      to: request.to,
      template_id: templateId,
      variables: request.variables,
      correlation_id: request.correlationId.slice(0, 80),
      expires_at: request.expiresAt.toISOString(),
      ...(from ? { from } : {}),
      ...(request.callbackUrl ? { callback_url: request.callbackUrl } : {}),
      ...(preferred && PREFERRED_CHANNELS.has(preferred)
        ? { preferred_channel: preferred }
        : {}),
    };
    try {
      return await withProviderCall("sms", "notify.send", async () => {
        const response = await fetchImplementation(PRELUDE_NOTIFY_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
          const code =
            payload && typeof payload === "object"
              ? (payload as { code?: unknown }).code
              : undefined;
          throw new InviteSmsProviderError(
            response.status,
            typeof code === "string" && /^[a-z0-9_]{1,48}$/.test(code)
              ? code
              : undefined,
          );
        }
        const id =
          payload && typeof payload === "object"
            ? (payload as { id?: unknown }).id
            : undefined;
        if (typeof id !== "string" || id.length === 0 || id.length > 160) {
          // Accepted (2xx) without an id: settle by correlation id later.
          throw new InviteSmsProviderError(response.status, "missing_id");
        }
        return { kind: "sent" as const, providerMessageId: id };
      });
    } catch (error) {
      if (error instanceof InviteSmsProviderError) {
        if (error.providerCode === "missing_id") {
          return { kind: "outcome-unknown", code: "missing-id" };
        }
        if (error.status === 429) {
          return { kind: "transient", code: "rate-limited" };
        }
        if (error.status === 401 || error.status === 403) {
          return { kind: "transient", code: "provider-auth" };
        }
        if (error.status >= 500) {
          return { kind: "outcome-unknown", code: `http-${error.status}` };
        }
        return {
          kind: "rejected",
          code: error.providerCode ?? `http-${error.status}`,
        };
      }
      // Timeout or network failure after the request may have left: unknown.
      return { kind: "outcome-unknown", code: "network" };
    }
  },
};

let activeProvider: InviteSmsProvider = preludeInviteSmsProvider;

export function inviteSmsProvider(): InviteSmsProvider {
  return activeProvider;
}

export function setInviteSmsProviderForTests(
  next: InviteSmsProvider | undefined,
): void {
  activeProvider = next ?? preludeInviteSmsProvider;
}
