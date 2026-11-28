/**
 * Programs clubs already have (B4 compatibility).
 *
 * Programs created by the legacy training workspace live in the same
 * `training_programs` / `training_events` tables, but keep their weekly
 * pattern in `recurrence` (jsonb: days with a start time and duration,
 * `intervalWeeks`, `excludedDates`), their tournaments and breaks in
 * `milestones` (jsonb) and one coach per session in
 * `training_events.coach_person_id`. W3-0 added `training_program_coaches`,
 * `training_program_weekly_slots` and `training_program_date_exceptions`.
 *
 * - Reads never need a copy: `effectiveStructure` derives slots, exceptions
 *   and coaches from the legacy columns when a program has no rows in the
 *   new tables (ids are stable hashes, so a screen can key on them).
 * - The first write to a legacy program (update, activate, a conflict
 *   resolution) runs `copyLegacyProgramStructure` in the same transaction:
 *   an advisory lock on the program, an audit marker
 *   (`training-program.legacy-copied`), then the derived rows. It is
 *   idempotent and never deletes or rewrites a legacy column.
 * - New writes keep the legacy columns in step (`legacyRecurrence`,
 *   `legacyMilestones`) so the old HQ training page still lists the program.
 */
import {
  auditLog,
  trainingProgramCoaches,
  trainingProgramDateExceptions,
  trainingProgramWeeklySlots,
  type trainingPrograms,
} from "@duna/db";
import { log } from "@duna/observability";
import { minuteOfDayFromTime, timeFromMinuteOfDay } from "@duna/scheduling";
import { and, eq, sql } from "drizzle-orm";
import { stableUuid, type TrainingContext, type Transaction } from "./shared";

export const LEGACY_PROGRAM_COPIED = "training-program.legacy-copied";

type ProgramRow = typeof trainingPrograms.$inferSelect;

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export interface SlotView {
  readonly id: string;
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly intervalWeeks: number;
  readonly venueId?: string;
  readonly courtIds: readonly string[];
}
export interface ExceptionView {
  readonly id: string;
  readonly kind: "blackout" | "break" | "tournament" | "travel";
  readonly startsOn: string;
  readonly endsOn: string;
  readonly label: string;
  readonly sessionId?: string;
  readonly sourceUrl?: string;
}
export interface CoachView {
  readonly personId: string;
  readonly role: "lead" | "assistant";
  readonly weekdays: readonly number[];
}

export interface StoredStructure {
  readonly slots: readonly (typeof trainingProgramWeeklySlots.$inferSelect)[];
  readonly exceptions: readonly (typeof trainingProgramDateExceptions.$inferSelect)[];
  readonly coaches: readonly (typeof trainingProgramCoaches.$inferSelect)[];
}

export interface EffectiveStructure {
  readonly slots: SlotView[];
  readonly exceptions: ExceptionView[];
  readonly coaches: CoachView[];
  /** True when any part came from the legacy columns. */
  readonly derived: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Weekly slots from the legacy `recurrence` jsonb (bad entries skipped). */
export function legacySlots(program: Pick<ProgramRow, "id" | "recurrence">) {
  const recurrence = program.recurrence;
  if (!isRecord(recurrence) || !Array.isArray(recurrence.days)) return [];
  const interval =
    typeof recurrence.intervalWeeks === "number"
      ? Math.min(8, Math.max(1, Math.round(recurrence.intervalWeeks)))
      : 1;
  return recurrence.days.flatMap((day, index): SlotView[] => {
    if (!isRecord(day)) return [];
    const weekday = WEEKDAYS.indexOf(
      String(day.day) as (typeof WEEKDAYS)[number],
    );
    const startsAt = String(day.startsAt ?? "");
    const duration = Number(day.durationMinutes);
    if (weekday < 0 || !TIME.test(startsAt) || !(duration > 0)) return [];
    const start = minuteOfDayFromTime(startsAt);
    const end = Math.min(start + Math.round(duration), 23 * 60 + 59);
    if (end <= start) return [];
    return [
      {
        id: stableUuid(program.id, "legacy-slot", String(index)),
        weekday,
        startsAt,
        endsAt: timeFromMinuteOfDay(end),
        intervalWeeks: interval,
        courtIds: [],
      },
    ];
  });
}

/** Exceptions from legacy `milestones` and `recurrence.excludedDates`. */
export function legacyExceptions(
  program: Pick<ProgramRow, "id" | "recurrence" | "milestones">,
): ExceptionView[] {
  const fromMilestones = (
    Array.isArray(program.milestones) ? program.milestones : []
  ).flatMap((milestone, index): ExceptionView[] => {
    if (!isRecord(milestone)) return [];
    const kind = milestone.kind;
    const startsOn = String(milestone.startsOn ?? "");
    const endsOn = String(milestone.endsOn ?? startsOn);
    if (!DATE.test(startsOn) || !DATE.test(endsOn) || endsOn < startsOn) {
      return [];
    }
    // Legacy "assessment" days are not exceptions: practice still happens.
    const mapped =
      kind === "tournament" || kind === "travel" || kind === "break"
        ? kind
        : undefined;
    if (!mapped) return [];
    const id = String(milestone.id ?? "");
    return [
      {
        id: UUID.test(id)
          ? id
          : stableUuid(program.id, "legacy-milestone", String(index)),
        kind: mapped,
        startsOn,
        endsOn,
        label:
          String(milestone.title ?? "")
            .trim()
            .slice(0, 160) ||
          (mapped === "break"
            ? "Break"
            : mapped === "travel"
              ? "Travel"
              : "Tournament"),
      },
    ];
  });
  const recurrence = isRecord(program.recurrence) ? program.recurrence : {};
  const excluded = Array.isArray(recurrence.excludedDates)
    ? recurrence.excludedDates.filter(
        (date): date is string => typeof date === "string" && DATE.test(date),
      )
    : [];
  const fromExcluded = excluded.map((date) => ({
    id: stableUuid(program.id, "legacy-excluded", date),
    kind: "blackout" as const,
    startsOn: date,
    endsOn: date,
    label: "No practice",
  }));
  return [...fromMilestones, ...fromExcluded].sort((left, right) =>
    left.startsOn.localeCompare(right.startsOn),
  );
}

/**
 * The structure a screen shows: stored rows when the program has any, the
 * legacy columns otherwise. `legacyLeads` is the coach who led most of the
 * program's sessions (from `training_events.coach_person_id`).
 */
export function effectiveStructure(
  program: ProgramRow,
  stored: StoredStructure,
  legacyLead?: string,
): EffectiveStructure {
  const hasStored =
    stored.slots.length > 0 ||
    stored.exceptions.length > 0 ||
    stored.coaches.length > 0;
  if (hasStored) {
    return {
      slots: [...stored.slots]
        .sort(
          (left, right) =>
            left.weekday - right.weekday ||
            left.startsAt.localeCompare(right.startsAt),
        )
        .map((slot) => ({
          id: slot.id,
          weekday: slot.weekday,
          startsAt: slot.startsAt.slice(0, 5),
          endsAt: slot.endsAt.slice(0, 5),
          intervalWeeks: slot.intervalWeeks,
          ...(slot.venueId ? { venueId: slot.venueId } : {}),
          courtIds: slot.courtIds,
        })),
      exceptions: [...stored.exceptions]
        .sort((left, right) => left.startsOn.localeCompare(right.startsOn))
        .map((row) => ({
          id: row.id,
          kind: row.kind as ExceptionView["kind"],
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          label: row.label,
          ...(row.sessionId ? { sessionId: row.sessionId } : {}),
          ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
        })),
      coaches: [...stored.coaches]
        .sort((left, right) =>
          left.role === right.role ? 0 : left.role === "lead" ? -1 : 1,
        )
        .map((row) => ({
          personId: row.personId,
          role: row.role as CoachView["role"],
          weekdays: row.weekdays,
        })),
      derived: false,
    };
  }
  return {
    slots: legacySlots(program),
    exceptions: legacyExceptions(program),
    coaches: legacyLead
      ? [{ personId: legacyLead, role: "lead", weekdays: [] }]
      : [],
    derived: true,
  };
}

/** The legacy `recurrence` mirror written with every new structure. */
export function legacyRecurrence(
  slots: readonly {
    weekday: number;
    startsAt: string;
    endsAt: string;
    intervalWeeks: number;
  }[],
  exceptions: readonly { kind: string; startsOn: string; endsOn: string }[],
) {
  const days = slots
    .map((slot) => ({
      day: WEEKDAYS[slot.weekday]!,
      startsAt: slot.startsAt.slice(0, 5),
      durationMinutes: Math.max(
        15,
        minuteOfDayFromTime(slot.endsAt.slice(0, 5)) -
          minuteOfDayFromTime(slot.startsAt.slice(0, 5)),
      ),
    }))
    .slice(0, 7);
  const excludedDates = exceptions
    .filter((exception) => exception.kind === "blackout")
    .map((exception) => exception.startsOn)
    .slice(0, 200);
  return {
    intervalWeeks: Math.min(...slots.map((slot) => slot.intervalWeeks), 1),
    days,
    excludedDates,
  };
}

/** The legacy `milestones` mirror: tournaments, travel and breaks. */
export function legacyMilestones(
  exceptions: readonly ExceptionView[],
): Record<string, unknown>[] {
  return exceptions
    .filter((exception) => exception.kind !== "blackout")
    .slice(0, 50)
    .map((exception) => ({
      id: exception.id,
      kind: exception.kind,
      title: exception.label,
      startsOn: exception.startsOn,
      endsOn: exception.endsOn,
      priority: exception.kind === "tournament" ? "key" : "standard",
    }));
}

/**
 * Copies a legacy program's derived structure into the W3 tables, once.
 * Runs inside the caller's transaction; returns whether it copied.
 */
export async function copyLegacyProgramStructure(
  transaction: Transaction,
  context: TrainingContext,
  program: ProgramRow,
  legacyLead?: string,
): Promise<boolean> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`training-program-copy:${program.id}`}))`,
  );
  const [marker] = await transaction
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, LEGACY_PROGRAM_COPIED),
        eq(auditLog.entityType, "training-program"),
        eq(auditLog.entityId, program.id),
      ),
    )
    .limit(1);
  if (marker) return false;
  const [slotRow, exceptionRow, coachRow] = await Promise.all([
    transaction
      .select({ id: trainingProgramWeeklySlots.id })
      .from(trainingProgramWeeklySlots)
      .where(eq(trainingProgramWeeklySlots.programId, program.id))
      .limit(1),
    transaction
      .select({ id: trainingProgramDateExceptions.id })
      .from(trainingProgramDateExceptions)
      .where(eq(trainingProgramDateExceptions.programId, program.id))
      .limit(1),
    transaction
      .select({ personId: trainingProgramCoaches.personId })
      .from(trainingProgramCoaches)
      .where(eq(trainingProgramCoaches.programId, program.id))
      .limit(1),
  ]);
  const derived = effectiveStructure(
    program,
    { slots: [], exceptions: [], coaches: [] },
    legacyLead,
  );
  const alreadyStructured =
    slotRow.length > 0 || exceptionRow.length > 0 || coachRow.length > 0;
  if (!alreadyStructured) {
    if (derived.slots.length > 0) {
      await transaction.insert(trainingProgramWeeklySlots).values(
        derived.slots.map((slot) => ({
          id: slot.id,
          programId: program.id,
          weekday: slot.weekday,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          intervalWeeks: slot.intervalWeeks,
          courtIds: [],
          createdAt: context.now,
          updatedAt: context.now,
        })),
      );
    }
    if (derived.exceptions.length > 0) {
      await transaction.insert(trainingProgramDateExceptions).values(
        derived.exceptions.map((exception) => ({
          id: exception.id,
          programId: program.id,
          kind: exception.kind,
          startsOn: exception.startsOn,
          endsOn: exception.endsOn,
          label: exception.label,
          createdAt: context.now,
          updatedAt: context.now,
        })),
      );
    }
    if (derived.coaches.length > 0) {
      await transaction.insert(trainingProgramCoaches).values(
        derived.coaches.map((coach) => ({
          programId: program.id,
          personId: coach.personId,
          role: coach.role,
          weekdays: [...coach.weekdays],
          createdAt: context.now,
          updatedAt: context.now,
        })),
      );
    }
  }
  await transaction.insert(auditLog).values({
    organizationId: program.organizationId,
    actorPersonId: context.actor.personId,
    actorType: "person",
    action: LEGACY_PROGRAM_COPIED,
    entityType: "training-program",
    entityId: program.id,
    reason: alreadyStructured
      ? "Program already had W3 schedule rows; legacy columns left as they are."
      : `Copied ${derived.slots.length} weekly slots, ${derived.exceptions.length} date exceptions and ${derived.coaches.length} coaches from the legacy program columns. Legacy columns kept.`,
    traceId: context.requestId,
    createdAt: context.now,
  });
  log.info("training-programs.legacy.copied", {
    organizationId: program.organizationId,
    programId: program.id,
    slots: alreadyStructured ? 0 : derived.slots.length,
    exceptions: alreadyStructured ? 0 : derived.exceptions.length,
    coaches: alreadyStructured ? 0 : derived.coaches.length,
  });
  return !alreadyStructured;
}
