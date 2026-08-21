ALTER TABLE "organizations" DROP CONSTRAINT "organization_plan_valid";--> statement-breakpoint
UPDATE "organizations" SET "plan" = 'club' WHERE "plan" = 'multi-venue';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "volleyball_types" text[] DEFAULT ARRAY['beach']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "video_upload_addon_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "video_live_addon_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "video_payg_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_volleyball_types_valid" CHECK (cardinality("organizations"."volleyball_types") BETWEEN 1 AND 2 AND "organizations"."volleyball_types" <@ ARRAY['beach', 'indoor']::text[]);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_video_addons_nonnegative" CHECK ("organizations"."video_upload_addon_seconds" >= 0 AND "organizations"."video_live_addon_seconds" >= 0);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_plan_valid" CHECK ("organizations"."plan" IN ('coach', 'small-club', 'club'));
