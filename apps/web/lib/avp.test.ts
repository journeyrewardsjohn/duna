import { describe, expect, it } from "vitest";
import type { PublicProCoverage } from "@duna/api";
import {
  avpBracketRound,
  isAvpChampionship,
  selectOfficialAvpCoverage,
} from "./avp";

describe("official AVP coverage", () => {
  it("keeps only Duna's official AVP.com-backed event sources", () => {
    const coverage = {
      events: [
        {
          id: "league",
          externalEventId: "avp:2026:championship-men",
          source: "avp",
          name: "AVP League Men's Championships",
          category: "AVP League Championship",
        },
        {
          id: "heritage",
          externalEventId: "avp-tournament:52:women",
          source: "avp",
          name: "Manhattan Beach Open — Women's",
        },
        {
          id: "grassroots",
          externalEventId: "volleyball-life:123",
          source: "avp",
          name: "AVP America local event",
        },
        {
          id: "fivb",
          externalEventId: "fivb:999",
          source: "fivb",
          name: "Beach Pro Tour",
        },
      ],
      matches: [
        {
          id: "league-match",
          externalEventId: "avp:2026:championship-men",
          source: "avp",
        },
        {
          id: "local-match",
          externalEventId: "volleyball-life:123",
          source: "avp",
        },
      ],
    } as unknown as PublicProCoverage;

    const selected = selectOfficialAvpCoverage(coverage);

    expect(selected.events.map((event) => event.id)).toEqual([
      "league",
      "heritage",
    ]);
    expect(selected.matches.map((match) => match.id)).toEqual(["league-match"]);
    expect(isAvpChampionship(selected.events[0]!)).toBe(true);
  });

  it("normalizes AVP bracket round labels", () => {
    expect(
      avpBracketRound({ roundLabel: "Men · Championships · Quaterfinals" }),
    ).toBe("Quarterfinals");
    expect(
      avpBracketRound({ roundLabel: "Women · Championships · Semifinals" }),
    ).toBe("Semifinals");
    expect(
      avpBracketRound({ roundLabel: "Women · Championship Final · Finals" }),
    ).toBe("Final");
  });
});
