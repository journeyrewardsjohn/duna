ALTER TABLE "guardianships" ADD COLUMN "review_status" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "guardianships" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "guardianships" ADD COLUMN "reviewed_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "guardianships" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianship_review_status_valid" CHECK ("guardianships"."review_status" IN ('pending', 'verified', 'rejected'));