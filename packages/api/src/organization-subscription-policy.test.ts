import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  couponsCreate: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  subscriptionsUpdate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    coupons = { create: stripeMocks.couponsCreate };
    subscriptions = {
      retrieve: stripeMocks.subscriptionsRetrieve,
      update: stripeMocks.subscriptionsUpdate,
    };
  },
}));

import {
  organizationDiscountCouponParams,
  organizationSubscriptionDiscountUpdateParams,
  updateOrganizationPlanSubscription,
} from "./payments";

describe("organization Stripe subscription policy", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_duna";
    process.env.STRIPE_HQ_CLUB_MONTHLY_PRICE_ID = "price_club_month";
    process.env.STRIPE_HQ_CLUB_ANNUAL_PRICE_ID = "price_club_year";
    process.env.STRIPE_HQ_FACILITY_MONTHLY_PRICE_ID = "price_scale_month";
    process.env.STRIPE_HQ_FACILITY_ANNUAL_PRICE_ID = "price_scale_year";
    stripeMocks.couponsCreate.mockReset();
    stripeMocks.subscriptionsRetrieve.mockReset();
    stripeMocks.subscriptionsUpdate.mockReset();
  });

  it("builds a fully comped first-X-month coupon", () => {
    expect(
      organizationDiscountCouponParams({
        organizationId: "10000000-0000-4000-8000-000000000001",
        organizationName: "Beach Elite Volleyball",
        plan: "small-club",
        discount: {
          mode: "apply",
          percentBps: 10_000,
          duration: "repeating",
          months: 4,
        },
      }),
    ).toMatchObject({
      percent_off: 100,
      duration: "repeating",
      duration_in_months: 4,
      max_redemptions: 1,
      metadata: {
        dunaPlan: "small-club",
        dunaCreatedBy: "super-admin",
      },
    });
  });

  it("distinguishes preserving, replacing, and clearing Stripe discounts", () => {
    expect(
      organizationSubscriptionDiscountUpdateParams({ mode: "preserve" }),
    ).toEqual({});
    expect(
      organizationSubscriptionDiscountUpdateParams({ mode: "clear" }),
    ).toEqual({ discounts: "" });
    expect(
      organizationSubscriptionDiscountUpdateParams(
        {
          mode: "apply",
          percentBps: 2500,
          duration: "forever",
        },
        "coupon_25_forever",
      ),
    ).toEqual({ discounts: [{ coupon: "coupon_25_forever" }] });
  });

  it("fails closed when applying a discount without a created coupon", () => {
    expect(() =>
      organizationSubscriptionDiscountUpdateParams({
        mode: "apply",
        percentBps: 5000,
        duration: "once",
      }),
    ).toThrow("A Stripe coupon is required");
  });

  it("changes only the mapped plan item and applies the created coupon", async () => {
    stripeMocks.subscriptionsRetrieve.mockResolvedValue({
      status: "active",
      metadata: { existing: "value" },
      items: {
        data: [
          { id: "si_plan", price: { id: "price_club_month" } },
          { id: "si_upload_pack", price: { id: "price_upload_pack" } },
        ],
      },
    });
    stripeMocks.couponsCreate.mockResolvedValue({ id: "coupon_half_3_months" });
    stripeMocks.subscriptionsUpdate.mockResolvedValue({ id: "sub_123" });

    await updateOrganizationPlanSubscription({
      organizationId: "10000000-0000-4000-8000-000000000001",
      organizationName: "Beach Elite Volleyball",
      subscriptionId: "sub_123",
      plan: "club",
      discount: {
        mode: "apply",
        percentBps: 5_000,
        duration: "repeating",
        months: 3,
      },
      changedAt: new Date("2026-08-27T12:00:00.000Z"),
      idempotencyKey: "admin-change-123",
    });

    expect(stripeMocks.couponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        percent_off: 50,
        duration: "repeating",
        duration_in_months: 3,
      }),
      { idempotencyKey: "admin-change-123:coupon" },
    );
    expect(stripeMocks.subscriptionsUpdate).toHaveBeenCalledWith(
      "sub_123",
      expect.objectContaining({
        items: [{ id: "si_plan", price: "price_scale_month", quantity: 1 }],
        discounts: [{ coupon: "coupon_half_3_months" }],
        proration_behavior: "none",
        payment_behavior: "error_if_incomplete",
        metadata: expect.objectContaining({
          existing: "value",
          dunaPlan: "club",
        }),
      }),
      { idempotencyKey: "admin-change-123:subscription" },
    );
  });

  it("rejects a first-X-month coupon on annual prepay before creating it", async () => {
    stripeMocks.subscriptionsRetrieve.mockResolvedValue({
      status: "active",
      metadata: {},
      items: {
        data: [{ id: "si_plan", price: { id: "price_club_year" } }],
      },
    });

    await expect(
      updateOrganizationPlanSubscription({
        organizationId: "10000000-0000-4000-8000-000000000001",
        organizationName: "Beach Elite Volleyball",
        subscriptionId: "sub_annual",
        plan: "club",
        discount: {
          mode: "apply",
          percentBps: 10_000,
          duration: "repeating",
          months: 3,
        },
        changedAt: new Date("2026-08-27T12:00:00.000Z"),
        idempotencyKey: "admin-change-annual",
      }),
    ).rejects.toThrow("only supported for monthly Stripe subscriptions");
    expect(stripeMocks.couponsCreate).not.toHaveBeenCalled();
    expect(stripeMocks.subscriptionsUpdate).not.toHaveBeenCalled();
  });
});
