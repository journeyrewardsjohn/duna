import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../drizzle/0114_participation_rules_headcount_pricing.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("participation rules migration", () => {
  it("settles each booking at most once", () => {
    expect(migration).toContain(
      'CREATE TABLE "catalog_participation_settlements"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "catalog_participation_settlement_fulfillment_unique" ON "catalog_participation_settlements" USING btree ("catalog_fulfillment_id")',
    );
    expect(migration).toContain(
      '"settled_credits" + "catalog_participation_settlements"."returned_credits" = "catalog_participation_settlements"."reserved_credits"',
    );
  });

  it("records the minimum decision and final headcount on the occurrence", () => {
    for (const column of [
      "participation_outcome",
      "participation_decided_at",
      "decided_headcount",
      "settled_headcount",
      "participation_settled_at",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE "catalog_session_occurrences" ADD COLUMN "${column}"`,
      );
    }
    expect(migration).toContain(
      "IN ('minimum-met', 'run-under-minimum', 'cancel-under-minimum')",
    );
  });

  it("tracks credits returned without restoring the whole redemption", () => {
    expect(migration).toContain(
      'ALTER TABLE "organization_credit_applications" ADD COLUMN "returned_credits" integer DEFAULT 0 NOT NULL',
    );
    expect(migration).toContain(
      '"returned_credits" <= "organization_credit_applications"."credits"',
    );
  });

  it("is additive for existing rows and fits the restoration disposition", () => {
    expect(migration).not.toMatch(/DROP (TABLE|COLUMN)/);
    expect(migration).toContain(
      'ALTER TABLE "refund_records" ALTER COLUMN "disposition" SET DATA TYPE varchar(48)',
    );
    expect("organization-credit-restoration".length).toBeGreaterThan(24);
  });
});
