import { describe, expect, it } from "vitest";
import {
  connectRankingIdentities,
  dedupeWorldRankingRows,
  type RankingIdentityRow,
} from "./rankings";

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

  it("suppresses a unique abbreviated cross-source alias", () => {
    const rows = dedupeWorldRankingRows([
      {
        ...base,
        displayName: "Elmer Andersson",
        externalPersonId: "588",
        personId: "canonical-elmer",
      },
      {
        ...base,
        displayName: "Andersson, E",
        externalPersonId: "andersson-e:swe",
      },
    ]);

    expect(rows).toMatchObject([
      {
        displayName: "Elmer Andersson",
        personId: "canonical-elmer",
      },
    ]);
  });

  it("uses the source player name when the canonical display name is only a surname", () => {
    const rows = dedupeWorldRankingRows([
      {
        ...base,
        displayName: "Mol",
        externalPersonId: "sandrating:1042",
        personId: "canonical-anders-mol",
        rawPayload: { sourcePlayerName: "Mol, A." },
      },
      {
        ...base,
        displayName: "Mol, A.",
        externalPersonId: "volleyball-world:mol-a",
      },
      {
        ...base,
        displayName: "Sørum, C.",
        externalPersonId: "sandrating:662",
        personId: "canonical-christian-sorum",
        rawPayload: { sourcePlayerName: "Sørum, C." },
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.externalPersonId)).toEqual([
      "sandrating:1042",
      "sandrating:662",
    ]);
  });

  it("does not collapse similarly abbreviated teammates", () => {
    const rows = dedupeWorldRankingRows([
      {
        ...base,
        displayName: "Juan Enrique Bello",
        externalPersonId: "sandrating:746",
        personId: "canonical-javier-bello",
        rawPayload: { sourcePlayerName: "Bello, Ja." },
      },
      {
        ...base,
        displayName: "Bello, Ja.",
        externalPersonId: "volleyball-world:bello-ja",
      },
      {
        ...base,
        displayName: "Bello, Jo.",
        externalPersonId: "volleyball-world:bello-jo",
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.displayName)).toEqual([
      "Bello, Jo.",
      "Juan Enrique Bello",
    ]);
  });

  it("keeps an alias when more than one canonical player could match", () => {
    const rows = dedupeWorldRankingRows([
      {
        ...base,
        displayName: "Rebecca Silva",
        externalPersonId: "canonical-one",
        personId: "canonical-one",
      },
      {
        ...base,
        displayName: "Rebecca Cavalcante",
        externalPersonId: "canonical-two",
        personId: "canonical-two",
      },
      { ...base, externalPersonId: "rebecca-shadow" },
    ]);

    expect(rows).toHaveLength(3);
  });
});

describe("world-ranking identity connection", () => {
  it("uses the exact source alias to connect a fresh official ranking", () => {
    const [connected] = connectRankingIdentities(
      [
        {
          rankingDate: "2026-08-07",
          genderCategory: "men",
          rank: 1,
          points: 8_360,
          externalPersonId: "andersson-e:swe",
          displayName: "Andersson, E",
          countryCode: "SWE",
        },
      ],
      [
        {
          rankingDate: "2026-08-05",
          genderCategory: "men",
          rank: 1,
          points: 8_360,
          externalPersonId: "588",
          displayName: "Elmer Andersson",
          countryCode: "SWE",
          personId: "a517b22e-25ff-4f70-b91e-f68a4e3eb176",
          handle: "sandrating-588",
          sandRating: 6.6,
          ratedMatches: 58,
          rawPayload: { sourcePlayerName: "Andersson, E" },
        },
      ],
    );

    expect(connected).toMatchObject({
      displayName: "Andersson, E",
      personId: "a517b22e-25ff-4f70-b91e-f68a4e3eb176",
      handle: "sandrating-588",
      sandRating: 6.6,
      ratedMatches: 58,
    });
  });

  it("does not connect an alias shared by multiple people", () => {
    const row: RankingIdentityRow = {
      rankingDate: "2026-08-07",
      genderCategory: "men",
      rank: 116,
      points: 1_520,
      externalPersonId: "krafft:nam",
      displayName: "Krafft",
      countryCode: "NAM",
    };
    const [connected] = connectRankingIdentities(
      [row],
      [
        {
          ...row,
          externalPersonId: "krafft-one",
          personId: "a517b22e-25ff-4f70-b91e-f68a4e3eb176",
        },
        {
          ...row,
          externalPersonId: "krafft-two",
          personId: "11225366-b0d5-4778-850a-83424e1a73f0",
        },
      ],
    );

    expect(connected?.personId).toBeUndefined();
  });
});
