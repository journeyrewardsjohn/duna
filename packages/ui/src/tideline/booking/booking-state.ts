/**
 * The state of a "book a lesson" flow: format, coach, day, slot and add-ons.
 * Pure: no clock, no network, no framework. The page supplies the catalogue
 * and renders what the selectors return.
 */
import {
  compareDates,
  type IsoDate,
  type IsoTime,
} from "../calendar/date-utils";

export const ANY_COACH = "any";

export interface LessonFormat {
  id: string;
  name: string;
  /** Who and how long, like "1 athlete · 60 min". */
  meta: string;
  priceCents: number;
  /** What the price is for, like "per session". */
  unit: string;
}

export interface LessonCoach {
  id: string;
  name: string;
  credential: string;
  avatarUrl?: string;
}

export interface LessonSlot {
  id: string;
  date: IsoDate;
  start: IsoTime;
  end: IsoTime;
  coachId: string;
  /** The formats this session can be booked as. */
  formatIds: ReadonlyArray<string>;
  booked?: boolean;
}

export interface BookingAddOn {
  id: string;
  name: string;
  detail: string;
  priceCents: number;
}

export interface BookingCatalog {
  formats: ReadonlyArray<LessonFormat>;
  coaches: ReadonlyArray<LessonCoach>;
  slots: ReadonlyArray<LessonSlot>;
  addOns?: ReadonlyArray<BookingAddOn>;
}

export interface BookingState {
  formatId: string;
  /** A coach id, or `ANY_COACH`. */
  coachId: string;
  date: IsoDate | null;
  slotId: string | null;
  addOnIds: ReadonlyArray<string>;
}

export type BookingAction =
  | { type: "format"; id: string }
  | { type: "coach"; id: string }
  | { type: "day"; date: IsoDate }
  | { type: "slot"; id: string | null }
  | { type: "addOn"; id: string; on: boolean };

export interface BookingLineItem {
  id: string;
  name: string;
  detail: string;
  priceCents: number;
}

/** Sessions that fit the chosen format and coach, on any day. */
export function matchingSlots(
  catalog: BookingCatalog,
  state: Pick<BookingState, "formatId" | "coachId">,
): LessonSlot[] {
  return catalog.slots.filter(
    (slot) =>
      slot.formatIds.includes(state.formatId) &&
      (state.coachId === ANY_COACH || slot.coachId === state.coachId),
  );
}

/** Days with at least one open session for the chosen format and coach. */
export function openDays(
  catalog: BookingCatalog,
  state: Pick<BookingState, "formatId" | "coachId">,
): IsoDate[] {
  const days = new Set(
    matchingSlots(catalog, state)
      .filter((slot) => !slot.booked)
      .map((slot) => slot.date),
  );
  return [...days].sort(compareDates);
}

/** The chosen day's sessions, open and booked, in time order. */
export function slotsForDay(
  catalog: BookingCatalog,
  state: Pick<BookingState, "formatId" | "coachId" | "date">,
): LessonSlot[] {
  return matchingSlots(catalog, state)
    .filter((slot) => slot.date === state.date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function selectedSlot(
  catalog: BookingCatalog,
  state: BookingState,
): LessonSlot | undefined {
  return slotsForDay(catalog, state).find(
    (slot) => slot.id === state.slotId && !slot.booked,
  );
}

/** Keeps the day and slot only while they still fit the format and coach. */
function settle(catalog: BookingCatalog, state: BookingState): BookingState {
  const days = openDays(catalog, state);
  const date =
    state.date && days.includes(state.date) ? state.date : (days[0] ?? null);
  const next = { ...state, date };
  return { ...next, slotId: selectedSlot(catalog, next) ? next.slotId : null };
}

/** The first format, any coach and the first day with something open. */
export function initialBookingState(
  catalog: BookingCatalog,
  defaults: Partial<BookingState> = {},
): BookingState {
  return settle(catalog, {
    formatId: catalog.formats[0]?.id ?? "",
    coachId: ANY_COACH,
    date: null,
    slotId: null,
    addOnIds: [],
    ...defaults,
  });
}

export function bookingReducer(
  catalog: BookingCatalog,
  state: BookingState,
  action: BookingAction,
): BookingState {
  switch (action.type) {
    case "format":
      if (!catalog.formats.some((format) => format.id === action.id)) {
        return state;
      }
      return settle(catalog, { ...state, formatId: action.id });
    case "coach":
      if (
        action.id !== ANY_COACH &&
        !catalog.coaches.some((coach) => coach.id === action.id)
      ) {
        return state;
      }
      return settle(catalog, { ...state, coachId: action.id });
    case "day":
      // A day with nothing open cannot be chosen.
      if (!openDays(catalog, state).includes(action.date)) return state;
      return { ...state, date: action.date, slotId: null };
    case "slot": {
      if (action.id === null) return { ...state, slotId: null };
      const next = { ...state, slotId: action.id };
      return selectedSlot(catalog, next) ? next : state;
    }
    case "addOn": {
      if (!catalog.addOns?.some((addOn) => addOn.id === action.id)) {
        return state;
      }
      const others = state.addOnIds.filter((id) => id !== action.id);
      return {
        ...state,
        addOnIds: action.on ? [...others, action.id] : others,
      };
    }
  }
}

export function bookingLineItems(
  catalog: BookingCatalog,
  state: BookingState,
  describeSlot: (slot: LessonSlot | undefined) => string,
): BookingLineItem[] {
  const format = catalog.formats.find((item) => item.id === state.formatId);
  const items: BookingLineItem[] = format
    ? [
        {
          id: format.id,
          name: `${format.name} lesson`,
          detail: describeSlot(selectedSlot(catalog, state)),
          priceCents: format.priceCents,
        },
      ]
    : [];
  for (const addOn of catalog.addOns ?? []) {
    if (state.addOnIds.includes(addOn.id)) items.push({ ...addOn });
  }
  return items;
}

export function bookingTotalCents(
  catalog: BookingCatalog,
  state: BookingState,
): number {
  return bookingLineItems(catalog, state, () => "").reduce(
    (total, item) => total + item.priceCents,
    0,
  );
}

/** The action enables only once an open slot is chosen. */
export function canContinueBooking(
  catalog: BookingCatalog,
  state: BookingState,
): boolean {
  return selectedSlot(catalog, state) !== undefined;
}

/** `15000` is "$150.00"; whole amounts can drop the cents for a price tag. */
export function formatMoney(
  cents: number,
  {
    currency = "USD",
    locale = "en-US",
    wholeUnits = false,
  }: { currency?: string; locale?: string; wholeUnits?: boolean } = {},
): string {
  const whole = wholeUnits && cents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/** "15:00" to "16:00" is "3:00–4:00pm"; across noon, "11:30am–12:30pm". */
export function formatTimeRange(start: IsoTime, end: IsoTime): string {
  const part = (time: IsoTime) => {
    const [hours = 0, minutes = 0] = time.split(":").map(Number);
    return {
      text: `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")}`,
      period: hours < 12 ? "am" : "pm",
    };
  };
  const from = part(start);
  const to = part(end);
  return from.period === to.period
    ? `${from.text}–${to.text}${to.period}`
    : `${from.text}${from.period}–${to.text}${to.period}`;
}
