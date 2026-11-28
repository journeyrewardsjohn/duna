import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("../drizzle/", import.meta.url);
const file = readdirSync(directory).find((name) =>
  name.endsWith("_health_juniors_policy.sql"),
);
const migration = file ? readFileSync(new URL(file, directory), "utf8") : "";

describe("H1 health juniors migration", () => {
  it("exists exactly once", () => {
    expect(file).toBeDefined();
  });

  it("is additive: no drops, renames, type changes or row rewrites", () => {
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bRENAME\b/i);
    expect(migration).not.toMatch(/\bALTER COLUMN\b/i);
    expect(migration).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\b/im);
  });

  it("records consent acts and retention runs", () => {
    expect(migration).toContain('CREATE TABLE "health_consents"');
    expect(migration).toContain('CREATE TABLE "health_retention_runs"');
    expect(migration).toContain(
      "\"health_consents\".\"decision\" IN ('granted', 'denied', 'withdrawn')",
    );
  });

  it("adds storefront, purge and guardian approval columns with safe defaults", () => {
    for (const column of [
      '"health_connections" ADD COLUMN "storefront_country" varchar(3);',
      '"health_connections" ADD COLUMN "storefront_reported_at" timestamp with time zone;',
      '"health_connections" ADD COLUMN "purge_requested_at" timestamp with time zone;',
      '"health_sharing_grants" ADD COLUMN "approval_status" varchar(16) DEFAULT \'not-required\' NOT NULL;',
      '"health_sharing_grants" ADD COLUMN "approved_by_guardian_id" uuid;',
      '"health_sharing_grants" ADD COLUMN "approved_at" timestamp with time zone;',
    ]) {
      expect(migration).toContain(`ALTER TABLE ${column}`);
    }
  });
});
