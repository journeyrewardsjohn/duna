import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calculateConsumerPlatformFee,
  calculateOperatorProcessingFee,
  priceConsumerOrder,
} from "./index";

describe("Duna pricing", () => {
  it("caps and floors the consumer fee", () => {
    expect(
      calculateConsumerPlatformFee({
        bookingSubtotalMinor: 100,
        currency: "USD",
        isDunaPlus: false,
        hasRegistrationServiceFee: false,
      }).amountMinor,
    ).toBe(49);
    expect(
      calculateConsumerPlatformFee({
        bookingSubtotalMinor: 100_000,
        currency: "USD",
        isDunaPlus: false,
        hasRegistrationServiceFee: false,
      }).amountMinor,
    ).toBe(499);
  });

  it("makes double charging impossible", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        (bookingSubtotalMinor) => {
          const fee = calculateConsumerPlatformFee({
            bookingSubtotalMinor,
            currency: "USD",
            isDunaPlus: false,
            hasRegistrationServiceFee: true,
          });
          expect(fee.amountMinor).toBe(0);
        },
      ),
    );
  });

  it("waives the platform fee for Duna+", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        (bookingSubtotalMinor) => {
          const fee = calculateConsumerPlatformFee({
            bookingSubtotalMinor,
            currency: "USD",
            isDunaPlus: true,
            hasRegistrationServiceFee: false,
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
    expect(result.fees[0]?.amountMinor).toBe(285);
    expect(result.totalMinor).toBe(9_785);
  });
});
