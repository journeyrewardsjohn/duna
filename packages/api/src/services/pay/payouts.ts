/**
 * Payouts from releasable tranches (payout-policy §3). The only path that
 * instructs the processor to send an organisation's money to its bank.
 *
 * Safe under concurrency and retries: one advisory lock per organisation;
 * tranches are claimed with `status = 'releasable' AND payout_id IS NULL`;
 * the processor call carries a deterministic idempotency key and the
 * `payouts` row a unique (organisation, idempotency key). A failed or
 * cancelled payout returns its tranches to `releasable` and posts a
 * reversal journal.
 */
import {
  getDatabase,
  getTransactionalDatabase,
  ledgerEntries,
  ledgerJournals,
  organizations,
  payHolds,
  payObligations,
  payReleaseTranches,
  paymentFundSchedules,
  payoutAllocations,
  payouts,
} from "@duna/db";
import { assertBalancedJournal, type LedgerPosting } from "@duna/core";
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
import { ensureLedgerAccount } from "../../catalog-service";
import {
  createConnectedAccountPayout,
  loadConnectedAccountMoney,
} from "../../payments";
import type { PayPolicySettings } from "./policy-settings";
import { openObligations, refreshObligation } from "./release-job";

type Organization = typeof organizations.$inferSelect;

async function payoutLedgerAccounts(organizationId: string, currency: string) {
  const [clearingId, paidOutId] = await Promise.all([
    ensureLedgerAccount({
      organizationId,
      code: "STRIPE_CLEARING",
      name: "Payment processor clearing",
      accountType: "asset",
      normalSide: "debit",
      unitKind: "money",
      unit: currency,
      currency,
    }),
    ensureLedgerAccount({
      organizationId,
      code: "DUNA_PAY_PAID_OUT",
      name: "Paid out to the organisation's bank",
      accountType: "asset",
      normalSide: "debit",
      unitKind: "money",
      unit: currency,
      currency,
    }),
  ]);
  return { clearingId, paidOutId };
}

function payoutPostings(input: {
  readonly debitAccountId: string;
  readonly creditAccountId: string;
  readonly amountMinor: number;
  readonly currency: string;
}): LedgerPosting[] {
  const postings: LedgerPosting[] = [
    {
      accountId: input.debitAccountId,
      side: "debit",
      amount: input.amountMinor,
      unit: input.currency,
      unitKind: "money",
      currency: input.currency,
    },
    {
      accountId: input.creditAccountId,
      side: "credit",
      amount: input.amountMinor,
      unit: input.currency,
      unitKind: "money",
      currency: input.currency,
    },
  ];
  assertBalancedJournal(postings);
  return postings;
}

/** Recompute the organisation's open obligations so the claim sees current facts. */
export async function refreshOrganizationObligations(input: {
  readonly organizationId: string;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<void> {
  for (const obligation of await openObligations({
    organizationId: input.organizationId,
    limit: 5_000,
  })) {
    try {
      await refreshObligation(obligation, input.policy, input.now);
    } catch (error) {
      report(error, {
        event: "pay.release.failed",
        fields: { obligationId: obligation.id },
      });
    }
  }
}

/** Active holds that are not tied to one sale (manual review, closure, negative balance). */
async function organizationHeldMinor(organizationId: string, currency: string) {
  const [row] = await getDatabase()
    .select({ total: sum(payHolds.amountMinor) })
    .from(payHolds)
    .where(
      and(
        eq(payHolds.organizationId, organizationId),
        eq(payHolds.status, "active"),
        eq(payHolds.currency, currency),
        isNull(payHolds.obligationId),
      ),
    );
  return Number(row?.total ?? 0);
}

export interface PayoutResult {
  readonly id: string;
  readonly amountMinor: number;
  readonly trancheCount: number;
}

/**
 * Pay out an organisation's releasable tranches. Returns undefined when
 * nothing is payable (below the minimum, no processor balance, nothing
 * releasable).
 */
export async function createPayoutFromReleasableTranches(input: {
  readonly organization: Organization;
  readonly minimumPayoutMinor: number;
  readonly idempotencyKey: string;
  readonly policy: PayPolicySettings;
  readonly now: Date;
}): Promise<PayoutResult | undefined> {
  const organization = input.organization;
  const stripeAccountId = organization.stripeAccountId;
  if (!stripeAccountId) return undefined;
  const currency = organization.currency.toUpperCase();
  await refreshOrganizationObligations({
    organizationId: organization.id,
    policy: input.policy,
    now: input.now,
  });
  const [{ clearingId, paidOutId }, withheldMinor] = await Promise.all([
    payoutLedgerAccounts(organization.id, currency),
    organizationHeldMinor(organization.id, currency),
  ]);

  const result = await getTransactionalDatabase().transaction(
    async (transaction) => {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`money-payout:${organization.id}`}))`,
      );
      const candidates = await transaction
        .select({ tranche: payReleaseTranches, obligation: payObligations })
        .from(payReleaseTranches)
        .innerJoin(
          payObligations,
          eq(payReleaseTranches.obligationId, payObligations.id),
        )
        .where(
          and(
            eq(payReleaseTranches.organizationId, organization.id),
            eq(payReleaseTranches.status, "releasable"),
            eq(payReleaseTranches.currency, currency),
            isNull(payReleaseTranches.payoutId),
            sql`${payReleaseTranches.amountMinor} > 0`,
            notInArray(payObligations.status, [
              "held",
              "disputed",
              "refunded",
              "cancelled",
            ]),
            eq(payObligations.disputedMinor, 0),
            sql`NOT EXISTS (SELECT 1 FROM pay_holds h WHERE h.obligation_id = ${payObligations.id} AND h.status = 'active')`,
          ),
        )
        .orderBy(
          asc(payReleaseTranches.releasableAt),
          asc(payReleaseTranches.id),
        );
      if (!candidates.length) return undefined;
      const money = await loadConnectedAccountMoney({
        accountId: stripeAccountId,
        currency,
      });
      let room = Math.max(0, (money.stripeAvailableMinor ?? 0) - withheldMinor);
      const selected: typeof candidates = [];
      for (const candidate of candidates) {
        if (candidate.tranche.amountMinor <= room) {
          selected.push(candidate);
          room -= candidate.tranche.amountMinor;
        }
      }
      const amountMinor = selected.reduce(
        (total, candidate) => total + candidate.tranche.amountMinor,
        0,
      );
      if (amountMinor <= 0 || amountMinor < input.minimumPayoutMinor) {
        return undefined;
      }
      const providerPayout = await createConnectedAccountPayout({
        accountId: stripeAccountId,
        amountMinor,
        currency,
        idempotencyKey: input.idempotencyKey,
      });
      const payoutId = crypto.randomUUID();
      const byFund = new Map<string, number>();
      for (const { tranche, obligation } of selected) {
        if (!obligation.fundScheduleId) continue;
        byFund.set(
          obligation.fundScheduleId,
          (byFund.get(obligation.fundScheduleId) ?? 0) + tranche.amountMinor,
        );
      }
      await transaction.insert(payouts).values({
        id: payoutId,
        organizationId: organization.id,
        idempotencyKey: input.idempotencyKey,
        stripePayoutId: providerPayout.id,
        amountMinor,
        currency,
        status: providerPayout.status,
        expectedArrivalAt: providerPayout.expectedArrivalAt,
        composition: Object.fromEntries(byFund),
        createdAt: input.now,
        updatedAt: input.now,
      });
      if (byFund.size) {
        await transaction.insert(payoutAllocations).values(
          [...byFund].map(([fundId, allocated]) => ({
            payoutId,
            paymentFundScheduleId: fundId,
            amountMinor: allocated,
            currency,
            createdAt: input.now,
          })),
        );
      }
      const journalId = crypto.randomUUID();
      const postings = payoutPostings({
        debitAccountId: paidOutId,
        creditAccountId: clearingId,
        amountMinor,
        currency,
      });
      await transaction.insert(ledgerJournals).values({
        id: journalId,
        organizationId: organization.id,
        idempotencyKey: `pay-payout:${payoutId}`,
        sourceType: "payout",
        sourceId: payoutId,
        description: "Payout to the organisation's bank",
        status: "draft",
        occurredAt: input.now,
        metadata: { payoutId, trancheCount: selected.length },
      });
      await transaction.insert(ledgerEntries).values(
        postings.map((posting, sequence) => ({
          organizationId: organization.id,
          journalId,
          sequence,
          ...posting,
        })),
      );
      await transaction
        .update(ledgerJournals)
        .set({ status: "posted", postedAt: input.now })
        .where(eq(ledgerJournals.id, journalId));
      const claimed = await transaction
        .update(payReleaseTranches)
        .set({
          status: "released",
          releasedAt: input.now,
          payoutId,
          ledgerJournalId: journalId,
          updatedAt: input.now,
        })
        .where(
          and(
            inArray(
              payReleaseTranches.id,
              selected.map(({ tranche }) => tranche.id),
            ),
            eq(payReleaseTranches.status, "releasable"),
            isNull(payReleaseTranches.payoutId),
          ),
        )
        .returning({ id: payReleaseTranches.id });
      if (claimed.length !== selected.length) {
        // Impossible under the lock; abort so no money is recorded twice.
        throw new Error("Releasable tranches changed during payout creation.");
      }
      // A fund schedule is fully paid once none of its obligations has open money.
      for (const fundId of byFund.keys()) {
        const [open] = await transaction
          .select({ count: sql<number>`count(*)` })
          .from(payReleaseTranches)
          .innerJoin(
            payObligations,
            eq(payReleaseTranches.obligationId, payObligations.id),
          )
          .where(
            and(
              eq(payObligations.fundScheduleId, fundId),
              notInArray(payReleaseTranches.status, [
                "released",
                "cancelled",
                "reversed",
              ]),
              sql`${payReleaseTranches.amountMinor} > 0`,
            ),
          );
        await transaction
          .update(paymentFundSchedules)
          .set({
            payoutId,
            ...(Number(open?.count ?? 0) === 0
              ? { status: "payout-pending" }
              : {}),
            updatedAt: input.now,
          })
          .where(eq(paymentFundSchedules.id, fundId));
      }
      return {
        id: payoutId,
        amountMinor,
        trancheCount: selected.length,
      };
    },
  );
  if (!result) return undefined;
  // Obligations whose last open portion was just paid are now closed.
  await refreshOrganizationObligations({
    organizationId: organization.id,
    policy: input.policy,
    now: input.now,
  });
  log.info("pay.payout.created", {
    payoutId: result.id,
    organizationId: organization.id,
    trancheCount: result.trancheCount,
  });
  return result;
}

/**
 * The processor reports a payout failed or was cancelled: its tranches are
 * releasable again and the payout journal is reversed. Idempotent.
 */
export async function returnFailedPayoutTranches(input: {
  readonly payoutId: string;
  readonly now: Date;
}): Promise<number> {
  const database = getDatabase();
  const [payout] = await database
    .select()
    .from(payouts)
    .where(eq(payouts.id, input.payoutId))
    .limit(1);
  if (!payout?.organizationId) return 0;
  const organizationId = payout.organizationId;
  const returned = await getTransactionalDatabase().transaction(
    async (transaction) => {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`money-payout:${organizationId}`}))`,
      );
      const rows = await transaction
        .update(payReleaseTranches)
        .set({
          status: "releasable",
          releasedAt: null,
          payoutId: null,
          ledgerJournalId: null,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(payReleaseTranches.payoutId, payout.id),
            eq(payReleaseTranches.status, "released"),
          ),
        )
        .returning({ id: payReleaseTranches.id });
      const [journal] = await transaction
        .select()
        .from(ledgerJournals)
        .where(
          and(
            eq(ledgerJournals.organizationId, organizationId),
            eq(ledgerJournals.idempotencyKey, `pay-payout:${payout.id}`),
          ),
        )
        .limit(1);
      if (journal) {
        const [reversed] = await transaction
          .select({ id: ledgerJournals.id })
          .from(ledgerJournals)
          .where(eq(ledgerJournals.reversalOfJournalId, journal.id))
          .limit(1);
        if (!reversed) {
          const entries = await transaction
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.journalId, journal.id))
            .orderBy(asc(ledgerEntries.sequence));
          const reversalId = crypto.randomUUID();
          const postings: LedgerPosting[] = entries.map((entry) => ({
            accountId: entry.accountId,
            side: entry.side === "debit" ? "credit" : "debit",
            amount: entry.amount,
            unit: entry.unit,
            unitKind: entry.unitKind,
            currency: entry.currency ?? undefined,
          }));
          assertBalancedJournal(postings);
          await transaction.insert(ledgerJournals).values({
            id: reversalId,
            organizationId,
            idempotencyKey: `pay-payout:${payout.id}:reversal`,
            sourceType: "payout",
            sourceId: payout.id,
            description: "Payout returned by the bank or cancelled",
            status: "draft",
            reversalOfJournalId: journal.id,
            occurredAt: input.now,
            metadata: { payoutId: payout.id },
          });
          await transaction.insert(ledgerEntries).values(
            postings.map((posting, sequence) => ({
              organizationId,
              journalId: reversalId,
              sequence,
              ...posting,
            })),
          );
          await transaction
            .update(ledgerJournals)
            .set({ status: "posted", postedAt: input.now })
            .where(eq(ledgerJournals.id, reversalId));
        }
      }
      return rows.length;
    },
  );
  if (returned) {
    log.warn("pay.payout.returned", {
      payoutId: payout.id,
      organizationId,
      trancheCount: returned,
    });
  }
  return returned;
}
