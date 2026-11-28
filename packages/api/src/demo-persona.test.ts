import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiContextFromRequest } from "./context";
import {
  demoPersonaFromCookie,
  isDemoPersonaSwitchEnabled,
  requestedDemoPersonaRoles,
} from "./demo-persona";

const enabled = { DUNA_DEMO_PERSONAS: "enabled" };

function requestWithPersona(persona: string) {
  return new Request("http://127.0.0.1/", {
    headers: { cookie: `other=1; duna-demo-persona=${persona}` },
  });
}

describe("demo persona switch (test only)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off unless the server opted in", () => {
    expect(isDemoPersonaSwitchEnabled({})).toBe(false);
    expect(isDemoPersonaSwitchEnabled(enabled)).toBe(true);
  });

  it("is off outside demo mode and on production deployments", () => {
    expect(
      isDemoPersonaSwitchEnabled({
        ...enabled,
        NEXT_PUBLIC_DEMO_MODE: "false",
      }),
    ).toBe(false);
    expect(
      isDemoPersonaSwitchEnabled({ ...enabled, VERCEL_ENV: "production" }),
    ).toBe(false);
  });

  it("reads only known personas from the cookie", () => {
    expect(demoPersonaFromCookie("duna-demo-persona=coach")).toBe("coach");
    expect(demoPersonaFromCookie("duna-demo-persona=toString")).toBeUndefined();
    expect(demoPersonaFromCookie("duna-demo-persona=root")).toBeUndefined();
    expect(demoPersonaFromCookie(undefined)).toBeUndefined();
  });

  it("maps personas to roles, and the visitor to no roles", () => {
    expect(
      requestedDemoPersonaRoles("duna-demo-persona=coach", enabled),
    ).toEqual(["coach"]);
    expect(
      requestedDemoPersonaRoles("duna-demo-persona=visitor", enabled),
    ).toEqual([]);
    expect(
      requestedDemoPersonaRoles("duna-demo-persona=coach", {}),
    ).toBeUndefined();
  });

  it("changes the demo actor only when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("DUNA_DEMO_PERSONAS", "");
    const unchanged = await createApiContextFromRequest(
      requestWithPersona("coach"),
    );
    expect(unchanged.actor?.roles).toEqual(["player", "manager"]);

    vi.stubEnv("DUNA_DEMO_PERSONAS", "enabled");
    const coach = await createApiContextFromRequest(
      requestWithPersona("coach"),
    );
    expect(coach.actor).toMatchObject({ roles: ["coach"], isDemo: true });
    const visitor = await createApiContextFromRequest(
      requestWithPersona("visitor"),
    );
    expect(visitor.actor).toBeUndefined();
  });
});
