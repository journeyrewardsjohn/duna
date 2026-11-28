import { describe, expect, it } from "vitest";
import { createLiveMatch, liveView, scorePoint } from "./scoring-machine";
import { watchContextFor, watchEventToScoreEvent } from "./watch-mapping";

const base = {
  type: "duna.visionEvent" as const,
  sessionId: "s",
  source: "apple-watch" as const,
  elapsedMs: 10,
  occurredAt: "2026-11-28T10:00:00.000Z",
  score: { setIndex: 0, sets: [{ a: 1, b: 0 }], status: "live" as const },
};

describe("Watch hand-off", () => {
  it("turns the Watch's swipes into log events with its ids", () => {
    expect(
      watchEventToScoreEvent({
        ...base,
        eventId: "ABC",
        eventType: "rally-won",
        winnerSide: "B",
      }),
    ).toEqual({
      id: "abc",
      type: "rally-won",
      winner: "B",
      occurredAt: base.occurredAt,
    });
    expect(
      watchEventToScoreEvent({
        ...base,
        eventId: "U1",
        eventType: "undo",
        targetEventId: "ABC",
      }),
    ).toEqual({
      id: "u1",
      type: "undo",
      targetEventId: "abc",
      occurredAt: base.occurredAt,
    });
    expect(
      watchEventToScoreEvent({ ...base, eventId: "F", eventType: "favorite" }),
    ).toBeNull();
  });

  it("sends the Watch the same session, teams, score and format", () => {
    let match = createLiveMatch({
      id: "session-1",
      startEventId: "start",
      now: base.occurredAt,
      teamSize: 2,
      matchType: "competitive",
      scoringSystem: "rally",
      teams: {
        A: { people: [{ name: "Noa W" }] },
        B: { people: [{ name: "Theo P" }] },
      },
      agreed: false,
    });
    match = scorePoint(match, "A", "p1", base.occurredAt);
    const context = watchContextFor(
      match,
      liveView(match),
      "m1",
      base.occurredAt,
    );
    expect(context).toMatchObject({
      sessionId: "session-1",
      matchId: "m1",
      teamA: "Noa",
      teamB: "Theo",
      status: "recording",
      score: { setIndex: 0, sets: [{ a: 1, b: 0 }], serving: "A" },
      format: {
        pointTargets: [21, 21, 15],
        hardCaps: [0, 0, 0],
        sideSwitchIntervals: [7, 7, 5],
      },
    });
  });
});
