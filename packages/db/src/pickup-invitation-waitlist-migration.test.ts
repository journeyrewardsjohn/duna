import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0062_next_lucky_pierre.sql", import.meta.url),
  ),
  "utf8",
);

describe("pickup invitation and waitlist migration", () => {
  it("adds a non-confirmed invitation state", () => {
    expect(migration).toContain(
      `ALTER TYPE "public"."registration_status" ADD VALUE 'invited'`,
    );
  });

  it("enforces the creator's waitlist switch in the serialized join", () => {
    expect(migration).toContain("smart_rules->>'waitlistEnabled'");
    expect(migration).toContain("MESSAGE = 'pickup_full'");
    expect(migration).toContain("FOR UPDATE");
  });

  it("lets confirmed participants add people without granting edit authority", () => {
    expect(migration).toContain(
      "actor_participant.status IN ('confirmed', 'checked-in')",
    );
    expect(migration).toContain("v_pickup.host_person_id = p_actor_person_id");
  });

  it("offers released capacity to the oldest waitlisted players", () => {
    expect(migration).toContain('FUNCTION "duna_offer_pickup_waitlist"');
    expect(migration).toContain("ORDER BY pp.created_at, pp.id");
    expect(migration).toContain("SET status = 'invited'");
    expect(migration).toContain("GREATEST(v_pickup.capacity - v_occupied, 0)");
  });
});
