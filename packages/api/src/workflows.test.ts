import { describe, expect, it } from "vitest";
import {
  connectAccountMoneyReady,
  organizationVideoCapacityForSubscription,
  retryDelayMilliseconds,
  stripeSubscriptionItemPriceId,
} from "./workflows";

describe("durable workflow retry policy", () => {
  it("backs off exponentially and caps at fifteen minutes", () => {
    expect(retryDelayMilliseconds(1)).toBe(5_000);
    expect(retryDelayMilliseconds(2)).toBe(10_000);
    expect(retryDelayMilliseconds(3)).toBe(20_000);
    expect(retryDelayMilliseconds(20)).toBe(15 * 60_000);
  });

  it("rejects invalid attempt counters", () => {
    expect(() => retryDelayMilliseconds(0)).toThrow("positive integer");
    expect(() => retryDelayMilliseconds(1.5)).toThrow("positive integer");
  });
});

describe("connected-account money readiness", () => {
  it("supports legacy accounts that can accept connected charges", () => {
    expect(
      connectAccountMoneyReady({
        charges_enabled: true,
        payouts_enabled: true,
      }),
    ).toBe(true);
  });

  it("keeps transfer-only projections gated from settlement-merchant charges", () => {
    expect(
      connectAccountMoneyReady({
        charges_enabled: false,
        payouts_enabled: true,
        capabilities: { transfers: "active" },
      }),
    ).toBe(false);
  });

  it("supports native Accounts v2 recipient capability payloads", () => {
    expect(
      connectAccountMoneyReady({
        configuration: {
          merchant: {
            applied: true,
            capabilities: {
              card_payments: { status: "active" },
            },
          },
          recipient: {
            applied: true,
            capabilities: {
              stripe_balance: {
                payouts: { status: "active" },
                stripe_transfers: { status: "active" },
              },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("keeps incomplete recipient onboarding gated", () => {
    expect(
      connectAccountMoneyReady({
        charges_enabled: false,
        payouts_enabled: false,
        capabilities: { transfers: "pending" },
      }),
    ).toBe(false);
  });

  it("keeps restricted Accounts v2 recipient capabilities gated", () => {
    expect(
      connectAccountMoneyReady({
        configuration: {
          recipient: {
            applied: true,
            capabilities: {
              stripe_balance: {
                payouts: { status: "active" },
                stripe_transfers: { status: "restricted" },
              },
            },
          },
        },
      }),
    ).toBe(false);
  });
});

describe("Stripe subscription item mapping", () => {
  it("reads both expanded and unexpanded price references", () => {
    expect(stripeSubscriptionItemPriceId({ price: "price_membership" })).toBe(
      "price_membership",
    );
    expect(
      stripeSubscriptionItemPriceId({ price: { id: "price_service_fee" } }),
    ).toBe("price_service_fee");
  });

  it("activates paid video capacity only after the subscription is active", () => {
    expect(
      organizationVideoCapacityForSubscription({
        status: "incomplete",
        uploadPackQuantity: 2,
        livePackQuantity: 3,
        payAsYouGo: true,
      }),
    ).toEqual({
      uploadAddonSeconds: 0,
      liveAddonSeconds: 0,
      payAsYouGo: false,
    });
    expect(
      organizationVideoCapacityForSubscription({
        status: "active",
        uploadPackQuantity: 2,
        livePackQuantity: 3,
        payAsYouGo: true,
      }),
    ).toEqual({
      uploadAddonSeconds: 20 * 60 * 60,
      liveAddonSeconds: 6 * 60 * 60,
      payAsYouGo: true,
    });
  });
});
