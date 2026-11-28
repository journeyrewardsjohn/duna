import { trainingDrillsDemoDetail } from "@duna/core/demo/training-drills";
import { trainingSceneExamples } from "@duna/core/training-scene";
import { describe, expect, it } from "vitest";
import { renderForTest } from "@/lib/render-for-test";
import { readScene, sceneDescription } from "./drill-model";
import {
  appendBlock,
  blockLoad,
  drillBlock,
  moveBlock,
  pinWords,
  planTotals,
  planWarnings,
  proposalBasis,
  QUICK_BLOCKS,
  quickBlock,
  setParallel,
  toSaveBlocks,
  updateBlock,
} from "./plan-model";
import { SceneSlot } from "./scene-slot";

const preset = (id: string) => QUICK_BLOCKS.find((block) => block.id === id)!;

function practice() {
  let blocks = appendBlock([], quickBlock(preset("warmup")));
  blocks = appendBlock(blocks, quickBlock(preset("serve-receive")));
  blocks = appendBlock(blocks, quickBlock(preset("side-out")), true);
  blocks = appendBlock(blocks, quickBlock(preset("games")));
  blocks = appendBlock(blocks, quickBlock(preset("cool-down")));
  return blocks;
}

describe("plan totals", () => {
  it("lays blocks on the timeline, parallel ones on their own courts", () => {
    const blocks = practice();
    expect(
      blocks.map((block) => [block.title, block.startsAtMinute, block.lane]),
    ).toEqual([
      ["Warm-up", 0, "all"],
      ["Serve-receive", 10, "Court 1"],
      ["Side-out", 10, "Court 2"],
      ["Games", 25, "all"],
      ["Cool-down", 45, "all"],
    ]);
  });

  it("computes load as the duration-weighted mean of intensity × 9.2", () => {
    const totals = planTotals({
      blocks: practice(),
      plannedMinutes: 60,
      targetLoad: 50,
    });
    expect(blockLoad(6)).toBe(55);
    expect(totals.minutes).toBe(52);
    // (28·10 + 55·15 + 64·15 + 64·20 + 9·7) / 67
    expect(totals.load).toBe(51);
    expect(totals.touches).toBe(22 + 36 + 40 + 52);
    expect(totals.jumps).toBe(4 + 8 + 14 + 14);
    expect(totals.focusMix.map((row) => row.focus)).toEqual([
      "Games",
      "Serve-receive",
      "Side-out",
    ]);
  });

  it("warns, never errors, about length, target load, warm-up and cool-down", () => {
    const blocks = practice();
    expect(
      planWarnings({ blocks, plannedMinutes: 60, targetLoad: 50 }),
    ).toEqual(["8 min of the 60-minute practice are not planned yet."]);
    expect(
      planWarnings({ blocks, plannedMinutes: 45, targetLoad: 70 }),
    ).toEqual([
      "Runs 7 min over the 45-minute practice.",
      "Load 51 is 19 under the target 70 (estimate): lengthen a drill or add game time.",
    ]);
    const games = moveBlock(blocks, blocks[0]!.key, 1);
    expect(planWarnings({ blocks: games, plannedMinutes: 52 })).toContain(
      "The practice doesn't start with a warm-up.",
    );
  });

  it("rescales assumed estimates with the minutes and keeps a coach's own", () => {
    const blocks = practice();
    const longer = updateBlock(blocks, blocks[1]!.key, { durationMinutes: 30 });
    expect(longer[1]!.estimatedTouches).toBe(72);
    const edited = updateBlock(longer, longer[1]!.key, {
      estimatedTouches: 40,
    });
    expect(edited[1]!.estimateSource).toBe("coach-edited");
    const shorter = updateBlock(edited, edited[1]!.key, {
      durationMinutes: 10,
    });
    expect(shorter[1]!.estimatedTouches).toBe(40);
    expect(
      updateBlock(blocks, blocks[0]!.key, { intensity: 10 })[0]!.plannedLoad,
    ).toBe(92);
  });

  it("runs a block on its own again and saves only the contract's fields", () => {
    const blocks = practice();
    const alone = setParallel(blocks, blocks[2]!.key, false);
    expect(alone.map((block) => block.lane)).toEqual([
      "all",
      "all",
      "all",
      "all",
      "all",
    ]);
    const saved = toSaveBlocks(alone);
    expect(Object.keys(saved[0]!)).not.toContain("key");
    expect(Object.keys(saved[0]!)).not.toContain("ratePerMinute");
  });
});

describe("version pinning display", () => {
  it("names the pinned version and says when a newer one exists", () => {
    expect(pinWords({ pinnedVersion: 3, currentVersion: 3 })).toEqual({
      label: "Version 3",
      newer: false,
    });
    expect(pinWords({ pinnedVersion: 2, currentVersion: 3 })).toEqual({
      label: "Version 2 · a newer version (3) exists",
      newer: true,
    });
    expect(pinWords({})).toBeUndefined();
  });

  it("pins a library drill to its current version with the drawing's estimates", () => {
    const block = drillBlock({
      ...trainingDrillsDemoDetail,
      perRep: { touches: 4, jumps: 1 },
    });
    expect(block.drillVersionId).toBe(
      trainingDrillsDemoDetail.currentVersionId,
    );
    expect(block.pinnedVersion).toBe(3);
    expect(block.estimateSource).toBe("derived-from-scene");
  });
});

describe("Duna's proposal and the scene slot", () => {
  it("says what a proposal is based on", () => {
    expect(
      proposalBasis({
        focus: "Serve-receive",
        durationMinutes: 90,
        assumptions: {
          athletes: 12,
          courts: 2,
          ballsPerCourt: 3,
          level: "Intermediate",
          targetLoad: 62,
        },
      }),
    ).toBe(
      'focus "Serve-receive", 90 minutes, 12 athletes on 2 courts, 3 balls a court, level Intermediate, target load 62',
    );
  });

  it("describes a drawing in words with its steps, through the shared scene module", () => {
    const example = trainingSceneExamples[0]!;
    const resolved = readScene(example).resolved!;
    expect(sceneDescription(resolved, example)).toContain("on a beach court");
    const rendered = renderForTest(SceneSlot, {
      scene: example,
      mode: "diagram",
      label: "Serve receive",
      step: 1,
    });
    expect(rendered.elements("figure").length).toBe(1);
    expect(rendered.text).toContain("Serve receive");
    const invalid = renderForTest(SceneSlot, {
      scene: { schema: "nope" },
      mode: "diagram",
      label: "Bad",
    });
    expect(invalid.text).toContain("This drawing has a problem");
    const empty = renderForTest(SceneSlot, {
      scene: undefined,
      mode: "player",
      label: "None",
    });
    expect(empty.text).toContain("No drawing yet");
  });
});
