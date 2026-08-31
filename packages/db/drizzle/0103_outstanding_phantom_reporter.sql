ALTER TABLE "matches" ADD COLUMN "weather_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "weather_captured_at" timestamp with time zone;