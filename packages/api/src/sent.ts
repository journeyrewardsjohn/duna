const SENT_API_BASE = "https://api.sent.dm/v3";

function apiKey(): string | undefined {
  const value = process.env.SENT_DM_API ?? process.env.SENT_DM_API_KEY;
  return value?.trim() || undefined;
}

export function isSentConfigured(): boolean {
  return Boolean(apiKey());
}

export interface SentTemplateSmsInput {
  readonly to: string;
  readonly templateId?: string;
  readonly templateName?: string;
  readonly parameters: Readonly<Record<string, string | number>>;
  readonly idempotencyKey: string;
}

export interface SentTemplateSmsResult {
  readonly configured: boolean;
  readonly sent: boolean;
  readonly messageId?: string;
  readonly reason?: string;
}

export async function sendTemplateSms(
  input: SentTemplateSmsInput,
): Promise<SentTemplateSmsResult> {
  const key = apiKey();
  if (!key) {
    return {
      configured: false,
      sent: false,
      reason: "SENT_DM_API is not configured with a non-empty value.",
    };
  }
  const templateId =
    input.templateId ?? process.env.SENT_DM_BOOKING_INVITE_TEMPLATE_ID;
  const templateName =
    input.templateName ??
    process.env.SENT_DM_BOOKING_INVITE_TEMPLATE_NAME ??
    "duna_court_booking_invite";
  const response = await fetch(`${SENT_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      to: [input.to],
      channel: ["sms"],
      template: {
        ...(templateId ? { id: templateId } : { name: templateName }),
        parameters: input.parameters,
      },
      sandbox: process.env.SENT_DM_SANDBOX === "true",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json().catch(() => undefined)) as
    | {
        readonly data?: readonly {
          readonly message_id?: string;
          readonly id?: string;
        }[];
        readonly message_id?: string;
        readonly error?: { readonly message?: string };
        readonly message?: string;
      }
    | undefined;
  if (!response.ok) {
    return {
      configured: true,
      sent: false,
      reason:
        payload?.error?.message ??
        payload?.message ??
        `Sent.dm returned HTTP ${response.status}.`,
    };
  }
  return {
    configured: true,
    sent: true,
    messageId:
      payload?.data?.[0]?.message_id ??
      payload?.data?.[0]?.id ??
      payload?.message_id,
  };
}
