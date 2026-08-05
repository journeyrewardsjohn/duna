import { describe, expect, it } from "vitest";
import { dedupeWorldRankingRows } from "./rankings";

describe("world-ranking identity deduplication", () => {
  const base = {
    rankingDate: "2026-08-05",
    genderCategory: "women",
    rank: 1,
    points: 8_540,
    displayName: "Rebecca",
    countryCode: "BRA",
  };

  it("prefers the canonical mapped player over an unmapped duplicate", () => {
    const rows = dedupeWorldRankingRows([
      { ...base, externalPersonId: "rebecca-bra-shadow" },
      {
        ...base,
        externalPersonId: "rebecca:bra",
        personId: "298868b3-3c08-486c-a253-8d6fa465b1d6",
        sandRating: 6.55,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalPersonId: "rebecca:bra",
      personId: "298868b3-3c08-486c-a253-8d6fa465b1d6",
      sandRating: 6.55,
    });
  });

  it("collapses aliases linked to the same canonical person", () => {
    const rows = dedupeWorldRankingRows([
      {
        ...base,
        externalPersonId: "rebecca:bra",
        personId: "canonical-player",
      },
      {
        ...base,
        displayName: "Rebecca Silva",
        externalPersonId: "rebecca-silva:bra",
        personId: "canonical-player",
      },
    ]);

    expect(rows).toHaveLength(1);
  });

  it("does not merge same-name athletes when their ranking evidence differs", () => {
    const rows = dedupeWorldRankingRows([
      { ...base, externalPersonId: "first" },
      { ...base, rank: 14, points: 3_500, externalPersonId: "second" },
    ]);

    expect(rows).toHaveLength(2);
  });
});
