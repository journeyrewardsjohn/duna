import { describe, expect, it } from "vitest";
import {
  createApiContext,
  createApiContextFromClerkSession,
  createDemoActor,
  scopesForRoles,
} from "./context";

describe("API identity context", () => {
  it("marks the seeded preview actor as a verified adult demo identity", () => {
    expect(createDemoActor()).toMatchObject({
      ageBand: "adult",
      isDemo: true,
      roles: ["player", "manager"],
    });
  });

  it("can explicitly disable the demo actor at an authenticated boundary", () => {
    expect(createApiContext({ useDemoActor: false }).actor).toBeUndefined();
  });

  it("unions role scopes without duplicates", () => {
    const scopes = scopesForRoles(["player", "guardian", "player"]);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(scopes).toContain("bookings:write");
    expect(scopes).toContain("minor:write");
  });

  it("keeps a missing Clerk session anonymous even when demo mode is enabled", async () => {
    const context = await createApiContextFromClerkSession({ userId: null });
    expect(context.actor).toBeUndefined();
  });
});
