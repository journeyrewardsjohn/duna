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

  it("folds an after-the-fact result through the same score history", () => {
    const events: ScoreEvent[] = [
      { id: "recorded", type: "match-recorded", occurredAt: at },
      {
        id: "set-1",
        type: "set-score-recorded",
        setIndex: 0,
        a: 21,
        b: 18,
        occurredAt: at,
      },
      {
        id: "set-2",
        type: "set-score-recorded",
        setIndex: 1,
        a: 18,
        b: 21,
        occurredAt: at,
      },
      {
        id: "set-3",
        type: "set-score-recorded",
        setIndex: 2,
        a: 15,
        b: 13,
        occurredAt: at,
      },
    ];
    const state = foldScore(events, {
      ...standardBeachFormat,
      pointTargets: [21, 21, 15],
      recordingMode: "completed",
    });
    expect(state.status).toBe("complete");
    expect(state.winner).toBe("A");
    expect(state.sets).toMatchObject([
      { a: 21, b: 18, winner: "A" },
      { a: 18, b: 21, winner: "B" },
      { a: 15, b: 13, winner: "A" },
    ]);
  });

  it("tracks a player-aware serving rotation for larger teams", () => {
    const format = {
      ...standardBeachFormat,
      teamSize: 3,
      serviceOrder: {
        A: ["a-1", "a-2", "a-3"],
        B: ["b-1", "b-2", "b-3"],
      },
    } as const;
    const events: ScoreEvent[] = [
      {
        id: "start",
        type: "match-started",
        initialServer: "A",
        initialServerPersonId: "a-1",
        occurredAt: at,
      },
      { id: "1", type: "rally-won", winner: "B", occurredAt: at },
      { id: "2", type: "rally-won", winner: "A", occurredAt: at },
      { id: "3", type: "rally-won", winner: "B", occurredAt: at },
      { id: "4", type: "rally-won", winner: "A", occurredAt: at },
    ];
    expect(foldScore(events.slice(0, 1), format).serverPersonId).toBe("a-1");
    expect(foldScore(events.slice(0, 2), format).serverPersonId).toBe("b-1");
    expect(foldScore(events.slice(0, 3), format).serverPersonId).toBe("a-2");
    expect(foldScore(events.slice(0, 4), format).serverPersonId).toBe("b-2");
    expect(foldScore(events, format).serverPersonId).toBe("a-3");
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
