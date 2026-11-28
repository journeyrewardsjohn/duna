/**
 * Practice plans (B4): totals, timeline checks (errors vs warnings) and
 * the proposal generator.
 */
import { describe, expect, it } from "vitest";
import {
  blockLoad,
  checkTimeline,
  planTotals,
  proposeBlocks,
  type TimelineBlock,
} from "./plan-timeline";

const block = (overrides: Partial<TimelineBlock>): TimelineBlock => ({
  sequence: 0,
  lane: "all",
  title: "Block",
  kind: "drill",
  startsAtMinute: 0,
  durationMinutes: 10,
  transitionMinutes: 0,
  intensity: 5,
  ...overrides,
});

describe("planTotals", () => {
  it("weights load by duration, sums estimates and splits work from rest", () => {
    const blocks = [
      block({ title: "Warm-up", kind: "warmup", durationMinutes: 15, intensity: 3, estimatedTouches: 20 }),
      block({ sequence: 1, title: "Serve-receive", focus: "Serve-receive", startsAtMinute: 15, durationMinutes: 30, intensity: 6, estimatedTouches: 120, estimatedJumps: 10, estimatedMetres: 300 }),
      block({ sequence: 2, title: "Games", kind: "free-play", startsAtMinute: 45, durationMinutes: 30, intensity: 7, transitionMinutes: 5 }),
    ];
    const totals = planTotals({ blocks, plannedMinutes: 90, targetLoad: 60 });
    expect(blockLoad(6)).toBe(55);
    expect(totals.load).toBe(Math.round((28 * 15 + 55 * 30 + 64 * 30) / 75));
    expect(totals).toMatchObject({
      minutes: 80,
      plannedMinutes: 90,
      targetLoad: 60,
      touches: 140,
      jumps: 10,
      metres: 300,
      workRestRatio: "1:0.3",
    });
    expect(totals.focusMix).toEqual([
      { focus: "Games", percent: 50 },
      { focus: "Serve-receive", percent: 50 },
    ]);
  });

  it("counts parallel lanes once on the timeline", () => {
    const totals = planTotals({
      blocks: [
        block({ lane: "Court 1", durationMinutes: 20, intensity: 6 }),
        block({ lane: "Court 2", durationMinutes: 20, intensity: 6 }),
        block({ sequence: 1, startsAtMinute: 20, durationMinutes: 20, intensity: 2, kind: "cool-down" }),
      ],
      plannedMinutes: 40,
    });
    expect(totals.workRestRatio).toBe("1:1");
  });

  it("caps block load at 100 and handles an empty plan", () => {
    expect(blockLoad(10)).toBe(92);
    expect(blockLoad(11)).toBe(100);
    expect(planTotals({ blocks: [], plannedMinutes: 0 })).toMatchObject({
      minutes: 0,
      plannedMinutes: 1,
      load: 0,
      workRestRatio: "0:1",
      focusMix: [],
    });
  });
});

describe("checkTimeline", () => {
  it("errors on a duplicate position in a lane and warns about overlaps and length", () => {
    const blocks = [
      block({ title: "A", durationMinutes: 30 }),
      block({ title: "B", startsAtMinute: 20, durationMinutes: 30 }),
    ];
    const result = checkTimeline(blocks, 45);
    expect(result.errors).toEqual(['Two blocks in "all" share position 1.']);
    expect(result.warnings).toEqual([
      '"B" starts before "A" ends in all.',
      "The plan runs 50 minutes; the session is 45.",
    ]);
  });

  it("warns, never errors, when a plan is much shorter than the session", () => {
    const result = checkTimeline([block({ durationMinutes: 30 })], 90);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(["The plan fills 30 of the session's 90 minutes."]);
  });

  it("errors past twelve hours", () => {
    expect(checkTimeline([block({ startsAtMinute: 700, durationMinutes: 30 })]).errors).toHaveLength(1);
  });
});

describe("proposeBlocks", () => {
  const drills = [
    { drillId: "d1", drillVersionId: "v1", title: "Serve-receive triangle", focus: "Serve-receive", durationMinutes: 15, intensity: 6, minPlayers: 3, touches: 120, jumps: 10, fromScene: true },
    { drillId: "d2", drillVersionId: "v2", title: "Block move", focus: "Blocking", durationMinutes: 20, intensity: 7, minPlayers: 2, touches: 40, jumps: 60, fromScene: false },
    { drillId: "d3", drillVersionId: "v3", title: "Six-a-side", focus: "Games", durationMinutes: 20, intensity: 7, minPlayers: 12, touches: 80, jumps: 20, fromScene: false },
  ];

  it("fills the session exactly: warm-up, matching drills first, games, cool-down", () => {
    const blocks = proposeBlocks({ durationMinutes: 90, athletes: 8, focus: "serve", drills });
    expect(blocks[0]).toMatchObject({ kind: "warmup", startsAtMinute: 0 });
    expect(blocks[1]).toMatchObject({ drillId: "d1", drillVersionId: "v1", estimateSource: "derived-from-scene" });
    expect(blocks.some((item) => item.drillId === "d3")).toBe(false); // needs 12 players
    expect(blocks.at(-1)).toMatchObject({ kind: "cool-down" });
    const end = blocks.at(-1)!.startsAtMinute + blocks.at(-1)!.durationMinutes;
    expect(end).toBe(90);
    expect(checkTimeline(blocks, 90)).toEqual({ errors: [], warnings: [] });
  });
});
