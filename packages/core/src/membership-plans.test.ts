import { describe, expect, it } from "vitest";
import {
  DUNA_SERVICE_FEE_BPS,
  MEMBERSHIP_PLANS,
  membershipPlanForTierCode,
  membershipPriceMinor,
  membershipTierCode,
} from "./membership-plans";

describe("Duna membership plans", () => {
  it("keeps uploaded and live-video allowances separate", () => {
    expect(MEMBERSHIP_PLANS.free).toMatchObject({
      monthlyUploadSeconds: 4 * 60 * 60,
      monthlyLiveSeconds: 0,
    });
    expect(MEMBERSHIP_PLANS.premium).toMatchObject({
      monthlyUploadSeconds: 8 * 60 * 60,
      monthlyLiveSeconds: 2 * 60 * 60,
    });
    expect(MEMBERSHIP_PLANS["premium-plus"]).toMatchObject({
      monthlyUploadSeconds: 30 * 60 * 60,
      monthlyLiveSeconds: 8 * 60 * 60,
    });
  });

  it("uses coherent monthly and two-month-free annual pricing", () => {
    expect(membershipPriceMinor("premium", "month")).toBe(999);
    expect(membershipPriceMinor("premium", "year")).toBe(9_900);
    expect(membershipPriceMinor("premium-plus", "month")).toBe(2_999);
    expect(membershipPriceMinor("premium-plus", "year")).toBe(29_900);
  });

  it("maps legacy Duna+ subscriptions to Premium", () => {
    expect(membershipPlanForTierCode("duna-plus-annual")).toBe("premium");
    expect(membershipPlanForTierCode("duna-premium-plus-monthly")).toBe(
      "premium-plus",
    );
    expect(membershipPlanForTierCode(undefined)).toBe("free");
    expect(membershipTierCode("premium-plus", "year")).toBe(
      "duna-premium-plus-annual",
    );
  });

  it("sets one midpoint service-fee rate inside the proposed range", () => {
    expect(DUNA_SERVICE_FEE_BPS).toBe(750);
  });
});
