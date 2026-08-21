import { describe, expect, it } from "vitest";
import { normalizePromoCode, promoDiscountMinor } from "./promo-codes";

describe("promo codes", () => {
  it("normalizes customer-entered codes", () => {
    expect(normalizePromoCode("  summer camp  ")).toBe("SUMMER-CAMP");
  });

  it("calculates percent discounts in basis points", () => {
    expect(
      promoDiscountMinor({
        discountType: "percent",
        discountValue: 2_000,
        eligibleSubtotalMinor: 10_000,
      }),
    ).toBe(2_000);
  });

  it("caps percent discounts and never discounts past the subtotal", () => {
    expect(
      promoDiscountMinor({
        discountType: "percent",
        discountValue: 5_000,
        eligibleSubtotalMinor: 10_000,
        maximumDiscountMinor: 2_500,
      }),
    ).toBe(2_500);
    expect(
      promoDiscountMinor({
        discountType: "amount",
        discountValue: 20_000,
        eligibleSubtotalMinor: 10_000,
      }),
    ).toBe(10_000);
  });
});
