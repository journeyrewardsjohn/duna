import type { PersonRole } from "./types";

export type ProfileVisibility = "private" | "guardians" | "members" | "public";
export type AgeBand = "under-13" | "13-17" | "adult";

export interface IdentityPolicyInput {
  readonly birthDate: string;
  readonly profileVisibility: ProfileVisibility;
  readonly parentalConsentAt?: string;
  readonly verifiedGuardianIds: readonly string[];
  readonly evaluatedAt: string;
}

export interface IdentityPolicyDecision {
  readonly age: number;
  readonly ageBand: AgeBand;
  readonly isMinor: boolean;
  readonly guardianRequired: boolean;
  readonly parentalConsentRequired: boolean;
  readonly messagingGuardianCopyRequired: boolean;
  readonly walletCustodianRequired: boolean;
  readonly allowed: boolean;
  readonly violations: readonly (
    | "invalid-birth-date"
    | "verified-guardian-required"
    | "parental-consent-required"
    | "minor-profile-must-not-be-public"
  )[];
}

function parseCalendarDate(value: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function ageOnDate(
  birthDate: string,
  evaluatedAt: string,
): number | null {
  const birth = parseCalendarDate(birthDate);
  const evaluated = new Date(evaluatedAt);
  if (!birth || Number.isNaN(evaluated.getTime())) return null;

  const evaluatedYear = evaluated.getUTCFullYear();
  const evaluatedMonth = evaluated.getUTCMonth() + 1;
  const evaluatedDay = evaluated.getUTCDate();
  let age = evaluatedYear - birth.year;
  if (
    evaluatedMonth < birth.month ||
    (evaluatedMonth === birth.month && evaluatedDay < birth.day)
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function evaluateIdentityPolicy(
  input: IdentityPolicyInput,
): IdentityPolicyDecision {
  const age = ageOnDate(input.birthDate, input.evaluatedAt);
  if (age === null) {
    return {
      age: -1,
      ageBand: "under-13",
      isMinor: true,
      guardianRequired: true,
      parentalConsentRequired: true,
      messagingGuardianCopyRequired: true,
      walletCustodianRequired: true,
      allowed: false,
      violations: ["invalid-birth-date"],
    };
  }

  const ageBand: AgeBand = age < 13 ? "under-13" : age < 18 ? "13-17" : "adult";
  const isMinor = ageBand !== "adult";
  const violations: IdentityPolicyDecision["violations"][number][] = [];

  if (isMinor && input.verifiedGuardianIds.length === 0) {
    violations.push("verified-guardian-required");
  }
  if (ageBand === "under-13" && !input.parentalConsentAt) {
    violations.push("parental-consent-required");
  }
  if (isMinor && input.profileVisibility === "public") {
    violations.push("minor-profile-must-not-be-public");
  }

  return {
    age,
    ageBand,
    isMinor,
    guardianRequired: isMinor,
    parentalConsentRequired: ageBand === "under-13",
    messagingGuardianCopyRequired: isMinor,
    walletCustodianRequired: isMinor,
    allowed: violations.length === 0,
    violations,
  };
}

export function mergePersonRoles(
  ...roleSets: readonly (readonly PersonRole[])[]
): readonly PersonRole[] {
  return [...new Set(roleSets.flat())];
}

export interface MajorityTransition {
  readonly graduated: boolean;
  readonly guardianRelationshipBecomesEmergencyContact: boolean;
  readonly walletRepaperingRequired: boolean;
  readonly publicProfileStillRequiresOptIn: boolean;
}

export function evaluateMajorityTransition(input: {
  readonly birthDate: string;
  readonly previouslyMinor: boolean;
  readonly evaluatedAt: string;
}): MajorityTransition {
  const age = ageOnDate(input.birthDate, input.evaluatedAt);
  const graduated = input.previouslyMinor && age !== null && age >= 18;
  return {
    graduated,
    guardianRelationshipBecomesEmergencyContact: graduated,
    walletRepaperingRequired: graduated,
    publicProfileStillRequiresOptIn: graduated,
  };
}
