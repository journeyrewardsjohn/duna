import { describe, expect, it } from "vitest";
import {
  canContinue,
  checkoutSettled,
  confirmingPhase,
  courtFlowReducer,
  initialFlowState,
  moneyOutcome,
  type CourtFlowEvent,
  type CourtFlowState,
} from "./court-flow";
import {
  conditionsAt,
  courtSlots,
  localStart,
  openMatchesAt,
  slotsAt,
} from "./court-times";

const chosen = {
  venueId: "venue-1",
  date: "2026-11-28",
  durationMinutes: 90,
  localStartsAt: "2026-11-28T11:30",
  courtId: "court-2",
};

function run(state: CourtFlowState, ...events: CourtFlowEvent[]) {
  return events.reduce(courtFlowReducer, state);
}

const guest = { personId: "p-2", name: "Taylor Crabb" };

describe("court booking flow: nothing is asked twice", () => {
  it("opens on Who's playing when the time and court were chosen on the court-times screen", () => {
    const state = initialFlowState({ selection: chosen });
    expect(state.step).toBe("players");
    expect(state.selection).toEqual(chosen);
  });

  it("opens on the time only when no time was chosen yet", () => {
    const state = initialFlowState({
      selection: {
        venueId: "venue-1",
        date: "2026-11-28",
        durationMinutes: 90,
      },
    });
    expect(state.step).toBe("time");
    expect(canContinue(state)).toBe(false);
  });

  it("a start time with one open court chooses that court", () => {
    const state = run(
      initialFlowState({
        selection: { venueId: "v", date: "2026-11-28", durationMinutes: 60 },
      }),
      {
        type: "choose-time",
        localStartsAt: "2026-11-28T08:00",
        openCourtIds: ["c1"],
      },
    );
    expect(state.selection.courtId).toBe("c1");
    expect(canContinue(state)).toBe(true);
  });

  it("a start time with several open courts waits for the court", () => {
    const state = run(
      initialFlowState({
        selection: { venueId: "v", date: "2026-11-28", durationMinutes: 60 },
      }),
      {
        type: "choose-time",
        localStartsAt: "2026-11-28T08:00",
        openCourtIds: ["c1", "c2"],
      },
    );
    expect(state.selection.courtId).toBeUndefined();
    expect(
      run(state, { type: "choose-court", courtId: "c2" }).selection.courtId,
    ).toBe("c2");
  });

  it("a new start keeps the chosen court when it is open then", () => {
    const state = run(initialFlowState({ selection: chosen }), {
      type: "choose-time",
      localStartsAt: "2026-11-28T12:00",
      openCourtIds: ["court-1", "court-2"],
    });
    expect(state.selection.courtId).toBe("court-2");
  });
});

describe("court booking flow: back keeps choices", () => {
  it("back from paying to the roster to the time keeps the roster, the payment and the policy", () => {
    let state = run(
      initialFlowState({ selection: chosen, intent: "host" }),
      { type: "set-guests", guests: [guest] },
      { type: "set-payment-mode", mode: "split" },
      { type: "continue" },
      { type: "accept-policy", read: true },
    );
    expect(state.step).toBe("pay");
    state = run(state, { type: "back" });
    expect(state.step).toBe("players");
    state = run(state, { type: "back" });
    expect(state.step).toBe("time");
    expect(state.selection).toEqual(chosen);
    expect(state.guests).toEqual([guest]);
    expect(state.paymentMode).toBe("split");
    expect(state.intent).toBe("host");
    expect(state.policyAccepted).toBe(true);
    state = run(state, { type: "continue" }, { type: "continue" });
    expect(state.step).toBe("pay");
    expect(
      canContinue(state, { policyRequired: true, requireFullScroll: true }),
    ).toBe(true);
  });

  it("a new day clears only the time, court and policy; the roster stays", () => {
    const state = run(
      initialFlowState({ selection: chosen }),
      { type: "set-guests", guests: [guest] },
      { type: "accept-policy", read: false },
      { type: "back" },
      { type: "set-date", date: "2026-11-29" },
    );
    expect(state.selection).toEqual({
      venueId: "venue-1",
      date: "2026-11-29",
      durationMinutes: 90,
    });
    expect(state.guests).toEqual([guest]);
    expect(state.policyAccepted).toBe(false);
  });

  it("splitting needs a guest, and removing the last guest returns to paying everything", () => {
    let state = initialFlowState({ selection: chosen });
    expect(
      run(state, { type: "set-payment-mode", mode: "split" }).paymentMode,
    ).toBe("full");
    state = run(
      state,
      { type: "set-guests", guests: [guest] },
      { type: "set-payment-mode", mode: "split" },
    );
    expect(state.paymentMode).toBe("split");
    expect(run(state, { type: "set-guests", guests: [] }).paymentMode).toBe(
      "full",
    );
  });
});

describe("court booking flow: paying", () => {
  const atPay = run(initialFlowState({ selection: chosen }), {
    type: "continue",
  });

  it("pay is single flight and counts attempts", () => {
    const paying = run(atPay, { type: "pay" });
    expect(paying.step).toBe("confirming");
    expect(paying.attempt).toBe(1);
    expect(run(paying, { type: "pay" }).attempt).toBe(1);
  });

  it("closing the payment sheet returns to paying with everything kept", () => {
    const state = run(atPay, { type: "pay" }, { type: "payment-cancelled" });
    expect(state.step).toBe("pay");
    expect(state.selection).toEqual(chosen);
  });

  it("progress only moves forward, then confirmed", () => {
    const state = run(
      atPay,
      { type: "pay" },
      { type: "progress", phase: 2 },
      { type: "progress", phase: 1 },
    );
    expect(state.phase).toBe(2);
    const done = run(state, { type: "confirmed", bookingId: "b1" });
    expect(done.step).toBe("confirmed");
    expect(done.bookingId).toBe("b1");
  });

  it("a failure says what happened to the money; retry returns to paying", () => {
    const failed = run(
      atPay,
      { type: "pay" },
      {
        type: "failed",
        failure: { message: "Taken", money: "not-charged", reference: "err_1" },
      },
    );
    expect(failed.failure?.money).toBe("not-charged");
    const retried = run(failed, { type: "retry" });
    expect(retried.step).toBe("pay");
    expect(run(retried, { type: "pay" }).failure).toBeUndefined();
  });
});

describe("confirming steps follow the checkout status", () => {
  const base = {
    bookingStatus: "held",
    complete: false,
    sharePaid: false,
    awaitingParticipants: false,
  };
  it("payment, court, then match and invitations", () => {
    expect(confirmingPhase(base, "host")).toBe(0);
    expect(confirmingPhase({ ...base, sharePaid: true }, "host")).toBe(1);
    expect(
      confirmingPhase(
        {
          ...base,
          sharePaid: true,
          complete: true,
          bookingStatus: "confirmed",
        },
        "host",
      ),
    ).toBe(2);
    expect(
      confirmingPhase(
        {
          ...base,
          sharePaid: true,
          complete: true,
          bookingStatus: "confirmed",
          match: { id: "m" },
        },
        "host",
      ),
    ).toBe(3);
    expect(
      confirmingPhase(
        {
          ...base,
          sharePaid: true,
          complete: true,
          bookingStatus: "confirmed",
        },
        "private",
      ),
    ).toBe(3);
  });
  it("a split booking held for the others counts as secured", () => {
    expect(
      confirmingPhase(
        { ...base, sharePaid: true, awaitingParticipants: true },
        "private",
      ),
    ).toBe(3);
  });
  it("settles on a cancelled hold and says the money honestly", () => {
    const lost = { ...base, sharePaid: true, bookingStatus: "expired" };
    expect(checkoutSettled(lost, "private")).toBe(true);
    expect(moneyOutcome(lost)).toBe("received-unresolved");
    expect(moneyOutcome({ ...lost, orderStatus: "refunded" })).toBe("refunded");
    expect(moneyOutcome({ ...base, sharePaid: true })).toBe("received-pending");
    expect(moneyOutcome({ ...base, orderStatus: "failed" })).toBe(
      "not-charged",
    );
    expect(moneyOutcome(undefined)).toBe("received-pending");
  });
});

describe("court times", () => {
  const slot = (court: string, start: string, amountMinor: number) => ({
    courtId: court,
    courtName: court === "c1" ? "Court 10" : "Court 2",
    startsAt: `2026-11-28T${start}:00.000Z`,
    endsAt: `2026-11-28T${start}:00.000Z`,
    localStartsAt: `2026-11-28T${start}:00`,
    localEndsAt: `2026-11-28T${start}:00`,
    durationMinutes: 90,
    price: { amountMinor, currency: "USD" as const },
    daylightStatus: "daylight" as const,
  });
  const availability = {
    slots: [
      slot("c1", "08:00", 3000),
      slot("c2", "08:00", 3000),
      slot("c2", "09:30", 2500),
    ],
    openMatches: [],
  };

  it("groups courts per start with the lowest price", () => {
    expect(courtSlots(availability)).toEqual([
      {
        startMinute: 480,
        available: true,
        remaining: 2,
        fromMinor: 3000,
        currency: "USD",
      },
      {
        startMinute: 570,
        available: true,
        remaining: 1,
        fromMinor: 2500,
        currency: "USD",
      },
    ]);
  });

  it("lists the courts at a start, cheapest then by name (numeric)", () => {
    expect(slotsAt(availability, 480).map((entry) => entry.courtName)).toEqual([
      "Court 2",
      "Court 10",
    ]);
    expect(slotsAt(availability, null)).toEqual([]);
    expect(openMatchesAt({ openMatches: [] }, 480)).toEqual([]);
  });

  it("formats the local start the checkout takes", () => {
    expect(localStart("2026-11-28", 570)).toBe("2026-11-28T09:30");
  });

  it("reads the slot's forecast as conditions, never a far-away hour", () => {
    const at = "2026-11-28T15:00:00.000Z";
    const conditions = conditionsAt(
      {
        slots: [],
        forecast: {
          hourly: [
            {
              startsAt: "2026-11-28T15:00:00.000Z",
              temperatureC: 17,
              windSpeedKph: 12,
              precipitationProbability: 10,
              condition: "Clear",
              icon: "clear",
            },
          ],
        } as never,
      },
      { startsAt: at },
    );
    expect(conditions).toEqual({
      at: Date.parse(at),
      temperatureC: 17,
      windSpeedKph: 12,
      precipChancePct: 10,
    });
    expect(
      conditionsAt(
        {
          slots: [],
          forecast: {
            hourly: [
              {
                startsAt: "2026-11-28T03:00:00.000Z",
                condition: "",
                icon: "clear",
              },
            ],
          } as never,
        },
        { startsAt: at },
      ),
    ).toBeUndefined();
  });
});
