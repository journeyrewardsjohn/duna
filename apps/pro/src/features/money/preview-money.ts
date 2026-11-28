/**
 * The preview build's club money (credential-free demo mode only): example
 * balances, two sales and a payout. Live builds never read it.
 */
import type { OrganizationMoneyWorkspace } from "@duna/api";

export function previewMoney(): OrganizationMoneyWorkspace {
  const now = new Date();
  const day = (offset: number) =>
    new Date(now.getTime() + offset * 86_400_000).toISOString();
  return {
    generatedAt: now.toISOString(),
    currency: "USD",
    balance: {
      totalMinor: 55_670,
      availableMinor: 17_910,
      heldMinor: 8_695,
      pendingMinor: 29_065,
      inTransitMinor: 24_800,
      nextReleaseAt: day(1),
      nextReleaseMinor: 8_695,
    },
    earnings: {
      grossMinor: 60_425,
      netMinor: 55_670,
      feesMinor: 4_755,
      refundsMinor: 0,
      points: Array.from({ length: 14 }, (_, index) => ({
        date: day(index - 13).slice(0, 10),
        grossMinor: index % 3 === 0 ? 8_000 + index * 100 : 2_500,
        netMinor: index % 3 === 0 ? 7_300 + index * 90 : 2_200,
      })),
    },
    connect: {
      accountId: "acct_preview",
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      bankStatus: "connected",
      bankName: "First Sand Bank",
      bankLast4: "1842",
      stripeAvailableMinor: 26_605,
      stripePendingMinor: 29_065,
      stripeInstantAvailableMinor: 17_910,
      stripeReservedMinor: 0,
      stripePayoutInterval: "manual",
      earnings30d: {
        grossMinor: 60_425,
        netMinor: 55_670,
        feesMinor: 4_755,
        payoutsMinor: 24_800,
        points: Array.from({ length: 14 }, (_, index) => ({
          date: day(index - 13).slice(0, 10),
          grossMinor: index % 3 === 0 ? 8_000 + index * 100 : 2_500,
          netMinor: index % 3 === 0 ? 7_300 + index * 90 : 2_200,
        })),
      },
      bankAccounts: [
        {
          id: "ba_preview",
          type: "bank-account",
          name: "First Sand Bank",
          last4: "1842",
          currency: "USD",
          status: "connected",
          defaultForCurrency: true,
        },
      ],
      activity: [],
      disputes: [],
      requirementsDue: [],
      liveData: false,
      livemode: false,
    },
    settings: {
      payoutInterval: "weekly",
      weeklyPayoutDay: "friday",
      monthlyPayoutDay: 1,
      minimumPayoutMinor: 5_000,
      statementDescriptor: "BEACH ELITE",
      payoutStatementDescriptor: "DUNA BEACH ELITE",
      stripeSettingsStatus: "synced",
    },
    refundPolicies: [],
    transactions: [
      {
        id: "fund_preview_1",
        orderId: "91000000-0000-4000-8000-000000000001",
        description: "Performance membership",
        customerName: "Jordan Smith",
        grossMinor: 18_500,
        consumerFeeMinor: 0,
        processingFeeMinor: 590,
        organizationFeeMinor: 0,
        taxMinor: 0,
        netMinor: 17_910,
        refundedMinor: 0,
        currency: "USD",
        status: "available",
        policyName: "Non-refundable",
        availableAt: day(-1),
        occurredAt: day(-4),
        reconciled: true,
      },
      {
        id: "fund_preview_2",
        orderId: "91000000-0000-4000-8000-000000000002",
        description: "Sunset doubles training",
        customerName: "Maya Chen",
        grossMinor: 9_675,
        consumerFeeMinor: 675,
        processingFeeMinor: 305,
        organizationFeeMinor: 0,
        taxMinor: 0,
        netMinor: 8_695,
        refundedMinor: 0,
        currency: "USD",
        status: "held",
        policyName: "Flexible · 24 hours",
        availableAt: day(1),
        occurredAt: day(-2),
        reconciled: true,
      },
    ],
    payouts: [
      {
        id: "93000000-0000-4000-8000-000000000001",
        stripePayoutId: "po_preview",
        amountMinor: 24_800,
        currency: "USD",
        status: "in_transit",
        expectedArrivalAt: day(1),
        createdAt: day(-1),
      },
    ],
    disputes: [],
  };
}
