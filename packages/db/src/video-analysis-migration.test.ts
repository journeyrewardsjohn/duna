import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0071_solid_bushwacker.sql", import.meta.url),
  ),
  "utf8",
);

describe("video analysis migration", () => {
  it("keeps model observations, human review, and run completion states durable", () => {
    expect(migration).toContain('CREATE TABLE "video_analysis_runs"');
    expect(migration).toContain('CREATE TABLE "video_analysis_events"');
    expect(migration).toContain('CREATE TABLE "video_analysis_reviews"');
    expect(migration).toContain("'needs-review', 'failed', 'cancelled'");
    expect(migration).toContain('"completed_at" IS NOT NULL');
  });

  it("adds the Watch review cue to the append-only Vision timeline", () => {
    expect(migration).toContain("'review-marker'");
    expect(migration).toContain('"vision_timeline_type_valid"');
  });
});
