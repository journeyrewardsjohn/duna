import { getDatabase, isDatabaseConfigured, webhookEvents } from "@duna/db";
import { eq, sql } from "drizzle-orm";
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
}> {
  const action = actionForStripeEvent(event.type);
  if (!isDatabaseConfigured()) {
    const duplicate = processedDemoEvents.has(event.id);
    processedDemoEvents.add(event.id);
    return { duplicate, action };
  }

  const db = getDatabase();
  const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      payload,
      signatureVerified: true,
      status: "received",
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (!inserted[0]) {
    return { duplicate: true, action };
  }

  // The durable event is the integration boundary. Domain projections consume
  // this record idempotently; no external webhook request executes business
  // logic before the signed payload has been stored.
  await db
    .update(webhookEvents)
    .set({
      status: "processed",
      attempts: sql`${webhookEvents.attempts} + 1`,
      processedAt: new Date(),
    })
    .where(eq(webhookEvents.id, inserted[0].id));

  return { duplicate: false, action };
}
