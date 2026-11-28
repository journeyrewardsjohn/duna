import { describe, expect, it } from "vitest";
import {
  type CompensationInput,
  type DeliveredSessionInput,
  computePayRun,
  paidKey,
  periodEndsOn,
  roundHalfUp,
} from "./compute";

const period = {
  frequency: "every-2-weeks" as const,
  startsOn: "2026-11-16",
  endsOn: "2026-11-29",
  currency: "USD",
};
const members = [
  { staffProfileId: "a", payoutReady: false },
  { staffProfileId: "b", payoutReady: false },
  { staffProfileId: "c", payoutReady: false },
];

function session(
  key: string,
  staffProfileId: string,
  localDate: string,
  minutes = 60,
  overrides: Partial<DeliveredSessionInput> = {},
): DeliveredSessionInput {
  const startsAt = `${localDate}T17:00:00.000Z`;
  return {
    key,
    kind: "session",
    staffProfileId,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString(),
    localDate,
    minutes,
    attended: true,
    revenueMinor: 0,
    ...overrides,
  };
}

const hourlyA: CompensationInput = {
  id: "comp-a",
  staffProfileId: "a",
  model: "hourly",
  classification: "1099-contractor",
  effectiveFrom: "2026-01-01",
  hourlyRateMinor: 4_000,
  revenueShareScope: [],
};

describe("roundHalfUp", () => {
  it("rounds half up to the minor unit", () => {
    expect(roundHalfUp(5, 2)).toBe(3);
    expect(roundHalfUp(4, 3)).toBe(1);
    expect(roundHalfUp(5, 3)).toBe(2);
    expect(roundHalfUp(0, 7)).toBe(0);
  });
});

describe("computePayRun", () => {
  it("pays each model by its rule and traces every line to its sessions", () => {
    const result = computePayRun(
      period,
      members,
      [
        session("s1", "a", "2026-11-17", 90),
        session("s2", "a", "2026-11-18", 45),
        session("s3", "b", "2026-11-18", 60, {
          offering: "private-lesson",
          revenueMinor: 9_000,
        }),
        session("s4", "b", "2026-11-19", 60, {
          offering: "group-lesson",
          revenueMinor: 9_000,
        }),
        session("outside", "a", "2026-11-30"),
      ],
      [
        hourlyA,
        {
          id: "comp-b",
          staffProfileId: "b",
          model: "hourly-plus-share",
          classification: "1099-contractor",
          effectiveFrom: "2026-01-01",
          hourlyRateMinor: 3_333,
          revenueShareBps: 2_000,
          revenueShareScope: ["private-lesson"],
        },
        {
          id: "comp-c",
          staffProfileId: "c",
          model: "salary",
          classification: "w2-employee",
          effectiveFrom: "2026-01-01",
          annualSalaryMinor: 5_200_001,
          revenueShareScope: [],
        },
      ],
    );
    const line = (id: string) =>
      result.lines.find((row) => row.staffProfileId === id)!;
    // 40.00/h × 90 min = 60.00; × 45 min = 30.00.
    expect(line("a")).toMatchObject({
      earningsMinor: 9_000,
      sessionsCount: 2,
      minutesWorked: 135,
    });
    expect(line("a").sessions.map((pay) => pay.key)).toEqual(["s1", "s2"]);
    // 33.33/h × 60 = 33.33 each; 20% of 90.00 only for the private lesson.
    expect(line("b").sessions.map((pay) => pay.amountMinor)).toEqual([
      3_333 + 1_800,
      3_333,
    ]);
    // 52,000.01 ÷ 26 = 2,000.0004 → 2,000.00.
    expect(line("c")).toMatchObject({
      earningsMinor: 200_000,
      classification: "w2-employee",
      method: "export",
    });
    expect(result.contractorTotalMinor).toBe(9_000 + 8_466);
    expect(result.employeeTotalMinor).toBe(200_000);
  });

  it("uses the model in force on each session's date and prorates salary", () => {
    const result = computePayRun(
      period,
      members,
      [
        session("before", "a", "2026-11-17"),
        session("after", "a", "2026-11-25"),
      ],
      [
        { ...hourlyA, effectiveTo: "2026-11-20" },
        {
          id: "comp-a2",
          staffProfileId: "a",
          model: "per-session",
          classification: "1099-contractor",
          effectiveFrom: "2026-11-21",
          perSessionRateMinor: 5_000,
          revenueShareScope: [],
        },
        {
          id: "comp-c",
          staffProfileId: "c",
          model: "salary",
          classification: "w2-employee",
          effectiveFrom: "2026-11-23",
          annualSalaryMinor: 2_600_000,
          revenueShareScope: [],
        },
      ],
    );
    const a = result.lines.find((row) => row.staffProfileId === "a")!;
    expect(
      a.sessions.map((pay) => [pay.compensationId, pay.amountMinor]),
    ).toEqual([
      ["comp-a", 4_000],
      ["comp-a2", 5_000],
    ]);
    expect(a.compensationId).toBe("comp-a2");
    // 100,000 per period × 7 of 14 days.
    expect(
      result.lines.find((row) => row.staffProfileId === "c")!.earningsMinor,
    ).toBe(50_000);
  });

  it("counts only attended sessions on an attended-time basis; lists sessions with no model", () => {
    const result = computePayRun(
      period,
      members,
      [
        session("attended", "a", "2026-11-17"),
        session("empty", "a", "2026-11-18", 60, { attended: false }),
        session("nobody", "b", "2026-11-18"),
      ],
      [{ ...hourlyA, hourlyBasis: "attended" }],
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.earningsMinor).toBe(4_000);
    expect(result.unpaidSessions).toEqual([
      { staffProfileId: "b", key: "nobody" },
    ]);
  });
});

/**
 * Property checks without a new dependency: a seeded generator (mulberry32)
 * so every run sees the same 200 random pay periods and a failure replays.
 */
function generator(seed: number) {
  let state = seed >>> 0;
  return (min: number, max: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    return min + Math.floor(unit * (max - min + 1));
  };
}

function randomCase(seed: number) {
  const next = generator(seed);
  const raw = Array.from({ length: next(0, 30) }, () => ({
    staff: ["a", "b", "c"][next(0, 2)]!,
    day: next(16, 29),
    minutes: next(15, 240),
    revenueMinor: next(0, 500_000),
    attended: next(0, 1) === 1,
  }));
  const rates: [number, number, number, number] = [
    next(0, 20_000),
    next(0, 20_000),
    next(0, 10_000),
    next(0, 50_000_000),
  ];
  return { raw, rates, cut: next(0, raw.length) };
}

const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);

function build(
  raw: readonly {
    staff: string;
    day: number;
    minutes: number;
    revenueMinor: number;
    attended: boolean;
  }[],
  [hourly, perSession, bps, salary]: [number, number, number, number],
) {
  const sessions = raw.map((value, index) =>
    session(
      `k${index}`,
      value.staff,
      `2026-11-${String(value.day).padStart(2, "0")}`,
      value.minutes,
      {
        revenueMinor: value.revenueMinor,
        attended: value.attended,
      },
    ),
  );
  const models: CompensationInput[] = [
    {
      ...hourlyA,
      model: "hourly-plus-share",
      hourlyRateMinor: hourly,
      revenueShareBps: bps,
    },
    {
      id: "comp-b",
      staffProfileId: "b",
      model: "per-session",
      classification: "1099-contractor",
      effectiveFrom: "2026-01-01",
      perSessionRateMinor: perSession,
      revenueShareScope: [],
    },
    {
      id: "comp-c",
      staffProfileId: "c",
      model: "salary",
      classification: "w2-employee",
      effectiveFrom: "2026-01-01",
      annualSalaryMinor: salary,
      revenueShareScope: [],
    },
  ];
  return { sessions, models };
}

describe("computePayRun: properties", () => {
  it("lines sum to the run totals, and each line to its sessions plus salary", () => {
    for (const seed of SEEDS) {
      const { raw, rates } = randomCase(seed);
      const { sessions, models } = build(raw, rates);
      const result = computePayRun(period, members, sessions, models);
      for (const line of result.lines) {
        expect(line.earningsMinor).toBe(
          line.sessions.reduce((total, pay) => total + pay.amountMinor, 0) +
            line.salary.reduce((total, pay) => total + pay.amountMinor, 0),
        );
        expect(Number.isSafeInteger(line.earningsMinor)).toBe(true);
        expect(line.earningsMinor).toBeGreaterThanOrEqual(0);
      }
      expect(result.contractorTotalMinor + result.employeeTotalMinor).toBe(
        result.lines.reduce((total, line) => total + line.earningsMinor, 0),
      );
    }
  });

  it("pays a session at most once across runs", () => {
    for (const seed of SEEDS) {
      const { raw, rates, cut } = randomCase(seed);
      const { sessions, models } = build(raw, rates);
      // The first run sees only some sessions (late attendance arrives later).
      const first = computePayRun(
        period,
        members,
        sessions.slice(0, cut),
        models,
      );
      const paidKeys = new Set(
        first.lines.flatMap((line) =>
          line.sessions.map((pay) => paidKey(line.staffProfileId, pay.key)),
        ),
      );
      const salaryPaid = new Set(
        first.lines
          .filter((line) => line.salary.length > 0)
          .map((line) => line.staffProfileId),
      );
      const adjustment = computePayRun(period, members, sessions, models, {
        alreadyPaidSessionKeys: paidKeys,
        salaryAlreadyPaidStaffIds: salaryPaid,
      });
      const all = computePayRun(period, members, sessions, models);
      const keysOf = (run: typeof first) =>
        run.lines.flatMap((line) => line.sessions.map((pay) => pay.key));
      const secondKeys = keysOf(adjustment);
      expect(
        adjustment.lines.flatMap((line) =>
          line.sessions.filter((pay) =>
            paidKeys.has(paidKey(line.staffProfileId, pay.key)),
          ),
        ),
      ).toEqual([]);
      expect([...keysOf(first), ...secondKeys].sort()).toEqual(
        keysOf(all).sort(),
      );
      expect(
        first.contractorTotalMinor +
          first.employeeTotalMinor +
          adjustment.contractorTotalMinor +
          adjustment.employeeTotalMinor,
      ).toBe(all.contractorTotalMinor + all.employeeTotalMinor);
    }
  });
});

describe("periodEndsOn", () => {
  it("derives the end from the frequency", () => {
    expect(periodEndsOn("weekly", "2026-11-16")).toBe("2026-11-22");
    expect(periodEndsOn("every-2-weeks", "2026-11-16")).toBe("2026-11-29");
    expect(periodEndsOn("twice-monthly", "2026-02-01")).toBe("2026-02-15");
    expect(periodEndsOn("twice-monthly", "2026-02-16")).toBe("2026-02-28");
    expect(periodEndsOn("monthly", "2026-01-31")).toBe("2026-02-27");
    expect(periodEndsOn("monthly", "2026-12-01")).toBe("2026-12-31");
    expect(() => periodEndsOn("twice-monthly", "2026-02-03")).toThrow();
  });
});
