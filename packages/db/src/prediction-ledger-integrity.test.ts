import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0053_spotty_nightmare.sql", import.meta.url),
  ),
  "utf8",
);

describe("prediction ledger integrity migration", () => {
  it("backfills and verifies a per-account SHA-256 hash chain", () => {
    expect(migration).toContain("duna_prediction_credit_ledger_hash");
    expect(migration).toContain("'sha256'");
    expect(migration).toContain("previous_hash_value := entry_hash_value");
    expect(migration).toContain("prediction_credit_ledger_integrity");
    expect(migration).toContain("AND hash_matches");
    expect(migration).toContain("SELECT cached_available_micros");
  });

  it("makes future ledger rows append-only and server-sequenced", () => {
    expect(migration).toContain(
      'DROP TRIGGER IF EXISTS "prediction_credit_ledger_guard"',
    );
    expect(migration).toContain(
      "prediction credit ledger account does not match person",
    );
    expect(migration).toContain("BEFORE INSERT ON prediction_credit_ledger");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON prediction_credit_ledger",
    );
    expect(migration).toContain("prediction_credit_ledger is append-only");
    expect(migration).not.toContain("duna.ledger_maintenance");
  });
});
