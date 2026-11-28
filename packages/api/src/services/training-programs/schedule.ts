/**
 * Training programs (B4): the pure schedule maths. No database, no clock.
 *
 * - `generateOccurrences` turns weekly slots (wall-clock times in the
 *   program's time zone) and date exceptions into concrete practices. Times
 *   go through `wallTimeToInstant`, so a 4 PM practice stays at 4 PM local
 *   across a daylight-saving change.
 * - `planRegeneration` compares what the pattern wants with the sessions
 *   that exist. It never moves or deletes a session someone has touched
 *   (responses, an outcome, a plan or focus, coaches assigned by hand, a
 *   coverage request, any status other than planned): those are reported as
 *   `needsReview` and left alone.
 * - `programWeeks` / `currentWeekNumber` number the weeks from the start date.
 */
import {
  addCalendarDays,
  localDateOf,
  localMinuteOf,
  minuteOfDayFromTime,
  wallTimeToInstant,
  weekdayOfDate,
} from "@duna/scheduling";

/** Two years of practice is the longest program a club can schedule. */
export const MAX_PROGRAM_DAYS = 731;
/** Hard cap on generated practices (14 slots × 104 weeks fits). */
export const MAX_OCCURRENCES = 1_500;

export interface SlotPattern {
  readonly id?: string;
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly intervalWeeks: number;
  readonly venueId?: string | null;
  readonly courtIds?: readonly string[];
}

export interface DateRange {
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface Occurrence {
  /** `${localDate}|${HH:MM}`: how an existing session is matched. */
  readonly key: string;
  readonly slotIndex: number;
  readonly localDate: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly venueId?: string;
  readonly courtId?: string;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function occurrenceKey(localDate: string, startMinute: number): string {
  return `${localDate}|${hhmm(startMinute)}`;
}

/** The key of an existing session, read in the program's time zone. */
export function sessionKey(startsAt: Date, timezone: string): string {
  const instant = startsAt.getTime();
  return occurrenceKey(
    localDateOf(instant, timezone),
    localMinuteOf(instant, timezone),
  );
}

export function dateInRanges(
  date: string,
  ranges: readonly DateRange[],
): boolean {
  return ranges.some(
    (range) => date >= range.startsOn && date <= range.endsOn,
  );
}

/**
 * Every practice the pattern produces between the start and end dates
 * (inclusive), minus exception dates. `intervalWeeks` counts weeks from the
 * Sunday-started week that contains the start date, so "every other
 * Monday" starts on the first week of the program.
 */
export function generateOccurrences(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly timezone: string;
  readonly slots: readonly SlotPattern[];
  readonly exceptions: readonly DateRange[];
}): Occurrence[] {
  const span = daysBetween(input.startDate, input.endDate);
  if (span < 0 || span > MAX_PROGRAM_DAYS) return [];
  const anchor = addCalendarDays(
    input.startDate,
    -weekdayOfDate(input.startDate),
  );
  const occurrences: Occurrence[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addCalendarDays(input.startDate, offset);
    if (dateInRanges(date, input.exceptions)) continue;
    const weekday = weekdayOfDate(date);
    const weekIndex = Math.floor(daysBetween(anchor, date) / 7);
    input.slots.forEach((slot, slotIndex) => {
      if (slot.weekday !== weekday) return;
      if (weekIndex % Math.max(1, slot.intervalWeeks) !== 0) return;
      const startMinute = minuteOfDayFromTime(slot.startsAt.slice(0, 5));
      const endMinute = minuteOfDayFromTime(slot.endsAt.slice(0, 5));
      if (endMinute <= startMinute) return;
      occurrences.push({
        key: occurrenceKey(date, startMinute),
        slotIndex,
        localDate: date,
        startMinute,
        endMinute,
        startsAt: new Date(wallTimeToInstant(date, startMinute, input.timezone)),
        endsAt: new Date(wallTimeToInstant(date, endMinute, input.timezone)),
        ...(slot.venueId ? { venueId: slot.venueId } : {}),
        ...(slot.courtIds?.[0] ? { courtId: slot.courtIds[0] } : {}),
      });
    });
    if (occurrences.length > MAX_OCCURRENCES) break;
  }
  occurrences.sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  );
  // Two slots on the same day and time make one practice, not two.
  const seen = new Set<string>();
  return occurrences
    .filter((occurrence) => {
      if (seen.has(occurrence.key)) return false;
      seen.add(occurrence.key);
      return true;
    })
    .slice(0, MAX_OCCURRENCES);
}

export interface ExistingSession {
  readonly id: string;
  readonly key: string;
  readonly startsAt: Date;
  readonly status: string;
  readonly source: string;
  /** Someone has relied on it: never moved or removed automatically. */
  readonly touched: boolean;
}

export interface RegenerationPlan {
  readonly create: readonly Occurrence[];
  readonly remove: readonly string[];
  readonly keep: readonly string[];
  readonly needsReview: readonly string[];
}

/**
 * What to change so future pattern-generated sessions match the pattern.
 * Only `source = "program"` sessions that start after `now` are candidates
 * for removal; manual, imported and past sessions are never touched. A
 * cancelled session keeps its slot (the pattern does not re-create it).
 * Running it twice in a row produces an empty plan the second time.
 */
export function planRegeneration(input: {
  readonly desired: readonly Occurrence[];
  readonly existing: readonly ExistingSession[];
  readonly now: Date;
}): RegenerationPlan {
  const future = input.desired.filter(
    (occurrence) => occurrence.startsAt > input.now,
  );
  const existingKeys = new Set(input.existing.map((session) => session.key));
  const desiredKeys = new Set(future.map((occurrence) => occurrence.key));
  const remove: string[] = [];
  const keep: string[] = [];
  const needsReview: string[] = [];
  for (const session of input.existing) {
    const candidate =
      session.source === "program" &&
      session.startsAt > input.now &&
      session.status !== "cancelled";
    if (!candidate || desiredKeys.has(session.key)) {
      keep.push(session.id);
    } else if (session.touched) {
      needsReview.push(session.id);
    } else {
      remove.push(session.id);
    }
  }
  return {
    create: future.filter((occurrence) => !existingKeys.has(occurrence.key)),
    remove,
    keep,
    needsReview,
  };
}

export interface ProgramWeek {
  readonly weekNumber: number;
  readonly startsOn: string;
}

/** Weeks numbered from the start date, the last one partial if needed. */
export function programWeeks(startDate: string, endDate: string): ProgramWeek[] {
  const span = daysBetween(startDate, endDate);
  if (span < 0) return [];
  const count = Math.min(105, Math.floor(span / 7) + 1);
  return Array.from({ length: count }, (_, index) => ({
    weekNumber: index + 1,
    startsOn: addCalendarDays(startDate, index * 7),
  }));
}

/** "Week 3 of 12" while the program runs; undefined before or after it. */
export function currentWeekNumber(
  today: string,
  startDate: string,
  endDate: string,
): number | undefined {
  if (today < startDate || today > endDate) return undefined;
  return Math.floor(daysBetween(startDate, today) / 7) + 1;
}

/** Weeks in which every day is inside a break or blackout. */
export function weeksOff(
  weeks: readonly ProgramWeek[],
  endDate: string,
  ranges: readonly DateRange[],
): number {
  return weeks.filter((week) => {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addCalendarDays(week.startsOn, offset);
      if (date > endDate) break;
      if (!dateInRanges(date, ranges)) return false;
    }
    return true;
  }).length;
}

/** Weekday names for descriptions, 0 = Sunday ("Saturday practice"). */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
