/**
 * Schema: team-pay (owner: B3b). Compensation models (per session, hourly,
 * salary, revenue share), pay periods, pay runs and lines, and export
 * records. Duna computes and exports; it does not run payroll (W-2 is
 * tracked and exported only). Income goals reuse `operator_earnings_goals`.
 * Written by the W3-0 schema steward; request changes in
 * docs/plan/schema-requests/B3b.md.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizationStaffProfiles, organizations, people } from "../schema";
import {
  at,
  createdAtColumn,
  currencyColumn,
  oneOf,
  updatedAtColumn,
  upperCurrency,
} from "./_columns";

export const staffCompensationModels = [
  "per-session",
  "hourly",
  "salary",
  "revenue-share",
  "hourly-plus-share",
] as const;
export const staffWorkerClassifications = [
  "1099-contractor",
  "w2-employee",
] as const;
export const staffPayFrequencies = [
  "weekly",
  "every-2-weeks",
  "twice-monthly",
  "monthly",
] as const;
export const staffPayPeriodStatuses = ["open", "closed"] as const;
export const staffPayRunStatuses = [
  "draft",
  "computing",
  "ready-for-approval",
  "approved",
  "exported",
  "paying",
  "paid",
  "partially-paid",
  "cancelled",
] as const;
export const staffPayMethods = ["duna-pay", "export", "none"] as const;
export const staffPayLineStatuses = [
  "computed",
  "adjusted",
  "approved",
  "exported",
  "paying",
  "paid",
  "failed",
  "excluded",
] as const;
export const staffPayExportFormats = [
  "csv",
  "gusto",
  "adp",
  "quickbooks",
] as const;

/** One compensation model per staff member at a time, effective-dated. */
export const staffCompensation = pgTable(
  "staff_compensation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => organizationStaffProfiles.id, { onDelete: "cascade" }),
    model: varchar("model", { length: 20 }).notNull(),
    classification: varchar("classification", { length: 16 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    currency: currencyColumn(),
    hourlyRateMinor: bigint("hourly_rate_minor", { mode: "number" }),
    perSessionRateMinor: bigint("per_session_rate_minor", { mode: "number" }),
    annualSalaryMinor: bigint("annual_salary_minor", { mode: "number" }),
    revenueShareBps: integer("revenue_share_bps"),
    /** Catalog subtypes the share applies to, e.g. {"private-lesson"}. Empty = all. */
    revenueShareScope: text("revenue_share_scope")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("staff_compensation_staff_idx").on(
      table.staffProfileId,
      table.effectiveFrom,
    ),
    uniqueIndex("staff_compensation_current_unique")
      .on(table.staffProfileId)
      .where(sql`${table.effectiveTo} IS NULL`),
    check(
      "staff_compensation_model_valid",
      oneOf(table.model, staffCompensationModels),
    ),
    check(
      "staff_compensation_classification_valid",
      oneOf(table.classification, staffWorkerClassifications),
    ),
    check("staff_compensation_currency_valid", upperCurrency(table.currency)),
    check(
      "staff_compensation_dates_valid",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check(
      "staff_compensation_amounts_valid",
      sql`coalesce(${table.hourlyRateMinor}, 0) >= 0 AND coalesce(${table.perSessionRateMinor}, 0) >= 0 AND coalesce(${table.annualSalaryMinor}, 0) >= 0 AND (${table.revenueShareBps} IS NULL OR ${table.revenueShareBps} BETWEEN 0 AND 10000)`,
    ),
    check(
      "staff_compensation_model_shape",
      sql`(${table.model} = 'per-session' AND ${table.perSessionRateMinor} IS NOT NULL)
        OR (${table.model} = 'hourly' AND ${table.hourlyRateMinor} IS NOT NULL)
        OR (${table.model} = 'salary' AND ${table.annualSalaryMinor} IS NOT NULL)
        OR (${table.model} = 'revenue-share' AND ${table.revenueShareBps} IS NOT NULL)
        OR (${table.model} = 'hourly-plus-share' AND ${table.hourlyRateMinor} IS NOT NULL AND ${table.revenueShareBps} IS NOT NULL)`,
    ),
    check(
      "staff_compensation_salary_w2_only",
      sql`${table.model} <> 'salary' OR ${table.classification} = 'w2-employee'`,
    ),
  ],
);

/** The pay period the club selects (TM-PayRun: "Nov 16–29, every 2 weeks"). */
export const staffPayPeriods = pgTable(
  "staff_pay_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    frequency: varchar("frequency", { length: 16 }).notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    approveBy: date("approve_by", { mode: "string" }),
    status: varchar("status", { length: 8 }).notNull().default("open"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("staff_pay_period_org_start_unique").on(
      table.organizationId,
      table.startsOn,
    ),
    check(
      "staff_pay_period_frequency_valid",
      oneOf(table.frequency, staffPayFrequencies),
    ),
    check(
      "staff_pay_period_status_valid",
      oneOf(table.status, staffPayPeriodStatuses),
    ),
    check(
      "staff_pay_period_dates_valid",
      sql`${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

/** One computation of a period. Recomputing makes a new revision; the key keeps it idempotent. */
export const staffPayRuns = pgTable(
  "staff_pay_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    payPeriodId: uuid("pay_period_id")
      .notNull()
      .references(() => staffPayPeriods.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull().default(1),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    currency: currencyColumn(),
    contractorTotalMinor: bigint("contractor_total_minor", { mode: "number" })
      .notNull()
      .default(0),
    employeeTotalMinor: bigint("employee_total_minor", { mode: "number" })
      .notNull()
      .default(0),
    computedAt: at("computed_at"),
    approvedByPersonId: uuid("approved_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    approvedAt: at("approved_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("staff_pay_run_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    uniqueIndex("staff_pay_run_period_revision_unique").on(
      table.payPeriodId,
      table.revision,
    ),
    index("staff_pay_run_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "staff_pay_run_status_valid",
      oneOf(table.status, staffPayRunStatuses),
    ),
    check("staff_pay_run_currency_valid", upperCurrency(table.currency)),
    check(
      "staff_pay_run_totals_valid",
      sql`${table.contractorTotalMinor} >= 0 AND ${table.employeeTotalMinor} >= 0 AND ${table.revision} > 0`,
    ),
    check(
      "staff_pay_run_approved_shape",
      sql`${table.status} IN ('draft', 'computing', 'ready-for-approval', 'cancelled') OR ${table.approvedAt} IS NOT NULL`,
    ),
  ],
);

export const staffPayRunLines = pgTable(
  "staff_pay_run_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    payRunId: uuid("pay_run_id")
      .notNull()
      .references(() => staffPayRuns.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => organizationStaffProfiles.id, { onDelete: "restrict" }),
    compensationId: uuid("compensation_id").references(
      () => staffCompensation.id,
      { onDelete: "restrict" },
    ),
    classification: varchar("classification", { length: 16 }).notNull(),
    method: varchar("method", { length: 10 }).notNull(),
    status: varchar("status", { length: 10 }).notNull().default("computed"),
    sessionsCount: integer("sessions_count").notNull().default(0),
    minutesWorked: integer("minutes_worked").notNull().default(0),
    currency: currencyColumn(),
    earningsMinor: bigint("earnings_minor", { mode: "number" }).notNull(),
    adjustmentsMinor: bigint("adjustments_minor", { mode: "number" })
      .notNull()
      .default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    /** Per-session breakdown and labelled adjustments ("+ $180.00 share"). */
    details: jsonb("details")
      .notNull()
      .$type<{
        sessions?: readonly Record<string, unknown>[];
        adjustments?: readonly { label: string; amountMinor: number }[];
      }>()
      .default({}),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("staff_pay_run_line_unique").on(
      table.payRunId,
      table.staffProfileId,
    ),
    check(
      "staff_pay_run_line_classification_valid",
      oneOf(table.classification, staffWorkerClassifications),
    ),
    check(
      "staff_pay_run_line_method_valid",
      oneOf(table.method, staffPayMethods),
    ),
    check(
      "staff_pay_run_line_status_valid",
      oneOf(table.status, staffPayLineStatuses),
    ),
    check("staff_pay_run_line_currency_valid", upperCurrency(table.currency)),
    check(
      "staff_pay_run_line_amounts_valid",
      sql`${table.earningsMinor} >= 0 AND ${table.totalMinor} >= 0 AND ${table.totalMinor} = ${table.earningsMinor} + ${table.adjustmentsMinor} AND ${table.sessionsCount} >= 0 AND ${table.minutesWorked} >= 0`,
    ),
    check(
      "staff_pay_run_line_w2_not_paid_by_duna",
      sql`${table.classification} <> 'w2-employee' OR ${table.method} <> 'duna-pay'`,
    ),
  ],
);

/** A file handed to a payroll system or accountant. The file itself lives in storage. */
export const staffPayExports = pgTable(
  "staff_pay_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    payRunId: uuid("pay_run_id")
      .notNull()
      .references(() => staffPayRuns.id, { onDelete: "restrict" }),
    format: varchar("format", { length: 12 }).notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    rowCount: integer("row_count").notNull(),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("staff_pay_export_run_idx").on(table.payRunId),
    check(
      "staff_pay_export_format_valid",
      oneOf(table.format, staffPayExportFormats),
    ),
    check("staff_pay_export_rows_valid", sql`${table.rowCount} >= 0`),
  ],
);
