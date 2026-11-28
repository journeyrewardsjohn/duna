import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";

// The add-score procedures in demo mode (no database: CI and Playwright):
// mounted once, anonymous where they should be, and the whole flow works
// against the in-memory draft store.
describe("addScore procedures (demo mode)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  const anonymous = (ipAddress: string) =>
    createCaller(
      createApiContext({
        useDemoActor: false,
        ipAddress,
        requestId: crypto.randomUUID(),
      }),
    );
  const signedIn = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("runs the whole flow without an account, then claims once", async () => {
    const caller = anonymous("203.0.113.10");
    const first = await caller.public.addScore.save({
      step: "where",
      data: {
        place: {
          kind: "described",
          name: "North Lot courts",
          address: "Behind the north parking lot",
        },
      },
    });
    expect(first.status).toBe("saved");
    if (first.status !== "saved" || !first.newToken)
      throw new Error("no token");
    const token = first.newToken;
    await caller.public.addScore.save({
      token,
      step: "score",
      data: {
        format: 2,
        matchType: "competitive",
        playedOn: new Date().toISOString().slice(0, 10),
        sets: [
          { you: 21, them: 17 },
          { you: 21, them: 19 },
        ],
      },
    });
    const players = await caller.public.addScore.save({
      token,
      step: "players",
      data: {
        teammates: [{ firstName: "Ana" }],
        opponents: [{ firstName: "Bo" }, { firstName: "Cy" }],
        agreed: true,
      },
    });
    expect(players.status === "saved" && players.draft.completed).toEqual([
      "where",
      "score",
      "players",
    ]);

    const preview = await caller.public.addScore.preview({ token });
    expect(preview).toMatchObject({
      state: "ready",
      preview: { result: "won", counts: true },
    });

    await expect(
      caller.player.addScore.claim({
        token,
        teammates: [{ firstName: "Ana", lastName: "K" }],
        opponents: [
          { firstName: "Bo", lastName: "R" },
          { firstName: "Cy", lastName: "L" },
        ],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const claimed = await signedIn().player.addScore.claim({
      token,
      teammates: [{ firstName: "Ana", lastName: "K" }],
      opponents: [
        { firstName: "Bo", lastName: "R" },
        { firstName: "Cy", lastName: "L" },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(claimed.status).toBe("claimed");
    expect(await caller.public.addScore.read({ token })).toEqual({
      state: "claimed",
      matchId: claimed.matchId,
    });
  });

  it("answers bad input in place and refuses links in names", async () => {
    const caller = anonymous("203.0.113.11");
    await expect(
      caller.public.addScore.save({
        step: "players",
        data: { opponents: [{ firstName: "visit spam.com" }], agreed: true },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const invalid = await caller.public.addScore.save({
      step: "where",
      data: {},
    });
    expect(invalid).toEqual({
      status: "invalid",
      fieldErrors: {
        place: "Pick where you played, or add it as a new court.",
      },
    });
  });

  it("an unknown token reads as expired, no token as none", async () => {
    const caller = anonymous("203.0.113.12");
    expect(await caller.public.addScore.read({})).toEqual({ state: "none" });
    expect(
      await caller.public.addScore.read({ token: "a".repeat(43) }),
    ).toEqual({ state: "expired" });
  });

  it("candidate review is for staff only", async () => {
    await expect(
      signedIn().admin.addScore.candidates({ status: "pending", limit: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = createCaller(
      createApiContext({
        actor: { ...createDemoActor(), roles: ["super-admin"] },
      }),
    );
    const list = await admin.admin.addScore.candidates({
      status: "pending",
      limit: 10,
    });
    expect(list.items.length).toBeGreaterThan(0);
  });
});
