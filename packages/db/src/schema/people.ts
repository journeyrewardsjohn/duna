/**
 * Schema: HQ People (owner: PEOPLE-API). Club-scoped records about a person
 * that only the club's staff see (docs/product/people.md):
 *
 * - `person_notes`: staff notes. Never shown to the person, never to another
 *   club, never in exports or Ask Duna. Stored as typed; removal is a soft
 *   delete that keeps who removed it and when (the body is cleared).
 * - `person_tags`: the club's own labels on a person (bulk tagging).
 * - `people_import_batches`: one confirmed-before-write import. The preview
 *   stores the normalized rows and the decision for each row; the write
 *   applies exactly that plan, in batches, resumably. The row payload is
 *   cleared once the import completes or the preview expires.
 * - `people_merges`: one merge of a club-only duplicate record into another,
 *   with every moved row id, so nothing is lost and the move can be traced.
 *
 * Additive only. Enumerations are varchar plus CHECK, as in the W3 files.
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
import { organizations, people } from "../schema";
import { at, createdAtColumn, oneOf, updatedAtColumn } from "./_columns";

export const peopleImportBatchStatuses = [
  "previewed",
  "importing",
  "completed",
  "expired",
] as const;
export const peopleMergeStatuses = ["previewed", "completed"] as const;

export const personNotes = pgTable(
  "person_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    authorPersonId: uuid("author_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    editedAt: at("edited_at"),
    removedAt: at("removed_at"),
    removedByPersonId: uuid("removed_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("person_note_org_person_idx").on(
      table.organizationId,
      table.personId,
      table.createdAt,
    ),
    check("person_note_body_length", sql`char_length(${table.body}) <= 4000`),
    check(
      "person_note_removed_shape",
      sql`${table.removedAt} IS NULL OR ${table.body} = ''`,
    ),
  ],
);

export const personTags = pgTable(
  "person_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 40 }).notNull(),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("person_tag_unique").on(
      table.organizationId,
      table.personId,
      table.tag,
    ),
    index("person_tag_org_tag_idx").on(table.organizationId, table.tag),
    check("person_tag_shape", sql`char_length(${table.tag}) BETWEEN 1 AND 40`),
  ],
);

export const peopleImportBatches = pgTable(
  "people_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 12 }).notNull().default("previewed"),
    /** Hash of the plan and of every matched record's state at preview. */
    planHash: varchar("plan_hash", { length: 128 }).notNull(),
    /** Normalized rows and their decisions; cleared when finished. */
    plan: jsonb("plan").$type<unknown>(),
    counts: jsonb("counts").notNull().$type<Record<string, number>>(),
    totalRows: integer("total_rows").notNull(),
    processedRows: integer("processed_rows").notNull().default(0),
    idempotencyKey: uuid("idempotency_key"),
    expiresAt: at("expires_at").notNull(),
    startedAt: at("started_at"),
    completedAt: at("completed_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("people_import_batch_org_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "people_import_batch_status_valid",
      oneOf(table.status, peopleImportBatchStatuses),
    ),
    check(
      "people_import_batch_progress",
      sql`${table.processedRows} >= 0 AND ${table.processedRows} <= ${table.totalRows}`,
    ),
  ],
);

export const peopleMerges = pgTable(
  "people_merges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    keepPersonId: uuid("keep_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    mergedPersonId: uuid("merged_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 12 }).notNull().default("previewed"),
    planHash: varchar("plan_hash", { length: 128 }).notNull(),
    /** Row ids moved per kind; written when the merge completes. */
    moved: jsonb("moved").$type<Record<string, readonly string[]>>(),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    idempotencyKey: uuid("idempotency_key"),
    expiresAt: at("expires_at").notNull(),
    completedAt: at("completed_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("people_merge_org_idx").on(table.organizationId, table.createdAt),
    uniqueIndex("people_merge_completed_unique")
      .on(table.mergedPersonId)
      .where(sql`${table.status} = 'completed'`),
    check(
      "people_merge_status_valid",
      oneOf(table.status, peopleMergeStatuses),
    ),
    check(
      "people_merge_distinct",
      sql`${table.keepPersonId} <> ${table.mergedPersonId}`,
    ),
  ],
);
