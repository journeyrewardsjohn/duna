import { describe, expect, it } from "vitest";
import {
  classifyBalanceLiability,
  deriveDeferredCreditRevenue,
  reconcileProcessorPayout,
  summarizeRevenueDimensions,
  type SettlementLine,
} from "./reporting";

describe("reporting and accounting derivations", () => {
  it("posts package sales to liability and recognizes on redemption", () => {
    expect(
      deriveDeferredCreditRevenue([
        {
          id: "purchase",
          kind: "purchase",
          amountMinor: 20_000,
          currency: "USD",
          occurredAt: "2026-07-01T00:00:00Z",
        },
        {
          id: "redemption",
          kind: "redemption",
          amountMinor: 7_500,
          currency: "USD",
          occurredAt: "2026-07-10T00:00:00Z",
        },
      ]),
    ).toEqual({
      currency: "USD",
      deferredLiabilityMinor: 12_500,
      recognizedRevenueMinor: 7_500,
      expiredRevenueMinor: 0,
      refundedMinor: 0,
    });
  });

  const settlement: readonly SettlementLine[] = [
    {
      id: "sale",
      kind: "sale",
      amountMinor: 50_000,
      currency: "USD",
      programId: "summer-camp",
      coachPersonId: "coach-1",
      courtId: "court-1",
    },
    {
      id: "refund",
      kind: "refund",
      amountMinor: 5_000,
      currency: "USD",
      programId: "summer-camp",
      coachPersonId: "coach-1",
      courtId: "court-1",
    },
    {
      id: "fee",
      kind: "fee",
      amountMinor: 1_850,
      currency: "USD",
      programId: "summer-camp",
    },
  ];

  it("reconciles a processor payout as one net deposit", () => {
    expect(
      reconcileProcessorPayout({
        lines: settlement,
        processorDepositMinor: 43_150,
      }),
    ).toEqual({
      expectedDepositMinor: 43_150,
      processorDepositMinor: 43_150,
      driftMinor: 0,
      reconciled: true,
    });
  });

  it("derives program, coach, and court revenue from settlement lines", () => {
    expect(summarizeRevenueDimensions(settlement)).toEqual({
      byProgram: { "summer-camp": 43_150 },
      byCoach: { "coach-1": 45_000 },
      byCourt: { "court-1": 45_000 },
    });
  });

  it("keeps Stripe-held player balances off the operator's books", () => {
    expect(
      classifyBalanceLiability({
        operatorIssuedCreditsMinor: 25_000,
        stripeHeldPlayerBalanceMinor: 80_000,
      }),
    ).toEqual({
      operatorBookLiabilityMinor: 25_000,
      disclosedStripeCustodiedBalanceMinor: 80_000,
    });
  });
});
