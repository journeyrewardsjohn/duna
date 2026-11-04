import { describe, expect, it } from "vitest";
import {
  assertWebsiteActor,
  validateCreditAmount,
  validateWebsitePrice,
  WEBSITE_MONTHLY_CREDITS,
} from "./website-billing";
import type { ApiActor } from "./context";
const actor: ApiActor = {
  personId: "person",
  displayName: "Owner",
  roles: ["owner"],
  organizationId: "club",
  scopes: ["*"],
  ageBand: "adult",
  isDemo: false,
};
describe("website billing boundaries", () => {
  it("rejects demo, unscoped and player actors", () => {
    for (const a of [
      { ...actor, isDemo: true },
      { ...actor, organizationId: undefined },
      { ...actor, roles: ["player"] as const },
    ])
      expect(() => assertWebsiteActor(a)).toThrow();
  });
  it("allows managers to edit but only owners to purchase", () => {
    expect(assertWebsiteActor({ ...actor, roles: ["manager"] })).toBe("club");
    expect(() =>
      assertWebsiteActor({ ...actor, roles: ["manager"] }, true),
    ).toThrow();
    expect(assertWebsiteActor(actor, true)).toBe("club");
  });
  it("rejects negative, fractional, infinite or over-budget reservations", () => {
    for (const value of [0, -1, 1.5, NaN, Infinity, 1001])
      expect(() => validateCreditAmount(value)).toThrow();
    expect(() => validateCreditAmount(WEBSITE_MONTHLY_CREDITS)).not.toThrow();
  });
  it("checks amount, currency, monthly cadence, and licensed usage", () => {
    const price = {
      active: true,
      currency: "usd",
      unit_amount: 20000,
      recurring: {
        interval: "month" as const,
        interval_count: 1,
        usage_type: "licensed" as const,
        meter: null,
        trial_period_days: null,
      },
    };
    expect(() => validateWebsitePrice(price)).not.toThrow();
    for (const patch of [
      { active: false },
      { currency: "eur" },
      { unit_amount: 2000 },
      { recurring: { ...price.recurring, interval_count: 12 } },
    ])
      expect(() => validateWebsitePrice({ ...price, ...patch })).toThrow();
  });
});
