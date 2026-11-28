/**
 * Obligations: what Duna owes an organisation for each sold line, created
 * from the per-charge fund schedule (`payment_fund_schedules`). One
 * obligation per order line per payment; idempotent (advisory lock + an
 * existence check, plus the unique order-item index for single-payment
 * orders), so a webhook replay or a second cron run creates nothing new.
 *
 * The delivery facts a sale needs later (its session schedule, the source
 * the release job checks, credits granted, the start-tranche share and the
 * credit release mode) are fixed at sale time in
 * `refund_policy_snapshot.delivery`, so a later settings change never
 * reshapes money already sold.
 */
import {
  catalogFulfillments,
  catalogItems,
  catalogSessionLinks,
  catalogSessionOccurrences,
  catalogVariants,
  courtBookings,
  disputes,
  getDatabase,
  getTransactionalDatabase,
  orderItems,
  orders,
  organizationCreditGrants,
  organizationPayAccounts,
  payDeliveryEvents,
  payObligations,
  paymentFundSchedules,
  payments,
  participationDecisions,
  payouts,
  refundRecords,
  registrations,
  sessions,
  ticketTypes,
  tickets,
} from "@duna/db";
import {
  membershipSubscriptionPolicy,
  readParticipationRules,
} from "@duna/core";
import { log } from "@duna/observability";
import { and, asc, count, eq, gte, inArray, sql, sum } from "drizzle-orm";
import {
  deliveryRuleFor,
  productKindFor,
  type SoldLine,
} from "./delivery-rules";
import type { PayPolicySettings } from "./policy-settings";
import { splitEvenly, type PayDeliveryRule } from "./release-rules";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where the release job checks whether a portion was delivered or cancelled. */
export interface DeliverySource {
  readonly type:
    | "court_booking"
    | "session"
    | "catalog_occurrence"
    | "catalog_fulfillment"
    | "credit_grant"
    | "payment";
  readonly id: string;
}

export interface DeliverySnapshot {
  readonly source?: DeliverySource;
  /** pro-rata-sessions: each session with its own source. */
  readonly sessions?: readonly {
    readonly id: string;
    readonly endsAt: string;
    readonly source: DeliverySource;
  }[];
  readonly startTrancheBps?: number;
  readonly creditRelease?: "settlement" | "redemption";
  readonly creditsGranted?: number;
  /** Participation rules exist: wait for the minimum decision before delivery. */
  readonly awaitsParticipationDecision?: boolean;
}

interface LineFacts extends SoldLine {
  readonly catalogItemId?: string;
  readonly title: string;
  readonly refundWindowEndsAt?: Date;
  readonly shipByAt?: Date;
  readonly delivery: DeliverySnapshot;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

async function sessionForOrder(orderId: string) {
  const database = getDatabase();
  const viaRegistration = await database
    .select({ session: sessions })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .where(eq(registrations.orderId, orderId))
    .limit(1);
  if (viaRegistration[0]) return viaRegistration[0].session;
  const viaTicket = await database
    .select({ session: sessions })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
    .where(eq(tickets.orderId, orderId))
    .limit(1);
  return viaTicket[0]?.session;
}

async function catalogLineFacts(input: {
  readonly item: typeof orderItems.$inferSelect;
  readonly order: typeof orders.$inferSelect;
  readonly paymentMethod?: string;
  readonly creditRelease: "settlement" | "redemption";
  readonly startTrancheBps: number;
  readonly policy: PayPolicySettings;
}): Promise<LineFacts | undefined> {
  const database = getDatabase();
  const [fulfillment] = await database
    .select()
    .from(catalogFulfillments)
    .where(eq(catalogFulfillments.orderItemId, input.item.id))
    .limit(1);
  let catalogItem: typeof catalogItems.$inferSelect | undefined;
  if (fulfillment) {
    [catalogItem] = await database
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, fulfillment.catalogItemId))
      .limit(1);
  } else if (input.item.referenceId) {
    const rows = await database
      .select({ item: catalogItems })
      .from(catalogVariants)
      .innerJoin(
        catalogItems,
        eq(catalogVariants.catalogItemId, catalogItems.id),
      )
      .where(eq(catalogVariants.id, input.item.referenceId))
      .limit(1);
    catalogItem = rows[0]?.item;
  }
  if (!catalogItem) return undefined;
  const configuration = record(catalogItem.configuration);
  const base = {
    itemKind: input.item.kind,
    catalogType: catalogItem.type,
    catalogSubtype: catalogItem.subtype,
    paymentMethod: input.paymentMethod,
    catalogItemId: catalogItem.id,
    title: input.item.description,
  } as const;

  if (catalogItem.type === "plan") {
    if (catalogItem.subtype === "membership") {
      const membership = membershipSubscriptionPolicy(configuration);
      return {
        ...base,
        sessionCount: 0,
        refundWindowEndsAt:
          membership.refundBehavior === "full-within-window" &&
          membership.refundWindowDays
            ? new Date(
                input.order.createdAt.getTime() +
                  membership.refundWindowDays * DAY_MS,
              )
            : undefined,
        delivery: { source: { type: "payment", id: input.order.id } },
      };
    }
    const [grantRow] = await database
      .select({
        id: organizationCreditGrants.id,
        initialCredits: organizationCreditGrants.initialCredits,
      })
      .from(organizationCreditGrants)
      .where(eq(organizationCreditGrants.sourceOrderId, input.order.id))
      .orderBy(asc(organizationCreditGrants.createdAt))
      .limit(1);
    return {
      ...base,
      sessionCount: 0,
      delivery: {
        source: grantRow
          ? { type: "credit_grant", id: grantRow.id }
          : { type: "payment", id: input.order.id },
        creditRelease: input.creditRelease,
        creditsGranted: grantRow?.initialCredits,
      },
    };
  }

  if (catalogItem.type === "good") {
    const shipDays =
      positiveInteger(configuration.shipWithinDays) ??
      positiveInteger(record(configuration.fulfillment).shipWithinDays) ??
      input.policy.goodsDefaultShipDays;
    return {
      ...base,
      sessionCount: 0,
      shipByAt: new Date(input.order.createdAt.getTime() + shipDays * DAY_MS),
      delivery: fulfillment
        ? { source: { type: "catalog_fulfillment", id: fulfillment.id } }
        : { source: { type: "payment", id: input.order.id } },
    };
  }

  // Services and events: a booked occurrence, linked sessions, or the item's
  // own occurrences (programs).
  // A group rule decides at its cutoff whether the session runs: delivery
  // waits for that decision (participation.md §5.4).
  const rules = readParticipationRules(
    configuration.participation,
    positiveInteger(configuration.capacity) ?? 10_000,
  );
  const awaitsParticipationDecision = (rules?.minParticipants ?? 1) > 1;
  if (fulfillment?.catalogSessionOccurrenceId) {
    const [occurrence] = await database
      .select()
      .from(catalogSessionOccurrences)
      .where(
        eq(
          catalogSessionOccurrences.id,
          fulfillment.catalogSessionOccurrenceId,
        ),
      )
      .limit(1);
    if (occurrence) {
      // PART: the session's own rule snapshot (participation_decisions)
      // covers sessions that inherit the club default, which the
      // offering's configuration does not show.
      const [decision] = await database
        .select({ ruleSnapshot: participationDecisions.ruleSnapshot })
        .from(participationDecisions)
        .where(
          and(
            eq(
              participationDecisions.subjectType,
              "catalog-session-occurrence",
            ),
            eq(participationDecisions.subjectId, occurrence.id),
          ),
        )
        .limit(1);
      const snapshotMinimum = decision
        ? (readParticipationRules(decision.ruleSnapshot, occurrence.capacity)
            ?.minParticipants ?? 1)
        : 1;
      return {
        ...base,
        sessionCount: 1,
        deliveryStartsAt: occurrence.startsAt,
        deliveryEndsAt: occurrence.endsAt,
        delivery: {
          source: { type: "catalog_occurrence", id: occurrence.id },
          awaitsParticipationDecision:
            awaitsParticipationDecision || snapshotMinimum > 1,
        },
      };
    }
  }
  const linked = await database
    .select({ session: sessions })
    .from(catalogSessionLinks)
    .innerJoin(sessions, eq(catalogSessionLinks.sessionId, sessions.id))
    .where(eq(catalogSessionLinks.catalogItemId, catalogItem.id))
    .orderBy(asc(sessions.endsAt));
  let schedule = linked.map(({ session }) => ({
    id: session.id,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    source: { type: "session", id: session.id } as DeliverySource,
  }));
  if (!schedule.length && catalogItem.subtype === "program") {
    const occurrences = await database
      .select()
      .from(catalogSessionOccurrences)
      .where(
        and(
          eq(catalogSessionOccurrences.catalogItemId, catalogItem.id),
          gte(
            catalogSessionOccurrences.endsAt,
            new Date(input.order.createdAt.getTime() - DAY_MS),
          ),
        ),
      )
      .orderBy(asc(catalogSessionOccurrences.endsAt))
      .limit(200);
    schedule = occurrences.map((occurrence) => ({
      id: occurrence.id,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      source: { type: "catalog_occurrence", id: occurrence.id },
    }));
  }
  const fulfillmentSource: DeliverySource | undefined = fulfillment
    ? { type: "catalog_fulfillment", id: fulfillment.id }
    : undefined;
  if (!schedule.length) {
    return {
      ...base,
      sessionCount: 0,
      delivery: {
        source: fulfillmentSource ?? { type: "payment", id: input.order.id },
      },
    };
  }
  const first = schedule[0]!;
  const last = schedule[schedule.length - 1]!;
  return {
    ...base,
    sessionCount: schedule.length,
    deliveryStartsAt: schedule.reduce(
      (min, entry) => (entry.startsAt < min ? entry.startsAt : min),
      first.startsAt,
    ),
    deliveryEndsAt: last.endsAt,
    delivery: {
      // The whole sale is delivered when its LAST session ends (events up
      // to eventMaxDays); per-session rules use `sessions` below. A
      // fulfilment row is not a delivery fact for a scheduled service.
      source: last.source,
      sessions:
        schedule.length > 1
          ? schedule.map((entry) => ({
              id: entry.id,
              endsAt: entry.endsAt.toISOString(),
              source: entry.source,
            }))
          : undefined,
      startTrancheBps:
        catalogItem.subtype === "program" ? input.startTrancheBps : undefined,
      awaitsParticipationDecision,
    },
  };
}

async function lineFacts(input: {
  readonly item: typeof orderItems.$inferSelect;
  readonly order: typeof orders.$inferSelect;
  readonly paymentMethod?: string;
  readonly creditRelease: "settlement" | "redemption";
  readonly startTrancheBps: number;
  readonly policy: PayPolicySettings;
}): Promise<LineFacts> {
  const { item, order } = input;
  const fallback: LineFacts = {
    itemKind: item.kind,
    paymentMethod: input.paymentMethod,
    sessionCount: 0,
    title: item.description,
    delivery: { source: { type: "payment", id: order.id } },
  };
  const sessionFacts = (session: typeof sessions.$inferSelect): LineFacts => ({
    ...fallback,
    sessionCount: 1,
    deliveryStartsAt: session.startsAt,
    deliveryEndsAt: session.endsAt,
    delivery: { source: { type: "session", id: session.id } },
  });
  const sessionByReference = async () =>
    item.referenceId
      ? (
          await getDatabase()
            .select()
            .from(sessions)
            .where(eq(sessions.id, item.referenceId))
            .limit(1)
        )[0]
      : undefined;
  if (item.kind === "booking") {
    const [booking] = await getDatabase()
      .select()
      .from(courtBookings)
      .where(
        item.referenceId
          ? eq(courtBookings.id, item.referenceId)
          : eq(courtBookings.orderId, order.id),
      )
      .limit(1);
    if (booking) {
      return {
        ...fallback,
        sessionCount: 1,
        deliveryStartsAt: booking.startsAt,
        deliveryEndsAt: booking.endsAt,
        delivery: { source: { type: "court_booking", id: booking.id } },
      };
    }
    // Session checkouts (clinic, open play, pickup) also use "booking".
    const session =
      (await sessionByReference()) ?? (await sessionForOrder(order.id));
    return session ? sessionFacts(session) : fallback;
  }
  if (item.kind === "ticket" || item.kind === "registration") {
    const session =
      (await sessionForOrder(order.id)) ?? (await sessionByReference());
    return session ? sessionFacts(session) : fallback;
  }
  if (item.kind.startsWith("catalog-")) {
    return (await catalogLineFacts(input)) ?? fallback;
  }
  return fallback;
}

/**
 * Note B good standing: payouts for at least N days, refund rate and dispute
 * rate under the policy limits over the last N days.
 */
async function startTrancheEligible(
  organizationId: string,
  policy: PayPolicySettings,
  now: Date,
): Promise<boolean> {
  const database = getDatabase();
  const since = new Date(
    now.getTime() - policy.startTrancheMinPayoutHistoryDays * DAY_MS,
  );
  const [firstPayout] = await database
    .select({ at: sql<Date | null>`min(${payouts.createdAt})` })
    .from(payouts)
    .where(eq(payouts.organizationId, organizationId));
  if (!firstPayout?.at || new Date(firstPayout.at) > since) return false;
  const [charged] = await database
    .select({ total: sum(payments.amountMinor), charges: count() })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.organizationId, organizationId),
        eq(payments.status, "succeeded"),
        gte(payments.createdAt, since),
      ),
    );
  const chargedMinor = Number(charged?.total ?? 0);
  const charges = Number(charged?.charges ?? 0);
  if (chargedMinor <= 0 || charges <= 0) return false;
  const [refunded] = await database
    .select({ total: sum(refundRecords.amountMinor) })
    .from(refundRecords)
    .where(
      and(
        eq(refundRecords.organizationId, organizationId),
        gte(refundRecords.createdAt, since),
      ),
    );
  const [disputed] = await database
    .select({ disputes: count() })
    .from(disputes)
    .where(
      and(
        eq(disputes.organizationId, organizationId),
        gte(disputes.createdAt, since),
      ),
    );
  const refundRateBps = (Number(refunded?.total ?? 0) * 10_000) / chargedMinor;
  const disputeRateBps = (Number(disputed?.disputes ?? 0) * 10_000) / charges;
  return (
    refundRateBps <= policy.startTrancheMaxRefundRateBps &&
    disputeRateBps <= policy.startTrancheMaxDisputeRateBps
  );
}

/**
 * The organisation's Duna Pay row, created on first need. Records the first
 * charge and, for an organisation that has never been paid out, the
 * first-payout date (§5.3).
 */
export async function notePayAccountCharge(input: {
  readonly organizationId: string;
  readonly chargedAt: Date;
  readonly policy: PayPolicySettings;
}): Promise<typeof organizationPayAccounts.$inferSelect> {
  const database = getDatabase();
  const [paidBefore] = await database
    .select({ id: payouts.id })
    .from(payouts)
    .where(eq(payouts.organizationId, input.organizationId))
    .limit(1);
  const firstPayoutNotBefore =
    paidBefore || input.policy.firstPayoutDelayDays === 0
      ? null
      : new Date(
          input.chargedAt.getTime() +
            input.policy.firstPayoutDelayDays * DAY_MS,
        );
  await database
    .insert(organizationPayAccounts)
    .values({
      organizationId: input.organizationId,
      firstChargeAt: input.chargedAt,
      firstPayoutNotBefore,
    })
    .onConflictDoUpdate({
      target: organizationPayAccounts.organizationId,
      set: {
        firstChargeAt: sql`COALESCE(${organizationPayAccounts.firstChargeAt}, ${input.chargedAt})`,
        firstPayoutNotBefore: sql`CASE WHEN ${organizationPayAccounts.firstChargeAt} IS NULL AND ${organizationPayAccounts.firstPayoutDelayWaivedAt} IS NULL THEN ${firstPayoutNotBefore} ELSE ${organizationPayAccounts.firstPayoutNotBefore} END`,
        updatedAt: input.chargedAt,
      },
    });
  const [account] = await database
    .select()
    .from(organizationPayAccounts)
    .where(eq(organizationPayAccounts.organizationId, input.organizationId))
    .limit(1);
  return account!;
}

function proportional(total: number, weights: readonly number[]): number[] {
  const weightTotal = weights.reduce(
    (sum, weight) => sum + Math.max(0, weight),
    0,
  );
  if (weightTotal <= 0) return splitEvenly(total, weights.length);
  const exact = weights.map(
    (weight) => (total * Math.max(0, weight)) / weightTotal,
  );
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction || left.index - right.index,
    );
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index]! += 1;
    remainder -= 1;
  }
  return floors;
}

function immediateDeliveryKind(
  rule: PayDeliveryRule,
  paymentMethod: string | undefined,
):
  | "membership-payment-received"
  | "access-granted"
  | "paid-in-person"
  | undefined {
  if (rule === "membership-period") return "membership-payment-received";
  if (paymentMethod === "card-present" || paymentMethod === "stripe-terminal") {
    return "paid-in-person";
  }
  if (rule === "instant" || rule === "credit-pack-reserve")
    return "access-granted";
  return undefined;
}

/**
 * Create the obligations for one fund schedule. Returns the number created
 * (0 when they already exist or the money was already paid out under the
 * pre-obligation rail).
 */
export async function ensurePayObligationsForFund(input: {
  readonly fundScheduleId: string;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<number> {
  const database = getDatabase();
  const [fund] = await database
    .select()
    .from(paymentFundSchedules)
    .where(eq(paymentFundSchedules.id, input.fundScheduleId))
    .limit(1);
  if (!fund) return 0;
  if (["payout-pending", "paid-out", "refunded"].includes(fund.status))
    return 0;
  const [order] = await database
    .select()
    .from(orders)
    .where(eq(orders.id, fund.orderId))
    .limit(1);
  if (!order?.organizationId) return 0;
  const [items, payment, siblingFunds] = await Promise.all([
    database
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
    fund.paymentId
      ? database
          .select()
          .from(payments)
          .where(eq(payments.id, fund.paymentId))
          .limit(1)
          .then((rows) => rows[0])
      : Promise.resolve(undefined),
    database
      .select({ id: paymentFundSchedules.id })
      .from(paymentFundSchedules)
      .where(eq(paymentFundSchedules.orderId, order.id)),
  ]);
  if (!items.length) return 0;

  const account = await notePayAccountCharge({
    organizationId: order.organizationId,
    chargedAt: fund.createdAt,
    policy: input.policy,
  });
  const firstChargeAt = account.firstChargeAt ?? fund.createdAt;
  const creditRelease =
    input.now.getTime() - firstChargeAt.getTime() <
    input.policy.creditRedemptionOnlyDays * DAY_MS
      ? ("redemption" as const)
      : ("settlement" as const);
  const startTrancheBps =
    account.startTrancheOptIn &&
    account.startTrancheBps > 0 &&
    (await startTrancheEligible(order.organizationId, input.policy, input.now))
      ? Math.min(account.startTrancheBps, input.policy.startTrancheMaxBps)
      : 0;

  const facts = await Promise.all(
    items.map((item) =>
      lineFacts({
        item,
        order,
        paymentMethod: payment?.method,
        creditRelease,
        startTrancheBps,
        policy: input.policy,
      }),
    ),
  );
  const weights = items.map((item) => item.totalAmountMinor);
  // Proceeds never exceed what the processor view says the club netted
  // (`net_minor`, after tax): when the fee estimate is lower than the actual
  // deduction, the difference is treated as fee. This keeps every obligation
  // at or below what the pre-obligation rail would have paid for this charge.
  const applicationFeeMinor = Math.max(
    fund.consumerFeeMinor + fund.processingFeeMinor + fund.organizationFeeMinor,
    fund.grossMinor - fund.taxMinor - fund.netMinor,
  );
  const grossShares = proportional(fund.grossMinor, weights);
  const feeShares = proportional(
    Math.min(applicationFeeMinor, fund.grossMinor),
    weights,
  );
  const taxShares = proportional(fund.taxMinor, weights);
  const singleLine =
    items.length === 1 && siblingFunds.length === 1 && !fund.installmentId;
  const settledAt =
    fund.stripeBalanceTransactionId && fund.processorAvailableAt
      ? fund.processorAvailableAt
      : null;

  return getTransactionalDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`pay-obligation:${fund.id}`}))`,
    );
    const existing = await transaction
      .select({ id: payObligations.id })
      .from(payObligations)
      .where(eq(payObligations.fundScheduleId, fund.id))
      .limit(1);
    if (existing.length) return 0;
    let created = 0;
    for (const [index, item] of items.entries()) {
      const line = facts[index]!;
      const gross = grossShares[index]!;
      const fee = Math.min(feeShares[index]!, gross);
      const tax = Math.min(taxShares[index]!, gross - fee);
      const rule = deliveryRuleFor(line, input.policy);
      const id = crypto.randomUUID();
      const inserted = await transaction
        .insert(payObligations)
        .values({
          id,
          organizationId: order.organizationId!,
          orderId: order.id,
          orderItemId: singleLine ? item.id : null,
          paymentId: fund.paymentId,
          fundScheduleId: fund.id,
          catalogItemId: line.catalogItemId ?? null,
          productKind: productKindFor(line),
          deliveryRule: rule,
          status: settledAt ? "awaiting-delivery" : "pending-settlement",
          currency: fund.currency.toUpperCase(),
          grossMinor: gross,
          applicationFeeMinor: fee,
          taxMinor: tax,
          proceedsMinor: gross - fee - tax,
          settledAt,
          deliveryStartsAt: line.deliveryStartsAt ?? null,
          deliveryEndsAt: line.deliveryEndsAt ?? null,
          refundWindowEndsAt: line.refundWindowEndsAt ?? null,
          shipByAt: line.shipByAt ?? null,
          buyerCancelEligibleAt: line.shipByAt ?? null,
          refundPolicySnapshot: {
            policyName: fund.policyName,
            policyVersion: fund.policyVersion,
            policyMode: fund.policyMode,
            refundBeforeMinutes: fund.refundBeforeMinutes,
            title: line.title,
            delivery: line.delivery,
          },
          createdAt: fund.createdAt,
          updatedAt: input.now,
        })
        .onConflictDoNothing()
        .returning({ id: payObligations.id });
      if (!inserted.length) continue;
      created += 1;
      const immediate = immediateDeliveryKind(rule, payment?.method);
      if (immediate) {
        await transaction
          .insert(payDeliveryEvents)
          .values({
            organizationId: order.organizationId!,
            obligationId: id,
            kind: immediate,
            occurredAt: fund.createdAt,
            sourceType: "payment",
            sourceId: fund.paymentId ?? order.id,
            idempotencyKey: `${id}:${immediate}:all`,
          })
          .onConflictDoNothing();
      }
      log.info("pay.obligation.created", {
        obligationId: id,
        fundScheduleId: fund.id,
        organizationId: order.organizationId,
        deliveryRule: rule,
      });
    }
    return created;
  });
}

/** Fund schedules not yet represented by obligations and not paid out. */
export async function fundSchedulesWithoutObligations(
  limit: number,
): Promise<readonly string[]> {
  const rows = await getDatabase()
    .select({ id: paymentFundSchedules.id })
    .from(paymentFundSchedules)
    .where(
      and(
        inArray(paymentFundSchedules.status, [
          "pending-clearance",
          "held",
          "available",
          "partially-refunded",
          "disputed",
        ]),
        sql`NOT EXISTS (SELECT 1 FROM pay_obligations o WHERE o.fund_schedule_id = ${paymentFundSchedules.id})`,
      ),
    )
    .orderBy(asc(paymentFundSchedules.createdAt))
    .limit(limit);
  return rows.map((row) => row.id);
}
