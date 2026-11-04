ALTER TABLE "club_websites" ADD COLUMN "publishing_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "club_websites" ADD COLUMN "publish_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "club_websites" ADD COLUMN "publish_lease_expires_at" timestamp with time zone;