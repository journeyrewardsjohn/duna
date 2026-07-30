import {
  getDatabase,
  isDatabaseConfigured,
  webhookEvents,
  workflowJobs,
} from "@duna/db";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

const processedDemoEvents = new Set<string>();

export type StripeDomainAction =
  | "order.payment_succeeded"
  | "order.payment_failed"
  | "membership.synchronized"
  | "membership.payment_failed"
  | "connect.synchronized"
  | "payout.synchronized"
  | "dispute.synchronized"
  | "refund.synchronized"
  | "checkout.completed"
  | "ignored";

function actionForStripeEvent(type: string): StripeDomainAction {
  if (type === "payment_intent.succeeded") return "order.payment_succeeded";
  if (type === "payment_intent.payment_failed") return "order.payment_failed";
  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    return "membership.synchronized";
  }
  if (type === "invoice.payment_failed") return "membership.payment_failed";
  if (type === "account.updated") return "connect.synchronized";
  if (type.startsWith("payout.")) return "payout.synchronized";
  if (type.startsWith("charge.dispute.")) return "dispute.synchronized";
  if (type.startsWith("refund.")) return "refund.synchronized";
  if (type === "checkout.session.completed") return "checkout.completed";
  return "ignored";
}

export async function processStripeWebhook(event: Stripe.Event): Promise<{
  readonly duplicate: boolean;
  readonly action: StripeDomainAction;
  readonly workflowJobId?: string;
}> {
  const action = actionForStripeEvent(event.type);
  if (!isDatabaseConfigured()) {
    const duplicate = processedDemoEvents.has(event.id);
    processedDemoEvents.add(event.id);
    return { duplicate, action };
  }

  const db = getDatabase();
  const existing = await db.query.webhookEvents.findFirst({
    where: and(
      eq(webhookEvents.provider, "stripe"),
      eq(webhookEvents.providerEventId, event.id),
    ),
  });
  if (existing) return { duplicate: true, action };

  const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  const webhookEventId = crypto.randomUUID();
  const workflowJobId = crypto.randomUUID();
  const [insertedEvents] = await db.batch([
    db
      .insert(webhookEvents)
      .values({
        id: webhookEventId,
        provider: "stripe",
        providerEventId: event.id,
        eventType: event.type,
        payload,
        signatureVerified: true,
        status: "queued",
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id }),
    db
      .insert(workflowJobs)
      .values({
        id: workflowJobId,
        kind: `stripe.${action}`,
        idempotencyKey: `stripe:${event.id}`,
        payload: {
          webhookEventId,
          providerEventId: event.id,
          eventType: event.type,
          action,
        },
        traceId: event.id,
      })
      .onConflictDoNothing()
      .returning({ id: workflowJobs.id }),
  ]);

  if (!insertedEvents[0]) {
    return { duplicate: true, action };
  }

  return { duplicate: false, action, workflowJobId };
}
