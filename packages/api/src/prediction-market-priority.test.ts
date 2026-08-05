import { describe, expect, it } from "vitest";
import { comparePredictionMakerPriority } from "./prediction-market";

describe("prediction liquidity priority", () => {
  it("chooses the best execution price before liquidity source", () => {
    const candidates = [
      {
        id: "direct-sale",
        sidePriceBps: 2_000,
        createdAt: new Date("2026-08-05T12:00:00.000Z"),
      },
      {
        id: "paired-contract",
        sidePriceBps: 1_500,
        createdAt: new Date("2026-08-05T12:01:00.000Z"),
      },
    ].sort(comparePredictionMakerPriority);

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "paired-contract",
      "direct-sale",
    ]);
  });

  it("uses time and then id to deterministically break equal-price ties", () => {
    const candidates = [
      {
        id: "c",
        sidePriceBps: 2_000,
        createdAt: new Date("2026-08-05T12:01:00.000Z"),
      },
      {
        id: "b",
        sidePriceBps: 2_000,
        createdAt: new Date("2026-08-05T12:00:00.000Z"),
      },
      {
        id: "a",
        sidePriceBps: 2_000,
        createdAt: new Date("2026-08-05T12:00:00.000Z"),
      },
    ].sort(comparePredictionMakerPriority);

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
