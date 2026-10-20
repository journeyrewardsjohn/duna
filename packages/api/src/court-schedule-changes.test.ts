import { describe, expect, it } from "vitest";
import {
  applyCourtScheduleChanges,
  courtScheduleVersion,
  type CourtScheduleWindow,
} from "./court-schedule-changes";

const week: CourtScheduleWindow[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  startsAtMinute: 480,
  endsAtMinute: 1320,
  mode: "rentals-only",
}));
const mornings: CourtScheduleWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startsAtMinute: 540,
  endsAtMinute: 720,
  mode: "blocked",
}));

describe("incremental court availability", () => {
  it("blocks weekday mornings and preserves weekends and the rest of each day", () => {
    const result = applyCourtScheduleChanges(week, mornings);
    expect(result).toHaveLength(17);
    expect(
      result.filter((block) => block.weekday === 0 || block.weekday === 6),
    ).toEqual([week[0], week[6]]);
    for (const weekday of [1, 2, 3, 4, 5]) {
      expect(result.filter((block) => block.weekday === weekday)).toEqual([
        {
          weekday,
          startsAtMinute: 480,
          endsAtMinute: 540,
          mode: "rentals-only",
        },
        { weekday, startsAtMinute: 540, endsAtMinute: 720, mode: "blocked" },
        {
          weekday,
          startsAtMinute: 720,
          endsAtMinute: 1320,
          mode: "rentals-only",
        },
      ]);
    }
    expect(week).toHaveLength(7);
  });

  it("preserves dates and hours outside a temporary block across a DST boundary", () => {
    const change = {
      ...mornings[0]!,
      effectiveFrom: "2026-10-26",
      effectiveTo: "2026-11-06",
    };
    const result = applyCourtScheduleChanges([week[1]!], [change]);
    expect(result).toEqual(
      expect.arrayContaining([
        { ...week[1], effectiveTo: "2026-10-25" },
        { ...week[1], effectiveFrom: "2026-11-07" },
        {
          ...week[1],
          effectiveFrom: "2026-10-26",
          effectiveTo: "2026-11-06",
          endsAtMinute: 540,
        },
        {
          ...week[1],
          effectiveFrom: "2026-10-26",
          effectiveTo: "2026-11-06",
          startsAtMinute: 720,
        },
        change,
      ]),
    );
  });

  it("keeps disjoint seasonal hours and removes all overlapping booking modes", () => {
    const seasonal = {
      ...week[1]!,
      effectiveFrom: "2027-01-01",
      effectiveTo: "2027-02-01",
    };
    expect(
      applyCourtScheduleChanges(
        [seasonal],
        [{ ...mornings[0]!, effectiveTo: "2026-12-31" }],
      ),
    ).toContainEqual(seasonal);
    const result = applyCourtScheduleChanges(
      [week[1]!, { ...week[1]!, mode: "members-only" }],
      [mornings[0]!],
    );
    expect(
      result.filter(
        (block) => block.startsAtMinute < 720 && block.endsAtMinute > 540,
      ),
    ).toEqual([mornings[0]]);
  });

  it("can reopen a blocked window without changing the other hours", () => {
    const blocked = applyCourtScheduleChanges(week, mornings);
    const result = applyCourtScheduleChanges(blocked, [
      { ...mornings[0]!, mode: "rentals-only" },
    ]);
    expect(
      result
        .filter((block) => block.mode === "blocked")
        .map((block) => block.weekday),
    ).toEqual([2, 3, 4, 5]);
  });

  it.each([
    [{ ...mornings[0]!, endsAtMinute: 540 }],
    [{ ...mornings[0]!, weekday: 7 }],
    [{ ...mornings[0]!, startsAtMinute: 1.5 }],
    [{ ...mornings[0]!, effectiveFrom: "2026-02-30" }],
    [
      {
        ...mornings[0]!,
        effectiveFrom: "2026-11-01",
        effectiveTo: "2026-10-31",
      },
    ],
    [mornings[0]!, { ...mornings[0]!, mode: "open" as const }],
  ])("rejects invalid or ambiguous windows: %j", (...changes) => {
    expect(() => applyCourtScheduleChanges(week, changes)).toThrow();
  });

  it("versions are stable across row order, and change for dates, hours or timezone", () => {
    const version = courtScheduleVersion(
      "America/New_York",
      ["schedule"],
      week,
    );
    expect(
      courtScheduleVersion(
        "America/New_York",
        ["schedule"],
        [...week].reverse(),
      ),
    ).toBe(version);
    expect(
      courtScheduleVersion("America/Los_Angeles", ["schedule"], week),
    ).not.toBe(version);
    expect(
      courtScheduleVersion(
        "America/New_York",
        ["schedule"],
        applyCourtScheduleChanges(week, mornings),
      ),
    ).not.toBe(version);
  });
});
