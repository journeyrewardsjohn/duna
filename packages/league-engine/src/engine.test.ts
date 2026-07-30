import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createUndoEvent,
  foldScore,
  generateDoubleElimination,
  generateRoundRobin,
  generateSingleElimination,
  standardBeachFormat,
  type ScoreEvent,
  type SeededTeam,
} from "./index";

const at = "2026-07-30T12:00:00.000Z";

function teams(count: number): SeededTeam[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    seed: index + 1,
    name: `Team ${index + 1}`,
  }));
}

describe("score fold", () => {
  it("implements true sideout scoring", () => {
    const events: ScoreEvent[] = [
      {
        id: "start",
        type: "match-started",
        initialServer: "A",
        occurredAt: at,
      },
      { id: "1", type: "rally-won", winner: "B", occurredAt: at },
      { id: "2", type: "rally-won", winner: "B", occurredAt: at },
    ];
    const state = foldScore(events, {
      ...standardBeachFormat,
      scoringSystem: "sideout",
    });
    expect(state.sets[0]).toMatchObject({ a: 0, b: 1 });
    expect(state.serving).toBe("B");
  });

  it("supports unlimited event-sourced undo", () => {
    const events: ScoreEvent[] = [
      {
        id: "start",
        type: "match-started",
        initialServer: "A",
        occurredAt: at,
      },
      { id: "1", type: "rally-won", winner: "A", occurredAt: at },
      { id: "2", type: "rally-won", winner: "B", occurredAt: at },
    ];
    const undo = createUndoEvent(events, { id: "undo-1", occurredAt: at });
    expect(undo).toBeDefined();
    const state = foldScore(undo ? [...events, undo] : events);
    expect(state.sets[0]).toMatchObject({ a: 1, b: 0 });
  });
});

describe("bracket generators", () => {
  it("covers pathological single-elimination field sizes", () => {
    fc.assert(
      fc.property(fc.constantFrom(3, 5, 7, 11, 13, 63), (count) => {
        const bracket = generateSingleElimination({
          id: `field-${count}`,
          teams: teams(count),
        });
        expect(bracket.teams).toHaveLength(count);
        expect(bracket.matches.length).toBeGreaterThanOrEqual(count - 1);
        expect(new Set(bracket.matches.map((match) => match.id)).size).toBe(
          bracket.matches.length,
        );
      }),
    );
  });

  it("adds an if-necessary final for true reset", () => {
    const bracket = generateDoubleElimination({
      id: "open",
      teams: teams(8),
      variant: "true-reset",
    });
    expect(bracket.matches.some((match) => match.ifNecessary)).toBe(true);
  });

  it("schedules every round-robin pairing exactly once", () => {
    for (const count of [3, 4, 7, 8]) {
      const bracket = generateRoundRobin({
        id: `rr-${count}`,
        teams: teams(count),
      });
      expect(bracket.matches).toHaveLength((count * (count - 1)) / 2);
    }
  });
});
