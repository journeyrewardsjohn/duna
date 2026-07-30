CREATE TABLE "guardian_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_id" uuid NOT NULL,
	"minor_id" uuid NOT NULL,
	"disclosure_version" varchar(32) NOT NULL,
	"disclosure_text" text NOT NULL,
	"disclosure_text_hash" varchar(128) NOT NULL,
	"granted" boolean NOT NULL,
	"method" varchar(32) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_consent_distinct_people" CHECK ("guardian_consents"."guardian_id" <> "guardian_consents"."minor_id"),
	CONSTRAINT "guardian_consent_method_valid" CHECK ("guardian_consents"."method" IN ('signed-attestation', 'identity-provider', 'admin-review'))
);
--> statement-breakpoint
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_guardian_id_people_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_minor_id_people_id_fk" FOREIGN KEY ("minor_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_consent_minor_idx" ON "guardian_consents" USING btree ("minor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "guardian_consent_guardian_idx" ON "guardian_consents" USING btree ("guardian_id","occurred_at");