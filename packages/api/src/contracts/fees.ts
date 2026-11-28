/**
 * Contract: fees (owner: B2, with the checkout owners). The fees a buyer is
 * shown before paying (player Service Fee, the Organization Fee inside
 * Duna's application fee, tax) and store-agnostic Duna Premium state.
 * Frozen by W3-0. Procedures: `player.fees.*`, `operator.fees.*` (see
 * docs/plan/w3-contracts.md). Prices are never invented here: amounts come
 * from @duna/pricing rules (`feeRuleVersion`) and the owner's plan table.
 */
import {
  payFeeQuoteSurfaces,
  premiumEventKinds,
  premiumIntervals,
  premiumStatuses,
  premiumStores,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3AmountSchema,
  w3BasisPointsSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
} from "./w3-common";

export const feesQuoteSurfaceSchema = z.enum(payFeeQuoteSurfaces);
export const feesPremiumStoreSchema = z.enum(premiumStores);
export const feesPremiumStatusSchema = z.enum(premiumStatuses);
export const feesPremiumIntervalSchema = z.enum(premiumIntervals);
export const feesPremiumEventKindSchema = z.enum(premiumEventKinds);

/** What the buyer is about to buy; the server prices it, never the client. */
export const feesQuoteInputSchema = z.object({
  organizationId: w3IdSchema,
  catalogItemId: w3IdSchema,
  variantId: w3IdSchema.optional(),
  quantity: z.number().int().min(1).max(50).default(1),
  surface: feesQuoteSurfaceSchema,
});

/** `pay_fee_quotes`: total = subtotal + service fee + tax. */
export const feesQuoteSchema = z
  .object({
    id: w3IdSchema,
    organizationId: w3IdSchema,
    catalogItemId: w3IdSchema.optional(),
    surface: feesQuoteSurfaceSchema,
    subtotal: w3AmountSchema,
    serviceFee: w3AmountSchema,
    /** Paid by the organisation out of proceeds; shown for transparency. */
    organizationFee: w3AmountSchema,
    processingEstimate: w3AmountSchema,
    tax: w3AmountSchema,
    total: w3AmountSchema,
    premiumApplied: z.boolean(),
    feeRuleVersion: z.string().min(1).max(32),
    lines: z.array(
      z.object({
        label: z.string().min(1),
        amount: w3AmountSchema,
        kind: z.enum(["item", "service-fee", "tax", "discount"]),
      }),
    ),
    shownAt: w3DateTimeSchema,
    expiresAt: w3DateTimeSchema.optional(),
  })
  .refine(
    (quote) =>
      quote.total.amountMinor ===
      quote.subtotal.amountMinor +
        quote.serviceFee.amountMinor +
        quote.tax.amountMinor,
    { message: "total must equal subtotal + service fee + tax" },
  );

export const feesPremiumEventSchema = z.object({
  id: w3IdSchema,
  kind: feesPremiumEventKindSchema,
  occurredAt: w3DateTimeSchema,
  note: z.string().optional(),
});

export const feesPremiumSubscriptionSchema = z.object({
  id: w3IdSchema,
  personId: w3IdSchema,
  store: feesPremiumStoreSchema,
  planKey: z.string().min(1).max(48),
  status: feesPremiumStatusSchema,
  billingInterval: feesPremiumIntervalSchema,
  price: w3AmountSchema,
  autoRenews: z.boolean(),
  trialEndsAt: w3DateTimeSchema.optional(),
  currentPeriodStartsAt: w3DateTimeSchema,
  currentPeriodEndsAt: w3DateTimeSchema,
  gracePeriodEndsAt: w3DateTimeSchema.optional(),
  cancelRequestedAt: w3DateTimeSchema.optional(),
  endedAt: w3DateTimeSchema.optional(),
  pendingPrice: w3AmountSchema.optional(),
  pendingPriceEffectiveAt: w3DateTimeSchema.optional(),
  /** Where the person manages billing: in Duna, or in the app store. */
  managedIn: z.enum(["duna", "app-store", "google-play"]),
  events: z.array(feesPremiumEventSchema),
});

/** The signed-in player's Premium: a subscription, a complimentary grant, or neither. */
export const feesPremiumStateSchema = z.object({
  active: z.boolean(),
  source: z.enum(["subscription", "complimentary", "none"]),
  subscription: feesPremiumSubscriptionSchema.optional(),
  complimentaryEndsAt: w3DateTimeSchema.optional(),
});

export const feesStartPremiumInputSchema = z.object({
  planKey: z.string().min(1).max(48),
  billingInterval: feesPremiumIntervalSchema,
  /** App-store purchases are confirmed by the store, not started here. */
  store: z.literal("duna-pay"),
  idempotencyKey: w3IdempotencyKeySchema,
});
/** Checkout for Premium: a hosted payment step, or an honest state. */
export const feesStartPremiumResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("checkout"), url: z.url() }),
  z.object({
    state: z.literal("active"),
    subscription: feesPremiumSubscriptionSchema,
  }),
  z.object({ state: z.literal("not-configured") }),
  z.object({
    state: z.literal("managed-by-store"),
    store: feesPremiumStoreSchema,
  }),
]);
export const feesCancelPremiumInputSchema = z.object({
  subscriptionId: w3IdSchema,
  idempotencyKey: w3IdempotencyKeySchema,
});

/** HQ: what Duna charges the organisation (DP-Intro, MN-Home "Duna fees"). */
export const feesPlatformSummarySchema = z.object({
  organizationId: w3IdSchema,
  planKey: z.string().min(1),
  /** Organization Fee on each sale, in basis points of the sale. */
  organizationFeeBps: w3BasisPointsSchema,
  monthlyPlanPrice: w3AmountSchema,
  /** Player Service Fee rule shown to buyers, described, not computed here. */
  serviceFeeDescription: z.string().min(1),
  processingDescription: z.string().min(1),
  thisMonth: z.object({
    organizationFees: w3AmountSchema,
    serviceFeesCollected: w3AmountSchema,
  }),
});

/**
 * PART-B (additive): `operator.fees.quote`, the operator-side all-in
 * preview for a price screen: what a player pays and what the club
 * receives, from the same composition checkout charges
 * (`quoteCheckoutFees`) and the club's plan. Nothing is recorded.
 */
export const feesOperatorQuoteInputSchema = z
  .object({
    offeringId: w3IdSchema.optional(),
    /** A price being edited that is not saved yet (card or cash). */
    priceMinor: z.number().int().min(0).max(100_000_000).optional(),
    /** With `priceMinor`: what is being priced (fees differ for goods). */
    offeringType: z
      .enum(["event", "service", "good", "plan"])
      .default("service"),
    offeringSubtype: z.string().max(48).optional(),
    currency: z.string().length(3),
    method: z.enum(["card", "cash", "credits"]),
    quantity: z.number().int().min(1).max(50).default(1),
  })
  .refine(
    (input) =>
      (input.offeringId === undefined) !== (input.priceMinor === undefined),
    { message: "Give an offering or a price, not both." },
  );

export const feesOperatorQuoteLineSchema = z.object({
  kind: z.enum(["item", "service-fee", "processing", "organization-fee"]),
  label: z.string().min(1),
  amount: w3AmountSchema,
  /** Who pays it: the player on top of the price, or the club out of it. */
  payer: z.enum(["player", "club"]),
});

export const feesOperatorQuoteSchema = z.union([
  z.object({
    status: z.literal("ok"),
    unit: z.literal("money"),
    method: z.enum(["card", "cash"]),
    quantity: z.number().int().positive(),
    price: w3AmountSchema,
    playerPays: w3AmountSchema,
    clubReceives: w3AmountSchema,
    /** Everything Duna keeps: service fee, processing, Organization Fee. */
    dunaFees: w3AmountSchema,
    lines: z.array(feesOperatorQuoteLineSchema),
    planKey: z.string().min(1),
    organizationFeeBps: w3BasisPointsSchema,
    /** A player with Duna Premium pays no Service Fee on this purchase. */
    premiumWaivesServiceFee: z.boolean(),
    feeRuleVersion: z.string().min(1).max(32),
  }),
  z.object({
    status: z.literal("ok"),
    unit: z.literal("credits"),
    method: z.literal("credits"),
    quantity: z.number().int().positive(),
    /** Credits a player spends; no money moves, so no fees. */
    playerPaysCredits: z.number().int().nonnegative(),
    clubReceivesCredits: z.number().int().nonnegative(),
    lines: z.array(feesOperatorQuoteLineSchema).length(0),
  }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum([
      "no-card-price",
      "no-credit-price",
      "card-not-accepted",
      "credits-not-accepted",
      "currency-not-supported",
      "currency-mismatch",
      "price-needed",
    ]),
    message: z.string().min(1),
  }),
]);

export type FeesOperatorQuote = z.infer<typeof feesOperatorQuoteSchema>;
export type FeesQuote = z.infer<typeof feesQuoteSchema>;
export type FeesPremiumState = z.infer<typeof feesPremiumStateSchema>;
export type FeesPremiumSubscription = z.infer<
  typeof feesPremiumSubscriptionSchema
>;
export type FeesPlatformSummary = z.infer<typeof feesPlatformSummarySchema>;
