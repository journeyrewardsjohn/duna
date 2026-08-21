import { describe, expect, it } from "vitest";
import {
  CLUB_ORGANIZATION_COMMISSION_BPS,
  FREE_ORGANIZATION_COMMISSION_BPS,
  ORGANIZATION_PLAN_IDS,
  ORGANIZATION_PLANS,
  ORGANIZATION_VIDEO_ADD_ONS,
  ORGANIZATION_VIDEO_RATES,
  freePlanVideoBonus,
  incrementalVideoOverageSeconds,
  netCollectedOrganizationFeeMinor,
  organizationPlan,
  organizationPlanPriceMinor,
} from "./organization-plans";

describe("Duna organization plans", () => {
  it("offers three plans at 5%, 2.5%, and 0% organization fees", () => {
    expect(ORGANIZATION_PLAN_IDS).toEqual(["coach", "small-club", "club"]);
    expect(ORGANIZATION_PLANS.coach.defaultCommissionBps).toBe(
      FREE_ORGANIZATION_COMMISSION_BPS,
    );
    expect(ORGANIZATION_PLANS["small-club"].defaultCommissionBps).toBe(
      CLUB_ORGANIZATION_COMMISSION_BPS,
    );
    expect(ORGANIZATION_PLANS.club.defaultCommissionBps).toBe(0);
  });

  it("keeps organization upload and live pools separate", () => {
    expect(ORGANIZATION_PLANS.coach.monthlyUploadSeconds).toBe(10 * 60 * 60);
    expect(ORGANIZATION_PLANS.coach.monthlyLiveSeconds).toBe(2 * 60 * 60);
    expect(ORGANIZATION_PLANS["small-club"].monthlyUploadSeconds).toBe(
      100 * 60 * 60,
    );
    expect(ORGANIZATION_PLANS["small-club"].monthlyLiveSeconds).toBe(
      10 * 60 * 60,
    );
    expect(ORGANIZATION_PLANS.club.monthlyUploadSeconds).toBe(500 * 60 * 60);
    expect(ORGANIZATION_PLANS.club.monthlyLiveSeconds).toBe(40 * 60 * 60);
  });

  it("grants 10 upload and 2 live hours per $40 in free-plan fees", () => {
    expect(freePlanVideoBonus(3_999)).toEqual({
      steps: 0,
      uploadSeconds: 0,
      liveSeconds: 0,
    });
    expect(freePlanVideoBonus(8_025)).toEqual({
      steps: 2,
      uploadSeconds: 20 * 60 * 60,
      liveSeconds: 4 * 60 * 60,
    });
  });

  it("only counts the net organization fee after refunds and disputes", () => {
    expect(
      netCollectedOrganizationFeeMinor({
        grossMinor: 10_000,
        organizationFeeMinor: 500,
        refundedMinor: 2_000,
        disputedMinor: 1_000,
      }),
    ).toBe(350);
    expect(
      netCollectedOrganizationFeeMinor({
        grossMinor: 10_000,
        organizationFeeMinor: 500,
        refundedMinor: 10_000,
        disputedMinor: 0,
      }),
    ).toBe(0);
  });

  it("prices video add-ons and pay as you go at five times modeled cost", () => {
    expect(ORGANIZATION_VIDEO_RATES.upload.customerPriceMinor).toBe(27);
    expect(ORGANIZATION_VIDEO_RATES.live.customerPriceMinor).toBe(1_028);
    expect(ORGANIZATION_VIDEO_ADD_ONS.upload.monthlyPriceMinor).toBe(270);
    expect(ORGANIZATION_VIDEO_ADD_ONS.live.monthlyPriceMinor).toBe(2_056);
  });

  it("meters only the part of a completed video beyond included hours", () => {
    expect(
      incrementalVideoOverageSeconds({
        usedSeconds: 11 * 60 * 60,
        includedSeconds: 10 * 60 * 60,
        completedSeconds: 2 * 60 * 60,
      }),
    ).toBe(60 * 60);
  });

  it("keeps two-month-free annual pricing and folds retired Network into Scale", () => {
    expect(organizationPlanPriceMinor("small-club", "year")).toBe(199_000);
    expect(organizationPlanPriceMinor("club", "year")).toBe(499_000);
    expect(organizationPlan("multi-venue").id).toBe("club");
    expect(organizationPlan("unknown").id).toBe("coach");
  });
});
