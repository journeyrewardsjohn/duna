ALTER TABLE "people" ADD COLUMN "age_band" varchar(16) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "age_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_age_band_check" CHECK ("people"."age_band" IN ('unknown', 'under-13', 'teen', 'adult'));--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_minor_age_band_check" CHECK ("people"."age_band" NOT IN ('under-13', 'teen') OR "people"."is_minor");