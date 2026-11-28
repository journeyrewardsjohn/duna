/**
 * Dayparts: the venue's day in the light it will be played in. Morning,
 * midday, afternoon, golden hour and evening, with golden hour and evening
 * taken from the venue's own sunset (golden hour starts 60 minutes before it
 * by default, see `GOLDEN_HOUR_LEAD_MINUTES`).
 *
 * Minutes are WALL-CLOCK minutes after the venue's midnight, like
 * `timeSlots`, so a slot list and its daypart headings always agree.
 */
import { lightMarkFor, type LightMark, type SunTimes } from "./light";
import { wallClockMinutes } from "./time-zone";
import { zonedTimeToInstant, type CivilDate } from "./zoned-time";

export type Daypart =
  "morning" | "midday" | "afternoon" | "golden-hour" | "evening";

export const DAYPARTS: ReadonlyArray<Daypart> = [
  "morning",
  "midday",
  "afternoon",
  "golden-hour",
  "evening",
];

/** English headings; renderers may translate. */
export const DAYPART_LABELS: Readonly<Record<Daypart, string>> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  "golden-hour": "Golden hour",
  evening: "Evening",
};

/** Midday starts at 11:00 AM and the afternoon at 2:00 PM, unless golden hour comes first. */
export const MIDDAY_FROM_MINUTE = 11 * 60;
export const AFTERNOON_FROM_MINUTE = 14 * 60;
/** Without a sunset (polar day or night) the evening starts at 6:00 PM. */
export const EVENING_FALLBACK_MINUTE = 18 * 60;

/** The day's light in wall-clock minutes on the venue's clock. */
export interface DayLight {
  readonly sunriseMinute: number | null;
  readonly goldenHourMinute: number | null;
  readonly sunsetMinute: number | null;
  readonly civilDawnMinute: number | null;
  readonly civilDuskMinute: number | null;
}

/** Converts `sunTimes` for a venue's date into wall-clock minutes there. */
export function dayLightMinutes(
  sun: SunTimes,
  date: CivilDate,
  timeZone: string,
): DayLight {
  const at = (ms: number | null): number | null =>
    ms === null ? null : wallClockMinutes(ms, date, timeZone);
  return {
    sunriseMinute: at(sun.sunrise),
    goldenHourMinute: at(sun.goldenHourStart),
    sunsetMinute: at(sun.sunset),
    civilDawnMinute: at(sun.civilDawn),
    civilDuskMinute: at(sun.civilDusk),
  };
}

export interface DaypartBounds {
  readonly daypart: Daypart;
  /** First wall-clock minute of the daypart (inclusive). */
  readonly fromMinute: number;
  /** End (exclusive); the last one ends at 1440. */
  readonly toMinute: number;
}

/**
 * The five dayparts for a day, in order. A daypart that the day squeezes out
 * (an afternoon when golden hour starts at 1:30 PM in a northern winter) has
 * `fromMinute === toMinute`.
 */
export function daypartBounds(light: DayLight): ReadonlyArray<DaypartBounds> {
  const sunset = light.sunsetMinute ?? EVENING_FALLBACK_MINUTE;
  const golden =
    light.sunsetMinute === null ? sunset : (light.goldenHourMinute ?? sunset);
  const goldenFrom = Math.min(golden, sunset);
  const middayFrom = Math.min(MIDDAY_FROM_MINUTE, goldenFrom);
  const afternoonFrom = Math.min(AFTERNOON_FROM_MINUTE, goldenFrom);
  return [
    { daypart: "morning", fromMinute: 0, toMinute: middayFrom },
    { daypart: "midday", fromMinute: middayFrom, toMinute: afternoonFrom },
    { daypart: "afternoon", fromMinute: afternoonFrom, toMinute: goldenFrom },
    { daypart: "golden-hour", fromMinute: goldenFrom, toMinute: sunset },
    {
      daypart: "evening",
      fromMinute: sunset,
      toMinute: Math.max(1440, sunset),
    },
  ];
}

/** Which daypart a wall-clock minute falls in (after midnight counts as evening). */
export function daypartAt(minute: number, light: DayLight): Daypart {
  if (minute >= 1440) return "evening";
  const bounds = daypartBounds(light);
  const found = bounds.find(
    (b) =>
      b.toMinute > b.fromMinute &&
      minute >= b.fromMinute &&
      minute < b.toMinute,
  );
  return found?.daypart ?? "morning";
}

/** The light mark at a wall-clock minute on the venue's day. */
export function lightMarkAtMinute(
  minute: number,
  context: {
    readonly date: CivilDate;
    readonly timeZone: string;
    readonly sun: SunTimes;
    readonly courtIsLit: boolean;
  },
): LightMark {
  const instant = zonedTimeToInstant(context.date, minute, context.timeZone);
  return lightMarkFor(instant, {
    sun: context.sun,
    courtIsLit: context.courtIsLit,
  });
}

export interface DaypartGroup<Item> {
  readonly daypart: Daypart;
  readonly label: string;
  readonly fromMinute: number;
  readonly toMinute: number;
  readonly items: ReadonlyArray<Item>;
}

/**
 * Groups items (anything with a `startMinute`) by daypart, in time order.
 * Dayparts with no items are left out, so an empty morning never shows a
 * heading over nothing.
 */
export function groupByDaypart<Item extends { readonly startMinute: number }>(
  items: ReadonlyArray<Item>,
  light: DayLight,
): ReadonlyArray<DaypartGroup<Item>> {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute);
  const bounds = daypartBounds(light);
  return bounds
    .map((b) => ({
      daypart: b.daypart,
      label: DAYPART_LABELS[b.daypart],
      fromMinute: b.fromMinute,
      toMinute: b.toMinute,
      items: sorted.filter(
        (item) => daypartAt(item.startMinute, light) === b.daypart,
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The contract's light-mark glyph names. The core's `LightMark` says
 * `daylight` and `dark`; the brand book draws them as "Full sun" and the
 * "Too dark" mark for an unlit court.
 */
export type LightGlyph =
  "first-light" | "full-sun" | "golden-hour" | "under-lights" | "too-dark";

export const LIGHT_MARK_GLYPH: Readonly<Record<LightMark, LightGlyph>> = {
  "first-light": "first-light",
  daylight: "full-sun",
  "golden-hour": "golden-hour",
  "under-lights": "under-lights",
  dark: "too-dark",
};

/** English labels: a light mark is never shown without one. */
export const LIGHT_GLYPH_LABELS: Readonly<Record<LightGlyph, string>> = {
  "first-light": "First light",
  "full-sun": "Full sun",
  "golden-hour": "Golden hour",
  "under-lights": "Under lights",
  "too-dark": "Too dark",
};

/** The mark beside a daypart heading. */
export function daypartGlyph(
  daypart: Daypart,
  courtIsLit: boolean,
): LightGlyph {
  switch (daypart) {
    case "morning":
      return "first-light";
    case "midday":
    case "afternoon":
      return "full-sun";
    case "golden-hour":
      return "golden-hour";
    case "evening":
      return courtIsLit ? "under-lights" : "too-dark";
  }
}
