import { describe, expect, it } from "vitest";
import {
  bookingReducer,
  canConfirmCancel,
  confirmVerb,
  initialBookingState,
  methodsFor,
  primaryAction,
  type BookingState,
} from "./booking-machine";

const me = { personId: null, name: "You", dependent: false };
const child = { personId: "kid", name: "Ava", dependent: true };
const start = initialBookingState({ participant: me, method: "credit" });

function run(
  state: BookingState,
  ...events: Parameters<typeof bookingReducer>[1][]
) {
  return events.reduce(bookingReducer, state);
}

describe("booking state machine", () => {
  it("books with credits: choose, confirm, submit, success", () => {
    const done = run(
      start,
      { type: "choose-participant", participant: child },
      { type: "review" },
      { type: "submit" },
      { type: "succeeded", outcome: "booked" },
    );
    expect(done.step).toEqual({ kind: "success", outcome: "booked" });
    expect(done.draft.participant.name).toBe("Ava");
    expect(done.attempt).toBe(1);
  });

  it("is single flight: a second submit while submitting is ignored", () => {
    const submitting = run(start, { type: "review" }, { type: "submit" });
    expect(bookingReducer(submitting, { type: "submit" })).toBe(submitting);
    expect(
      bookingReducer(submitting, { type: "choose-method", method: "card" }),
    ).toBe(submitting);
  });

  it("returns to the confirmation when the card sheet is dismissed", () => {
    const back = run(
      start,
      { type: "choose-method", method: "card" },
      { type: "review" },
      { type: "submit" },
      { type: "payment-sheet" },
      { type: "payment-cancelled" },
    );
    expect(back.step.kind).toBe("confirm");
  });

  it("keeps a failure's reference and retries with a new attempt", () => {
    const failed = run(
      start,
      { type: "review" },
      { type: "submit" },
      { type: "failed", message: "No places left", reference: "ref-1" },
    );
    expect(failed.step).toEqual({
      kind: "failed",
      message: "No places left",
      reference: "ref-1",
    });
    const retried = run(failed, { type: "retry" }, { type: "submit" });
    expect(retried.attempt).toBe(2);
  });

  it("joins the waitlist and cancels with the late acknowledgement", () => {
    const waitlisted = run(
      start,
      { type: "review" },
      { type: "submit" },
      { type: "succeeded", outcome: "waitlisted", position: 3 },
    );
    expect(waitlisted.step).toEqual({
      kind: "success",
      outcome: "waitlisted",
      position: 3,
    });
    const cancelling = run(
      start,
      { type: "start-cancel" },
      { type: "acknowledge-late", value: true },
    );
    expect(cancelling.lateAcknowledged).toBe(true);
    expect(canConfirmCancel({ free: false, lateAcknowledged: false })).toBe(
      false,
    );
    expect(canConfirmCancel({ free: false, lateAcknowledged: true })).toBe(
      true,
    );
    expect(
      run(cancelling, { type: "submit" }, { type: "cancelled" }).step.kind,
    ).toBe("cancelled");
  });
});

describe("decisions", () => {
  const base = {
    alreadyBooked: false,
    waitlisted: false,
    waitlist: undefined,
    demo: false,
  };
  it("picks the main action from the state", () => {
    expect(primaryAction({ ...base, displayState: "needs-players" })).toBe(
      "book",
    );
    expect(primaryAction({ ...base, displayState: "full" })).toBe(
      "join-waitlist",
    );
    expect(
      primaryAction({ ...base, displayState: "full", waitlist: false }),
    ).toBe("closed");
    expect(primaryAction({ ...base, displayState: "cancelled-low" })).toBe(
      "closed",
    );
    expect(
      primaryAction({ ...base, displayState: "full", alreadyBooked: true }),
    ).toBe("already-booked");
    expect(
      primaryAction({ ...base, displayState: "full", waitlisted: true }),
    ).toBe("on-waitlist");
    expect(primaryAction({ ...base, displayState: "open", demo: true })).toBe(
      "preview",
    );
  });

  it("offers credits only for a child, and names the verb with the amount", () => {
    const prices = [
      { kind: "card" as const },
      { kind: "credit" as const },
      { kind: "cash" as const },
    ];
    expect(methodsFor({ prices, dependent: false })).toEqual([
      "credit",
      "card",
      "cash",
    ]);
    expect(methodsFor({ prices, dependent: true })).toEqual(["credit"]);
    expect(confirmVerb({ method: "credit", credits: 3 })).toBe(
      "Book for 3 credits",
    );
    expect(confirmVerb({ method: "card", amount: "$25.00" })).toBe(
      "Pay $25.00",
    );
    expect(confirmVerb({ method: "cash" })).toBe("Reserve and pay at the club");
  });
});
