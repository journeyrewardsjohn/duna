import { describe, expect, it } from "vitest";
import {
  operatorPaymentStartSchema,
  operatorPaymentWorkspaceSchema,
} from "./contracts";

const collection = {
  id: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  payerPersonId: "33333333-3333-4333-8333-333333333333",
  payerName: "Maya Chen",
  referenceType: "session" as const,
  referenceId: "44444444-4444-4444-8444-444444444444",
  referenceLabel: "Wednesday private lesson",
  tender: "card-present" as const,
  amountMinor: 10_000,
  currency: "USD" as const,
  applicationFeeMinor: 795,
  processingFeeMinor: 295,
  commissionMinor: 500,
  creditsApplied: 0,
  walletCashAppliedMinor: 0,
  netMinor: 9_205,
  stripePaymentIntentId: "pi_terminal",
  status: "awaiting-reader" as const,
  createdAt: "2026-08-05T15:00:00.000Z",
};

describe("operator in-person payment contracts", () => {
  it("keeps reader setup, wallet eligibility, earnings, and attempts together", () => {
    const parsed = operatorPaymentWorkspaceSchema.parse({
      currency: "USD",
      terminal: {
        ready: true,
        stripeConfigured: true,
        connectedAccountReady: true,
        organizationAddressReady: true,
        locationId: "tml_123",
        merchantDisplayName: "Beach Elite",
      },
      earnings: {
        todayGrossMinor: 10_000,
        todayNetMinor: 9_205,
        periodGrossMinor: 50_000,
        periodNetMinor: 46_000,
        goal: {
          id: "55555555-5555-4555-8555-555555555555",
          targetMinor: 100_000,
          period: "month",
          periodStartsAt: "2026-08-01T00:00:00.000Z",
          periodEndsAt: "2026-09-01T00:00:00.000Z",
          progressMinor: 46_000,
          progressBps: 4_600,
        },
      },
      people: [
        {
          personId: collection.payerPersonId,
          displayName: collection.payerName,
          isMinor: false,
          creditBalance: 4,
          cashAvailableMinor: 2_500,
          cashCurrency: "USD",
          cashWalletEnabled: true,
        },
      ],
      references: [
        {
          type: "session",
          id: collection.referenceId,
          label: collection.referenceLabel,
          detail: "Aug 5, 4:00 PM",
          suggestedAmountMinor: 10_000,
          creditAmount: 1,
        },
      ],
      recent: [collection],
    });

    expect(parsed.recent[0]).toMatchObject({
      status: "awaiting-reader",
      processingFeeMinor: 295,
      commissionMinor: 500,
    });
    expect(parsed.people[0]?.cashWalletEnabled).toBe(true);
    expect(parsed.earnings.goal?.progressBps).toBe(4_600);
  });

  it("returns the same client secret for a reviewable Terminal attempt", () => {
    expect(
      operatorPaymentStartSchema.parse({
        collection,
        clientSecret: "pi_terminal_secret_123",
        terminalLocationId: "tml_123",
      }),
    ).toMatchObject({
      clientSecret: "pi_terminal_secret_123",
      collection: { status: "awaiting-reader" },
    });
  });

  it("rejects impossible negative wallet and fee values", () => {
    expect(() =>
      operatorPaymentStartSchema.parse({
        collection: { ...collection, processingFeeMinor: -1 },
      }),
    ).toThrow();
  });
});
