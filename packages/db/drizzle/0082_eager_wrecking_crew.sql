CREATE TYPE "public"."training_content_status" AS ENUM('draft', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."training_event_kind" AS ENUM('practice', 'tournament', 'travel', 'recovery', 'strength', 'conditioning', 'plyometrics', 'film', 'meeting', 'assessment', 'rest');--> statement-breakpoint
CREATE TYPE "public"."training_event_status" AS ENUM('planned', 'ready', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."training_program_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."training_visibility" AS ENUM('organization', 'public');--> statement-breakpoint
CREATE TABLE "training_athlete_responses" (
	"training_event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"attendance_status" varchar(24) DEFAULT 'attended' NOT NULL,
	"minutes_participated" integer,
	"session_rpe" integer,
	"feedback" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_athlete_responses_training_event_id_person_id_pk" PRIMARY KEY("training_event_id","person_id"),
	CONSTRAINT "training_athlete_response_attendance_valid" CHECK ("training_athlete_responses"."attendance_status" IN ('planned', 'attended', 'partial', 'excused', 'absent')),
	CONSTRAINT "training_athlete_response_minutes_valid" CHECK ("training_athlete_responses"."minutes_participated" IS NULL OR "training_athlete_responses"."minutes_participated" >= 0),
	CONSTRAINT "training_athlete_response_rpe_valid" CHECK ("training_athlete_responses"."session_rpe" IS NULL OR "training_athlete_responses"."session_rpe" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "training_drill_tags" (
	"drill_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"is_focus_area" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_drill_tags_drill_id_tag_id_pk" PRIMARY KEY("drill_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "training_drill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_note" text,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"slug" varchar(96) NOT NULL,
	"title" text NOT NULL,
	"status" "training_content_status" DEFAULT 'draft' NOT NULL,
	"visibility" "training_visibility" DEFAULT 'organization' NOT NULL,
	"activity_kind" varchar(24) DEFAULT 'drill' NOT NULL,
	"discipline" "discipline" DEFAULT 'beach-2s' NOT NULL,
	"skill_level" varchar(32) DEFAULT 'all-levels' NOT NULL,
	"mode" varchar(24) DEFAULT 'cooperative' NOT NULL,
	"purpose" text NOT NULL,
	"target_audience" text NOT NULL,
	"summary" text NOT NULL,
	"description_markdown" text NOT NULL,
	"min_players" integer DEFAULT 1 NOT NULL,
	"max_players" integer DEFAULT 12 NOT NULL,
	"recommended_players" integer DEFAULT 4 NOT NULL,
	"duration_minutes" integer DEFAULT 10 NOT NULL,
	"intensity" integer DEFAULT 5 NOT NULL,
	"ball_count" integer DEFAULT 1 NOT NULL,
	"equipment" text[] DEFAULT '{}'::text[] NOT NULL,
	"setup" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"choreography" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scoring" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"coaching" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estimate_model" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"touch_estimate_low" integer DEFAULT 0 NOT NULL,
	"touch_estimate_typical" integer DEFAULT 0 NOT NULL,
	"touch_estimate_high" integer DEFAULT 0 NOT NULL,
	"jump_estimate_typical" integer DEFAULT 0 NOT NULL,
	"source_name" text,
	"source_url" text,
	"source_license" text,
	"source_attribution" text,
	"current_version_id" uuid,
	"created_by_person_id" uuid,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_drill_activity_valid" CHECK ("training_drills"."activity_kind" IN ('drill', 'warmup', 'cool-down', 'conditioning', 'strength', 'plyometrics', 'film', 'meeting', 'recovery', 'assessment', 'break', 'transition')),
	CONSTRAINT "training_drill_mode_valid" CHECK ("training_drills"."mode" IN ('cooperative', 'competitive', 'hybrid', 'individual')),
	CONSTRAINT "training_drill_players_valid" CHECK ("training_drills"."min_players" > 0 AND "training_drills"."max_players" >= "training_drills"."min_players" AND "training_drills"."recommended_players" BETWEEN "training_drills"."min_players" AND "training_drills"."max_players"),
	CONSTRAINT "training_drill_duration_valid" CHECK ("training_drills"."duration_minutes" BETWEEN 1 AND 480),
	CONSTRAINT "training_drill_intensity_valid" CHECK ("training_drills"."intensity" BETWEEN 1 AND 10),
	CONSTRAINT "training_drill_estimate_valid" CHECK ("training_drills"."touch_estimate_low" >= 0 AND "training_drills"."touch_estimate_typical" >= "training_drills"."touch_estimate_low" AND "training_drills"."touch_estimate_high" >= "training_drills"."touch_estimate_typical" AND "training_drills"."jump_estimate_typical" >= 0)
);
--> statement-breakpoint
CREATE TABLE "training_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid,
	"session_id" uuid,
	"practice_plan_version_id" uuid,
	"kind" "training_event_kind" NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"status" "training_event_status" DEFAULT 'planned' NOT NULL,
	"coach_person_id" uuid,
	"venue_id" uuid,
	"court_id" uuid,
	"focus_area_tag_id" uuid,
	"objectives" text[] DEFAULT '{}'::text[] NOT NULL,
	"planned_load" integer DEFAULT 50 NOT NULL,
	"planned_intensity" integer DEFAULT 5 NOT NULL,
	"external_load" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes_markdown" text,
	"source" varchar(24) DEFAULT 'program' NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_event_time_valid" CHECK ("training_events"."ends_at" > "training_events"."starts_at"),
	CONSTRAINT "training_event_load_valid" CHECK ("training_events"."planned_load" BETWEEN 0 AND 100 AND "training_events"."planned_intensity" BETWEEN 1 AND 10),
	CONSTRAINT "training_event_source_valid" CHECK ("training_events"."source" IN ('program', 'manual', 'catalog', 'imported', 'ai-draft'))
);
--> statement-breakpoint
CREATE TABLE "training_media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_version_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"provider" varchar(48) DEFAULT 'duna' NOT NULL,
	"provider_asset_id" text,
	"url" text,
	"poster_url" text,
	"alt_text" text NOT NULL,
	"scene_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_person_id" uuid,
	"approved_by_person_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_media_kind_valid" CHECK ("training_media_assets"."kind" IN ('scene', 'diagram', 'animation', 'video', 'thumbnail')),
	CONSTRAINT "training_media_status_valid" CHECK ("training_media_assets"."status" IN ('draft', 'generating', 'review', 'approved', 'failed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "training_practice_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_event_id" uuid NOT NULL,
	"practice_plan_version_id" uuid,
	"recorded_by_person_id" uuid,
	"actual_starts_at" timestamp with time zone,
	"actual_ends_at" timestamp with time zone,
	"actual_load" integer,
	"coach_rpe" integer,
	"attendance_count" integer DEFAULT 0 NOT NULL,
	"planned_block_count" integer DEFAULT 0 NOT NULL,
	"completed_block_count" integer DEFAULT 0 NOT NULL,
	"block_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes_markdown" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_practice_outcome_time_valid" CHECK ("training_practice_outcomes"."actual_ends_at" IS NULL OR "training_practice_outcomes"."actual_starts_at" IS NULL OR "training_practice_outcomes"."actual_ends_at" > "training_practice_outcomes"."actual_starts_at"),
	CONSTRAINT "training_practice_outcome_load_valid" CHECK ("training_practice_outcomes"."actual_load" IS NULL OR "training_practice_outcomes"."actual_load" BETWEEN 0 AND 100),
	CONSTRAINT "training_practice_outcome_rpe_valid" CHECK ("training_practice_outcomes"."coach_rpe" IS NULL OR "training_practice_outcomes"."coach_rpe" BETWEEN 1 AND 10),
	CONSTRAINT "training_practice_outcome_counts_valid" CHECK ("training_practice_outcomes"."attendance_count" >= 0 AND "training_practice_outcomes"."planned_block_count" >= 0 AND "training_practice_outcomes"."completed_block_count" BETWEEN 0 AND "training_practice_outcomes"."planned_block_count")
);
--> statement-breakpoint
CREATE TABLE "training_practice_plan_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_plan_version_id" uuid NOT NULL,
	"drill_version_id" uuid,
	"sequence" integer NOT NULL,
	"lane" varchar(48) DEFAULT 'all' NOT NULL,
	"title" text NOT NULL,
	"kind" varchar(24) DEFAULT 'drill' NOT NULL,
	"starts_at_minute" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer NOT NULL,
	"transition_minutes" integer DEFAULT 0 NOT NULL,
	"intensity" integer DEFAULT 5 NOT NULL,
	"planned_load" integer DEFAULT 50 NOT NULL,
	"instructions_markdown" text,
	"estimates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_plan_block_time_valid" CHECK ("training_practice_plan_blocks"."starts_at_minute" >= 0 AND "training_practice_plan_blocks"."duration_minutes" > 0 AND "training_practice_plan_blocks"."transition_minutes" >= 0),
	CONSTRAINT "training_plan_block_load_valid" CHECK ("training_practice_plan_blocks"."intensity" BETWEEN 1 AND 10 AND "training_practice_plan_blocks"."planned_load" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "training_practice_plan_tags" (
	"practice_plan_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"is_focus_area" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_practice_plan_tags_practice_plan_id_tag_id_pk" PRIMARY KEY("practice_plan_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "training_practice_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_note" text,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_practice_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" varchar(96) NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"target_audience" text NOT NULL,
	"status" "training_content_status" DEFAULT 'draft' NOT NULL,
	"visibility" "training_visibility" DEFAULT 'organization' NOT NULL,
	"duration_minutes" integer DEFAULT 90 NOT NULL,
	"planned_load" integer DEFAULT 50 NOT NULL,
	"current_version_id" uuid,
	"created_by_person_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_plan_duration_valid" CHECK ("training_practice_plans"."duration_minutes" BETWEEN 1 AND 720),
	CONSTRAINT "training_plan_load_valid" CHECK ("training_practice_plans"."planned_load" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "training_program_participants" (
	"program_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" varchar(24) DEFAULT 'athlete' NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"position" varchar(48),
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_program_participants_program_id_person_id_pk" PRIMARY KEY("program_id","person_id"),
	CONSTRAINT "training_program_participant_role_valid" CHECK ("training_program_participants"."role" IN ('athlete', 'coach', 'assistant', 'director')),
	CONSTRAINT "training_program_participant_status_valid" CHECK ("training_program_participants"."status" IN ('invited', 'active', 'paused', 'completed', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "training_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"slug" varchar(96) NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"target_audience" text NOT NULL,
	"objectives" text[] DEFAULT '{}'::text[] NOT NULL,
	"approach" text NOT NULL,
	"status" "training_program_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"recurrence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_session_count" integer DEFAULT 0 NOT NULL,
	"default_practice_minutes" integer DEFAULT 90 NOT NULL,
	"athlete_count" integer DEFAULT 1 NOT NULL,
	"created_by_person_id" uuid,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_program_dates_valid" CHECK ("training_programs"."end_date" >= "training_programs"."start_date"),
	CONSTRAINT "training_program_session_count_valid" CHECK ("training_programs"."scheduled_session_count" >= 0),
	CONSTRAINT "training_program_defaults_valid" CHECK ("training_programs"."default_practice_minutes" BETWEEN 1 AND 720 AND "training_programs"."athlete_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "training_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"slug" varchar(80) NOT NULL,
	"label" varchar(120) NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" varchar(24) DEFAULT 'custom' NOT NULL,
	"is_focus_area" boolean DEFAULT false NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_tag_category_valid" CHECK ("training_tags"."category" IN ('focus', 'skill', 'context', 'custom'))
);
--> statement-breakpoint
ALTER TABLE "training_athlete_responses" ADD CONSTRAINT "training_athlete_responses_training_event_id_training_events_id_fk" FOREIGN KEY ("training_event_id") REFERENCES "public"."training_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_athlete_responses" ADD CONSTRAINT "training_athlete_responses_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_tags" ADD CONSTRAINT "training_drill_tags_drill_id_training_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."training_drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_tags" ADD CONSTRAINT "training_drill_tags_tag_id_training_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."training_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_versions" ADD CONSTRAINT "training_drill_versions_drill_id_training_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."training_drills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_versions" ADD CONSTRAINT "training_drill_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drills_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drills_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_practice_plan_version_id_training_practice_plan_versions_id_fk" FOREIGN KEY ("practice_plan_version_id") REFERENCES "public"."training_practice_plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_coach_person_id_people_id_fk" FOREIGN KEY ("coach_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_focus_area_tag_id_training_tags_id_fk" FOREIGN KEY ("focus_area_tag_id") REFERENCES "public"."training_tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_media_assets" ADD CONSTRAINT "training_media_assets_drill_version_id_training_drill_versions_id_fk" FOREIGN KEY ("drill_version_id") REFERENCES "public"."training_drill_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_media_assets" ADD CONSTRAINT "training_media_assets_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_media_assets" ADD CONSTRAINT "training_media_assets_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_outcomes" ADD CONSTRAINT "training_practice_outcomes_training_event_id_training_events_id_fk" FOREIGN KEY ("training_event_id") REFERENCES "public"."training_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_outcomes" ADD CONSTRAINT "training_practice_outcomes_practice_plan_version_id_training_practice_plan_versions_id_fk" FOREIGN KEY ("practice_plan_version_id") REFERENCES "public"."training_practice_plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_outcomes" ADD CONSTRAINT "training_practice_outcomes_recorded_by_person_id_people_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD CONSTRAINT "training_practice_plan_blocks_practice_plan_version_id_training_practice_plan_versions_id_fk" FOREIGN KEY ("practice_plan_version_id") REFERENCES "public"."training_practice_plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD CONSTRAINT "training_practice_plan_blocks_drill_version_id_training_drill_versions_id_fk" FOREIGN KEY ("drill_version_id") REFERENCES "public"."training_drill_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plan_tags" ADD CONSTRAINT "training_practice_plan_tags_practice_plan_id_training_practice_plans_id_fk" FOREIGN KEY ("practice_plan_id") REFERENCES "public"."training_practice_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plan_tags" ADD CONSTRAINT "training_practice_plan_tags_tag_id_training_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."training_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plan_versions" ADD CONSTRAINT "training_practice_plan_versions_practice_plan_id_training_practice_plans_id_fk" FOREIGN KEY ("practice_plan_id") REFERENCES "public"."training_practice_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plan_versions" ADD CONSTRAINT "training_practice_plan_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plans" ADD CONSTRAINT "training_practice_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_practice_plans" ADD CONSTRAINT "training_practice_plans_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_participants" ADD CONSTRAINT "training_program_participants_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_participants" ADD CONSTRAINT "training_program_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_tags" ADD CONSTRAINT "training_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_tags" ADD CONSTRAINT "training_tags_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_athlete_response_person_idx" ON "training_athlete_responses" USING btree ("person_id","submitted_at");--> statement-breakpoint
CREATE INDEX "training_drill_tag_tag_idx" ON "training_drill_tags" USING btree ("tag_id","drill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_one_focus_unique" ON "training_drill_tags" USING btree ("drill_id") WHERE "training_drill_tags"."is_focus_area" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_version_unique" ON "training_drill_versions" USING btree ("drill_id","version");--> statement-breakpoint
CREATE INDEX "training_drill_version_created_idx" ON "training_drill_versions" USING btree ("drill_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_platform_slug_unique" ON "training_drills" USING btree ("slug") WHERE "training_drills"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_org_slug_unique" ON "training_drills" USING btree ("organization_id","slug") WHERE "training_drills"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "training_drill_library_idx" ON "training_drills" USING btree ("visibility","status","activity_kind");--> statement-breakpoint
CREATE INDEX "training_drill_org_updated_idx" ON "training_drills" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "training_event_org_time_idx" ON "training_events" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "training_event_program_time_idx" ON "training_events" USING btree ("program_id","starts_at");--> statement-breakpoint
CREATE INDEX "training_media_drill_version_idx" ON "training_media_assets" USING btree ("drill_version_id","kind","status");--> statement-breakpoint
CREATE UNIQUE INDEX "training_practice_outcome_event_unique" ON "training_practice_outcomes" USING btree ("training_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_block_sequence_unique" ON "training_practice_plan_blocks" USING btree ("practice_plan_version_id","lane","sequence");--> statement-breakpoint
CREATE INDEX "training_plan_block_timeline_idx" ON "training_practice_plan_blocks" USING btree ("practice_plan_version_id","starts_at_minute");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_one_focus_unique" ON "training_practice_plan_tags" USING btree ("practice_plan_id") WHERE "training_practice_plan_tags"."is_focus_area" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_version_unique" ON "training_practice_plan_versions" USING btree ("practice_plan_id","version");--> statement-breakpoint
CREATE INDEX "training_plan_version_created_idx" ON "training_practice_plan_versions" USING btree ("practice_plan_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_org_slug_unique" ON "training_practice_plans" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "training_plan_org_status_idx" ON "training_practice_plans" USING btree ("organization_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "training_program_participant_person_idx" ON "training_program_participants" USING btree ("person_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "training_program_org_slug_unique" ON "training_programs" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "training_program_org_dates_idx" ON "training_programs" USING btree ("organization_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "training_program_catalog_idx" ON "training_programs" USING btree ("catalog_item_id") WHERE "training_programs"."catalog_item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "training_tag_platform_slug_unique" ON "training_tags" USING btree ("slug") WHERE "training_tags"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "training_tag_org_slug_unique" ON "training_tags" USING btree ("organization_id","slug") WHERE "training_tags"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "training_tag_org_category_idx" ON "training_tags" USING btree ("organization_id","category");