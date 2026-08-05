import { describe, expect, it } from "vitest";
import {
  FREE_ORGANIZATION_COMMISSION_BPS,
  ORGANIZATION_PLANS,
  organizationPlan,
  organizationPlanPriceMinor,
} from "./organization-plans";

describe("Duna organization plans", () => {
  it("charges the free organization plan 5% and paid plans 0%", () => {
    expect(ORGANIZATION_PLANS.coach.defaultCommissionBps).toBe(
      FREE_ORGANIZATION_COMMISSION_BPS,
    );
    expect(ORGANIZATION_PLANS["small-club"].defaultCommissionBps).toBe(0);
    expect(ORGANIZATION_PLANS.club.defaultCommissionBps).toBe(0);
    expect(ORGANIZATION_PLANS["multi-venue"].defaultCommissionBps).toBe(0);
  });

  it("keeps organization upload and live pools separate", () => {
    expect(ORGANIZATION_PLANS.coach.monthlyUploadSeconds).toBe(4 * 60 * 60);
    expect(ORGANIZATION_PLANS.coach.monthlyLiveSeconds).toBe(2 * 60 * 60);
    expect(ORGANIZATION_PLANS["small-club"].monthlyUploadSeconds).toBe(
      100 * 60 * 60,
    );
    expect(ORGANIZATION_PLANS["small-club"].monthlyLiveSeconds).toBe(
      10 * 60 * 60,
    );
  });

  it("uses two-month-free annual pricing and a safe fallback", () => {
    expect(organizationPlanPriceMinor("small-club", "year")).toBe(199_000);
    expect(organizationPlanPriceMinor("club", "year")).toBe(499_000);
    expect(organizationPlanPriceMinor("multi-venue", "year")).toBe(999_000);
    expect(organizationPlan("unknown").id).toBe("coach");
  });
});
