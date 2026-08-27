import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calculateConsumerPlatformFee,
  calculateOrganizationCommissionFee,
  calculateOperatorProcessingFee,
  priceConsumerOrder,
  selectLowestQualifiedCourtRate,
} from "./index";

describe("Duna pricing", () => {
  it("chooses the lowest date-qualified court rate after normalizing units", () => {
    const result = selectLowestQualifiedCourtRate({
      localDate: "2026-07-06",
      durationMinutes: 120,
      isMember: false,
      personId: "person-1",
      plans: [
        {
          id: "standard",
          name: "Standard",
          audience: "everyone",
          baseAmountMinor: 6_000,
          nonMemberAmountMinor: 6_000,
          rateUnitMinutes: 60,
        },
        {
          id: "summer-monday",
          name: "Summer Mondays",
          audience: "everyone",
          baseAmountMinor: 4_500,
          nonMemberAmountMinor: 4_500,
          rateUnitMinutes: 60,
          weekdays: [1],
          startsOn: "2026-06-01",
          endsOn: "2026-08-31",
        },
        {
          id: "two-hour-special",
          name: "Two-hour special",
          audience: "everyone",
          baseAmountMinor: 8_000,
          rateUnitMinutes: 120,
          specificDates: ["2026-07-06"],
        },
      ],
    });

    expect(result).toMatchObject({
      planId: "two-hour-special",
      amountMinor: 8_000,
      priceKind: "base",
    });
  });

  it("keeps user-only rates private and uses the member price when qualified", () => {
    const plans = [
      {
        id: "standard",
        name: "Standard",
        audience: "everyone" as const,
        baseAmountMinor: 6_000,
        memberAmountMinor: 5_000,
        nonMemberAmountMinor: 6_500,
        rateUnitMinutes: 60,
      },
      {
        id: "player-rate",
        name: "Player rate",
        audience: "selected-users" as const,
        eligiblePersonIds: ["person-1", "person-2"],
        baseAmountMinor: 4_000,
        memberAmountMinor: 3_500,
        rateUnitMinutes: 60,
      },
    ];

    expect(
      selectLowestQualifiedCourtRate({
        plans,
        localDate: "2026-07-06",
        durationMinutes: 60,
        isMember: true,
        personId: "person-1",
      }),
    ).toMatchObject({
      planId: "player-rate",
      amountMinor: 3_500,
      priceKind: "member",
    });
    expect(
      selectLowestQualifiedCourtRate({
        plans,
        localDate: "2026-07-06",
        durationMinutes: 60,
        isMember: false,
        personId: "person-3",
      }),
    ).toMatchObject({
      planId: "standard",
      amountMinor: 6_500,
      priceKind: "public",
    });
  });

  it("charges a 7.5% service fee on eligible transactions", () => {
    expect(
      calculateConsumerPlatformFee({
        eligibleSubtotalMinor: 100,
        currency: "USD",
        isDunaPlus: false,
      }).amountMinor,
    ).toBe(8);
    expect(
      calculateConsumerPlatformFee({
        eligibleSubtotalMinor: 100_000,
        currency: "USD",
        isDunaPlus: false,
      }).amountMinor,
    ).toBe(7_500);
  });

  it("waives the service fee for Premium memberships", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        (eligibleSubtotalMinor) => {
          const fee = calculateConsumerPlatformFee({
            eligibleSubtotalMinor,
            currency: "USD",
            isDunaPlus: true,
          });
          expect(fee.amountMinor).toBe(0);
        },
      ),
    );
  });

  it("caps ACH at six dollars", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (amountMinor) => {
        const fee = calculateOperatorProcessingFee({
          amountMinor,
          currency: "USD",
          method: "ach",
        });
        expect(fee.amountMinor).toBeLessThanOrEqual(600);
      }),
    );
  });

  it("uses the card-present operator fee schedule for Tap to Pay", () => {
    expect(
      calculateOperatorProcessingFee({
        amountMinor: 10_000,
        currency: "USD",
        method: "card-present",
      }),
    ).toMatchObject({
      id: "operator-present-v2",
      amountMinor: 295,
      payer: "operator",
    });
  });

  it("applies the organization commission to the full transaction subtotal", () => {
    const fee = calculateOrganizationCommissionFee({
      amountMinor: 14_000,
      currency: "USD",
      rateBps: 500,
      organizationId: "organization-1",
      plan: "coach",
      source: "plan-default",
    });

    expect(fee).toMatchObject({
      id: "organization-commission-v1",
      amountMinor: 700,
      payer: "operator",
    });
  });

  it("computes order totals from integer minor units", () => {
    const result = priceConsumerOrder({
      currency: "USD",
      isDunaPlus: false,
      items: [
        {
          id: "lesson",
          kind: "booking",
          description: "Private lesson",
          quantity: 1,
          unitAmountMinor: 9_500,
        },
      ],
    });
    expect(result.subtotalMinor).toBe(9_500);
    expect(result.fees[0]?.amountMinor).toBe(713);
    expect(result.totalMinor).toBe(10_213);
  });

  it("applies the fee to non-goods while excluding merchandise and wallet loads", () => {
    const result = priceConsumerOrder({
      currency: "USD",
      isDunaPlus: false,
      items: [
        {
          id: "entry",
          kind: "registration",
          description: "Tournament registration",
          quantity: 1,
          unitAmountMinor: 10_000,
        },
        {
          id: "shirt",
          kind: "merchandise",
          description: "Event shirt",
          quantity: 1,
          unitAmountMinor: 4_000,
        },
        {
          id: "wallet",
          kind: "wallet-load",
          description: "Wallet funds",
          quantity: 1,
          unitAmountMinor: 5_000,
        },
      ],
    });

    expect(result.subtotalMinor).toBe(19_000);
    expect(result.fees).toHaveLength(1);
    expect(result.fees[0]?.amountMinor).toBe(750);
    expect(result.totalMinor).toBe(19_750);
  });
});
