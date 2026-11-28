import { describe, expect, it } from "vitest";
import type { StaffAvailabilityInputs } from "./availability";
import {
  affectedCommitments,
  type CoverageCandidate,
  rankSubstitutes,
  scheduledMinutes,
} from "./coverage";
import {
  convertLegacyStaffAvailability,
  legacyAvailabilityInputs,
  toLegacyStaffAvailability,
} from "./legacy-staff-availability";

const allWeek = (startMinute: number, endMinute: number) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute, endMinute }));

function inputs(
  overrides: Partial<StaffAvailabilityInputs> = {},
): StaffAvailabilityInputs {
  return {
    schedules: [
      {
        id: "s",
        status: "active",
        effectiveFrom: "2026-01-01",
        timezone: "UTC",
        windows: allWeek(8 * 60, 20 * 60),
      },
    ],
    blackouts: [],
    timeOff: [],
    commitments: [],
    ...overrides,
  };
}

const session = {
  id: "session-1",
  startsAt: "2026-12-07T10:00:00.000Z",
  endsAt: "2026-12-07T11:30:00.000Z",
  venueId: "venue-1",
};

function candidate(
  id: string,
  overrides: Partial<CoverageCandidate> = {},
): CoverageCandidate {
  return {
    staffProfileId: id,
    displayName: id,
    inputs: inputs(),
    venueIdsThatDay: [],
    minutesThisWeek: 0,
    ...overrides,
  };
}

describe("rankSubstitutes", () => {
  it("ranks by qualified, venue, then fewer hours; leaves out the unavailable", () => {
    const ranked = rankSubstitutes({
      session,
      excludeStaffProfileIds: ["away"],
      candidates: [
        candidate("away"),
        candidate("busy", {
          inputs: inputs({
            commitments: [
              {
                id: "x",
                kind: "session",
                startsAt: "2026-12-07T11:00:00.000Z",
                endsAt: "2026-12-07T12:00:00.000Z",
              },
            ],
          }),
        }),
        candidate("not-qualified", { qualified: false }),
        candidate("over-max", { minutesThisWeek: 600, weeklyMaxMinutes: 620 }),
        candidate("light", { minutesThisWeek: 60 }),
        candidate("heavy", { minutesThisWeek: 600 }),
        candidate("at-venue", {
          minutesThisWeek: 900,
          venueIdsThatDay: ["venue-1"],
        }),
        candidate("qualified", { qualified: true, minutesThisWeek: 1_200 }),
      ],
    });
    expect(ranked.map((row) => row.staffProfileId)).toEqual([
      "qualified",
      "at-venue",
      "light",
      "heavy",
    ]);
    expect(ranked.map((row) => row.rank)).toEqual([0, 1, 2, 3]);
    expect(ranked[1]!.rationale).toBe(
      "Free for the whole session, already at this venue that day, 15 hours scheduled this week.",
    );
  });

  it("does not count the session itself as a clash", () => {
    const ranked = rankSubstitutes({
      session,
      candidates: [
        candidate("assigned", {
          inputs: inputs({
            commitments: [
              {
                id: session.id,
                kind: "session",
                startsAt: session.startsAt,
                endsAt: session.endsAt,
              },
            ],
          }),
        }),
      ],
    });
    expect(ranked).toHaveLength(1);
  });
});

describe("affectedCommitments and scheduledMinutes", () => {
  const commitments = [
    {
      id: "a",
      kind: "session" as const,
      startsAt: "2026-12-08T10:00:00.000Z",
      endsAt: "2026-12-08T11:00:00.000Z",
    },
    {
      id: "b",
      kind: "training-event" as const,
      startsAt: "2026-12-07T23:30:00.000Z",
      endsAt: "2026-12-08T00:30:00.000Z",
    },
    {
      id: "c",
      kind: "calendar" as const,
      startsAt: "2026-12-09T10:00:00.000Z",
      endsAt: "2026-12-09T11:00:00.000Z",
    },
  ];

  it("lists only what overlaps, in time order, of the kinds asked for", () => {
    expect(
      affectedCommitments({
        commitments,
        unavailable: {
          startsAt: "2026-12-08T00:00:00.000Z",
          endsAt: "2026-12-09T00:00:00.000Z",
        },
        kinds: ["session", "training-event"],
      }).map((row) => row.id),
    ).toEqual(["b", "a"]);
  });

  it("clips minutes to the week", () => {
    expect(
      scheduledMinutes(commitments, {
        startsAt: "2026-12-08T00:00:00.000Z",
        endsAt: "2026-12-09T00:00:00.000Z",
      }),
    ).toBe(90);
  });
});

describe("legacy staff availability", () => {
  const entries = [
    { weekday: 1, startsAt: "09:00", endsAt: "12:00" },
    { weekday: 3, startsAt: "15:00", endsAt: "19:30" },
    {
      weekday: 2,
      startsAt: "08:00",
      endsAt: "10:00",
      scheduleName: "Summer",
      effectiveFrom: "2027-06-01",
      effectiveTo: "2027-08-31",
    },
    {
      kind: "blackout",
      startsOn: "2026-12-24",
      startsAt: "00:00",
      endsOn: "2026-12-26",
      endsAt: "23:59",
    },
    { weekday: 9, startsAt: "nope", endsAt: "10:00" },
  ];

  it("keeps what clubs entered: undated windows as the fallback, dated as active", () => {
    const conversion = convertLegacyStaffAvailability({
      entries,
      timezone: "America/Los_Angeles",
      undatedEffectiveFrom: "2026-01-15",
    });
    expect(conversion.skipped).toBe(1);
    expect(conversion.schedules).toEqual([
      expect.objectContaining({
        name: "Summer",
        status: "active",
        effectiveFrom: "2027-06-01",
        effectiveTo: "2027-08-31",
      }),
      expect.objectContaining({
        name: "Weekly availability",
        status: "fallback",
        effectiveFrom: "2026-01-15",
        windows: [
          { weekday: 1, startMinute: 540, endMinute: 720 },
          { weekday: 3, startMinute: 900, endMinute: 1_170 },
        ],
      }),
    ]);
    expect(conversion.blackouts).toEqual([
      expect.objectContaining({
        startsAt: "2026-12-24T08:00:00.000Z",
        endsAt: "2026-12-27T07:59:00.000Z",
      }),
    ]);
    const asInputs = legacyAvailabilityInputs(conversion, "legacy:p1");
    expect(
      asInputs.schedules.every((schedule) =>
        schedule.id.startsWith("legacy:p1:"),
      ),
    ).toBe(true);
  });

  it("round-trips to the legacy shape the old editor reads", () => {
    const legacy = toLegacyStaffAvailability({
      timezone: "UTC",
      schedules: [
        {
          id: "s1",
          name: "Term",
          status: "active",
          effectiveFrom: "2026-09-01",
          timezone: "UTC",
          windows: [{ weekday: 5, startMinute: 20 * 60, endMinute: 2 * 60 }],
        },
      ],
      blackouts: [
        {
          startsAt: "2026-12-24T00:00:00.000Z",
          endsAt: "2026-12-25T00:00:00.000Z",
        },
      ],
    });
    expect(legacy).toEqual([
      {
        weekday: 5,
        startsAt: "20:00",
        endsAt: "23:59",
        scheduleId: "s1",
        scheduleName: "Term",
        effectiveFrom: "2026-09-01",
      },
      {
        weekday: 6,
        startsAt: "00:00",
        endsAt: "02:00",
        scheduleId: "s1",
        scheduleName: "Term",
        effectiveFrom: "2026-09-01",
      },
      {
        kind: "blackout",
        startsOn: "2026-12-24",
        startsAt: "00:00",
        endsAt: "23:59",
      },
    ]);
  });
});
