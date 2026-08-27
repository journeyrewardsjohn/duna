import { DUNA_SERVICE_FEE_BPS } from "@duna/core";

export type CurrencyCode = "USD" | "CAD" | "AUD" | "BRL" | "EUR";

export type OrderItemKind =
  | "booking"
  | "registration"
  | "membership"
  | "package"
  | "ticket"
  | "merchandise"
  | "wallet-load";

export interface PricedOrderItem {
  readonly id: string;
  readonly kind: OrderItemKind;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
}

export interface AppliedFee {
  readonly id:
    | "consumer-platform-v2"
    | "consumer-platform-v3"
    | "registration-service-v2"
    | "operator-online-v2"
    | "operator-present-v2"
    | "operator-ach-v2"
    | "organization-commission-v1"
    | "coach-marketplace-v2";
  readonly label: string;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly payer: "consumer" | "operator" | "coach";
  readonly ruleInputs: Readonly<Record<string, string | number | boolean>>;
}

export interface OrderPricing {
  readonly subtotalMinor: number;
  readonly fees: readonly AppliedFee[];
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  readonly dunaPlusSavingsMinor: number;
}

export type CourtRateAudience = "everyone" | "selected-users";

export interface CourtRatePlanCandidate {
  readonly id: string;
  readonly name: string;
  readonly baseAmountMinor: number;
  readonly memberAmountMinor?: number | null;
  readonly nonMemberAmountMinor?: number | null;
  readonly rateUnitMinutes: number;
  readonly audience: CourtRateAudience;
  readonly eligiblePersonIds?: readonly string[];
  readonly weekdays?: readonly number[];
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
  readonly specificDates?: readonly string[];
}

export interface QualifiedCourtRate {
  readonly planId: string;
  readonly planName: string;
  readonly amountMinor: number;
  readonly unitAmountMinor: number;
  readonly rateUnitMinutes: number;
  readonly priceKind: "member" | "public" | "base";
}

function weekdayForLocalDate(localDate: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return undefined;
  const parsed = new Date(`${localDate}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getUTCDay();
}

function courtRateApplies(input: {
  readonly plan: CourtRatePlanCandidate;
  readonly localDate: string;
  readonly personId?: string;
}): boolean {
  const { plan } = input;
  if (
    plan.audience === "selected-users" &&
    (!input.personId || !plan.eligiblePersonIds?.includes(input.personId))
  ) {
    return false;
  }
  if (plan.startsOn && input.localDate < plan.startsOn) return false;
  if (plan.endsOn && input.localDate > plan.endsOn) return false;
  if (
    plan.specificDates?.length &&
    !plan.specificDates.includes(input.localDate)
  ) {
    return false;
  }
  const weekday = weekdayForLocalDate(input.localDate);
  return (
    weekday !== undefined &&
    (!plan.weekdays?.length || plan.weekdays.includes(weekday))
  );
}

/**
 * Resolves the price for one player, court, duration, and venue-local date.
 * Every matching plan is normalized to the requested duration before the
 * lowest amount wins, so plans with different rate units remain comparable.
 */
export function selectLowestQualifiedCourtRate(input: {
  readonly plans: readonly CourtRatePlanCandidate[];
  readonly localDate: string;
  readonly durationMinutes: number;
  readonly isMember: boolean;
  readonly personId?: string;
}): QualifiedCourtRate | undefined {
  if (
    !Number.isSafeInteger(input.durationMinutes) ||
    input.durationMinutes <= 0
  )
    throw new Error("durationMinutes must be a positive integer");
  if (weekdayForLocalDate(input.localDate) === undefined)
    throw new Error("localDate must be an ISO calendar date");

  return input.plans
    .filter((plan) => courtRateApplies({ ...input, plan }))
    .map((plan): QualifiedCourtRate => {
      assertMinorAmount(plan.baseAmountMinor, `${plan.id}.baseAmountMinor`);
      if (
        !Number.isSafeInteger(plan.rateUnitMinutes) ||
        plan.rateUnitMinutes <= 0
      )
        throw new Error(
          `${plan.id}.rateUnitMinutes must be a positive integer`,
        );
      const memberPrice = plan.memberAmountMinor;
      const publicPrice = plan.nonMemberAmountMinor;
      if (memberPrice != null)
        assertMinorAmount(memberPrice, `${plan.id}.memberAmountMinor`);
      if (publicPrice != null)
        assertMinorAmount(publicPrice, `${plan.id}.nonMemberAmountMinor`);
      const priceKind = input.isMember
        ? memberPrice != null
          ? "member"
          : "base"
        : publicPrice != null
          ? "public"
          : "base";
      const unitAmountMinor = input.isMember
        ? (memberPrice ?? plan.baseAmountMinor)
        : (publicPrice ?? plan.baseAmountMinor);
      return {
        planId: plan.id,
        planName: plan.name,
        unitAmountMinor,
        rateUnitMinutes: plan.rateUnitMinutes,
        priceKind,
        amountMinor: Math.max(
          unitAmountMinor === 0 ? 0 : 1,
          Math.round(
            (unitAmountMinor * input.durationMinutes) / plan.rateUnitMinutes,
          ),
        ),
      };
    })
    .sort(
      (left, right) =>
        left.amountMinor - right.amountMinor ||
        left.planName.localeCompare(right.planName) ||
        left.planId.localeCompare(right.planId),
    )[0];
}

export const CONSUMER_FEE_ELIGIBLE_KINDS = [
  "booking",
  "registration",
  "membership",
  "package",
  "ticket",
] as const satisfies readonly OrderItemKind[];

const consumerFeeEligibleKinds = new Set<OrderItemKind>(
  CONSUMER_FEE_ELIGIBLE_KINDS,
);

function assertMinorAmount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative integer minor-unit amount`,
    );
  }
}

export function calculateConsumerPlatformFee(input: {
  readonly eligibleSubtotalMinor: number;
  readonly currency: CurrencyCode;
  readonly isDunaPlus: boolean;
}): AppliedFee {
  assertMinorAmount(input.eligibleSubtotalMinor, "eligibleSubtotalMinor");
  const rawAmount = Math.round(
    (input.eligibleSubtotalMinor * DUNA_SERVICE_FEE_BPS) / 10_000,
  );
  const amountMinor = input.isDunaPlus ? 0 : rawAmount;
  return {
    id: "consumer-platform-v3",
    label: "Duna service fee",
    amountMinor,
    currency: input.currency,
    payer: "consumer",
    ruleInputs: {
      eligibleSubtotalMinor: input.eligibleSubtotalMinor,
      rateBps: DUNA_SERVICE_FEE_BPS,
      isDunaPlus: input.isDunaPlus,
    },
  };
}

export function calculateOperatorProcessingFee(input: {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly method: "online-card" | "card-present" | "ach";
}): AppliedFee {
  assertMinorAmount(input.amountMinor, "amountMinor");
  if (input.method === "ach") {
    return {
      id: "operator-ach-v2",
      label: "ACH processing",
      amountMinor: Math.min(600, Math.round(input.amountMinor * 0.01)),
      currency: input.currency,
      payer: "operator",
      ruleInputs: {
        amountMinor: input.amountMinor,
        rateBps: 100,
        capMinor: 600,
      },
    };
  }
  const cardPresent = input.method === "card-present";
  const rate = cardPresent ? 0.028 : 0.03;
  const fixedMinor = cardPresent ? 15 : 35;
  return {
    id: cardPresent ? "operator-present-v2" : "operator-online-v2",
    label: cardPresent ? "Card-present processing" : "Online processing",
    amountMinor:
      input.amountMinor === 0
        ? 0
        : Math.round(input.amountMinor * rate) + fixedMinor,
    currency: input.currency,
    payer: "operator",
    ruleInputs: {
      amountMinor: input.amountMinor,
      rateBps: Math.round(rate * 10_000),
      fixedMinor,
    },
  };
}

export function calculateOrganizationCommissionFee(input: {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly rateBps: number;
  readonly organizationId: string;
  readonly plan: string;
  readonly source: "plan-default" | "admin-override";
}): AppliedFee {
  assertMinorAmount(input.amountMinor, "amountMinor");
  if (
    !Number.isSafeInteger(input.rateBps) ||
    input.rateBps < 0 ||
    input.rateBps > 2_500
  ) {
    throw new Error("organization commission must be between 0% and 25%");
  }
  return {
    id: "organization-commission-v1",
    label: "Duna organization transaction fee",
    amountMinor: Math.round((input.amountMinor * input.rateBps) / 10_000),
    currency: input.currency,
    payer: "operator",
    ruleInputs: {
      amountMinor: input.amountMinor,
      rateBps: input.rateBps,
      organizationId: input.organizationId,
      plan: input.plan,
      source: input.source,
    },
  };
}

export function priceConsumerOrder(input: {
  readonly items: readonly PricedOrderItem[];
  readonly currency: CurrencyCode;
  readonly isDunaPlus: boolean;
}): OrderPricing {
  for (const item of input.items) {
    assertMinorAmount(item.unitAmountMinor, `${item.id}.unitAmountMinor`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error(`${item.id}.quantity must be a positive integer`);
    }
  }
  const subtotalMinor = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitAmountMinor,
    0,
  );
  const eligibleSubtotalMinor = input.items
    .filter((item) => consumerFeeEligibleKinds.has(item.kind))
    .reduce((sum, item) => sum + item.quantity * item.unitAmountMinor, 0);
  const platformFee = calculateConsumerPlatformFee({
    eligibleSubtotalMinor,
    currency: input.currency,
    isDunaPlus: input.isDunaPlus,
  });
  const fees = [platformFee].filter((fee) => fee.amountMinor > 0);
  const dunaPlusSavingsMinor = input.isDunaPlus
    ? calculateConsumerPlatformFee({
        eligibleSubtotalMinor,
        currency: input.currency,
        isDunaPlus: false,
      }).amountMinor
    : 0;
  return {
    subtotalMinor,
    fees,
    totalMinor:
      subtotalMinor + fees.reduce((sum, fee) => sum + fee.amountMinor, 0),
    currency: input.currency,
    dunaPlusSavingsMinor,
  };
}
