import { afterEach, describe, expect, it, vi } from "vitest";
import { membershipPlanOffers } from "./membership";
import { membershipPriceId } from "./payments";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Premium plan offers", () => {
  it("exposes both billing intervals with separate upload and live limits", () => {
    vi.stubEnv("STRIPE_DUNA_PREMIUM_MONTHLY_PRICE_ID", "price_premium_month");
    vi.stubEnv("STRIPE_DUNA_PREMIUM_ANNUAL_PRICE_ID", "price_premium_year");
    vi.stubEnv(
      "STRIPE_DUNA_PREMIUM_PLUS_MONTHLY_PRICE_ID",
      "price_premium_plus_month",
    );
    vi.stubEnv(
      "STRIPE_DUNA_PREMIUM_PLUS_ANNUAL_PRICE_ID",
      "price_premium_plus_year",
    );

    const offers = membershipPlanOffers();

    expect(offers).toHaveLength(4);
    expect(
      offers.find(
        (offer) => offer.plan === "premium" && offer.interval === "month",
      ),
    ).toMatchObject({
      priceMinor: 999,
      configured: true,
      monthlyUploadSeconds: 8 * 60 * 60,
      monthlyLiveSeconds: 2 * 60 * 60,
    });
    expect(
      offers.find(
        (offer) => offer.plan === "premium-plus" && offer.interval === "year",
      ),
    ).toMatchObject({
      priceMinor: 29_900,
      configured: true,
      monthlyUploadSeconds: 30 * 60 * 60,
      monthlyLiveSeconds: 8 * 60 * 60,
    });
  });

  it("accepts legacy Duna+ price IDs as Premium aliases", () => {
    vi.stubEnv("STRIPE_DUNA_PLUS_MONTHLY_PRICE_ID", "price_legacy_month");
    vi.stubEnv("STRIPE_DUNA_PLUS_ANNUAL_PRICE_ID", "price_legacy_year");

    expect(membershipPriceId("premium", "month")).toBe("price_legacy_month");
    expect(membershipPriceId("premium", "year")).toBe("price_legacy_year");
    expect(membershipPriceId("premium-plus", "month")).toBeUndefined();
  });
});
