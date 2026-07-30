import { describe, expect, it } from "vitest";
import { createApiContext, createDemoActor } from "./context";
import { createCaller } from "./router";

describe("tRPC contract surface", () => {
  it("returns typed public discovery and pricing contracts", async () => {
    const caller = createCaller(
      createApiContext({ requestId: crypto.randomUUID() }),
    );
    const [events, quote] = await Promise.all([
      caller.public.events(),
      caller.player.quote({
        isDunaPlus: false,
        items: [
          {
            id: "booking-1",
            kind: "booking",
            description: "Court booking",
            quantity: 1,
            unitAmountMinor: 4_800,
          },
        ],
      }),
    ]);
    expect(events[0]).toMatchObject({
      slug: expect.any(String),
      price: { amountMinor: expect.any(Number), currency: "USD" },
    });
    expect(quote).toMatchObject({
      subtotalMinor: 4_800,
      totalMinor: 4_944,
      currency: "USD",
    });
  });

  it("replays duplicate pickup mutations and rejects key reuse drift", async () => {
    const caller = createCaller(
      createApiContext({ requestId: crypto.randomUUID() }),
    );
    const key = crypto.randomUUID();
    const input = {
      title: "Contract pickup",
      startsAt: "2030-08-01T22:00:00.000Z",
      endsAt: "2030-08-02T00:00:00.000Z",
      venueName: "Contract beach",
      capacity: 8,
      format: "4s" as const,
      visibility: "public" as const,
      costMinor: 0,
      currency: "USD" as const,
      recordMatches: true,
      idempotencyKey: key,
    };
    const first = await caller.player.createPickup(input);
    const replay = await caller.player.createPickup(input);
    expect(replay.id).toBe(first.id);
    await expect(
      caller.player.createPickup({ ...input, title: "Different pickup" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("blocks unknown-age identities from adult money and public-hosting flows", async () => {
    const actor = { ...createDemoActor(), ageBand: "unknown" as const };
    const caller = createCaller(createApiContext({ actor }));
    await expect(
      caller.player.createPickup({
        title: "Unsafe unknown-age pickup",
        startsAt: "2030-08-01T22:00:00.000Z",
        endsAt: "2030-08-02T00:00:00.000Z",
        venueName: "Unknown beach",
        capacity: 8,
        format: "4s",
        visibility: "public",
        costMinor: 0,
        currency: "USD",
        recordMatches: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("keeps platform administration behind an explicit platform role", async () => {
    const caller = createCaller(
      createApiContext({ actor: createDemoActor(["player", "manager"]) }),
    );
    await expect(caller.admin.overview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
