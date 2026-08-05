CREATE TABLE "vision_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"video_id" uuid,
	"match_id" uuid,
	"title" text NOT NULL,
	"status" varchar(24) DEFAULT 'setup' NOT NULL,
	"remote_token_hash" varchar(128) NOT NULL,
	"remote_expires_at" timestamp with time zone NOT NULL,
	"settings" jsonb NOT NULL,
	"control_version" integer DEFAULT 1 NOT NULL,
	"preview_jpeg_base64" text,
	"preview_captured_at" timestamp with time zone,
	"recording_started_at" timestamp with time zone,
	"recording_ended_at" timestamp with time zone,
	"last_remote_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_sessions_video_id_unique" UNIQUE("video_id"),
	CONSTRAINT "vision_sessions_remote_token_hash_unique" UNIQUE("remote_token_hash"),
	CONSTRAINT "vision_session_status_valid" CHECK ("vision_sessions"."status" IN ('setup', 'ready', 'recording', 'ended', 'expired')),
	CONSTRAINT "vision_session_control_version_positive" CHECK ("vision_sessions"."control_version" > 0),
	CONSTRAINT "vision_session_remote_window_valid" CHECK ("vision_sessions"."remote_expires_at" > "vision_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "vision_timeline_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"source" varchar(24) NOT NULL,
	"type" varchar(32) NOT NULL,
	"winner_side" varchar(1),
	"target_event_id" uuid,
	"elapsed_ms" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"score_state" jsonb,
	"label" varchar(160),
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_timeline_source_valid" CHECK ("vision_timeline_events"."source" IN ('apple-watch', 'iphone', 'remote', 'match')),
	CONSTRAINT "vision_timeline_type_valid" CHECK ("vision_timeline_events"."type" IN ('recording-started', 'rally-won', 'favorite', 'undo', 'side-change', 'recording-stopped', 'calibration-updated')),
	CONSTRAINT "vision_timeline_winner_valid" CHECK ("vision_timeline_events"."winner_side" IS NULL OR "vision_timeline_events"."winner_side" IN ('A', 'B')),
	CONSTRAINT "vision_timeline_elapsed_valid" CHECK ("vision_timeline_events"."elapsed_ms" BETWEEN 0 AND 43200000)
);
--> statement-breakpoint
ALTER TABLE "vision_sessions" ADD CONSTRAINT "vision_sessions_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_sessions" ADD CONSTRAINT "vision_sessions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_sessions" ADD CONSTRAINT "vision_sessions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_timeline_events" ADD CONSTRAINT "vision_timeline_events_session_id_vision_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."vision_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vision_session_owner_created_idx" ON "vision_sessions" USING btree ("owner_person_id","created_at");--> statement-breakpoint
CREATE INDEX "vision_session_match_status_idx" ON "vision_sessions" USING btree ("match_id","status");--> statement-breakpoint
CREATE INDEX "vision_timeline_session_elapsed_idx" ON "vision_timeline_events" USING btree ("session_id","elapsed_ms");--> statement-breakpoint
CREATE INDEX "vision_timeline_session_occurred_idx" ON "vision_timeline_events" USING btree ("session_id","occurred_at");