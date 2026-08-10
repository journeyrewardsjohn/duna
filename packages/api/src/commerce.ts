import {
  auditLog,
  courtBookings,
  courts,
  divisions,
  eligibilityRules,
  eventTypes,
  getDatabase,
  getTransactionalDatabase,
  guardianships,
  memberships,
  membershipTiers,
  organizationMemberships,
  people,
  pickupJoinRequests,
  pickupParticipants,
  pickupSessions,
  ratings,
  sessions,
  venues,
} from "@duna/db";
import {
  evaluateEligibility,
  type EligibilityContext,
  type EligibilityResult,
  type EligibilityRule,
  type PersonSummary,
} from "@duna/core";
import { and, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import type { ApiActor } from "./context";

export type CommerceErrorCode =
  | "DATABASE_REQUIRED"
  | "SUBJECT_NOT_FOUND"
  | "GUARDIAN_REQUIRED"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_OPEN"
  | "SESSION_HAS_ENDED"
  | "DIVISION_NOT_FOUND"
  | "INELIGIBLE"
  | "PAYMENT_REQUIRED"
  | "CHECKOUT_IN_PROGRESS"
  | "PICKUP_NOT_FOUND"
  | "PICKUP_NOT_JOINABLE"
  | "PICKUP_HAS_ENDED"
  | "PICKUP_APPROVAL_REQUIRED"
  | "COURT_NOT_FOUND"
  | "COURT_NOT_BOOKABLE"
  | "INVALID_BOOKING_TIME"
  | "TICKET_NOT_FOUND"
  | "TICKET_WRONG_ORGANIZATION";

export class CommerceError extends Error {
  constructor(
    readonly code: CommerceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

function databaseRequired(): never {
  throw new CommerceError(
    "DATABASE_REQUIRED",
    "This operation requires the connected Duna database.",
  );
}

function mapDatabaseOperationError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const mapping: readonly [string, CommerceErrorCode, string][] = [
    ["session_not_found", "SESSION_NOT_FOUND", "Session was not found."],
    [
      "session_not_open",
      "SESSION_NOT_OPEN",
      "Registration is not open for this session.",
    ],
    [
      "session_has_ended",
      "SESSION_HAS_ENDED",
      "This session has already ended.",
    ],
    [
      "registration_ineligible",
      "INELIGIBLE",
      "This participant is not eligible for the session.",
    ],
    [
      "checkout_in_progress",
      "CHECKOUT_IN_PROGRESS",
      "A checkout is already active for this participant.",
    ],
    ["division_not_found", "DIVISION_NOT_FOUND", "Division was not found."],
    ["pickup_not_found", "PICKUP_NOT_FOUND", "Pickup was not found."],
    [
      "pickup_not_joinable",
      "PICKUP_NOT_JOINABLE",
      "This pickup is not open for joining.",
    ],
    ["pickup_has_ended", "PICKUP_HAS_ENDED", "This pickup has already ended."],
    [
      "pickup_full",
      "PICKUP_NOT_JOINABLE",
      "This pickup is full and its waitlist is turned off.",
    ],
    [
      "pickup_ineligible",
      "INELIGIBLE",
      "This participant is not eligible for the pickup.",
    ],
    ["ticket_not_found", "TICKET_NOT_FOUND", "Ticket was not found."],
    [
      "ticket_wrong_organization",
      "TICKET_WRONG_ORGANIZATION",
      "Ticket belongs to a different organization.",
    ],
  ];
  const match = mapping.find(([needle]) => message.includes(needle));
  if (match) throw new CommerceError(match[1], match[2]);
  throw error;
}

export async function assertSubjectAuthority(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId: string;
}): Promise<{
  readonly person: typeof people.$inferSelect;
  readonly guardianIds: readonly string[];
}> {
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, input.subjectPersonId),
  });
  if (!person) {
    throw new CommerceError("SUBJECT_NOT_FOUND", "Participant was not found.");
  }
  const guardianRows = await database
    .select({ guardianId: guardianships.guardianId })
    .from(guardianships)
    .where(
      and(
        eq(guardianships.minorId, person.id),
        eq(guardianships.verified, true),
      ),
    );
  const guardianIds = guardianRows.map((row) => row.guardianId);
  const selfAdult =
    person.id === input.actor.personId && input.actor.ageBand === "adult";
  const verifiedGuardian = guardianIds.includes(input.actor.personId);
  if (!selfAdult && !verifiedGuardian) {
    throw new CommerceError(
      "GUARDIAN_REQUIRED",
      person.id === input.actor.personId
        ? "A verified guardian must complete this participant flow."
        : "The signed-in person is not a verified guardian for this participant.",
    );
  }
  return { person, guardianIds };
}

function personSummary(
  person: typeof people.$inferSelect,
  rating: typeof ratings.$inferSelect | undefined,
): PersonSummary {
  return {
    id: person.id,
    displayName: person.displayName,
    handle: person.handle,
    initials: person.displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join(""),
    homeMarket: person.homeMarket ?? "Market not set",
    roles: ["player"],
    isMinor: person.isMinor,
    rating: rating
      ? {
          display: rating.display,
          mu: rating.mu,
          phi: rating.phi,
          sigma: rating.sigma,
          confidence: rating.confidence,
          discipline: rating.discipline,
        }
      : {
          display: 1,
          mu: 1_500,
          phi: 350,
          sigma: 0.06,
          confidence: "Provisional",
          discipline: "beach-2s",
        },
  };
}

export async function evaluateRegistrationForSession(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly divisionId?: string;
  readonly subjectPersonId: string;
  readonly inviteCodes: readonly string[];
  readonly now: Date;
}): Promise<{
  readonly decision: EligibilityResult;
  readonly ruleVersion: number;
}> {
  const database = getDatabase();
  const authority = await assertSubjectAuthority({
    actor: input.actor,
    subjectPersonId: input.subjectPersonId,
  });
  const session = await database.query.sessions.findFirst({
    where: eq(sessions.id, input.sessionId),
  });
  if (!session) {
    throw new CommerceError("SESSION_NOT_FOUND", "Session was not found.");
  }
  if (!["published", "registration-open"].includes(session.status)) {
    throw new CommerceError(
      "SESSION_NOT_OPEN",
      "Registration is not open for this session.",
    );
  }
  if (session.endsAt <= input.now) {
    throw new CommerceError(
      "SESSION_HAS_ENDED",
      "This session has already ended.",
    );
  }

  const division = input.divisionId
    ? await database.query.divisions.findFirst({
        where: and(
          eq(divisions.id, input.divisionId),
          eq(divisions.sessionId, session.id),
        ),
      })
    : undefined;
  if (input.divisionId && !division) {
    throw new CommerceError(
      "DIVISION_NOT_FOUND",
      "Division was not found for this session.",
    );
  }
  const eventType = session.eventTypeId
    ? await database.query.eventTypes.findFirst({
        where: eq(eventTypes.id, session.eventTypeId),
      })
    : undefined;
  const eligibilityRuleId =
    division?.eligibilityRuleId ?? eventType?.eligibilityRuleId;
  if (!eligibilityRuleId) {
    return {
      decision: { status: "eligible", reasons: [], ruleVersion: 0 },
      ruleVersion: 0,
    };
  }
  const [rule, rating, membershipRows] = await Promise.all([
    database.query.eligibilityRules.findFirst({
      where: eq(eligibilityRules.id, eligibilityRuleId),
    }),
    database.query.ratings.findFirst({
      where: and(
        eq(ratings.personId, authority.person.id),
        eq(ratings.discipline, division?.discipline ?? "beach-2s"),
      ),
    }),
    database
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.personId, authority.person.id),
          eq(organizationMemberships.active, true),
        ),
      ),
  ]);
  if (!rule) {
    throw new CommerceError(
      "INELIGIBLE",
      "The eligibility rule is unavailable.",
    );
  }
  const summary = personSummary(authority.person, rating);
  const context: EligibilityContext = {
    person: summary,
    discipline: division?.discipline ?? "beach-2s",
    currentRating: rating?.display ?? summary.rating.display,
    peak52WeekRating:
      rating?.current52WeekPeak ?? rating?.display ?? summary.rating.display,
    birthDate: authority.person.birthDate ?? undefined,
    asOfDate: input.now.toISOString().slice(0, 10),
    organizationMemberships: membershipRows,
    inviteCodes: input.inviteCodes,
    flags:
      authority.person.status === "active" ? [] : [authority.person.status],
  };
  const decision = evaluateEligibility({
    rule: rule.tree as EligibilityRule,
    ruleVersion: rule.version,
    context,
  });
  if (decision.status !== "eligible") {
    throw new CommerceError(
      "INELIGIBLE",
      decision.reasons.join(" ") || "Participant is not eligible.",
      { reasons: decision.reasons, ruleVersion: decision.ruleVersion },
    );
  }
  return { decision, ruleVersion: rule.version };
}

export interface RegistrationResult {
  readonly registrationId: string;
  readonly status: "confirmed" | "waitlisted";
  readonly spotsRemaining: number;
  readonly waitlistPosition?: number;
}

export async function registerForSession(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly divisionId?: string;
  readonly subjectPersonId?: string;
  readonly inviteCodes?: readonly string[];
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<RegistrationResult> {
  if (!process.env.DATABASE_URL) return databaseRequired();
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  const { decision, ruleVersion } = await evaluateRegistrationForSession({
    actor: input.actor,
    sessionId: input.sessionId,
    divisionId: input.divisionId,
    subjectPersonId,
    inviteCodes: input.inviteCodes ?? [],
    now: input.now,
  });
  const sessionPrice = (
    await getDatabase()
      .select({
        eventPriceMinor: eventTypes.priceMinor,
        divisionPriceMinor: divisions.entryFeeMinor,
      })
      .from(sessions)
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(
        divisions,
        input.divisionId
          ? and(
              eq(divisions.id, input.divisionId),
              eq(divisions.sessionId, sessions.id),
            )
          : sql`false`,
      )
      .where(eq(sessions.id, input.sessionId))
      .limit(1)
  )[0];
  const amountMinor =
    sessionPrice?.divisionPriceMinor ?? sessionPrice?.eventPriceMinor ?? 0;
  if (amountMinor > 0) {
    throw new CommerceError(
      "PAYMENT_REQUIRED",
      "This session requires checkout before registration can be confirmed.",
    );
  }
  try {
    const result = await getDatabase().execute(sql`
      SELECT *
      FROM duna_register_for_session(
        ${input.sessionId}::uuid,
        ${input.divisionId ?? null}::uuid,
        ${subjectPersonId}::uuid,
        ${JSON.stringify(decision)}::jsonb,
        ${ruleVersion}::integer,
        ${input.requestId}::text,
        ${input.ipAddress ?? null}::text
      )
    `);
    const row = result.rows[0] as
      | {
          registration_id?: string;
          result_status?: string;
          spots_remaining?: number;
          waitlist_position?: number | null;
        }
      | undefined;
    if (
      !row?.registration_id ||
      (row.result_status !== "confirmed" &&
        row.result_status !== "waitlisted") ||
      typeof row.spots_remaining !== "number"
    ) {
      throw new Error("Registration transaction returned an invalid result");
    }
    return {
      registrationId: row.registration_id,
      status: row.result_status,
      spotsRemaining: row.spots_remaining,
      waitlistPosition: row.waitlist_position ?? undefined,
    };
  } catch (error) {
    return mapDatabaseOperationError(error);
  }
}

export interface PickupJoinResult {
  readonly participantId: string;
  readonly status: "confirmed" | "waitlisted" | "pending";
  readonly spotsRemaining: number;
}

export async function evaluatePickupParticipant(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
  readonly subjectPersonId: string;
  readonly now: Date;
  readonly requireApproval?: boolean;
  readonly allowAdultPartnerPurchase?: boolean;
}): Promise<{
  readonly pickup: typeof pickupSessions.$inferSelect;
  readonly decision: EligibilityResult;
}> {
  const authority =
    input.allowAdultPartnerPurchase &&
    input.subjectPersonId !== input.actor.personId
      ? await (async () => {
          const person = await getDatabase().query.people.findFirst({
            where: and(
              eq(people.id, input.subjectPersonId),
              eq(people.status, "active"),
              eq(people.profileVisibility, "public"),
              eq(people.isMinor, false),
            ),
          });
          if (!person) {
            throw new CommerceError(
              "SUBJECT_NOT_FOUND",
              "Choose an active adult Duna player as your partner.",
            );
          }
          return { person, guardianIds: [] as readonly string[] };
        })()
      : await assertSubjectAuthority({
          actor: input.actor,
          subjectPersonId: input.subjectPersonId,
        });
  const pickup = await getDatabase().query.pickupSessions.findFirst({
    where: eq(pickupSessions.id, input.pickupSessionId),
  });
  if (!pickup) {
    throw new CommerceError("PICKUP_NOT_FOUND", "Pickup was not found.");
  }
  const actorParticipation =
    pickup.hostPersonId === input.actor.personId
      ? undefined
      : await getDatabase().query.pickupParticipants.findFirst({
          where: and(
            eq(pickupParticipants.pickupSessionId, pickup.id),
            eq(pickupParticipants.personId, input.actor.personId),
            inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
          ),
        });
  if (
    pickup.visibility !== "public" &&
    pickup.hostPersonId !== input.actor.personId &&
    !actorParticipation
  ) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "This pickup is not open for joining.",
    );
  }
  if (pickup.endsAt <= input.now) {
    throw new CommerceError(
      "PICKUP_HAS_ENDED",
      "This pickup has already ended.",
    );
  }
  if (
    pickup.approvalRequired &&
    input.requireApproval !== false &&
    pickup.hostPersonId !== authority.person.id
  ) {
    const request = await getDatabase().query.pickupJoinRequests.findFirst({
      where: and(
        eq(pickupJoinRequests.pickupSessionId, pickup.id),
        eq(pickupJoinRequests.personId, authority.person.id),
        eq(pickupJoinRequests.status, "approved"),
        gt(pickupJoinRequests.expiresAt, input.now),
      ),
    });
    if (!request) {
      throw new CommerceError(
        "PICKUP_APPROVAL_REQUIRED",
        "The host must approve your request before checkout.",
      );
    }
  }
  const rating = await getDatabase().query.ratings.findFirst({
    where: and(
      eq(ratings.personId, authority.person.id),
      eq(ratings.discipline, "beach-2s"),
    ),
  });
  const display = rating?.display ?? 1;
  const reasons: string[] = [];
  if (pickup.ratingMinimum !== null && display < pickup.ratingMinimum) {
    reasons.push(
      `A ${pickup.ratingMinimum.toFixed(2)} minimum Sand Rating is required.`,
    );
  }
  if (pickup.ratingMaximum !== null && display > pickup.ratingMaximum) {
    reasons.push(
      `A ${pickup.ratingMaximum.toFixed(2)} maximum Sand Rating applies.`,
    );
  }
  if (reasons.length > 0) {
    throw new CommerceError("INELIGIBLE", reasons.join(" "), {
      reasons,
      rating: display,
    });
  }
  return {
    pickup,
    decision: { status: "eligible", reasons: [], ruleVersion: 0 },
  };
}

export async function joinPickup(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
  readonly subjectPersonId?: string;
  readonly orderId?: string;
  readonly holdExpiresAt?: Date;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<PickupJoinResult> {
  const [result] = await joinPickupGroup({
    ...input,
    subjectPersonIds: [input.subjectPersonId ?? input.actor.personId],
  });
  if (!result) {
    throw new Error("Pickup transaction did not return a participant");
  }
  return result;
}

export async function joinPickupGroup(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
  readonly subjectPersonIds: readonly string[];
  readonly orderId?: string;
  readonly holdExpiresAt?: Date;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<readonly PickupJoinResult[]> {
  if (!process.env.DATABASE_URL) return databaseRequired();
  const subjectPersonIds = [...new Set(input.subjectPersonIds)];
  if (
    subjectPersonIds.length === 0 ||
    subjectPersonIds.length > 10 ||
    subjectPersonIds.length !== input.subjectPersonIds.length
  ) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "Choose up to 10 distinct Duna players.",
    );
  }
  if (!subjectPersonIds.includes(input.actor.personId)) {
    const pickup = await getDatabase().query.pickupSessions.findFirst({
      where: eq(pickupSessions.id, input.pickupSessionId),
    });
    const actorParticipation =
      pickup?.hostPersonId === input.actor.personId
        ? true
        : Boolean(
            await getDatabase().query.pickupParticipants.findFirst({
              where: and(
                eq(pickupParticipants.pickupSessionId, input.pickupSessionId),
                eq(pickupParticipants.personId, input.actor.personId),
                inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
              ),
            }),
          );
    if (!pickup || !actorParticipation) {
      throw new CommerceError(
        "PICKUP_NOT_JOINABLE",
        "Join this match before adding and paying for other players.",
      );
    }
  }
  const evaluations = await Promise.all(
    subjectPersonIds.map((subjectPersonId) =>
      evaluatePickupParticipant({
        actor: input.actor,
        pickupSessionId: input.pickupSessionId,
        subjectPersonId,
        now: input.now,
        requireApproval:
          subjectPersonId === input.actor.personId ? undefined : false,
        allowAdultPartnerPurchase: subjectPersonId !== input.actor.personId,
      }),
    ),
  );
  if (subjectPersonIds.length > 1) {
    const existing = await getDatabase()
      .select({
        addedByPersonId: pickupParticipants.addedByPersonId,
        holdExpiresAt: pickupParticipants.holdExpiresAt,
        orderId: pickupParticipants.orderId,
        personId: pickupParticipants.personId,
        status: pickupParticipants.status,
      })
      .from(pickupParticipants)
      .where(
        and(
          eq(pickupParticipants.pickupSessionId, input.pickupSessionId),
          inArray(pickupParticipants.personId, subjectPersonIds),
          inArray(pickupParticipants.status, [
            "pending",
            "confirmed",
            "checked-in",
            "invited",
            "waitlisted",
          ]),
        ),
      );
    const conflicts = existing.some((participant) => {
      if (["invited", "waitlisted"].includes(participant.status)) return false;
      if (
        input.orderId &&
        participant.status === "pending" &&
        participant.orderId === input.orderId &&
        participant.holdExpiresAt &&
        participant.holdExpiresAt > input.now
      ) {
        return false;
      }
      if (
        !input.orderId &&
        ["confirmed", "checked-in"].includes(participant.status) &&
        (participant.personId === input.actor.personId ||
          participant.addedByPersonId === input.actor.personId)
      ) {
        return false;
      }
      return true;
    });
    if (conflicts) {
      throw new CommerceError(
        "CHECKOUT_IN_PROGRESS",
        "One of these players already has a place or a different checkout in this hosted match.",
      );
    }
  }
  try {
    return await getTransactionalDatabase().transaction(async (transaction) => {
      const joined: PickupJoinResult[] = [];
      for (const [index, subjectPersonId] of subjectPersonIds.entries()) {
        const decision = evaluations[index]!.decision;
        const result = await transaction.execute(sql`
          SELECT *
          FROM duna_join_pickup(
            ${input.pickupSessionId}::uuid,
            ${subjectPersonId}::uuid,
            ${input.actor.personId}::uuid,
            ${input.orderId ?? null}::uuid,
            ${input.holdExpiresAt ?? null}::timestamptz,
            ${JSON.stringify(decision)}::jsonb,
            ${input.requestId}::text,
            ${input.ipAddress ?? null}::text
          )
        `);
        const row = result.rows[0] as
          | {
              participant_id?: string;
              result_status?: string;
              spots_remaining?: number;
            }
          | undefined;
        if (
          !row?.participant_id ||
          !["confirmed", "waitlisted", "pending"].includes(
            row.result_status ?? "",
          ) ||
          typeof row.spots_remaining !== "number"
        ) {
          throw new Error("Pickup transaction returned an invalid result");
        }
        if (subjectPersonIds.length > 1 && row.result_status === "waitlisted") {
          throw new CommerceError(
            "PICKUP_NOT_JOINABLE",
            "These places are no longer available together.",
          );
        }
        if (subjectPersonId !== input.actor.personId) {
          await transaction
            .update(pickupParticipants)
            .set({
              addedByPersonId: input.actor.personId,
              paidByPersonId: input.orderId ? input.actor.personId : undefined,
              updatedAt: input.now,
            })
            .where(eq(pickupParticipants.id, row.participant_id));
        }
        joined.push({
          participantId: row.participant_id,
          status: row.result_status as PickupJoinResult["status"],
          spotsRemaining: row.spots_remaining,
        });
      }
      return joined;
    });
  } catch (error) {
    return mapDatabaseOperationError(error);
  }
}

export interface TimeRange {
  readonly startsAt: string;
  readonly endsAt: string;
}

export function suggestCourtAlternatives(input: {
  readonly requested: TimeRange;
  readonly busy: readonly TimeRange[];
  readonly incrementMinutes?: number;
  readonly searchHours?: number;
  readonly limit?: number;
}): readonly TimeRange[] {
  const requestedStart = Date.parse(input.requested.startsAt);
  const requestedEnd = Date.parse(input.requested.endsAt);
  const duration = requestedEnd - requestedStart;
  if (
    !Number.isFinite(requestedStart) ||
    !Number.isFinite(requestedEnd) ||
    duration <= 0
  ) {
    return [];
  }
  const increment = (input.incrementMinutes ?? 30) * 60_000;
  const searchEndsAt = requestedStart + (input.searchHours ?? 12) * 60 * 60_000;
  const alternatives: TimeRange[] = [];
  for (
    let start = requestedStart + increment;
    start + duration <= searchEndsAt &&
    alternatives.length < (input.limit ?? 3);
    start += increment
  ) {
    const end = start + duration;
    const conflicts = input.busy.some((range) => {
      const busyStart = Date.parse(range.startsAt);
      const busyEnd = Date.parse(range.endsAt);
      return busyStart < end && busyEnd > start;
    });
    if (!conflicts) {
      alternatives.push({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
      });
    }
  }
  return alternatives;
}

export interface CourtHoldResult {
  readonly success: boolean;
  readonly bookingId?: string;
  readonly status: "held" | "unavailable";
  readonly startsAt: string;
  readonly endsAt: string;
  readonly holdExpiresAt?: string;
  readonly alternatives: readonly TimeRange[];
}

function isOverlapError(error: unknown): boolean {
  const candidate = error as {
    readonly code?: string;
    readonly constraint?: string;
    readonly cause?: unknown;
    readonly message?: string;
  };
  return (
    candidate.code === "23P01" ||
    candidate.constraint === "court_bookings_no_overlap" ||
    candidate.message?.includes("court_bookings_no_overlap") === true ||
    (candidate.cause ? isOverlapError(candidate.cause) : false)
  );
}

async function courtAlternatives(input: {
  readonly courtId: string;
  readonly requested: TimeRange;
  readonly now: Date;
}): Promise<readonly TimeRange[]> {
  const endOfSearch = new Date(
    Date.parse(input.requested.startsAt) + 12 * 60 * 60_000,
  );
  const rows = await getDatabase()
    .select({
      startsAt: courtBookings.startsAt,
      endsAt: courtBookings.endsAt,
      bufferBeforeMinutes: courtBookings.bufferBeforeMinutes,
      bufferAfterMinutes: courtBookings.bufferAfterMinutes,
    })
    .from(courtBookings)
    .where(
      and(
        eq(courtBookings.courtId, input.courtId),
        inArray(courtBookings.status, ["held", "confirmed"]),
        gt(courtBookings.endsAt, new Date(input.requested.startsAt)),
        lt(courtBookings.startsAt, endOfSearch),
        or(
          eq(courtBookings.status, "confirmed"),
          gt(courtBookings.holdExpiresAt, input.now),
        ),
      ),
    );
  return suggestCourtAlternatives({
    requested: input.requested,
    busy: rows.map((row) => ({
      startsAt: new Date(
        row.startsAt.getTime() - row.bufferBeforeMinutes * 60_000,
      ).toISOString(),
      endsAt: new Date(
        row.endsAt.getTime() + row.bufferAfterMinutes * 60_000,
      ).toISOString(),
    })),
  });
}

async function courtPolicyAllows(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId: string;
  readonly organizationId: string;
  readonly bookingPolicy: string;
}): Promise<boolean> {
  if (input.bookingPolicy === "public") return true;
  if (input.bookingPolicy === "none") return false;
  const database = getDatabase();
  const [staff, activeMembership] = await Promise.all([
    database.query.organizationMemberships.findFirst({
      where: and(
        eq(organizationMemberships.organizationId, input.organizationId),
        eq(organizationMemberships.personId, input.actor.personId),
        eq(organizationMemberships.active, true),
      ),
    }),
    database
      .select({ membershipId: memberships.id, tierId: memberships.tierId })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, input.subjectPersonId),
          eq(membershipTiers.organizationId, input.organizationId),
          inArray(memberships.status, ["active", "trialing"]),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (input.bookingPolicy === "staff") return Boolean(staff);
  if (input.bookingPolicy === "members") {
    return Boolean(staff || activeMembership);
  }
  if (input.bookingPolicy.startsWith("tier:")) {
    return (
      Boolean(staff) ||
      activeMembership?.tierId === input.bookingPolicy.slice("tier:".length)
    );
  }
  return false;
}

export async function createCourtHold(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
  readonly courtId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly holdMinutes?: number;
  readonly now: Date;
}): Promise<CourtHoldResult> {
  if (!process.env.DATABASE_URL) return databaseRequired();
  if (input.actor.ageBand !== "adult") {
    throw new CommerceError(
      "GUARDIAN_REQUIRED",
      "A verified adult identity must hold a court.",
    );
  }
  const database = getDatabase();
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  await assertSubjectAuthority({
    actor: input.actor,
    subjectPersonId,
  });
  const resource = (
    await database
      .select({
        courtId: courts.id,
        venueId: venues.id,
        organizationId: venues.organizationId,
        courtStatus: courts.status,
        venueStatus: venues.status,
        bookingPolicy: courts.bookingPolicy,
        minimumDurationMinutes: courts.minimumDurationMinutes,
        maximumDurationMinutes: courts.maximumDurationMinutes,
        bufferBeforeMinutes: courts.bufferBeforeMinutes,
        bufferAfterMinutes: courts.bufferAfterMinutes,
        minimumNoticeMinutes: courts.minimumNoticeMinutes,
        maximumAdvanceDays: courts.maximumAdvanceDays,
      })
      .from(courts)
      .innerJoin(venues, eq(courts.venueId, venues.id))
      .where(eq(courts.id, input.courtId))
      .limit(1)
  )[0];
  if (!resource) {
    throw new CommerceError("COURT_NOT_FOUND", "Court was not found.");
  }
  if (
    resource.courtStatus !== "active" ||
    resource.venueStatus !== "active" ||
    !(await courtPolicyAllows({
      actor: input.actor,
      subjectPersonId,
      organizationId: resource.organizationId,
      bookingPolicy: resource.bookingPolicy,
    }))
  ) {
    throw new CommerceError(
      "COURT_NOT_BOOKABLE",
      "This court is not available for public booking.",
    );
  }
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const durationMinutes =
    (endsAt.getTime() - startsAt.getTime()) / (60 * 1_000);
  const earliestStart = new Date(
    input.now.getTime() + resource.minimumNoticeMinutes * 60_000,
  );
  const latestStart = new Date(
    input.now.getTime() + resource.maximumAdvanceDays * 24 * 60 * 60_000,
  );
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    startsAt < earliestStart ||
    startsAt > latestStart ||
    durationMinutes < resource.minimumDurationMinutes ||
    durationMinutes > resource.maximumDurationMinutes
  ) {
    throw new CommerceError(
      "INVALID_BOOKING_TIME",
      `Court bookings must be ${resource.minimumDurationMinutes}–${resource.maximumDurationMinutes} minutes, at least ${resource.minimumNoticeMinutes} minutes ahead, and no more than ${resource.maximumAdvanceDays} days ahead.`,
    );
  }
  const bookingId = crypto.randomUUID();
  const holdMinutes = Math.min(
    35,
    Math.max(1, Math.floor(input.holdMinutes ?? 10)),
  );
  const holdExpiresAt = new Date(
    Math.min(input.now.getTime() + holdMinutes * 60_000, startsAt.getTime()),
  );
  try {
    await database.batch([
      database
        .update(courtBookings)
        .set({ status: "expired", updatedAt: input.now })
        .where(
          and(
            eq(courtBookings.courtId, input.courtId),
            eq(courtBookings.status, "held"),
            lt(courtBookings.holdExpiresAt, input.now),
          ),
        ),
      database.insert(courtBookings).values({
        id: bookingId,
        organizationId: resource.organizationId,
        venueId: resource.venueId,
        courtId: resource.courtId,
        personId: subjectPersonId,
        startsAt,
        endsAt,
        bufferBeforeMinutes: resource.bufferBeforeMinutes,
        bufferAfterMinutes: resource.bufferAfterMinutes,
        status: "held",
        holdExpiresAt,
        idempotencyKey: input.idempotencyKey,
      }),
      database.insert(auditLog).values({
        organizationId: resource.organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "court-booking.held",
        entityType: "court-booking",
        entityId: bookingId,
        reason:
          subjectPersonId === input.actor.personId
            ? "Player placed a time-limited court hold."
            : "Verified guardian placed a time-limited court hold for a dependent.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
      }),
    ]);
  } catch (error) {
    if (!isOverlapError(error)) throw error;
    return {
      success: false,
      status: "unavailable",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      alternatives: await courtAlternatives({
        courtId: input.courtId,
        requested: input,
        now: input.now,
      }),
    };
  }
  return {
    success: true,
    bookingId,
    status: "held",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    holdExpiresAt: holdExpiresAt.toISOString(),
    alternatives: [],
  };
}

export interface TicketScanResult {
  readonly scanEventId: string;
  readonly ticketId: string;
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason?: "not-issued" | "already-scanned" | "void" | "refunded";
  readonly ticketStatus:
    "held" | "issued" | "transferred" | "scanned" | "void" | "refunded";
}

export async function scanTicketConnected(input: {
  readonly actor: ApiActor;
  readonly ticketToken: string;
  readonly deviceId: string;
  readonly scannedAt: Date;
  readonly offline: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
}): Promise<TicketScanResult> {
  if (!process.env.DATABASE_URL) return databaseRequired();
  if (!input.actor.organizationId) {
    throw new CommerceError(
      "TICKET_WRONG_ORGANIZATION",
      "An organization context is required to scan tickets.",
    );
  }
  try {
    const result = await getDatabase().execute(sql`
      SELECT *
      FROM duna_scan_ticket(
        ${input.ticketToken}::text,
        ${input.actor.organizationId}::uuid,
        ${input.actor.personId}::uuid,
        ${input.deviceId}::text,
        ${input.scannedAt}::timestamptz,
        ${input.offline}::boolean,
        ${input.requestId}::text,
        ${input.ipAddress ?? null}::text
      )
    `);
    const row = result.rows[0] as
      | {
          scan_event_id?: string;
          result_ticket_id?: string;
          accepted?: boolean;
          duplicate?: boolean;
          reason?: TicketScanResult["reason"] | null;
          result_ticket_status?: TicketScanResult["ticketStatus"];
        }
      | undefined;
    if (
      !row?.scan_event_id ||
      !row.result_ticket_id ||
      typeof row.accepted !== "boolean" ||
      typeof row.duplicate !== "boolean" ||
      !row.result_ticket_status
    ) {
      throw new Error("Ticket scan transaction returned an invalid result");
    }
    return {
      scanEventId: row.scan_event_id,
      ticketId: row.result_ticket_id,
      accepted: row.accepted,
      duplicate: row.duplicate,
      reason: row.reason ?? undefined,
      ticketStatus: row.result_ticket_status,
    };
  } catch (error) {
    return mapDatabaseOperationError(error);
  }
}
