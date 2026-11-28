import type { BookingSummary, SandRating } from "@duna/core";
import { describe, expect, it } from "vitest";
import {
  buildHomeModel,
  countdownText,
  participationWords,
  timeRange,
  type HomeCatalogBooking,
  type HomeInput,
} from "./home-model";

const now = Date.parse("2026-11-28T18:00:00.000Z"); // 10:00 AM in Los Angeles
const hour = 3_600_000;
const rating: SandRating = {
  display: 3.42,
  mu: 0,
  phi: 0,
  sigma: 0,
  confidence: "Reliable",
  discipline: "beach-2s",
  delta: 0.08,
};
const remy = {
  personId: "c0000000-0000-4000-8000-000000000012",
  displayName: "Remy Lewis",
  firstName: "Remy",
};

function booking(overrides: Partial<BookingSummary> = {}): BookingSummary {
  return {
    id: "b1",
    title: "Golden hour pickup",
    kind: "pickup",
    startsAt: new Date(now + 2 * hour).toISOString(),
    endsAt: new Date(now + 3.5 * hour).toISOString(),
    venueName: "Court 3",
    venueTimezone: "America/Los_Angeles",
    status: "confirmed",
    amount: { amountMinor: 0, currency: "USD" },
    participantNames: ["Mara Lewis", "Theo Park"],
    ...overrides,
  } as BookingSummary;
}

function catalog(
  overrides: Partial<HomeCatalogBooking> = {},
): HomeCatalogBooking {
  return {
    bookingId: "k1",
    status: "confirmed",
    catalogItemSlug: "junior-clinic",
    title: "Junior clinic",
    organization: { name: "Sunset Beach Club", slug: "sunset" },
    startsAt: new Date(now + 26 * hour).toISOString(),
    endsAt: new Date(now + 27.5 * hour).toISOString(),
    timezone: "America/Los_Angeles",
    sessionStatus: "scheduled",
    participant: { ...remy, isSelf: false },
    ...overrides,
  };
}

function input(overrides: Partial<HomeInput> = {}): HomeInput {
  return {
    person: {
      id: "mara",
      displayName: "Mara Lewis",
      firstName: "Mara",
      rating,
    },
    actingFor: null,
    dependents: [],
    bookings: [],
    events: [],
    catalogBookings: [],
    recentMatches: [],
    paymentSchedules: [],
    now,
    timeZone: "America/Los_Angeles",
    ...overrides,
  };
}

describe("Player web Home model", () => {
  it("puts the next future booking first and ignores past ones", () => {
    const model = buildHomeModel(
      input({
        bookings: [
          booking({
            id: "past",
            title: "Yesterday",
            startsAt: new Date(now - 26 * hour).toISOString(),
            endsAt: new Date(now - 25 * hour).toISOString(),
          }),
          booking(),
        ],
      }),
    );
    expect(model.nextUp?.title).toBe("Golden hour pickup");
    expect(model.nextUp?.day).toBe("Today");
    expect(model.nextUp?.countdown).toBe("Starts in 2h 00m");
    expect(model.nextUp?.people).toEqual(["Theo Park"]);
    expect(model.greeting).toBe("Good morning, Mara.");
    expect(model.firstUse).toBe(false);
  });

  it("labels a junior's session with their name on the guardian's Home", () => {
    const model = buildHomeModel(
      input({ dependents: [remy], catalogBookings: [catalog()] }),
    );
    expect(model.nextUp?.forName).toBe("Remy");
    expect(model.household[0]?.next?.title).toBe("Junior clinic");
  });

  it("shows only the junior's plans while acting for them", () => {
    const model = buildHomeModel(
      input({
        dependents: [remy],
        actingFor: remy,
        bookings: [booking()],
        catalogBookings: [catalog()],
      }),
    );
    expect(model.subject.firstName).toBe("Remy");
    expect(model.greeting).toBe("Remy's week");
    expect(model.nextUp?.title).toBe("Junior clinic");
    expect(model.rating).toBeNull();
    expect(model.household).toEqual([]);
  });

  it("lists what needs the person: payments due, scores to confirm", () => {
    const model = buildHomeModel(
      input({
        dependents: [remy],
        catalogBookings: [catalog({ status: "pending-payment" })],
        recentMatches: [
          {
            id: "m1",
            status: "pending-verification",
            confirmationRequired: true,
            playedAt: new Date(now - 20 * hour).toISOString(),
            venueName: "Sunset Beach",
            winner: "A",
            ratingDelta: 0.04,
            teamA: [{ id: "mara", displayName: "Mara Lewis" }],
            teamB: [{ id: "x", displayName: "Theo Park" }],
          },
        ],
      }),
    );
    expect(model.needsYou.map((need) => need.title)).toEqual([
      "Pay for Remy's place in Junior clinic",
      "Confirm a score",
    ]);
  });

  it("guides a brand-new player to a first action", () => {
    const model = buildHomeModel(input());
    expect(model.firstUse).toBe(true);
    expect(model.nextUp).toBeNull();
  });

  it("renders group-session words from the shared copy table", () => {
    expect(
      participationWords(
        catalog({
          participation: {
            bookedCount: 2,
            playersNeeded: 2,
            spotsRemaining: 6,
            displayState: "needs-players",
          },
        }),
      ),
    ).toEqual({ status: "Needs 2 more" });
    expect(
      participationWords(
        catalog({
          participation: {
            bookedCount: 5,
            playersNeeded: 0,
            spotsRemaining: 3,
            displayState: "confirmed",
          },
        }),
      ),
    ).toEqual({ status: "Confirmed · 5 players" });
    expect(participationWords(catalog())).toBeUndefined();
  });

  it("formats times and countdowns", () => {
    const start = Date.parse("2026-11-28T23:45:00.000Z");
    expect(
      timeRange(start, start + 1.5 * hour, "America/Los_Angeles", "en-US"),
    ).toBe("3:45 – 5:15\u202fPM");
    expect(countdownText(start, start + hour, start + 10 * 60_000)).toBe(
      "On now",
    );
    expect(countdownText(start, start + hour, start - 3 * 86_400_000)).toBe(
      "Starts in 3d 0h",
    );
  });
});
