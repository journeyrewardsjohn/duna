import { describe, expect, it } from "vitest";
import { liveCall, pointButtonLabel, syncText } from "./live-copy";
import {
  applyExternalEvent,
  callTimeout,
  completeTechnicalTimeout,
  createLiveMatch,
  endMatch,
  liveView,
  missingPlaces,
  parseLiveMatch,
  playedSets,
  readyToSave,
  scorePoint,
  undoLast,
  type LiveMatch,
  type TeamSide,
} from "./scoring-machine";
import { describeFormat, liveFormat } from "./formats";

let counter = 0;
const id = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
};
const at = "2026-11-28T10:00:00.000Z";

function newMatch(
  overrides: Partial<Parameters<typeof createLiveMatch>[0]> = {},
): LiveMatch {
  return createLiveMatch({
    id: id(),
    startEventId: id(),
    now: at,
    teamSize: 2,
    matchType: "competitive",
    scoringSystem: "rally",
    teams: {
      A: {
        people: [
          { personId: id(), name: "Noa Williams" },
          { personId: id(), name: "Mara Lewis" },
        ],
      },
      B: {
        people: [
          { personId: id(), name: "Theo Park" },
          { personId: id(), name: "Jamie Stone" },
        ],
      },
    },
    agreed: true,
    ...overrides,
  });
}

function points(match: LiveMatch, sides: string): LiveMatch {
  return [...sides].reduce(
    (next, side) => scorePoint(next, side as TeamSide, id(), at),
    match,
  );
}

const run = (side: TeamSide, count: number) => side.repeat(count);

describe("formats", () => {
  it("folds with the server's standard beach format", () => {
    const format = liveFormat({
      teamSize: 2,
      scoringSystem: "rally",
      matchType: "competitive",
    });
    expect(format.pointTargets).toEqual([21, 21, 15]);
    expect(format.winBy).toBe(2);
    expect(format.sideSwitchIntervals).toEqual([7, 7, 5]);
    expect(describeFormat(format)).toBe(
      "Best of three: 21, 21, 15 · win by two",
    );
  });

  it("keeps the team size and scoring system", () => {
    const format = liveFormat({
      teamSize: 6,
      scoringSystem: "sideout",
      matchType: "friendly",
    });
    expect(format.teamSize).toBe(6);
    expect(format.scoringSystem).toBe("sideout");
  });
});

describe("scoring", () => {
  it("scores points, serves to the side that won the rally and wins a set by two", () => {
    let match = points(newMatch(), run("A", 20) + run("B", 20));
    let view = liveView(match);
    expect(view.points).toEqual({ A: 20, B: 20 });
    expect(view.serving).toBe("B");
    match = points(match, "A");
    view = liveView(match);
    expect(view.setNumber).toBe(1);
    expect(view.setPoint).toEqual(["A"]);
    match = points(match, "A");
    view = liveView(match);
    expect(view.setNumber).toBe(2);
    expect(view.score.setsWon).toEqual({ A: 1, B: 0 });
    expect(view.points).toEqual({ A: 0, B: 0 });
  });

  it("calls match point and stops at the end of the match", () => {
    let match = points(newMatch(), run("A", 21) + run("A", 20));
    let view = liveView(match);
    expect(view.matchPoint).toEqual(["A"]);
    expect(liveCall(view)).toBe("Match point Noa / Mara");
    match = points(match, "A");
    view = liveView(match);
    expect(view.decided).toBe(true);
    expect(view.winner).toBe("A");
    expect(view.net.status).toBe("pending-verification");
    expect(liveCall(view)).toBe("Noa / Mara win");
    const after = points(match, "B");
    expect(after.events.length).toBe(match.events.length);
    expect(playedSets(match)).toEqual([
      { a: 21, b: 0, winner: "A" },
      { a: 21, b: 0, winner: "A" },
    ]);
  });

  it("plays a deciding set to 15", () => {
    const match = points(
      newMatch(),
      run("A", 21) + run("B", 21) + run("A", 14),
    );
    const view = liveView(match);
    expect(view.setNumber).toBe(3);
    expect(view.target).toBe(15);
    expect(view.matchPoint).toEqual(["A"]);
  });

  it("asks for a side switch every 7 points (5 in the decider)", () => {
    const match = points(newMatch(), "AAABBBA");
    const view = liveView(match);
    expect(view.sideSwitchDue).toBe(true);
    expect(liveCall(view)).toBe("Switch sides");
    expect(view.nextSwitchAt).toBe(14);
    const decider = points(newMatch(), run("A", 21) + run("B", 21) + "AABBA");
    expect(liveView(decider).sideSwitchDue).toBe(true);
  });

  it("side-out scoring only scores for the serving side", () => {
    let match = newMatch({ scoringSystem: "sideout" });
    match = points(match, "B");
    let view = liveView(match);
    expect(view.points).toEqual({ A: 0, B: 0 });
    expect(view.serving).toBe("B");
    match = points(match, "B");
    view = liveView(match);
    expect(view.points).toEqual({ A: 0, B: 1 });
  });

  it("undoes the last point in one step, back across a set boundary", () => {
    let match = points(newMatch(), run("A", 21));
    expect(liveView(match).setNumber).toBe(2);
    match = undoLast(match, id(), at);
    const view = liveView(match);
    expect(view.setNumber).toBe(1);
    expect(view.points).toEqual({ A: 20, B: 0 });
    expect(view.score.setsWon).toEqual({ A: 0, B: 0 });
    match = undoLast(match, id(), at);
    expect(liveView(match).points).toEqual({ A: 19, B: 0 });
  });

  it("has nothing to undo before the first point", () => {
    const match = newMatch();
    expect(liveView(match).canUndo).toBe(false);
    expect(undoLast(match, id(), at)).toBe(match);
  });

  it("allows one timeout a side per set, undoable, reset in the next set", () => {
    let match = callTimeout(newMatch(), "A", id(), at);
    expect(liveView(match).timeoutsLeft).toEqual({ A: 0, B: 1 });
    expect(callTimeout(match, "A", id(), at)).toBe(match);
    match = undoLast(match, id(), at);
    expect(liveView(match).timeoutsLeft.A).toBe(1);
    match = callTimeout(match, "A", id(), at);
    match = points(match, run("A", 21));
    expect(liveView(match).timeoutsLeft).toEqual({ A: 1, B: 1 });
  });

  it("calls the technical timeout at 21 points and resumes", () => {
    let match = points(newMatch(), run("A", 11) + run("B", 10));
    let view = liveView(match);
    expect(view.technicalTimeoutDue).toBe(true);
    expect(liveCall(view)).toBe("Technical timeout");
    match = completeTechnicalTimeout(match, id(), at);
    view = liveView(match);
    expect(view.technicalTimeoutDue).toBe(false);
  });

  it("ignores a repeated event from the Watch", () => {
    const event = {
      id: id(),
      type: "rally-won" as const,
      winner: "B" as const,
      occurredAt: at,
    };
    const once = applyExternalEvent(newMatch(), event);
    const twice = applyExternalEvent(once, event);
    expect(twice).toBe(once);
    expect(liveView(twice).points.B).toBe(1);
  });

  it("stops taking points once ended", () => {
    const ended = endMatch(points(newMatch(), "AB"), at);
    expect(scorePoint(ended, "A", id(), at)).toBe(ended);
    expect(liveView(ended).canUndo).toBe(false);
  });

  it("logs points newest first with the score after each", () => {
    const view = liveView(points(newMatch(), "AAB"));
    expect(view.log.map((entry) => `${entry.a}-${entry.b}`)).toEqual([
      "2-1",
      "2-0",
      "1-0",
    ]);
  });

  it("names each button with its side and the score it makes", () => {
    const view = liveView(points(newMatch(), "AAB"));
    expect(pointButtonLabel(view, "A")).toBe(
      "Point to Noa / Mara. Makes it 3–1.",
    );
    expect(pointButtonLabel(view, "B")).toBe(
      "Point to Theo / Jamie. Makes it 2–2.",
    );
  });

  it("knows when every place is named and everyone agreed", () => {
    const unnamed = newMatch({
      teams: { A: { people: [{ name: "Noa Williams" }] }, B: { people: [] } },
      agreed: false,
    });
    expect(missingPlaces(unnamed)).toBe(3);
    expect(readyToSave(unnamed)).toBe(false);
    expect(readyToSave(newMatch())).toBe(true);
    expect(liveView(unnamed).names).toEqual({ home: "Noa", away: "Side B" });
  });
});

describe("resume after a restart", () => {
  it("reads a stored match back to the same score", () => {
    const match = points(newMatch(), run("A", 21) + "BAB");
    const restored = parseLiveMatch(JSON.parse(JSON.stringify(match)));
    expect(restored).not.toBeNull();
    expect(liveView(restored!).points).toEqual(liveView(match).points);
    expect(liveView(restored!).setNumber).toBe(2);
  });

  it("drops a malformed record", () => {
    expect(parseLiveMatch(null)).toBeNull();
    expect(parseLiveMatch({ id: "x" })).toBeNull();
    const match = newMatch();
    expect(parseLiveMatch({ ...match, teamSize: 5 })).toBeNull();
  });
});

describe("sync words", () => {
  it("says where the points are", () => {
    expect(syncText({ kind: "offline", queued: 3 }, 3)).toBe(
      "Offline · 3 points waiting to send",
    );
    expect(syncText({ kind: "synced" }, 0)).toBe("Saved to Duna");
    expect(syncText({ kind: "needs-players" }, 2)).toBe(
      "On this phone until everyone is named",
    );
  });
});
