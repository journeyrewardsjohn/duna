import { describe, expect, it } from "vitest";
import {
  accountBalance,
  allocateOrganizationCredits,
  assertBalancedJournal,
  ledgerAccountNormalSide,
  reverseLedgerPostings,
  type LedgerPosting,
} from "./ledger";

const creditPurchase: readonly LedgerPosting[] = [
  {
    accountId: "stripe-clearing",
    side: "debit",
    amount: 12_000,
    unit: "USD",
    unitKind: "money",
    currency: "USD",
  },
  {
    accountId: "customer-credit-liability",
    side: "credit",
    amount: 12_000,
    unit: "USD",
    unitKind: "money",
    currency: "USD",
  },
  {
    accountId: "credit-issuance-control",
    side: "debit",
    amount: 10,
    unit: "org_123:CREDIT",
    unitKind: "organization-credit",
  },
  {
    accountId: "player-credit-wallet",
    side: "credit",
    amount: 10,
    unit: "org_123:CREDIT",
    unitKind: "organization-credit",
  },
];

describe("double-entry ledger", () => {
  it("balances independently by currency and organization-credit unit", () => {
    expect(assertBalancedJournal(creditPurchase)).toEqual([
      {
        unit: "USD",
        unitKind: "money",
        currency: "USD",
        debitTotal: 12_000,
        creditTotal: 12_000,
      },
      {
        unit: "org_123:CREDIT",
        unitKind: "organization-credit",
        currency: undefined,
        debitTotal: 10,
        creditTotal: 10,
      },
    ]);
  });

  it("rejects a journal that fabricates value", () => {
    expect(() =>
      assertBalancedJournal(creditPurchase.slice(0, -1)),
    ).toThrowError("Unbalanced org_123:CREDIT journal");
  });

  it("reverses with a new equal and opposite posting set", () => {
    const reversal = reverseLedgerPostings(creditPurchase);
    expect(reversal[0]?.side).toBe("credit");
    expect(reversal[1]?.side).toBe("debit");
    expect(assertBalancedJournal(reversal)).toHaveLength(2);
  });

  it("derives account balance using the account normal side", () => {
    expect(
      accountBalance({
        normalSide: ledgerAccountNormalSide("liability"),
        postings: [
          { side: "credit", amount: 10 },
          { side: "debit", amount: 4 },
        ],
      }),
    ).toBe(6);
  });

  it("spends expiring organization credits before evergreen credits", () => {
    expect(
      allocateOrganizationCredits({
        credits: 7,
        now: "2026-08-01T12:00:00.000Z",
        grants: [
          {
            id: "evergreen",
            remainingCredits: 8,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "soon",
            remainingCredits: 5,
            expiresAt: "2026-08-02T00:00:00.000Z",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "expired",
            remainingCredits: 100,
            expiresAt: "2026-07-31T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      allocations: [
        { grantId: "soon", credits: 5 },
        { grantId: "evergreen", credits: 2 },
      ],
      remainingUnfundedCredits: 0,
    });
  });
});
