/**
 * Contract: add a score without an account (owner: SITE-3). The public
 * honeypot at `/add-score` (docs/product/add-score.md, docs/design/website.md
 * section 2.5). Procedures:
 *
 * - `public.addScore.save | read | preview | discard`: anonymous. The draft is
 *   found by an unguessable token the web app keeps in an HTTP-only cookie
 *   and passes in; nothing here is ever shown publicly.
 * - `player.addScore.claim`: signed in. Turns the draft into a normal
 *   unverified match through `recordCompletedMatch`.
 * - `admin.addScore.candidates | resolveCandidate`: staff review of places
 *   players named that Duna does not list yet.
 *
 * Contact details are never part of a draft: they are typed at claim and go
 * straight to the existing confirm-link path.
 */
import {
  scoreDraftPlaceKinds,
  venueCandidateSources,
  venueCandidateStatuses,
  venueCandidateSurfaces,
} from "@duna/db/schema";
import { z } from "zod";

/** Seven days, from when the draft was started. */
export const ADD_SCORE_DRAFT_TTL_DAYS = 7;
/** The cookie that holds the draft token (HTTP-only, set by the web app). */
export const ADD_SCORE_DRAFT_COOKIE = "duna-score-draft";
/** How far back a match may be added. */
export const ADD_SCORE_MAX_AGE_DAYS = 90;

/** 43 URL-safe characters: 32 random bytes. */
export const addScoreTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "That draft link isn't valid.");

const URL_LIKE = /(https?:|www\.|:\/\/|@)/i;
/** "name.com", "spam.io/x": a dot glued to letters reads as a web address. */
const DOMAIN_LIKE = /\.\p{L}{2,}/u;

/**
 * A first name or initial typed for a player: letters, spaces, apostrophes,
 * hyphens and a full stop; 1 to 40 characters; never a web address.
 */
export const addScorePersonNameSchema = z
  .string()
  .trim()
  .min(1, "Add a first name or an initial.")
  .max(40, "Keep names to 40 characters.")
  .regex(
    /^\p{L}[\p{L}\p{M}'’. -]*$/u,
    "Use letters only: no numbers, links or symbols.",
  )
  .refine(
    (value) => !URL_LIKE.test(value) && !DOMAIN_LIKE.test(value),
    "Names can't contain web addresses.",
  );

/** One letter, an optional full stop: "R" or "R.". */
export const addScoreInitialSchema = z
  .string()
  .trim()
  .regex(/^\p{L}\.?$/u, "One letter for the last initial.");

/** A place someone describes: a name or an address, never a link. */
const placeText = (max: number) =>
  z
    .string()
    .trim()
    .min(2, "Add at least two characters.")
    .max(max, `Keep it under ${max} characters.`)
    .regex(
      /^[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M} '’.,&()#/-]*$/u,
      "Use letters, numbers and simple punctuation.",
    )
    .refine(
      (value) => !URL_LIKE.test(value) && !DOMAIN_LIKE.test(value),
      "Web addresses aren't allowed here.",
    );

export const addScorePlaceNameSchema = placeText(80);
export const addScoreAddressSchema = placeText(200);

export const addScoreSurfaceSchema = z.enum(venueCandidateSurfaces);
export const addScorePlaceKindSchema = z.enum(scoreDraftPlaceKinds);

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const addScorePlaceSchema = z.discriminatedUnion("kind", [
  /** One of Duna's own venues. */
  z.object({
    kind: z.literal("duna"),
    venueId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
  }),
  /** A place from the maps provider, as the details endpoint returned it. */
  z.object({
    kind: z.literal("places"),
    placeId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{8,256}$/),
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().max(300).optional(),
    latitude,
    longitude,
  }),
  /** Neither knows it: a name plus an address or a dropped pin. */
  z
    .object({
      kind: z.literal("described"),
      name: addScorePlaceNameSchema,
      address: addScoreAddressSchema.optional(),
      latitude: latitude.optional(),
      longitude: longitude.optional(),
      surface: addScoreSurfaceSchema.optional(),
      nets: z.number().int().min(1).max(40).optional(),
    })
    .refine(
      (place) =>
        Boolean(place.address) ||
        (place.latitude !== undefined && place.longitude !== undefined),
      {
        message: "Add an address or drop a pin so we can find the court.",
        path: ["address"],
      },
    ),
]);
export type AddScorePlace = z.infer<typeof addScorePlaceSchema>;

export const addScoreFormatSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(6),
]);
export type AddScoreFormat = z.infer<typeof addScoreFormatSchema>;

export const addScoreMatchTypeSchema = z.enum(["competitive", "friendly"]);

export const addScoreSetSchema = z.object({
  you: z.number().int().min(0).max(99),
  them: z.number().int().min(0).max(99),
});
export type AddScoreSet = z.infer<typeof addScoreSetSchema>;

export const addScorePlayerSchema = z.object({
  firstName: addScorePersonNameSchema,
  lastInitial: addScoreInitialSchema.optional(),
});
export type AddScorePlayer = z.infer<typeof addScorePlayerSchema>;

/**
 * Everything a draft may hold. Every part is optional: each step saves what
 * it has. No contact details, ever.
 */
export const addScoreDraftDataSchema = z.object({
  place: addScorePlaceSchema.optional(),
  format: addScoreFormatSchema.optional(),
  matchType: addScoreMatchTypeSchema.optional(),
  /** The day played, `YYYY-MM-DD`, in the player's own calendar. */
  playedOn: z.iso.date().optional(),
  sets: z.array(addScoreSetSchema).min(1).max(5).optional(),
  /** The person adding the score: optional until they claim it. */
  you: z.object({ firstName: addScorePersonNameSchema }).partial().optional(),
  teammates: z.array(addScorePlayerSchema).max(5).optional(),
  opponents: z.array(addScorePlayerSchema).max(6).optional(),
  /** "Everyone on court agreed to record this match." */
  agreed: z.boolean().optional(),
});
export type AddScoreDraftData = z.infer<typeof addScoreDraftDataSchema>;

export const addScoreStepSchema = z.enum(["where", "score", "players"]);
export type AddScoreStep = z.infer<typeof addScoreStepSchema>;

export const addScoreSaveInputSchema = z.object({
  /** The cookie's token; absent for a new draft. */
  token: addScoreTokenSchema.optional(),
  /** The step being finished: its parts must be complete and valid. */
  step: addScoreStepSchema,
  data: addScoreDraftDataSchema,
});

export const addScoreFieldErrorsSchema = z.record(z.string(), z.string());

export const addScorePlaceSummarySchema = z.object({
  kind: addScorePlaceKindSchema,
  label: z.string(),
  detail: z.string().optional(),
  /** A place Duna does not list yet: staff check it first. */
  isNew: z.boolean(),
});

export const addScoreDraftViewSchema = z.object({
  data: addScoreDraftDataSchema,
  completed: z.array(addScoreStepSchema).readonly(),
  place: addScorePlaceSummarySchema.optional(),
  /** Soft checks: shown, never blocking. */
  warnings: z.array(z.string()).readonly(),
  startedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type AddScoreDraftView = z.infer<typeof addScoreDraftViewSchema>;

export const addScoreSaveResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("saved"),
    /** Only when this save started a new draft: the web app sets the cookie. */
    newToken: addScoreTokenSchema.optional(),
    draft: addScoreDraftViewSchema,
  }),
  z.object({
    status: z.literal("invalid"),
    fieldErrors: addScoreFieldErrorsSchema,
  }),
  /** The token named a draft that is gone: start again (the cookie is cleared). */
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("claimed") }),
]);
export type AddScoreSaveResult = z.infer<typeof addScoreSaveResultSchema>;

export const addScoreTokenInputSchema = z.object({
  token: addScoreTokenSchema,
});

export const addScoreReadResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }),
  z.object({ state: z.literal("expired") }),
  z.object({
    state: z.literal("claimed"),
    matchId: z.string().uuid().optional(),
  }),
  z.object({ state: z.literal("active"), draft: addScoreDraftViewSchema }),
]);
export type AddScoreReadResult = z.infer<typeof addScoreReadResultSchema>;

/** Why a result would or would not move a Sand Rating. */
export const addScoreCountsReasonSchema = z.enum([
  "competitive-doubles",
  "friendly",
  "not-doubles",
]);

export const addScorePreviewSchema = z.object({
  result: z.enum(["won", "lost"]),
  setsWon: z.object({
    you: z.number().int().nonnegative(),
    them: z.number().int().nonnegative(),
  }),
  /** Only competitive two-on-two matches move a Sand Rating. */
  counts: z.boolean(),
  reason: addScoreCountsReasonSchema,
  /**
   * What the engine would do with this result for a player new to Duna, run
   * on a copy: never written, never a rating. Absent when it would not count.
   */
  whatItWouldDo: z
    .object({
      /** Where every new player starts (the engine's anchor). */
      startingPoint: z.number(),
      /** The engine's figure after this one result, if confirmed. */
      afterThisMatch: z.number(),
      change: z.number(),
      /** Confirmed matches before a Sand Rating shows (this one included). */
      matchesUntilShown: z.number().int().positive(),
    })
    .optional(),
  warnings: z.array(z.string()).readonly(),
});
export type AddScorePreview = z.infer<typeof addScorePreviewSchema>;

export const addScorePreviewResultSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("not-ready"),
    missing: z.array(addScoreStepSchema).readonly(),
  }),
  z.object({ state: z.literal("expired") }),
  z.object({ state: z.literal("none") }),
  z.object({ state: z.literal("ready"), preview: addScorePreviewSchema }),
]);
export type AddScorePreviewResult = z.infer<typeof addScorePreviewResultSchema>;

/** A player as the claimer completes them: a last name or initial, contacts optional. */
export const addScoreClaimPlayerSchema = z.object({
  firstName: addScorePersonNameSchema,
  lastName: addScorePersonNameSchema,
  email: z.string().trim().toLowerCase().email().max(320).optional(),
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Use the full number with its country code.")
    .optional(),
});
export type AddScoreClaimPlayer = z.infer<typeof addScoreClaimPlayerSchema>;

export const addScoreClaimInputSchema = z.object({
  token: addScoreTokenSchema,
  teammates: z.array(addScoreClaimPlayerSchema).max(5),
  opponents: z.array(addScoreClaimPlayerSchema).min(1).max(6),
  idempotencyKey: z.string().uuid(),
});
export type AddScoreClaimInput = z.infer<typeof addScoreClaimInputSchema>;

export const addScoreClaimResultSchema = z.object({
  status: z.enum(["claimed", "already-claimed"]),
  matchId: z.string().uuid(),
});
export type AddScoreClaimResult = z.infer<typeof addScoreClaimResultSchema>;

export const addScoreDiscardResultSchema = z.object({
  discarded: z.boolean(),
});

// ---------- Staff review of candidate venues ----------

export const addScoreCandidateStatusSchema = z.enum(venueCandidateStatuses);
export const addScoreCandidateSourceSchema = z.enum(venueCandidateSources);

export const addScoreCandidateListInputSchema = z.object({
  status: addScoreCandidateStatusSchema.default("pending"),
  limit: z.number().int().min(1).max(100).default(50),
});

export const addScoreCandidateSchema = z.object({
  id: z.string().uuid(),
  source: addScoreCandidateSourceSchema,
  status: addScoreCandidateStatusSchema,
  /** The name to show: typed by a player, or the provider's while it may be kept. */
  name: z.string().nullable(),
  address: z.string().nullable(),
  googlePlaceId: z.string().nullable(),
  /** Provider content has passed its 30 days: look it up again by place id. */
  providerContentExpired: z.boolean(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  surface: addScoreSurfaceSchema.nullable(),
  nets: z.number().int().nullable(),
  distinctSubmitters: z.number().int().nonnegative(),
  claimedSubmitters: z.number().int().nonnegative(),
  suggestedVenue: z
    .object({ id: z.string().uuid(), name: z.string() })
    .nullable(),
  resolvedVenueId: z.string().uuid().nullable(),
  firstSubmittedAt: z.iso.datetime(),
  lastSubmittedAt: z.iso.datetime(),
});
export type AddScoreCandidate = z.infer<typeof addScoreCandidateSchema>;

export const addScoreCandidateListSchema = z.object({
  items: z.array(addScoreCandidateSchema).readonly(),
});

export const addScoreResolveCandidateInputSchema = z.discriminatedUnion(
  "action",
  [
    /** Make a draft venue (not public) under an organisation staff choose. */
    z.object({
      action: z.literal("promote"),
      candidateId: z.string().uuid(),
      organizationId: z.string().uuid(),
      name: z.string().trim().min(2).max(120),
      timezone: z.string().trim().min(3).max(64),
      note: z.string().trim().max(500).optional(),
    }),
    z.object({
      action: z.literal("merge"),
      candidateId: z.string().uuid(),
      venueId: z.string().uuid(),
      note: z.string().trim().max(500).optional(),
    }),
    z.object({
      action: z.literal("dismiss"),
      candidateId: z.string().uuid(),
      note: z.string().trim().min(3).max(500),
    }),
  ],
);
export type AddScoreResolveCandidateInput = z.infer<
  typeof addScoreResolveCandidateInputSchema
>;

export const addScoreResolveCandidateResultSchema = z.object({
  candidateId: z.string().uuid(),
  status: addScoreCandidateStatusSchema,
  venueId: z.string().uuid().nullable(),
});
