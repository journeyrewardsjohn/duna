/**
 * Calendar and wall-clock math in an IANA time zone, built only on
 * `Intl.DateTimeFormat` (available in Node, browsers and Hermes). Instants are
 * epoch milliseconds; local dates are `YYYY-MM-DD` strings. No function reads
 * the clock.
 */

/** A calendar date in `YYYY-MM-DD` form. */
export type IsoDate = string;

export interface CivilDate {
  readonly year: number;
  /** 1 to 12. */
  readonly month: number;
  readonly day: number;
}

export interface ZonedParts extends CivilDate {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock parts of an instant in a time zone. */
export function zonedParts(instantMs: number, timeZone: string): ZonedParts {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instantMs)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: (values.hour ?? 0) % 24,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** Offset of the zone from UTC at an instant, in milliseconds. */
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const p = zonedParts(instantMs, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

export function toIsoDate(date: CivilDate): IsoDate {
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** Parses a real calendar date, or returns `null`. */
export function parseIsoDate(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** The local calendar date of an instant in a zone. */
export function localDateOf(instantMs: number, timeZone: string): IsoDate {
  return toIsoDate(zonedParts(instantMs, timeZone));
}

/** Adds whole calendar days to a date (negative subtracts). */
export function addDays(date: CivilDate, days: number): CivilDate {
  const moved = new Date(
    Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS,
  );
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

/** Day of week of a calendar date: 0 is Sunday. */
export function weekdayOf(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * The instant at which the wall clock in `timeZone` reads the given date and
 * minutes after midnight. For a wall time that occurs twice (fall back) the
 * result is the first occurrence; for one that does not exist (inside a spring
 * forward gap) the result is an instant within an hour of the gap, so callers
 * should not rely on it (midnight and ordinary opening hours never fall in
 * one).
 */
export function zonedTimeToInstant(
  date: CivilDate,
  minutesAfterMidnight: number,
  timeZone: string,
): number {
  const wallAsUtc =
    Date.UTC(date.year, date.month - 1, date.day) +
    minutesAfterMidnight * MINUTE_MS;
  // Two passes settle the offset, including across a transition.
  let guess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  guess = wallAsUtc - zoneOffsetMs(guess, timeZone);
  // Prefer the earlier of two valid instants (fall back).
  const earlier = guess - 3_600_000;
  if (wallAsUtc - zoneOffsetMs(earlier, timeZone) === earlier) return earlier;
  return guess;
}

/** Length of a local calendar day in minutes: 1380 / 1500 on a DST change. */
export function dayLengthMinutes(date: CivilDate, timeZone: string): number {
  const start = zonedTimeToInstant(date, 0, timeZone);
  const end = zonedTimeToInstant(addDays(date, 1), 0, timeZone);
  return Math.round((end - start) / MINUTE_MS);
}
