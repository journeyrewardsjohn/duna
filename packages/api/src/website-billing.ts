import {
  getDatabase,
  getTransactionalDatabase,
  websiteSites,
  websiteSubscriptions,
  websiteCreditGrants,
  websiteCreditReservations,
  organizations,
  auditLog,
} from "@duna/db";
import { and, eq, gt, desc, sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { ApiActor } from "./context";
import { getStripeClient, createBillingPortalSession } from "./payments";

export const WEBSITE_MONTHLY_PRICE_MINOR = 20_000;
export const WEBSITE_MONTHLY_CREDITS = 1_000;
export const WEBSITE_PRICE_LOOKUP_KEY = "duna-website-monthly-v1";
/** Invoked after owner authorization. Creating catalog records never charges a customer. */
export async function resolveWebsitePriceId(): Promise<string> {
  const stripe = getStripeClient();
  const configured = process.env.STRIPE_WEBSITE_MONTHLY_PRICE_ID;
  if (configured) {
    validateWebsitePrice(await stripe.prices.retrieve(configured));
    return configured;
  }
  const existing = await stripe.prices.list({
    lookup_keys: [WEBSITE_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) {
    validateWebsitePrice(existing.data[0]);
    return existing.data[0].id;
  }
  const product = await stripe.products.create(
    {
      name: "Duna AI Website",
      description:
        "Managed club website with 1,000 monthly AI editing credits.",
      metadata: { product: "duna-website", version: "1" },
    },
    { idempotencyKey: "duna-website-product-v1" },
  );
  const price = await stripe.prices.create(
    {
      product: product.id,
      currency: "usd",
      unit_amount: WEBSITE_MONTHLY_PRICE_MINOR,
      recurring: { interval: "month" },
      lookup_key: WEBSITE_PRICE_LOOKUP_KEY,
      metadata: {
        product: "duna-website",
        includedCredits: String(WEBSITE_MONTHLY_CREDITS),
      },
    },
    { idempotencyKey: "duna-website-price-v1" },
  );
  validateWebsitePrice(price);
  return price.id;
}
export function assertWebsiteActor(actor: ApiActor, billing = false): string {
  if (
    actor.isDemo ||
    !actor.organizationId ||
    !actor.roles.some((r) =>
      (billing
        ? ["owner", "super-admin"]
        : ["owner", "manager", "super-admin"]
      ).includes(r),
    )
  )
    throw new Error("An authorized club owner is required.");
  return actor.organizationId;
}
async function ownedSite(actor: ApiActor, siteId: string, billing = false) {
  const organizationId = assertWebsiteActor(actor, billing);
  const site = await getDatabase().query.websiteSites.findFirst({
    where: and(
      eq(websiteSites.id, siteId),
      eq(websiteSites.organizationId, organizationId),
    ),
  });
  if (!site) throw new Error("Website was not found in this club.");
  return site;
}
export function validateWebsitePrice(
  price: Pick<
    Stripe.Price,
    "active" | "currency" | "unit_amount" | "recurring"
  >,
) {
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== WEBSITE_MONTHLY_PRICE_MINOR ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  )
    throw new Error(
      "Website billing price must be an active $200 USD monthly recurring price.",
    );
}
function safeReturnUrl(value: string) {
  const url = new URL(value);
  const base = new URL(
    process.env.NEXT_PUBLIC_HQ_URL || "https://hq.duna.coach",
  );
  if (url.origin !== base.origin || url.username || url.password)
    throw new Error("Invalid billing return URL.");
  return url.toString();
}
export async function getWebsiteBilling(actor: ApiActor, siteId: string) {
  const site = await ownedSite(actor, siteId);
  const db = getDatabase();
  const subscription = await db.query.websiteSubscriptions.findFirst({
    where: eq(websiteSubscriptions.siteId, siteId),
  });
  const grants = await db
    .select()
    .from(websiteCreditGrants)
    .where(
      and(
        eq(websiteCreditGrants.siteId, siteId),
        eq(websiteCreditGrants.organizationId, site.organizationId),
        gt(websiteCreditGrants.expiresAt, new Date()),
      ),
    );
  return {
    status: subscription?.status ?? "inactive",
    active:
      subscription?.status === "active" &&
      Boolean(
        subscription.periodEndsAt && subscription.periodEndsAt > new Date(),
      ),
    creditsAvailable: grants.reduce((n, g) => n + g.remaining, 0),
    monthlyCredits: WEBSITE_MONTHLY_CREDITS,
    monthlyPriceMinor: WEBSITE_MONTHLY_PRICE_MINOR,
    currency: "usd",
    periodEndsAt: subscription?.periodEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    checkoutConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}
export async function startWebsiteCheckout(input: {
  actor: ApiActor;
  siteId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}) {
  const site = await ownedSite(input.actor, input.siteId, true);
  const db = getDatabase();
  const successUrl = safeReturnUrl(input.successUrl),
    cancelUrl = safeReturnUrl(input.cancelUrl);
  const priceId = await resolveWebsitePriceId();
  const stripe = getStripeClient();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, site.organizationId),
  });
  await db
    .insert(websiteSubscriptions)
    .values({ siteId: site.id, organizationId: site.organizationId })
    .onConflictDoNothing();
  return getTransactionalDatabase().transaction(async (tx) => {
    const [billing] = await tx
      .select()
      .from(websiteSubscriptions)
      .where(eq(websiteSubscriptions.siteId, site.id))
      .for("update");
    if (
      billing?.stripeSubscriptionId &&
      !["canceled", "incomplete_expired"].includes(billing.status)
    )
      throw new Error(
        "This website already has a subscription. Open billing management.",
      );
    let customerId = billing?.stripeCustomerId || org?.stripeBillingCustomerId;
    if (!customerId)
      customerId = (
        await stripe.customers.create(
          { metadata: { dunaOrganizationId: site.organizationId } },
          { idempotencyKey: `website-customer:${site.organizationId}` },
        )
      ).id;
    // One open Checkout per site, including across tabs; Stripe idempotency protects retries.
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 100,
    });
    const existing = sessions?.data.find(
      (s) => s.metadata?.dunaWebsiteId === site.id,
    );
    if (existing) return { id: existing.id, url: existing.url };
    const metadata = {
      product: "duna-website",
      dunaWebsiteId: site.id,
      dunaOrganizationId: site.organizationId,
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: { metadata },
        payment_method_types: ["card"],
      },
      { idempotencyKey: `website-checkout:${site.id}:${input.idempotencyKey}` },
    );
    await tx
      .update(websiteSubscriptions)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(websiteSubscriptions.siteId, site.id));
    return { id: session.id, url: session.url };
  });
}
export async function openWebsiteBillingPortal(input: {
  actor: ApiActor;
  siteId: string;
  returnUrl: string;
}) {
  await ownedSite(input.actor, input.siteId, true);
  const row = await getDatabase().query.websiteSubscriptions.findFirst({
    where: eq(websiteSubscriptions.siteId, input.siteId),
  });
  if (!row?.stripeCustomerId)
    throw new Error("Website billing is not active yet.");
  return createBillingPortalSession({
    customerId: row.stripeCustomerId,
    returnUrl: safeReturnUrl(input.returnUrl),
  });
}
/** Website-only cancellation; shared membership portal policy is unchanged. */
export async function cancelWebsiteSubscription(input: {
  actor: ApiActor;
  siteId: string;
}) {
  const site = await ownedSite(input.actor, input.siteId, true);
  return getTransactionalDatabase().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(websiteSubscriptions)
      .where(
        and(
          eq(websiteSubscriptions.siteId, site.id),
          eq(websiteSubscriptions.organizationId, site.organizationId),
        ),
      )
      .for("update");
    if (!current?.stripeSubscriptionId || !current.stripeCustomerId)
      throw new Error("Website billing is not active yet.");
    const stripe = getStripeClient();
    const verify = (subscription: Stripe.Subscription) => {
      const customer =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      if (
        subscription.id !== current.stripeSubscriptionId ||
        customer !== current.stripeCustomerId ||
        subscription.metadata.product !== "duna-website" ||
        subscription.metadata.dunaWebsiteId !== site.id ||
        subscription.metadata.dunaOrganizationId !== site.organizationId
      )
        throw new Error("Website subscription ownership does not match.");
    };
    let subscription = await stripe.subscriptions.retrieve(
      current.stripeSubscriptionId,
    );
    verify(subscription);
    const terminal = ["canceled", "incomplete_expired"].includes(
      subscription.status,
    );
    if (!terminal && !subscription.cancel_at_period_end) {
      subscription = await stripe.subscriptions.update(
        subscription.id,
        { cancel_at_period_end: true },
        { idempotencyKey: `website-cancel:${site.id}:${subscription.id}` },
      );
      verify(subscription);
      if (!subscription.cancel_at_period_end)
        throw new Error(
          "Website cancellation is not confirmed yet. Check billing before trying again.",
        );
    }
    const end = subscription.items.data[0]?.current_period_end;
    const periodEndsAt = end ? new Date(end * 1000) : current.periodEndsAt;
    await tx
      .update(websiteSubscriptions)
      .set({
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        periodEndsAt,
        updatedAt: new Date(),
      })
      .where(eq(websiteSubscriptions.siteId, site.id));
    if (!terminal && !current.cancelAtPeriodEnd)
      await tx.insert(auditLog).values({
        organizationId: site.organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "website.subscription_cancellation_scheduled",
        entityType: "website_subscription",
        entityId: subscription.id,
        reason:
          "Club owner canceled website renewal; service remains active through the paid period.",
        traceId: `website-cancel:${site.id}:${subscription.id}`,
      });
    return {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      periodEndsAt: periodEndsAt?.toISOString() ?? null,
    };
  });
}
export function validateCreditAmount(credits: number) {
  if (
    !Number.isSafeInteger(credits) ||
    credits < 1 ||
    credits > WEBSITE_MONTHLY_CREDITS
  )
    throw new Error("Invalid website credit amount.");
}
type CreditInput = { actor: ApiActor; siteId: string; operationId: string };
export async function reserveWebsiteCredits(
  input: CreditInput & { credits: number },
) {
  validateCreditAmount(input.credits);
  const site = await ownedSite(input.actor, input.siteId);
  if (!input.operationId || input.operationId.length > 200)
    throw new Error("A valid operation ID is required.");
  return getTransactionalDatabase().transaction(async (tx) => {
    const [billing] = await tx
      .select()
      .from(websiteSubscriptions)
      .where(eq(websiteSubscriptions.siteId, site.id))
      .for("update");
    const [previous] = await tx
      .select()
      .from(websiteCreditReservations)
      .where(
        and(
          eq(websiteCreditReservations.siteId, site.id),
          eq(websiteCreditReservations.operationId, input.operationId),
        ),
      );
    if (previous) {
      if (previous.reserved !== input.credits)
        throw new Error("Operation already has a different estimate.");
      return previous;
    }
    if (
      billing?.status !== "active" ||
      !billing.periodEndsAt ||
      billing.periodEndsAt <= new Date()
    )
      throw new Error(
        "An active website subscription is required for AI edits.",
      );
    const [grant] = await tx
      .select()
      .from(websiteCreditGrants)
      .where(
        and(
          eq(websiteCreditGrants.siteId, site.id),
          gt(websiteCreditGrants.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(websiteCreditGrants.expiresAt))
      .for("update");
    if (!grant || grant.remaining < input.credits)
      throw new Error(
        "Not enough website AI credits. Your published website stays online.",
      );
    await tx
      .update(websiteCreditGrants)
      .set({ remaining: grant.remaining - input.credits })
      .where(eq(websiteCreditGrants.id, grant.id));
    const [reservation] = await tx
      .insert(websiteCreditReservations)
      .values({
        organizationId: site.organizationId,
        siteId: site.id,
        grantId: grant.id,
        operationId: input.operationId,
        reserved: input.credits,
      })
      .returning();
    return reservation!;
  });
}
export async function settleWebsiteCredits(
  input: CreditInput & { credits: number },
) {
  return finishCredits(input, input.credits);
}
export async function releaseWebsiteCredits(input: CreditInput) {
  return finishCredits(input, 0);
}
async function finishCredits(input: CreditInput, credits: number) {
  if (!Number.isSafeInteger(credits) || credits < 0)
    throw new Error("Invalid consumed credits.");
  const site = await ownedSite(input.actor, input.siteId);
  return getTransactionalDatabase().transaction(async (tx) => {
    await tx
      .select()
      .from(websiteSubscriptions)
      .where(eq(websiteSubscriptions.siteId, site.id))
      .for("update");
    const [reservation] = await tx
      .select()
      .from(websiteCreditReservations)
      .where(
        and(
          eq(websiteCreditReservations.siteId, site.id),
          eq(websiteCreditReservations.operationId, input.operationId),
        ),
      )
      .for("update");
    if (!reservation) throw new Error("Credit reservation was not found.");
    if (reservation.status !== "reserved") {
      if (reservation.consumed !== credits)
        throw new Error("Credit reservation is already finalized.");
      return reservation;
    }
    if (credits > reservation.reserved)
      throw new Error("Credit charge exceeds the approved estimate.");
    await tx
      .update(websiteCreditGrants)
      .set({
        remaining: sql`${websiteCreditGrants.remaining} + ${reservation.reserved - credits}`,
      })
      .where(eq(websiteCreditGrants.id, reservation.grantId));
    const [updated] = await tx
      .update(websiteCreditReservations)
      .set({
        consumed: credits,
        status: credits === 0 ? "released" : "settled",
        updatedAt: new Date(),
      })
      .where(eq(websiteCreditReservations.id, reservation.id))
      .returning();
    return updated!;
  });
}

/** Called only by the persisted signature-verified Stripe workflow. Fetch current state to tolerate reordered events. */
export async function processWebsiteStripeEvent(
  event: Stripe.Event,
): Promise<boolean> {
  const object = event.data.object;
  const metadata = event.type.startsWith("invoice.")
    ? (object as Stripe.Invoice).parent?.subscription_details?.metadata
    : (object as Stripe.Subscription | Stripe.Checkout.Session).metadata;
  if (metadata?.product !== "duna-website") return false;
  let subscriptionId: string | undefined;
  if (event.type.startsWith("customer.subscription."))
    subscriptionId = (object as Stripe.Subscription).id;
  else if (event.type.startsWith("invoice.")) {
    const invoice = object as Stripe.Invoice;
    const ref = invoice.parent?.subscription_details?.subscription;
    subscriptionId = typeof ref === "string" ? ref : ref?.id;
  } else if (event.type === "checkout.session.completed") {
    const ref = (object as Stripe.Checkout.Session).subscription;
    subscriptionId = typeof ref === "string" ? ref : ref?.id;
  }
  if (!subscriptionId) return false;
  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.metadata.product !== "duna-website") return false;
  const siteId = sub.metadata.dunaWebsiteId,
    organizationId = sub.metadata.dunaOrganizationId;
  if (!siteId || !organizationId)
    throw new Error("Website subscription metadata is incomplete.");
  const site = await getDatabase().query.websiteSites.findFirst({
    where: and(
      eq(websiteSites.id, siteId),
      eq(websiteSites.organizationId, organizationId),
    ),
  });
  if (!site) throw new Error("Website subscription tenant mismatch.");
  const item = sub.items.data.find(
    (i) =>
      i.price.id === process.env.STRIPE_WEBSITE_MONTHLY_PRICE_ID ||
      i.price.lookup_key === WEBSITE_PRICE_LOOKUP_KEY,
  );
  if (!item || sub.items.data.length !== 1 || item.quantity !== 1)
    throw new Error("Website subscription has unexpected pricing.");
  validateWebsitePrice(item.price);
  const periodEndsAt = new Date(item.current_period_end * 1000);
  await getDatabase()
    .insert(websiteSubscriptions)
    .values({ siteId, organizationId })
    .onConflictDoNothing();
  await getTransactionalDatabase().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(websiteSubscriptions)
      .where(eq(websiteSubscriptions.siteId, siteId))
      .for("update");
    // Refresh while holding the per-site lock so concurrent webhook jobs cannot
    // overwrite a newer state with a snapshot fetched before waiting for the lock.
    const latest = await stripe.subscriptions.retrieve(subscriptionId!);
    if (
      latest.metadata.dunaWebsiteId !== siteId ||
      latest.metadata.dunaOrganizationId !== organizationId
    )
      throw new Error("Website subscription tenant changed.");
    if (
      current?.stripeSubscriptionId &&
      current.stripeSubscriptionId !== sub.id &&
      !["canceled", "incomplete_expired"].includes(current.status)
    ) {
      // A delayed cancellation from a previous subscription cannot disable a replacement.
      if (["canceled", "incomplete_expired"].includes(latest.status)) return;
      throw new Error(
        "Duplicate website subscription requires reconciliation.",
      );
    }
    const latestItem = latest.items.data[0];
    if (
      !latestItem ||
      latest.items.data.length !== 1 ||
      latestItem.quantity !== 1 ||
      latestItem.price.id !== item.price.id
    )
      throw new Error(
        "Website subscription pricing changed during reconciliation.",
      );
    validateWebsitePrice(latestItem.price);
    await tx
      .update(websiteSubscriptions)
      .set({
        stripeCustomerId:
          typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        status: latest.status,
        periodEndsAt: latest.items.data[0]
          ? new Date(latest.items.data[0].current_period_end * 1000)
          : periodEndsAt,
        cancelAtPeriodEnd: latest.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(websiteSubscriptions.siteId, siteId));
    // Grant only from paid invoices, never a browser redirect or subscription status alone.
    if (
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.paid"
    ) {
      const invoice = await stripe.invoices.retrieve(
        (object as Stripe.Invoice).id,
      );
      if (invoice.status !== "paid")
        throw new Error("Website invoice is not paid.");
      if (
        invoice.billing_reason !== "subscription_create" &&
        invoice.billing_reason !== "subscription_cycle"
      )
        return;
      const line = invoice.lines.data.find(
        (l) => l.pricing?.price_details?.price === item.price.id,
      );
      if (!line) throw new Error("Website invoice line is missing.");
      const expiresAt = new Date(line.period.end * 1000);
      await tx
        .insert(websiteCreditGrants)
        .values({
          organizationId,
          siteId,
          sourceId: `${sub.id}:${line.period.start}`,
          credits: WEBSITE_MONTHLY_CREDITS,
          remaining: WEBSITE_MONTHLY_CREDITS,
          expiresAt,
        })
        .onConflictDoNothing();
    }
  });
  return true;
}
