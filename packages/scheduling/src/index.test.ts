import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  scheduleTournament,
  solveAvailableSlots,
  validateManualMove,
} from "./index";

const dayStart = "2026-07-30T13:00:00.000Z";
const dayEnd = "2026-07-30T17:00:00.000Z";

describe("booking slot solver", () => {
  it("intersects coach, court, mode, buffers, and busy ranges", () => {
    const slots = solveAvailableSlots({
      coachId: "coach-1",
      courtIds: ["court-1"],
      durationMinutes: 60,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      incrementMinutes: 30,
      window: { startsAt: dayStart, endsAt: dayEnd },
      allowedModes: ["open", "private-lessons-only"],
      coachAvailability: [
        {
          id: "coach-window",
          resourceId: "coach-1",
          startsAt: dayStart,
          endsAt: dayEnd,
          mode: "private-lessons-only",
        },
      ],
      courtAvailability: [
        {
          id: "court-window",
          resourceId: "court-1",
          startsAt: dayStart,
          endsAt: dayEnd,
          mode: "open",
        },
      ],
      busyRanges: [
        {
          id: "booking",
          resourceId: "court-1",
          startsAt: "2026-07-30T14:30:00.000Z",
          endsAt: "2026-07-30T15:30:00.000Z",
          kind: "booking",
        },
      ],
    });
    expect(
      slots.some((slot) => slot.startsAt === "2026-07-30T14:00:00.000Z"),
    ).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("never emits overlapping slots for the same chosen start/court", () => {
    fc.assert(
      fc.property(fc.integer({ min: 15, max: 120 }), (durationMinutes) => {
        const slots = solveAvailableSlots({
          courtIds: ["c1"],
          durationMinutes,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          incrementMinutes: 15,
          window: { startsAt: dayStart, endsAt: dayEnd },
          allowedModes: ["open"],
          courtAvailability: [
            {
              id: "open",
              resourceId: "c1",
              startsAt: dayStart,
              endsAt: dayEnd,
              mode: "open",
            },
          ],
          busyRanges: [],
        });
        expect(new Set(slots.map((slot) => slot.startsAt)).size).toBe(
          slots.length,
        );
      }),
    );
  });
});

describe("tournament scheduler", () => {
  it("honors court occupancy and team rest", () => {
    const matches = [
      {
        id: "m1",
        divisionId: "open",
        teamIds: ["a", "b"] as const,
        durationMinutes: 45,
      },
      {
        id: "m2",
        divisionId: "open",
        teamIds: ["a", "c"] as const,
        durationMinutes: 45,
        dependsOnMatchIds: ["m1"],
      },
    ];
    const result = scheduleTournament({
      matches,
      courtWindows: [
        {
          courtId: "court-1",
          divisionIds: ["open"],
          startsAt: dayStart,
          endsAt: dayEnd,
        },
      ],
      minimumRestMinutes: 30,
    });
    expect(result.feasible).toBe(true);
    expect(
      new Date(result.matches[1]?.startsAt ?? 0).getTime() -
        new Date(result.matches[0]?.endsAt ?? 0).getTime(),
    ).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it("surfaces manual-move violations", () => {
    const violations = validateManualMove({
      schedule: [
        {
          matchId: "m1",
          courtId: "c1",
          startsAt: dayStart,
          endsAt: "2026-07-30T13:45:00.000Z",
        },
      ],
      matchRequests: [
        {
          id: "m1",
          divisionId: "open",
          teamIds: ["a", "b"],
          durationMinutes: 45,
        },
        {
          id: "m2",
          divisionId: "open",
          teamIds: ["a", "c"],
          durationMinutes: 45,
        },
      ],
      courtWindows: [
        {
          courtId: "c1",
          divisionIds: ["open"],
          startsAt: dayStart,
          endsAt: dayEnd,
        },
      ],
      minimumRestMinutes: 30,
      proposed: {
        matchId: "m2",
        courtId: "c1",
        startsAt: "2026-07-30T13:45:00.000Z",
        endsAt: "2026-07-30T14:30:00.000Z",
      },
    });
    expect(violations.some((value) => value.includes("rest"))).toBe(true);
  });
});
