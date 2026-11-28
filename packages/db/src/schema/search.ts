/**
 * Schema: search (owner: B10). One denormalised row per searchable thing
 * (where / when / what), maintained by B10 from the source tables and read
 * from the replica. Map-bounds queries use the (latitude, longitude) index;
 * text uses a trigram index (pg_trgm is installed by an earlier migration).
 * Availability is not stored here: B10 reads it live for the visible
 * results. Written by the W3-0 schema steward.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "../schema";
import { at, oneOf, upperCurrency } from "./_columns";

export const searchDocumentKinds = [
  "club",
  "venue",
  "public-court",
  "event",
  "league",
  "lesson",
  "program",
  "coach",
  "open-play",
] as const;
export const searchDocumentVisibilities = [
  "public",
  "members",
  "hidden",
] as const;

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 16 }).notNull(),
    /** Id of the source row (organization, venue, session, catalog item, person). */
    entityId: uuid("entity_id").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    path: text("path").notNull(),
    visibility: varchar("visibility", { length: 8 })
      .notNull()
      .default("public"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locality: text("locality"),
    administrativeArea: text("administrative_area"),
    countryCode: varchar("country_code", { length: 2 }),
    startsAt: at("starts_at"),
    endsAt: at("ends_at"),
    /** "what" facets: discipline, level, kind tags. */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    priceFromMinor: bigint("price_from_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    /** Lower-cased title, place and tags for trigram matching. */
    searchText: text("search_text").notNull(),
    rank: integer("rank").notNull().default(0),
    sourceUpdatedAt: at("source_updated_at").notNull(),
    refreshedAt: at("refreshed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("search_document_entity_unique").on(table.kind, table.entityId),
    index("search_document_geo_idx")
      .on(table.latitude, table.longitude)
      .where(sql`${table.visibility} = 'public'`),
    index("search_document_when_idx")
      .on(table.kind, table.startsAt)
      .where(sql`${table.visibility} = 'public'`),
    index("search_document_tags_idx").using("gin", table.tags),
    index("search_document_text_idx").using(
      "gin",
      table.searchText.op("gin_trgm_ops"),
    ),
    index("search_document_org_idx").on(table.organizationId),
    check("search_document_kind_valid", oneOf(table.kind, searchDocumentKinds)),
    check(
      "search_document_visibility_valid",
      oneOf(table.visibility, searchDocumentVisibilities),
    ),
    check(
      "search_document_geo_pair",
      sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL) AND (${table.latitude} IS NULL OR (${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180))`,
    ),
    check(
      "search_document_time_valid",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`,
    ),
    check(
      "search_document_price_shape",
      sql`(${table.priceFromMinor} IS NULL) = (${table.currency} IS NULL) AND (${table.currency} IS NULL OR ${upperCurrency(table.currency)}) AND coalesce(${table.priceFromMinor}, 0) >= 0`,
    ),
  ],
);
