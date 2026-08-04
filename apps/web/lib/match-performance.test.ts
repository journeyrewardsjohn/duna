import type { MatchSummary, PersonSummary } from "@duna/core";
import { describe, expect, it } from "vitest";
import { buildMatchPerformance } from "./match-performance";

function person(
  id: string,
  displayName: string,
  initials: string,
): PersonSummary {
  return {
    id,
    displayName,
    handle: id,
    initials,
    homeMarket: "South Bay",
    rating: {
      display: 2.5,
      mu: 2.5,
      phi: 0.35,
      sigma: 0.06,
      confidence: "Reliable",
      discipline: "beach-2s",
    },
    roles: ["player"],
  };
}

const viewer = person("viewer", "John Sutton", "JS");
const partner = person("partner", "Phil D", "PD");
const opponentA = person("opponent-a", "Taylor C", "TC");
const opponentB = person("opponent-b", "Taylor S", "TS");

function match(
  overrides: Partial<MatchSummary> & Pick<MatchSummary, "id" | "playedAt">,
): MatchSummary {
  return {
    status: "verified",
    venueName: "Center Court",
    teamA: [viewer, partner],
    teamB: [opponentA, opponentB],
    score: [
      [21, 18],
      [21, 19],
    ],
    winner: "A",
    ratingDelta: 0.05,
    verification: "both-confirmed",
    ...overrides,
  };
}

describe("buildMatchPerformance", () => {
  it("orders rating history by played date rather than import order", () => {
    const performance = buildMatchPerformance(
      [
        match({
          id: "newer",
          playedAt: "2026-06-01T12:00:00.000Z",
          ratingBefore: 2.5,
          ratingAfter: 2.6,
        }),
        match({
          id: "older",
          playedAt: "2025-06-01T12:00:00.000Z",
          ratingBefore: 2.4,
          ratingAfter: 2.5,
        }),
      ],
      viewer.id,
      2.6,
    );

    expect(performance.rating.points.map(({ id }) => id)).toEqual([
      "older",
      "newer",
    ]);
    expect(performance.rating.netMovement).toBeCloseTo(0.2);
    expect(performance.rating.peak).toBe(2.6);
  });

  it("calculates cumulative result, set, and point-margin trends", () => {
    const performance = buildMatchPerformance(
      [
        match({
          id: "win",
          playedAt: "2026-01-01T12:00:00.000Z",
          score: [
            [21, 15],
            [21, 18],
          ],
        }),
        match({
          id: "loss",
          playedAt: "2026-02-01T12:00:00.000Z",
          teamA: [opponentA, opponentB],
          teamB: [viewer, partner],
          winner: "A",
          score: [
            [21, 19],
            [18, 21],
            [15, 12],
          ],
        }),
      ],
      viewer.id,
      2.5,
    );

    expect(performance.results).toMatchObject({
      wins: 1,
      losses: 1,
      lastTenRate: 50,
      bestStreak: 1,
    });
    expect(performance.results.points.at(-1)?.value).toBe(50);
    expect(performance.sets).toMatchObject({ won: 3, lost: 2 });
    expect(performance.sets.points.at(-1)?.value).toBe(60);
    expect(performance.margin.positiveMatches).toBe(1);
    expect(performance.margin.best).toBe(9);
    expect(performance.margin.average).toBeCloseTo(3.5);
  });

  it("keeps pending and disputed results out of competitive metrics", () => {
    const performance = buildMatchPerformance(
      [
        match({
          id: "pending",
          playedAt: "2026-01-01T12:00:00.000Z",
          status: "pending-verification",
          ratingAfter: 2.5,
        }),
      ],
      viewer.id,
      2.5,
    );

    expect(performance.rating.points).toHaveLength(1);
    expect(performance.results.points).toHaveLength(0);
    expect(performance.sets.points).toHaveLength(0);
    expect(performance.margin.points).toHaveLength(0);
  });
});
