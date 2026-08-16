import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import {
  dunaVisionReceiptSources,
  planDunaVisionReceiptRecovery,
  type DunaVisionMigrationEvidence,
} from "./migration-receipts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const migrationsFolder = "./drizzle";
const sql = neon(connectionString);
const database = drizzle(sql);

async function recoverInterruptedDunaVisionMigration(): Promise<void> {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const [footprint] = await sql`
    SELECT
      to_regclass('public.scraper_controls') IS NOT NULL AS "scraperControls",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'player_source_connections'
          AND column_name = 'last_duna_activity_at'
      ) AS "sourceConnectionActivity",
      (
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'video_analysis_events'
      ) = 16
      AND (
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'video_analysis_reviews'
      ) = 9
      AND (
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'video_analysis_runs'
      ) = 15 AS "visionColumns",
      (
        SELECT count(*)
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY(ARRAY[
            'video_analysis_event_video_time_idx',
            'video_analysis_event_run_time_idx',
            'video_analysis_event_session_time_idx',
            'video_analysis_review_event_reviewer_unique',
            'video_analysis_review_video_created_idx',
            'video_analysis_run_video_created_idx',
            'video_analysis_run_status_created_idx'
          ])
      ) = 7 AS "visionIndexes",
      to_regclass('public.video_analysis_events') IS NOT NULL
        AND to_regclass('public.video_analysis_reviews') IS NOT NULL
        AND to_regclass('public.video_analysis_runs') IS NOT NULL AS "visionTables",
      EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vision_timeline_type_valid'
          AND pg_get_constraintdef(oid) LIKE '%review-marker%'
      ) AS "visionTimelineReviewMarker",
      (
        SELECT count(*)
        FROM pg_constraint
        WHERE conname = ANY(ARRAY[
          'video_analysis_event_type_valid',
          'video_analysis_event_source_valid',
          'video_analysis_event_state_valid',
          'video_analysis_event_time_valid',
          'video_analysis_event_duration_valid',
          'video_analysis_event_confidence_valid',
          'video_analysis_events_run_id_video_analysis_runs_id_fk',
          'video_analysis_events_video_id_videos_id_fk',
          'video_analysis_events_vision_session_id_vision_sessions_id_fk',
          'video_analysis_events_created_by_person_id_people_id_fk',
          'video_analysis_review_decision_valid',
          'video_analysis_reviews_video_id_videos_id_fk',
          'video_analysis_reviews_event_id_video_analysis_events_id_fk',
          'video_analysis_reviews_reviewer_person_id_people_id_fk',
          'video_analysis_run_status_valid',
          'video_analysis_run_completed_pair',
          'video_analysis_runs_video_id_videos_id_fk',
          'video_analysis_runs_vision_session_id_vision_sessions_id_fk',
          'video_analysis_runs_requested_by_person_id_people_id_fk'
        ])
      ) = 19 AS "visionConstraints"
  `;

  const evidence: DunaVisionMigrationEvidence = {
    scraperControls: footprint?.scraperControls === true,
    sourceConnectionActivity: footprint?.sourceConnectionActivity === true,
    visionColumns: footprint?.visionColumns === true,
    visionIndexes: footprint?.visionIndexes === true,
    visionTables: footprint?.visionTables === true,
    visionTimelineReviewMarker: footprint?.visionTimelineReviewMarker === true,
    visionConstraints: footprint?.visionConstraints === true,
  };
  const expected = dunaVisionReceiptSources.map(({ tag, when }) => {
    const source = readFileSync(join(migrationsFolder, `${tag}.sql`), "utf8");
    return {
      hash: createHash("sha256").update(source).digest("hex"),
      tag,
      when,
    };
  });
  const stored = await sql`
    SELECT hash, created_at AS "createdAt"
    FROM drizzle.__drizzle_migrations
  `;
  const missing = planDunaVisionReceiptRecovery({
    evidence,
    expected,
    stored: stored.map((receipt) => ({
      createdAt: Number(receipt.createdAt),
      hash: String(receipt.hash),
    })),
  });

  for (const receipt of missing) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${receipt.hash}, ${receipt.when})
    `;
  }

  if (missing.length > 0) {
    console.log(
      "Recovered receipts for completed Duna Vision migrations without replaying schema changes.",
    );
  }
}

await recoverInterruptedDunaVisionMigration();
await migrate(database, { migrationsFolder });
console.log("Duna database migrations are current.");
