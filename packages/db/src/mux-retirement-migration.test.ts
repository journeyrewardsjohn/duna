import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = new URL("../drizzle/", import.meta.url);
const tag = "0117_retire_mux_only_videos";
const migration = readFileSync(new URL(`${tag}.sql`, directory), "utf8");

const owner = "20000000-0000-4000-8000-000000000001";
const video = {
  muxReady: "60000000-0000-4000-8000-000000000001",
  muxProcessingBeforeProviderColumn: "60000000-0000-4000-8000-000000000002",
  muxDraftWithoutIds: "60000000-0000-4000-8000-000000000003",
  muxDeleted: "60000000-0000-4000-8000-000000000004",
  muxWithR2Original: "60000000-0000-4000-8000-000000000005",
  cloudflareReady: "60000000-0000-4000-8000-000000000006",
  cloudflareProcessing: "60000000-0000-4000-8000-000000000007",
  r2Upload: "60000000-0000-4000-8000-000000000008",
} as const;

async function applyMigration(pg: PGlite, source: string): Promise<void> {
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

describe("Mux retirement migration", () => {
  it("only updates data, so it is safe before the new release is live", () => {
    expect(migration).toContain("\"status\" = 'failed'");
    expect(migration).not.toMatch(
      /\b(ALTER|DROP|CREATE|DELETE|TRUNCATE|INSERT)\b/i,
    );
  });

  describe("applied to the real schema", () => {
    let pg: PGlite;

    beforeAll(async () => {
      pg = new PGlite({ extensions: { btree_gist, pg_trgm, pgcrypto } });
      const journal = JSON.parse(
        readFileSync(new URL("meta/_journal.json", directory), "utf8"),
      ) as { readonly entries: readonly { readonly tag: string }[] };
      const tags = journal.entries.map((entry) => entry.tag);
      expect(tags).toContain(tag);
      for (const earlierTag of tags.slice(0, tags.indexOf(tag))) {
        await applyMigration(
          pg,
          readFileSync(new URL(`${earlierTag}.sql`, directory), "utf8"),
        );
      }
      await pg.exec(`
        INSERT INTO people (id, display_name, handle)
          VALUES ('${owner}', 'Owner', 'owner');
        INSERT INTO videos
          (id, owner_person_id, source, category, title, status,
           live_provider, live_provider_input_id, live_provider_playback_id,
           live_provider_playback_url, mux_live_stream_id, mux_live_playback_id,
           mux_asset_id, mux_asset_playback_id, r2_object_key, failure_reason)
        VALUES
          ('${video.muxReady}', '${owner}', 'live', 'practice', 'Mux ready',
           'ready', 'mux', 'mux-live-1', 'mux-playback-1', NULL,
           'mux-live-1', 'mux-playback-1', 'mux-asset-1', 'mux-asset-playback-1',
           NULL, NULL),
          ('${video.muxProcessingBeforeProviderColumn}', '${owner}', 'live',
           'practice', 'Mux processing', 'processing', NULL, NULL, NULL, NULL,
           'mux-live-2', 'mux-playback-2', NULL, NULL, NULL, NULL),
          ('${video.muxDraftWithoutIds}', '${owner}', 'live', 'practice',
           'Mux draft', 'draft', 'mux', NULL, NULL, NULL, NULL, NULL, NULL,
           NULL, NULL, NULL),
          ('${video.muxDeleted}', '${owner}', 'live', 'practice', 'Mux deleted',
           'deleted', 'mux', 'mux-live-4', NULL, NULL, 'mux-live-4', NULL,
           NULL, NULL, NULL, 'Removed by its owner.'),
          ('${video.muxWithR2Original}', '${owner}', 'live', 'practice',
           'Mux with original', 'ready', 'mux', 'mux-live-5', NULL, NULL,
           'mux-live-5', NULL, 'mux-asset-5', NULL,
           'videos/people/owner/original.mp4', NULL),
          ('${video.cloudflareReady}', '${owner}', 'live', 'practice',
           'Cloudflare ready', 'ready', 'cloudflare', 'cf-input-6',
           'cf-video-6', 'https://customer.example.com/cf-video-6/manifest/video.m3u8',
           NULL, NULL, NULL, NULL, NULL, NULL),
          ('${video.cloudflareProcessing}', '${owner}', 'live', 'practice',
           'Cloudflare processing', 'processing', 'cloudflare', 'cf-input-7',
           NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
          ('${video.r2Upload}', '${owner}', 'upload', 'practice', 'R2 upload',
           'ready', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
           'videos/people/owner/upload.mp4', NULL);
      `);
      await applyMigration(pg, migration);
      // The runner has no surrounding transaction, so an interrupted run is
      // replayed from the first statement. A second pass must be harmless.
      await applyMigration(pg, migration);
    }, 120_000);

    afterAll(async () => {
      await pg?.close();
    });

    async function stored(id: string) {
      const result = await pg.query<{
        status: string;
        live_provider: string | null;
        mux_live_stream_id: string | null;
        failure_reason: string | null;
        r2_object_key: string | null;
      }>(
        `SELECT status, live_provider, mux_live_stream_id, failure_reason,
                r2_object_key
           FROM videos WHERE id = $1`,
        [id],
      );
      return result.rows[0];
    }

    it("moves every Mux-only video to the terminal failed status", async () => {
      for (const id of [
        video.muxReady,
        video.muxProcessingBeforeProviderColumn,
        video.muxDraftWithoutIds,
      ]) {
        const row = await stored(id);
        expect(row?.status).toBe("failed");
        expect(row?.failure_reason).toContain("no longer available");
      }
    });

    it("keeps each legacy row, its provider value, and its Mux IDs", async () => {
      const count = await pg.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM videos",
      );
      expect(count.rows[0]?.total).toBe(Object.keys(video).length);
      expect(await stored(video.muxReady)).toMatchObject({
        live_provider: "mux",
        mux_live_stream_id: "mux-live-1",
      });
      expect(
        await stored(video.muxProcessingBeforeProviderColumn),
      ).toMatchObject({
        live_provider: null,
        mux_live_stream_id: "mux-live-2",
      });
    });

    it("leaves deleted videos and videos with an R2 original as they were", async () => {
      expect(await stored(video.muxDeleted)).toMatchObject({
        status: "deleted",
        failure_reason: "Removed by its owner.",
      });
      expect(await stored(video.muxWithR2Original)).toMatchObject({
        status: "ready",
        failure_reason: null,
        r2_object_key: "videos/people/owner/original.mp4",
      });
    });

    it("does not touch Cloudflare Stream or R2 videos", async () => {
      expect(await stored(video.cloudflareReady)).toMatchObject({
        status: "ready",
        live_provider: "cloudflare",
        failure_reason: null,
      });
      expect(await stored(video.cloudflareProcessing)).toMatchObject({
        status: "processing",
        live_provider: "cloudflare",
        failure_reason: null,
      });
      expect(await stored(video.r2Upload)).toMatchObject({
        status: "ready",
        live_provider: null,
        failure_reason: null,
        r2_object_key: "videos/people/owner/upload.mp4",
      });
    });
  });
});
