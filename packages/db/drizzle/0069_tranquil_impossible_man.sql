ALTER TABLE "refund_records" DROP CONSTRAINT "refund_record_amount_positive";--> statement-breakpoint
ALTER TABLE "refund_records" DROP CONSTRAINT "refund_record_disposition_valid";--> statement-breakpoint
ALTER TABLE "refund_records" DROP CONSTRAINT "refund_record_credit_pair";--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD COLUMN "restoration_journal_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD COLUMN "restored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refund_records" ADD COLUMN "credits_restored" integer;--> statement-breakpoint
ALTER TABLE "session_operations" ADD COLUMN "refund_status" varchar(24);--> statement-breakpoint
ALTER TABLE "session_operations" ADD COLUMN "refund_summary" jsonb;--> statement-breakpoint
ALTER TABLE "session_operations" ADD COLUMN "refund_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "seed" integer;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "selection_status" varchar(24) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "selection_reason" text;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "selection_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "qualification_score" double precision;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "qualification_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "team_entries" ADD COLUMN "selected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_applications_restoration_journal_id_ledger_journals_id_fk" FOREIGN KEY ("restoration_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_credit_application_restoration_idx" ON "organization_credit_applications" USING btree ("order_id","restored_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_entry_team_unique" ON "team_entries" USING btree ("team_id") WHERE "team_entries"."team_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_record_amount_valid" CHECK (("refund_records"."disposition" = 'organization-credit-restoration' AND "refund_records"."amount_minor" >= 0) OR ("refund_records"."disposition" <> 'organization-credit-restoration' AND "refund_records"."amount_minor" > 0));--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_record_disposition_valid" CHECK ("refund_records"."disposition" IN ('original-payment', 'organization-credit', 'organization-credit-restoration'));--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_record_credit_pair" CHECK (("refund_records"."disposition" = 'organization-credit' AND "refund_records"."credits_issued" > 0 AND "refund_records"."credits_restored" IS NULL) OR ("refund_records"."disposition" = 'organization-credit-restoration' AND "refund_records"."credits_issued" IS NULL AND "refund_records"."credits_restored" > 0) OR ("refund_records"."disposition" = 'original-payment' AND "refund_records"."credits_issued" IS NULL AND "refund_records"."credits_restored" IS NULL));--> statement-breakpoint
ALTER TABLE "session_operations" ADD CONSTRAINT "session_operation_refund_status_valid" CHECK ("session_operations"."refund_status" IS NULL OR "session_operations"."refund_status" IN ('pending', 'complete', 'attention'));--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entry_selection_status" CHECK ("team_entries"."selection_status" IN ('pending', 'confirmed', 'waitlisted', 'withdrawn'));--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entry_seed_positive" CHECK ("team_entries"."seed" IS NULL OR "team_entries"."seed" > 0);