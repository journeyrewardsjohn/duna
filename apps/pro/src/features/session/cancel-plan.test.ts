import { describe, expect, it } from "vitest";
import {
  cancelPlanFor,
  entryKindFromSource,
  isMissingProcedure,
} from "./cancel-plan";
import {
  previewFromCourtBooking,
  previewFromGroup,
  previewFromSession,
} from "./cancel-preview";
import {
  sessionActions,
  sessionFromCalendar,
  type CalendarSessionInput,
} from "./session-model";

const NOW = Date.parse("2026-11-28T15:00:00.000Z");

/** The owner's booking from TestFlight: a $30 court rental with a match. */
const courtBooking: CalendarSessionInput = {
  id: "5d6c8a1e-7c1b-4d3e-9a55-3b2f6c7d8e9f",
  sourceType: "booking",
  title: "Saturday match at The Strand · court booking",
  startsAt: "2026-11-28T19:30:00.000Z",
  endsAt: "2026-11-28T21:00:00.000Z",
  timezone: "America/Los_Angeles",
  status: "confirmed",
  venueId: "0b8f3c2a-1d4e-4f5a-8b6c-7d8e9f0a1b2c",
  venueName: "The Strand",
  courtId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  courtName: "Court 1",
  participantCount: 3,
  capacity: 4,
  attendees: [
    { personId: "p1", displayName: "John Sutton", status: "organizer" },
    { displayName: "Taylor Sander", status: "invited" },
    { displayName: "Mara Lewis", status: "invited" },
  ],
};

const calendarSession: CalendarSessionInput = {
  ...courtBooking,
  id: "8e7d6c5b-4a39-4281-9f0e-1d2c3b4a5968",
  sourceType: "session",
  title: "Group clinic",
};

const keys = (input: CalendarSessionInput, audience: "coach" | "owner") =>
  sessionActions(sessionFromCalendar(input, "UTC"), { audience, now: NOW }).map(
    (action) => action.key,
  );

describe("entry kind → cancel action", () => {
  it("reads the calendar's source types", () => {
    expect(entryKindFromSource("session")).toBe("session");
    expect(entryKindFromSource("booking")).toBe("court-booking");
    expect(entryKindFromSource("pickup")).toBe("pickup");
    expect(entryKindFromSource("busy-block")).toBe("block");
    expect(entryKindFromSource("operator-block")).toBe("block");
  });

  it("a court booking never goes to cancelCalendarSession (the TestFlight failure)", () => {
    const detail = sessionFromCalendar(courtBooking, "UTC");
    expect(detail.entryKind).toBe("court-booking");
    expect(detail.title).toBe("Saturday match at The Strand");
    const plan = cancelPlanFor(detail, { audience: "owner" });
    expect(plan.kind).toBe("court-booking");
    if (plan.kind !== "court-booking") throw new Error("unreachable");
    expect(plan.procedure).toBe("operator.schedule.cancelCourtBooking");
    expect(plan.preview).toBe("operator.schedule.cancelCourtBookingPreview");
    expect(keys(courtBooking, "owner")).toContain("cancel-booking");
    expect(keys(courtBooking, "owner")).not.toContain("cancel-session");
  });

  it("the booking plan is marked unavailable when the server has no procedure", () => {
    const detail = sessionFromCalendar(courtBooking, "UTC");
    const plan = cancelPlanFor(detail, {
      audience: "owner",
      courtBooking: "missing",
    });
    expect(plan.kind === "court-booking" && plan.available).toBe(false);
    expect(
      cancelPlanFor(detail, { audience: "owner", courtBooking: "available" }),
    ).toMatchObject({ kind: "court-booking", available: true });
  });

  it("a calendar session goes to cancelCalendarSession with its preview", () => {
    const plan = cancelPlanFor(sessionFromCalendar(calendarSession, "UTC"), {
      audience: "owner",
    });
    expect(plan).toMatchObject({
      kind: "calendar-session",
      action: "cancel-session",
      procedure: "operator.cancelCalendarSession",
      preview: "operator.sessionDetail",
    });
    expect(keys(calendarSession, "owner")).toContain("cancel-session");
  });

  it("a group session goes to participation.cancelSession", () => {
    const detail = {
      ...sessionFromCalendar(calendarSession, "UTC"),
      subject: {
        subjectType: "catalog-session-occurrence" as const,
        subjectId: "x",
      },
    };
    expect(cancelPlanFor(detail, { audience: "owner" })).toMatchObject({
      kind: "group-refund",
      procedure: "operator.participation.cancelSession",
    });
  });

  it("coaches, open play, blocks and cancelled entries get no cancel action", () => {
    expect(keys(courtBooking, "coach")).not.toContain("cancel-booking");
    const pickup = sessionFromCalendar(
      { ...courtBooking, sourceType: "pickup" },
      "UTC",
    );
    expect(cancelPlanFor(pickup, { audience: "owner" }).kind).toBe("none");
    const block = sessionFromCalendar(
      { ...courtBooking, sourceType: "operator-block" },
      "UTC",
    );
    expect(cancelPlanFor(block, { audience: "owner" }).kind).toBe("none");
    const cancelled = sessionFromCalendar(
      { ...courtBooking, status: "cancelled" },
      "UTC",
    );
    expect(cancelPlanFor(cancelled, { audience: "owner" }).kind).toBe("none");
  });

  it("recognises a router without the procedure, and only that", () => {
    const missing = Object.assign(
      new Error(
        'No procedure found on path "operator.schedule.cancelCourtBookingPreview"',
      ),
      { data: { code: "NOT_FOUND" } },
    );
    expect(isMissingProcedure(missing)).toBe(true);
    const notFound = Object.assign(new Error("Booking was not found."), {
      data: { code: "NOT_FOUND" },
    });
    expect(isMissingProcedure(notFound)).toBe(false);
    expect(isMissingProcedure(new Error("Network request failed"))).toBe(false);
  });
});

describe("cancel previews say who gets what back", () => {
  it("court booking: the payer is refunded, invitees released", () => {
    const preview = previewFromCourtBooking({
      policy: {
        title: "Reservation cancellation policy",
        refundBeforeHours: 24,
        insideRefundWindow: true,
      },
      lines: [
        {
          name: "John Sutton",
          method: "card",
          action: "refund-card",
          paidMinor: 3000,
          refundMinor: 3000,
        },
        { name: "Taylor Sander", method: "nothing-paid", action: "release" },
      ],
      totalRefundMinor: 3000,
      currency: "USD",
    });
    expect(preview.lines.map((line) => line.outcome)).toEqual([
      "Card refund $30.00",
      "Nothing paid · invitation released",
    ]);
    expect(preview.total).toBe("$30.00 back to the players");
    expect(preview.policy).toContain("full refund up to 24 hours before");
  });

  it("court booking without payments permission hides amounts", () => {
    const preview = previewFromCourtBooking({
      policy: { title: "Policy", insideRefundWindow: false },
      lines: [{ name: "A", method: "card", action: "keep" }],
    });
    expect(preview.lines[0]?.outcome).toBe("Paid · kept under the policy");
    expect(preview.total).toBe("Amounts need permission to see payments");
  });

  it("calendar session without amounts (PRIV-2): who, never $0", () => {
    const preview = previewFromSession({
      registrationCount: 1,
      creditsToRestore: 0,
      currency: "USD",
      orders: [{ orderId: "o1", buyerName: "Maya", creditsToRestore: 0 }],
    });
    expect(preview.lines[0]!.outcome).toBe("Refunded the way they paid");
    expect(preview.total).toBe("Card payments refunded the way they were paid");
    expect(JSON.stringify(preview)).not.toContain("$");
  });

  it("calendar session: card refunds and credits per buyer", () => {
    const preview = previewFromSession({
      registrationCount: 2,
      cashRefundMinor: 4500,
      creditsToRestore: 2,
      currency: "USD",
      orders: [
        {
          orderId: "o1",
          buyerName: "Maya",
          totalMinor: 4500,
          cashRefundMinor: 4500,
          creditsToRestore: 0,
        },
        {
          orderId: "o2",
          buyerName: "Kai",
          totalMinor: 0,
          cashRefundMinor: 0,
          creditsToRestore: 2,
        },
      ],
    });
    expect(preview.lines.map((line) => line.outcome)).toEqual([
      "Card refund $45.00",
      "2 credits back",
    ]);
    expect(preview.total).toBe("$45.00 back to cards · 2 credits restored");
  });

  it("group session: desk payments are handed back, not refunded", () => {
    const preview = previewFromGroup({
      bookings: [
        {
          bookingId: "b1",
          displayName: "Riley",
          method: "cash",
          outcome: "review-required",
        },
      ],
      totals: { cardRefunds: 0, reviewRequired: 1 },
    });
    expect(preview.lines[0]?.outcome).toBe(
      "Paid at the desk · hand it back there",
    );
    expect(preview.total).toBe(
      "No money to return · 1 to hand back at the desk",
    );
  });
});
