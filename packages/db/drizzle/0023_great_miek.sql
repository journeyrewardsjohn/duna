CREATE TABLE "external_player_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_person_id" text NOT NULL,
	"person_id" uuid,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"profile_url" text,
	"hometown" text,
	"country_code" varchar(3),
	"birth_date" date,
	"avatar_url" text,
	"mapping_state" varchar(24) DEFAULT 'unresolved' NOT NULL,
	"mapping_score_bps" integer,
	"mapping_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_professional" boolean DEFAULT false NOT NULL,
	"external_rating" double precision,
	"external_rating_confidence" double precision,
	"external_match_count" integer,
	"raw_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_player_mapping_state_check" CHECK ("external_player_profiles"."mapping_state" IN ('unresolved', 'suggested', 'linked', 'rejected', 'merged')),
	CONSTRAINT "external_player_mapping_score_check" CHECK ("external_player_profiles"."mapping_score_bps" IS NULL OR "external_player_profiles"."mapping_score_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "imported_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"ingestion_run_id" uuid,
	"external_match_id" text NOT NULL,
	"external_event_id" text,
	"source_url" text,
	"source_fingerprint" varchar(128) NOT NULL,
	"cross_source_fingerprint" varchar(128) NOT NULL,
	"title" text NOT NULL,
	"round_label" text,
	"location" text,
	"gender_category" varchar(16),
	"discipline" "discipline" DEFAULT 'beach-2s' NOT NULL,
	"played_at" timestamp with time zone,
	"participants" jsonb NOT NULL,
	"sets" jsonb NOT NULL,
	"winner_side" varchar(1),
	"import_state" varchar(24) DEFAULT 'staged' NOT NULL,
	"exclusion_reason" text,
	"possible_duplicate_of_id" uuid,
	"canonical_match_id" uuid,
	"approved_by_person_id" uuid,
	"approved_at" timestamp with time zone,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imported_match_state_check" CHECK ("imported_matches"."import_state" IN ('staged', 'needs-mapping', 'ready', 'approved', 'duplicate', 'excluded', 'rejected')),
	CONSTRAINT "imported_match_winner_check" CHECK ("imported_matches"."winner_side" IS NULL OR "imported_matches"."winner_side" IN ('A', 'B'))
);
--> statement-breakpoint
CREATE TABLE "professional_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_event_id" text NOT NULL,
	"source_url" text NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"country_code" varchar(3),
	"category" text,
	"gender_category" varchar(16) NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"status" varchar(24) NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"team_count" integer DEFAULT 0 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_merge_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_person_id" uuid NOT NULL,
	"target_person_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'completed' NOT NULL,
	"reason" text NOT NULL,
	"moved_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performed_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_merge_distinct_people_check" CHECK ("profile_merge_records"."source_person_id" <> "profile_merge_records"."target_person_id")
);
--> statement-breakpoint
CREATE TABLE "rating_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"algorithm_version" varchar(48) NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"parameters" jsonb NOT NULL,
	"notes" text,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"sample_size" integer NOT NULL,
	"prediction_accuracy" double precision NOT NULL,
	"brier_score" double precision NOT NULL,
	"calibration" jsonb NOT NULL,
	"date_from" date,
	"date_to" date,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sand_ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"mode" varchar(32) NOT NULL,
	"status" varchar(24) DEFAULT 'running' NOT NULL,
	"requested_url" text,
	"requested_external_id" text,
	"engine" varchar(24) NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_kind" varchar(48),
	"error_message" text,
	"created_by_person_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sand_ingestion_status_check" CHECK ("sand_ingestion_runs"."status" IN ('running', 'succeeded', 'partial', 'failed', 'unavailable'))
);
--> statement-breakpoint
CREATE TABLE "world_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"ranking_date" date NOT NULL,
	"gender_category" varchar(16) NOT NULL,
	"rank" integer NOT NULL,
	"points" double precision DEFAULT 0 NOT NULL,
	"external_person_id" text NOT NULL,
	"display_name" text NOT NULL,
	"country_code" varchar(3),
	"person_id" uuid,
	"previous_rank" integer,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "profile_claim_status" varchar(24) DEFAULT 'claimed' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "is_professional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "professional_since" date;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "professional_definition" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "gender_category" varchar(16);--> statement-breakpoint
ALTER TABLE "external_player_profiles" ADD CONSTRAINT "external_player_profiles_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_player_profiles" ADD CONSTRAINT "external_player_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_matches" ADD CONSTRAINT "imported_matches_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_matches" ADD CONSTRAINT "imported_matches_ingestion_run_id_sand_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."sand_ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_matches" ADD CONSTRAINT "imported_matches_canonical_match_id_matches_id_fk" FOREIGN KEY ("canonical_match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_matches" ADD CONSTRAINT "imported_matches_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_events" ADD CONSTRAINT "professional_events_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_merge_records" ADD CONSTRAINT "profile_merge_records_source_person_id_people_id_fk" FOREIGN KEY ("source_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_merge_records" ADD CONSTRAINT "profile_merge_records_target_person_id_people_id_fk" FOREIGN KEY ("target_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_merge_records" ADD CONSTRAINT "profile_merge_records_performed_by_person_id_people_id_fk" FOREIGN KEY ("performed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_configurations" ADD CONSTRAINT "rating_configurations_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_evaluations" ADD CONSTRAINT "rating_evaluations_configuration_id_rating_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."rating_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_evaluations" ADD CONSTRAINT "rating_evaluations_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sand_ingestion_runs" ADD CONSTRAINT "sand_ingestion_runs_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sand_ingestion_runs" ADD CONSTRAINT "sand_ingestion_runs_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_rankings" ADD CONSTRAINT "world_rankings_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_rankings" ADD CONSTRAINT "world_rankings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_player_source_person_unique" ON "external_player_profiles" USING btree ("source_id","external_person_id");--> statement-breakpoint
CREATE INDEX "external_player_normalized_name_idx" ON "external_player_profiles" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "external_player_mapping_queue_idx" ON "external_player_profiles" USING btree ("mapping_state","mapping_score_bps");--> statement-breakpoint
CREATE UNIQUE INDEX "imported_match_source_external_unique" ON "imported_matches" USING btree ("source_id","external_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "imported_match_source_fingerprint_unique" ON "imported_matches" USING btree ("source_id","source_fingerprint");--> statement-breakpoint
CREATE INDEX "imported_match_cross_source_idx" ON "imported_matches" USING btree ("cross_source_fingerprint");--> statement-breakpoint
CREATE INDEX "imported_match_queue_idx" ON "imported_matches" USING btree ("import_state","played_at");--> statement-breakpoint
CREATE UNIQUE INDEX "professional_event_source_external_unique" ON "professional_events" USING btree ("source_id","external_event_id");--> statement-breakpoint
CREATE INDEX "professional_event_live_date_idx" ON "professional_events" USING btree ("live","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "profile_merge_target_idx" ON "profile_merge_records" USING btree ("target_person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rating_configuration_name_version_unique" ON "rating_configurations" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "rating_configuration_active_idx" ON "rating_configurations" USING btree ("active");--> statement-breakpoint
CREATE INDEX "rating_evaluation_configuration_idx" ON "rating_evaluations" USING btree ("configuration_id","created_at");--> statement-breakpoint
CREATE INDEX "sand_ingestion_source_started_idx" ON "sand_ingestion_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_ranking_snapshot_person_unique" ON "world_rankings" USING btree ("source_id","ranking_date","gender_category","external_person_id");--> statement-breakpoint
CREATE INDEX "world_ranking_current_idx" ON "world_rankings" USING btree ("ranking_date","gender_category","rank");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_profile_claim_status_check" CHECK ("people"."profile_claim_status" IN ('claimed', 'unclaimed', 'claim-pending', 'merged'));