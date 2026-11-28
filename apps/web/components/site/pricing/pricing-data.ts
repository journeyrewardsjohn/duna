import {
  DUNA_SERVICE_FEE_BPS,
  FREE_PLAN_FEE_BONUS,
  MEMBERSHIP_PLAN_IDS,
  MEMBERSHIP_PLANS,
  ORGANIZATION_PLAN_IDS,
  ORGANIZATION_PLANS,
  ORGANIZATION_VIDEO_ADD_ONS,
  ORGANIZATION_VIDEO_RATES,
  type MembershipPlanId,
  type OrganizationPlanId,
} from "@duna/core";
import {
  calculateOperatorProcessingFee,
  quoteCheckoutFees,
} from "@duna/pricing";

/**
 * Every figure the public pricing surfaces show, derived from the plan and
 * fee tables in code (`@duna/core`, `@duna/pricing`). Nothing here is typed
 * in: change a constant and the page changes with it (the pricing test
 * fails if a page and its constant ever disagree).
 */

const HOUR = 60 * 60;

/** "$0", "$199", "$9.99", "$1,990": whole dollars without cents. */
export function dollars(minor: number): string {
  const value = minor / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Always two decimals: "$40.00", "$3.00". For the calculator's rows. */
export function money(minor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** 500 bps → "5%", 250 → "2.5%", 750 → "7.5%". */
export function percent(bps: number): string {
  return `${bps / 100}%`;
}

function hours(seconds: number): number {
  return Math.round(seconds / HOUR);
}

export interface PlanCardModel {
  readonly id: string;
  readonly audience: "clubs" | "players";
  readonly name: string;
  readonly tagline: string;
  readonly monthlyMinor: number;
  readonly annualMinor: number;
  /** The fee line under the price ("5% fee on sales"). */
  readonly feeLine: string;
  /** Three inclusions, in the plan table's words or derived from its numbers. */
  readonly inclusions: readonly string[];
  /** The plan the spec highlights (the middle club plan, Premium). */
  readonly featured: boolean;
  /** Where its call to action goes, and what it says. */
  readonly cta: { readonly label: string; readonly href: string };
}

export function organizationFeeLine(bps: number): string {
  return bps === 0 ? "No Duna fee on sales" : `${percent(bps)} fee on sales`;
}

/** The three club plans, in the table's order. */
export function clubPlanCards(signupHref: (planId: string) => string) {
  return ORGANIZATION_PLAN_IDS.map((id: OrganizationPlanId): PlanCardModel => {
    const plan = ORGANIZATION_PLANS[id];
    const upload = hours(plan.monthlyUploadSeconds);
    const live = hours(plan.monthlyLiveSeconds);
    return {
      id,
      audience: "clubs",
      name: plan.name,
      tagline: plan.tagline,
      monthlyMinor: plan.monthlyPriceMinor,
      annualMinor: plan.annualPriceMinor,
      feeLine: organizationFeeLine(plan.defaultCommissionBps),
      inclusions: [
        id === "coach"
          ? "Every Duna HQ feature, with no monthly fee"
          : "Every Duna HQ feature, unlimited staff and players",
        `${upload} upload and ${live} live video hours a month`,
        id === "coach"
          ? `${hours(FREE_PLAN_FEE_BONUS.uploadSecondsPerStep)} more upload and ${hours(FREE_PLAN_FEE_BONUS.liveSecondsPerStep)} more live hours for every ${dollars(FREE_PLAN_FEE_BONUS.feeStepMinor)} in fees`
          : "Add video packs or pay as you go",
      ],
      featured: id === "small-club",
      cta: {
        label: id === "coach" ? "Start free" : `Choose ${plan.name}`,
        href: signupHref(id),
      },
    };
  });
}

/** The three player plans, in the table's order. */
export function playerPlanCards(premiumHref: string, freeHref: string) {
  return MEMBERSHIP_PLAN_IDS.map((id: MembershipPlanId): PlanCardModel => {
    const plan = MEMBERSHIP_PLANS[id];
    const upload = hours(plan.monthlyUploadSeconds);
    const live = hours(plan.monthlyLiveSeconds);
    return {
      id,
      audience: "players",
      name: id === "free" ? "Free" : `Duna ${plan.name}`,
      tagline: plan.tagline,
      monthlyMinor: plan.monthlyPriceMinor,
      annualMinor: plan.annualPriceMinor,
      feeLine: plan.transactionFeeWaived
        ? "No service fee on bookings"
        : `${percent(DUNA_SERVICE_FEE_BPS)} service fee on bookings`,
      inclusions: [
        id === "free"
          ? "Find games, book, keep score and get your Sand Rating"
          : (plan.benefits.find((benefit) =>
              /rating|insights/i.test(benefit),
            ) ?? plan.benefits[plan.benefits.length - 1]!),
        live > 0
          ? `${upload} hours of uploaded video and ${live} live hours a month`
          : `${upload} hours of uploaded video a month`,
        "Cloud video library and shareable clips",
      ],
      featured: id === "premium",
      cta:
        id === "free"
          ? { label: "Join free", href: freeHref }
          : { label: `Get ${plan.name}`, href: premiumHref },
    };
  });
}

/** What a yearly plan saves against twelve months, in whole dollars. */
export function yearlySavingMinor(card: PlanCardModel): number {
  return Math.max(0, card.monthlyMinor * 12 - card.annualMinor);
}

/* ------------------------------------------------------------------ */
/* Fees, explained                                                     */
/* ------------------------------------------------------------------ */

/** The card and bank processing estimates, read from the fee functions. */
export function processingTerms() {
  const card = calculateOperatorProcessingFee({
    amountMinor: 10_000,
    currency: "USD",
    method: "online-card",
  }).ruleInputs;
  const bank = calculateOperatorProcessingFee({
    amountMinor: 10_000,
    currency: "USD",
    method: "ach",
  }).ruleInputs;
  const cardText = `${percent(Number(card.rateBps))} + ${money(Number(card.fixedMinor))}`;
  const bankText = `${percent(Number(bank.rateBps))}, capped at ${dollars(Number(bank.capMinor))}`;
  return { card: cardText, bank: bankText };
}

export const feeFacts = {
  serviceFee: percent(DUNA_SERVICE_FEE_BPS),
  freeClubFee: percent(ORGANIZATION_PLANS.coach.defaultCommissionBps),
  clubFee: percent(ORGANIZATION_PLANS["small-club"].defaultCommissionBps),
  scaleFee: percent(ORGANIZATION_PLANS.club.defaultCommissionBps),
  premiumMonthly: dollars(MEMBERSHIP_PLANS.premium.monthlyPriceMinor),
  premiumYearly: dollars(MEMBERSHIP_PLANS.premium.annualPriceMinor),
  premiumPlusMonthly: dollars(
    MEMBERSHIP_PLANS["premium-plus"].monthlyPriceMinor,
  ),
  premiumPlusYearly: dollars(MEMBERSHIP_PLANS["premium-plus"].annualPriceMinor),
  uploadHour: money(ORGANIZATION_VIDEO_RATES.upload.customerPriceMinor),
  liveHour: money(ORGANIZATION_VIDEO_RATES.live.customerPriceMinor),
  uploadPack: `${ORGANIZATION_VIDEO_ADD_ONS.upload.hours} upload hours for ${dollars(ORGANIZATION_VIDEO_ADD_ONS.upload.monthlyPriceMinor)} a month`,
  livePack: `${ORGANIZATION_VIDEO_ADD_ONS.live.hours} live hours for ${dollars(ORGANIZATION_VIDEO_ADD_ONS.live.monthlyPriceMinor)} a month`,
} as const;

/** The calculator's choices. Plans come from the club plan table. */
export const calculatorPlans = ORGANIZATION_PLAN_IDS.map((id) => ({
  id,
  label: `${ORGANIZATION_PLANS[id].name} (${organizationFeeLine(ORGANIZATION_PLANS[id].defaultCommissionBps).toLowerCase()})`,
  rateBps: ORGANIZATION_PLANS[id].defaultCommissionBps,
}));

export type CalculatorTender = "online-card" | "ach";

export interface CalculatorInput {
  readonly priceMinor: number;
  readonly planId: OrganizationPlanId;
  readonly premium: boolean;
  readonly tender: CalculatorTender;
}

export interface CalculatorResult {
  readonly playerPaysMinor: number;
  readonly bookingMinor: number;
  readonly serviceFeeMinor: number;
  readonly organizationFeeMinor: number;
  readonly processingMinor: number;
  readonly paidOutMinor: number;
}

/**
 * Where every dollar of one booking goes, from the one fee composition every
 * checkout uses (`quoteCheckoutFees`). The club's payout is the booking less
 * Duna's fee on its plan and the processing estimate; the service fee is the
 * player's, on top of the price.
 */
export function calculateBooking(input: CalculatorInput): CalculatorResult {
  const priceMinor = Math.max(0, Math.round(input.priceMinor));
  const plan = ORGANIZATION_PLANS[input.planId];
  const quote = quoteCheckoutFees({
    items: [
      {
        id: "booking",
        kind: "booking",
        description: "Booking",
        quantity: 1,
        unitAmountMinor: priceMinor,
      },
    ],
    currency: "USD",
    isDunaPlus: input.premium,
    tender: input.tender,
    commission: {
      rateBps: plan.defaultCommissionBps,
      organizationId: "pricing-example",
      plan: plan.id,
      source: "plan-default",
    },
  });
  const organizationFeeMinor = quote.organizationFee?.amountMinor ?? 0;
  const processingMinor = quote.processingFee?.amountMinor ?? 0;
  return {
    playerPaysMinor: quote.priced.totalMinor,
    bookingMinor: quote.priced.subtotalMinor,
    serviceFeeMinor: quote.serviceFeeMinor,
    organizationFeeMinor,
    processingMinor,
    paidOutMinor: Math.max(
      0,
      quote.priced.subtotalMinor - organizationFeeMinor - processingMinor,
    ),
  };
}

export const DEFAULT_CALCULATOR_INPUT: CalculatorInput = {
  priceMinor: 4_000,
  planId: "coach",
  premium: false,
  tender: "online-card",
};
