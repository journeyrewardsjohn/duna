/**
 * Schema: setup (owner: B1). Organisation profile and AI setup from a website
 * address. Written by the W3-0 schema steward; domain agents request changes
 * in docs/plan/schema-requests/B1.md. Re-exported by ../schema.ts.
 *
 * The model proposes, code validates, a person decides: every gathered fact
 * is a `setup_proposals` row (Keep / Edit / Skip) and nothing reaches the
 * organisation until a person keeps it.
 */
import { sql } from "drizzle-orm";
import {
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
import { organizations, people } from "../schema";
import {
  at,
  createdAtColumn,
  nullOrOneOf,
  oneOf,
  updatedAtColumn,
} from "./_columns";

export const setupRunSourceKinds = [
  "website",
  "google-listing",
  "description",
] as const;
export const setupRunStatuses = [
  "queued",
  "reading",
  "review",
  "applied",
  "failed",
  "cancelled",
] as const;
/** Why a run produced little: the CS-States hard cases. */
export const setupRunOutcomes = [
  "complete",
  "no-website",
  "site-unreachable",
  "found-very-little",
] as const;
export const setupRunPageStatuses = [
  "queued",
  "reading",
  "read",
  "failed",
  "skipped",
] as const;
export const setupProposalCategories = [
  "identity",
  "contact",
  "places",
  "offerings",
  "team",
  "policies",
] as const;
export const setupProposalDecisions = [
  "pending",
  "kept",
  "edited",
  "skipped",
  "applied",
  "superseded",
] as const;
/** Where a profile field's value came from (provenance tag on CS-Home). */
export const setupFieldSources = [
  "person",
  "website",
  "google-listing",
  "description",
  "duna",
] as const;

/**
 * One row per organisation: the public-facing facts the boards show that the
 * `organizations` row does not hold (phone, email, website, hours, socials,
 * tagline, about). A 1:1 table keeps `organizations` untouched.
 */
export const organizationProfiles = pgTable(
  "organization_profiles",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    phoneE164: varchar("phone_e164", { length: 24 }),
    email: text("email"),
    websiteUrl: text("website_url"),
    tagline: text("tagline"),
    about: text("about"),
    /** Weekly hours: [{ weekday 0-6, opens "08:00", closes "21:00" }] plus exceptions. */
    hours: jsonb("hours")
      .notNull()
      .$type<{
        weekly: readonly {
          weekday: number;
          opens: string;
          closes: string;
        }[];
        exceptions?: readonly {
          date: string;
          closed: boolean;
          opens?: string;
          closes?: string;
          note?: string;
        }[];
      }>()
      .default({ weekly: [] }),
    /** { instagram: "https://…", facebook: "…", … } */
    socials: jsonb("socials")
      .notNull()
      .$type<Record<string, string>>()
      .default({}),
    /** Provenance per field: { phoneE164: { source: "website", page: "/contact", confirmed: false } }. */
    fieldSources: jsonb("field_sources")
      .notNull()
      .$type<
        Record<
          string,
          {
            source: (typeof setupFieldSources)[number];
            page?: string;
            confirmed: boolean;
          }
        >
      >()
      .default({}),
    websiteLastReadAt: at("website_last_read_at"),
    updatedByPersonId: uuid("updated_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "organization_profile_phone_e164",
      sql`${table.phoneE164} IS NULL OR ${table.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
  ],
);

/** One AI setup pass over a source (a website, a listing, or a description). */
export const setupRuns = pgTable(
  "setup_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceKind: varchar("source_kind", { length: 24 }).notNull(),
    sourceUrl: text("source_url"),
    /** For `description`: the text or transcript the person gave. */
    sourceText: text("source_text"),
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    outcome: varchar("outcome", { length: 24 }),
    /** Machine reason for site-unreachable / failed, e.g. "no-response", "robots-disallowed". */
    failureReason: varchar("failure_reason", { length: 64 }),
    pagesTotal: integer("pages_total").notNull().default(0),
    pagesRead: integer("pages_read").notNull().default(0),
    itemsFound: integer("items_found").notNull().default(0),
    /** A re-read diffs against this run and never overwrites a person's edits. */
    previousRunId: uuid("previous_run_id"),
    startedByPersonId: uuid("started_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    startedAt: at("started_at"),
    finishedAt: at("finished_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("setup_run_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "setup_run_source_kind_valid",
      oneOf(table.sourceKind, setupRunSourceKinds),
    ),
    check("setup_run_status_valid", oneOf(table.status, setupRunStatuses)),
    check(
      "setup_run_outcome_valid",
      nullOrOneOf(table.outcome, setupRunOutcomes),
    ),
    check(
      "setup_run_counts_valid",
      sql`${table.pagesTotal} >= 0 AND ${table.pagesRead} BETWEEN 0 AND ${table.pagesTotal} AND ${table.itemsFound} >= 0`,
    ),
    check(
      "setup_run_source_present",
      sql`(${table.sourceKind} = 'description' AND ${table.sourceText} IS NOT NULL) OR (${table.sourceKind} <> 'description')`,
    ),
  ],
);

/** Each page the reader visited (CS-Reading: Read / Reading… / Queued). */
export const setupRunPages = pgTable(
  "setup_run_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => setupRuns.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    itemsFound: integer("items_found").notNull().default(0),
    readAt: at("read_at"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("setup_run_page_position_unique").on(
      table.runId,
      table.position,
    ),
    check(
      "setup_run_page_status_valid",
      oneOf(table.status, setupRunPageStatuses),
    ),
  ],
);

/**
 * One gathered fact awaiting review. `payload` is the proposed value in the
 * shape of the target (validated in code); `candidates` holds conflicting
 * values ("Conflicting values: pick one, or Neither").
 */
export const setupProposals = pgTable(
  "setup_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => setupRuns.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 16 }).notNull(),
    /** Stable field key, e.g. "contact.phone", "places.venue", "offerings.item". */
    fieldKey: varchar("field_key", { length: 64 }).notNull(),
    label: text("label").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    candidates: jsonb("candidates")
      .notNull()
      .$type<readonly Record<string, unknown>[]>()
      .default([]),
    sourcePages: text("source_pages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    needsCheck: boolean("needs_check").notNull().default(false),
    checkNote: text("check_note"),
    decision: varchar("decision", { length: 16 }).notNull().default("pending"),
    editedPayload: jsonb("edited_payload").$type<Record<string, unknown>>(),
    decidedByPersonId: uuid("decided_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    decidedAt: at("decided_at"),
    appliedAt: at("applied_at"),
    /** What applying created or changed, e.g. ("catalog_item", id). */
    appliedEntityType: varchar("applied_entity_type", { length: 48 }),
    appliedEntityId: uuid("applied_entity_id"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("setup_proposal_run_category_idx").on(table.runId, table.category),
    index("setup_proposal_org_decision_idx").on(
      table.organizationId,
      table.decision,
    ),
    check(
      "setup_proposal_category_valid",
      oneOf(table.category, setupProposalCategories),
    ),
    check(
      "setup_proposal_decision_valid",
      oneOf(table.decision, setupProposalDecisions),
    ),
    check(
      "setup_proposal_edit_shape",
      sql`${table.decision} <> 'edited' OR ${table.editedPayload} IS NOT NULL`,
    ),
    check(
      "setup_proposal_decided_shape",
      sql`${table.decision} IN ('pending', 'superseded') OR ${table.decidedAt} IS NOT NULL`,
    ),
    check(
      "setup_proposal_applied_shape",
      sql`(${table.decision} = 'applied') = (${table.appliedAt} IS NOT NULL)`,
    ),
  ],
);
