CREATE TABLE "video_allowance_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"person_id" uuid,
	"scope_organization_id" uuid,
	"upload_seconds" integer DEFAULT 0 NOT NULL,
	"live_seconds" integer DEFAULT 0 NOT NULL,
	"cadence" varchar(24) DEFAULT 'current-period' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"reason" text NOT NULL,
	"granted_by_person_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_allowance_grant_target_valid" CHECK (("video_allowance_grants"."organization_id" IS NOT NULL)::int + ("video_allowance_grants"."person_id" IS NOT NULL)::int = 1),
	CONSTRAINT "video_allowance_grant_seconds_valid" CHECK ("video_allowance_grants"."upload_seconds" >= 0 AND "video_allowance_grants"."live_seconds" >= 0 AND ("video_allowance_grants"."upload_seconds" > 0 OR "video_allowance_grants"."live_seconds" > 0)),
	CONSTRAINT "video_allowance_grant_cadence_valid" CHECK ("video_allowance_grants"."cadence" IN ('current-period', 'recurring')),
	CONSTRAINT "video_allowance_grant_window_valid" CHECK ("video_allowance_grants"."ends_at" IS NULL OR "video_allowance_grants"."ends_at" > "video_allowance_grants"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "admin_plan_override" varchar(24);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_discount_bps" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_discount_duration" varchar(16);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_discount_months" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_discount_coupon_id" varchar(128);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_billing_policy_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_billing_policy_error" text;--> statement-breakpoint
ALTER TABLE "video_allowance_grants" ADD CONSTRAINT "video_allowance_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_allowance_grants" ADD CONSTRAINT "video_allowance_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_allowance_grants" ADD CONSTRAINT "video_allowance_grants_scope_organization_id_organizations_id_fk" FOREIGN KEY ("scope_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_allowance_grants" ADD CONSTRAINT "video_allowance_grants_granted_by_person_id_people_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_allowance_grants" ADD CONSTRAINT "video_allowance_grants_revoked_by_person_id_people_id_fk" FOREIGN KEY ("revoked_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_allowance_grant_organization_idx" ON "video_allowance_grants" USING btree ("organization_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "video_allowance_grant_person_idx" ON "video_allowance_grants" USING btree ("person_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "video_allowance_grant_scope_idx" ON "video_allowance_grants" USING btree ("scope_organization_id","created_at");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_admin_plan_override_valid" CHECK ("organizations"."admin_plan_override" IS NULL OR "organizations"."admin_plan_override" IN ('coach', 'small-club', 'club'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_subscription_discount_valid" CHECK (("organizations"."stripe_subscription_discount_bps" IS NULL AND "organizations"."stripe_subscription_discount_duration" IS NULL AND "organizations"."stripe_subscription_discount_months" IS NULL) OR ("organizations"."stripe_subscription_discount_bps" BETWEEN 1 AND 10000 AND "organizations"."stripe_subscription_discount_duration" IN ('once', 'repeating', 'forever') AND (("organizations"."stripe_subscription_discount_duration" = 'repeating' AND "organizations"."stripe_subscription_discount_months" BETWEEN 1 AND 36) OR ("organizations"."stripe_subscription_discount_duration" <> 'repeating' AND "organizations"."stripe_subscription_discount_months" IS NULL))));