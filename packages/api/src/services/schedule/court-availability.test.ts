import { describe, expect, it } from "vitest";
import {
  courtAvailabilityInputs,
  courtBlackouts,
  courtConflicts,
  courtSchedules,
  type CourtFactsForRule,
} from "./court-availability";
import { planCourtCancellation } from "./cancellation";

const LA = "America/Los_Angeles";
const facts = (over: Partial<CourtFactsForRule> = {}): CourtFactsForRule => ({
  courtId: "court-1",
  timeZone: LA,
  windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startsAtMinute: 8 * 60,
    endsAtMinute: 22 * 60,
    mode: "open",
  })),
  overrides: [],
  occupants: [],
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  ...over,
});
const at = (iso: string) => new Date(iso);

describe("the court rule", () => {
  it("treats a court with no opening windows as open around the clock", () => {
    expect(courtSchedules("c", LA, [])[0]!.windows).toHaveLength(7);
    // Only closures stored: still open outside them.
    expect(
      courtSchedules("c", LA, [
        { weekday: 1, startsAtMinute: 60, endsAtMinute: 120, mode: "blocked" },
      ])[0]!.windows,
    ).toHaveLength(7);
  });

  it("follows the wall clock across the spring daylight-saving change", () => {
    // 14 March 2027: 8 AM in Los Angeles is 15:00 UTC (PDT).
    expect(
      courtConflicts(facts(), {
        startsAt: at("2027-03-14T15:00:00Z"),
        endsAt: at("2027-03-14T16:00:00Z"),
      }),
    ).toEqual([]);
    expect(
      courtConflicts(facts(), {
        startsAt: at("2027-03-14T14:30:00Z"),
        endsAt: at("2027-03-14T15:30:00Z"),
      })[0],
    ).toMatchObject({ what: "hours", reason: "outside-hours" });
    // The autumn change: 8 AM on 1 November 2026 is 16:00 UTC (PST).
    expect(
      courtConflicts(facts(), {
        startsAt: at("2026-11-01T16:00:00Z"),
        endsAt: at("2026-11-01T17:00:00Z"),
      }),
    ).toEqual([]);
  });

  it("expands weekly closures on the dates they apply, inside their dates", () => {
    const closed = facts({
      windows: [
        ...facts().windows,
        {
          id: "w1",
          weekday: 1,
          startsAtMinute: 12 * 60,
          endsAtMinute: 13 * 60,
          mode: "maintenance",
          effectiveFrom: "2026-12-01",
          effectiveTo: "2026-12-31",
        },
      ],
    });
    const monday = {
      startsAt: at("2026-12-14T20:00:00Z"),
      endsAt: at("2026-12-14T21:00:00Z"),
    };
    expect(courtConflicts(closed, monday)[0]).toMatchObject({
      what: "closed",
      ids: ["w1"],
    });
    const january = {
      startsAt: at("2027-01-04T20:00:00Z"),
      endsAt: at("2027-01-04T21:00:00Z"),
    };
    expect(courtConflicts(closed, january)).toEqual([]);
    expect(courtBlackouts(closed, monday).length).toBeGreaterThan(0);
  });

  it("checks occupants with buffers, ignoring the booking being moved", () => {
    const busy = facts({
      bufferAfterMinutes: 15,
      occupants: [
        {
          id: "b1",
          kind: "booking",
          startsAt: at("2026-12-04T20:00:00Z"),
          endsAt: at("2026-12-04T21:00:00Z"),
        },
      ],
    });
    const before = {
      startsAt: at("2026-12-04T19:00:00Z"),
      endsAt: at("2026-12-04T19:50:00Z"),
    };
    expect(courtConflicts(busy, before)[0]).toMatchObject({
      what: "booking",
      ids: ["b1"],
    });
    expect(courtConflicts(busy, before, ["b1"])).toEqual([]);
    expect(
      courtAvailabilityInputs(busy, before, ["b1"]).commitments,
    ).toHaveLength(0);
  });
});

describe("the cancellation plan", () => {
  const booking = {
    startsAt: at("2026-12-04T02:00:00Z"),
    orderId: "o1",
    personId: "p1",
    refundBeforeHours: 24,
  };
  const participants = [
    {
      id: "r1",
      personId: "p1",
      name: "Ana",
      role: "organizer",
      status: "paid",
      orderId: "o1",
    },
    {
      id: "r2",
      personId: "p2",
      name: "Ben",
      role: "player",
      status: "invited",
      orderId: null,
    },
  ];
  const orders = [
    {
      id: "o1",
      status: "paid",
      totalMinor: 6000,
      currency: "USD",
      stripePaymentIntentId: "pi_1",
      refundedMinor: 1000,
    },
  ];

  it("refunds what is left by policy inside the window, nothing after it", () => {
    const inside = planCourtCancellation({
      booking,
      participants,
      orders,
      refund: "by-policy",
      cause: "player-asked",
      now: at("2026-12-01T12:00:00Z"),
    });
    expect(inside.lines).toEqual([
      expect.objectContaining({
        orderId: "o1",
        action: "refund-card",
        paidMinor: 5000,
        refundMinor: 5000,
      }),
      expect.objectContaining({
        participantId: "r2",
        action: "release",
        method: "nothing-paid",
      }),
    ]);
    const late = planCourtCancellation({
      booking,
      participants,
      orders,
      refund: "by-policy",
      cause: "player-asked",
      now: at("2026-12-03T12:00:00Z"),
    });
    expect(late.lines[0]).toMatchObject({ action: "keep", refundMinor: 0 });
    expect(late.keepsPaidMoney).toBe(true);
  });

  it("refunds in full when the club cancels, whatever was chosen", () => {
    const club = planCourtCancellation({
      booking,
      participants,
      orders,
      refund: "none",
      cause: "club",
      now: at("2026-12-03T12:00:00Z"),
    });
    expect(club.totalRefundMinor).toBe(5000);
    expect(club.keepsPaidMoney).toBe(false);
  });

  it("hands desk money back at the desk and releases unpaid orders", () => {
    const desk = planCourtCancellation({
      booking,
      participants,
      orders: [
        { ...orders[0]!, stripePaymentIntentId: null, refundedMinor: 0 },
      ],
      refund: "full",
      cause: "player-asked",
      now: at("2026-12-03T12:00:00Z"),
    });
    expect(desk.lines[0]).toMatchObject({
      method: "desk",
      action: "hand-back-at-desk",
      refundMinor: 6000,
    });
    const unpaid = planCourtCancellation({
      booking,
      participants,
      orders: [{ ...orders[0]!, status: "pending" }],
      refund: "full",
      cause: "player-asked",
      now: at("2026-12-01T12:00:00Z"),
    });
    expect(unpaid.lines[0]).toMatchObject({
      action: "release",
      refundMinor: 0,
    });
    expect(unpaid.movesMoney).toBe(false);
  });
});
