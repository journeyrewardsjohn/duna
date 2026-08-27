import { describe, expect, it } from "vitest";
import {
  effectiveOrganizationPlan,
  resolveOrganizationCommissionPolicy,
  resolveOrganizationPlanPolicy,
} from "./organization-billing";
import { organizations } from "@duna/db";

function organizationRow(
  input: Partial<typeof organizations.$inferSelect> = {},
): typeof organizations.$inferSelect {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    plan: "coach",
    operatorCommissionBpsOverride: null,
    stripeSubscriptionStatus: null,
    stripeFeeMetadataStatus: "not-connected",
    stripeFeeMetadataSyncedAt: null,
    stripeFeeMetadataError: null,
    ...input,
  } as typeof organizations.$inferSelect;
}

describe("organization commercial policy", () => {
  it("keeps an unpaid selected plan on Free economics", () => {
    expect(
      effectiveOrganizationPlan({
        plan: "club",
        stripeSubscriptionStatus: "incomplete",
      }),
    ).toBe("coach");
    expect(
      resolveOrganizationCommissionPolicy(
        organizationRow({ plan: "club", stripeSubscriptionStatus: "past_due" }),
      ).rateBps,
    ).toBe(500);
  });

  it("removes the organization commission for active paid plans", () => {
    expect(
      resolveOrganizationCommissionPolicy(
        organizationRow({ plan: "club", stripeSubscriptionStatus: "active" }),
      ),
    ).toMatchObject({
      effectivePlan: "club",
      defaultRateBps: 0,
      rateBps: 0,
      source: "plan-default",
    });
  });

  it("lets an audited admin override win without changing the plan", () => {
    expect(
      resolveOrganizationCommissionPolicy(
        organizationRow({
          plan: "club",
          stripeSubscriptionStatus: "active",
          operatorCommissionBpsOverride: 275,
        }),
      ),
    ).toMatchObject({
      effectivePlan: "club",
      overrideRateBps: 275,
      rateBps: 275,
      source: "admin-override",
    });
  });

  it("lets an explicit Super Admin plan assignment override billing state", () => {
    const organization = organizationRow({
      plan: "coach",
      adminPlanOverride: "club",
      stripeSubscriptionStatus: "past_due",
    });
    expect(effectiveOrganizationPlan(organization)).toBe("club");
    expect(resolveOrganizationPlanPolicy(organization)).toMatchObject({
      configuredPlan: "coach",
      adminPlanOverride: "club",
      effectivePlan: "club",
      source: "admin-assigned",
      subscriptionStatus: "past_due",
    });
    expect(resolveOrganizationCommissionPolicy(organization).rateBps).toBe(0);
  });

  it("surfaces the last Stripe subscription discount without mixing it into the organization fee", () => {
    const organization = organizationRow({
      plan: "small-club",
      stripeSubscriptionId: "sub_test",
      stripeSubscriptionStatus: "active",
      stripeSubscriptionDiscountBps: 10_000,
      stripeSubscriptionDiscountDuration: "repeating",
      stripeSubscriptionDiscountMonths: 3,
      stripeSubscriptionDiscountCouponId: "coupon_test",
      stripeBillingPolicySyncedAt: new Date("2026-08-27T12:00:00.000Z"),
    });
    expect(resolveOrganizationPlanPolicy(organization)).toMatchObject({
      effectivePlan: "small-club",
      discount: {
        percentBps: 10_000,
        duration: "repeating",
        months: 3,
        couponId: "coupon_test",
      },
      stripeSyncStatus: "synced",
    });
    expect(resolveOrganizationCommissionPolicy(organization)).toMatchObject({
      rateBps: 250,
      source: "plan-default",
    });
  });
});
