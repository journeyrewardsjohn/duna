ALTER TABLE "team_entries" ADD COLUMN "expected_team_size" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "payment_mode" varchar(16) DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "roster" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "status" varchar(24) DEFAULT 'assembling' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "team_entry_registration_unique" ON "team_entries" USING btree ("registration_id");--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entry_expected_size" CHECK ("team_entries"."expected_team_size" >= 2);--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entry_payment_mode" CHECK ("team_entries"."payment_mode" IN ('self', 'team'));--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entry_status" CHECK ("team_entries"."status" IN ('assembling', 'ready', 'confirmed', 'cancelled', 'expired'));