import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createInitialRating, displayFromMu, rateDoublesMatch } from "./index";

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
});
