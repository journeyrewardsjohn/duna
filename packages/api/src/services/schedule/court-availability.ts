/**
 * The one conflict rule for a court, server side (SCHED-API). A court is
 * treated as a schedulable resource and checked with `availabilityFor` from
 * @duna/scheduling, the same function HQ's Schedule warns with
 * (`apps/hq/components/schedule/schedule-model.ts`):
 *
 * - opening hours: the court schedule's weekly windows whose mode is not
 *   `blocked` / `maintenance`, wall-clock minutes in the place's zone. A
 *   court with no opening windows stored is open around the clock (as the
 *   calendar draws it). Windows with effective dates form their own
 *   schedule; on a date inside those dates that schedule replaces the
 *   undated hours (the shared rule's "latest effective-from wins").
 * - closures: weekly `blocked` / `maintenance` windows (on each date they
 *   apply) and one-off overrides (blocks, closures, weather holds) are
 *   blackouts.
 * - occupants: bookings (with their buffers), sessions on the court and
 *   court reservations are commitments. The new booking's own buffers are
 *   checked against occupants only, never against opening hours.
 *
 * Pure: the caller loads the rows (court-situation.ts) inside the
 * transaction that writes.
 */
import {
  addCalendarDays,
  availabilityFor,
  localDateOf,
  type BusyInterval,
  type StaffAvailabilityInputs,
  type StaffAvailabilitySchedule,
  type StaffBlackoutInput,
  type StaffCommitment,
  wallTimeToInstant,
  weekdayOfDate,
} from "@duna/scheduling";
import type { ScheduleConflict } from "../../contracts/schedule";

const closedModes = new Set(["blocked", "maintenance"]);

export interface CourtWindow {
  readonly id?: string;
  readonly weekday: number;
  readonly startsAtMinute: number;
  readonly endsAtMinute: number;
  readonly mode: string;
  readonly effectiveFrom?: string | null;
  readonly effectiveTo?: string | null;
}

export interface CourtOverride {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly mode: string;
}

export type OccupantKind = "booking" | "session" | "reservation";

export interface CourtOccupant {
  readonly id: string;
  readonly kind: OccupantKind;
  /** The occupied range (a booking's buffers included). */
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface CourtFactsForRule {
  readonly courtId: string;
  readonly timeZone: string;
  readonly windows: readonly CourtWindow[];
  readonly overrides: readonly CourtOverride[];
  readonly occupants: readonly CourtOccupant[];
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
}

const iso = (value: Date | number) => new Date(value).toISOString();

function inDates(
  date: string,
  from?: string | null,
  to?: string | null,
): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

/** Opening hours as the shared rule's schedules. */
export function courtSchedules(
  courtId: string,
  timeZone: string,
  windows: readonly CourtWindow[],
): StaffAvailabilitySchedule[] {
  const open = windows.filter((window) => !closedModes.has(window.mode));
  if (open.length === 0) {
    return [
      {
        id: `court:${courtId}`,
        status: "active",
        effectiveFrom: "2000-01-01",
        timezone: timeZone,
        windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: 1440,
        })),
      },
    ];
  }
  const groups = new Map<string, CourtWindow[]>();
  for (const window of open) {
    const key = `${window.effectiveFrom ?? ""}|${window.effectiveTo ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), window]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [from, to] = key.split("|");
    return {
      id: `court:${courtId}:${key}`,
      status: "active" as const,
      effectiveFrom: from || "2000-01-01",
      ...(to ? { effectiveTo: to } : {}),
      timezone: timeZone,
      windows: rows.map((window) => ({
        weekday: window.weekday,
        startMinute: window.startsAtMinute,
        endMinute: window.endsAtMinute,
      })),
    };
  });
}

/** Weekly closed windows and one-off overrides that touch the range. */
export function courtBlackouts(
  facts: Pick<CourtFactsForRule, "timeZone" | "windows" | "overrides">,
  range: { readonly startsAt: Date; readonly endsAt: Date },
): StaffBlackoutInput[] {
  const blackouts: StaffBlackoutInput[] = facts.overrides
    .filter((override) => closedModes.has(override.mode))
    .map((override) => ({
      id: `block:${override.id}`,
      startsAt: iso(override.startsAt),
      endsAt: iso(override.endsAt),
    }));
  const closedWeekly = facts.windows.filter((window) =>
    closedModes.has(window.mode),
  );
  if (closedWeekly.length > 0) {
    const first = addCalendarDays(
      localDateOf(range.startsAt.getTime(), facts.timeZone),
      -1,
    );
    const last = addCalendarDays(
      localDateOf(range.endsAt.getTime(), facts.timeZone),
      1,
    );
    for (let date = first; date <= last; date = addCalendarDays(date, 1)) {
      const weekday = weekdayOfDate(date);
      for (const [index, window] of closedWeekly.entries()) {
        if (window.weekday !== weekday) continue;
        if (!inDates(date, window.effectiveFrom, window.effectiveTo)) continue;
        blackouts.push({
          id: `closed:${window.id ?? index}:${date}`,
          startsAt: iso(
            wallTimeToInstant(date, window.startsAtMinute, facts.timeZone),
          ),
          endsAt: iso(
            wallTimeToInstant(date, window.endsAtMinute, facts.timeZone),
          ),
        });
      }
    }
  }
  return blackouts;
}

function commitments(
  occupants: readonly CourtOccupant[],
  ignore: ReadonlySet<string>,
): StaffCommitment[] {
  return occupants
    .filter((occupant) => !ignore.has(occupant.id))
    .map((occupant) => ({
      id: `${occupant.kind}:${occupant.id}`,
      kind: occupant.kind === "session" ? "session" : "calendar",
      startsAt: iso(occupant.startsAt),
      endsAt: iso(occupant.endsAt),
    }));
}

/** The shared rule's inputs for one court (HQ's `courtAvailabilityInputs`). */
export function courtAvailabilityInputs(
  facts: CourtFactsForRule,
  range: { readonly startsAt: Date; readonly endsAt: Date },
  ignoreIds: readonly string[] = [],
): StaffAvailabilityInputs {
  return {
    schedules: courtSchedules(facts.courtId, facts.timeZone, facts.windows),
    blackouts: courtBlackouts(facts, range),
    timeOff: [],
    commitments: commitments(facts.occupants, new Set(ignoreIds)),
  };
}

function whatOf(busy: BusyInterval): ScheduleConflict["what"] {
  if (busy.reason === "outside-hours" || busy.reason === "no-schedule") {
    return "hours";
  }
  const first = busy.sourceIds[0] ?? "";
  if (busy.reason === "blackout") {
    return first.startsWith("closed:") ? "closed" : "block";
  }
  if (first.startsWith("session:")) return "session";
  return "booking";
}

function stripPrefix(id: string): string {
  const index = id.indexOf(":");
  if (id.startsWith("closed:")) return id.split(":")[1] ?? id;
  return index >= 0 ? id.slice(index + 1) : id;
}

function toConflict(busy: BusyInterval): ScheduleConflict {
  return {
    reason: busy.reason,
    what: whatOf(busy),
    startsAt: busy.startsAt,
    endsAt: busy.endsAt,
    ids: [...new Set(busy.sourceIds.map(stripPrefix))],
  };
}

/**
 * Every reason the court cannot take [startsAt, endsAt): opening hours and
 * closures on the slot itself, occupants on the slot widened by the court's
 * buffers. Empty when the court is free.
 */
export function courtConflicts(
  facts: CourtFactsForRule,
  slot: { readonly startsAt: Date; readonly endsAt: Date },
  ignoreIds: readonly string[] = [],
): ScheduleConflict[] {
  const member = { staffProfileId: facts.courtId };
  const hours = availabilityFor(
    member,
    { startsAt: iso(slot.startsAt), endsAt: iso(slot.endsAt) },
    {
      schedules: courtSchedules(facts.courtId, facts.timeZone, facts.windows),
      blackouts: courtBlackouts(facts, slot),
      timeOff: [],
      commitments: [],
    },
  );
  const buffered = {
    startsAt: new Date(
      slot.startsAt.getTime() - facts.bufferBeforeMinutes * 60_000,
    ),
    endsAt: new Date(slot.endsAt.getTime() + facts.bufferAfterMinutes * 60_000),
  };
  const occupied = availabilityFor(
    member,
    { startsAt: iso(buffered.startsAt), endsAt: iso(buffered.endsAt) },
    {
      schedules: courtSchedules(facts.courtId, "UTC", []),
      blackouts: [],
      timeOff: [],
      commitments: commitments(facts.occupants, new Set(ignoreIds)),
    },
  );
  return [...hours.busy, ...occupied.busy]
    .map(toConflict)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
