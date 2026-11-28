/**
 * Training programs (B4): programs — list, detail, create, update,
 * activate, cancel, "create from a sentence", and generating the program's
 * sessions from its weekly pattern.
 *
 * Status: the database has no "cancelled" (W3-0 decision 3): a cancelled
 * program is `archived` + `cancelled_at`, reported as "cancelled". An
 * active program whose end date has passed is reported as "completed"
 * (nothing is written on read).
 */
import {
  courts,
  getDatabase,
  getTransactionalDatabase,
  staffCoverageRequests,
  trainingAthleteResponses,
  trainingEventCoaches,
  trainingEvents,
  trainingPracticeOutcomes,
  trainingProgramCoaches,
  trainingProgramDateExceptions,
  trainingProgramParticipants,
  trainingProgramVersions,
  trainingProgramWeeklySlots,
  trainingProgramWeeks,
  trainingPrograms,
  venues,
} from "@duna/db";
import { log } from "@duna/observability";
import {
  addCalendarDays,
  isValidTimeZone,
  minuteOfDayFromTime,
  parseNaturalLanguageSchedule,
  timeFromMinuteOfDay,
  weekdayOfDate,
} from "@duna/scheduling";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  ne,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import type {
  trainingProgramsCancelInputSchema,
  trainingProgramsCreateInputSchema,
  trainingProgramsDraftSchema,
  trainingProgramsProgramSchema,
  trainingProgramsProgramSummarySchema,
  trainingProgramsProposalSchema,
  trainingProgramsUpdateInputSchema,
} from "../../contracts/training-programs";
import { executeIdempotent } from "../../idempotency";
import {
  copyLegacyProgramStructure,
  effectiveStructure,
  type EffectiveStructure,
  type ExceptionView,
  legacyMilestones,
  legacyRecurrence,
  type StoredStructure,
} from "./legacy";
import {
  currentWeekNumber,
  daysBetween,
  generateOccurrences,
  MAX_PROGRAM_DAYS,
  planRegeneration,
  programWeeks,
  sessionKey,
  weeksOff,
} from "./schedule";
import {
  assertClubStaff,
  assertManager,
  assertPeopleExist,
  audit,
  badRequest,
  conflict,
  isoDate,
  loadPeople,
  notFound,
  type PersonRef,
  slugify,
  type TrainingContext,
  type Transaction,
} from "./shared";

type ProgramRow = typeof trainingPrograms.$inferSelect;
type Summary = z.infer<typeof trainingProgramsProgramSummarySchema>;
type Program = z.infer<typeof trainingProgramsProgramSchema>;
type Draft = z.infer<typeof trainingProgramsDraftSchema>;

export const PROGRAM_LIST_LIMIT = 200;
const ATHLETE_STATUSES = ["active", "invited"] as const;

export function programStatus(
  row: Pick<ProgramRow, "status" | "cancelledAt" | "endDate" | "timezone">,
  now: Date,
): Summary["status"] {
  if (row.cancelledAt) return "cancelled";
  if (row.status === "active" && row.endDate < isoDate(now, row.timezone)) {
    return "completed";
  }
  return row.status;
}

// ------------------------------------------------------------------ loading

export async function loadProgramRow(
  organizationId: string,
  programId: string,
): Promise<ProgramRow> {
  const [row] = await getDatabase()
    .select()
    .from(trainingPrograms)
    .where(
      and(
        eq(trainingPrograms.id, programId),
        eq(trainingPrograms.organizationId, organizationId),
      ),
    );
  if (!row) notFound("This program was not found.");
  return row;
}

async function loadStored(
  programIds: readonly string[],
): Promise<Map<string, StoredStructure>> {
  const ids = [...programIds];
  const result = new Map<string, StoredStructure>(
    ids.map((id) => [id, { slots: [], exceptions: [], coaches: [] }]),
  );
  if (ids.length === 0) return result;
  const database = getDatabase();
  const [slots, exceptions, coaches] = await Promise.all([
    database
      .select()
      .from(trainingProgramWeeklySlots)
      .where(inArray(trainingProgramWeeklySlots.programId, ids)),
    database
      .select()
      .from(trainingProgramDateExceptions)
      .where(inArray(trainingProgramDateExceptions.programId, ids)),
    database
      .select()
      .from(trainingProgramCoaches)
      .where(inArray(trainingProgramCoaches.programId, ids)),
  ]);
  for (const id of ids) {
    result.set(id, {
      slots: slots.filter((row) => row.programId === id),
      exceptions: exceptions.filter((row) => row.programId === id),
      coaches: coaches.filter((row) => row.programId === id),
    });
  }
  return result;
}

/** Per program: athletes, practices, plans attached, the legacy lead coach. */
async function loadCounts(programIds: readonly string[]) {
  const ids = [...programIds];
  const empty = {
    athletes: new Map<string, number>(),
    practices: new Map<string, number>(),
    plans: new Map<string, number>(),
    legacyLead: new Map<string, string>(),
  };
  if (ids.length === 0) return empty;
  const database = getDatabase();
  const [athletes, events, leads] = await Promise.all([
    database
      .select({
        programId: trainingProgramParticipants.programId,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingProgramParticipants)
      .where(
        and(
          inArray(trainingProgramParticipants.programId, ids),
          eq(trainingProgramParticipants.role, "athlete"),
          inArray(trainingProgramParticipants.status, [...ATHLETE_STATUSES]),
        ),
      )
      .groupBy(trainingProgramParticipants.programId),
    database
      .select({
        programId: trainingEvents.programId,
        practices: sql<number>`count(*) filter (where ${trainingEvents.kind} = 'practice')::int`,
        plans: sql<number>`count(*) filter (where ${trainingEvents.practicePlanVersionId} is not null)::int`,
      })
      .from(trainingEvents)
      .where(
        and(
          inArray(trainingEvents.programId, ids),
          ne(trainingEvents.status, "cancelled"),
        ),
      )
      .groupBy(trainingEvents.programId),
    database
      .select({
        programId: trainingEvents.programId,
        personId: trainingEvents.coachPersonId,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingEvents)
      .where(
        and(
          inArray(trainingEvents.programId, ids),
          isNotNull(trainingEvents.coachPersonId),
        ),
      )
      .groupBy(trainingEvents.programId, trainingEvents.coachPersonId),
  ]);
  for (const row of athletes) empty.athletes.set(row.programId, row.count);
  for (const row of events) {
    if (!row.programId) continue;
    empty.practices.set(row.programId, row.practices);
    empty.plans.set(row.programId, row.plans);
  }
  const best = new Map<string, number>();
  for (const row of leads) {
    if (!row.programId || !row.personId) continue;
    if ((best.get(row.programId) ?? 0) < row.count) {
      best.set(row.programId, row.count);
      empty.legacyLead.set(row.programId, row.personId);
    }
  }
  return empty;
}

function summaryOf(
  row: ProgramRow,
  structure: EffectiveStructure,
  counts: Awaited<ReturnType<typeof loadCounts>>,
  peopleById: ReadonlyMap<string, PersonRef>,
  now: Date,
): Summary {
  const status = programStatus(row, now);
  const weeks = programWeeks(row.startDate, row.endDate);
  const offRanges = structure.exceptions.filter(
    (exception) => exception.kind === "break" || exception.kind === "blackout",
  );
  const lead = structure.coaches.find((coach) => coach.role === "lead");
  const leadRef = lead ? peopleById.get(lead.personId) : undefined;
  const week =
    status === "active"
      ? currentWeekNumber(
          isoDate(now, row.timezone),
          row.startDate,
          row.endDate,
        )
      : undefined;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status,
    startDate: row.startDate,
    endDate: row.endDate,
    ...(week ? { currentWeek: week } : {}),
    counts: {
      athletes: counts.athletes.get(row.id) ?? 0,
      weeks: weeks.length,
      weeksOff: weeksOff(weeks, row.endDate, offRanges),
      practices: counts.practices.get(row.id) ?? 0,
      milestones: structure.exceptions.filter(
        (exception) =>
          exception.kind === "tournament" || exception.kind === "travel",
      ).length,
      plansAttached: counts.plans.get(row.id) ?? 0,
    },
    ...(leadRef ? { leadCoach: leadRef } : {}),
  };
}

// -------------------------------------------------------------------- reads

/** Summaries for program rows: a fixed number of queries, never one per row. */
export async function programSummaries(
  rows: readonly ProgramRow[],
  now: Date,
): Promise<Summary[]> {
  const ids = rows.map((row) => row.id);
  const [stored, counts] = await Promise.all([
    loadStored(ids),
    loadCounts(ids),
  ]);
  const structures = new Map(
    rows.map((row) => [
      row.id,
      effectiveStructure(
        row,
        stored.get(row.id)!,
        counts.legacyLead.get(row.id),
      ),
    ]),
  );
  const leadIds = [...structures.values()].flatMap((structure) =>
    structure.coaches
      .filter((coach) => coach.role === "lead")
      .map((coach) => coach.personId),
  );
  const peopleById = await loadPeople(leadIds);
  return rows.map((row) =>
    summaryOf(row, structures.get(row.id)!, counts, peopleById, now),
  );
}

/** Programs list (Training › Programs). */
export async function listPrograms(
  context: TrainingContext,
  input: { readonly status?: Summary["status"] },
): Promise<{ items: Summary[] }> {
  const rows = await getDatabase()
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.organizationId, context.organizationId))
    .orderBy(desc(trainingPrograms.startDate), asc(trainingPrograms.title))
    .limit(PROGRAM_LIST_LIMIT);
  const items = (await programSummaries(rows, context.now)).filter(
    (item) => !input.status || item.status === input.status,
  );
  return { items };
}

/** Weeks: stored rows when the program has them, derived otherwise. */
async function weeksOf(
  row: ProgramRow,
  structure: EffectiveStructure,
): Promise<Program["weeks"]> {
  const database = getDatabase();
  const stored = await database
    .select()
    .from(trainingProgramWeeks)
    .where(eq(trainingProgramWeeks.programId, row.id))
    .orderBy(asc(trainingProgramWeeks.weekNumber));
  if (stored.length > 0) {
    return stored.map((week) => ({
      weekNumber: week.weekNumber,
      startsOn: week.startsOn,
      phase: week.phase as Program["weeks"][number]["phase"],
      plannedLoad: week.plannedLoad,
      ...(week.note ? { note: week.note } : {}),
    }));
  }
  const weeks = programWeeks(row.startDate, row.endDate);
  const loads = await database
    .select({
      startsAt: trainingEvents.startsAt,
      plannedLoad: trainingEvents.plannedLoad,
    })
    .from(trainingEvents)
    .where(
      and(
        eq(trainingEvents.programId, row.id),
        eq(trainingEvents.kind, "practice"),
        ne(trainingEvents.status, "cancelled"),
      ),
    )
    .limit(2_000);
  const byWeek = new Map<number, number[]>();
  for (const event of loads) {
    const date = isoDate(event.startsAt, row.timezone);
    const weekNumber = Math.floor(daysBetween(row.startDate, date) / 7) + 1;
    byWeek.set(weekNumber, [
      ...(byWeek.get(weekNumber) ?? []),
      event.plannedLoad,
    ]);
  }
  const off = structure.exceptions.filter(
    (exception) => exception.kind === "break" || exception.kind === "blackout",
  );
  return weeks.map((week) => {
    const isOff = weeksOff([week], row.endDate, off) === 1;
    const values = byWeek.get(week.weekNumber) ?? [];
    const load = values.length
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : 0;
    return {
      weekNumber: week.weekNumber,
      startsOn: week.startsOn,
      phase: isOff ? ("break" as const) : ("build" as const),
      plannedLoad: isOff ? 0 : Math.min(100, load),
    };
  });
}

export async function programDetail(
  context: TrainingContext,
  programId: string,
): Promise<Program> {
  const row = await loadProgramRow(context.organizationId, programId);
  return programFromRow(context, row);
}

async function programFromRow(
  context: TrainingContext,
  row: ProgramRow,
): Promise<Program> {
  const [stored, counts] = await Promise.all([
    loadStored([row.id]),
    loadCounts([row.id]),
  ]);
  const structure = effectiveStructure(
    row,
    stored.get(row.id)!,
    counts.legacyLead.get(row.id),
  );
  const [peopleById, weeks] = await Promise.all([
    loadPeople(structure.coaches.map((coach) => coach.personId)),
    weeksOf(row, structure),
  ]);
  const summary = summaryOf(row, structure, counts, peopleById, context.now);
  return {
    ...summary,
    purpose: row.purpose,
    targetAudience: row.targetAudience,
    objectives: row.objectives,
    timezone: row.timezone,
    defaultPracticeMinutes: row.defaultPracticeMinutes,
    ...(row.catalogItemId ? { catalogItemId: row.catalogItemId } : {}),
    ...(row.sourceText ? { sourceText: row.sourceText } : {}),
    coaches: structure.coaches.flatMap((coach) => {
      const person = peopleById.get(coach.personId);
      return person
        ? [{ ...person, role: coach.role, weekdays: [...coach.weekdays] }]
        : [];
    }),
    weeklySlots: structure.slots.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      intervalWeeks: slot.intervalWeeks,
      ...(slot.venueId ? { venueId: slot.venueId } : {}),
      courtIds: [...slot.courtIds],
    })),
    exceptions: structure.exceptions.map((exception) => ({ ...exception })),
    weeks,
    ...(row.cancelledAt
      ? {
          cancellation: {
            cancelledAt: row.cancelledAt.toISOString(),
            reason: row.cancellationReason || "Cancelled",
          },
        }
      : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// --------------------------------------------------------------- validation

async function validateDraft(
  context: TrainingContext,
  draft: Partial<Draft>,
  dates: { startDate: string; endDate: string; timezone: string },
): Promise<void> {
  if (dates.endDate < dates.startDate) {
    badRequest("A program ends on or after the day it starts.");
  }
  if (daysBetween(dates.startDate, dates.endDate) > MAX_PROGRAM_DAYS) {
    badRequest("A program can run for at most two years.");
  }
  if (!isValidTimeZone(dates.timezone)) badRequest("Unknown time zone.");
  if (draft.coaches) {
    const personIds = draft.coaches.map((coach) => coach.personId);
    if (new Set(personIds).size !== personIds.length) {
      badRequest("Each coach appears once.");
    }
    if (draft.coaches.filter((coach) => coach.role === "lead").length > 1) {
      badRequest("A program has one lead coach.");
    }
    await assertClubStaff(context.organizationId, personIds);
  }
  if (draft.exceptions) {
    for (const exception of draft.exceptions) {
      if (exception.endsOn < exception.startsOn) {
        badRequest(`"${exception.label}" ends before it starts.`);
      }
    }
  }
  if (draft.weeklySlots) {
    for (const slot of draft.weeklySlots) {
      if (
        minuteOfDayFromTime(slot.endsAt.slice(0, 5)) <=
        minuteOfDayFromTime(slot.startsAt.slice(0, 5))
      ) {
        badRequest("A practice ends after it starts.");
      }
    }
    const venueIds = [
      ...new Set(
        draft.weeklySlots.flatMap((slot) =>
          slot.venueId ? [slot.venueId] : [],
        ),
      ),
    ];
    const courtIds = [
      ...new Set(draft.weeklySlots.flatMap((slot) => slot.courtIds)),
    ];
    if (venueIds.length > 0) {
      const rows = await getDatabase()
        .select({ id: venues.id })
        .from(venues)
        .where(
          and(
            inArray(venues.id, venueIds),
            eq(venues.organizationId, context.organizationId),
          ),
        );
      if (rows.length !== venueIds.length)
        notFound("This venue was not found.");
    }
    if (courtIds.length > 0) {
      const rows = await getDatabase()
        .select({ id: courts.id })
        .from(courts)
        .innerJoin(venues, eq(venues.id, courts.venueId))
        .where(
          and(
            inArray(courts.id, courtIds),
            eq(venues.organizationId, context.organizationId),
          ),
        );
      if (rows.length !== courtIds.length)
        notFound("This court was not found.");
    }
  }
  if (draft.athletePersonIds) await assertPeopleExist(draft.athletePersonIds);
}

// ------------------------------------------------------------ regeneration

interface RegenerationCounts {
  readonly created: number;
  readonly removed: number;
  readonly needsReview: number;
}

/**
 * Brings future pattern sessions in line with the program's slots and
 * exceptions. Sessions someone relied on are never moved or removed.
 */
async function regenerateSessions(
  transaction: Transaction,
  context: TrainingContext,
  program: ProgramRow,
): Promise<RegenerationCounts> {
  const [slots, exceptions, coaches, weeks, existing] = await Promise.all([
    transaction
      .select()
      .from(trainingProgramWeeklySlots)
      .where(eq(trainingProgramWeeklySlots.programId, program.id)),
    transaction
      .select()
      .from(trainingProgramDateExceptions)
      .where(eq(trainingProgramDateExceptions.programId, program.id)),
    transaction
      .select()
      .from(trainingProgramCoaches)
      .where(eq(trainingProgramCoaches.programId, program.id)),
    transaction
      .select()
      .from(trainingProgramWeeks)
      .where(eq(trainingProgramWeeks.programId, program.id)),
    transaction
      .select({
        id: trainingEvents.id,
        startsAt: trainingEvents.startsAt,
        status: trainingEvents.status,
        source: trainingEvents.source,
        planVersion: trainingEvents.practicePlanVersionId,
        focusText: trainingEvents.focusText,
      })
      .from(trainingEvents)
      .where(eq(trainingEvents.programId, program.id)),
  ]);
  const existingIds = existing.map((event) => event.id);
  const [responses, outcomes, coverage, substitutes] =
    existingIds.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          transaction
            .selectDistinct({ id: trainingAthleteResponses.trainingEventId })
            .from(trainingAthleteResponses)
            .where(
              inArray(trainingAthleteResponses.trainingEventId, existingIds),
            ),
          transaction
            .select({ id: trainingPracticeOutcomes.trainingEventId })
            .from(trainingPracticeOutcomes)
            .where(
              inArray(trainingPracticeOutcomes.trainingEventId, existingIds),
            ),
          transaction
            .select({ id: staffCoverageRequests.trainingEventId })
            .from(staffCoverageRequests)
            .where(inArray(staffCoverageRequests.trainingEventId, existingIds)),
          transaction
            .selectDistinct({ id: trainingEventCoaches.trainingEventId })
            .from(trainingEventCoaches)
            .where(
              and(
                inArray(trainingEventCoaches.trainingEventId, existingIds),
                eq(trainingEventCoaches.role, "substitute"),
              ),
            ),
        ]);
  const touched = new Set(
    [...responses, ...outcomes, ...coverage, ...substitutes].flatMap((row) =>
      row.id ? [row.id] : [],
    ),
  );
  const desired = generateOccurrences({
    startDate: program.startDate,
    endDate: program.endDate,
    timezone: program.timezone,
    slots: slots.map((slot) => ({
      weekday: slot.weekday,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      intervalWeeks: slot.intervalWeeks,
      venueId: slot.venueId,
      courtIds: slot.courtIds,
    })),
    exceptions,
  });
  const plan = planRegeneration({
    desired,
    existing: existing.map((event) => ({
      id: event.id,
      key: sessionKey(event.startsAt, program.timezone),
      startsAt: event.startsAt,
      status: event.status,
      source: event.source,
      touched:
        touched.has(event.id) ||
        event.status !== "planned" ||
        !!event.planVersion ||
        !!event.focusText,
    })),
    now: context.now,
  });
  if (plan.remove.length > 0) {
    await transaction
      .delete(trainingEvents)
      .where(inArray(trainingEvents.id, [...plan.remove]));
  }
  const loadByWeek = new Map(
    weeks.map((week) => [week.startsOn, week.plannedLoad]),
  );
  const sortedCoaches = [...coaches].sort((left, right) =>
    left.role === right.role ? 0 : left.role === "lead" ? -1 : 1,
  );
  for (let index = 0; index < plan.create.length; index += 200) {
    const chunk = plan.create.slice(index, index + 200);
    const rows = chunk.map((occurrence) => {
      const weekday = weekdayOfDate(occurrence.localDate);
      const weekStart = addCalendarDays(
        program.startDate,
        Math.floor(daysBetween(program.startDate, occurrence.localDate) / 7) *
          7,
      );
      const covering = sortedCoaches.filter(
        (coach) =>
          coach.weekdays.length === 0 || coach.weekdays.includes(weekday),
      );
      return {
        occurrence,
        covering,
        values: {
          id: crypto.randomUUID(),
          organizationId: program.organizationId,
          programId: program.id,
          kind: "practice" as const,
          title: program.title.slice(0, 160),
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          timezone: program.timezone,
          status: "planned" as const,
          coachPersonId:
            covering.find((coach) => coach.role === "lead")?.personId ??
            covering[0]?.personId ??
            null,
          venueId: occurrence.venueId ?? null,
          courtId: occurrence.courtId ?? null,
          plannedLoad: loadByWeek.get(weekStart) ?? 50,
          source: "program",
          createdByPersonId: context.actor.personId,
          createdAt: context.now,
          updatedAt: context.now,
        },
      };
    });
    await transaction
      .insert(trainingEvents)
      .values(rows.map((row) => row.values));
    const coachRows = rows.flatMap((row) =>
      row.covering.map((coach) => ({
        trainingEventId: row.values.id,
        personId: coach.personId,
        role: coach.role === "lead" ? "lead" : "assistant",
        createdAt: context.now,
      })),
    );
    if (coachRows.length > 0) {
      await transaction.insert(trainingEventCoaches).values(coachRows);
    }
  }
  const [count] = await transaction
    .select({ count: sql<number>`count(*)::int` })
    .from(trainingEvents)
    .where(
      and(
        eq(trainingEvents.programId, program.id),
        eq(trainingEvents.kind, "practice"),
        ne(trainingEvents.status, "cancelled"),
      ),
    );
  await transaction
    .update(trainingPrograms)
    .set({ scheduledSessionCount: count?.count ?? 0 })
    .where(eq(trainingPrograms.id, program.id));
  return {
    created: plan.create.length,
    removed: plan.remove.length,
    needsReview: plan.needsReview.length,
  };
}

// ---------------------------------------------------------------- writes

async function writeStructure(
  transaction: Transaction,
  context: TrainingContext,
  programId: string,
  draft: Partial<Draft>,
) {
  if (draft.coaches) {
    await transaction
      .delete(trainingProgramCoaches)
      .where(eq(trainingProgramCoaches.programId, programId));
    if (draft.coaches.length > 0) {
      await transaction.insert(trainingProgramCoaches).values(
        draft.coaches.map((coach) => ({
          programId,
          personId: coach.personId,
          role: coach.role,
          weekdays: [...new Set(coach.weekdays)].sort(),
          createdAt: context.now,
          updatedAt: context.now,
        })),
      );
    }
  }
  if (draft.weeklySlots) {
    await transaction
      .delete(trainingProgramWeeklySlots)
      .where(eq(trainingProgramWeeklySlots.programId, programId));
    if (draft.weeklySlots.length > 0) {
      await transaction.insert(trainingProgramWeeklySlots).values(
        draft.weeklySlots.map((slot) => ({
          programId,
          weekday: slot.weekday,
          startsAt: slot.startsAt.slice(0, 5),
          endsAt: slot.endsAt.slice(0, 5),
          intervalWeeks: slot.intervalWeeks,
          venueId: slot.venueId ?? null,
          courtIds: [...slot.courtIds],
          createdAt: context.now,
          updatedAt: context.now,
        })),
      );
    }
  }
  if (draft.exceptions) {
    await transaction
      .delete(trainingProgramDateExceptions)
      .where(eq(trainingProgramDateExceptions.programId, programId));
    if (draft.exceptions.length > 0) {
      await transaction.insert(trainingProgramDateExceptions).values(
        draft.exceptions.map((exception) => ({
          programId,
          kind: exception.kind,
          startsOn: exception.startsOn,
          endsOn: exception.endsOn,
          label: exception.label.trim().slice(0, 160),
          sessionId: exception.sessionId ?? null,
          sourceUrl: exception.sourceUrl ?? null,
          createdAt: context.now,
          updatedAt: context.now,
        })),
      );
    }
  }
  if (draft.athletePersonIds) {
    const wanted = new Set(draft.athletePersonIds);
    const current = await transaction
      .select({
        personId: trainingProgramParticipants.personId,
        status: trainingProgramParticipants.status,
      })
      .from(trainingProgramParticipants)
      .where(
        and(
          eq(trainingProgramParticipants.programId, programId),
          eq(trainingProgramParticipants.role, "athlete"),
        ),
      );
    const removed = current
      .filter((row) => !wanted.has(row.personId) && row.status !== "removed")
      .map((row) => row.personId);
    if (removed.length > 0) {
      await transaction
        .update(trainingProgramParticipants)
        .set({ status: "removed", updatedAt: context.now })
        .where(
          and(
            eq(trainingProgramParticipants.programId, programId),
            inArray(trainingProgramParticipants.personId, removed),
          ),
        );
    }
    if (wanted.size > 0) {
      await transaction
        .insert(trainingProgramParticipants)
        .values(
          [...wanted].map((personId) => ({
            programId,
            personId,
            role: "athlete",
            status: "active",
            joinedAt: context.now,
            createdAt: context.now,
            updatedAt: context.now,
          })),
        )
        .onConflictDoUpdate({
          target: [
            trainingProgramParticipants.programId,
            trainingProgramParticipants.personId,
          ],
          set: { status: "active", updatedAt: context.now },
        });
    }
  }
}

async function nextVersion(transaction: Transaction, programId: string) {
  const [row] = await transaction
    .select({
      max: sql<number>`coalesce(max(${trainingProgramVersions.version}), 0)::int`,
    })
    .from(trainingProgramVersions)
    .where(eq(trainingProgramVersions.programId, programId));
  return (row?.max ?? 0) + 1;
}

async function legacyLeadOf(programId: string) {
  return (await loadCounts([programId])).legacyLead.get(programId);
}

async function snapshotVersion(
  transaction: Transaction,
  context: TrainingContext,
  programId: string,
  snapshot: Record<string, unknown>,
  changeNote: string,
) {
  const id = crypto.randomUUID();
  await transaction.insert(trainingProgramVersions).values({
    id,
    programId,
    version: await nextVersion(transaction, programId),
    snapshot,
    changeNote,
    createdByPersonId: context.actor.personId,
    createdAt: context.now,
  });
  await transaction
    .update(trainingPrograms)
    .set({ currentVersionId: id })
    .where(eq(trainingPrograms.id, programId));
}

/** Keeps `recurrence` / `milestones` readable by the legacy training page. */
async function syncLegacyColumns(
  transaction: Transaction,
  programId: string,
  extra: { updatedAt?: Date },
): Promise<ProgramRow> {
  const [slots, exceptions] = await Promise.all([
    transaction
      .select()
      .from(trainingProgramWeeklySlots)
      .where(eq(trainingProgramWeeklySlots.programId, programId)),
    transaction
      .select()
      .from(trainingProgramDateExceptions)
      .where(eq(trainingProgramDateExceptions.programId, programId)),
  ]);
  const [row] = await transaction
    .update(trainingPrograms)
    .set({
      recurrence: legacyRecurrence(slots, exceptions),
      milestones: legacyMilestones(
        exceptions.map((exception) => ({
          id: exception.id,
          kind: exception.kind as ExceptionView["kind"],
          startsOn: exception.startsOn,
          endsOn: exception.endsOn,
          label: exception.label,
        })),
      ),
      ...extra,
    })
    .where(eq(trainingPrograms.id, programId))
    .returning();
  return row!;
}

export async function createProgram(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsCreateInputSchema>,
): Promise<Program> {
  assertManager(context);
  await validateDraft(context, input, input);
  const { idempotencyKey, ...request } = input;
  const { result } = await executeIdempotent({
    key: `${context.organizationId}:${idempotencyKey}`,
    procedure: "trainingPrograms.create",
    personId: context.actor.personId,
    organizationId: context.organizationId,
    request,
    now: context.now,
    execute: async () => {
      const id = crypto.randomUUID();
      const occurrences = generateOccurrences({
        startDate: input.startDate,
        endDate: input.endDate,
        timezone: input.timezone,
        slots: input.weeklySlots,
        exceptions: input.exceptions,
      });
      await getTransactionalDatabase().transaction(async (transaction) => {
        await transaction.insert(trainingPrograms).values({
          id,
          organizationId: context.organizationId,
          slug: slugify(input.title, id),
          title: input.title.trim(),
          purpose: input.purpose,
          targetAudience: input.targetAudience,
          objectives: input.objectives,
          approach: "",
          status: "draft",
          startDate: input.startDate,
          endDate: input.endDate,
          timezone: input.timezone,
          recurrence: legacyRecurrence(input.weeklySlots, input.exceptions),
          scheduledSessionCount: occurrences.length,
          defaultPracticeMinutes: input.defaultPracticeMinutes,
          athleteCount: Math.max(1, input.athletePersonIds.length),
          sourceText: input.sourceText?.trim() || null,
          createdByPersonId: context.actor.personId,
          createdAt: context.now,
          updatedAt: context.now,
        });
        await writeStructure(transaction, context, id, input);
        await syncLegacyColumns(transaction, id, {});
        await snapshotVersion(
          transaction,
          context,
          id,
          { draft: request },
          "Created as a draft.",
        );
        await audit(transaction, context, {
          action: "training-program.created",
          entityType: "training-program",
          entityId: id,
          after: request,
          reason:
            "Created a draft program; no sessions exist until it is activated.",
        });
      });
      log.info("training-programs.program.created", {
        organizationId: context.organizationId,
        programId: id,
        slots: input.weeklySlots.length,
        exceptions: input.exceptions.length,
        coaches: input.coaches.length,
        athletes: input.athletePersonIds.length,
        plannedPractices: occurrences.length,
      });
      return { id };
    },
    serializeResult: (value) => value,
  });
  return programDetail(context, result.id);
}

function assertEditable(row: ProgramRow, now: Date) {
  const status = programStatus(row, now);
  if (
    status === "cancelled" ||
    status === "archived" ||
    status === "completed"
  ) {
    conflict(`A ${status} program cannot be changed.`);
  }
}

async function lockProgram(transaction: Transaction, row: ProgramRow) {
  const [locked] = await transaction
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, row.id))
    .for("update");
  return locked ?? row;
}

export async function updateProgram(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsUpdateInputSchema>,
): Promise<Program> {
  assertManager(context);
  const before = await loadProgramRow(context.organizationId, input.programId);
  assertEditable(before, context.now);
  const dates = {
    startDate: input.startDate ?? before.startDate,
    endDate: input.endDate ?? before.endDate,
    timezone: input.timezone ?? before.timezone,
  };
  await validateDraft(context, input, dates);
  if (input.weeks) {
    const numbers = input.weeks.map((week) => week.weekNumber);
    if (new Set(numbers).size !== numbers.length) {
      badRequest("Each week appears once.");
    }
  }
  const legacyLead = await legacyLeadOf(before.id);
  const { programId, weeks, ...draft } = input;
  const regenerated = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const row = await lockProgram(transaction, before);
      assertEditable(row, context.now);
      await copyLegacyProgramStructure(transaction, context, row, legacyLead);
      await writeStructure(transaction, context, programId, draft);
      if (weeks) {
        await transaction
          .delete(trainingProgramWeeks)
          .where(eq(trainingProgramWeeks.programId, programId));
        if (weeks.length > 0) {
          await transaction.insert(trainingProgramWeeks).values(
            weeks.map((week) => ({
              programId,
              weekNumber: week.weekNumber,
              startsOn: week.startsOn,
              phase: week.phase,
              plannedLoad: week.plannedLoad,
              note: week.note?.trim() || null,
              createdAt: context.now,
              updatedAt: context.now,
            })),
          );
        }
      }
      await transaction
        .update(trainingPrograms)
        .set({
          ...(draft.title ? { title: draft.title.trim() } : {}),
          ...(draft.purpose !== undefined ? { purpose: draft.purpose } : {}),
          ...(draft.targetAudience !== undefined
            ? { targetAudience: draft.targetAudience }
            : {}),
          ...(draft.objectives ? { objectives: draft.objectives } : {}),
          ...dates,
          ...(draft.defaultPracticeMinutes
            ? { defaultPracticeMinutes: draft.defaultPracticeMinutes }
            : {}),
          ...(draft.athletePersonIds
            ? { athleteCount: Math.max(1, draft.athletePersonIds.length) }
            : {}),
        })
        .where(eq(trainingPrograms.id, programId));
      const updated = await syncLegacyColumns(transaction, programId, {
        updatedAt: context.now,
      });
      await snapshotVersion(
        transaction,
        context,
        programId,
        { update: input },
        "Updated.",
      );
      const counts =
        updated.status === "active"
          ? await regenerateSessions(transaction, context, updated)
          : { created: 0, removed: 0, needsReview: 0 };
      await audit(transaction, context, {
        action: "training-program.updated",
        entityType: "training-program",
        entityId: programId,
        before: {
          title: row.title,
          startDate: row.startDate,
          endDate: row.endDate,
        },
        after: input,
        reason:
          counts.needsReview > 0
            ? `Program updated; ${counts.created} sessions added, ${counts.removed} unused sessions removed, ${counts.needsReview} booked sessions left for review.`
            : `Program updated; ${counts.created} sessions added, ${counts.removed} unused sessions removed.`,
      });
      return counts;
    },
  );
  log.info("training-programs.program.updated", {
    organizationId: context.organizationId,
    programId,
    ...regenerated,
  });
  return programDetail(context, programId);
}

export async function activateProgram(
  context: TrainingContext,
  programId: string,
): Promise<Program> {
  assertManager(context);
  const before = await loadProgramRow(context.organizationId, programId);
  if (programStatus(before, context.now) === "active") {
    return programDetail(context, programId);
  }
  if (before.status !== "draft" || before.cancelledAt) {
    conflict("Only a draft program can be activated.");
  }
  const legacyLead = await legacyLeadOf(programId);
  const counts = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const row = await lockProgram(transaction, before);
      if (row.status !== "draft" || row.cancelledAt) {
        conflict("Only a draft program can be activated.");
      }
      await copyLegacyProgramStructure(transaction, context, row, legacyLead);
      const [updated] = await transaction
        .update(trainingPrograms)
        .set({
          status: "active",
          activatedAt: context.now,
          updatedAt: context.now,
        })
        .where(eq(trainingPrograms.id, programId))
        .returning();
      const result = await regenerateSessions(transaction, context, updated!);
      await audit(transaction, context, {
        action: "training-program.activated",
        entityType: "training-program",
        entityId: programId,
        before: { status: row.status },
        after: { status: "active" },
        reason: `Program activated; ${result.created} practices scheduled from the weekly pattern.`,
      });
      return result;
    },
  );
  log.info("training-programs.program.activated", {
    organizationId: context.organizationId,
    programId,
    ...counts,
  });
  return programDetail(context, programId);
}

export async function cancelProgram(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsCancelInputSchema>,
): Promise<Program> {
  assertManager(context);
  const before = await loadProgramRow(context.organizationId, input.programId);
  const status = programStatus(before, context.now);
  if (status === "cancelled") return programDetail(context, input.programId);
  if (status !== "draft" && status !== "active") {
    conflict(`A ${status} program cannot be cancelled.`);
  }
  const cancelledSessions = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const row = await lockProgram(transaction, before);
      if (row.cancelledAt) return 0;
      await transaction
        .update(trainingPrograms)
        .set({
          status: "archived",
          archivedAt: context.now,
          cancelledAt: context.now,
          cancellationReason: input.reason.trim(),
          updatedAt: context.now,
        })
        .where(eq(trainingPrograms.id, input.programId));
      const cancelled = await transaction
        .update(trainingEvents)
        .set({
          status: "cancelled",
          cancelledAt: context.now,
          cancelledByPersonId: context.actor.personId,
          cancellationReason: input.reason.trim(),
          updatedAt: context.now,
        })
        .where(
          and(
            eq(trainingEvents.programId, input.programId),
            inArray(trainingEvents.status, ["planned", "ready"]),
            gt(trainingEvents.startsAt, context.now),
          ),
        )
        .returning({ id: trainingEvents.id });
      await audit(transaction, context, {
        action: "training-program.cancelled",
        entityType: "training-program",
        entityId: input.programId,
        before: { status: row.status },
        after: { status: "cancelled", reason: input.reason },
        reason: input.notifyAthletes
          ? `Program cancelled with ${cancelled.length} future sessions; athletes to be told through a Concierge send a person confirms.`
          : `Program cancelled with ${cancelled.length} future sessions.`,
      });
      return cancelled.length;
    },
  );
  log.info("training-programs.program.cancelled", {
    organizationId: context.organizationId,
    programId: input.programId,
    cancelledSessions,
    notifyRequested: input.notifyAthletes,
  });
  return programDetail(context, input.programId);
}

// ------------------------------------------------------ create from a sentence

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** Dates written as "Nov 23", "23 November" or "2026-11-23", in order. */
export function datesInSentence(sentence: string, today: string): string[] {
  const found: { index: number; date: string }[] = [];
  for (const match of sentence.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    found.push({ index: match.index, date: match[0] });
  }
  const resolve = (month: number, day: number) => {
    const year = Number(today.slice(0, 4));
    for (const candidate of [year, year + 1]) {
      const date = `${candidate}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const parsed = new Date(`${date}T00:00:00.000Z`);
      if (parsed.getUTCMonth() !== month) return undefined;
      if (date >= addCalendarDays(today, -31)) return date;
    }
    return undefined;
  };
  for (const match of sentence.matchAll(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
  )) {
    const date = resolve(
      MONTHS.indexOf(match[1]!.slice(0, 3).toLowerCase()),
      Number(match[2]),
    );
    if (date) found.push({ index: match.index, date });
  }
  for (const match of sentence.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi,
  )) {
    const date = resolve(
      MONTHS.indexOf(match[2]!.slice(0, 3).toLowerCase()),
      Number(match[1]),
    );
    if (date) found.push({ index: match.index, date });
  }
  return found
    .sort((left, right) => left.index - right.index)
    .map((item) => item.date);
}

/**
 * "Fall build for 12 juniors, Mon and Wed 4–6, Sat 9–11, Nov 23 to Feb 14":
 * a reviewable draft. Code reads the days, times and dates; anything it had
 * to assume is listed, and nothing is saved.
 */
export async function proposeFromSentence(
  context: TrainingContext,
  sentence: string,
  timezone: string,
): Promise<z.infer<typeof trainingProgramsProposalSchema>> {
  const text = sentence.trim().replaceAll(/\s+/g, " ").slice(0, 4_000);
  const today = isoDate(context.now, timezone);
  const assumptions: string[] = [];
  const needsCheck: { field: string; note: string }[] = [];
  const clauses = text.split(/[,;]/).map((part) => part.trim());
  const slots = clauses.flatMap((clause) => {
    const parsed = parseNaturalLanguageSchedule(clause);
    return parsed.blocks.map((block) => ({
      weekday: block.weekday,
      startsAt: timeFromMinuteOfDay(block.startsAtMinute),
      endsAt: timeFromMinuteOfDay(Math.min(block.endsAtMinute, 23 * 60 + 59)),
      intervalWeeks: /every other week|fortnight/i.test(clause) ? 2 : 1,
      courtIds: [] as string[],
    }));
  });
  const uniqueSlots = slots.filter(
    (slot, index) =>
      slots.findIndex(
        (other) =>
          other.weekday === slot.weekday && other.startsAt === slot.startsAt,
      ) === index,
  );
  if (uniqueSlots.length === 0) {
    needsCheck.push({
      field: "weeklySlots",
      note: "Which days and times does the group practice?",
    });
  }
  const dates = datesInSentence(text, today);
  let startDate = dates[0];
  let endDate = dates[1];
  if (!startDate) {
    startDate = addCalendarDays(today, (8 - weekdayOfDate(today)) % 7 || 7);
    needsCheck.push({
      field: "startDate",
      note: "When does the program start?",
    });
  }
  if (!endDate || endDate < startDate) {
    endDate = addCalendarDays(startDate, 12 * 7 - 1);
    assumptions.push("Twelve weeks long");
    needsCheck.push({ field: "endDate", note: "When does the program end?" });
  }
  const athletes =
    /\b(\d{1,3})\s+(juniors|players|athletes|kids|girls|boys|adults)\b/i.exec(
      text,
    );
  if (athletes) {
    assumptions.push(
      `${athletes[1]} ${athletes[2]!.toLowerCase()}; add them on the roster`,
    );
  }
  if (/holiday|christmas|winter break/i.test(text)) {
    needsCheck.push({
      field: "exceptions",
      note: "Which dates are the holidays? Add them as a break.",
    });
  }
  const audience =
    /\bfor\s+(?:\d+\s+)?([a-z][a-z\s-]{2,40}?)(?:,|$| on | from )/i.exec(text);
  const title =
    text
      .split(/\bfor\b|,/i)[0]!
      .trim()
      .slice(0, 80) || "New program";
  const minutes = uniqueSlots.map(
    (slot) =>
      minuteOfDayFromTime(slot.endsAt) - minuteOfDayFromTime(slot.startsAt),
  );
  const defaultPracticeMinutes = minutes.length ? Math.max(...minutes) : 90;
  if (uniqueSlots.length > 0)
    assumptions.push(`Practice times are in ${timezone}`);
  needsCheck.push({ field: "coaches", note: "Who leads the program?" });
  log.info("training-programs.program.proposed", {
    organizationId: context.organizationId,
    slots: uniqueSlots.length,
    datesFound: dates.length,
    needsCheck: needsCheck.length,
  });
  return {
    sourceText: text,
    draft: {
      title: title[0]!.toUpperCase() + title.slice(1),
      purpose: "",
      targetAudience: audience?.[1]?.trim() ?? "",
      objectives: [],
      startDate,
      endDate,
      timezone,
      defaultPracticeMinutes: Math.min(
        720,
        Math.max(15, defaultPracticeMinutes),
      ),
      coaches: [],
      weeklySlots: uniqueSlots,
      exceptions: [],
      athletePersonIds: [],
    },
    assumptions,
    needsCheck,
  };
}
