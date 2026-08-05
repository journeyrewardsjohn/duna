CREATE TABLE "player_follow_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_person_id" uuid NOT NULL,
	"player_person_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"entity_key" varchar(192) NOT NULL,
	"message_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_follow_delivery_kind_valid" CHECK ("player_follow_deliveries"."kind" IN ('registration', 'watch', 'result'))
);
--> statement-breakpoint
CREATE TABLE "player_follow_preferences" (
	"follower_person_id" uuid NOT NULL,
	"player_person_id" uuid NOT NULL,
	"notify_registrations" boolean DEFAULT true NOT NULL,
	"notify_watch" boolean DEFAULT true NOT NULL,
	"notify_results" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_follow_preferences_follower_person_id_player_person_id_pk" PRIMARY KEY("follower_person_id","player_person_id"),
	CONSTRAINT "player_follow_preferences_not_self" CHECK ("player_follow_preferences"."follower_person_id" <> "player_follow_preferences"."player_person_id")
);
--> statement-breakpoint
CREATE TABLE "player_media_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"reference_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brief" text,
	"generation_prompt" text,
	"models" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rights_confirmed_at" timestamp with time zone,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_media_workflow_status_valid" CHECK ("player_media_workflows"."status" IN ('draft', 'ready', 'generating', 'review', 'published', 'failed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "player_public_profiles" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"publication_status" varchar(24) DEFAULT 'draft' NOT NULL,
	"short_bio" text,
	"biography" text,
	"country_code" varchar(3),
	"hometown" text,
	"college_name" text,
	"college_logo_url" text,
	"playing_role" varchar(48),
	"cutout_image_url" text,
	"hero_image_url" text,
	"hero_video_url" text,
	"image_alt" text,
	"career_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"news" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"research_status" varchar(24) DEFAULT 'not-started' NOT NULL,
	"research_proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"research_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"research_model" varchar(160),
	"researched_at" timestamp with time zone,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_public_profile_publication_status_valid" CHECK ("player_public_profiles"."publication_status" IN ('draft', 'review', 'published')),
	CONSTRAINT "player_public_profile_research_status_valid" CHECK ("player_public_profiles"."research_status" IN ('not-started', 'queued', 'researching', 'review', 'published', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "player_follow_deliveries" ADD CONSTRAINT "player_follow_deliveries_follower_person_id_people_id_fk" FOREIGN KEY ("follower_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_follow_deliveries" ADD CONSTRAINT "player_follow_deliveries_player_person_id_people_id_fk" FOREIGN KEY ("player_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_follow_deliveries" ADD CONSTRAINT "player_follow_deliveries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_follow_preferences" ADD CONSTRAINT "player_follow_preferences_follower_person_id_people_id_fk" FOREIGN KEY ("follower_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_follow_preferences" ADD CONSTRAINT "player_follow_preferences_player_person_id_people_id_fk" FOREIGN KEY ("player_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_media_workflows" ADD CONSTRAINT "player_media_workflows_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_media_workflows" ADD CONSTRAINT "player_media_workflows_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_media_workflows" ADD CONSTRAINT "player_media_workflows_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_public_profiles" ADD CONSTRAINT "player_public_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_public_profiles" ADD CONSTRAINT "player_public_profiles_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_follow_delivery_unique" ON "player_follow_deliveries" USING btree ("follower_person_id","player_person_id","kind","entity_key");--> statement-breakpoint
CREATE INDEX "player_follow_delivery_player_idx" ON "player_follow_deliveries" USING btree ("player_person_id","created_at");--> statement-breakpoint
CREATE INDEX "player_follow_preferences_player_idx" ON "player_follow_preferences" USING btree ("player_person_id");--> statement-breakpoint
CREATE INDEX "player_media_workflow_person_idx" ON "player_media_workflows" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "player_media_workflow_queue_idx" ON "player_media_workflows" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "player_public_profile_status_idx" ON "player_public_profiles" USING btree ("publication_status","updated_at");--> statement-breakpoint
CREATE INDEX "player_public_profile_research_idx" ON "player_public_profiles" USING btree ("research_status","researched_at");