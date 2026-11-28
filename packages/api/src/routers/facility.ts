/**
 * Router seam: facility (owner: B9). Facility owners (public courts): listing,
 * access rules, access requests, stop-play, public listing. Shapes are frozen
 * in ../contracts/facility.ts (W3-0). Kill switch: `facility.owners`.
 *
 * Mounted once in ../router.ts:
 *   operator.facility  organizationProcedure(scope), organisation resolved server-side
 *   player.facility    protectedProcedure (signed in)
 *   public.facility    publicProcedure (anonymous, IP rate limited)
 *
 * Every procedure returns its fixture from @duna/core/demo/facility in demo
 * mode and throws `notImplementedYet` otherwise until B9 lands the service
 * in ../services/facility/. Read ./README.md first.
 */
import {
  facilityDemo,
  facilityDemoAccessRequests,
  facilityDemoAccessRules,
  facilityDemoIds,
  facilityDemoListings,
  facilityDemoPlayStops,
} from "@duna/core/demo/facility";
import { demoPlayer } from "@duna/core/demo";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../auth";
import {
  facilityAccessRequestSchema,
  facilityAccessRequestsInputSchema,
  facilityAccessRuleSchema,
  facilityDecideAccessRequestInputSchema,
  facilityLiftPlayStopInputSchema,
  facilityListingRefInputSchema,
  facilityListingSchema,
  facilityPlayStopSchema,
  facilityPlayStopsInputSchema,
  facilityPublicListingSchema,
  facilityRequestAccessInputSchema,
  facilitySaveAccessRuleInputSchema,
  facilitySaveListingInputSchema,
  facilitySetListingStatusInputSchema,
  facilitySlotsInputSchema,
  facilitySlotsSchema,
  facilityStartPlayStopInputSchema,
} from "../contracts/facility";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "facility";
const read = organizationProcedure("sessions:read");
const write = organizationProcedure("sessions:write");
const DEMO_NOW = "2026-11-27T22:30:00.000Z";

function demoListing(listingId: string) {
  const listing = facilityDemoListings.find((l) => l.id === listingId);
  if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
  return listing;
}

function demoRequest(requestId: string) {
  const request = facilityDemoAccessRequests.find((r) => r.id === requestId);
  if (!request) throw new TRPCError({ code: "NOT_FOUND" });
  return request;
}

export const facilityOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Every listing the organisation owns (F-Listing, H14). */
  listings: read.output(z.array(facilityListingSchema)).query(() => {
    if (usesDemoData()) return facilityDemoListings;
    return notImplementedYet(DOMAIN, "listings");
  }),

  listing: read
    .input(facilityListingRefInputSchema)
    .output(facilityListingSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoListing(input.listingId);
      return notImplementedYet(DOMAIN, "listing");
    }),

  /** Create or update a listing and its policies (F-Onboarding, F-Policies). Stays draft. */
  saveListing: write
    .input(facilitySaveListingInputSchema)
    .output(facilityListingSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const base = demoListing(
          input.listingId ?? facilityDemoIds.draftListing,
        );
        return {
          ...base,
          slug: input.slug,
          defaultAccess: input.defaultAccess,
          lighting: input.lighting,
          payoutMode: input.payoutMode,
          pricePerCourtHour: input.pricePerCourtHour,
          policies: input.policies,
          autoApproveSignedAdults: input.autoApproveSignedAdults,
        };
      }
      return notImplementedYet(DOMAIN, "saveListing");
    }),

  /** Publish (live), pause or archive; a person confirms in the UI. */
  setListingStatus: write
    .input(facilitySetListingStatusInputSchema)
    .output(facilityListingSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return { ...demoListing(input.listingId), status: input.status };
      }
      return notImplementedYet(DOMAIN, "setListingStatus");
    }),

  /** Access rules by court, weekday, time and season (F-Access). */
  accessRules: read
    .input(facilityListingRefInputSchema)
    .output(z.array(facilityAccessRuleSchema))
    .query(({ input }) => {
      if (usesDemoData()) {
        return facilityDemoAccessRules.filter(
          (rule) => rule.listingId === input.listingId,
        );
      }
      return notImplementedYet(DOMAIN, "accessRules");
    }),

  saveAccessRule: write
    .input(facilitySaveAccessRuleInputSchema)
    .output(facilityAccessRuleSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const { ruleId, ...rest } = input;
        const base =
          facilityDemoAccessRules.find((rule) => rule.id === ruleId) ??
          facilityDemoAccessRules[0]!;
        return { ...base, ...rest };
      }
      return notImplementedYet(DOMAIN, "saveAccessRule");
    }),

  /** Requests to use approved-only courts (F-Approvals). */
  accessRequests: read
    .input(facilityAccessRequestsInputSchema)
    .output(z.array(facilityAccessRequestSchema))
    .query(({ input }) => {
      if (usesDemoData()) {
        return facilityDemoAccessRequests.filter(
          (request) =>
            request.listingId === input.listingId &&
            (!input.status || request.status === input.status),
        );
      }
      return notImplementedYet(DOMAIN, "accessRequests");
    }),

  /** Approve (optionally for N days or until a date), decline or remove. */
  decideAccessRequest: write
    .input(facilityDecideAccessRequestInputSchema)
    .output(facilityAccessRequestSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const request = demoRequest(input.requestId);
        const status =
          input.decision === "decline"
            ? ("declined" as const)
            : input.decision === "remove"
              ? ("removed" as const)
              : ("approved" as const);
        return {
          ...request,
          status,
          decidedAt: DEMO_NOW,
          ...(input.decision === "approve-for-days"
            ? {
                expiresAt: new Date(
                  Date.parse(DEMO_NOW) + input.days * 86_400_000,
                ).toISOString(),
              }
            : {}),
          ...(input.decision === "approve-until"
            ? { expiresAt: `${input.until}T23:59:00.000Z` }
            : {}),
          ...(input.decision === "decline" && input.note
            ? { decisionNote: input.note }
            : {}),
        };
      }
      return notImplementedYet(DOMAIN, "decideAccessRequest");
    }),

  /** Stop-play on courts (W-Schedule-Stop). */
  playStops: read
    .input(facilityPlayStopsInputSchema)
    .output(z.array(facilityPlayStopSchema))
    .query(({ input }) => {
      if (usesDemoData()) {
        return facilityDemoPlayStops.filter(
          (stop) =>
            (!input.venueId || stop.venueId === input.venueId) &&
            (!input.status || stop.status === input.status),
        );
      }
      return notImplementedYet(DOMAIN, "playStops");
    }),

  /** Stop play on some courts, or all ("Close all courts" = empty courtIds). */
  startPlayStop: write
    .input(facilityStartPlayStopInputSchema)
    .output(facilityPlayStopSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...facilityDemoPlayStops[0]!,
          venueId: input.venueId,
          courtIds: input.courtIds,
          reason: input.reason,
          source: "manual" as const,
          ...(input.note ? { note: input.note } : {}),
          ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        };
      }
      return notImplementedYet(DOMAIN, "startPlayStop");
    }),

  liftPlayStop: write
    .input(facilityLiftPlayStopInputSchema)
    .output(facilityPlayStopSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const stop = facilityDemoPlayStops.find(
          (candidate) => candidate.id === input.playStopId,
        );
        if (!stop) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...stop, status: "lifted" as const, liftedAt: DEMO_NOW };
      }
      return notImplementedYet(DOMAIN, "liftPlayStop");
    }),
});

export const facilityPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Ask for access to approved-only courts (B-Web-Request). */
  requestAccess: protectedProcedure
    .input(facilityRequestAccessInputSchema)
    .output(facilityAccessRequestSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...facilityDemoAccessRequests[0]!,
          listingId: input.listingId,
          person: {
            personId: demoPlayer.id,
            displayName: demoPlayer.displayName,
          },
          ...(input.affiliation ? { affiliation: input.affiliation } : {}),
          ...(input.message ? { message: input.message } : {}),
          requestedAt: DEMO_NOW,
        };
      }
      return notImplementedYet(DOMAIN, "requestAccess");
    }),

  /** The signed-in player's requests (and their managed minors'). */
  myAccessRequests: protectedProcedure
    .output(z.array(facilityAccessRequestSchema))
    .query(() => {
      if (usesDemoData()) {
        return facilityDemoAccessRequests.filter(
          (request) =>
            request.person.personId === demoPlayer.id ||
            (request as { readonly guardian?: { readonly personId: string } })
              .guardian?.personId === demoPlayer.id,
        );
      }
      return notImplementedYet(DOMAIN, "myAccessRequests");
    }),
});

export const facilityPublicRouter = router({
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** A live listing by slug (F-Listing, B-Web-Facility). */
  listing: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(96) }))
    .output(facilityPublicListingSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        if (input.slug !== facilityDemo.publicListing.slug) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return facilityDemo.publicListing;
      }
      return notImplementedYet(DOMAIN, "listing");
    }),

  /** Hourly slots for one date: price, Taken, Ask (approval), stopped, closed. */
  slots: publicProcedure
    .input(facilitySlotsInputSchema)
    .output(facilitySlotsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        if (input.slug !== facilityDemo.slots.slug) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return { ...facilityDemo.slots, date: input.date };
      }
      return notImplementedYet(DOMAIN, "slots");
    }),
});
