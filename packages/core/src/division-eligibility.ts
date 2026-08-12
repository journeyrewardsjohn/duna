export interface DivisionEligibilityCriteria {
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
  readonly ageMinimum?: number;
  readonly ageMaximum?: number;
  readonly gender?: string;
}

export interface DivisionEligibilityParticipant {
  readonly rating: number;
  readonly birthDate?: string | null;
  readonly genderCategory?: string | null;
}

function ageOnDate(birthDate: string, asOf: Date): number | undefined {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return undefined;
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayHasPassed =
    asOf.getUTCMonth() > birth.getUTCMonth() ||
    (asOf.getUTCMonth() === birth.getUTCMonth() &&
      asOf.getUTCDate() >= birth.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age;
}

function genderReason(
  requirement?: string,
  candidate?: string | null,
): string | undefined {
  const required = requirement?.trim().toLowerCase() ?? "";
  const value = candidate?.trim().toLowerCase() ?? "";
  const womenOnly = /women|woman|female|girls?/.test(required);
  const menOnly =
    !womenOnly && /(^|\W)(men|man|male|boys?)(\W|$)/.test(required);
  if (!womenOnly && !menOnly) return undefined;
  if (!value) return "Gender eligibility is not verified";
  const matchesWomen = /women|woman|female|girls?/.test(value);
  const matchesMen = /(^|\W)(men|man|male|boys?)(\W|$)/.test(value);
  if ((womenOnly && matchesWomen) || (menOnly && matchesMen)) {
    return undefined;
  }
  return womenOnly ? "This is a women's division" : "This is a men's division";
}

export function evaluateDivisionCriteria(input: {
  readonly criteria: DivisionEligibilityCriteria;
  readonly participant: DivisionEligibilityParticipant;
  readonly asOf: Date;
}): { readonly eligible: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = [];
  if (
    input.criteria.ratingMinimum !== undefined &&
    input.participant.rating < input.criteria.ratingMinimum
  ) {
    reasons.push(
      `Rating must be ${input.criteria.ratingMinimum.toFixed(2)} or higher`,
    );
  }
  if (
    input.criteria.ratingMaximum !== undefined &&
    input.participant.rating > input.criteria.ratingMaximum
  ) {
    reasons.push(
      `Rating must be ${input.criteria.ratingMaximum.toFixed(2)} or lower`,
    );
  }

  const requiresAge =
    input.criteria.ageMinimum !== undefined ||
    input.criteria.ageMaximum !== undefined;
  const age = input.participant.birthDate
    ? ageOnDate(input.participant.birthDate, input.asOf)
    : undefined;
  if (requiresAge && age === undefined) {
    reasons.push("Age eligibility is not verified");
  } else if (age !== undefined) {
    if (
      input.criteria.ageMinimum !== undefined &&
      age < input.criteria.ageMinimum
    ) {
      reasons.push(`Must be ${input.criteria.ageMinimum} or older`);
    }
    if (
      input.criteria.ageMaximum !== undefined &&
      age > input.criteria.ageMaximum
    ) {
      reasons.push(`Must be ${input.criteria.ageMaximum} or younger`);
    }
  }

  const gender = genderReason(
    input.criteria.gender,
    input.participant.genderCategory,
  );
  if (gender) reasons.push(gender);
  return { eligible: reasons.length === 0, reasons };
}
