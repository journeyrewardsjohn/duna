/**
 * Schema: training-scene-ai (owner: B6d). One "Create with AI" run: the model
 * names spots, code places them, the validator runs, a repair loop retries,
 * and a coach reviews. The prompt is the coach's drill description; it must
 * not carry player names. Written by the W3-0 schema steward.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations, people, trainingDrills } from "../schema";
import { trainingDrillScenes } from "./training-drills";
import { at, createdAtColumn, oneOf, updatedAtColumn } from "./_columns";

export const trainingSceneAiRunStatuses = [
  "queued",
  "naming",
  "placing",
  "validating",
  "repairing",
  "ready-for-review",
  "accepted",
  "rejected",
  "failed",
] as const;

export const trainingSceneAiRuns = pgTable(
  "training_scene_ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The drill being drafted or revised, when there is one. */
    drillId: uuid("drill_id").references(() => trainingDrills.id, {
      onDelete: "set null",
    }),
    requestedByPersonId: uuid("requested_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    prompt: text("prompt").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    /** Named spots the model returned (no coordinates). */
    namedSpots: jsonb("named_spots")
      .notNull()
      .$type<readonly Record<string, unknown>[]>()
      .default([]),
    /** The candidate scene document before a coach accepts it. */
    draftDocument: jsonb("draft_document").$type<Record<string, unknown>>(),
    validationIssues: jsonb("validation_issues")
      .notNull()
      .$type<readonly { rule: string; message: string }[]>()
      .default([]),
    resultSceneId: uuid("result_scene_id").references(
      () => trainingDrillScenes.id,
      { onDelete: "set null" },
    ),
    model: varchar("model", { length: 64 }),
    errorCode: varchar("error_code", { length: 64 }),
    finishedAt: at("finished_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("training_scene_ai_run_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "training_scene_ai_run_status_valid",
      oneOf(table.status, trainingSceneAiRunStatuses),
    ),
    check(
      "training_scene_ai_run_attempts_valid",
      sql`${table.attempts} BETWEEN 0 AND 10`,
    ),
    check(
      "training_scene_ai_run_accepted_shape",
      sql`${table.status} <> 'accepted' OR ${table.resultSceneId} IS NOT NULL`,
    ),
  ],
);
