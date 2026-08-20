CREATE TABLE "training_program_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_note" text,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_programs" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "training_program_versions" ADD CONSTRAINT "training_program_versions_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_versions" ADD CONSTRAINT "training_program_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_program_version_unique" ON "training_program_versions" USING btree ("program_id","version");--> statement-breakpoint
CREATE INDEX "training_program_version_created_idx" ON "training_program_versions" USING btree ("program_id","created_at");--> statement-breakpoint
INSERT INTO "training_program_versions" (
  "id",
  "program_id",
  "version",
  "snapshot",
  "change_note",
  "created_by_person_id",
  "created_at"
)
SELECT
  gen_random_uuid(),
  "training_programs"."id",
  1,
  jsonb_build_object(
    'program',
    jsonb_build_object(
      'title', "training_programs"."title",
      'purpose', "training_programs"."purpose",
      'targetAudience', "training_programs"."target_audience",
      'objectives', to_jsonb("training_programs"."objectives"),
      'approach', "training_programs"."approach",
      'startDate', "training_programs"."start_date",
      'endDate', "training_programs"."end_date",
      'timezone', "training_programs"."timezone",
      'recurrence', "training_programs"."recurrence",
      'milestones', "training_programs"."milestones",
      'scheduledSessionCount', "training_programs"."scheduled_session_count",
      'defaultPracticeMinutes', "training_programs"."default_practice_minutes",
      'athleteCount', "training_programs"."athlete_count"
    ),
    'events',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'id', "training_events"."id",
              'kind', "training_events"."kind",
              'title', "training_events"."title",
              'startsAt', to_char("training_events"."starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'endsAt', to_char("training_events"."ends_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'timezone', "training_events"."timezone",
              'status', "training_events"."status",
              'practicePlanVersionId', "training_events"."practice_plan_version_id",
              'objectives', to_jsonb("training_events"."objectives"),
              'plannedLoad', "training_events"."planned_load",
              'plannedIntensity', "training_events"."planned_intensity",
              'externalLoad', "training_events"."external_load",
              'source', "training_events"."source"
            )
          )
          ORDER BY "training_events"."starts_at"
        )
        FROM "training_events"
        WHERE "training_events"."program_id" = "training_programs"."id"
      ),
      '[]'::jsonb
    )
  ),
  'Baseline created during Training OS version-history rollout.',
  "training_programs"."created_by_person_id",
  COALESCE("training_programs"."updated_at", "training_programs"."created_at", now())
FROM "training_programs"
WHERE "training_programs"."current_version_id" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "training_program_versions"
    WHERE "training_program_versions"."program_id" = "training_programs"."id"
  );--> statement-breakpoint
UPDATE "training_programs"
SET "current_version_id" = (
  SELECT "training_program_versions"."id"
  FROM "training_program_versions"
  WHERE "training_program_versions"."program_id" = "training_programs"."id"
  ORDER BY "training_program_versions"."version" DESC
  LIMIT 1
)
WHERE "training_programs"."current_version_id" IS NULL;
