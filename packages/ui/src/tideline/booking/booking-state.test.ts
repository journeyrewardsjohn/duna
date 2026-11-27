import { describe, expect, it } from "vitest";
import {
  ANY_COACH,
  type BookingCatalog,
  bookingLineItems,
  bookingReducer,
  bookingTotalCents,
  canChooseSlot,
  canContinueBooking,
  formatMoney,
  formatTimeRange,
  initialBookingState,
  openDays,
  slotsForDay,
} from "./booking-state";

const catalog: BookingCatalog = {
  formats: [
    {
      id: "private",
      name: "Private",
      meta: "1 athlete · 60 min",
      priceCents: 15000,
      unit: "per session",
    },
    {
      id: "group",
      name: "Group",
      meta: "2–4 players · 90 min",
      priceCents: 10000,
      unit: "per player",
    },
  ],
  coaches: [
    { id: "a", name: "Coach A", credential: "Head coach" },
    { id: "b", name: "Coach B", credential: "Certified trainer" },
  ],
  slots: [
    {
      id: "s1",
      date: "2026-11-26",
      start: "15:00",
      end: "16:00",
      coachId: "b",
      formatIds: ["private"],
    },
    {
      id: "s2",
      date: "2026-11-26",
      start: "16:00",
      end: "17:00",
      coachId: "a",
      formatIds: ["private"],
      booked: true,
    },
    {
      id: "s3",
      date: "2026-11-27",
      start: "09:00",
      end: "10:30",
      coachId: "a",
      formatIds: ["group"],
    },
    {
      id: "s4",
      date: "2026-11-28",
      start: "09:00",
      end: "10:00",
      coachId: "a",
      formatIds: ["private", "group"],
    },
    {
      id: "s5",
      date: "2026-11-29",
      start: "09:00",
      end: "10:00",
      coachId: "b",
      formatIds: ["private"],
      booked: true,
    },
  ],
  addOns: [
    {
      id: "membership",
      name: "Club membership",
      detail: "Annual",
      priceCents: 10000,
    },
  ],
};
const run = (
  state: ReturnType<typeof initialBookingState>,
  ...actions: Parameters<typeof bookingReducer>[2][]
) =>
  actions.reduce(
    (next, action) => bookingReducer(catalog, next, action),
    state,
  );

describe("booking state", () => {
  it("refuses a slot left over from an earlier day while the new day loads", () => {
    // The list still shows the 26th's sessions; the person moved to the 28th.
    const moved = bookingReducer(catalog, initialBookingState(catalog), {
      type: "day",
      date: "2026-11-28",
    });
    expect(canChooseSlot(catalog, moved, "s1")).toBe(false);
    // Dispatching it anyway changes nothing, which is why the list must
    // cancel the press rather than ask for a value the state will not take.
    expect(bookingReducer(catalog, moved, { type: "slot", id: "s1" })).toBe(
      moved,
    );
    expect(canChooseSlot(catalog, moved, "s4")).toBe(true);
    // Booked, unknown and wrong-format sessions are refused too.
    const first = initialBookingState(catalog);
    expect(canChooseSlot(catalog, first, "s2")).toBe(false);
    expect(canChooseSlot(catalog, first, "nope")).toBe(false);
    expect(canChooseSlot(catalog, first, "s1")).toBe(true);
  });

  it("starts on the first format, any coach and the first open day", () => {
    expect(initialBookingState(catalog)).toEqual({
      formatId: "private",
      coachId: ANY_COACH,
      date: "2026-11-26",
      slotId: null,
      addOnIds: [],
    });
  });

  it("lists only days with an open session for the format and coach", () => {
    const state = initialBookingState(catalog);
    // The 29th has a private session, but it is booked.
    expect(openDays(catalog, state)).toEqual(["2026-11-26", "2026-11-28"]);
    expect(openDays(catalog, { ...state, coachId: "a" })).toEqual([
      "2026-11-28",
    ]);
    expect(openDays(catalog, { ...state, formatId: "group" })).toEqual([
      "2026-11-27",
      "2026-11-28",
    ]);
  });

  it("shows a day's sessions in time order, booked ones included", () => {
    const state = initialBookingState(catalog);
    expect(slotsForDay(catalog, state).map((slot) => slot.id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(
      slotsForDay(catalog, { ...state, coachId: "a" }).map((slot) => slot.id),
    ).toEqual(["s2"]);
  });

  it("selects an open slot and refuses a booked or foreign one", () => {
    const state = initialBookingState(catalog);
    expect(run(state, { type: "slot", id: "s1" }).slotId).toBe("s1");
    expect(run(state, { type: "slot", id: "s2" }).slotId).toBeNull();
    expect(run(state, { type: "slot", id: "s3" }).slotId).toBeNull();
    expect(
      run(state, { type: "slot", id: "s1" }, { type: "slot", id: null }).slotId,
    ).toBeNull();
  });

  it("changing the format refilters and clears a selection that no longer fits", () => {
    const chosen = run(initialBookingState(catalog), {
      type: "slot",
      id: "s1",
    });
    const group = run(chosen, { type: "format", id: "group" });
    // The 26th has no group session: the day moves on and the slot clears.
    expect(group).toMatchObject({
      formatId: "group",
      date: "2026-11-27",
      slotId: null,
    });
  });

  it("changing the format keeps a slot that is offered in both", () => {
    const chosen = run(
      initialBookingState(catalog),
      { type: "day", date: "2026-11-28" },
      { type: "slot", id: "s4" },
    );
    expect(run(chosen, { type: "format", id: "group" })).toMatchObject({
      date: "2026-11-28",
      slotId: "s4",
    });
  });

  it("changing the coach refilters and clears a selection that no longer fits", () => {
    const chosen = run(initialBookingState(catalog), {
      type: "slot",
      id: "s1",
    });
    expect(run(chosen, { type: "coach", id: "a" })).toMatchObject({
      coachId: "a",
      date: "2026-11-28",
      slotId: null,
    });
    expect(run(chosen, { type: "coach", id: "b" })).toMatchObject({
      date: "2026-11-26",
      slotId: "s1",
    });
  });

  it("picking a day clears the slot, and a day with nothing open is refused", () => {
    const chosen = run(initialBookingState(catalog), {
      type: "slot",
      id: "s1",
    });
    expect(run(chosen, { type: "day", date: "2026-11-28" })).toMatchObject({
      date: "2026-11-28",
      slotId: null,
    });
    expect(run(chosen, { type: "day", date: "2026-11-29" })).toBe(chosen);
  });

  it("ignores unknown formats, coaches and add-ons", () => {
    const state = initialBookingState(catalog);
    expect(run(state, { type: "format", id: "nope" })).toBe(state);
    expect(run(state, { type: "coach", id: "nope" })).toBe(state);
    expect(run(state, { type: "addOn", id: "nope", on: true })).toBe(state);
  });

  it("totals the format and add-ons, and updates with each change", () => {
    const state = initialBookingState(catalog);
    expect(bookingTotalCents(catalog, state)).toBe(15000);
    const withMembership = run(state, {
      type: "addOn",
      id: "membership",
      on: true,
    });
    expect(bookingTotalCents(catalog, withMembership)).toBe(25000);
    expect(
      bookingTotalCents(
        catalog,
        run(withMembership, { type: "format", id: "group" }),
      ),
    ).toBe(20000);
    const twice = run(withMembership, {
      type: "addOn",
      id: "membership",
      on: true,
    });
    expect(twice.addOnIds).toEqual(["membership"]);
    expect(
      bookingTotalCents(
        catalog,
        run(twice, { type: "addOn", id: "membership", on: false }),
      ),
    ).toBe(15000);
  });

  it("describes the line items from the chosen slot", () => {
    const state = run(initialBookingState(catalog), { type: "slot", id: "s1" });
    const describe = (slot?: { id: string }) =>
      slot ? `slot ${slot.id}` : "none";
    expect(bookingLineItems(catalog, state, describe)).toEqual([
      {
        id: "private",
        name: "Private lesson",
        detail: "slot s1",
        priceCents: 15000,
      },
    ]);
    expect(
      bookingLineItems(catalog, { ...state, slotId: null }, describe)[0]!
        .detail,
    ).toBe("none");
  });

  it("enables the action only when an open slot is chosen", () => {
    const state = initialBookingState(catalog);
    expect(canContinueBooking(catalog, state)).toBe(false);
    const chosen = run(state, { type: "slot", id: "s1" });
    expect(canContinueBooking(catalog, chosen)).toBe(true);
    expect(
      canContinueBooking(catalog, run(chosen, { type: "coach", id: "a" })),
    ).toBe(false);
  });

  it("has no day when nothing is open at all", () => {
    const empty = { ...catalog, slots: [] };
    expect(initialBookingState(empty).date).toBeNull();
  });
});

describe("booking formatting", () => {
  it("formats money in US dollars", () => {
    expect(formatMoney(15000)).toBe("$150.00");
    expect(formatMoney(15000, { wholeUnits: true })).toBe("$150");
    expect(formatMoney(1250, { wholeUnits: true })).toBe("$12.50");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("formats a time range the way people say it", () => {
    expect(formatTimeRange("15:00", "16:00")).toBe("3:00–4:00pm");
    expect(formatTimeRange("11:30", "12:30")).toBe("11:30am–12:30pm");
    expect(formatTimeRange("00:00", "01:00")).toBe("12:00–1:00am");
    expect(formatTimeRange("12:00", "13:30")).toBe("12:00–1:30pm");
  });
});
