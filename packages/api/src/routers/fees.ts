/**
 * Router seam: fees (W3-0; owner: B2 with the checkout owners). Up-front fee
 * quotes and store-agnostic Duna Premium. Shapes are frozen in
 * ../contracts/fees.ts.
 *
 * Mounted once in ../router.ts as `player.fees` (protectedProcedure: the
 * signed-in player) and `operator.fees` (organizationProcedure
 * "payments:read").
 *
 * Every procedure returns its fixture from @duna/core/demo/fees in demo mode
 * and throws `notImplementedYet` otherwise. No payment provider or app store
 * is called from a stub.
 */
import { feesDemo } from "@duna/core/demo/fees";
import { TRPCError } from "@trpc/server";
import type { CurrencyCode } from "@duna/pricing";
import {
  organizationProcedure,
  protectedProcedure,
  rateLimitMiddleware,
  router,
} from "../auth";
import {
  feesCancelPremiumInputSchema,
  feesOperatorQuoteInputSchema,
  feesOperatorQuoteSchema,
  feesPlatformSummarySchema,
  feesPremiumStateSchema,
  feesQuoteInputSchema,
  feesQuoteSchema,
  feesStartPremiumInputSchema,
  feesStartPremiumResultSchema,
} from "../contracts/fees";
import { usesDemoData } from "../services/data-source";
import {
  composeOperatorQuote,
  quoteOperatorPrice,
} from "../services/fees/operator-quote";
import { quoteCatalogPurchase } from "../services/fees/quote";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "fees";

function demoSubscription(subscriptionId: string) {
  const subscription = feesDemo.subscriptions.find(
    (candidate) => candidate.id === subscriptionId,
  );
  if (!subscription) throw new TRPCError({ code: "NOT_FOUND" });
  return subscription;
}

export const feesOperatorRouter = router({
  status: organizationProcedure("payments:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** What Duna charges this organisation (DP-Intro, MN-Home "Duna fees"). */
  platformSummary: organizationProcedure("payments:read")
    .output(feesPlatformSummarySchema)
    .query(() => {
      if (usesDemoData()) return feesDemo.platformSummary;
      return notImplementedYet(DOMAIN, "platformSummary");
    }),

  /**
   * PART-B: the all-in preview on HQ price screens: what a player pays and
   * what the club receives, from checkout's own fee composition and the
   * club's plan. Records nothing; an unknown rate answers "unavailable".
   */
  quote: organizationProcedure("payments:read")
    .use(
      rateLimitMiddleware({
        id: "fees-operator-quote",
        capacity: 60,
        refillPerMinute: 60,
      }),
    )
    .input(feesOperatorQuoteInputSchema)
    .output(feesOperatorQuoteSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        if (input.method === "credits") {
          return {
            status: "ok" as const,
            unit: "credits" as const,
            method: "credits" as const,
            quantity: input.quantity,
            playerPaysCredits: 2 * input.quantity,
            clubReceivesCredits: 2 * input.quantity,
            lines: [],
          };
        }
        const summary = feesDemo.platformSummary;
        return composeOperatorQuote({
          currency: summary.monthlyPlanPrice.currency as CurrencyCode,
          method: input.method,
          title: input.offeringId ? "Thursday clinic" : "Price",
          kind: input.offeringType === "good" ? "merchandise" : "booking",
          offeringId: input.offeringId,
          // The demo clinic's card price when no draft price is given.
          unitPriceMinor: input.priceMinor ?? 3_000,
          quantity: input.quantity,
          commission: {
            rateBps: summary.organizationFeeBps,
            organizationId: summary.organizationId,
            plan: summary.planKey,
            source: "plan-default",
          },
        });
      }
      return quoteOperatorPrice({
        organizationId: ctx.organizationId,
        request: input,
      });
    }),
});

export const feesPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Price a purchase with every fee shown up front; records `pay_fee_quotes`. */
  quote: protectedProcedure
    .input(feesQuoteInputSchema)
    .output(feesQuoteSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return (
          feesDemo.quotes.find((quote) => quote.surface === input.surface) ??
          feesDemo.quotes[0]!
        );
      }
      return quoteCatalogPurchase({
        personId: ctx.actor.personId,
        request: input,
        now: ctx.now,
      });
    }),

  /** The signed-in player's Duna Premium. */
  premium: protectedProcedure.output(feesPremiumStateSchema).query(() => {
    if (usesDemoData()) return feesDemo.premiumState;
    return notImplementedYet(DOMAIN, "premium");
  }),

  startPremium: protectedProcedure
    .input(feesStartPremiumInputSchema)
    .output(feesStartPremiumResultSchema)
    .mutation(() => {
      if (usesDemoData()) return { state: "not-configured" as const };
      return notImplementedYet(DOMAIN, "startPremium");
    }),

  /** Cancel at period end; never immediate, never without the person. */
  cancelPremium: protectedProcedure
    .input(feesCancelPremiumInputSchema)
    .output(feesPremiumStateSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const subscription = demoSubscription(input.subscriptionId);
        return {
          active: true,
          source: "subscription" as const,
          subscription: {
            ...subscription,
            status: "cancel-at-period-end" as const,
            autoRenews: false,
            cancelRequestedAt: "2026-11-27T19:00:00.000Z",
          },
        };
      }
      return notImplementedYet(DOMAIN, "cancelPremium");
    }),

  undoCancelPremium: protectedProcedure
    .input(feesCancelPremiumInputSchema)
    .output(feesPremiumStateSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const subscription = {
          ...demoSubscription(input.subscriptionId),
          cancelRequestedAt: undefined,
        };
        return {
          active: true,
          source: "subscription" as const,
          subscription: {
            ...subscription,
            status: "active" as const,
            autoRenews: true,
          },
        };
      }
      return notImplementedYet(DOMAIN, "undoCancelPremium");
    }),
});
