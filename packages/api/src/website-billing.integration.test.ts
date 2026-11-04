import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@duna/db/schema";
import type Stripe from "stripe";
import type { ApiActor } from "./context";
const state = vi.hoisted(() => ({
  db: null as unknown,
  subscription: vi.fn(),
  updateSubscription: vi.fn(),
  invoice: vi.fn(),
}));
vi.mock("./payments", () => ({
  getStripeClient: () => ({
    subscriptions: {
      retrieve: state.subscription,
      update: state.updateSubscription,
    },
    invoices: { retrieve: state.invoice },
  }),
  createBillingPortalSession: vi.fn(),
}));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));
import {
  cancelWebsiteSubscription,
  reserveWebsiteCredits,
  settleWebsiteCredits,
  releaseWebsiteCredits,
  getWebsiteBilling,
  processWebsiteStripeEvent,
} from "./website-billing";
const pg = new PGlite();
const db = drizzle(pg, { schema });
state.db = db;
const org = "10000000-0000-4000-8000-000000000001",
  siteId = "10000000-0000-4000-8000-000000000002";
const actor: ApiActor = {
  personId: org,
  displayName: "Owner",
  roles: ["owner"],
  organizationId: org,
  scopes: ["*"],
  ageBand: "adult",
  isDemo: false,
};
const input = { actor, siteId, operationId: "edit-1" };
beforeAll(async () => {
  await pg.exec(
    readFileSync(
      new URL("../../db/drizzle/0109_adorable_gideon.sql", import.meta.url),
      "utf8",
    ),
  );
});
beforeAll(async () => {
  await pg.exec(
    readFileSync(
      new URL(
        "../../db/drizzle/0113_married_victor_mancha.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
afterAll(async () => {
  await pg.close();
});
beforeAll(async () => {
  await pg.exec(
    `CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,organization_id uuid,actor_person_id uuid,actor_type varchar(24) NOT NULL,action varchar(96) NOT NULL,entity_type varchar(48) NOT NULL,entity_id text NOT NULL,reason text NOT NULL,before_hash varchar(128),after_hash varchar(128),trace_id varchar(128),conversation_id varchar(128),ip_address varchar(64),created_at timestamptz DEFAULT now());`,
  );
});
beforeEach(async () => {
  vi.clearAllMocks();
  await pg.exec(
    "TRUNCATE website_credit_reservations, website_credit_grants, website_subscriptions, website_revisions, club_websites, audit_log CASCADE",
  );
  await db
    .insert(schema.websiteSites)
    .values({ id: siteId, organizationId: org, name: "Club" });
  await db.insert(schema.websiteSubscriptions).values({
    siteId,
    organizationId: org,
    status: "active",
    periodEndsAt: new Date(Date.now() + 86400000),
  });
  await db.insert(schema.websiteCreditGrants).values({
    siteId,
    organizationId: org,
    sourceId: "paid-cycle",
    credits: 1000,
    remaining: 1000,
    expiresAt: new Date(Date.now() + 86400000),
  });
});
describe("website credit accounting on PostgreSQL", () => {
  it("reserves once across retries, settles actual cost, and refunds the unused estimate", async () => {
    const first = await reserveWebsiteCredits({ ...input, credits: 100 });
    expect((await reserveWebsiteCredits({ ...input, credits: 100 })).id).toBe(
      first.id,
    );
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(900);
    await settleWebsiteCredits({ ...input, credits: 60 });
    await settleWebsiteCredits({ ...input, credits: 60 });
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(940);
    await expect(releaseWebsiteCredits(input)).rejects.toThrow(
      "already finalized",
    );
  });
  it("serializes concurrent operations without allowing overspend", async () => {
    const results = await Promise.allSettled([
      reserveWebsiteCredits({ ...input, credits: 700 }),
      reserveWebsiteCredits({ ...input, operationId: "edit-2", credits: 700 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(300);
  });
  it("releases failed work once and refuses charges above the approved estimate", async () => {
    await reserveWebsiteCredits({ ...input, credits: 100 });
    await expect(
      settleWebsiteCredits({ ...input, credits: 101 }),
    ).rejects.toThrow("approved estimate");
    await releaseWebsiteCredits(input);
    await releaseWebsiteCredits(input);
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(
      1000,
    );
  });
  it("rejects cross-tenant actors before touching credits", async () => {
    await expect(
      reserveWebsiteCredits({
        ...input,
        actor: {
          ...actor,
          organizationId: "10000000-0000-4000-8000-000000000003",
        },
        credits: 1,
      }),
    ).rejects.toThrow("not found");
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(
      1000,
    );
  });
  it("does not spend expired grants or inactive subscriptions", async () => {
    await pg.exec(
      "UPDATE website_credit_grants SET expires_at = now() - interval '1 day'",
    );
    await expect(
      reserveWebsiteCredits({ ...input, credits: 1 }),
    ).rejects.toThrow("Not enough");
    await pg.exec("UPDATE website_subscriptions SET status='past_due'");
    await expect(
      reserveWebsiteCredits({ ...input, credits: 1 }),
    ).rejects.toThrow("active website subscription");
  });
});

describe("website Stripe reconciliation", () => {
  const metadata = {
    product: "duna-website",
    dunaWebsiteId: siteId,
    dunaOrganizationId: org,
  };
  const periodStart = Math.floor(Date.now() / 1000),
    periodEnd = periodStart + 86400;
  const price = {
    id: "price_site",
    active: true,
    currency: "usd",
    unit_amount: 20000,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  };
  const subscription = {
    id: "sub_site",
    metadata,
    customer: "cus_site",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ price, quantity: 1, current_period_end: periodEnd }] },
  };
  const invoice = {
    id: "in_paid",
    status: "paid",
    billing_reason: "subscription_cycle",
    parent: { subscription_details: { metadata, subscription: "sub_site" } },
    lines: {
      data: [
        {
          period: { start: periodStart, end: periodEnd },
          pricing: { price_details: { price: "price_site" } },
        },
      ],
    },
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBSITE_MONTHLY_PRICE_ID", "price_site");
    state.subscription.mockReset().mockResolvedValue(subscription);
    state.invoice.mockReset().mockResolvedValue(invoice);
    await pg.exec("DELETE FROM website_credit_grants");
  });
  it("grants a paid cycle once even for distinct webhook deliveries", async () => {
    const event = {
      id: "evt_1",
      type: "invoice.payment_succeeded",
      data: { object: invoice },
    } as unknown as Stripe.Event;
    expect(await processWebsiteStripeEvent(event)).toBe(true);
    await processWebsiteStripeEvent({ ...event, id: "evt_2" });
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(
      1000,
    );
  });
  it("never grants credits from checkout redirect or subscription status", async () => {
    await processWebsiteStripeEvent({
      type: "checkout.session.completed",
      data: { object: { metadata, subscription: "sub_site" } },
    } as unknown as Stripe.Event);
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(0);
  });
  it("uses current Stripe state instead of stale event status", async () => {
    state.subscription.mockResolvedValue({
      ...subscription,
      status: "past_due",
    });
    await processWebsiteStripeEvent({
      type: "customer.subscription.updated",
      data: { object: subscription },
    } as unknown as Stripe.Event);
    expect((await getWebsiteBilling(actor, siteId)).active).toBe(false);
  });
  it("rejects unpaid invoice events and foreign metadata", async () => {
    state.invoice.mockResolvedValue({ ...invoice, status: "open" });
    await expect(
      processWebsiteStripeEvent({
        type: "invoice.payment_succeeded",
        data: { object: invoice },
      } as unknown as Stripe.Event),
    ).rejects.toThrow("not paid");
    state.subscription.mockResolvedValue({
      ...subscription,
      metadata: {
        ...metadata,
        dunaOrganizationId: "10000000-0000-4000-8000-000000000003",
      },
    });
    await expect(
      processWebsiteStripeEvent({
        type: "customer.subscription.updated",
        data: { object: subscription },
      } as unknown as Stripe.Event),
    ).rejects.toThrow("tenant mismatch");
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(0);
  });
  it("leaves HQ and player subscriptions in their original workflows", async () => {
    expect(
      await processWebsiteStripeEvent({
        type: "customer.subscription.updated",
        data: { object: { ...subscription, metadata: { product: "duna-hq" } } },
      } as unknown as Stripe.Event),
    ).toBe(false);
    expect(state.subscription).not.toHaveBeenCalled();
  });
});

describe("owner website cancellation", () => {
  async function setup() {
    await pg.exec(
      "UPDATE website_subscriptions SET stripe_subscription_id='sub_site', stripe_customer_id='cus_site'",
    );
    const sub = {
      id: "sub_site",
      customer: "cus_site",
      status: "active",
      cancel_at_period_end: false,
      metadata: {
        product: "duna-website",
        dunaWebsiteId: siteId,
        dunaOrganizationId: org,
      },
      items: {
        data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 }],
      },
    };
    state.subscription.mockImplementation(async () => sub);
    state.updateSubscription.mockImplementation(async () => {
      sub.cancel_at_period_end = true;
      return sub;
    });
    return sub;
  }
  it("schedules cancellation once and preserves paid access and credits", async () => {
    await setup();
    const result = await Promise.all([
      cancelWebsiteSubscription({ actor, siteId }),
      cancelWebsiteSubscription({ actor, siteId }),
    ]);
    expect(result.every((r) => r.cancelAtPeriodEnd)).toBe(true);
    expect(state.updateSubscription).toHaveBeenCalledTimes(1);
    expect(state.updateSubscription).toHaveBeenCalledWith(
      "sub_site",
      { cancel_at_period_end: true },
      { idempotencyKey: `website-cancel:${siteId}:sub_site` },
    );
    expect((await getWebsiteBilling(actor, siteId)).active).toBe(true);
    expect((await getWebsiteBilling(actor, siteId)).creditsAvailable).toBe(
      1000,
    );
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });
  it("rejects managers and cross-club sites before provider access", async () => {
    await setup();
    await expect(
      cancelWebsiteSubscription({
        actor: { ...actor, roles: ["manager"] },
        siteId,
      }),
    ).rejects.toThrow("owner");
    await expect(
      cancelWebsiteSubscription({
        actor: {
          ...actor,
          organizationId: "10000000-0000-4000-8000-000000000099",
        },
        siteId,
      }),
    ).rejects.toThrow("not found");
    expect(state.subscription).not.toHaveBeenCalled();
    expect(state.updateSubscription).not.toHaveBeenCalled();
  });
  it.each(["customer", "site", "organization", "product"])(
    "rejects provider %s ownership mismatch",
    async (field) => {
      const sub = await setup();
      if (field === "customer") sub.customer = "cus_other";
      if (field === "site") sub.metadata.dunaWebsiteId = "other";
      if (field === "organization") sub.metadata.dunaOrganizationId = "other";
      if (field === "product") sub.metadata.product = "membership";
      await expect(
        cancelWebsiteSubscription({ actor, siteId }),
      ).rejects.toThrow("ownership");
      expect(state.updateSubscription).not.toHaveBeenCalled();
      expect((await getWebsiteBilling(actor, siteId)).cancelAtPeriodEnd).toBe(
        false,
      );
    },
  );
  it("recovers a provider-confirmed cancellation after an interrupted response", async () => {
    const sub = await setup();
    state.updateSubscription.mockImplementationOnce(async () => {
      sub.cancel_at_period_end = true;
      throw new Error("connection lost");
    });
    await expect(cancelWebsiteSubscription({ actor, siteId })).rejects.toThrow(
      "connection lost",
    );
    expect((await getWebsiteBilling(actor, siteId)).cancelAtPeriodEnd).toBe(
      false,
    );
    expect(
      (await cancelWebsiteSubscription({ actor, siteId })).cancelAtPeriodEnd,
    ).toBe(true);
    expect(state.updateSubscription).toHaveBeenCalledTimes(1);
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });
});
