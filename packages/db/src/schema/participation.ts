/**
 * Schema: participation (owner: PART-2). Group sessions that fill up:
 * one decision row per session-like thing (catalog occurrences, event
 * sessions, divisions, pickups), the rule snapshot taken at first booking,
 * the club default, the waitlist and invite links for group sessions,
 * attendance apart from settlement, money adjustments after the lock and
 * the notice outbox. Requested in docs/plan/schema-requests/PART.md;
 * design in docs/plan/participation.md. Additive only (migration 0118).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  catalogFulfillments,
  ledgerJournals,
  orders,
  organizations,
  people,
  refundRecords,
} from "../schema";
import {
  at,
  createdAtColumn,
  nullOrOneOf,
  oneOf,
  updatedAtColumn,
} from "./_columns";

export const participationSubjectTypes = [
  "catalog-session-occurrence",
  "session",
  "division",
  "pickup-session",
] as const;
export const participationDecisionOutcomes = [
  "minimum-met",
  "run-under-minimum",
  "cancel-under-minimum",
  "cancelled-by-club",
] as const;
export const participationCancelReasons = [
  "minimum-not-met",
  "coach",
  "weather",
  "venue",
  "merged",
  "other",
] as const;
export const participationForcedOutcomes = ["run"] as const;
export const participationDefaultKinds = [
  "service",
  "open-play",
  "pickup",
] as const;
export const participationReviewStates = [
  "pending",
  "kept",
  "changed",
] as const;
export const participationWaitlistStatuses = [
  "waiting",
  "offered",
  "accepted",
  "expired",
  "cancelled",
] as const;
export const participationAttendanceStatuses = ["attended", "absent"] as const;
export const participationBookingTypes = ["catalog-fulfillment"] as const;
export const participationAdjustmentKinds = [
  "late-cancel-final-price",
  "place-refilled",
  "card-group-difference",
] as const;
export const participationNoticeKinds = [
  "booked-needs-players",
  "needs-players-reminder",
  "confirmed",
  "cancelled-low",
  "cancelled-club",
  "lock-extended",
  "moved",
  "waitlist-offer",
  "place-refilled",
  "staff-at-risk-digest",
  "staff-cancelled",
  "refund-attention",
] as const;
export const participationNoticeChannels = [
  "in-app",
  "push",
  "email",
  "imessage",
  "whatsapp",
] as const;
export const participationNoticeStatuses = [
  "queued",
  "sent",
  "failed",
  "skipped",
] as const;
export const participationCancelRequestStatuses = [
  "open",
  "approved",
  "declined",
  "withdrawn",
] as const;

/** The club default every offering inherits (§2.3). One row per organisation. */
export const organizationParticipationDefaults = pgTable(
  "organization_participation_defaults",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Rule JSON v2 without tiers (ladders are per offering). */
    rules: jsonb("rules").notNull().$type<Record<string, unknown>>(),
    appliesTo: varchar("applies_to", { length: 24 })
      .array()
      .notNull()
      .default(sql`ARRAY['service']::varchar(24)[]`),
    updatedByPersonId: uuid("updated_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "organization_participation_defaults_applies_to_valid",
      sql`${table.appliesTo} <@ ARRAY['service', 'open-play', 'pickup']::varchar(24)[]`,
    ),
    check(
      "organization_participation_defaults_rules_object",
      sql`jsonb_typeof(${table.rules}) = 'object'`,
    ),
  ],
);

/** The engine's single state record for every subject type (§2.3, §4). */
export const participationDecisions = pgTable(
  "participation_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    /** Polymorphic: the service validates it. */
    subjectId: uuid("subject_id").notNull(),
    /** Rule JSON v2 as of the first booking. */
    ruleSnapshot: jsonb("rule_snapshot")
      .notNull()
      .$type<Record<string, unknown>>(),
    snapshotAt: at("snapshot_at").notNull(),
    /** Computed lock (start minus minutes, or the opened-late midpoint). */
    lockAt: at("lock_at").notNull(),
    /** "Extend the lock": later than `lock_at`, before the start (service check). */
    lockOverrideAt: at("lock_override_at"),
    forcedOutcome: varchar("forced_outcome", { length: 24 }),
    outcome: varchar("outcome", { length: 32 }),
    cancelReason: varchar("cancel_reason", { length: 24 }),
    mergedIntoSubjectId: uuid("merged_into_subject_id"),
    decidedAt: at("decided_at"),
    decidedGroupSize: integer("decided_group_size"),
    decidedByPersonId: uuid("decided_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    settledAt: at("settled_at"),
    settledGroupSize: integer("settled_group_size"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("participation_decisions_subject_unique").on(
      table.subjectType,
      table.subjectId,
    ),
    index("participation_decisions_open_lock_idx")
      .on(table.organizationId, table.lockAt)
      .where(sql`${table.outcome} IS NULL`),
    index("participation_decisions_outcome_idx").on(
      table.organizationId,
      table.subjectType,
      table.outcome,
    ),
    check(
      "participation_decisions_subject_type_valid",
      oneOf(table.subjectType, participationSubjectTypes),
    ),
    check(
      "participation_decisions_outcome_valid",
      nullOrOneOf(table.outcome, participationDecisionOutcomes),
    ),
    check(
      "participation_decisions_forced_outcome_valid",
      nullOrOneOf(table.forcedOutcome, participationForcedOutcomes),
    ),
    check(
      "participation_decisions_cancel_reason_valid",
      nullOrOneOf(table.cancelReason, participationCancelReasons),
    ),
    check(
      "participation_decisions_decided_together",
      sql`(${table.outcome} IS NULL AND ${table.decidedAt} IS NULL AND ${table.decidedGroupSize} IS NULL)
        OR (${table.outcome} IS NOT NULL AND ${table.decidedAt} IS NOT NULL AND ${table.decidedGroupSize} IS NOT NULL)`,
    ),
    check(
      "participation_decisions_group_sizes_valid",
      sql`(${table.decidedGroupSize} IS NULL OR ${table.decidedGroupSize} >= 0)
        AND (${table.settledGroupSize} IS NULL OR ${table.settledGroupSize} >= 0)`,
    ),
    check(
      "participation_decisions_settled_only_when_running",
      sql`${table.settledAt} IS NULL OR ${table.outcome} IN ('minimum-met', 'run-under-minimum')`,
    ),
    check(
      "participation_decisions_cancel_reason_iff_cancelled",
      sql`(${table.cancelReason} IS NOT NULL) = (${table.outcome} IS NOT NULL AND ${table.outcome} IN ('cancel-under-minimum', 'cancelled-by-club'))`,
    ),
    check(
      "participation_decisions_merged_reason",
      sql`${table.mergedIntoSubjectId} IS NULL OR ${table.cancelReason} = 'merged'`,
    ),
    check(
      "participation_decisions_rule_object",
      sql`jsonb_typeof(${table.ruleSnapshot}) = 'object'`,
    ),
  ],
);

/** Waitlist for subjects that have none of their own (catalog occurrences first). */
export const participationWaitlistEntries = pgTable(
  "participation_waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    /** The guardian when waiting for a junior. */
    requestedByPersonId: uuid("requested_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    position: integer("position").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("waiting"),
    offeredAt: at("offered_at"),
    holdExpiresAt: at("hold_expires_at"),
    acceptedAt: at("accepted_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("participation_waitlist_active_person_unique")
      .on(table.subjectType, table.subjectId, table.personId)
      .where(sql`${table.status} IN ('waiting', 'offered')`),
    uniqueIndex("participation_waitlist_position_unique").on(
      table.subjectType,
      table.subjectId,
      table.position,
    ),
    index("participation_waitlist_expiry_idx").on(
      table.status,
      table.holdExpiresAt,
    ),
    check(
      "participation_waitlist_subject_type_valid",
      oneOf(table.subjectType, participationSubjectTypes),
    ),
    check(
      "participation_waitlist_status_valid",
      oneOf(table.status, participationWaitlistStatuses),
    ),
    check(
      "participation_waitlist_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
    check(
      "participation_waitlist_position_positive",
      sql`${table.position} > 0`,
    ),
    check(
      "participation_waitlist_offer_has_hold",
      sql`${table.status} <> 'offered' OR (${table.offeredAt} IS NOT NULL AND ${table.holdExpiresAt} IS NOT NULL)`,
    ),
  ],
);

/** Share links that bring a friend into a specific session (§7.2). */
export const participationInvites = pgTable(
  "participation_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** Never a junior account (service check). */
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 24 }).notNull().unique(),
    /** The session start. */
    expiresAt: at("expires_at").notNull(),
    revokedAt: at("revoked_at"),
    /** Counts only, no visitor data. */
    openedCount: integer("opened_count").notNull().default(0),
    bookedCount: integer("booked_count").notNull().default(0),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("participation_invites_subject_idx").on(
      table.subjectType,
      table.subjectId,
    ),
    uniqueIndex("participation_invites_creator_subject_unique").on(
      table.subjectType,
      table.subjectId,
      table.createdByPersonId,
    ),
    check(
      "participation_invites_subject_type_valid",
      oneOf(table.subjectType, participationSubjectTypes),
    ),
    check(
      "participation_invites_code_format",
      sql`${table.code} ~ '^[A-Za-z0-9_-]{8,24}$'`,
    ),
    check(
      "participation_invites_counts_nonnegative",
      sql`${table.openedCount} >= 0 AND ${table.bookedCount} >= 0`,
    ),
  ],
);

/** Attendance apart from settlement, writable by the assigned coach (§6). */
export const participationAttendance = pgTable(
  "participation_attendance",
  {
    /** `catalog_fulfillments.id` (PART-9 adds other booking kinds). */
    bookingId: uuid("booking_id").primaryKey(),
    bookingType: varchar("booking_type", { length: 24 })
      .notNull()
      .default("catalog-fulfillment"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    status: varchar("status", { length: 12 }).notNull(),
    markedByPersonId: uuid("marked_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    /** Server time. */
    markedAt: at("marked_at").notNull(),
    /** Offline marks keep the device time. */
    deviceMarkedAt: at("device_marked_at"),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
  },
  (table) => [
    index("participation_attendance_subject_idx").on(
      table.subjectType,
      table.subjectId,
    ),
    check(
      "participation_attendance_status_valid",
      oneOf(table.status, participationAttendanceStatuses),
    ),
    check(
      "participation_attendance_booking_type_valid",
      oneOf(table.bookingType, participationBookingTypes),
    ),
    check(
      "participation_attendance_subject_type_valid",
      oneOf(table.subjectType, participationSubjectTypes),
    ),
  ],
);

/** Money after the lock other than the lock settlement itself (§5.2). */
export const participationAdjustments = pgTable(
  "participation_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogFulfillmentId: uuid("catalog_fulfillment_id")
      .notNull()
      .references(() => catalogFulfillments.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    /** Returned to the wallet. */
    credits: integer("credits").notNull().default(0),
    /** Refunded to the card. */
    amountMinor: bigint("amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    creditJournalId: uuid("credit_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    refundRecordId: uuid("refund_record_id").references(
      () => refundRecords.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("participation_adjustments_fulfillment_kind_unique").on(
      table.catalogFulfillmentId,
      table.kind,
    ),
    index("participation_adjustments_order_idx").on(table.orderId),
    check(
      "participation_adjustments_kind_valid",
      oneOf(table.kind, participationAdjustmentKinds),
    ),
    check(
      "participation_adjustments_amounts_nonnegative",
      sql`${table.credits} >= 0 AND ${table.amountMinor} >= 0`,
    ),
    check(
      "participation_adjustments_credit_journal_required",
      sql`${table.credits} = 0 OR ${table.creditJournalId} IS NOT NULL`,
    ),
    check(
      "participation_adjustments_refund_record_required",
      sql`(${table.credits} = 0 AND ${table.amountMinor} = 0) OR ${table.refundRecordId} IS NOT NULL`,
    ),
  ],
);

/** The notice outbox: one automatic notice per person, kind and session (§9). */
export const participationNotices = pgTable(
  "participation_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** The guardian for a junior's booking. */
    recipientPersonId: uuid("recipient_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    /** Null for staff digests. */
    bookingId: uuid("booking_id"),
    kind: varchar("kind", { length: 32 }).notNull(),
    /** Chosen at send time. */
    channel: varchar("channel", { length: 16 }),
    status: varchar("status", { length: 12 }).notNull().default("queued"),
    /** Quiet hours move it later. */
    scheduledFor: at("scheduled_for").notNull(),
    sentAt: at("sent_at"),
    /** Never message text. */
    errorCode: varchar("error_code", { length: 48 }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    unique("participation_notices_once")
      .on(
        table.subjectType,
        table.subjectId,
        table.recipientPersonId,
        table.kind,
        table.bookingId,
      )
      .nullsNotDistinct(),
    index("participation_notices_due_idx").on(table.status, table.scheduledFor),
    check(
      "participation_notices_subject_type_valid",
      oneOf(table.subjectType, participationSubjectTypes),
    ),
    check(
      "participation_notices_kind_valid",
      oneOf(table.kind, participationNoticeKinds),
    ),
    check(
      "participation_notices_channel_valid",
      nullOrOneOf(table.channel, participationNoticeChannels),
    ),
    check(
      "participation_notices_status_valid",
      oneOf(table.status, participationNoticeStatuses),
    ),
    check(
      "participation_notices_sent_has_time",
      sql`${table.status} <> 'sent' OR ${table.sentAt} IS NOT NULL`,
    ),
  ],
);

/**
 * A coach's "request to cancel" (§6, §8): appears in Today / Pro for the
 * directors with `payments:write`, who confirm `cancelSession`.
 */
export const participationCancelRequests = pgTable(
  "participation_cancel_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    requestedByPersonId: uuid("requested_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 24 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("open"),
    resolvedByPersonId: uuid("resolved_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    resolvedAt: at("resolved_at"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("participation_cancel_requests_open_unique")
      .on(table.subjectType, table.subjectId)
      .where(sql`${table.status} = 'open'`),
    index("participation_cancel_requests_org_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "participation_cancel_requests_subject_type_valid",
      oneOf(table.subjectType, participationSubjectTypes),
    ),
    check(
      "participation_cancel_requests_reason_valid",
      oneOf(table.reason, ["coach", "weather", "venue", "other"]),
    ),
    check(
      "participation_cancel_requests_status_valid",
      oneOf(table.status, participationCancelRequestStatuses),
    ),
  ],
);
