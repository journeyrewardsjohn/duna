import { describe, expect, it } from "vitest";
import { courtCheckoutQuoteSchema } from "./contracts";
import {
  CourtCheckoutError,
  assertConfirmedCourtAmount,
  dedupeCourtBookingInvites,
  type CourtCheckoutPricing,
} from "./court-checkout";

function quote(
  overrides: Partial<CourtCheckoutPricing> = {},
): CourtCheckoutPricing {
  return {
    subtotalMinor: 10_000,
    consumerFees: [],
    feeTotalMinor: 750,
    totalMinor: 10_750,
    payNowMinor: 10_750,
    organizerShareMinor: 10_750,
    participantShareMinor: 10_750,
    shareCount: 1,
    currency: "USD",
    rateUnitMinutes: 60,
    memberRateApplied: false,
    dunaPlusApplied: false,
    ...overrides,
  };
}

describe("court checkout amount confirmation", () => {
  it("accepts a checkout whose confirmed amount matches the server price", () => {
    expect(() =>
      assertConfirmedCourtAmount({
        quote: quote(),
        expectedPayNowMinor: 10_750,
        expectedTotalMinor: 10_750,
      }),
    ).not.toThrow();
  });

  it("refuses to charge when the confirmed pay-now amount diverges", () => {
    try {
      assertConfirmedCourtAmount({
        quote: quote({
          subtotalMinor: 4_000,
          feeTotalMinor: 0,
          totalMinor: 4_000,
          payNowMinor: 4_000,
          organizerShareMinor: 4_000,
          participantShareMinor: 4_000,
          memberRateApplied: true,
          dunaPlusApplied: true,
        }),
        expectedPayNowMinor: 10_000,
        expectedTotalMinor: 10_000,
      });
      expect.unreachable("a diverging amount must not reach Stripe");
    } catch (error) {
      expect(error).toBeInstanceOf(CourtCheckoutError);
      expect((error as CourtCheckoutError).code).toBe("AMOUNT_MISMATCH");
      expect((error as CourtCheckoutError).message).toContain("$40.00");
      expect((error as CourtCheckoutError).message).toContain(
        "Nothing was charged",
      );
    }
  });

  it("refuses to charge when only the confirmed booking total diverges", () => {
    expect(() =>
      assertConfirmedCourtAmount({
        quote: quote({
          shareCount: 2,
          payNowMinor: 5_375,
          organizerShareMinor: 5_375,
          participantShareMinor: 5_375,
        }),
        expectedPayNowMinor: 5_375,
        expectedTotalMinor: 12_000,
      }),
    ).toThrow(/Nothing was charged/);
  });

  it("keeps existing callers working when no amount is confirmed", () => {
    expect(() => assertConfirmedCourtAmount({ quote: quote() })).not.toThrow();
  });
});

describe("court booking invite de-duplication", () => {
  const actorPersonId = crypto.randomUUID();
  const teammateId = crypto.randomUUID();

  it("collapses repeats and removes the buyer so share counts agree", () => {
    const invited = dedupeCourtBookingInvites({
      participants: [
        { personId: teammateId },
        { personId: teammateId },
        { personId: actorPersonId },
        { email: "Partner@Example.com" },
        { email: "partner@example.com" },
        { phoneE164: "+13105550123" },
        { name: "No contact detail" },
      ],
      actorPersonId,
      subjectPersonId: actorPersonId,
    });
    expect(invited.map((participant) => participant.personId)).toEqual([
      teammateId,
      undefined,
      undefined,
    ]);
    expect(invited).toHaveLength(3);
  });
});

describe("court checkout quote contract", () => {
  it("publishes every field a client needs to confirm a price", () => {
    const parsed = courtCheckoutQuoteSchema.parse({
      subtotalMinor: 10_000,
      feeTotalMinor: 750,
      totalMinor: 10_750,
      payNowMinor: 5_375,
      organizerShareMinor: 5_375,
      participantShareMinor: 5_375,
      shareCount: 2,
      currency: "USD",
      rateUnitMinutes: 60,
      memberRateApplied: false,
      dunaPlusApplied: false,
    });
    expect(parsed.payNowMinor).toBe(5_375);
    expect(parsed.organizerShareMinor + parsed.participantShareMinor).toBe(
      parsed.totalMinor,
    );
  });
});
