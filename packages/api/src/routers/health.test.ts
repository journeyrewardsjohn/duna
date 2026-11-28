import { healthDemoIds } from "@duna/core/demo/health";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentAgeBand } from "../age-band";
import { createApiContext, createDemoActor, type ApiActor } from "../context";
import {
  healthGuardianOverviewSchema,
  healthPolicyEligibilitySchema,
} from "../contracts/health";
import { createCaller } from "../router";
import { HEALTH_POLICY_VERSION } from "../services/health/policy";

const NOW = new Date("2026-11-27T15:00:00.000Z");
const key = () => crypto.randomUUID();

function actorFor(personId: string, ageBand: ApiActor["ageBand"]): ApiActor {
  return { ...createDemoActor(["player"]), personId, ageBand };
}

const callers = {
  adult: () =>
    createCaller(createApiContext({ actor: createDemoActor(), now: NOW })),
  teen: () =>
    createCaller(
      createApiContext({
        actor: actorFor(healthDemoIds.teen, "teen"),
        now: NOW,
      }),
    ),
  child: () =>
    createCaller(
      createApiContext({
        actor: actorFor(healthDemoIds.child, "under-13"),
        now: NOW,
      }),
    ),
};

async function healthReason(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { healthReason?: string } }).cause;
    return { message: (error as Error).message, reason: cause?.healthReason };
  }
  throw new Error("Expected the Health call to be refused.");
}

const heartSample = {
  externalId: "4b0b7f8e-6a4c-4c4a-9e1f-0c1b2d3e4f50",
  metric: "heart-rate" as const,
  kind: "quantity" as const,
  startedAt: "2026-11-27T14:00:00.000Z",
  endedAt: "2026-11-27T14:01:00.000Z",
  value: 141,
  unit: "count/min",
};
const sleepSample = {
  externalId: "4b0b7f8e-6a4c-4c4a-9e1f-0c1b2d3e4f51",
  metric: "sleep" as const,
  kind: "category" as const,
  startedAt: "2026-11-27T04:00:00.000Z",
  endedAt: "2026-11-27T05:00:00.000Z",
  categoryValue: "asleep-core",
};

describe("Duna Health in demo mode (adult, 15-year-old, 11-year-old)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("describes eligibility for each fixture", async () => {
    const adult = await callers
      .adult()
      .player.health.eligibility({ storefrontCountry: "USA" });
    healthPolicyEligibilitySchema.parse(adult);
    expect(adult).toMatchObject({ band: "adult", minor: false });
    expect(adult.actions.sync.allowed).toBe(true);
    expect(adult.allowedMetrics).toHaveLength(19);

    const teen = await callers
      .teen()
      .player.health.eligibility({ storefrontCountry: "USA" });
    expect(teen).toMatchObject({
      band: "teen",
      minor: true,
      consent: { required: true, teenOptedIn: true, guardianApproved: true },
      disclosure: { policyVersion: HEALTH_POLICY_VERSION },
    });
    expect(teen.actions.sync.allowed).toBe(true);
    expect(teen.actions["check-in"]).toMatchObject({
      allowed: false,
      reason: "not-offered-to-minors",
    });
    expect([...teen.allowedMetrics].sort()).toEqual([
      "active-energy",
      "exercise-minutes",
      "heart-rate",
      "workout",
    ]);

    const child = await callers.child().player.health.eligibility({});
    expect(child.band).toBe("under-13");
    for (const action of [
      "view-own",
      "opt-in",
      "sync",
      "create-grant",
    ] as const)
      expect(child.actions[action]).toMatchObject({
        allowed: false,
        reason: "under-13",
        message: "Duna Health is not available for players under 13 yet.",
      });
    expect(child.actions.disconnect.allowed).toBe(true);
  });

  it("refuses every under-13 Health procedure with a typed reason", async () => {
    const child = callers.child().player;
    const refusals = await Promise.all([
      healthReason(child.healthDashboard()),
      healthReason(
        child.syncHealthSamples({
          categories: ["heart"],
          timezone: "UTC",
          samples: [heartSample],
          deletedExternalIds: [],
          storefrontCountry: "USA",
        }),
      ),
      healthReason(
        child.createHealthSharingGrant({
          kind: "coach",
          personId: healthDemoIds.coach,
          categories: ["heart"],
          scopes: ["summary"],
          expiresAt: "2027-01-01T00:00:00.000Z",
          storefrontCountry: "USA",
          idempotencyKey: key(),
        }),
      ),
      healthReason(
        child.health.optIn({
          policyVersion: HEALTH_POLICY_VERSION,
          idempotencyKey: key(),
        }),
      ),
    ]);
    for (const refusal of refusals) {
      expect(refusal.reason).toBe("under-13");
      expect(refusal.message).toBe(
        "Duna Health is not available for players under 13 yet.",
      );
    }
    // Deleting is never blocked.
    await expect(
      child.disconnectHealth({ idempotencyKey: key() }),
    ).resolves.toEqual({
      deletedSamples: 0,
      deletedCheckIns: 0,
      revokedGrants: 0,
    });
  });

  it("drops a minor's metrics outside the allowlist and keeps an adult's", async () => {
    const input = {
      categories: ["heart", "recovery"] as ("heart" | "recovery")[],
      timezone: "UTC",
      samples: [heartSample, sleepSample],
      deletedExternalIds: [],
      storefrontCountry: "USA",
    };
    await expect(
      callers.teen().player.syncHealthSamples(input),
    ).resolves.toMatchObject({ imported: 1, dropped: 1, protocolVersion: 2 });
    await expect(
      callers.adult().player.syncHealthSamples(input),
    ).resolves.toMatchObject({ imported: 2, dropped: 0 });
  });

  it("is US-only for sync, check-ins and new grants, but not for viewing", async () => {
    const teen = callers.teen().player;
    const outside = await healthReason(
      teen.syncHealthSamples({
        categories: ["heart"],
        timezone: "UTC",
        samples: [heartSample],
        deletedExternalIds: [],
        storefrontCountry: "GBR",
      }),
    );
    expect(outside.reason).toBe("region-not-supported");
    const missing = await healthReason(
      callers.adult().player.saveHealthCheckIn({
        checkIn: {
          date: "2026-11-27",
          perceivedRecovery: 3,
          energy: 3,
          stress: 3,
          soreness: 3,
        },
        idempotencyKey: key(),
      }),
    );
    expect(missing.reason).toBe("region-unknown");
    const dashboard = await teen.healthDashboard();
    expect(dashboard.access.owner).toBe(true);
    expect(dashboard.access.categories).toEqual(["heart", "activity"]);
    expect(
      dashboard.timeline.every((entry) =>
        ["heart-rate", "workout", "active-energy", "exercise-minutes"].includes(
          entry.metric,
        ),
      ),
    ).toBe(true);
    expect(
      dashboard.grants.map((grant) => grant.approvalStatus).sort(),
    ).toEqual(["approved", "pending"]);
  });

  it("creates a minor's grant as pending and refuses peer players", async () => {
    const teen = callers.teen().player;
    await expect(
      teen.createHealthSharingGrant({
        kind: "coach",
        personId: healthDemoIds.coach,
        categories: ["heart"],
        scopes: ["summary"],
        expiresAt: new Date(NOW.getTime() + 60 * 86_400_000).toISOString(),
        storefrontCountry: "USA",
        idempotencyKey: key(),
      }),
    ).resolves.toMatchObject({ approvalStatus: "pending" });
    await expect(
      teen.createHealthSharingGrant({
        kind: "player",
        personId: healthDemoIds.adult,
        categories: ["heart"],
        scopes: ["summary"],
        expiresAt: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
        storefrontCountry: "USA",
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/coach or their club/);
    await expect(
      teen.createHealthSharingGrant({
        kind: "coach",
        personId: healthDemoIds.coach,
        categories: ["heart"],
        scopes: ["summary"],
        expiresAt: new Date(NOW.getTime() + 120 * 86_400_000).toISOString(),
        storefrontCountry: "USA",
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/at most 90 days/);
    await expect(
      callers.adult().player.createHealthSharingGrant({
        kind: "coach",
        personId: healthDemoIds.coach,
        categories: ["heart", "recovery"],
        scopes: ["summary"],
        expiresAt: new Date(NOW.getTime() + 200 * 86_400_000).toISOString(),
        storefrontCountry: "USA",
        idempotencyKey: key(),
      }),
    ).resolves.toMatchObject({ approvalStatus: "not-required" });
  });

  it("shows a guardian status and grants, never Health values", async () => {
    const overview = await callers.adult().player.health.guardianOverview();
    healthGuardianOverviewSchema.parse(overview);
    expect(overview.minors.map((minor) => minor.personId).sort()).toEqual(
      [healthDemoIds.teen, healthDemoIds.child].sort(),
    );
    const teen = overview.minors.find(
      (minor) => minor.personId === healthDemoIds.teen,
    )!;
    expect(teen.consent).toMatchObject({
      teenOptedIn: true,
      guardianApproved: true,
      approvedByYou: true,
    });
    expect(teen.grants).toHaveLength(2);
    const child = overview.minors.find(
      (minor) => minor.personId === healthDemoIds.child,
    )!;
    expect(child.eligible).toMatchObject({
      allowed: false,
      reason: "under-13",
    });
    const serialized = JSON.stringify(overview);
    for (const field of ["value", "timeline", "summary", "beatsPerMinute"]) {
      expect(serialized).not.toContain(`"${field}":`);
    }
  });

  it("lets a guardian approve and revoke grants, and withdraw", async () => {
    const guardian = callers.adult().player.health;
    await expect(
      guardian.guardianApprove({
        minorId: healthDemoIds.teen,
        policyVersion: HEALTH_POLICY_VERSION,
        idempotencyKey: key(),
      }),
    ).resolves.toEqual({ approved: true, teenOptedIn: true });
    await expect(
      guardian.guardianDecideGrant({
        minorId: healthDemoIds.teen,
        grantId: healthDemoIds.pendingGrant,
        decision: "approve",
        policyVersion: HEALTH_POLICY_VERSION,
        idempotencyKey: key(),
      }),
    ).resolves.toMatchObject({ approvalStatus: "approved", revoked: false });
    await expect(
      guardian.guardianDecideGrant({
        minorId: healthDemoIds.teen,
        grantId: healthDemoIds.approvedGrant,
        decision: "revoke",
        policyVersion: HEALTH_POLICY_VERSION,
        idempotencyKey: key(),
      }),
    ).resolves.toMatchObject({ revoked: true });
    await expect(
      guardian.guardianWithdraw({
        minorId: healthDemoIds.teen,
        idempotencyKey: key(),
      }),
    ).resolves.toEqual({
      withdrawn: true,
      revokedGrants: 2,
      purgeScheduled: true,
    });
    const childApproval = await healthReason(
      guardian.guardianApprove({
        minorId: healthDemoIds.child,
        policyVersion: HEALTH_POLICY_VERSION,
        idempotencyKey: key(),
      }),
    );
    expect(childApproval.reason).toBe("under-13");
    await expect(
      guardian.guardianApprove({
        minorId: healthDemoIds.teen,
        policyVersion: "stale",
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/terms changed/);
  });

  it("refuses a guardian action from someone who is not linked", async () => {
    await expect(
      callers.teen().player.health.guardianApprove({
        minorId: healthDemoIds.child,
        policyVersion: HEALTH_POLICY_VERSION,
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/not a linked guardian/);
  });

  it("records a teen's own opt-in", async () => {
    await expect(
      callers.teen().player.health.optIn({
        policyVersion: HEALTH_POLICY_VERSION,
        idempotencyKey: key(),
      }),
    ).resolves.toEqual({
      recorded: true,
      teenOptedIn: true,
      guardianApproved: true,
    });
    await expect(
      callers.adult().player.health.optIn({
        policyVersion: HEALTH_POLICY_VERSION,
        idempotencyKey: key(),
      }),
    ).resolves.toMatchObject({ recorded: false });
  });
});

describe("Actor age bands are recomputed at request time", () => {
  const at = (iso: string) => new Date(`${iso}T08:00:00.000Z`);

  it("prefers the birth date over a stale stored band", () => {
    expect(
      currentAgeBand(
        { birthDate: "2013-11-27", ageBand: "under-13" },
        at("2026-11-27"),
      ),
    ).toBe("teen");
    expect(
      currentAgeBand(
        { birthDate: "2008-11-27", ageBand: "teen" },
        at("2026-11-27"),
      ),
    ).toBe("adult");
    expect(
      currentAgeBand(
        { birthDate: "2008-11-28", ageBand: "teen" },
        at("2026-11-27"),
      ),
    ).toBe("teen");
  });

  it("keeps the stored band only when there is no birth date", () => {
    expect(currentAgeBand({ birthDate: null, ageBand: "adult" }, NOW)).toBe(
      "adult",
    );
    expect(currentAgeBand({ birthDate: null, ageBand: "bogus" }, NOW)).toBe(
      "unknown",
    );
    expect(currentAgeBand({}, NOW)).toBe("unknown");
  });
});
