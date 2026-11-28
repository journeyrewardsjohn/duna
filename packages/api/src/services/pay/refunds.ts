/**
 * Refund funding (payout-policy §5.2, Duna Pay terms §9.3): every money
 * refund of a sale is recorded against its obligations with where the
 * club's share came from, in order: the sale's held (unreleased) proceeds,
 * the club's available balance (other releasable, unpaid proceeds), then
 * future proceeds. The bank debit (4th source) is the processor's
 * negative-balance debit, recorded by reconciliation.
 *
 * Card refunds only: purchases paid with credits are refunded in credits by
 * the catalog service (no money moves, no obligation exists); a mixed order
 * has an obligation only for its card part. Idempotent: a refund record is
 * funded once per obligation.
 */
import {
  getDatabase,
  getTransactionalDatabase,
  payObligationRefunds,
  payObligations,
  payReleaseTranches,
  paymentFundSchedules,
  refundRecords,
} from "@duna/db";
import { log, report } from "@duna/observability";
import { and, asc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import type { PayPolicySettings } from "./policy-settings";
import { allocateProportionally, refundSplit } from "./refund-fees";

type Obligation = typeof payObligations.$inferSelect;

/** Refund records with money that have not been funded yet. */
async function unfundedRefunds(
  organizationId: string | undefined,
  limit: number,
) {
  return getDatabase()
    .select()
    .from(refundRecords)
    .where(
      and(
        eq(refundRecords.disposition, "original-payment"),
        inArray(refundRecords.status, ["pending", "succeeded"]),
        sql`${refundRecords.amountMinor} > 0`,
        organizationId
          ? eq(refundRecords.organizationId, organizationId)
          : undefined,
        sql`EXISTS (SELECT 1 FROM pay_obligations o WHERE o.order_id = ${refundRecords.orderId})`,
        sql`NOT EXISTS (SELECT 1 FROM pay_obligation_refunds r WHERE r.refund_record_id = ${refundRecords.id})`,
      ),
    )
    .orderBy(asc(refundRecords.createdAt))
    .limit(limit);
}

async function availableBalanceMinor(
  organizationId: string,
  excludeObligationId: string,
) {
  const [row] = await getDatabase()
    .select({ total: sum(payReleaseTranches.amountMinor) })
    .from(payReleaseTranches)
    .where(
      and(
        eq(payReleaseTranches.organizationId, organizationId),
        eq(payReleaseTranches.status, "releasable"),
        isNull(payReleaseTranches.payoutId),
        sql`${payReleaseTranches.obligationId} <> ${excludeObligationId}`,
      ),
    );
  return Number(row?.total ?? 0);
}

async function fundedProceedsMinor(obligationId: string) {
  const [row] = await getDatabase()
    .select({ total: sum(payObligationRefunds.amountMinor) })
    .from(payObligationRefunds)
    .where(eq(payObligationRefunds.obligationId, obligationId));
  return Number(row?.total ?? 0);
}

/** Fund one refund record across its order's obligations. */
export async function fundRefundRecord(input: {
  readonly refund: typeof refundRecords.$inferSelect;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<number> {
  const database = getDatabase();
  const obligations = await database
    .select()
    .from(payObligations)
    .where(eq(payObligations.orderId, input.refund.orderId))
    .orderBy(asc(payObligations.createdAt), asc(payObligations.id));
  if (!obligations.length) return 0;
  const shares = allocateProportionally(
    Math.min(
      input.refund.amountMinor,
      obligations.reduce(
        (total, obligation) => total + obligation.grossMinor,
        0,
      ),
    ),
    obligations.map((obligation) => obligation.grossMinor),
  );
  let rows = 0;
  for (const [index, obligation] of obligations.entries()) {
    const refundGross = Math.min(shares[index]!, obligation.grossMinor);
    if (refundGross <= 0) continue;
    rows += await fundObligationRefund({
      obligation,
      refundRecordId: input.refund.id,
      refundGrossMinor: refundGross,
      currency: input.refund.currency,
      policy: input.policy,
      now: input.now,
    });
  }
  return rows;
}

async function fundObligationRefund(input: {
  readonly obligation: Obligation;
  readonly refundRecordId: string;
  readonly refundGrossMinor: number;
  readonly currency: string;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<number> {
  const { obligation } = input;
  const database = getDatabase();
  const [fund] = obligation.fundScheduleId
    ? await database
        .select()
        .from(paymentFundSchedules)
        .where(eq(paymentFundSchedules.id, obligation.fundScheduleId))
        .limit(1)
    : [];
  const fundGross = Math.max(1, fund?.grossMinor ?? obligation.grossMinor);
  const part = (value: number) =>
    Math.round((value * obligation.grossMinor) / fundGross);
  const serviceFee = Math.min(
    part(fund?.consumerFeeMinor ?? 0),
    obligation.grossMinor - obligation.taxMinor,
  );
  const itemsMinor = obligation.grossMinor - serviceFee - obligation.taxMinor;
  const organizationFee = Math.min(
    part(fund?.organizationFeeMinor ?? 0),
    itemsMinor,
  );
  const processingFee = Math.min(
    Math.max(0, obligation.applicationFeeMinor - serviceFee - organizationFee),
    itemsMinor - organizationFee,
  );
  const itemsRefunded = Math.min(
    itemsMinor,
    Math.round(
      (input.refundGrossMinor * itemsMinor) /
        Math.max(1, obligation.grossMinor),
    ),
  );
  // The refund executor today returns every component pro rata (see
  // refund-fees.ts); the club's share follows what actually happened.
  const split = refundSplit({
    sale: {
      grossMinor: obligation.grossMinor,
      itemsMinor,
      serviceFeeMinor: serviceFee,
      organizationFeeMinor: organizationFee,
      processingFeeMinor: processingFee,
      taxMinor: obligation.taxMinor,
    },
    itemsRefundedMinor: itemsRefunded,
    cause: "club",
    rule: input.policy.refundFeeRule,
  });
  const alreadyFunded = await fundedProceedsMinor(obligation.id);
  let clubBears = Math.max(
    0,
    Math.min(split.clubBearsMinor, obligation.proceedsMinor - alreadyFunded),
  );
  if (clubBears <= 0) return 0;
  const held = Math.min(
    clubBears,
    Math.max(
      0,
      obligation.proceedsMinor - obligation.releasedMinor - alreadyFunded,
    ),
  );
  const sources: {
    source: "held-funds" | "available-balance" | "future-proceeds";
    amount: number;
  }[] = [];
  if (held > 0) sources.push({ source: "held-funds", amount: held });
  clubBears -= held;
  if (clubBears > 0) {
    const available = Math.min(
      clubBears,
      await availableBalanceMinor(obligation.organizationId, obligation.id),
    );
    if (available > 0)
      sources.push({ source: "available-balance", amount: available });
    clubBears -= available;
  }
  if (clubBears > 0)
    sources.push({ source: "future-proceeds", amount: clubBears });

  return getTransactionalDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`pay-refund:${input.refundRecordId}:${obligation.id}`}))`,
    );
    const [exists] = await transaction
      .select({ id: payObligationRefunds.id })
      .from(payObligationRefunds)
      .where(
        and(
          eq(payObligationRefunds.refundRecordId, input.refundRecordId),
          eq(payObligationRefunds.obligationId, obligation.id),
        ),
      )
      .limit(1);
    if (exists) return 0;
    await transaction.insert(payObligationRefunds).values(
      sources.map((entry, index) => ({
        organizationId: obligation.organizationId,
        obligationId: obligation.id,
        refundRecordId: input.refundRecordId,
        source: entry.source,
        amountMinor: entry.amount,
        serviceFeeKeptMinor: index === 0 ? split.serviceFeeKeptMinor : 0,
        currency: obligation.currency,
        createdAt: input.now,
      })),
    );
    log.info("pay.refund.funded", {
      obligationId: obligation.id,
      refundRecordId: input.refundRecordId,
      sources: sources.map((entry) => entry.source).join(","),
    });
    return sources.length;
  });
}

export async function fundPendingRefunds(input: {
  readonly policy: PayPolicySettings;
  readonly now: Date;
  readonly organizationId?: string;
  readonly limit?: number;
}): Promise<{ readonly funded: number; readonly failures: number }> {
  let funded = 0;
  let failures = 0;
  for (const refund of await unfundedRefunds(
    input.organizationId,
    input.limit ?? 500,
  )) {
    try {
      funded += await fundRefundRecord({
        refund,
        policy: input.policy,
        now: input.now,
      });
    } catch (error) {
      failures += 1;
      report(error, {
        event: "pay.refund.fundingFailed",
        fields: { refundRecordId: refund.id },
      });
    }
  }
  return { funded, failures };
}

/**
 * Proceeds refunded for the release plan: what funding records say, plus
 * any processor refund not funded yet (taken in full, conservatively).
 */
export async function refundedProceedsForPlan(input: {
  readonly obligation: Obligation;
  readonly refundedGrossShareMinor: number;
}): Promise<number> {
  const { obligation } = input;
  const database = getDatabase();
  const fundedRows = await database
    .select({
      amountMinor: payObligationRefunds.amountMinor,
      refundRecordId: payObligationRefunds.refundRecordId,
    })
    .from(payObligationRefunds)
    .where(eq(payObligationRefunds.obligationId, obligation.id));
  const funded = fundedRows.reduce((total, row) => total + row.amountMinor, 0);
  const recordIds = [...new Set(fundedRows.map((row) => row.refundRecordId))];
  let fundedGross = 0;
  if (recordIds.length) {
    const [records, siblings] = await Promise.all([
      database
        .select({ total: sum(refundRecords.amountMinor) })
        .from(refundRecords)
        .where(inArray(refundRecords.id, recordIds)),
      database
        .select({ total: sum(payObligations.grossMinor) })
        .from(payObligations)
        .where(eq(payObligations.orderId, obligation.orderId)),
    ]);
    const orderGross = Math.max(
      1,
      Number(siblings[0]?.total ?? obligation.grossMinor),
    );
    fundedGross = Math.round(
      (Number(records[0]?.total ?? 0) * obligation.grossMinor) / orderGross,
    );
  }
  const unfundedGross = Math.max(
    0,
    input.refundedGrossShareMinor - fundedGross,
  );
  return Math.min(obligation.proceedsMinor, funded + unfundedGross);
}
