import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const websiteSites = pgTable(
  "club_websites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    name: text("name").notNull(),
    brief: text("brief").notNull().default(""),
    sourceUrl: text("source_url"),
    inspirationUrls: jsonb("inspiration_urls")
      .$type<string[]>()
      .notNull()
      .default([]),
    draft: jsonb("draft"),
    publishedRevisionId: uuid("published_revision_id"),
    vercelProjectId: text("vercel_project_id"),
    neonProjectId: text("neon_project_id"),
    domain: text("domain"),
    provisioningStatus: text("provisioning_status").notNull().default("draft"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [index("club_websites_org_idx").on(t.organizationId)],
);
export const websiteRevisions = pgTable(
  "website_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => websiteSites.id),
    organizationId: uuid("organization_id").notNull(),
    document: jsonb("document").notNull().default({}),
    operationId: text("operation_id"),
    leaseExpiresAt: time("lease_expires_at"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    brief: text("brief").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    deploymentId: text("deployment_id"),
    deploymentUrl: text("deployment_url"),
    status: text("status").notNull().default("draft"),
  },
  (t) => [
    index("website_revisions_site_idx").on(t.siteId),
    uniqueIndex("website_revision_operation_unique").on(
      t.siteId,
      t.operationId,
    ),
  ],
);
export const websiteSubscriptions = pgTable(
  "website_subscriptions",
  {
    siteId: uuid("site_id")
      .primaryKey()
      .references(() => websiteSites.id),
    organizationId: uuid("organization_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").notNull().default("inactive"),
    periodEndsAt: time("period_ends_at"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("website_subscription_stripe_unique").on(
      t.stripeSubscriptionId,
    ),
  ],
);
export const websiteCreditGrants = pgTable(
  "website_credit_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => websiteSites.id),
    organizationId: uuid("organization_id").notNull(),
    sourceId: text("source_id").notNull(),
    credits: integer("credits").notNull(),
    remaining: integer("remaining").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("website_credit_source_unique").on(t.sourceId),
    check(
      "website_credit_balance_valid",
      sql`${t.remaining} >= 0 AND ${t.remaining} <= ${t.credits}`,
    ),
  ],
);
export const websiteCreditReservations = pgTable(
  "website_credit_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => websiteSites.id),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => websiteCreditGrants.id),
    operationId: text("operation_id").notNull(),
    reserved: integer("reserved").notNull(),
    consumed: integer("consumed"),
    status: text("status").notNull().default("reserved"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("website_credit_operation_unique").on(t.siteId, t.operationId),
    check(
      "website_credit_reservation_valid",
      sql`${t.reserved} > 0 AND (${t.consumed} IS NULL OR (${t.consumed} >= 0 AND ${t.consumed} <= ${t.reserved}))`,
    ),
  ],
);
