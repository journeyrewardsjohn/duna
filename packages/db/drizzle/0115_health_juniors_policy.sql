CREATE TABLE "health_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"actor_person_id" uuid,
	"actor_role" varchar(16) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"grant_id" uuid,
	"subject_age_band" varchar(16) NOT NULL,
	"policy_version" varchar(64) NOT NULL,
	"disclosure_text_hash" varchar(64) NOT NULL,
	"ip_address" varchar(64),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_consent_actor_role_valid" CHECK ("health_consents"."actor_role" IN ('subject', 'guardian', 'system')),
	CONSTRAINT "health_consent_kind_valid" CHECK ("health_consents"."kind" IN ('collection', 'grant')),
	CONSTRAINT "health_consent_decision_valid" CHECK ("health_consents"."decision" IN ('granted', 'denied', 'withdrawn')),
	CONSTRAINT "health_consent_grant_shape_valid" CHECK ("health_consents"."kind" = 'collection' OR "health_consents"."grant_id" IS NOT NULL OR "health_consents"."decision" = 'withdrawn')
);
--> statement-breakpoint
CREATE TABLE "health_retention_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"policy_version" varchar(64) NOT NULL,
	"expired_samples_deleted" integer DEFAULT 0 NOT NULL,
	"expired_check_ins_deleted" integer DEFAULT 0 NOT NULL,
	"withdrawn_samples_deleted" integer DEFAULT 0 NOT NULL,
	"withdrawn_connections_purged" integer DEFAULT 0 NOT NULL,
	"age_bands_refreshed" integer DEFAULT 0 NOT NULL,
	"batches" integer DEFAULT 0 NOT NULL,
	"complete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_connections" ADD COLUMN "storefront_country" varchar(3);--> statement-breakpoint
ALTER TABLE "health_connections" ADD COLUMN "storefront_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "health_connections" ADD COLUMN "purge_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD COLUMN "approval_status" varchar(16) DEFAULT 'not-required' NOT NULL;--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD COLUMN "approved_by_guardian_id" uuid;--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_subject_person_id_people_id_fk" FOREIGN KEY ("subject_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_grant_id_health_sharing_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."health_sharing_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_consent_subject_kind_idx" ON "health_consents" USING btree ("subject_person_id","kind","occurred_at");--> statement-breakpoint
CREATE INDEX "health_consent_actor_idx" ON "health_consents" USING btree ("actor_person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "health_consent_grant_idx" ON "health_consents" USING btree ("grant_id");--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD CONSTRAINT "health_sharing_grants_approved_by_guardian_id_people_id_fk" FOREIGN KEY ("approved_by_guardian_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_connection_purge_idx" ON "health_connections" USING btree ("purge_requested_at") WHERE "health_connections"."purge_requested_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "health_sharing_grants" ADD CONSTRAINT "health_grant_approval_status_valid" CHECK ("health_sharing_grants"."approval_status" IN ('not-required', 'pending', 'approved', 'denied'));