import { describe, expect, it } from "vitest";
import {
  createQuickPracticeBlock,
  normalizePracticeBlockTags,
  QUICK_PRACTICE_BLOCK_PRESETS,
} from "./training-practice-block-presets";

describe("practice builder quick blocks", () => {
  it("offers every lightweight block a coach needs", () => {
    expect(QUICK_PRACTICE_BLOCK_PRESETS.map((preset) => preset.label)).toEqual([
      "Drill block",
      "Team meeting",
      "Warmup",
      "Cool down",
      "Free play",
      "Custom",
    ]);
  });

  it("creates an editable custom block using the practice focus", () => {
    expect(
      createQuickPracticeBlock("custom", "Ball Control", "custom-block-id"),
    ).toMatchObject({
      localId: "custom-block-id",
      groupId: "custom-block-id",
      kind: "custom",
      title: "Name this block",
      durationMinutes: 10,
      transitionMinutes: 1,
      intensity: 5,
      focusArea: "Ball Control",
      tags: [],
      touchesTypical: 0,
      locked: false,
    });
  });

  it("gives free play game-like workload defaults", () => {
    expect(
      createQuickPracticeBlock(
        "free-play",
        "Offensive Systems",
        "free-play-id",
      ),
    ).toMatchObject({
      kind: "free-play",
      durationMinutes: 15,
      transitionMinutes: 2,
      intensity: 7,
      focusArea: "Offensive Systems",
      tags: ["Game-Like", "Decision Making"],
      touchesTypical: 52,
    });
  });

  it("standardizes, deduplicates, and bounds coach-entered tags", () => {
    expect(
      normalizePracticeBlockTags(
        "ball control, TEAM CULTURE, ball-control, serve receive",
      ),
    ).toEqual(["Ball Control", "Team Culture", "Serve Receive"]);
  });
});
