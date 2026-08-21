export const MARKETPLACE_TAX_POLICY_VERSION = "2026-08-18.1";

export const STRIPE_TAX_CODES = {
  nonTaxable: "txcd_00000000",
  tangibleGoods: "txcd_99999999",
  generalServices: "txcd_20030000",
  sportingFacilityParticipantAdmission: "txcd_50010002",
  sportingEventSpectatorAdmission: "txcd_50012001",
  participantCompetitionFee: "txcd_50012003",
  fitnessMembership: "txcd_50021001",
  fitnessClass: "txcd_50021003",
  singleUseFacilityAccess: "txcd_50021101",
  sportInstruction: "txcd_50021103",
  shipping: "txcd_92010001",
} as const;

export type CatalogTaxClassification = {
  readonly type: "event" | "service" | "good" | "plan";
  readonly subtype: string;
  readonly taxable: boolean;
  readonly explicitTaxCode?: string;
};

export function validStripeTaxCode(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  return normalized && /^txcd_\d{8}$/.test(normalized) ? normalized : undefined;
}

export function resolveCatalogTaxCode(input: CatalogTaxClassification): string {
  if (!input.taxable) return STRIPE_TAX_CODES.nonTaxable;
  const explicit = validStripeTaxCode(input.explicitTaxCode);
  if (explicit) return explicit;

  if (input.type === "good") return STRIPE_TAX_CODES.tangibleGoods;
  if (input.type === "event") {
    if (input.subtype === "tournament" || input.subtype === "league") {
      return STRIPE_TAX_CODES.participantCompetitionFee;
    }
    if (input.subtype === "clinic") return STRIPE_TAX_CODES.sportInstruction;
    return STRIPE_TAX_CODES.sportingFacilityParticipantAdmission;
  }
  if (input.type === "service") {
    if (input.subtype === "court-rental") {
      return STRIPE_TAX_CODES.singleUseFacilityAccess;
    }
    if (
      input.subtype === "private-lesson" ||
      input.subtype === "group-lesson" ||
      input.subtype === "assessment"
    ) {
      return STRIPE_TAX_CODES.sportInstruction;
    }
    if (input.subtype === "program") return STRIPE_TAX_CODES.fitnessClass;
    return STRIPE_TAX_CODES.generalServices;
  }
  if (input.subtype === "membership") {
    return STRIPE_TAX_CODES.fitnessMembership;
  }
  return STRIPE_TAX_CODES.generalServices;
}

export function resolveEventTaxCode(input: {
  readonly spectatorTicket: boolean;
  readonly eventKind?: string;
}): string {
  if (input.spectatorTicket) {
    return STRIPE_TAX_CODES.sportingEventSpectatorAdmission;
  }
  if (input.eventKind === "tournament" || input.eventKind === "league") {
    return STRIPE_TAX_CODES.participantCompetitionFee;
  }
  if (input.eventKind === "clinic") return STRIPE_TAX_CODES.sportInstruction;
  return STRIPE_TAX_CODES.sportingFacilityParticipantAdmission;
}

export function marketplaceAutomaticTax(enabled: boolean) {
  return {
    enabled,
    liability: enabled ? ({ type: "self" } as const) : undefined,
  };
}
