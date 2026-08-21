import { describe, expect, it } from "vitest";
import {
  annualPrepayPriceMinor,
  annualPrepaySavingsPercent,
  membershipEntitlementMultiplier,
} from "./membership-prepay";

describe("membership prepay", () => {
  it("grants every monthly unit at the start of an annual period", () => {
    expect(membershipEntitlementMultiplier("year", 1)).toBe(12);
    expect(50 * membershipEntitlementMultiplier("year", 1)).toBe(600);
  });

  it("preserves monthly and multi-month billing periods", () => {
    expect(membershipEntitlementMultiplier("month", 1)).toBe(1);
    expect(membershipEntitlementMultiplier("month", 3)).toBe(3);
  });

  it("calculates the annual price and customer-facing savings", () => {
    expect(annualPrepayPriceMinor(10_000, 20)).toBe(96_000);
    expect(annualPrepaySavingsPercent(10_000, 96_000)).toBe(20);
  });
});
