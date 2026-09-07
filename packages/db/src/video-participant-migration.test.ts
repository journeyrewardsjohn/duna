import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0107_shallow_invisible_woman.sql", import.meta.url),
  ),
  "utf8",
);

describe("linked video participant and private note migration", () => {
  it("keeps profile consent per player and notes private per viewer", () => {
    expect(migration).toContain('CREATE TABLE "video_participants"');
    expect(migration).toContain(
      "\"profile_status\" varchar(16) DEFAULT 'pending' NOT NULL",
    );
    expect(migration).toContain('CONSTRAINT "video_participant_decision_pair"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "video_participant_video_person_unique"',
    );
    expect(migration).toContain('CREATE TABLE "player_video_notes"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "player_video_note_video_person_unique"',
    );
    expect(migration).toContain("ON DELETE cascade");
  });
});
