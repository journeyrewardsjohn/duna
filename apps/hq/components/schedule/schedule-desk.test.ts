import { describe, expect, it } from "vitest";
import {
  withBookingPayments,
  cancelLineAmount,
  cancelLineWords,
  conflictSentence,
  draftHref,
  handoffFor,
  mobileProblem,
  normalisedMobile,
  policyWords,
  type CancelPreview,
} from "./schedule-desk";
import type { ScheduleItem } from "./schedule-model";

const zone = "America/Los_Angeles";

describe("the front desk's words", () => {
  it("says a conflict from the shared rule in the calendar's words", () => {
    const at = {
      reason: "commitment" as const,
      startsAt: "2026-12-09T17:00:00.000Z",
      endsAt: "2026-12-09T18:30:00.000Z",
      ids: [],
    };
    expect(
      conflictSentence({ ...at, what: "booking" }, "Court 2", zone),
    ).toMatch(/^Court 2 is booked 9:00/);
    expect(conflictSentence({ ...at, what: "hours" }, "Court 2", zone)).toMatch(
      /^Court 2 isn't open 9:00/,
    );
    expect(
      conflictSentence({ ...at, what: "session" }, "Court 2", zone),
    ).toMatch(/^A session is on Court 2/);
  });

  it("says how each payer's money comes back, and amounts only when given", () => {
    const card = {
      name: "Alex Rivera",
      method: "card" as const,
      action: "refund-card" as const,
      paidMinor: 6_000,
      refundMinor: 6_000,
    };
    expect(cancelLineWords(card)).toBe("Refunded to the card they paid with");
    expect(cancelLineAmount(card, "USD")).toBe("$60.00 back");
    const desk = {
      name: "Jamie Stone",
      method: "desk" as const,
      action: "hand-back-at-desk" as const,
    };
    expect(cancelLineWords(desk)).toMatch(/hand it back at the desk/);
    // No money permission: the API left the amounts out, so do we.
    expect(cancelLineAmount(desk, "USD")).toBeUndefined();
    expect(
      cancelLineAmount({ ...card, action: "keep", refundMinor: 0 }, "USD"),
    ).toBe("$60.00 kept");
    expect(
      cancelLineWords({
        name: "Noa Klein",
        method: "unpaid",
        action: "release",
      }),
    ).toMatch(/payment due is cancelled/);
  });

  it("states the policy and the club's refund floor", () => {
    const preview = {
      cause: "club",
      policy: {
        title: "Reservation cancellation policy",
        refundBeforeHours: 24,
        insideRefundWindow: false,
      },
    } as unknown as CancelPreview;
    const words = policyWords(preview);
    expect(words).toMatch(/refunds up to 24 hours before the start/);
    expect(words).toMatch(/past that window/);
    expect(words).toMatch(/every payer gets their money back in full/);
  });

  it("opens a Concierge draft in its Inbox thread, else a new message", () => {
    const draft = {
      recipients: [
        {
          personId: "10000000-0000-4000-8000-000000000001",
          name: "Ivy Chen",
          role: "guardian" as const,
          forName: "Leo Chen",
        },
      ],
      body: "Your court booking has moved.",
    };
    expect(draftHref(draft, { conversationId: "c-1" })).toBe(
      "/inbox?thread=c-1",
    );
    expect(draftHref(draft, undefined)).toBe(
      "/inbox/create?recipient=10000000-0000-4000-8000-000000000001",
    );
    expect(handoffFor("Moved", draft, undefined)?.recipients).toEqual([
      "Ivy Chen (for Leo Chen)",
    ]);
    expect(handoffFor("Moved", { recipients: [], body: "" }, undefined)).toBe(
      null,
    );
  });

  it("takes a walk-in's mobile only in the international format", () => {
    expect(mobileProblem("")).toBeUndefined();
    expect(mobileProblem("+1 (310) 555-0100")).toBeUndefined();
    expect(normalisedMobile("+1 (310) 555-0100")).toBe("+13105550100");
    expect(mobileProblem("310 555 0100")).toMatch(/international format/);
  });
});

describe("booking payments on the calendar", () => {
  const booking: ScheduleItem = {
    id: "b-1",
    source: "court-booking",
    kind: "booking",
    title: "Court hire",
    startsAt: "2026-12-09T17:00:00.000Z",
    endsAt: "2026-12-09T18:00:00.000Z",
    timeZone: zone,
    status: "confirmed",
    people: [{ id: "p-1", name: "Alex Rivera", checkedIn: false }],
    movable: true,
  };

  it("takes the amount, what is paid and the state from bookingPayments", () => {
    const [item] = withBookingPayments(
      [booking],
      [
        {
          bookingId: "b-1",
          orderId: "o-1",
          totalMinor: 4_800,
          paidMinor: 0,
          currency: "USD",
          paymentState: "unpaid",
          due: true,
        },
      ],
    );
    expect(item).toMatchObject({
      amountMinor: 4_800,
      paidMinor: 0,
      paymentState: "unpaid",
    });
    expect(item!.people[0]!.payment).toBe("due");
  });

  it("leaves other items, and bookings it has no answer for, alone", () => {
    const session = {
      ...booking,
      id: "s-1",
      source: "calendar-session" as const,
    };
    expect(withBookingPayments([session, booking], [])).toEqual([
      session,
      booking,
    ]);
  });
});
