/**
 * Router seam: training-drills (owners: B5 library and storefront, B6a scene
 * model). Shapes are frozen in ../contracts/training-drills.ts (W3-0).
 *
 * Mounted once in ../router.ts:
 *   operator.trainingDrills  organizationProcedure("training:read" | "training:write")
 *   player.trainingDrills    protectedProcedure (drills shared with the athlete; read-only)
 *   public.trainingDrills    publicProcedure (the store; read-only)
 *
 * Every procedure returns its fixture from @duna/core/demo/training-drills
 * in demo mode and calls the B5 service in ../services/training-drills/
 * otherwise (the library and drill detail are for coaches: the service
 * checks "training:write"). The store and purchases honour
 * the `training.storefront` kill switch. Nothing here takes a payment: a
 * paid purchase stays pending until the person completes checkout.
 */
import { trainingDrillsDemo } from "@duna/core/demo/training-drills";
import { TRPCError } from "@trpc/server";
import {
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../auth";
import type { ApiActor, ApiContext } from "../context";
import {
  trainingDrillsDetailSchema,
  trainingDrillsDrillInputSchema,
  trainingDrillsLibraryInputSchema,
  trainingDrillsLibrarySchema,
  trainingDrillsListingInputSchema,
  trainingDrillsListingSchema,
  trainingDrillsPurchaseInputSchema,
  trainingDrillsPurchaseSchema,
  trainingDrillsPurchasesSchema,
  trainingDrillsSaveListingInputSchema,
  trainingDrillsSaveVersionInputSchema,
  trainingDrillsSetScopeInputSchema,
  trainingDrillsStoreInputSchema,
  trainingDrillsStoreItemSchema,
  trainingDrillsStoreSchema,
  trainingDrillsSubmitForReviewInputSchema,
} from "../contracts/training-drills";
import { isFeatureEnabled } from "../feature-flag-evaluator";
import { usesDemoData } from "../services/data-source";
import * as service from "../services/training-drills";
import {
  followedPeople,
  type TrainingContext,
} from "../services/training-programs";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "training-drills";
const read = organizationProcedure("training:read");
const write = organizationProcedure("training:write");
const demo = trainingDrillsDemo;

function trainingContext(ctx: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly requestId: string;
  readonly now: Date;
  readonly ipAddress?: string;
}): TrainingContext {
  return {
    actor: ctx.actor,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    now: ctx.now,
    ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
  };
}

function demoDetail(drillId: string) {
  if (drillId === demo.detail.id) return demo.detail;
  const summary = demo.summaries.find((item) => item.id === drillId);
  if (!summary) throw new TRPCError({ code: "NOT_FOUND" });
  const base = { ...demo.detail, listing: undefined, scene: undefined };
  const listing = demo.listings.find((item) => item.drillId === drillId);
  return {
    ...base,
    ...summary,
    reviewChecks:
      summary.reviewState === "not-submitted" ? [] : demo.reviewChecks,
    ...(listing ? { listing } : {}),
  };
}

function demoListing(listingId: string) {
  const listing =
    demo.listings.find((item) => item.id === listingId) ??
    demo.store.find((item) => item.listing.id === listingId)?.listing;
  if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
  return listing;
}

async function storefrontEnabled(ctx: ApiContext): Promise<boolean> {
  return isFeatureEnabled("training.storefront", {
    organizationId: ctx.actor?.organizationId,
    context: ctx,
  });
}

async function demoStore(ctx: ApiContext) {
  const enabled = await storefrontEnabled(ctx);
  return { enabled, items: enabled ? [...demo.store] : [] };
}

export const trainingDrillsOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Library by scope: My drills, Our club, Duna library, Purchased (DL-Library). */
  library: read
    .input(trainingDrillsLibraryInputSchema)
    .output(trainingDrillsLibrarySchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          scope: input.scope,
          items: demo.summaries.filter((item) =>
            input.scope === "purchased"
              ? item.purchased
              : !item.purchased && item.scope === input.scope,
          ),
        };
      }
      return service.library(trainingContext(ctx), input);
    }),

  /** Drill detail with versions, scene, review checks and listing (DL-Detail). */
  drill: read
    .input(trainingDrillsDrillInputSchema)
    .output(trainingDrillsDetailSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) return demoDetail(input.drillId);
      return service.drillDetail(trainingContext(ctx), input.drillId);
    }),

  /** Create a drill or save a new version (scene validated by packages/training-scene). */
  saveVersion: write
    .input(trainingDrillsSaveVersionInputSchema)
    .output(trainingDrillsDetailSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return demoDetail(input.drillId ?? demo.summaries[1]!.id);
      }
      return service.saveVersion(trainingContext(ctx), input);
    }),

  /** "Private → Our club". */
  setScope: write
    .input(trainingDrillsSetScopeInputSchema)
    .output(trainingDrillsDetailSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { ...demoDetail(input.drillId), scope: input.scope };
      }
      return service.setScope(trainingContext(ctx), input);
    }),

  /** Start the checks a public listing needs (scene, no personal data, Duna review). */
  submitForReview: write
    .input(trainingDrillsSubmitForReviewInputSchema)
    .output(trainingDrillsDetailSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...demoDetail(input.drillId),
          reviewState: "checks-running" as const,
          reviewChecks: demo.reviewChecks,
        };
      }
      return service.submitForReview(trainingContext(ctx), input);
    }),

  /** Create or change the listing (DL-Share); it is listed only once approved. */
  saveListing: write
    .input(trainingDrillsSaveListingInputSchema)
    .output(trainingDrillsListingSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const existing = demo.listings.find(
          (item) => item.drillId === input.drillId,
        );
        return {
          ...(existing ?? demo.listings[1]!),
          drillId: input.drillId,
          drillVersionId: input.drillVersionId,
          pricing: input.pricing,
          price: input.price,
          licenseTerms: input.licenseTerms,
          listedAs: input.listedAs,
          status: "pending-review" as const,
        };
      }
      return service.saveListing(
        trainingContext(ctx),
        input,
        await storefrontEnabled(ctx),
      );
    }),

  delist: write
    .input(trainingDrillsListingInputSchema)
    .output(trainingDrillsListingSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...demoListing(input.listingId),
          status: "delisted" as const,
          delistedAt: "2026-11-27T18:30:00.000Z",
        };
      }
      return service.delist(trainingContext(ctx), input.listingId);
    }),

  /** The Duna store: listed drills from every club (DL-Store). */
  store: read
    .input(trainingDrillsStoreInputSchema)
    .output(trainingDrillsStoreSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) return demoStore(ctx);
      return service.store(
        { actor: ctx.actor, organizationId: ctx.organizationId },
        input,
        await storefrontEnabled(ctx),
      );
    }),

  /** Free: complete at once. Paid: pending until the person completes checkout. */
  purchase: write
    .input(trainingDrillsPurchaseInputSchema)
    .output(trainingDrillsPurchaseSchema)
    .mutation(async ({ input, ctx }) => {
      if (!(await storefrontEnabled(ctx))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The drill store is switched off.",
        });
      }
      if (usesDemoData()) {
        const listing = demoListing(input.listingId);
        const paid = listing.price.amountMinor > 0;
        return {
          id: demo.purchases[paid ? 2 : 1]!.id,
          listingId: listing.id,
          drillId: listing.drillId,
          status: paid ? ("pending" as const) : ("complete" as const),
          price: listing.price,
          buyer: {
            kind: input.buyAs,
            id:
              input.buyAs === "organization"
                ? ctx.actor!.organizationId!
                : ctx.actor!.personId,
          },
          checkoutRequired: paid,
          ...(paid ? {} : { completedAt: "2026-11-27T18:30:00.000Z" }),
        };
      }
      return service.purchase(trainingContext(ctx), input, true);
    }),

  purchases: read
    .output(trainingDrillsPurchasesSchema)
    .query(async ({ ctx }) => {
      if (usesDemoData()) return { items: [...demo.purchases] };
      return service.purchases(trainingContext(ctx));
    }),
});

export const trainingDrillsPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** A drill a coach shared with the athlete (read-only, published only). */
  drill: protectedProcedure
    .input(trainingDrillsDrillInputSchema)
    .output(trainingDrillsDetailSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const detail = demoDetail(input.drillId);
        if (detail.status !== "published") {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return detail;
      }
      return service.playerDrill(
        ctx.actor,
        input.drillId,
        await followedPeople(ctx.actor),
        ctx.now,
      );
    }),
});

export const trainingDrillsPublicRouter = router({
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The public store (listed drills only). */
  store: publicProcedure
    .input(trainingDrillsStoreInputSchema)
    .output(trainingDrillsStoreSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) return demoStore(ctx);
      return service.store({}, input, await storefrontEnabled(ctx));
    }),

  /** One public listing with its drill summary. */
  listing: publicProcedure
    .input(trainingDrillsListingInputSchema)
    .output(trainingDrillsStoreItemSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const item = demo.store.find(
          (entry) => entry.listing.id === input.listingId,
        );
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return item;
      }
      return service.publicListing(
        input.listingId,
        await storefrontEnabled(ctx),
      );
    }),
});
