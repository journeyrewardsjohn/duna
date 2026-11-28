/**
 * Loads what the shared court rule needs (court-availability.ts) for one
 * court and a range, inside the caller's transaction. With `lock`, the
 * court row is locked (`SELECT … FOR UPDATE`) first, so two desk writes on
 * the same court run one after the other and the second sees the first;
 * bookings made by players are also stopped by the database's
 * `court_bookings_no_overlap` exclusion constraint.
 */
import {
  courtBookings,
  courts,
  getTransactionalDatabase,
  resourceReservations,
  scheduleBlocks,
  scheduleOverrides,
  schedules,
  sessions,
  venues,
} from "@duna/db";
import { and, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type {
  CourtFactsForRule,
  CourtOccupant,
  CourtWindow,
} from "./court-availability";
import { ScheduleError } from "./shared";

export type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

export interface CourtRow {
  readonly courtId: string;
  readonly courtName: string;
  readonly courtStatus: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly venueStatus: string;
  readonly timeZone: string;
  readonly organizationId: string;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly cancellationPolicy: Readonly<Record<string, unknown>>;
}

const DAY_MS = 24 * 60 * 60_000;

/** The court, in this organisation (another club's court is "not found"). */
export async function loadCourt(
  tx: Transaction,
  input: {
    readonly organizationId: string;
    readonly courtId: string;
    readonly lock: boolean;
  },
): Promise<CourtRow> {
  const query = tx
    .select({
      courtId: courts.id,
      courtName: courts.name,
      courtStatus: courts.status,
      venueId: venues.id,
      venueName: venues.name,
      venueStatus: venues.status,
      timeZone: venues.timezone,
      organizationId: venues.organizationId,
      bufferBeforeMinutes: courts.bufferBeforeMinutes,
      bufferAfterMinutes: courts.bufferAfterMinutes,
      cancellationPolicy: courts.cancellationPolicy,
    })
    .from(courts)
    .innerJoin(venues, eq(courts.venueId, venues.id))
    .where(
      and(
        eq(courts.id, input.courtId),
        eq(venues.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  const [row] = input.lock ? await query.for("update") : await query;
  if (!row) throw new ScheduleError("NOT_FOUND", "Court was not found.");
  return row;
}

export function assertCourtOpen(court: CourtRow): void {
  if (court.courtStatus !== "active" || court.venueStatus !== "active") {
    throw new ScheduleError(
      "CONFLICT",
      `${court.courtName} is not open for bookings.`,
    );
  }
}

/** Hours, closures and occupants of one court around a range. */
export async function loadCourtFacts(
  tx: Transaction,
  input: {
    readonly organizationId: string;
    readonly court: CourtRow;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly now: Date;
  },
): Promise<CourtFactsForRule> {
  const from = new Date(input.startsAt.getTime() - DAY_MS);
  const to = new Date(input.endsAt.getTime() + DAY_MS);
  const courtSchedule = and(
    eq(schedules.organizationId, input.organizationId),
    eq(schedules.resourceType, "court"),
    eq(schedules.resourceId, input.court.courtId),
  );
  const [windowRows, overrideRows, bookingRows, sessionRows, reservationRows] =
    await Promise.all([
      tx
        .select({
          id: scheduleBlocks.id,
          weekday: scheduleBlocks.weekday,
          startsAtMinute: scheduleBlocks.startsAtMinute,
          endsAtMinute: scheduleBlocks.endsAtMinute,
          mode: scheduleBlocks.mode,
          effectiveFrom: scheduleBlocks.effectiveFrom,
          effectiveTo: scheduleBlocks.effectiveTo,
        })
        .from(scheduleBlocks)
        .innerJoin(schedules, eq(scheduleBlocks.scheduleId, schedules.id))
        .where(courtSchedule),
      tx
        .select({
          id: scheduleOverrides.id,
          startsAt: scheduleOverrides.startsAt,
          endsAt: scheduleOverrides.endsAt,
          mode: scheduleOverrides.mode,
        })
        .from(scheduleOverrides)
        .innerJoin(schedules, eq(scheduleOverrides.scheduleId, schedules.id))
        .where(
          and(
            courtSchedule,
            lt(scheduleOverrides.startsAt, to),
            gt(scheduleOverrides.endsAt, from),
          ),
        ),
      tx
        .select({
          id: courtBookings.id,
          startsAt: courtBookings.startsAt,
          endsAt: courtBookings.endsAt,
          bufferBeforeMinutes: courtBookings.bufferBeforeMinutes,
          bufferAfterMinutes: courtBookings.bufferAfterMinutes,
        })
        .from(courtBookings)
        .where(
          and(
            eq(courtBookings.courtId, input.court.courtId),
            lt(courtBookings.startsAt, to),
            gt(courtBookings.endsAt, from),
            or(
              eq(courtBookings.status, "confirmed"),
              and(
                eq(courtBookings.status, "held"),
                gt(courtBookings.holdExpiresAt, input.now),
              ),
            ),
          ),
        ),
      tx
        .select({
          id: sessions.id,
          startsAt: sessions.startsAt,
          endsAt: sessions.endsAt,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.courtId, input.court.courtId),
            ne(sessions.status, "cancelled"),
            lt(sessions.startsAt, to),
            gt(sessions.endsAt, from),
          ),
        ),
      tx
        .select({
          id: resourceReservations.id,
          startsAt: resourceReservations.startsAt,
          endsAt: resourceReservations.endsAt,
          sourceType: resourceReservations.sourceType,
          sourceId: resourceReservations.sourceId,
        })
        .from(resourceReservations)
        .where(
          and(
            eq(resourceReservations.organizationId, input.organizationId),
            eq(resourceReservations.resourceType, "court"),
            eq(resourceReservations.resourceId, input.court.courtId),
            inArray(resourceReservations.status, ["held", "confirmed"]),
            or(
              isNull(resourceReservations.heldUntil),
              gt(resourceReservations.heldUntil, input.now),
              eq(resourceReservations.status, "confirmed"),
            ),
            lt(resourceReservations.startsAt, to),
            gt(resourceReservations.endsAt, from),
          ),
        ),
    ]);
  const sessionIds = new Set(sessionRows.map((row) => row.id));
  const occupants: CourtOccupant[] = [
    ...bookingRows.map((row) => ({
      id: row.id,
      kind: "booking" as const,
      startsAt: new Date(
        row.startsAt.getTime() - row.bufferBeforeMinutes * 60_000,
      ),
      endsAt: new Date(row.endsAt.getTime() + row.bufferAfterMinutes * 60_000),
    })),
    ...sessionRows.map((row) => ({
      id: row.id,
      kind: "session" as const,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
    // A session's own court reservation is the session, not a second item.
    ...reservationRows
      .filter(
        (row) => !(row.sourceType === "session" && sessionIds.has(row.sourceId)),
      )
      .map((row) => ({
        id: row.sourceType === "session" ? row.sourceId : row.id,
        kind:
          row.sourceType === "session"
            ? ("session" as const)
            : ("reservation" as const),
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      })),
  ];
  const windows: CourtWindow[] = windowRows;
  return {
    courtId: input.court.courtId,
    timeZone: input.court.timeZone,
    windows,
    overrides: overrideRows,
    occupants,
    bufferBeforeMinutes: input.court.bufferBeforeMinutes,
    bufferAfterMinutes: input.court.bufferAfterMinutes,
  };
}
