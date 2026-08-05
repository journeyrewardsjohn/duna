import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  blendExternalPrior,
  createInitialRating,
  displayFromMu,
  evaluatePredictions,
  muFromDisplay,
  performanceEvidenceFromSetScores,
  professionalSeed,
  rateDoublesPerformance,
  rateDoublesMatch,
  worldRankingSignal,
} from "./index";

function player(playerId: string, mu: number, phi = 120) {
  return {
    state: createInitialRating({ playerId, mu, phi }),
  };
}

describe("Sand Rating engine", () => {
  it("pins the recreational and professional display anchors", () => {
    expect(displayFromMu(1500)).toBe(3);
    expect(displayFromMu(3300)).toBe(7.5);
  });

  it("is deterministic for an identical event", () => {
    const input = {
      teamA: [player("a1", 1680), player("a2", 1540)] as const,
      teamB: [player("b1", 1660), player("b2", 1600)] as const,
      setScores: [
        { a: 21, b: 17 },
        { a: 18, b: 21 },
        { a: 15, b: 12 },
      ],
      verificationWeight: 0.85,
    };
    expect(rateDoublesMatch(input)).toEqual(rateDoublesMatch(input));
  });

  it("derives replayable performance evidence from a verified score", () => {
    expect(
      performanceEvidenceFromSetScores([
        { a: 21, b: 17 },
        { a: 18, b: 21 },
        { a: 15, b: 12 },
      ]),
    ).toEqual({
      actualTeamA: 0.90384615,
      pointShareTeamA: 0.51923077,
      marginMultiplier: 1.01346154,
    });
  });

  it("replays stored performance evidence to the identical projection", () => {
    const input = {
      teamA: [player("a1", 1680), player("a2", 1540)] as const,
      teamB: [player("b1", 1660), player("b2", 1600)] as const,
      setScores: [
        { a: 21, b: 17 },
        { a: 18, b: 21 },
        { a: 15, b: 12 },
      ],
      verificationWeight: 0.85,
    };
    const rated = rateDoublesMatch(input);
    const evidence = rated.updates[0]!.explanation;
    const replayed = rateDoublesPerformance({
      teamA: input.teamA,
      teamB: input.teamB,
      actualTeamA: evidence.actualResult,
      pointShareTeamA: evidence.pointShare,
      marginMultiplier: evidence.marginMultiplier,
      repeatOpponentWeight: evidence.repeatOpponentWeight,
      verificationWeight: input.verificationWeight,
    });
    expect(replayed.expectedTeamA).toBe(rated.expectedTeamA);
    for (const [index, update] of replayed.updates.entries()) {
      expect(update.after.display).toBe(rated.updates[index]!.after.display);
      expect(update.after.phi).toBe(rated.updates[index]!.after.phi);
      expect(update.after.mu).toBeCloseTo(rated.updates[index]!.after.mu, 3);
    }
  });

  it("assigns the weaker partner more responsibility", () => {
    const result = rateDoublesMatch({
      teamA: [player("a-weak", 1400), player("a-strong", 1900)],
      teamB: [player("b1", 1600), player("b2", 1600)],
      setScores: [{ a: 21, b: 17 }],
      verificationWeight: 1,
    });
    expect(result.updates[0]?.explanation.responsibilityWeight).toBeGreaterThan(
      result.updates[1]?.explanation.responsibilityWeight ?? 1,
    );
  });

  it("does not rate forfeits or other zero-weight results", () => {
    const result = rateDoublesMatch({
      teamA: [player("a1", 1500), player("a2", 1500)],
      teamB: [player("b1", 1500), player("b2", 1500)],
      setScores: [{ a: 21, b: 0 }],
      verificationWeight: 0,
    });
    for (const update of result.updates) {
      expect(update.after.mu).toBe(update.before.mu);
    }
  });

  it("decays repeat-opponent influence", () => {
    const base = {
      teamA: [player("a1", 1500), player("a2", 1500)] as const,
      teamB: [player("b1", 1500), player("b2", 1500)] as const,
      setScores: [{ a: 21, b: 15 }],
      verificationWeight: 1,
    };
    const first = rateDoublesMatch(base);
    const ninth = rateDoublesMatch({
      ...base,
      previousPairMeetingsInWindow: 8,
    });
    expect(
      Math.abs(ninth.updates[0]?.explanation.appliedMuDelta ?? 0),
    ).toBeLessThan(Math.abs(first.updates[0]?.explanation.appliedMuDelta ?? 0));
  });

  it("keeps display values inside the public scale", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -10_000,
          max: 20_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (mu) => {
          const display = displayFromMu(mu);
          expect(display).toBeGreaterThanOrEqual(1);
          expect(display).toBeLessThanOrEqual(8);
        },
      ),
    );
  });

  it("round-trips public display values into the internal mean", () => {
    expect(displayFromMu(muFromDisplay(3))).toBe(3);
    expect(displayFromMu(muFromDisplay(7.5))).toBe(7.5);
  });

  it("uses external ratings only while Duna evidence is sparse", () => {
    const sparse = createInitialRating({ playerId: "sparse" });
    const blended = blendExternalPrior({
      state: sparse,
      prior: {
        source: "truvolley",
        display: 6,
        confidence: 0.9,
        evidenceMatches: 20,
      },
    });
    expect(blended.display).toBeGreaterThan(sparse.display);
    const mature = { ...sparse, ratedMatches: 20 };
    expect(
      blendExternalPrior({
        state: mature,
        prior: { source: "truvolley", display: 7, confidence: 1 },
      }),
    ).toEqual(mature);
  });

  it("keeps professional ranking as a separate display signal", () => {
    expect(worldRankingSignal(1)).toBe(700);
    expect(worldRankingSignal(50)).toBeLessThan(700);
    expect(professionalSeed({ playerId: "pro", source: "fivb" }).display).toBe(
      6.55,
    );
  });

  it("evaluates prediction accuracy, Brier score, and calibration", () => {
    const evaluation = evaluatePredictions([
      { expectedTeamA: 0.8, actualTeamA: 1 },
      { expectedTeamA: 0.3, actualTeamA: 0 },
      { expectedTeamA: 0.6, actualTeamA: 0 },
    ]);
    expect(evaluation.sampleSize).toBe(3);
    expect(evaluation.accuracy).toBeCloseTo(2 / 3, 4);
    expect(evaluation.brierScore).toBeCloseTo(0.1633, 4);
    expect(
      evaluation.calibration.reduce(
        (total, bucket) => total + bucket.predictions,
        0,
      ),
    ).toBe(3);
  });
});
