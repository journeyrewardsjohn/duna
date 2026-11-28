CREATE TABLE "score_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"data" jsonb NOT NULL,
	"place_kind" varchar(16),
	"venue_id" uuid,
	"venue_candidate_id" uuid,
	"played_on" date,
	"claimed_by_person_id" uuid,
	"claimed_match_id" uuid,
	"claim_started_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_draft_status_valid" CHECK ("score_drafts"."status" IN ('draft', 'claiming', 'claimed')),
	CONSTRAINT "score_draft_place_kind_valid" CHECK ("score_drafts"."place_kind" IS NULL OR "score_drafts"."place_kind" IN ('duna', 'places', 'described')),
	CONSTRAINT "score_draft_claim_complete" CHECK ("score_drafts"."status" <> 'claimed' OR ("score_drafts"."claimed_by_person_id" IS NOT NULL AND "score_drafts"."claimed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "venue_candidate_submitters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"submitter_key" varchar(64) NOT NULL,
	"draft_id" uuid,
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(16) NOT NULL,
	"google_place_id" text,
	"described_name" text,
	"described_address" text,
	"provider_name" text,
	"provider_address" text,
	"provider_content_expires_at" timestamp with time zone,
	"latitude" double precision,
	"longitude" double precision,
	"surface" varchar(16),
	"nets" integer,
	"normalized_name" text NOT NULL,
	"distinct_submitters" integer DEFAULT 0 NOT NULL,
	"claimed_submitters" integer DEFAULT 0 NOT NULL,
	"suggested_venue_id" uuid,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"resolved_venue_id" uuid,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"first_submitted_at" timestamp with time zone NOT NULL,
	"last_submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_candidate_source_valid" CHECK ("venue_candidates"."source" IN ('places', 'described')),
	CONSTRAINT "venue_candidate_status_valid" CHECK ("venue_candidates"."status" IN ('pending', 'promoted', 'merged', 'dismissed')),
	CONSTRAINT "venue_candidate_surface_valid" CHECK ("venue_candidates"."surface" IS NULL OR "venue_candidates"."surface" IN ('beach-sand', 'indoor-sand', 'indoor-hardwood', 'grass')),
	CONSTRAINT "venue_candidate_nets_range" CHECK ("venue_candidates"."nets" IS NULL OR ("venue_candidates"."nets" >= 1 AND "venue_candidates"."nets" <= 40)),
	CONSTRAINT "venue_candidate_counts_nonnegative" CHECK ("venue_candidates"."distinct_submitters" >= 0 AND "venue_candidates"."claimed_submitters" >= 0),
	CONSTRAINT "venue_candidate_place_for_places" CHECK ("venue_candidates"."source" <> 'places' OR "venue_candidates"."google_place_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "score_drafts" ADD CONSTRAINT "score_drafts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_drafts" ADD CONSTRAINT "score_drafts_venue_candidate_id_venue_candidates_id_fk" FOREIGN KEY ("venue_candidate_id") REFERENCES "public"."venue_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_drafts" ADD CONSTRAINT "score_drafts_claimed_by_person_id_people_id_fk" FOREIGN KEY ("claimed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_drafts" ADD CONSTRAINT "score_drafts_claimed_match_id_matches_id_fk" FOREIGN KEY ("claimed_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_candidate_submitters" ADD CONSTRAINT "venue_candidate_submitters_candidate_id_venue_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."venue_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_candidate_submitters" ADD CONSTRAINT "venue_candidate_submitters_draft_id_score_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."score_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_candidate_submitters" ADD CONSTRAINT "venue_candidate_submitters_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_candidates" ADD CONSTRAINT "venue_candidates_suggested_venue_id_venues_id_fk" FOREIGN KEY ("suggested_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_candidates" ADD CONSTRAINT "venue_candidates_resolved_venue_id_venues_id_fk" FOREIGN KEY ("resolved_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_candidates" ADD CONSTRAINT "venue_candidates_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "score_draft_token_unique" ON "score_drafts" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "score_draft_expiry_idx" ON "score_drafts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "score_draft_candidate_idx" ON "score_drafts" USING btree ("venue_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_candidate_submitter_unique" ON "venue_candidate_submitters" USING btree ("candidate_id","submitter_key");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_candidate_place_unique" ON "venue_candidates" USING btree ("google_place_id") WHERE "venue_candidates"."google_place_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "venue_candidate_status_idx" ON "venue_candidates" USING btree ("status","last_submitted_at");--> statement-breakpoint
CREATE INDEX "venue_candidate_geo_idx" ON "venue_candidates" USING btree ("latitude","longitude");