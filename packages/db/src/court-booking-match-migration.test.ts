import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../drizzle/0105_absurd_shard.sql", import.meta.url)),
  "utf8",
);

describe("court booking match intent migration", () => {
  it("adds a safe opt-in flag without changing existing bookings", () => {
    expect(migration).toContain(
      'ALTER TABLE "court_bookings" ADD COLUMN "create_match" boolean DEFAULT false NOT NULL;',
    );
  });

  it("keeps host-paid player invitations awaiting explicit confirmation", () => {
    expect(migration).toContain(
      "WHEN NOT v_court_booking.create_match\n                AND status IN ('invited', 'accepted') THEN 'accepted'",
    );
  });
});
