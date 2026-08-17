const RESEND_API_BASE = "https://api.resend.com";

function apiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

function fromAddress(): string | undefined {
  return process.env.RESEND_FROM_EMAIL?.trim() || undefined;
}

export function isResendConfigured(): boolean {
  return Boolean(apiKey() && fromAddress());
}

export interface TransactionalEmailResult {
  readonly configured: boolean;
  readonly sent: boolean;
  readonly messageId?: string;
  readonly reason?: string;
}

export async function sendTransactionalEmail(input: {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly replyTo?: string;
  readonly attachments?: readonly {
    readonly filename: string;
    /** Base64 content, as required by Resend's email attachment API. */
    readonly content: string;
  }[];
}): Promise<TransactionalEmailResult> {
  const key = apiKey();
  const from = fromAddress();
  if (!key || !from) {
    return {
      configured: false,
      sent: false,
      reason: "RESEND_API_KEY and RESEND_FROM_EMAIL must both be configured.",
    };
  }
  const response = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json().catch(() => undefined)) as
    { readonly id?: string; readonly message?: string } | undefined;
  if (!response.ok) {
    return {
      configured: true,
      sent: false,
      reason: payload?.message ?? `Resend returned HTTP ${response.status}.`,
    };
  }
  return {
    configured: true,
    sent: true,
    messageId: payload?.id,
  };
}
