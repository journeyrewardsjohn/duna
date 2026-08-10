CREATE TABLE "venue_layout_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" uuid NOT NULL,
	"court_id" uuid,
	"ticket_type_id" uuid,
	"kind" varchar(32) NOT NULL,
	"template_key" varchar(48),
	"label" text NOT NULL,
	"identifier_code" varchar(48),
	"capacity" integer,
	"geometry" jsonb NOT NULL,
	"appearance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_layout_asset_kind_valid" CHECK ("venue_layout_assets"."kind" IN ('court', 'shape', 'ticketed-space', 'table', 'amenity', 'bookable-block')),
	CONSTRAINT "venue_layout_asset_capacity_positive" CHECK ("venue_layout_assets"."capacity" IS NULL OR "venue_layout_assets"."capacity" > 0),
	CONSTRAINT "venue_layout_asset_court_link" CHECK (("venue_layout_assets"."kind" = 'court' AND "venue_layout_assets"."court_id" IS NOT NULL) OR "venue_layout_assets"."kind" <> 'court')
);
--> statement-breakpoint
CREATE TABLE "venue_layout_division_priorities" (
	"layout_asset_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"starts_here" boolean DEFAULT false NOT NULL,
	"allow_when_free" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_layout_division_priorities_layout_asset_id_division_id_pk" PRIMARY KEY("layout_asset_id","division_id"),
	CONSTRAINT "venue_layout_division_priority_positive" CHECK ("venue_layout_division_priorities"."priority" > 0)
);
--> statement-breakpoint
CREATE TABLE "venue_layout_event_settings" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"layout_id" uuid NOT NULL,
	"ai_court_assignment_enabled" boolean DEFAULT false NOT NULL,
	"average_match_minutes" integer DEFAULT 45 NOT NULL,
	"release_court_when_free" boolean DEFAULT true NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_layout_event_match_minutes_positive" CHECK ("venue_layout_event_settings"."average_match_minutes" BETWEEN 10 AND 240)
);
--> statement-breakpoint
CREATE TABLE "venue_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"event_session_id" uuid,
	"created_by_person_id" uuid,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"source_type" varchar(24) DEFAULT 'satellite' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"floorplan_image_url" text,
	"floorplan_analysis" jsonb,
	"map_center_latitude" double precision,
	"map_center_longitude" double precision,
	"map_zoom" double precision DEFAULT 19 NOT NULL,
	"map_bearing" double precision DEFAULT 0 NOT NULL,
	"map_pitch" double precision DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_layout_version_positive" CHECK ("venue_layouts"."version" > 0),
	CONSTRAINT "venue_layout_status_valid" CHECK ("venue_layouts"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "venue_layout_source_type_valid" CHECK ("venue_layouts"."source_type" IN ('satellite', 'floorplan')),
	CONSTRAINT "venue_layout_map_center_pair" CHECK (("venue_layouts"."map_center_latitude" IS NULL AND "venue_layouts"."map_center_longitude" IS NULL) OR ("venue_layouts"."map_center_latitude" BETWEEN -90 AND 90 AND "venue_layouts"."map_center_longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "location_kind" varchar(32) DEFAULT 'private-venue' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "environment" varchar(16) DEFAULT 'outdoor' NOT NULL;--> statement-breakpoint
ALTER TABLE "venue_layout_assets" ADD CONSTRAINT "venue_layout_assets_layout_id_venue_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."venue_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layout_assets" ADD CONSTRAINT "venue_layout_assets_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layout_assets" ADD CONSTRAINT "venue_layout_assets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layout_division_priorities" ADD CONSTRAINT "venue_layout_division_priorities_layout_asset_id_venue_layout_assets_id_fk" FOREIGN KEY ("layout_asset_id") REFERENCES "public"."venue_layout_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layout_division_priorities" ADD CONSTRAINT "venue_layout_division_priorities_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layout_event_settings" ADD CONSTRAINT "venue_layout_event_settings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layout_event_settings" ADD CONSTRAINT "venue_layout_event_settings_layout_id_venue_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."venue_layouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layouts" ADD CONSTRAINT "venue_layouts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layouts" ADD CONSTRAINT "venue_layouts_event_session_id_sessions_id_fk" FOREIGN KEY ("event_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_layouts" ADD CONSTRAINT "venue_layouts_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_layout_asset_court_unique" ON "venue_layout_assets" USING btree ("layout_id","court_id") WHERE "venue_layout_assets"."court_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_layout_asset_code_unique" ON "venue_layout_assets" USING btree ("layout_id","identifier_code") WHERE "venue_layout_assets"."identifier_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "venue_layout_asset_layout_sort_idx" ON "venue_layout_assets" USING btree ("layout_id","sort_order");--> statement-breakpoint
CREATE INDEX "venue_layout_division_priority_idx" ON "venue_layout_division_priorities" USING btree ("division_id","priority");--> statement-breakpoint
CREATE INDEX "venue_layout_event_settings_layout_idx" ON "venue_layout_event_settings" USING btree ("layout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_layout_venue_version_unique" ON "venue_layouts" USING btree ("venue_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_layout_primary_unique" ON "venue_layouts" USING btree ("venue_id") WHERE "venue_layouts"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "venue_layout_venue_status_idx" ON "venue_layouts" USING btree ("venue_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "venue_layout_event_idx" ON "venue_layouts" USING btree ("event_session_id");--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venue_environment_valid" CHECK ("venues"."environment" IN ('indoor', 'outdoor'));