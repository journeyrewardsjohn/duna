import { performanceEvidenceFromSetScores } from "@duna/rating";
import { describe, expect, it } from "vitest";
import {
  addScoreDraftDataSchema,
  addScorePersonNameSchema,
  addScorePlaceSchema,
  type AddScoreSet,
} from "../../contracts/add-score";
import { previewFromDraft } from "./preview";
import {
  completedSteps,
  distanceMeters,
  hashDraftToken,
  isLikelySamePlace,
  mergeStep,
  nameSimilarity,
  newDraftToken,
  normalizePlaceName,
  ratingEvidenceProblem,
  scoreShape,
  scoreWarnings,
  SOFT_UNFINISHED_WARNING,
  stepErrors,
} from "./rules";

/** A small seeded generator: property tests without a new dependency. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomSets(next: () => number): AddScoreSet[] {
  const count = 1 + Math.floor(next() * 5);
  return Array.from({ length: count }, () => ({
    you: Math.floor(next() * 32),
    them: Math.floor(next() * 32),
  }));
}

/**
 * The checks `recordCompletedMatch` runs (match-service.ts), restated as a
 * reference: a draft accepted here must never be refused at claim.
 */
function claimAccepts(
  sets: readonly AddScoreSet[],
  setsToWin: number,
): boolean {
  const maximumSets = setsToWin * 2 - 1;
  if (sets.length < setsToWin || sets.length > maximumSets) return false;
  if (
    sets.some((set) => set.you === set.them || Math.abs(set.you - set.them) < 2)
  ) {
    return false;
  }
  const a = sets.filter((set) => set.you > set.them).length;
  const b = sets.length - a;
  let runningA = 0;
  let runningB = 0;
  const early = sets.some((set, index) => {
    if (set.you > set.them) runningA += 1;
    else runningB += 1;
    return (
      index < sets.length - 1 &&
      (runningA === setsToWin || runningB === setsToWin)
    );
  });
  return !early && Math.max(a, b) === setsToWin && Math.min(a, b) < setsToWin;
}

const now = new Date("2026-11-28T18:00:00.000Z");

describe("score validation reuses the product's rules", () => {
  it("accepts the usual shapes and reports who won", () => {
    expect(scoreShape([{ you: 21, them: 18 }])).toMatchObject({
      ok: true,
      shape: { setsToWin: 1, result: "won" },
    });
    expect(
      scoreShape([
        { you: 21, them: 18 },
        { you: 19, them: 21 },
        { you: 15, them: 12 },
      ]),
    ).toMatchObject({
      ok: true,
      shape: { setsToWin: 2, setsWon: { you: 2, them: 1 } },
    });
    expect(
      scoreShape([
        { you: 18, them: 21 },
        { you: 17, them: 21 },
      ]),
    ).toMatchObject({ ok: true, shape: { result: "lost", setsToWin: 2 } });
  });

  it("refuses what the claim would refuse, in plain words", () => {
    expect(scoreShape([{ you: 21, them: 20 }])).toMatchObject({ ok: false });
    expect(scoreShape([{ you: 21, them: 21 }])).toMatchObject({ ok: false });
    expect(
      scoreShape([
        { you: 21, them: 18 },
        { you: 18, them: 21 },
      ]),
    ).toEqual({
      ok: false,
      problem: "The match needs a winner. Add the deciding set.",
    });
    expect(
      scoreShape([
        { you: 21, them: 18 },
        { you: 21, them: 18 },
        { you: 10, them: 15 },
      ]),
    ).toMatchObject({ ok: false });
  });

  it("property: accepted here means accepted at claim and by the rating engine", () => {
    const next = random(20261128);
    let accepted = 0;
    for (let run = 0; run < 4_000; run += 1) {
      const sets = randomSets(next);
      const shape = scoreShape(sets);
      if (!shape.ok) continue;
      accepted += 1;
      expect(claimAccepts(sets, shape.shape.setsToWin)).toBe(true);
      expect(ratingEvidenceProblem(sets)).toBeUndefined();
      expect(() =>
        performanceEvidenceFromSetScores(
          sets.map((set) => ({ a: set.you, b: set.them })),
        ),
      ).not.toThrow();
    }
    expect(accepted).toBeGreaterThan(100);
  });

  it("property: refused here means no sets-to-win the claim would accept", () => {
    const next = random(7);
    for (let run = 0; run < 4_000; run += 1) {
      const sets = randomSets(next);
      if (scoreShape(sets).ok) continue;
      for (const setsToWin of [1, 2, 3]) {
        expect(claimAccepts(sets, setsToWin)).toBe(false);
      }
    }
  });

  it("warns (never blocks) when a set looks unfinished: 21, or 15 in a decider", () => {
    expect(scoreWarnings([{ you: 21, them: 18 }])).toEqual([]);
    expect(scoreWarnings([{ you: 15, them: 12 }])).toEqual([
      SOFT_UNFINISHED_WARNING,
    ]);
    expect(
      scoreWarnings([
        { you: 21, them: 18 },
        { you: 19, them: 21 },
        { you: 15, them: 12 },
      ]),
    ).toEqual([]);
    const data = {
      format: 2 as const,
      matchType: "competitive" as const,
      playedOn: "2026-11-28",
      sets: [{ you: 15, them: 12 }],
    };
    expect(stepErrors("score", data, now)).toEqual({});
  });
});

describe("steps", () => {
  const where = {
    place: {
      kind: "described" as const,
      name: "North Lot courts",
      address: "Behind the north lot",
    },
  };
  const score = {
    format: 2 as const,
    matchType: "competitive" as const,
    playedOn: "2026-11-27",
    sets: [
      { you: 21, them: 18 },
      { you: 21, them: 16 },
    ],
  };
  const players = {
    teammates: [{ firstName: "Ana" }],
    opponents: [{ firstName: "Bo", lastInitial: "R" }],
    agreed: true,
  };

  it("needs each step's parts, and the agreement", () => {
    expect(stepErrors("where", {}, now)).toHaveProperty("place");
    expect(stepErrors("players", { ...score, opponents: [] }, now)).toEqual({
      "opponents.0.firstName": "Add at least one name from the other side.",
      agreed: "Everyone on court needs to agree before a match is recorded.",
    });
    expect(completedSteps({ ...where, ...score, ...players }, now)).toEqual([
      "where",
      "score",
      "players",
    ]);
  });

  it("refuses a day in the future or too long ago", () => {
    expect(
      stepErrors("score", { ...score, playedOn: "2026-12-01" }, now).playedOn,
    ).toBe("That day hasn’t happened yet.");
    expect(
      stepErrors("score", { ...score, playedOn: "2026-06-01" }, now).playedOn,
    ).toMatch(/last 90 days/);
    // Tomorrow in UTC is still today somewhere.
    expect(
      stepErrors("score", { ...score, playedOn: "2026-11-29" }, now),
    ).toEqual({});
  });

  it("a save replaces only its own step's parts", () => {
    const merged = mergeStep({ ...where, ...score, ...players }, "score", {
      ...score,
      format: 4,
      sets: [{ you: 25, them: 23 }],
    });
    expect(merged.place).toEqual(where.place);
    expect(merged.opponents).toEqual(players.opponents);
    expect(merged.format).toBe(4);
    // A 4 v 4 needs three teammates at most: still one here, so fine.
    expect(stepErrors("players", merged, now)).toEqual({});
  });
});

describe("content rules on typed text", () => {
  it("allows names and initials", () => {
    for (const name of [
      "Ana",
      "J.",
      "Mary Ann",
      "O’Neil",
      "Zoë",
      "José-Luis",
    ]) {
      expect(addScorePersonNameSchema.safeParse(name).success).toBe(true);
    }
  });
  it("refuses links, numbers and long text", () => {
    for (const name of [
      "spam.com",
      "www.example",
      "http://x",
      "buy@me",
      "Player 2",
      "x".repeat(41),
      "",
    ]) {
      expect(addScorePersonNameSchema.safeParse(name).success).toBe(false);
    }
  });
  it("refuses a described place that is a web address", () => {
    expect(
      addScorePlaceSchema.safeParse({
        kind: "described",
        name: "cheap-pills.biz",
        address: "Main St",
      }).success,
    ).toBe(false);
    expect(
      addScorePlaceSchema.safeParse({
        kind: "described",
        name: "St. Pete courts",
        address: "100 Pier Ave.",
      }).success,
    ).toBe(true);
    // A name alone is not enough to find a court.
    expect(
      addScorePlaceSchema.safeParse({ kind: "described", name: "Courts" })
        .success,
    ).toBe(false);
  });
  it("never accepts contact details in a draft", () => {
    const parsed = addScoreDraftDataSchema.parse({
      opponents: [{ firstName: "Bo", email: "bo@example.com" }],
    });
    expect(JSON.stringify(parsed)).not.toContain("example.com");
  });
});

describe("tokens", () => {
  it("are 43 URL-safe characters and stored only as a hash", () => {
    const token = newDraftToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashDraftToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDraftToken(token)).not.toContain(token);
    expect(newDraftToken()).not.toBe(token);
  });
});

describe("candidate de-duplication", () => {
  const pier = {
    name: "Manhattan Beach Pier courts",
    latitude: 33.8847,
    longitude: -118.4109,
  };

  it("the same provider place id is the same place, wherever it is", () => {
    expect(
      isLikelySamePlace(
        { ...pier, googlePlaceId: "ChIJabc12345" },
        { name: "Somewhere else", googlePlaceId: "ChIJabc12345" },
      ),
    ).toBe(true);
    expect(
      isLikelySamePlace(
        { ...pier, googlePlaceId: "ChIJabc12345" },
        { ...pier, googlePlaceId: "ChIJother999" },
      ),
    ).toBe(false);
  });

  it("close and similarly named is the same; close but different is not", () => {
    const nearby = { latitude: 33.8852, longitude: -118.4112 };
    expect(distanceMeters(pier, nearby)).toBeLessThan(150);
    expect(
      isLikelySamePlace(pier, { name: "Manhattan Beach Pier", ...nearby }),
    ).toBe(true);
    expect(isLikelySamePlace(pier, { name: "Taco stand", ...nearby })).toBe(
      false,
    );
    const far = { latitude: 33.9, longitude: -118.42 };
    expect(
      isLikelySamePlace(pier, { name: "Manhattan Beach Pier courts", ...far }),
    ).toBe(false);
  });

  it("property: the rule is symmetric and a place matches itself", () => {
    const next = random(42);
    const names = [
      "North Lot",
      "North lot courts",
      "Pier",
      "Dockweiler",
      "Hermosa",
    ];
    for (let run = 0; run < 2_000; run += 1) {
      const a = {
        name: names[Math.floor(next() * names.length)]!,
        latitude: 33.88 + next() * 0.004,
        longitude: -118.41 + next() * 0.004,
      };
      const b = {
        name: names[Math.floor(next() * names.length)]!,
        latitude: 33.88 + next() * 0.004,
        longitude: -118.41 + next() * 0.004,
      };
      expect(isLikelySamePlace(a, b)).toBe(isLikelySamePlace(b, a));
      expect(isLikelySamePlace(a, a)).toBe(true);
      expect(nameSimilarity(a.name, b.name)).toBe(
        nameSimilarity(b.name, a.name),
      );
    }
  });

  it("ignores generic words, tolerates typos, and tells different courts apart", () => {
    expect(nameSimilarity("Pier Courts", "Pier courts north end")).toBe(1);
    expect(nameSimilarity("Dockweiler", "Dockwieler")).toBeGreaterThanOrEqual(
      0.6,
    );
    expect(
      nameSimilarity("North Lot courts", "Pier courts north end"),
    ).toBeLessThan(0.6);
    expect(nameSimilarity("Beach courts", "Beach courts")).toBe(1);
  });

  it("normalises accents, case and punctuation", () => {
    expect(normalizePlaceName("  Playa  Café—Norte! ")).toBe(
      "playa cafe norte",
    );
    expect(nameSimilarity("Café Norte", "cafe norte")).toBe(1);
  });
});

describe("what this result would do", () => {
  const base = {
    format: 2 as const,
    matchType: "competitive" as const,
    playedOn: "2026-11-27",
  };

  it("runs the rating engine on a copy: a win moves a new player up, a loss down", () => {
    const won = previewFromDraft({
      ...base,
      sets: [
        { you: 21, them: 15 },
        { you: 21, them: 17 },
      ],
    });
    const lost = previewFromDraft({
      ...base,
      sets: [
        { you: 15, them: 21 },
        { you: 17, them: 21 },
      ],
    });
    expect(won?.counts).toBe(true);
    expect(won?.whatItWouldDo?.startingPoint).toBe(3);
    expect(won?.whatItWouldDo?.change).toBeGreaterThan(0);
    expect(lost?.whatItWouldDo?.change).toBeLessThan(0);
    expect(won?.whatItWouldDo?.matchesUntilShown).toBeGreaterThan(1);
  });

  it("is honest when the match would not move a rating", () => {
    const friendly = previewFromDraft({
      ...base,
      matchType: "friendly",
      sets: [{ you: 21, them: 15 }],
    });
    expect(friendly).toMatchObject({ counts: false, reason: "friendly" });
    expect(friendly?.whatItWouldDo).toBeUndefined();
    const sixes = previewFromDraft({
      ...base,
      format: 6,
      sets: [{ you: 25, them: 20 }],
    });
    expect(sixes).toMatchObject({ counts: false, reason: "not-doubles" });
  });

  it("never changes the draft it reads", () => {
    const data = {
      ...base,
      sets: [{ you: 21, them: 15 }],
    };
    const before = JSON.stringify(data);
    previewFromDraft(data);
    expect(JSON.stringify(data)).toBe(before);
  });
});
