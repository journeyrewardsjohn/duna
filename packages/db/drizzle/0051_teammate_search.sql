CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_teammate_search_trgm_idx"
ON "people"
USING gin (
  (
    coalesce("display_name", '') || ' ' ||
    coalesce("handle", '') || ' ' ||
    coalesce("home_market", '')
  ) gin_trgm_ops
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_member_person_recent_idx"
ON "team_members" USING btree ("person_id", "joined_at" DESC);
