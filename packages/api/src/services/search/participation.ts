/**
 * Group state for many catalog sessions at once (B10): the same display
 * model `player.participation.quote` builds for one session, for a whole
 * page of search results in a fixed number of queries (no query per
 * result). Words come from `@duna/core` (`participationDisplay` +
 * `renderParticipationDisplay`); nothing here writes copy.
 *
 * Counting follows services/participation/catalog.ts exactly (places held
 * by paid or unexpired pay-in-person bookings count for the minimum; unpaid
 * checkouts count for capacity only). participation.integration.test.ts in
 * this folder proves the numbers equal `occurrencePlaces` and the display
 * equals the quote's.
 */
import {
  catalogFulfillments,
  catalogItems,
  catalogSessionOccurrences,
  getReadOnlyDatabase,
  orders,
  organizationParticipationDefaults,
  organizationRefundPolicies,
  participationDecisions,
  participationWaitlistEntries,
} from "@duna/db";
import {
  participationDisplay,
  participationLockAt,
  participationRuleIsInert,
  readParticipationRuleV2,
  renderParticipationDisplay,
  resolveParticipationRuleV2,
  resolveParticipationRules,
  type ParticipationDecisionOutcome,
  type ParticipationDisplay,
  type ResolvedParticipationRule,
} from "@duna/core";
import { and, eq, inArray } from "drizzle-orm";
import {
  ACTIVE_BOOKING_STATUSES,
  CATALOG_SUBJECT,
  catalogItemTakesGroupRules,
  catalogOpenedAt,
  decisionRule,
  effectiveLockAt,
} from "../participation/catalog";

type Occurrence = typeof catalogSessionOccurrences.$inferSelect;
type Item = typeof catalogItems.$inferSelect;

export interface SessionParticipationSubject {
  readonly occurrence: Pick<
    Occurrence,
    | "id"
    | "capacity"
    | "startsAt"
    | "endsAt"
    | "timezone"
    | "status"
    | "createdAt"
  >;
  readonly item: Pick<
    Item,
    "type" | "configuration" | "organizationId" | "publishedAt" | "title"
  >;
  readonly clubName: string;
}

export interface SessionParticipation {
  readonly display: ParticipationDisplay;
  readonly copy: ReturnType<typeof renderParticipationDisplay>;
  readonly rule?: ResolvedParticipationRule;
  readonly confirmed: number;
  readonly held: number;
  readonly waiting: number;
  /** The session's rule keeps a waitlist when it is full. */
  readonly waitlist: boolean;
}

export type SearchDatabase = ReturnType<typeof getReadOnlyDatabase>;

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** `resolveCatalogItemRule` with the club's default and refund window given. */
export function resolveRuleWithClubFacts(input: {
  readonly item: Pick<Item, "type" | "configuration">;
  readonly capacity: number;
  readonly clubDefault?: {
    readonly rules?: Record<string, unknown>;
    readonly appliesTo: readonly string[];
  };
  readonly refundWindowMinutes?: number;
}): ResolvedParticipationRule | undefined {
  if (!catalogItemTakesGroupRules(input.item)) {
    const own = readParticipationRuleV2(input.item.configuration.participation);
    return own
      ? resolveParticipationRuleV2(own, { capacity: input.capacity })
      : undefined;
  }
  const resolved = resolveParticipationRules({
    own: input.item.configuration.participation,
    clubDefault: input.clubDefault?.rules,
    clubDefaultAppliesTo: input.clubDefault?.appliesTo ?? ["service"],
    kind: "service",
    capacity: input.capacity,
    refundWindowMinutes: input.refundWindowMinutes,
  });
  if (
    resolved.rule &&
    resolved.source === "club-default" &&
    participationRuleIsInert(resolved.rule)
  ) {
    return undefined;
  }
  return resolved.rule;
}

/**
 * The display model for each session, in five queries whatever the number
 * of sessions (decisions, places, waitlists, club defaults, refund windows).
 */
export async function loadSessionParticipation(input: {
  readonly database: SearchDatabase;
  readonly subjects: readonly SessionParticipationSubject[];
  readonly now: Date;
  readonly viewerTimeZone?: string;
}): Promise<ReadonlyMap<string, SessionParticipation>> {
  const result = new Map<string, SessionParticipation>();
  if (input.subjects.length === 0) return result;
  const ids = [...new Set(input.subjects.map((s) => s.occurrence.id))];
  const organizationIds = [
    ...new Set(input.subjects.map((s) => s.item.organizationId)),
  ];
  const database = input.database;
  const [decisionRows, placeRows, waitingRows, defaultRows, policyRows] =
    await Promise.all([
      database
        .select()
        .from(participationDecisions)
        .where(
          and(
            eq(participationDecisions.subjectType, CATALOG_SUBJECT),
            inArray(participationDecisions.subjectId, ids),
          ),
        ),
      database
        .select({
          occurrenceId: catalogFulfillments.catalogSessionOccurrenceId,
          details: catalogFulfillments.details,
          orderStatus: orders.status,
          orderExpiresAt: orders.expiresAt,
        })
        .from(catalogFulfillments)
        .innerJoin(orders, eq(catalogFulfillments.orderId, orders.id))
        .where(
          and(
            inArray(catalogFulfillments.catalogSessionOccurrenceId, ids),
            inArray(catalogFulfillments.status, [...ACTIVE_BOOKING_STATUSES]),
          ),
        ),
      database
        .select({
          subjectId: participationWaitlistEntries.subjectId,
          quantity: participationWaitlistEntries.quantity,
        })
        .from(participationWaitlistEntries)
        .where(
          and(
            eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
            inArray(participationWaitlistEntries.subjectId, ids),
            inArray(participationWaitlistEntries.status, [
              "waiting",
              "offered",
            ]),
          ),
        ),
      database
        .select()
        .from(organizationParticipationDefaults)
        .where(
          inArray(
            organizationParticipationDefaults.organizationId,
            organizationIds,
          ),
        ),
      database
        .select()
        .from(organizationRefundPolicies)
        .where(
          and(
            inArray(organizationRefundPolicies.organizationId, organizationIds),
            eq(organizationRefundPolicies.isDefault, true),
            eq(organizationRefundPolicies.active, true),
          ),
        ),
    ]);

  const decisions = new Map(decisionRows.map((row) => [row.subjectId, row]));
  const places = new Map<string, { confirmed: number; held: number }>();
  for (const row of placeRows) {
    if (!row.occurrenceId) continue;
    const current = places.get(row.occurrenceId) ?? { confirmed: 0, held: 0 };
    const quantity = positive(row.details.quantity, 1);
    const paymentMethod =
      typeof row.details.paymentMethod === "string"
        ? row.details.paymentMethod
        : undefined;
    const paid =
      row.orderStatus === "paid" || row.orderStatus === "partially-refunded";
    const unexpired = !row.orderExpiresAt || row.orderExpiresAt > input.now;
    const cashReservation =
      paymentMethod === "cash" && row.orderStatus === "pending" && unexpired;
    if (paid || cashReservation) current.confirmed += quantity;
    else if (unexpired) current.held += quantity;
    places.set(row.occurrenceId, current);
  }
  const waiting = new Map<string, number>();
  for (const row of waitingRows) {
    waiting.set(
      row.subjectId,
      (waiting.get(row.subjectId) ?? 0) + row.quantity,
    );
  }
  const defaults = new Map(defaultRows.map((row) => [row.organizationId, row]));
  const refundWindows = new Map(
    policyRows
      .filter((row) => row.mode !== "non-refundable")
      .map((row) => [row.organizationId, row.refundBeforeMinutes ?? undefined]),
  );

  for (const subject of input.subjects) {
    const { occurrence, item } = subject;
    const decision = decisions.get(occurrence.id);
    const clubDefault = defaults.get(item.organizationId);
    const rule = decision
      ? decisionRule(decision, occurrence.capacity)
      : resolveRuleWithClubFacts({
          item,
          capacity: occurrence.capacity,
          clubDefault: clubDefault
            ? { rules: clubDefault.rules, appliesTo: clubDefault.appliesTo }
            : { appliesTo: ["service"] },
          refundWindowMinutes: refundWindows.get(item.organizationId),
        });
    const lockAt = !rule
      ? undefined
      : decision
        ? effectiveLockAt(decision)
        : participationLockAt({
            startsAt: occurrence.startsAt,
            lockMinutesBeforeStart: rule.lockMinutesBeforeStart,
            openedAt: catalogOpenedAt({ occurrence, item, rule }),
          });
    const counted = places.get(occurrence.id) ?? { confirmed: 0, held: 0 };
    const waitingCount = waiting.get(occurrence.id) ?? 0;
    const display = participationDisplay({
      rule,
      title: item.title,
      capacity: occurrence.capacity,
      booked: counted.confirmed,
      held: counted.held,
      waiting: waitingCount,
      outcome:
        (decision?.outcome as
          ParticipationDecisionOutcome | null | undefined) ??
        (occurrence.status === "cancelled" ? "cancelled-by-club" : undefined),
      decidedGroupSize: decision?.decidedGroupSize,
      lockAt,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      now: input.now,
      timeZone: occurrence.timezone,
      viewerTimeZone: input.viewerTimeZone,
      clubName: subject.clubName,
      payment: { method: "credit" },
      viewer: { booked: false, quantity: 1 },
    });
    result.set(occurrence.id, {
      display,
      copy: renderParticipationDisplay(display),
      ...(rule ? { rule } : {}),
      confirmed: counted.confirmed,
      held: counted.held,
      waiting: waitingCount,
      waitlist: Boolean(rule?.waitlist),
    });
  }
  return result;
}
