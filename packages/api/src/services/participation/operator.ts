/**
 * Operator procedures for group sessions (participation.md §6, §7.1): the
 * club default, previewing a rule change, the at-risk list, and the
 * interventions — extend the lock, run anyway, cancel with refunds, a
 * coach's request to cancel and attendance. Every intervention is audited
 * and logged with ids and counts only.
 */
import { createHash } from "node:crypto";
import {
  auditLog,
  catalogFulfillments,
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  organizationParticipationDefaults,
  participationAttendance,
  participationCancelRequests,
  participationDecisions,
  people,
} from "@duna/db";
import {
  PARTICIPATION_AT_RISK_DAYS,
  PARTICIPATION_ATTENDANCE_WINDOW_MINUTES,
  classifyRuleChange,
  participationLockAt,
  readParticipationRuleV2,
  resolveParticipationRuleV2,
  serializeParticipationRule,
  validateLockExtension,
  validateParticipationRuleV2,
  type ParticipationChangeClass,
  type ParticipationRevenueCliff,
  type ParticipationRuleV2,
  type ParticipationState,
  type ResolvedParticipationRule,
} from "@duna/core";
import { log } from "@duna/observability";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import {
  ACTIVE_CATALOG_BOOKING_STATUSES,
  evaluateCatalogSessionParticipation,
  refundCancelledOccurrenceBookings,
  type ParticipationCancellationResult,
} from "../../catalog-participation";
import type { ApiActor } from "../../context";
import {
  CATALOG_SUBJECT,
  ParticipationError,
  bookerNotices,
  catalogItemTakesGroupRules,
  catalogOpenedAt,
  catalogSessionPicture,
  effectiveLockAt,
  ensureCatalogDecision,
  loadClubParticipationDefault,
  loadDecision,
  occurrencePlaces,
  queueParticipationNotices,
  requireParticipationDatabase,
  resolveCatalogItemRule,
} from "./catalog";

type Occurrence = typeof catalogSessionOccurrences.$inferSelect;
type Item = typeof catalogItems.$inferSelect;

export function actorHasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

async function loadSession(
  organizationId: string,
  occurrenceId: string,
): Promise<{ occurrence: Occurrence; item: Item }> {
  const row = await getDatabase()
    .select({ occurrence: catalogSessionOccurrences, item: catalogItems })
    .from(catalogSessionOccurrences)
    .innerJoin(catalogItems, eq(catalogSessionOccurrences.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(catalogSessionOccurrences.id, occurrenceId),
        eq(catalogSessionOccurrences.organizationId, organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) {
    throw new ParticipationError("NOT_FOUND", "This session was not found.");
  }
  return row;
}

function assertCatalogSubject(subjectType: string): void {
  if (subjectType !== CATALOG_SUBJECT) {
    throw new ParticipationError(
      "INVALID",
      "Group rules for this kind of session arrive with PART-9.",
    );
  }
}

async function audit(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly action: string;
  readonly entityId: string;
  readonly after: Record<string, unknown>;
  readonly reason: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<void> {
  await getDatabase().insert(auditLog).values({
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    actorType: "person",
    action: input.action,
    entityType: "catalog-session-occurrence",
    entityId: input.entityId,
    afterHash: stableHash(input.after),
    reason: input.reason,
    traceId: input.requestId,
    createdAt: input.now,
  });
}

// ---------------------------------------------------------------------------
// The club default
// ---------------------------------------------------------------------------

export type ParticipationDefaultKind = "service" | "open-play" | "pickup";

export interface ParticipationDefaultsView {
  readonly rules: ParticipationRuleV2 | null;
  readonly appliesTo: readonly ParticipationDefaultKind[];
  readonly inheritedBy: number;
}

export async function getParticipationDefaults(
  organizationId: string,
): Promise<ParticipationDefaultsView> {
  requireParticipationDatabase();
  const current = await loadClubParticipationDefault(organizationId);
  const items = await getDatabase()
    .select({ type: catalogItems.type, configuration: catalogItems.configuration })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.organizationId, organizationId),
        eq(catalogItems.type, "service"),
        sql`NOT (${catalogItems.configuration} ? 'participation')`,
        inArray(catalogItems.status, ["active", "draft"]),
      ),
    );
  const capacityOf = (configuration: Record<string, unknown>) =>
    Number(configuration.capacity ?? 1);
  return {
    rules: readParticipationRuleV2(current.rules) ?? null,
    appliesTo: current.appliesTo.filter(
      (kind): kind is ParticipationDefaultKind =>
        kind === "service" || kind === "open-play" || kind === "pickup",
    ),
    inheritedBy: current.rules
      ? items.filter(
          (item) =>
            catalogItemTakesGroupRules(item) && capacityOf(item.configuration) > 1,
        ).length
      : 0,
  };
}

export async function setParticipationDefaults(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly rules: unknown;
  readonly appliesTo: readonly ("service" | "open-play" | "pickup")[];
  readonly requestId: string;
  readonly now: Date;
}): Promise<{
  readonly rules: ParticipationRuleV2 | null;
  readonly issues: readonly string[];
  readonly warnings: readonly ParticipationRevenueCliff[];
}> {
  requireParticipationDatabase();
  const result = validateParticipationRuleV2(input.rules, { forClubDefault: true });
  if (!result.rule) {
    const current = await loadClubParticipationDefault(input.organizationId);
    return {
      rules: readParticipationRuleV2(current.rules) ?? null,
      issues: result.issues,
      warnings: [],
    };
  }
  const stored = serializeParticipationRule({
    ...result.rule,
    tiers: [],
    effectiveFrom: input.now.toISOString(),
  });
  await getDatabase()
    .insert(organizationParticipationDefaults)
    .values({
      organizationId: input.organizationId,
      rules: stored,
      appliesTo: [...new Set(input.appliesTo)],
      updatedByPersonId: input.actorPersonId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: organizationParticipationDefaults.organizationId,
      set: {
        rules: stored,
        appliesTo: [...new Set(input.appliesTo)],
        updatedByPersonId: input.actorPersonId,
        updatedAt: input.now,
      },
    });
  await getDatabase().insert(auditLog).values({
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    actorType: "person",
    action: "participation.defaults_saved",
    entityType: "organization",
    entityId: input.organizationId,
    afterHash: stableHash({ rules: stored, appliesTo: input.appliesTo }),
    reason: "Club booking rule saved.",
    traceId: input.requestId,
    createdAt: input.now,
  });
  log.info("participation.rule.saved", {
    organizationId: input.organizationId,
    subjectType: "organization-default",
    min: result.rule.minParticipants,
    lockMinutes: result.rule.lockMinutesBeforeStart,
    policy: result.rule.minimumPolicy,
    tiersCount: 0,
    source: "form",
    inherited: false,
  });
  return { rules: readParticipationRuleV2(stored)!, issues: [], warnings: [] };
}

// ---------------------------------------------------------------------------
// Rule changes after people booked (§8)
// ---------------------------------------------------------------------------

function inertBase(capacity: number): ResolvedParticipationRule {
  return resolveParticipationRuleV2(
    {
      version: 2,
      unit: "player",
      minParticipants: 1,
      minimumPolicy: "run",
      waitlist: false,
      tiers: [],
    },
    { capacity },
  );
}

export async function previewParticipationRuleChange(input: {
  readonly organizationId: string;
  readonly catalogItemId: string;
  readonly rules: unknown;
  readonly now: Date;
}): Promise<{
  readonly issues: readonly string[];
  readonly warnings: readonly ParticipationRevenueCliff[];
  readonly changeClass: ParticipationChangeClass;
  readonly unbookedSessions: number;
  readonly bookedSessions: readonly {
    readonly id: string;
    readonly startsAt: string;
    readonly booked: number;
  }[];
}> {
  requireParticipationDatabase();
  const database = getDatabase();
  const item = await database.query.catalogItems.findFirst({
    where: and(
      eq(catalogItems.id, input.catalogItemId),
      eq(catalogItems.organizationId, input.organizationId),
    ),
  });
  if (!item) throw new ParticipationError("NOT_FOUND", "This offering was not found.");
  const capacity = Math.max(1, Number(item.configuration.capacity ?? 1) || 1);
  const creditPrice = await database.execute(sql`
    SELECT max(credit_amount) AS credits FROM catalog_prices
    WHERE catalog_item_id = ${item.id}::uuid AND payment_kind = 'credit' AND active = true
  `);
  const creditCost = Number(
    (creditPrice as unknown as { rows: { credits: number | null }[] }).rows[0]?.credits ?? NaN,
  );
  const validation = validateParticipationRuleV2(input.rules, {
    capacity,
    allowCredits: item.allowCredits,
    creditCost: Number.isFinite(creditCost) ? creditCost : undefined,
  });
  const occurrences = await database
    .select()
    .from(catalogSessionOccurrences)
    .where(
      and(
        eq(catalogSessionOccurrences.catalogItemId, item.id),
        eq(catalogSessionOccurrences.status, "scheduled"),
        gte(catalogSessionOccurrences.startsAt, input.now),
      ),
    )
    .orderBy(asc(catalogSessionOccurrences.startsAt))
    .limit(500);
  const live = await resolveCatalogItemRule({ item, capacity });
  const before = live.rule ?? inertBase(capacity);
  const after = validation.rule
    ? resolveParticipationRuleV2(validation.rule, {
        capacity,
        defaultLockMinutes: before.lockMinutesBeforeStart,
      })
    : undefined;
  let unbooked = 0;
  const booked: { id: string; startsAt: string; booked: number }[] = [];
  for (const occurrence of occurrences) {
    const places = await occurrencePlaces(occurrence.id, input.now);
    const decision = await loadDecision(occurrence.id);
    if (places.bookings.length === 0 && !decision?.outcome) {
      unbooked += 1;
    } else if (!decision?.outcome) {
      booked.push({
        id: occurrence.id,
        startsAt: occurrence.startsAt.toISOString(),
        booked: places.confirmed,
      });
    }
  }
  const changeClass = after ? classifyRuleChange(before, after).overall : "neutral";
  log.info("participation.rule.changePreviewed", {
    organizationId: input.organizationId,
    subjectId: item.id,
    changeClass,
    bookedSessionsAffected: booked.length,
  });
  return {
    issues: validation.issues,
    warnings: validation.warnings,
    changeClass,
    unbookedSessions: unbooked,
    bookedSessions: booked,
  };
}

/**
 * Applies the offering's CURRENT rule to sessions people already booked,
 * only where that loosens things for them (never tightens, principle 8).
 */
export async function applyParticipationRuleToBooked(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly catalogItemId: string;
  readonly occurrenceIds: readonly string[];
  readonly requestId: string;
  readonly now: Date;
}): Promise<{ readonly updated: number; readonly skipped: readonly string[] }> {
  requireParticipationDatabase();
  const database = getDatabase();
  const item = await database.query.catalogItems.findFirst({
    where: and(
      eq(catalogItems.id, input.catalogItemId),
      eq(catalogItems.organizationId, input.organizationId),
    ),
  });
  if (!item) throw new ParticipationError("NOT_FOUND", "This offering was not found.");
  let updated = 0;
  const skipped: string[] = [];
  for (const occurrenceId of input.occurrenceIds) {
    const occurrence = await database.query.catalogSessionOccurrences.findFirst({
      where: and(
        eq(catalogSessionOccurrences.id, occurrenceId),
        eq(catalogSessionOccurrences.catalogItemId, item.id),
      ),
    });
    const decision = occurrence ? await loadDecision(occurrence.id) : undefined;
    if (!occurrence || !decision || decision.outcome) {
      skipped.push(occurrenceId);
      continue;
    }
    const live = await resolveCatalogItemRule({ item, capacity: occurrence.capacity });
    const before = resolveParticipationRuleV2(
      readParticipationRuleV2(decision.ruleSnapshot)!,
      { capacity: occurrence.capacity },
    );
    const after = live.rule ?? inertBase(occurrence.capacity);
    if (classifyRuleChange(before, after).overall !== "loosens") {
      skipped.push(occurrenceId);
      continue;
    }
    const lockAt = participationLockAt({
      startsAt: occurrence.startsAt,
      lockMinutesBeforeStart: after.lockMinutesBeforeStart,
      openedAt: catalogOpenedAt({ occurrence, item, rule: after }),
    });
    const changed = await database
      .update(participationDecisions)
      .set({
        ruleSnapshot: serializeParticipationRule(after),
        snapshotAt: input.now,
        // A later lock never moves earlier than an extension already granted.
        lockAt:
          decision.lockAt > lockAt ? decision.lockAt : lockAt,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(participationDecisions.id, decision.id),
          isNull(participationDecisions.outcome),
        ),
      )
      .returning({ id: participationDecisions.id });
    updated += changed.length;
  }
  await audit({
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    action: "participation.rule_applied_to_booked",
    entityId: item.id,
    after: { updated, skipped },
    reason: `Looser group rule applied to ${updated} booked session${updated === 1 ? "" : "s"}.`,
    requestId: input.requestId,
    now: input.now,
  });
  return { updated, skipped };
}

// ---------------------------------------------------------------------------
// At risk this week
// ---------------------------------------------------------------------------

export interface ParticipationAtRiskSession {
  readonly subjectType: typeof CATALOG_SUBJECT;
  readonly subjectId: string;
  readonly catalogItemId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly timezone: string;
  readonly coachNames: readonly string[];
  readonly booked: number;
  readonly min: number;
  readonly capacity: number;
  readonly lockAt: string;
  readonly displayState: ParticipationState;
  readonly atStakeMinor?: number;
  readonly atStakeCredits?: number;
}

export async function participationAtRisk(input: {
  readonly organizationId: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly includeMoney: boolean;
  readonly now: Date;
}): Promise<{
  readonly sessions: readonly ParticipationAtRiskSession[];
  readonly totals: {
    readonly sessions: number;
    readonly booked: number;
    readonly atStakeMinor?: number;
    readonly atStakeCredits?: number;
    readonly currency: string;
  };
}> {
  requireParticipationDatabase();
  const database = getDatabase();
  const from = input.from ?? input.now;
  const to =
    input.to ?? new Date(input.now.getTime() + PARTICIPATION_AT_RISK_DAYS * 86_400_000);
  const organization = await database.query.organizations.findFirst({
    where: (table, { eq: equals }) => equals(table.id, input.organizationId),
  });
  const rows = await database
    .select({ occurrence: catalogSessionOccurrences, item: catalogItems })
    .from(catalogSessionOccurrences)
    .innerJoin(catalogItems, eq(catalogSessionOccurrences.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(catalogSessionOccurrences.organizationId, input.organizationId),
        eq(catalogSessionOccurrences.status, "scheduled"),
        isNull(catalogSessionOccurrences.participationOutcome),
        gte(catalogSessionOccurrences.startsAt, from),
        lte(catalogSessionOccurrences.startsAt, to),
      ),
    )
    .orderBy(asc(catalogSessionOccurrences.startsAt))
    .limit(300);
  const sessions: ParticipationAtRiskSession[] = [];
  const coachIds = new Set<string>();
  for (const { occurrence, item } of rows) {
    const picture = await catalogSessionPicture({ occurrence, item, now: input.now });
    if (!picture || picture.rule.minParticipants <= 1) continue;
    if (picture.state.displayState !== "needs-players") continue;
    // People or money at stake: an empty session is not "at risk" news.
    if (picture.confirmed === 0) continue;
    for (const coach of occurrence.coachPersonIds) coachIds.add(coach);
    const confirmed = picture.bookings.filter((booking) => booking.confirmed);
    sessions.push({
      subjectType: CATALOG_SUBJECT,
      subjectId: occurrence.id,
      catalogItemId: item.id,
      title: item.title,
      startsAt: occurrence.startsAt.toISOString(),
      timezone: occurrence.timezone,
      coachNames: occurrence.coachPersonIds,
      booked: picture.confirmed,
      min: picture.rule.minParticipants,
      capacity: occurrence.capacity,
      lockAt: picture.lockAt.toISOString(),
      displayState: "needs-players",
      ...(input.includeMoney
        ? {
            atStakeCredits: confirmed.reduce(
              (total, booking) => total + booking.reservedCredits,
              0,
            ),
            atStakeMinor: confirmed.reduce(
              (total, booking) => total + booking.order.totalMinor,
              0,
            ),
          }
        : {}),
    });
  }
  const names =
    coachIds.size === 0
      ? []
      : await database
          .select({ id: people.id, displayName: people.displayName })
          .from(people)
          .where(inArray(people.id, [...coachIds]));
  const nameById = new Map(names.map((row) => [row.id, row.displayName]));
  const withNames = sessions.map((session) => ({
    ...session,
    coachNames: session.coachNames.map((id) => nameById.get(id) ?? "Coach"),
  }));
  return {
    sessions: withNames,
    totals: {
      sessions: withNames.length,
      booked: withNames.reduce((total, session) => total + session.booked, 0),
      ...(input.includeMoney
        ? {
            atStakeMinor: withNames.reduce(
              (total, session) => total + (session.atStakeMinor ?? 0),
              0,
            ),
            atStakeCredits: withNames.reduce(
              (total, session) => total + (session.atStakeCredits ?? 0),
              0,
            ),
          }
        : {}),
      currency: organization?.currency ?? "USD",
    },
  };
}

// ---------------------------------------------------------------------------
// Interventions
// ---------------------------------------------------------------------------

async function openDecision(input: {
  readonly organizationId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly now: Date;
}) {
  assertCatalogSubject(input.subjectType);
  const { occurrence, item } = await loadSession(input.organizationId, input.subjectId);
  const decision = await ensureCatalogDecision({ occurrence, item, now: input.now });
  if (!decision) {
    throw new ParticipationError("NO_RULE", "This session has no group rule.");
  }
  if (decision.outcome) {
    throw new ParticipationError(
      "ALREADY_DECIDED",
      "The group for this session has already been decided.",
    );
  }
  return { occurrence, item, decision };
}

export async function extendParticipationLock(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly lockAt: Date;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{ readonly lockAt: string; readonly noticesQueued: number }> {
  requireParticipationDatabase();
  const { occurrence, decision } = await openDecision(input);
  const problem = validateLockExtension({
    currentLockAt: effectiveLockAt(decision),
    requestedLockAt: input.lockAt,
    startsAt: occurrence.startsAt,
    now: input.now,
  });
  if (problem) throw new ParticipationError("INVALID", problem);
  await getDatabase()
    .update(participationDecisions)
    .set({ lockOverrideAt: input.lockAt, updatedAt: input.now })
    .where(
      and(
        eq(participationDecisions.id, decision.id),
        isNull(participationDecisions.outcome),
      ),
    );
  const places = await occurrencePlaces(occurrence.id, input.now);
  const noticesQueued = await queueParticipationNotices(
    bookerNotices({
      organizationId: input.organizationId,
      occurrenceId: occurrence.id,
      bookings: places.bookings.filter((booking) => booking.confirmed),
      kind: "lock-extended",
      at: input.now,
    }),
  );
  await audit({
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    action: "participation.lock_extended",
    entityId: occurrence.id,
    after: { lockAt: input.lockAt.toISOString() },
    reason: "Decision time and free cancellation moved later.",
    requestId: input.requestId,
    now: input.now,
  });
  log.info("participation.intervention.recorded", {
    organizationId: input.organizationId,
    subjectId: occurrence.id,
    action: "extend",
  });
  return { lockAt: input.lockAt.toISOString(), noticesQueued };
}

export async function runParticipationAnyway(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{ readonly displayState: ParticipationState }> {
  requireParticipationDatabase();
  const { occurrence, item, decision } = await openDecision(input);
  await getDatabase()
    .update(participationDecisions)
    .set({ forcedOutcome: "run", updatedAt: input.now })
    .where(
      and(
        eq(participationDecisions.id, decision.id),
        isNull(participationDecisions.outcome),
      ),
    );
  await audit({
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    action: "participation.run_anyway",
    entityId: occurrence.id,
    after: { forcedOutcome: "run" },
    reason: "The club chose to run this session whatever the group size.",
    requestId: input.requestId,
    now: input.now,
  });
  log.info("participation.intervention.recorded", {
    organizationId: input.organizationId,
    subjectId: occurrence.id,
    action: "run",
  });
  const picture = await catalogSessionPicture({ occurrence, item, now: input.now });
  return { displayState: picture?.state.displayState ?? "needs-players" };
}

export const PARTICIPATION_CLUB_CANCEL_REASONS = [
  "coach",
  "weather",
  "venue",
  "other",
] as const;
export type ParticipationClubCancelReason =
  (typeof PARTICIPATION_CLUB_CANCEL_REASONS)[number];

const reasonWords: Record<ParticipationClubCancelReason | "merged", string> = {
  coach: "the coach is unavailable",
  weather: "the weather",
  venue: "the venue is unavailable",
  other: "the club cancelled it",
  merged: "it was merged into another session",
};

/**
 * A person at the club cancels a session (§6): every booking is released
 * and refunded in full (credits restored, card refunds submitted with the
 * Service Fee, reservations released). The session's status becomes
 * "cancelled", which the payments model reads: a cancelled session releases
 * nothing. Re-entrant: refunds already made are skipped.
 */
export async function cancelParticipationSession(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly reason: ParticipationClubCancelReason | "merged";
  readonly mergedIntoSubjectId?: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{ readonly cancellations: readonly ParticipationCancellationResult[] }> {
  requireParticipationDatabase();
  assertCatalogSubject(input.subjectType);
  const database = getDatabase();
  const { occurrence, item } = await loadSession(input.organizationId, input.subjectId);
  if (occurrence.endsAt <= input.now) {
    throw new ParticipationError(
      "NOT_ALLOWED",
      "This session has ended. Use a refund on each booking instead.",
    );
  }
  let decision = await ensureCatalogDecision({ occurrence, item, now: input.now });
  if (!decision) {
    // A session without a group rule still records who cancelled it.
    await database
      .insert(participationDecisions)
      .values({
        organizationId: input.organizationId,
        subjectType: CATALOG_SUBJECT,
        subjectId: occurrence.id,
        ruleSnapshot: serializeParticipationRule(inertBase(occurrence.capacity)),
        snapshotAt: input.now,
        lockAt: occurrence.startsAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing();
    decision = await loadDecision(occurrence.id);
  }
  if (!decision) throw new Error("The session decision could not be recorded.");
  if (decision.outcome === "cancel-under-minimum") {
    throw new ParticipationError(
      "ALREADY_DECIDED",
      "This session was already cancelled for missing its minimum.",
    );
  }
  const places = await occurrencePlaces(occurrence.id, input.now);
  if (decision.outcome !== "cancelled-by-club") {
    await database
      .update(participationDecisions)
      .set({
        outcome: "cancelled-by-club",
        cancelReason: input.reason,
        mergedIntoSubjectId: input.mergedIntoSubjectId ?? null,
        decidedAt: input.now,
        decidedGroupSize: places.confirmed,
        decidedByPersonId: input.actorPersonId,
        settledAt: null,
        settledGroupSize: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(participationDecisions.id, decision.id),
          or(
            isNull(participationDecisions.outcome),
            inArray(participationDecisions.outcome, ["minimum-met", "run-under-minimum"]),
          ),
        ),
      );
    await database
      .update(catalogSessionOccurrences)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(catalogSessionOccurrences.id, occurrence.id));
    await audit({
      organizationId: input.organizationId,
      actorPersonId: input.actorPersonId,
      action: "participation.session_cancelled_by_club",
      entityId: occurrence.id,
      after: { reason: input.reason, bookings: places.bookings.length },
      reason: `Session cancelled by the club: ${reasonWords[input.reason]}.`,
      requestId: input.requestId,
      now: input.now,
    });
    await queueParticipationNotices(
      bookerNotices({
        organizationId: input.organizationId,
        occurrenceId: occurrence.id,
        bookings: places.bookings,
        kind: input.reason === "merged" ? "moved" : "cancelled-club",
        at: input.now,
      }),
    );
  }
  const cancellations = await refundCancelledOccurrenceBookings({
    organizationId: input.organizationId,
    occurrenceId: occurrence.id,
    actorPersonId: input.actorPersonId,
    requestId: input.requestId,
    now: input.now,
    cancellationReason: input.reason === "merged" ? "merged" : "cancelled-by-club",
    refundReason: `Session cancelled by the club: ${reasonWords[input.reason]}.`,
  });
  const review = cancellations.filter(
    (entry) => entry.refundStatus === "review-required",
  );
  if (review.length > 0) {
    await queueParticipationNotices(
      review.map((entry) => ({
        organizationId: input.organizationId,
        subjectId: occurrence.id,
        recipientPersonId: input.actorPersonId,
        bookingId: entry.fulfillmentId,
        kind: "refund-attention" as const,
        scheduledFor: input.now,
      })),
    );
  }
  log.info("participation.cancelRefunds.completed", {
    organizationId: input.organizationId,
    subjectId: occurrence.id,
    reason: input.reason,
    bookings: cancellations.length,
    released: cancellations.filter((entry) => entry.refundStatus === "released").length,
    creditsRestored: cancellations.filter((entry) => entry.refundStatus === "credits-restored").length,
    refundsSubmitted: cancellations.filter((entry) => entry.refundStatus === "refund-submitted").length,
    reviewRequired: review.length,
  });
  log.info("participation.intervention.recorded", {
    organizationId: input.organizationId,
    subjectId: occurrence.id,
    action: "cancel",
  });
  return { cancellations };
}

/** A coach asks a director to cancel (§6: coaches request, directors confirm). */
export async function requestParticipationCancel(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly reason: ParticipationClubCancelReason;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{ readonly requestId: string }> {
  requireParticipationDatabase();
  assertCatalogSubject(input.subjectType);
  const { occurrence } = await loadSession(input.organizationId, input.subjectId);
  if (
    !occurrence.coachPersonIds.includes(input.actor.personId) &&
    !actorHasScope(input.actor, "sessions:write")
  ) {
    throw new ParticipationError(
      "FORBIDDEN",
      "Only the session's coach or the club can ask to cancel it.",
    );
  }
  const database = getDatabase();
  await database
    .insert(participationCancelRequests)
    .values({
      organizationId: input.organizationId,
      subjectType: CATALOG_SUBJECT,
      subjectId: occurrence.id,
      requestedByPersonId: input.actor.personId,
      reason: input.reason,
      createdAt: input.now,
    })
    .onConflictDoNothing();
  const open = await database.query.participationCancelRequests.findFirst({
    where: and(
      eq(participationCancelRequests.subjectType, CATALOG_SUBJECT),
      eq(participationCancelRequests.subjectId, occurrence.id),
      eq(participationCancelRequests.status, "open"),
    ),
  });
  if (!open) throw new Error("The request could not be recorded.");
  await audit({
    organizationId: input.organizationId,
    actorPersonId: input.actor.personId,
    action: "participation.cancel_requested",
    entityId: occurrence.id,
    after: { reason: input.reason, requestId: open.id },
    reason: "A coach asked the club to cancel this session.",
    requestId: input.requestId,
    now: input.now,
  });
  return { requestId: open.id };
}

/** Open cancel requests for directors (Today / Pro). */
export async function listParticipationCancelRequests(organizationId: string) {
  requireParticipationDatabase();
  return getDatabase()
    .select()
    .from(participationCancelRequests)
    .where(
      and(
        eq(participationCancelRequests.organizationId, organizationId),
        eq(participationCancelRequests.status, "open"),
      ),
    )
    .orderBy(asc(participationCancelRequests.createdAt))
    .limit(100);
}

function rowKey(idempotencyKey: string, bookingId: string): string {
  const hex = createHash("sha256").update(`${idempotencyKey}:${bookingId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Attendance, separate from settlement (§6): the assigned coach (with
 * `sessions:read`) or staff with `sessions:write` mark it from the start
 * until 24 hours after the end. It never changes a price (decision 2).
 * Offline marks keep the device time; the later mark for a booking wins.
 */
export async function recordParticipationAttendance(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly marks: readonly {
    readonly bookingId: string;
    readonly status: "attended" | "absent";
    readonly deviceMarkedAt?: Date;
  }[];
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{
  readonly recorded: number;
  readonly ignored: readonly { readonly bookingId: string; readonly reason: string }[];
}> {
  requireParticipationDatabase();
  assertCatalogSubject(input.subjectType);
  const database = getDatabase();
  const { occurrence } = await loadSession(input.organizationId, input.subjectId);
  if (
    !actorHasScope(input.actor, "sessions:write") &&
    !occurrence.coachPersonIds.includes(input.actor.personId)
  ) {
    throw new ParticipationError(
      "FORBIDDEN",
      "Only the session's coach or staff who manage sessions can mark attendance.",
    );
  }
  if (input.now < occurrence.startsAt) {
    throw new ParticipationError("NOT_ALLOWED", "Attendance opens when the session starts.");
  }
  const closesAt = new Date(
    occurrence.endsAt.getTime() + PARTICIPATION_ATTENDANCE_WINDOW_MINUTES * 60_000,
  );
  if (input.now > closesAt) {
    throw new ParticipationError("NOT_ALLOWED", "Attendance for this session has closed.");
  }
  const bookings = await database
    .select()
    .from(catalogFulfillments)
    .where(
      and(
        eq(catalogFulfillments.catalogSessionOccurrenceId, occurrence.id),
        inArray(catalogFulfillments.id, input.marks.map((mark) => mark.bookingId)),
      ),
    );
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  const ignored: { bookingId: string; reason: string }[] = [];
  let recorded = 0;
  for (const mark of input.marks) {
    const booking = byId.get(mark.bookingId);
    if (!booking) {
      ignored.push({ bookingId: mark.bookingId, reason: "not-in-session" });
      continue;
    }
    if (!(ACTIVE_CATALOG_BOOKING_STATUSES as readonly string[]).includes(booking.status)) {
      ignored.push({ bookingId: mark.bookingId, reason: "cancelled" });
      continue;
    }
    const markedAt = mark.deviceMarkedAt ?? input.now;
    const existing = await database.query.participationAttendance.findFirst({
      where: eq(participationAttendance.bookingId, booking.id),
    });
    const existingAt = existing ? existing.deviceMarkedAt ?? existing.markedAt : undefined;
    if (existing && existingAt && existingAt > markedAt) {
      ignored.push({ bookingId: mark.bookingId, reason: "newer-mark-exists" });
      continue;
    }
    const key = rowKey(input.idempotencyKey, booking.id);
    if (existing?.idempotencyKey === key) {
      recorded += 1;
      continue;
    }
    await database
      .insert(participationAttendance)
      .values({
        bookingId: booking.id,
        organizationId: input.organizationId,
        subjectType: CATALOG_SUBJECT,
        subjectId: occurrence.id,
        status: mark.status,
        markedByPersonId: input.actor.personId,
        markedAt: input.now,
        deviceMarkedAt: mark.deviceMarkedAt ?? null,
        idempotencyKey: key,
      })
      .onConflictDoUpdate({
        target: participationAttendance.bookingId,
        set: {
          status: mark.status,
          markedByPersonId: input.actor.personId,
          markedAt: input.now,
          deviceMarkedAt: mark.deviceMarkedAt ?? null,
          idempotencyKey: key,
        },
      });
    // Compatibility: 289 readers look at the booking's details.
    await database
      .update(catalogFulfillments)
      .set({
        status: mark.status === "attended" ? "fulfilled" : booking.status,
        fulfilledAt:
          mark.status === "attended" ? (booking.fulfilledAt ?? input.now) : booking.fulfilledAt,
        details: {
          ...booking.details,
          attendance: mark.status === "attended" ? "attended" : "no-show",
          attendanceRecordedAt: input.now.toISOString(),
        },
        updatedAt: input.now,
      })
      .where(eq(catalogFulfillments.id, booking.id));
    recorded += 1;
  }
  await audit({
    organizationId: input.organizationId,
    actorPersonId: input.actor.personId,
    action: "participation.attendance_recorded",
    entityId: occurrence.id,
    after: { recorded, ignored: ignored.length },
    reason: "Attendance recorded.",
    requestId: input.requestId,
    now: input.now,
  });
  log.info("participation.attendance.recorded", {
    organizationId: input.organizationId,
    subjectId: occurrence.id,
    marked: recorded,
    absent: input.marks.filter((mark) => mark.status === "absent").length,
    offlineQueued: input.marks.some((mark) => mark.deviceMarkedAt !== undefined),
    delaySeconds: Math.max(
      0,
      ...input.marks.map((mark) =>
        mark.deviceMarkedAt
          ? Math.round((input.now.getTime() - mark.deviceMarkedAt.getTime()) / 1000)
          : 0,
      ),
    ),
  });
  return { recorded, ignored };
}

/** Decide one session now (an operator; the schedule calls the same engine). */
export async function decideParticipationNow(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly subjectId: string;
  readonly requestId: string;
  readonly now: Date;
}) {
  return evaluateCatalogSessionParticipation({
    occurrenceId: input.subjectId,
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    requestId: input.requestId,
    now: input.now,
  });
}
