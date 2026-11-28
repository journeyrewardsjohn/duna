/**
 * Training programs (B4): sessions (`training_events`) — the schedule read,
 * one-off sessions, cancelling, coaches, the plan or focus, computed
 * conflicts and the after-practice record.
 *
 * A session is "ready" when it has a plan (or a focus) and at least one
 * coach, "completed" once an outcome is recorded, and a cancelled session
 * keeps its row and reason. Conflicts are computed on every read; a
 * decision ("keep both", "ask cover", ...) is kept on the session in
 * `external_load.conflictResolutions` so the same conflict reads as
 * resolved afterwards.
 */
import {
  courtPlayStops,
  courts,
  getDatabase,
  getTransactionalDatabase,
  organizationStaffProfiles,
  staffBlackouts,
  staffCoverageOffers,
  staffCoverageRequests,
  staffTimeOff,
  trainingAthleteResponses,
  trainingEventCoaches,
  trainingEvents,
  trainingPracticeOutcomes,
  trainingPracticePlanBlocks,
  trainingPracticePlanVersions,
  trainingPracticePlans,
  trainingProgramCoaches,
  trainingProgramDateExceptions,
  trainingProgramParticipants,
  trainingProgramWeeklySlots,
  trainingPrograms,
  venues,
} from "@duna/db";
import { log } from "@duna/observability";
import {
  addCalendarDays,
  isValidTimeZone,
  localMinuteOf,
  wallTimeToInstant,
  weekdayOfDate,
} from "@duna/scheduling";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import type {
  trainingProgramsAddSessionInputSchema,
  trainingProgramsAssignCoachesInputSchema,
  trainingProgramsCancelSessionInputSchema,
  trainingProgramsConflictSchema,
  trainingProgramsOutcomeSchema,
  trainingProgramsRecordOutcomeInputSchema,
  trainingProgramsResolveConflictInputSchema,
  trainingProgramsSessionSchema,
  trainingProgramsSetSessionPlanInputSchema,
} from "../../contracts/training-programs";
import { executeIdempotent } from "../../idempotency";
import { effectiveStructure } from "./legacy";
import { planTotals, type TimelineBlock } from "./plan-timeline";
import { loadProgramRow, programStatus } from "./programs-service";
import { dateInRanges, WEEKDAY_NAMES } from "./schedule";
import {
  assertClubStaff,
  assertContentReader,
  audit,
  badRequest,
  conflict,
  forbidden,
  hasScope,
  isoDate,
  isTrainingManager,
  loadPeople,
  notFound,
  type TrainingContext,
  type Transaction,
} from "./shared";

type EventRow = typeof trainingEvents.$inferSelect;
type Session = z.infer<typeof trainingProgramsSessionSchema>;
type Conflict = z.infer<typeof trainingProgramsConflictSchema>;
type Outcome = z.infer<typeof trainingProgramsOutcomeSchema>;

export const SESSION_WINDOW_DAYS = 400;
export const SESSION_LIST_LIMIT = 1_000;
const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ loading

export async function loadEvent(
  organizationId: string,
  sessionId: string,
): Promise<EventRow> {
  const [row] = await getDatabase()
    .select()
    .from(trainingEvents)
    .where(
      and(
        eq(trainingEvents.id, sessionId),
        eq(trainingEvents.organizationId, organizationId),
      ),
    );
  if (!row) notFound("This session was not found.");
  return row;
}

/**
 * Managers run every session; a coach runs the sessions of programs they
 * coach and the sessions they are on.
 */
async function assertCanRun(
  context: TrainingContext,
  target: { readonly programId: string | null; readonly eventId?: string },
): Promise<void> {
  if (isTrainingManager(context.actor)) return;
  if (!hasScope(context.actor, "training:write")) {
    forbidden("Only a coach or a manager can change sessions.");
  }
  const personId = context.actor.personId;
  const checks = await Promise.all([
    target.programId
      ? getDatabase()
          .select({ personId: trainingProgramCoaches.personId })
          .from(trainingProgramCoaches)
          .where(
            and(
              eq(trainingProgramCoaches.programId, target.programId),
              eq(trainingProgramCoaches.personId, personId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    target.eventId
      ? getDatabase()
          .select({ personId: trainingEventCoaches.personId })
          .from(trainingEventCoaches)
          .where(
            and(
              eq(trainingEventCoaches.trainingEventId, target.eventId),
              eq(trainingEventCoaches.personId, personId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    target.eventId
      ? getDatabase()
          .select({ id: trainingEvents.id })
          .from(trainingEvents)
          .where(
            and(
              eq(trainingEvents.id, target.eventId),
              eq(trainingEvents.coachPersonId, personId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (checks.some((rows) => rows.length > 0)) return;
  forbidden("Only this program's coaches or a manager can change it.");
}

function resolutionsOf(row: Pick<EventRow, "externalLoad">) {
  const value = row.externalLoad?.conflictResolutions;
  return typeof value === "object" && value !== null
    ? (value as Record<string, string>)
    : {};
}

/** Sessions with coaches, plan, cover and athlete counts: six queries in all. */
export async function buildSessions(
  rows: readonly EventRow[],
): Promise<Session[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const programIds = [
    ...new Set(rows.flatMap((row) => (row.programId ? [row.programId] : []))),
  ];
  const versionIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.practicePlanVersionId ? [row.practicePlanVersionId] : [],
      ),
    ),
  ];
  const database = getDatabase();
  const [coachRows, versionRows, coverRows, athleteRows] = await Promise.all([
    database
      .select()
      .from(trainingEventCoaches)
      .where(inArray(trainingEventCoaches.trainingEventId, ids)),
    versionIds.length
      ? database
          .select({
            versionId: trainingPracticePlanVersions.id,
            planId: trainingPracticePlans.id,
            title: trainingPracticePlans.title,
          })
          .from(trainingPracticePlanVersions)
          .innerJoin(
            trainingPracticePlans,
            eq(
              trainingPracticePlans.id,
              trainingPracticePlanVersions.practicePlanId,
            ),
          )
          .where(inArray(trainingPracticePlanVersions.id, versionIds))
      : Promise.resolve([]),
    database
      .select({ eventId: staffCoverageRequests.trainingEventId })
      .from(staffCoverageRequests)
      .where(
        and(
          inArray(staffCoverageRequests.trainingEventId, ids),
          inArray(staffCoverageRequests.status, [
            "open",
            "asking",
            "nobody-free",
          ]),
        ),
      ),
    programIds.length
      ? database
          .select({
            programId: trainingProgramParticipants.programId,
            count: sql<number>`count(*)::int`,
          })
          .from(trainingProgramParticipants)
          .where(
            and(
              inArray(trainingProgramParticipants.programId, programIds),
              eq(trainingProgramParticipants.role, "athlete"),
              inArray(trainingProgramParticipants.status, [
                "active",
                "invited",
              ]),
            ),
          )
          .groupBy(trainingProgramParticipants.programId)
      : Promise.resolve([]),
  ]);
  const peopleById = await loadPeople([
    ...coachRows.map((row) => row.personId),
    ...rows.map((row) => row.coachPersonId),
    ...rows.map((row) => row.cancelledByPersonId),
  ]);
  const versions = new Map(versionRows.map((row) => [row.versionId, row]));
  const covered = new Set(coverRows.map((row) => row.eventId));
  const athletes = new Map(
    athleteRows.map((row) => [row.programId, row.count]),
  );
  return rows.map((row) => {
    const own = coachRows.filter((coach) => coach.trainingEventId === row.id);
    const coaches = (
      own.length > 0
        ? own
            .sort((left, right) =>
              left.role === right.role ? 0 : left.role === "lead" ? -1 : 1,
            )
            .map((coach) => ({
              personId: coach.personId,
              role: coach.role as Session["coaches"][number]["role"],
              courtId: coach.courtId,
            }))
        : row.coachPersonId
          ? [
              {
                personId: row.coachPersonId,
                role: "lead" as const,
                courtId: null,
              },
            ]
          : []
    ).flatMap((coach) => {
      const person = peopleById.get(coach.personId);
      return person
        ? [
            {
              ...person,
              role: coach.role,
              ...(coach.courtId ? { courtId: coach.courtId } : {}),
            },
          ]
        : [];
    });
    const version = row.practicePlanVersionId
      ? versions.get(row.practicePlanVersionId)
      : undefined;
    const plan: Session["plan"] = version
      ? {
          mode: "plan",
          practicePlanId: version.planId,
          practicePlanVersionId: row.practicePlanVersionId!,
          title: version.title,
          plannedLoad: row.plannedLoad,
        }
      : row.focusText
        ? {
            mode: "focus",
            focus: row.focusText.slice(0, 200),
            plannedLoad: row.plannedLoad,
            ...(row.estimatedTouches !== null
              ? { estimatedTouches: row.estimatedTouches }
              : {}),
            ...(row.estimatedJumps !== null
              ? { estimatedJumps: row.estimatedJumps }
              : {}),
            loadEstimateSource: row.loadEstimateSource as
              "assumed" | "coach-edited" | "derived-from-scene",
          }
        : { mode: "none" };
    const cancelledBy = row.cancelledByPersonId
      ? peopleById.get(row.cancelledByPersonId)
      : undefined;
    return {
      id: row.id,
      ...(row.programId ? { programId: row.programId } : {}),
      kind: row.kind,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timezone: row.timezone,
      status: row.status,
      source: row.source as Session["source"],
      ...(row.venueId ? { venueId: row.venueId } : {}),
      ...(row.courtId ? { courtId: row.courtId } : {}),
      coaches,
      plan,
      needsCover: covered.has(row.id),
      athleteCount: row.programId ? (athletes.get(row.programId) ?? 0) : 0,
      ...(row.status === "cancelled"
        ? {
            cancellation: {
              cancelledAt: (row.cancelledAt ?? row.updatedAt).toISOString(),
              reason: row.cancellationReason || "Cancelled",
              ...(cancelledBy ? { cancelledBy } : {}),
            },
          }
        : {}),
    };
  });
}

async function sessionOut(organizationId: string, sessionId: string) {
  const row = await loadEvent(organizationId, sessionId);
  const [session] = await buildSessions([row]);
  return session!;
}

// -------------------------------------------------------------------- reads

export async function listSessions(
  context: TrainingContext,
  input: {
    readonly programId?: string;
    readonly from: string;
    readonly to: string;
  },
): Promise<{ items: Session[] }> {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (!(to > from)) badRequest("The window ends after it starts.");
  if (to.getTime() - from.getTime() > SESSION_WINDOW_DAYS * DAY_MS) {
    badRequest(`Ask for at most ${SESSION_WINDOW_DAYS} days at a time.`);
  }
  if (input.programId)
    await loadProgramRow(context.organizationId, input.programId);
  const rows = await getDatabase()
    .select()
    .from(trainingEvents)
    .where(
      and(
        eq(trainingEvents.organizationId, context.organizationId),
        input.programId
          ? eq(trainingEvents.programId, input.programId)
          : undefined,
        lt(trainingEvents.startsAt, to),
        gt(trainingEvents.endsAt, from),
      ),
    )
    .orderBy(asc(trainingEvents.startsAt))
    .limit(SESSION_LIST_LIMIT);
  return { items: await buildSessions(rows) };
}

// ------------------------------------------------------------------ writes

function nextStatus(row: {
  status: EventRow["status"];
  practicePlanVersionId: string | null;
  focusText: string | null;
  coachCount: number;
}): EventRow["status"] {
  if (row.status !== "planned" && row.status !== "ready") return row.status;
  return (row.practicePlanVersionId || row.focusText) && row.coachCount > 0
    ? "ready"
    : "planned";
}

async function coachCount(transaction: Transaction, eventId: string) {
  const [row] = await transaction
    .select({ count: sql<number>`count(*)::int` })
    .from(trainingEventCoaches)
    .where(eq(trainingEventCoaches.trainingEventId, eventId));
  return row?.count ?? 0;
}

async function validatePlace(
  context: TrainingContext,
  venueId?: string,
  courtId?: string,
) {
  if (venueId) {
    const [venue] = await getDatabase()
      .select({ id: venues.id })
      .from(venues)
      .where(
        and(
          eq(venues.id, venueId),
          eq(venues.organizationId, context.organizationId),
        ),
      );
    if (!venue) notFound("This venue was not found.");
  }
  if (courtId) {
    const [court] = await getDatabase()
      .select({ id: courts.id, venueId: courts.venueId })
      .from(courts)
      .innerJoin(venues, eq(venues.id, courts.venueId))
      .where(
        and(
          eq(courts.id, courtId),
          eq(venues.organizationId, context.organizationId),
        ),
      );
    if (!court) notFound("This court was not found.");
    if (venueId && court.venueId !== venueId) {
      badRequest("The court is not at this venue.");
    }
  }
}

export async function addSession(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsAddSessionInputSchema>,
): Promise<Session> {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(endsAt > startsAt)) badRequest("A session ends after it starts.");
  if (endsAt.getTime() - startsAt.getTime() > 7 * DAY_MS) {
    badRequest("A session lasts at most a week.");
  }
  if (!isValidTimeZone(input.timezone)) badRequest("Unknown time zone.");
  if (input.programId) {
    const program = await loadProgramRow(
      context.organizationId,
      input.programId,
    );
    const status = programStatus(program, context.now);
    if (status === "cancelled" || status === "archived") {
      conflict(`A ${status} program cannot get new sessions.`);
    }
  }
  await assertCanRun(context, { programId: input.programId ?? null });
  await validatePlace(context, input.venueId, input.courtId);
  await assertClubStaff(context.organizationId, input.coachPersonIds);
  const { idempotencyKey, ...request } = input;
  const { result } = await executeIdempotent({
    key: `${context.organizationId}:${idempotencyKey}`,
    procedure: "trainingPrograms.addSession",
    personId: context.actor.personId,
    organizationId: context.organizationId,
    request,
    now: context.now,
    execute: async () => {
      const id = crypto.randomUUID();
      const coachIds = [...new Set(input.coachPersonIds)];
      await getTransactionalDatabase().transaction(async (transaction) => {
        await transaction.insert(trainingEvents).values({
          id,
          organizationId: context.organizationId,
          programId: input.programId ?? null,
          kind: input.kind,
          title: input.title.trim(),
          startsAt,
          endsAt,
          timezone: input.timezone,
          status: "planned",
          coachPersonId: coachIds[0] ?? null,
          venueId: input.venueId ?? null,
          courtId: input.courtId ?? null,
          source: "manual",
          createdByPersonId: context.actor.personId,
          createdAt: context.now,
          updatedAt: context.now,
        });
        if (coachIds.length > 0) {
          await transaction.insert(trainingEventCoaches).values(
            coachIds.map((personId, index) => ({
              trainingEventId: id,
              personId,
              role: index === 0 ? "lead" : "assistant",
              createdAt: context.now,
            })),
          );
        }
        await audit(transaction, context, {
          action: "training-session.added",
          entityType: "training-event",
          entityId: id,
          after: request,
          reason: "Added a one-off session.",
        });
      });
      log.info("training-programs.session.added", {
        organizationId: context.organizationId,
        sessionId: id,
        programId: input.programId,
        kind: input.kind,
        coaches: coachIds.length,
      });
      return { id };
    },
    serializeResult: (value) => value,
  });
  return sessionOut(context.organizationId, result.id);
}

export async function cancelSession(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsCancelSessionInputSchema>,
): Promise<Session> {
  const row = await loadEvent(context.organizationId, input.sessionId);
  await assertCanRun(context, { programId: row.programId, eventId: row.id });
  if (row.status === "cancelled")
    return sessionOut(context.organizationId, row.id);
  if (row.status === "completed")
    conflict("A completed session cannot be cancelled.");
  await getTransactionalDatabase().transaction(async (transaction) => {
    await cancelEvent(transaction, context, row, input.reason.trim());
    await audit(transaction, context, {
      action: "training-session.cancelled",
      entityType: "training-event",
      entityId: row.id,
      before: { status: row.status },
      after: { status: "cancelled" },
      reason: input.notifyAthletes
        ? "Session cancelled; athletes to be told through a Concierge send a person confirms."
        : "Session cancelled; the row and reason are kept.",
    });
  });
  log.info("training-programs.session.cancelled", {
    organizationId: context.organizationId,
    sessionId: row.id,
    programId: row.programId,
    notifyRequested: input.notifyAthletes,
  });
  return sessionOut(context.organizationId, row.id);
}

async function cancelEvent(
  transaction: Transaction,
  context: TrainingContext,
  row: EventRow,
  reason: string,
) {
  await transaction
    .update(trainingEvents)
    .set({
      status: "cancelled",
      cancelledAt: context.now,
      cancelledByPersonId: context.actor.personId,
      cancellationReason: reason.slice(0, 500),
      updatedAt: context.now,
    })
    .where(eq(trainingEvents.id, row.id));
}

export async function assignSessionCoaches(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsAssignCoachesInputSchema>,
): Promise<Session> {
  const row = await loadEvent(context.organizationId, input.sessionId);
  await assertCanRun(context, { programId: row.programId, eventId: row.id });
  if (row.status === "cancelled" || row.status === "completed") {
    conflict(`A ${row.status} session keeps its coaches.`);
  }
  const personIds = input.coaches.map((coach) => coach.personId);
  if (new Set(personIds).size !== personIds.length) {
    badRequest("Each coach appears once.");
  }
  if (input.coaches.filter((coach) => coach.role === "lead").length > 1) {
    badRequest("A session has one lead coach.");
  }
  await assertClubStaff(context.organizationId, personIds);
  for (const coach of input.coaches) {
    if (coach.courtId) await validatePlace(context, undefined, coach.courtId);
  }
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .delete(trainingEventCoaches)
      .where(eq(trainingEventCoaches.trainingEventId, row.id));
    if (input.coaches.length > 0) {
      await transaction.insert(trainingEventCoaches).values(
        input.coaches.map((coach) => ({
          trainingEventId: row.id,
          personId: coach.personId,
          role: coach.role,
          courtId: coach.courtId ?? null,
          createdAt: context.now,
        })),
      );
    }
    const lead =
      input.coaches.find((coach) => coach.role === "lead") ?? input.coaches[0];
    await transaction
      .update(trainingEvents)
      .set({
        coachPersonId: lead?.personId ?? null,
        status: nextStatus({ ...row, coachCount: input.coaches.length }),
        updatedAt: context.now,
      })
      .where(eq(trainingEvents.id, row.id));
    await audit(transaction, context, {
      action: "training-session.coaches-assigned",
      entityType: "training-event",
      entityId: row.id,
      after: input.coaches,
      reason: `Session coaches set (${input.coaches.length}).`,
    });
  });
  log.info("training-programs.session.coaches-assigned", {
    organizationId: context.organizationId,
    sessionId: row.id,
    coaches: input.coaches.length,
  });
  return sessionOut(context.organizationId, row.id);
}

/** A plan version this club can attach: one of its own plans. */
async function loadClubPlanVersion(organizationId: string, versionId: string) {
  const [version] = await getDatabase()
    .select({
      id: trainingPracticePlanVersions.id,
      planId: trainingPracticePlans.id,
      status: trainingPracticePlans.status,
    })
    .from(trainingPracticePlanVersions)
    .innerJoin(
      trainingPracticePlans,
      eq(trainingPracticePlans.id, trainingPracticePlanVersions.practicePlanId),
    )
    .where(
      and(
        eq(trainingPracticePlanVersions.id, versionId),
        eq(trainingPracticePlans.organizationId, organizationId),
      ),
    );
  if (!version) notFound("This practice plan was not found.");
  if (version.status === "archived")
    conflict("An archived plan cannot be attached.");
  const blocks = await getDatabase()
    .select()
    .from(trainingPracticePlanBlocks)
    .where(eq(trainingPracticePlanBlocks.practicePlanVersionId, versionId));
  const timeline: TimelineBlock[] = blocks.map((block) => ({
    sequence: block.sequence,
    lane: block.lane,
    title: block.title,
    kind: "drill",
    startsAtMinute: block.startsAtMinute,
    durationMinutes: block.durationMinutes,
    transitionMinutes: block.transitionMinutes,
    intensity: block.intensity,
    estimatedTouches: block.estimatedTouches ?? undefined,
    estimatedJumps: block.estimatedJumps ?? undefined,
  }));
  const totals = planTotals({ blocks: timeline, plannedMinutes: 1 });
  return {
    ...version,
    load: totals.load,
    touches: totals.touches,
    jumps: totals.jumps,
  };
}

export async function setSessionPlan(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsSetSessionPlanInputSchema>,
): Promise<Session> {
  const row = await loadEvent(context.organizationId, input.sessionId);
  await assertCanRun(context, { programId: row.programId, eventId: row.id });
  if (row.status === "cancelled" || row.status === "completed") {
    conflict(`A ${row.status} session keeps its plan.`);
  }
  const plan = input.plan;
  const version =
    plan.mode === "plan"
      ? await loadClubPlanVersion(
          context.organizationId,
          plan.practicePlanVersionId,
        )
      : undefined;
  await getTransactionalDatabase().transaction(async (transaction) => {
    const values =
      plan.mode === "plan"
        ? {
            practicePlanVersionId: version!.id,
            focusText: null,
            plannedLoad: version!.load,
            estimatedTouches: version!.touches,
            estimatedJumps: version!.jumps,
            loadEstimateSource: "assumed",
          }
        : plan.mode === "focus"
          ? {
              practicePlanVersionId: null,
              focusText: plan.focus.trim(),
              plannedLoad: plan.plannedLoad,
              estimatedTouches: plan.estimatedTouches ?? null,
              estimatedJumps: plan.estimatedJumps ?? null,
              loadEstimateSource: "coach-edited",
            }
          : {
              practicePlanVersionId: null,
              focusText: null,
              estimatedTouches: null,
              estimatedJumps: null,
              loadEstimateSource: "assumed",
            };
    const count = await coachCount(transaction, row.id);
    await transaction
      .update(trainingEvents)
      .set({
        ...values,
        status: nextStatus({
          status: row.status,
          practicePlanVersionId: values.practicePlanVersionId,
          focusText: values.focusText,
          coachCount: count || (row.coachPersonId ? 1 : 0),
        }),
        updatedAt: context.now,
      })
      .where(eq(trainingEvents.id, row.id));
    await audit(transaction, context, {
      action: "training-session.plan-set",
      entityType: "training-event",
      entityId: row.id,
      after: { mode: plan.mode, versionId: version?.id },
      reason: `Session plan set to ${plan.mode}.`,
    });
  });
  log.info("training-programs.session.plan-set", {
    organizationId: context.organizationId,
    sessionId: row.id,
    mode: plan.mode,
  });
  return sessionOut(context.organizationId, row.id);
}

// ---------------------------------------------------------------- conflicts

interface ComputedConflict extends Conflict {
  /** Where the blocking period ends, for "move-practice". */
  readonly blockedUntil?: string;
  readonly coachPersonId?: string;
  readonly staffProfileId?: string;
  readonly blackoutId?: string;
  readonly timeOffId?: string;
}

function conflictId(kind: string, sessionId: string): string {
  return `${kind}:${sessionId}`;
}

async function computeConflicts(
  context: TrainingContext,
  programId: string,
): Promise<{ conflicts: ComputedConflict[]; events: Map<string, EventRow> }> {
  const program = await loadProgramRow(context.organizationId, programId);
  const database = getDatabase();
  const [slots, exceptions, coaches, events] = await Promise.all([
    database
      .select()
      .from(trainingProgramWeeklySlots)
      .where(eq(trainingProgramWeeklySlots.programId, programId)),
    database
      .select()
      .from(trainingProgramDateExceptions)
      .where(eq(trainingProgramDateExceptions.programId, programId)),
    database
      .select()
      .from(trainingProgramCoaches)
      .where(eq(trainingProgramCoaches.programId, programId)),
    database
      .select()
      .from(trainingEvents)
      .where(
        and(
          eq(trainingEvents.programId, programId),
          ne(trainingEvents.status, "cancelled"),
          ne(trainingEvents.status, "completed"),
          gt(trainingEvents.endsAt, context.now),
        ),
      )
      .orderBy(asc(trainingEvents.startsAt))
      .limit(SESSION_LIST_LIMIT),
  ]);
  const structure = effectiveStructure(program, {
    slots,
    exceptions,
    coaches,
  });
  const byId = new Map(events.map((event) => [event.id, event]));
  if (events.length === 0) return { conflicts: [], events: byId };
  const eventIds = events.map((event) => event.id);
  const from = events[0]!.startsAt;
  const to = new Date(
    Math.max(...events.map((event) => event.endsAt.getTime())),
  );
  const eventCoaches = await database
    .select()
    .from(trainingEventCoaches)
    .where(inArray(trainingEventCoaches.trainingEventId, eventIds));
  const coachIdsByEvent = new Map<string, string[]>();
  for (const event of events) {
    const own = eventCoaches
      .filter((coach) => coach.trainingEventId === event.id)
      .map((coach) => coach.personId);
    coachIdsByEvent.set(
      event.id,
      own.length > 0 ? own : event.coachPersonId ? [event.coachPersonId] : [],
    );
  }
  const coachIds = [...new Set([...coachIdsByEvent.values()].flat())];
  const venueIds = [
    ...new Set(
      events.flatMap((event) => (event.venueId ? [event.venueId] : [])),
    ),
  ];
  const [profiles, stops, cover] = await Promise.all([
    coachIds.length
      ? database
          .select({
            id: organizationStaffProfiles.id,
            personId: organizationStaffProfiles.personId,
          })
          .from(organizationStaffProfiles)
          .where(
            and(
              eq(
                organizationStaffProfiles.organizationId,
                context.organizationId,
              ),
              inArray(organizationStaffProfiles.personId, coachIds),
            ),
          )
      : Promise.resolve([]),
    venueIds.length
      ? database
          .select()
          .from(courtPlayStops)
          .where(
            and(
              eq(courtPlayStops.organizationId, context.organizationId),
              inArray(courtPlayStops.venueId, venueIds),
              eq(courtPlayStops.status, "active"),
              lt(courtPlayStops.startsAt, to),
              or(
                isNull(courtPlayStops.endsAt),
                gt(courtPlayStops.endsAt, from),
              ),
            ),
          )
      : Promise.resolve([]),
    database
      .select({ eventId: staffCoverageRequests.trainingEventId })
      .from(staffCoverageRequests)
      .where(inArray(staffCoverageRequests.trainingEventId, eventIds)),
  ]);
  const profileIds = profiles.map((profile) => profile.id);
  const [blackouts, timeOff] = profileIds.length
    ? await Promise.all([
        database
          .select()
          .from(staffBlackouts)
          .where(
            and(
              inArray(staffBlackouts.staffProfileId, profileIds),
              lt(staffBlackouts.startsAt, to),
              gt(staffBlackouts.endsAt, from),
            ),
          ),
        database
          .select()
          .from(staffTimeOff)
          .where(
            and(
              inArray(staffTimeOff.staffProfileId, profileIds),
              eq(staffTimeOff.status, "approved"),
              lt(staffTimeOff.startsAt, to),
              gt(staffTimeOff.endsAt, from),
            ),
          ),
      ])
    : [[], []];
  const peopleById = await loadPeople(coachIds);
  const profileByPerson = new Map(
    profiles.map((row) => [row.personId, row.id]),
  );
  const covered = new Set(cover.map((row) => row.eventId));
  const conflicts: ComputedConflict[] = [];
  const overlaps = (event: EventRow, startsAt: Date, endsAt: Date | null) =>
    event.startsAt < (endsAt ?? new Date(8.64e15)) && event.endsAt > startsAt;
  for (const event of events) {
    const resolutions = resolutionsOf(event);
    const add = (
      entry: Omit<
        ComputedConflict,
        "id" | "programId" | "sessionId" | "status"
      >,
    ) => {
      const id = conflictId(entry.kind, event.id);
      const resolution =
        (resolutions[id] as Conflict["resolution"] | undefined) ??
        (entry.kind.startsWith("coach-") && covered.has(event.id)
          ? "ask-cover"
          : undefined);
      conflicts.push({
        ...entry,
        id,
        programId,
        sessionId: event.id,
        status: resolution ? "resolved" : "open",
        ...(resolution ? { resolution } : {}),
      });
    };
    const date = isoDate(event.startsAt, program.timezone);
    if (event.kind === "practice") {
      const exception = structure.exceptions.find((candidate) =>
        dateInRanges(date, [candidate]),
      );
      if (exception) {
        add({
          kind: "milestone-overlaps-practice",
          description: `${exception.label} falls on a ${WEEKDAY_NAMES[weekdayOfDate(date)]} practice`,
          suggestedResolutions: ["drop-practice", "keep-both", "move-practice"],
          blockedUntil: exception.endsOn,
        });
      }
    }
    for (const personId of coachIdsByEvent.get(event.id) ?? []) {
      const profileId = profileByPerson.get(personId);
      if (!profileId) continue;
      const name = peopleById.get(personId)?.displayName ?? "A coach";
      const blackout = blackouts.find(
        (row) =>
          row.staffProfileId === profileId &&
          overlaps(event, row.startsAt, row.endsAt),
      );
      if (
        blackout &&
        !conflicts.some(
          (item) => item.id === conflictId("coach-blackout", event.id),
        )
      ) {
        add({
          kind: "coach-blackout",
          description: `${name} is unavailable`,
          suggestedResolutions: ["ask-cover", "move-practice"],
          blockedUntil: isoDate(blackout.endsAt, program.timezone),
          coachPersonId: personId,
          staffProfileId: profileId,
          blackoutId: blackout.id,
        });
      }
      const away = timeOff.find(
        (row) =>
          row.staffProfileId === profileId &&
          overlaps(event, row.startsAt, row.endsAt),
      );
      if (
        away &&
        !conflicts.some(
          (item) => item.id === conflictId("coach-time-off", event.id),
        )
      ) {
        add({
          kind: "coach-time-off",
          description: `${name} has approved time off`,
          suggestedResolutions: ["ask-cover", "move-practice"],
          blockedUntil: isoDate(away.endsAt, program.timezone),
          coachPersonId: personId,
          staffProfileId: profileId,
          timeOffId: away.id,
        });
      }
    }
    if (event.venueId) {
      const stop = stops.find(
        (row) =>
          row.venueId === event.venueId &&
          (row.courtIds.length === 0 ||
            (event.courtId !== null && row.courtIds.includes(event.courtId))) &&
          overlaps(event, row.startsAt, row.endsAt),
      );
      if (stop) {
        add({
          kind: "court-unavailable",
          description:
            stop.courtIds.length === 0
              ? "The courts are closed"
              : "The court is closed",
          suggestedResolutions: ["move-practice", "drop-practice"],
          ...(stop.endsAt
            ? { blockedUntil: isoDate(stop.endsAt, program.timezone) }
            : {}),
        });
      }
    }
  }
  return { conflicts, events: byId };
}

function publicConflict(entry: ComputedConflict): Conflict {
  return {
    id: entry.id,
    programId: entry.programId,
    sessionId: entry.sessionId,
    kind: entry.kind,
    description: entry.description,
    suggestedResolutions: entry.suggestedResolutions,
    status: entry.status,
    ...(entry.resolution ? { resolution: entry.resolution } : {}),
  };
}

export async function listConflicts(
  context: TrainingContext,
  programId: string,
): Promise<{ items: Conflict[] }> {
  const { conflicts } = await computeConflicts(context, programId);
  return { items: conflicts.map(publicConflict) };
}

export async function resolveConflict(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsResolveConflictInputSchema>,
): Promise<Conflict> {
  const program = await loadProgramRow(context.organizationId, input.programId);
  await assertCanRun(context, { programId: program.id });
  const { conflicts, events } = await computeConflicts(
    context,
    input.programId,
  );
  const found = conflicts.find((item) => item.id === input.conflictId);
  if (!found) notFound("This conflict was not found or no longer applies.");
  if (found.status === "resolved" && found.resolution === input.resolution) {
    return publicConflict(found);
  }
  if (input.resolution === "ask-cover" && !found.staffProfileId) {
    badRequest("Asking for cover applies when a coach is unavailable.");
  }
  const event = events.get(found.sessionId)!;
  let substituteProfileId: string | undefined;
  if (input.substitutePersonId) {
    const [profile] = await getDatabase()
      .select({ id: organizationStaffProfiles.id })
      .from(organizationStaffProfiles)
      .where(
        and(
          eq(organizationStaffProfiles.organizationId, context.organizationId),
          eq(organizationStaffProfiles.personId, input.substitutePersonId),
          eq(organizationStaffProfiles.active, true),
        ),
      );
    if (!profile) badRequest("The substitute must be on this club's team.");
    substituteProfileId = profile.id;
  }
  let moved: { startsAt: Date; endsAt: Date } | undefined;
  if (input.resolution === "move-practice") {
    if (!found.blockedUntil) {
      conflict("This closure has no end date; pick a new time by hand.");
    }
    const tz = event.timezone;
    const newDate = addCalendarDays(found.blockedUntil, 1);
    if (newDate > program.endDate) {
      conflict("There is no day left in the program to move this practice to.");
    }
    const minute = localMinuteOf(event.startsAt.getTime(), tz);
    const startsAt = new Date(wallTimeToInstant(newDate, minute, tz));
    moved = {
      startsAt,
      endsAt: new Date(
        startsAt.getTime() +
          (event.endsAt.getTime() - event.startsAt.getTime()),
      ),
    };
  }
  await getTransactionalDatabase().transaction(async (transaction) => {
    const resolutions = {
      ...resolutionsOf(event),
      [found.id]: input.resolution,
    };
    if (input.resolution === "drop-practice") {
      await cancelEvent(transaction, context, event, found.description);
    }
    if (input.resolution === "ask-cover") {
      const [request] = await transaction
        .insert(staffCoverageRequests)
        .values({
          organizationId: context.organizationId,
          trainingEventId: event.id,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          originalStaffProfileId: found.staffProfileId ?? null,
          reason: found.kind === "coach-time-off" ? "time-off" : "blackout",
          timeOffId: found.timeOffId ?? null,
          blackoutId: found.blackoutId ?? null,
          status: substituteProfileId ? "asking" : "open",
          createdAt: context.now,
          updatedAt: context.now,
        })
        .onConflictDoNothing()
        .returning({ id: staffCoverageRequests.id });
      if (request && substituteProfileId) {
        await transaction.insert(staffCoverageOffers).values({
          requestId: request.id,
          staffProfileId: substituteProfileId,
          rank: 0,
          status: "asked",
          rationale: "Asked from the program schedule.",
          askedAt: context.now,
          createdAt: context.now,
          updatedAt: context.now,
        });
      }
    }
    await transaction
      .update(trainingEvents)
      .set({
        externalLoad: {
          ...event.externalLoad,
          conflictResolutions: resolutions,
        },
        ...(moved ?? {}),
        updatedAt: context.now,
      })
      .where(eq(trainingEvents.id, event.id));
    await audit(transaction, context, {
      action: "training-conflict.resolved",
      entityType: "training-event",
      entityId: event.id,
      after: { conflictId: found.id, resolution: input.resolution },
      reason: `Conflict (${found.kind}) resolved: ${input.resolution}.`,
    });
  });
  log.info("training-programs.conflict.resolved", {
    organizationId: context.organizationId,
    programId: program.id,
    sessionId: event.id,
    kind: found.kind,
    resolution: input.resolution,
    substituteAsked: Boolean(substituteProfileId),
  });
  return publicConflict({
    ...found,
    status: "resolved",
    resolution: input.resolution,
  });
}

// ---------------------------------------------------------- after practice

async function athletesOf(programId: string | null) {
  if (!programId) return [];
  return getDatabase()
    .select({ personId: trainingProgramParticipants.personId })
    .from(trainingProgramParticipants)
    .where(
      and(
        eq(trainingProgramParticipants.programId, programId),
        eq(trainingProgramParticipants.role, "athlete"),
        inArray(trainingProgramParticipants.status, [
          "active",
          "invited",
          "completed",
        ]),
      ),
    )
    .limit(200);
}

export async function sessionOutcome(
  context: TrainingContext,
  sessionId: string,
): Promise<Outcome> {
  assertContentReader(context);
  const row = await loadEvent(context.organizationId, sessionId);
  const database = getDatabase();
  const [[outcome], athletes, responses, blocks] = await Promise.all([
    database
      .select()
      .from(trainingPracticeOutcomes)
      .where(eq(trainingPracticeOutcomes.trainingEventId, row.id)),
    athletesOf(row.programId),
    database
      .select({
        personId: trainingAthleteResponses.personId,
        attendanceStatus: trainingAthleteResponses.attendanceStatus,
      })
      .from(trainingAthleteResponses)
      .where(eq(trainingAthleteResponses.trainingEventId, row.id))
      .limit(400),
    row.practicePlanVersionId
      ? database
          .select()
          .from(trainingPracticePlanBlocks)
          .where(
            eq(
              trainingPracticePlanBlocks.practicePlanVersionId,
              row.practicePlanVersionId,
            ),
          )
          .orderBy(asc(trainingPracticePlanBlocks.startsAtMinute))
      : Promise.resolve([]),
  ]);
  const personIds = [
    ...new Set([
      ...athletes.map((athlete) => athlete.personId),
      ...responses.map((response) => response.personId),
    ]),
  ];
  const peopleById = await loadPeople(personIds);
  const statusByPerson = new Map(
    responses.map((response) => [response.personId, response.attendanceStatus]),
  );
  const recorded = (outcome?.blockOutcomes ?? []) as readonly Record<
    string,
    unknown
  >[];
  return {
    sessionId: row.id,
    plannedLoad: row.plannedLoad,
    ...(outcome?.coachRpe ? { coachRpe: outcome.coachRpe } : {}),
    ...(outcome?.actualLoad !== null && outcome?.actualLoad !== undefined
      ? { actualLoad: outcome.actualLoad }
      : {}),
    attendance: personIds.flatMap((personId) => {
      const person = peopleById.get(personId);
      if (!person) return [];
      const status = statusByPerson.get(personId);
      return [
        {
          ...person,
          present: status === "attended" || status === "partial",
          proposed: !outcome,
        },
      ];
    }),
    blocks: blocks.map((block) => {
      const entry = recorded.find((item) => item.blockId === block.id);
      return {
        blockId: block.id,
        title: block.title,
        plannedMinutes: block.durationMinutes,
        ...(typeof entry?.actualMinutes === "number"
          ? { actualMinutes: entry.actualMinutes }
          : {}),
        ...(typeof entry?.outcome === "string" && entry.outcome
          ? { outcome: entry.outcome.slice(0, 500) }
          : {}),
      };
    }),
    ...(outcome?.notesMarkdown
      ? { notes: outcome.notesMarkdown.slice(0, 4_000) }
      : {}),
    ...(outcome ? { recordedAt: outcome.updatedAt.toISOString() } : {}),
  };
}

export async function recordSessionOutcome(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsRecordOutcomeInputSchema>,
): Promise<Outcome> {
  const row = await loadEvent(context.organizationId, input.sessionId);
  await assertCanRun(context, { programId: row.programId, eventId: row.id });
  if (row.status === "cancelled")
    conflict("A cancelled session has no outcome.");
  if (row.startsAt > context.now) {
    conflict("Record what happened once the session has started.");
  }
  const athletes = new Set(
    (await athletesOf(row.programId)).map((a) => a.personId),
  );
  const existingResponses = await getDatabase()
    .select({ personId: trainingAthleteResponses.personId })
    .from(trainingAthleteResponses)
    .where(eq(trainingAthleteResponses.trainingEventId, row.id));
  for (const response of existingResponses) athletes.add(response.personId);
  if (input.attendance.some((entry) => !athletes.has(entry.personId))) {
    badRequest("Attendance is for athletes of this session.");
  }
  const blockIds = new Set(
    row.practicePlanVersionId
      ? (
          await getDatabase()
            .select({ id: trainingPracticePlanBlocks.id })
            .from(trainingPracticePlanBlocks)
            .where(
              eq(
                trainingPracticePlanBlocks.practicePlanVersionId,
                row.practicePlanVersionId,
              ),
            )
        ).map((block) => block.id)
      : [],
  );
  if (input.blocks.some((block) => !blockIds.has(block.blockId))) {
    badRequest("Block outcomes are for blocks of the session's plan.");
  }
  const present = input.attendance.filter((entry) => entry.present).length;
  await getTransactionalDatabase().transaction(async (transaction) => {
    if (input.attendance.length > 0) {
      await transaction
        .insert(trainingAthleteResponses)
        .values(
          input.attendance.map((entry) => ({
            trainingEventId: row.id,
            personId: entry.personId,
            attendanceStatus: entry.present ? "attended" : "absent",
            createdAt: context.now,
            updatedAt: context.now,
          })),
        )
        .onConflictDoUpdate({
          target: [
            trainingAthleteResponses.trainingEventId,
            trainingAthleteResponses.personId,
          ],
          set: {
            attendanceStatus: sql`excluded.attendance_status`,
            updatedAt: context.now,
          },
        });
    }
    const values = {
      practicePlanVersionId: row.practicePlanVersionId,
      recordedByPersonId: context.actor.personId,
      actualLoad: input.actualLoad ?? null,
      coachRpe: input.coachRpe ?? null,
      attendanceCount: present,
      plannedBlockCount: blockIds.size,
      completedBlockCount: Math.min(
        blockIds.size,
        input.blocks.filter((block) => (block.actualMinutes ?? 0) > 0).length,
      ),
      blockOutcomes: input.blocks.map((block) => ({
        blockId: block.blockId,
        ...(block.actualMinutes !== undefined
          ? { actualMinutes: block.actualMinutes }
          : {}),
        ...(block.outcome ? { outcome: block.outcome } : {}),
      })),
      notesMarkdown: input.notes?.trim() || null,
      updatedAt: context.now,
    };
    await transaction
      .insert(trainingPracticeOutcomes)
      .values({ ...values, trainingEventId: row.id, createdAt: context.now })
      .onConflictDoUpdate({
        target: trainingPracticeOutcomes.trainingEventId,
        set: values,
      });
    await transaction
      .update(trainingEvents)
      .set({ status: "completed", updatedAt: context.now })
      .where(eq(trainingEvents.id, row.id));
    await audit(transaction, context, {
      action: "training-session.outcome-recorded",
      entityType: "training-event",
      entityId: row.id,
      after: input,
      reason: `After-practice record saved (${present} present of ${input.attendance.length}).`,
    });
  });
  log.info("training-programs.session.outcome-recorded", {
    organizationId: context.organizationId,
    sessionId: row.id,
    present,
    marked: input.attendance.length,
    blocks: input.blocks.length,
    hasNotes: Boolean(input.notes?.trim()),
  });
  return sessionOutcome(context, row.id);
}

/** Program ids whose schedules the athlete (or their junior) follows. */
export async function athleteProgramIds(personIds: readonly string[]) {
  if (personIds.length === 0) return [];
  const rows = await getDatabase()
    .select({ programId: trainingProgramParticipants.programId })
    .from(trainingProgramParticipants)
    .innerJoin(
      trainingPrograms,
      eq(trainingPrograms.id, trainingProgramParticipants.programId),
    )
    .where(
      and(
        inArray(trainingProgramParticipants.personId, [...personIds]),
        inArray(trainingProgramParticipants.status, [
          "active",
          "invited",
          "completed",
        ]),
        ne(trainingPrograms.status, "draft"),
      ),
    )
    .limit(200);
  return [...new Set(rows.map((row) => row.programId))];
}
