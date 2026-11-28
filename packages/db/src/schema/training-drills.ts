/**
 * Schema: training-drills (owners: B5 library, B6a scene model). Scopes
 * (mine, club, Duna library, purchased), review before a public listing,
 * free or priced listings, purchases, and drill scenes as versioned JSON
 * documents. The scene validator lives in code (`packages/training-scene`),
 * never in SQL. New columns on `training_drills` (`scope`,
 * `owner_person_id`, `review_state`) live in ../schema.ts. Paid organisation
 * purchases still grant a `training_drill_licenses` row.
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
  orders,
  organizations,
  people,
  trainingDrillLicenses,
  trainingDrillVersions,
  trainingDrills,
} from "../schema";
import {
  at,
  createdAtColumn,
  currencyColumn,
  oneOf,
  updatedAtColumn,
  upperCurrency,
} from "./_columns";

/** `training_drills.scope`: who owns it. "Purchased" is derived from purchases. */
export const trainingDrillScopes = ["personal", "club", "duna"] as const;
/** `training_drills.review_state`: review before public listing. */
export const trainingDrillReviewStates = [
  "not-submitted",
  "checks-running",
  "in-review",
  "changes-requested",
  "approved",
  "rejected",
] as const;
export const trainingDrillReviewCheckKinds = [
  "scene-valid",
  "no-personal-data",
  "duna-review",
] as const;
export const trainingDrillReviewCheckStatuses = [
  "waiting",
  "ok",
  "failed",
] as const;
export const trainingDrillListingStatuses = [
  "draft",
  "pending-review",
  "listed",
  "delisted",
  "rejected",
] as const;
export const trainingDrillListingPricings = ["free", "paid"] as const;
export const trainingDrillPurchaseStatuses = [
  "pending",
  "complete",
  "refunded",
  "revoked",
] as const;
export const trainingSceneValidationStatuses = [
  "unchecked",
  "valid",
  "invalid",
] as const;
export const trainingSceneSources = ["coach", "ai", "converted"] as const;

/** One check in a version's review (DL-Share: scene check, no names or photos, Duna review). */
export const trainingDrillReviewChecks = pgTable(
  "training_drill_review_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillVersionId: uuid("drill_version_id")
      .notNull()
      .references(() => trainingDrillVersions.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).notNull(),
    status: varchar("status", { length: 8 }).notNull().default("waiting"),
    note: text("note"),
    reviewerPersonId: uuid("reviewer_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    decidedAt: at("decided_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("training_drill_review_check_unique").on(
      table.drillVersionId,
      table.kind,
    ),
    check(
      "training_drill_review_check_kind_valid",
      oneOf(table.kind, trainingDrillReviewCheckKinds),
    ),
    check(
      "training_drill_review_check_status_valid",
      oneOf(table.status, trainingDrillReviewCheckStatuses),
    ),
  ],
);

/** A drill offered to every Duna club, free or for a price. */
export const trainingDrillListings = pgTable(
  "training_drill_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => trainingDrills.id, { onDelete: "restrict" }),
    /** The approved version buyers receive. */
    drillVersionId: uuid("drill_version_id")
      .notNull()
      .references(() => trainingDrillVersions.id, { onDelete: "restrict" }),
    sellerOrganizationId: uuid("seller_organization_id").references(
      () => organizations.id,
      { onDelete: "restrict" },
    ),
    sellerPersonId: uuid("seller_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    pricing: varchar("pricing", { length: 8 }).notNull().default("free"),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull().default(0),
    currency: currencyColumn(),
    licenseTerms: text("license_terms").notNull(),
    listedAs: text("listed_as").notNull(),
    listedAt: at("listed_at"),
    delistedAt: at("delisted_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("training_drill_listing_active_unique")
      .on(table.drillId)
      .where(sql`${table.status} IN ('draft', 'pending-review', 'listed')`),
    index("training_drill_listing_store_idx").on(table.status, table.listedAt),
    check(
      "training_drill_listing_status_valid",
      oneOf(table.status, trainingDrillListingStatuses),
    ),
    check(
      "training_drill_listing_pricing_valid",
      oneOf(table.pricing, trainingDrillListingPricings),
    ),
    check(
      "training_drill_listing_currency_valid",
      upperCurrency(table.currency),
    ),
    check(
      "training_drill_listing_price_shape",
      sql`(${table.pricing} = 'free' AND ${table.priceMinor} = 0) OR (${table.pricing} = 'paid' AND ${table.priceMinor} > 0)`,
    ),
    check(
      "training_drill_listing_one_seller",
      sql`num_nonnulls(${table.sellerOrganizationId}, ${table.sellerPersonId}) = 1`,
    ),
    check(
      "training_drill_listing_listed_shape",
      sql`${table.status} <> 'listed' OR ${table.listedAt} IS NOT NULL`,
    ),
  ],
);

/** A buyer took a listing (free or paid). Paid club purchases also hold a licence. */
export const trainingDrillPurchases = pgTable(
  "training_drill_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => trainingDrillListings.id, { onDelete: "restrict" }),
    buyerOrganizationId: uuid("buyer_organization_id").references(
      () => organizations.id,
      { onDelete: "restrict" },
    ),
    buyerPersonId: uuid("buyer_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    status: varchar("status", { length: 10 }).notNull().default("pending"),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull().default(0),
    currency: currencyColumn(),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    licenseId: uuid("license_id").references(() => trainingDrillLicenses.id, {
      onDelete: "set null",
    }),
    purchasedByPersonId: uuid("purchased_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    completedAt: at("completed_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("training_drill_purchase_org_unique")
      .on(table.listingId, table.buyerOrganizationId)
      .where(
        sql`${table.buyerOrganizationId} IS NOT NULL AND ${table.status} IN ('pending', 'complete')`,
      ),
    uniqueIndex("training_drill_purchase_person_unique")
      .on(table.listingId, table.buyerPersonId)
      .where(
        sql`${table.buyerPersonId} IS NOT NULL AND ${table.status} IN ('pending', 'complete')`,
      ),
    index("training_drill_purchase_buyer_org_idx").on(
      table.buyerOrganizationId,
    ),
    check(
      "training_drill_purchase_status_valid",
      oneOf(table.status, trainingDrillPurchaseStatuses),
    ),
    check(
      "training_drill_purchase_one_buyer",
      sql`num_nonnulls(${table.buyerOrganizationId}, ${table.buyerPersonId}) = 1`,
    ),
    check("training_drill_purchase_price_valid", sql`${table.priceMinor} >= 0`),
    check(
      "training_drill_purchase_currency_valid",
      upperCurrency(table.currency),
    ),
    check(
      "training_drill_purchase_paid_has_order",
      sql`${table.priceMinor} = 0 OR ${table.status} = 'pending' OR ${table.orderId} IS NOT NULL`,
    ),
  ],
);

/**
 * The scene of a drill version (model v2: metres from the net centre, people
 * separate from slots). One scene per drill version; editing makes a new
 * drill version. `derived` caches touches / jumps / metres from the scene.
 */
export const trainingDrillScenes = pgTable(
  "training_drill_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillVersionId: uuid("drill_version_id")
      .notNull()
      .unique()
      .references(() => trainingDrillVersions.id, { onDelete: "cascade" }),
    modelVersion: integer("model_version").notNull(),
    document: jsonb("document").notNull().$type<Record<string, unknown>>(),
    derived: jsonb("derived")
      .notNull()
      .$type<{
        touchesPerRep?: number;
        jumpsPerRep?: number;
        metresPerPlayer?: number;
        workRestRatio?: string;
      }>()
      .default({}),
    validationStatus: varchar("validation_status", { length: 10 })
      .notNull()
      .default("unchecked"),
    /** Validator rule ids that failed, with messages; empty when valid. */
    validationIssues: jsonb("validation_issues")
      .notNull()
      .$type<readonly { rule: string; message: string }[]>()
      .default([]),
    validatorVersion: varchar("validator_version", { length: 32 }),
    validatedAt: at("validated_at"),
    source: varchar("source", { length: 10 }).notNull().default("coach"),
    /** Coach edits pinned over an AI layout survive a re-layout. */
    hasPinnedEdits: boolean("has_pinned_edits").notNull().default(false),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "training_drill_scene_model_version_valid",
      sql`${table.modelVersion} >= 2`,
    ),
    check(
      "training_drill_scene_validation_valid",
      oneOf(table.validationStatus, trainingSceneValidationStatuses),
    ),
    check(
      "training_drill_scene_source_valid",
      oneOf(table.source, trainingSceneSources),
    ),
    check(
      "training_drill_scene_validated_shape",
      sql`${table.validationStatus} = 'unchecked' OR ${table.validatedAt} IS NOT NULL`,
    ),
  ],
);
