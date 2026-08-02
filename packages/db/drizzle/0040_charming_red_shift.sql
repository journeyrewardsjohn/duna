CREATE TABLE "live_activity_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"subject_type" varchar(24) NOT NULL,
	"subject_id" uuid NOT NULL,
	"activity_id" varchar(128) NOT NULL,
	"push_token" text NOT NULL,
	"environment" varchar(16) DEFAULT 'production' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"last_error" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_activity_subject_type_valid" CHECK ("live_activity_subscriptions"."subject_type" IN ('upcoming', 'match')),
	CONSTRAINT "live_activity_environment_valid" CHECK ("live_activity_subscriptions"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "live_activity_status_valid" CHECK ("live_activity_subscriptions"."status" IN ('active', 'expired', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "live_activity_subscriptions" ADD CONSTRAINT "live_activity_subscriptions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_activity_push_token_unique" ON "live_activity_subscriptions" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX "live_activity_subject_status_idx" ON "live_activity_subscriptions" USING btree ("subject_type","subject_id","status");--> statement-breakpoint
CREATE INDEX "live_activity_person_status_idx" ON "live_activity_subscriptions" USING btree ("person_id","status");