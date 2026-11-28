/**
 * Team pay (B3b): reads for the pay computation. Delivered sessions are the
 * Duna sessions a member coached (`sessions`), the training events they led
 * or assisted (`training_events`, `training_event_coaches`) and the catalog
 * session occurrences they were assigned (`catalog_session_occurrences`),
 * that ended inside the period and were not cancelled. Revenue for revenue
 * share comes from Duna Pay obligations (read only): the net the club kept
 * (proceeds − refunds) of obligations for the occurrence's catalog item that
 * deliver at the occurrence's start, split evenly between its coaches (any
 * remainder minor unit to the first coach by id). Sessions and training
 * events carry no revenue attribution yet, so their share is 0.
 */
import {
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  organizationStaffProfiles,
  organizations,
  payObligations,
  people,
  programs,
  sessionAttendance,
  sessions,
  staffCompensation,
  trainingEventCoaches,
  trainingEvents,
  trainingPracticeOutcomes,
} from "@duna/db";
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
} from "drizzle-orm";
import type { CompensationInput, DeliveredSessionInput } from "./compute";

export interface PayStaffRow {
  readonly id: string;
  readonly personId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly active: boolean;
  readonly workerClassification: string;
}

export async function loadPayStaff(
  organizationId: string,
  ids?: readonly string[],
): Promise<PayStaffRow[]> {
  const rows = await getDatabase()
    .select({
      id: organizationStaffProfiles.id,
      personId: organizationStaffProfiles.personId,
      displayName: people.displayName,
      avatarUrl: people.avatarUrl,
      active: organizationStaffProfiles.active,
      workerClassification: organizationStaffProfiles.workerClassification,
    })
    .from(organizationStaffProfiles)
    .innerJoin(people, eq(people.id, organizationStaffProfiles.personId))
    .where(
      and(
        eq(organizationStaffProfiles.organizationId, organizationId),
        ids && ids.length > 0
          ? inArray(organizationStaffProfiles.id, [...ids])
          : undefined,
      ),
    );
  return rows.map((row) => ({ ...row, avatarUrl: row.avatarUrl ?? undefined }));
}

export async function loadOrganization(organizationId: string) {
  const [row] = await getDatabase()
    .select({
      id: organizations.id,
      timezone: organizations.timezone,
      currency: organizations.currency,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return {
    timezone: row?.timezone ?? "UTC",
    currency: (row?.currency ?? "USD").toUpperCase(),
  };
}

export type CompensationRow = typeof staffCompensation.$inferSelect;

export function toCompensationInput(row: CompensationRow): CompensationInput {
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    model: row.model as CompensationInput["model"],
    classification: row.classification as CompensationInput["classification"],
    effectiveFrom: row.effectiveFrom,
    ...(row.effectiveTo ? { effectiveTo: row.effectiveTo } : {}),
    ...(row.hourlyRateMinor !== null
      ? { hourlyRateMinor: row.hourlyRateMinor }
      : {}),
    ...(row.perSessionRateMinor !== null
      ? { perSessionRateMinor: row.perSessionRateMinor }
      : {}),
    ...(row.annualSalaryMinor !== null
      ? { annualSalaryMinor: row.annualSalaryMinor }
      : {}),
    ...(row.revenueShareBps !== null
      ? { revenueShareBps: row.revenueShareBps }
      : {}),
    revenueShareScope: row.revenueShareScope,
  };
}

export async function loadCompensation(
  organizationId: string,
  staffProfileIds?: readonly string[],
): Promise<CompensationRow[]> {
  return getDatabase()
    .select()
    .from(staffCompensation)
    .where(
      and(
        eq(staffCompensation.organizationId, organizationId),
        staffProfileIds && staffProfileIds.length > 0
          ? inArray(staffCompensation.staffProfileId, [...staffProfileIds])
          : undefined,
      ),
    );
}

function localDate(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function minutesBetween(startsAt: Date, endsAt: Date): number {
  return Math.max(
    0,
    Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
  );
}

/**
 * Delivered sessions of these staff members in [startsAt, endsAt) that had
 * ended by `now`, each tagged with its local date in the club's time zone.
 */
export async function loadDeliveredSessions(input: {
  readonly organizationId: string;
  readonly staff: readonly PayStaffRow[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly now: Date;
}): Promise<DeliveredSessionInput[]> {
  const byPerson = new Map(input.staff.map((row) => [row.personId, row]));
  const personIds = [...byPerson.keys()];
  if (personIds.length === 0) return [];
  const database = getDatabase();
  const ended = input.now < input.endsAt ? input.now : input.endsAt;
  const [sessionRows, eventRows, eventCoachRows, occurrenceRows] =
    await Promise.all([
      database
        .select({
          id: sessions.id,
          personId: sessions.coachPersonId,
          startsAt: sessions.startsAt,
          endsAt: sessions.endsAt,
          kind: programs.kind,
        })
        .from(sessions)
        .innerJoin(programs, eq(programs.id, sessions.programId))
        .where(
          and(
            eq(programs.organizationId, input.organizationId),
            inArray(sessions.coachPersonId, personIds),
            notInArray(sessions.status, ["draft", "cancelled"]),
            gte(sessions.startsAt, input.startsAt),
            lt(sessions.startsAt, input.endsAt),
            lte(sessions.endsAt, ended),
          ),
        ),
      database
        .select({
          id: trainingEvents.id,
          personId: trainingEvents.coachPersonId,
          startsAt: trainingEvents.startsAt,
          endsAt: trainingEvents.endsAt,
          attendanceCount: trainingPracticeOutcomes.attendanceCount,
        })
        .from(trainingEvents)
        .leftJoin(
          trainingPracticeOutcomes,
          eq(trainingPracticeOutcomes.trainingEventId, trainingEvents.id),
        )
        .where(
          and(
            eq(trainingEvents.organizationId, input.organizationId),
            inArray(trainingEvents.coachPersonId, personIds),
            ne(trainingEvents.status, "cancelled"),
            isNull(trainingEvents.cancelledAt),
            gte(trainingEvents.startsAt, input.startsAt),
            lt(trainingEvents.startsAt, input.endsAt),
            lte(trainingEvents.endsAt, ended),
          ),
        ),
      database
        .select({
          id: trainingEvents.id,
          personId: trainingEventCoaches.personId,
          startsAt: trainingEvents.startsAt,
          endsAt: trainingEvents.endsAt,
          attendanceCount: trainingPracticeOutcomes.attendanceCount,
        })
        .from(trainingEventCoaches)
        .innerJoin(
          trainingEvents,
          eq(trainingEvents.id, trainingEventCoaches.trainingEventId),
        )
        .leftJoin(
          trainingPracticeOutcomes,
          eq(trainingPracticeOutcomes.trainingEventId, trainingEvents.id),
        )
        .where(
          and(
            eq(trainingEvents.organizationId, input.organizationId),
            inArray(trainingEventCoaches.personId, personIds),
            ne(trainingEvents.status, "cancelled"),
            isNull(trainingEvents.cancelledAt),
            gte(trainingEvents.startsAt, input.startsAt),
            lt(trainingEvents.startsAt, input.endsAt),
            lte(trainingEvents.endsAt, ended),
          ),
        ),
      database
        .select({
          id: catalogSessionOccurrences.id,
          catalogItemId: catalogSessionOccurrences.catalogItemId,
          coachPersonIds: catalogSessionOccurrences.coachPersonIds,
          startsAt: catalogSessionOccurrences.startsAt,
          endsAt: catalogSessionOccurrences.endsAt,
          settledHeadcount: catalogSessionOccurrences.settledHeadcount,
          subtype: catalogItems.subtype,
        })
        .from(catalogSessionOccurrences)
        .innerJoin(
          catalogItems,
          eq(catalogItems.id, catalogSessionOccurrences.catalogItemId),
        )
        .where(
          and(
            eq(catalogSessionOccurrences.organizationId, input.organizationId),
            ne(catalogSessionOccurrences.status, "cancelled"),
            gte(catalogSessionOccurrences.startsAt, input.startsAt),
            lt(catalogSessionOccurrences.startsAt, input.endsAt),
            lte(catalogSessionOccurrences.endsAt, ended),
          ),
        ),
    ]);
  const attendedSessions = new Set(
    sessionRows.length === 0
      ? []
      : (
          await database
            .select({ sessionId: sessionAttendance.sessionId })
            .from(sessionAttendance)
            .where(
              and(
                inArray(
                  sessionAttendance.sessionId,
                  sessionRows.map((row) => row.id),
                ),
                eq(sessionAttendance.status, "attended"),
              ),
            )
        ).map((row) => row.sessionId),
  );
  const occurrenceItems = [
    ...new Set(occurrenceRows.map((row) => row.catalogItemId)),
  ];
  const obligations =
    occurrenceItems.length === 0
      ? []
      : await database
          .select({
            catalogItemId: payObligations.catalogItemId,
            deliveryStartsAt: payObligations.deliveryStartsAt,
            proceedsMinor: payObligations.proceedsMinor,
            refundedMinor: payObligations.refundedMinor,
          })
          .from(payObligations)
          .where(
            and(
              eq(payObligations.organizationId, input.organizationId),
              inArray(payObligations.catalogItemId, occurrenceItems),
              notInArray(payObligations.status, ["cancelled", "refunded"]),
            ),
          );

  const delivered: DeliveredSessionInput[] = [];
  const add = (
    key: string,
    kind: DeliveredSessionInput["kind"],
    personId: string | null,
    startsAt: Date,
    endsAt: Date,
    attended: boolean,
    extra: { offering?: string; revenueMinor?: number } = {},
  ) => {
    const staff = personId ? byPerson.get(personId) : undefined;
    if (!staff) return;
    delivered.push({
      key,
      kind,
      staffProfileId: staff.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      localDate: localDate(startsAt, input.timezone),
      minutes: minutesBetween(startsAt, endsAt),
      attended,
      ...(extra.offering ? { offering: extra.offering } : {}),
      revenueMinor: extra.revenueMinor ?? 0,
    });
  };
  for (const row of sessionRows) {
    add(
      `session:${row.id}`,
      "session",
      row.personId,
      row.startsAt,
      row.endsAt,
      attendedSessions.has(row.id),
      {
        offering: row.kind,
      },
    );
  }
  const seenEvents = new Set<string>();
  for (const row of [...eventRows, ...eventCoachRows]) {
    const key = `training-event:${row.id}`;
    if (seenEvents.has(`${key}|${row.personId}`)) continue;
    seenEvents.add(`${key}|${row.personId}`);
    add(
      key,
      "training-event",
      row.personId,
      row.startsAt,
      row.endsAt,
      (row.attendanceCount ?? 0) > 0,
    );
  }
  for (const row of occurrenceRows) {
    const coaches = [...row.coachPersonIds]
      .filter((id) => byPerson.has(id))
      .sort();
    if (coaches.length === 0) continue;
    const revenue = obligations
      .filter(
        (obligation) =>
          obligation.catalogItemId === row.catalogItemId &&
          obligation.deliveryStartsAt?.getTime() === row.startsAt.getTime(),
      )
      .reduce(
        (total, obligation) =>
          total +
          Math.max(0, obligation.proceedsMinor - obligation.refundedMinor),
        0,
      );
    const share = Math.floor(revenue / row.coachPersonIds.length);
    const remainder = revenue - share * row.coachPersonIds.length;
    coaches.forEach((personId, index) => {
      add(
        `lesson:${row.id}`,
        "lesson",
        personId,
        row.startsAt,
        row.endsAt,
        row.settledHeadcount !== 0,
        {
          offering: row.subtype,
          revenueMinor: share + (index === 0 ? remainder : 0),
        },
      );
    });
  }
  return delivered;
}
