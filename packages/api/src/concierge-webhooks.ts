/**
 * Concierge (B7) webhook entry points for the thin route files in
 * apps/web/app/api/concierge/**. Each verifies the provider signature before
 * reading anything and is idempotent; see services/concierge/inbound.ts.
 */
import { authenticateSendblueWebhook } from "./sendblue-ingress";
import { phoneDeliveryState, phoneStatusSchema } from "./sendblue-outbox";
import { applyConciergeDeliveryStatus } from "./services/concierge/delivery";

export {
  receiveConciergeEmailWebhook,
  receiveConciergeWhatsappWebhook,
} from "./services/concierge/inbound";

/** Sendblue status callback for one Concierge iMessage delivery. */
export async function receiveConciergeSendblueStatus(input: {
  readonly signingSecret: string | null;
  readonly deliveryId: string | null;
  readonly body: unknown;
  readonly now: Date;
}): Promise<{ readonly status: number }> {
  if (
    !authenticateSendblueWebhook(
      input.signingSecret,
      process.env.SENDBLUE_WEBHOOK_SECRET,
    )
  )
    return { status: 401 };
  if (!input.deliveryId || !/^[0-9a-f-]{36}$/i.test(input.deliveryId))
    return { status: 400 };
  const parsed = phoneStatusSchema.safeParse(input.body);
  if (!parsed.success) return { status: 400 };
  const state = phoneDeliveryState(parsed.data.status);
  if (state === "unknown") return { status: 200 };
  const result = await applyConciergeDeliveryStatus({
    channel: "imessage",
    handle: parsed.data.message_handle,
    deliveryId: input.deliveryId.toLowerCase(),
    status: state,
    now: input.now,
  });
  return { status: result === "not-found" ? 404 : 200 };
}
