import { describe, expect, it } from "vitest";
import {
  authorizeWalletSpend,
  evaluateTaxRails,
  evaluateTeamPot,
  foldWalletLedger,
  reconcileWalletBalance,
  type WalletLedgerEntry,
} from "./wallet";

const entries: readonly WalletLedgerEntry[] = [
  {
    id: "prize",
    direction: "credit",
    amountMinor: 45_000,
    currency: "USD",
    status: "available",
    taxCharacter: "prize",
    reasonCode: "sunset-open-first",
    occurredAt: "2026-07-01T00:00:00Z",
  },
  {
    id: "booking",
    direction: "debit",
    amountMinor: 6_000,
    currency: "USD",
    status: "complete",
    taxCharacter: "none",
    reasonCode: "clinic-booking",
    occurredAt: "2026-07-02T00:00:00Z",
  },
  {
    id: "pending-load",
    direction: "credit",
    amountMinor: 10_000,
    currency: "USD",
    status: "pending",
    taxCharacter: "none",
    reasonCode: "ach-load",
    occurredAt: "2026-07-03T00:00:00Z",
  },
  {
    id: "reversed-load",
    direction: "credit",
    amountMinor: 1_000,
    currency: "USD",
    status: "reversed",
    taxCharacter: "none",
    reasonCode: "load-reversal",
    occurredAt: "2026-07-04T00:00:00Z",
  },
];

describe("wallet and money-movement invariants", () => {
  it("derives balances only from append-only ledger entries", () => {
    expect(foldWalletLedger(entries)).toEqual({
      currency: "USD",
      availableMinor: 39_000,
      pendingMinor: 10_000,
      heldMinor: 0,
      totalMinor: 49_000,
    });
  });

  it("applies wallet first and uses a card only for the remainder", () => {
    expect(
      authorizeWalletSpend({
        availableMinor: 3_000,
        orderTotalMinor: 5_500,
        spendingBlocked: false,
        isMinor: false,
        guardianApprovalThresholdMinor: 0,
        guardianApproved: false,
      }),
    ).toMatchObject({
      allowed: true,
      walletAppliedMinor: 3_000,
      cardRemainderMinor: 2_500,
    });
  });

  it("blocks a custodial spend above the guardian threshold", () => {
    expect(
      authorizeWalletSpend({
        availableMinor: 10_000,
        orderTotalMinor: 7_500,
        spendingBlocked: false,
        isMinor: true,
        guardianApprovalThresholdMinor: 5_000,
        guardianApproved: false,
      }),
    ).toMatchObject({
      allowed: false,
      guardianApprovalRequired: true,
      reasons: ["guardian-approval-required"],
    });
  });

  it("collects tax information at the buffer before reporting", () => {
    expect(evaluateTaxRails({ entries })).toMatchObject({
      prizeIncomeMinor: 45_000,
      taxFormCollectionRequired: true,
      prize1099MiscExpected: false,
      contractor1099NecExpected: false,
    });
  });

  it("funds a doubles entry without enabling peer-to-peer transfers", () => {
    expect(
      evaluateTeamPot({
        targetMinor: 15_000,
        contributions: [
          { personId: "player-1", amountMinor: 7_500 },
          { personId: "player-2", amountMinor: 7_500 },
        ],
      }),
    ).toEqual({
      fundedMinor: 15_000,
      remainingMinor: 0,
      fullyFunded: true,
    });
  });

  it("treats any Stripe-to-ledger drift as an incident", () => {
    expect(
      reconcileWalletBalance({
        ledgerEntries: entries,
        processorAvailableMinor: 38_999,
        processorPendingMinor: 10_000,
      }),
    ).toMatchObject({
      availableDriftMinor: 1,
      pendingDriftMinor: 0,
      incident: true,
    });
  });
});
