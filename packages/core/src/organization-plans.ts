const HOUR_SECONDS = 60 * 60;

export const ORGANIZATION_PLAN_IDS = [
  "coach",
  "small-club",
  "club",
  "multi-venue",
] as const;

export type OrganizationPlanId = (typeof ORGANIZATION_PLAN_IDS)[number];
export type PaidOrganizationPlanId = Exclude<OrganizationPlanId, "coach">;
export type OrganizationBillingInterval = "month" | "year";

export interface OrganizationPlanDefinition {
  readonly id: OrganizationPlanId;
  readonly name: string;
  readonly productName: string;
  readonly tagline: string;
  readonly monthlyPriceMinor: number;
  readonly annualPriceMinor: number;
  readonly defaultCommissionBps: number;
  readonly monthlyUploadSeconds: number;
  readonly monthlyLiveSeconds: number;
  readonly features: readonly string[];
}

export const ORGANIZATION_FEE_POLICY_VERSION = "organization-commission-v1";
export const FREE_ORGANIZATION_COMMISSION_BPS = 500;

export const ORGANIZATION_PLANS: Readonly<
  Record<OrganizationPlanId, OrganizationPlanDefinition>
> = {
  coach: {
    id: "coach",
    name: "Free",
    productName: "Coach & Organizer",
    tagline: "Start a coaching business and pay only when you sell.",
    monthlyPriceMinor: 0,
    annualPriceMinor: 0,
    defaultCommissionBps: FREE_ORGANIZATION_COMMISSION_BPS,
    monthlyUploadSeconds: 4 * HOUR_SECONDS,
    monthlyLiveSeconds: 2 * HOUR_SECONDS,
    features: [
      "Public coach or organizer profile and booking",
      "Events, services, clients, and basic reporting",
      "4 uploaded-video hours and 2 live hours each month",
      "5% organization transaction fee, plus payment processing",
    ],
  },
  "small-club": {
    id: "small-club",
    name: "Club",
    productName: "Duna HQ Club",
    tagline: "Memberships, programming, and staff tools for a growing club.",
    monthlyPriceMinor: 19_900,
    annualPriceMinor: 199_000,
    defaultCommissionBps: 0,
    monthlyUploadSeconds: 100 * HOUR_SECONDS,
    monthlyLiveSeconds: 10 * HOUR_SECONDS,
    features: [
      "Everything in Free",
      "Memberships, packages, credits, and marketing",
      "Unlimited staff and player records",
      "100 uploaded-video hours and 10 live hours each month",
      "No organization transaction fee",
    ],
  },
  club: {
    id: "club",
    name: "Facility",
    productName: "Duna HQ Facility",
    tagline: "Full court inventory and operations for a busy facility.",
    monthlyPriceMinor: 49_900,
    annualPriceMinor: 499_000,
    defaultCommissionBps: 0,
    monthlyUploadSeconds: 500 * HOUR_SECONDS,
    monthlyLiveSeconds: 40 * HOUR_SECONDS,
    features: [
      "Everything in Club",
      "Court rentals, facility controls, and advanced reporting",
      "Unlimited staff and player records",
      "500 uploaded-video hours and 40 live hours each month",
      "No organization transaction fee",
    ],
  },
  "multi-venue": {
    id: "multi-venue",
    name: "Network",
    productName: "Duna HQ Network",
    tagline: "One operating model across multiple venues or brands.",
    monthlyPriceMinor: 99_900,
    annualPriceMinor: 999_000,
    defaultCommissionBps: 0,
    monthlyUploadSeconds: 1_000 * HOUR_SECONDS,
    monthlyLiveSeconds: 100 * HOUR_SECONDS,
    features: [
      "Everything in Facility",
      "Cross-location controls, reporting, and pooled video usage",
      "Unlimited staff and player records",
      "1,000 uploaded-video hours and 100 live hours each month",
      "No organization transaction fee",
    ],
  },
};

export const PAID_ORGANIZATION_PLAN_IDS = [
  "small-club",
  "club",
  "multi-venue",
] as const satisfies readonly PaidOrganizationPlanId[];

export function isOrganizationPlanId(
  value: string,
): value is OrganizationPlanId {
  return ORGANIZATION_PLAN_IDS.includes(value as OrganizationPlanId);
}

export function organizationPlan(value: string): OrganizationPlanDefinition {
  return ORGANIZATION_PLANS[isOrganizationPlanId(value) ? value : "coach"];
}

export function organizationPlanPriceMinor(
  plan: PaidOrganizationPlanId,
  interval: OrganizationBillingInterval,
): number {
  const definition = ORGANIZATION_PLANS[plan];
  return interval === "month"
    ? definition.monthlyPriceMinor
    : definition.annualPriceMinor;
}
