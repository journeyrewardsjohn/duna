/**
 * Coverage (B3a): sessions that need a coach, ranked substitutes, and the
 * coverage grid. Suggestions come from `rankSubstitutes` in
 * @duna/scheduling. Nobody is reassigned without a person confirming:
 * `assign` is that confirmation and writes an audit row. "Ask" only records
 * the ask; the message itself is a Concierge Send proposal a person sends
 * (there is no staff-notice outbox, so the offers in `asked` state are the
 * "to notify" list the UI hands to Concierge).
 */
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  sessions,
  staffCoverageOffers,
  staffCoverageRequests,
  trainingEventCoaches,
  trainingEvents,
  trainingProgramCoaches,
} from "@duna/db";
import { log } from "@duna/observability";
import {
  addCalendarDays,
  affectedCommitments,
  availabilityFor,
  type CoverageCandidate,
  isFreeThroughout,
  localDateOf,
  rankSubstitutes,
  scheduledMinutes,
  wallTimeToInstant,
  weekdayOfDate,
} from "@duna/scheduling";
import { and, asc, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import type { z } from "zod";
import { stableHash } from "../../canonical";
import type {
  teamAvailabilityCoverageActionInputSchema,
  teamAvailabilityCoverageRequestsInputSchema,
} from "../../contracts/team-availability";
import {
  type DetailedCommitment,
  type MemberAvailability,
  loadMemberAvailability,
} from "./inputs";
import {
  type StaffRow,
  type TeamActor,
  assertManager,
  conflict,
  loadOrganizationStaff,
  notFound,
  organizationTimezone,
  staffRef,
} from "./shared";

type CoverageReason =
  "time-off" | "blackout" | "schedule-change" | "no-coach-assigned" | "manual";

const COACHING_ROLES = new Set(["coach", "director", "manager"]);
const FINAL_OFFER_STATUSES = ["declined", "assigned", "withdrawn"];

function weekBounds(instant: Date, timezone: string) {
  const date = localDateOf(instant.getTime(), timezone);
  const start = addCalendarDays(date, -weekdayOfDate(date));
  return {
    startsAt: new Date(wallTimeToInstant(start, 0, timezone)),
    endsAt: new Date(wallTimeToInstant(addCalendarDays(start, 7), 0, timezone)),
  };
}

/** Sessions of this organisation a member still leads inside each span. */
export async function sessionsNeedingCover(
  context: TeamActor,
  staff: StaffRow,
  spans: readonly { id: string; startsAt: Date; endsAt: Date }[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const relevant = spans.filter((span) => span.endsAt > context.now);
  if (relevant.length === 0) return counts;
  const startsAt = new Date(
    Math.max(
      context.now.getTime(),
      Math.min(...relevant.map((span) => span.startsAt.getTime())),
    ),
  );
  const endsAt = new Date(
    Math.max(...relevant.map((span) => span.endsAt.getTime())),
  );
  if (!(endsAt > startsAt)) return counts;
  const timezone = await organizationTimezone(context.organizationId);
  const members = await loadMemberAvailability({
    organizationId: context.organizationId,
    staff: [staff],
    range: { startsAt, endsAt },
    timezone,
  });
  const commitments = (members.get(staff.id)?.commitments ?? []).filter(
    (commitment) => commitment.target,
  );
  for (const span of relevant) {
    counts.set(
      span.id,
      affectedCommitments({
        commitments,
        unavailable: {
          startsAt: new Date(
            Math.max(span.startsAt.getTime(), context.now.getTime()),
          ).toISOString(),
          endsAt: span.endsAt.toISOString(),
        },
      }).length,
    );
  }
  return counts;
}

async function loadCandidates(
  context: TeamActor,
  session: { startsAt: Date; endsAt: Date },
  timezone: string,
): Promise<{ staff: StaffRow[]; members: Map<string, MemberAvailability> }> {
  const staff = (
    await loadOrganizationStaff(context.organizationId, { activeOnly: true })
  ).filter((row) => COACHING_ROLES.has(row.staffRole));
  const week = weekBounds(session.startsAt, timezone);
  const members = await loadMemberAvailability({
    organizationId: context.organizationId,
    staff,
    range: {
      startsAt: new Date(
        Math.min(week.startsAt.getTime(), session.startsAt.getTime()),
      ),
      endsAt: new Date(
        Math.max(week.endsAt.getTime(), session.endsAt.getTime()),
      ),
    },
    timezone,
  });
  return { staff, members };
}

async function qualifiedPeople(target: {
  sessionId: string | null;
  trainingEventId: string | null;
}): Promise<Set<string> | undefined> {
  if (!target.trainingEventId) return undefined;
  const database = getDatabase();
  const [event] = await database
    .select({ programId: trainingEvents.programId })
    .from(trainingEvents)
    .where(eq(trainingEvents.id, target.trainingEventId));
  if (!event?.programId) return undefined;
  const coaches = await database
    .select({ personId: trainingProgramCoaches.personId })
    .from(trainingProgramCoaches)
    .where(eq(trainingProgramCoaches.programId, event.programId));
  return coaches.length > 0
    ? new Set(coaches.map((row) => row.personId))
    : undefined;
}

/** Ranks and stores suggestions for one request. Returns the new status. */
async function suggest(
  context: TeamActor,
  request: typeof staffCoverageRequests.$inferSelect,
): Promise<string> {
  const timezone = await organizationTimezone(context.organizationId);
  const { staff, members } = await loadCandidates(context, request, timezone);
  const qualified = await qualifiedPeople(request);
  const week = weekBounds(request.startsAt, timezone);
  const localDay = localDateOf(request.startsAt.getTime(), timezone);
  const target = request.sessionId ?? request.trainingEventId!;
  const targetCommitment = [...members.values()]
    .flatMap((member) => member.commitments)
    .find((commitment) => commitment.id === target);
  const candidates: CoverageCandidate[] = staff.flatMap((row) => {
    const member = members.get(row.id);
    if (!member) return [];
    return [
      {
        staffProfileId: row.id,
        displayName: row.displayName,
        inputs: member.inputs,
        ...(qualified ? { qualified: qualified.has(row.personId) } : {}),
        venueIdsThatDay: member.commitments
          .filter(
            (commitment) =>
              commitment.venueId &&
              localDateOf(Date.parse(commitment.startsAt), timezone) ===
                localDay,
          )
          .map((commitment) => commitment.venueId!),
        minutesThisWeek: scheduledMinutes(
          member.commitments.filter(
            (commitment) => commitment.kind !== "calendar",
          ),
          {
            startsAt: week.startsAt.toISOString(),
            endsAt: week.endsAt.toISOString(),
          },
        ),
      },
    ];
  });
  const ranked = rankSubstitutes({
    session: {
      id: target,
      startsAt: request.startsAt.toISOString(),
      endsAt: request.endsAt.toISOString(),
      ...(targetCommitment?.venueId
        ? { venueId: targetCommitment.venueId }
        : {}),
    },
    candidates,
    excludeStaffProfileIds: request.originalStaffProfileId
      ? [request.originalStaffProfileId]
      : [],
  });
  return getTransactionalDatabase().transaction(async (transaction) => {
    const existing = await transaction
      .select()
      .from(staffCoverageOffers)
      .where(eq(staffCoverageOffers.requestId, request.id));
    const rankedIds = new Set(ranked.map((row) => row.staffProfileId));
    // Suggestions that no longer apply go; asked and answered offers stay.
    const stale = existing.filter(
      (offer) =>
        offer.status === "suggested" && !rankedIds.has(offer.staffProfileId),
    );
    if (stale.length > 0) {
      await transaction.delete(staffCoverageOffers).where(
        inArray(
          staffCoverageOffers.id,
          stale.map((offer) => offer.id),
        ),
      );
    }
    for (const row of ranked) {
      const current = existing.find(
        (offer) => offer.staffProfileId === row.staffProfileId,
      );
      if (current) {
        await transaction
          .update(staffCoverageOffers)
          .set({
            rank: row.rank,
            rationale: row.rationale,
            updatedAt: context.now,
          })
          .where(eq(staffCoverageOffers.id, current.id));
      } else {
        await transaction.insert(staffCoverageOffers).values({
          requestId: request.id,
          staffProfileId: row.staffProfileId,
          rank: row.rank,
          status: "suggested",
          rationale: row.rationale,
          createdAt: context.now,
          updatedAt: context.now,
        });
      }
    }
    const live = existing.filter(
      (offer) => offer.status === "asked" || offer.status === "accepted",
    );
    let status = request.status;
    if (status === "open" && ranked.length === 0 && live.length === 0) {
      status = "nobody-free";
    }
    if (status !== request.status) {
      await transaction
        .update(staffCoverageRequests)
        .set({ status, updatedAt: context.now })
        .where(eq(staffCoverageRequests.id, request.id));
    }
    return status;
  });
}

/**
 * After a member becomes unavailable (time off approved, a blackout, a
 * schedule change), opens one coverage request per affected session or
 * training event of this organisation and ranks substitutes for it.
 */
export async function openCoverageForUnavailability(
  context: TeamActor,
  input: {
    readonly staff: StaffRow;
    readonly reason: CoverageReason;
    readonly range: { startsAt: Date; endsAt: Date };
    readonly timeOffId?: string;
    readonly blackoutId?: string;
  },
): Promise<{ requestIds: string[] }> {
  const startsAt = new Date(
    Math.max(input.range.startsAt.getTime(), context.now.getTime()),
  );
  if (!(input.range.endsAt > startsAt)) return { requestIds: [] };
  const timezone = await organizationTimezone(context.organizationId);
  const members = await loadMemberAvailability({
    organizationId: context.organizationId,
    staff: [input.staff],
    range: { startsAt, endsAt: input.range.endsAt },
    timezone,
  });
  const member = members.get(input.staff.id);
  if (!member) return { requestIds: [] };
  let affected = affectedCommitments({
    commitments: member.commitments.filter((commitment) => commitment.target),
    unavailable: {
      startsAt: startsAt.toISOString(),
      endsAt: input.range.endsAt.toISOString(),
    },
  }) as DetailedCommitment[];
  if (input.reason === "schedule-change") {
    // Only sessions the member is no longer free for.
    affected = affected.filter(
      (commitment) =>
        !isFreeThroughout(
          { staffProfileId: input.staff.id },
          commitment,
          member.inputs,
          { ignoreCommitmentIds: [commitment.id] },
        ),
    );
  }
  const requestIds: string[] = [];
  for (const commitment of affected) {
    const target = commitment.target!;
    const [created] = await getDatabase()
      .insert(staffCoverageRequests)
      .values({
        organizationId: context.organizationId,
        ...(target.kind === "session"
          ? { sessionId: target.sessionId }
          : { trainingEventId: target.trainingEventId }),
        startsAt: new Date(commitment.startsAt),
        endsAt: new Date(commitment.endsAt),
        originalStaffProfileId: input.staff.id,
        reason: input.reason,
        timeOffId: input.timeOffId ?? null,
        blackoutId: input.blackoutId ?? null,
        status: "open",
        createdAt: context.now,
        updatedAt: context.now,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) continue; // already open for this session
    requestIds.push(created.id);
    await suggest(context, created);
  }
  log.info("team-availability.coverage.opened", {
    organizationId: context.organizationId,
    staffProfileId: input.staff.id,
    reason: input.reason,
    affected: affected.length,
    opened: requestIds.length,
  });
  return { requestIds };
}

// ---------------------------------------------------------------- reads

async function requestsOut(
  context: TeamActor,
  rows: (typeof staffCoverageRequests.$inferSelect)[],
) {
  if (rows.length === 0) return [];
  const database = getDatabase();
  const ids = rows.map((row) => row.id);
  const sessionIds = rows.flatMap((row) =>
    row.sessionId ? [row.sessionId] : [],
  );
  const eventIds = rows.flatMap((row) =>
    row.trainingEventId ? [row.trainingEventId] : [],
  );
  const [offers, staff, sessionTitles, eventTitles] = await Promise.all([
    database
      .select()
      .from(staffCoverageOffers)
      .where(inArray(staffCoverageOffers.requestId, ids))
      .orderBy(asc(staffCoverageOffers.rank)),
    loadOrganizationStaff(context.organizationId),
    sessionIds.length === 0
      ? []
      : database
          .select({ id: sessions.id, title: sessions.title })
          .from(sessions)
          .where(inArray(sessions.id, sessionIds)),
    eventIds.length === 0
      ? []
      : database
          .select({ id: trainingEvents.id, title: trainingEvents.title })
          .from(trainingEvents)
          .where(inArray(trainingEvents.id, eventIds)),
  ]);
  const staffById = new Map(staff.map((row) => [row.id, row]));
  const titles = new Map(
    [...sessionTitles, ...eventTitles].map((row) => [row.id, row.title]),
  );
  return rows.map((row) => {
    const original = row.originalStaffProfileId
      ? staffById.get(row.originalStaffProfileId)
      : undefined;
    const coveredBy = row.coveredByStaffProfileId
      ? staffById.get(row.coveredByStaffProfileId)
      : undefined;
    return {
      id: row.id,
      target: row.sessionId
        ? { kind: "session" as const, sessionId: row.sessionId }
        : {
            kind: "training-event" as const,
            trainingEventId: row.trainingEventId!,
          },
      title:
        titles.get(row.sessionId ?? row.trainingEventId ?? "") ?? "Session",
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      ...(original ? { originalStaff: staffRef(original) } : {}),
      reason: row.reason as CoverageReason,
      status: row.status as
        "open" | "asking" | "covered" | "nobody-free" | "cancelled",
      ...(coveredBy ? { coveredBy: staffRef(coveredBy) } : {}),
      offers: offers
        .filter((offer) => offer.requestId === row.id)
        .flatMap((offer) => {
          const member = staffById.get(offer.staffProfileId);
          if (!member) return [];
          return [
            {
              id: offer.id,
              staff: staffRef(member),
              rank: offer.rank,
              status: offer.status as
                | "suggested"
                | "asked"
                | "accepted"
                | "declined"
                | "assigned"
                | "withdrawn",
              ...(offer.rationale
                ? { rationale: offer.rationale.slice(0, 500) }
                : {}),
              ...(offer.askedAt
                ? { askedAt: offer.askedAt.toISOString() }
                : {}),
              ...(offer.respondedAt
                ? { respondedAt: offer.respondedAt.toISOString() }
                : {}),
            },
          ];
        }),
      ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
    };
  });
}

export async function coverageRequests(
  context: TeamActor,
  input: z.infer<typeof teamAvailabilityCoverageRequestsInputSchema>,
) {
  const rows = await getDatabase()
    .select()
    .from(staffCoverageRequests)
    .where(
      and(
        eq(staffCoverageRequests.organizationId, context.organizationId),
        input.status && input.status.length > 0
          ? inArray(staffCoverageRequests.status, input.status)
          : undefined,
        input.from
          ? gte(staffCoverageRequests.endsAt, new Date(input.from))
          : undefined,
        input.to
          ? lte(staffCoverageRequests.startsAt, new Date(input.to))
          : undefined,
      ),
    )
    .orderBy(asc(staffCoverageRequests.startsAt))
    .limit(500);
  return { requests: await requestsOut(context, rows) };
}

async function loadRequest(context: TeamActor, requestId: string) {
  const [row] = await getDatabase()
    .select()
    .from(staffCoverageRequests)
    .where(
      and(
        eq(staffCoverageRequests.id, requestId),
        eq(staffCoverageRequests.organizationId, context.organizationId),
      ),
    );
  if (!row) notFound("This coverage request was not found.");
  return row;
}

async function requestOut(context: TeamActor, requestId: string) {
  const [out] = await requestsOut(context, [
    await loadRequest(context, requestId),
  ]);
  return out!;
}

/** Hour × weekday for one week: sessions against coaches available. */
export async function coverageGrid(context: TeamActor, weekStartsOn: string) {
  const timezone = await organizationTimezone(context.organizationId);
  const startsAt = new Date(wallTimeToInstant(weekStartsOn, 0, timezone));
  const endsAt = new Date(
    wallTimeToInstant(addCalendarDays(weekStartsOn, 7), 0, timezone),
  );
  const staff = (
    await loadOrganizationStaff(context.organizationId, { activeOnly: true })
  ).filter((row) => COACHING_ROLES.has(row.staffRole));
  const members = await loadMemberAvailability({
    organizationId: context.organizationId,
    staff,
    range: { startsAt, endsAt },
    timezone,
  });
  // The organisation's sessions this week (each counted once).
  const sessionsThisWeek = new Map<string, DetailedCommitment>();
  for (const member of members.values()) {
    for (const commitment of member.commitments) {
      // Sessions, training events and booked lessons of this organisation.
      if (
        commitment.target ||
        (commitment.kind === "lesson" && commitment.organizationId)
      ) {
        sessionsThisWeek.set(commitment.id, commitment);
      }
    }
  }
  const unassigned = await unassignedSessions(context, { startsAt, endsAt });
  for (const commitment of unassigned)
    sessionsThisWeek.set(commitment.id, commitment);
  const ownSessionIds = [...sessionsThisWeek.keys()];
  // A coach teaching one of these sessions is available for it.
  const free = [...members.values()].map((member) =>
    availabilityFor(
      { staffProfileId: member.staff.id },
      { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
      member.inputs,
      { ignoreCommitmentIds: ownSessionIds },
    ).free.map((interval) => ({
      start: Date.parse(interval.startsAt),
      end: Date.parse(interval.endsAt),
    })),
  );
  const cells: {
    weekday: number;
    hour: number;
    sessions: number;
    coachesFree: number;
    short: boolean;
  }[] = [];
  for (let day = 0; day < 7; day += 1) {
    const date = addCalendarDays(weekStartsOn, day);
    for (let hour = 0; hour < 24; hour += 1) {
      const cellStart = wallTimeToInstant(date, hour * 60, timezone);
      const cellEnd = wallTimeToInstant(date, (hour + 1) * 60, timezone);
      if (!(cellEnd > cellStart)) continue; // skipped hour on a DST day
      const sessionCount = [...sessionsThisWeek.values()].filter(
        (commitment) =>
          Date.parse(commitment.startsAt) < cellEnd &&
          Date.parse(commitment.endsAt) > cellStart,
      ).length;
      const coachesFree = free.filter((intervals) => {
        let covered = 0;
        for (const interval of intervals) {
          covered += Math.max(
            0,
            Math.min(cellEnd, interval.end) -
              Math.max(cellStart, interval.start),
          );
        }
        return covered >= cellEnd - cellStart;
      }).length;
      if (sessionCount === 0 && coachesFree === 0) continue;
      cells.push({
        weekday: weekdayOfDate(date),
        hour,
        sessions: sessionCount,
        coachesFree,
        short: sessionCount > 0 && coachesFree < sessionCount,
      });
    }
  }
  return { weekStartsOn, timezone, cells };
}

/** Training events of this organisation in a range with no coach at all. */
async function unassignedSessions(
  context: TeamActor,
  range: { startsAt: Date; endsAt: Date },
): Promise<DetailedCommitment[]> {
  const database = getDatabase();
  const rows = await database
    .select({
      id: trainingEvents.id,
      title: trainingEvents.title,
      startsAt: trainingEvents.startsAt,
      endsAt: trainingEvents.endsAt,
      venueId: trainingEvents.venueId,
      coachPersonId: trainingEvents.coachPersonId,
    })
    .from(trainingEvents)
    .where(
      and(
        eq(trainingEvents.organizationId, context.organizationId),
        notInArray(trainingEvents.status, ["cancelled"]),
        eq(trainingEvents.kind, "practice"),
        gte(trainingEvents.endsAt, range.startsAt),
        lte(trainingEvents.startsAt, range.endsAt),
      ),
    );
  const withoutLead = rows.filter((row) => !row.coachPersonId);
  if (withoutLead.length === 0) return [];
  const assistants = await database
    .select({ trainingEventId: trainingEventCoaches.trainingEventId })
    .from(trainingEventCoaches)
    .where(
      inArray(
        trainingEventCoaches.trainingEventId,
        withoutLead.map((row) => row.id),
      ),
    );
  const staffed = new Set(assistants.map((row) => row.trainingEventId));
  return withoutLead
    .filter((row) => !staffed.has(row.id))
    .map((row) => ({
      id: row.id,
      kind: "training-event" as const,
      personId: "",
      title: row.title,
      organizationId: context.organizationId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      ...(row.venueId ? { venueId: row.venueId } : {}),
      target: { kind: "training-event" as const, trainingEventId: row.id },
    }));
}

// ---------------------------------------------------------------- actions

async function reassign(
  transaction: Parameters<
    Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
  >[0],
  request: typeof staffCoverageRequests.$inferSelect,
  fromPersonId: string | undefined,
  toPersonId: string,
) {
  if (request.sessionId) {
    await transaction
      .update(sessions)
      .set({ coachPersonId: toPersonId, updatedAt: new Date() })
      .where(eq(sessions.id, request.sessionId));
    return;
  }
  const eventId = request.trainingEventId!;
  const [event] = await transaction
    .select({ coachPersonId: trainingEvents.coachPersonId })
    .from(trainingEvents)
    .where(eq(trainingEvents.id, eventId));
  if (!event?.coachPersonId || event.coachPersonId === fromPersonId) {
    await transaction
      .update(trainingEvents)
      .set({ coachPersonId: toPersonId })
      .where(eq(trainingEvents.id, eventId));
  }
  if (fromPersonId) {
    await transaction
      .delete(trainingEventCoaches)
      .where(
        and(
          eq(trainingEventCoaches.trainingEventId, eventId),
          eq(trainingEventCoaches.personId, fromPersonId),
        ),
      );
  }
  await transaction
    .insert(trainingEventCoaches)
    .values({
      trainingEventId: eventId,
      personId: toPersonId,
      role: "substitute",
    })
    .onConflictDoNothing();
}

export async function coverageAction(
  context: TeamActor,
  input: z.infer<typeof teamAvailabilityCoverageActionInputSchema>,
) {
  assertManager(context);
  const request = await loadRequest(context, input.requestId);
  const closed = request.status === "covered" || request.status === "cancelled";
  if (input.action === "suggest") {
    if (closed) conflict(`This request is already ${request.status}.`);
    await suggest(context, request);
    return requestOut(context, request.id);
  }
  if (input.action === "cancel") {
    if (closed) conflict(`This request is already ${request.status}.`);
    await getTransactionalDatabase().transaction(async (transaction) => {
      await transaction
        .update(staffCoverageRequests)
        .set({
          status: "cancelled",
          resolvedAt: context.now,
          resolvedByPersonId: context.actor.personId,
          updatedAt: context.now,
        })
        .where(eq(staffCoverageRequests.id, request.id));
      await transaction
        .update(staffCoverageOffers)
        .set({ status: "withdrawn", updatedAt: context.now })
        .where(
          and(
            eq(staffCoverageOffers.requestId, request.id),
            notInArray(staffCoverageOffers.status, FINAL_OFFER_STATUSES),
          ),
        );
      await transaction.insert(auditLog).values({
        organizationId: context.organizationId,
        actorPersonId: context.actor.personId,
        actorType: "person",
        action: "staff-coverage.cancelled",
        entityType: "staff-coverage-request",
        entityId: request.id,
        reason: "Coverage request cancelled.",
        traceId: context.requestId,
        createdAt: context.now,
      });
    });
    log.info("team-availability.coverage.cancelled", {
      organizationId: context.organizationId,
      requestId: request.id,
    });
    return requestOut(context, request.id);
  }

  const [offer] = await getDatabase()
    .select()
    .from(staffCoverageOffers)
    .where(
      and(
        eq(staffCoverageOffers.id, input.offerId),
        eq(staffCoverageOffers.requestId, request.id),
      ),
    );
  if (!offer) notFound("This substitute offer was not found.");
  if (closed) conflict(`This request is already ${request.status}.`);

  if (input.action === "ask") {
    if (offer.status !== "suggested" && offer.status !== "declined") {
      conflict(`This offer is already ${offer.status}.`);
    }
    await getTransactionalDatabase().transaction(async (transaction) => {
      await transaction
        .update(staffCoverageOffers)
        .set({
          status: "asked",
          askedAt: context.now,
          respondedAt: null,
          updatedAt: context.now,
        })
        .where(eq(staffCoverageOffers.id, offer.id));
      await transaction
        .update(staffCoverageRequests)
        .set({ status: "asking", updatedAt: context.now })
        .where(eq(staffCoverageRequests.id, request.id));
    });
    log.info("team-availability.coverage.asked", {
      organizationId: context.organizationId,
      requestId: request.id,
      offerId: offer.id,
    });
    return requestOut(context, request.id);
  }

  if (input.action === "decline") {
    if (FINAL_OFFER_STATUSES.includes(offer.status)) {
      conflict(`This offer is already ${offer.status}.`);
    }
    await getDatabase()
      .update(staffCoverageOffers)
      .set({
        status: "declined",
        respondedAt: context.now,
        updatedAt: context.now,
      })
      .where(eq(staffCoverageOffers.id, offer.id));
    log.info("team-availability.coverage.declined", {
      organizationId: context.organizationId,
      requestId: request.id,
      offerId: offer.id,
    });
    return requestOut(context, request.id);
  }

  // assign: the person confirming reassigns the session.
  if (FINAL_OFFER_STATUSES.includes(offer.status)) {
    conflict(`This offer is already ${offer.status}.`);
  }
  const timezone = await organizationTimezone(context.organizationId);
  const [substitute] = await loadOrganizationStaff(context.organizationId, {
    ids: [offer.staffProfileId],
  });
  if (!substitute?.active) conflict("This team member is no longer active.");
  const members = await loadMemberAvailability({
    organizationId: context.organizationId,
    staff: [substitute],
    range: { startsAt: request.startsAt, endsAt: request.endsAt },
    timezone,
  });
  const target = request.sessionId ?? request.trainingEventId!;
  if (
    !isFreeThroughout(
      { staffProfileId: substitute.id },
      {
        startsAt: request.startsAt.toISOString(),
        endsAt: request.endsAt.toISOString(),
      },
      members.get(substitute.id)!.inputs,
      { ignoreCommitmentIds: [target] },
    )
  ) {
    conflict(`${substitute.displayName} is no longer free for this session.`);
  }
  const [original] = request.originalStaffProfileId
    ? await loadOrganizationStaff(context.organizationId, {
        ids: [request.originalStaffProfileId],
      })
    : [];
  await getTransactionalDatabase().transaction(async (transaction) => {
    const [updated] = await transaction
      .update(staffCoverageRequests)
      .set({
        status: "covered",
        coveredByStaffProfileId: substitute.id,
        resolvedByPersonId: context.actor.personId,
        resolvedAt: context.now,
        updatedAt: context.now,
      })
      .where(
        and(
          eq(staffCoverageRequests.id, request.id),
          inArray(staffCoverageRequests.status, [
            "open",
            "asking",
            "nobody-free",
          ]),
        ),
      )
      .returning({ id: staffCoverageRequests.id });
    if (!updated) conflict("This request changed while you were assigning.");
    await transaction
      .update(staffCoverageOffers)
      .set({
        status: "assigned",
        respondedAt: offer.respondedAt ?? context.now,
        updatedAt: context.now,
      })
      .where(eq(staffCoverageOffers.id, offer.id));
    await transaction
      .update(staffCoverageOffers)
      .set({ status: "withdrawn", updatedAt: context.now })
      .where(
        and(
          eq(staffCoverageOffers.requestId, request.id),
          notInArray(staffCoverageOffers.status, FINAL_OFFER_STATUSES),
        ),
      );
    await reassign(
      transaction,
      request,
      original?.personId,
      substitute.personId,
    );
    await transaction.insert(auditLog).values({
      organizationId: context.organizationId,
      actorPersonId: context.actor.personId,
      actorType: "person",
      action: "staff-coverage.assigned",
      entityType: request.sessionId ? "session" : "training-event",
      entityId: target,
      beforeHash: stableHash({ coachPersonId: original?.personId ?? null }),
      afterHash: stableHash({ coachPersonId: substitute.personId }),
      reason: `Coverage request ${request.id}: reassigned to staff profile ${substitute.id} after a person confirmed.`,
      traceId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      createdAt: context.now,
    });
  });
  log.info("team-availability.coverage.assigned", {
    organizationId: context.organizationId,
    requestId: request.id,
    offerId: offer.id,
  });
  return requestOut(context, request.id);
}
