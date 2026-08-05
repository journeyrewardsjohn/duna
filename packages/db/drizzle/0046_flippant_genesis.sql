ALTER TABLE "organizations" ADD COLUMN "operator_commission_bps_override" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_fee_metadata_status" varchar(24) DEFAULT 'not-connected' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_fee_metadata_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_fee_metadata_error" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_billing_customer_id" varchar(128);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_id" varchar(128);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_status" varchar(32);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_billing_interval" varchar(12);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_current_period_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_current_period_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_billing_customer_id_unique" UNIQUE("stripe_billing_customer_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_plan_valid" CHECK ("organizations"."plan" IN ('coach', 'small-club', 'club', 'multi-venue'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_commission_override_valid" CHECK ("organizations"."operator_commission_bps_override" IS NULL OR "organizations"."operator_commission_bps_override" BETWEEN 0 AND 2500);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_fee_metadata_status_valid" CHECK ("organizations"."stripe_fee_metadata_status" IN ('not-connected', 'pending', 'synced', 'failed'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_plan_billing_interval_valid" CHECK ("organizations"."plan_billing_interval" IS NULL OR "organizations"."plan_billing_interval" IN ('month', 'year'));