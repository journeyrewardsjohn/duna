CREATE TABLE "community_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" text NOT NULL,
	"author_person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'held' NOT NULL,
	"moderation_state" varchar(24) DEFAULT 'screening' NOT NULL,
	"moderation_reason" text,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_comment_subject_type_valid" CHECK ("community_comments"."subject_type" IN ('match', 'live-stream', 'pro-event', 'prediction-market')),
	CONSTRAINT "community_comment_status_valid" CHECK ("community_comments"."status" IN ('held', 'visible', 'removed')),
	CONSTRAINT "community_comment_moderation_valid" CHECK ("community_comments"."moderation_state" IN ('screening', 'safe', 'review', 'blocked')),
	CONSTRAINT "community_comment_body_valid" CHECK (char_length("community_comments"."body") BETWEEN 1 AND 1500)
);
--> statement-breakpoint
CREATE TABLE "player_match_note_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"claimed_by_person_id" uuid,
	"token_hash" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_match_note_shares_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "player_match_note_share_status_valid" CHECK ("player_match_note_shares"."status" IN ('active', 'revoked')),
	CONSTRAINT "player_match_note_share_people_distinct" CHECK ("player_match_note_shares"."claimed_by_person_id" IS NULL OR "player_match_note_shares"."claimed_by_person_id" <> "player_match_note_shares"."owner_person_id"),
	CONSTRAINT "player_match_note_share_claim_valid" CHECK (("player_match_note_shares"."claimed_by_person_id" IS NULL AND "player_match_note_shares"."claimed_at" IS NULL) OR ("player_match_note_shares"."claimed_by_person_id" IS NOT NULL AND "player_match_note_shares"."claimed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "player_match_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source" varchar(24) DEFAULT 'typed' NOT NULL,
	"body" text NOT NULL,
	"ai_summary" text,
	"ai_insights" jsonb,
	"ai_status" varchar(24) DEFAULT 'pending' NOT NULL,
	"ai_model" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_match_note_source_valid" CHECK ("player_match_notes"."source" IN ('typed', 'voice')),
	CONSTRAINT "player_match_note_ai_status_valid" CHECK ("player_match_notes"."ai_status" IN ('pending', 'ready', 'unavailable')),
	CONSTRAINT "player_match_note_body_valid" CHECK (char_length("player_match_notes"."body") BETWEEN 1 AND 5000)
);
--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_note_shares" ADD CONSTRAINT "player_match_note_shares_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_note_shares" ADD CONSTRAINT "player_match_note_shares_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_note_shares" ADD CONSTRAINT "player_match_note_shares_claimed_by_person_id_people_id_fk" FOREIGN KEY ("claimed_by_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_notes" ADD CONSTRAINT "player_match_notes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_notes" ADD CONSTRAINT "player_match_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_comment_subject_idx" ON "community_comments" USING btree ("subject_type","subject_id","status","created_at");--> statement-breakpoint
CREATE INDEX "community_comment_author_idx" ON "community_comments" USING btree ("author_person_id","created_at");--> statement-breakpoint
CREATE INDEX "player_match_note_share_owner_idx" ON "player_match_note_shares" USING btree ("owner_person_id","match_id","status");--> statement-breakpoint
CREATE INDEX "player_match_note_share_claimant_idx" ON "player_match_note_shares" USING btree ("claimed_by_person_id","status");--> statement-breakpoint
CREATE INDEX "player_match_note_person_match_idx" ON "player_match_notes" USING btree ("person_id","match_id","created_at");