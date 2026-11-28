import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Health service records an access record ("health.profile_viewed")
 * for every non-owner call of `operator.memberHealthProfile`, its only read.
 * Opening a person's page must make none; opening the Health tab exactly
 * one. Whether the tab exists is the service's own answer on the member
 * profile (`healthAccess.canView`, its non-recording check): HQ keeps no
 * copy of the rule. The caller is a stand-in that counts those calls and
 * answers `canView` as the service would for the viewer.
 */
const maya = "10000000-0000-4000-8000-000000000201";
const calls = { memberHealthProfile: 0 };
const roles = { current: ["coach"] as string[] };
/** What the Health service's check answers for this viewer. */
const access = { canView: true };

const person = {
  personId: maya,
  displayName: "Maya Chen",
  email: "maya@example.com",
  isMinor: false,
  roles: ["player"],
  status: "active",
  membershipStatus: "active",
  membershipName: "Performance membership",
  creditBalance: 8,
  lifetimeSpendMinor: 148_500,
  purchaseCount: 1,
  recentPurchases: [],
  upcomingCount: 1,
  churnRisk: { score: 10, level: "low", reasons: [], model: "activity-v1" },
  joinedAt: "2026-06-01T00:00:00.000Z",
};

const caller = {
  operator: {
    workspace: async () => ({
      organization: {
        name: "South Bay",
        timezone: "UTC",
        currency: "USD",
      },
      theme: { palette: { primary: "#123456" } },
      people: [person],
      participants: [],
      messageRecipients: [],
      invitations: [],
      sessions: [],
    }),
    memberProfile: async () => ({
      relationship: person,
      profile: { handle: "maya" },
      plans: [],
      creditGrants: [],
      sessions: [],
      purchases: [],
      notes: [],
      videos: [],
      timeline: [],
      // The deprecated marker (never values since PRIV-1): HQ ignores it.
      health: access.canView
        ? {
            source: "apple-healthkit",
            scopes: ["heart"],
            grantedAt: "2026-11-01T00:00:00.000Z",
          }
        : undefined,
      healthAccess: { canView: access.canView },
    }),
    memberHealthProfile: async () => {
      calls.memberHealthProfile += 1;
      return { daily: [], timeline: [], disclaimer: "" };
    },
  },
};

vi.mock("@duna/api", () => ({ appRouter: { _def: { procedures: {} } } }));
vi.mock("@/lib/api", () => ({ getServerCaller: async () => caller }));
vi.mock("../today/today-data", () => ({
  demoFirstDayRequested: async () => false,
}));
vi.mock("../shell/hq-session", () => ({
  getHqSession: async () => ({
    access: "operator",
    roles: roles.current,
    scopes: ["members:read", "sessions:read"],
    organization: { name: "South Bay", timezone: "UTC" },
  }),
  hasScope: (session: { scopes: string[] }, scope: string) =>
    session.scopes.includes(scope),
}));

describe("health access records", () => {
  const before = process.env.DATABASE_URL;
  afterAll(() => {
    if (before === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = before;
  });
  beforeEach(() => {
    calls.memberHealthProfile = 0;
    vi.resetModules();
    process.env.DATABASE_URL = "postgres://test.invalid/duna";
  });

  it("opening a person's Overview creates no health access record", async () => {
    const { loadPerson } = await import("./people-data");
    const loaded = await loadPerson(maya);
    expect(loaded.state).toBe("ok");
    // The tab exists (the service says this coach may view Maya's health)…
    if (loaded.state === "ok") expect(loaded.data.canSeeHealth).toBe(true);
    // …decided without the service's recording read.
    expect(calls.memberHealthProfile).toBe(0);
  });

  it("a coach Maya shared with by name sees the tab (the service's answer, not a role list)", async () => {
    // Front desk is never in a role list; a by-name share still reaches the
    // person it names, and HQ follows the service rather than a role copy.
    roles.current = ["front-desk"];
    access.canView = true;
    const { loadPerson } = await import("./people-data");
    const loaded = await loadPerson(maya);
    if (loaded.state === "ok") {
      expect(loaded.data.canSeeHealth).toBe(true);
      // No value or marker reaches the page.
      expect(loaded.data.profile.health).toBeUndefined();
    }
    expect(calls.memberHealthProfile).toBe(0);
    roles.current = ["coach"];
  });

  it("opening the Health tab creates exactly one", async () => {
    const { loadHealthHistory, loadPerson } = await import("./people-data");
    await loadPerson(maya);
    await loadHealthHistory(maya);
    expect(calls.memberHealthProfile).toBe(1);
  });

  it("a viewer the service refuses gets no tab and no record", async () => {
    access.canView = false;
    const { loadPerson } = await import("./people-data");
    const loaded = await loadPerson(maya);
    if (loaded.state === "ok") {
      expect(loaded.data.canSeeHealth).toBe(false);
      expect(loaded.data.profile.health).toBeUndefined();
    }
    expect(calls.memberHealthProfile).toBe(0);
    access.canView = true;
  });
});
