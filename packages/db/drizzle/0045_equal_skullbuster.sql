ALTER TABLE "duna_plus_grants" ALTER COLUMN "reason" SET DEFAULT 'Complimentary Premium+';--> statement-breakpoint
ALTER TABLE "video_quota_policies" ALTER COLUMN "monthly_live_seconds" SET DEFAULT 28800;--> statement-breakpoint
ALTER TABLE "video_quota_policies" ALTER COLUMN "monthly_upload_seconds" SET DEFAULT 108000;--> statement-breakpoint
ALTER TABLE "video_quota_policies" ALTER COLUMN "enforce_upload_limit" SET DEFAULT true;--> statement-breakpoint
UPDATE "video_quota_policies"
SET
	"monthly_live_seconds" = 28800,
	"monthly_upload_seconds" = 108000,
	"enforce_live_limit" = true,
	"enforce_upload_limit" = true,
	"updated_at" = now()
WHERE
	"person_id" IS NULL
	AND "monthly_live_seconds" = 14400
	AND "monthly_upload_seconds" = 86400
	AND "enforce_live_limit" = true
	AND "enforce_upload_limit" = false;
