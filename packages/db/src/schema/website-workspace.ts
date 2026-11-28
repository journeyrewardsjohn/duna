/**
 * Schema: website-workspace (owner: B8a). The Changes model: a site's page
 * tree, change requests in four lanes, each on its own preview, helper jobs,
 * self-checks, a chat per change, and publish / undo events made by a
 * person. Sites stay in `club_websites`, built versions in
 * `website_revisions` (../website-schema.ts). Written by the W3-0 schema
 * steward; request changes in docs/plan/schema-requests/B8a.md.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations, people } from "../schema";
import { websiteRevisions, websiteSites } from "../website-schema";
import {
  at,
  createdAtColumn,
  nullOrOneOf,
  oneOf,
  updatedAtColumn,
} from "./_columns";

export const websitePageManagers = ["club", "duna"] as const;
export const websitePageStatuses = [
  "draft",
  "live",
  "hidden",
  "removed",
] as const;
/** The four lanes (WS-Lanes). Club facts never get copied into the site. */
export const websiteChangeLanes = [
  "club-facts",
  "content",
  "design",
  "new-capability",
] as const;
export const websiteChangeStatuses = [
  "draft",
  "asking",
  "in-progress",
  "ready-for-review",
  "out-of-date",
  "scheduled",
  "published",
  "discarded",
  "failed",
  "undone",
] as const;
export const websiteChangePageKinds = ["changed", "new", "removed"] as const;
export const websiteChangeJobStatuses = [
  "queued",
  "working",
  "done",
  "needs-you",
  "failed",
  "cancelled",
] as const;
export const websiteChangeCheckKinds = [
  "build",
  "checkout-test-mode",
  "links",
  "phone-layout",
  "accessibility",
  "speed",
  "pages-changed",
  "duna-areas-untouched",
] as const;
export const websiteChangeCheckStatuses = [
  "pending",
  "running",
  "passed",
  "warning",
  "failed",
] as const;
export const websiteChangeMessageRoles = ["person", "duna", "system"] as const;
export const websitePublishEventKinds = ["publish", "undo", "restore"] as const;

/** The page tree (WS-Review: 17 pages; "From Duna", "Managed by Duna"). */
export const websitePages = pgTable(
  "website_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => websiteSites.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    parentPageId: uuid("parent_page_id"),
    path: text("path").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull().default(0),
    managedBy: varchar("managed_by", { length: 8 }).notNull().default("club"),
    status: varchar("status", { length: 8 }).notNull().default("draft"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("website_page_site_path_unique")
      .on(table.siteId, table.path)
      .where(sql`${table.status} <> 'removed'`),
    index("website_page_parent_idx").on(
      table.siteId,
      table.parentPageId,
      table.position,
    ),
    check(
      "website_page_managed_by_valid",
      oneOf(table.managedBy, websitePageManagers),
    ),
    check(
      "website_page_status_valid",
      oneOf(table.status, websitePageStatuses),
    ),
    check("website_page_path_valid", sql`${table.path} ~ '^/[a-z0-9/_-]*$'`),
    check(
      "website_page_not_own_parent",
      sql`${table.parentPageId} IS NULL OR ${table.parentPageId} <> ${table.id}`,
    ),
  ],
);

/** One change request ("Change 14"), built on its own preview copy. */
export const websiteChanges = pgTable(
  "website_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => websiteSites.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    lane: varchar("lane", { length: 16 }).notNull(),
    laneOverridden: varchar("lane_overridden_from", { length: 16 }),
    status: varchar("status", { length: 18 }).notNull().default("draft"),
    requestText: text("request_text").notNull(),
    askedByPersonId: uuid("asked_by_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    /** The live revision this change was built on; a newer publish makes it "Out of date". */
    baseRevisionId: uuid("base_revision_id").references(
      () => websiteRevisions.id,
      { onDelete: "set null" },
    ),
    previewRevisionId: uuid("preview_revision_id").references(
      () => websiteRevisions.id,
      { onDelete: "set null" },
    ),
    previewUrl: text("preview_url"),
    /** Club-facts lane: field, before, after, effective from. */
    factProposal: jsonb("fact_proposal").$type<{
      entityType: string;
      entityId: string;
      field: string;
      before: unknown;
      after: unknown;
      effectiveFrom?: string;
    }>(),
    /** New-capability lane: plan, prerequisites and stored-data impact. */
    capabilityPlan: jsonb("capability_plan").$type<{
      summary: string;
      prerequisites: readonly { label: string; met: boolean }[];
      storedDataImpact: string;
    }>(),
    creditsReserved: bigint("credits_reserved", { mode: "number" })
      .notNull()
      .default(0),
    creditsSpent: bigint("credits_spent", { mode: "number" })
      .notNull()
      .default(0),
    scheduledFor: at("scheduled_for"),
    publishedAt: at("published_at"),
    discardedAt: at("discarded_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("website_change_site_number_unique").on(
      table.siteId,
      table.number,
    ),
    index("website_change_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check("website_change_lane_valid", oneOf(table.lane, websiteChangeLanes)),
    check(
      "website_change_lane_override_valid",
      nullOrOneOf(table.laneOverridden, websiteChangeLanes),
    ),
    check(
      "website_change_status_valid",
      oneOf(table.status, websiteChangeStatuses),
    ),
    check("website_change_number_valid", sql`${table.number} > 0`),
    check(
      "website_change_credits_valid",
      sql`${table.creditsReserved} >= 0 AND ${table.creditsSpent} >= 0`,
    ),
    check(
      "website_change_scheduled_shape",
      sql`${table.status} <> 'scheduled' OR ${table.scheduledFor} IS NOT NULL`,
    ),
    check(
      "website_change_published_shape",
      sql`${table.status} NOT IN ('published', 'undone') OR ${table.publishedAt} IS NOT NULL`,
    ),
  ],
);

export const websiteChangePages = pgTable(
  "website_change_pages",
  {
    changeId: uuid("change_id")
      .notNull()
      .references(() => websiteChanges.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => websitePages.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 8 }).notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.changeId, table.pageId] }),
    check(
      "website_change_page_kind_valid",
      oneOf(table.kind, websiteChangePageKinds),
    ),
  ],
);

/** A helper agent's job on a change ("2 of 3 jobs"). */
export const websiteChangeJobs = pgTable(
  "website_change_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    changeId: uuid("change_id")
      .notNull()
      .references(() => websiteChanges.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    title: text("title").notNull(),
    status: varchar("status", { length: 10 }).notNull().default("queued"),
    /** What the job needs from a person, when status = needs-you. */
    question: text("question"),
    attempts: integer("attempts").notNull().default(0),
    errorCode: varchar("error_code", { length: 64 }),
    startedAt: at("started_at"),
    finishedAt: at("finished_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("website_change_job_sequence_unique").on(
      table.changeId,
      table.sequence,
    ),
    index("website_change_job_status_idx").on(table.status, table.createdAt),
    check(
      "website_change_job_status_valid",
      oneOf(table.status, websiteChangeJobStatuses),
    ),
    check(
      "website_change_job_question_shape",
      sql`${table.status} <> 'needs-you' OR ${table.question} IS NOT NULL`,
    ),
  ],
);

/** Self-checks before review. */
export const websiteChangeChecks = pgTable(
  "website_change_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    changeId: uuid("change_id")
      .notNull()
      .references(() => websiteChanges.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 24 }).notNull(),
    status: varchar("status", { length: 8 }).notNull().default("pending"),
    /** e.g. { brokenLinks: 0, linksChecked: 212 } or { lighthouse: 91 }. */
    result: jsonb("result")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    summary: text("summary"),
    checkedAt: at("checked_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("website_change_check_unique").on(table.changeId, table.kind),
    check(
      "website_change_check_kind_valid",
      oneOf(table.kind, websiteChangeCheckKinds),
    ),
    check(
      "website_change_check_status_valid",
      oneOf(table.status, websiteChangeCheckStatuses),
    ),
  ],
);

/** The chat on a change. Bodies are never logged. */
export const websiteChangeMessages = pgTable(
  "website_change_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    changeId: uuid("change_id")
      .notNull()
      .references(() => websiteChanges.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 8 }).notNull(),
    authorPersonId: uuid("author_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("website_change_message_change_idx").on(
      table.changeId,
      table.createdAt,
    ),
    check(
      "website_change_message_role_valid",
      oneOf(table.role, websiteChangeMessageRoles),
    ),
    check(
      "website_change_message_author_shape",
      sql`${table.role} <> 'person' OR ${table.authorPersonId} IS NOT NULL`,
    ),
  ],
);

/**
 * Append-only: every publish, undo and restore, always by a person. The
 * version number is the site's live version after the event.
 */
export const websitePublishEvents = pgTable(
  "website_publish_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => websiteSites.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 8 }).notNull(),
    version: integer("version").notNull(),
    changeId: uuid("change_id").references(() => websiteChanges.id, {
      onDelete: "restrict",
    }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => websiteRevisions.id, { onDelete: "restrict" }),
    /** For undo and restore: the event being reversed or restored. */
    reversesEventId: uuid("reverses_event_id"),
    actorPersonId: uuid("actor_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    occurredAt: at("occurred_at").notNull().defaultNow(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("website_publish_event_site_version_unique").on(
      table.siteId,
      table.version,
    ),
    index("website_publish_event_change_idx").on(table.changeId),
    check(
      "website_publish_event_kind_valid",
      oneOf(table.kind, websitePublishEventKinds),
    ),
    check("website_publish_event_version_valid", sql`${table.version} > 0`),
    check(
      "website_publish_event_reverse_shape",
      sql`(${table.kind} = 'publish') = (${table.reversesEventId} IS NULL)`,
    ),
  ],
);
