import { describe, expect, it } from "vitest";
import { evaluateEligibility, type EligibilityRule } from "./eligibility";

const player = {
  id: "person_1",
  displayName: "Mara Lewis",
  handle: "maralewis",
  initials: "ML",
  homeMarket: "South Bay",
  roles: ["player"] as const,
  rating: {
    display: 4.62,
    mu: 1730,
    phi: 48,
    sigma: 0.06,
    confidence: "Reliable" as const,
    discipline: "beach-2s" as const,
  },
};

describe("eligibility engine", () => {
  it("uses the anti-sandbag rating basis", () => {
    const rule: EligibilityRule = {
      kind: "condition",
      condition: {
        kind: "rating",
        discipline: "beach-2s",
        maximum: 4.5,
        basis: "anti-sandbag",
      },
    };
    const result = evaluateEligibility({
      rule,
      ruleVersion: 7,
      directorOverrideAllowed: true,
      context: {
        person: player,
        discipline: "beach-2s",
        currentRating: 4.1,
        peak52WeekRating: 5.2,
        asOfDate: "2026-07-30",
        organizationMemberships: [],
        inviteCodes: [],
        flags: [],
      },
    });
    expect(result.status).toBe("override-available");
    expect(result.reasons[0]).toContain("outside");
  });

  it("evaluates age on the configured cut date", () => {
    const rule: EligibilityRule = {
      kind: "condition",
      condition: { kind: "age", maximum: 16 },
    };
    const result = evaluateEligibility({
      rule,
      ruleVersion: 1,
      context: {
        person: player,
        discipline: "beach-2s",
        currentRating: 4,
        peak52WeekRating: 4,
        birthDate: "2010-09-02",
        asOfDate: "2026-09-01",
        organizationMemberships: [],
        inviteCodes: [],
        flags: [],
      },
    });
    expect(result.status).toBe("eligible");
  });
});
