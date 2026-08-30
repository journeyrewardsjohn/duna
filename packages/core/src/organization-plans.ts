const HOUR_SECONDS = 60 * 60;

export const ORGANIZATION_PLAN_IDS = ["coach", "small-club", "club"] as const;

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

export interface OrganizationVideoRate {
  readonly label: string;
  readonly unitHours: number;
  readonly estimatedProviderCostMinor: number;
  readonly customerPriceMinor: number;
}

export const ORGANIZATION_FEE_POLICY_VERSION = "organization-commission-v2";
export const FREE_ORGANIZATION_COMMISSION_BPS = 500;
export const CLUB_ORGANIZATION_COMMISSION_BPS = 250;
export const VIDEO_COST_MARKUP_MULTIPLIER = 5;

// Uploaded video is stored in R2. The cost model assumes a 1080p source at
// roughly 8 Mbps (3.6 GB per hour) for one GB-month at the published R2 rate.
// Live video keeps the conservative Mux Plus 1080p input plus one month of
// storage as its billing cost basis. Cloudflare-routed tiers create additional
// margin; simulcast and audience delivery remain separately monitored COGS.
// Customer rates are 5x this modeled origin cost, rounded to the cent.
export const ORGANIZATION_VIDEO_RATES = {
  upload: {
    label: "uploaded video",
    unitHours: 1,
    estimatedProviderCostMinor: 5.4,
    customerPriceMinor: 27,
  },
  live: {
    label: "live video",
    unitHours: 1,
    estimatedProviderCostMinor: 205.6,
    customerPriceMinor: 1_028,
  },
} as const satisfies Readonly<Record<"upload" | "live", OrganizationVideoRate>>;

export const ORGANIZATION_VIDEO_ADD_ONS = {
  upload: {
    hours: 10,
    monthlyPriceMinor: ORGANIZATION_VIDEO_RATES.upload.customerPriceMinor * 10,
  },
  live: {
    hours: 2,
    monthlyPriceMinor: ORGANIZATION_VIDEO_RATES.live.customerPriceMinor * 2,
  },
} as const;

export const FREE_PLAN_FEE_BONUS = {
  feeStepMinor: 4_000,
  uploadSecondsPerStep: 10 * HOUR_SECONDS,
  liveSecondsPerStep: 2 * HOUR_SECONDS,
} as const;

export const ORGANIZATION_PLANS: Readonly<
  Record<OrganizationPlanId, OrganizationPlanDefinition>
> = {
  coach: {
    id: "coach",
    name: "Free",
    productName: "Duna HQ Free",
    tagline: "Run your entire organization with no monthly software fee.",
    monthlyPriceMinor: 0,
    annualPriceMinor: 0,
    defaultCommissionBps: FREE_ORGANIZATION_COMMISSION_BPS,
    monthlyUploadSeconds: 10 * HOUR_SECONDS,
    monthlyLiveSeconds: 2 * HOUR_SECONDS,
    features: [
      "Every Duna HQ feature, with unlimited staff and player records",
      "Indoor, beach, or combined club operations",
      "10 uploaded-video hours and 2 live hours each month",
      "Earn 10 upload + 2 live hours for every $40 in organization fees",
      "5% organization transaction fee, plus payment processing",
    ],
  },
  "small-club": {
    id: "small-club",
    name: "Club",
    productName: "Duna HQ Club",
    tagline: "Lower transaction costs for organizations building momentum.",
    monthlyPriceMinor: 19_900,
    annualPriceMinor: 199_000,
    defaultCommissionBps: CLUB_ORGANIZATION_COMMISSION_BPS,
    monthlyUploadSeconds: 100 * HOUR_SECONDS,
    monthlyLiveSeconds: 10 * HOUR_SECONDS,
    features: [
      "Every Duna HQ feature",
      "Unlimited staff, players, venues, products, and events",
      "100 uploaded-video hours and 10 live hours each month",
      "2.5% organization transaction fee, plus payment processing",
      "Add video packs or use pay as you go",
    ],
  },
  club: {
    id: "club",
    name: "Scale",
    productName: "Duna HQ Scale",
    tagline: "Keep every dollar you earn as your operation scales.",
    monthlyPriceMinor: 49_900,
    annualPriceMinor: 499_000,
    defaultCommissionBps: 0,
    monthlyUploadSeconds: 500 * HOUR_SECONDS,
    monthlyLiveSeconds: 40 * HOUR_SECONDS,
    features: [
      "Every Duna HQ feature",
      "Unlimited staff, players, venues, products, and events",
      "500 uploaded-video hours and 40 live hours each month",
      "0% organization transaction fee",
      "Add video packs or use pay as you go",
    ],
  },
};

export const PAID_ORGANIZATION_PLAN_IDS = [
  "small-club",
  "club",
] as const satisfies readonly PaidOrganizationPlanId[];

export function isOrganizationPlanId(
  value: string,
): value is OrganizationPlanId {
  return ORGANIZATION_PLAN_IDS.includes(value as OrganizationPlanId);
}

export function organizationPlan(value: string): OrganizationPlanDefinition {
  // The retired Network plan folds into Scale so historical demo rows retain
  // the intended highest-tier economics before the migration runs.
  if (value === "multi-venue") return ORGANIZATION_PLANS.club;
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

export function freePlanVideoBonusSteps(feesCollectedMinor: number): number {
  if (!Number.isFinite(feesCollectedMinor) || feesCollectedMinor <= 0) return 0;
  return Math.floor(feesCollectedMinor / FREE_PLAN_FEE_BONUS.feeStepMinor);
}

export function freePlanVideoBonus(feesCollectedMinor: number): {
  readonly steps: number;
  readonly uploadSeconds: number;
  readonly liveSeconds: number;
} {
  const steps = freePlanVideoBonusSteps(feesCollectedMinor);
  return {
    steps,
    uploadSeconds: steps * FREE_PLAN_FEE_BONUS.uploadSecondsPerStep,
    liveSeconds: steps * FREE_PLAN_FEE_BONUS.liveSecondsPerStep,
  };
}

export function netCollectedOrganizationFeeMinor(input: {
  readonly grossMinor: number;
  readonly organizationFeeMinor: number;
  readonly refundedMinor: number;
  readonly disputedMinor: number;
}): number {
  if (input.grossMinor <= 0 || input.organizationFeeMinor <= 0) return 0;
  const reversedMinor = Math.min(
    input.grossMinor,
    Math.max(0, input.refundedMinor) + Math.max(0, input.disputedMinor),
  );
  return Math.max(
    0,
    Math.floor(
      (input.organizationFeeMinor * (input.grossMinor - reversedMinor)) /
        input.grossMinor,
    ),
  );
}

export function incrementalVideoOverageSeconds(input: {
  readonly usedSeconds: number;
  readonly includedSeconds: number;
  readonly completedSeconds: number;
}): number {
  const after = Math.max(0, input.usedSeconds - input.includedSeconds);
  const before = Math.max(
    0,
    input.usedSeconds - input.completedSeconds - input.includedSeconds,
  );
  return Math.max(0, after - before);
}
