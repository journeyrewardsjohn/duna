/**
 * Schema: website-templates (owner: B8b). The five site templates (platform
 * owned, versioned) and which template a club's site started from, including
 * onboarding of an existing site. Written by the W3-0 schema steward.
 */
import { sql } from "drizzle-orm";
import {
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
import { people } from "../schema";
import { websiteSites } from "../website-schema";
import { at, createdAtColumn, oneOf, updatedAtColumn } from "./_columns";

export const websiteTemplateStatuses = [
  "draft",
  "available",
  "retired",
] as const;
export const websiteSiteOrigins = ["template", "existing-site"] as const;

export const websiteTemplates = pgTable(
  "website_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 48 }).notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    status: varchar("status", { length: 10 }).notNull().default("draft"),
    previewImageUrl: text("preview_image_url"),
    /** Page tree, sections and theme slots the generator fills. */
    definition: jsonb("definition").notNull().$type<Record<string, unknown>>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("website_template_key_version_unique").on(
      table.key,
      table.version,
    ),
    check(
      "website_template_status_valid",
      oneOf(table.status, websiteTemplateStatuses),
    ),
    check("website_template_version_valid", sql`${table.version} > 0`),
    check("website_template_key_valid", sql`${table.key} ~ '^[a-z0-9-]+$'`),
  ],
);

/** How a site started: from a template, or by onboarding the club's existing site. */
export const websiteSiteStarts = pgTable(
  "website_site_starts",
  {
    siteId: uuid("site_id")
      .primaryKey()
      .references(() => websiteSites.id, { onDelete: "cascade" }),
    origin: varchar("origin", { length: 16 }).notNull(),
    templateId: uuid("template_id").references(() => websiteTemplates.id, {
      onDelete: "restrict",
    }),
    existingSiteUrl: text("existing_site_url"),
    /** Answers to the onboarding questions (WO-*), by question key. */
    answers: jsonb("answers")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    startedByPersonId: uuid("started_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    completedAt: at("completed_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("website_site_start_template_idx").on(table.templateId),
    check(
      "website_site_start_origin_valid",
      oneOf(table.origin, websiteSiteOrigins),
    ),
    check(
      "website_site_start_origin_shape",
      sql`(${table.origin} = 'template' AND ${table.templateId} IS NOT NULL) OR (${table.origin} = 'existing-site' AND ${table.existingSiteUrl} IS NOT NULL)`,
    ),
  ],
);
