import { describe, expect, it } from "vitest";
import {
  ageOnDate,
  evaluateIdentityPolicy,
  evaluateMajorityTransition,
  mergePersonRoles,
} from "./identity";

describe("identity and guardianship policy", () => {
  it("calculates age on the UTC calendar boundary", () => {
    expect(ageOnDate("2008-07-31", "2026-07-30T23:59:59Z")).toBe(17);
    expect(ageOnDate("2008-07-31", "2026-07-31T00:00:00Z")).toBe(18);
    expect(ageOnDate("not-a-date", "2026-07-30T00:00:00Z")).toBeNull();
  });

  it("requires consent, a verified guardian, and a non-public profile under 13", () => {
    const decision = evaluateIdentityPolicy({
      birthDate: "2016-02-14",
      profileVisibility: "public",
      verifiedGuardianIds: [],
      evaluatedAt: "2026-07-30T12:00:00Z",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toEqual([
      "verified-guardian-required",
      "parental-consent-required",
      "minor-profile-must-not-be-public",
    ]);
    expect(decision.messagingGuardianCopyRequired).toBe(true);
    expect(decision.walletCustodianRequired).toBe(true);
  });

  it("allows a consented minor with a verified guardian and private profile", () => {
    const decision = evaluateIdentityPolicy({
      birthDate: "2011-09-12",
      profileVisibility: "guardians",
      parentalConsentAt: "2025-01-01T00:00:00Z",
      verifiedGuardianIds: ["guardian-1", "guardian-2"],
      evaluatedAt: "2026-07-30T12:00:00Z",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.ageBand).toBe("13-17");
  });

  it("graduates permissions at 18 without silently making the profile public", () => {
    expect(
      evaluateMajorityTransition({
        birthDate: "2008-07-30",
        previouslyMinor: true,
        evaluatedAt: "2026-07-30T12:00:00Z",
      }),
    ).toEqual({
      graduated: true,
      guardianRelationshipBecomesEmergencyContact: true,
      walletRepaperingRequired: true,
      publicProfileStillRequiresOptIn: true,
    });
  });

  it("keeps one person with several roles instead of duplicate accounts", () => {
    expect(
      mergePersonRoles(["player", "guardian"], ["guardian", "coach"]),
    ).toEqual(["player", "guardian", "coach"]);
  });
});
