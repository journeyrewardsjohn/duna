CREATE TABLE "player_video_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_video_note_body_valid" CHECK (char_length("player_video_notes"."body") BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "video_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"profile_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"notified_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_participant_profile_status_valid" CHECK ("video_participants"."profile_status" IN ('pending', 'included', 'hidden')),
	CONSTRAINT "video_participant_decision_pair" CHECK (("video_participants"."profile_status" = 'pending' AND "video_participants"."decided_at" IS NULL) OR ("video_participants"."profile_status" <> 'pending' AND "video_participants"."decided_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "player_video_notes" ADD CONSTRAINT "player_video_notes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_video_notes" ADD CONSTRAINT "player_video_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_participants" ADD CONSTRAINT "video_participants_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_participants" ADD CONSTRAINT "video_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_video_note_video_person_unique" ON "player_video_notes" USING btree ("video_id","person_id");--> statement-breakpoint
CREATE INDEX "player_video_note_person_activity_idx" ON "player_video_notes" USING btree ("person_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "video_participant_video_person_unique" ON "video_participants" USING btree ("video_id","person_id");--> statement-breakpoint
CREATE INDEX "video_participant_person_status_idx" ON "video_participants" USING btree ("person_id","profile_status","created_at");