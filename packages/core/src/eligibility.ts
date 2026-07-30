import type { Discipline, PersonSummary } from "./types";

export type EligibilityContext = {
  readonly person: PersonSummary;
  readonly discipline: Discipline;
  readonly currentRating: number;
  readonly peak52WeekRating: number;
  readonly birthDate?: string;
  readonly asOfDate: string;
  readonly genderDivision?: string;
  readonly organizationMemberships: readonly {
    readonly organizationId: string;
    readonly tier?: string;
  }[];
  readonly inviteCodes: readonly string[];
  readonly flags: readonly string[];
};

export type EligibilityCondition =
  | {
      readonly kind: "rating";
      readonly discipline: Discipline;
      readonly minimum?: number;
      readonly maximum?: number;
      readonly basis: "current" | "peak-52-week" | "anti-sandbag";
    }
  | {
      readonly kind: "age";
      readonly minimum?: number;
      readonly maximum?: number;
    }
  | { readonly kind: "gender-division"; readonly value: string }
  | {
      readonly kind: "membership";
      readonly organizationId: string;
      readonly tier?: string;
    }
  | { readonly kind: "invite-code"; readonly value: string }
  | {
      readonly kind: "flag";
      readonly value: string;
      readonly mustExist: boolean;
    };

export type EligibilityRule =
  | { readonly kind: "condition"; readonly condition: EligibilityCondition }
  | {
      readonly kind: "all" | "any" | "none";
      readonly rules: readonly EligibilityRule[];
    };

export type EligibilityResult = {
  readonly status: "eligible" | "ineligible" | "override-available";
  readonly reasons: readonly string[];
  readonly ruleVersion: number;
};

function ageOnDate(birthDate: string, asOfDate: string): number {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    asOf.getUTCMonth() < birth.getUTCMonth() ||
    (asOf.getUTCMonth() === birth.getUTCMonth() &&
      asOf.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function evaluateCondition(
  condition: EligibilityCondition,
  context: EligibilityContext,
): { passes: boolean; reason: string } {
  switch (condition.kind) {
    case "rating": {
      const rating =
        condition.basis === "current"
          ? context.currentRating
          : condition.basis === "peak-52-week"
            ? context.peak52WeekRating
            : Math.max(context.currentRating, context.peak52WeekRating * 0.92);
      const passes =
        condition.discipline === context.discipline &&
        (condition.minimum === undefined || rating >= condition.minimum) &&
        (condition.maximum === undefined || rating <= condition.maximum);
      return {
        passes,
        reason: passes
          ? "Rating requirement met"
          : `Rating ${rating.toFixed(2)} is outside the allowed band`,
      };
    }
    case "age": {
      if (!context.birthDate) {
        return { passes: false, reason: "Birth date is required" };
      }
      const age = ageOnDate(context.birthDate, context.asOfDate);
      const passes =
        (condition.minimum === undefined || age >= condition.minimum) &&
        (condition.maximum === undefined || age <= condition.maximum);
      return {
        passes,
        reason: passes
          ? "Age requirement met"
          : `Age ${age} is outside the allowed range`,
      };
    }
    case "gender-division": {
      const passes = context.genderDivision === condition.value;
      return {
        passes,
        reason: passes
          ? "Division requirement met"
          : `Division requires ${condition.value}`,
      };
    }
    case "membership": {
      const passes = context.organizationMemberships.some(
        (membership) =>
          membership.organizationId === condition.organizationId &&
          (condition.tier === undefined || membership.tier === condition.tier),
      );
      return {
        passes,
        reason: passes
          ? "Membership requirement met"
          : condition.tier
            ? `${condition.tier} membership is required`
            : "Active membership is required",
      };
    }
    case "invite-code": {
      const passes = context.inviteCodes.includes(condition.value);
      return {
        passes,
        reason: passes ? "Invite accepted" : "A valid invite code is required",
      };
    }
    case "flag": {
      const exists = context.flags.includes(condition.value);
      const passes = condition.mustExist ? exists : !exists;
      return {
        passes,
        reason: passes
          ? "Account flag requirement met"
          : condition.mustExist
            ? `Required status is missing: ${condition.value}`
            : `Account status blocks entry: ${condition.value}`,
      };
    }
  }
}

function evaluateNode(
  rule: EligibilityRule,
  context: EligibilityContext,
): { passes: boolean; reasons: readonly string[] } {
  if (rule.kind === "condition") {
    const result = evaluateCondition(rule.condition, context);
    return {
      passes: result.passes,
      reasons: result.passes ? [] : [result.reason],
    };
  }

  const children = rule.rules.map((child) => evaluateNode(child, context));
  if (rule.kind === "all") {
    return {
      passes: children.every((child) => child.passes),
      reasons: children.flatMap((child) => child.reasons),
    };
  }
  if (rule.kind === "any") {
    const passes = children.some((child) => child.passes);
    return {
      passes,
      reasons: passes
        ? []
        : [
            "At least one entry path must be satisfied",
            ...children.flatMap((child) => child.reasons),
          ],
    };
  }
  const failing = children.filter((child) => child.passes);
  return {
    passes: failing.length === 0,
    reasons:
      failing.length === 0 ? [] : ["An excluded eligibility condition applies"],
  };
}

export function evaluateEligibility(input: {
  readonly rule: EligibilityRule;
  readonly ruleVersion: number;
  readonly context: EligibilityContext;
  readonly directorOverrideAllowed?: boolean;
}): EligibilityResult {
  const result = evaluateNode(input.rule, input.context);
  if (result.passes) {
    return {
      status: "eligible",
      reasons: [],
      ruleVersion: input.ruleVersion,
    };
  }
  return {
    status: input.directorOverrideAllowed ? "override-available" : "ineligible",
    reasons: result.reasons,
    ruleVersion: input.ruleVersion,
  };
}
