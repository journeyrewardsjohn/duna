const HOUR_SECONDS = 60 * 60;

export const MEMBERSHIP_PLAN_IDS = ["free", "premium", "premium-plus"] as const;

export type MembershipPlanId = (typeof MEMBERSHIP_PLAN_IDS)[number];
export type PaidMembershipPlanId = Exclude<MembershipPlanId, "free">;
export type MembershipBillingInterval = "month" | "year";

export interface MembershipPlanDefinition {
  readonly id: MembershipPlanId;
  readonly name: string;
  readonly tagline: string;
  readonly monthlyPriceMinor: number;
  readonly annualPriceMinor: number;
  readonly monthlyUploadSeconds: number;
  readonly monthlyLiveSeconds: number;
  readonly transactionFeeWaived: boolean;
  readonly benefits: readonly string[];
}

export const DUNA_SERVICE_FEE_BPS = 750;

export const MEMBERSHIP_PLANS: Readonly<
  Record<MembershipPlanId, MembershipPlanDefinition>
> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Play, connect, and start building your video library.",
    monthlyPriceMinor: 0,
    annualPriceMinor: 0,
    monthlyUploadSeconds: 4 * HOUR_SECONDS,
    monthlyLiveSeconds: 0,
    transactionFeeWaived: false,
    benefits: [
      "4 hours of uploaded video each month",
      "Cloud video library and shareable clips",
      "Player profile, ratings, matches, and community",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    tagline: "The everyday plan for players who record and broadcast.",
    monthlyPriceMinor: 999,
    annualPriceMinor: 9_900,
    monthlyUploadSeconds: 8 * HOUR_SECONDS,
    monthlyLiveSeconds: 2 * HOUR_SECONDS,
    transactionFeeWaived: true,
    benefits: [
      "No Duna service fees on eligible purchases",
      "8 hours of uploaded video each month",
      "2 hours of live broadcasting each month",
      "Cloud video library and shareable clips",
      "Full rating history and partner insights",
    ],
  },
  "premium-plus": {
    id: "premium-plus",
    name: "Premium+",
    tagline: "More live time and footage for coaches, teams, and creators.",
    monthlyPriceMinor: 2_999,
    annualPriceMinor: 29_900,
    monthlyUploadSeconds: 30 * HOUR_SECONDS,
    monthlyLiveSeconds: 8 * HOUR_SECONDS,
    transactionFeeWaived: true,
    benefits: [
      "No Duna service fees on eligible purchases",
      "30 hours of uploaded video each month",
      "8 hours of live broadcasting each month",
      "Cloud video library and shareable clips",
      "Advanced video insights and priority processing",
    ],
  },
};

export const PAID_MEMBERSHIP_PLAN_IDS = [
  "premium",
  "premium-plus",
] as const satisfies readonly PaidMembershipPlanId[];

export const PLATFORM_MEMBERSHIP_TIER_CODES = [
  "duna-plus-monthly",
  "duna-plus-annual",
  "duna-premium-monthly",
  "duna-premium-annual",
  "duna-premium-plus-monthly",
  "duna-premium-plus-annual",
] as const;

export function membershipPlanForTierCode(
  tierCode: string | undefined,
): MembershipPlanId {
  if (tierCode?.startsWith("duna-premium-plus-")) return "premium-plus";
  if (
    tierCode?.startsWith("duna-premium-") ||
    tierCode?.startsWith("duna-plus-")
  ) {
    return "premium";
  }
  return "free";
}

export function membershipPriceMinor(
  plan: PaidMembershipPlanId,
  interval: MembershipBillingInterval,
): number {
  const definition = MEMBERSHIP_PLANS[plan];
  return interval === "month"
    ? definition.monthlyPriceMinor
    : definition.annualPriceMinor;
}

export function membershipTierCode(
  plan: PaidMembershipPlanId,
  interval: MembershipBillingInterval,
): string {
  return `duna-${plan}-${interval === "month" ? "monthly" : "annual"}`;
}
