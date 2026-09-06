import { describe, expect, it } from "vitest";
import {
  defaultPredictionMarketRules,
  isDeterminedMatchStatus,
  nextPredictionMarketLocksAt,
  predictionMarketLabelsMatchDefinition,
} from "./prediction-market";

describe("prediction market lifecycle", () => {
  it("accepts reordered full names but rejects a changed partner", () => {
    expect(
      predictionMarketLabelsMatchDefinition({
        market: {
          yesLabel: "Crabb / Benesh",
          noLabel: "Schalk / Shaw",
        },
        definition: {
          yesLabel: "Andy Benesh / Taylor Crabb",
          noLabel: "Chaim Schalk / James Shaw",
        },
      }),
    ).toBe(true);
    expect(
      predictionMarketLabelsMatchDefinition({
        market: {
          yesLabel: "Crabb / Benesh",
          noLabel: "Schalk / Brunner",
        },
        definition: {
          yesLabel: "Andy Benesh / Taylor Crabb",
          noLabel: "Chaim Schalk / James Shaw",
        },
      }),
    ).toBe(false);
    expect(
      predictionMarketLabelsMatchDefinition({
        market: { yesLabel: "New York Nitro", noLabel: "Austin Aces" },
        definition: { yesLabel: "Miami Nitro", noLabel: "Austin Aces" },
      }),
    ).toBe(false);
  });

  it.each(["verified", "complete", "forfeit"])(
    "treats %s as a determined match result",
    (status) => {
      expect(isDeterminedMatchStatus(status)).toBe(true);
    },
  );

  it.each(["scheduled", "live", "pending-verification", "disputed"])(
    "does not settle orders while a match is %s",
    (status) => {
      expect(isDeterminedMatchStatus(status)).toBe(false);
    },
  );

  it("publishes credits-only match rules with an explicit close policy", () => {
    const rules = defaultPredictionMarketRules({
      subjectType: "match",
      yesLabel: "Team A",
      noLabel: "Team B",
    });

    expect(rules.resolutionCriteria).toContain("result is verified or final");
    expect(rules.resolutionSource).toContain("verified Duna score");
    expect(rules.closePolicy).toContain("Unmatched orders are released");
    expect(rules.publicNote).toContain("free-play only");
    expect(rules.publicNote).toContain("cannot be purchased");
  });

  it("uses official tour results and final-tournament timing for pro contracts", () => {
    const rules = defaultPredictionMarketRules({
      subjectType: "pro-event-team",
      yesLabel: "Carol / Rebecca wins",
      noLabel: "Carol / Rebecca does not win",
    });

    expect(rules.resolutionSource).toContain(
      "official AVP or Volleyball World",
    );
    expect(rules.resolutionCriteria).toContain("tournament result is final");
    expect(rules.closePolicy).toContain("posted close time");
  });

  it("keeps a SuperAdmin close-time override across source refreshes", () => {
    const now = new Date("2026-08-07T12:00:00.000Z");
    const adminClose = new Date("2026-08-07T15:00:00.000Z");
    const sourceClose = new Date("2026-08-07T18:00:00.000Z");

    expect(
      nextPredictionMarketLocksAt({
        currentRuleVersion: 2,
        currentLocksAt: adminClose,
        definitionLocksAt: sourceClose,
        now,
      }),
    ).toEqual(adminClose);
  });
});
