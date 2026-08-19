CREATE TABLE "catalog_session_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"local_date" date NOT NULL,
	"local_time" time(0) NOT NULL,
	"coach_person_ids" uuid[] DEFAULT '{}' NOT NULL,
	"capacity" integer NOT NULL,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_session_occurrence_time_valid" CHECK ("catalog_session_occurrences"."ends_at" > "catalog_session_occurrences"."starts_at"),
	CONSTRAINT "catalog_session_occurrence_capacity_valid" CHECK ("catalog_session_occurrences"."capacity" > 0),
	CONSTRAINT "catalog_session_occurrence_status_valid" CHECK ("catalog_session_occurrences"."status" IN ('scheduled', 'cancelled', 'complete'))
);
--> statement-breakpoint
CREATE TABLE "virtual_session_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"virtual_session_meeting_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"provider_artifact_name" text NOT NULL,
	"provider_file_id" text,
	"provider_export_uri" text,
	"storage_object_key" text,
	"state" varchar(24) DEFAULT 'pending' NOT NULL,
	"transcript_text" text,
	"ai_summary" text,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"participant_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_model" varchar(160),
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "virtual_session_artifact_kind_valid" CHECK ("virtual_session_artifacts"."kind" IN ('recording', 'transcript')),
	CONSTRAINT "virtual_session_artifact_state_valid" CHECK ("virtual_session_artifacts"."state" IN ('pending', 'available', 'stored', 'summarized', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "virtual_session_meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"virtual_session_meeting_id" uuid NOT NULL,
	"fulfillment_id" uuid,
	"person_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"email_snapshot" text,
	"display_name_snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "virtual_session_participant_role_valid" CHECK ("virtual_session_meeting_participants"."role" IN ('coach', 'player'))
);
--> statement-breakpoint
CREATE TABLE "virtual_session_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"catalog_session_occurrence_id" uuid NOT NULL,
	"session_id" uuid,
	"coach_person_ids" uuid[] DEFAULT '{}' NOT NULL,
	"participant_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"provider" varchar(32) DEFAULT 'google-meet' NOT NULL,
	"organizer_email" text,
	"calendar_event_id" text,
	"calendar_html_url" text,
	"meet_space_name" text,
	"meeting_code" varchar(128),
	"join_url" text,
	"conference_record_name" text,
	"auto_record" boolean DEFAULT false NOT NULL,
	"auto_transcribe" boolean DEFAULT false NOT NULL,
	"generate_ai_summary" boolean DEFAULT false NOT NULL,
	"recording_consent_required" boolean DEFAULT true NOT NULL,
	"status" varchar(32) DEFAULT 'provisioning' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"artifacts_synced_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "virtual_session_meetings_catalog_session_occurrence_id_unique" UNIQUE("catalog_session_occurrence_id"),
	CONSTRAINT "virtual_session_time_valid" CHECK ("virtual_session_meetings"."ends_at" > "virtual_session_meetings"."starts_at"),
	CONSTRAINT "virtual_session_provider_valid" CHECK ("virtual_session_meetings"."provider" IN ('google-meet')),
	CONSTRAINT "virtual_session_status_valid" CHECK ("virtual_session_meetings"."status" IN ('provisioning', 'scheduled', 'in-progress', 'awaiting-artifacts', 'complete', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD COLUMN "catalog_session_occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD CONSTRAINT "catalog_session_occurrences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD CONSTRAINT "catalog_session_occurrences_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_artifacts" ADD CONSTRAINT "virtual_session_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_artifacts" ADD CONSTRAINT "virtual_session_artifacts_virtual_session_meeting_id_virtual_session_meetings_id_fk" FOREIGN KEY ("virtual_session_meeting_id") REFERENCES "public"."virtual_session_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meeting_participants" ADD CONSTRAINT "virtual_session_meeting_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meeting_participants" ADD CONSTRAINT "virtual_session_meeting_participants_virtual_session_meeting_id_virtual_session_meetings_id_fk" FOREIGN KEY ("virtual_session_meeting_id") REFERENCES "public"."virtual_session_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meeting_participants" ADD CONSTRAINT "virtual_session_meeting_participants_fulfillment_id_catalog_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."catalog_fulfillments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meeting_participants" ADD CONSTRAINT "virtual_session_meeting_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meetings" ADD CONSTRAINT "virtual_session_meetings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meetings" ADD CONSTRAINT "virtual_session_meetings_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meetings" ADD CONSTRAINT "virtual_session_meetings_catalog_session_occurrence_id_catalog_session_occurrences_id_fk" FOREIGN KEY ("catalog_session_occurrence_id") REFERENCES "public"."catalog_session_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_session_meetings" ADD CONSTRAINT "virtual_session_meetings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_session_occurrence_item_time_unique" ON "catalog_session_occurrences" USING btree ("catalog_item_id","starts_at");--> statement-breakpoint
CREATE INDEX "catalog_session_occurrence_org_time_idx" ON "catalog_session_occurrences" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "virtual_session_artifact_provider_unique" ON "virtual_session_artifacts" USING btree ("virtual_session_meeting_id","provider_artifact_name");--> statement-breakpoint
CREATE INDEX "virtual_session_artifact_meeting_kind_idx" ON "virtual_session_artifacts" USING btree ("virtual_session_meeting_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "virtual_session_participant_meeting_person_unique" ON "virtual_session_meeting_participants" USING btree ("virtual_session_meeting_id","person_id","role");--> statement-breakpoint
CREATE INDEX "virtual_session_participant_person_idx" ON "virtual_session_meeting_participants" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "virtual_session_catalog_time_idx" ON "virtual_session_meetings" USING btree ("catalog_item_id","starts_at");--> statement-breakpoint
CREATE INDEX "virtual_session_processing_idx" ON "virtual_session_meetings" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "virtual_session_calendar_event_idx" ON "virtual_session_meetings" USING btree ("calendar_event_id");--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_catalog_session_occurrence_id_catalog_session_occurrences_id_fk" FOREIGN KEY ("catalog_session_occurrence_id") REFERENCES "public"."catalog_session_occurrences"("id") ON DELETE restrict ON UPDATE no action;