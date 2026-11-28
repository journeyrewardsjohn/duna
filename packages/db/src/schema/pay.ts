/**
 * Schema: pay (owner: B2). Duna Pay: connected-account state, the payout
 * policy (docs/plan/payout-policy.md) as obligations, delivery events,
 * release tranches, holds, reserves, disputes and recoveries, and the fees a
 * buyer is shown up front. Written by the W3-0 schema steward; request
 * changes in docs/plan/schema-requests/B2.md.
 *
 * Reused, not duplicated:
 * - `organization_money_settings` (payout schedule, minimum, descriptors),
 *   `organization_refund_policies`, `organizations.stripe_tax_enabled`.
 * - `payment_fund_schedules` stays the per-charge Stripe view; an obligation
 *   links to it.
 * - Money movement is posted to the existing double-entry ledger
 *   (`ledger_journals` / `ledger_entries`, append-only with reversal
 *   journals). Rows here point at the journal that moved the money.
 *
 * Money is integer minor units beside an ISO 4217 currency. Append-only:
 * `pay_delivery_events` (guarded by a trigger in the migration).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  catalogItems,
  disputes,
  ledgerJournals,
  orderItems,
  orders,
  organizations,
  paymentFundSchedules,
  payments,
  payouts,
  people,
  refundRecords,
  sessions,
} from "../schema";
import {
  at,
  createdAtColumn,
  currencyColumn,
  oneOf,
  updatedAtColumn,
  upperCurrency,
} from "./_columns";

/** The six statuses HQ shows (DP-Status), derived from the processor's account. */
export const payAccountStatuses = [
  "not-started",
  "in-progress",
  "verifying",
  "action-needed",
  "restricted",
  "ready",
] as const;
export const payBankStatuses = [
  "missing",
  "pending",
  "verified",
  "errored",
] as const;

/** How an obligation becomes deliverable (payout-policy §4). */
export const payDeliveryRules = [
  "scheduled-end",
  "event-last-day",
  "pro-rata-sessions",
  "pro-rata-weekly",
  "membership-period",
  "credit-pack-reserve",
  "goods-fulfilment",
  "instant",
] as const;
export const payObligationStatuses = [
  "pending-settlement",
  "awaiting-delivery",
  "partially-released",
  "released",
  "held",
  "disputed",
  "partially-refunded",
  "refunded",
  "cancelled",
] as const;
export const payTrancheKinds = [
  "full",
  "session-share",
  "weekly-portion",
  "start-tranche",
  "membership-period",
  "reserve-remainder",
] as const;
export const payTrancheStatuses = [
  "scheduled",
  "delivered",
  "releasable",
  "held",
  "released",
  "reversed",
  "cancelled",
] as const;
export const payDeliveryEventKinds = [
  "booking-ended",
  "session-ended",
  "event-last-day-ended",
  "weekly-portion-elapsed",
  "membership-payment-received",
  "refund-window-ended",
  "credit-redeemed",
  "credit-refunded",
  "goods-fulfilled",
  "goods-shipped",
  "goods-cancel-offered",
  "access-granted",
  "paid-in-person",
  "delivery-cancelled",
] as const;
export const payHoldKinds = [
  "dispute",
  "first-payout-delay",
  "rolling-reserve",
  "unredeemed-credit-reserve",
  "negative-balance",
  "closure",
  "manual-review",
] as const;
export const payHoldStatuses = ["active", "released", "applied"] as const;
export const payReserveKinds = [
  "rolling",
  "unredeemed-credit",
  "closure",
] as const;
export const payReserveTriggers = [
  "new-organization-high-volume",
  "refund-rate",
  "dispute-rate",
  "long-dated-sales",
  "business-change",
  "processor-requirement",
  "standing-credit-reserve",
  "closure",
] as const;
export const payReserveStatuses = [
  "proposed",
  "active",
  "under-review",
  "released",
] as const;
export const payDisputeStatuses = [
  "needs-response",
  "evidence-submitted",
  "under-review",
  "won",
  "lost",
  "accepted",
  "warning-closed",
] as const;
export const payRefundSources = [
  "held-funds",
  "available-balance",
  "future-proceeds",
  "bank-debit",
] as const;
export const payRecoveryKinds = ["set-off", "bank-debit", "invoice"] as const;
export const payRecoveryStatuses = [
  "pending",
  "collected",
  "failed",
  "written-off",
] as const;
export const payFeeQuoteSurfaces = [
  "web-checkout",
  "player-app",
  "pro-app",
  "hq-point-of-sale",
  "public-page",
] as const;

/**
 * One row per organisation: the derived Duna Pay status and the facts the
 * status screens show. Tax ID, representative and bank details stay with
 * the processor; only statuses, requirements and the bank's last four are
 * mirrored.
 */
export const organizationPayAccounts = pgTable(
  "organization_pay_accounts",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("not-started"),
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    cardPaymentsActive: boolean("card_payments_active")
      .notNull()
      .default(false),
    /** Requirement codes the processor reports, e.g. ["representative.dob"]. */
    requirementsDue: jsonb("requirements_due")
      .notNull()
      .$type<readonly { code: string; label: string }[]>()
      .default([]),
    requirementsDueBy: at("requirements_due_by"),
    disabledReason: varchar("disabled_reason", { length: 64 }),
    bankStatus: varchar("bank_status", { length: 16 })
      .notNull()
      .default("missing"),
    bankLast4: varchar("bank_last4", { length: 4 }),
    bankName: text("bank_name"),
    onboardingMethod: varchar("onboarding_method", { length: 16 })
      .notNull()
      .default("hosted"),
    /** Business facts confirmed on DP-Business (legal name lives on organizations). */
    businessType: varchar("business_type", { length: 32 }),
    whatYouSell: text("what_you_sell"),
    firstChargeAt: at("first_charge_at"),
    /** payout-policy §5.3: first payout no earlier than this. */
    firstPayoutNotBefore: at("first_payout_not_before"),
    firstPayoutDelayWaivedAt: at("first_payout_delay_waived_at"),
    firstPayoutDelayWaivedByPersonId: uuid(
      "first_payout_delay_waived_by_person_id",
    ).references(() => people.id, { onDelete: "set null" }),
    /** Note B: optional start tranche (≤ 25%) for organisations in good standing. */
    startTrancheOptIn: boolean("start_tranche_opt_in").notNull().default(false),
    startTrancheBps: integer("start_tranche_bps").notNull().default(0),
    /** Suspension / closure workflow (§5.6). */
    salesSuspendedAt: at("sales_suspended_at"),
    closureNoticeAt: at("closure_notice_at"),
    syncedAt: at("synced_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("organization_pay_account_status_idx").on(table.status),
    check(
      "organization_pay_account_status_valid",
      oneOf(table.status, payAccountStatuses),
    ),
    check(
      "organization_pay_account_bank_status_valid",
      oneOf(table.bankStatus, payBankStatuses),
    ),
    check(
      "organization_pay_account_onboarding_valid",
      oneOf(table.onboardingMethod, ["hosted", "embedded"]),
    ),
    check(
      "organization_pay_account_bank_last4_valid",
      sql`${table.bankLast4} IS NULL OR ${table.bankLast4} ~ '^[0-9]{4}$'`,
    ),
    check(
      "organization_pay_account_start_tranche_valid",
      sql`${table.startTrancheBps} BETWEEN 0 AND 2500 AND (${table.startTrancheOptIn} OR ${table.startTrancheBps} = 0)`,
    ),
    check(
      "organization_pay_account_ready_shape",
      sql`${table.status} <> 'ready' OR (${table.chargesEnabled} AND ${table.payoutsEnabled})`,
    ),
  ],
);

/**
 * What Duna owes an organisation for one sold line: the proceeds of a
 * payment, how it is delivered, and how much has been released, refunded,
 * disputed or reserved. One row per order item (or per payment when the
 * order has a single line).
 */
export const payObligations = pgTable(
  "pay_obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "restrict",
    }),
    fundScheduleId: uuid("fund_schedule_id").references(
      () => paymentFundSchedules.id,
      { onDelete: "set null" },
    ),
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, {
      onDelete: "set null",
    }),
    /** Catalog type/subtype at sale time, e.g. "service/court-rental". */
    productKind: varchar("product_kind", { length: 64 }).notNull(),
    deliveryRule: varchar("delivery_rule", { length: 24 }).notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("pending-settlement"),
    currency: currencyColumn(),
    grossMinor: bigint("gross_minor", { mode: "number" }).notNull(),
    applicationFeeMinor: bigint("application_fee_minor", { mode: "number" })
      .notNull()
      .default(0),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    /** Organisation proceeds = gross − application fee − tax collected by Duna. */
    proceedsMinor: bigint("proceeds_minor", { mode: "number" }).notNull(),
    releasedMinor: bigint("released_minor", { mode: "number" })
      .notNull()
      .default(0),
    refundedMinor: bigint("refunded_minor", { mode: "number" })
      .notNull()
      .default(0),
    disputedMinor: bigint("disputed_minor", { mode: "number" })
      .notNull()
      .default(0),
    reservedMinor: bigint("reserved_minor", { mode: "number" })
      .notNull()
      .default(0),
    settledAt: at("settled_at"),
    /** Scheduled delivery window (booking end, event last day, program end). */
    deliveryStartsAt: at("delivery_starts_at"),
    deliveryEndsAt: at("delivery_ends_at"),
    /** Memberships with full-within-window refunds release after this (note C). */
    refundWindowEndsAt: at("refund_window_ends_at"),
    /** Goods (note E): stated ship-by, else purchase + 30 days. */
    shipByAt: at("ship_by_at"),
    buyerCancelEligibleAt: at("buyer_cancel_eligible_at"),
    /** Snapshot of the refund policy shown at purchase. */
    refundPolicySnapshot: jsonb("refund_policy_snapshot")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("pay_obligation_order_item_unique")
      .on(table.orderItemId)
      .where(sql`${table.orderItemId} IS NOT NULL`),
    index("pay_obligation_org_status_idx").on(
      table.organizationId,
      table.status,
      table.deliveryEndsAt,
    ),
    index("pay_obligation_order_idx").on(table.orderId),
    index("pay_obligation_payment_idx").on(table.paymentId),
    check(
      "pay_obligation_rule_valid",
      oneOf(table.deliveryRule, payDeliveryRules),
    ),
    check(
      "pay_obligation_status_valid",
      oneOf(table.status, payObligationStatuses),
    ),
    check("pay_obligation_currency_valid", upperCurrency(table.currency)),
    check(
      "pay_obligation_amounts_valid",
      sql`${table.grossMinor} >= 0 AND ${table.applicationFeeMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.proceedsMinor} >= 0 AND ${table.proceedsMinor} = ${table.grossMinor} - ${table.applicationFeeMinor} - ${table.taxMinor}`,
    ),
    check(
      "pay_obligation_progress_valid",
      sql`${table.releasedMinor} >= 0 AND ${table.refundedMinor} >= 0 AND ${table.disputedMinor} >= 0 AND ${table.reservedMinor} >= 0 AND ${table.refundedMinor} <= ${table.grossMinor}`,
    ),
    check(
      "pay_obligation_delivery_window_valid",
      sql`${table.deliveryStartsAt} IS NULL OR ${table.deliveryEndsAt} IS NULL OR ${table.deliveryEndsAt} >= ${table.deliveryStartsAt}`,
    ),
  ],
);

/**
 * The release schedule: one portion of an obligation that becomes payable
 * when its delivery condition is met (a session's pro-rata share, a weekly
 * portion, a start tranche, the whole amount).
 */
export const payReleaseTranches = pgTable(
  "pay_release_tranches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => payObligations.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("scheduled"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyColumn(),
    /** The session this share belongs to, when the rule is pro-rata by session. */
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    /** When delivery is scheduled (session end, week end, event last day). */
    deliveryDueAt: at("delivery_due_at"),
    deliveredAt: at("delivered_at"),
    /** Later of settlement, delivery, refund window and first-payout delay. */
    releasableAt: at("releasable_at"),
    releasedAt: at("released_at"),
    payoutId: uuid("payout_id").references(() => payouts.id, {
      onDelete: "set null",
    }),
    ledgerJournalId: uuid("ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("pay_release_tranche_sequence_unique").on(
      table.obligationId,
      table.sequence,
    ),
    index("pay_release_tranche_due_idx").on(
      table.organizationId,
      table.status,
      table.releasableAt,
    ),
    index("pay_release_tranche_session_idx")
      .on(table.sessionId)
      .where(sql`${table.sessionId} IS NOT NULL`),
    check("pay_release_tranche_kind_valid", oneOf(table.kind, payTrancheKinds)),
    check(
      "pay_release_tranche_status_valid",
      oneOf(table.status, payTrancheStatuses),
    ),
    check("pay_release_tranche_amount_valid", sql`${table.amountMinor} >= 0`),
    check("pay_release_tranche_sequence_valid", sql`${table.sequence} >= 0`),
    check("pay_release_tranche_currency_valid", upperCurrency(table.currency)),
    check(
      "pay_release_tranche_released_shape",
      sql`(${table.status} = 'released') = (${table.releasedAt} IS NOT NULL)`,
    ),
  ],
);

/** Append-only facts that something was delivered (or will not be). */
export const payDeliveryEvents = pgTable(
  "pay_delivery_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => payObligations.id, { onDelete: "restrict" }),
    trancheId: uuid("tranche_id").references(() => payReleaseTranches.id, {
      onDelete: "restrict",
    }),
    kind: varchar("kind", { length: 32 }).notNull(),
    occurredAt: at("occurred_at").notNull(),
    /** Where the fact came from: "session", "court_booking", "catalog_fulfillment", "cron", "person". */
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceId: varchar("source_id", { length: 128 }),
    actorPersonId: uuid("actor_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    /** Goods: carrier and tracking number; credits: credits redeemed. Never card data. */
    details: jsonb("details")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("pay_delivery_event_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("pay_delivery_event_obligation_idx").on(
      table.obligationId,
      table.occurredAt,
    ),
    check(
      "pay_delivery_event_kind_valid",
      oneOf(table.kind, payDeliveryEventKinds),
    ),
  ],
);

/** An amount Duna is not releasing, and why (§5). */
export const payHolds = pgTable(
  "pay_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    obligationId: uuid("obligation_id").references(() => payObligations.id, {
      onDelete: "restrict",
    }),
    reserveId: uuid("reserve_id"),
    disputeCaseId: uuid("dispute_case_id"),
    kind: varchar("kind", { length: 28 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("active"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyColumn(),
    reason: text("reason").notNull(),
    startsAt: at("starts_at").notNull().defaultNow(),
    releaseAfter: at("release_after"),
    releasedAt: at("released_at"),
    placedByPersonId: uuid("placed_by_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    ledgerJournalId: uuid("ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("pay_hold_org_status_idx").on(table.organizationId, table.status),
    index("pay_hold_obligation_idx")
      .on(table.obligationId)
      .where(sql`${table.obligationId} IS NOT NULL`),
    check("pay_hold_kind_valid", oneOf(table.kind, payHoldKinds)),
    check("pay_hold_status_valid", oneOf(table.status, payHoldStatuses)),
    check("pay_hold_amount_valid", sql`${table.amountMinor} >= 0`),
    check("pay_hold_currency_valid", upperCurrency(table.currency)),
    check(
      "pay_hold_released_shape",
      sql`(${table.status} = 'active') = (${table.releasedAt} IS NULL)`,
    ),
  ],
);

/**
 * A reserve on an organisation's proceeds with the notice the policy
 * requires (reason, percentage, duration, review date). Stripe caps a
 * reserve at 180 days; the standing Unredeemed Credit Reserve has no end.
 */
export const payReserves = pgTable(
  "pay_reserves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 20 }).notNull(),
    trigger: varchar("trigger", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("proposed"),
    percentBps: integer("percent_bps").notNull(),
    startsAt: at("starts_at"),
    endsAt: at("ends_at"),
    reviewAt: at("review_at"),
    noticeReason: text("notice_reason").notNull(),
    noticeSentAt: at("notice_sent_at"),
    /** Measured rates that triggered it, e.g. { refundRateBps: 1100 }. */
    evidence: jsonb("evidence")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    decidedByPersonId: uuid("decided_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    releasedAt: at("released_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("pay_reserve_org_status_idx").on(table.organizationId, table.status),
    check("pay_reserve_kind_valid", oneOf(table.kind, payReserveKinds)),
    check(
      "pay_reserve_trigger_valid",
      oneOf(table.trigger, payReserveTriggers),
    ),
    check("pay_reserve_status_valid", oneOf(table.status, payReserveStatuses)),
    check(
      "pay_reserve_percent_valid",
      sql`${table.percentBps} BETWEEN 1 AND 10000`,
    ),
    check(
      "pay_reserve_duration_valid",
      sql`${table.kind} = 'unredeemed-credit' OR ${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR (${table.endsAt} > ${table.startsAt} AND ${table.endsAt} <= ${table.startsAt} + interval '180 days')`,
    ),
    check(
      "pay_reserve_active_shape",
      sql`${table.status} NOT IN ('active', 'under-review') OR (${table.startsAt} IS NOT NULL AND ${table.noticeSentAt} IS NOT NULL AND ${table.reviewAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * A card dispute on a destination charge: Duna is debited, holds the amount
 * plus the fee, reverses the transfer, and re-transfers on a win (§5.1).
 */
export const payDisputeCases = pgTable(
  "pay_dispute_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    obligationId: uuid("obligation_id").references(() => payObligations.id, {
      onDelete: "restrict",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    legacyDisputeId: uuid("legacy_dispute_id").references(() => disputes.id, {
      onDelete: "set null",
    }),
    processorDisputeId: varchar("processor_dispute_id", { length: 128 })
      .notNull()
      .unique(),
    reason: varchar("reason", { length: 48 }).notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("needs-response"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    feeMinor: bigint("fee_minor", { mode: "number" }).notNull().default(0),
    feeReturned: boolean("fee_returned").notNull().default(false),
    currency: currencyColumn(),
    /** The processor's deadline, and the earlier one asked of the organisation (7 days, owner). */
    evidenceDueBy: at("evidence_due_by"),
    organizationEvidenceDueBy: at("organization_evidence_due_by"),
    evidenceSubmittedAt: at("evidence_submitted_at"),
    evidenceSubmittedByPersonId: uuid(
      "evidence_submitted_by_person_id",
    ).references(() => people.id, { onDelete: "set null" }),
    /** File references only (storage keys), never card data. */
    evidence: jsonb("evidence")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    transferReversalId: varchar("transfer_reversal_id", { length: 128 }),
    retransferId: varchar("retransfer_id", { length: 128 }),
    holdId: uuid("hold_id").references(() => payHolds.id, {
      onDelete: "set null",
    }),
    reversalLedgerJournalId: uuid("reversal_ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    outcomeLedgerJournalId: uuid("outcome_ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    openedAt: at("opened_at").notNull(),
    closedAt: at("closed_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("pay_dispute_case_org_status_idx").on(
      table.organizationId,
      table.status,
      table.evidenceDueBy,
    ),
    check(
      "pay_dispute_case_status_valid",
      oneOf(table.status, payDisputeStatuses),
    ),
    check(
      "pay_dispute_case_amounts_valid",
      sql`${table.amountMinor} >= 0 AND ${table.feeMinor} >= 0`,
    ),
    check("pay_dispute_case_currency_valid", upperCurrency(table.currency)),
    check(
      "pay_dispute_case_closed_shape",
      sql`(${table.status} IN ('won', 'lost', 'accepted', 'warning-closed')) = (${table.closedAt} IS NOT NULL)`,
    ),
  ],
);

/** How each refund of an obligation was funded, in the §5.2 order. */
export const payObligationRefunds = pgTable(
  "pay_obligation_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => payObligations.id, { onDelete: "restrict" }),
    refundRecordId: uuid("refund_record_id")
      .notNull()
      .references(() => refundRecords.id, { onDelete: "restrict" }),
    source: varchar("source", { length: 20 }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    /** Service Fee kept by Duna on a player cancellation within policy (O1). */
    serviceFeeKeptMinor: bigint("service_fee_kept_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: currencyColumn(),
    ledgerJournalId: uuid("ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("pay_obligation_refund_obligation_idx").on(table.obligationId),
    index("pay_obligation_refund_record_idx").on(table.refundRecordId),
    check(
      "pay_obligation_refund_source_valid",
      oneOf(table.source, payRefundSources),
    ),
    check(
      "pay_obligation_refund_amount_valid",
      sql`${table.amountMinor} > 0 AND ${table.serviceFeeKeptMinor} >= 0`,
    ),
    check(
      "pay_obligation_refund_currency_valid",
      upperCurrency(table.currency),
    ),
  ],
);

/** Negative-balance recovery and set-off (§5.5). */
export const payRecoveries = pgTable(
  "pay_recoveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 12 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyColumn(),
    /** What is owed: "negative-balance", "plan-fee", "video-overage", "website-addon". */
    owedFor: varchar("owed_for", { length: 32 }).notNull(),
    dueAt: at("due_at"),
    invoiceReference: varchar("invoice_reference", { length: 128 }),
    collectedAt: at("collected_at"),
    ledgerJournalId: uuid("ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("pay_recovery_org_status_idx").on(table.organizationId, table.status),
    check("pay_recovery_kind_valid", oneOf(table.kind, payRecoveryKinds)),
    check(
      "pay_recovery_status_valid",
      oneOf(table.status, payRecoveryStatuses),
    ),
    check("pay_recovery_amount_valid", sql`${table.amountMinor} > 0`),
    check("pay_recovery_currency_valid", upperCurrency(table.currency)),
  ],
);

/**
 * The fees a buyer was shown before paying: the player Service Fee and the
 * Organization (platform) Fee, with the processing estimate inside Duna's
 * application fee. Kept as evidence of up-front disclosure.
 */
export const payFeeQuotes = pgTable(
  "pay_fee_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    buyerPersonId: uuid("buyer_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, {
      onDelete: "set null",
    }),
    surface: varchar("surface", { length: 20 }).notNull(),
    currency: currencyColumn(),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    serviceFeeMinor: bigint("service_fee_minor", { mode: "number" })
      .notNull()
      .default(0),
    organizationFeeMinor: bigint("organization_fee_minor", { mode: "number" })
      .notNull()
      .default(0),
    processingEstimateMinor: bigint("processing_estimate_minor", {
      mode: "number",
    })
      .notNull()
      .default(0),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    /** Version of the fee rules in @duna/pricing that produced the quote. */
    feeRuleVersion: varchar("fee_rule_version", { length: 32 }).notNull(),
    /** Premium members pay no Service Fee where the plan says so. */
    premiumApplied: boolean("premium_applied").notNull().default(false),
    shownAt: at("shown_at").notNull().defaultNow(),
    expiresAt: at("expires_at"),
    acceptedAt: at("accepted_at"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("pay_fee_quote_order_idx")
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),
    index("pay_fee_quote_org_shown_idx").on(
      table.organizationId,
      table.shownAt,
    ),
    check(
      "pay_fee_quote_surface_valid",
      oneOf(table.surface, payFeeQuoteSurfaces),
    ),
    check("pay_fee_quote_currency_valid", upperCurrency(table.currency)),
    check(
      "pay_fee_quote_amounts_valid",
      sql`${table.subtotalMinor} >= 0 AND ${table.serviceFeeMinor} >= 0 AND ${table.organizationFeeMinor} >= 0 AND ${table.processingEstimateMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.totalMinor} = ${table.subtotalMinor} + ${table.serviceFeeMinor} + ${table.taxMinor}`,
    ),
  ],
);
