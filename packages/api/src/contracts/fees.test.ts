import { feesDemo } from "@duna/core/demo/fees";
import {
  payFeeQuoteSurfaces,
  premiumEventKinds,
  premiumIntervals,
  premiumStatuses,
  premiumStores,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  feesPlatformSummarySchema,
  feesPremiumStateSchema,
  feesPremiumSubscriptionSchema,
  feesQuoteSchema,
} from "./fees";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("fees contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const quote of feesDemo.quotes) feesQuoteSchema.parse(quote);
    for (const subscription of feesDemo.subscriptions)
      feesPremiumSubscriptionSchema.parse(subscription);
    feesPremiumStateSchema.parse(feesDemo.premiumState);
    feesPlatformSummarySchema.parse(feesDemo.platformSummary);
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      payFeeQuoteSurfaces,
      feesDemo.quotes.map((q) => q.surface),
    );
    const subs = feesDemo.subscriptions;
    expectCoverage(
      premiumStatuses,
      subs.map((s) => s.status),
    );
    expectCoverage(
      premiumStores,
      subs.map((s) => s.store),
    );
    expectCoverage(
      premiumIntervals,
      subs.map((s) => s.billingInterval),
    );
    expectCoverage(
      premiumEventKinds,
      subs.flatMap((s) => s.events.map((e) => e.kind)),
    );
  });

  it("rejects a quote whose total hides a fee", () => {
    const [quote] = feesDemo.quotes;
    expect(() =>
      feesQuoteSchema.parse({ ...quote, total: quote!.subtotal }),
    ).toThrow();
  });
});

describe("player.fees and operator.fees (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const demo = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("serves fixtures in demo mode", async () => {
    const caller = demo();
    await expect(caller.player.fees.premium()).resolves.toMatchObject({
      active: true,
    });
    await expect(
      caller.player.fees.quote({
        organizationId: feesDemo.platformSummary.organizationId,
        catalogItemId: feesDemo.quotes[0]!.catalogItemId,
        surface: "web-checkout",
      }),
    ).resolves.toMatchObject({ surface: "web-checkout" });
    await expect(
      caller.player.fees.startPremium({
        planKey: "premium-demo-month",
        billingInterval: "month",
        store: "duna-pay",
        idempotencyKey: "demo-premium-0001",
      }),
    ).resolves.toEqual({ state: "not-configured" });
    await expect(
      caller.player.fees.cancelPremium({
        subscriptionId: feesDemo.premiumState.subscription.id,
        idempotencyKey: "demo-cancel-0001",
      }),
    ).resolves.toMatchObject({
      subscription: { status: "cancel-at-period-end" },
    });
    await expect(caller.operator.fees.platformSummary()).resolves.toMatchObject(
      { organizationFeeBps: 250 },
    );
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await demo()
      .player.fees.premium()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
