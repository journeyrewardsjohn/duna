import { describe, expect, it } from "vitest";
import {
  ratingBacktestModelIds,
  runRatingBacktest,
  type RatingBacktestMatch,
} from "./backtest";

const matches: readonly RatingBacktestMatch[] = [
  {
    id: "later",
    occurredAt: "2024-01-08T12:00:00.000Z",
    teamA: ["a", "b"],
    teamB: ["c", "d"],
    setScores: [
      { a: 21, b: 12 },
      { a: 21, b: 14 },
    ],
  },
  {
    id: "first",
    occurredAt: "2024-01-01T12:00:00.000Z",
    teamA: ["a", "b"],
    teamB: ["c", "d"],
    setScores: [
      { a: 21, b: 18 },
      { a: 21, b: 17 },
    ],
  },
  {
    id: "third",
    occurredAt: "2024-01-15T12:00:00.000Z",
    teamA: ["a", "d"],
    teamB: ["b", "c"],
    setScores: [
      { a: 18, b: 21 },
      { a: 17, b: 21 },
    ],
  },
];

describe("walk-forward rating backtest", () => {
  it("sorts by event time and predicts before learning each result", () => {
    const report = runRatingBacktest(matches, new Date("2025-01-01T00:00:00Z"));
    expect(report.predictions.map((row) => row.matchId)).toEqual([
      "first",
      "later",
      "third",
    ]);
    expect(report.predictions[0]?.probabilities).toEqual({
      "even-prior": 0.5,
      "elo-team-average": 0.5,
      "elo-weak-link": 0.5,
      "duna-win-only": 0.5,
      "duna-score-aware": 0.5,
      "adaptive-ensemble": 0.5,
    });
    expect(
      report.predictions[1]!.probabilities["duna-score-aware"],
    ).toBeGreaterThan(0.5);
  });

  it("is deterministic and returns complete model diagnostics", () => {
    const first = runRatingBacktest(matches, new Date("2025-01-01T00:00:00Z"));
    const second = runRatingBacktest(matches, new Date("2025-01-01T00:00:00Z"));
    expect(first).toEqual(second);
    expect(first.models.map((model) => model.modelId)).toEqual(
      ratingBacktestModelIds,
    );
    for (const model of first.models) {
      expect(model.sampleSize).toBe(3);
      expect(model.brierScore).toBeGreaterThanOrEqual(0);
      expect(model.logLoss).toBeGreaterThanOrEqual(0);
      expect(model.areaUnderRocCurve).toBeGreaterThanOrEqual(0);
      expect(model.areaUnderRocCurve).toBeLessThanOrEqual(1);
    }
    expect(
      first.models.find((model) => model.modelId === "even-prior"),
    ).toMatchObject({ accuracy: 0.5, brierScore: 0.25 });
  });

  it("keeps ensemble weights normalized and based only on past outcomes", () => {
    const report = runRatingBacktest(matches);
    const firstWeights = report.predictions[0]!.ensembleWeights;
    expect(new Set(Object.values(firstWeights))).toEqual(new Set([0.2]));
    for (const prediction of report.predictions) {
      expect(
        Object.values(prediction.ensembleWeights).reduce(
          (sum, weight) => sum + weight,
          0,
        ),
      ).toBeCloseTo(1, 6);
    }
  });

  it("skips invalid dates and non-doubles records", () => {
    const report = runRatingBacktest([
      ...matches,
      { ...matches[0]!, id: "bad-date", occurredAt: "not-a-date" },
      {
        ...matches[0]!,
        id: "duplicate-player",
        teamA: ["a", "a"],
      },
    ]);
    expect(report.matches).toBe(3);
    expect(report.players).toBe(4);
  });
});
