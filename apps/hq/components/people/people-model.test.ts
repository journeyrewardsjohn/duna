import type { OperatorMemberProfile } from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  attentionFor,
  canSeeHealth,
  checkImport,
  exportColumns,
  exportRow,
  filterRows,
  findDuplicatePairs,
  findDuplicates,
  guessMapping,
  listHref,
  listStateFromParams,
  mappingProblems,
  matchesPersonQuery,
  mergePlan,
  nextBestAction,
  type NextActionInput,
  normalisePhone,
  parseCsv,
  type PersonRow,
  type RowContext,
  redactProfile,
  segmentCounts,
  segmentFromParam,
  toCsv,
  toPersonRow,
  visibleRange,
  type WorkspacePerson,
} from "./people-model";

const now = new Date("2026-11-28T15:00:00.000Z");
const timeZone = "America/Los_Angeles";
const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) =>
  new Date(now.getTime() + offsetDays * day).toISOString();

function person(overrides: Partial<WorkspacePerson> = {}): WorkspacePerson {
  return {
    personId: "10000000-0000-4000-8000-000000000201",
    displayName: "Maya Chen",
    email: "maya@example.com",
    phoneE164: "+13105550121",
    isMinor: false,
    roles: ["player"],
    status: "active",
    membershipStatus: "active",
    membershipName: "Performance membership",
    creditBalance: 8,
    lifetimeSpendMinor: 148_500,
    upcomingCount: 1,
    churnRisk: {
      level: "low",
      reasons: [],
      lastActivityAt: iso(-2),
      daysSinceActivity: 2,
    },
    joinedAt: iso(-180),
    ...overrides,
  };
}

const context: RowContext = { now, timeZone, canSeePayments: true };
const row = (overrides: Partial<WorkspacePerson> = {}, ctx = context) =>
  toPersonRow(person(overrides), ctx);

const ava = () =>
  row(
    {
      personId: "10000000-0000-4000-8000-000000000203",
      displayName: "Ava Patel",
      email: "elena@example.com",
      phoneE164: "+13105550124",
      isMinor: true,
      membershipName: undefined,
      membershipStatus: undefined,
    },
    {
      ...context,
      guardianNames: new Map([["ava patel", "Elena Patel"]]),
    },
  );

describe("segments and the URL", () => {
  it("round-trips every segment and the search through the address", () => {
    for (const segment of [
      "members",
      "juniors",
      "guardians",
      "new",
      "lapsing",
      "attention",
      "upcoming",
      "credits",
    ] as const) {
      const href = listHref({ segment, query: "maya" });
      const params = Object.fromEntries(
        new URL(href, "https://hq").searchParams,
      );
      expect(listStateFromParams(params)).toEqual({ segment, query: "maya" });
    }
    expect(listHref({ segment: "everyone", query: "" })).toBe("/people");
    expect(listHref({ segment: "juniors", query: " ava " })).toBe(
      "/people?segment=juniors&q=ava",
    );
  });

  it("keeps old filter links working and ignores unknown values", () => {
    expect(segmentFromParam("minors")).toBe("juniors");
    expect(segmentFromParam("all")).toBe("everyone");
    expect(segmentFromParam("nonsense")).toBe("everyone");
    expect(segmentFromParam(undefined)).toBe("everyone");
    expect(
      listStateFromParams({ segment: ["juniors", "members"] }).segment,
    ).toBe("juniors");
  });

  it("counts each segment honestly and filters by segment and search", () => {
    const rows = [
      row(),
      ava(),
      row({
        personId: "p3",
        displayName: "Noah Martinez",
        email: "noah@example.com",
        phoneE164: "+13105550125",
        membershipStatus: "cancelled",
        upcomingCount: 0,
        creditBalance: 0,
        churnRisk: { level: "high", reasons: [], daysSinceActivity: 45 },
        joinedAt: iso(-3),
      }),
    ];
    const counts = segmentCounts(rows, now, timeZone);
    expect(counts.everyone).toBe(3);
    expect(counts.members).toBe(1);
    expect(counts.juniors).toBe(1);
    expect(counts.lapsing).toBe(1);
    expect(counts.new).toBe(1);
    expect(
      filterRows(
        rows,
        { segment: "everyone", query: "555 0125" },
        now,
        timeZone,
      ).map((entry) => entry.name),
    ).toEqual(["Noah Martinez"]);
  });

  it("finds a junior by name only, never by the guardian's contact", () => {
    const junior = ava();
    expect(matchesPersonQuery(junior, "ava")).toBe(true);
    expect(matchesPersonQuery(junior, "elena@example.com")).toBe(false);
    expect(matchesPersonQuery(junior, "3105550124")).toBe(false);
  });
});

describe("what needs attention", () => {
  const base = {
    isJunior: false,
    upcoming: 1,
    churn: "low" as const,
    canSeePayments: true,
    now,
  };

  it("names each problem in words, most urgent first", () => {
    const items = attentionFor({
      ...base,
      membershipStatus: "past-due",
      waiverMissing: true,
      planEndsAt: iso(6),
    });
    expect(items.map((item) => item.label)).toEqual([
      "Payment failed",
      "Waiver missing",
      "Membership ends in 6 days",
    ]);
  });

  it("never tells a role without payments about a failed payment", () => {
    expect(
      attentionFor({
        ...base,
        canSeePayments: false,
        membershipStatus: "past-due",
      }),
    ).toEqual([]);
  });

  it("flags a junior without a confirmed guardian", () => {
    expect(
      attentionFor({ ...base, isJunior: true, guardianState: "pending" })[0]
        ?.label,
    ).toBe("No guardian consent");
    expect(
      attentionFor({ ...base, isJunior: true, guardianState: "verified" }),
    ).toEqual([]);
  });

  it("calls someone quiet with nothing booked lapsing, not someone booked", () => {
    expect(
      attentionFor({ ...base, upcoming: 0, daysQuiet: 45, churn: "watch" })[0]
        ?.label,
    ).toBe("Quiet for 45 days");
    expect(
      attentionFor({ ...base, upcoming: 2, daysQuiet: 45, churn: "high" }),
    ).toEqual([]);
  });

  it("ignores an end date outside the window", () => {
    expect(attentionFor({ ...base, planEndsAt: iso(40) })).toEqual([]);
    expect(attentionFor({ ...base, planEndsAt: iso(-1) })).toEqual([]);
  });
});

describe("a row carries only what the viewer may see", () => {
  it("never carries a junior's own contact", () => {
    const junior = ava();
    expect(junior.email).toBeUndefined();
    expect(junior.phone).toBeUndefined();
    expect(junior.relation).toBe("Junior of Elena Patel");
  });

  it("carries money only for roles that read payments", () => {
    expect(row().spendMinor).toBe(148_500);
    expect(row({}, { ...context, canSeePayments: false }).spendMinor).toBe(
      undefined,
    );
  });

  it("says what they are to the club in plain words", () => {
    expect(row().relation).toBe(
      "Member since Jun 2026 · Performance membership",
    );
    expect(
      row({
        roles: ["guardian"],
        membershipName: undefined,
        membershipStatus: undefined,
      }).relation,
    ).toBe("Parent or guardian since Jun 2026");
    expect(row({ status: "pending" }).relation).toBe("Invited, not joined yet");
  });
});

describe("the next best action", () => {
  const input = (
    overrides: Partial<NextActionInput> = {},
  ): NextActionInput => ({
    personId: "p1",
    name: "Maya Chen",
    isJunior: false,
    email: "maya@example.com",
    membershipStatus: "active",
    plans: [],
    credits: [],
    upcoming: 1,
    churn: "low",
    canSeePayments: true,
    canDraft: true,
    clubName: "Sunset Beach Club",
    timeZone,
    now,
    ...overrides,
  });

  it("drafts a renewal reminder for a plan that ends within two weeks", () => {
    const action = nextBestAction(
      input({
        plans: [
          {
            name: "Performance membership",
            status: "active",
            currentPeriodEndsAt: iso(6),
            cancelAtPeriodEnd: true,
          },
        ],
      }),
    );
    expect(action.kind).toBe("draft");
    expect(action.title).toBe(
      "Membership ends in 6 days: send a renewal reminder",
    );
    if (action.kind === "draft") {
      expect(action.draft.channel).toBe("email");
      expect(action.draft.body).toContain("Sunset Beach Club");
      expect(action.verb).toBe("Draft a renewal reminder");
    }
  });

  it("does not remind about a plan that renews by itself", () => {
    const action = nextBestAction(
      input({
        plans: [
          {
            name: "Performance membership",
            status: "active",
            currentPeriodEndsAt: iso(6),
            cancelAtPeriodEnd: false,
          },
        ],
      }),
    );
    expect(action.kind).toBe("none");
  });

  it("puts a junior's missing guardian consent first, and never drafts to a junior", () => {
    const consent = nextBestAction(
      input({ isJunior: true, guardianState: "pending" }),
    );
    expect(consent.kind).toBe("link");
    if (consent.kind === "link") expect(consent.href).toBe("/people/p1/family");
    const lapsing = nextBestAction(
      input({
        isJunior: true,
        guardianState: "verified",
        upcoming: 0,
        churn: "high",
        daysQuiet: 40,
      }),
    );
    expect(lapsing.kind).toBe("link");
    if (lapsing.kind === "link") {
      expect(lapsing.href).toBe("/inbox?compose=new&recipient=p1");
      expect(lapsing.detail).toContain("guardian");
    }
  });

  it("mentions a failed payment only to a role that reads payments", () => {
    expect(nextBestAction(input({ membershipStatus: "past-due" })).id).toBe(
      "payment-failed",
    );
    expect(
      nextBestAction(
        input({ membershipStatus: "past-due", canSeePayments: false }),
      ).id,
    ).toBe("nothing");
  });

  it("reminds about credits that expire soon, then checks in on the quiet", () => {
    expect(
      nextBestAction(
        input({
          credits: [
            { remainingCredits: 3, expiresAt: iso(5), status: "active" },
          ],
        }),
      ).title,
    ).toMatch(/^3 credits expire on /);
    expect(
      nextBestAction(input({ upcoming: 0, churn: "high", daysQuiet: 45 }))
        .title,
    ).toBe("Quiet for 45 days: send a check-in");
  });

  it("asks for contact first when there is nowhere to send a draft", () => {
    const action = nextBestAction(
      input({ email: undefined, phone: undefined, upcoming: 0, churn: "high" }),
    );
    expect(action.kind).toBe("link");
    expect(action.detail).toContain("Add an email or mobile number first.");
  });
});

describe("duplicates", () => {
  const people = [
    {
      id: "a",
      name: "Maya Chen",
      email: "maya@example.com",
      phone: "+13105550121",
      isJunior: false,
    },
    { id: "b", name: "Ava Patel", email: "elena@example.com", isJunior: true },
    {
      id: "c",
      name: "Elena Patel",
      email: "elena@example.com",
      phone: "+13105550124",
      isJunior: false,
      isGuardian: true,
    },
  ];

  it("explains a shared contact and links the person, strongest first", () => {
    const matches = findDuplicates(
      { name: "M Chen", email: " MAYA@example.com ", isJunior: false },
      people,
    );
    expect(matches[0]).toMatchObject({
      id: "a",
      strength: "same-contact",
      reason: "Maya Chen already uses maya@example.com.",
    });
    expect(
      findDuplicates(
        { name: "Someone", phone: "(310) 555-0121", isJunior: false },
        people,
      )[0]?.reason,
    ).toBe("Maya Chen already uses this mobile number.");
  });

  it("matches a junior by name only and never quotes the family's contact", () => {
    const matches = findDuplicates(
      { name: "Ava Patel", email: "elena@example.com", isJunior: true },
      people,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: "b", strength: "same-name" });
    expect(matches[0]!.reason).not.toContain("@");
  });

  it("finds similar names", () => {
    expect(
      findDuplicates({ name: "Maya Chenn", isJunior: false }, people)[0]
        ?.strength,
    ).toBe("similar-name");
    expect(
      findDuplicates({ name: "Chen Maya", isJunior: false }, people)[0]
        ?.strength,
    ).toBe("similar-name");
  });

  it("never pairs a junior with the guardian who holds their contact", () => {
    expect(findDuplicatePairs(people)).toEqual([]);
    const pairs = findDuplicatePairs([
      ...people,
      { id: "d", name: "Maya C", email: "maya@example.com", isJunior: false },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toBe("Both use maya@example.com.");
  });
});

describe("export columns", () => {
  it("has no health column, and money only for roles that read payments", () => {
    const headers = exportColumns({ canSeePayments: false }).map(
      (column) => column.header,
    );
    expect(headers.join(" ")).not.toMatch(
      /health|heart|readiness|strain|sleep/i,
    );
    expect(headers.join(" ")).not.toMatch(/spend/i);
    expect(
      exportColumns({ canSeePayments: true }).map((column) => column.key),
    ).toContain("spend");
  });

  it("leaves a junior's contact empty and names the guardian", () => {
    const columns = exportColumns({ canSeePayments: true });
    const junior: PersonRow = {
      ...ava(),
      email: "leak@example.com",
      phone: "+1",
    };
    const cells = exportRow(junior, columns);
    const at = (key: string) => cells[columns.findIndex((c) => c.key === key)];
    expect(at("email")).toBe("");
    expect(at("phone")).toBe("");
    expect(at("guardian")).toBe("Elena Patel");
    expect(at("junior")).toBe("Yes");
  });

  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", "plain"]])).toBe(
      '"a,b","say ""hi""",\'=SUM(A1),plain',
    );
  });
});

describe("import dry run", () => {
  const existing = [
    { id: "a", name: "Maya Chen", email: "maya@example.com", isJunior: false },
  ];

  it("parses quoted CSV and guesses the columns", () => {
    const table = parseCsv(
      '\uFEFFFull name,E-mail,Mobile,Date of birth,Parent name,Parent email\r\n"Lee, Sam",sam@example.com,,,,\n',
    );
    expect(table).toEqual([
      [
        "Full name",
        "E-mail",
        "Mobile",
        "Date of birth",
        "Parent name",
        "Parent email",
      ],
      ["Lee, Sam", "sam@example.com", "", "", "", ""],
    ]);
    expect(guessMapping(table[0]!)).toEqual([
      "name",
      "email",
      "phone",
      "birthDate",
      "guardianName",
      "guardianEmail",
    ]);
  });

  it("explains every problem per row and writes nothing", () => {
    const table = [
      ["Name", "Email", "Mobile", "DOB", "Guardian", "Guardian email"],
      ["Sam Lee", "sam@example.com", "", "", "", ""],
      ["", "x@example.com", "", "", "", ""],
      ["Kid One", "", "", "2015-04-02", "", ""],
      ["Kid Two", "", "", "2014-01-01", "Pat Two", "pat@example.com"],
      ["Maya Chen", "maya@example.com", "", "", "", ""],
      ["Sam Lee", "SAM@example.com", "", "", "", ""],
      ["Bad Mail", "nope", "12", "", "", ""],
    ];
    const mapping = guessMapping(table[0]!);
    const result = checkImport(table, mapping, existing, now);
    expect(result.summary).toEqual({
      total: 7,
      ready: 2,
      duplicates: 2,
      problems: 3,
      juniors: 1,
    });
    expect(result.rows[1]).toMatchObject({ line: 3, problems: ["No name"] });
    expect(result.rows[2]!.problems).toEqual([
      "Junior without a guardian name",
      "Junior without a guardian email or mobile",
    ]);
    expect(result.rows[3]).toMatchObject({ kind: "junior", status: "ready" });
    expect(result.rows[3]!.email).toBeUndefined();
    expect(result.rows[4]).toMatchObject({
      status: "duplicate",
      duplicateOf: "Maya Chen",
    });
    expect(result.rows[5]).toMatchObject({
      status: "duplicate",
      duplicateOf: "Sam Lee, earlier in this file",
    });
    expect(result.rows[6]!.problems).toEqual([
      "Email isn't an email address",
      "Mobile isn't a full number",
    ]);
  });

  it("says what a column mapping is missing", () => {
    expect(mappingProblems(["ignore", "email"])).toEqual([
      "Choose the column with each person's name.",
    ]);
    expect(mappingProblems(["name", "name", "phone"])).toEqual([
      "Full name is chosen for 2 columns.",
    ]);
  });

  it("normalises phone numbers to E.164 or refuses them", () => {
    expect(normalisePhone("(310) 555-0121")).toBe("+13105550121");
    expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalisePhone("12")).toBeUndefined();
  });
});

describe("merge plan", () => {
  const side = (overrides: Partial<Parameters<typeof mergePlan>[0]> = {}) => ({
    id: "a",
    name: "Maya Chen",
    email: "maya@example.com",
    isJunior: false,
    credits: 3,
    memberSince: "2026-01-01T00:00:00.000Z",
    upcoming: 1,
    ...overrides,
  });

  it("keeps the kept record's details, fills gaps, adds credits", () => {
    const plan = mergePlan(
      side(),
      side({
        id: "b",
        name: "Maya C",
        email: "other@example.com",
        phone: "+13105550121",
        plan: "Club unlimited",
        credits: 5,
        memberSince: "2025-06-01T00:00:00.000Z",
      }),
    );
    expect(plan.blocked).toBeUndefined();
    expect(plan.kept).toEqual([
      { label: "Name", value: "Maya Chen", from: "kept" },
      { label: "Email", value: "maya@example.com", from: "kept" },
      { label: "Mobile", value: "+13105550121", from: "merged" },
      { label: "Plan", value: "Club unlimited", from: "merged" },
      { label: "Credits", value: "8", from: "both" },
      { label: "Joined", value: "2025-06-01", from: "merged" },
    ]);
    expect(plan.moved[0]).toBe("Maya C's bookings and attendance history");
  });

  it("never merges a junior with an adult, or a record with itself", () => {
    expect(
      mergePlan(side(), side({ id: "b", isJunior: true })).blocked,
    ).toMatch(/junior and an adult/);
    expect(mergePlan(side(), side()).blocked).toBe(
      "Choose two different people.",
    );
  });
});

describe("health permission", () => {
  it("is for owners and managers, adults only", () => {
    expect(canSeeHealth(["owner"], false)).toBe(true);
    expect(canSeeHealth(["manager"], false)).toBe(true);
    expect(canSeeHealth(["owner"], true)).toBe(false);
    for (const role of [
      "coach",
      "front-desk",
      "scorekeeper",
      "accountant",
      "player",
      "guardian",
    ]) {
      expect(canSeeHealth([role], false), role).toBe(false);
    }
  });
});

describe("redaction before anything reaches a browser", () => {
  const profile = {
    relationship: {
      ...person({ isMinor: true, email: "elena@example.com" }),
      purchaseCount: 2,
      recentPurchases: [
        {
          orderId: "o1",
          description: "Clinic",
          amountMinor: 4000,
          currency: "USD",
          status: "paid",
          purchasedAt: iso(-3),
        },
      ],
    },
    profile: {} as OperatorMemberProfile["profile"],
    plans: [
      {
        id: "pl",
        name: "Junior plan",
        status: "active",
        interval: "month",
        priceMinor: 9000,
        currency: "USD",
        cancelAtPeriodEnd: false,
      },
    ],
    creditGrants: [],
    sessions: [],
    purchases: [
      {
        orderId: "o1",
        description: "Clinic",
        amountMinor: 4000,
        refundedMinor: 0,
        currency: "USD",
        status: "paid",
        purchasedAt: iso(-3),
        refunds: [],
      },
    ],
    notes: [],
    videos: [],
    health: {
      source: "apple-healthkit",
      scopes: ["heart"],
      grantedAt: iso(-10),
      metrics: { restingHeartRate: 58 },
    },
    timeline: [
      {
        id: "t1",
        kind: "purchase",
        title: "Clinic",
        detail: "$40.00",
        occurredAt: iso(-3),
      },
      {
        id: "t2",
        kind: "session",
        title: "Clinic",
        detail: "Attended",
        occurredAt: iso(-2),
      },
    ],
  } as unknown as OperatorMemberProfile;

  it("drops health, money and a junior's contact for a coach", () => {
    const cut = redactProfile(profile, {
      canSeePayments: false,
      canSeeHealth: false,
    });
    expect(cut.health).toBeUndefined();
    expect(cut.purchases).toEqual([]);
    expect(cut.plans[0]!.priceMinor).toBe(0);
    expect(cut.relationship.lifetimeSpendMinor).toBe(0);
    expect(cut.relationship.recentPurchases).toEqual([]);
    expect(cut.relationship.email).toBeUndefined();
    expect(cut.timeline.map((item: { kind: string }) => item.kind)).toEqual([
      "session",
    ]);
    expect(JSON.stringify(cut)).not.toContain("58");
  });

  it("never passes a junior's health on, even to an owner", () => {
    expect(
      redactProfile(profile, { canSeePayments: true, canSeeHealth: true })
        .health,
    ).toBeUndefined();
  });
});

describe("windowing", () => {
  it("renders only the rows in view, with overscan", () => {
    expect(
      visibleRange({
        scrollTop: 0,
        viewportHeight: 640,
        rowHeight: 76,
        count: 5000,
      }),
    ).toEqual({ start: 0, end: 17 });
    expect(
      visibleRange({
        scrollTop: 76 * 1000,
        viewportHeight: 640,
        rowHeight: 76,
        count: 5000,
      }),
    ).toEqual({ start: 992, end: 1017 });
    expect(
      visibleRange({
        scrollTop: 76 * 5000,
        viewportHeight: 640,
        rowHeight: 76,
        count: 5000,
      }),
    ).toEqual({ start: 4992, end: 5000 });
    expect(
      visibleRange({
        scrollTop: 0,
        viewportHeight: 640,
        rowHeight: 76,
        count: 0,
      }),
    ).toEqual({ start: 0, end: 0 });
  });
});
