CREATE TABLE "match_history_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"reason_code" varchar(32) NOT NULL,
	"details" text,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"excludes_from_rating" boolean DEFAULT true NOT NULL,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_history_dispute_reason_valid" CHECK ("match_history_disputes"."reason_code" IN ('not-me', 'wrong-score', 'wrong-opponents', 'duplicate', 'other')),
	CONSTRAINT "match_history_dispute_status_valid" CHECK ("match_history_disputes"."status" IN ('pending', 'upheld', 'rejected', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "college_name" text;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "api_profile_url" text;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "profile_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "verification_status" varchar(24) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "progress_phase" varchar(48) DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "progress_current" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "progress_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "matches_found" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "profiles_found" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "last_profile_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD COLUMN "next_refresh_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "google_place_id" text;--> statement-breakpoint
UPDATE "player_source_connections"
SET
	"verification_status" = 'confirmed',
	"verified_at" = COALESCE("last_synced_at", "updated_at"),
	"next_refresh_at" = COALESCE("next_refresh_at", NOW())
WHERE "status" = 'linked';--> statement-breakpoint
ALTER TABLE "match_history_disputes" ADD CONSTRAINT "match_history_disputes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history_disputes" ADD CONSTRAINT "match_history_disputes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history_disputes" ADD CONSTRAINT "match_history_disputes_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_history_dispute_person_match_unique" ON "match_history_disputes" USING btree ("person_id","match_id");--> statement-breakpoint
CREATE INDEX "match_history_dispute_review_idx" ON "match_history_disputes" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD CONSTRAINT "player_source_connection_verification_valid" CHECK ("player_source_connections"."verification_status" IN ('pending', 'confirmed', 'rejected'));--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD CONSTRAINT "player_source_connection_progress_valid" CHECK ("player_source_connections"."progress_current" >= 0 AND "player_source_connections"."progress_total" >= 0 AND "player_source_connections"."matches_found" >= 0 AND "player_source_connections"."profiles_found" >= 0);
