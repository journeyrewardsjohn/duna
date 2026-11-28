/**
 * Demo fixtures: add a score without an account (owner: SITE-3). Candidate
 * venues for the staff review list in demo mode. Illustrative only: these
 * places are not real listings and never reach production data. Shaped by
 * `contracts/add-score.ts` (`addScoreCandidateSchema`).
 */
import { demoId } from "./ids";

const submitted = "2026-11-26T18:20:00.000Z";
const latest = "2026-11-28T01:05:00.000Z";

export const addScoreDemo = {
  /** The match a demo claim lands on. */
  claimedMatchId: demoId("add-score", 1),
  candidates: [
    {
      id: demoId("add-score", 101),
      source: "described" as const,
      status: "pending" as const,
      name: "North Lot courts (demo)",
      address: "Behind the north parking lot",
      googlePlaceId: null,
      providerContentExpired: false,
      latitude: 33.8857,
      longitude: -118.4105,
      surface: "beach-sand" as const,
      nets: 2,
      distinctSubmitters: 3,
      claimedSubmitters: 1,
      suggestedVenue: null,
      resolvedVenueId: null,
      firstSubmittedAt: submitted,
      lastSubmittedAt: latest,
    },
    {
      id: demoId("add-score", 102),
      source: "places" as const,
      status: "pending" as const,
      name: null,
      address: null,
      googlePlaceId: "demo-place-id-0000000102",
      providerContentExpired: true,
      latitude: null,
      longitude: null,
      surface: null,
      nets: null,
      distinctSubmitters: 1,
      claimedSubmitters: 0,
      suggestedVenue: null,
      resolvedVenueId: null,
      firstSubmittedAt: submitted,
      lastSubmittedAt: submitted,
    },
  ],
} as const;
