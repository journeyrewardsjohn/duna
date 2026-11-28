ALTER TABLE "participation_decisions" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participation_notices" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "participation_decisions_due_idx" ON "participation_decisions" USING btree ("subject_type","lock_at") WHERE "participation_decisions"."outcome" IS NULL;