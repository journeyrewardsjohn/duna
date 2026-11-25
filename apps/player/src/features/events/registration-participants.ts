import {
  evaluateDivisionCriteria,
  type EventDivisionSummary,
  type PersonSummary,
} from "@duna/core";

export interface RegistrationParticipant {
  readonly person: PersonSummary;
  readonly label: string;
  readonly available: boolean;
  readonly birthDate?: string;
  readonly ageBand?: "unknown" | "under-13" | "teen" | "adult";
  readonly genderCategory?: string;
}

export function registrationParticipantEligibility(
  participant: RegistrationParticipant | undefined,
  division: EventDivisionSummary | undefined,
  eligibilityDate: string,
) {
  if (!participant?.available) {
    return { eligible: false, reason: "Guardian verification required" };
  }
  const result = evaluateDivisionCriteria({
    asOf: new Date(eligibilityDate),
    criteria: {
      ageMaximum: division?.ageMaximum,
      ageMinimum: division?.ageMinimum,
      gender: division?.gender,
      ratingMaximum: division?.ratingMaximum,
      ratingMinimum: division?.ratingMinimum,
    },
    participant: {
      birthDate: participant.birthDate,
      genderCategory: participant.genderCategory,
      rating: participant.person.rating.display,
    },
  });
  return {
    eligible: result.eligible,
    reason: result.eligible ? "Eligible" : result.reasons.join(" · "),
  };
}

export function registrationParticipantAge(
  participant: RegistrationParticipant,
  eligibilityDate: string,
) {
  if (participant.birthDate) {
    return `Age ${Math.max(
      0,
      Math.floor(
        (new Date(eligibilityDate).getTime() -
          new Date(`${participant.birthDate}T00:00:00Z`).getTime()) /
          (365.2425 * 24 * 60 * 60_000),
      ),
    )}`;
  }
  return participant.ageBand && participant.ageBand !== "unknown"
    ? participant.ageBand.replace("under-13", "Under 13")
    : "Age not set";
}
