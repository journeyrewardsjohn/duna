CREATE TABLE "session_arrival_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"registration_id" uuid,
	"role" varchar(16) NOT NULL,
	"status" varchar(24) NOT NULL,
	"distance_meters" integer NOT NULL,
	"travel_duration_seconds" integer NOT NULL,
	"leave_by" timestamp with time zone NOT NULL,
	"route_source" varchar(24) NOT NULL,
	"accuracy_meters" double precision,
	"consented_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_arrival_signal_role_valid" CHECK ("session_arrival_signals"."role" IN ('player', 'coach')),
	CONSTRAINT "session_arrival_signal_status_valid" CHECK ("session_arrival_signals"."status" IN ('on-time', 'leave-now', 'running-late', 'arrived')),
	CONSTRAINT "session_arrival_signal_distance_valid" CHECK ("session_arrival_signals"."distance_meters" >= 0 AND "session_arrival_signals"."travel_duration_seconds" >= 0 AND ("session_arrival_signals"."accuracy_meters" IS NULL OR "session_arrival_signals"."accuracy_meters" >= 0)),
	CONSTRAINT "session_arrival_signal_expiry_valid" CHECK ("session_arrival_signals"."expires_at" > "session_arrival_signals"."observed_at")
);
--> statement-breakpoint
ALTER TABLE "live_activity_subscriptions" DROP CONSTRAINT "live_activity_subject_type_valid";--> statement-breakpoint
ALTER TABLE "live_activity_subscriptions" ADD COLUMN "app" varchar(16) DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_arrival_signals" ADD CONSTRAINT "session_arrival_signals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_arrival_signals" ADD CONSTRAINT "session_arrival_signals_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_arrival_signals" ADD CONSTRAINT "session_arrival_signals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_arrival_signals" ADD CONSTRAINT "session_arrival_signals_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_arrival_signal_session_person_unique" ON "session_arrival_signals" USING btree ("session_id","person_id");--> statement-breakpoint
CREATE INDEX "session_arrival_signal_session_expiry_idx" ON "session_arrival_signals" USING btree ("session_id","expires_at");--> statement-breakpoint
CREATE INDEX "session_arrival_signal_person_expiry_idx" ON "session_arrival_signals" USING btree ("person_id","expires_at");--> statement-breakpoint
ALTER TABLE "live_activity_subscriptions" ADD CONSTRAINT "live_activity_app_valid" CHECK ("live_activity_subscriptions"."app" IN ('player', 'pro'));--> statement-breakpoint
ALTER TABLE "live_activity_subscriptions" ADD CONSTRAINT "live_activity_subject_type_valid" CHECK ("live_activity_subscriptions"."subject_type" IN ('upcoming', 'match', 'event', 'player', 'coach'));