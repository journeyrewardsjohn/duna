import { describe, expect, it } from "vitest";
import {
  STANDARD_BEACH_COURT,
  buildCourtHeatmap,
  confidenceBand,
  formatSessionTimeUs,
  isSessionTimeUs,
} from "./video-analysis";

describe("Duna Vision analysis primitives", () => {
  it("keeps only visible, calibrated court observations in a heatmap", () => {
    const heatmap = buildCourtHeatmap({
      court: STANDARD_BEACH_COURT,
      observations: [
        {
          xMeters: 1,
          yMeters: 2,
          observed: "visible",
          confidence: 0.94,
        },
        {
          xMeters: 1.2,
          yMeters: 2.1,
          observed: "visible",
          source: "human",
        },
        {
          xMeters: 7.9,
          yMeters: 15.8,
          observed: "edge",
          confidence: 0.99,
        },
        {
          xMeters: 10,
          yMeters: 3,
          observed: "visible",
          confidence: 0.99,
        },
      ],
    });

    expect(heatmap.observedCount).toBe(2);
    expect(heatmap.cells[0]).toMatchObject({
      column: 0,
      row: 1,
      count: 2,
      confidence: "verified",
    });
    expect(heatmap.summary).toContain("2 visible ball landings");
  });

  it("keeps time and confidence claims bounded", () => {
    expect(isSessionTimeUs(43_200_000_000)).toBe(true);
    expect(isSessionTimeUs(43_200_000_001)).toBe(false);
    expect(confidenceBand(0.95)).toBe("high");
    expect(confidenceBand(0.75)).toBe("medium");
    expect(confidenceBand(undefined)).toBe("unavailable");
    expect(formatSessionTimeUs(3_661_000_000)).toBe("1:01:01");
  });
});
