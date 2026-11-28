/**
 * Disputes end to end (payout-policy §5.1, Duna Pay terms §10).
 *
 * Processor webhook → `pay_dispute_cases` (one per processor dispute) →
 * on opening: a `dispute` hold on the sale for amount + fee, the club's
 * transfer reversed for that amount (capped at the club's proceeds), and a
 * balanced journal; on a win: the hold released, the reversed amount
 * re-transferred (minus the fee unless the processor returned it) and the
 * reversal journal reversed; on a loss (or when Duna accepts): the hold is
 * applied and the loss journal posted. Every step is idempotent: replaying a
 * webhook changes nothing (unique processor dispute id, deterministic
 * processor idempotency keys, journal idempotency keys).
 *
 * A person submits evidence from HQ (`submitDisputeEvidence`): explicit,
 * owner-only, idempotent. Evidence is stored as text and storage keys only.
 */
import {
  disputes,
  getDatabase,
  ledgerEntries,
  ledgerJournals,
  orders,
  organizations,
  payDisputeCases,
  payHolds,
  payObligations,
  payments,
  people,
} from "@duna/db";
import { assertBalancedJournal, type LedgerPosting } from "@duna/core";
import { log, report } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { ensureLedgerAccount } from "../../catalog-service";
import { currencySchema } from "../../contracts";
import type {
  payDisputeCaseSchema,
  payDisputeDetailSchema,
  payDisputesInputSchema,
} from "../../contracts/pay";
import {
  createConnectedTransfer,
  isStripeConfigured,
  reverseConnectedTransfer,
  submitProcessorDisputeEvidence,
} from "../../payments";
import { loadPayPolicySettings, type PayPolicySettings } from "./policy-settings";

type DisputeCase = typeof payDisputeCases.$inferSelect;
type CaseStatus = DisputeCase["status"];
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = new Set(["won", "lost", "accepted", "warning-closed"]);

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Processor status → case status (pure). */
export function disputeCaseStatus(
  processorStatus: string,
  current?: CaseStatus,
): CaseStatus {
  if (current === "accepted" && processorStatus === "lost") return "accepted";
  switch (processorStatus) {
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "warning_closed":
      return "warning-closed";
    case "under_review":
    case "warning_under_review":
      return current === "evidence-submitted" ? "evidence-submitted" : "under-review";
    default:
      return current === "evidence-submitted" ? "evidence-submitted" : "needs-response";
  }
}

/** The processor's dispute fee and whether it was returned (pure). */
export function disputeFee(balanceTransactions: unknown): {
  readonly feeMinor: number;
  readonly feeReturned: boolean;
} {
  const rows = Array.isArray(balanceTransactions)
    ? (balanceTransactions as Record<string, unknown>[])
    : [];
  const fees = rows.map((row) => num(row.fee) ?? 0);
  const feeMinor = Math.max(0, fees[0] ?? 0);
  const total = fees.reduce((sum, fee) => sum + fee, 0);
  return { feeMinor, feeReturned: rows.length > 1 && feeMinor > 0 && total <= 0 };
}

async function accounts(organizationId: string, currency: string) {
  const make = (code: string, name: string, accountType: "asset" | "expense") =>
    ensureLedgerAccount({
      organizationId,
      code,
      name,
      accountType,
      normalSide: "debit",
      unitKind: "money",
      unit: currency,
      currency,
    });
  const [clearing, disputed, losses, fees] = await Promise.all([
    make("STRIPE_CLEARING", "Payment processor clearing", "asset"),
    make("DUNA_PAY_DISPUTED", "Disputed proceeds held by Duna", "asset"),
    make("DUNA_PAY_DISPUTE_LOSSES", "Disputes lost", "expense"),
    make("DUNA_PAY_DISPUTE_FEES", "Dispute fees", "expense"),
  ]);
  return { clearing, disputed, losses, fees };
}

/** Post a balanced two-line journal once (idempotency key). Returns its id. */
export async function postPayJournal(input: {
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly description: string;
  readonly debitAccountId: string;
  readonly creditAccountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly occurredAt: Date;
  readonly reversalOfJournalId?: string;
  readonly metadata?: Record<string, unknown>;
}): Promise<string | undefined> {
  if (input.amountMinor <= 0) return undefined;
  const database = getDatabase();
  const [existing] = await database
    .select({ id: ledgerJournals.id })
    .from(ledgerJournals)
    .where(
      and(
        eq(ledgerJournals.organizationId, input.organizationId),
        eq(ledgerJournals.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
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
  const id = crypto.randomUUID();
  const inserted = await database
    .insert(ledgerJournals)
    .values({
      id,
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: input.description,
      status: "draft",
      reversalOfJournalId: input.reversalOfJournalId,
      occurredAt: input.occurredAt,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: ledgerJournals.id });
  if (!inserted.length) {
    const [winner] = await database
      .select({ id: ledgerJournals.id })
      .from(ledgerJournals)
      .where(
        and(
          eq(ledgerJournals.organizationId, input.organizationId),
          eq(ledgerJournals.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    return winner?.id;
  }
  await database.insert(ledgerEntries).values(
    postings.map((posting, sequence) => ({
      organizationId: input.organizationId,
      journalId: id,
      sequence,
      ...posting,
    })),
  );
  await database
    .update(ledgerJournals)
    .set({ status: "posted", postedAt: input.occurredAt })
    .where(eq(ledgerJournals.id, id));
  return id;
}

/**
 * Apply one processor dispute event. `legacyDisputeId` is the row the
 * existing `disputes` sync wrote. Idempotent.
 */
export async function synchronizePayDisputeCase(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly now: Date;
  readonly policy?: PayPolicySettings;
}): Promise<DisputeCase | undefined> {
  const policy = input.policy ?? loadPayPolicySettings();
  const processorDisputeId = str(input.object.id);
  const chargeId = str(input.object.charge);
  if (!processorDisputeId || !chargeId) return undefined;
  const database = getDatabase();
  const [payment] = await database
    .select()
    .from(payments)
    .where(eq(payments.stripeChargeId, chargeId))
    .limit(1);
  if (!payment) return undefined;
  const [order] = await database
    .select()
    .from(orders)
    .where(eq(orders.id, payment.orderId))
    .limit(1);
  if (!order?.organizationId) return undefined;
  const organizationId = order.organizationId;
  const [obligation] = await database
    .select()
    .from(payObligations)
    .where(eq(payObligations.paymentId, payment.id))
    .orderBy(asc(payObligations.createdAt))
    .limit(1);
  const [legacy] = await database
    .select({ id: disputes.id })
    .from(disputes)
    .where(eq(disputes.stripeDisputeId, processorDisputeId))
    .limit(1);
  const amountMinor = Math.max(0, num(input.object.amount) ?? 0);
  const currency = (str(input.object.currency) ?? order.currency).toUpperCase();
  const { feeMinor, feeReturned } = disputeFee(input.object.balance_transactions);
  const evidenceDetails = input.object.evidence_details as Record<string, unknown> | undefined;
  const dueBySeconds = num(evidenceDetails?.due_by);
  const evidenceDueBy = dueBySeconds ? new Date(dueBySeconds * 1_000) : undefined;
  const createdSeconds = num(input.object.created);
  const openedAt = createdSeconds ? new Date(createdSeconds * 1_000) : input.now;
  const organizationDue = new Date(
    openedAt.getTime() + policy.disputeOrganizationEvidenceDays * DAY_MS,
  );
  const processorStatus = str(input.object.status) ?? "needs_response";

  await database
    .insert(payDisputeCases)
    .values({
      organizationId,
      obligationId: obligation?.id,
      orderId: order.id,
      legacyDisputeId: legacy?.id,
      processorDisputeId,
      reason: (str(input.object.reason) ?? "general").slice(0, 48),
      status: disputeCaseStatus(processorStatus),
      amountMinor,
      feeMinor,
      feeReturned,
      currency,
      evidenceDueBy,
      organizationEvidenceDueBy:
        evidenceDueBy && evidenceDueBy < organizationDue ? evidenceDueBy : organizationDue,
      openedAt,
      closedAt: CLOSED.has(disputeCaseStatus(processorStatus)) ? input.now : null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing();
  let [dispute] = await database
    .select()
    .from(payDisputeCases)
    .where(eq(payDisputeCases.processorDisputeId, processorDisputeId))
    .limit(1);
  if (!dispute) return undefined;
  const nextStatus = disputeCaseStatus(processorStatus, dispute.status);
  const closing = CLOSED.has(nextStatus);
  await database
    .update(payDisputeCases)
    .set({
      status: nextStatus,
      amountMinor,
      feeMinor: Math.max(dispute.feeMinor, feeMinor),
      feeReturned,
      evidenceDueBy: evidenceDueBy ?? dispute.evidenceDueBy,
      closedAt: closing ? (dispute.closedAt ?? input.now) : null,
      legacyDisputeId: dispute.legacyDisputeId ?? legacy?.id,
      updatedAt: input.now,
    })
    .where(eq(payDisputeCases.id, dispute.id));
  [dispute] = await database
    .select()
    .from(payDisputeCases)
    .where(eq(payDisputeCases.id, dispute.id))
    .limit(1);
  if (!dispute) return undefined;
  if (nextStatus !== "warning-closed" && !processorStatus.startsWith("warning")) {
    await openDisputeMoney({ dispute, organizationId, obligation, payment, now: input.now });
  }
  if (closing) {
    await closeDisputeMoney({ dispute, organizationId, now: input.now });
  }
  log.info("pay.dispute.synchronized", {
    disputeCaseId: dispute.id,
    organizationId,
    status: nextStatus,
  });
  const [final] = await database
    .select()
    .from(payDisputeCases)
    .where(eq(payDisputeCases.id, dispute.id))
    .limit(1);
  return final;
}

/** Hold + transfer reversal + journal, once. */
async function openDisputeMoney(input: {
  readonly dispute: DisputeCase;
  readonly organizationId: string;
  readonly obligation: typeof payObligations.$inferSelect | undefined;
  readonly payment: typeof payments.$inferSelect;
  readonly now: Date;
}): Promise<void> {
  const { dispute } = input;
  const database = getDatabase();
  const owedMinor = dispute.amountMinor + dispute.feeMinor;
  if (!dispute.holdId) {
    const holdId = crypto.randomUUID();
    await database.insert(payHolds).values({
      id: holdId,
      organizationId: input.organizationId,
      obligationId: input.obligation?.id,
      disputeCaseId: dispute.id,
      kind: "dispute",
      status: "active",
      amountMinor: owedMinor,
      currency: dispute.currency,
      reason: "Card dispute opened: the amount and fee are held until it closes.",
      startsAt: input.now,
    });
    const claimed = await database
      .update(payDisputeCases)
      .set({ holdId, updatedAt: input.now })
      .where(and(eq(payDisputeCases.id, dispute.id), isNull(payDisputeCases.holdId)))
      .returning({ id: payDisputeCases.id });
    if (!claimed.length) {
      // Another delivery of the same webhook won: drop this duplicate hold.
      await database
        .update(payHolds)
        .set({ status: "released", releasedAt: input.now, updatedAt: input.now })
        .where(eq(payHolds.id, holdId));
    }
  }
  if (dispute.transferReversalId || !input.payment.stripeTransferId) return;
  const reversalMinor = Math.min(owedMinor, input.obligation?.proceedsMinor ?? owedMinor);
  if (reversalMinor <= 0) return;
  try {
    const reversal = isStripeConfigured()
      ? await reverseConnectedTransfer({
          transferId: input.payment.stripeTransferId,
          amountMinor: reversalMinor,
          idempotencyKey: `duna-dispute:${dispute.processorDisputeId}:reversal`,
        })
      : undefined;
    if (!reversal) return;
    const ledger = await accounts(input.organizationId, dispute.currency);
    const journalId = await postPayJournal({
      organizationId: input.organizationId,
      idempotencyKey: `pay-dispute:${dispute.id}:reversal`,
      sourceType: "dispute",
      sourceId: dispute.id,
      description: "Card dispute: proceeds reversed and held",
      debitAccountId: ledger.disputed,
      creditAccountId: ledger.clearing,
      amountMinor: reversal.amountMinor,
      currency: dispute.currency,
      occurredAt: input.now,
      metadata: { disputeCaseId: dispute.id },
    });
    await database
      .update(payDisputeCases)
      .set({
        transferReversalId: reversal.id,
        reversalLedgerJournalId: journalId,
        updatedAt: input.now,
      })
      .where(eq(payDisputeCases.id, dispute.id));
  } catch (error) {
    // The club's balance could not cover it (already paid out): the hold
    // stays, and reconciliation records the negative balance for recovery.
    report(error, {
      event: "pay.dispute.reversalFailed",
      fields: { disputeCaseId: dispute.id, organizationId: input.organizationId },
    });
  }
}

/** Win: release + re-transfer; loss or accepted: apply. Once. */
async function closeDisputeMoney(input: {
  readonly dispute: DisputeCase;
  readonly organizationId: string;
  readonly now: Date;
}): Promise<void> {
  const { dispute } = input;
  if (dispute.outcomeLedgerJournalId || dispute.status === "warning-closed") {
    if (dispute.holdId) await settleHold(dispute.holdId, "released", input.now);
    return;
  }
  const database = getDatabase();
  const won = dispute.status === "won";
  if (dispute.holdId) await settleHold(dispute.holdId, won ? "released" : "applied", input.now);
  const [reversalJournal] = dispute.reversalLedgerJournalId
    ? await database
        .select()
        .from(ledgerJournals)
        .where(eq(ledgerJournals.id, dispute.reversalLedgerJournalId))
        .limit(1)
    : [];
  const [reversalEntry] = reversalJournal
    ? await database
        .select({ amount: ledgerEntries.amount })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.journalId, reversalJournal.id))
        .limit(1)
    : [];
  const reversedMinor = reversalEntry?.amount ?? 0;
  const ledger = await accounts(input.organizationId, dispute.currency);
  let journalId: string | undefined;
  if (won && reversedMinor > 0) {
    const keptFeeMinor = dispute.feeReturned ? 0 : Math.min(dispute.feeMinor, reversedMinor);
    const backMinor = reversedMinor - keptFeeMinor;
    const [organization] = await database
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    if (backMinor > 0 && organization?.stripeAccountId && isStripeConfigured()) {
      try {
        const transfer = await createConnectedTransfer({
          connectedAccountId: organization.stripeAccountId,
          amountMinor: backMinor,
          currency: dispute.currency,
          idempotencyKey: `duna-dispute:${dispute.processorDisputeId}:retransfer`,
          reason: "dispute-won",
        });
        await database
          .update(payDisputeCases)
          .set({ retransferId: transfer.id, updatedAt: input.now })
          .where(eq(payDisputeCases.id, dispute.id));
      } catch (error) {
        report(error, {
          event: "pay.dispute.retransferFailed",
          fields: { disputeCaseId: dispute.id },
        });
        return;
      }
    }
    journalId = await postPayJournal({
      organizationId: input.organizationId,
      idempotencyKey: `pay-dispute:${dispute.id}:won`,
      sourceType: "dispute",
      sourceId: dispute.id,
      description: "Card dispute won: proceeds returned",
      debitAccountId: ledger.clearing,
      creditAccountId: ledger.disputed,
      amountMinor: backMinor,
      currency: dispute.currency,
      occurredAt: input.now,
      reversalOfJournalId: dispute.reversalLedgerJournalId ?? undefined,
    });
    if (keptFeeMinor > 0) {
      const feeJournal = await postPayJournal({
        organizationId: input.organizationId,
        idempotencyKey: `pay-dispute:${dispute.id}:fee`,
        sourceType: "dispute",
        sourceId: dispute.id,
        description: "Dispute fee kept by the processor",
        debitAccountId: ledger.fees,
        creditAccountId: ledger.disputed,
        amountMinor: keptFeeMinor,
        currency: dispute.currency,
        occurredAt: input.now,
      });
      journalId ??= feeJournal;
    }
  } else if (!won && reversedMinor > 0) {
    journalId = await postPayJournal({
      organizationId: input.organizationId,
      idempotencyKey: `pay-dispute:${dispute.id}:lost`,
      sourceType: "dispute",
      sourceId: dispute.id,
      description: "Card dispute lost",
      debitAccountId: ledger.losses,
      creditAccountId: ledger.disputed,
      amountMinor: reversedMinor,
      currency: dispute.currency,
      occurredAt: input.now,
    });
  }
  if (journalId) {
    await database
      .update(payDisputeCases)
      .set({ outcomeLedgerJournalId: journalId, updatedAt: input.now })
      .where(eq(payDisputeCases.id, dispute.id));
  }
  log.info("pay.dispute.closed", {
    disputeCaseId: dispute.id,
    organizationId: input.organizationId,
    outcome: dispute.status,
  });
}

async function settleHold(holdId: string, status: "released" | "applied", now: Date) {
  await getDatabase()
    .update(payHolds)
    .set({ status, releasedAt: now, updatedAt: now })
    .where(and(eq(payHolds.id, holdId), eq(payHolds.status, "active")));
}

/** Per obligation: open disputed amount and amount lost (for the release plan). */
export async function obligationDisputeTotals(obligationId: string): Promise<{
  readonly openMinor: number;
  readonly lostMinor: number;
}> {
  const rows = await getDatabase()
    .select({ status: payDisputeCases.status, amountMinor: payDisputeCases.amountMinor })
    .from(payDisputeCases)
    .where(eq(payDisputeCases.obligationId, obligationId));
  let openMinor = 0;
  let lostMinor = 0;
  for (const row of rows) {
    if (row.status === "lost" || row.status === "accepted") lostMinor += row.amountMinor;
    else if (!CLOSED.has(row.status)) openMinor += row.amountMinor;
  }
  return { openMinor, lostMinor };
}

// ── Read model and the evidence write ────────────────────────────────────────

type CaseSummary = z.infer<typeof payDisputeCaseSchema>;
type CaseDetail = z.infer<typeof payDisputeDetailSchema>;

function money(amountMinor: number, currency: string) {
  return {
    amountMinor: Math.max(0, amountMinor),
    currency: currencySchema.catch("USD").parse(currency.toUpperCase()),
  };
}

async function buyerFor(orderIds: readonly string[]) {
  if (!orderIds.length) return new Map<string, { personId: string; displayName: string }>();
  const rows = await getDatabase()
    .select({ orderId: orders.id, personId: people.id, displayName: people.displayName })
    .from(orders)
    .innerJoin(people, eq(orders.buyerPersonId, people.id))
    .where(inArray(orders.id, [...orderIds]));
  return new Map(
    rows
      .filter((row) => row.displayName)
      .map((row) => [row.orderId, { personId: row.personId, displayName: row.displayName! }]),
  );
}

function caseSummary(
  row: DisputeCase,
  buyer: { personId: string; displayName: string } | undefined,
): CaseSummary {
  return {
    id: row.id,
    obligationId: row.obligationId ?? undefined,
    orderId: row.orderId ?? undefined,
    buyer,
    reason: row.reason,
    status: row.status as CaseSummary["status"],
    amount: money(row.amountMinor, row.currency),
    fee: money(row.feeMinor, row.currency),
    feeReturned: row.feeReturned,
    evidenceDueBy: row.evidenceDueBy?.toISOString(),
    organizationEvidenceDueBy: row.organizationEvidenceDueBy?.toISOString(),
    evidenceSubmittedAt: row.evidenceSubmittedAt?.toISOString(),
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString(),
  };
}

function caseDetail(
  row: DisputeCase,
  buyer: { personId: string; displayName: string } | undefined,
): CaseDetail {
  const evidence = row.evidence as { explanation?: unknown; files?: unknown };
  const files = Array.isArray(evidence.files)
    ? (evidence.files as { storageKey?: unknown; label?: unknown }[])
        .filter((file) => typeof file.storageKey === "string" && file.storageKey)
        .map((file) => ({
          storageKey: file.storageKey as string,
          label:
            typeof file.label === "string" && file.label
              ? file.label
              : (file.storageKey as string),
        }))
    : [];
  return {
    ...caseSummary(row, buyer),
    evidence: {
      explanation:
        typeof evidence.explanation === "string" ? evidence.explanation : undefined,
      files,
    },
    holdId: row.holdId ?? undefined,
  };
}

/** The club's disputes (platform-side records: defect 2). Newest first. */
export async function listPayDisputes(
  organizationId: string,
  input: z.infer<typeof payDisputesInputSchema>,
): Promise<{ items: CaseSummary[]; nextCursor?: string }> {
  const limit = input.limit ?? 25;
  let after: SQL | undefined;
  if (input.cursor) {
    const [at, id] = input.cursor.split("|");
    const openedAt = at ? new Date(at) : undefined;
    if (openedAt && !Number.isNaN(openedAt.getTime()) && id) {
      after = or(
        lt(payDisputeCases.openedAt, openedAt),
        and(eq(payDisputeCases.openedAt, openedAt), lt(payDisputeCases.id, id)),
      );
    }
  }
  const rows = await getDatabase()
    .select()
    .from(payDisputeCases)
    .where(
      and(
        eq(payDisputeCases.organizationId, organizationId),
        input.status ? eq(payDisputeCases.status, input.status) : undefined,
        after,
      ),
    )
    .orderBy(desc(payDisputeCases.openedAt), desc(payDisputeCases.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const buyers = await buyerFor(page.flatMap((row) => (row.orderId ? [row.orderId] : [])));
  const last = page.at(-1);
  return {
    items: page.map((row) => caseSummary(row, row.orderId ? buyers.get(row.orderId) : undefined)),
    nextCursor:
      rows.length > limit && last ? `${last.openedAt.toISOString()}|${last.id}` : undefined,
  };
}

async function loadCase(organizationId: string, disputeCaseId: string) {
  const [row] = await getDatabase()
    .select()
    .from(payDisputeCases)
    .where(
      and(
        eq(payDisputeCases.id, disputeCaseId),
        eq(payDisputeCases.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

export async function loadPayDispute(
  organizationId: string,
  disputeCaseId: string,
): Promise<CaseDetail> {
  const row = await loadCase(organizationId, disputeCaseId);
  const buyers = await buyerFor(row.orderId ? [row.orderId] : []);
  return caseDetail(row, row.orderId ? buyers.get(row.orderId) : undefined);
}

/**
 * A person (owner) submits evidence. Idempotent by key: the same key
 * returns the stored case without a second processor call.
 */
export async function submitPayDisputeEvidence(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly disputeCaseId: string;
  readonly explanation: string;
  readonly fileStorageKeys: readonly string[];
  readonly idempotencyKey: string;
  readonly now: Date;
}): Promise<CaseDetail> {
  const row = await loadCase(input.organizationId, input.disputeCaseId);
  const stored = row.evidence as { idempotencyKey?: unknown };
  if (stored.idempotencyKey === input.idempotencyKey) {
    return loadPayDispute(input.organizationId, row.id);
  }
  if (row.status !== "needs-response") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Evidence can only be sent while the dispute needs a response.",
    });
  }
  if (!isStripeConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This feature is not configured yet.",
    });
  }
  const files = input.fileStorageKeys.map((storageKey) => ({
    storageKey,
    label: storageKey.split("/").at(-1) ?? storageKey,
  }));
  await submitProcessorDisputeEvidence({
    disputeId: row.processorDisputeId,
    explanation: [
      input.explanation,
      files.length ? `Supporting files held by the club: ${files.map((f) => f.label).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    idempotencyKey: `duna-dispute:${row.processorDisputeId}:evidence:${input.idempotencyKey}`,
  });
  await getDatabase()
    .update(payDisputeCases)
    .set({
      status: "evidence-submitted",
      evidence: { explanation: input.explanation, files, idempotencyKey: input.idempotencyKey },
      evidenceSubmittedAt: input.now,
      evidenceSubmittedByPersonId: input.actorPersonId,
      updatedAt: input.now,
    })
    .where(eq(payDisputeCases.id, row.id));
  log.info("pay.dispute.evidenceSubmitted", {
    disputeCaseId: row.id,
    organizationId: input.organizationId,
  });
  return loadPayDispute(input.organizationId, row.id);
}
