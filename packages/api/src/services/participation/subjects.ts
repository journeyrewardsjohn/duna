/**
 * Event sessions, divisions and pickups on the same engine (PART-9 adapters,
 * built in PART-3 part 2). Each adapter reads its host row's `participation`
 * rule (JSON v2), counts its people (teams for divisions), and lets the one
 * decision step decide at the lock exactly as catalog sessions do: claimed
 * with one conditional update, never cancelling after the start, and only
 * cancelling when the rule says so (legacy settings were mapped to "run",
 * decision 7).
 */
import {
  divisions,
  eventTypes,
  getDatabase,
  orders,
  participationDecisions,
  pickupParticipants,
  pickupSessions,
  programs,
  registrations,
  sessions,
} from "@duna/db";
import {
  PARTICIPATION_POLICY,
  decideParticipationMinimum,
  participationLockAt,
  readParticipationRuleV2,
  resolveParticipationRuleV2,
  serializeParticipationRule,
  type ResolvedParticipationRule,
} from "@duna/core";
import { log } from "@duna/observability";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { refundOrganizationOrder } from "../../catalog-service";
import {
  ParticipationError,
  queueParticipationNotices,
  type ParticipationNoticeIntent,
} from "./catalog";

export const OTHER_SUBJECT_TYPES = [
  "session",
  "division",
  "pickup-session",
] as const;
export type OtherSubjectType = (typeof OTHER_SUBJECT_TYPES)[number];

interface SubjectParticipant {
  readonly id: string;
  readonly personId: string;
  /** Who hears about it: the payer or whoever added them. */
  readonly bookerPersonId: string;
  readonly orderId: string | null;
  readonly confirmed: boolean;
}

export interface SubjectFacts {
  readonly subjectType: OtherSubjectType;
  readonly subjectId: string;
  readonly organizationId: string | null;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly capacity: number;
  readonly cancelled: boolean;
  readonly rawRule: unknown;
  readonly staffPersonIds: readonly string[];
  readonly participants: readonly SubjectParticipant[];
  /** People per counted unit (a division counts teams). */
  readonly unitSize: number;
}

const confirmedStatuses = ["confirmed", "checked-in"] as const;

async function sessionOrganization(sessionId: string): Promise<string | null> {
  const row = await getDatabase()
    .select({
      program: programs.organizationId,
      eventType: eventTypes.organizationId,
    })
    .from(sessions)
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)
    .then((rows) => rows[0]);
  return row?.program ?? row?.eventType ?? null;
}

async function registrationParticipants(
  where: ReturnType<typeof eq>,
): Promise<SubjectParticipant[]> {
  const rows = await getDatabase()
    .select({ registration: registrations, buyer: orders.buyerPersonId })
    .from(registrations)
    .leftJoin(orders, eq(registrations.orderId, orders.id))
    .where(
      and(
        where,
        inArray(registrations.status, ["confirmed", "checked-in", "pending"]),
      ),
    );
  return rows.map(({ registration, buyer }) => ({
    id: registration.id,
    personId: registration.personId,
    bookerPersonId: buyer ?? registration.personId,
    orderId: registration.orderId,
    confirmed: (confirmedStatuses as readonly string[]).includes(
      registration.status,
    ),
  }));
}

export async function loadSubjectFacts(
  subjectType: OtherSubjectType,
  subjectId: string,
): Promise<SubjectFacts | undefined> {
  const database = getDatabase();
  if (subjectType === "session") {
    const session = await database.query.sessions.findFirst({
      where: eq(sessions.id, subjectId),
    });
    if (!session) return undefined;
    return {
      subjectType,
      subjectId,
      organizationId: await sessionOrganization(session.id),
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      timezone: session.timezone,
      capacity: session.capacity,
      cancelled: session.status === "cancelled",
      rawRule: session.participation,
      staffPersonIds: [session.coachPersonId, session.createdByPersonId].filter(
        (id): id is string => Boolean(id),
      ),
      participants: await registrationParticipants(
        eq(registrations.sessionId, session.id),
      ),
      unitSize: 1,
    };
  }
  if (subjectType === "division") {
    const division = await database.query.divisions.findFirst({
      where: eq(divisions.id, subjectId),
    });
    if (!division) return undefined;
    const session = await database.query.sessions.findFirst({
      where: eq(sessions.id, division.sessionId),
    });
    if (!session) return undefined;
    return {
      subjectType,
      subjectId,
      organizationId: await sessionOrganization(session.id),
      title: `${session.title} · ${division.name}`,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      timezone: session.timezone,
      capacity: division.maximumTeams ?? division.capacity,
      cancelled: session.status === "cancelled",
      rawRule: division.participation,
      staffPersonIds: [session.createdByPersonId].filter((id): id is string =>
        Boolean(id),
      ),
      participants: await registrationParticipants(
        eq(registrations.divisionId, division.id),
      ),
      unitSize: Math.max(1, division.teamSize),
    };
  }
  const pickup = await database.query.pickupSessions.findFirst({
    where: eq(pickupSessions.id, subjectId),
  });
  if (!pickup) return undefined;
  const rows = await database
    .select()
    .from(pickupParticipants)
    .where(
      and(
        eq(pickupParticipants.pickupSessionId, pickup.id),
        inArray(pickupParticipants.status, [
          "confirmed",
          "checked-in",
          "pending",
        ]),
      ),
    );
  return {
    subjectType,
    subjectId,
    organizationId: pickup.organizationId,
    title: pickup.title,
    startsAt: pickup.startsAt,
    endsAt: pickup.endsAt,
    timezone: "UTC",
    capacity: pickup.capacity,
    cancelled: pickup.status === "cancelled",
    rawRule: pickup.participation,
    staffPersonIds: [pickup.hostPersonId],
    participants: rows.map((row) => ({
      id: row.id,
      personId: row.personId,
      bookerPersonId: row.paidByPersonId ?? row.addedByPersonId ?? row.personId,
      orderId: row.orderId,
      confirmed: (confirmedStatuses as readonly string[]).includes(row.status),
    })),
    unitSize: 1,
  };
}

/** Confirmed units: people, or whole-or-part teams for a division. */
export function confirmedUnits(facts: SubjectFacts): number {
  const people = facts.participants.filter(
    (participant) => participant.confirmed,
  ).length;
  return Math.ceil(people / facts.unitSize);
}

export function subjectRule(
  facts: SubjectFacts,
): ResolvedParticipationRule | undefined {
  const rule = readParticipationRuleV2(facts.rawRule);
  return rule
    ? resolveParticipationRuleV2(rule, {
        capacity: facts.capacity,
        defaultLockMinutes: PARTICIPATION_POLICY.defaultLockMinutesBeforeStart,
      })
    : undefined;
}

async function ensureSubjectDecision(
  facts: SubjectFacts,
  rule: ResolvedParticipationRule,
  now: Date,
) {
  const database = getDatabase();
  const find = () =>
    database.query.participationDecisions.findFirst({
      where: and(
        eq(participationDecisions.subjectType, facts.subjectType),
        eq(participationDecisions.subjectId, facts.subjectId),
      ),
    });
  const existing = await find();
  const lockAt = participationLockAt({
    startsAt: facts.startsAt,
    lockMinutesBeforeStart: rule.lockMinutesBeforeStart,
  });
  if (!existing) {
    await database
      .insert(participationDecisions)
      .values({
        organizationId: facts.organizationId,
        subjectType: facts.subjectType,
        subjectId: facts.subjectId,
        ruleSnapshot: serializeParticipationRule(rule),
        snapshotAt: now,
        lockAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    return find();
  }
  // Nobody has a place yet: the host's current rule applies.
  if (
    !existing.outcome &&
    facts.participants.length === 0 &&
    !existing.lockOverrideAt
  ) {
    await database
      .update(participationDecisions)
      .set({
        ruleSnapshot: serializeParticipationRule(rule),
        snapshotAt: now,
        lockAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(participationDecisions.id, existing.id),
          isNull(participationDecisions.outcome),
        ),
      );
    return find();
  }
  return existing;
}

function systemActor(personId: string, organizationId: string) {
  return {
    personId,
    displayName: "Duna",
    roles: ["player" as const],
    organizationId,
    scopes: [] as string[],
    ageBand: "adult" as const,
    isDemo: false,
  };
}

/** Cancels the host and releases every place (refunds paid ones). */
async function cancelSubjectHost(
  facts: SubjectFacts,
  now: Date,
  reason: string,
) {
  const database = getDatabase();
  if (facts.subjectType === "session") {
    await database
      .update(sessions)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(sessions.id, facts.subjectId));
  } else if (facts.subjectType === "pickup-session") {
    await database
      .update(pickupSessions)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(pickupSessions.id, facts.subjectId));
  }
  const attention: SubjectParticipant[] = [];
  for (const participant of facts.participants) {
    if (participant.orderId && facts.organizationId) {
      const order = await database.query.orders.findFirst({
        where: eq(orders.id, participant.orderId),
      });
      if (
        order &&
        (order.status === "paid" || order.status === "partially-refunded") &&
        order.totalMinor > 0
      ) {
        try {
          const refund = await refundOrganizationOrder({
            actor: systemActor(order.buyerPersonId, facts.organizationId),
            orderId: order.id,
            amountMinor: order.totalMinor,
            disposition: "original-payment",
            reason,
            requestId: `participation-cancel:${participant.id}`,
            now,
          });
          if (refund.status === "failed") attention.push(participant);
        } catch {
          attention.push(participant);
        }
      }
    } else if (participant.orderId) {
      // A paid place in a pickup with no club: the host settles it.
      attention.push(participant);
    }
    if (facts.subjectType === "pickup-session") {
      await database
        .update(pickupParticipants)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(pickupParticipants.id, participant.id));
    } else {
      await database
        .update(registrations)
        .set({ status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(registrations.id, participant.id),
            inArray(registrations.status, [
              "confirmed",
              "checked-in",
              "pending",
            ]),
          ),
        );
    }
  }
  return attention;
}

export interface SubjectEvaluation {
  readonly subjectType: OtherSubjectType;
  readonly subjectId: string;
  readonly status: "no-rules" | "not-due" | "decided" | "cancelled";
  readonly outcome?: string;
  readonly groupSize?: number;
}

/**
 * Decides one event session, division or pickup at its lock. Re-entrant and
 * safe under concurrency: the conditional update claims the decision once.
 */
export async function evaluateSubjectParticipation(input: {
  readonly subjectType: OtherSubjectType;
  readonly subjectId: string;
  readonly force?: boolean;
  readonly actorPersonId?: string;
  readonly now: Date;
}): Promise<SubjectEvaluation> {
  const base = { subjectType: input.subjectType, subjectId: input.subjectId };
  const facts = await loadSubjectFacts(input.subjectType, input.subjectId);
  if (!facts)
    throw new ParticipationError("NOT_FOUND", "This session was not found.");
  const rule = subjectRule(facts);
  if (!rule || facts.cancelled) return { ...base, status: "no-rules" };
  const decision = await ensureSubjectDecision(facts, rule, input.now);
  if (!decision) return { ...base, status: "no-rules" };
  if (decision.outcome) {
    return {
      ...base,
      status: decision.outcome.startsWith("cancel") ? "cancelled" : "decided",
      outcome: decision.outcome,
      groupSize: decision.decidedGroupSize ?? undefined,
    };
  }
  const lockAt = decision.lockOverrideAt ?? decision.lockAt;
  if (!input.force && input.now < lockAt) return { ...base, status: "not-due" };
  const snapshot = resolveParticipationRuleV2(
    readParticipationRuleV2(decision.ruleSnapshot)!,
    {
      capacity: facts.capacity,
    },
  );
  const groupSize = confirmedUnits(facts);
  const decided = decideParticipationMinimum(snapshot, groupSize);
  const runs =
    decided === "cancel-under-minimum" &&
    (input.now >= facts.startsAt || decision.forcedOutcome === "run");
  const outcome = runs ? "run-under-minimum" : decided;
  const claimed = await getDatabase()
    .update(participationDecisions)
    .set({
      outcome,
      decidedAt: input.now,
      decidedGroupSize: groupSize,
      decidedByPersonId: input.actorPersonId,
      cancelReason:
        outcome === "cancel-under-minimum" ? "minimum-not-met" : null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(participationDecisions.id, decision.id),
        isNull(participationDecisions.outcome),
      ),
    )
    .returning({ id: participationDecisions.id });
  if (claimed.length === 0) {
    return evaluateSubjectParticipation({ ...input, force: false });
  }
  const notices: ParticipationNoticeIntent[] = [];
  const hasMinimum = snapshot.minParticipants > 1;
  if (outcome === "cancel-under-minimum") {
    const attention = await cancelSubjectHost(
      facts,
      input.now,
      "Session cancelled: the minimum number of players was not met.",
    );
    for (const staff of facts.staffPersonIds) {
      notices.push({
        organizationId: facts.organizationId,
        subjectType: facts.subjectType,
        subjectId: facts.subjectId,
        recipientPersonId: staff,
        bookingId: null,
        kind: "staff-cancelled",
        scheduledFor: input.now,
      });
      for (const participant of attention) {
        notices.push({
          organizationId: facts.organizationId,
          subjectType: facts.subjectType,
          subjectId: facts.subjectId,
          recipientPersonId: staff,
          bookingId: participant.id,
          kind: "refund-attention",
          scheduledFor: input.now,
        });
      }
    }
  }
  if (hasMinimum) {
    for (const participant of facts.participants.filter(
      (entry) => entry.confirmed,
    )) {
      notices.push({
        organizationId: facts.organizationId,
        subjectType: facts.subjectType,
        subjectId: facts.subjectId,
        recipientPersonId: participant.bookerPersonId,
        bookingId: participant.id,
        kind:
          outcome === "cancel-under-minimum" ? "cancelled-low" : "confirmed",
        scheduledFor: input.now,
      });
    }
  }
  await queueParticipationNotices(notices);
  log.info("participation.session.locked", {
    organizationId: facts.organizationId ?? undefined,
    subjectType: facts.subjectType,
    subjectId: facts.subjectId,
    outcome,
    groupSize,
    min: snapshot.minParticipants,
    capacity: facts.capacity,
    decidedLate: runs && input.now >= facts.startsAt,
  });
  return {
    ...base,
    status: outcome === "cancel-under-minimum" ? "cancelled" : "decided",
    outcome,
    groupSize,
  };
}

/** The schedule's sweep for event sessions, divisions and pickups. */
export async function processDueSubjectParticipation(input: {
  readonly now: Date;
  readonly limit?: number;
}): Promise<{
  readonly examined: number;
  readonly decided: number;
  readonly failed: number;
}> {
  const database = getDatabase();
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  const from = new Date(input.now.getTime() - 14 * 86_400_000);
  const to = new Date(input.now.getTime() + 8 * 86_400_000);
  const undecided = (
    type: OtherSubjectType,
    id: ReturnType<typeof sql>,
  ) => sql`NOT EXISTS (
    SELECT 1 FROM participation_decisions AS decision
    WHERE decision.subject_type = ${type} AND decision.subject_id = ${id} AND decision.outcome IS NOT NULL
  )`;
  const sessionRows = await database
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        sql`${sessions.participation} IS NOT NULL`,
        gte(sessions.startsAt, from),
        lte(sessions.startsAt, to),
        or(
          eq(sessions.status, "published"),
          eq(sessions.status, "registration-open"),
        ),
        undecided("session", sql`${sessions.id}`),
      ),
    )
    .limit(limit);
  const divisionRows = await database
    .select({ id: divisions.id })
    .from(divisions)
    .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
    .where(
      and(
        sql`${divisions.participation} IS NOT NULL`,
        gte(sessions.startsAt, from),
        lte(sessions.startsAt, to),
        undecided("division", sql`${divisions.id}`),
      ),
    )
    .limit(limit);
  const pickupRows = await database
    .select({ id: pickupSessions.id })
    .from(pickupSessions)
    .where(
      and(
        sql`${pickupSessions.participation} IS NOT NULL`,
        eq(pickupSessions.status, "active"),
        gte(pickupSessions.startsAt, from),
        lte(pickupSessions.startsAt, to),
        undecided("pickup-session", sql`${pickupSessions.id}`),
      ),
    )
    .limit(limit);
  const candidates: { type: OtherSubjectType; id: string }[] = [
    ...sessionRows.map((row) => ({ type: "session" as const, id: row.id })),
    ...divisionRows.map((row) => ({ type: "division" as const, id: row.id })),
    ...pickupRows.map((row) => ({
      type: "pickup-session" as const,
      id: row.id,
    })),
  ];
  let decided = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const result = await evaluateSubjectParticipation({
        subjectType: candidate.type,
        subjectId: candidate.id,
        now: input.now,
      });
      if (result.status === "decided" || result.status === "cancelled")
        decided += 1;
    } catch (error) {
      failed += 1;
      log.error("participation.subject.evaluateFailed", {
        subjectType: candidate.type,
        subjectId: candidate.id,
        error,
      });
    }
  }
  return { examined: candidates.length, decided, failed };
}
