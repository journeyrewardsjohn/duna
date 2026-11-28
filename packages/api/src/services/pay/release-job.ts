/**
 * The release job (payout-policy §3–§4): runs before every payout pass.
 *
 * 1. Backfill obligations for fund schedules that have none.
 * 2. Copy settlement from the processor view (`payment_fund_schedules`).
 * 3. Delivery sweep: for each portion whose time has come, look at its
 *    source (court booking, session, occurrence, fulfilment, credit grant)
 *    and append a delivery fact: delivered, or cancelled. A session that
 *    was cancelled, or cancelled under its minimum, is recorded as
 *    cancelled and releases nothing; a group session is never delivered
 *    before its minimum was decided.
 * 4. Recompute each open obligation with the pure `computeReleasePlan` and
 *    persist its tranches and status. Released tranches are never touched.
 *
 * Every write is idempotent (delivery facts carry a unique idempotency key;
 * tranche upserts never overwrite a released row), so the job may run twice
 * at once, be retried, or replay after a crash with the same result.
 */
import {
  catalogSessionOccurrences,
  courtBookings,
  getDatabase,
  organizationCreditGrants,
  organizationPayAccounts,
  payDeliveryEvents,
  payHolds,
  payObligationRefunds,
  payObligations,
  payReleaseTranches,
  paymentFundSchedules,
  catalogFulfillments,
  sessions,
} from "@duna/db";
import { log, report } from "@duna/observability";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
  sum,
} from "drizzle-orm";
import { addBusinessDays } from "./business-days";
import type { DeliverySnapshot, DeliverySource } from "./obligations";
import {
  ensurePayObligationsForFund,
  fundSchedulesWithoutObligations,
} from "./obligations";
import {
  loadPayPolicySettings,
  type PayPolicySettings,
} from "./policy-settings";
import {
  computeReleasePlan,
  type PayDeliveryEventKind,
  type PayDeliveryRule,
  type ReleaseEvent,
  type ReleasePlan,
} from "./release-rules";

type Obligation = typeof payObligations.$inferSelect;

/** Obligation states that can still move money. */
export const CLOSED_OBLIGATION_STATUSES = [
  "released",
  "refunded",
  "cancelled",
] as const;

function snapshotOf(obligation: Obligation): DeliverySnapshot {
  const delivery = (obligation.refundPolicySnapshot as { delivery?: unknown })
    .delivery;
  return delivery && typeof delivery === "object"
    ? (delivery as DeliverySnapshot)
    : {};
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

// ── Delivery facts ───────────────────────────────────────────────────────────

export async function recordDeliveryEvent(input: {
  readonly obligation: Pick<Obligation, "id" | "organizationId">;
  readonly kind: PayDeliveryEventKind;
  readonly occurredAt: Date;
  readonly sourceType: string;
  readonly sourceId?: string;
  readonly details?: Record<string, unknown>;
  /** Distinguishes facts of the same kind (session id, sequence, cumulative credits). */
  readonly scope: string;
  readonly actorPersonId?: string;
}): Promise<boolean> {
  const inserted = await getDatabase()
    .insert(payDeliveryEvents)
    .values({
      organizationId: input.obligation.organizationId,
      obligationId: input.obligation.id,
      kind: input.kind,
      occurredAt: input.occurredAt,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorPersonId: input.actorPersonId,
      details: input.details ?? {},
      idempotencyKey:
        `${input.obligation.id}:${input.kind}:${input.scope}`.slice(0, 160),
    })
    .onConflictDoNothing()
    .returning({ id: payDeliveryEvents.id });
  if (inserted.length) {
    log.info("pay.delivery.recorded", {
      obligationId: input.obligation.id,
      deliveryEventId: inserted[0]!.id,
      kind: input.kind,
    });
  }
  return inserted.length > 0;
}

export async function loadReleaseEvents(
  obligationId: string,
): Promise<ReleaseEvent[]> {
  const rows = await getDatabase()
    .select()
    .from(payDeliveryEvents)
    .where(eq(payDeliveryEvents.obligationId, obligationId))
    .orderBy(asc(payDeliveryEvents.occurredAt), asc(payDeliveryEvents.id));
  return rows.map((row) => {
    const details = row.details as Record<string, unknown>;
    return {
      id: row.id,
      kind: row.kind as PayDeliveryEventKind,
      occurredAt: row.occurredAt,
      sessionId: stringField(details.sessionId),
      sequence: numberField(details.sequence),
      credits: numberField(details.credits),
    };
  });
}

type SourceState =
  | { readonly state: "cancelled"; readonly at: Date }
  | { readonly state: "ended"; readonly at: Date }
  | { readonly state: "waiting" };

async function sourceState(
  source: DeliverySource,
  awaitsDecision: boolean,
  now: Date,
): Promise<SourceState> {
  const database = getDatabase();
  if (source.type === "court_booking") {
    const [booking] = await database
      .select()
      .from(courtBookings)
      .where(eq(courtBookings.id, source.id))
      .limit(1);
    if (!booking) return { state: "waiting" };
    if (["cancelled", "expired", "refunded"].includes(booking.status)) {
      return { state: "cancelled", at: booking.updatedAt ?? now };
    }
    return booking.endsAt <= now
      ? { state: "ended", at: booking.endsAt }
      : { state: "waiting" };
  }
  if (source.type === "session") {
    const [session] = await database
      .select()
      .from(sessions)
      .where(eq(sessions.id, source.id))
      .limit(1);
    if (!session) return { state: "waiting" };
    if (session.status === "cancelled") {
      return { state: "cancelled", at: session.updatedAt ?? now };
    }
    return session.endsAt <= now && session.status !== "draft"
      ? { state: "ended", at: session.endsAt }
      : { state: "waiting" };
  }
  if (source.type === "catalog_occurrence") {
    const [occurrence] = await database
      .select()
      .from(catalogSessionOccurrences)
      .where(eq(catalogSessionOccurrences.id, source.id))
      .limit(1);
    if (!occurrence) return { state: "waiting" };
    if (
      occurrence.status === "cancelled" ||
      occurrence.participationOutcome === "cancel-under-minimum"
    ) {
      return {
        state: "cancelled",
        at: occurrence.participationDecidedAt ?? occurrence.updatedAt ?? now,
      };
    }
    if (occurrence.endsAt > now) return { state: "waiting" };
    // A group session is never delivered before its minimum was decided.
    if (awaitsDecision && !occurrence.participationDecidedAt) {
      return { state: "waiting" };
    }
    return { state: "ended", at: occurrence.endsAt };
  }
  if (source.type === "catalog_fulfillment") {
    const [fulfillment] = await database
      .select()
      .from(catalogFulfillments)
      .where(eq(catalogFulfillments.id, source.id))
      .limit(1);
    if (!fulfillment) return { state: "waiting" };
    if (fulfillment.status === "cancelled") {
      return { state: "cancelled", at: fulfillment.updatedAt ?? now };
    }
    return fulfillment.status === "fulfilled"
      ? {
          state: "ended",
          at: fulfillment.fulfilledAt ?? fulfillment.updatedAt ?? now,
        }
      : { state: "waiting" };
  }
  return { state: "waiting" };
}

async function sweepCredits(
  obligation: Obligation,
  snapshot: DeliverySnapshot,
  events: readonly ReleaseEvent[],
) {
  const database = getDatabase();
  const [grant] = await database
    .select()
    .from(organizationCreditGrants)
    .where(
      snapshot.source?.type === "credit_grant"
        ? eq(organizationCreditGrants.id, snapshot.source.id)
        : eq(organizationCreditGrants.sourceOrderId, obligation.orderId),
    )
    .orderBy(asc(organizationCreditGrants.createdAt))
    .limit(1);
  if (!grant) return 0;
  let recorded = 0;
  const closed = ["refunded", "revoked", "cancelled"].includes(grant.status);
  const used = grant.initialCredits - grant.remainingCredits;
  const alreadyRedeemed = events
    .filter((event) => event.kind === "credit-redeemed")
    .reduce((total, event) => total + (event.credits ?? 0), 0);
  if (used > alreadyRedeemed && !closed) {
    if (
      await recordDeliveryEvent({
        obligation,
        kind: "credit-redeemed",
        occurredAt: grant.updatedAt ?? new Date(),
        sourceType: "credit_grant",
        sourceId: grant.id,
        details: { credits: used - alreadyRedeemed },
        scope: `through-${used}`,
      })
    )
      recorded += 1;
  }
  if (closed && grant.remainingCredits > 0) {
    if (
      await recordDeliveryEvent({
        obligation,
        kind: "credit-refunded",
        occurredAt: grant.updatedAt ?? new Date(),
        sourceType: "credit_grant",
        sourceId: grant.id,
        details: { credits: grant.remainingCredits },
        scope: "closed",
      })
    )
      recorded += 1;
  }
  return recorded;
}

/**
 * Append the delivery facts that are now known for one obligation.
 * Returns the number of new facts.
 */
export async function sweepObligationDelivery(input: {
  readonly obligation: Obligation;
  readonly plan: ReleasePlan;
  readonly events: readonly ReleaseEvent[];
  readonly now: Date;
}): Promise<number> {
  const { obligation, plan, now } = input;
  const snapshot = snapshotOf(obligation);
  const rule = obligation.deliveryRule;
  if (
    rule === "credit-pack-reserve" &&
    snapshot.creditRelease === "redemption"
  ) {
    return sweepCredits(obligation, snapshot, input.events);
  }
  const pending = plan.tranches.filter(
    (tranche) => tranche.status === "scheduled",
  );
  if (!pending.length) return 0;
  const awaits = snapshot.awaitsParticipationDecision === true;
  let recorded = 0;

  // Whole-sale source: a cancellation stops every undelivered portion.
  const whole =
    snapshot.source &&
    snapshot.source.type !== "payment" &&
    snapshot.source.type !== "credit_grant"
      ? await sourceState(snapshot.source, awaits, now)
      : undefined;
  if (whole?.state === "cancelled") {
    if (
      await recordDeliveryEvent({
        obligation,
        kind: "delivery-cancelled",
        occurredAt: whole.at,
        sourceType: snapshot.source!.type,
        sourceId: snapshot.source!.id,
        scope: "all",
      })
    )
      recorded += 1;
    return recorded;
  }

  if (rule === "pro-rata-weekly") {
    for (const tranche of pending) {
      if (!tranche.deliveryDueAt || tranche.deliveryDueAt > now) continue;
      if (
        await recordDeliveryEvent({
          obligation,
          kind: "weekly-portion-elapsed",
          occurredAt: tranche.deliveryDueAt,
          sourceType: "cron",
          details: { sequence: tranche.sequence },
          scope: `week-${tranche.sequence}`,
        })
      )
        recorded += 1;
    }
    return recorded;
  }

  if (rule === "pro-rata-sessions" && snapshot.sessions?.length) {
    const byId = new Map(
      snapshot.sessions.map((session) => [session.id, session]),
    );
    const seen = new Set<string>();
    for (const tranche of pending) {
      if (!tranche.sessionId || seen.has(tranche.sessionId)) continue;
      seen.add(tranche.sessionId);
      const session = byId.get(tranche.sessionId);
      if (!session) continue;
      const state = await sourceState(session.source, awaits, now);
      if (state.state === "waiting") continue;
      if (
        await recordDeliveryEvent({
          obligation,
          kind:
            state.state === "cancelled"
              ? "delivery-cancelled"
              : "session-ended",
          occurredAt: state.at,
          sourceType: session.source.type,
          sourceId: session.source.id,
          details: { sessionId: session.id },
          scope: `session-${session.id}`,
        })
      )
        recorded += 1;
    }
    return recorded;
  }

  if (!whole || whole.state !== "ended") {
    // Goods past their ship-by date: the buyer may now cancel (note E).
    if (
      rule === "goods-fulfilment" &&
      obligation.shipByAt &&
      obligation.shipByAt <= now
    ) {
      if (
        await recordDeliveryEvent({
          obligation,
          kind: "goods-cancel-offered",
          occurredAt: obligation.shipByAt,
          sourceType: "cron",
          scope: "ship-by",
        })
      )
        recorded += 1;
    }
    return recorded;
  }
  const source = snapshot.source!;
  let kind: PayDeliveryEventKind;
  if (rule === "goods-fulfilment") kind = "goods-fulfilled";
  else if (rule === "event-last-day") kind = "event-last-day-ended";
  else if (
    source.type === "court_booking" ||
    source.type === "catalog_fulfillment"
  )
    kind = "booking-ended";
  else kind = "session-ended";
  if (
    await recordDeliveryEvent({
      obligation,
      kind,
      occurredAt: whole.at,
      sourceType: source.type,
      sourceId: source.id,
      scope: "all",
    })
  )
    recorded += 1;
  return recorded;
}

// ── Recompute and persist ────────────────────────────────────────────────────

export async function loadObligationPlan(
  obligation: Obligation,
  policy: PayPolicySettings,
  now: Date,
): Promise<{
  readonly plan: ReleasePlan;
  readonly events: ReleaseEvent[];
  readonly refundedGrossMinor: number;
  readonly disputedMinor: number;
}> {
  const database = getDatabase();
  const [
    events,
    released,
    holds,
    accountRows,
    fundRows,
    fundedRefunds,
    grantRows,
  ] = await Promise.all([
    loadReleaseEvents(obligation.id),
    database
      .select()
      .from(payReleaseTranches)
      .where(
        and(
          eq(payReleaseTranches.obligationId, obligation.id),
          eq(payReleaseTranches.status, "released"),
        ),
      ),
    database
      .select({ id: payHolds.id })
      .from(payHolds)
      .where(
        and(
          eq(payHolds.obligationId, obligation.id),
          eq(payHolds.status, "active"),
        ),
      )
      .limit(1),
    database
      .select()
      .from(organizationPayAccounts)
      .where(
        eq(organizationPayAccounts.organizationId, obligation.organizationId),
      )
      .limit(1),
    obligation.fundScheduleId
      ? database
          .select()
          .from(paymentFundSchedules)
          .where(eq(paymentFundSchedules.id, obligation.fundScheduleId))
          .limit(1)
      : Promise.resolve([]),
    database
      .select({ total: sum(payObligationRefunds.amountMinor) })
      .from(payObligationRefunds)
      .where(eq(payObligationRefunds.obligationId, obligation.id)),
    obligation.deliveryRule === "credit-pack-reserve"
      ? database
          .select({ initialCredits: organizationCreditGrants.initialCredits })
          .from(organizationCreditGrants)
          .where(eq(organizationCreditGrants.sourceOrderId, obligation.orderId))
          .orderBy(asc(organizationCreditGrants.createdAt))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const snapshot = snapshotOf(obligation);
  const account = accountRows[0];
  const fund = fundRows[0];
  const share = (amount: number) =>
    fund && fund.grossMinor > 0
      ? Math.min(
          obligation.grossMinor,
          Math.round((amount * obligation.grossMinor) / fund.grossMinor),
        )
      : 0;
  const refundedGrossMinor = fund ? share(fund.refundedMinor) : 0;
  // A processor refund before funding records exist (pull request 2 adds
  // them): the whole refunded amount comes off the club's proceeds, as the
  // pre-obligation rail did (net − refunded). Conservative: the club is
  // never paid a refunded cent, and never more than the old rail paid.
  const refundedFromFund = refundedGrossMinor;
  const refundedProceedsMinor = Math.min(
    obligation.proceedsMinor,
    Math.max(refundedFromFund, Number(fundedRefunds[0]?.total ?? 0)),
  );
  const disputedMinor =
    fund && fund.status === "disputed" ? share(fund.disputedMinor) : 0;
  const firstPayoutNotBefore =
    account && !account.firstPayoutDelayWaivedAt
      ? (account.firstPayoutNotBefore ?? undefined)
      : undefined;
  const plan = computeReleasePlan(
    {
      id: obligation.id,
      deliveryRule: obligation.deliveryRule as PayDeliveryRule,
      proceedsMinor: obligation.proceedsMinor,
      refundedProceedsMinor,
      disputedMinor,
      createdAt: obligation.createdAt,
      settledAt: obligation.settledAt ?? undefined,
      deliveryStartsAt: obligation.deliveryStartsAt ?? undefined,
      deliveryEndsAt: obligation.deliveryEndsAt ?? undefined,
      refundWindowEndsAt: obligation.refundWindowEndsAt ?? undefined,
      shipByAt: obligation.shipByAt ?? undefined,
      sessions: snapshot.sessions?.map((session) => ({
        id: session.id,
        endsAt: new Date(session.endsAt),
      })),
      startTrancheBps: snapshot.startTrancheBps,
      creditRelease: snapshot.creditRelease,
      creditsGranted: snapshot.creditsGranted ?? grantRows[0]?.initialCredits,
      released: released.map((tranche) => ({
        sequence: tranche.sequence,
        amountMinor: tranche.amountMinor,
        releasedAt: tranche.releasedAt!,
        payoutId: tranche.payoutId ?? undefined,
      })),
    },
    events,
    { policy, firstPayoutNotBefore, obligationHeld: holds.length > 0 },
    now,
  );
  return { plan, events, refundedGrossMinor, disputedMinor };
}

async function persistPlan(
  obligation: Obligation,
  plan: ReleasePlan,
  refundedGrossMinor: number,
  disputedMinor: number,
  now: Date,
): Promise<void> {
  const database = getDatabase();
  const snapshot = snapshotOf(obligation);
  const sessionRowIds = new Set(
    (snapshot.sessions ?? [])
      .filter((session) => session.source.type === "session")
      .map((session) => session.id),
  );
  if (snapshot.source?.type === "session")
    sessionRowIds.add(snapshot.source.id);
  for (const tranche of plan.tranches) {
    if (tranche.status === "released") continue;
    const values = {
      kind: tranche.kind,
      status: tranche.status,
      amountMinor: tranche.amountMinor,
      sessionId:
        tranche.sessionId && sessionRowIds.has(tranche.sessionId)
          ? tranche.sessionId
          : null,
      deliveryDueAt: tranche.deliveryDueAt ?? null,
      deliveredAt: tranche.deliveredAt ?? null,
      releasableAt: tranche.releasableAt ?? null,
      updatedAt: now,
    };
    await database
      .insert(payReleaseTranches)
      .values({
        organizationId: obligation.organizationId,
        obligationId: obligation.id,
        sequence: tranche.sequence,
        currency: obligation.currency,
        ...values,
      })
      .onConflictDoUpdate({
        target: [payReleaseTranches.obligationId, payReleaseTranches.sequence],
        set: values,
        setWhere: sql`${payReleaseTranches.status} <> 'released'`,
      });
  }
  await database
    .update(payObligations)
    .set({
      status: plan.status,
      releasedMinor: plan.releasedMinor,
      refundedMinor: Math.min(obligation.grossMinor, refundedGrossMinor),
      disputedMinor,
      updatedAt: now,
    })
    .where(eq(payObligations.id, obligation.id));
  if (plan.status !== obligation.status) {
    log.info("pay.obligation.updated", {
      obligationId: obligation.id,
      from: obligation.status,
      to: plan.status,
    });
  }
  if (plan.overReleasedMinor > 0) {
    // Recovery is placed by the refund and dispute paths (§5.5); seeing it
    // here means money left before it was taken back.
    log.warn("pay.obligation.overReleased", {
      obligationId: obligation.id,
      organizationId: obligation.organizationId,
    });
  }
}

/** Sweep delivery for one obligation, then recompute and persist it. */
export async function refreshObligation(
  obligation: Obligation,
  policy: PayPolicySettings,
  now: Date,
): Promise<{ readonly deliveryEvents: number; readonly plan: ReleasePlan }> {
  const first = await loadObligationPlan(obligation, policy, now);
  const deliveryEvents = await sweepObligationDelivery({
    obligation,
    plan: first.plan,
    events: first.events,
    now,
  });
  const final = deliveryEvents
    ? await loadObligationPlan(obligation, policy, now)
    : first;
  await persistPlan(
    obligation,
    final.plan,
    final.refundedGrossMinor,
    final.disputedMinor,
    now,
  );
  return { deliveryEvents, plan: final.plan };
}

export interface PayReleaseJobResult {
  readonly obligationsCreated: number;
  readonly obligationsRefreshed: number;
  readonly deliveryEventsRecorded: number;
  /** Releasable portions not paid within the payout promise (business days). */
  readonly overdueTranches: number;
  readonly failures: number;
}

/** Open obligations, optionally for one organisation. */
export async function openObligations(input: {
  readonly organizationId?: string;
  readonly limit: number;
}): Promise<Obligation[]> {
  return getDatabase()
    .select()
    .from(payObligations)
    .where(
      and(
        notInArray(payObligations.status, [...CLOSED_OBLIGATION_STATUSES]),
        input.organizationId
          ? eq(payObligations.organizationId, input.organizationId)
          : undefined,
      ),
    )
    .orderBy(asc(payObligations.deliveryEndsAt), asc(payObligations.createdAt))
    .limit(input.limit);
}

export async function runPayReleaseJob(input: {
  readonly now: Date;
  readonly policy?: PayPolicySettings;
  readonly organizationId?: string;
  readonly limit?: number;
}): Promise<PayReleaseJobResult> {
  const policy = input.policy ?? loadPayPolicySettings();
  const limit = Math.min(5_000, Math.max(1, input.limit ?? 1_000));
  const database = getDatabase();
  let created = 0;
  let failures = 0;
  for (const fundScheduleId of await fundSchedulesWithoutObligations(limit)) {
    try {
      created += await ensurePayObligationsForFund({
        fundScheduleId,
        policy,
        now: input.now,
      });
    } catch (error) {
      failures += 1;
      report(error, {
        event: "pay.obligation.failed",
        fields: { fundScheduleId },
      });
    }
  }
  // Settlement is what the processor reports, never an estimate.
  await database
    .update(payObligations)
    .set({
      settledAt: sql`(SELECT f.processor_available_at FROM payment_fund_schedules f WHERE f.id = ${payObligations.fundScheduleId})`,
      updatedAt: input.now,
    })
    .where(
      and(
        isNull(payObligations.settledAt),
        sql`EXISTS (SELECT 1 FROM payment_fund_schedules f WHERE f.id = ${payObligations.fundScheduleId} AND f.stripe_balance_transaction_id IS NOT NULL AND f.processor_available_at IS NOT NULL)`,
        input.organizationId
          ? eq(payObligations.organizationId, input.organizationId)
          : undefined,
      ),
    );

  let refreshed = 0;
  let deliveryEvents = 0;
  for (const obligation of await openObligations({
    organizationId: input.organizationId,
    limit,
  })) {
    try {
      const result = await refreshObligation(obligation, policy, input.now);
      deliveryEvents += result.deliveryEvents;
      refreshed += 1;
    } catch (error) {
      failures += 1;
      report(error, {
        event: "pay.release.failed",
        fields: { obligationId: obligation.id },
      });
    }
  }

  // The 3-business-day promise: releasable money older than that is overdue.
  const releasable = await database
    .select({ releasableAt: payReleaseTranches.releasableAt })
    .from(payReleaseTranches)
    .where(
      and(
        eq(payReleaseTranches.status, "releasable"),
        isNull(payReleaseTranches.payoutId),
        sql`${payReleaseTranches.amountMinor} > 0`,
        input.organizationId
          ? eq(payReleaseTranches.organizationId, input.organizationId)
          : undefined,
      ),
    );
  const overdueTranches = releasable.filter(
    (row) =>
      row.releasableAt &&
      addBusinessDays(row.releasableAt, policy.payoutBusinessDays) < input.now,
  ).length;
  if (overdueTranches) {
    log.warn("pay.release.overdue", { count: overdueTranches });
  }
  const result = {
    obligationsCreated: created,
    obligationsRefreshed: refreshed,
    deliveryEventsRecorded: deliveryEvents,
    overdueTranches,
    failures,
  };
  log.info("pay.release.completed", result);
  return result;
}

/** Tranche ids for an organisation's open obligations (diagnostics, tests). */
export async function trancheStatuses(obligationIds: readonly string[]) {
  if (!obligationIds.length) return [];
  return getDatabase()
    .select()
    .from(payReleaseTranches)
    .where(inArray(payReleaseTranches.obligationId, [...obligationIds]))
    .orderBy(
      asc(payReleaseTranches.obligationId),
      asc(payReleaseTranches.sequence),
    );
}
