CREATE TABLE "health_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source" varchar(24) DEFAULT 'apple-healthkit' NOT NULL,
	"metrics" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_metric_snapshot_source_valid" CHECK ("health_metric_snapshots"."source" IN ('apple-healthkit'))
);
--> statement-breakpoint
CREATE TABLE "organization_health_data_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"consent_id" uuid,
	"source" varchar(24) DEFAULT 'apple-healthkit' NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"disclosure_text" text NOT NULL,
	"disclosure_text_hash" varchar(128) NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_health_grant_source_valid" CHECK ("organization_health_data_grants"."source" IN ('apple-healthkit')),
	CONSTRAINT "organization_health_grant_status_valid" CHECK ("organization_health_data_grants"."status" IN ('active', 'revoked')),
	CONSTRAINT "organization_health_grant_revocation_pair_valid" CHECK (("organization_health_data_grants"."status" = 'revoked' AND "organization_health_data_grants"."revoked_at" IS NOT NULL) OR ("organization_health_data_grants"."status" = 'active' AND "organization_health_data_grants"."revoked_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"registration_id" uuid,
	"person_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"note" text,
	"recorded_by_person_id" uuid,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_attendance_status_valid" CHECK ("session_attendance"."status" IN ('scheduled', 'attended', 'no-show', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "session_note_recipients" (
	"note_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"detected" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_note_recipients_note_id_person_id_pk" PRIMARY KEY("note_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"subject" text,
	"visibility" varchar(24) DEFAULT 'private' NOT NULL,
	"source" varchar(24) DEFAULT 'typed' NOT NULL,
	"transcript" text,
	"summary" text NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_note_visibility_valid" CHECK ("session_notes"."visibility" IN ('private', 'player')),
	CONSTRAINT "session_note_source_valid" CHECK ("session_notes"."source" IN ('typed', 'livekit-voice')),
	CONSTRAINT "session_note_status_valid" CHECK ("session_notes"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "session_note_publish_pair_valid" CHECK (("session_notes"."status" = 'published' AND "session_notes"."visibility" = 'player' AND "session_notes"."published_at" IS NOT NULL) OR ("session_notes"."status" <> 'published' AND "session_notes"."published_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "session_operations" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"cancellation_kind" varchar(24),
	"cancellation_reason" text,
	"cancelled_by_person_id" uuid,
	"cancelled_at" timestamp with time zone,
	"weather_snapshot" jsonb,
	"weather_captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_operation_cancellation_kind_valid" CHECK ("session_operations"."cancellation_kind" IS NULL OR "session_operations"."cancellation_kind" IN ('coach', 'weather', 'operator', 'venue', 'other')),
	CONSTRAINT "session_operation_cancellation_pair_valid" CHECK (("session_operations"."cancelled_at" IS NULL AND "session_operations"."cancellation_kind" IS NULL AND "session_operations"."cancellation_reason" IS NULL) OR ("session_operations"."cancelled_at" IS NOT NULL AND "session_operations"."cancellation_kind" IS NOT NULL AND "session_operations"."cancellation_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "health_metric_snapshots" ADD CONSTRAINT "health_metric_snapshots_grant_id_organization_health_data_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."organization_health_data_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metric_snapshots" ADD CONSTRAINT "health_metric_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metric_snapshots" ADD CONSTRAINT "health_metric_snapshots_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_health_data_grants" ADD CONSTRAINT "organization_health_data_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_health_data_grants" ADD CONSTRAINT "organization_health_data_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_health_data_grants" ADD CONSTRAINT "organization_health_data_grants_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_recorded_by_person_id_people_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note_recipients" ADD CONSTRAINT "session_note_recipients_note_id_session_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."session_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note_recipients" ADD CONSTRAINT "session_note_recipients_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_operations" ADD CONSTRAINT "session_operations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_operations" ADD CONSTRAINT "session_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_operations" ADD CONSTRAINT "session_operations_cancelled_by_person_id_people_id_fk" FOREIGN KEY ("cancelled_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_metric_snapshot_person_observed_idx" ON "health_metric_snapshots" USING btree ("organization_id","person_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_health_grant_person_unique" ON "organization_health_data_grants" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE INDEX "organization_health_grant_status_idx" ON "organization_health_data_grants" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_attendance_person_unique" ON "session_attendance" USING btree ("session_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_attendance_registration_unique" ON "session_attendance" USING btree ("registration_id") WHERE "session_attendance"."registration_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "session_attendance_org_status_idx" ON "session_attendance" USING btree ("organization_id","status","recorded_at");--> statement-breakpoint
CREATE INDEX "session_note_recipient_person_idx" ON "session_note_recipients" USING btree ("person_id","shared_at");--> statement-breakpoint
CREATE INDEX "session_note_org_session_idx" ON "session_notes" USING btree ("organization_id","session_id","created_at");--> statement-breakpoint
CREATE INDEX "session_operation_org_cancelled_idx" ON "session_operations" USING btree ("organization_id","cancelled_at");