import { describe, expect, it } from "vitest";
import { computedMatchNarrative } from "./service";

describe("computedMatchNarrative", () => {
  it("celebrates a win without inventing facts", () => {
    const narrative = computedMatchNarrative({
      id: "win",
      result: "win",
      expectedWinProbability: 0.38,
      pointShare: 0.52,
      ratingDelta: 0.08,
      sets: [
        { a: 21, b: 19 },
        { a: 18, b: 21 },
        { a: 15, b: 13 },
      ],
    });

    expect(narrative.source).toBe("computed");
    expect(narrative.summary).toContain("pre-match numbers");
  });

  it("frames a narrow loss constructively", () => {
    const narrative = computedMatchNarrative({
      id: "loss",
      result: "loss",
      expectedWinProbability: 0.51,
      pointShare: 0.49,
      ratingDelta: -0.01,
      sets: [
        { a: 19, b: 21 },
        { a: 21, b: 18 },
        { a: 13, b: 15 },
      ],
    });

    expect(narrative.summary).toContain("small margins");
    expect(narrative.summary.toLowerCase()).not.toContain("failure");
  });
});
