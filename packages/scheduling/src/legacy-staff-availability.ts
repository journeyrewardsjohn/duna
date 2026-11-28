/**
 * The legacy staff availability format (`organization_staff_profiles.availability`
 * jsonb, written by the old HQ Team editor until B3a) and its conversion to
 * named schedules and blackouts. Pure: used by the idempotent data step that
 * copies what clubs entered into the new tables, by the read fallback for
 * members not yet copied, and to show the new tables to the old editor.
 *
 * Legacy entries are either a weekly window
 *   { weekday, startsAt: "HH:MM", endsAt: "HH:MM", scheduleId?, scheduleName?,
 *     effectiveFrom?, effectiveTo? }
 * or a blackout
 *   { kind: "blackout", startsOn, startsAt, endsOn?, endsAt }
 * with wall-clock times in the club's time zone.
 */
import type {
  StaffAvailabilitySchedule,
  StaffAvailabilityWindow,
  StaffBlackoutInput,
} from "./availability";
import {
  localDateOf,
  localMinuteOf,
  minuteOfDayFromTime,
  timeFromMinuteOfDay,
  wallTimeToInstant,
} from "./time-zone";

export interface LegacyScheduleDraft {
  /** Stable key for the group ("id:<uuid>", "name:<name>" or "default"). */
  readonly key: string;
  readonly legacyScheduleId?: string;
  readonly name: string;
  readonly status: "active" | "fallback";
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly timezone: string;
  readonly windows: readonly StaffAvailabilityWindow[];
}

export interface LegacyBlackoutDraft {
  readonly key: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface LegacyAvailabilityConversion {
  readonly schedules: readonly LegacyScheduleDraft[];
  readonly blackouts: readonly LegacyBlackoutDraft[];
  /** Entries that could not be read (kept out, counted for the report). */
  readonly skipped: number;
}

export const DEFAULT_LEGACY_SCHEDULE_NAME = "Weekly availability";

const timePattern = /^\d{2}:\d{2}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function convertLegacyStaffAvailability(input: {
  readonly entries: readonly Readonly<Record<string, unknown>>[];
  readonly timezone: string;
  /** effectiveFrom for undated legacy windows (the legacy editor ignored dates). */
  readonly undatedEffectiveFrom: string;
}): LegacyAvailabilityConversion {
  let skipped = 0;
  const groups = new Map<
    string,
    {
      legacyScheduleId?: string;
      name?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
      windows: StaffAvailabilityWindow[];
    }
  >();
  const blackouts: LegacyBlackoutDraft[] = [];
  for (const entry of input.entries) {
    if (entry.kind === "blackout") {
      const startsOn = text(entry.startsOn);
      const endsOn = text(entry.endsOn) ?? startsOn;
      const startsAt = text(entry.startsAt) ?? "00:00";
      const endsAt = text(entry.endsAt);
      if (
        !startsOn ||
        !endsOn ||
        !datePattern.test(startsOn) ||
        !datePattern.test(endsOn) ||
        !timePattern.test(startsAt) ||
        (endsAt !== undefined && !timePattern.test(endsAt))
      ) {
        skipped += 1;
        continue;
      }
      const start = wallTimeToInstant(
        startsOn,
        minuteOfDayFromTime(startsAt),
        input.timezone,
      );
      const end = wallTimeToInstant(
        endsOn,
        endsAt ? minuteOfDayFromTime(endsAt) : 1_440,
        input.timezone,
      );
      if (!(end > start)) {
        skipped += 1;
        continue;
      }
      blackouts.push({
        key: `${startsOn}T${startsAt}/${endsOn}T${endsAt ?? "24:00"}`,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
      });
      continue;
    }
    const weekday = Number(entry.weekday);
    const startsAt = text(entry.startsAt);
    const endsAt = text(entry.endsAt);
    if (
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6 ||
      !startsAt ||
      !endsAt ||
      !timePattern.test(startsAt) ||
      !timePattern.test(endsAt)
    ) {
      skipped += 1;
      continue;
    }
    const startMinute = minuteOfDayFromTime(startsAt);
    const endMinute = minuteOfDayFromTime(endsAt);
    if (endMinute <= startMinute) {
      skipped += 1;
      continue;
    }
    const legacyScheduleId = text(entry.scheduleId);
    const name = text(entry.scheduleName);
    const key = legacyScheduleId
      ? `id:${legacyScheduleId}`
      : name
        ? `name:${name.toLowerCase()}`
        : "default";
    const group = groups.get(key) ?? { windows: [] };
    if (legacyScheduleId) group.legacyScheduleId = legacyScheduleId;
    group.name ??= name;
    const from = text(entry.effectiveFrom);
    const to = text(entry.effectiveTo);
    if (from && datePattern.test(from)) group.effectiveFrom ??= from;
    if (to && datePattern.test(to)) group.effectiveTo ??= to;
    group.windows.push({ weekday, startMinute, endMinute });
    groups.set(key, group);
  }

  const schedules: LegacyScheduleDraft[] = [];
  let fallback: LegacyScheduleDraft | undefined;
  for (const [key, group] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const windows = group.windows.sort(
      (left, right) =>
        left.weekday - right.weekday || left.startMinute - right.startMinute,
    );
    if (group.effectiveFrom) {
      schedules.push({
        key,
        ...(group.legacyScheduleId
          ? { legacyScheduleId: group.legacyScheduleId }
          : {}),
        name: group.name ?? DEFAULT_LEGACY_SCHEDULE_NAME,
        status: "active",
        effectiveFrom: group.effectiveFrom,
        ...(group.effectiveTo && group.effectiveTo >= group.effectiveFrom
          ? { effectiveTo: group.effectiveTo }
          : {}),
        timezone: input.timezone,
        windows,
      });
    } else if (!fallback) {
      fallback = {
        key,
        ...(group.legacyScheduleId
          ? { legacyScheduleId: group.legacyScheduleId }
          : {}),
        name: group.name ?? DEFAULT_LEGACY_SCHEDULE_NAME,
        status: "fallback",
        effectiveFrom: input.undatedEffectiveFrom,
        timezone: input.timezone,
        windows,
      };
    } else {
      // Undated groups all applied at once in the legacy editor: one fallback.
      fallback = { ...fallback, windows: [...fallback.windows, ...windows] };
    }
  }
  if (fallback) schedules.push(fallback);
  return { schedules, blackouts, skipped };
}

/** Legacy drafts as availability inputs (the read fallback). */
export function legacyAvailabilityInputs(
  conversion: LegacyAvailabilityConversion,
  idPrefix: string,
): {
  readonly schedules: readonly StaffAvailabilitySchedule[];
  readonly blackouts: readonly StaffBlackoutInput[];
} {
  return {
    schedules: conversion.schedules.map((schedule) => ({
      id: `${idPrefix}:${schedule.key}`,
      status: schedule.status,
      effectiveFrom: schedule.effectiveFrom,
      ...(schedule.effectiveTo ? { effectiveTo: schedule.effectiveTo } : {}),
      timezone: schedule.timezone,
      windows: schedule.windows,
    })),
    blackouts: conversion.blackouts.map((blackout) => ({
      id: `${idPrefix}:${blackout.key}`,
      startsAt: blackout.startsAt,
      endsAt: blackout.endsAt,
    })),
  };
}

/**
 * The new tables in the legacy shape, for readers that still expect it
 * (the old HQ Team editor, the public coach page, Ask Duna context).
 * Overnight windows are split at midnight because the legacy shape cannot
 * cross it. Archived and draft schedules are left out.
 */
export function toLegacyStaffAvailability(input: {
  readonly schedules: readonly (StaffAvailabilitySchedule & {
    readonly name: string;
  })[];
  readonly blackouts: readonly {
    readonly startsAt: string;
    readonly endsAt: string;
  }[];
  readonly timezone: string;
}): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const schedule of input.schedules) {
    if (schedule.status !== "active" && schedule.status !== "fallback")
      continue;
    for (const window of schedule.windows) {
      const end =
        window.endMinute <= window.startMinute
          ? window.endMinute + 1_440
          : window.endMinute;
      const parts =
        end > 1_440
          ? [
              {
                weekday: window.weekday,
                start: window.startMinute,
                end: 1_440,
              },
              { weekday: (window.weekday + 1) % 7, start: 0, end: end - 1_440 },
            ]
          : [{ weekday: window.weekday, start: window.startMinute, end }];
      for (const part of parts) {
        if (part.end <= part.start) continue;
        entries.push({
          weekday: part.weekday,
          startsAt: timeFromMinuteOfDay(part.start),
          // The legacy shape has no 24:00; it used 23:59 for "end of day".
          endsAt: timeFromMinuteOfDay(Math.min(part.end, 1_439)),
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          effectiveFrom: schedule.effectiveFrom,
          ...(schedule.effectiveTo
            ? { effectiveTo: schedule.effectiveTo }
            : {}),
        });
      }
    }
  }
  for (const blackout of input.blackouts) {
    const start = Date.parse(blackout.startsAt);
    const end = Date.parse(blackout.endsAt);
    const startsOn = localDateOf(start, input.timezone);
    const lastMoment = end - 60_000;
    const endsOn = localDateOf(lastMoment, input.timezone);
    const endMinute = localMinuteOf(end, input.timezone);
    entries.push({
      kind: "blackout",
      startsOn,
      startsAt: timeFromMinuteOfDay(localMinuteOf(start, input.timezone)),
      ...(endsOn !== startsOn ? { endsOn } : {}),
      endsAt:
        localDateOf(end, input.timezone) !== endsOn || endMinute === 0
          ? "23:59"
          : timeFromMinuteOfDay(endMinute),
    });
  }
  return entries;
}
