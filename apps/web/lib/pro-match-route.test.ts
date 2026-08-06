import { describe, expect, it } from "vitest";
import { findProfessionalMatchReplacement } from "./pro-match-route";

const currentMatch = {
  id: "85683df8-e2b6-4f85-a855-5d6901dfe7f4",
  slug: "tina-graudina-anastasija-samoilova-vs-molly-shaw-molly-phillips",
  canonicalPath:
    "/events/bpt-elite16-hamburg-womens-2026-08-05/match/tina-graudina-anastasija-samoilova-vs-molly-shaw-molly-phillips/85683df8-e2b6-4f85-a855-5d6901dfe7f4",
};

describe("findProfessionalMatchReplacement", () => {
  it("recovers a stale feed id when the human-readable match slug is unique", () => {
    expect(
      findProfessionalMatchReplacement([currentMatch], {
        matchId: "8bdbb031-2b1a-401f-8581-81210f0200ad",
        matchSlug: currentMatch.slug,
      }),
    ).toEqual(currentMatch);
  });

  it("does not redirect a current canonical match", () => {
    expect(
      findProfessionalMatchReplacement([currentMatch], {
        matchId: currentMatch.id,
        matchSlug: currentMatch.slug,
      }),
    ).toBeUndefined();
  });

  it("refuses an ambiguous slug shared by multiple legitimate fixtures", () => {
    expect(
      findProfessionalMatchReplacement(
        [
          currentMatch,
          {
            ...currentMatch,
            id: "a4cb60b8-a821-4561-bd33-1e11b23a0e92",
          },
        ],
        {
          matchId: "8bdbb031-2b1a-401f-8581-81210f0200ad",
          matchSlug: currentMatch.slug,
        },
      ),
    ).toBeUndefined();
  });
});
