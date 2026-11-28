/**
 * Schema: team-payouts (owner: B3c). 1099 contractors paid through their own
 * connected account. A person starts every payout; nothing moves while the
 * kill switch `team.contractorPayouts` is off or the processor is not
 * configured. Written by the W3-0 schema steward.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  ledgerJournals,
  organizationStaffProfiles,
  organizations,
  people,
} from "../schema";
import { payAccountStatuses } from "./pay";
import { staffPayRunLines } from "./team-pay";
import {
  at,
  createdAtColumn,
  currencyColumn,
  oneOf,
  updatedAtColumn,
  upperCurrency,
} from "./_columns";

/** Same six derived statuses as an organisation's Duna Pay account. */
export const staffConnectedAccountStatuses = payAccountStatuses;
export const staffContractorPayoutStatuses = [
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
] as const;

/**
 * A contractor's own connected account. It belongs to the person, so one
 * account serves every organisation that pays them; `organizationId` is the
 * organisation that invited them to connect.
 */
export const staffConnectedAccounts = pgTable(
  "staff_connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    invitedByOrganizationId: uuid("invited_by_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    processorAccountId: varchar("processor_account_id", { length: 128 })
      .notNull()
      .unique(),
    status: varchar("status", { length: 16 }).notNull().default("not-started"),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    requirementsDue: jsonb("requirements_due")
      .notNull()
      .$type<readonly { code: string; label: string }[]>()
      .default([]),
    bankLast4: varchar("bank_last4", { length: 4 }),
    syncedAt: at("synced_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("staff_connected_account_person_unique").on(table.personId),
    check(
      "staff_connected_account_status_valid",
      oneOf(table.status, staffConnectedAccountStatuses),
    ),
    check(
      "staff_connected_account_bank_last4_valid",
      sql`${table.bankLast4} IS NULL OR ${table.bankLast4} ~ '^[0-9]{4}$'`,
    ),
  ],
);

/** One transfer to a contractor for one approved pay-run line. */
export const staffContractorPayouts = pgTable(
  "staff_contractor_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => organizationStaffProfiles.id, { onDelete: "restrict" }),
    payRunLineId: uuid("pay_run_line_id")
      .notNull()
      .references(() => staffPayRunLines.id, { onDelete: "restrict" }),
    connectedAccountId: uuid("connected_account_id")
      .notNull()
      .references(() => staffConnectedAccounts.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyColumn(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    processorTransferId: varchar("processor_transfer_id", { length: 128 }),
    failureCode: varchar("failure_code", { length: 64 }),
    initiatedByPersonId: uuid("initiated_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    initiatedAt: at("initiated_at").notNull().defaultNow(),
    paidAt: at("paid_at"),
    note: text("note"),
    ledgerJournalId: uuid("ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("staff_contractor_payout_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    uniqueIndex("staff_contractor_payout_line_active_unique")
      .on(table.payRunLineId)
      .where(sql`${table.status} IN ('pending', 'processing', 'paid')`),
    index("staff_contractor_payout_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "staff_contractor_payout_status_valid",
      oneOf(table.status, staffContractorPayoutStatuses),
    ),
    check(
      "staff_contractor_payout_amount_valid",
      sql`${table.amountMinor} > 0`,
    ),
    check(
      "staff_contractor_payout_currency_valid",
      upperCurrency(table.currency),
    ),
    check(
      "staff_contractor_payout_paid_shape",
      sql`(${table.status} = 'paid') = (${table.paidAt} IS NOT NULL)`,
    ),
  ],
);
