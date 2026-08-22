import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0096_opposite_bloodaxe.sql", import.meta.url),
  ),
  "utf8",
);

describe("durable video upload and governed Vision learning migration", () => {
  it("persists the multipart part size needed to resume legacy and current uploads", () => {
    expect(migration).toContain(
      'ALTER TABLE "videos" ADD COLUMN "r2_part_size_bytes" integer',
    );
    expect(migration).toContain('CONSTRAINT "video_r2_part_size_valid"');
  });

  it("keeps coaching and model-improvement recommendations separate and reviewable", () => {
    expect(migration).toContain('CREATE TABLE "video_performance_reviews"');
    expect(migration).toContain('CREATE TABLE "vision_improvement_proposals"');
    expect(migration).toContain(
      'CREATE TABLE "vision_improvement_proposal_reviews"',
    );
    expect(migration).toContain(
      'CONSTRAINT "vision_improvement_proposal_review_decision_valid"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "vision_improvement_proposal_run_unique"',
    );
  });
});
