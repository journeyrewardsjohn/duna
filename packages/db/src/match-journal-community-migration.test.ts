import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../drizzle/0104_perfect_famine.sql", import.meta.url)),
  "utf8",
);

describe("private match journal and community migration", () => {
  it("keeps private journals separate from public match data", () => {
    expect(migration).toContain('CREATE TABLE "player_match_notes"');
    expect(migration).toContain('"person_id" uuid NOT NULL');
    expect(migration).toContain('CONSTRAINT "player_match_note_source_valid"');
    expect(migration).toContain(
      'CONSTRAINT "player_match_note_ai_status_valid"',
    );
  });

  it("stores only hashed, revocable, single-recipient note invites", () => {
    expect(migration).toContain('CREATE TABLE "player_match_note_shares"');
    expect(migration).toContain('"token_hash" varchar(64) NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "player_match_note_share_people_distinct"',
    );
    expect(migration).toContain(
      'CONSTRAINT "player_match_note_share_claim_valid"',
    );
    expect(migration).not.toContain('"token" text');
  });

  it("creates one moderated conversation model for every supported surface", () => {
    expect(migration).toContain('CREATE TABLE "community_comments"');
    expect(migration).toContain(
      "'match', 'live-stream', 'pro-event', 'prediction-market'",
    );
    expect(migration).toContain('CONSTRAINT "community_comment_status_valid"');
    expect(migration).toContain(
      'CONSTRAINT "community_comment_moderation_valid"',
    );
  });
});
