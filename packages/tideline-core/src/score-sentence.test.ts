import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BEACH_VOLLEYBALL_RULES,
  netScoreState,
  scoreAnnouncement,
} from "./score";
import {
  createAnnouncementGate,
  formatSetList,
  formatSetScore,
  MATCH_STATUSES,
  NET_SCORE_STATUS_TEXT,
  NET_SCORE_STATUSES,
  netScoreSentence,
  parseNetScoreStatus,
  scoreAnnouncementText,
} from "./score-sentence";

const names = { home: "Williams / Lewis", away: "Park / Stone" };
const three = [
  { home: 21, away: 18 },
  { home: 19, away: 21 },
  { home: 15, away: 12 },
];

describe("MATCH_STATUSES", () => {
  it("matches the match_status enum in the database schema, in order", () => {
    // A new enum value fails here until a score state is designed for it.
    const schema = readFileSync(
      new URL("../../db/src/schema.ts", import.meta.url),
      "utf8",
    );
    const block = /pgEnum\("match_status",\s*\[([\s\S]*?)\]\)/.exec(schema);
    expect(block, "match_status enum not found in schema.ts").not.toBeNull();
    const values = [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(values).toEqual([...MATCH_STATUSES]);
  });

  it("every status has chip words and a sentence", () => {
    expect(NET_SCORE_STATUSES).toHaveLength(MATCH_STATUSES.length + 1);
    for (const status of NET_SCORE_STATUSES) {
      expect(NET_SCORE_STATUS_TEXT[status].length).toBeGreaterThan(0);
      const sentence = netScoreSentence(
        netScoreState({ status, sets: three, bestOf: 3 }),
        { names },
      );
      expect(sentence).toContain("Williams / Lewis");
      expect(sentence).toContain("Park / Stone");
      expect(sentence.endsWith(".")).toBe(true);
    }
  });
});

describe("parseNetScoreStatus", () => {
  it("accepts hyphens, underscores and any case", () => {
    expect(parseNetScoreStatus("pending_verification")).toBe(
      "pending-verification",
    );
    expect(parseNetScoreStatus(" LIVE ")).toBe("live");
    expect(parseNetScoreStatus("not_finished")).toBe("not-finished");
  });
  it("never guesses an unknown value", () => {
    expect(parseNetScoreStatus("abandoned")).toBeNull();
    expect(parseNetScoreStatus(null)).toBeNull();
    expect(parseNetScoreStatus(undefined)).toBeNull();
  });
});

describe("formatSetScore", () => {
  it("uses an en dash, home first", () => {
    expect(formatSetScore(31, 29)).toBe("31–29");
    const state = netScoreState({ status: "complete", sets: three });
    expect(formatSetList(state.rows)).toBe("21–18, 19–21, 15–12");
  });
});

describe("netScoreSentence", () => {
  const say = (
    input: Parameters<typeof netScoreState>[0],
    options: Partial<Parameters<typeof netScoreSentence>[1]> = {},
  ) => netScoreSentence(netScoreState(input), { names, ...options });

  it("verified: who beat whom, sets, scores and the state", () => {
    expect(say({ status: "verified", sets: three, bestOf: 3 })).toBe(
      "Williams / Lewis beat Park / Stone 2 sets to 1, 21–18, 19–21, 15–12. Verified.",
    );
  });

  it("reads scores from the winner's side when the away team won", () => {
    expect(
      say({
        status: "complete",
        sets: [
          { home: 18, away: 21 },
          { home: 29, away: 31 },
        ],
      }),
    ).toBe(
      "Park / Stone beat Williams / Lewis 2 sets to 0, 21–18, 31–29. Final.",
    );
  });

  it("single set: no set count", () => {
    expect(
      say({ status: "complete", sets: [{ home: 21, away: 19 }], bestOf: 1 }),
    ).toBe("Williams / Lewis beat Park / Stone, 21–19. Final.");
  });

  it("title match", () => {
    expect(
      say(
        {
          status: "verified",
          sets: three.slice(0, 2).concat([{ home: 15, away: 12 }]),
        },
        { title: "King of the Beach final" },
      ),
    ).toContain(", winning the King of the Beach final. Verified.");
    expect(say({ status: "verified", sets: three }, { title: true })).toContain(
      "15–12 for the title. Verified.",
    );
  });

  it("pending verification: provisional lead", () => {
    expect(say({ status: "pending-verification", sets: three })).toBe(
      "Williams / Lewis lead Park / Stone 2 sets to 1, 21–18, 19–21, 15–12. Waiting for both teams to confirm.",
    );
  });

  it("finished statuses without a winner say so plainly", () => {
    expect(say({ status: "complete", sets: [] })).toBe(
      "Williams / Lewis against Park / Stone. Final.",
    );
    expect(
      say({
        status: "verified",
        sets: [
          { home: 21, away: 18 },
          { home: 18, away: 21 },
        ],
      }),
    ).toBe("Williams / Lewis against Park / Stone, 21–18, 18–21. Verified.");
  });

  it("scheduled and warmup never print a score", () => {
    expect(
      say(
        { status: "scheduled", sets: [] },
        { start: "Sat, Nov 28, 9:00 AM", court: "Court 3" },
      ),
    ).toBe(
      "Williams / Lewis against Park / Stone, starts Sat, Nov 28, 9:00 AM, Court 3. Scheduled, score pending.",
    );
    expect(say({ status: "scheduled", sets: [] })).toBe(
      "Williams / Lewis against Park / Stone. Scheduled, score pending.",
    );
    expect(say({ status: "warmup", sets: [] }, { court: "Court 3" })).toBe(
      "Williams / Lewis against Park / Stone, Court 3. Warming up, score pending.",
    );
  });

  it("cancelled, with and without a reason", () => {
    expect(
      say({ status: "cancelled", sets: [] }, { reason: "High surf warning" }),
    ).toBe(
      "Williams / Lewis against Park / Stone. Cancelled: High surf warning.",
    );
    expect(say({ status: "cancelled", sets: [] })).toBe(
      "Williams / Lewis against Park / Stone. Cancelled.",
    );
  });

  it("live: the set in play, sets won and the server", () => {
    expect(
      say({
        status: "live",
        sets: [
          { home: 21, away: 18 },
          { home: 19, away: 21 },
          { home: 9, away: 11 },
        ],
        serving: "away",
      }),
    ).toBe(
      "Williams / Lewis against Park / Stone. Live, set 3, Williams / Lewis 9, Park / Stone 11, sets 1–1, Park / Stone serving.",
    );
    expect(say({ status: "live", sets: [] })).toBe(
      "Williams / Lewis against Park / Stone. Live, no points recorded yet.",
    );
    expect(say({ status: "live", sets: [{ home: 3, away: 2 }] })).toBe(
      "Williams / Lewis against Park / Stone. Live, set 1, Williams / Lewis 3, Park / Stone 2.",
    );
  });

  it("not finished: the score reached and that it stopped", () => {
    expect(
      say(
        {
          status: "not-finished",
          sets: [
            { home: 21, away: 18 },
            { home: 9, away: 7 },
          ],
        },
        { reason: "Lost the light" },
      ),
    ).toBe(
      "Williams / Lewis against Park / Stone, stopped at 21–18, 9–7, set 2 unfinished. Not finished: Lost the light.",
    );
    expect(
      say({
        status: "not-finished",
        sets: [{ home: 21, away: 18, finished: true }],
      }),
    ).toBe(
      "Williams / Lewis against Park / Stone, stopped at 21–18. Not finished.",
    );
    expect(say({ status: "not-finished", sets: [] })).toBe(
      "Williams / Lewis against Park / Stone. Not finished.",
    );
  });

  it("disputed: scores, no winner", () => {
    expect(say({ status: "disputed", sets: three })).toBe(
      "Williams / Lewis against Park / Stone, 21–18, 19–21, 15–12. Result disputed, no winner yet.",
    );
    expect(say({ status: "disputed", sets: [] })).toBe(
      "Williams / Lewis against Park / Stone. Result disputed, no winner yet.",
    );
  });

  it("forfeit: with no score, after a set, and with no known winner", () => {
    expect(
      say(
        { status: "forfeit", sets: [], forfeitedBy: "home" },
        { reason: "Williams / Lewis did not show" },
      ),
    ).toBe(
      "Park / Stone won by forfeit against Williams / Lewis. Forfeit: Williams / Lewis did not show.",
    );
    expect(
      say({
        status: "forfeit",
        sets: [{ home: 18, away: 21 }],
        winner: "away",
      }),
    ).toBe(
      "Park / Stone won by forfeit against Williams / Lewis after 21–18. Forfeit.",
    );
    expect(say({ status: "forfeit", sets: [] })).toBe(
      "Williams / Lewis against Park / Stone. Forfeit.",
    );
  });
});

describe("scoreAnnouncementText", () => {
  const live = (
    sets: Array<{ home: number; away: number }>,
    serving?: "home" | "away",
  ) =>
    netScoreState({
      status: "live",
      sets,
      bestOf: 3,
      rules: BEACH_VOLLEYBALL_RULES,
      serving,
    });

  it("nothing changed: nothing to say", () => {
    const a = live([{ home: 3, away: 2 }]);
    expect(scoreAnnouncementText(scoreAnnouncement(a, a), a, names)).toBeNull();
  });

  it("a point reads as the new set score", () => {
    const a = live([{ home: 3, away: 2 }], "home");
    const b = live([{ home: 3, away: 3 }], "away");
    expect(scoreAnnouncementText(scoreAnnouncement(a, b), b, names)).toBe(
      "Point Park / Stone. Set 1, 3–3. Park / Stone serving.",
    );
  });

  it("set point and match point; match point replaces set point", () => {
    const a = live([{ home: 19, away: 18 }]);
    const b = live([{ home: 20, away: 18 }]);
    expect(scoreAnnouncementText(scoreAnnouncement(a, b), b, names)).toBe(
      "Point Williams / Lewis. Set 1, 20–18. Set point Williams / Lewis.",
    );
    const c = live([
      { home: 21, away: 18 },
      { home: 19, away: 18 },
    ]);
    const d = live([
      { home: 21, away: 18 },
      { home: 20, away: 18 },
    ]);
    expect(scoreAnnouncementText(scoreAnnouncement(c, d), d, names)).toBe(
      "Point Williams / Lewis. Set 2, 20–18. Match point Williams / Lewis.",
    );
  });

  it("a set won and a match won", () => {
    const a = live([{ home: 20, away: 18 }]);
    const b = live([
      { home: 21, away: 18 },
      { home: 0, away: 0 },
    ]);
    expect(scoreAnnouncementText(scoreAnnouncement(a, b), b, names)).toBe(
      "Point Williams / Lewis. Set 1, 21–18. Set 1 to Williams / Lewis.",
    );
    const before = netScoreState({ status: "live", sets: three });
    const after = netScoreState({ status: "verified", sets: three });
    expect(
      scoreAnnouncementText(scoreAnnouncement(before, after), after, names),
    ).toBe("Set 3 to Williams / Lewis. Williams / Lewis won the match.");
    const pending = netScoreState({
      status: "pending-verification",
      sets: three,
    });
    expect(
      scoreAnnouncementText(scoreAnnouncement(before, pending), pending, names),
    ).toBe(
      "Set 3 to Williams / Lewis. Williams / Lewis ahead, to be confirmed.",
    );
  });

  it("a correction says the corrected score once", () => {
    const a = live([{ home: 5, away: 2 }]);
    const b = live([{ home: 4, away: 2 }]);
    expect(scoreAnnouncementText(scoreAnnouncement(a, b), b, names)).toBe(
      "Score corrected: set 1, Williams / Lewis 4, Park / Stone 2.",
    );
    expect(
      scoreAnnouncementText([{ kind: "correction" }], live([]), names),
    ).toBe("Score corrected.");
  });

  it("a point in a set the state no longer has is skipped", () => {
    expect(
      scoreAnnouncementText(
        [{ kind: "point", side: "home", setNumber: 4, points: 1 }],
        live([]),
        names,
      ),
    ).toBeNull();
  });
});

describe("createAnnouncementGate", () => {
  it("says the first message, holds a burst, and says only the latest", () => {
    const gate = createAnnouncementGate(2000);
    expect(gate.dueAt()).toBeNull();
    expect(gate.offer("1–0", 0)).toBe("1–0");
    expect(gate.offer("2–0", 300)).toBeNull();
    expect(gate.offer("3–0", 600)).toBeNull();
    expect(gate.dueAt()).toBe(2000);
    expect(gate.flush(1999)).toBeNull();
    expect(gate.flush(2000)).toBe("3–0");
    expect(gate.flush(2500)).toBeNull();
    expect(gate.offer("4–0", 4100)).toBe("4–0");
  });
  it("defaults to a two second window", () => {
    const gate = createAnnouncementGate();
    expect(gate.offer("a", 0)).toBe("a");
    expect(gate.offer("b", 1999)).toBeNull();
    expect(gate.flush(2000)).toBe("b");
  });
});
