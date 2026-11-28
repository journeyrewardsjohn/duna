/**
 * Schema: premium (fees and Duna Premium; owner: B2). Store-agnostic Duna
 * Premium subscription state: the store that bills it (Duna Pay today; an
 * app store if the owner chooses in-app purchase) is a column, not a table.
 * Complimentary access stays in `duna_plus_grants`. Written by the W3-0
 * schema steward.
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
import { people } from "../schema";
import {
  at,
  createdAtColumn,
  currencyColumn,
  oneOf,
  updatedAtColumn,
  upperCurrency,
} from "./_columns";

export const premiumStores = [
  "duna-pay",
  "apple-app-store",
  "google-play",
] as const;
export const premiumStatuses = [
  "trialing",
  "active",
  "grace-period",
  "past-due",
  "cancel-at-period-end",
  "expired",
  "revoked",
  "refunded",
] as const;
export const premiumIntervals = ["month", "year"] as const;
export const premiumEventKinds = [
  "started",
  "trial-started",
  "renewed",
  "renewal-reminder-sent",
  "price-change-notice-sent",
  "trial-ending-reminder-sent",
  "payment-failed",
  "grace-period-started",
  "cancel-requested",
  "cancel-undone",
  "expired",
  "refunded",
  "revoked",
  "store-changed",
] as const;

export const premiumSubscriptions = pgTable(
  "premium_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    store: varchar("store", { length: 20 }).notNull(),
    /** The store's own subscription id (Stripe sub_…, App Store original transaction id). */
    storeSubscriptionRef: varchar("store_subscription_ref", {
      length: 192,
    }).notNull(),
    planKey: varchar("plan_key", { length: 48 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    billingInterval: varchar("billing_interval", { length: 8 }).notNull(),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    currency: currencyColumn(),
    autoRenews: boolean("auto_renews").notNull().default(true),
    trialEndsAt: at("trial_ends_at"),
    currentPeriodStartsAt: at("current_period_starts_at").notNull(),
    currentPeriodEndsAt: at("current_period_ends_at").notNull(),
    gracePeriodEndsAt: at("grace_period_ends_at"),
    cancelRequestedAt: at("cancel_requested_at"),
    endedAt: at("ended_at"),
    /** Price-change notice owed before the next renewal (CA / NY rules). */
    pendingPriceMinor: bigint("pending_price_minor", { mode: "number" }),
    pendingPriceEffectiveAt: at("pending_price_effective_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("premium_subscription_store_ref_unique").on(
      table.store,
      table.storeSubscriptionRef,
    ),
    index("premium_subscription_person_status_idx").on(
      table.personId,
      table.status,
    ),
    index("premium_subscription_renewal_idx").on(
      table.status,
      table.currentPeriodEndsAt,
    ),
    check(
      "premium_subscription_store_valid",
      oneOf(table.store, premiumStores),
    ),
    check(
      "premium_subscription_status_valid",
      oneOf(table.status, premiumStatuses),
    ),
    check(
      "premium_subscription_interval_valid",
      oneOf(table.billingInterval, premiumIntervals),
    ),
    check("premium_subscription_currency_valid", upperCurrency(table.currency)),
    check(
      "premium_subscription_price_valid",
      sql`${table.priceMinor} >= 0 AND (${table.pendingPriceMinor} IS NULL OR ${table.pendingPriceMinor} >= 0)`,
    ),
    check(
      "premium_subscription_period_valid",
      sql`${table.currentPeriodEndsAt} > ${table.currentPeriodStartsAt}`,
    ),
  ],
);

/** Append-only history: renewals, reminders and notices sent (ROSCA / ARL evidence). */
export const premiumSubscriptionEvents = pgTable(
  "premium_subscription_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => premiumSubscriptions.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    occurredAt: at("occurred_at").notNull().defaultNow(),
    /** Store notification id, used to make webhook handling idempotent. */
    storeEventRef: varchar("store_event_ref", { length: 192 }),
    note: text("note"),
    details: jsonb("details")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("premium_subscription_event_sub_idx").on(
      table.subscriptionId,
      table.occurredAt,
    ),
    uniqueIndex("premium_subscription_event_store_ref_unique")
      .on(table.subscriptionId, table.storeEventRef)
      .where(sql`${table.storeEventRef} IS NOT NULL`),
    check(
      "premium_subscription_event_kind_valid",
      oneOf(table.kind, premiumEventKinds),
    ),
  ],
);
