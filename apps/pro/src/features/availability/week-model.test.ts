import { teamAvailabilityDemoSchedules } from "@duna/core/demo/team-availability";
import { describe, expect, it } from "vitest";
import type { ScheduleRow, WindowRow } from "./team-words";
import {
  blockProblem,
  blockSpokenLabel,
  blocksFromPattern,
  blocksFromWindows,
  clearDay,
  copyDay,
  draftSentence,
  nextRange,
  nudge,
  scheduleConflicts,
  schedulesAfter,
  sessionWhenWords,
  sessionsInSpan,
  wholeDaySpan,
  windowsFromBlocks,
  WEEK_PATTERNS,
  type MySession,
  type WeekBlock,
} from "./week-model";

const zone = "America/Los_Angeles";
const now = "2026-11-28T18:00:00.000Z"; // Saturday 10:00 in Los Angeles

const win = (
  weekday: number,
  startsAt: string,
  endsAt: string,
  extra: Partial<WindowRow> = {},
): WindowRow => ({
  id: `w-${weekday}-${startsAt}`,
  weekday,
  startsAt,
  endsAt,
  kind: "coaching",
  ...extra,
});

const schedule = (overrides: Partial<ScheduleRow>): ScheduleRow => ({
  id: "s-winter",
  staffProfileId: "me",
  name: "Winter term",
  status: "active",
  effectiveFrom: "2026-11-01",
  timezone: zone,
  windows: [],
  updatedAt: now,
  ...overrides,
});

const block = (
  weekday: number,
  start: number,
  end: number,
  key = `b-${weekday}-${start}`,
): WeekBlock => ({ key, weekday, start, end, kind: "coaching" });

describe("week blocks ↔ the API's windows", () => {
  it("round-trips every demo schedule exactly", () => {
    for (const row of teamAvailabilityDemoSchedules) {
      const blocks = blocksFromWindows(row.windows as readonly WindowRow[]);
      const back = windowsFromBlocks(blocks);
      const sorted = (windows: readonly Omit<WindowRow, "id">[]) =>
        [...windows]
          .map(({ weekday, startsAt, endsAt, kind, label }) =>
            JSON.stringify({ weekday, startsAt, endsAt, kind, label }),
          )
          .sort();
      expect(sorted(back)).toEqual(sorted(row.windows));
    }
  });

  it("keeps a window that ends at midnight or runs past it", () => {
    const blocks = blocksFromWindows([
      win(5, "18:00", "00:00"),
      win(6, "20:00", "02:00", { kind: "other", label: "Night league" }),
    ]);
    expect(blocks.map((b) => [b.weekday, b.start, b.end])).toEqual([
      [5, 1080, 1440],
      [6, 1200, 1560],
    ]);
    expect(windowsFromBlocks(blocks)).toEqual([
      { weekday: 5, startsAt: "18:00", endsAt: "00:00", kind: "coaching" },
      {
        weekday: 6,
        startsAt: "20:00",
        endsAt: "02:00",
        kind: "other",
        label: "Night league",
      },
    ]);
  });

  it("orders Monday first, then by start", () => {
    const blocks = blocksFromWindows([
      win(0, "09:00", "12:00"),
      win(1, "17:00", "20:00"),
      win(1, "07:00", "09:00"),
    ]);
    expect(blocks.map((b) => `${b.weekday}@${b.start}`)).toEqual([
      "1@420",
      "1@1020",
      "0@540",
    ]);
  });

  it("reads each block aloud the way VoiceOver should", () => {
    expect(blockSpokenLabel(block(1, 17 * 60, 21 * 60))).toBe(
      "Monday, 5 to 9 PM, coaching",
    );
    expect(blockSpokenLabel(block(2, 7 * 60 + 30, 12 * 60))).toBe(
      "Tuesday, 7:30 AM to 12 PM, coaching",
    );
    expect(
      blockSpokenLabel({
        ...block(6, 20 * 60, 26 * 60),
        kind: "juniors",
      }),
    ).toBe("Saturday, 8 PM to 2 AM the next day, juniors");
  });
});

describe("editing a day", () => {
  const week = [block(1, 900, 1200), block(1, 420, 540), block(3, 1020, 1260)];
  let counter = 0;
  const key = (weekday: number, index: number) =>
    `copy-${weekday}-${index}-${(counter += 1)}`;

  it("copies a day onto others, replacing what they had", () => {
    const copied = copyDay(week, 1, [3, 5, 1], key);
    const on = (weekday: number) =>
      copied.filter((b) => b.weekday === weekday).map((b) => [b.start, b.end]);
    expect(on(1)).toEqual([
      [420, 540],
      [900, 1200],
    ]);
    expect(on(3)).toEqual(on(1));
    expect(on(5)).toEqual(on(1));
    expect(new Set(copied.map((b) => b.key)).size).toBe(copied.length);
  });

  it("clears one day only", () => {
    expect(clearDay(week, 1).map((b) => b.weekday)).toEqual([3]);
  });

  it("names overlaps and impossible blocks", () => {
    expect(blockProblem(block(1, 1000, 1100, "x"), week)).toBe(
      "It overlaps Monday 3:00–8:00 PM.",
    );
    expect(blockProblem(block(2, 600, 600, "y"), week)).toBe(
      "A block must end after it starts.",
    );
    // Saturday night past midnight runs into Sunday morning.
    expect(
      blockProblem(block(6, 22 * 60, 26 * 60, "z"), [block(0, 60, 180)]),
    ).toBe("It overlaps Sunday 1:00–3:00 AM.");
    expect(blockProblem(block(2, 600, 700, "ok"), week)).toBeUndefined();
  });

  it("moves times in half hours and keeps the block inside a day", () => {
    const b = block(1, 17 * 60, 21 * 60);
    expect(nudge(b, "start", -1).start).toBe(16 * 60 + 30);
    expect(nudge(b, "end", 1).end).toBe(21 * 60 + 30);
    expect(nudge(b, "end", -100).end).toBe(17 * 60 + 30);
    expect(nudge({ ...b, start: 0 }, "start", -1).start).toBe(0);
  });

  it("restates a draft in the shared sentence", () => {
    const evenings = blocksFromPattern(WEEK_PATTERNS[0]!);
    expect(draftSentence({ blocks: evenings, timeZone: zone, now })).toBe(
      "Available Mon, Tue, Wed, Thu and Fri evenings",
    );
    expect(
      draftSentence({
        blocks: [
          block(1, 17 * 60, 21 * 60),
          block(3, 17 * 60, 21 * 60),
          block(6, 9 * 60, 12 * 60),
        ],
        timeZone: zone,
        now,
      }),
    ).toBe("Available Mon and Wed evenings, Sat mornings");
  });
});

describe("booked sessions a change leaves outside my hours", () => {
  const current = schedule({
    windows: [win(1, "15:00", "20:00"), win(3, "15:00", "20:00")],
  });
  // Monday 30 Nov 17:00–18:30 and Wednesday 2 Dec 17:00–18:30 in Los Angeles.
  const sessions: MySession[] = [
    {
      id: "mon",
      title: "Juniors clinic",
      startsAt: "2026-12-01T01:00:00.000Z",
      endsAt: "2026-12-01T02:30:00.000Z",
    },
    {
      id: "wed",
      title: "Private lesson",
      startsAt: "2026-12-03T01:00:00.000Z",
      endsAt: "2026-12-03T02:30:00.000Z",
    },
    {
      id: "past",
      title: "Yesterday",
      startsAt: "2026-11-27T01:00:00.000Z",
      endsAt: "2026-11-27T02:30:00.000Z",
    },
  ];

  it("lists sessions the edited week no longer covers, by the shared rule", () => {
    const blocks = blocksFromWindows(current.windows).filter(
      (b) => b.weekday !== 3,
    );
    const conflicts = scheduleConflicts({
      sessions,
      schedules: [current],
      change: {
        kind: "replace",
        scheduleId: current.id,
        effectiveFrom: current.effectiveFrom,
        blocks,
      },
      timeZone: zone,
      now,
    });
    expect(conflicts.map((c) => [c.id, c.newlyOutside])).toEqual([
      ["wed", true],
    ]);
  });

  it("a shorter block that still holds the session lists nothing", () => {
    const blocks = [
      block(1, 16 * 60, 19 * 60, "m"),
      block(3, 17 * 60, 18 * 60 + 30, "w"),
    ];
    expect(
      scheduleConflicts({
        sessions,
        schedules: [current],
        change: {
          kind: "replace",
          scheduleId: current.id,
          effectiveFrom: current.effectiveFrom,
          blocks,
        },
        timeZone: zone,
        now,
      }),
    ).toEqual([]);
  });

  it("a schedule starting on a date only touches sessions from that date", () => {
    const change = {
      kind: "start" as const,
      effectiveFrom: "2026-12-02",
      blocks: [block(1, 15 * 60, 20 * 60)],
    };
    const conflicts = scheduleConflicts({
      sessions,
      schedules: [current],
      change,
      timeZone: zone,
      now,
    });
    expect(conflicts.map((c) => c.id)).toEqual(["wed"]);
    // The earlier schedule ends the day before, as transitionSchedule does.
    const after = schedulesAfter([current], change, zone);
    expect(after.find((s) => s.id === current.id)?.effectiveTo).toBe(
      "2026-12-01",
    );
  });

  it("drafts never count, so saving one moves nothing", () => {
    expect(
      scheduleConflicts({
        sessions,
        schedules: [current],
        change: { kind: "draft" },
        timeZone: zone,
        now,
      }),
    ).toEqual([]);
  });

  it("judges in the place's wall clock across the daylight-saving change", () => {
    // Clocks go forward in Los Angeles on Sunday 14 March 2027.
    const spring = schedule({
      effectiveFrom: "2027-03-01",
      windows: [win(1, "17:00", "19:00")],
    });
    const mondayBefore: MySession = {
      id: "before",
      title: "Before",
      startsAt: "2027-03-09T01:00:00.000Z", // Mon 8 Mar 17:00 PST
      endsAt: "2027-03-09T03:00:00.000Z",
    };
    const mondayAfter: MySession = {
      id: "after",
      title: "After",
      startsAt: "2027-03-16T00:00:00.000Z", // Mon 15 Mar 17:00 PDT
      endsAt: "2027-03-16T02:00:00.000Z",
    };
    const shifted: MySession = {
      id: "utc-same",
      title: "Same UTC time",
      startsAt: "2027-03-16T01:00:00.000Z", // 18:00 PDT: runs past 19:00
      endsAt: "2027-03-16T03:00:00.000Z",
    };
    const conflicts = scheduleConflicts({
      sessions: [mondayBefore, mondayAfter, shifted],
      schedules: [],
      change: {
        kind: "start",
        effectiveFrom: "2027-03-01",
        blocks: blocksFromWindows(spring.windows),
      },
      timeZone: zone,
      now: "2027-03-01T12:00:00.000Z",
    });
    expect(conflicts.map((c) => c.id)).toEqual(["utc-same"]);
  });
});

describe("time away", () => {
  it("turns whole local days into the API's instants", () => {
    expect(wholeDaySpan("2026-12-12", "2026-12-13", zone)).toEqual({
      startsAt: "2026-12-12T08:00:00.000Z",
      endsAt: "2026-12-14T08:00:00.000Z",
    });
    // A single day; the order of the taps does not matter.
    expect(wholeDaySpan("2026-12-13", "2026-12-12", zone)).toEqual(
      wholeDaySpan("2026-12-12", "2026-12-13", zone),
    );
  });

  it("follows the clocks on daylight-saving days (23 and 25 hours)", () => {
    const spring = wholeDaySpan("2027-03-14", "2027-03-14", zone);
    expect(
      (Date.parse(spring.endsAt) - Date.parse(spring.startsAt)) / 3_600_000,
    ).toBe(23);
    const autumn = wholeDaySpan("2026-11-01", "2026-11-01", zone);
    expect(
      (Date.parse(autumn.endsAt) - Date.parse(autumn.startsAt)) / 3_600_000,
    ).toBe(25);
  });

  it("lists the booked sessions inside the days, soonest first", () => {
    const sessions: MySession[] = [
      {
        id: "b",
        title: "Clinic",
        startsAt: "2026-12-13T17:00:00.000Z",
        endsAt: "2026-12-13T18:00:00.000Z",
      },
      {
        id: "a",
        title: "Lesson",
        startsAt: "2026-12-12T17:00:00.000Z",
        endsAt: "2026-12-12T18:00:00.000Z",
      },
      {
        id: "out",
        title: "Later",
        startsAt: "2026-12-15T17:00:00.000Z",
        endsAt: "2026-12-15T18:00:00.000Z",
      },
    ];
    const span = wholeDaySpan("2026-12-12", "2026-12-13", zone);
    expect(sessionsInSpan(sessions, span, now).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("picks a range with two taps", () => {
    let range: { from: string | null; to: string | null } = {
      from: null,
      to: null,
    };
    range = nextRange(range, "2026-12-12");
    expect(range).toEqual({ from: "2026-12-12", to: null });
    range = nextRange(range, "2026-12-15");
    expect(range).toEqual({ from: "2026-12-12", to: "2026-12-15" });
    range = nextRange(range, "2026-12-20");
    expect(range).toEqual({ from: "2026-12-20", to: null });
    expect(nextRange(range, "2026-12-18")).toEqual({
      from: "2026-12-18",
      to: null,
    });
  });

  it("says a session's time in the place's time", () => {
    expect(
      sessionWhenWords(
        {
          startsAt: "2026-12-01T01:00:00.000Z",
          endsAt: "2026-12-01T02:30:00.000Z",
        },
        zone,
      ),
    ).toBe("Mon 30 Nov, 5:00–6:30 PM");
  });
});
