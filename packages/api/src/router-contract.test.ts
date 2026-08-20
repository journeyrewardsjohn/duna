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
      totalMinor: 5_160,
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

  it("keeps community-location hosted matches free", async () => {
    const caller = createCaller(
      createApiContext({ requestId: crypto.randomUUID() }),
    );
    await expect(
      caller.player.createPickup({
        title: "Paid public beach match",
        startsAt: "2030-08-01T22:00:00.000Z",
        endsAt: "2030-08-02T00:00:00.000Z",
        venueName: "Public beach",
        capacity: 4,
        format: "2s",
        visibility: "public",
        costMinor: 1_000,
        currency: "USD",
        recordMatches: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

  it("gives super admins organization drill-down and player search", async () => {
    const caller = createCaller(
      createApiContext({ actor: createDemoActor(["super-admin"]) }),
    );
    const organizations = await caller.admin.organizations();
    const organization = organizations[0];
    expect(organization).toBeDefined();

    const [detail, players] = await Promise.all([
      caller.admin.organization({ organizationId: organization!.id }),
      caller.admin.players({ query: "s", limit: 20 }),
    ]);

    expect(detail).toMatchObject({
      organization: { id: organization!.id },
      commerce: { currency: "USD" },
    });
    expect(detail?.metrics).toHaveLength(4);
    expect(players.length).toBeGreaterThan(0);
    expect(players[0]).toMatchObject({
      id: expect.any(String),
      displayName: expect.any(String),
      handle: expect.any(String),
    });
  });

  it("keeps coaches read-only for organization event media", async () => {
    const coach = createCaller(
      createApiContext({ actor: createDemoActor(["coach"]) }),
    );
    await expect(
      coach.operator.eventMediaUploadContext(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const accountant = createCaller(
      createApiContext({ actor: createDemoActor(["accountant"]) }),
    );
    await expect(
      accountant.operator.eventMediaUploadContext(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exposes an operational calendar contract to coaches and managers", async () => {
    const caller = createCaller(
      createApiContext({ actor: createDemoActor(["coach"]) }),
    );

    const workspace = await caller.operator.workspace();
    expect(workspace.calendar.entries.length).toBeGreaterThan(0);
    expect(workspace.calendar.entries[0]).toMatchObject({
      id: expect.any(String),
      kind: expect.any(String),
      title: expect.any(String),
      startsAt: expect.any(String),
      endsAt: expect.any(String),
      participantCount: expect.any(Number),
      attendees: expect.any(Array),
      equipment: expect.any(Array),
    });
  });

  it("keeps calendar schedule changes behind sessions-write access", async () => {
    const caller = createCaller(
      createApiContext({ actor: createDemoActor(["coach"]) }),
    );

    await expect(
      caller.operator.createCalendarBlock({
        resourceType: "court",
        resourceId: crypto.randomUUID(),
        startsAt: "2030-08-01T14:00:00.000Z",
        endsAt: "2030-08-01T15:00:00.000Z",
        mode: "blocked",
        reason: "Coach protected preparation time.",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps rollout mutations behind the super-admin role", async () => {
    const caller = createCaller(
      createApiContext({ actor: createDemoActor(["admin"]) }),
    );
    await expect(
      caller.admin.updateFeatureFlag({
        flagId: crypto.randomUUID(),
        enabled: true,
        configuration: {},
        reason: "Attempted rollout without super-admin authority.",
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.admin.grantComplimentaryDunaPlus({
        email: "player@example.com",
        startsAt: "2026-08-04T18:00:00.000Z",
        reason: "Complimentary partner access.",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.admin.updateVideoQuotaPolicy({
        monthlyLiveSeconds: 14_400,
        monthlyUploadSeconds: 86_400,
        enforceLiveLimit: true,
        enforceUploadLimit: false,
        reason: "Attempted policy change without authority.",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
