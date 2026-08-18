CREATE TABLE "player_event_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "activity_type" varchar(24) NOT NULL,
  "activity_id" uuid NOT NULL,
  "visibility" varchar(24) DEFAULT 'private' NOT NULL,
  "source" varchar(24) DEFAULT 'typed' NOT NULL,
  "body" text NOT NULL,
  "audio_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_event_note_type_valid" CHECK ("player_event_notes"."activity_type" IN ('pickup', 'session')),
  CONSTRAINT "player_event_note_visibility_valid" CHECK ("player_event_notes"."visibility" IN ('private', 'shared-with-host')),
  CONSTRAINT "player_event_note_source_valid" CHECK ("player_event_notes"."source" IN ('typed', 'voice'))
);
--> statement-breakpoint
ALTER TABLE "player_event_notes" ADD CONSTRAINT "player_event_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "player_event_note_person_activity_idx" ON "player_event_notes" USING btree ("person_id","activity_type","activity_id","created_at");
