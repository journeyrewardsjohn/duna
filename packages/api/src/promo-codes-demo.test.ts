import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "./context";
import { createCaller } from "./router";

afterEach(() => vi.unstubAllEnvs());

describe("promo codes in demo mode (no database)", () => {
  it("opens with the organization and no invented codes instead of failing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const caller = createCaller(
      createApiContext({ actor: createDemoActor(["owner"]) }),
    );
    const workspace = await caller.operator.promoCodeWorkspace();
    expect(workspace.organization.name).toBeTruthy();
    expect(workspace.promoCodes).toEqual([]);
    expect(workspace.catalog).toEqual([]);
    expect(workspace.members).toEqual([]);
  });

  it("still refuses a role without payment access", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const caller = createCaller(
      createApiContext({ actor: createDemoActor(["coach"]) }),
    );
    await expect(caller.operator.promoCodeWorkspace()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
