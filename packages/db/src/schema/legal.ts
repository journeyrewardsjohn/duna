/**
 * Schema: legal (owner: L3, terms acceptance). The registry of legal document
 * versions (keys from apps/web/content/legal/index.json plus the existing
 * consumer, privacy, EULA and HQ keys). Acceptances stay in
 * `legal_acceptances` (../schema.ts), which W3-0 widened to any document key
 * and gave on-behalf-of, surface and evidence columns. Written by the W3-0
 * schema steward.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { at, createdAtColumn, oneOf } from "./_columns";

export const legalDocumentAudiences = [
  "players",
  "guardians",
  "organizations",
  "everyone",
] as const;
/** `legal_acceptances.accepted_as`. */
export const legalAcceptedAs = [
  "self",
  "guardian",
  "organization-authority",
] as const;
/** `legal_acceptances.surface`. */
export const legalAcceptanceSurfaces = [
  "web-sign-up",
  "web-checkout",
  "web-settings",
  "player-app",
  "pro-app",
  "hq-onboarding",
  "hq-settings",
  "guardian-flow",
  "admin-import",
] as const;
/** Shared by `legal_document_versions.document_key` and `legal_acceptances.document_key`. */
export const LEGAL_DOCUMENT_KEY_PATTERN = "^[a-z0-9][a-z0-9-]{1,47}$";

export const legalDocumentVersions = pgTable(
  "legal_document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentKey: varchar("document_key", { length: 48 }).notNull(),
    version: varchar("version", { length: 32 }).notNull(),
    title: text("title").notNull(),
    audience: varchar("audience", { length: 16 }).notNull(),
    /** SHA-256 of the exact text published. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    url: text("url").notNull(),
    publishedAt: at("published_at").notNull(),
    effectiveAt: at("effective_at").notNull(),
    /** A new version that people must accept again before continuing. */
    requiresReacceptance: boolean("requires_reacceptance")
      .notNull()
      .default(false),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("legal_document_version_unique").on(
      table.documentKey,
      table.version,
    ),
    check(
      "legal_document_version_key_valid",
      sql`${table.documentKey} ~ ${sql.raw(`'${LEGAL_DOCUMENT_KEY_PATTERN}'`)}`,
    ),
    check(
      "legal_document_version_audience_valid",
      oneOf(table.audience, legalDocumentAudiences),
    ),
    check(
      "legal_document_version_hash_valid",
      sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "legal_document_version_effective_valid",
      sql`${table.effectiveAt} >= ${table.publishedAt}`,
    ),
  ],
);
