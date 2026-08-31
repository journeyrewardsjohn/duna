import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../drizzle/0103_outstanding_phantom_reporter.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("match weather migration", () => {
  it("persists the immutable provider snapshot and capture time on a match", () => {
    expect(migration).toContain(
      'ALTER TABLE "matches" ADD COLUMN "weather_snapshot" jsonb',
    );
    expect(migration).toContain(
      'ALTER TABLE "matches" ADD COLUMN "weather_captured_at" timestamp with time zone',
    );
  });
});
