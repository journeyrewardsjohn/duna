CREATE TABLE "duna_plus_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"email_normalized" varchar(320) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"reason" text DEFAULT 'Complimentary Duna+' NOT NULL,
	"granted_by_person_id" uuid,
	"revoked_by_person_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duna_plus_grants_email_normalized_unique" UNIQUE("email_normalized"),
	CONSTRAINT "duna_plus_grant_status_valid" CHECK ("duna_plus_grants"."status" IN ('active', 'revoked')),
	CONSTRAINT "duna_plus_grant_window_valid" CHECK ("duna_plus_grants"."ends_at" IS NULL OR "duna_plus_grants"."ends_at" > "duna_plus_grants"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "video_quota_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"monthly_live_seconds" integer DEFAULT 14400 NOT NULL,
	"monthly_upload_seconds" integer DEFAULT 86400 NOT NULL,
	"enforce_live_limit" boolean DEFAULT true NOT NULL,
	"enforce_upload_limit" boolean DEFAULT false NOT NULL,
	"updated_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_quota_live_nonnegative" CHECK ("video_quota_policies"."monthly_live_seconds" >= 0),
	CONSTRAINT "video_quota_upload_nonnegative" CHECK ("video_quota_policies"."monthly_upload_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "video_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_share_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "video_share_link_use_count" CHECK ("video_share_links"."use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "video_upload_parts" (
	"video_id" uuid NOT NULL,
	"part_number" integer NOT NULL,
	"etag" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_upload_parts_video_id_part_number_pk" PRIMARY KEY("video_id","part_number"),
	CONSTRAINT "video_upload_part_number_valid" CHECK ("video_upload_parts"."part_number" BETWEEN 1 AND 10000),
	CONSTRAINT "video_upload_part_size_valid" CHECK ("video_upload_parts"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "video_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"viewer_person_id" uuid,
	"share_link_id" uuid,
	"session_token_hash" varchar(128) NOT NULL,
	"platform" varchar(16) NOT NULL,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "video_view_platform_valid" CHECK ("video_views"."platform" IN ('ios', 'web')),
	CONSTRAINT "video_view_watched_nonnegative" CHECK ("video_views"."watched_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"source" varchar(16) NOT NULL,
	"category" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"event_id" uuid,
	"match_id" uuid,
	"venue_id" uuid,
	"venue_name" text,
	"venue_address" text,
	"google_place_id" varchar(255),
	"latitude" double precision,
	"longitude" double precision,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"live_visibility" varchar(16) DEFAULT 'public' NOT NULL,
	"recording_visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"published_to_profile" boolean DEFAULT false NOT NULL,
	"has_audio" boolean DEFAULT true NOT NULL,
	"music_removal_requested" boolean DEFAULT false NOT NULL,
	"music_removal_status" varchar(24) DEFAULT 'not-requested' NOT NULL,
	"mux_live_stream_id" varchar(128),
	"mux_live_playback_id" varchar(128),
	"mux_live_playback_policy" varchar(16),
	"mux_asset_id" varchar(128),
	"mux_asset_playback_id" varchar(128),
	"mux_asset_playback_policy" varchar(16),
	"r2_object_key" text,
	"r2_upload_id" text,
	"r2_etag" text,
	"original_file_name" text,
	"mime_type" varchar(128),
	"bytes" bigint,
	"duration_seconds" integer,
	"court_calibration" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_mux_live_stream_id_unique" UNIQUE("mux_live_stream_id"),
	CONSTRAINT "videos_mux_live_playback_id_unique" UNIQUE("mux_live_playback_id"),
	CONSTRAINT "videos_mux_asset_id_unique" UNIQUE("mux_asset_id"),
	CONSTRAINT "videos_mux_asset_playback_id_unique" UNIQUE("mux_asset_playback_id"),
	CONSTRAINT "videos_r2_object_key_unique" UNIQUE("r2_object_key"),
	CONSTRAINT "video_source_valid" CHECK ("videos"."source" IN ('live', 'upload')),
	CONSTRAINT "video_category_valid" CHECK ("videos"."category" IN ('practice', 'event', 'match', 'social')),
	CONSTRAINT "video_status_valid" CHECK ("videos"."status" IN ('draft', 'uploading', 'processing', 'ready', 'live', 'ended', 'failed', 'deleted')),
	CONSTRAINT "video_live_visibility_valid" CHECK ("videos"."live_visibility" IN ('public', 'link-only')),
	CONSTRAINT "video_recording_visibility_valid" CHECK ("videos"."recording_visibility" IN ('public', 'private')),
	CONSTRAINT "video_music_removal_status_valid" CHECK ("videos"."music_removal_status" IN ('not-requested', 'queued', 'processing', 'complete', 'failed', 'provider-required')),
	CONSTRAINT "video_duration_nonnegative" CHECK ("videos"."duration_seconds" IS NULL OR "videos"."duration_seconds" >= 0),
	CONSTRAINT "video_bytes_nonnegative" CHECK ("videos"."bytes" IS NULL OR "videos"."bytes" >= 0),
	CONSTRAINT "video_category_association" CHECK (("videos"."category" <> 'event' OR "videos"."event_id" IS NOT NULL) AND ("videos"."category" <> 'match' OR "videos"."match_id" IS NOT NULL)),
	CONSTRAINT "video_coordinates_pair" CHECK (("videos"."latitude" IS NULL AND "videos"."longitude" IS NULL) OR ("videos"."latitude" IS NOT NULL AND "videos"."longitude" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "duna_plus_grants" ADD CONSTRAINT "duna_plus_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duna_plus_grants" ADD CONSTRAINT "duna_plus_grants_granted_by_person_id_people_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duna_plus_grants" ADD CONSTRAINT "duna_plus_grants_revoked_by_person_id_people_id_fk" FOREIGN KEY ("revoked_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_quota_policies" ADD CONSTRAINT "video_quota_policies_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_quota_policies" ADD CONSTRAINT "video_quota_policies_updated_by_person_id_people_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_share_links" ADD CONSTRAINT "video_share_links_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_share_links" ADD CONSTRAINT "video_share_links_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_upload_parts" ADD CONSTRAINT "video_upload_parts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_views" ADD CONSTRAINT "video_views_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_views" ADD CONSTRAINT "video_views_viewer_person_id_people_id_fk" FOREIGN KEY ("viewer_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_views" ADD CONSTRAINT "video_views_share_link_id_video_share_links_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."video_share_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_event_id_sessions_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duna_plus_grant_person_idx" ON "duna_plus_grants" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "duna_plus_grant_status_end_idx" ON "duna_plus_grants" USING btree ("status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "video_quota_global_unique" ON "video_quota_policies" USING btree ((1)) WHERE "video_quota_policies"."person_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "video_quota_person_unique" ON "video_quota_policies" USING btree ("person_id") WHERE "video_quota_policies"."person_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "video_share_link_video_idx" ON "video_share_links" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "video_view_session_unique" ON "video_views" USING btree ("video_id","session_token_hash");--> statement-breakpoint
CREATE INDEX "video_view_video_started_idx" ON "video_views" USING btree ("video_id","started_at");--> statement-breakpoint
CREATE INDEX "video_owner_created_idx" ON "videos" USING btree ("owner_person_id","created_at");--> statement-breakpoint
CREATE INDEX "video_event_status_idx" ON "videos" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "video_match_status_idx" ON "videos" USING btree ("match_id","status");--> statement-breakpoint
CREATE INDEX "video_public_profile_idx" ON "videos" USING btree ("owner_person_id","published_to_profile","status");--> statement-breakpoint
INSERT INTO "video_quota_policies" (
	"person_id",
	"monthly_live_seconds",
	"monthly_upload_seconds",
	"enforce_live_limit",
	"enforce_upload_limit"
) VALUES (
	NULL,
	14400,
	86400,
	true,
	false
);--> statement-breakpoint
INSERT INTO "duna_plus_grants" (
	"person_id",
	"email_normalized",
	"status",
	"starts_at",
	"ends_at",
	"reason"
) VALUES (
	(
		SELECT "id"
		FROM "people"
		WHERE lower("email") = 'john@beachelite.org'
		LIMIT 1
	),
	'john@beachelite.org',
	'active',
	now(),
	NULL,
	'Founding complimentary Duna+'
);
