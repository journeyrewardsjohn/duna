import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0101_strange_norrin_radd.sql", import.meta.url),
  ),
  "utf8",
);

describe("Cloudflare live and YouTube simulcast migration", () => {
  it("adds provider-neutral live input and playback fields", () => {
    expect(migration).toContain(
      'ALTER TABLE "videos" ADD COLUMN "live_provider"',
    );
    expect(migration).toContain(
      'ALTER TABLE "videos" ADD COLUMN "live_provider_input_id"',
    );
    expect(migration).toContain('CONSTRAINT "video_live_provider_valid"');
    expect(migration).toContain(
      'CONSTRAINT "video_live_provider_playback_policy_valid"',
    );
  });

  it("persists encrypted YouTube connections and expiring OAuth state", () => {
    expect(migration).toContain('CREATE TABLE "youtube_channel_connections"');
    expect(migration).toContain('"encrypted_refresh_token" text NOT NULL');
    expect(migration).toContain('"encryption_auth_tag" varchar(128) NOT NULL');
    expect(migration).toContain('CREATE TABLE "video_provider_oauth_states"');
    expect(migration).toContain(
      '"expires_at" timestamp with time zone NOT NULL',
    );
    expect(migration).toContain(
      'CONSTRAINT "video_provider_oauth_state_provider_valid"',
    );
  });

  it("tracks each simulcast destination without persisting an ingest key", () => {
    expect(migration).toContain('CREATE TABLE "video_broadcast_destinations"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "video_broadcast_destination_channel_unique"',
    );
    expect(migration).toContain(
      'CONSTRAINT "video_broadcast_destination_status_valid"',
    );
    expect(migration).not.toContain('"stream_key"');
    expect(migration).not.toContain('"access_token"');
  });
});
