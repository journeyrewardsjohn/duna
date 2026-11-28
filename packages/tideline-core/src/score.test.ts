import { describe, expect, it } from "vitest";
import {
  BEACH_VOLLEYBALL_RULES,
  netScoreState,
  scoreAnnouncement,
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

const live = (
  sets: ReadonlyArray<{ home: number; away: number; finished?: boolean }>,
  extra: Partial<NetScoreInput> = {},
) =>
  netScoreState({
    status: "live",
    sets,
    rules: BEACH_VOLLEYBALL_RULES,
    bestOf: 3,
    ...extra,
  });

describe("set point and match point", () => {
  it("flags set point for the side one point from the set", () => {
    expect(live([{ home: 20, away: 18 }]).setPoint).toEqual(["home"]);
    expect(live([{ home: 18, away: 20 }]).setPoint).toEqual(["away"]);
    expect(live([{ home: 20, away: 19 }]).setPoint).toEqual(["home"]);
  });

  it("needs a two-point lead (win by two)", () => {
    expect(live([{ home: 20, away: 20 }]).setPoint).toEqual([]);
    expect(live([{ home: 24, away: 24 }]).setPoint).toEqual([]);
    expect(live([{ home: 25, away: 24 }]).setPoint).toEqual(["home"]);
    expect(live([{ home: 10, away: 5 }]).setPoint).toEqual([]);
  });

  it("flags match point only when that set also wins the match", () => {
    const first = live([{ home: 20, away: 18 }]);
    expect(first.setPoint).toEqual(["home"]);
    expect(first.matchPoint).toEqual([]);
    const second = live([
      { home: 21, away: 10 },
      { home: 20, away: 18 },
    ]);
    expect(second.matchPoint).toEqual(["home"]);
  });

  it("uses the deciding-set target for the last set", () => {
    const decider = live([
      { home: 21, away: 15 },
      { home: 15, away: 21 },
      { home: 14, away: 12 },
    ]);
    expect(decider.setPoint).toEqual(["home"]);
    expect(decider.matchPoint).toEqual(["home"]);
    const earlier = live([{ home: 14, away: 12 }]);
    expect(earlier.setPoint).toEqual([]);
  });

  it("falls back to the normal target when no deciding target is given", () => {
    const rules = { pointsToWin: 11 };
    const s = live(
      [
        { home: 11, away: 11 },
        { home: 11, away: 11 },
        { home: 10, away: 8 },
      ],
      {
        rules,
      },
    );
    expect(s.setPoint).toEqual(["home"]);
  });

  it("best-of-one: set point is match point", () => {
    const s = live([{ home: 20, away: 15 }], { bestOf: 1 });
    expect(s.setPoint).toEqual(["home"]);
    expect(s.matchPoint).toEqual(["home"]);
  });

  it("without bestOf there is set point but no match point", () => {
    const s = live([{ home: 20, away: 15 }], { bestOf: undefined });
    expect(s.setPoint).toEqual(["home"]);
    expect(s.matchPoint).toEqual([]);
  });

  it("a cap ends a set for both sides at once", () => {
    const s = live([{ home: 24, away: 24 }], {
      rules: { pointsToWin: 21, cap: 25 },
    });
    expect(s.setPoint).toEqual(["home", "away"]);
  });

  it("is empty when not live, without rules, or without an open set", () => {
    expect(
      netScoreState({
        status: "complete",
        sets: [{ home: 21, away: 10 }],
        rules: BEACH_VOLLEYBALL_RULES,
      }).setPoint,
    ).toEqual([]);
    expect(
      netScoreState({ status: "live", sets: [{ home: 20, away: 10 }] })
        .setPoint,
    ).toEqual([]);
    expect(live([{ home: 20, away: 10, finished: true }]).setPoint).toEqual([]);
  });
});

describe("scoreAnnouncement", () => {
  it("announces a point and nothing else", () => {
    const a = live([{ home: 17, away: 14 }]);
    const b = live([{ home: 18, away: 14 }]);
    expect(scoreAnnouncement(a, b)).toEqual([
      { kind: "point", side: "home", setNumber: 1, points: 1 },
    ]);
    const c = live([{ home: 18, away: 15 }]);
    expect(scoreAnnouncement(b, c)).toEqual([
      { kind: "point", side: "away", setNumber: 1, points: 1 },
    ]);
  });

  it("returns nothing for an unchanged pair", () => {
    const a = live([{ home: 17, away: 14 }], { serving: "home" });
    expect(scoreAnnouncement(a, a)).toEqual([]);
  });

  it("announces a serve change with the point", () => {
    const a = live([{ home: 17, away: 14 }], { serving: "home" });
    const b = live([{ home: 17, away: 15 }], { serving: "away" });
    expect(scoreAnnouncement(a, b)).toEqual([
      { kind: "point", side: "away", setNumber: 1, points: 1 },
      { kind: "serve-change", side: "away" },
    ]);
  });

  it("announces a set won, the point that won it, and the next set's first point", () => {
    const a = live([{ home: 20, away: 18 }]);
    const b = live([
      { home: 21, away: 18 },
      { home: 1, away: 0 },
    ]);
    expect(scoreAnnouncement(a, b)).toEqual([
      { kind: "point", side: "home", setNumber: 1, points: 1 },
      { kind: "point", side: "home", setNumber: 2, points: 1 },
      { kind: "set-won", side: "home", setNumber: 1 },
    ]);
  });

  it("does not repeat a set already won", () => {
    const a = live([
      { home: 21, away: 18 },
      { home: 3, away: 2 },
    ]);
    const b = live([
      { home: 21, away: 18 },
      { home: 4, away: 2 },
    ]);
    expect(scoreAnnouncement(a, b).map((p) => p.kind)).toEqual(["point"]);
  });

  it("announces newly arisen set point, once", () => {
    const a = live([{ home: 19, away: 18 }]);
    const b = live([{ home: 20, away: 18 }]);
    expect(scoreAnnouncement(a, b)).toEqual([
      { kind: "point", side: "home", setNumber: 1, points: 1 },
      { kind: "set-point", side: "home" },
    ]);
    const c = live([{ home: 20, away: 19 }]);
    expect(scoreAnnouncement(b, c).map((p) => p.kind)).toEqual(["point"]);
  });

  it("announces match point before the set point it contains", () => {
    const a = live([
      { home: 21, away: 10 },
      { home: 19, away: 18 },
    ]);
    const b = live([
      { home: 21, away: 10 },
      { home: 20, away: 18 },
    ]);
    expect(scoreAnnouncement(a, b).map((p) => p.kind)).toEqual([
      "point",
      "match-point",
      "set-point",
    ]);
  });

  it("does not repeat match point that is already on", () => {
    const a = live([
      { home: 21, away: 10 },
      { home: 20, away: 18 },
    ]);
    const b = live([
      { home: 21, away: 10 },
      { home: 20, away: 19 },
    ]);
    expect(scoreAnnouncement(a, b).map((p) => p.kind)).toEqual(["point"]);
  });

  it("announces the match won, provisional first and confirmed later", () => {
    const sets = [
      { home: 21, away: 10 },
      { home: 21, away: 15 },
    ];
    const playing = live([
      { home: 21, away: 10 },
      { home: 20, away: 15 },
    ]);
    const pending = netScoreState({ status: "pending-verification", sets });
    const verified = netScoreState({ status: "verified", sets });
    expect(
      scoreAnnouncement(playing, pending).filter((p) => p.kind === "match-won"),
    ).toEqual([{ kind: "match-won", side: "home", provisional: true }]);
    expect(scoreAnnouncement(pending, verified)).toEqual([
      { kind: "match-won", side: "home", provisional: false },
    ]);
    expect(scoreAnnouncement(verified, verified)).toEqual([]);
    const flipped = netScoreState({ status: "complete", sets, winner: "away" });
    expect(scoreAnnouncement(verified, flipped)).toEqual([
      { kind: "match-won", side: "away", provisional: false },
    ]);
  });

  it("reports a score that went down as a correction", () => {
    const a = live([{ home: 18, away: 14 }]);
    const b = live([{ home: 17, away: 14 }]);
    expect(scoreAnnouncement(a, b)).toEqual([{ kind: "correction" }]);
  });

  it("reports several points at once", () => {
    const a = live([{ home: 10, away: 10 }]);
    const b = live([{ home: 12, away: 11 }]);
    expect(scoreAnnouncement(a, b)).toEqual([
      { kind: "point", side: "home", setNumber: 1, points: 2 },
      { kind: "point", side: "away", setNumber: 1, points: 1 },
    ]);
  });
});
