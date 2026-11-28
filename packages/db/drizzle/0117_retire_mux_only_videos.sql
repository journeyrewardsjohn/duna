-- Mux was removed on 2026-11-27. Cloudflare Stream (live) and R2 (uploads) are
-- Duna's only video providers.
--
-- Data only: a video whose only media lived at Mux can never become playable
-- again, so move it to the existing terminal 'failed' status instead of leaving
-- it "processing" forever. No row is deleted, no column or constraint changes,
-- and Cloudflare and R2 videos are untouched. Safe to apply before the release
-- that stops using Mux, and safe to run again.
--
-- The "mux_*" columns are dropped by a later migration, once no deployed code
-- selects them.
UPDATE "videos"
SET
	"status" = 'failed',
	"failure_reason" = 'Recorded through Mux, which Duna retired on 2026-11-27. The recording is no longer available.',
	"updated_at" = now()
WHERE "status" NOT IN ('failed', 'deleted')
	AND "r2_object_key" IS NULL
	AND "live_provider" IS DISTINCT FROM 'cloudflare'
	AND (
		"live_provider" = 'mux'
		OR "mux_live_stream_id" IS NOT NULL
		OR "mux_live_playback_id" IS NOT NULL
		OR "mux_asset_id" IS NOT NULL
		OR "mux_asset_playback_id" IS NOT NULL
	);
