CREATE TABLE "video_analysis_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid,
	"video_id" uuid NOT NULL,
	"vision_session_id" uuid,
	"event_type" varchar(32) NOT NULL,
	"source" varchar(16) NOT NULL,
	"state" varchar(16) DEFAULT 'proposed' NOT NULL,
	"session_time_us" bigint NOT NULL,
	"duration_us" bigint,
	"confidence" double precision,
	"court_point" jsonb,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80),
	"created_by_person_id" uuid,
	"supersedes_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_analysis_event_type_valid" CHECK ("video_analysis_events"."event_type" IN ('rally-started', 'rally-ended', 'ball-contact', 'ball-landing', 'player-position', 'highlight', 'review-marker')),
	CONSTRAINT "video_analysis_event_source_valid" CHECK ("video_analysis_events"."source" IN ('model', 'human', 'watch', 'system')),
	CONSTRAINT "video_analysis_event_state_valid" CHECK ("video_analysis_events"."state" IN ('proposed', 'confirmed', 'corrected', 'rejected')),
	CONSTRAINT "video_analysis_event_time_valid" CHECK ("video_analysis_events"."session_time_us" BETWEEN 0 AND 43200000000),
	CONSTRAINT "video_analysis_event_duration_valid" CHECK ("video_analysis_events"."duration_us" IS NULL OR "video_analysis_events"."duration_us" BETWEEN 0 AND 43200000000),
	CONSTRAINT "video_analysis_event_confidence_valid" CHECK ("video_analysis_events"."confidence" IS NULL OR "video_analysis_events"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "video_analysis_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"decision" varchar(16) NOT NULL,
	"correction" jsonb,
	"note" varchar(600),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_analysis_review_decision_valid" CHECK ("video_analysis_reviews"."decision" IN ('confirmed', 'corrected', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "video_analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"vision_session_id" uuid,
	"requested_by_person_id" uuid,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"pipeline_version" varchar(80) NOT NULL,
	"model_version" varchar(80),
	"court_map" jsonb,
	"coverage" jsonb,
	"artifact_r2_key" text,
	"failure_code" varchar(80),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_analysis_run_status_valid" CHECK ("video_analysis_runs"."status" IN ('queued', 'processing', 'ready', 'needs-review', 'failed', 'cancelled')),
	CONSTRAINT "video_analysis_run_completed_pair" CHECK (("video_analysis_runs"."status" IN ('ready', 'needs-review', 'failed', 'cancelled') AND "video_analysis_runs"."completed_at" IS NOT NULL) OR ("video_analysis_runs"."status" NOT IN ('ready', 'needs-review', 'failed', 'cancelled')))
);
--> statement-breakpoint
ALTER TABLE "vision_timeline_events" DROP CONSTRAINT "vision_timeline_type_valid";--> statement-breakpoint
ALTER TABLE "video_analysis_events" ADD CONSTRAINT "video_analysis_events_run_id_video_analysis_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."video_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_events" ADD CONSTRAINT "video_analysis_events_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_events" ADD CONSTRAINT "video_analysis_events_vision_session_id_vision_sessions_id_fk" FOREIGN KEY ("vision_session_id") REFERENCES "public"."vision_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_events" ADD CONSTRAINT "video_analysis_events_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_reviews" ADD CONSTRAINT "video_analysis_reviews_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_reviews" ADD CONSTRAINT "video_analysis_reviews_event_id_video_analysis_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."video_analysis_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_reviews" ADD CONSTRAINT "video_analysis_reviews_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_runs" ADD CONSTRAINT "video_analysis_runs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_runs" ADD CONSTRAINT "video_analysis_runs_vision_session_id_vision_sessions_id_fk" FOREIGN KEY ("vision_session_id") REFERENCES "public"."vision_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_analysis_runs" ADD CONSTRAINT "video_analysis_runs_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_analysis_event_video_time_idx" ON "video_analysis_events" USING btree ("video_id","session_time_us");--> statement-breakpoint
CREATE INDEX "video_analysis_event_run_time_idx" ON "video_analysis_events" USING btree ("run_id","session_time_us");--> statement-breakpoint
CREATE INDEX "video_analysis_event_session_time_idx" ON "video_analysis_events" USING btree ("vision_session_id","session_time_us");--> statement-breakpoint
CREATE UNIQUE INDEX "video_analysis_review_event_reviewer_unique" ON "video_analysis_reviews" USING btree ("event_id","reviewer_person_id");--> statement-breakpoint
CREATE INDEX "video_analysis_review_video_created_idx" ON "video_analysis_reviews" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX "video_analysis_run_video_created_idx" ON "video_analysis_runs" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX "video_analysis_run_status_created_idx" ON "video_analysis_runs" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "vision_timeline_events" ADD CONSTRAINT "vision_timeline_type_valid" CHECK ("vision_timeline_events"."type" IN ('recording-started', 'rally-won', 'favorite', 'undo', 'side-change', 'set-ended', 'recording-stopped', 'calibration-updated', 'review-marker'));
