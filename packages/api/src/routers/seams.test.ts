import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";

// Proves every R3 seam is mounted once, reachable in demo mode (no database)
// and guarded by the same middleware as its neighbours.
describe("R3 domain seams", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  const demo = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("mounts every operator seam", async () => {
    const operator = demo().operator;
    const results = await Promise.all([
      operator.setup.status(),
      operator.pay.status(),
      operator.teamAvailability.status(),
      operator.teamPay.status(),
      operator.teamPayouts.status(),
      operator.trainingPrograms.status(),
      operator.trainingDrills.status(),
      operator.trainingSceneAi.status(),
      operator.websiteWorkspace.status(),
      operator.websiteTemplates.status(),
      operator.facility.status(),
      operator.conditions.status(),
    ]);
    expect(results.map((r) => r.domain)).toEqual([
      "setup",
      "pay",
      "team-availability",
      "team-pay",
      "team-payouts",
      "training-programs",
      "training-drills",
      "training-scene-ai",
      "website-workspace",
      "website-templates",
      "facility",
      "conditions",
    ]);
    expect(results.every((r) => r.ready === false)).toBe(true);
  });

  it("mounts every player and public seam", async () => {
    const caller = demo();
    const results = await Promise.all([
      caller.player.trainingPrograms.status(),
      caller.player.trainingDrills.status(),
      caller.player.facility.status(),
      caller.player.search.status(),
      caller.public.trainingDrills.status(),
      caller.public.websiteTemplates.status(),
      caller.public.facility.status(),
      caller.public.search.status(),
      caller.public.conditions.status(),
      caller.public.legal.status(),
      caller.player.fees.status(),
      caller.player.households.status(),
      caller.player.legal.status(),
      caller.operator.fees.status(),
      caller.operator.legal.status(),
    ]);
    expect(results.map((r) => r.domain)).toEqual([
      "training-programs",
      "training-drills",
      "facility",
      "search",
      "training-drills",
      "website-templates",
      "facility",
      "search",
      "conditions",
      "legal",
      "fees",
      "households",
      "legal",
      "fees",
      "legal",
    ]);
  });

  it("keeps operator and player seams behind sign-in and scopes", async () => {
    const anonymous = createCaller(createApiContext({ useDemoActor: false }));
    await expect(anonymous.operator.setup.status()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anonymous.player.search.status()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anonymous.public.search.status()).resolves.toMatchObject({
      domain: "search",
    });
    const player = createCaller(
      createApiContext({ actor: createDemoActor(["player"]) }),
    );
    await expect(player.operator.pay.status()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("serves client flags (registry defaults in demo mode)", async () => {
    const flags = await demo().public.flags.enabled();
    expect(flags["website.workspace"]).toBe(true);
    expect(flags["concierge.channel.whatsapp"]).toBe(true);
  });

  it("keeps provider readiness Super Admin only", async () => {
    await expect(demo().admin.readiness.providers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const superAdmin = createCaller(
      createApiContext({ actor: createDemoActor(["super-admin"]) }),
    );
    const readiness = await superAdmin.admin.readiness.providers();
    expect(readiness.providers.length).toBeGreaterThan(10);
  });
});
