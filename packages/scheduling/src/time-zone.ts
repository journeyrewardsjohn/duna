/**
 * Wall-clock ↔ instant conversion for IANA time zones, pure and deterministic
 * (Intl only, no Date-local methods). Used by staff availability, where a
 * club's weekly windows are wall-clock times in the club's time zone.
 *
 * Daylight-saving rules:
 * - A wall time that does not exist (the spring-forward gap, 02:30 in New
 *   York on the second Sunday of March) resolves to the instant the clock
 *   resumes at the same distance past the gap's start: 02:30 → 03:30 EDT.
 * - A wall time that happens twice (the fall-back hour) resolves to the
 *   earlier instant.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

/** True when the runtime knows the IANA zone ("Europe/Madrid"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface WallParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function wallParts(instantMs: number, timeZone: string): WallParts {
  const values: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: (values.hour ?? 0) % 24,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** The zone's offset from UTC at an instant, in milliseconds. */
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const wall = wallParts(instantMs, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return asUtc - Math.floor(instantMs / 1_000) * 1_000;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid calendar date: ${date}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/**
 * The instant of `minuteOfDay` minutes after local midnight of `date` in
 * `timeZone`. `minuteOfDay` may exceed 1440 (a window that runs past
 * midnight ends on the next calendar day).
 */
export function wallTimeToInstant(
  date: string,
  minuteOfDay: number,
  timeZone: string,
): number {
  const { year, month, day } = parseDate(date);
  const local = Date.UTC(year, month - 1, day) + minuteOfDay * MINUTE_MS;
  const before = zoneOffsetMs(local - DAY_MS, timeZone);
  const after = zoneOffsetMs(local + DAY_MS, timeZone);
  const candidates = [...new Set([local - before, local - after])].filter(
    (candidate) => candidate + zoneOffsetMs(candidate, timeZone) === local,
  );
  if (candidates.length > 0) return Math.min(...candidates);
  // In the gap: keep the pre-transition offset, which lands after the gap.
  return local - before;
}

/** The local calendar date ("2026-03-08") of an instant in a zone. */
export function localDateOf(instantMs: number, timeZone: string): string {
  const wall = wallParts(instantMs, timeZone);
  return `${String(wall.year).padStart(4, "0")}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
}

/** Minutes after local midnight of an instant in a zone. */
export function localMinuteOf(instantMs: number, timeZone: string): number {
  const wall = wallParts(instantMs, timeZone);
  return wall.hour * 60 + wall.minute;
}

export function addCalendarDays(date: string, days: number): string {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOfDate(date: string): number {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "07:30" or "07:30:00" (or "24:00:00") → minutes after midnight. */
export function minuteOfDayFromTime(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid time of day: ${value}`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 24 * 60) throw new Error(`Invalid time of day: ${value}`);
  return minutes;
}

/** Minutes after midnight → "HH:MM" (1440 → "24:00"). */
export function timeFromMinuteOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
