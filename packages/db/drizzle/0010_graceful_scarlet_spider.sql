ALTER TABLE "memberships" ADD COLUMN "pause_months_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_membership_tier_code_unique" ON "membership_tiers" USING btree ("code") WHERE "membership_tiers"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_membership_tier_code_unique" ON "membership_tiers" USING btree ("organization_id","code") WHERE "membership_tiers"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "membership_person_status_idx" ON "memberships" USING btree ("person_id","status");--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_stripe_price_id_unique" UNIQUE("stripe_price_id");--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tier_price_valid" CHECK ("membership_tiers"."price_minor" >= 0);--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tier_interval_valid" CHECK ("membership_tiers"."interval" IN ('month', 'year'));--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "membership_pause_months_valid" CHECK ("memberships"."pause_months_used" >= 0 AND "memberships"."pause_months_used" <= 4);