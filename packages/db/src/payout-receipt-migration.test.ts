import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../drizzle/0095_fair_maria_hill.sql", import.meta.url),
  "utf8",
);

describe("payout receipt migration", () => {
  it("preserves retry, destination, Stripe timing, and failure evidence", () => {
    expect(migration).toContain('"idempotency_key" varchar(160)');
    expect(migration).toContain('"destination_name" varchar(128)');
    expect(migration).toContain('"destination_last4" varchar(4)');
    expect(migration).toContain('"trace_id" varchar(128)');
    expect(migration).toContain('"failure_message" text');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payout_organization_idempotency_unique"',
    );
  });
});
