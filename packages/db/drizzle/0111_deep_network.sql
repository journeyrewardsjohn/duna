ALTER TABLE "website_revisions" ALTER COLUMN "document" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "website_revisions" ADD COLUMN "operation_id" text;--> statement-breakpoint
ALTER TABLE "website_revisions" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "website_revisions" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "website_revisions" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "website_revision_operation_unique" ON "website_revisions" USING btree ("site_id","operation_id");