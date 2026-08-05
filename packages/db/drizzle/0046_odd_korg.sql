CREATE TABLE "health_connections" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(24) DEFAULT 'apple-health' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"consent_version" varchar(64) NOT NULL,
	"enabled_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"earliest_authorized_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_connection_provider_valid" CHECK ("health_connections"."provider" = 'apple-health'),
	CONSTRAINT "health_connection_status_valid" CHECK ("health_connections"."status" IN ('active', 'paused', 'revoked')),
	CONSTRAINT "health_connection_categories_valid" CHECK ("health_connections"."enabled_categories" <@ ARRAY['heart', 'recovery', 'activity', 'body']::text[])
);
--> statement-breakpoint
CREATE TABLE "health_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"external_id_hash" varchar(64) NOT NULL,
	"metric" varchar(48) NOT NULL,
	"sample_kind" varchar(16) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"encrypted_payload" text NOT NULL,
	"encryption_iv" varchar(32) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_sample_metric_valid" CHECK ("health_samples"."metric" IN ('heart-rate', 'resting-heart-rate', 'heart-rate-variability', 'walking-heart-rate', 'vo2-max', 'respiratory-rate', 'oxygen-saturation', 'body-temperature', 'sleep', 'active-energy', 'basal-energy', 'steps', 'distance', 'exercise-minutes', 'stand-minutes', 'workout', 'weight', 'body-fat', 'lean-body-mass')),
	CONSTRAINT "health_sample_kind_valid" CHECK ("health_samples"."sample_kind" IN ('quantity', 'category', 'workout')),
	CONSTRAINT "health_sample_time_valid" CHECK ("health_samples"."ended_at" >= "health_samples"."started_at"),
	CONSTRAINT "health_sample_key_version_valid" CHECK ("health_samples"."key_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "health_sharing_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"audience_kind" varchar(24) NOT NULL,
	"audience_person_id" uuid,
	"organization_id" uuid,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"consent_version" varchar(64) NOT NULL,
	"consent_text_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_grant_audience_kind_valid" CHECK ("health_sharing_grants"."audience_kind" IN ('player', 'coach', 'organization')),
	CONSTRAINT "health_grant_audience_shape_valid" CHECK (("health_sharing_grants"."audience_kind" IN ('player', 'coach') AND "health_sharing_grants"."audience_person_id" IS NOT NULL AND "health_sharing_grants"."organization_id" IS NULL) OR ("health_sharing_grants"."audience_kind" = 'organization' AND "health_sharing_grants"."audience_person_id" IS NULL AND "health_sharing_grants"."organization_id" IS NOT NULL)),
	CONSTRAINT "health_grant_categories_valid" CHECK (cardinality("health_sharing_grants"."categories") > 0 AND "health_sharing_grants"."categories" <@ ARRAY['heart', 'recovery', 'activity', 'body']::text[]),
	CONSTRAINT "health_grant_scopes_valid" CHECK (cardinality("health_sharing_grants"."scopes") > 0 AND "health_sharing_grants"."scopes" <@ ARRAY['summary', 'timeline', 'video-overlay']::text[]),
	CONSTRAINT "health_grant_video_overlay_heart" CHECK (NOT ('video-overlay' = ANY("health_sharing_grants"."scopes")) OR 'heart' = ANY("health_sharing_grants"."categories")),
	CONSTRAINT "health_grant_window_valid" CHECK ("health_sharing_grants"."expires_at" > "health_sharing_grants"."created_at")
);
--> statement-breakpoint
ALTER TABLE "vision_timeline_events" DROP CONSTRAINT "vision_timeline_type_valid";--> statement-breakpoint
ALTER TABLE "health_connections" ADD CONSTRAINT "health_connections_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_samples" ADD CONSTRAINT "health_samples_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD CONSTRAINT "health_sharing_grants_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD CONSTRAINT "health_sharing_grants_audience_person_id_people_id_fk" FOREIGN KEY ("audience_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD CONSTRAINT "health_sharing_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "health_sample_person_external_unique" ON "health_samples" USING btree ("person_id","external_id_hash");--> statement-breakpoint
CREATE INDEX "health_sample_person_started_idx" ON "health_samples" USING btree ("person_id","started_at");--> statement-breakpoint
CREATE INDEX "health_sample_person_metric_started_idx" ON "health_samples" USING btree ("person_id","metric","started_at");--> statement-breakpoint
CREATE INDEX "health_grant_owner_idx" ON "health_sharing_grants" USING btree ("owner_person_id","created_at");--> statement-breakpoint
CREATE INDEX "health_grant_person_audience_idx" ON "health_sharing_grants" USING btree ("audience_person_id","expires_at");--> statement-breakpoint
CREATE INDEX "health_grant_org_audience_idx" ON "health_sharing_grants" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "health_grant_active_person_unique" ON "health_sharing_grants" USING btree ("owner_person_id","audience_kind","audience_person_id") WHERE "health_sharing_grants"."audience_person_id" IS NOT NULL AND "health_sharing_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "health_grant_active_org_unique" ON "health_sharing_grants" USING btree ("owner_person_id","audience_kind","organization_id") WHERE "health_sharing_grants"."organization_id" IS NOT NULL AND "health_sharing_grants"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "vision_timeline_events" ADD CONSTRAINT "vision_timeline_type_valid" CHECK ("vision_timeline_events"."type" IN ('recording-started', 'rally-won', 'favorite', 'undo', 'side-change', 'set-ended', 'recording-stopped', 'calibration-updated'));