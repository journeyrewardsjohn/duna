import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", directory), "utf8"),
) as {
  readonly entries: readonly { readonly idx: number; readonly tag: string }[];
};
const entry = journal.entries.find((candidate) =>
  candidate.tag.endsWith("_add_score_drafts_venue_candidates"),
);
const migration = entry
  ? readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8")
  : "";
const statements = migration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

describe("SITE-3 migration: anonymous score drafts and candidate venues", () => {
  it("only adds", () => {
    expect(entry).toBeDefined();
    for (const statement of statements) {
      expect(statement).toMatch(
        /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE "(score_drafts|venue_candidates|venue_candidate_submitters)" ADD CONSTRAINT)/,
      );
      expect(statement).not.toMatch(/\bDROP\b|ALTER COLUMN|RENAME/);
    }
  });

  it("creates the three tables and no others", () => {
    const created = statements
      .map((statement) => statement.match(/^CREATE TABLE "([^"]+)"/)?.[1])
      .filter(Boolean);
    expect(created.sort()).toEqual([
      "score_drafts",
      "venue_candidate_submitters",
      "venue_candidates",
    ]);
  });

  it("stores a token hash, never a token, an address or a contact", () => {
    const drafts = statements.find((statement) =>
      statement.startsWith('CREATE TABLE "score_drafts"'),
    );
    expect(drafts).toContain('"token_hash" varchar(64) NOT NULL');
    expect(drafts).toContain('"expires_at" timestamp with time zone NOT NULL');
    expect(drafts).not.toMatch(/"(token|ip_address|email|phone[a-z_0-9]*)"/);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "score_draft_token_unique" ON "score_drafts" USING btree ("token_hash")',
    );
  });

  it("dedupes candidates by provider place id and counts each draft once", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "venue_candidate_place_unique" ON "venue_candidates" USING btree ("google_place_id") WHERE "venue_candidates"."google_place_id" IS NOT NULL',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "venue_candidate_submitter_unique" ON "venue_candidate_submitters" USING btree ("candidate_id","submitter_key")',
    );
    expect(migration).toContain('"provider_content_expires_at"');
  });
});
