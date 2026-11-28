/**
 * PRIV-2: the startup load runs each part on its own. With the real API
 * router and a coach actor (no payments:read), Money is refused and every
 * other part a coach may read still loads.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCaller } from "@duna/api";
import { createDemoActor } from "@duna/api/context";
import type { PersonRole } from "@duna/core";
import {
  isRefusal,
  loadOrganizationParts,
  organizationLoadComplete,
} from "./organization-load";

const previousDatabaseUrl = process.env.DATABASE_URL;
beforeEach(() => {
  delete process.env.DATABASE_URL;
});
afterEach(() => {
  if (previousDatabaseUrl !== undefined)
    process.env.DATABASE_URL = previousDatabaseUrl;
});

const PARTS = [
  "dashboard",
  "workspace",
  "money",
  "members",
  "events",
  "matches",
] as const;

function loadAs(role: PersonRole) {
  const operator = createCaller({
    actor: createDemoActor([role]),
    requestId: crypto.randomUUID(),
    now: new Date("2026-11-28T18:00:00.000Z"),
  }).operator;
  return loadOrganizationParts({
    dashboard: () => operator.dashboard(),
    workspace: () => operator.workspace(),
    money: () => operator.moneyWorkspace(),
    members: () => operator.members(),
    events: () => operator.events(),
    // Match scoring has no demo data source (it needs Duna Database).
    matches: () => Promise.resolve([]),
  });
}

describe("Pro organization load", () => {
  it("a coach loads everything but Money, which is refused", async () => {
    const load = await loadAs("coach");
    expect(load.failure).toBeUndefined();
    expect([...load.refused]).toEqual(["money"]);
    expect(load.values.money).toBeUndefined();
    expect(load.values.workspace?.sessions.length).toBeGreaterThan(0);
    expect(load.values.dashboard).toBeDefined();
    expect(load.values.members).toBeDefined();
    expect(organizationLoadComplete(load, PARTS)).toBe(true);
    // The coach's workspace carries no club money.
    expect(
      load.values.workspace?.people.every(
        (person) => person.lifetimeSpendMinor === undefined,
      ),
    ).toBe(true);
    expect(load.values.dashboard?.metrics.some((metric) => metric.money)).toBe(
      false,
    );
  });

  it("an owner loads every part, Money included", async () => {
    const load = await loadAs("owner");
    expect(load.failure).toBeUndefined();
    expect(load.refused.size).toBe(0);
    expect(load.values.money).toBeDefined();
  });

  it("a real failure still fails the load", async () => {
    const outage = new Error("network down");
    const load = await loadOrganizationParts({
      money: () => Promise.reject(outage),
      workspace: () => Promise.resolve(1),
    });
    expect(load.failure).toBe(outage);
    expect(load.values.workspace).toBe(1);
  });

  it("recognises refusals from the client and the server", () => {
    expect(isRefusal({ data: { code: "FORBIDDEN" } })).toBe(true);
    expect(isRefusal({ code: "FORBIDDEN" })).toBe(true);
    expect(isRefusal({ data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(false);
    expect(isRefusal(undefined)).toBe(false);
  });
});
