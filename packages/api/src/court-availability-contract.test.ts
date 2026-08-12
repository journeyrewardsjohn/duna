import { describe, expect, it } from "vitest";
import {
  courtAvailabilitySchema,
  courtCheckoutResultSchema,
} from "./contracts";

function availabilityFixture() {
  const venueId = crypto.randomUUID();
  const courtId = crypto.randomUUID();
  const hostId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  return {
    venueId,
    date: "2026-08-14",
    durationMinutes: 90,
    timezone: "America/Los_Angeles",
    generatedAt: "2026-08-11T12:00:00.000Z",
    excludedAfterDarkCount: 0,
    slots: [
      {
        courtId,
        courtName: "Center court",
        startsAt: "2026-08-14T17:30:00.000Z",
        endsAt: "2026-08-14T19:00:00.000Z",
        localStartsAt: "2026-08-14T10:30",
        localEndsAt: "2026-08-14T12:00",
        durationMinutes: 90,
        price: { amountMinor: 2_400, currency: "USD" },
        daylightStatus: "daylight",
      },
    ],
    openMatches: [
      {
        id: matchId,
        slug: `pickup-${matchId}`,
        title: "Friday doubles",
        startsAt: "2026-08-14T17:30:00.000Z",
        endsAt: "2026-08-14T19:00:00.000Z",
        localStartsAt: "2026-08-14T10:30",
        localEndsAt: "2026-08-14T12:00",
        spotsRemaining: 2,
        capacity: 4,
        format: "2s",
        matchType: "competitive",
        genderPreference: "open",
        approvalRequired: false,
        price: { amountMinor: 600, currency: "USD" },
        ratingRange: [2.5, 4.5] as const,
        host: {
          id: hostId,
          displayName: "Duna Host",
          handle: "duna-host",
          initials: "DH",
        },
        attendees: [
          {
            id: hostId,
            displayName: "Duna Host",
            handle: "duna-host",
            initials: "DH",
          },
        ],
      },
    ],
  };
}

describe("court availability open matches", () => {
  it("carries joinable matches alongside courts at the same local start", () => {
    const availability = courtAvailabilitySchema.parse(availabilityFixture());

    expect(availability.slots[0]?.localStartsAt).toBe(
      availability.openMatches[0]?.localStartsAt,
    );
    expect(availability.openMatches[0]).toMatchObject({
      title: "Friday doubles",
      spotsRemaining: 2,
      host: { displayName: "Duna Host" },
      price: { amountMinor: 600, currency: "USD" },
    });
  });

  it("never labels a full match as open", () => {
    const fixture = availabilityFixture();
    fixture.openMatches[0]!.spotsRemaining = 0;

    expect(courtAvailabilitySchema.safeParse(fixture).success).toBe(false);
  });
});

describe("native court checkout contract", () => {
  it("returns an in-app PaymentSheet without requiring a hosted URL", () => {
    const result = courtCheckoutResultSchema.parse({
      mode: "stripe",
      bookingId: crypto.randomUUID(),
      bookingStatus: "held",
      paymentMode: "full",
      paymentSheet: {
        publishableKey: "pk_test_duna",
        paymentIntentId: "pi_duna",
        paymentIntentClientSecret: "pi_duna_secret_test",
        customerId: "cus_duna",
        customerSessionClientSecret: "cuss_duna_secret_test",
      },
      expiresAt: "2026-08-14T17:45:00.000Z",
      startsAt: "2026-08-14T18:00:00.000Z",
      endsAt: "2026-08-14T19:30:00.000Z",
      alternatives: [],
      participants: [],
    });

    expect(result.paymentSheet?.paymentIntentId).toBe("pi_duna");
    expect(result.checkoutUrl).toBeUndefined();
  });
});
