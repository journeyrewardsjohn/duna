import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AvailabilityResult,
  type StaffAvailabilityInputs,
  type StaffAvailabilitySchedule,
  availabilityFor,
  freeMinutes,
  isFreeThroughout,
  scheduleInForce,
} from "./availability";
import { localDateOf, wallTimeToInstant, zoneOffsetMs } from "./time-zone";

const member = { staffProfileId: "staff-1" };
const none: Omit<StaffAvailabilityInputs, "schedules"> = {
  blackouts: [],
  timeOff: [],
  commitments: [],
};

function weekdays(
  startMinute: number,
  endMinute: number,
  days = [0, 1, 2, 3, 4, 5, 6],
) {
  return days.map((weekday) => ({ weekday, startMinute, endMinute }));
}

function schedule(
  overrides: Partial<StaffAvailabilitySchedule> = {},
): StaffAvailabilitySchedule {
  return {
    id: "schedule-1",
    status: "active",
    effectiveFrom: "2026-01-01",
    timezone: "UTC",
    windows: weekdays(9 * 60, 17 * 60),
    ...overrides,
  };
}

function expectPartition(result: AvailabilityResult) {
  const all = [
    ...result.free.map((interval) => ({ ...interval, free: true })),
    ...result.busy.map((interval) => ({ ...interval, free: false })),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  expect(all[0]?.startsAt).toBe(result.range.startsAt);
  expect(all.at(-1)?.endsAt).toBe(result.range.endsAt);
  for (let index = 0; index < all.length; index += 1) {
    const interval = all[index]!;
    expect(Date.parse(interval.endsAt)).toBeGreaterThan(
      Date.parse(interval.startsAt),
    );
    if (index > 0) expect(interval.startsAt).toBe(all[index - 1]!.endsAt);
  }
}

describe("availabilityFor: weekly windows", () => {
  it("is free inside windows and busy outside, with reasons", () => {
    const result = availabilityFor(
      member,
      {
        startsAt: "2026-12-07T00:00:00.000Z",
        endsAt: "2026-12-08T00:00:00.000Z",
      },
      { schedules: [schedule()], ...none },
    );
    expect(result.free).toEqual([
      {
        startsAt: "2026-12-07T09:00:00.000Z",
        endsAt: "2026-12-07T17:00:00.000Z",
        scheduleId: "schedule-1",
      },
    ]);
    expect(result.busy.map((interval) => interval.reason)).toEqual([
      "outside-hours",
      "outside-hours",
    ]);
    expectPartition(result);
  });

  it("supports several windows a day with minute precision", () => {
    const result = availabilityFor(
      member,
      {
        startsAt: "2026-12-08T00:00:00.000Z",
        endsAt: "2026-12-09T00:00:00.000Z",
      },
      {
        schedules: [
          schedule({
            windows: [
              { weekday: 2, startMinute: 7 * 60 + 5, endMinute: 9 * 60 },
              { weekday: 2, startMinute: 15 * 60, endMinute: 20 * 60 + 45 },
            ],
          }),
        ],
        ...none,
      },
    );
    expect(
      result.free.map((interval) => [interval.startsAt, interval.endsAt]),
    ).toEqual([
      ["2026-12-08T07:05:00.000Z", "2026-12-08T09:00:00.000Z"],
      ["2026-12-08T15:00:00.000Z", "2026-12-08T20:45:00.000Z"],
    ]);
  });

  it("runs a window past midnight into the next day", () => {
    const result = availabilityFor(
      member,
      {
        startsAt: "2026-12-11T18:00:00.000Z",
        endsAt: "2026-12-12T06:00:00.000Z",
      },
      {
        schedules: [
          schedule({
            windows: [{ weekday: 5, startMinute: 20 * 60, endMinute: 2 * 60 }],
          }),
        ],
        ...none,
      },
    );
    expect(result.free).toHaveLength(1);
    expect(result.free[0]).toMatchObject({
      startsAt: "2026-12-11T20:00:00.000Z",
      endsAt: "2026-12-12T02:00:00.000Z",
    });
  });

  it("uses the club's time zone for wall-clock windows", () => {
    const result = availabilityFor(
      member,
      {
        startsAt: "2026-07-06T00:00:00.000Z",
        endsAt: "2026-07-07T00:00:00.000Z",
      },
      { schedules: [schedule({ timezone: "America/Los_Angeles" })], ...none },
    );
    // 09:00–17:00 PDT is 16:00–24:00 UTC.
    expect(result.free[0]).toMatchObject({
      startsAt: "2026-07-06T16:00:00.000Z",
      endsAt: "2026-07-07T00:00:00.000Z",
    });
  });

  it("is busy with no-schedule when nothing is in force", () => {
    const result = availabilityFor(
      member,
      {
        startsAt: "2025-06-01T00:00:00.000Z",
        endsAt: "2025-06-02T00:00:00.000Z",
      },
      { schedules: [schedule()], ...none },
    );
    expect(result.free).toEqual([]);
    expect(result.busy).toEqual([
      expect.objectContaining({ reason: "no-schedule" }),
    ]);
  });
});

describe("availabilityFor: schedule changeover", () => {
  const term = schedule({
    id: "term",
    effectiveFrom: "2026-09-01",
    effectiveTo: "2026-12-18",
    windows: weekdays(15 * 60, 19 * 60),
  });
  const holidays = schedule({
    id: "holidays",
    effectiveFrom: "2026-12-19",
    windows: weekdays(8 * 60, 12 * 60),
  });
  const fallback = schedule({
    id: "fallback",
    status: "fallback",
    effectiveFrom: "2020-01-01",
    windows: weekdays(10 * 60, 11 * 60),
  });

  it("switches on the successor's first day", () => {
    const result = availabilityFor(
      member,
      {
        startsAt: "2026-12-18T00:00:00.000Z",
        endsAt: "2026-12-20T00:00:00.000Z",
      },
      { schedules: [holidays, term], ...none },
    );
    expect(
      result.free.map((interval) => [interval.scheduleId, interval.startsAt]),
    ).toEqual([
      ["term", "2026-12-18T15:00:00.000Z"],
      ["holidays", "2026-12-19T08:00:00.000Z"],
    ]);
  });

  it("falls back when no active schedule covers the date; drafts and archives never count", () => {
    const draft = schedule({
      id: "draft",
      status: "draft",
      effectiveFrom: "2026-01-01",
    });
    const archived = schedule({ id: "archived", status: "archived" });
    expect(
      scheduleInForce([term, fallback, draft, archived], "2026-08-01")?.id,
    ).toBe("fallback");
    expect(scheduleInForce([term, fallback], "2026-10-01")?.id).toBe("term");
    expect(scheduleInForce([draft, archived], "2026-10-01")).toBeUndefined();
  });

  it("lets an overnight window finish after its schedule ends", () => {
    const night = schedule({
      id: "night",
      effectiveFrom: "2026-12-01",
      effectiveTo: "2026-12-11",
      windows: [{ weekday: 5, startMinute: 22 * 60, endMinute: 60 }],
    });
    const result = availabilityFor(
      member,
      {
        startsAt: "2026-12-11T21:00:00.000Z",
        endsAt: "2026-12-12T03:00:00.000Z",
      },
      { schedules: [night], ...none },
    );
    expect(result.free[0]).toMatchObject({
      startsAt: "2026-12-11T22:00:00.000Z",
      endsAt: "2026-12-12T01:00:00.000Z",
    });
  });
});

describe("availabilityFor: daylight saving", () => {
  const newYork = schedule({ timezone: "America/New_York" });

  it("keeps wall-clock windows across spring forward and fall back", () => {
    for (const date of [
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-11-01",
    ]) {
      const start = wallTimeToInstant(date, 0, "America/New_York");
      const end = wallTimeToInstant(date, 24 * 60, "America/New_York");
      const result = availabilityFor(
        member,
        {
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
        },
        { schedules: [newYork], ...none },
      );
      expect(result.free).toHaveLength(1);
      expect(freeMinutes(result)).toBe(8 * 60);
      expect(
        localDateOf(Date.parse(result.free[0]!.startsAt), "America/New_York"),
      ).toBe(date);
      expectPartition(result);
    }
  });

  it("counts the real length of a window that spans the change", () => {
    const overnight = schedule({
      timezone: "America/New_York",
      windows: weekdays(0, 24 * 60),
    });
    const spring = availabilityFor(
      member,
      {
        startsAt: "2026-03-08T00:00:00.000Z",
        endsAt: "2026-03-10T00:00:00.000Z",
      },
      { schedules: [overnight], ...none },
    );
    expect(spring.free).toHaveLength(1); // one continuous run across the change
    expect(freeMinutes(spring)).toBe(48 * 60);
    const result = availabilityFor(
      member,
      {
        startsAt: new Date(
          wallTimeToInstant("2026-11-01", 0, "America/New_York"),
        ).toISOString(),
        endsAt: new Date(
          wallTimeToInstant("2026-11-02", 0, "America/New_York"),
        ).toISOString(),
      },
      { schedules: [overnight], ...none },
    );
    expect(freeMinutes(result)).toBe(25 * 60);
  });

  it("starts a window that begins in the spring-forward gap when the clock resumes", () => {
    const gap = schedule({
      timezone: "America/New_York",
      windows: [{ weekday: 0, startMinute: 2 * 60 + 30, endMinute: 4 * 60 }],
    });
    const result = availabilityFor(
      member,
      {
        startsAt: "2026-03-08T00:00:00.000Z",
        endsAt: "2026-03-09T00:00:00.000Z",
      },
      { schedules: [gap], ...none },
    );
    // 02:30 does not exist; 03:30 EDT is 07:30 UTC; 04:00 EDT is 08:00 UTC.
    expect(result.free[0]).toMatchObject({
      startsAt: "2026-03-08T07:30:00.000Z",
      endsAt: "2026-03-08T08:00:00.000Z",
    });
    expect(
      zoneOffsetMs(Date.parse("2026-03-08T08:00:00.000Z"), "America/New_York"),
    ).toBe(-4 * 3_600_000);
  });

  it("uses the first 01:30 on the fall-back night", () => {
    expect(
      new Date(
        wallTimeToInstant("2026-11-01", 90, "America/New_York"),
      ).toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("availabilityFor: blackouts, time off and commitments", () => {
  const day = {
    startsAt: "2026-12-07T00:00:00.000Z",
    endsAt: "2026-12-08T00:00:00.000Z",
  };

  it("names every reason, primary first", () => {
    const result = availabilityFor(member, day, {
      schedules: [schedule()],
      blackouts: [
        {
          id: "b1",
          startsAt: "2026-12-07T10:00:00.000Z",
          endsAt: "2026-12-07T12:00:00.000Z",
        },
      ],
      timeOff: [
        {
          id: "t1",
          startsAt: "2026-12-07T11:00:00.000Z",
          endsAt: "2026-12-07T13:00:00.000Z",
          status: "approved",
        },
        {
          id: "t2",
          startsAt: "2026-12-07T14:00:00.000Z",
          endsAt: "2026-12-07T15:00:00.000Z",
          status: "requested",
        },
      ],
      commitments: [
        {
          id: "s1",
          kind: "session",
          startsAt: "2026-12-07T12:30:00.000Z",
          endsAt: "2026-12-07T13:30:00.000Z",
        },
      ],
    });
    const at = (time: string) =>
      result.busy.find(
        (interval) => interval.startsAt === `2026-12-07T${time}:00.000Z`,
      );
    expect(at("10:00")).toMatchObject({
      reason: "blackout",
      sourceIds: ["b1"],
    });
    expect(at("11:00")).toMatchObject({ reasons: ["time-off", "blackout"] });
    expect(at("12:30")).toMatchObject({ reasons: ["time-off", "commitment"] });
    expect(at("13:00")).toMatchObject({ reason: "commitment" });
    // Requested time off is not busy unless asked for.
    expect(
      result.free.some(
        (interval) => interval.startsAt === "2026-12-07T13:30:00.000Z",
      ),
    ).toBe(true);
    const tentative = availabilityFor(
      member,
      day,
      {
        schedules: [schedule()],
        blackouts: [],
        timeOff: [
          {
            id: "t2",
            startsAt: "2026-12-07T14:00:00.000Z",
            endsAt: "2026-12-07T15:00:00.000Z",
            status: "requested",
          },
        ],
        commitments: [],
      },
      { countRequestedTimeOff: true },
    );
    expect(
      tentative.busy.some((interval) => interval.reason === "time-off"),
    ).toBe(true);
  });

  it("repeats a yearly blackout on the same local dates", () => {
    const result = availabilityFor(
      member,
      {
        startsAt: "2027-12-25T00:00:00.000Z",
        endsAt: "2027-12-26T00:00:00.000Z",
      },
      {
        schedules: [schedule()],
        blackouts: [
          {
            id: "christmas",
            startsAt: "2026-12-25T00:00:00.000Z",
            endsAt: "2026-12-26T00:00:00.000Z",
            recurrence: "yearly",
            scope: "club",
          },
        ],
        timeOff: [],
        commitments: [],
      },
    );
    expect(result.free).toEqual([]);
    expect(result.busy[0]).toMatchObject({
      reason: "blackout",
      sourceIds: ["christmas"],
    });
  });

  it("ignores the session being re-staffed", () => {
    const inputs: StaffAvailabilityInputs = {
      schedules: [schedule()],
      blackouts: [],
      timeOff: [],
      commitments: [
        {
          id: "s1",
          kind: "session",
          startsAt: "2026-12-07T10:00:00.000Z",
          endsAt: "2026-12-07T11:00:00.000Z",
        },
      ],
    };
    const interval = {
      startsAt: "2026-12-07T10:00:00.000Z",
      endsAt: "2026-12-07T11:00:00.000Z",
    };
    expect(isFreeThroughout(member, interval, inputs)).toBe(false);
    expect(
      isFreeThroughout(member, interval, inputs, {
        ignoreCommitmentIds: ["s1"],
      }),
    ).toBe(true);
  });
});

const zones = ["UTC", "America/New_York", "Europe/Madrid", "Australia/Sydney"];
const base = Date.parse("2026-01-01T00:00:00.000Z");

const windowArb = fc.record({
  weekday: fc.integer({ min: 0, max: 6 }),
  startMinute: fc.integer({ min: 0, max: 1_439 }),
  endMinute: fc.integer({ min: 0, max: 1_440 }),
});
const spanArb = fc
  .tuple(
    fc.integer({ min: 0, max: 400 * 24 * 60 }),
    fc.integer({ min: 1, max: 5 * 24 * 60 }),
  )
  .map(([offset, length]) => ({
    startsAt: new Date(base + offset * 60_000).toISOString(),
    endsAt: new Date(base + (offset + length) * 60_000).toISOString(),
  }));
const inputsArb = fc.record({
  timezone: fc.constantFrom(...zones),
  windows: fc.array(windowArb, { maxLength: 10 }),
  blackouts: fc.array(spanArb, { maxLength: 4 }),
  commitments: fc.array(spanArb, { maxLength: 4 }),
  range: spanArb,
});

describe("availabilityFor: properties", () => {
  it("free and busy partition the range", () => {
    fc.assert(
      fc.property(inputsArb, (value) => {
        const result = availabilityFor(member, value.range, {
          schedules: [
            schedule({ timezone: value.timezone, windows: value.windows }),
          ],
          blackouts: value.blackouts.map((span, index) => ({
            id: `b${index}`,
            ...span,
          })),
          timeOff: [],
          commitments: value.commitments.map((span, index) => ({
            id: `c${index}`,
            kind: "session" as const,
            ...span,
          })),
        });
        expectPartition(result);
      }),
      { numRuns: 150 },
    );
  });

  it("adding a blackout never creates free time", () => {
    fc.assert(
      fc.property(inputsArb, spanArb, (value, extra) => {
        const inputs: StaffAvailabilityInputs = {
          schedules: [
            schedule({ timezone: value.timezone, windows: value.windows }),
          ],
          blackouts: value.blackouts.map((span, index) => ({
            id: `b${index}`,
            ...span,
          })),
          timeOff: [],
          commitments: [],
        };
        const before = availabilityFor(member, value.range, inputs);
        const after = availabilityFor(member, value.range, {
          ...inputs,
          blackouts: [...inputs.blackouts, { id: "extra", ...extra }],
        });
        expect(freeMinutes(after)).toBeLessThanOrEqual(freeMinutes(before));
        for (const interval of after.free) {
          const start = Date.parse(interval.startsAt);
          const end = Date.parse(interval.endsAt);
          expect(
            before.free.some(
              (candidate) =>
                Date.parse(candidate.startsAt) <= start &&
                Date.parse(candidate.endsAt) >= end,
            ) ||
              // A free run may have been split; check minute coverage instead.
              before.free
                .filter(
                  (candidate) =>
                    Date.parse(candidate.startsAt) < end &&
                    Date.parse(candidate.endsAt) > start,
                )
                .reduce(
                  (total, candidate) =>
                    total +
                    Math.min(end, Date.parse(candidate.endsAt)) -
                    Math.max(start, Date.parse(candidate.startsAt)),
                  0,
                ) ===
                end - start,
          ).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("a range split in two gives the same free minutes", () => {
    fc.assert(
      fc.property(
        inputsArb,
        fc.integer({ min: 1, max: 99 }),
        (value, percent) => {
          const inputs: StaffAvailabilityInputs = {
            schedules: [
              schedule({ timezone: value.timezone, windows: value.windows }),
            ],
            blackouts: [],
            timeOff: [],
            commitments: [],
          };
          const start = Date.parse(value.range.startsAt);
          const end = Date.parse(value.range.endsAt);
          const middle =
            start +
            Math.floor(((end - start) * percent) / 100 / 60_000) * 60_000;
          fc.pre(middle > start && middle < end);
          const whole = freeMinutes(
            availabilityFor(member, value.range, inputs),
          );
          const left = freeMinutes(
            availabilityFor(
              member,
              {
                startsAt: value.range.startsAt,
                endsAt: new Date(middle).toISOString(),
              },
              inputs,
            ),
          );
          const right = freeMinutes(
            availabilityFor(
              member,
              {
                startsAt: new Date(middle).toISOString(),
                endsAt: value.range.endsAt,
              },
              inputs,
            ),
          );
          expect(left + right).toBe(whole);
        },
      ),
      { numRuns: 100 },
    );
  });
});
