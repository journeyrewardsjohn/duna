CREATE TABLE "video_broadcast_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"youtube_connection_id" uuid,
	"kind" varchar(32) NOT NULL,
	"channel_id" varchar(128) NOT NULL,
	"channel_title" text NOT NULL,
	"cloudflare_output_id" varchar(128),
	"youtube_broadcast_id" varchar(128),
	"youtube_stream_id" varchar(128),
	"youtube_watch_url" text,
	"youtube_privacy_status" varchar(16),
	"status" varchar(24) DEFAULT 'provisioning' NOT NULL,
	"failure_reason" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_broadcast_destination_kind_valid" CHECK ("video_broadcast_destinations"."kind" IN ('duna-youtube', 'connected-youtube')),
	CONSTRAINT "video_broadcast_destination_status_valid" CHECK ("video_broadcast_destinations"."status" IN ('provisioning', 'ready', 'failed', 'ended')),
	CONSTRAINT "video_broadcast_destination_privacy_valid" CHECK ("video_broadcast_destinations"."youtube_privacy_status" IS NULL OR "video_broadcast_destinations"."youtube_privacy_status" IN ('public', 'unlisted'))
);
--> statement-breakpoint
CREATE TABLE "video_provider_oauth_states" (
	"state_hash" varchar(64) PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid,
	"provider" varchar(24) NOT NULL,
	"return_url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_provider_oauth_state_provider_valid" CHECK ("video_provider_oauth_states"."provider" IN ('youtube'))
);
--> statement-breakpoint
CREATE TABLE "youtube_channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"organization_id" uuid,
	"channel_id" varchar(128) NOT NULL,
	"channel_title" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"encryption_iv" varchar(128) NOT NULL,
	"encryption_auth_tag" varchar(128) NOT NULL,
	"encryption_key_version" integer DEFAULT 1 NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_error" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_channel_connection_status_valid" CHECK ("youtube_channel_connections"."status" IN ('active', 'error', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "live_provider" varchar(24);--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "live_provider_input_id" varchar(128);--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "live_provider_playback_id" varchar(128);--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "live_provider_playback_url" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "live_provider_playback_policy" varchar(16);--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "live_provider_poster_url" text;--> statement-breakpoint
ALTER TABLE "video_broadcast_destinations" ADD CONSTRAINT "video_broadcast_destinations_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_broadcast_destinations" ADD CONSTRAINT "video_broadcast_destinations_youtube_connection_id_youtube_channel_connections_id_fk" FOREIGN KEY ("youtube_connection_id") REFERENCES "public"."youtube_channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_provider_oauth_states" ADD CONSTRAINT "video_provider_oauth_states_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_provider_oauth_states" ADD CONSTRAINT "video_provider_oauth_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_channel_connections" ADD CONSTRAINT "youtube_channel_connections_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_channel_connections" ADD CONSTRAINT "youtube_channel_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_broadcast_destination_channel_unique" ON "video_broadcast_destinations" USING btree ("video_id","kind","channel_id");--> statement-breakpoint
CREATE INDEX "video_broadcast_destination_video_idx" ON "video_broadcast_destinations" USING btree ("video_id","status");--> statement-breakpoint
CREATE INDEX "video_provider_oauth_state_expires_idx" ON "video_provider_oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_channel_connection_person_unique" ON "youtube_channel_connections" USING btree ("owner_person_id","channel_id") WHERE "youtube_channel_connections"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_channel_connection_organization_unique" ON "youtube_channel_connections" USING btree ("organization_id","channel_id") WHERE "youtube_channel_connections"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "youtube_channel_connection_scope_idx" ON "youtube_channel_connections" USING btree ("owner_person_id","organization_id","status");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_live_provider_input_id_unique" UNIQUE("live_provider_input_id");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "video_live_provider_valid" CHECK ("videos"."live_provider" IS NULL OR "videos"."live_provider" IN ('cloudflare', 'mux'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "video_live_provider_playback_policy_valid" CHECK ("videos"."live_provider_playback_policy" IS NULL OR "videos"."live_provider_playback_policy" IN ('public', 'signed'));