import {
  activityAttendance,
  auditLog,
  courtBookingParticipants,
  courtBookings,
  courts,
  eventTypes,
  getDatabase,
  getTransactionalDatabase,
  people,
  pickupParticipants,
  pickupSessions,
  programs,
  registrations,
  sessionAttendance,
  sessions,
  venues,
} from "@duna/db";
import { normalizeDunaMemberId, parseDunaMemberCredential } from "@duna/core";
import { and, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import type {
  OperatorActivityDetail,
  OperatorMutationResult,
} from "./contracts";
import type { ApiActor } from "./context";

export type AttendanceReliability = {
  readonly score?: number;
  readonly label:
    "new" | "building" | "needs-context" | "reliable" | "highly-reliable";
  readonly tracked: number;
  readonly attended: number;
  readonly noShows: number;
};

export type MemberCheckInCandidate = {
  readonly activityType: "session" | "court-booking" | "pickup";
  readonly activityId: string;
  readonly participationId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly venueName: string;
};

const supportedCurrencies = ["USD", "CAD", "AUD", "BRL", "EUR"] as const;

function currency(value: string): (typeof supportedCurrencies)[number] {
  return supportedCurrencies.includes(
    value as (typeof supportedCurrencies)[number],
  )
    ? (value as (typeof supportedCurrencies)[number])
    : "USD";
}

function organizationIdFor(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new Error("Choose an organization before managing attendance.");
  }
  return actor.organizationId;
}

export function attendanceReliabilityForCounts(
  attended: number,
  noShows: number,
): AttendanceReliability {
  const tracked = attended + noShows;
  const score =
    tracked >= 3
      ? Math.round(((attended + 4) / (tracked + 5)) * 100)
      : undefined;
  const label: AttendanceReliability["label"] =
    tracked === 0
      ? "new"
      : tracked < 3
        ? "building"
        : (score ?? 0) < 70
          ? "needs-context"
          : (score ?? 0) >= 90
            ? "highly-reliable"
            : "reliable";
  return { score, label, tracked, attended, noShows };
}

function attendanceStatus(
  value: string | undefined,
): "scheduled" | "attended" | "no-show" | "cancelled" {
  return value === "attended" || value === "no-show" || value === "cancelled"
    ? value
    : "scheduled";
}

export async function loadAttendanceReliability(input: {
  readonly personIds: readonly string[];
  readonly organizationId?: string;
}): Promise<ReadonlyMap<string, AttendanceReliability>> {
  const personIds = [...new Set(input.personIds)];
  if (personIds.length === 0) return new Map();
  const database = getDatabase();
  const [sessionRows, activityRows] = await Promise.all([
    database
      .select({
        personId: sessionAttendance.personId,
        status: sessionAttendance.status,
      })
      .from(sessionAttendance)
      .where(
        and(
          inArray(sessionAttendance.personId, personIds),
          input.organizationId
            ? eq(sessionAttendance.organizationId, input.organizationId)
            : undefined,
          inArray(sessionAttendance.status, ["attended", "no-show"]),
        ),
      ),
    database
      .select({
        personId: activityAttendance.personId,
        status: activityAttendance.status,
      })
      .from(activityAttendance)
      .where(
        and(
          inArray(activityAttendance.personId, personIds),
          input.organizationId
            ? eq(activityAttendance.organizationId, input.organizationId)
            : undefined,
          inArray(activityAttendance.status, ["attended", "no-show"]),
        ),
      ),
  ]);
  const result = new Map<string, AttendanceReliability>();
  for (const personId of personIds) {
    const rows = [...sessionRows, ...activityRows].filter(
      (row) => row.personId === personId,
    );
    result.set(
      personId,
      attendanceReliabilityForCounts(
        rows.filter((row) => row.status === "attended").length,
        rows.filter((row) => row.status === "no-show").length,
      ),
    );
  }
  return result;
}

type ActivityAttendanceInput = {
  readonly actor: ApiActor;
  readonly activityType: "court-booking" | "pickup";
  readonly activityId: string;
  readonly participantId: string;
  readonly status: "scheduled" | "attended" | "no-show" | "cancelled";
  readonly source: "manual" | "member-qr" | "player-report" | "system";
  readonly note?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
  readonly allowPickupHost?: boolean;
};

async function resolveActivityParticipant(input: ActivityAttendanceInput) {
  const database = getDatabase();
  if (input.activityType === "court-booking") {
    const row = (
      await database
        .select({
          activityId: courtBookings.id,
          organizationId: courtBookings.organizationId,
          activityStatus: courtBookings.status,
          startsAt: courtBookings.startsAt,
          participantId: courtBookingParticipants.id,
          personId: courtBookingParticipants.personId,
          participantStatus: courtBookingParticipants.status,
        })
        .from(courtBookingParticipants)
        .innerJoin(
          courtBookings,
          eq(courtBookingParticipants.bookingId, courtBookings.id),
        )
        .where(
          and(
            eq(courtBookings.id, input.activityId),
            eq(courtBookingParticipants.id, input.participantId),
          ),
        )
        .limit(1)
    )[0];
    if (
      !row ||
      !row.personId ||
      row.activityStatus !== "confirmed" ||
      !["organizer", "accepted", "paid"].includes(row.participantStatus)
    ) {
      throw new Error("This player is not confirmed on the court reservation.");
    }
    return row;
  }
  const row = (
    await database
      .select({
        activityId: pickupSessions.id,
        organizationId: pickupSessions.organizationId,
        activityStatus: pickupSessions.status,
        startsAt: pickupSessions.startsAt,
        endsAt: pickupSessions.endsAt,
        hostPersonId: pickupSessions.hostPersonId,
        participantId: pickupParticipants.id,
        personId: pickupParticipants.personId,
        participantStatus: pickupParticipants.status,
      })
      .from(pickupParticipants)
      .innerJoin(
        pickupSessions,
        eq(pickupParticipants.pickupSessionId, pickupSessions.id),
      )
      .where(
        and(
          eq(pickupSessions.id, input.activityId),
          eq(pickupParticipants.id, input.participantId),
        ),
      )
      .limit(1)
  )[0];
  if (
    !row ||
    row.activityStatus === "cancelled" ||
    !["confirmed", "checked-in"].includes(row.participantStatus)
  ) {
    throw new Error("This player is not confirmed on the match.");
  }
  if (input.allowPickupHost && row.hostPersonId !== input.actor.personId) {
    throw new Error("Only the match creator can report player attendance.");
  }
  if (input.allowPickupHost && input.now < row.startsAt) {
    throw new Error("Attendance can be reported once the match starts.");
  }
  if (
    input.allowPickupHost &&
    input.now.getTime() > row.endsAt.getTime() + 72 * 60 * 60 * 1_000
  ) {
    throw new Error("The 72-hour attendance reporting window has closed.");
  }
  return row;
}

export async function recordActivityAttendance(
  input: ActivityAttendanceInput,
): Promise<OperatorMutationResult> {
  const row = await resolveActivityParticipant(input);
  if (input.status === "no-show" && input.now < row.startsAt) {
    throw new Error("A no-show can only be recorded once the activity starts.");
  }
  const isPickupHostReport =
    input.allowPickupHost &&
    input.activityType === "pickup" &&
    "hostPersonId" in row &&
    row.hostPersonId === input.actor.personId;
  if (
    !isPickupHostReport &&
    (!input.actor.organizationId ||
      row.organizationId !== input.actor.organizationId)
  ) {
    throw new Error("This activity belongs to another organization.");
  }
  const note = input.note?.trim() || undefined;
  const attendanceId = crypto.randomUUID();
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .insert(activityAttendance)
      .values({
        id: attendanceId,
        organizationId: row.organizationId,
        activityType: input.activityType,
        activityId: row.activityId,
        participantId: row.participantId,
        personId: row.personId!,
        status: input.status,
        source: input.source,
        note,
        recordedByPersonId: input.actor.personId,
        recordedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          activityAttendance.activityType,
          activityAttendance.activityId,
          activityAttendance.personId,
        ],
        set: {
          participantId: row.participantId,
          status: input.status,
          source: input.source,
          note: note ?? null,
          recordedByPersonId: input.actor.personId,
          recordedAt: input.now,
          updatedAt: input.now,
        },
      });
    if (input.activityType === "pickup" && input.status === "attended") {
      await transaction
        .update(pickupParticipants)
        .set({ status: "checked-in", updatedAt: input.now })
        .where(eq(pickupParticipants.id, row.participantId));
    } else if (input.activityType === "pickup") {
      await transaction
        .update(pickupParticipants)
        .set({ status: "confirmed", updatedAt: input.now })
        .where(
          and(
            eq(pickupParticipants.id, row.participantId),
            eq(pickupParticipants.status, "checked-in"),
          ),
        );
    }
    await transaction.insert(auditLog).values({
      organizationId: row.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: `${input.activityType}.attendance-recorded`,
      entityType: `${input.activityType}-participant`,
      entityId: row.participantId,
      afterHash: stableHash({
        activityId: row.activityId,
        personId: row.personId,
        status: input.status,
        source: input.source,
      }),
      reason: note ?? `Attendance marked ${input.status}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: row.participantId,
    entity: "activity-attendance",
    status: input.status,
  };
}

export async function loadOperatorActivityDetail(input: {
  readonly actor: ApiActor;
  readonly activityType: "court-booking" | "pickup";
  readonly activityId: string;
}): Promise<OperatorActivityDetail> {
  const organizationId = organizationIdFor(input.actor);
  const database = getDatabase();
  if (input.activityType === "court-booking") {
    const booking = (
      await database
        .select({
          id: courtBookings.id,
          status: courtBookings.status,
          startsAt: courtBookings.startsAt,
          endsAt: courtBookings.endsAt,
          organizationId: courtBookings.organizationId,
          organizerPersonId: courtBookings.personId,
          organizerName: people.displayName,
          venueId: venues.id,
          venueName: venues.name,
          timezone: venues.timezone,
          courtId: courts.id,
          courtName: courts.name,
          capacity: courts.capacity,
          paymentMode: courtBookings.paymentMode,
          totalAmountMinor: courtBookings.totalAmountMinor,
          fundedAmountMinor: courtBookings.fundedAmountMinor,
          currency: courtBookings.currency,
        })
        .from(courtBookings)
        .innerJoin(people, eq(courtBookings.personId, people.id))
        .innerJoin(venues, eq(courtBookings.venueId, venues.id))
        .innerJoin(courts, eq(courtBookings.courtId, courts.id))
        .where(
          and(
            eq(courtBookings.id, input.activityId),
            eq(courtBookings.organizationId, organizationId),
          ),
        )
        .limit(1)
    )[0];
    if (!booking) throw new Error("Court reservation was not found.");
    const [participants, linkedPickup] = await Promise.all([
      database
        .select({
          id: courtBookingParticipants.id,
          personId: courtBookingParticipants.personId,
          invitedName: courtBookingParticipants.invitedName,
          displayName: people.displayName,
          avatarUrl: people.avatarUrl,
          role: courtBookingParticipants.role,
          status: courtBookingParticipants.status,
          shareAmountMinor: courtBookingParticipants.shareAmountMinor,
        })
        .from(courtBookingParticipants)
        .leftJoin(people, eq(courtBookingParticipants.personId, people.id))
        .where(eq(courtBookingParticipants.bookingId, booking.id)),
      database.query.pickupSessions.findFirst({
        where: eq(pickupSessions.courtBookingId, booking.id),
      }),
    ]);
    const linkedPeople = participants.flatMap((row) =>
      row.personId ? [row.personId] : [],
    );
    const [attendanceRows, reliability] = await Promise.all([
      database
        .select()
        .from(activityAttendance)
        .where(
          and(
            eq(activityAttendance.activityType, "court-booking"),
            eq(activityAttendance.activityId, booking.id),
          ),
        ),
      loadAttendanceReliability({ personIds: linkedPeople, organizationId }),
    ]);
    return {
      activity: {
        id: booking.id,
        type: "court-booking",
        title: `${booking.organizerName} · court reservation`,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        timezone: booking.timezone,
        status: booking.status,
        venueId: booking.venueId,
        venueName: booking.venueName,
        courtId: booking.courtId,
        courtName: booking.courtName,
        capacity: booking.capacity,
        organizerPersonId: booking.organizerPersonId,
        organizerName: booking.organizerName,
        paymentMode: booking.paymentMode === "split" ? "split" : "full",
        totalAmountMinor: booking.totalAmountMinor,
        fundedAmountMinor: booking.fundedAmountMinor,
        currency: currency(booking.currency),
      },
      participants: participants.map((participant) => ({
        id: participant.id,
        personId: participant.personId ?? undefined,
        displayName:
          participant.displayName ??
          participant.invitedName ??
          "Invited player",
        avatarUrl: participant.avatarUrl ?? undefined,
        role: participant.role,
        status: participant.status,
        shareAmountMinor: participant.shareAmountMinor,
        attendanceStatus: attendanceStatus(
          participant.personId
            ? attendanceRows.find(
                (row) => row.personId === participant.personId,
              )?.status
            : undefined,
        ),
        reliability: participant.personId
          ? reliability.get(participant.personId)
          : undefined,
      })),
      linkedActivity: linkedPickup
        ? {
            id: linkedPickup.id,
            type: "pickup",
            title: linkedPickup.title,
            status: linkedPickup.status,
          }
        : undefined,
    };
  }

  const pickup = (
    await database
      .select({
        id: pickupSessions.id,
        status: pickupSessions.status,
        title: pickupSessions.title,
        startsAt: pickupSessions.startsAt,
        endsAt: pickupSessions.endsAt,
        organizationId: pickupSessions.organizationId,
        organizerPersonId: pickupSessions.hostPersonId,
        organizerName: people.displayName,
        venueId: pickupSessions.venueId,
        venueName: pickupSessions.venueLabel,
        timezone: venues.timezone,
        capacity: pickupSessions.capacity,
        costMinor: pickupSessions.costMinor,
        currency: pickupSessions.currency,
        courtBookingId: pickupSessions.courtBookingId,
      })
      .from(pickupSessions)
      .innerJoin(people, eq(pickupSessions.hostPersonId, people.id))
      .leftJoin(venues, eq(pickupSessions.venueId, venues.id))
      .where(
        and(
          eq(pickupSessions.id, input.activityId),
          eq(pickupSessions.organizationId, organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!pickup) throw new Error("Match was not found.");
  const participants = await database
    .select({
      id: pickupParticipants.id,
      personId: pickupParticipants.personId,
      displayName: people.displayName,
      avatarUrl: people.avatarUrl,
      status: pickupParticipants.status,
    })
    .from(pickupParticipants)
    .innerJoin(people, eq(pickupParticipants.personId, people.id))
    .where(eq(pickupParticipants.pickupSessionId, pickup.id));
  const [attendanceRows, reliability, linkedBooking] = await Promise.all([
    database
      .select()
      .from(activityAttendance)
      .where(
        and(
          eq(activityAttendance.activityType, "pickup"),
          eq(activityAttendance.activityId, pickup.id),
        ),
      ),
    loadAttendanceReliability({
      personIds: participants.map((row) => row.personId),
      organizationId,
    }),
    pickup.courtBookingId
      ? database.query.courtBookings.findFirst({
          where: eq(courtBookings.id, pickup.courtBookingId),
        })
      : Promise.resolve(undefined),
  ]);
  const confirmedCount = participants.filter((row) =>
    ["confirmed", "checked-in"].includes(row.status),
  ).length;
  return {
    activity: {
      id: pickup.id,
      type: "pickup",
      title: pickup.title,
      startsAt: pickup.startsAt.toISOString(),
      endsAt: pickup.endsAt.toISOString(),
      timezone: pickup.timezone ?? "UTC",
      status: pickup.status,
      venueId: pickup.venueId ?? undefined,
      venueName: pickup.venueName,
      capacity: pickup.capacity,
      organizerPersonId: pickup.organizerPersonId,
      organizerName: pickup.organizerName,
      totalAmountMinor: pickup.costMinor * confirmedCount,
      fundedAmountMinor: pickup.costMinor * confirmedCount,
      currency: currency(pickup.currency),
    },
    participants: participants.map((participant) => ({
      id: participant.id,
      personId: participant.personId,
      displayName: participant.displayName,
      avatarUrl: participant.avatarUrl ?? undefined,
      role:
        participant.personId === pickup.organizerPersonId ? "host" : "player",
      status: participant.status,
      shareAmountMinor: pickup.costMinor,
      attendanceStatus: attendanceStatus(
        attendanceRows.find((row) => row.personId === participant.personId)
          ?.status ??
          (participant.status === "checked-in" ? "attended" : undefined),
      ),
      reliability: reliability.get(participant.personId),
    })),
    linkedActivity: linkedBooking
      ? {
          id: linkedBooking.id,
          type: "court-booking",
          title: "Linked court reservation",
          status: linkedBooking.status,
        }
      : undefined,
  };
}

async function memberCandidates(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly scannedAt: Date;
}): Promise<readonly MemberCheckInCandidate[]> {
  const database = getDatabase();
  const windowStart = new Date(input.scannedAt.getTime() - 8 * 60 * 60_000);
  const windowEnd = new Date(input.scannedAt.getTime() + 18 * 60 * 60_000);
  const [sessionRows, courtRows, pickupRows] = await Promise.all([
    database
      .select({
        activityId: sessions.id,
        participationId: registrations.id,
        title: sessions.title,
        startsAt: sessions.startsAt,
        venueName: venues.name,
      })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        and(
          eq(registrations.personId, input.personId),
          inArray(registrations.status, ["confirmed", "checked-in"]),
          or(
            eq(programs.organizationId, input.organizationId),
            eq(eventTypes.organizationId, input.organizationId),
            eq(venues.organizationId, input.organizationId),
          ),
          gt(sessions.endsAt, windowStart),
          lt(sessions.startsAt, windowEnd),
        ),
      ),
    database
      .select({
        activityId: courtBookings.id,
        participationId: courtBookingParticipants.id,
        title: courts.name,
        startsAt: courtBookings.startsAt,
        venueName: venues.name,
      })
      .from(courtBookingParticipants)
      .innerJoin(
        courtBookings,
        eq(courtBookingParticipants.bookingId, courtBookings.id),
      )
      .innerJoin(courts, eq(courtBookings.courtId, courts.id))
      .innerJoin(venues, eq(courtBookings.venueId, venues.id))
      .where(
        and(
          eq(courtBookingParticipants.personId, input.personId),
          inArray(courtBookingParticipants.status, [
            "organizer",
            "accepted",
            "paid",
          ]),
          eq(courtBookings.organizationId, input.organizationId),
          eq(courtBookings.status, "confirmed"),
          gt(courtBookings.endsAt, windowStart),
          lt(courtBookings.startsAt, windowEnd),
        ),
      ),
    database
      .select({
        activityId: pickupSessions.id,
        participationId: pickupParticipants.id,
        title: pickupSessions.title,
        startsAt: pickupSessions.startsAt,
        venueName: pickupSessions.venueLabel,
        courtBookingId: pickupSessions.courtBookingId,
      })
      .from(pickupParticipants)
      .innerJoin(
        pickupSessions,
        eq(pickupParticipants.pickupSessionId, pickupSessions.id),
      )
      .where(
        and(
          eq(pickupParticipants.personId, input.personId),
          inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
          eq(pickupSessions.organizationId, input.organizationId),
          inArray(pickupSessions.status, ["active", "completed"]),
          gt(pickupSessions.endsAt, windowStart),
          lt(pickupSessions.startsAt, windowEnd),
        ),
      ),
  ]);
  const linkedBookingIds = new Set(
    pickupRows.flatMap((row) =>
      row.courtBookingId ? [row.courtBookingId] : [],
    ),
  );
  return [
    ...sessionRows.map((row) => ({
      activityType: "session" as const,
      activityId: row.activityId,
      participationId: row.participationId,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      venueName: row.venueName ?? "Location pending",
    })),
    ...courtRows
      .filter((row) => !linkedBookingIds.has(row.activityId))
      .map((row) => ({
        activityType: "court-booking" as const,
        activityId: row.activityId,
        participationId: row.participationId,
        title: `Court reservation · ${row.title}`,
        startsAt: row.startsAt.toISOString(),
        venueName: row.venueName,
      })),
    ...pickupRows.map((row) => ({
      activityType: "pickup" as const,
      activityId: row.activityId,
      participationId: row.participationId,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      venueName: row.venueName,
    })),
  ].toSorted(
    (left, right) =>
      Math.abs(Date.parse(left.startsAt) - input.scannedAt.getTime()) -
      Math.abs(Date.parse(right.startsAt) - input.scannedAt.getTime()),
  );
}

export async function scanDunaMember(input: {
  readonly actor: ApiActor;
  readonly credential: string;
  readonly selectedActivityType?: "session" | "court-booking" | "pickup";
  readonly selectedActivityId?: string;
  readonly deviceId: string;
  readonly scannedAt: Date;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  const organizationId = organizationIdFor(input.actor);
  if (
    input.scannedAt.getTime() > input.now.getTime() + 5 * 60_000 ||
    input.scannedAt.getTime() < input.now.getTime() - 24 * 60 * 60_000
  ) {
    throw new Error(
      "The scan timestamp is outside the secure check-in window.",
    );
  }
  const database = getDatabase();
  const parsed = parseDunaMemberCredential(input.credential);
  const memberId = normalizeDunaMemberId(input.credential);
  const person = (
    await database
      .select({
        id: people.id,
        displayName: people.displayName,
        dunaMemberId: people.dunaMemberId,
      })
      .from(people)
      .where(
        and(
          parsed
            ? eq(people.membershipQrToken, parsed.token)
            : memberId
              ? eq(people.dunaMemberId, memberId)
              : sql`false`,
          eq(people.status, "active"),
        ),
      )
      .limit(1)
  )[0];
  if (!person) {
    return {
      accepted: false,
      duplicate: false,
      selectionRequired: false,
      reason: "member-not-found" as const,
      candidates: [],
    };
  }
  const candidates = await memberCandidates({
    organizationId,
    personId: person.id,
    scannedAt: input.scannedAt,
  });
  const selected = input.selectedActivityId
    ? candidates.find(
        (candidate) =>
          candidate.activityId === input.selectedActivityId &&
          candidate.activityType === input.selectedActivityType,
      )
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (!selected && candidates.length > 1 && !input.selectedActivityId) {
    return {
      accepted: false,
      duplicate: false,
      selectionRequired: true,
      reason: "activity-selection-required" as const,
      memberId: person.dunaMemberId,
      playerName: person.displayName,
      candidates,
    };
  }
  if (!selected) {
    return {
      accepted: false,
      duplicate: false,
      selectionRequired: false,
      reason: "not-registered-today" as const,
      memberId: person.dunaMemberId,
      playerName: person.displayName,
      candidates,
    };
  }
  if (selected.activityType === "session") {
    const registration = await database.query.registrations.findFirst({
      where: eq(registrations.id, selected.participationId),
    });
    if (!registration || registration.personId !== person.id) {
      return {
        accepted: false,
        duplicate: false,
        selectionRequired: false,
        reason: "not-eligible" as const,
        memberId: person.dunaMemberId,
        playerName: person.displayName,
        activity: selected,
        candidates,
      };
    }
    if (registration.status === "checked-in") {
      return {
        accepted: false,
        duplicate: true,
        selectionRequired: false,
        reason: "already-checked-in" as const,
        memberId: person.dunaMemberId,
        playerName: person.displayName,
        activity: selected,
        candidates,
      };
    }
    const checkedIn = await getTransactionalDatabase().transaction(
      async (transaction) => {
        const updated = await transaction
          .update(registrations)
          .set({
            status: "checked-in",
            checkedInAt: input.scannedAt,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(registrations.id, registration.id),
              eq(registrations.status, "confirmed"),
            ),
          )
          .returning({ id: registrations.id });
        if (!updated[0]) return false;
        await transaction
          .insert(sessionAttendance)
          .values({
            organizationId,
            sessionId: registration.sessionId,
            registrationId: registration.id,
            personId: person.id,
            status: "attended",
            note: `Duna Membership QR · device ${input.deviceId}`,
            recordedByPersonId: input.actor.personId,
            recordedAt: input.scannedAt,
          })
          .onConflictDoUpdate({
            target: [sessionAttendance.sessionId, sessionAttendance.personId],
            set: {
              registrationId: registration.id,
              status: "attended",
              note: `Duna Membership QR · device ${input.deviceId}`,
              recordedByPersonId: input.actor.personId,
              recordedAt: input.scannedAt,
              updatedAt: input.now,
            },
          });
        await transaction.insert(auditLog).values({
          organizationId,
          actorPersonId: input.actor.personId,
          actorType: "person",
          action: "member-credential.checked-in",
          entityType: "registration",
          entityId: registration.id,
          afterHash: stableHash({
            personId: person.id,
            activity: selected,
            deviceId: input.deviceId,
          }),
          reason: "Universal Duna Membership QR accepted.",
          traceId: input.requestId,
          ipAddress: input.ipAddress,
          createdAt: input.now,
        });
        return true;
      },
    );
    if (!checkedIn) {
      const current = await database.query.registrations.findFirst({
        where: eq(registrations.id, registration.id),
      });
      const duplicate = current?.status === "checked-in";
      return {
        accepted: false,
        duplicate,
        selectionRequired: false,
        reason: duplicate
          ? ("already-checked-in" as const)
          : ("not-eligible" as const),
        memberId: person.dunaMemberId,
        playerName: person.displayName,
        activity: selected,
        candidates,
      };
    }
  } else {
    const existing = await database.query.activityAttendance.findFirst({
      where: and(
        eq(activityAttendance.organizationId, organizationId),
        eq(activityAttendance.activityType, selected.activityType),
        eq(activityAttendance.activityId, selected.activityId),
        eq(activityAttendance.personId, person.id),
        eq(activityAttendance.status, "attended"),
      ),
    });
    if (existing) {
      return {
        accepted: false,
        duplicate: true,
        selectionRequired: false,
        reason: "already-checked-in" as const,
        memberId: person.dunaMemberId,
        playerName: person.displayName,
        activity: selected,
        candidates,
      };
    }
    await recordActivityAttendance({
      actor: input.actor,
      activityType: selected.activityType,
      activityId: selected.activityId,
      participantId: selected.participationId,
      status: "attended",
      source: "member-qr",
      note: `Duna Membership QR · device ${input.deviceId}`,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.scannedAt,
    });
  }
  return {
    accepted: true,
    duplicate: false,
    selectionRequired: false,
    memberId: person.dunaMemberId,
    playerName: person.displayName,
    activity: selected,
    candidates,
  };
}
