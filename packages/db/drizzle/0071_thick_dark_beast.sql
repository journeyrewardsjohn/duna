CREATE TABLE "scraper_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"engine" varchar(16) DEFAULT 'auto' NOT NULL,
	"min_request_interval_ms" integer DEFAULT 3000 NOT NULL,
	"max_requests_per_hour" integer DEFAULT 120 NOT NULL,
	"linked_player_active_refresh_hours" integer,
	"linked_player_idle_refresh_hours" integer,
	"active_player_window_days" integer,
	"active_event_refresh_minutes" integer,
	"completed_event_grace_hours" integer,
	"live_transport_enabled" boolean DEFAULT true NOT NULL,
	"live_refresh_seconds" integer,
	"live_rest_fallback_seconds" integer,
	"live_health_status" varchar(16),
	"live_health_checked_at" timestamp with time zone,
	"live_health_latency_ms" integer,
	"live_health_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"firecrawl_cache_ttl_seconds" integer,
	"firecrawl_change_tracking" boolean DEFAULT false NOT NULL,
	"updated_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scraper_controls_source_unique" UNIQUE("source"),
	CONSTRAINT "scraper_control_engine_valid" CHECK ("scraper_controls"."engine" IN ('auto', 'native', 'firecrawl')),
	CONSTRAINT "scraper_control_min_interval_valid" CHECK ("scraper_controls"."min_request_interval_ms" BETWEEN 250 AND 3600000),
	CONSTRAINT "scraper_control_max_requests_valid" CHECK ("scraper_controls"."max_requests_per_hour" BETWEEN 1 AND 10000),
	CONSTRAINT "scraper_control_player_cadence_valid" CHECK (("scraper_controls"."linked_player_active_refresh_hours" IS NULL OR "scraper_controls"."linked_player_active_refresh_hours" BETWEEN 1 AND 720) AND ("scraper_controls"."linked_player_idle_refresh_hours" IS NULL OR "scraper_controls"."linked_player_idle_refresh_hours" BETWEEN 1 AND 8760) AND ("scraper_controls"."active_player_window_days" IS NULL OR "scraper_controls"."active_player_window_days" BETWEEN 1 AND 365)),
	CONSTRAINT "scraper_control_event_cadence_valid" CHECK (("scraper_controls"."active_event_refresh_minutes" IS NULL OR "scraper_controls"."active_event_refresh_minutes" BETWEEN 5 AND 10080) AND ("scraper_controls"."completed_event_grace_hours" IS NULL OR "scraper_controls"."completed_event_grace_hours" BETWEEN 0 AND 720)),
	CONSTRAINT "scraper_control_live_transport_valid" CHECK (("scraper_controls"."live_refresh_seconds" IS NULL OR "scraper_controls"."live_refresh_seconds" BETWEEN 60 AND 3600) AND ("scraper_controls"."live_rest_fallback_seconds" IS NULL OR "scraper_controls"."live_rest_fallback_seconds" BETWEEN 15 AND 300) AND ("scraper_controls"."live_health_status" IS NULL OR "scraper_controls"."live_health_status" IN ('idle', 'healthy', 'degraded', 'unavailable', 'paused')) AND ("scraper_controls"."live_health_latency_ms" IS NULL OR "scraper_controls"."live_health_latency_ms" >= 0)),
	CONSTRAINT "scraper_control_cache_ttl_valid" CHECK ("scraper_controls"."firecrawl_cache_ttl_seconds" IS NULL OR "scraper_controls"."firecrawl_cache_ttl_seconds" BETWEEN 0 AND 604800)
);
--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "last_duna_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scraper_controls" ADD CONSTRAINT "scraper_controls_updated_by_person_id_people_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "import_sources" ("slug", "name", "license_status", "created_at", "updated_at")
SELECT 'duna-legacy-archive', 'Duna legacy match archive', 'operator-authorized', now(), now()
WHERE EXISTS (SELECT 1 FROM "import_sources" WHERE "slug" = 'sandrating')
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "updated_at" = now();--> statement-breakpoint
UPDATE "import_links" SET "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'duna-legacy-archive')
WHERE "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'sandrating');--> statement-breakpoint
UPDATE "external_player_profiles" SET "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'duna-legacy-archive')
WHERE "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'sandrating');--> statement-breakpoint
UPDATE "sand_ingestion_runs" SET "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'duna-legacy-archive')
WHERE "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'sandrating');--> statement-breakpoint
UPDATE "imported_matches" SET "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'duna-legacy-archive')
WHERE "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'sandrating');--> statement-breakpoint
UPDATE "professional_events" SET "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'duna-legacy-archive')
WHERE "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'sandrating');--> statement-breakpoint
UPDATE "world_rankings" SET "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'duna-legacy-archive')
WHERE "source_id" = (SELECT "id" FROM "import_sources" WHERE "slug" = 'sandrating');--> statement-breakpoint
DELETE FROM "import_sources" WHERE "slug" = 'sandrating';--> statement-breakpoint
DELETE FROM "admin_roles"
WHERE "role" = 'super-admin'
  AND NOT EXISTS (
    SELECT 1 FROM "people"
    WHERE "people"."id" = "admin_roles"."person_id"
      AND lower("people"."email") = 'john@beachelite.org'
  );--> statement-breakpoint
INSERT INTO "admin_roles" ("person_id", "role", "scopes", "granted_by_person_id")
SELECT "id", 'super-admin', '{}'::text[], "id"
FROM "people"
WHERE lower("email") = 'john@beachelite.org'
ON CONFLICT ("person_id", "role") DO NOTHING;
