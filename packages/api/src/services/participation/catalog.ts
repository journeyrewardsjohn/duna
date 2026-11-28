/**
 * The catalog-session adapter for the participation engine: which rule a
 * session runs under (own, club default, none), the snapshot taken at the
 * first booking, the lock, and how many places are taken. Every reader and
 * writer of catalog group sessions goes through here, so capacity and the
 * minimum always count the same bookings (participation.md §15).
 */
import {
  catalogFulfillments,
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  orders,
  organizationParticipationDefaults,
  organizationRefundPolicies,
  participationDecisions,
  participationNotices,
  participationWaitlistEntries,
} from "@duna/db";
import {
  creditTiersFromPriceTiers,
  participationLockAt,
  participationRuleIsInert,
  readParticipationRuleV2,
  resolveParticipationRuleV2,
  resolveParticipationRules,
  serializeParticipationRule,
  type ParticipationNoticeKind,
  type ParticipationRuleSource,
  type ResolvedParticipationRule,
} from "@duna/core";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  occurrenceParticipationState,
  type OccurrenceParticipationState,
} from "../../catalog-participation-rules";

export const CATALOG_SUBJECT = "catalog-session-occurrence" as const;

/** Bookings in these states hold a place in the session. */
export const ACTIVE_BOOKING_STATUSES = [
  "held",
  "pending",
  "ready",
  "fulfilled",
] as const;

export class ParticipationError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "NOT_FOUND"
      | "NO_RULE"
      | "INVALID"
      | "ALREADY_DECIDED"
      | "NOT_ALLOWED"
      | "FORBIDDEN"
      | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ParticipationError";
  }
}

export function requireParticipationDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new ParticipationError(
      "DATABASE_REQUIRED",
      "Group rules need Duna Database connected.",
    );
  }
}

type Item = typeof catalogItems.$inferSelect;
type Occurrence = typeof catalogSessionOccurrences.$inferSelect;
export type ParticipationDecisionRow =
  typeof participationDecisions.$inferSelect;

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export interface ClubParticipationDefault {
  readonly rules?: Record<string, unknown>;
  readonly appliesTo: readonly string[];
  readonly updatedAt?: Date;
}

export async function loadClubParticipationDefault(
  organizationId: string,
): Promise<ClubParticipationDefault> {
  const row =
    await getDatabase().query.organizationParticipationDefaults.findFirst({
      where: eq(
        organizationParticipationDefaults.organizationId,
        organizationId,
      ),
    });
  return row
    ? { rules: row.rules, appliesTo: row.appliesTo, updatedAt: row.updatedAt }
    : { appliesTo: ["service"] };
}

/** The club's free-cancellation window (decision 1 fallback for the lock). */
export async function clubRefundWindowMinutes(
  organizationId: string,
): Promise<number | undefined> {
  const policy = await getDatabase().query.organizationRefundPolicies.findFirst(
    {
      where: and(
        eq(organizationRefundPolicies.organizationId, organizationId),
        eq(organizationRefundPolicies.isDefault, true),
        eq(organizationRefundPolicies.active, true),
      ),
    },
  );
  if (!policy || policy.mode === "non-refundable") return undefined;
  return policy.refundBeforeMinutes ?? undefined;
}

/** A scheduled service with preset dates can carry a group rule. */
export function catalogItemTakesGroupRules(
  item: Pick<Item, "type" | "configuration">,
): boolean {
  const schedule = record(item.configuration.sessionSchedule);
  return (
    item.type === "service" &&
    (schedule?.mode === "one-off" || schedule?.mode === "recurring")
  );
}

/** The live rule an offering would give a session now (before any snapshot). */
export async function resolveCatalogItemRule(input: {
  readonly item: Pick<Item, "type" | "configuration" | "organizationId">;
  readonly capacity: number;
  readonly clubDefault?: ClubParticipationDefault;
  readonly refundWindowMinutes?: number;
}): Promise<{
  readonly rule?: ResolvedParticipationRule;
  readonly source: ParticipationRuleSource;
}> {
  if (!catalogItemTakesGroupRules(input.item)) {
    // A legacy offering with its own rule keeps it even without preset dates.
    const own = readParticipationRuleV2(input.item.configuration.participation);
    return own
      ? {
          rule: resolveParticipationRuleV2(own, { capacity: input.capacity }),
          source: "own",
        }
      : { source: "none" };
  }
  const clubDefault =
    input.clubDefault ??
    (await loadClubParticipationDefault(input.item.organizationId));
  const resolved = resolveParticipationRules({
    own: input.item.configuration.participation,
    clubDefault: clubDefault.rules,
    clubDefaultAppliesTo: clubDefault.appliesTo,
    kind: "service",
    capacity: input.capacity,
    refundWindowMinutes:
      input.refundWindowMinutes ??
      (await clubRefundWindowMinutes(input.item.organizationId)),
  });
  // An inert inherited rule changes nothing; treat it as none.
  if (
    resolved.rule &&
    resolved.source === "club-default" &&
    participationRuleIsInert(resolved.rule)
  ) {
    return { source: "none" };
  }
  return resolved;
}

/** When the session could first be booked under its rule (see participationLockAt). */
export function catalogOpenedAt(input: {
  readonly occurrence: Pick<Occurrence, "createdAt">;
  readonly item: Pick<Item, "publishedAt" | "configuration">;
  readonly rule?: Pick<ResolvedParticipationRule, "effectiveFrom">;
}): Date {
  const effective = input.rule?.effectiveFrom
    ? new Date(input.rule.effectiveFrom)
    : undefined;
  return new Date(
    Math.max(
      input.occurrence.createdAt.getTime(),
      input.item.publishedAt?.getTime() ?? 0,
      effective && !Number.isNaN(effective.getTime()) ? effective.getTime() : 0,
    ),
  );
}

/** The rule stored in a decision row, with the session's real capacity. */
export function decisionRule(
  decision: Pick<ParticipationDecisionRow, "ruleSnapshot">,
  capacity: number,
): ResolvedParticipationRule {
  const rule = readParticipationRuleV2(decision.ruleSnapshot) ?? {
    version: 2 as const,
    unit: "player" as const,
    minParticipants: 1,
    minimumPolicy: "run" as const,
    waitlist: false,
    tiers: [],
  };
  return resolveParticipationRuleV2(rule, { capacity });
}

export function effectiveLockAt(
  decision: Pick<ParticipationDecisionRow, "lockAt" | "lockOverrideAt">,
): Date {
  return decision.lockOverrideAt ?? decision.lockAt;
}

export async function loadDecision(
  subjectId: string,
  subjectType: string = CATALOG_SUBJECT,
): Promise<ParticipationDecisionRow | undefined> {
  return getDatabase().query.participationDecisions.findFirst({
    where: and(
      eq(participationDecisions.subjectType, subjectType),
      eq(participationDecisions.subjectId, subjectId),
    ),
  });
}

export interface OccurrencePlaceBooking {
  readonly fulfillment: typeof catalogFulfillments.$inferSelect;
  readonly order: typeof orders.$inferSelect;
  readonly quantity: number;
  readonly paymentMethod?: string;
  /** Paid, or an unexpired pay-in-person reservation: counts for the minimum. */
  readonly confirmed: boolean;
  readonly reservedCredits: number;
  /** Who hears about this booking: the guardian or payer who booked it. */
  readonly bookerPersonId: string;
}

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Every active booking of a session. ONE count for both questions: places
 * taken (`confirmed + held`, for capacity) and the group (`confirmed`, for
 * the minimum and the price).
 */
export async function occurrencePlaces(
  occurrenceId: string,
  now: Date,
): Promise<{
  readonly confirmed: number;
  readonly held: number;
  readonly bookings: readonly OccurrencePlaceBooking[];
}> {
  const rows = await getDatabase()
    .select({ fulfillment: catalogFulfillments, order: orders })
    .from(catalogFulfillments)
    .innerJoin(orders, eq(catalogFulfillments.orderId, orders.id))
    .where(
      and(
        eq(catalogFulfillments.catalogSessionOccurrenceId, occurrenceId),
        inArray(catalogFulfillments.status, [...ACTIVE_BOOKING_STATUSES]),
      ),
    )
    .orderBy(asc(catalogFulfillments.createdAt), asc(catalogFulfillments.id));
  const bookings = rows.map(({ fulfillment, order }) => {
    const paymentMethod =
      typeof fulfillment.details.paymentMethod === "string"
        ? fulfillment.details.paymentMethod
        : undefined;
    const paid =
      order.status === "paid" || order.status === "partially-refunded";
    const cashReservation =
      paymentMethod === "cash" &&
      order.status === "pending" &&
      (!order.expiresAt || order.expiresAt > now);
    const credits = Number(fulfillment.details.creditsApplied ?? 0);
    return {
      fulfillment,
      order,
      quantity: positive(fulfillment.details.quantity, 1),
      paymentMethod,
      confirmed: paid || cashReservation,
      reservedCredits:
        Number.isSafeInteger(credits) && credits > 0 ? credits : 0,
      bookerPersonId:
        typeof fulfillment.details.bookedByPersonId === "string"
          ? fulfillment.details.bookedByPersonId
          : order.buyerPersonId,
    };
  });
  const confirmed = bookings
    .filter((booking) => booking.confirmed)
    .reduce((total, booking) => total + booking.quantity, 0);
  const held = bookings
    .filter(
      (booking) =>
        !booking.confirmed &&
        (!booking.order.expiresAt || booking.order.expiresAt > now),
    )
    .reduce((total, booking) => total + booking.quantity, 0);
  return { confirmed, held, bookings };
}

/**
 * The decision row for a catalog session, created at the first booking with
 * the rule as it stands then (the snapshot). Editing the offering later
 * never changes a session people already booked (§4.3). A session nobody
 * holds a place in takes the offering's current rule again.
 */
export async function ensureCatalogDecision(input: {
  readonly occurrence: Occurrence;
  readonly item: Item;
  readonly now: Date;
}): Promise<ParticipationDecisionRow | undefined> {
  const database = getDatabase();
  const existing = await loadDecision(input.occurrence.id);
  const refreshable =
    existing !== undefined &&
    !existing.outcome &&
    !existing.lockOverrideAt &&
    !existing.forcedOutcome &&
    (await occurrencePlaces(input.occurrence.id, input.now)).bookings.length ===
      0;
  if (existing && !refreshable) {
    return syncFromOccurrence(existing, input.occurrence);
  }
  const { rule } = await resolveCatalogItemRule({
    item: input.item,
    capacity: input.occurrence.capacity,
  });
  if (!rule) return refreshable ? undefined : existing;
  const lockAt = participationLockAt({
    startsAt: input.occurrence.startsAt,
    lockMinutesBeforeStart: rule.lockMinutesBeforeStart,
    openedAt: catalogOpenedAt({
      occurrence: input.occurrence,
      item: input.item,
      rule,
    }),
  });
  const snapshot = serializeParticipationRule({
    ...rule,
    lockMinutesBeforeStart: rule.lockMinutesBeforeStart,
  });
  if (existing) {
    await database
      .update(participationDecisions)
      .set({
        ruleSnapshot: snapshot,
        snapshotAt: input.now,
        lockAt,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(participationDecisions.id, existing.id),
          isNull(participationDecisions.outcome),
        ),
      );
  } else {
    await database
      .insert(participationDecisions)
      .values({
        organizationId: input.occurrence.organizationId,
        subjectType: CATALOG_SUBJECT,
        subjectId: input.occurrence.id,
        ruleSnapshot: snapshot,
        snapshotAt: input.now,
        lockAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing();
  }
  const row = await loadDecision(input.occurrence.id);
  return row ? syncFromOccurrence(row, input.occurrence) : undefined;
}

/** A 289 decision recorded only on the occurrence is copied over once. */
async function syncFromOccurrence(
  decision: ParticipationDecisionRow,
  occurrence: Occurrence,
): Promise<ParticipationDecisionRow> {
  if (
    decision.outcome ||
    !occurrence.participationOutcome ||
    !occurrence.participationDecidedAt
  ) {
    return decision;
  }
  await getDatabase()
    .update(participationDecisions)
    .set({
      outcome: occurrence.participationOutcome,
      decidedAt: occurrence.participationDecidedAt,
      decidedGroupSize: occurrence.decidedHeadcount ?? 0,
      cancelReason:
        occurrence.participationOutcome === "cancel-under-minimum"
          ? "minimum-not-met"
          : null,
      settledAt: occurrence.participationSettledAt,
      settledGroupSize: occurrence.settledHeadcount,
      updatedAt: occurrence.participationDecidedAt,
    })
    .where(
      and(
        eq(participationDecisions.id, decision.id),
        isNull(participationDecisions.outcome),
      ),
    );
  return (
    (await loadDecision(decision.subjectId, decision.subjectType)) ?? decision
  );
}

export interface ParticipationNoticeIntent {
  /** Null only for a player-hosted pickup with no club. */
  readonly organizationId: string | null;
  readonly subjectType?: string;
  readonly subjectId: string;
  readonly recipientPersonId: string;
  readonly bookingId?: string | null;
  readonly kind: ParticipationNoticeKind;
  readonly scheduledFor: Date;
}

/**
 * Writes notice rows (the outbox). Sending is PART-5's. Each person hears
 * about each moment once: the unique key makes a repeat a no-op.
 */
export async function queueParticipationNotices(
  intents: readonly ParticipationNoticeIntent[],
): Promise<number> {
  if (intents.length === 0) return 0;
  const inserted = await getDatabase()
    .insert(participationNotices)
    .values(
      intents.map((intent) => ({
        organizationId: intent.organizationId,
        subjectType: intent.subjectType ?? CATALOG_SUBJECT,
        subjectId: intent.subjectId,
        recipientPersonId: intent.recipientPersonId,
        bookingId: intent.bookingId ?? null,
        kind: intent.kind,
        scheduledFor: intent.scheduledFor,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: participationNotices.id });
  return inserted.length;
}

/** One notice per booking to the person who booked it. */
export function bookerNotices(input: {
  readonly organizationId: string;
  readonly occurrenceId: string;
  readonly bookings: readonly Pick<
    OccurrencePlaceBooking,
    "fulfillment" | "bookerPersonId"
  >[];
  readonly kind: ParticipationNoticeKind;
  readonly at: Date;
}): ParticipationNoticeIntent[] {
  return input.bookings.map((booking) => ({
    organizationId: input.organizationId,
    subjectId: input.occurrenceId,
    recipientPersonId: booking.bookerPersonId,
    bookingId: booking.fulfillment.id,
    kind: input.kind,
    scheduledFor: input.at,
  }));
}

/**
 * The participation picture of one catalog session for any reader: the rule
 * (snapshot, or the live rule before anyone booked), the decision, places
 * and the 289 state shape every existing contract carries.
 */
export async function catalogSessionPicture(input: {
  readonly occurrence: Occurrence;
  readonly item: Item;
  readonly now: Date;
}): Promise<
  | {
      readonly rule: ResolvedParticipationRule;
      readonly source: ParticipationRuleSource | "snapshot";
      readonly decision?: ParticipationDecisionRow;
      readonly lockAt: Date;
      readonly confirmed: number;
      readonly held: number;
      readonly bookings: readonly OccurrencePlaceBooking[];
      readonly waitlistCount: number;
      readonly state: OccurrenceParticipationState;
    }
  | undefined
> {
  const decision = await loadDecision(input.occurrence.id);
  let rule: ResolvedParticipationRule | undefined;
  let source: ParticipationRuleSource | "snapshot" = "snapshot";
  if (decision) {
    rule = decisionRule(decision, input.occurrence.capacity);
  } else {
    const live = await resolveCatalogItemRule({
      item: input.item,
      capacity: input.occurrence.capacity,
    });
    rule = live.rule;
    source = live.source;
  }
  if (!rule) return undefined;
  const lockAt = decision
    ? effectiveLockAt(decision)
    : participationLockAt({
        startsAt: input.occurrence.startsAt,
        lockMinutesBeforeStart: rule.lockMinutesBeforeStart,
        openedAt: catalogOpenedAt({
          occurrence: input.occurrence,
          item: input.item,
          rule,
        }),
      });
  const places = await occurrencePlaces(input.occurrence.id, input.now);
  const waitlistCount = await countWaiting(input.occurrence.id);
  const state = occurrenceParticipationState({
    rules: {
      minParticipants: rule.minParticipants,
      maxParticipants: input.occurrence.capacity,
      minimumPolicy: rule.minimumPolicy,
      cutoffMinutesBeforeStart: rule.lockMinutesBeforeStart,
      settlementBasis: rule.legacySettlementBasis ?? "cutoff",
      creditTiers: creditTiersFromPriceTiers(rule.tiers),
    },
    occurrence: input.occurrence,
    bookedCount: places.confirmed,
    heldCount: places.held,
    lockAt,
    waitlistCount,
    decisionOutcome: decision?.outcome,
    now: input.now,
  });
  return {
    rule,
    source,
    decision,
    lockAt,
    confirmed: places.confirmed,
    held: places.held,
    bookings: places.bookings,
    waitlistCount,
    state,
  };
}

/** People waiting for a place (PART-4 fills the waitlist). */
export async function countWaiting(subjectId: string): Promise<number> {
  const rows = await getDatabase()
    .select({ quantity: participationWaitlistEntries.quantity })
    .from(participationWaitlistEntries)
    .where(
      and(
        eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
        eq(participationWaitlistEntries.subjectId, subjectId),
        inArray(participationWaitlistEntries.status, ["waiting", "offered"]),
      ),
    );
  return rows.reduce((total, row) => total + row.quantity, 0);
}
