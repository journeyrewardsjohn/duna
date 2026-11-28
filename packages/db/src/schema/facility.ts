/**
 * Schema: facility (owner: B9). Facility owners (public courts): a listing
 * per venue, access rules by court, weekday, time and season, approvals with
 * expiry, links to the existing waiver library, and stop-play for courts.
 * Courts, venues and bookings stay in ../schema.ts. Written by the W3-0
 * schema steward; request changes in docs/plan/schema-requests/B9.md.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  organizations,
  people,
  venues,
  waiverDocuments,
  waiverExecutions,
} from "../schema";
import {
  at,
  createdAtColumn,
  currencyColumn,
  nullOrOneOf,
  oneOf,
  updatedAtColumn,
  upperCurrency,
} from "./_columns";

export const facilityListingStatuses = [
  "draft",
  "live",
  "paused",
  "archived",
] as const;
/** Who may reserve (F-Access). */
export const facilityAccessModes = [
  "anyone",
  "approved-only",
  "members-only",
  "first-come",
  "open-play",
  "residents-first",
] as const;
export const facilityPayoutModes = ["connected", "free-only"] as const;
export const facilityLightingSummaries = [
  "all-lit",
  "some-lit",
  "no-lights",
] as const;
export const facilityLightningActions = [
  "pause-and-notify",
  "cancel-and-refund",
  "notify-only",
] as const;
export const facilityRuleStatuses = ["draft", "active", "archived"] as const;
export const facilityAccessRequestStatuses = [
  "requested",
  "approved",
  "declined",
  "expired",
  "removed",
] as const;
export const courtPlayStopReasons = [
  "lightning",
  "weather",
  "maintenance",
  "event",
  "other",
] as const;
export const courtPlayStopSources = ["manual", "weather-alert"] as const;
export const courtPlayStopStatuses = ["active", "lifted", "expired"] as const;

/** A venue listed for public reservation by its owner (F-Onboarding, F-Listing, F-Policies). */
export const facilityListings = pgTable(
  "facility_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .unique()
      .references(() => venues.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 96 }).notNull().unique(),
    status: varchar("status", { length: 10 }).notNull().default("draft"),
    defaultAccess: varchar("default_access", { length: 16 })
      .notNull()
      .default("anyone"),
    lighting: varchar("lighting", { length: 10 })
      .notNull()
      .default("no-lights"),
    payoutMode: varchar("payout_mode", { length: 10 })
      .notNull()
      .default("free-only"),
    pricePerCourtHourMinor: bigint("price_per_court_hour_minor", {
      mode: "number",
    })
      .notNull()
      .default(0),
    currency: currencyColumn(),
    waiverDocumentId: uuid("waiver_document_id").references(
      () => waiverDocuments.id,
      { onDelete: "set null" },
    ),
    freeCancelMinutes: integer("free_cancel_minutes"),
    noShowPolicy: text("no_show_policy"),
    maxHoursPerPersonPerDay: integer("max_hours_per_person_per_day"),
    maxHoursPerPersonPerWeek: integer("max_hours_per_person_per_week"),
    bookingWindowDays: integer("booking_window_days").notNull().default(7),
    maxPlayersPerCourt: integer("max_players_per_court"),
    lightsOffAt: time("lights_off_at"),
    noiseEndsAt: time("noise_ends_at"),
    lightningRadiusKm: doublePrecision("lightning_radius_km"),
    lightningAction: varchar("lightning_action", { length: 20 }),
    /** Auto-approve: waiver signed and a verified adult. */
    autoApproveSignedAdults: boolean("auto_approve_signed_adults")
      .notNull()
      .default(false),
    publishedAt: at("published_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("facility_listing_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "facility_listing_status_valid",
      oneOf(table.status, facilityListingStatuses),
    ),
    check(
      "facility_listing_access_valid",
      oneOf(table.defaultAccess, facilityAccessModes),
    ),
    check(
      "facility_listing_lighting_valid",
      oneOf(table.lighting, facilityLightingSummaries),
    ),
    check(
      "facility_listing_payout_valid",
      oneOf(table.payoutMode, facilityPayoutModes),
    ),
    check(
      "facility_listing_lightning_action_valid",
      nullOrOneOf(table.lightningAction, facilityLightningActions),
    ),
    check("facility_listing_currency_valid", upperCurrency(table.currency)),
    check(
      "facility_listing_price_valid",
      sql`${table.pricePerCourtHourMinor} >= 0 AND (${table.payoutMode} = 'connected' OR ${table.pricePerCourtHourMinor} = 0)`,
    ),
    check(
      "facility_listing_limits_valid",
      sql`coalesce(${table.freeCancelMinutes}, 0) >= 0 AND coalesce(${table.maxHoursPerPersonPerDay}, 1) > 0 AND coalesce(${table.maxHoursPerPersonPerWeek}, 1) > 0 AND ${table.bookingWindowDays} BETWEEN 0 AND 365 AND coalesce(${table.maxPlayersPerCourt}, 1) > 0 AND coalesce(${table.lightningRadiusKm}, 1) > 0`,
    ),
    check("facility_listing_slug_valid", sql`${table.slug} ~ '^[a-z0-9-]+$'`),
  ],
);

/**
 * A time-based access rule for some courts: weekdays, a time range and an
 * optional season ("Jun 1–Aug 31: residents first, 48 hours early").
 */
export const facilityAccessRules = pgTable(
  "facility_access_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => facilityListings.id, { onDelete: "cascade" }),
    access: varchar("access", { length: 16 }).notNull(),
    /** Courts it applies to; empty = every court at the venue. */
    courtIds: uuid("court_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    weekdays: integer("weekdays")
      .array()
      .notNull()
      .default(sql`ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]`),
    startsAt: time("starts_at"),
    endsAt: time("ends_at"),
    seasonStartsOn: date("season_starts_on", { mode: "string" }),
    seasonEndsOn: date("season_ends_on", { mode: "string" }),
    /** Priority access opens this many hours before everyone else. */
    earlyAccessHours: integer("early_access_hours"),
    priority: integer("priority").notNull().default(0),
    status: varchar("status", { length: 8 }).notNull().default("draft"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("facility_access_rule_listing_idx").on(
      table.listingId,
      table.status,
      table.priority,
    ),
    check(
      "facility_access_rule_access_valid",
      oneOf(table.access, facilityAccessModes),
    ),
    check(
      "facility_access_rule_status_valid",
      oneOf(table.status, facilityRuleStatuses),
    ),
    check(
      "facility_access_rule_weekdays_valid",
      sql`cardinality(${table.weekdays}) > 0 AND ${table.weekdays} <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]`,
    ),
    check(
      "facility_access_rule_time_valid",
      sql`(${table.startsAt} IS NULL) = (${table.endsAt} IS NULL) AND (${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt})`,
    ),
    check(
      "facility_access_rule_season_valid",
      sql`(${table.seasonStartsOn} IS NULL) = (${table.seasonEndsOn} IS NULL) AND (${table.seasonStartsOn} IS NULL OR ${table.seasonEndsOn} >= ${table.seasonStartsOn})`,
    ),
    check(
      "facility_access_rule_early_valid",
      sql`${table.earlyAccessHours} IS NULL OR ${table.earlyAccessHours} BETWEEN 1 AND 720`,
    ),
  ],
);

/** A player's request to use approved-only courts, and its decision and expiry. */
export const facilityAccessRequests = pgTable(
  "facility_access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => facilityListings.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    /** Set when a guardian asks for a minor. */
    guardianPersonId: uuid("guardian_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 10 }).notNull().default("requested"),
    affiliation: text("affiliation"),
    message: text("message"),
    waiverExecutionId: uuid("waiver_execution_id").references(
      () => waiverExecutions.id,
      { onDelete: "set null" },
    ),
    autoApproved: boolean("auto_approved").notNull().default(false),
    requestedAt: at("requested_at").notNull().defaultNow(),
    decidedByPersonId: uuid("decided_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    decidedAt: at("decided_at"),
    decisionNote: text("decision_note"),
    /** Null = no expiry ("Approve for 30 days" sets it). */
    expiresAt: at("expires_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("facility_access_request_open_unique")
      .on(table.listingId, table.personId)
      .where(sql`${table.status} IN ('requested', 'approved')`),
    index("facility_access_request_listing_status_idx").on(
      table.listingId,
      table.status,
    ),
    check(
      "facility_access_request_status_valid",
      oneOf(table.status, facilityAccessRequestStatuses),
    ),
    check(
      "facility_access_request_decided_shape",
      sql`${table.status} = 'requested' OR ${table.decidedAt} IS NOT NULL`,
    ),
  ],
);

/** Stop play on some or all courts at a venue ("Lightning 8 mi away"). */
export const courtPlayStops = pgTable(
  "court_play_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    /** Empty = every court at the venue ("Close all courts"). */
    courtIds: uuid("court_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    reason: varchar("reason", { length: 12 }).notNull(),
    source: varchar("source", { length: 14 }).notNull().default("manual"),
    status: varchar("status", { length: 8 }).notNull().default("active"),
    note: text("note"),
    startsAt: at("starts_at").notNull().defaultNow(),
    /** Planned end; null = until lifted. */
    endsAt: at("ends_at"),
    liftedAt: at("lifted_at"),
    startedByPersonId: uuid("started_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    liftedByPersonId: uuid("lifted_by_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    affectedReservations: integer("affected_reservations").notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("court_play_stop_venue_active_idx").on(
      table.venueId,
      table.status,
      table.startsAt,
    ),
    check(
      "court_play_stop_reason_valid",
      oneOf(table.reason, courtPlayStopReasons),
    ),
    check(
      "court_play_stop_source_valid",
      oneOf(table.source, courtPlayStopSources),
    ),
    check(
      "court_play_stop_status_valid",
      oneOf(table.status, courtPlayStopStatuses),
    ),
    check(
      "court_play_stop_time_valid",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "court_play_stop_lifted_shape",
      sql`(${table.status} = 'lifted') = (${table.liftedAt} IS NOT NULL)`,
    ),
    check(
      "court_play_stop_affected_valid",
      sql`${table.affectedReservations} >= 0`,
    ),
  ],
);
