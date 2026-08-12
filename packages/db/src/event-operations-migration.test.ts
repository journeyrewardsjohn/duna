import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0069_tranquil_impossible_man.sql", import.meta.url),
  ),
  "utf8",
);

describe("event operations migration", () => {
  it("persists cancellation refund recovery and exact credit restoration", () => {
    expect(migration).toContain('ADD COLUMN "refund_status" varchar(24)');
    expect(migration).toContain('ADD COLUMN "refund_summary" jsonb');
    expect(migration).toContain('ADD COLUMN "restoration_journal_id" uuid');
    expect(migration).toContain('ADD COLUMN "credits_restored" integer');
    expect(migration).toContain("organization-credit-restoration");
  });

  it("adds linked, seeded, and auditable team selection state", () => {
    expect(migration).toContain('ADD COLUMN "team_id" uuid');
    expect(migration).toContain('ADD COLUMN "seed" integer');
    expect(migration).toContain('ADD COLUMN "selection_status" varchar(24)');
    expect(migration).toContain('ADD COLUMN "qualification_snapshot" jsonb');
    expect(migration).toContain('CREATE UNIQUE INDEX "team_entry_team_unique"');
  });
});
