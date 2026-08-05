import { describe, expect, it } from "vitest";
import {
  effectiveOrganizationPlan,
  resolveOrganizationCommissionPolicy,
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
});
