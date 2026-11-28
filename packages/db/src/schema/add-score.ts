/**
 * Schema: add a score without an account (owner: SITE-3). The public
 * honeypot at `/add-score` (docs/product/add-score.md):
 *
 * - `score_drafts`: one anonymous draft per browser, found by the SHA-256 of
 *   an unguessable token kept in an HTTP-only cookie (the token itself is
 *   never stored). No account, no IP address, no contact details: first
 *   names or initials typed for the other players, the score, the day, the
 *   format and where. Deleted seven days after it was started; a claimed
 *   draft keeps only who claimed it and the match it became until then.
 * - `venue_candidates`: a place a player said they played that Duna does not
 *   list yet. Never public: staff promote it to a (draft) venue, merge it
 *   into an existing one, or dismiss it. Content returned by the maps
 *   provider is kept at most 30 days (`provider_content_expires_at`); the
 *   provider's place id is kept as the provider's terms allow.
 * - `venue_candidate_submitters`: one row per distinct draft (or person) that
 *   named a candidate, so the count of distinct submitters is honest.
 *
 * Additive only. Enumerations are varchar plus CHECK, as in the W3 files.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { matches, people, venues } from "../schema";
import {
  at,
  createdAtColumn,
  nullOrOneOf,
  oneOf,
  updatedAtColumn,
} from "./_columns";

/** `claiming` holds the draft while its match is being written. */
export const scoreDraftStatuses = ["draft", "claiming", "claimed"] as const;
export const scoreDraftPlaceKinds = ["duna", "places", "described"] as const;
export const venueCandidateSources = ["places", "described"] as const;
export const venueCandidateStatuses = [
  "pending",
  "promoted",
  "merged",
  "dismissed",
] as const;
export const venueCandidateSurfaces = [
  "beach-sand",
  "indoor-sand",
  "indoor-hardwood",
  "grass",
] as const;

export const venueCandidates = pgTable(
  "venue_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 16 }).notNull(),
    /** The maps provider's place id (kept; its terms allow it). */
    googlePlaceId: text("google_place_id"),
    /** What a player typed for a place the provider did not know. */
    describedName: text("described_name"),
    describedAddress: text("described_address"),
    /** Provider content: cleared when `provider_content_expires_at` passes. */
    providerName: text("provider_name"),
    providerAddress: text("provider_address"),
    providerContentExpiresAt: at("provider_content_expires_at"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    surface: varchar("surface", { length: 16 }),
    nets: integer("nets"),
    /** Lower-cased, accent-free name used for duplicate checks. */
    normalizedName: text("normalized_name").notNull(),
    distinctSubmitters: integer("distinct_submitters").notNull().default(0),
    /** Submitters who went on to save the match to an account. */
    claimedSubmitters: integer("claimed_submitters").notNull().default(0),
    /** An existing venue this looks like (same place, or close and similar). */
    suggestedVenueId: uuid("suggested_venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    resolvedVenueId: uuid("resolved_venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    reviewedAt: at("reviewed_at"),
    reviewNote: text("review_note"),
    firstSubmittedAt: at("first_submitted_at").notNull(),
    lastSubmittedAt: at("last_submitted_at").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("venue_candidate_place_unique")
      .on(table.googlePlaceId)
      .where(sql`${table.googlePlaceId} IS NOT NULL`),
    index("venue_candidate_status_idx").on(table.status, table.lastSubmittedAt),
    index("venue_candidate_geo_idx").on(table.latitude, table.longitude),
    check(
      "venue_candidate_source_valid",
      oneOf(table.source, venueCandidateSources),
    ),
    check(
      "venue_candidate_status_valid",
      oneOf(table.status, venueCandidateStatuses),
    ),
    check(
      "venue_candidate_surface_valid",
      nullOrOneOf(table.surface, venueCandidateSurfaces),
    ),
    check(
      "venue_candidate_nets_range",
      sql`${table.nets} IS NULL OR (${table.nets} >= 1 AND ${table.nets} <= 40)`,
    ),
    check(
      "venue_candidate_counts_nonnegative",
      sql`${table.distinctSubmitters} >= 0 AND ${table.claimedSubmitters} >= 0`,
    ),
    check(
      "venue_candidate_place_for_places",
      sql`${table.source} <> 'places' OR ${table.googlePlaceId} IS NOT NULL`,
    ),
  ],
);

export const scoreDrafts = pgTable(
  "score_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 (hex) of the cookie token. The token is never stored. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    /**
     * The draft as typed (contracts/add-score.ts `addScoreDraftDataSchema`):
     * place, format, match type, day, sets and first names. Emptied when the
     * draft is claimed.
     */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    placeKind: varchar("place_kind", { length: 16 }),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    venueCandidateId: uuid("venue_candidate_id").references(
      () => venueCandidates.id,
      { onDelete: "set null" },
    ),
    playedOn: date("played_on"),
    claimedByPersonId: uuid("claimed_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    claimedMatchId: uuid("claimed_match_id").references(() => matches.id, {
      onDelete: "set null",
    }),
    claimStartedAt: at("claim_started_at"),
    claimedAt: at("claimed_at"),
    /** Seven days after the draft was started; never extended. */
    expiresAt: at("expires_at").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("score_draft_token_unique").on(table.tokenHash),
    index("score_draft_expiry_idx").on(table.expiresAt),
    index("score_draft_candidate_idx").on(table.venueCandidateId),
    check("score_draft_status_valid", oneOf(table.status, scoreDraftStatuses)),
    check(
      "score_draft_place_kind_valid",
      nullOrOneOf(table.placeKind, scoreDraftPlaceKinds),
    ),
    check(
      "score_draft_claim_complete",
      sql`${table.status} <> 'claimed' OR (${table.claimedByPersonId} IS NOT NULL AND ${table.claimedAt} IS NOT NULL)`,
    ),
  ],
);

export const venueCandidateSubmitters = pgTable(
  "venue_candidate_submitters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => venueCandidates.id, { onDelete: "cascade" }),
    /** SHA-256 of the draft id: one submitter per browser draft. */
    submitterKey: varchar("submitter_key", { length: 64 }).notNull(),
    draftId: uuid("draft_id").references(() => scoreDrafts.id, {
      onDelete: "set null",
    }),
    /** Set when the draft was saved to an account. */
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("venue_candidate_submitter_unique").on(
      table.candidateId,
      table.submitterKey,
    ),
  ],
);
