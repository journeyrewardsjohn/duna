/**
 * PRIV-1 in demo mode: the demo member who shared a summary with the club
 * reaches exactly the roles the Health policy names for an organization
 * grant (owner, manager, coach), never front desk.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PersonRole } from "@duna/core";
import { createDemoActor } from "./context";
import { demoHealthVisibleTo } from "./people-service";
import { createCaller } from "./router";

const MAYA = "10000000-0000-4000-8000-000000000201";
const previousDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  if (previousDatabaseUrl !== undefined)
    process.env.DATABASE_URL = previousDatabaseUrl;
});

async function profileAs(roles: readonly PersonRole[]) {
  return createCaller({
    actor: createDemoActor(roles),
    requestId: crypto.randomUUID(),
    now: new Date(),
  }).operator.memberProfile({ personId: MAYA });
}

describe("demo operator.memberProfile health (PRIV-1)", () => {
  it("owner, manager and coach may view; no values for anyone", async () => {
    for (const role of ["owner", "manager", "coach"] as const) {
      const profile = await profileAs([role]);
      expect(profile.healthAccess).toEqual({ canView: true });
      expect(profile.health?.metrics).toBeUndefined();
      expect(JSON.stringify(profile)).not.toContain("8942");
    }
  });

  it("omits the block entirely for front desk", async () => {
    const profile = await profileAs(["front-desk"]);
    expect(profile.healthAccess).toEqual({ canView: false });
    expect(Object.keys(profile)).not.toContain("health");
    expect(JSON.stringify(profile)).not.toContain("8942");
  });

  it("follows the policy's junior rule and the adult-viewer rule", () => {
    expect(
      demoHealthVisibleTo({ roles: ["manager"], ageBand: "adult" }, "teen"),
    ).toBe(false);
    expect(
      demoHealthVisibleTo({ roles: ["coach"], ageBand: "adult" }, "teen"),
    ).toBe(true);
    expect(demoHealthVisibleTo({ roles: ["coach"], ageBand: "teen" })).toBe(
      false,
    );
  });
});
