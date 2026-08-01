import { describe, expect, it } from "vitest";
import {
  createApiContext,
  createApiContextFromWorkOSSession,
  createDemoActor,
  scopesForRoles,
  workOSAccessTokenExpiresAt,
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

  it("keeps a missing WorkOS session anonymous even when demo mode is enabled", async () => {
    const context = await createApiContextFromWorkOSSession({ user: null });
    expect(context.actor).toBeUndefined();
  });

  it("reads WorkOS access-token expiration for native session refresh", () => {
    const payload = Buffer.from(
      JSON.stringify({ exp: 1_900_000_000 }),
    ).toString("base64url");
    expect(workOSAccessTokenExpiresAt(`header.${payload}.signature`)).toBe(
      1_900_000_000_000,
    );
    expect(workOSAccessTokenExpiresAt("not-a-token")).toBeLessThanOrEqual(
      Date.now(),
    );
  });
});
