import { TRPCError } from "@trpc/server";
import { priceConsumerOrder } from "@duna/pricing";
import { scheduleTournament, solveAvailableSlots } from "@duna/scheduling";
import {
  createUndoEvent,
  foldScore,
  generateDoubleElimination,
  generatePoolPlay,
  generateRoundRobin,
  generateSingleElimination,
  standardBeachFormat,
  type ScoreEvent,
  type SeededTeam,
} from "@duna/league-engine";
import { z } from "zod";
import {
  adultProcedure,
  adminProcedure,
  createCallerFactory,
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  rateLimitMiddleware,
  requireScope,
  router,
} from "./auth";
import type { ApiContext } from "./context";
import {
  adminOverviewSchema,
  adminQueueSchema,
  agentDraftSchema,
  auditEventSchema,
  availableSlotSchema,
  bracketSchema,
  consentRecordResultSchema,
  courtBookingInventorySchema,
  courtCheckoutResultSchema,
  courtCheckoutStatusSchema,
  courtHoldResultSchema,
  eventSummarySchema,
  eventCheckoutResultSchema,
  eventCheckoutStatusSchema,
  featureFlagCollectionSchema,
  featureFlagSummarySchema,
  formSubmissionResultSchema,
  guardianReviewItemSchema,
  guardianReviewResultSchema,
  matchSummarySchema,
  matchScoringStateSchema,
  operatorDashboardSchema,
  operatorMutationResultSchema,
  operatorScorableMatchSchema,
  operatorWorkspaceSchema,
  organizationSummarySchema,
  personSummarySchema,
  playerDashboardSchema,
  playerSettingsSchema,
  playerWalletSchema,
  pricingSchema,
  registrationResultSchema,
  scoreStateSchema,
  stripeOnboardingResultSchema,
  scoreEventSchema,
  teamClaimSummarySchema,
  ticketApprovalResultSchema,
  ticketApprovalSummarySchema,
  ticketScanResultSchema,
  tournamentScheduleSchema,
  venueSummarySchema,
} from "./contracts";
import {
  approveTicketOrder,
  claimTeamEntry,
  CheckoutError,
  getEventCheckoutStatus,
  loadPendingTicketApprovals,
  loadTeamClaim,
  startEventCheckout,
} from "./checkout";
import {
  CourtCheckoutError,
  getCourtCheckoutStatus,
  loadCourtBookingInventory,
  startCourtCheckout,
} from "./court-checkout";
import {
  CommerceError,
  createCourtHold,
  registerForSession,
  scanTicketConnected,
} from "./commerce";
import {
  FormSubmissionError,
  recordConsent,
  submitFormResponse,
} from "./forms-service";
import {
  createFeatureFlag,
  FeatureFlagError,
  loadFeatureFlags,
  updateFeatureFlag,
} from "./feature-flags";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "./idempotency";
import {
  addDependent,
  IdentityError,
  loadGuardianReviewQueue,
  recordOwnBirthDate,
  reviewGuardianship,
  updateOwnProfile,
} from "./identity";
import {
  changeDunaPlusMembership,
  MembershipError,
  openDunaPlusPortal,
} from "./membership";
import {
  activateCourt,
  createCourt,
  createEventDraft,
  createProgramSession,
  createRatePlan,
  createVenue,
  loadDemoOperatorWorkspace,
  loadOperatorWorkspace,
  OperatorServiceError,
  publishSession,
  publishVenue,
  saveMessageDraft,
  startStripeOnboarding,
} from "./operator-service";
import {
  appendMatchEvents,
  appendOperatorMatchEvents,
  confirmMatchResult,
  loadOperatorMatchScoringState,
  loadOperatorScorableMatches,
  loadMatchScoringState,
  loadPublicMatchScoringState,
  MatchServiceError,
  startOperatorMatchScoring,
  startSelfReportedMatch,
} from "./match-service";
import {
  buildPersonDataExport,
  cancelAccountDeletion,
  PrivacyError,
  requestAccountDeletion,
} from "./privacy";
import { createDunaPlusCheckout, isStripeConfigured } from "./payments";
import { getRepository } from "./repository";
import {
  confirmAgentAction,
  proposeAgentAction,
  toolRiskRegistry,
} from "./risk";

const moneyItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "booking",
    "registration",
    "membership",
    "package",
    "ticket",
    "merchandise",
    "wallet-load",
  ]),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitAmountMinor: z.number().int().nonnegative(),
});

const availabilityModeSchema = z.enum([
  "open",
  "private-lessons-only",
  "group-only",
  "league-reserved",
  "rentals-only",
  "members-only",
  "maintenance",
  "blocked",
]);

const timeRangeSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

const availabilityBlockSchema = timeRangeSchema.extend({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  mode: availabilityModeSchema,
});

const busyRangeSchema = timeRangeSchema.extend({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  kind: z.enum(["booking", "buffer", "blackout", "hold"]),
});

const tournamentMatchRequestSchema = z.object({
  id: z.string().min(1),
  divisionId: z.string().min(1),
  teamIds: z.tuple([z.string().min(1), z.string().min(1)]),
  durationMinutes: z.number().int().positive(),
  earliestStart: z.iso.datetime().optional(),
  dependsOnMatchIds: z.array(z.string().min(1)).optional(),
});

const courtWindowSchema = timeRangeSchema.extend({
  courtId: z.string().min(1),
  divisionIds: z.array(z.string().min(1)).min(1),
});

const eventDraftDivisionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1_000).optional(),
    minimumTeams: z.number().int().min(1).max(512),
    maximumTeams: z.number().int().min(1).max(512),
    teamFormat: z.enum([
      "solo",
      "doubles",
      "three-person",
      "four-person",
      "six-person",
    ]),
    surface: z.enum(["sand", "grass", "water", "indoor-sand"]),
    gender: z.enum(["mens", "womens", "coed", "open"]),
    priceBasis: z.enum(["per-person", "per-team"]),
    priceMinor: z.number().int().min(0).max(100_000_000),
    ratingEnabled: z.boolean(),
    ratingMinimum: z.number().min(0).max(10).optional(),
    ratingMaximum: z.number().min(0).max(10).optional(),
    ageEnabled: z.boolean(),
    ageMinimum: z.number().int().min(0).max(120).optional(),
    ageMaximum: z.number().int().min(1).max(120).optional(),
    tournamentFormat: z.enum([
      "kob-qob",
      "single-elimination",
      "double-elimination-true",
      "double-elimination-crossover",
    ]),
    poolPlay: z.object({
      enabled: z.boolean(),
      teamsPerPool: z.number().int().min(2).max(64),
      format: z.enum(["full", "olympic-crossover"]),
      teamsAdvancing: z.number().int().min(1).max(64),
    }),
    seeding: z.enum([
      "first-come",
      "sand-rating-score",
      "sand-rating-best-8",
      "sand-rating-ttm",
      "manual",
    ]),
  })
  .superRefine((division, context) => {
    if (division.maximumTeams < division.minimumTeams) {
      context.addIssue({
        code: "custom",
        path: ["maximumTeams"],
        message: "Maximum teams must be at least the minimum.",
      });
    }
    if (
      division.ratingEnabled &&
      (division.ratingMinimum === undefined ||
        division.ratingMaximum === undefined ||
        division.ratingMaximum < division.ratingMinimum)
    ) {
      context.addIssue({
        code: "custom",
        path: ["ratingMaximum"],
        message: "Complete a valid rating range.",
      });
    }
    if (
      division.ageEnabled &&
      (division.ageMinimum === undefined ||
        division.ageMaximum === undefined ||
        division.ageMaximum < division.ageMinimum)
    ) {
      context.addIssue({
        code: "custom",
        path: ["ageMaximum"],
        message: "Complete a valid age range.",
      });
    }
    if (
      division.poolPlay.enabled &&
      division.poolPlay.teamsAdvancing > division.poolPlay.teamsPerPool
    ) {
      context.addIssue({
        code: "custom",
        path: ["poolPlay", "teamsAdvancing"],
        message: "Advancing teams cannot exceed teams per pool.",
      });
    }
  });

const eventDraftTicketSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1_000).optional(),
    priceMinor: z.number().int().min(0).max(100_000_000),
    quantity: z.number().int().min(1).max(1_000_000).optional(),
    waitlistEnabled: z.boolean(),
    approvalRequired: z.boolean(),
    availableOnline: z.boolean(),
    availableInPerson: z.boolean(),
  })
  .refine(
    (ticket) => ticket.availableOnline || ticket.availableInPerson,
    "Choose at least one ticket channel.",
  );

const eventDraftFeatureSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["guest", "activity", "sponsor"]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  personId: z.string().uuid().optional(),
  personHandle: z.string().max(80).optional(),
  personInitials: z.string().max(8).optional(),
  imageUrl: z.string().max(2_000).optional(),
});

const eventDraftPolicySchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["policy", "waiver"]),
  title: z.string().trim().min(1).max(120),
  markdown: z.string().trim().min(1).max(50_000),
  required: z.boolean(),
  requireFullScroll: z.boolean(),
});

const leagueRecurrenceInputSchema = z.object({
  interval: z.enum(["weekly", "biweekly"]),
  days: z
    .array(
      z.object({
        day: z.enum([
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ]),
        startsAt: z.string().regex(/^\d{2}:\d{2}$/),
        endsAt: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .min(1)
    .max(7),
  substitutesAllowed: z.boolean(),
  substituteApprovalRequired: z.boolean(),
  teamAssignment: z.enum(["signup", "rating-balanced", "manual"]),
});

const createEventDraftInputSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    shortSummary: z.string().trim().max(180).optional(),
    description: z.string().trim().max(10_000).optional(),
    kind: z.enum(["tournament", "league"]),
    media: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          kind: z.enum(["image", "video"]),
          url: z.string().min(1).max(2_000),
          alt: z.string().max(240).optional(),
          posterUrl: z.string().max(2_000).optional(),
        }),
      )
      .max(12),
    location: z.object({
      mode: z.enum(["venue", "address", "online"]),
      venueId: z.string().uuid().optional(),
      venueName: z.string().trim().min(1).max(160),
      address: z.string().trim().max(500).optional(),
      onlineUrl: z.string().url().max(2_000).optional(),
      courtIds: z.array(z.string().uuid()).max(64),
      courtNames: z.array(z.string().trim().min(1).max(80)).max(64),
    }),
    timezone: z.string().trim().min(1).max(64),
    localStartsAt: z.string().min(16).max(16),
    localEndsAt: z.string().min(16).max(16),
    divisions: z.array(eventDraftDivisionSchema).min(1).max(64),
    tickets: z.array(eventDraftTicketSchema).max(64),
    features: z.array(eventDraftFeatureSchema).max(64),
    policies: z.array(eventDraftPolicySchema).max(32),
    recurrence: leagueRecurrenceInputSchema.optional(),
    confirmedPrice: z.literal(true),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((event, context) => {
    if (event.location.mode === "venue" && !event.location.venueId) {
      context.addIssue({
        code: "custom",
        path: ["location", "venueId"],
        message: "Choose a connected venue.",
      });
    }
    if (event.location.mode === "address" && !event.location.address) {
      context.addIssue({
        code: "custom",
        path: ["location", "address"],
        message: "Add the event address.",
      });
    }
    if (event.location.mode === "online" && !event.location.onlineUrl) {
      context.addIssue({
        code: "custom",
        path: ["location", "onlineUrl"],
        message: "Add the online event URL.",
      });
    }
    if (event.kind === "league" && !event.recurrence) {
      context.addIssue({
        code: "custom",
        path: ["recurrence"],
        message: "Add the league schedule.",
      });
    }
  });

async function runIdempotentMutation<T extends object>(input: {
  readonly key: string;
  readonly procedure: string;
  readonly request: Readonly<Record<string, unknown>>;
  readonly ctx: ApiContext;
  readonly execute: () => Promise<T>;
}): Promise<T> {
  try {
    return (
      await executeIdempotent({
        key: input.key,
        procedure: input.procedure,
        personId: input.ctx.actor?.personId,
        organizationId: input.ctx.actor?.organizationId,
        request: input.request,
        now: input.ctx.now,
        execute: input.execute,
      })
    ).result;
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    }
    if (error instanceof IdempotencyInProgressError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
      });
    }
    throw error;
  }
}

function throwDomainError(error: unknown): never {
  if (error instanceof CommerceError) {
    const code =
      error.code.endsWith("_NOT_FOUND") || error.code === "TICKET_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "TICKET_WRONG_ORGANIZATION"
          ? "FORBIDDEN"
          : error.code === "DATABASE_REQUIRED"
            ? "INTERNAL_SERVER_ERROR"
            : error.code === "INVALID_BOOKING_TIME"
              ? "BAD_REQUEST"
              : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof FormSubmissionError) {
    const code =
      error.code === "FORM_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "FORM_VERSION_MISMATCH"
          ? "CONFLICT"
          : error.code === "DATABASE_REQUIRED"
            ? "INTERNAL_SERVER_ERROR"
            : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof FeatureFlagError) {
    const code =
      error.code === "FLAG_NOT_FOUND" || error.code === "ORGANIZATION_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "SUPER_ADMIN_REQUIRED"
          ? "FORBIDDEN"
          : error.code === "FLAG_ALREADY_EXISTS"
            ? "CONFLICT"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof CheckoutError) {
    const code =
      error.code === "EVENT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "CHECKOUT_UNAVAILABLE"
          ? "CONFLICT"
          : error.code === "DATABASE_REQUIRED" ||
              error.code === "STRIPE_REQUIRED"
            ? "INTERNAL_SERVER_ERROR"
            : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof CourtCheckoutError) {
    const code =
      error.code === "COURT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "DATABASE_REQUIRED"
          ? "INTERNAL_SERVER_ERROR"
          : error.code === "INVALID_LOCAL_TIME"
            ? "BAD_REQUEST"
            : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof MembershipError) {
    const code =
      error.code === "MEMBERSHIP_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "MEMBERSHIP_NOT_MANAGEABLE" ||
            error.code === "PAUSE_LIMIT_REACHED"
          ? "PRECONDITION_FAILED"
          : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof PrivacyError) {
    const code =
      error.code === "REQUEST_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "REQUEST_NOT_CANCELLABLE"
          ? "PRECONDITION_FAILED"
          : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof IdentityError) {
    const code =
      error.code === "PERSON_NOT_FOUND" ||
      error.code === "GUARDIANSHIP_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "HANDLE_UNAVAILABLE" ||
            error.code === "PHONE_UNAVAILABLE" ||
            error.code === "GUARDIANSHIP_ALREADY_REVIEWED"
          ? "CONFLICT"
          : error.code === "DATABASE_REQUIRED"
            ? "INTERNAL_SERVER_ERROR"
            : error.code === "ADULT_REQUIRED" ||
                error.code === "PUBLIC_MINOR_PROFILE_BLOCKED" ||
                error.code === "GUARDIAN_CONSENT_REQUIRED" ||
                error.code === "INVALID_GUARDIANSHIP"
              ? "PRECONDITION_FAILED"
              : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof OperatorServiceError) {
    const code =
      error.code === "RESOURCE_NOT_FOUND" ||
      error.code === "ORGANIZATION_NOT_FOUND" ||
      error.code === "RECIPIENT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "RESOURCE_WRONG_ORGANIZATION" ||
            error.code === "RECIPIENT_NOT_ELIGIBLE"
          ? "FORBIDDEN"
          : error.code === "DATABASE_REQUIRED"
            ? "INTERNAL_SERVER_ERROR"
            : error.code === "INVALID_TIMEZONE" ||
                error.code === "INVALID_SCHEDULE" ||
                error.code === "INVALID_CONFIGURATION" ||
                error.code === "DELIVERY_DESTINATION_MISSING"
              ? "BAD_REQUEST"
              : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof MatchServiceError) {
    const code =
      error.code === "MATCH_NOT_FOUND" || error.code === "PARTICIPANT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "PARTICIPANT_REQUIRED" ||
            error.code === "DEVICE_MISMATCH"
          ? "FORBIDDEN"
          : error.code === "DATABASE_REQUIRED"
            ? "INTERNAL_SERVER_ERROR"
            : error.code === "EVENT_SEQUENCE_CONFLICT"
              ? "CONFLICT"
              : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  throw error;
}

const publicRouter = router({
  health: publicProcedure
    .output(
      z.object({
        status: z.literal("ok"),
        service: z.literal("duna-api"),
        time: z.iso.datetime(),
        databaseConfigured: z.boolean(),
        stripeConfigured: z.boolean(),
      }),
    )
    .query(() => ({
      status: "ok" as const,
      service: "duna-api" as const,
      time: new Date().toISOString(),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      stripeConfigured: isStripeConfigured(),
    })),
  liveMatch: publicProcedure
    .input(z.object({ matchId: z.string().uuid() }))
    .output(matchScoringStateSchema)
    .query(async ({ input }) => {
      try {
        return await loadPublicMatchScoringState(input.matchId);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  events: publicProcedure
    .input(
      z
        .object({
          kind: z
            .enum([
              "tournament",
              "league",
              "clinic",
              "open-play",
              "private-lesson",
              "court-rental",
              "pickup",
            ])
            .optional(),
          rating: z.number().min(1).max(8).optional(),
        })
        .optional(),
    )
    .output(z.array(eventSummarySchema).readonly())
    .query(async ({ input }) =>
      (await getRepository().public.events()).filter((event) => {
        if (input?.kind && event.kind !== input.kind) return false;
        if (
          input?.rating !== undefined &&
          event.ratingRange &&
          (input.rating < event.ratingRange[0] ||
            input.rating > event.ratingRange[1])
        ) {
          return false;
        }
        return true;
      }),
    ),
  eventBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .output(eventSummarySchema)
    .query(async ({ input }) => {
      const event = await getRepository().public.eventBySlug(input.slug);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      return event;
    }),
  venues: publicProcedure
    .output(z.array(venueSummarySchema).readonly())
    .query(() => getRepository().public.venues()),
  courtBookingInventory: publicProcedure
    .input(z.object({ venueId: z.string().uuid() }))
    .output(courtBookingInventorySchema)
    .query(async ({ input }) => {
      try {
        return await loadCourtBookingInventory(input.venueId);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  players: publicProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(50).default(12) })
        .optional(),
    )
    .output(z.array(personSummarySchema).readonly())
    .query(({ input }) => getRepository().public.players(input?.limit ?? 12)),
  playerProfile: publicProcedure
    .input(z.object({ handle: z.string().min(1) }))
    .output(personSummarySchema)
    .query(async ({ input }) => {
      const player = await getRepository().public.playerByHandle(input.handle);
      if (!player) throw new TRPCError({ code: "NOT_FOUND" });
      return player;
    }),
  organizationBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .output(organizationSummarySchema)
    .query(async ({ input }) => {
      const organization = await getRepository().public.organizationBySlug(
        input.slug,
      );
      if (!organization) throw new TRPCError({ code: "NOT_FOUND" });
      return organization;
    }),
});

const playerRouter = router({
  dashboard: protectedProcedure
    .output(playerDashboardSchema)
    .query(({ ctx }) => getRepository().player.dashboard(ctx.actor!.personId)),
  matches: protectedProcedure
    .output(z.array(matchSummarySchema).readonly())
    .query(({ ctx }) =>
      getRepository().player.matchHistory(ctx.actor!.personId),
    ),
  matchById: protectedProcedure
    .input(z.object({ matchId: z.string().uuid() }))
    .output(matchSummarySchema)
    .query(async ({ input, ctx }) => {
      const match = (
        await getRepository().player.matchHistory(ctx.actor!.personId)
      ).find((candidate) => candidate.id === input.matchId);
      if (!match) throw new TRPCError({ code: "NOT_FOUND" });
      return match;
    }),
  matchScoringState: protectedProcedure
    .input(z.object({ matchId: z.string().uuid() }))
    .output(matchScoringStateSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadMatchScoringState({
          actor: ctx.actor!,
          matchId: input.matchId,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  startMatch: protectedProcedure
    .use(requireScope("matches:write"))
    .use(
      rateLimitMiddleware({
        id: "match-start",
        capacity: 10,
        refillPerMinute: 5,
      }),
    )
    .input(
      z.object({
        teamAIds: z.tuple([z.string().uuid(), z.string().uuid()]),
        teamBIds: z.tuple([z.string().uuid(), z.string().uuid()]),
        venueId: z.string().uuid().optional(),
        scoringSystem: z.enum(["rally", "sideout"]),
        initialServer: z.enum(["A", "B"]),
        deviceId: z.string().trim().min(8).max(128),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(matchScoringStateSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startMatch",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startSelfReportedMatch({
              actor: ctx.actor!,
              teamAIds: input.teamAIds,
              teamBIds: input.teamBIds,
              venueId: input.venueId,
              scoringSystem: input.scoringSystem,
              initialServer: input.initialServer,
              deviceId: input.deviceId,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  appendMatchEvents: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "match-score",
        capacity: 240,
        refillPerMinute: 240,
      }),
    )
    .input(
      z.object({
        matchId: z.string().uuid(),
        deviceId: z.string().trim().min(8).max(128),
        events: z
          .array(
            z.object({
              sequence: z.number().int().positive(),
              monotonicCounter: z.number().int().positive(),
              event: scoreEventSchema,
            }),
          )
          .min(1)
          .max(100),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        accepted: z.number().int().nonnegative(),
        scoring: matchScoringStateSchema,
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.appendMatchEvents",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await appendMatchEvents({
              actor: ctx.actor!,
              matchId: input.matchId,
              deviceId: input.deviceId,
              events: input.events,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  confirmMatch: protectedProcedure
    .use(requireScope("matches:write"))
    .use(
      rateLimitMiddleware({
        id: "match-confirm",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(
      z
        .object({
          matchId: z.string().uuid(),
          decision: z.enum(["confirmed", "disputed"]),
          reason: z.string().trim().max(1_000).optional(),
          idempotencyKey: z.string().uuid(),
        })
        .refine(
          (value) =>
            value.decision !== "disputed" ||
            Boolean(value.reason && value.reason.length >= 5),
          {
            message: "Explain what is wrong with the submitted result.",
            path: ["reason"],
          },
        ),
    )
    .output(
      z.object({
        status: z.enum(["pending-verification", "verified", "disputed"]),
        ratingApplied: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.confirmMatch",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await confirmMatchResult({
              actor: ctx.actor!,
              matchId: input.matchId,
              decision: input.decision,
              reason: input.reason,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  wallet: protectedProcedure
    .output(playerWalletSchema)
    .query(({ ctx }) => getRepository().player.wallet(ctx.actor!.personId)),
  settings: protectedProcedure
    .output(playerSettingsSchema)
    .query(({ ctx }) => getRepository().player.settings(ctx.actor!.personId)),
  updateProfile: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "profile-update",
        capacity: 12,
        refillPerMinute: 6,
      }),
    )
    .input(
      z.object({
        displayName: z.string().trim().min(2).max(80),
        handle: z
          .string()
          .trim()
          .toLowerCase()
          .min(3)
          .max(48)
          .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Handle can use lowercase letters, numbers, and single hyphens.",
          ),
        email: z.email().nullable().optional(),
        phoneE164: z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/, "Phone must use international format.")
          .nullable()
          .optional(),
        homeMarket: z.string().trim().max(120).nullable().optional(),
        visibility: z.enum(["public", "members", "private"]),
        locale: z
          .string()
          .trim()
          .min(2)
          .max(16)
          .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
        measurementSystem: z.enum(["imperial", "metric"]),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        personId: z.string().uuid(),
        displayName: z.string(),
        handle: z.string(),
        visibility: z.enum(["public", "members", "private"]),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.updateProfile",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateOwnProfile({
              actor: ctx.actor!,
              displayName: input.displayName,
              handle: input.handle,
              email: input.email,
              phoneE164: input.phoneE164,
              homeMarket: input.homeMarket,
              visibility: input.visibility,
              locale: input.locale,
              measurementSystem: input.measurementSystem,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  recordBirthDate: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "birth-date",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .input(
      z.object({
        birthDate: z.iso.date(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        personId: z.string().uuid(),
        ageBand: z.enum(["unknown", "under-13", "teen", "adult"]),
        isMinor: z.boolean(),
        requiresGuardian: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.recordBirthDate",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await recordOwnBirthDate({
              actor: ctx.actor!,
              birthDate: input.birthDate,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  addDependent: adultProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "dependent-create",
        capacity: 6,
        refillPerMinute: 1,
      }),
    )
    .input(
      z.object({
        displayName: z.string().trim().min(2).max(80),
        birthDate: z.iso.date(),
        relationship: z.string().trim().min(2).max(48),
        emergencyContact: z.boolean(),
        canApproveSpending: z.boolean(),
        consentConfirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        personId: z.string().uuid(),
        handle: z.string(),
        ageBand: z.enum(["under-13", "teen"]),
        relationshipVerified: z.literal(false),
        parentalConsentRecorded: z.literal(true),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.addDependent",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await addDependent({
              actor: ctx.actor!,
              displayName: input.displayName,
              birthDate: input.birthDate,
              relationship: input.relationship,
              emergencyContact: input.emergencyContact,
              canApproveSpending: input.canApproveSpending,
              consentConfirmed: input.consentConfirmed,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  dataExport: protectedProcedure.output(z.unknown()).query(async ({ ctx }) => {
    try {
      return await buildPersonDataExport({
        actor: ctx.actor!,
        now: ctx.now,
      });
    } catch (error) {
      return throwDomainError(error);
    }
  }),
  requestAccountDeletion: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "privacy-request",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .input(
      z.object({
        reason: z.string().trim().max(1_000).optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["queued", "identity-review", "legal-hold"]),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.requestAccountDeletion",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await requestAccountDeletion({
              actor: ctx.actor!,
              reason: input.reason,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  cancelAccountDeletion: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "privacy-request",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .input(z.object({ idempotencyKey: z.string().uuid() }))
    .output(
      z.object({
        id: z.string().uuid(),
        status: z.literal("cancelled"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.cancelAccountDeletion",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await cancelAccountDeletion({
              actor: ctx.actor!,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  quote: protectedProcedure
    .input(
      z.object({
        items: z.array(moneyItemSchema).min(1),
        isDunaPlus: z.boolean(),
      }),
    )
    .output(pricingSchema)
    .query(({ input }) =>
      priceConsumerOrder({
        items: input.items,
        currency: "USD",
        isDunaPlus: input.isDunaPlus,
      }),
    ),
  createPickup: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "pickup-create",
        capacity: 12,
        refillPerMinute: 6,
      }),
    )
    .input(
      z
        .object({
          title: z.string().min(3).max(80),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
          venueName: z.string().min(2),
          capacity: z.number().int().min(4).max(48),
          format: z.enum(["2s", "4s", "6s", "king-queen"]),
          note: z.string().trim().max(1_000).optional(),
          visibility: z.enum(["public", "unlisted"]),
          costMinor: z.number().int().min(0).max(100_000),
          currency: z.literal("USD"),
          recordMatches: z.boolean(),
          ratingMinimum: z.number().min(1).max(8).optional(),
          ratingMaximum: z.number().min(1).max(8).optional(),
          idempotencyKey: z.string().uuid(),
        })
        .refine(
          (value) => new Date(value.endsAt) > new Date(value.startsAt),
          "Pickup must end after it begins",
        ),
    )
    .output(eventSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createPickup",
        request: input,
        ctx,
        execute: async () =>
          getRepository().player.createPickup({
            title: input.title,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            venueName: input.venueName,
            capacity: input.capacity,
            format: input.format,
            note: input.note,
            visibility: input.visibility,
            costMinor: input.costMinor,
            currency: input.currency,
            recordMatches: input.recordMatches,
            ratingMinimum: input.ratingMinimum,
            ratingMaximum: input.ratingMaximum,
            hostPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
          }),
      }),
    ),
  registerForSession: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "session-registration",
        capacity: 12,
        refillPerMinute: 6,
      }),
    )
    .input(
      z.object({
        sessionId: z.string().uuid(),
        divisionId: z.string().uuid().optional(),
        subjectPersonId: z.string().uuid().optional(),
        inviteCodes: z.array(z.string().min(2).max(64)).max(5).optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(registrationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.registerForSession",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await registerForSession({
              actor: ctx.actor!,
              sessionId: input.sessionId,
              divisionId: input.divisionId,
              subjectPersonId: input.subjectPersonId,
              inviteCodes: input.inviteCodes,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  createCourtHold: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "court-hold",
        capacity: 12,
        refillPerMinute: 6,
      }),
    )
    .input(
      z
        .object({
          courtId: z.string().uuid(),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
          idempotencyKey: z.string().uuid(),
        })
        .refine(
          (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
          "Court hold must end after it begins",
        ),
    )
    .output(courtHoldResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createCourtHold",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createCourtHold({
              actor: ctx.actor!,
              courtId: input.courtId,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              idempotencyKey: input.idempotencyKey,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  startCourtCheckout: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "court-checkout",
        capacity: 8,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        courtId: z.string().uuid(),
        localStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        durationMinutes: z.number().int().min(15).max(480),
        successUrl: z.url(),
        cancelUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(courtCheckoutResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startCourtCheckout",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startCourtCheckout({
              actor: ctx.actor!,
              courtId: input.courtId,
              localStartsAt: input.localStartsAt,
              durationMinutes: input.durationMinutes,
              successUrl: input.successUrl,
              cancelUrl: input.cancelUrl,
              idempotencyKey: input.idempotencyKey,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  courtCheckoutStatus: protectedProcedure
    .input(z.object({ checkoutSessionId: z.string().min(1).max(192) }))
    .output(courtCheckoutStatusSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await getCourtCheckoutStatus({
          actor: ctx.actor!,
          checkoutSessionId: input.checkoutSessionId,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  startEventCheckout: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "event-checkout",
        capacity: 10,
        refillPerMinute: 5,
      }),
    )
    .input(
      z.object({
        sessionId: z.string().uuid(),
        divisionId: z.string().uuid().optional(),
        ticketTypeId: z.string().uuid().optional(),
        ticketQuantity: z.number().int().min(1).max(10).optional(),
        teamPaymentMode: z.enum(["self", "team"]).optional(),
        teamRoster: z
          .array(
            z
              .object({
                personId: z.string().uuid().optional(),
                inviteTarget: z.string().trim().min(3).max(320).optional(),
                displayName: z.string().trim().min(1).max(120).optional(),
              })
              .refine(
                (member) =>
                  Boolean(
                    member.personId ||
                    member.inviteTarget ||
                    member.displayName,
                  ),
                "Each team member needs a Duna player or invite.",
              ),
          )
          .max(5)
          .optional(),
        subjectPersonId: z.string().uuid().optional(),
        acceptedPolicyIds: z
          .array(z.string().trim().min(1).max(128))
          .max(64)
          .default([]),
        readPolicyIds: z
          .array(z.string().trim().min(1).max(128))
          .max(64)
          .default([]),
        isDunaPlus: z.boolean(),
        successUrl: z.url(),
        cancelUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(eventCheckoutResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startEventCheckout",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startEventCheckout({
              actor: ctx.actor!,
              sessionId: input.sessionId,
              divisionId: input.divisionId,
              ticketTypeId: input.ticketTypeId,
              ticketQuantity: input.ticketQuantity,
              teamPaymentMode: input.teamPaymentMode,
              teamRoster: input.teamRoster,
              subjectPersonId: input.subjectPersonId,
              acceptedPolicyIds: input.acceptedPolicyIds,
              readPolicyIds: input.readPolicyIds,
              isDunaPlus: input.isDunaPlus,
              successUrl: input.successUrl,
              cancelUrl: input.cancelUrl,
              idempotencyKey: input.idempotencyKey,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  checkoutStatus: protectedProcedure
    .input(z.object({ checkoutSessionId: z.string().min(1).max(255) }))
    .output(eventCheckoutStatusSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await getEventCheckoutStatus({
          actor: ctx.actor!,
          checkoutSessionId: input.checkoutSessionId,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  teamClaim: protectedProcedure
    .input(z.object({ claimToken: z.string().uuid() }))
    .output(teamClaimSummarySchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadTeamClaim({
          actor: ctx.actor!,
          claimToken: input.claimToken,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  claimTeamEntry: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "team-entry-claim",
        capacity: 8,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        claimToken: z.string().uuid(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(teamClaimSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.claimTeamEntry",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await claimTeamEntry({
              actor: ctx.actor!,
              claimToken: input.claimToken,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  submitForm: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "form-submission",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(
      z.object({
        formId: z.string().uuid(),
        formVersion: z.number().int().positive(),
        subjectPersonId: z.string().uuid().optional(),
        answers: z.record(z.string().min(1), z.unknown()),
        signatureValue: z.string().trim().min(2).max(160).optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(formSubmissionResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.submitForm",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await submitFormResponse({
              actor: ctx.actor!,
              formId: input.formId,
              formVersion: input.formVersion,
              subjectPersonId: input.subjectPersonId,
              answers: input.answers,
              signatureValue: input.signatureValue,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  recordConsent: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "consent-write",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(
      z.object({
        scope: z.enum([
          "transactional",
          "marketing-email",
          "marketing-sms",
          "marketing-push",
        ]),
        granted: z.boolean(),
        disclosureText: z.string().trim().min(10).max(4_000),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(consentRecordResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.recordConsent",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await recordConsent({
              actor: ctx.actor!,
              scope: input.scope,
              granted: input.granted,
              disclosureText: input.disclosureText,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  foldScore: protectedProcedure
    .input(
      z.object({
        events: z.array(z.record(z.string(), z.unknown())),
        scoringSystem: z.enum(["rally", "sideout"]).default("rally"),
      }),
    )
    .output(scoreStateSchema)
    .query(({ input }) =>
      foldScore(input.events as unknown as ScoreEvent[], {
        ...standardBeachFormat,
        scoringSystem: input.scoringSystem,
      }),
    ),
  startDunaPlusCheckout: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "checkout",
        capacity: 10,
        refillPerMinute: 5,
      }),
    )
    .input(
      z.object({
        interval: z.enum(["month", "year"]),
        successUrl: z.url(),
        cancelUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        url: z.string().nullable(),
        demo: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startDunaPlusCheckout",
        request: input,
        ctx,
        execute: async () => {
          if (!isStripeConfigured()) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Duna+ checkout is not configured.",
            });
          }
          const settings = await getRepository().player.settings(
            ctx.actor!.personId,
          );
          if (
            settings.membership &&
            !["cancelled", "canceled", "incomplete_expired"].includes(
              settings.membership.status,
            )
          ) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "A Duna+ membership already exists for this account.",
            });
          }
          return {
            ...(await createDunaPlusCheckout({
              personId: ctx.actor!.personId,
              email: settings.profile.email,
              interval: input.interval,
              successUrl: input.successUrl,
              cancelUrl: input.cancelUrl,
              idempotencyKey: input.idempotencyKey,
            })),
            demo: false,
          };
        },
      }),
    ),
  openDunaPlusPortal: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "billing-portal",
        capacity: 10,
        refillPerMinute: 5,
      }),
    )
    .input(z.object({ returnUrl: z.url() }))
    .output(z.object({ url: z.url() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await openDunaPlusPortal({
          actor: ctx.actor!,
          returnUrl: input.returnUrl,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  changeDunaPlusMembership: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "membership-change",
        capacity: 8,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        action: z.enum(["cancel", "pause", "resume"]),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        action: z.enum(["cancel", "pause", "resume"]),
        effectiveAt: z.iso.datetime().optional(),
        pauseMonthsUsed: z.number().int().min(0).max(4),
        cancelAtPeriodEnd: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.changeDunaPlusMembership",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await changeDunaPlusMembership({
              actor: ctx.actor!,
              action: input.action,
              idempotencyKey: input.idempotencyKey,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
});

const operatorRouter = router({
  dashboard: organizationProcedure("reports:read")
    .output(operatorDashboardSchema)
    .query(({ ctx }) =>
      getRepository().operator.dashboard(ctx.actor!.organizationId!),
    ),
  workspace: organizationProcedure("sessions:read")
    .output(operatorWorkspaceSchema)
    .query(({ ctx }) =>
      ctx.actor!.isDemo && !process.env.DATABASE_URL
        ? loadDemoOperatorWorkspace(ctx.actor!.organizationId!)
        : loadOperatorWorkspace(ctx.actor!.organizationId!),
    ),
  organization: organizationProcedure("members:read")
    .output(organizationSummarySchema)
    .query(({ ctx }) =>
      getRepository().operator.organization(ctx.actor!.organizationId!),
    ),
  members: organizationProcedure("members:read")
    .output(z.array(personSummarySchema).readonly())
    .query(({ ctx }) =>
      getRepository().operator.members(ctx.actor!.organizationId!),
    ),
  events: organizationProcedure("sessions:read")
    .output(z.array(eventSummarySchema).readonly())
    .query(({ ctx }) =>
      getRepository().operator.events(ctx.actor!.organizationId!),
    ),
  scorableMatches: organizationProcedure("matches:read")
    .output(z.array(operatorScorableMatchSchema).readonly())
    .query(async ({ ctx }) => {
      try {
        return await loadOperatorScorableMatches(ctx.actor!);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  matchScoringState: organizationProcedure("matches:score")
    .input(z.object({ matchId: z.string().uuid() }))
    .output(matchScoringStateSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadOperatorMatchScoringState({
          actor: ctx.actor!,
          matchId: input.matchId,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  startMatchScoring: organizationProcedure("matches:score")
    .use(
      rateLimitMiddleware({
        id: "operator-match-start",
        capacity: 20,
        refillPerMinute: 10,
        scope: "organization",
      }),
    )
    .input(
      z.object({
        matchId: z.string().uuid(),
        deviceId: z.string().trim().min(8).max(128),
        initialServer: z.enum(["A", "B"]),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(matchScoringStateSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.startMatchScoring",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startOperatorMatchScoring({
              actor: ctx.actor!,
              matchId: input.matchId,
              deviceId: input.deviceId,
              initialServer: input.initialServer,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  appendMatchEvents: organizationProcedure("matches:score")
    .use(
      rateLimitMiddleware({
        id: "operator-match-score",
        capacity: 240,
        refillPerMinute: 240,
        scope: "organization",
      }),
    )
    .input(
      z.object({
        matchId: z.string().uuid(),
        deviceId: z.string().trim().min(8).max(128),
        events: z
          .array(
            z.object({
              sequence: z.number().int().positive(),
              monotonicCounter: z.number().int().positive(),
              event: scoreEventSchema,
            }),
          )
          .min(1)
          .max(100),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        accepted: z.number().int().nonnegative(),
        scoring: matchScoringStateSchema,
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.appendMatchEvents",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await appendOperatorMatchEvents({
              actor: ctx.actor!,
              matchId: input.matchId,
              deviceId: input.deviceId,
              events: input.events,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  createRatePlan: organizationProcedure("payments:write")
    .input(
      z.object({
        name: z.string().trim().min(2).max(80),
        baseAmountMinor: z.number().int().min(0).max(10_000_000),
        memberAmountMinor: z.number().int().min(0).max(10_000_000).optional(),
        nonMemberAmountMinor: z
          .number()
          .int()
          .min(0)
          .max(10_000_000)
          .optional(),
        rateUnitMinutes: z.number().int().min(15).max(1_440),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createRatePlan",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createRatePlan({
              actor: ctx.actor!,
              name: input.name,
              baseAmountMinor: input.baseAmountMinor,
              memberAmountMinor: input.memberAmountMinor,
              nonMemberAmountMinor: input.nonMemberAmountMinor,
              rateUnitMinutes: input.rateUnitMinutes,
              confirmed: input.confirmed,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  createVenue: organizationProcedure("sessions:write")
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        addressLine1: z.string().trim().max(160).optional(),
        locality: z.string().trim().max(100).optional(),
        administrativeArea: z.string().trim().max(100).optional(),
        postalCode: z.string().trim().max(24).optional(),
        countryCode: z.string().trim().length(2),
        timezone: z.string().trim().min(3).max(64),
        temporary: z.boolean(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createVenue",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createVenue({
              actor: ctx.actor!,
              ...input,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  createCourt: organizationProcedure("sessions:write")
    .input(
      z.object({
        venueId: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        surface: z.string().trim().min(2).max(32),
        lit: z.boolean(),
        bookingPolicy: z.enum(["public", "members", "tiers", "staff", "none"]),
        ratePlanId: z.string().uuid().optional(),
        minimumDurationMinutes: z.number().int().min(15).max(1_440),
        maximumDurationMinutes: z.number().int().min(15).max(1_440),
        bufferBeforeMinutes: z.number().int().min(0).max(240),
        bufferAfterMinutes: z.number().int().min(0).max(240),
        minimumNoticeMinutes: z.number().int().min(0).max(43_200),
        maximumAdvanceDays: z.number().int().min(1).max(730),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createCourt",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createCourt({
              actor: ctx.actor!,
              ...input,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  activateCourt: organizationProcedure("sessions:write")
    .input(
      z.object({
        courtId: z.string().uuid(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.activateCourt",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await activateCourt({
              actor: ctx.actor!,
              courtId: input.courtId,
              confirmed: input.confirmed,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  publishVenue: organizationProcedure("sessions:write")
    .input(
      z.object({
        venueId: z.string().uuid(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.publishVenue",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await publishVenue({
              actor: ctx.actor!,
              venueId: input.venueId,
              confirmed: input.confirmed,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  createProgramSession: organizationProcedure("sessions:write")
    .input(
      z.object({
        title: z.string().trim().min(3).max(140),
        description: z.string().trim().max(2_000).optional(),
        kind: z.enum([
          "tournament",
          "league",
          "clinic",
          "open-play",
          "private-lesson",
          "court-rental",
          "pickup",
        ]),
        venueId: z.string().uuid(),
        courtId: z.string().uuid().optional(),
        localStartsAt: z.string().min(16).max(16),
        localEndsAt: z.string().min(16).max(16),
        capacity: z.number().int().min(1).max(10_000),
        minimumCapacity: z.number().int().min(1).max(10_000),
        priceMinor: z.number().int().min(0).max(100_000_000),
        confirmedPrice: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createProgramSession",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createProgramSession({
              actor: ctx.actor!,
              ...input,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  eventMediaUploadContext: organizationProcedure("sessions:write")
    .use(
      rateLimitMiddleware({
        id: "operator-event-media-upload",
        capacity: 30,
        refillPerMinute: 15,
        scope: "organization",
      }),
    )
    .output(z.object({ organizationId: z.string().uuid() }))
    .query(({ ctx }) => ({
      organizationId: ctx.actor!.organizationId!,
    })),
  createEventDraft: organizationProcedure("sessions:write")
    .input(createEventDraftInputSchema)
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createEventDraft",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createEventDraft({
              actor: ctx.actor!,
              ...input,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  publishSession: organizationProcedure("sessions:write")
    .input(
      z.object({
        sessionId: z.string().uuid(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.publishSession",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await publishSession({
              actor: ctx.actor!,
              sessionId: input.sessionId,
              confirmed: input.confirmed,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  saveMessageDraft: organizationProcedure("messages:propose")
    .use(
      rateLimitMiddleware({
        id: "message-draft",
        capacity: 30,
        refillPerMinute: 15,
        scope: "organization",
      }),
    )
    .input(
      z.object({
        recipientPersonId: z.string().uuid(),
        channel: z.enum(["email", "sms", "push"]),
        classification: z.enum(["transactional", "marketing"]),
        subject: z.string().trim().max(180).optional(),
        body: z.string().trim().min(1).max(8_000),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.saveMessageDraft",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await saveMessageDraft({
              actor: ctx.actor!,
              ...input,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  startStripeOnboarding: organizationProcedure("payments:write")
    .use(
      rateLimitMiddleware({
        id: "stripe-onboarding",
        capacity: 10,
        refillPerMinute: 2,
        scope: "organization",
      }),
    )
    .input(
      z.object({
        refreshUrl: z.url(),
        returnUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(stripeOnboardingResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.startStripeOnboarding",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startStripeOnboarding({
              actor: ctx.actor!,
              refreshUrl: input.refreshUrl,
              returnUrl: input.returnUrl,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  pendingTicketApprovals: organizationProcedure("payments:write")
    .output(z.array(ticketApprovalSummarySchema).readonly())
    .query(({ ctx }) =>
      loadPendingTicketApprovals({
        actor: ctx.actor!,
      }),
    ),
  approveTicketOrder: organizationProcedure("payments:write")
    .use(
      rateLimitMiddleware({
        id: "ticket-approval",
        capacity: 120,
        refillPerMinute: 60,
        scope: "organization",
      }),
    )
    .input(
      z.object({
        orderId: z.string().uuid(),
        ticketTypeId: z.string().uuid(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(ticketApprovalResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.approveTicketOrder",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await approveTicketOrder({
              actor: ctx.actor!,
              orderId: input.orderId,
              ticketTypeId: input.ticketTypeId,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  scanTicket: organizationProcedure("tickets:scan")
    .use(
      rateLimitMiddleware({
        id: "ticket-scan",
        capacity: 600,
        refillPerMinute: 600,
        scope: "organization",
      }),
    )
    .input(
      z.object({
        ticketToken: z.string().min(16).max(128),
        deviceId: z.string().min(3).max(128),
        scannedAt: z.iso.datetime(),
        offline: z.boolean(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(ticketScanResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.scanTicket",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await scanTicketConnected({
              actor: ctx.actor!,
              ticketToken: input.ticketToken,
              deviceId: input.deviceId,
              scannedAt: new Date(input.scannedAt),
              offline: input.offline,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  availableSlots: organizationProcedure("sessions:read")
    .input(
      z.object({
        coachId: z.string().optional(),
        courtIds: z.array(z.string()).min(1),
        durationMinutes: z.number().int().positive(),
        bufferBeforeMinutes: z.number().int().nonnegative(),
        bufferAfterMinutes: z.number().int().nonnegative(),
        incrementMinutes: z.number().int().positive(),
        window: timeRangeSchema,
        allowedModes: z.array(availabilityModeSchema),
        coachAvailability: z.array(availabilityBlockSchema).optional(),
        courtAvailability: z.array(availabilityBlockSchema),
        busyRanges: z.array(busyRangeSchema),
      }),
    )
    .output(z.array(availableSlotSchema).readonly())
    .query(({ input }) => solveAvailableSlots(input)),
  generateBracket: organizationProcedure("sessions:write")
    .input(
      z.object({
        id: z.string().min(1),
        format: z.enum([
          "single-elimination",
          "double-elimination-true-reset",
          "double-elimination-modified",
          "double-elimination-crossover",
          "round-robin",
          "pool-play",
        ]),
        teams: z.array(
          z.object({
            id: z.string().min(1),
            seed: z.number().int().positive(),
            name: z.string().min(1),
          }),
        ),
        poolCount: z.number().int().positive().optional(),
      }),
    )
    .output(bracketSchema)
    .query(({ input }) => {
      const teams = input.teams as readonly SeededTeam[];
      switch (input.format) {
        case "single-elimination":
          return generateSingleElimination({ id: input.id, teams });
        case "double-elimination-true-reset":
          return generateDoubleElimination({
            id: input.id,
            teams,
            variant: "true-reset",
          });
        case "double-elimination-modified":
          return generateDoubleElimination({
            id: input.id,
            teams,
            variant: "modified",
          });
        case "double-elimination-crossover":
          return generateDoubleElimination({
            id: input.id,
            teams,
            variant: "crossover",
          });
        case "round-robin":
          return generateRoundRobin({ id: input.id, teams });
        case "pool-play":
          return generatePoolPlay({
            id: input.id,
            teams,
            poolCount: input.poolCount ?? 4,
          });
      }
    }),
  generateSchedule: organizationProcedure("sessions:write")
    .input(
      z.object({
        matches: z.array(tournamentMatchRequestSchema),
        courtWindows: z.array(courtWindowSchema),
        minimumRestMinutes: z.number().int().nonnegative(),
      }),
    )
    .output(tournamentScheduleSchema)
    .query(({ input }) => scheduleTournament(input)),
  proposeLeague: organizationProcedure("sessions:write")
    .use(
      rateLimitMiddleware({
        id: "agent-league-proposal",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(
      z.object({
        title: z.string().min(3),
        format: z.string().min(2),
        weeks: z.number().int().min(1).max(52),
        teamCapacity: z.number().int().min(2).max(256),
        priceMinor: z.number().int().nonnegative(),
        currency: z.string().length(3),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.proposeLeague",
        request: input,
        ctx,
        execute: async () => {
          const league = {
            title: input.title,
            format: input.format,
            weeks: input.weeks,
            teamCapacity: input.teamCapacity,
            priceMinor: input.priceMinor,
            currency: input.currency,
          };
          return proposeAgentAction({
            toolName: "leagues.create",
            toolInput: league,
            proposedDiff: {
              entity: "league",
              operation: "create",
              values: league,
            },
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            conversationId: ctx.requestId,
            now: ctx.now,
          });
        },
      }),
    ),
  proposeMessage: organizationProcedure("messages:propose")
    .use(
      rateLimitMiddleware({
        id: "message-proposal",
        capacity: 5,
        refillPerMinute: 2,
      }),
    )
    .input(
      z.object({
        recipientCount: z.number().int().positive(),
        segment: z.string().min(2),
        channel: z.enum(["email", "sms", "push"]),
        subject: z.string().optional(),
        body: z.string().min(1),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.proposeMessage",
        request: input,
        ctx,
        execute: async () => {
          const message = {
            recipientCount: input.recipientCount,
            segment: input.segment,
            channel: input.channel,
            subject: input.subject,
            body: input.body,
          };
          return proposeAgentAction({
            toolName: "messages.send",
            toolInput: message,
            proposedDiff: {
              operation: "send",
              recipients: message.recipientCount,
              channel: message.channel,
            },
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            conversationId: ctx.requestId,
            now: ctx.now,
          });
        },
      }),
    ),
});

const agentConfirmationSchema = z.object({
  draftId: z.string().uuid(),
  confirmationNonce: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid(),
});

const agentRouter = router({
  confirmAction: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "agent-confirmation",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(agentConfirmationSchema)
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "agent.confirmAction",
        request: input,
        ctx,
        execute: async () =>
          confirmAgentAction({
            draftId: input.draftId,
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            confirmationNonce: input.confirmationNonce,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
            now: ctx.now,
          }),
      }),
    ),
});

const adminRouter = router({
  overview: adminProcedure
    .output(adminOverviewSchema)
    .query(() => getRepository().admin.overview()),
  organizations: adminProcedure
    .output(z.array(organizationSummarySchema).readonly())
    .query(() => getRepository().admin.organizations()),
  queues: adminProcedure
    .output(z.array(adminQueueSchema).readonly())
    .query(() => getRepository().admin.queues()),
  audit: adminProcedure
    .output(z.array(auditEventSchema).readonly())
    .query(() => getRepository().admin.audit()),
  guardianships: adminProcedure
    .output(z.array(guardianReviewItemSchema).readonly())
    .query(() => loadGuardianReviewQueue()),
  featureFlags: adminProcedure
    .output(featureFlagCollectionSchema)
    .query(({ ctx }) => loadFeatureFlags(ctx.actor!)),
  createFeatureFlag: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-feature-flag-create",
        capacity: 20,
        refillPerMinute: 5,
      }),
    )
    .input(
      z.object({
        key: z
          .string()
          .trim()
          .min(2)
          .max(96)
          .regex(
            /^[a-z0-9][a-z0-9._-]*$/,
            "Use lowercase letters, numbers, dots, underscores, or hyphens.",
          ),
        organizationId: z.string().uuid().optional(),
        market: z.string().trim().min(2).max(96).optional(),
        enabled: z.boolean(),
        configuration: z.record(z.string(), z.unknown()),
        reason: z.string().trim().min(10).max(500),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(featureFlagSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.createFeatureFlag",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createFeatureFlag({
              actor: ctx.actor!,
              key: input.key,
              organizationId: input.organizationId,
              market: input.market,
              enabled: input.enabled,
              configuration: input.configuration,
              reason: input.reason,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  updateFeatureFlag: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-feature-flag-update",
        capacity: 30,
        refillPerMinute: 10,
      }),
    )
    .input(
      z.object({
        flagId: z.string().uuid(),
        enabled: z.boolean(),
        configuration: z.record(z.string(), z.unknown()),
        reason: z.string().trim().min(10).max(500),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(featureFlagSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.updateFeatureFlag",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateFeatureFlag({
              actor: ctx.actor!,
              flagId: input.flagId,
              enabled: input.enabled,
              configuration: input.configuration,
              reason: input.reason,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  reviewGuardianship: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-guardianship-review",
        capacity: 30,
        refillPerMinute: 15,
      }),
    )
    .input(
      z.object({
        guardianId: z.string().uuid(),
        minorId: z.string().uuid(),
        decision: z.enum(["verified", "rejected"]),
        reason: z.string().trim().min(10).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(guardianReviewResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.reviewGuardianship",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await reviewGuardianship({
              actor: ctx.actor!,
              guardianId: input.guardianId,
              minorId: input.minorId,
              decision: input.decision,
              reason: input.reason,
              requestId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  confirmAgentAction: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-agent-confirmation",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(agentConfirmationSchema)
    .output(agentDraftSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.confirmAgentAction",
        request: input,
        ctx,
        execute: async () =>
          confirmAgentAction({
            draftId: input.draftId,
            actorPersonId: ctx.actor!.personId,
            organizationId: ctx.actor!.organizationId,
            confirmationNonce: input.confirmationNonce,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
            now: ctx.now,
          }),
      }),
    ),
  toolRiskRegistry: adminProcedure
    .output(z.record(z.string(), z.enum(["read", "propose", "confirm-always"])))
    .query(() => toolRiskRegistry),
});

export const appRouter = router({
  public: publicRouter,
  player: playerRouter,
  operator: operatorRouter,
  agent: agentRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);

export function lastScoringEventUndo(
  events: readonly ScoreEvent[],
  id: string,
  occurredAt: string,
) {
  return createUndoEvent(events, { id, occurredAt });
}
