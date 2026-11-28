/**
 * Staff availability (B3a): the one function every scheduling surface uses
 * to decide whether a team member is free.
 *
 *   availabilityFor(member, range, { schedules, blackouts, timeOff, commitments })
 *     → { free, busy }
 *
 * Contract:
 * - `free` and `busy` are sorted, non-overlapping and together cover the
 *   range exactly (they partition it). Adjacent intervals with the same
 *   state are merged.
 * - Weekly windows are wall-clock minutes in their schedule's IANA time zone
 *   (weekday 0 = Sunday). A window whose end is at or before its start, or
 *   past 1440, runs past midnight into the next day. Daylight-saving days
 *   follow `wallTimeToInstant` (gap → after the gap; repeated hour → first).
 * - The schedule in force on a local date D is the `active` schedule whose
 *   [effectiveFrom, effectiveTo] covers D (the latest `effectiveFrom` wins,
 *   so a planned successor takes over on its first day), else a `fallback`
 *   whose dates cover D. `draft` and `archived` schedules never count. A
 *   window belongs to the date it starts on, so an overnight window on the
 *   last day of a schedule still runs to its end.
 * - Free time is time inside a window of the schedule in force that is not
 *   covered by a blackout, approved time off (requested time off too when
 *   `countRequestedTimeOff`) or a commitment. Adding a blackout, time off or
 *   a commitment can therefore only turn free time into busy time.
 * - Each busy interval names every reason that applies, primary first, in
 *   this order: time-off, blackout, commitment, outside-hours, no-schedule.
 */
import {
  addCalendarDays,
  localDateOf,
  wallTimeToInstant,
  weekdayOfDate,
} from "./time-zone";

export type StaffScheduleStatus = "draft" | "active" | "fallback" | "archived";

export interface StaffAvailabilityWindow {
  /** 0 = Sunday … 6 = Saturday, in the schedule's time zone. */
  readonly weekday: number;
  /** Minutes after local midnight. */
  readonly startMinute: number;
  /** Minutes after local midnight; ≤ start or > 1440 means it ends the next day. */
  readonly endMinute: number;
  readonly kind?: string;
  readonly label?: string;
  readonly venueId?: string;
}

export interface StaffAvailabilitySchedule {
  readonly id: string;
  readonly status: StaffScheduleStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly timezone: string;
  readonly windows: readonly StaffAvailabilityWindow[];
}

export interface StaffBlackoutInput {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  /** A club-wide closure applies to every member; personal is the default. */
  readonly scope?: "personal" | "club";
  /** Repeats every year on the same local dates and times. */
  readonly recurrence?: "yearly";
  /** Zone for yearly recurrence (defaults to UTC). */
  readonly timezone?: string;
}

export interface StaffTimeOffInput {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: "requested" | "approved" | "declined" | "cancelled";
}

export interface StaffCommitment {
  readonly id: string;
  readonly kind: "session" | "training-event" | "lesson" | "calendar" | "other";
  readonly startsAt: string;
  readonly endsAt: string;
  readonly title?: string;
  readonly venueId?: string;
}

export interface StaffAvailabilityInputs {
  readonly schedules: readonly StaffAvailabilitySchedule[];
  readonly blackouts: readonly StaffBlackoutInput[];
  readonly timeOff: readonly StaffTimeOffInput[];
  readonly commitments: readonly StaffCommitment[];
}

export interface AvailabilityRange {
  readonly startsAt: string;
  readonly endsAt: string;
}

export type BusyReason =
  "time-off" | "blackout" | "commitment" | "outside-hours" | "no-schedule";

export const busyReasonPriority: readonly BusyReason[] = [
  "time-off",
  "blackout",
  "commitment",
  "outside-hours",
  "no-schedule",
];

export interface FreeInterval {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleId: string;
  readonly windowKind?: string;
  readonly venueId?: string;
}

export interface BusyInterval {
  readonly startsAt: string;
  readonly endsAt: string;
  /** The primary reason (first of `reasons`). */
  readonly reason: BusyReason;
  readonly reasons: readonly BusyReason[];
  /** Blackout, time-off and commitment ids behind this interval. */
  readonly sourceIds: readonly string[];
}

export interface AvailabilityResult {
  readonly staffProfileId: string;
  readonly range: AvailabilityRange;
  readonly free: readonly FreeInterval[];
  readonly busy: readonly BusyInterval[];
}

export interface AvailabilityOptions {
  /** Count requested (not yet approved) time off as busy. Default false. */
  readonly countRequestedTimeOff?: boolean;
  /** Commitments to ignore (the session being checked or re-staffed). */
  readonly ignoreCommitmentIds?: readonly string[];
}

interface Span {
  readonly start: number;
  readonly end: number;
}

interface WindowSpan extends Span {
  readonly scheduleId: string;
  readonly kind?: string;
  readonly venueId?: string;
}

interface SourcedSpan extends Span {
  readonly id: string;
}

function instant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid instant: ${value}`);
  return parsed;
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

/** The schedule in force on a local calendar date, or undefined. */
export function scheduleInForce(
  schedules: readonly StaffAvailabilitySchedule[],
  date: string,
): StaffAvailabilitySchedule | undefined {
  const covers = (schedule: StaffAvailabilitySchedule) =>
    schedule.effectiveFrom <= date &&
    (schedule.effectiveTo === undefined || schedule.effectiveTo >= date);
  const pick = (status: StaffScheduleStatus) =>
    schedules
      .filter((schedule) => schedule.status === status && covers(schedule))
      .sort(
        (left, right) =>
          right.effectiveFrom.localeCompare(left.effectiveFrom) ||
          left.id.localeCompare(right.id),
      )[0];
  return pick("active") ?? pick("fallback");
}

function windowSpans(
  schedules: readonly StaffAvailabilitySchedule[],
  start: number,
  end: number,
): WindowSpan[] {
  const counted = schedules.filter(
    (schedule) =>
      schedule.status === "active" || schedule.status === "fallback",
  );
  const zones = [...new Set(counted.map((schedule) => schedule.timezone))];
  const dates = new Set<string>();
  for (const zone of zones) {
    // Pad by two days: overnight windows start the day before.
    let date = addCalendarDays(localDateOf(start, zone), -2);
    const last = addCalendarDays(localDateOf(end, zone), 1);
    while (date <= last) {
      dates.add(date);
      date = addCalendarDays(date, 1);
    }
  }
  const spans: WindowSpan[] = [];
  for (const date of [...dates].sort()) {
    const schedule = scheduleInForce(counted, date);
    if (!schedule) continue;
    const weekday = weekdayOfDate(date);
    for (const window of schedule.windows) {
      if (window.weekday !== weekday) continue;
      const endMinute =
        window.endMinute <= window.startMinute
          ? window.endMinute + 1_440
          : window.endMinute;
      const spanStart = wallTimeToInstant(
        date,
        window.startMinute,
        schedule.timezone,
      );
      const spanEnd = wallTimeToInstant(date, endMinute, schedule.timezone);
      if (spanEnd <= spanStart || spanEnd <= start || spanStart >= end) {
        continue;
      }
      spans.push({
        start: Math.max(start, spanStart),
        end: Math.min(end, spanEnd),
        scheduleId: schedule.id,
        ...(window.kind ? { kind: window.kind } : {}),
        ...(window.venueId ? { venueId: window.venueId } : {}),
      });
    }
  }
  return spans;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function shiftYears(date: string, years: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const target = year + years;
  const safeDay = month === 2 && day === 29 && !isLeapYear(target) ? 28 : day;
  return `${String(target).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function minutesIntoDay(value: number, zone: string, date: string): number {
  return (value - wallTimeToInstant(date, 0, zone)) / 60_000;
}

/** Every occurrence of a blackout that can touch [start, end). */
export function blackoutOccurrences(
  blackout: StaffBlackoutInput,
  start: number,
  end: number,
): SourcedSpan[] {
  const first = {
    start: instant(blackout.startsAt),
    end: instant(blackout.endsAt),
  };
  if (blackout.recurrence !== "yearly") {
    return first.end > start && first.start < end
      ? [{ id: blackout.id, ...first }]
      : [];
  }
  const zone = blackout.timezone ?? "UTC";
  const startDate = localDateOf(first.start, zone);
  const endDate = localDateOf(first.end, zone);
  const startMinute = minutesIntoDay(first.start, zone, startDate);
  const endMinute = minutesIntoDay(first.end, zone, endDate);
  const fromYear = Number(localDateOf(start, zone).slice(0, 4)) - 1;
  const toYear = Number(localDateOf(end, zone).slice(0, 4)) + 1;
  const baseYear = Number(startDate.slice(0, 4));
  const occurrences: SourcedSpan[] = [];
  for (let year = Math.max(baseYear, fromYear); year <= toYear; year += 1) {
    const offset = year - baseYear;
    const occurrenceStart = wallTimeToInstant(
      shiftYears(startDate, offset),
      startMinute,
      zone,
    );
    const occurrenceEnd = wallTimeToInstant(
      shiftYears(endDate, offset),
      endMinute,
      zone,
    );
    if (occurrenceEnd > start && occurrenceStart < end) {
      occurrences.push({
        id: blackout.id,
        start: occurrenceStart,
        end: occurrenceEnd,
      });
    }
  }
  return occurrences;
}

interface SegmentState {
  readonly free: boolean;
  readonly window?: WindowSpan;
  readonly reasons: readonly BusyReason[];
  readonly sourceIds: readonly string[];
}

function sameState(left: SegmentState, right: SegmentState): boolean {
  if (left.free !== right.free) return false;
  if (left.free) {
    return (
      left.window?.scheduleId === right.window?.scheduleId &&
      left.window?.kind === right.window?.kind &&
      left.window?.venueId === right.window?.venueId
    );
  }
  return (
    left.reasons.join(",") === right.reasons.join(",") &&
    left.sourceIds.join(",") === right.sourceIds.join(",")
  );
}

/** Free and busy intervals, with reasons, for one member over a range. */
export function availabilityFor(
  member: { readonly staffProfileId: string },
  range: AvailabilityRange,
  inputs: StaffAvailabilityInputs,
  options: AvailabilityOptions = {},
): AvailabilityResult {
  const start = instant(range.startsAt);
  const end = instant(range.endsAt);
  if (!(end > start)) throw new Error("The range must end after it starts.");

  const windows = windowSpans(inputs.schedules, start, end);
  const blackouts = inputs.blackouts.flatMap((blackout) =>
    blackoutOccurrences(blackout, start, end),
  );
  const timeOff: SourcedSpan[] = inputs.timeOff
    .filter(
      (entry) =>
        entry.status === "approved" ||
        (options.countRequestedTimeOff === true &&
          entry.status === "requested"),
    )
    .map((entry) => ({
      id: entry.id,
      start: instant(entry.startsAt),
      end: instant(entry.endsAt),
    }));
  const ignored = new Set(options.ignoreCommitmentIds ?? []);
  const commitments: SourcedSpan[] = inputs.commitments
    .filter((entry) => !ignored.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      start: instant(entry.startsAt),
      end: instant(entry.endsAt),
    }));
  const counted = inputs.schedules.filter(
    (schedule) =>
      schedule.status === "active" || schedule.status === "fallback",
  );
  const referenceZone = counted[0]?.timezone ?? "UTC";

  const points = new Set<number>([start, end]);
  for (const span of [...windows, ...blackouts, ...timeOff, ...commitments]) {
    if (span.start > start && span.start < end) points.add(span.start);
    if (span.end > start && span.end < end) points.add(span.end);
  }
  const sorted = [...points].sort((left, right) => left - right);

  const segments: { start: number; end: number; state: SegmentState }[] = [];
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const segmentStart = sorted[index]!;
    const segmentEnd = sorted[index + 1]!;
    const covering = (span: Span) =>
      span.start <= segmentStart && span.end >= segmentEnd;
    const window = windows
      .filter(covering)
      .sort(
        (left, right) =>
          left.start - right.start ||
          (left.kind ?? "").localeCompare(right.kind ?? ""),
      )[0];
    const offIds = timeOff.filter(covering).map((span) => span.id);
    const blackoutIds = blackouts.filter(covering).map((span) => span.id);
    const commitmentIds = commitments.filter(covering).map((span) => span.id);
    const reasons: BusyReason[] = [];
    if (offIds.length > 0) reasons.push("time-off");
    if (blackoutIds.length > 0) reasons.push("blackout");
    if (commitmentIds.length > 0) reasons.push("commitment");
    if (!window) {
      reasons.push(
        scheduleInForce(counted, localDateOf(segmentStart, referenceZone))
          ? "outside-hours"
          : "no-schedule",
      );
    }
    const state: SegmentState =
      reasons.length === 0
        ? { free: true, window, reasons: [], sourceIds: [] }
        : {
            free: false,
            reasons,
            sourceIds: [
              ...new Set([...offIds, ...blackoutIds, ...commitmentIds]),
            ].sort(),
          };
    const previous = segments.at(-1);
    if (
      previous &&
      previous.end === segmentStart &&
      sameState(previous.state, state)
    ) {
      previous.end = segmentEnd;
    } else {
      segments.push({ start: segmentStart, end: segmentEnd, state });
    }
  }

  const free: FreeInterval[] = [];
  const busy: BusyInterval[] = [];
  for (const segment of segments) {
    if (segment.state.free) {
      const window = segment.state.window!;
      free.push({
        startsAt: iso(segment.start),
        endsAt: iso(segment.end),
        scheduleId: window.scheduleId,
        ...(window.kind ? { windowKind: window.kind } : {}),
        ...(window.venueId ? { venueId: window.venueId } : {}),
      });
    } else {
      busy.push({
        startsAt: iso(segment.start),
        endsAt: iso(segment.end),
        reason: segment.state.reasons[0]!,
        reasons: segment.state.reasons,
        sourceIds: segment.state.sourceIds,
      });
    }
  }
  return {
    staffProfileId: member.staffProfileId,
    range: { startsAt: iso(start), endsAt: iso(end) },
    free,
    busy,
  };
}

/** True when the member is free for the whole interval. */
export function isFreeThroughout(
  member: { readonly staffProfileId: string },
  interval: AvailabilityRange,
  inputs: StaffAvailabilityInputs,
  options: AvailabilityOptions = {},
): boolean {
  return availabilityFor(member, interval, inputs, options).busy.length === 0;
}

/** Total free minutes in a result. */
export function freeMinutes(result: AvailabilityResult): number {
  return result.free.reduce(
    (total, interval) =>
      total + (instant(interval.endsAt) - instant(interval.startsAt)) / 60_000,
    0,
  );
}
