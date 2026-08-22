import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../drizzle/0091_married_sauron.sql", import.meta.url),
  "utf8",
);

describe("payment ledger migration", () => {
  it("stores schedules, exact Stripe lineage, and normalized payout allocations", () => {
    expect(migration).toContain('CREATE TABLE "payment_schedules"');
    expect(migration).toContain('CREATE TABLE "payment_schedule_installments"');
    expect(migration).toContain('CREATE TABLE "stripe_transaction_links"');
    expect(migration).toContain('CREATE TABLE "payout_allocations"');
    expect(migration).toContain('"stripe_balance_transaction_id" varchar(128)');
    expect(migration).toContain('"payment_id" uuid NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payment_fund_schedule_payment_unique"',
    );
  });
});
