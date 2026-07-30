CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_request_kind_valid" CHECK ("privacy_requests"."kind" IN ('account-deletion')),
	CONSTRAINT "privacy_request_status_valid" CHECK ("privacy_requests"."status" IN ('queued', 'identity-review', 'legal-hold', 'completed', 'cancelled')),
	CONSTRAINT "privacy_request_completion_valid" CHECK ("privacy_requests"."status" <> 'completed' OR "privacy_requests"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_request_active_unique" ON "privacy_requests" USING btree ("person_id","kind") WHERE "privacy_requests"."status" IN ('queued', 'identity-review', 'legal-hold');