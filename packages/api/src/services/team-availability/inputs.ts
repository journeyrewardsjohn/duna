/**
 * Loads what availabilityFor needs for a set of team members: their named
 * schedules, blackouts and time off from the B3a tables (or, for a member
 * whose legacy availability has not been copied yet, the legacy jsonb read
 * in memory), and their real commitments: Duna sessions they coach,
 * training events they lead or assist, catalog session occurrences they are
 * assigned to, and busy blocks from connected calendars.
 */
import {
  auditLog,
  calendarBusyBlocks,
  calendarConnections,
  catalogSessionOccurrences,
  getDatabase,
  organizationStaffProfiles,
  programs,
  sessions,
  staffAvailabilitySchedules,
  staffAvailabilityWindows,
  staffBlackouts,
  staffTimeOff,
  trainingEventCoaches,
  trainingEvents,
} from "@duna/db";
import {
  convertLegacyStaffAvailability,
  legacyAvailabilityInputs,
  type StaffAvailabilityInputs,
  type StaffAvailabilitySchedule,
  type StaffBlackoutInput,
  type StaffCommitment,
  type StaffTimeOffInput,
} from "@duna/scheduling";
import {
  and,
  arrayOverlaps,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
} from "drizzle-orm";
import { type StaffRow, toPureSchedule } from "./shared";

export interface DetailedCommitment extends StaffCommitment {
  readonly personId: string;
  /** Set when the commitment belongs to this organisation. */
  readonly organizationId?: string;
  /** Coverage target, for sessions and training events of this organisation. */
  readonly target?:
    | { readonly kind: "session"; readonly sessionId: string }
    | { readonly kind: "training-event"; readonly trainingEventId: string };
}

export interface MemberAvailability {
  readonly staff: StaffRow;
  readonly inputs: StaffAvailabilityInputs;
  readonly commitments: readonly DetailedCommitment[];
  /** True when read from the legacy jsonb (not copied to the tables yet). */
  readonly legacy: boolean;
}

export interface Range {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export const LEGACY_COPIED_ACTION = "staff-availability.legacy-copied";

export async function legacyCopiedProfileIds(
  staffProfileIds: readonly string[],
): Promise<Set<string>> {
  if (staffProfileIds.length === 0) return new Set();
  const rows = await getDatabase()
    .select({ entityId: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, "staff-profile"),
        eq(auditLog.action, LEGACY_COPIED_ACTION),
        inArray(auditLog.entityId, [...staffProfileIds]),
      ),
    );
  return new Set(rows.map((row) => row.entityId));
}

/** The date a legacy undated schedule starts from: the profile's creation. */
export function legacyEffectiveFrom(staff: StaffRow): string {
  return staff.createdAt.toISOString().slice(0, 10);
}

export async function loadScheduleRows(staffProfileIds: readonly string[]) {
  if (staffProfileIds.length === 0) return [];
  const database = getDatabase();
  const schedules = await database
    .select()
    .from(staffAvailabilitySchedules)
    .where(
      inArray(staffAvailabilitySchedules.staffProfileId, [...staffProfileIds]),
    );
  const windows =
    schedules.length === 0
      ? []
      : await database
          .select()
          .from(staffAvailabilityWindows)
          .where(
            inArray(
              staffAvailabilityWindows.scheduleId,
              schedules.map((schedule) => schedule.id),
            ),
          );
  return schedules.map((schedule) => ({
    ...schedule,
    windows: windows.filter((window) => window.scheduleId === schedule.id),
  }));
}

/** Schedules, blackouts and time off per staff profile (no commitments). */
export async function loadAbsenceInputs(
  staff: readonly StaffRow[],
  range: Range,
  timezone: string,
): Promise<
  Map<
    string,
    {
      schedules: StaffAvailabilitySchedule[];
      blackouts: StaffBlackoutInput[];
      timeOff: StaffTimeOffInput[];
      legacy: boolean;
    }
  >
> {
  const ids = staff.map((row) => row.id);
  const result = new Map<
    string,
    {
      schedules: StaffAvailabilitySchedule[];
      blackouts: StaffBlackoutInput[];
      timeOff: StaffTimeOffInput[];
      legacy: boolean;
    }
  >();
  if (ids.length === 0) return result;
  const database = getDatabase();
  const [scheduleRows, blackoutRows, timeOffRows, copied] = await Promise.all([
    loadScheduleRows(ids),
    database
      .select()
      .from(staffBlackouts)
      .where(
        and(
          inArray(staffBlackouts.staffProfileId, ids),
          lt(staffBlackouts.startsAt, range.endsAt),
          gt(staffBlackouts.endsAt, range.startsAt),
        ),
      ),
    database
      .select()
      .from(staffTimeOff)
      .where(
        and(
          inArray(staffTimeOff.staffProfileId, ids),
          inArray(staffTimeOff.status, ["requested", "approved"]),
          lt(staffTimeOff.startsAt, range.endsAt),
          gt(staffTimeOff.endsAt, range.startsAt),
        ),
      ),
    legacyCopiedProfileIds(
      staff
        .filter((member) => member.legacyAvailability.length > 0)
        .map((member) => member.id),
    ),
  ]);
  for (const member of staff) {
    const own = scheduleRows.filter((row) => row.staffProfileId === member.id);
    const timeOff = timeOffRows
      .filter((row) => row.staffProfileId === member.id)
      .map((row) => ({
        id: row.id,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status as StaffTimeOffInput["status"],
      }));
    if (
      own.length === 0 &&
      member.legacyAvailability.length > 0 &&
      !copied.has(member.id)
    ) {
      const legacy = legacyAvailabilityInputs(
        convertLegacyStaffAvailability({
          entries: member.legacyAvailability,
          timezone,
          undatedEffectiveFrom: legacyEffectiveFrom(member),
        }),
        `legacy:${member.id}`,
      );
      result.set(member.id, {
        schedules: [...legacy.schedules],
        blackouts: [...legacy.blackouts],
        timeOff,
        legacy: true,
      });
      continue;
    }
    result.set(member.id, {
      schedules: own.map(toPureSchedule),
      blackouts: blackoutRows
        .filter((row) => row.staffProfileId === member.id)
        .map((row) => ({
          id: row.id,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
        })),
      timeOff,
      legacy: false,
    });
  }
  return result;
}

/** Real commitments of these people that overlap the range. */
export async function loadCommitments(input: {
  readonly organizationId: string;
  readonly personIds: readonly string[];
  readonly range: Range;
}): Promise<DetailedCommitment[]> {
  const personIds = [...new Set(input.personIds)];
  if (personIds.length === 0) return [];
  const database = getDatabase();
  const overlapsSession = and(
    lt(sessions.startsAt, input.range.endsAt),
    gt(sessions.endsAt, input.range.startsAt),
  );
  const [sessionRows, eventRows, eventCoachRows, occurrenceRows, busyRows] =
    await Promise.all([
      database
        .select({
          id: sessions.id,
          personId: sessions.coachPersonId,
          title: sessions.title,
          startsAt: sessions.startsAt,
          endsAt: sessions.endsAt,
          venueId: sessions.venueId,
          organizationId: programs.organizationId,
        })
        .from(sessions)
        .leftJoin(programs, eq(programs.id, sessions.programId))
        .where(
          and(
            inArray(sessions.coachPersonId, personIds),
            notInArray(sessions.status, ["draft", "cancelled"]),
            overlapsSession,
          ),
        ),
      database
        .select({
          id: trainingEvents.id,
          personId: trainingEvents.coachPersonId,
          title: trainingEvents.title,
          startsAt: trainingEvents.startsAt,
          endsAt: trainingEvents.endsAt,
          venueId: trainingEvents.venueId,
          organizationId: trainingEvents.organizationId,
        })
        .from(trainingEvents)
        .where(
          and(
            inArray(trainingEvents.coachPersonId, personIds),
            eq(trainingEvents.organizationId, input.organizationId),
            notInArray(trainingEvents.status, ["cancelled"]),
            isNull(trainingEvents.cancelledAt),
            lt(trainingEvents.startsAt, input.range.endsAt),
            gt(trainingEvents.endsAt, input.range.startsAt),
          ),
        ),
      database
        .select({
          id: trainingEvents.id,
          personId: trainingEventCoaches.personId,
          title: trainingEvents.title,
          startsAt: trainingEvents.startsAt,
          endsAt: trainingEvents.endsAt,
          venueId: trainingEvents.venueId,
          organizationId: trainingEvents.organizationId,
        })
        .from(trainingEventCoaches)
        .innerJoin(
          trainingEvents,
          eq(trainingEvents.id, trainingEventCoaches.trainingEventId),
        )
        .where(
          and(
            inArray(trainingEventCoaches.personId, personIds),
            eq(trainingEvents.organizationId, input.organizationId),
            notInArray(trainingEvents.status, ["cancelled"]),
            isNull(trainingEvents.cancelledAt),
            lt(trainingEvents.startsAt, input.range.endsAt),
            gt(trainingEvents.endsAt, input.range.startsAt),
          ),
        ),
      database
        .select({
          id: catalogSessionOccurrences.id,
          coachPersonIds: catalogSessionOccurrences.coachPersonIds,
          startsAt: catalogSessionOccurrences.startsAt,
          endsAt: catalogSessionOccurrences.endsAt,
          organizationId: catalogSessionOccurrences.organizationId,
        })
        .from(catalogSessionOccurrences)
        .where(
          and(
            arrayOverlaps(catalogSessionOccurrences.coachPersonIds, personIds),
            eq(catalogSessionOccurrences.status, "scheduled"),
            lt(catalogSessionOccurrences.startsAt, input.range.endsAt),
            gt(catalogSessionOccurrences.endsAt, input.range.startsAt),
          ),
        ),
      database
        .select({
          id: calendarBusyBlocks.id,
          personId: calendarConnections.personId,
          startsAt: calendarBusyBlocks.startsAt,
          endsAt: calendarBusyBlocks.endsAt,
        })
        .from(calendarBusyBlocks)
        .innerJoin(
          calendarConnections,
          eq(calendarBusyBlocks.calendarConnectionId, calendarConnections.id),
        )
        .where(
          and(
            inArray(calendarConnections.personId, personIds),
            eq(calendarBusyBlocks.transparency, "busy"),
            eq(calendarConnections.status, "active"),
            or(
              eq(calendarBusyBlocks.organizationId, input.organizationId),
              eq(calendarConnections.organizationId, input.organizationId),
            ),
            lt(calendarBusyBlocks.startsAt, input.range.endsAt),
            gt(calendarBusyBlocks.endsAt, input.range.startsAt),
          ),
        )
        .limit(10_000),
    ]);
  const commitments: DetailedCommitment[] = [];
  for (const row of sessionRows) {
    if (!row.personId) continue;
    const own = row.organizationId === input.organizationId;
    commitments.push({
      id: row.id,
      kind: "session",
      personId: row.personId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      ...(own
        ? { title: row.title, organizationId: input.organizationId }
        : {}),
      ...(row.venueId ? { venueId: row.venueId } : {}),
      ...(own
        ? { target: { kind: "session" as const, sessionId: row.id } }
        : {}),
    });
  }
  const seenEvents = new Set<string>();
  for (const row of [...eventRows, ...eventCoachRows]) {
    if (!row.personId) continue;
    const key = `${row.id}:${row.personId}`;
    if (seenEvents.has(key)) continue;
    seenEvents.add(key);
    commitments.push({
      id: row.id,
      kind: "training-event",
      personId: row.personId,
      title: row.title,
      organizationId: row.organizationId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      ...(row.venueId ? { venueId: row.venueId } : {}),
      target: { kind: "training-event", trainingEventId: row.id },
    });
  }
  for (const row of occurrenceRows) {
    for (const personId of row.coachPersonIds) {
      if (!personIds.includes(personId)) continue;
      commitments.push({
        id: row.id,
        kind: "lesson",
        personId,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        ...(row.organizationId === input.organizationId
          ? { organizationId: row.organizationId }
          : {}),
      });
    }
  }
  for (const row of busyRows) {
    commitments.push({
      id: row.id,
      kind: "calendar",
      personId: row.personId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    });
  }
  return commitments;
}

/** Everything availabilityFor needs, per staff profile. */
export async function loadMemberAvailability(input: {
  readonly organizationId: string;
  readonly staff: readonly StaffRow[];
  readonly range: Range;
  readonly timezone: string;
}): Promise<Map<string, MemberAvailability>> {
  const [absences, commitments] = await Promise.all([
    loadAbsenceInputs(input.staff, input.range, input.timezone),
    loadCommitments({
      organizationId: input.organizationId,
      personIds: input.staff.map((row) => row.personId),
      range: input.range,
    }),
  ]);
  const result = new Map<string, MemberAvailability>();
  for (const member of input.staff) {
    const absence = absences.get(member.id) ?? {
      schedules: [],
      blackouts: [],
      timeOff: [],
      legacy: false,
    };
    const own = commitments.filter(
      (commitment) => commitment.personId === member.personId,
    );
    result.set(member.id, {
      staff: member,
      inputs: {
        schedules: absence.schedules,
        blackouts: absence.blackouts,
        timeOff: absence.timeOff,
        commitments: own,
      },
      commitments: own,
      legacy: absence.legacy,
    });
  }
  return result;
}

/**
 * Availability from the B3a tables for booking surfaces, keyed by person.
 * A member still on the legacy column is absent from the map: the caller
 * passes the legacy value to session-delivery, which reads it through the
 * same availabilityFor in the session's own time zone (unchanged behaviour).
 */
export async function loadBookingAvailability(input: {
  readonly organizationId: string;
  readonly personIds: readonly string[];
  readonly range: Range;
}): Promise<
  Map<
    string,
    {
      readonly schedules: readonly StaffAvailabilitySchedule[];
      readonly blackouts: readonly StaffBlackoutInput[];
      readonly timeOff: readonly StaffTimeOffInput[];
    }
  >
> {
  const result = new Map<
    string,
    {
      readonly schedules: readonly StaffAvailabilitySchedule[];
      readonly blackouts: readonly StaffBlackoutInput[];
      readonly timeOff: readonly StaffTimeOffInput[];
    }
  >();
  const personIds = [...new Set(input.personIds)];
  if (personIds.length === 0) return result;
  const rows = await getDatabase()
    .select({
      id: organizationStaffProfiles.id,
      organizationId: organizationStaffProfiles.organizationId,
      personId: organizationStaffProfiles.personId,
      staffRole: organizationStaffProfiles.staffRole,
      active: organizationStaffProfiles.active,
      createdAt: organizationStaffProfiles.createdAt,
      legacyAvailability: organizationStaffProfiles.availability,
    })
    .from(organizationStaffProfiles)
    .where(
      and(
        eq(organizationStaffProfiles.organizationId, input.organizationId),
        inArray(organizationStaffProfiles.personId, personIds),
      ),
    );
  const staff: StaffRow[] = rows.map((row) => ({
    ...row,
    displayName: "",
    avatarUrl: undefined,
  }));
  const absences = await loadAbsenceInputs(staff, input.range, "UTC");
  for (const member of staff) {
    const absence = absences.get(member.id);
    if (!absence || absence.legacy) continue;
    result.set(member.personId, {
      schedules: absence.schedules,
      blackouts: absence.blackouts,
      timeOff: absence.timeOff,
    });
  }
  return result;
}
