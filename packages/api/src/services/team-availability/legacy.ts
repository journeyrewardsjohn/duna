/**
 * The legacy availability column (`organization_staff_profiles.availability`)
 * and the B3a tables.
 *
 * - `copyLegacyAvailability` is the idempotent data step: it copies what a
 *   club entered into named schedules, windows and blackouts, once per staff
 *   profile (an audit row marks it done; an advisory lock serialises
 *   concurrent first writes). It runs from the script
 *   `packages/api/scripts/migrate-legacy-staff-availability.ts` and,
 *   automatically, before the first availability write for a member.
 * - Until a member is copied, readers convert the legacy jsonb in memory
 *   (`loadAbsenceInputs`), so behaviour does not wait for the script.
 * - Nothing writes the legacy column any more. The old HQ Team editor reads
 *   the tables in the legacy shape (`legacyAvailabilityView`) and its saves
 *   go to the tables (`saveFromLegacyEditor`).
 */
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  organizationStaffProfiles,
  organizations,
  staffAvailabilitySchedules,
  staffAvailabilityWindows,
  staffBlackouts,
} from "@duna/db";
import { log } from "@duna/observability";
import {
  convertLegacyStaffAvailability,
  timeFromMinuteOfDay,
  toLegacyStaffAvailability,
  wallTimeToInstant,
  minuteOfDayFromTime,
} from "@duna/scheduling";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  LEGACY_COPIED_ACTION,
  legacyCopiedProfileIds,
  legacyEffectiveFrom,
  loadScheduleRows,
} from "./inputs";

export { LEGACY_COPIED_ACTION, legacyCopiedProfileIds };
import {
  type StaffRow,
  type Transaction,
  splitWindowForStorage,
  toPureSchedule,
} from "./shared";

/**
 * Copies one member's legacy availability into the tables, once. Returns
 * true when this call did the copy. Run inside the caller's transaction.
 */
export async function copyLegacyAvailability(
  transaction: Transaction,
  input: {
    readonly staff: StaffRow;
    readonly timezone: string;
    readonly now: Date;
    readonly actorPersonId?: string;
    readonly requestId?: string;
  },
): Promise<boolean> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`staff-availability:${input.staff.id}`}))`,
  );
  const [marker] = await transaction
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, "staff-profile"),
        eq(auditLog.entityId, input.staff.id),
        eq(auditLog.action, LEGACY_COPIED_ACTION),
      ),
    )
    .limit(1);
  if (marker) return false;
  const [profile] = await transaction
    .select({ availability: organizationStaffProfiles.availability })
    .from(organizationStaffProfiles)
    .where(eq(organizationStaffProfiles.id, input.staff.id));
  const conversion = convertLegacyStaffAvailability({
    entries: profile?.availability ?? [],
    timezone: input.timezone,
    undatedEffectiveFrom: legacyEffectiveFrom(input.staff),
  });
  for (const schedule of conversion.schedules) {
    const [row] = await transaction
      .insert(staffAvailabilitySchedules)
      .values({
        organizationId: input.staff.organizationId,
        staffProfileId: input.staff.id,
        name: schedule.name,
        status: schedule.status,
        effectiveFrom: schedule.effectiveFrom,
        effectiveTo: schedule.effectiveTo ?? null,
        timezone: schedule.timezone,
        createdByPersonId: input.actorPersonId ?? null,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: staffAvailabilitySchedules.id });
    if (schedule.windows.length > 0) {
      await transaction.insert(staffAvailabilityWindows).values(
        schedule.windows.map((window) => ({
          scheduleId: row!.id,
          weekday: window.weekday,
          startsAt: timeFromMinuteOfDay(window.startMinute),
          endsAt: timeFromMinuteOfDay(window.endMinute),
          kind: "coaching",
        })),
      );
    }
  }
  if (conversion.blackouts.length > 0) {
    await transaction.insert(staffBlackouts).values(
      conversion.blackouts.map((blackout) => ({
        organizationId: input.staff.organizationId,
        staffProfileId: input.staff.id,
        startsAt: new Date(blackout.startsAt),
        endsAt: new Date(blackout.endsAt),
        createdByPersonId: input.actorPersonId ?? null,
        createdAt: input.now,
        updatedAt: input.now,
      })),
    );
  }
  await transaction.insert(auditLog).values({
    organizationId: input.staff.organizationId,
    actorPersonId: input.actorPersonId ?? null,
    actorType: input.actorPersonId ? "person" : "system",
    action: LEGACY_COPIED_ACTION,
    entityType: "staff-profile",
    entityId: input.staff.id,
    reason: `Copied legacy availability: ${conversion.schedules.length} schedules, ${conversion.blackouts.length} blackouts, ${conversion.skipped} unreadable entries left out.`,
    traceId: input.requestId ?? null,
    createdAt: input.now,
  });
  log.info("team-availability.legacy.copied", {
    organizationId: input.staff.organizationId,
    staffProfileId: input.staff.id,
    schedules: conversion.schedules.length,
    blackouts: conversion.blackouts.length,
    skipped: conversion.skipped,
  });
  return true;
}

/**
 * The data step over every staff profile with legacy availability (or one
 * organisation's). Safe to run any number of times.
 */
export async function migrateLegacyStaffAvailability(input: {
  readonly organizationId?: string;
  readonly now?: Date;
}): Promise<{ copied: number; alreadyCopied: number }> {
  const now = input.now ?? new Date();
  const rows = await getDatabase()
    .select({
      id: organizationStaffProfiles.id,
      organizationId: organizationStaffProfiles.organizationId,
      personId: organizationStaffProfiles.personId,
      staffRole: organizationStaffProfiles.staffRole,
      active: organizationStaffProfiles.active,
      createdAt: organizationStaffProfiles.createdAt,
      legacyAvailability: organizationStaffProfiles.availability,
      timezone: organizations.timezone,
    })
    .from(organizationStaffProfiles)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationStaffProfiles.organizationId),
    )
    .where(
      and(
        ne(organizationStaffProfiles.availability, sql`'[]'::jsonb`),
        input.organizationId
          ? eq(organizationStaffProfiles.organizationId, input.organizationId)
          : undefined,
      ),
    );
  let copied = 0;
  let alreadyCopied = 0;
  for (const row of rows) {
    const done = await getTransactionalDatabase().transaction((transaction) =>
      copyLegacyAvailability(transaction, {
        staff: { ...row, displayName: "", avatarUrl: undefined },
        timezone: row.timezone,
        now,
      }),
    );
    if (done) copied += 1;
    else alreadyCopied += 1;
  }
  log.info("team-availability.legacy.migrated", {
    organizationId: input.organizationId ?? "all",
    copied,
    alreadyCopied,
  });
  return { copied, alreadyCopied };
}

/** The tables in the legacy shape, per staff profile (read compatibility). */
export async function legacyAvailabilityView(
  staff: readonly StaffRow[],
  timezone: string,
): Promise<Map<string, Record<string, unknown>[]>> {
  const ids = staff.map((row) => row.id);
  const view = new Map<string, Record<string, unknown>[]>();
  if (ids.length === 0) return view;
  const [schedules, blackouts, copied] = await Promise.all([
    loadScheduleRows(ids),
    getDatabase()
      .select()
      .from(staffBlackouts)
      .where(inArray(staffBlackouts.staffProfileId, ids)),
    legacyCopiedProfileIds(ids),
  ]);
  for (const member of staff) {
    const own = schedules.filter((row) => row.staffProfileId === member.id);
    if (own.length === 0 && !copied.has(member.id)) {
      // Not copied yet: the legacy value is still the truth.
      view.set(member.id, [...member.legacyAvailability]);
      continue;
    }
    view.set(
      member.id,
      toLegacyStaffAvailability({
        timezone,
        schedules: own.map((row) => ({
          ...toPureSchedule(row),
          name: row.name,
        })),
        blackouts: blackouts
          .filter((row) => row.staffProfileId === member.id)
          .map((row) => ({
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt.toISOString(),
          })),
      }),
    );
  }
  return view;
}

export interface LegacyEditorWindow {
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleId?: string;
  readonly scheduleName?: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
}

export interface LegacyEditorBlackout {
  readonly startsOn: string;
  readonly startsAt: string;
  readonly endsOn?: string;
  readonly endsAt: string;
}

/**
 * Saves what the old HQ Team editor sent into the tables, with the same
 * replace-everything meaning the editor always had: schedules it no longer
 * lists are archived, blackouts it no longer lists are removed. Drafts made
 * in the new editor are left alone. Returns the ids of blackouts it added
 * (the caller opens coverage for them).
 */
export async function saveFromLegacyEditor(
  transaction: Transaction,
  input: {
    readonly staff: StaffRow;
    readonly timezone: string;
    readonly windows: readonly LegacyEditorWindow[];
    readonly blackouts: readonly LegacyEditorBlackout[];
    readonly actorPersonId: string;
    readonly requestId: string;
    readonly now: Date;
  },
): Promise<{ addedBlackoutIds: string[] }> {
  await copyLegacyAvailability(transaction, {
    staff: input.staff,
    timezone: input.timezone,
    now: input.now,
    actorPersonId: input.actorPersonId,
    requestId: input.requestId,
  });
  const existing = await transaction
    .select()
    .from(staffAvailabilitySchedules)
    .where(eq(staffAvailabilitySchedules.staffProfileId, input.staff.id));
  const existingIds = new Set(existing.map((row) => row.id));
  const groups = new Map<string, LegacyEditorWindow[]>();
  for (const window of input.windows) {
    const key =
      window.scheduleId && existingIds.has(window.scheduleId)
        ? `id:${window.scheduleId}`
        : `new:${(window.scheduleName ?? "").toLowerCase()}|${window.effectiveFrom ?? ""}|${window.effectiveTo ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), window]);
  }
  const kept = new Set<string>();
  let fallbackId = existing.find((row) => row.status === "fallback")?.id;
  for (const [key, windows] of groups) {
    const first = windows[0]!;
    let scheduleId: string;
    if (key.startsWith("id:")) {
      scheduleId = key.slice(3);
      const row = existing.find((candidate) => candidate.id === scheduleId)!;
      await transaction
        .update(staffAvailabilitySchedules)
        .set({
          name: first.scheduleName ?? row.name,
          ...(first.effectiveFrom
            ? { effectiveFrom: first.effectiveFrom }
            : {}),
          effectiveTo:
            first.effectiveTo ?? (first.effectiveFrom ? null : row.effectiveTo),
          status:
            row.status === "archived" || row.status === "draft"
              ? "active"
              : row.status,
          updatedAt: input.now,
        })
        .where(eq(staffAvailabilitySchedules.id, scheduleId));
    } else if (!first.effectiveFrom && fallbackId) {
      scheduleId = fallbackId;
    } else {
      const [row] = await transaction
        .insert(staffAvailabilitySchedules)
        .values({
          organizationId: input.staff.organizationId,
          staffProfileId: input.staff.id,
          name: first.scheduleName ?? "Weekly availability",
          status: first.effectiveFrom ? "active" : "fallback",
          effectiveFrom:
            first.effectiveFrom ?? input.now.toISOString().slice(0, 10),
          effectiveTo: first.effectiveTo ?? null,
          timezone: input.timezone,
          createdByPersonId: input.actorPersonId,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning({ id: staffAvailabilitySchedules.id });
      scheduleId = row!.id;
      if (!first.effectiveFrom) fallbackId = scheduleId;
    }
    if (!kept.has(scheduleId)) {
      await transaction
        .delete(staffAvailabilityWindows)
        .where(eq(staffAvailabilityWindows.scheduleId, scheduleId));
    }
    kept.add(scheduleId);
    const rows = windows.flatMap((window) =>
      splitWindowForStorage(window).map((part) => ({
        scheduleId,
        weekday: part.weekday,
        startsAt: part.startsAt,
        endsAt: part.endsAt,
        kind: "coaching",
      })),
    );
    if (rows.length > 0) {
      await transaction.insert(staffAvailabilityWindows).values(rows);
    }
  }
  for (const row of existing) {
    if (
      !kept.has(row.id) &&
      (row.status === "active" || row.status === "fallback")
    ) {
      await transaction
        .update(staffAvailabilitySchedules)
        .set({ status: "archived", updatedAt: input.now })
        .where(eq(staffAvailabilitySchedules.id, row.id));
    }
  }

  const wanted = input.blackouts.map((blackout) => {
    const start = wallTimeToInstant(
      blackout.startsOn,
      minuteOfDayFromTime(blackout.startsAt),
      input.timezone,
    );
    const end = wallTimeToInstant(
      blackout.endsOn ?? blackout.startsOn,
      minuteOfDayFromTime(blackout.endsAt),
      input.timezone,
    );
    return { startsAt: new Date(start), endsAt: new Date(end) };
  });
  const current = await transaction
    .select()
    .from(staffBlackouts)
    .where(eq(staffBlackouts.staffProfileId, input.staff.id));
  const sameSpan = (
    left: { startsAt: Date; endsAt: Date },
    right: { startsAt: Date; endsAt: Date },
  ) =>
    left.startsAt.getTime() === right.startsAt.getTime() &&
    // The legacy shape ends a day at 23:59; treat that as the same span.
    Math.abs(left.endsAt.getTime() - right.endsAt.getTime()) <= 60_000;
  const removed = current.filter(
    (row) => !wanted.some((span) => sameSpan(span, row)),
  );
  if (removed.length > 0) {
    await transaction.delete(staffBlackouts).where(
      inArray(
        staffBlackouts.id,
        removed.map((row) => row.id),
      ),
    );
  }
  const added = wanted.filter(
    (span) =>
      span.endsAt > span.startsAt &&
      !current.some((row) => sameSpan(span, row)),
  );
  const addedBlackoutIds: string[] = [];
  for (const span of added) {
    const [row] = await transaction
      .insert(staffBlackouts)
      .values({
        organizationId: input.staff.organizationId,
        staffProfileId: input.staff.id,
        startsAt: span.startsAt,
        endsAt: span.endsAt,
        createdByPersonId: input.actorPersonId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: staffBlackouts.id });
    addedBlackoutIds.push(row!.id);
  }
  return { addedBlackoutIds };
}
