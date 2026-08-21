ALTER TABLE "scraper_controls" ADD COLUMN "native_failure_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scraper_controls" ADD COLUMN "firecrawl_preferred_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scraper_controls" ADD COLUMN "native_last_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scraper_controls" ADD COLUMN "firecrawl_fallback_last_succeeded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scraper_controls" ADD COLUMN "native_last_error" text;--> statement-breakpoint
ALTER TABLE "scraper_controls" ADD CONSTRAINT "scraper_control_native_failure_streak_valid" CHECK ("scraper_controls"."native_failure_streak" >= 0);