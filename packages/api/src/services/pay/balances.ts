/**
 * Reserves, negative-balance recovery and reconciliation (payout-policy
 * §5.4, §5.5; Duna Pay terms §7, §11).
 *
 * - Unredeemed Credit Reserve (standing): `creditReserveBps` of the cash
 *   value of unredeemed paid credits, recalculated on every run, held as one
 *   club-level hold. Payouts are reduced by active club-level holds.
 * - Rolling reserve (triggered): when a club's 90-day refund or dispute rate
 *   crosses the setting, a reserve is PROPOSED with its evidence. A Duna
 *   person activates it with written notice (`activateRollingReserve`);
 *   nothing is withheld before that. While active it holds `percentBps` of
 *   the proceeds sold in the last `rollingReserveDefaultDays`; it ends at
 *   its end date (≤ 180 days, database CHECK) and is released.
 * - Recovery: a negative processor balance (refunds or disputes after the
 *   money was paid out) is recorded as a set-off against future proceeds;
 *   it is collected when the balance is positive again; after
 *   `recoveryInvoiceDays` an invoice recovery is opened for a person to send.
 * - Reconciliation: compares the processor balance with what Duna's records
 *   say the club's balance holds, and reports drift.
 */
import {
  catalogItems,
  getDatabase,
  organizationCreditGrants,
  organizations,
  payHolds,
  payObligations,
  payRecoveries,
  payReleaseTranches,
  payReserves,
  payDisputeCases,
  refundRecords,
  payments,
  orders,
} from "@duna/db";
import { log, report } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, isNotNull, sql, sum } from "drizzle-orm";
import type { z } from "zod";
import { currencySchema } from "../../contracts";
import type { payRecoverySchema, payReserveSchema } from "../../contracts/pay";
import { isStripeConfigured, loadConnectedAccountMoney } from "../../payments";
import type { PayPolicySettings } from "./policy-settings";
import { basisPointShare } from "./release-rules";

const DAY_MS = 24 * 60 * 60 * 1000;

async function upsertReserveHold(input: {
  readonly organizationId: string;
  readonly reserveId: string;
  readonly kind: "unredeemed-credit-reserve" | "rolling-reserve";
  readonly amountMinor: number;
  readonly currency: string;
  readonly reason: string;
  readonly releaseAfter?: Date;
  readonly now: Date;
}): Promise<void> {
  const database = getDatabase();
  const [hold] = await database
    .select()
    .from(payHolds)
    .where(and(eq(payHolds.reserveId, input.reserveId), eq(payHolds.status, "active")))
    .limit(1);
  if (hold) {
    if (hold.amountMinor !== input.amountMinor) {
      await database
        .update(payHolds)
        .set({ amountMinor: input.amountMinor, updatedAt: input.now })
        .where(eq(payHolds.id, hold.id));
      log.info("pay.hold.updated", { holdId: hold.id, organizationId: input.organizationId });
    }
    return;
  }
  const [created] = await database
    .insert(payHolds)
    .values({
      organizationId: input.organizationId,
      reserveId: input.reserveId,
      kind: input.kind,
      status: "active",
      amountMinor: input.amountMinor,
      currency: input.currency,
      reason: input.reason,
      startsAt: input.now,
      releaseAfter: input.releaseAfter,
    })
    .returning({ id: payHolds.id });
  log.info("pay.hold.placed", { holdId: created?.id, organizationId: input.organizationId, kind: input.kind });
}

/** Cash value of a club's unredeemed paid credits (packs and bundles). */
export async function unredeemedPaidCreditValueMinor(organizationId: string): Promise<number> {
  const [row] = await getDatabase()
    .select({ total: sum(organizationCreditGrants.remainingValueMinor) })
    .from(organizationCreditGrants)
    .innerJoin(catalogItems, eq(organizationCreditGrants.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(organizationCreditGrants.organizationId, organizationId),
        eq(organizationCreditGrants.status, "active"),
        isNotNull(organizationCreditGrants.sourceOrderId),
        eq(catalogItems.type, "plan"),
        inArray(catalogItems.subtype, ["credit-pack", "bundle"]),
      ),
    );
  return Number(row?.total ?? 0);
}

/** The standing Unredeemed Credit Reserve, recalculated. Idempotent. */
export async function refreshCreditReserve(input: {
  readonly organizationId: string;
  readonly currency: string;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<number> {
  const database = getDatabase();
  const value = await unredeemedPaidCreditValueMinor(input.organizationId);
  const amount = basisPointShare(value, input.policy.creditReserveBps);
  let [reserve] = await database
    .select()
    .from(payReserves)
    .where(
      and(
        eq(payReserves.organizationId, input.organizationId),
        eq(payReserves.kind, "unredeemed-credit"),
        inArray(payReserves.status, ["active", "under-review"]),
      ),
    )
    .limit(1);
  if (!reserve) {
    if (amount <= 0) return 0;
    [reserve] = await database
      .insert(payReserves)
      .values({
        organizationId: input.organizationId,
        kind: "unredeemed-credit",
        trigger: "standing-credit-reserve",
        status: "active",
        percentBps: Math.max(1, input.policy.creditReserveBps),
        startsAt: input.now,
        reviewAt: new Date(input.now.getTime() + input.policy.rollingReserveReviewDays * DAY_MS),
        // The standing reserve is stated in the Duna Pay terms (§7); the
        // terms accepted at onboarding are the notice.
        noticeReason:
          "Standing reserve on unredeemed paid credits, as set out in the Duna Pay terms.",
        noticeSentAt: input.now,
        evidence: { basis: "unredeemed-paid-credits" },
      })
      .returning();
  }
  if (!reserve) return 0;
  await upsertReserveHold({
    organizationId: input.organizationId,
    reserveId: reserve.id,
    kind: "unredeemed-credit-reserve",
    amountMinor: amount,
    currency: input.currency,
    reason: "Unredeemed Credit Reserve: a share of unused paid credits is held for player refunds.",
    now: input.now,
  });
  return amount;
}

/** 90-day refund and dispute rates (basis points), or undefined without sales. */
export async function organizationRiskRates(organizationId: string, now: Date) {
  const since = new Date(now.getTime() - 90 * DAY_MS);
  const database = getDatabase();
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
  if (chargedMinor <= 0 || charges <= 0) return undefined;
  const [refunded] = await database
    .select({ total: sum(refundRecords.amountMinor) })
    .from(refundRecords)
    .where(
      and(
        eq(refundRecords.organizationId, organizationId),
        eq(refundRecords.disposition, "original-payment"),
        gte(refundRecords.createdAt, since),
      ),
    );
  const [disputed] = await database
    .select({ cases: count() })
    .from(payDisputeCases)
    .where(and(eq(payDisputeCases.organizationId, organizationId), gte(payDisputeCases.openedAt, since)));
  return {
    refundRateBps: Math.round((Number(refunded?.total ?? 0) * 10_000) / chargedMinor),
    disputeRateBps: Math.round((Number(disputed?.cases ?? 0) * 10_000) / charges),
  };
}

/**
 * Propose a rolling reserve when a trigger is crossed (never withholds by
 * itself), keep an active one's hold current, and end it on its end date.
 */
export async function refreshRollingReserve(input: {
  readonly organizationId: string;
  readonly currency: string;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<void> {
  const database = getDatabase();
  const reserves = await database
    .select()
    .from(payReserves)
    .where(
      and(
        eq(payReserves.organizationId, input.organizationId),
        eq(payReserves.kind, "rolling"),
        inArray(payReserves.status, ["proposed", "active", "under-review"]),
      ),
    );
  for (const reserve of reserves) {
    if (reserve.status === "proposed") continue;
    if (reserve.endsAt && reserve.endsAt <= input.now) {
      await database
        .update(payReserves)
        .set({ status: "released", releasedAt: input.now, updatedAt: input.now })
        .where(eq(payReserves.id, reserve.id));
      await database
        .update(payHolds)
        .set({ status: "released", releasedAt: input.now, updatedAt: input.now })
        .where(and(eq(payHolds.reserveId, reserve.id), eq(payHolds.status, "active")));
      log.info("pay.reserve.released", { reserveId: reserve.id, organizationId: input.organizationId });
      continue;
    }
    const windowStart = new Date(
      Math.max(
        reserve.startsAt?.getTime() ?? input.now.getTime(),
        input.now.getTime() - input.policy.rollingReserveDefaultDays * DAY_MS,
      ),
    );
    const [sold] = await database
      .select({ total: sum(payObligations.proceedsMinor) })
      .from(payObligations)
      .where(
        and(
          eq(payObligations.organizationId, input.organizationId),
          gte(payObligations.createdAt, windowStart),
        ),
      );
    await upsertReserveHold({
      organizationId: input.organizationId,
      reserveId: reserve.id,
      kind: "rolling-reserve",
      amountMinor: basisPointShare(Number(sold?.total ?? 0), reserve.percentBps),
      currency: input.currency,
      reason: reserve.noticeReason,
      releaseAfter: reserve.endsAt ?? undefined,
      now: input.now,
    });
  }
  if (reserves.length) return;
  const rates = await organizationRiskRates(input.organizationId, input.now);
  if (!rates) return;
  const trigger =
    rates.refundRateBps > input.policy.rollingReserveRefundRateBps
      ? ("refund-rate" as const)
      : rates.disputeRateBps > input.policy.rollingReserveDisputeRateBps
        ? ("dispute-rate" as const)
        : undefined;
  if (!trigger) return;
  const [proposed] = await database
    .insert(payReserves)
    .values({
      organizationId: input.organizationId,
      kind: "rolling",
      trigger,
      status: "proposed",
      percentBps: input.policy.rollingReserveDefaultBps,
      noticeReason:
        trigger === "refund-rate"
          ? "Refunds over the last 90 days are above the Duna Pay threshold."
          : "Disputes over the last 90 days are above the Duna Pay threshold.",
      evidence: { ...rates, measuredAt: input.now.toISOString() },
    })
    .returning({ id: payReserves.id });
  log.warn("pay.reserve.proposed", { reserveId: proposed?.id, organizationId: input.organizationId, trigger });
}

/**
 * A Duna person activates a proposed reserve after sending the written
 * notice (reason, percentage, duration, review date). Explicit confirmation.
 */
export async function activateRollingReserve(input: {
  readonly reserveId: string;
  readonly actorPersonId: string;
  readonly confirmed: true;
  readonly days?: number;
  readonly noticeSentAt: Date;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<void> {
  const days = Math.min(
    input.days ?? input.policy.rollingReserveDefaultDays,
    input.policy.rollingReserveMaxDays,
  );
  const updated = await getDatabase()
    .update(payReserves)
    .set({
      status: "active",
      startsAt: input.now,
      endsAt: new Date(input.now.getTime() + days * DAY_MS),
      reviewAt: new Date(input.now.getTime() + input.policy.rollingReserveReviewDays * DAY_MS),
      noticeSentAt: input.noticeSentAt,
      decidedByPersonId: input.actorPersonId,
      updatedAt: input.now,
    })
    .where(and(eq(payReserves.id, input.reserveId), eq(payReserves.status, "proposed")))
    .returning({ id: payReserves.id, organizationId: payReserves.organizationId });
  if (!updated.length) throw new Error("Only a proposed reserve can be activated.");
  log.info("pay.reserve.activated", { reserveId: input.reserveId, organizationId: updated[0]!.organizationId });
}

/** The club asks for a review at any time (§5.4). */
export async function requestPayReserveReview(input: {
  readonly organizationId: string;
  readonly reserveId: string;
  readonly actorPersonId: string;
  readonly note: string;
  readonly now: Date;
}): Promise<z.infer<typeof payReserveSchema>> {
  const database = getDatabase();
  const [reserve] = await database
    .select()
    .from(payReserves)
    .where(and(eq(payReserves.id, input.reserveId), eq(payReserves.organizationId, input.organizationId)))
    .limit(1);
  if (!reserve) throw new TRPCError({ code: "NOT_FOUND" });
  if (reserve.status !== "active" && reserve.status !== "under-review") {
    throw new TRPCError({ code: "CONFLICT", message: "Only an active reserve can be reviewed." });
  }
  const evidence = reserve.evidence as { reviewRequests?: unknown };
  const requests = Array.isArray(evidence.reviewRequests) ? evidence.reviewRequests : [];
  await database
    .update(payReserves)
    .set({
      status: "under-review",
      evidence: {
        ...evidence,
        reviewRequests: [
          ...requests,
          { at: input.now.toISOString(), personId: input.actorPersonId, note: input.note },
        ],
      },
      updatedAt: input.now,
    })
    .where(eq(payReserves.id, reserve.id));
  log.info("pay.reserve.reviewRequested", { reserveId: reserve.id, organizationId: input.organizationId });
  const list = await listPayReserves(input.organizationId);
  return list.find((entry) => entry.id === reserve.id)!;
}

// ── Recovery and reconciliation ──────────────────────────────────────────────

export interface ReconciliationLine {
  readonly organizationId: string;
  readonly currency: string;
  readonly processorMinor: number;
  readonly expectedMinor: number;
  readonly driftMinor: number;
}

/** What Duna's records say is still in the club's processor balance. */
export async function expectedProcessorBalanceMinor(organizationId: string, currency: string) {
  const [open] = await getDatabase()
    .select({ total: sum(payReleaseTranches.amountMinor) })
    .from(payReleaseTranches)
    .where(
      and(
        eq(payReleaseTranches.organizationId, organizationId),
        eq(payReleaseTranches.currency, currency),
        inArray(payReleaseTranches.status, ["scheduled", "delivered", "releasable", "held", "cancelled"]),
      ),
    );
  return Number(open?.total ?? 0);
}

/**
 * Track a negative processor balance as a set-off recovery; collect it when
 * the balance recovers; open an invoice recovery after the grace period.
 */
export async function reconcileRecovery(input: {
  readonly organizationId: string;
  readonly currency: string;
  readonly availableMinor: number;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<void> {
  const database = getDatabase();
  const pending = await database
    .select()
    .from(payRecoveries)
    .where(
      and(
        eq(payRecoveries.organizationId, input.organizationId),
        eq(payRecoveries.status, "pending"),
        eq(payRecoveries.owedFor, "negative-balance"),
      ),
    );
  const setOff = pending.find((row) => row.kind === "set-off");
  if (input.availableMinor >= 0) {
    for (const row of pending.filter((entry) => entry.kind === "set-off")) {
      await database
        .update(payRecoveries)
        .set({ status: "collected", collectedAt: input.now, updatedAt: input.now })
        .where(eq(payRecoveries.id, row.id));
      log.info("pay.recovery.collected", { recoveryId: row.id, organizationId: input.organizationId, source: "future-proceeds" });
    }
    return;
  }
  const owed = -input.availableMinor;
  if (!setOff) {
    const [created] = await database
      .insert(payRecoveries)
      .values({
        organizationId: input.organizationId,
        kind: "set-off",
        status: "pending",
        amountMinor: owed,
        currency: input.currency,
        owedFor: "negative-balance",
        dueAt: new Date(input.now.getTime() + input.policy.recoveryInvoiceDays * DAY_MS),
      })
      .returning({ id: payRecoveries.id });
    log.warn("pay.recovery.opened", { recoveryId: created?.id, organizationId: input.organizationId });
    return;
  }
  if (setOff.amountMinor !== owed) {
    await database
      .update(payRecoveries)
      .set({ amountMinor: owed, updatedAt: input.now })
      .where(eq(payRecoveries.id, setOff.id));
  }
  const invoiceOpen = pending.some((row) => row.kind === "invoice");
  if (!invoiceOpen && setOff.dueAt && setOff.dueAt <= input.now) {
    // Future proceeds did not cover it in time: an invoice a person sends.
    const [invoice] = await database
      .insert(payRecoveries)
      .values({
        organizationId: input.organizationId,
        kind: "invoice",
        status: "pending",
        amountMinor: owed,
        currency: input.currency,
        owedFor: "negative-balance",
        dueAt: new Date(input.now.getTime() + input.policy.recoveryInvoiceDays * DAY_MS),
      })
      .returning({ id: payRecoveries.id });
    log.warn("pay.recovery.invoiceOpened", { recoveryId: invoice?.id, organizationId: input.organizationId });
  }
}

/** Reconcile every connected club: drift report, recovery, reserves. */
export async function reconcilePayBalances(input: {
  readonly policy: PayPolicySettings;
  readonly now: Date;
  readonly organizationId?: string;
}): Promise<{ readonly lines: readonly ReconciliationLine[]; readonly drifted: number; readonly failures: number }> {
  const clubs = await getDatabase()
    .select({ id: organizations.id, currency: organizations.currency, stripeAccountId: organizations.stripeAccountId })
    .from(organizations)
    .where(
      and(
        isNotNull(organizations.stripeAccountId),
        input.organizationId ? eq(organizations.id, input.organizationId) : undefined,
        sql`EXISTS (SELECT 1 FROM pay_obligations o WHERE o.organization_id = ${organizations.id})`,
      ),
    );
  const lines: ReconciliationLine[] = [];
  let failures = 0;
  for (const club of clubs) {
    const currency = club.currency.toUpperCase();
    try {
      await refreshCreditReserve({ organizationId: club.id, currency, policy: input.policy, now: input.now });
      await refreshRollingReserve({ organizationId: club.id, currency, policy: input.policy, now: input.now });
      if (!isStripeConfigured() || !club.stripeAccountId) continue;
      const money = await loadConnectedAccountMoney({ accountId: club.stripeAccountId, currency });
      const available = money.stripeAvailableMinor ?? 0;
      const processorMinor = available + (money.stripePendingMinor ?? 0);
      const expectedMinor = await expectedProcessorBalanceMinor(club.id, currency);
      const line = { organizationId: club.id, currency, processorMinor, expectedMinor, driftMinor: processorMinor - expectedMinor };
      lines.push(line);
      if (Math.abs(line.driftMinor) > input.policy.reconciliationDriftToleranceMinor) {
        log.warn("pay.reconciliation.drift", line);
      }
      await reconcileRecovery({ organizationId: club.id, currency, availableMinor: available, policy: input.policy, now: input.now });
    } catch (error) {
      failures += 1;
      report(error, { event: "pay.reconciliation.failed", fields: { organizationId: club.id } });
    }
  }
  const drifted = lines.filter((line) => Math.abs(line.driftMinor) > input.policy.reconciliationDriftToleranceMinor).length;
  log.info("pay.reconciliation.completed", { clubs: clubs.length, drifted, failures });
  return { lines, drifted, failures };
}

// ── Read model ───────────────────────────────────────────────────────────────

function money(amountMinor: number, currency: string) {
  return {
    amountMinor: Math.max(0, amountMinor),
    currency: currencySchema.catch("USD").parse(currency.toUpperCase()),
  };
}

export async function listPayReserves(organizationId: string): Promise<z.infer<typeof payReserveSchema>[]> {
  const database = getDatabase();
  const [reserves, holds, [club]] = await Promise.all([
    database.select().from(payReserves).where(eq(payReserves.organizationId, organizationId)).orderBy(desc(payReserves.createdAt)),
    database
      .select({ reserveId: payHolds.reserveId, amountMinor: payHolds.amountMinor })
      .from(payHolds)
      .where(and(eq(payHolds.organizationId, organizationId), eq(payHolds.status, "active"), isNotNull(payHolds.reserveId))),
    database.select({ currency: organizations.currency }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
  ]);
  const held = new Map<string, number>();
  for (const hold of holds) held.set(hold.reserveId!, (held.get(hold.reserveId!) ?? 0) + hold.amountMinor);
  return reserves.map((reserve) => ({
    id: reserve.id,
    kind: reserve.kind as z.infer<typeof payReserveSchema>["kind"],
    trigger: reserve.trigger as z.infer<typeof payReserveSchema>["trigger"],
    status: reserve.status as z.infer<typeof payReserveSchema>["status"],
    percentBps: reserve.percentBps,
    startsAt: reserve.startsAt?.toISOString(),
    endsAt: reserve.endsAt?.toISOString(),
    reviewAt: reserve.reviewAt?.toISOString(),
    noticeReason: reserve.noticeReason,
    noticeSentAt: reserve.noticeSentAt?.toISOString(),
    held: money(held.get(reserve.id) ?? 0, club?.currency ?? "USD"),
  }));
}

export async function listPayRecoveries(organizationId: string): Promise<z.infer<typeof payRecoverySchema>[]> {
  const rows = await getDatabase()
    .select()
    .from(payRecoveries)
    .where(eq(payRecoveries.organizationId, organizationId))
    .orderBy(desc(payRecoveries.createdAt))
    .limit(500);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as z.infer<typeof payRecoverySchema>["kind"],
    status: row.status as z.infer<typeof payRecoverySchema>["status"],
    amount: money(row.amountMinor, row.currency),
    owedFor: row.owedFor,
    dueAt: row.dueAt?.toISOString(),
    invoiceReference: row.invoiceReference ?? undefined,
    collectedAt: row.collectedAt?.toISOString(),
  }));
}
