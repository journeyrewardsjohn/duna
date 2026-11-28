/**
 * Team availability (B3a): named schedules, blackouts and time off for one
 * team member, behind `operator.teamAvailability.*`. Writes that make a
 * member unavailable (time off approved, a blackout, a schedule change)
 * open coverage requests for the sessions they affect (./coverage-service).
 */
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  people,
  staffAvailabilitySchedules,
  staffAvailabilityWindows,
  staffBlackouts,
  staffTimeOff,
} from "@duna/db";
import { log, report } from "@duna/observability";
import { addCalendarDays, isValidTimeZone } from "@duna/scheduling";
import { and, desc, eq, inArray, lt, gt, ne, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type {
  teamAvailabilityAddBlackoutInputSchema,
  teamAvailabilityDecideTimeOffInputSchema,
  teamAvailabilityRequestTimeOffInputSchema,
  teamAvailabilityScheduleTransitionInputSchema,
  teamAvailabilityUpsertScheduleInputSchema,
} from "../../contracts/team-availability";
import type { z } from "zod";
import {
  openCoverageForUnavailability,
  sessionsNeedingCover,
} from "./coverage-service";
import { loadScheduleRows } from "./inputs";
import { copyLegacyAvailability } from "./legacy";
import {
  type StaffRow,
  type TeamActor,
  assertCanEditAvailability,
  assertManager,
  badRequest,
  conflict,
  contractTime,
  forbidden,
  hasScope,
  initials,
  isOwner,
  joinOvernightWindows,
  loadStaff,
  minutesOf,
  notFound,
  organizationTimezone,
  splitWindowForStorage,
  staffRef,
} from "./shared";

type ScheduleRow = Awaited<ReturnType<typeof loadScheduleRows>>[number];

/** How far ahead a schedule change looks for sessions that lose their coach. */
const OPEN_ENDED_LOOKAHEAD_DAYS = 120;

function scheduleOut(row: ScheduleRow) {
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    name: row.name,
    status: row.status as "draft" | "active" | "fallback" | "archived",
    effectiveFrom: row.effectiveFrom,
    ...(row.effectiveTo ? { effectiveTo: row.effectiveTo } : {}),
    timezone: row.timezone,
    ...(row.sourceText ? { sourceText: row.sourceText } : {}),
    windows: joinOvernightWindows(row.windows).map((window) => ({
      id: window.id,
      weekday: window.weekday,
      startsAt: contractTime(window.startMinute),
      endsAt: contractTime(window.endMinute),
      kind: window.kind as
        "coaching" | "early" | "juniors" | "office" | "other",
      ...(window.label ? { label: window.label } : {}),
      ...(window.venueId ? { venueId: window.venueId } : {}),
    })),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadSchedule(staffProfileId: string, scheduleId: string) {
  const [row] = (await loadScheduleRows([staffProfileId])).filter(
    (candidate) => candidate.id === scheduleId,
  );
  if (!row) notFound("This schedule was not found.");
  return row;
}

async function scheduleForOrganization(
  organizationId: string,
  scheduleId: string,
) {
  const [row] = await getDatabase()
    .select({
      id: staffAvailabilitySchedules.id,
      staffProfileId: staffAvailabilitySchedules.staffProfileId,
    })
    .from(staffAvailabilitySchedules)
    .where(
      and(
        eq(staffAvailabilitySchedules.id, scheduleId),
        eq(staffAvailabilitySchedules.organizationId, organizationId),
      ),
    );
  if (!row) notFound("This schedule was not found.");
  return row;
}

async function personRefs(personIds: readonly string[]) {
  if (personIds.length === 0)
    return new Map<
      string,
      {
        personId: string;
        displayName: string;
        initials: string;
        avatarUrl?: string;
      }
    >();
  const rows = await getDatabase()
    .select({
      id: people.id,
      displayName: people.displayName,
      avatarUrl: people.avatarUrl,
    })
    .from(people)
    .where(inArray(people.id, [...new Set(personIds)]));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        personId: row.id,
        displayName: row.displayName,
        initials: initials(row.displayName),
        ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
      },
    ]),
  );
}

function timeOffOut(
  row: typeof staffTimeOff.$inferSelect,
  needingCover: number,
  deciders: Map<
    string,
    {
      personId: string;
      displayName: string;
      initials: string;
      avatarUrl?: string;
    }
  >,
) {
  const decidedBy = row.decidedByPersonId
    ? deciders.get(row.decidedByPersonId)
    : undefined;
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    ...(row.reason ? { reason: row.reason } : {}),
    status: row.status as "requested" | "approved" | "declined" | "cancelled",
    requestedAt: row.requestedAt.toISOString(),
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    ...(decidedBy ? { decidedBy } : {}),
    ...(row.decisionNote ? { decisionNote: row.decisionNote } : {}),
    sessionsNeedingCover: needingCover,
  };
}

function blackoutOut(
  row: typeof staffBlackouts.$inferSelect,
  needingCover: number,
) {
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    ...(row.reason ? { reason: row.reason } : {}),
    sessionsNeedingCover: needingCover,
  };
}

async function audit(
  transaction: Parameters<
    Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
  >[0],
  context: TeamActor,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    reason: string;
  },
) {
  await transaction.insert(auditLog).values({
    organizationId: context.organizationId,
    actorPersonId: context.actor.personId,
    actorType: "person",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeHash: entry.before === undefined ? null : stableHash(entry.before),
    afterHash: entry.after === undefined ? null : stableHash(entry.after),
    reason: entry.reason,
    traceId: context.requestId,
    ipAddress: context.ipAddress ?? null,
    createdAt: context.now,
  });
}

/** Copies legacy availability before the member's first write (idempotent). */
async function ensureCopied(context: TeamActor, staff: StaffRow) {
  if (staff.legacyAvailability.length === 0) return;
  const timezone = await organizationTimezone(context.organizationId);
  await getTransactionalDatabase().transaction((transaction) =>
    copyLegacyAvailability(transaction, {
      staff,
      timezone,
      now: context.now,
      actorPersonId: context.actor.personId,
      requestId: context.requestId,
    }),
  );
}

/** Opens coverage after a committed write; failures are reported, not fatal. */
async function openCoverageSafely(
  context: TeamActor,
  input: Parameters<typeof openCoverageForUnavailability>[1],
) {
  try {
    return await openCoverageForUnavailability(context, input);
  } catch (error) {
    report(error, {
      event: "team-availability.coverage.open-failed",
      fields: { organizationId: context.organizationId },
      tags: { operation: "open-coverage" },
    });
    return { requestIds: [] as string[] };
  }
}

// ---------------------------------------------------------------- reads

export async function staffAvailabilityPage(
  context: TeamActor,
  staffProfileId: string,
) {
  const staff = await loadStaff(context.organizationId, staffProfileId);
  const database = getDatabase();
  const [schedules, blackouts, timeOff] = await Promise.all([
    loadScheduleRows([staff.id]),
    database
      .select()
      .from(staffBlackouts)
      .where(eq(staffBlackouts.staffProfileId, staff.id))
      .orderBy(desc(staffBlackouts.startsAt))
      .limit(200),
    database
      .select()
      .from(staffTimeOff)
      .where(eq(staffTimeOff.staffProfileId, staff.id))
      .orderBy(desc(staffTimeOff.startsAt))
      .limit(200),
  ]);
  const needing = await sessionsNeedingCover(context, staff, [
    ...blackouts.map((row) => ({
      id: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
    ...timeOff
      .filter((row) => row.status === "approved" || row.status === "requested")
      .map((row) => ({
        id: row.id,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      })),
  ]);
  const deciders = await personRefs(
    timeOff.flatMap((row) =>
      row.decidedByPersonId ? [row.decidedByPersonId] : [],
    ),
  );
  let shownSchedules = schedules;
  if (schedules.length === 0 && staff.legacyAvailability.length > 0) {
    // Not copied yet: copy now so the page shows what the club entered.
    await ensureCopied(context, staff);
    shownSchedules = await loadScheduleRows([staff.id]);
  }
  return {
    staff: staffRef(staff),
    schedules: shownSchedules
      .sort(
        (left, right) =>
          right.effectiveFrom.localeCompare(left.effectiveFrom) ||
          left.name.localeCompare(right.name),
      )
      .map(scheduleOut),
    blackouts: blackouts.map((row) =>
      blackoutOut(row, needing.get(row.id) ?? 0),
    ),
    timeOff: timeOff.map((row) =>
      timeOffOut(row, needing.get(row.id) ?? 0, deciders),
    ),
  };
}

// ---------------------------------------------------------------- schedules

function validateSchedule(
  input: z.infer<typeof teamAvailabilityUpsertScheduleInputSchema>,
) {
  if (!isValidTimeZone(input.timezone)) {
    badRequest("Choose a valid time zone.");
  }
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    badRequest("The schedule must end on or after the day it starts.");
  }
  for (const window of input.windows) {
    if (minutesOf(window.startsAt) === minutesOf(window.endsAt)) {
      badRequest("Every window needs different start and end times.");
    }
  }
}

export async function upsertSchedule(
  context: TeamActor,
  input: z.infer<typeof teamAvailabilityUpsertScheduleInputSchema>,
) {
  const staff = await loadStaff(context.organizationId, input.staffProfileId);
  assertCanEditAvailability(context, staff);
  validateSchedule(input);
  await ensureCopied(context, staff);
  const before = input.scheduleId
    ? await loadSchedule(staff.id, input.scheduleId)
    : undefined;
  if (before?.status === "archived") {
    conflict("An archived schedule cannot be changed. Create a new one.");
  }
  const scheduleId = await getTransactionalDatabase().transaction(
    async (transaction) => {
      let id = before?.id;
      const values = {
        name: input.name.trim(),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        timezone: input.timezone,
        sourceText: input.sourceText?.trim() || null,
        updatedAt: context.now,
      };
      if (id) {
        await transaction
          .update(staffAvailabilitySchedules)
          .set(values)
          .where(eq(staffAvailabilitySchedules.id, id));
        await transaction
          .delete(staffAvailabilityWindows)
          .where(eq(staffAvailabilityWindows.scheduleId, id));
      } else {
        const [row] = await transaction
          .insert(staffAvailabilitySchedules)
          .values({
            ...values,
            organizationId: context.organizationId,
            staffProfileId: staff.id,
            status: "draft",
            createdByPersonId: context.actor.personId,
            createdAt: context.now,
          })
          .returning({ id: staffAvailabilitySchedules.id });
        id = row!.id;
      }
      const rows = input.windows.flatMap((window) =>
        splitWindowForStorage(window).map((part) => ({
          scheduleId: id!,
          weekday: part.weekday,
          startsAt: part.startsAt,
          endsAt: part.endsAt,
          kind: window.kind,
          label: window.label?.trim() || null,
          venueId: window.venueId ?? null,
          createdAt: context.now,
        })),
      );
      if (rows.length > 0) {
        await transaction.insert(staffAvailabilityWindows).values(rows);
      }
      await audit(transaction, context, {
        action: before ? "staff-schedule.replaced" : "staff-schedule.created",
        entityType: "staff-schedule",
        entityId: id!,
        before: before ? scheduleOut(before) : undefined,
        after: { ...values, windows: input.windows },
        reason: before
          ? "Replaced an availability schedule and its weekly windows."
          : "Created a draft availability schedule.",
      });
      return id!;
    },
  );
  const saved = await loadSchedule(staff.id, scheduleId);
  log.info("team-availability.schedule.saved", {
    organizationId: context.organizationId,
    staffProfileId: staff.id,
    scheduleId,
    status: saved.status,
    windows: saved.windows.length,
  });
  if (saved.status === "active" || saved.status === "fallback") {
    await openCoverageSafely(context, {
      staff,
      reason: "schedule-change",
      range: scheduleRange(context.now, saved),
    });
  }
  return scheduleOut(saved);
}

function scheduleRange(
  now: Date,
  schedule: { effectiveFrom: string; effectiveTo: string | null },
) {
  const from = new Date(`${schedule.effectiveFrom}T00:00:00.000Z`);
  const startsAt = from > now ? from : now;
  const lookahead = new Date(
    startsAt.getTime() + OPEN_ENDED_LOOKAHEAD_DAYS * 86_400_000,
  );
  const to = schedule.effectiveTo
    ? new Date(`${addCalendarDays(schedule.effectiveTo, 2)}T00:00:00.000Z`)
    : lookahead;
  const endsAt = to < lookahead ? to : lookahead;
  return {
    startsAt,
    endsAt:
      endsAt > startsAt ? endsAt : new Date(startsAt.getTime() + 86_400_000),
  };
}

export async function transitionSchedule(
  context: TeamActor,
  input: z.infer<typeof teamAvailabilityScheduleTransitionInputSchema>,
) {
  const { staffProfileId } = await scheduleForOrganization(
    context.organizationId,
    input.scheduleId,
  );
  const staff = await loadStaff(context.organizationId, staffProfileId);
  assertCanEditAvailability(context, staff);
  const before = await loadSchedule(staff.id, input.scheduleId);
  const allowed =
    (before.status === "draft" &&
      (input.to === "active" || input.to === "fallback")) ||
    ((before.status === "active" || before.status === "fallback") &&
      input.to === "archived");
  if (!allowed) {
    conflict(`A ${before.status} schedule cannot become ${input.to}.`);
  }
  await getTransactionalDatabase().transaction(async (transaction) => {
    if (input.to === "fallback") {
      // One fallback per member: the previous one is archived.
      await transaction
        .update(staffAvailabilitySchedules)
        .set({ status: "archived", updatedAt: context.now })
        .where(
          and(
            eq(staffAvailabilitySchedules.staffProfileId, staff.id),
            eq(staffAvailabilitySchedules.status, "fallback"),
          ),
        );
    }
    if (input.to === "active") {
      // A planned successor: an earlier active schedule that would still be
      // running ends the day before this one starts.
      await transaction
        .update(staffAvailabilitySchedules)
        .set({
          effectiveTo: addCalendarDays(before.effectiveFrom, -1),
          updatedAt: context.now,
        })
        .where(
          and(
            eq(staffAvailabilitySchedules.staffProfileId, staff.id),
            eq(staffAvailabilitySchedules.status, "active"),
            ne(staffAvailabilitySchedules.id, before.id),
            lt(staffAvailabilitySchedules.effectiveFrom, before.effectiveFrom),
            sql`(${staffAvailabilitySchedules.effectiveTo} IS NULL OR ${staffAvailabilitySchedules.effectiveTo} >= ${before.effectiveFrom})`,
          ),
        );
    }
    await transaction
      .update(staffAvailabilitySchedules)
      .set({ status: input.to, updatedAt: context.now })
      .where(eq(staffAvailabilitySchedules.id, before.id));
    await audit(transaction, context, {
      action: `staff-schedule.${input.to}`,
      entityType: "staff-schedule",
      entityId: before.id,
      before: { status: before.status },
      after: { status: input.to },
      reason: `Schedule moved from ${before.status} to ${input.to}.`,
    });
  });
  const saved = await loadSchedule(staff.id, before.id);
  log.info("team-availability.schedule.transitioned", {
    organizationId: context.organizationId,
    staffProfileId: staff.id,
    scheduleId: saved.id,
    from: before.status,
    to: saved.status,
  });
  await openCoverageSafely(context, {
    staff,
    reason: "schedule-change",
    range: scheduleRange(context.now, saved),
  });
  return scheduleOut(saved);
}

// ---------------------------------------------------------------- blackouts

export async function addBlackout(
  context: TeamActor,
  input: z.infer<typeof teamAvailabilityAddBlackoutInputSchema>,
) {
  const staff = await loadStaff(context.organizationId, input.staffProfileId);
  assertCanEditAvailability(context, staff);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(endsAt > startsAt)) badRequest("A blackout must end after it starts.");
  await ensureCopied(context, staff);
  const row = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [inserted] = await transaction
        .insert(staffBlackouts)
        .values({
          organizationId: context.organizationId,
          staffProfileId: staff.id,
          startsAt,
          endsAt,
          reason: input.reason?.trim() || null,
          createdByPersonId: context.actor.personId,
          createdAt: context.now,
          updatedAt: context.now,
        })
        .returning();
      await audit(transaction, context, {
        action: "staff-blackout.added",
        entityType: "staff-blackout",
        entityId: inserted!.id,
        after: { startsAt: input.startsAt, endsAt: input.endsAt },
        reason: "Added a blackout.",
      });
      return inserted!;
    },
  );
  log.info("team-availability.blackout.added", {
    organizationId: context.organizationId,
    staffProfileId: staff.id,
    blackoutId: row.id,
  });
  await openCoverageSafely(context, {
    staff,
    reason: "blackout",
    blackoutId: row.id,
    range: { startsAt, endsAt },
  });
  const needing = await sessionsNeedingCover(context, staff, [row]);
  return blackoutOut(row, needing.get(row.id) ?? 0);
}

export async function removeBlackout(context: TeamActor, blackoutId: string) {
  const [row] = await getDatabase()
    .select()
    .from(staffBlackouts)
    .where(
      and(
        eq(staffBlackouts.id, blackoutId),
        eq(staffBlackouts.organizationId, context.organizationId),
      ),
    );
  if (!row) notFound("This blackout was not found.");
  const staff = await loadStaff(context.organizationId, row.staffProfileId);
  assertCanEditAvailability(context, staff);
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .delete(staffBlackouts)
      .where(eq(staffBlackouts.id, row.id));
    await audit(transaction, context, {
      action: "staff-blackout.removed",
      entityType: "staff-blackout",
      entityId: row.id,
      before: { startsAt: row.startsAt, endsAt: row.endsAt },
      reason: "Removed a blackout.",
    });
  });
  log.info("team-availability.blackout.removed", {
    organizationId: context.organizationId,
    staffProfileId: staff.id,
    blackoutId: row.id,
  });
  return { removed: true };
}

// ---------------------------------------------------------------- time off

export async function requestTimeOff(
  context: TeamActor,
  input: z.infer<typeof teamAvailabilityRequestTimeOffInputSchema>,
) {
  const staff = await loadStaff(context.organizationId, input.staffProfileId);
  assertCanEditAvailability(context, staff);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(endsAt > startsAt)) badRequest("Time off must end after it starts.");
  const [overlapping] = await getDatabase()
    .select({ id: staffTimeOff.id })
    .from(staffTimeOff)
    .where(
      and(
        eq(staffTimeOff.staffProfileId, staff.id),
        inArray(staffTimeOff.status, ["requested", "approved"]),
        lt(staffTimeOff.startsAt, endsAt),
        gt(staffTimeOff.endsAt, startsAt),
      ),
    )
    .limit(1);
  if (overlapping) {
    conflict("There is already time off asked for or approved in these dates.");
  }
  const row = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [inserted] = await transaction
        .insert(staffTimeOff)
        .values({
          organizationId: context.organizationId,
          staffProfileId: staff.id,
          startsAt,
          endsAt,
          reason: input.reason?.trim() || null,
          status: "requested",
          requestedByPersonId: context.actor.personId,
          requestedAt: context.now,
          createdAt: context.now,
          updatedAt: context.now,
        })
        .returning();
      await audit(transaction, context, {
        action: "staff-time-off.requested",
        entityType: "staff-time-off",
        entityId: inserted!.id,
        after: { startsAt: input.startsAt, endsAt: input.endsAt },
        reason: "Asked for time off.",
      });
      return inserted!;
    },
  );
  log.info("team-availability.time-off.requested", {
    organizationId: context.organizationId,
    staffProfileId: staff.id,
    timeOffId: row.id,
  });
  const needing = await sessionsNeedingCover(context, staff, [row]);
  return timeOffOut(row, needing.get(row.id) ?? 0, new Map());
}

/**
 * requested → approved | declined | cancelled; approved → cancelled.
 * Approving or declining needs a manager who is not the requester (the
 * owner may decide their own). Cancelling: the member or a manager.
 * Approval opens coverage requests for the sessions it affects.
 */
export async function decideTimeOff(
  context: TeamActor,
  input: z.infer<typeof teamAvailabilityDecideTimeOffInputSchema>,
) {
  const [row] = await getDatabase()
    .select()
    .from(staffTimeOff)
    .where(
      and(
        eq(staffTimeOff.id, input.timeOffId),
        eq(staffTimeOff.organizationId, context.organizationId),
      ),
    );
  if (!row) notFound("This time off was not found.");
  const staff = await loadStaff(context.organizationId, row.staffProfileId);
  const self = staff.personId === context.actor.personId;
  if (input.decision === "cancelled") {
    if (!self && !hasScope(context.actor, "members:write")) {
      forbidden("Only this team member or a manager can cancel this time off.");
    }
    if (row.status !== "requested" && row.status !== "approved") {
      conflict(`Time off that is ${row.status} cannot be cancelled.`);
    }
  } else {
    assertManager(context);
    if (self && !isOwner(context.actor)) {
      forbidden("Someone else must decide your own time off.");
    }
    if (row.status !== "requested") {
      conflict(`Time off that is ${row.status} cannot be ${input.decision}.`);
    }
  }
  const decided = input.decision !== "cancelled";
  const saved = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [updated] = await transaction
        .update(staffTimeOff)
        .set({
          status: input.decision,
          ...(decided
            ? {
                decidedAt: context.now,
                decidedByPersonId: context.actor.personId,
              }
            : {}),
          decisionNote: input.note?.trim() || row.decisionNote,
          updatedAt: context.now,
        })
        .where(
          and(eq(staffTimeOff.id, row.id), eq(staffTimeOff.status, row.status)),
        )
        .returning();
      if (!updated) conflict("This time off changed while you were deciding.");
      await audit(transaction, context, {
        action: `staff-time-off.${input.decision}`,
        entityType: "staff-time-off",
        entityId: row.id,
        before: { status: row.status },
        after: { status: input.decision },
        reason: `Time off ${input.decision}.`,
      });
      return updated;
    },
  );
  log.info("team-availability.time-off.decided", {
    organizationId: context.organizationId,
    staffProfileId: staff.id,
    timeOffId: row.id,
    decision: input.decision,
  });
  if (input.decision === "approved") {
    await openCoverageSafely(context, {
      staff,
      reason: "time-off",
      timeOffId: row.id,
      range: { startsAt: row.startsAt, endsAt: row.endsAt },
    });
  }
  const needing = await sessionsNeedingCover(context, staff, [saved]);
  const deciders = await personRefs(
    saved.decidedByPersonId ? [saved.decidedByPersonId] : [],
  );
  return timeOffOut(saved, needing.get(saved.id) ?? 0, deciders);
}
