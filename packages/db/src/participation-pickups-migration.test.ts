import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", directory), "utf8"),
) as {
  readonly entries: readonly { readonly idx: number; readonly tag: string }[];
};
const entry = journal.entries.find((candidate) =>
  candidate.tag.endsWith("_participation_pickups_without_club"),
);
const migration = entry
  ? readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8")
  : "";

describe("PART part 2 migration: pickups with no club", () => {
  it("only widens: drops NOT NULL on the organisation and adds the due index", () => {
    expect(entry).toBeDefined();
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements).toEqual([
      'ALTER TABLE "participation_decisions" ALTER COLUMN "organization_id" DROP NOT NULL;',
      'ALTER TABLE "participation_notices" ALTER COLUMN "organization_id" DROP NOT NULL;',
      'CREATE INDEX "participation_decisions_due_idx" ON "participation_decisions" USING btree ("subject_type","lock_at") WHERE "participation_decisions"."outcome" IS NULL;',
    ]);
  });
});
