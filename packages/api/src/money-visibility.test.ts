/**
 * PRIV-2: a club's money reaches only roles with payments:read or
 * payments:write. Tested at the procedure level, through the real router and
 * its output schemas, for every staff role.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonRole } from "@duna/core";
import type { z } from "zod";
import { createDemoActor, scopesForRoles } from "./context";
import {
  operatorActivityDetailSchema,
  operatorDashboardSchema,
  operatorDivisionDetailSchema,
  operatorMemberProfileSchema,
  operatorSessionDetailSchema,
  operatorWorkspaceSchema,
  type OperatorActivityDetail,
  type OperatorDivisionDetail,
} from "./contracts";
import {
  MONEY_PATHS,
  REVIEWED_VISIBLE_PATHS,
  moneyVisibilityFor,
  type MoneyRedactedOutput,
} from "./money-visibility";
import { scopesForOrganizationStaffRole } from "./operator-service";
import { createCaller } from "./router";

const ids = {
  session: "20000000-0000-4000-8000-000000000001",
  division: "20000000-0000-4000-8000-000000000002",
  team: "20000000-0000-4000-8000-000000000003",
  registration: "20000000-0000-4000-8000-000000000004",
  person: "20000000-0000-4000-8000-000000000005",
  activity: "20000000-0000-4000-8000-000000000006",
};
const at = "2026-11-28T18:00:00.000Z";

const activityFixture: OperatorActivityDetail = {
  activity: {
    id: ids.activity,
    type: "court-booking",
    title: "Court 2",
    startsAt: at,
    endsAt: at,
    timezone: "America/Los_Angeles",
    status: "confirmed",
    venueName: "Main",
    capacity: 4,
    organizerPersonId: ids.person,
    organizerName: "Organizer",
    paymentMode: "split",
    totalAmountMinor: 8_000,
    fundedAmountMinor: 6_000,
    currency: "USD",
  },
  participants: [
    {
      id: ids.registration,
      personId: ids.person,
      displayName: "Organizer",
      role: "organizer",
      status: "paid",
      shareAmountMinor: 2_000,
      attendanceStatus: "scheduled",
    },
  ],
};

const teamFixture: OperatorDivisionDetail["teams"][number] = {
  id: ids.team,
  registrationId: ids.registration,
  divisionId: ids.division,
  divisionName: "Open",
  name: "Team",
  captainName: "Captain",
  registrationStatus: "confirmed",
  selectionStatus: "confirmed",
  selectionLocked: false,
  registeredAt: at,
  fullyPaidAt: at,
  fullyPaid: true,
  expectedTeamSize: 2,
  playersAdded: 2,
  claimedPlayers: 2,
  paidPlayers: 2,
  paymentMode: "self",
  status: "confirmed",
  needsAttention: false,
  expiresAt: at,
  roster: [{ displayName: "Captain", status: "captain", paid: true }],
};

const divisionFixture: OperatorDivisionDetail = {
  session: {
    id: ids.session,
    title: "Open",
    kind: "tournament",
    status: "registration-open",
    startsAt: at,
    timezone: "America/Los_Angeles",
  },
  division: {
    id: ids.division,
    name: "Open",
    discipline: "beach",
    teamSize: 2,
    capacity: 16,
    entryFeeMinor: 9_000,
    seeding: "rating",
    tournamentFormat: "double-elimination",
  },
  teams: [teamFixture],
  matches: [],
  courts: [],
};

vi.mock("./attendance-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./attendance-service")>()),
  loadOperatorActivityDetail: vi.fn(async () => activityFixture),
}));
vi.mock("./event-operations-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./event-operations-service")>()),
  loadOperatorDivisionDetail: vi.fn(async () => divisionFixture),
}));

const previousDatabaseUrl = process.env.DATABASE_URL;
beforeEach(() => {
  delete process.env.DATABASE_URL;
});
afterEach(() => {
  if (previousDatabaseUrl !== undefined)
    process.env.DATABASE_URL = previousDatabaseUrl;
});

const ROLES = [
  "coach",
  "front-desk",
  "scorekeeper",
  "manager",
  "accountant",
  "owner",
] as const satisfies readonly PersonRole[];
type StaffRole = (typeof ROLES)[number];

const SEES_AMOUNTS: Record<StaffRole, boolean> = {
  coach: false,
  "front-desk": false,
  scorekeeper: false,
  manager: true,
  accountant: true,
  owner: true,
};
const SEES_PAID_STATE: Record<StaffRole, boolean> = {
  ...SEES_AMOUNTS,
  coach: true,
  "front-desk": true,
};

function callerFor(role: StaffRole) {
  return createCaller({
    actor: createDemoActor([role]),
    requestId: crypto.randomUUID(),
    now: new Date(at),
  });
}

function valueAt(value: unknown, path: string): unknown[] {
  let current: unknown[] = [value];
  for (const segment of path.split(".")) {
    const isArray = segment.endsWith("[]");
    const key = isArray ? segment.slice(0, -2) : segment;
    current = current.flatMap((item) => {
      if (item === null || typeof item !== "object") return [];
      const child = (item as Record<string, unknown>)[key];
      if (child === undefined) return [];
      return isArray ? (Array.isArray(child) ? child : []) : [child];
    });
  }
  return current;
}

/** Every money path the role may not see is absent from the output. */
function expectRedacted(
  output: MoneyRedactedOutput,
  value: unknown,
  role: StaffRole,
) {
  for (const path of MONEY_PATHS[output].amounts) {
    expect(valueAt(value, path), `${role} ${output} ${path}`).toHaveLength(0);
  }
  if (!SEES_PAID_STATE[role]) {
    for (const path of MONEY_PATHS[output].paidState) {
      expect(valueAt(value, path), `${role} ${output} ${path}`).toHaveLength(0);
    }
  }
}

describe("moneyVisibilityFor", () => {
  it.each(ROLES)("%s", (role) => {
    expect(moneyVisibilityFor({ scopes: scopesForRoles([role]) })).toEqual({
      amounts: SEES_AMOUNTS[role],
      paidState: SEES_PAID_STATE[role],
    });
  });
});

describe("operator procedures return money only to payments roles", () => {
  it.each(ROLES)("operator.workspace as %s", async (role) => {
    const workspace = await callerFor(role).operator.workspace();
    if (SEES_AMOUNTS[role]) {
      expect(
        workspace.people.some((p) => p.lifetimeSpendMinor !== undefined),
      ).toBe(true);
    } else {
      expectRedacted("workspace", workspace, role);
    }
  });

  it.each(ROLES)("operator.sessionDetail as %s", async (role) => {
    const caller = callerFor(role);
    const workspace = await callerFor("owner").operator.workspace();
    const sessionId = workspace.sessions[0]!.id;
    const detail = await caller.operator.sessionDetail({ sessionId });
    if (SEES_AMOUNTS[role]) {
      expect(detail.finance?.grossMinor).toBeTypeOf("number");
      expect(detail.cancellationPreview.cashRefundMinor).toBeTypeOf("number");
    } else {
      expect(detail.finance).toBeUndefined();
      expectRedacted("sessionDetail", detail, role);
    }
    if (SEES_PAID_STATE[role] && detail.attendees.length > 0) {
      expect(detail.attendees[0]!.paymentStatus).toBeDefined();
    }
    // List prices stay public.
    expect(detail.session.priceMinor).toBeTypeOf("number");
  });

  it.each(ROLES)("operator.activityDetail as %s", async (role) => {
    const detail = await callerFor(role).operator.activityDetail({
      activityType: "court-booking",
      activityId: ids.activity,
    });
    if (SEES_AMOUNTS[role]) {
      expect(detail.activity.totalAmountMinor).toBe(8_000);
      expect(detail.participants[0]!.shareAmountMinor).toBe(2_000);
    } else {
      expect(detail.activity.totalAmountMinor).toBeUndefined();
      expect(detail.activity.fundedAmountMinor).toBeUndefined();
      expect(detail.participants[0]!.shareAmountMinor).toBeUndefined();
    }
  });

  it.each(ROLES)("operator.divisionDetail as %s", async (role) => {
    const detail = await callerFor(role).operator.divisionDetail({
      divisionId: ids.division,
    });
    expect(detail.division.entryFeeMinor).toBe(9_000);
    const team = detail.teams[0]!;
    if (SEES_PAID_STATE[role]) {
      expect(team).toMatchObject({ fullyPaid: true, paidPlayers: 2 });
      expect(team.roster[0]!.paid).toBe(true);
    } else {
      expect(team.fullyPaid).toBeUndefined();
      expect(team.fullyPaidAt).toBeUndefined();
      expect(team.paidPlayers).toBeUndefined();
      expect(team.roster[0]!.paid).toBeUndefined();
    }
  });

  it.each(ROLES)("operator.dashboard as %s", async (role) => {
    const scopes = scopesForRoles([role]);
    const call = callerFor(role).operator.dashboard();
    if (!scopes.includes("*") && !scopes.includes("reports:read")) {
      await expect(call).rejects.toThrow();
      return;
    }
    const dashboard = await call;
    const moneyMetrics = dashboard.metrics.filter((metric) => metric.money);
    if (SEES_AMOUNTS[role]) expect(moneyMetrics.length).toBeGreaterThan(0);
    else {
      expect(moneyMetrics).toHaveLength(0);
      expect(JSON.stringify(dashboard.metrics)).not.toMatch(/revenue|payout/i);
    }
  });

  it.each(ROLES)("operator.memberProfile as %s", async (role) => {
    const scopes = scopesForRoles([role]);
    const owner = await callerFor("owner").operator.workspace();
    const personId = owner.people[0]!.personId;
    const call = callerFor(role).operator.memberProfile({ personId });
    if (!scopes.includes("*") && !scopes.includes("members:read")) {
      await expect(call).rejects.toThrow();
      return;
    }
    const profile = await call;
    if (SEES_AMOUNTS[role]) {
      expect(profile.relationship.lifetimeSpendMinor).toBeTypeOf("number");
    } else {
      expectRedacted("memberProfile", profile, role);
      for (const entry of profile.timeline) {
        expect(entry.detail).not.toMatch(/\d+\.\d\d/);
      }
    }
  });
});

const MONEY_LIKE =
  /minor|amount|gross|net(?!work)|refund|paid|spend|margin|cogs|payout|revenue|cost|price|liabilit|balance|fee|total|earn|owed|due/i;

/** Field paths of a zod schema whose key looks like money. */
function moneyLikePaths(schema: z.ZodType): string[] {
  const out: string[] = [];
  const walk = (node: z.ZodType, path: string) => {
    const def = (node as unknown as { _zod: { def: Record<string, unknown> } })
      ._zod.def;
    switch (def.type) {
      case "object":
        for (const [key, child] of Object.entries(
          def.shape as Record<string, z.ZodType>,
        )) {
          const next = path ? `${path}.${key}` : key;
          if (key !== "isMinor" && MONEY_LIKE.test(key)) out.push(next);
          walk(child, next);
        }
        return;
      case "array":
        return walk(def.element as z.ZodType, `${path}[]`);
      case "optional":
      case "nullable":
      case "readonly":
      case "default":
        return walk(def.innerType as z.ZodType, path);
      case "union":
        for (const option of def.options as z.ZodType[]) walk(option, path);
        return;
      default:
        return;
    }
  };
  walk(schema, "");
  return [...new Set(out)];
}

describe("every money-like output field is reviewed", () => {
  const schemas: Record<MoneyRedactedOutput, z.ZodType> = {
    sessionDetail: operatorSessionDetailSchema,
    divisionDetail: operatorDivisionDetailSchema,
    activityDetail: operatorActivityDetailSchema,
    workspace: operatorWorkspaceSchema,
    memberProfile: operatorMemberProfileSchema,
  };
  it.each(Object.keys(schemas) as MoneyRedactedOutput[])("%s", (output) => {
    const reviewed = new Set<string>([
      ...MONEY_PATHS[output].amounts,
      ...MONEY_PATHS[output].paidState,
      ...REVIEWED_VISIBLE_PATHS[output],
    ]);
    const unreviewed = moneyLikePaths(schemas[output]).filter(
      (path) =>
        !reviewed.has(path) &&
        // A field inside a redacted object is covered by it.
        ![...reviewed].some((prefix) => path.startsWith(`${prefix}.`)),
    );
    expect(
      unreviewed,
      "New money-like field: add it to MONEY_PATHS (and make it optional) or, if it is a public list price, to REVIEWED_VISIBLE_PATHS in money-visibility.ts",
    ).toEqual([]);
  });

  it("dashboard metrics carry the money flag", () => {
    expect(
      Object.keys(operatorDashboardSchema.shape.metrics.unwrap().element.shape),
    ).toContain("money");
  });
});

describe("one role table", () => {
  // What each staff role could do before PRIV-2 unified the two tables
  // (role table plus the scopes its membership stored), written out by hand.
  const player = [
    "profile:read",
    "profile:write",
    "matches:read",
    "matches:write",
    "bookings:read",
    "bookings:write",
    "wallet:read",
    "wallet:write",
    "social:write",
    "messages:read",
    "messages:write",
  ];
  const manager = [
    "members:read",
    "members:write",
    "sessions:read",
    "sessions:write",
    "training:read",
    "training:write",
    "matches:read",
    "matches:write",
    "matches:score",
    "tickets:scan",
    "messages:read",
    "messages:write",
    "messages:propose",
    "payments:read",
    "reports:read",
    "audiences:read",
    "audiences:write",
  ];
  const before: Record<
    "coach" | "manager" | "front-desk" | "accountant" | "director",
    readonly string[]
  > = {
    coach: [
      "members:read",
      "sessions:read",
      "training:read",
      "training:write",
      "matches:read",
      "matches:write",
      "matches:score",
      "payments:collect",
      "messages:read",
      "messages:write",
      "messages:propose",
      "reports:read",
      "audiences:read",
      "audiences:write",
    ],
    manager,
    "front-desk": [
      "members:read",
      "sessions:read",
      "sessions:write",
      "training:read",
      "bookings:write",
      "payments:collect",
      "tickets:scan",
      "messages:read",
      "messages:write",
    ],
    accountant: ["sessions:read", "payments:read", "reports:read"],
    director: [...manager, "payments:write", "payments:collect"],
  };

  it.each(Object.keys(before) as (keyof typeof before)[])(
    "%s keeps exactly the scopes it had",
    (role) => {
      const membershipRole = role === "director" ? "manager" : role;
      const effective = new Set([
        ...scopesForRoles(["player", membershipRole]),
        ...scopesForOrganizationStaffRole(role),
      ]);
      expect([...effective].sort()).toEqual(
        [...new Set([...player, ...before[role]])].sort(),
      );
    },
  );

  it("the coach and front desk still hold no payments:read", () => {
    for (const role of ["coach", "front-desk", "scorekeeper"] as const) {
      expect(scopesForRoles([role])).not.toContain("payments:read");
      expect(scopesForRoles([role])).not.toContain("payments:write");
    }
  });
});
