import type { MatchSummary, PersonSummary } from "@duna/core";
import { describe, expect, it } from "vitest";
import { recentPeople, setsFromQuery, setsFromWatch } from "./score-model";

const p = (
  id: string,
  name: string,
  over: Partial<PersonSummary> = {},
): PersonSummary => ({
  id,
  displayName: name,
  handle: id,
  initials: "XX",
  homeMarket: "",
  roles: ["player"],
  rating: {
    display: 4.1,
    mu: 0,
    phi: 0,
    sigma: 0,
    confidence: "Reliable",
    discipline: "beach-2s",
  },
  ...over,
});

const me = p("me", "Mara Lewis");
const theo = p("theo", "Theo Park");
const noa = p("noa", "Noa Williams", {
  rating: {
    display: 3,
    mu: 0,
    phi: 0,
    sigma: 0,
    confidence: "Provisional",
    discipline: "beach-2s",
  },
});
const ghost = p("ghost", "Jamie Rivera", { profileClaimStatus: "unclaimed" });

const m = (teamA: PersonSummary[], teamB: PersonSummary[]): MatchSummary => ({
  id: Math.random().toString(),
  playedAt: "2026-11-01T00:00:00.000Z",
  venueName: "x",
  teamA,
  teamB,
  score: [[21, 18]],
  winner: "A",
  ratingDelta: 0,
  verification: "self-reported",
});

describe("recent partners and opponents", () => {
  it("suggests the people played with most, never someone without a profile, never a provisional number", () => {
    const { partners, opponents } = recentPeople(
      [
        m([me, theo], [noa, ghost]),
        m([me, theo], [noa, ghost]),
        m([noa, ghost], [me, theo]),
      ],
      "me",
    );
    expect(partners.map((person) => person.name)).toEqual(["Theo Park"]);
    expect(partners[0]!.detail).toBe("Played together 3 times");
    expect(partners[0]!.level).toBe("4.1");
    expect(opponents.map((person) => person.name)).toEqual(["Noa Williams"]);
    expect(opponents[0]!.level).toBeUndefined();
  });
});

describe("a score carried in", () => {
  it("reads Change this result's sets and the watch's hand-off", () => {
    expect(setsFromQuery("21-18,19-21,bad,15-12")).toEqual([
      { you: 21, them: 18 },
      { you: 19, them: 21 },
      { you: 15, them: 12 },
    ]);
    expect(
      setsFromWatch(
        JSON.stringify({
          source: "apple-watch",
          sets: [
            { a: 21, b: 17 },
            { a: -1, b: 3 },
          ],
        }),
      ),
    ).toEqual([{ you: 21, them: 17 }]);
    expect(setsFromWatch("{nope")).toEqual([]);
    expect(
      setsFromWatch(
        JSON.stringify({ source: "phone", sets: [{ a: 21, b: 17 }] }),
      ),
    ).toEqual([]);
  });
});
