import { describe, expect, it } from "vitest";
import {
  netScoreState,
  type MatchStatus,
  type NetScoreInput,
  type NetScoreStatus,
} from "./score";

const ALL: ReadonlyArray<MatchStatus> = [
  "scheduled",
  "warmup",
  "live",
  "pending-verification",
  "verified",
  "disputed",
  "complete",
  "forfeit",
  "cancelled",
];

const twoSets = [
  { home: 21, away: 18 },
  { home: 21, away: 15 },
];

describe("netScoreState", () => {
  it("covers every match_status value plus not-finished", () => {
    for (const status of [...ALL, "not-finished" as const]) {
      const state = netScoreState({ status, sets: twoSets });
      expect(state.status).toBe(status);
      expect(state.statusLabelKey).toBe(`netScore.status.${status}`);
      expect(state.accessibleSummary.length).toBeGreaterThan(0);
    }
  });

  it("scheduled, warmup and cancelled show no numbers, never 0-0", () => {
    for (const status of ["scheduled", "warmup", "cancelled"] as const) {
      const state = netScoreState({ status, sets: [{ home: 0, away: 0 }] });
      expect(state.headline).toEqual({ kind: "none" });
      expect(state.rows).toEqual([]);
      expect(state.winner).toBeNull();
      expect(state.setsWon).toBeNull();
      expect(state.liveLabel).toBeNull();
    }
    expect(
      netScoreState({ status: "scheduled", sets: [] }).accessibleSummary,
    ).toBe("Scheduled. Score pending.");
    expect(
      netScoreState({ status: "warmup", sets: [] }).accessibleSummary,
    ).toBe("Warm-up. Score pending.");
    expect(
      netScoreState({ status: "cancelled", sets: [] }).accessibleSummary,
    ).toBe("Cancelled.");
  });

  it("live: one set won and 17-14 in play gives sets 1-0 and headline 17-14", () => {
    const state = netScoreState({
      status: "live",
      sets: [
        { home: 21, away: 18 },
        { home: 17, away: 14 },
      ],
      serving: "away",
    });
    expect(state.setsWon).toEqual({ home: 1, away: 0 });
    expect(state.headline).toEqual({ kind: "points", home: 17, away: 14 });
    expect(state.rows.map((r) => r.state)).toEqual(["finished", "in-progress"]);
    expect(state.rows[1]?.winningSide).toBeNull();
    expect(state.winner).toBeNull();
    expect(state.winnerBadge).toBeNull();
    expect(state.serving).toBe("away");
    expect(state.liveLabel).toEqual({
      kind: "live",
      setNumber: 2,
      points: { home: 17, away: 14 },
    });
    expect(state.accessibleSummary).toBe(
      "Live. Home 17, Away 14. Sets won Home 1, Away 0. Away serving.",
    );
  });

  it("live: 20-19 then 25-23 still in play counts neither set", () => {
    const state = netScoreState({
      status: "live",
      sets: [
        { home: 20, away: 19, finished: false },
        { home: 25, away: 23, finished: false },
      ],
    });
    // Only the last set is the open one by default; explicit flags win.
    expect(state.setsWon).toEqual({ home: 0, away: 0 });
    expect(state.rows.every((r) => r.winningSide === null)).toBe(true);
    const defaulted = netScoreState({
      status: "live",
      sets: [
        { home: 20, away: 19 },
        { home: 25, away: 23 },
      ],
    });
    // Default: the earlier set is finished, the last is in progress.
    expect(defaulted.setsWon).toEqual({ home: 1, away: 0 });
    expect(defaulted.headline).toEqual({ kind: "points", home: 25, away: 23 });
  });

  it("live with every set marked finished falls back to sets won", () => {
    const state = netScoreState({
      status: "live",
      sets: [{ home: 21, away: 10, finished: true }],
    });
    expect(state.headline).toEqual({ kind: "sets", home: 1, away: 0 });
    expect(state.liveLabel).toEqual({
      kind: "live",
      setNumber: 1,
      points: null,
    });
    expect(state.accessibleSummary).toBe("Live. Home 1, Away 0.");
  });

  it("live with no sets recorded has no headline and no points", () => {
    const state = netScoreState({ status: "live", sets: [] });
    expect(state.headline).toEqual({ kind: "none" });
    expect(state.setsWon).toBeNull();
    expect(state.liveLabel).toEqual({
      kind: "live",
      setNumber: 1,
      points: null,
    });
    expect(state.accessibleSummary).toBe("Live. No points recorded yet.");
  });

  it("not-finished 21-18, 9-7 gives sets 1-0 with no winner", () => {
    const state = netScoreState({
      status: "not-finished",
      sets: [
        { home: 21, away: 18 },
        { home: 9, away: 7 },
      ],
    });
    expect(state.headline).toEqual({ kind: "sets", home: 1, away: 0 });
    expect(state.rows.map((r) => r.state)).toEqual(["finished", "unfinished"]);
    expect(state.winner).toBeNull();
    expect(state.winnerBadge).toBeNull();
    expect(state.liveLabel).toBeNull();
    expect(state.accessibleSummary).toBe(
      "Not finished. The match was stopped before the end. set 1 21 to 18, set 2 9 to 7. Sets won Home 1, Away 0.",
    );
  });

  it("verified match: winner, check badge, rows mark the winning number", () => {
    const state = netScoreState({
      status: "verified",
      sets: twoSets,
      names: { home: "Ana", away: "Bo" },
    });
    expect(state.headline).toEqual({ kind: "sets", home: 2, away: 0 });
    expect(state.winner).toBe("home");
    expect(state.winnerProvisional).toBe(false);
    expect(state.winnerBadge).toBe("check");
    expect(state.rows.map((r) => r.winningSide)).toEqual(["home", "home"]);
    expect(state.accessibleSummary).toBe(
      "Result verified. set 1 21 to 18, set 2 21 to 15. Sets won Ana 2, Bo 0. Ana won.",
    );
  });

  it("complete title match gets a trophy; the away side can win", () => {
    const state = netScoreState({
      status: "complete",
      isTitle: true,
      sets: [
        { home: 18, away: 21 },
        { home: 19, away: 21 },
      ],
    });
    expect(state.winner).toBe("away");
    expect(state.winnerBadge).toBe("trophy");
    expect(state.accessibleSummary).toContain("Away won the title.");
  });

  it("pending-verification: provisional winner, no badge", () => {
    const state = netScoreState({
      status: "pending-verification",
      sets: twoSets,
    });
    expect(state.winner).toBe("home");
    expect(state.winnerProvisional).toBe(true);
    expect(state.winnerBadge).toBeNull();
    expect(state.accessibleSummary).toContain("Home ahead, to be confirmed.");
  });

  it("pending-verification with no sets has no winner", () => {
    const state = netScoreState({ status: "pending-verification", sets: [] });
    expect(state.winner).toBeNull();
    expect(state.winnerProvisional).toBe(false);
    expect(state.headline).toEqual({ kind: "none" });
  });

  it("disputed shows the reported sets but names no winner", () => {
    const state = netScoreState({ status: "disputed", sets: twoSets });
    expect(state.headline).toEqual({ kind: "sets", home: 2, away: 0 });
    expect(state.winner).toBeNull();
    expect(state.accessibleSummary).toContain("Result disputed.");
  });

  it("forfeit with nothing played names the other side as winner", () => {
    const state = netScoreState({
      status: "forfeit",
      sets: [],
      forfeitedBy: "home",
    });
    expect(state.headline).toEqual({ kind: "none" });
    expect(state.rows).toEqual([]);
    expect(state.winner).toBe("away");
    expect(state.winnerBadge).toBe("check");
    expect(state.accessibleSummary).toBe("Forfeit. Away won.");
  });

  it("forfeit by the away side makes home the winner", () => {
    expect(
      netScoreState({ status: "forfeit", sets: [], forfeitedBy: "away" })
        .winner,
    ).toBe("home");
  });

  it("forfeit with nothing played and no forfeiting side has no winner", () => {
    const state = netScoreState({ status: "forfeit", sets: [] });
    expect(state.winner).toBeNull();
    expect(state.winnerBadge).toBeNull();
  });

  it("forfeit part-way derives the winner from sets won", () => {
    const state = netScoreState({
      status: "forfeit",
      sets: [{ home: 5, away: 21 }],
    });
    expect(state.winner).toBe("away");
  });

  it("a server-declared winner wins over the derived one", () => {
    const state = netScoreState({
      status: "complete",
      sets: twoSets,
      winner: "away",
    });
    expect(state.winner).toBe("away");
    // But a declared winner is ignored when no winner can be known.
    expect(
      netScoreState({ status: "disputed", sets: twoSets, winner: "away" })
        .winner,
    ).toBeNull();
  });

  it("a 28-26 set counts for the side with more points", () => {
    const state = netScoreState({
      status: "complete",
      sets: [
        { home: 28, away: 26 },
        { home: 21, away: 23 },
        { home: 15, away: 13 },
      ],
    });
    expect(state.rows.map((r) => r.winningSide)).toEqual([
      "home",
      "away",
      "home",
    ]);
    expect(state.headline).toEqual({ kind: "sets", home: 2, away: 1 });
    expect(state.winner).toBe("home");
  });

  it("a tied finished set counts for nobody", () => {
    const state = netScoreState({
      status: "complete",
      sets: [{ home: 10, away: 10 }],
    });
    expect(state.rows[0]?.winningSide).toBeNull();
    expect(state.winner).toBeNull();
  });

  it("best-of-one shows points as the headline, finished or live", () => {
    const done = netScoreState({
      status: "complete",
      bestOf: 1,
      sets: [{ home: 21, away: 17 }],
    });
    expect(done.headline).toEqual({ kind: "points", home: 21, away: 17 });
    expect(done.winner).toBe("home");
    const live = netScoreState({
      status: "live",
      bestOf: 1,
      sets: [{ home: 9, away: 11 }],
    });
    expect(live.headline).toEqual({ kind: "points", home: 9, away: 11 });
    expect(live.setsWon).toBeNull();
    expect(live.liveLabel).toEqual({
      kind: "live",
      setNumber: null,
      points: { home: 9, away: 11 },
    });
  });

  it("best-of-one with nothing recorded has no headline", () => {
    const state = netScoreState({ status: "live", bestOf: 1, sets: [] });
    expect(state.headline).toEqual({ kind: "none" });
  });

  it("serving is shown only while live", () => {
    expect(
      netScoreState({ status: "live", sets: twoSets, serving: "home" }).serving,
    ).toBe("home");
    expect(netScoreState({ status: "live", sets: twoSets }).serving).toBeNull();
    expect(
      netScoreState({ status: "complete", sets: twoSets, serving: "home" })
        .serving,
    ).toBeNull();
  });

  it("a long deuce set (40-38) is a normal set", () => {
    const state = netScoreState({
      status: "verified",
      sets: [{ home: 38, away: 40 }],
      bestOf: 1,
    });
    expect(state.rows[0]?.winningSide).toBe("away");
    expect(state.winner).toBe("away");
  });

  it("the accessible summary has no live set text beyond headline", () => {
    const state = netScoreState({
      status: "live",
      sets: [{ home: 3, away: 2 }],
    });
    expect(state.accessibleSummary).toBe("Live. Home 3, Away 2.");
    expect(state.setsWon).toEqual({ home: 0, away: 0 });
  });

  it("is deterministic and does not mutate its input", () => {
    const input: NetScoreInput = {
      status: "live",
      sets: [{ home: 1, away: 0 }],
    };
    const copy = JSON.stringify(input);
    expect(netScoreState(input)).toEqual(netScoreState(input));
    expect(JSON.stringify(input)).toBe(copy);
    const status: NetScoreStatus = "live";
    expect(status).toBe("live");
  });
});
