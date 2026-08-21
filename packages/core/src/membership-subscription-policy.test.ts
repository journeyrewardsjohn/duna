import { describe, expect, it } from "vitest";
import {
  membershipSubscriptionDisclosure,
  membershipSubscriptionPolicy,
  validateMembershipSubscriptionPolicy,
} from "./membership-subscription-policy";

describe("membership subscription policies", () => {
  it("uses a conservative recurring default", () => {
    expect(membershipSubscriptionPolicy({})).toMatchObject({
      renewalBehavior: "automatic",
      cancellationTiming: "period-end",
      refundBehavior: "none",
      trialDays: 0,
      trialPaymentMethod: "required",
    });
  });

  it("normalizes configured terms and refund windows", () => {
    expect(
      membershipSubscriptionPolicy({
        membership: {
          subscriptionPolicy: {
            initialTermMonths: 6,
            renewalBehavior: "ends-after-term",
            cancellationTiming: "immediate",
            refundBehavior: "full-within-window",
            refundWindowDays: 14,
            trialDays: 21,
            trialPaymentMethod: "optional",
          },
        },
      }),
    ).toMatchObject({
      initialTermMonths: 6,
      renewalBehavior: "ends-after-term",
      cancellationTiming: "immediate",
      refundBehavior: "full-within-window",
      refundWindowDays: 14,
      trialDays: 21,
      trialPaymentMethod: "optional",
    });
  });

  it("rejects terms that split a billing period", () => {
    expect(() =>
      validateMembershipSubscriptionPolicy({
        policy: membershipSubscriptionPolicy({
          membership: { subscriptionPolicy: { initialTermMonths: 6 } },
        }),
        billingInterval: "year",
      }),
    ).toThrow("whole number of year billing periods");
  });

  it("does not promise a refund while keeping access through period end", () => {
    expect(() =>
      validateMembershipSubscriptionPolicy({
        policy: membershipSubscriptionPolicy({
          membership: {
            subscriptionPolicy: {
              cancellationTiming: "period-end",
              refundBehavior: "full-within-window",
            },
          },
        }),
        billingInterval: "month",
      }),
    ).toThrow("refunds require cancellation to take effect immediately");
  });

  it("builds a retainable plain-language disclosure", () => {
    const disclosure = membershipSubscriptionDisclosure({
      organizationName: "Beach Elite",
      priceLabel: "$89.00",
      billingInterval: "month",
      policy: membershipSubscriptionPolicy({
        membership: {
          subscriptionPolicy: { trialDays: 7, refundBehavior: "none" },
        },
      }),
    });
    expect(disclosure).toContain("7-day free trial");
    expect(disclosure).toContain("automatically charge $89.00 every month");
    expect(disclosure).toContain("Online cancellation");
  });
});
