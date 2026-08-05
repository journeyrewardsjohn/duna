import { TRPCError } from "@trpc/server";
import type { EventSummary } from "@duna/core";
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
  superAdminProcedure,
} from "./auth";
import type { ApiContext } from "./context";
import {
  accountDeletionReadinessSchema,
  adminOrganizationDetailSchema,
  adminOverviewSchema,
  adminQueueSchema,
  adminVideoOverviewSchema,
  agentDraftSchema,
  auditEventSchema,
  availableSlotSchema,
  bracketSchema,
  catalogCheckoutResultSchema,
  catalogCheckoutStatusSchema,
  catalogOfferEligibilitySchema,
  consentRecordResultSchema,
  courtScheduleProposalSchema,
  availabilityAlertResultSchema,
  courtAvailabilitySchema,
  courtBookingInviteSummarySchema,
  courtBookingInventorySchema,
  courtCheckoutResultSchema,
  courtCheckoutStatusSchema,
  courtHoldResultSchema,
  eventSummarySchema,
  eventDraftEditorSchema,
  eventCheckoutResultSchema,
  eventCheckoutStatusSchema,
  featureFlagCollectionSchema,
  featureFlagSummarySchema,
  formSubmissionResultSchema,
  guardianReviewItemSchema,
  guardianReviewResultSchema,
  healthCategorySchema,
  healthDashboardSchema,
  healthProfileSchema,
  healthSampleInputSchema,
  healthSharingScopeSchema,
  matchSummarySchema,
  matchScoringStateSchema,
  operatorDashboardSchema,
  operatorMutationResultSchema,
  operatorScorableMatchSchema,
  operatorWorkspaceSchema,
  organizationWalletSummarySchema,
  organizationSummarySchema,
  personSummarySchema,
  playerInvitationClaimResultSchema,
  playerInvitationSchema,
  playerDashboardSchema,
  playerSettingsSchema,
  playerWalletSchema,
  pricingSchema,
  publicCoachSchema,
  publicOrganizationStorefrontSchema,
  registrationResultSchema,
  scoreStateSchema,
  stripeAccountReadinessResultSchema,
  stripeOnboardingResultSchema,
  scoreEventSchema,
  teamClaimSummarySchema,
  ticketApprovalResultSchema,
  ticketApprovalSummarySchema,
  ticketScanResultSchema,
  tournamentScheduleSchema,
  venueSummarySchema,
  courtCalibrationSchema,
  dunaPlusGrantSchema,
  liveVideoSessionSchema,
  videoAssociationOptionSchema,
  videoMetricsSchema,
  videoPlaybackSchema,
  videoStudioSchema,
  videoSummarySchema,
  videoUploadPartUrlSchema,
  videoUploadSessionSchema,
  visionSessionSchema,
  visionSessionSettingsSchema,
  visionTimelineEventSchema,
} from "./contracts";
import {
  getCatalogOfferEligibility,
  getCatalogCheckoutStatus,
  startCatalogCheckout,
} from "./catalog-checkout";
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
  createAvailabilityAlert,
  getCourtCheckoutStatus,
  loadCourtAvailability,
  loadCourtBookingInvite,
  loadCourtBookingInventory,
  startCourtCheckout,
  startParticipantShareCheckout,
} from "./court-checkout";
import {
  CommerceError,
  createCourtHold,
  registerForSession,
  scanTicketConnected,
} from "./commerce";
import {
  cancelPickup,
  leavePickup,
  loadPickupManagement,
  requestPickupJoin,
  reviewPickupJoinRequest,
  updatePickup,
} from "./pickup-service";
import {
  addOrganizationBrandKnowledgeSource,
  addCalendarEquipment,
  addCalendarParticipant,
  archiveOrganizationBrandKnowledgeSource,
  cancelCalendarSession,
  confirmCalendarChange,
  createCalendarBlock,
  createCatalogItem,
  createInventoryStock,
  issueOrganizationCredits,
  loadPlayerOrganizationWallets,
  loadPublicCoach,
  loadPublicCoaches,
  loadPublicOrganizationStorefront,
  proposeCalendarChange,
  refundOrganizationOrder,
  removeCalendarEquipment,
  removeCalendarParticipant,
  setCatalogItemStatus,
  updateCatalogItem,
  updateOrganizationCommerceSettings,
  updateOrganizationProfileSettings,
  updateOrganizationTheme,
} from "./catalog-service";
import {
  FormSubmissionError,
  recordConsent,
  submitFormResponse,
} from "./forms-service";
import {
  createHealthSharingGrant,
  disconnectHealth,
  HealthServiceError,
  loadHealthDashboard,
  loadHealthProfile,
  revokeHealthSharingGrant,
  syncHealthSamples,
} from "./health-service";
import {
  FamilyWalletError,
  loadFamilyWallets,
  transferFamilyCredits,
} from "./family-wallet";
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
  checkOwnHandleAvailability,
  IdentityError,
  loadGuardianReviewQueue,
  recordOwnBirthDate,
  reviewGuardianship,
  updateOwnProfile,
} from "./identity";
import {
  IdentityVerificationError,
  startStripeIdentityVerification,
} from "./identity-verification";
import {
  changeDunaPlusMembership,
  MembershipError,
  openDunaPlusPortal,
} from "./membership";
import {
  abortVideoUpload,
  beginVideoUpload,
  completeVideoUpload,
  createLiveVideo,
  createVideoShareLink,
  finishLiveVideo,
  grantComplimentaryDunaPlus,
  loadAdminVideoOverview,
  loadOwnedVideoMetrics,
  loadPublicVideos,
  loadVideoPlayback,
  loadVideoStudio,
  presignVideoUploadPart,
  recordVideoUploadPart,
  recordVideoViewHeartbeat,
  requestVideoMusicRemoval,
  revokeComplimentaryDunaPlus,
  searchVideoAssociations,
  updateVideoPrivacy,
  updateVideoQuotaPolicy,
  VideoServiceError,
} from "./video-service";
import {
  appendVisionTimelineEvents,
  attachVisionSessionToVideo,
  createVisionSession,
  loadOwnedVisionSession,
  loadRemoteVisionSession,
  revokeVisionRemote,
  updateOwnedVisionSession,
  updateRemoteVisionSession,
  updateVisionPreview,
  VisionServiceError,
} from "./vision-service";
import {
  activateCourt,
  blockCourtTime,
  claimPlayerInvitation,
  claimStaffInvitation,
  createCourt,
  createEventDraft,
  createMarketingCampaignDraft,
  createMarketingFlow,
  createPlayerInvitation,
  createStaffInvitation,
  createProgramSession,
  createRatePlan,
  createVenue,
  draftCourtScheduleFromPrompt,
  loadDemoOperatorWorkspace,
  loadEventDraft,
  loadOperatorWorkspace,
  loadPlayerInvitation,
  loadStaffInvitation,
  OperatorServiceError,
  publishSession,
  publishVenue,
  refreshStripeOnboarding,
  saveMessageDraft,
  startStripeOnboarding,
  replaceCourtSchedule,
  updateCourtBookingConfiguration,
  updateStaffProfile,
  updateEventDraft,
  updateVenueProfile,
} from "./operator-service";
import {
  appendMatchEvents,
  appendOperatorMatchEvents,
  confirmMatchResult,
  flagMatchHistoryInaccurate,
  loadOperatorMatchScoringState,
  loadOperatorScorableMatches,
  loadMatchScoringState,
  loadPublicMatchScoringState,
  MatchServiceError,
  recordCompletedMatch,
  removeSelfReportedMatch,
  reviewMatchHistoryDispute,
  startOperatorMatchScoring,
  startSelfReportedMatch,
} from "./match-service";
import {
  canRegisterLiveActivity,
  registerLiveActivitySubscription,
  revokeLiveActivitySubscription,
} from "./live-activities";
import {
  claimGuardianInvitation,
  createGuardianInvitation,
  loadGuardianInvitation,
  ProfileOnboardingError,
  synthesizePlayingExperienceNarrative,
  updatePlayingProfile,
} from "./profile-onboarding";
import {
  approveImportedMatch,
  applyProfessionalEventResearch,
  approveReadySandRatingMatches,
  createRatingConfiguration,
  evaluateCurrentRating,
  importSandSource,
  linkExternalPlayer,
  loadPublicPlayerPerformanceByHandle,
  loadPublicRatingLab,
  loadPublicProEvent,
  loadPublicProMatch,
  loadPublicProCoverage,
  loadPublicWorldRankings,
  loadProfessionalEventMediaUploadContext,
  loadSandDataOverview,
  mergeUnclaimedProfile,
  queuePlayerSourceConnection,
  refreshAvpLeague,
  refreshActiveFivbEvents,
  refreshFivbEventIndex,
  refreshSandRatingNetwork,
  refreshWorldRankings,
  researchProfessionalEvent,
  rejectImportedMatch,
  requestProfileClaim,
  reviewProfileClaim,
  reviewPlayerSourceConnection,
  SandDataServiceError,
  saveAvpRosterAssignment,
  saveProfessionalEventEditorial,
  saveProfessionalEventMedia,
  saveProfessionalMatchSchedule,
  saveProfessionalWatchOption,
  searchPublicPlayers,
  searchDunaPlayers,
  removeProfessionalEventMedia,
  removeProfessionalWatchOption,
} from "./sand-data/service";
import {
  buildPersonDataExport,
  cancelAccountDeletion,
  getAccountDeletionReadiness,
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
import { loadWeatherForecast, resolveWeatherCoordinates } from "./weather";

async function attachEventWeather(
  event: EventSummary,
  now = new Date(),
): Promise<EventSummary> {
  if (
    event.location?.mode === "online" ||
    Date.parse(event.endsAt) < now.getTime() - 6 * 60 * 60_000
  ) {
    return event;
  }
  const coordinates = await resolveWeatherCoordinates({
    latitude: event.location?.latitude,
    longitude: event.location?.longitude,
    googlePlaceId: event.location?.googlePlaceId,
    query: [event.location?.venueName, event.location?.address]
      .filter(Boolean)
      .join(", "),
    now,
  });
  if (!coordinates) return event;
  return {
    ...event,
    location: event.location
      ? {
          ...event.location,
          ...coordinates,
          confidence: event.location.confidence ?? "approximate",
        }
      : event.location,
    weather: await loadWeatherForecast({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timezone: event.timezone,
      startsAt: new Date(
        Math.max(now.getTime(), Date.parse(event.startsAt) - 6 * 60 * 60_000),
      ),
      endsAt: new Date(Date.parse(event.endsAt) + 6 * 60 * 60_000),
      now,
    }),
  };
}

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

const pickupRequestStatusSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);

const pickupManagementSchema = z.object({
  pickupSessionId: z.string().uuid(),
  status: z.enum(["active", "cancelled", "completed"]),
  approvalRequired: z.boolean(),
  isHost: z.boolean(),
  isParticipant: z.boolean(),
  canEdit: z.boolean(),
  canCancel: z.boolean(),
  canLeave: z.boolean(),
  confirmedParticipantCount: z.number().int().nonnegative(),
  ownRequestStatus: pickupRequestStatusSchema.optional(),
  requests: z
    .array(
      z.object({
        id: z.string().uuid(),
        personId: z.string().uuid(),
        displayName: z.string(),
        avatarUrl: z.string().optional(),
        note: z.string().optional(),
        status: pickupRequestStatusSchema,
        createdAt: z.iso.datetime(),
      }),
    )
    .readonly(),
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
      googlePlaceId: z.string().trim().max(256).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
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
    smartRules: z.object({
      waitlistEnabled: z.boolean(),
      allowLateCancellation: z.boolean(),
      freeCancellationHours: z.number().int().min(0).max(8_760),
      bookingOpensDays: z.number().int().min(0).max(730),
      bookingClosesMinutes: z.number().int().min(0).max(43_200),
      autoCancelLowAttendance: z.boolean(),
      minimumAttendance: z.number().int().min(1).max(10_000),
      approvalRequired: z.boolean(),
    }),
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
  if (error instanceof VideoServiceError) {
    const code =
      error.code === "VIDEO_NOT_FOUND" ||
      error.code === "ASSOCIATION_NOT_FOUND" ||
      error.code === "GRANT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "PLAYBACK_FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "DATABASE_REQUIRED" ||
              error.code === "MUX_REQUIRED" ||
              error.code === "R2_REQUIRED" ||
              error.code === "SIGNED_PLAYBACK_REQUIRED" ||
              error.code === "LIVE_PROVIDER_FAILED" ||
              error.code === "UPLOAD_PROVIDER_FAILED"
            ? "INTERNAL_SERVER_ERROR"
            : error.code === "INVALID_ASSOCIATION" ||
                error.code === "UPLOAD_PART_INVALID" ||
                error.code === "INVALID_GRANT_WINDOW"
              ? "BAD_REQUEST"
              : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof VisionServiceError) {
    const code =
      error.code === "SESSION_NOT_FOUND" ||
      error.code === "VIDEO_NOT_FOUND" ||
      error.code === "MATCH_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "VERSION_CONFLICT"
          ? "CONFLICT"
          : error.code === "INVALID_EVENT"
            ? "BAD_REQUEST"
            : error.code === "REMOTE_EXPIRED"
              ? "FORBIDDEN"
              : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof HealthServiceError) {
    const code =
      error.code === "HEALTH_NOT_FOUND" || error.code === "GRANT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "ACCESS_DENIED" || error.code === "ADULT_REQUIRED"
          ? "FORBIDDEN"
          : error.code === "INVALID_GRANT"
            ? "BAD_REQUEST"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof PrivacyError) {
    const code =
      error.code === "REQUEST_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "REQUEST_NOT_CANCELLABLE"
          ? "PRECONDITION_FAILED"
          : error.code === "DATABASE_REQUIRED"
            ? "INTERNAL_SERVER_ERROR"
            : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof FamilyWalletError) {
    const code =
      error.code === "DEPENDENT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "DATABASE_REQUIRED"
          ? "INTERNAL_SERVER_ERROR"
          : error.code === "TRANSFER_CONFLICT"
            ? "CONFLICT"
            : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof IdentityVerificationError) {
    const code =
      error.code === "VERIFICATION_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "DATABASE_REQUIRED" || error.code === "STRIPE_REQUIRED"
          ? "INTERNAL_SERVER_ERROR"
          : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof ProfileOnboardingError) {
    const code =
      error.code === "PERSON_NOT_FOUND" || error.code === "INVITATION_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "SUBJECT_NOT_ALLOWED"
          ? "FORBIDDEN"
          : error.code === "INVITATION_ALREADY_CLAIMED"
            ? "CONFLICT"
            : error.code === "DATABASE_REQUIRED"
              ? "INTERNAL_SERVER_ERROR"
              : "PRECONDITION_FAILED";
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
  if (error instanceof SandDataServiceError) {
    const code =
      error.code === "MATCH_NOT_FOUND" || error.code === "PLAYER_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "MAPPING_CONFLICT" ||
            error.code === "MERGE_CONFLICT" ||
            error.code === "CLAIM_CONFLICT"
          ? "CONFLICT"
          : error.code === "SUPER_ADMIN_REQUIRED"
            ? "FORBIDDEN"
            : error.code === "DATABASE_REQUIRED" ||
                error.code === "SOURCE_UNAVAILABLE"
              ? "INTERNAL_SERVER_ERROR"
              : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  throw error;
}

const videoVenueInputSchema = z
  .object({
    venueId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(180),
    address: z.string().trim().max(500).optional(),
    googlePlaceId: z.string().trim().max(255).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .refine(
    (venue) =>
      (venue.latitude === undefined) === (venue.longitude === undefined),
    {
      message: "Venue latitude and longitude must be supplied together.",
      path: ["latitude"],
    },
  );

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
  videos: publicProcedure
    .input(
      z
        .object({
          eventId: z.string().uuid().optional(),
          matchId: z.string().uuid().optional(),
          ownerHandle: z.string().trim().min(2).max(48).optional(),
          liveOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .output(z.array(videoSummarySchema).readonly())
    .query(async ({ input }) => {
      try {
        return await loadPublicVideos(input ?? {});
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  videoPlayback: publicProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        accessToken: z.string().trim().min(32).max(160).optional(),
        platform: z.enum(["ios", "web"]),
      }),
    )
    .output(videoPlaybackSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadVideoPlayback({
          ...input,
          actor: ctx.actor,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  videoViewHeartbeat: publicProcedure
    .use(
      rateLimitMiddleware({
        id: "video-view-heartbeat",
        capacity: 180,
        refillPerMinute: 120,
        scope: "ip",
      }),
    )
    .input(
      z.object({
        videoId: z.string().uuid(),
        viewSessionId: z.string().uuid(),
        watchedSeconds: z
          .number()
          .int()
          .min(0)
          .max(12 * 60 * 60),
        completed: z.boolean(),
      }),
    )
    .output(z.object({ recorded: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await recordVideoViewHeartbeat({ ...input, now: ctx.now });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
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
  visionRemoteSession: publicProcedure
    .use(
      rateLimitMiddleware({
        id: "vision-remote-read",
        capacity: 180,
        refillPerMinute: 120,
        scope: "ip",
      }),
    )
    .input(z.object({ token: z.string().trim().min(32).max(160) }))
    .output(visionSessionSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadRemoteVisionSession({
          token: input.token,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  updateVisionRemoteSession: publicProcedure
    .use(
      rateLimitMiddleware({
        id: "vision-remote-update",
        capacity: 90,
        refillPerMinute: 60,
        scope: "ip",
      }),
    )
    .input(
      z.object({
        token: z.string().trim().min(32).max(160),
        settings: visionSessionSettingsSchema.optional(),
        status: z.enum(["setup", "ready", "recording", "ended"]).optional(),
        expectedVersion: z.number().int().positive().optional(),
      }),
    )
    .output(visionSessionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await updateRemoteVisionSession({ ...input, now: ctx.now });
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
    .query(async ({ input }) => {
      const events = (await getRepository().public.events()).filter((event) => {
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
      });
      return Promise.all(events.map((event) => attachEventWeather(event)));
    }),
  eventBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .output(eventSummarySchema)
    .query(async ({ input }) => {
      const event = await getRepository().public.eventBySlug(input.slug);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      return attachEventWeather(event);
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
  courtAvailability: publicProcedure
    .input(
      z.object({
        venueId: z.string().uuid(),
        date: z.iso.date(),
        durationMinutes: z.number().int().min(15).max(480),
      }),
    )
    .output(courtAvailabilitySchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadCourtAvailability({
          ...input,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  courtBookingInvite: publicProcedure
    .input(z.object({ inviteToken: z.string().uuid() }))
    .output(courtBookingInviteSummarySchema)
    .query(async ({ input }) => {
      try {
        return await loadCourtBookingInvite(input.inviteToken);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  guardianInvitation: publicProcedure
    .input(z.object({ token: z.string().min(32).max(96) }))
    .output(
      z
        .object({
          invitationId: z.string().uuid(),
          childDisplayName: z.string(),
          relationship: z.string(),
          status: z.enum(["pending", "claimed", "expired", "cancelled"]),
          expiresAt: z.iso.datetime(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      try {
        return await loadGuardianInvitation(input.token, ctx.now);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  playerInvitation: publicProcedure
    .input(z.object({ inviteToken: z.string().min(32).max(96) }))
    .output(playerInvitationSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadPlayerInvitation(input.inviteToken, ctx.now);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  staffInvitation: publicProcedure
    .input(z.object({ inviteToken: z.string().min(32).max(128) }))
    .output(
      z.object({
        id: z.string().uuid(),
        organizationName: z.string(),
        invitedName: z.string(),
        role: z.enum(["coach", "manager", "front-desk", "accountant"]),
        workerClassification: z.enum(["1099-contractor", "w2-employee"]),
        status: z.enum(["pending", "claimed", "expired", "cancelled"]),
        expiresAt: z.iso.datetime(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        return await loadStaffInvitation(input.inviteToken, ctx.now);
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
  searchPlayers: publicProcedure
    .input(
      z.object({
        query: z.string().trim().min(2).max(100),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(({ input }) => searchPublicPlayers(input)),
  playerProfile: publicProcedure
    .input(z.object({ handle: z.string().min(1) }))
    .output(personSummarySchema)
    .query(async ({ input }) => {
      const player = await getRepository().public.playerByHandle(input.handle);
      if (!player) throw new TRPCError({ code: "NOT_FOUND" });
      return player;
    }),
  playerPerformance: publicProcedure
    .input(z.object({ handle: z.string().trim().min(1).max(48) }))
    .query(async ({ input }) => {
      const performance = await loadPublicPlayerPerformanceByHandle(
        input.handle,
      );
      if (!performance) throw new TRPCError({ code: "NOT_FOUND" });
      return performance;
    }),
  ratingLab: publicProcedure.query(() => loadPublicRatingLab()),
  worldRankings: publicProcedure.query(() => loadPublicWorldRankings()),
  proCoverage: publicProcedure.query(() => loadPublicProCoverage()),
  proEvent: publicProcedure
    .input(z.object({ slug: z.string().trim().min(1).max(180) }))
    .query(async ({ input }) => {
      const event = await loadPublicProEvent(input.slug);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      return event;
    }),
  proMatch: publicProcedure
    .input(
      z.object({
        eventSlug: z.string().trim().min(1).max(180),
        matchId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      const match = await loadPublicProMatch(input.eventSlug, input.matchId);
      if (!match) throw new TRPCError({ code: "NOT_FOUND" });
      return match;
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
  organizationStorefront: publicProcedure
    .input(z.object({ slug: z.string().trim().min(1).max(64) }))
    .output(publicOrganizationStorefrontSchema)
    .query(async ({ input }) => {
      const storefront = await loadPublicOrganizationStorefront(input.slug);
      if (!storefront) throw new TRPCError({ code: "NOT_FOUND" });
      return storefront;
    }),
  coaches: publicProcedure
    .input(
      z
        .object({
          organizationSlug: z.string().trim().min(1).max(64).optional(),
        })
        .optional(),
    )
    .output(z.array(publicCoachSchema).readonly())
    .query(({ input }) =>
      loadPublicCoaches({
        organizationSlug: input?.organizationSlug,
      }),
    ),
  coach: publicProcedure
    .input(
      z.object({
        handle: z.string().trim().min(2).max(48),
        organizationSlug: z.string().trim().min(1).max(64).optional(),
      }),
    )
    .output(publicCoachSchema)
    .query(async ({ input }) => {
      const coach = await loadPublicCoach(input.handle, input.organizationSlug);
      if (!coach) throw new TRPCError({ code: "NOT_FOUND" });
      return coach;
    }),
});

const playerRouter = router({
  healthDashboard: adultProcedure
    .output(healthDashboardSchema)
    .query(async ({ ctx }) => {
      try {
        return await loadHealthDashboard({
          actor: ctx.actor!,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  healthProfile: adultProcedure
    .input(z.object({ personId: z.string().uuid() }))
    .output(healthProfileSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadHealthProfile({
          actor: ctx.actor!,
          subjectPersonId: input.personId,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  syncHealthSamples: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "health-sync",
        // A first-time HealthKit backfill is deliberately paged and encrypted
        // in small requests. Allow one bounded import session without treating
        // it like interactive API abuse.
        capacity: 75,
        refillPerMinute: 15,
      }),
    )
    .input(
      z.object({
        categories: z.array(healthCategorySchema).min(1).max(4),
        timezone: z.string().trim().min(1).max(64),
        earliestAuthorizedAt: z.iso.datetime().optional(),
        samples: z.array(healthSampleInputSchema).max(500),
        deletedExternalIds: z.array(z.string().uuid()).max(500),
      }),
    )
    .output(
      z.object({
        imported: z.number().int().nonnegative(),
        deleted: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await syncHealthSamples({
          actor: ctx.actor!,
          categories: input.categories,
          timezone: input.timezone,
          earliestAuthorizedAt: input.earliestAuthorizedAt
            ? new Date(input.earliestAuthorizedAt)
            : undefined,
          samples: input.samples,
          deletedExternalIds: input.deletedExternalIds,
          syncedAt: ctx.now,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  createHealthSharingGrant: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "health-sharing-grant",
        capacity: 20,
        refillPerMinute: 5,
      }),
    )
    .input(
      z
        .object({
          kind: z.enum(["player", "coach", "organization"]),
          personId: z.string().uuid().optional(),
          organizationId: z.string().uuid().optional(),
          categories: z.array(healthCategorySchema).min(1).max(4),
          scopes: z.array(healthSharingScopeSchema).min(1).max(3),
          expiresAt: z.iso.datetime(),
          idempotencyKey: z.string().uuid(),
        })
        .refine(
          (value) =>
            value.kind === "organization"
              ? Boolean(value.organizationId && !value.personId)
              : Boolean(value.personId && !value.organizationId),
          {
            message: "Choose exactly one eligible Health recipient.",
            path: ["kind"],
          },
        ),
    )
    .output(z.object({ id: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createHealthSharingGrant",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createHealthSharingGrant({
              actor: ctx.actor!,
              candidate: {
                kind: input.kind,
                personId: input.personId,
                organizationId: input.organizationId,
              },
              categories: input.categories,
              scopes: input.scopes,
              expiresAt: new Date(input.expiresAt),
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
  revokeHealthSharingGrant: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "health-sharing-revoke",
        capacity: 30,
        refillPerMinute: 10,
      }),
    )
    .input(
      z.object({
        grantId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(z.object({ revoked: z.literal(true) }))
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.revokeHealthSharingGrant",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await revokeHealthSharingGrant({
              actor: ctx.actor!,
              grantId: input.grantId,
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
  disconnectHealth: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "health-disconnect",
        capacity: 5,
        refillPerMinute: 1,
      }),
    )
    .input(z.object({ idempotencyKey: z.string().uuid() }))
    .output(
      z.object({
        deletedSamples: z.number().int().nonnegative(),
        revokedGrants: z.number().int().nonnegative(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.disconnectHealth",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await disconnectHealth({
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
  videoStudio: protectedProcedure
    .output(videoStudioSchema)
    .query(async ({ ctx }) => {
      try {
        return await loadVideoStudio(ctx.actor!.personId, ctx.now);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  videoAssociations: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().max(120).default(""),
      }),
    )
    .output(z.array(videoAssociationOptionSchema).readonly())
    .query(async ({ input, ctx }) => {
      try {
        return await searchVideoAssociations(
          ctx.actor!.personId,
          input.query,
          ctx.now,
        );
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  createVisionSession: protectedProcedure
    .use(requireScope("social:write"))
    .use(
      rateLimitMiddleware({
        id: "vision-session-create",
        capacity: 12,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        title: z.string().trim().min(2).max(180),
        matchId: z.string().uuid().optional(),
        settings: visionSessionSettingsSchema,
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        session: visionSessionSchema,
        remoteUrl: z.url(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createVisionSession",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createVisionSession({
              ...input,
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
  visionSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .output(visionSessionSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadOwnedVisionSession({
          actor: ctx.actor!,
          sessionId: input.sessionId,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  updateVisionSession: protectedProcedure
    .use(requireScope("social:write"))
    .input(
      z.object({
        sessionId: z.string().uuid(),
        settings: visionSessionSettingsSchema.optional(),
        status: z.enum(["setup", "ready", "recording", "ended"]).optional(),
        expectedVersion: z.number().int().positive().optional(),
      }),
    )
    .output(visionSessionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await updateOwnedVisionSession({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  updateVisionPreview: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "vision-preview",
        capacity: 90,
        refillPerMinute: 45,
      }),
    )
    .input(
      z.object({
        sessionId: z.string().uuid(),
        jpegBase64: z
          .string()
          .min(32)
          .max(280_000)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        capturedAt: z.iso.datetime(),
      }),
    )
    .output(z.object({ accepted: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await updateVisionPreview({
          actor: ctx.actor!,
          sessionId: input.sessionId,
          jpegBase64: input.jpegBase64,
          capturedAt: new Date(input.capturedAt),
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  appendVisionTimelineEvents: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "vision-timeline",
        capacity: 300,
        refillPerMinute: 240,
      }),
    )
    .input(
      z.object({
        sessionId: z.string().uuid(),
        events: z.array(visionTimelineEventSchema).min(1).max(100),
      }),
    )
    .output(z.object({ accepted: z.number().int().nonnegative() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await appendVisionTimelineEvents({
          actor: ctx.actor!,
          sessionId: input.sessionId,
          events: input.events,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  attachVisionSessionToVideo: protectedProcedure
    .use(requireScope("social:write"))
    .input(
      z.object({
        sessionId: z.string().uuid(),
        videoId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(visionSessionSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.attachVisionSessionToVideo",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await attachVisionSessionToVideo({
              ...input,
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
  revokeVisionRemote: protectedProcedure
    .use(requireScope("social:write"))
    .input(
      z.object({
        sessionId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(z.object({ revoked: z.literal(true) }))
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.revokeVisionRemote",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await revokeVisionRemote({
              actor: ctx.actor!,
              sessionId: input.sessionId,
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
  videoMetrics: protectedProcedure
    .output(z.array(videoMetricsSchema).readonly())
    .query(async ({ ctx }) => {
      try {
        return await loadOwnedVideoMetrics(ctx.actor!.personId);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  createLiveVideo: adultProcedure
    .use(requireScope("social:write"))
    .use(
      rateLimitMiddleware({
        id: "video-live-create",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .input(
      z.object({
        title: z.string().trim().min(2).max(180),
        category: z.enum(["practice", "event", "match", "social"]),
        eventId: z.string().uuid().optional(),
        matchId: z.string().uuid().optional(),
        venue: videoVenueInputSchema.optional(),
        liveVisibility: z.enum(["public", "link-only"]),
        recordingVisibility: z.enum(["public", "private"]),
        hasAudio: z.boolean(),
        courtCalibration: courtCalibrationSchema.optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(liveVideoSessionSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createLiveVideo",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createLiveVideo({
              ...input,
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
  finishLiveVideo: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(videoSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.finishLiveVideo",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await finishLiveVideo({
              actor: ctx.actor!,
              videoId: input.videoId,
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
  updateVideoPrivacy: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        liveVisibility: z.enum(["public", "link-only"]),
        recordingVisibility: z.enum(["public", "private"]),
        publishedToProfile: z.boolean(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(videoSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.updateVideoPrivacy",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateVideoPrivacy({
              ...input,
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
  createVideoShareLink: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        expiresAt: z.iso.datetime().optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        shareUrl: z.url(),
        expiresAt: z.iso.datetime().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createVideoShareLink",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createVideoShareLink({
              actor: ctx.actor!,
              videoId: input.videoId,
              expiresAt: input.expiresAt
                ? new Date(input.expiresAt)
                : undefined,
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
  requestVideoMusicRemoval: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(videoSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.requestVideoMusicRemoval",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await requestVideoMusicRemoval({
              actor: ctx.actor!,
              videoId: input.videoId,
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
  beginVideoUpload: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "video-upload-begin",
        capacity: 12,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        title: z.string().trim().min(2).max(180),
        category: z.enum(["practice", "event", "match", "social"]),
        eventId: z.string().uuid().optional(),
        matchId: z.string().uuid().optional(),
        venue: videoVenueInputSchema.optional(),
        recordingVisibility: z.enum(["public", "private"]),
        publishedToProfile: z.boolean(),
        hasAudio: z.boolean(),
        originalFileName: z.string().trim().min(1).max(255),
        mimeType: z.enum(["video/mp4", "video/quicktime"]),
        bytes: z
          .number()
          .int()
          .positive()
          .max(5 * 1024 ** 4),
        durationSeconds: z
          .number()
          .int()
          .positive()
          .max(24 * 60 * 60),
        courtCalibration: courtCalibrationSchema.optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(videoUploadSessionSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.beginVideoUpload",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await beginVideoUpload({
              ...input,
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
  videoUploadPartUrl: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        partNumber: z.number().int().min(1).max(10_000),
      }),
    )
    .output(videoUploadPartUrlSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await presignVideoUploadPart({
          actor: ctx.actor!,
          ...input,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  recordVideoUploadPart: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        partNumber: z.number().int().min(1).max(10_000),
        etag: z.string().trim().min(1).max(512),
        sizeBytes: z
          .number()
          .int()
          .positive()
          .max(64 * 1024 * 1024),
      }),
    )
    .output(
      z.object({
        uploadedParts: z.array(z.number().int().min(1).max(10_000)).readonly(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await recordVideoUploadPart({
          actor: ctx.actor!,
          ...input,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  completeVideoUpload: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(videoSummarySchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.completeVideoUpload",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await completeVideoUpload({
              actor: ctx.actor!,
              videoId: input.videoId,
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
  abortVideoUpload: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(z.object({ aborted: z.literal(true) }))
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.abortVideoUpload",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await abortVideoUpload({
              actor: ctx.actor!,
              videoId: input.videoId,
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
  dashboard: protectedProcedure
    .output(playerDashboardSchema)
    .query(({ ctx }) => getRepository().player.dashboard(ctx.actor!.personId)),
  registerLiveActivity: protectedProcedure
    .use(requireScope("social:write"))
    .use(
      rateLimitMiddleware({
        id: "live-activity-register",
        capacity: 30,
        refillPerMinute: 20,
      }),
    )
    .input(
      z.object({
        kind: z.enum(["upcoming", "match"]),
        subjectId: z.string().uuid(),
        activityId: z.string().trim().min(1).max(128),
        pushToken: z
          .string()
          .trim()
          .min(32)
          .max(512)
          .regex(/^[a-fA-F0-9]+$/, "Invalid APNs Live Activity token."),
        environment: z.enum(["sandbox", "production"]),
      }),
    )
    .output(
      z.object({
        registered: z.literal(true),
        deliveryConfigured: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const allowed = await canRegisterLiveActivity({
        personId: ctx.actor!.personId,
        kind: input.kind,
        subjectId: input.subjectId,
      });
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This Live Activity is available only to its participant or to signed-in followers of a public Pro Tour match.",
        });
      }
      return registerLiveActivitySubscription({
        personId: ctx.actor!.personId,
        ...input,
        now: ctx.now,
      });
    }),
  unregisterLiveActivity: protectedProcedure
    .use(requireScope("social:write"))
    .input(
      z.object({
        pushToken: z
          .string()
          .trim()
          .min(32)
          .max(512)
          .regex(/^[a-fA-F0-9]+$/, "Invalid APNs Live Activity token."),
      }),
    )
    .output(z.object({ revoked: z.boolean() }))
    .mutation(({ input, ctx }) =>
      revokeLiveActivitySubscription({
        personId: ctx.actor!.personId,
        pushToken: input.pushToken,
        now: ctx.now,
      }),
    ),
  catalogOfferEligibility: protectedProcedure
    .input(z.object({ catalogItemId: z.string().uuid() }))
    .output(catalogOfferEligibilitySchema)
    .query(({ input, ctx }) =>
      getCatalogOfferEligibility({
        actor: ctx.actor!,
        catalogItemId: input.catalogItemId,
        now: ctx.now,
      }),
    ),
  startCatalogCheckout: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "catalog-checkout",
        capacity: 12,
        refillPerMinute: 6,
      }),
    )
    .input(
      z.object({
        catalogItemId: z.string().uuid(),
        catalogVariantId: z.string().uuid(),
        catalogPriceId: z.string().uuid().optional(),
        paymentMethod: z.enum(["card", "credit", "cash"]),
        quantity: z.number().int().min(1).max(50),
        successUrl: z.url(),
        cancelUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(catalogCheckoutResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startCatalogCheckout",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startCatalogCheckout({
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
  catalogCheckoutStatus: protectedProcedure
    .input(z.object({ checkoutSessionId: z.string().min(1).max(255) }))
    .output(catalogCheckoutStatusSchema)
    .query(({ ctx, input }) =>
      getCatalogCheckoutStatus(input.checkoutSessionId, ctx.actor!.personId),
    ),
  organizationWallets: protectedProcedure
    .output(z.array(organizationWalletSummarySchema).readonly())
    .query(({ ctx }) =>
      ctx.actor!.isDemo && !process.env.DATABASE_URL
        ? []
        : loadPlayerOrganizationWallets(ctx.actor!.personId, ctx.now),
    ),
  familyWallets: protectedProcedure
    .output(
      z
        .array(
          z.object({
            dependentPersonId: z.string().uuid(),
            dependentName: z.string(),
            organizationId: z.string().uuid(),
            organizationName: z.string(),
            organizationSlug: z.string(),
            guardianCredits: z.number().int().nonnegative(),
            dependentCredits: z.number().int().nonnegative(),
            fundingEnabled: z.boolean(),
            relationshipStatus: z.enum(["pending", "verified", "rejected"]),
          }),
        )
        .readonly(),
    )
    .query(({ ctx }) =>
      ctx.actor!.isDemo && !process.env.DATABASE_URL
        ? []
        : loadFamilyWallets(ctx.actor!),
    ),
  transferFamilyCredits: adultProcedure
    .use(requireScope("wallet:write"))
    .use(
      rateLimitMiddleware({
        id: "family-credit-transfer",
        capacity: 8,
        refillPerMinute: 2,
      }),
    )
    .input(
      z.object({
        dependentPersonId: z.string().uuid(),
        organizationId: z.string().uuid(),
        credits: z.number().int().min(1).max(100_000),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        transferId: z.string().uuid(),
        journalId: z.string().uuid(),
        status: z.literal("posted"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.transferFamilyCredits",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await transferFamilyCredits({
              actor: ctx.actor!,
              ...input,
              requestId: ctx.requestId,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  claimOrganizationInvitation: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "organization-invitation-claim",
        capacity: 8,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        inviteToken: z.string().min(32).max(96),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(playerInvitationClaimResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.claimOrganizationInvitation",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await claimPlayerInvitation({
              actor: ctx.actor!,
              inviteToken: input.inviteToken,
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
  claimStaffInvitation: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "staff-invitation-claim",
        capacity: 8,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        inviteToken: z.string().min(32).max(128),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.claimStaffInvitation",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await claimStaffInvitation({
              actor: ctx.actor!,
              inviteToken: input.inviteToken,
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
      z
        .object({
          teamAIds: z.array(z.string().uuid()).min(1).max(6),
          teamBIds: z.array(z.string().uuid()).min(1).max(6),
          venueId: z.string().uuid().optional(),
          scoringSystem: z.enum(["rally", "sideout"]),
          matchType: z.enum(["competitive", "friendly"]),
          allPlayersAgreedToRecord: z.literal(true),
          serviceOrder: z.object({
            A: z.array(z.string().uuid()).min(1).max(6),
            B: z.array(z.string().uuid()).min(1).max(6),
          }),
          initialServerPersonId: z.string().uuid(),
          deviceId: z.string().trim().min(8).max(128),
          idempotencyKey: z.string().uuid(),
        })
        .refine((value) => value.teamAIds.length === value.teamBIds.length, {
          message: "Both teams must have the same number of players.",
          path: ["teamBIds"],
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
              matchType: input.matchType,
              allPlayersAgreedToRecord: input.allPlayersAgreedToRecord,
              serviceOrder: input.serviceOrder,
              initialServerPersonId: input.initialServerPersonId,
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
  recordCompletedMatch: protectedProcedure
    .use(requireScope("matches:write"))
    .use(
      rateLimitMiddleware({
        id: "match-record",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(
      z
        .object({
          teamAIds: z.array(z.string().uuid()).min(1).max(6),
          teamBIds: z.array(z.string().uuid()).min(1).max(6),
          venueId: z.string().uuid().optional(),
          location: z
            .object({
              label: z.string().trim().min(1).max(500),
              googlePlaceId: z.string().trim().min(1).max(255).optional(),
              name: z.string().trim().min(1).max(255).optional(),
              address: z.string().trim().min(1).max(500).optional(),
              latitude: z.number().min(-90).max(90).optional(),
              longitude: z.number().min(-180).max(180).optional(),
            })
            .optional(),
          playedAt: z.iso.datetime(),
          setsToWin: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          setScores: z
            .array(
              z.object({
                a: z.number().int().nonnegative().max(99),
                b: z.number().int().nonnegative().max(99),
              }),
            )
            .min(1)
            .max(5),
          matchType: z.enum(["competitive", "friendly"]),
          allPlayersAgreedToRecord: z.literal(true),
          deviceId: z.string().trim().min(8).max(128),
          idempotencyKey: z.string().uuid(),
        })
        .refine((value) => value.teamAIds.length === value.teamBIds.length, {
          message: "Both teams must have the same number of players.",
          path: ["teamBIds"],
        }),
    )
    .output(matchScoringStateSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.recordCompletedMatch",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await recordCompletedMatch({
              actor: ctx.actor!,
              teamAIds: input.teamAIds,
              teamBIds: input.teamBIds,
              venueId: input.venueId,
              location: input.location,
              playedAt: new Date(input.playedAt),
              setsToWin: input.setsToWin,
              setScores: input.setScores,
              matchType: input.matchType,
              allPlayersAgreedToRecord: input.allPlayersAgreedToRecord,
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
  flagMatchHistory: protectedProcedure
    .use(requireScope("matches:write"))
    .input(
      z.object({
        matchId: z.string().uuid(),
        reasonCode: z.enum([
          "not-me",
          "wrong-score",
          "wrong-opponents",
          "duplicate",
          "other",
        ]),
        details: z.string().trim().max(1_000).optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        matchId: z.string().uuid(),
        status: z.literal("pending"),
        ratingEligibility: z.literal("held"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.flagMatchHistory",
        request: input,
        ctx,
        execute: () =>
          flagMatchHistoryInaccurate({
            actor: ctx.actor!,
            ...input,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
            now: ctx.now,
          }),
      }),
    ),
  removeSelfReportedMatch: protectedProcedure
    .use(requireScope("matches:write"))
    .input(
      z.object({
        matchId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        matchId: z.string().uuid(),
        removed: z.literal(true),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.removeSelfReportedMatch",
        request: input,
        ctx,
        execute: () =>
          removeSelfReportedMatch({
            actor: ctx.actor!,
            matchId: input.matchId,
            requestId: ctx.requestId,
            ipAddress: ctx.ipAddress,
            now: ctx.now,
          }),
      }),
    ),
  wallet: protectedProcedure
    .output(playerWalletSchema)
    .query(({ ctx }) => getRepository().player.wallet(ctx.actor!.personId)),
  settings: protectedProcedure
    .output(playerSettingsSchema)
    .query(({ ctx }) => getRepository().player.settings(ctx.actor!.personId)),
  inferPlayingExperience: protectedProcedure
    .input(
      z.object({
        narrative: z.string().trim().min(12).max(1_500),
      }),
    )
    .output(
      z.object({
        playingExperience: z
          .enum(["amateur", "high-school", "collegiate", "professional"])
          .optional(),
        playedIndoorPrior: z.boolean().optional(),
        yearsPlaying: z.number().int().min(0).max(100).optional(),
        heightMillimeters: z.number().int().min(600).max(2600).optional(),
        collegeName: z.string().max(120).optional(),
        summary: z.string(),
        confidence: z.enum(["low", "medium", "high"]),
        learnedFacts: z.array(z.string()).readonly(),
        missingFields: z.array(z.string()).readonly(),
        modelUsed: z.enum(["openai", "guided-fallback"]),
      }),
    )
    .mutation(({ input, ctx }) =>
      synthesizePlayingExperienceNarrative(input.narrative, ctx.now),
    ),
  updatePlayingProfile: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "playing-profile-update",
        capacity: 12,
        refillPerMinute: 6,
      }),
    )
    .input(
      z.object({
        subjectPersonId: z.string().uuid().optional(),
        legalGivenName: z.string().trim().min(1).max(80),
        legalMiddleName: z.string().trim().max(80).nullable().optional(),
        legalFamilyName: z.string().trim().min(1).max(80),
        heightMillimeters: z
          .number()
          .int()
          .min(600)
          .max(2600)
          .nullable()
          .optional(),
        playingExperience: z.enum([
          "amateur",
          "high-school",
          "collegiate",
          "professional",
        ]),
        playedIndoorPrior: z.boolean(),
        yearsPlaying: z.number().int().min(0).max(100),
        collegeName: z.string().trim().max(120).nullable().optional(),
        experienceSummary: z.string().trim().max(1_500).nullable().optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        personId: z.string().uuid(),
        status: z.enum(["complete", "guardian-required"]),
        guardianRequired: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.updatePlayingProfile",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updatePlayingProfile({
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
  createGuardianInvitation: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "guardian-invitation-create",
        capacity: 6,
        refillPerMinute: 1,
      }),
    )
    .input(
      z.object({
        subjectPersonId: z.string().uuid().optional(),
        relationship: z.string().trim().min(2).max(48),
        applicationOrigin: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        invitationId: z.string().uuid(),
        minorId: z.string().uuid(),
        inviteUrl: z.url(),
        expiresAt: z.iso.datetime(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.createGuardianInvitation",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createGuardianInvitation({
              actor: ctx.actor!,
              subjectPersonId: input.subjectPersonId,
              relationship: input.relationship,
              applicationOrigin: input.applicationOrigin,
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
  claimGuardianInvitation: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "guardian-invitation-claim",
        capacity: 6,
        refillPerMinute: 1,
      }),
    )
    .input(
      z.object({
        token: z.string().min(32).max(96),
        consentConfirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        guardianId: z.string().uuid(),
        minorId: z.string().uuid(),
        status: z.literal("pending-review"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.claimGuardianInvitation",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await claimGuardianInvitation({
              actor: ctx.actor!,
              token: input.token,
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
  startIdentityVerification: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "identity-verification-start",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .input(z.object({ idempotencyKey: z.string().uuid() }))
    .output(
      z.object({
        verificationId: z.string().uuid(),
        status: z.enum([
          "requires-input",
          "processing",
          "verified",
          "canceled",
          "redacted",
        ]),
        url: z.url().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startIdentityVerification",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startStripeIdentityVerification({
              actor: ctx.actor!,
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
  connectPlayerSource: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "player-source-connect",
        capacity: 6,
        refillPerMinute: 1,
      }),
    )
    .input(
      z.object({
        subjectPersonId: z.string().uuid().optional(),
        source: z.enum(["volleyball-life", "bvbinfo"]),
        profileUrl: z.string().trim().min(1).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        connectionId: z.string().uuid(),
        jobId: z.string().uuid(),
        status: z.literal("queued"),
        source: z.enum(["volleyball-life", "bvbinfo"]),
        profileUrl: z.url(),
        apiProfileUrl: z.url().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.connectPlayerSource",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await queuePlayerSourceConnection({
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
  requestProfileClaim: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "player-profile-claim",
        capacity: 4,
        refillPerMinute: 0.5,
      }),
    )
    .input(
      z.object({
        subjectPersonId: z.string().uuid().optional(),
        targetHandle: z.string().trim().min(2).max(48),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        jobId: z.string().uuid(),
        status: z.literal("review-required"),
        targetPersonId: z.string().uuid(),
        targetHandle: z.string(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.requestProfileClaim",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await requestProfileClaim({
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
  reviewPlayerSource: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "player-source-review",
        capacity: 10,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        connectionId: z.string().uuid(),
        decision: z.enum(["confirmed", "rejected"]),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        connectionId: z.string().uuid(),
        status: z.enum(["queued", "disconnected"]),
        jobId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.reviewPlayerSource",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await reviewPlayerSourceConnection({
              actor: ctx.actor!,
              ...input,
              requestId: ctx.requestId,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  handleAvailability: protectedProcedure
    .use(requireScope("profile:write"))
    .use(
      rateLimitMiddleware({
        id: "handle-availability",
        capacity: 30,
        refillPerMinute: 15,
      }),
    )
    .input(
      z.object({
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
      }),
    )
    .output(
      z.object({
        handle: z.string(),
        available: z.boolean(),
        isCurrent: z.boolean(),
        message: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        return await checkOwnHandleAvailability({
          actor: ctx.actor!,
          handle: input.handle,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
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
  accountDeletionReadiness: protectedProcedure
    .output(accountDeletionReadinessSchema)
    .query(async ({ ctx }) => {
      try {
        return await getAccountDeletionReadiness(ctx.actor!.personId);
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
        forfeitOrganizationCredits: z.boolean(),
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
              forfeitOrganizationCredits: input.forfeitOrganizationCredits,
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
          venueId: z.string().uuid().optional(),
          courtBookingId: z.string().uuid().optional(),
          address: z.string().trim().max(500).optional(),
          googlePlaceId: z.string().trim().max(256).optional(),
          latitude: z.number().min(-90).max(90).optional(),
          longitude: z.number().min(-180).max(180).optional(),
          locationConfidence: z
            .enum(["confirmed", "approximate"])
            .default("approximate"),
          capacity: z.number().int().min(2).max(48),
          format: z.enum(["2s", "3s", "4s", "6s", "king-queen"]),
          matchType: z.enum(["competitive", "casual"]).default("competitive"),
          genderPreference: z
            .enum(["open", "mens", "womens", "mixed"])
            .default("open"),
          note: z.string().trim().max(1_000).optional(),
          visibility: z.enum(["public", "unlisted"]),
          approvalRequired: z.boolean().default(false),
          smartRules: z
            .object({
              waitlistEnabled: z.boolean(),
              allowLateCancellation: z.boolean(),
              minimumNoticeMinutes: z.number().int().min(0).max(43_200),
              autoCancelLowAttendance: z.boolean(),
              minimumAttendance: z.number().int().min(2).max(48),
            })
            .default({
              waitlistEnabled: true,
              allowLateCancellation: false,
              minimumNoticeMinutes: 60,
              autoCancelLowAttendance: false,
              minimumAttendance: 2,
            }),
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
            venueId: input.venueId,
            courtBookingId: input.courtBookingId,
            address: input.address,
            googlePlaceId: input.googlePlaceId,
            latitude: input.latitude,
            longitude: input.longitude,
            locationConfidence: input.locationConfidence,
            capacity: input.capacity,
            format: input.format,
            matchType: input.matchType,
            genderPreference: input.genderPreference,
            note: input.note,
            visibility: input.visibility,
            approvalRequired: input.approvalRequired,
            smartRules: input.smartRules,
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
  pickupManagement: protectedProcedure
    .input(z.object({ pickupSessionId: z.string().uuid() }))
    .output(pickupManagementSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadPickupManagement({
          actor: ctx.actor!,
          pickupSessionId: input.pickupSessionId,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  requestPickupJoin: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "pickup-join-request",
        capacity: 12,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        pickupSessionId: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        status: z.literal("requested"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.requestPickupJoin",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await requestPickupJoin({
              actor: ctx.actor!,
              pickupSessionId: input.pickupSessionId,
              note: input.note,
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
  reviewPickupJoinRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.reviewPickupJoinRequest",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await reviewPickupJoinRequest({
              actor: ctx.actor!,
              requestId: input.requestId,
              decision: input.decision,
              traceId: ctx.requestId,
              ipAddress: ctx.ipAddress,
              now: ctx.now,
            });
          } catch (error) {
            return throwDomainError(error);
          }
        },
      }),
    ),
  updatePickup: protectedProcedure
    .input(
      z.object({
        pickupSessionId: z.string().uuid(),
        title: z.string().trim().min(2).max(140),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        venueName: z.string().trim().min(2).max(180),
        address: z.string().trim().max(500).optional(),
        googlePlaceId: z.string().trim().max(256).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        locationConfidence: z.enum(["confirmed", "approximate"]).optional(),
        capacity: z.number().int().min(2).max(100),
        note: z.string().trim().max(2_000).optional(),
        approvalRequired: z.boolean(),
        visibility: z.enum(["public", "unlisted"]),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        status: z.literal("active"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.updatePickup",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updatePickup({
              actor: ctx.actor!,
              ...input,
              startsAt: new Date(input.startsAt),
              endsAt: new Date(input.endsAt),
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
  cancelPickup: protectedProcedure
    .input(
      z.object({
        pickupSessionId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        status: z.literal("cancelled"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.cancelPickup",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await cancelPickup({
              actor: ctx.actor!,
              pickupSessionId: input.pickupSessionId,
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
  leavePickup: protectedProcedure
    .input(
      z.object({
        pickupSessionId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        status: z.literal("cancelled"),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.leavePickup",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await leavePickup({
              actor: ctx.actor!,
              pickupSessionId: input.pickupSessionId,
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
          subjectPersonId: z.string().uuid().optional(),
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
              subjectPersonId: input.subjectPersonId,
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
        subjectPersonId: z.string().uuid().optional(),
        localStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        durationMinutes: z.number().int().min(15).max(480),
        paymentMode: z.enum(["full", "split"]).default("full"),
        participants: z
          .array(
            z
              .object({
                personId: z.string().uuid().optional(),
                name: z.string().trim().min(1).max(120).optional(),
                email: z.email().optional(),
                phoneE164: z
                  .string()
                  .regex(/^\+[1-9]\d{7,14}$/)
                  .optional(),
              })
              .refine(
                (value) =>
                  Boolean(value.personId || value.email || value.phoneE164),
                "Choose a Duna player or provide an email or phone number.",
              ),
          )
          .default([]),
        policyAccepted: z.boolean(),
        policyFullScrollConfirmed: z.boolean(),
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
              subjectPersonId: input.subjectPersonId,
              courtId: input.courtId,
              localStartsAt: input.localStartsAt,
              durationMinutes: input.durationMinutes,
              paymentMode: input.paymentMode,
              participants: input.participants,
              policyAccepted: input.policyAccepted,
              policyFullScrollConfirmed: input.policyFullScrollConfirmed,
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
  createAvailabilityAlert: protectedProcedure
    .use(
      rateLimitMiddleware({
        id: "availability-alert-create",
        capacity: 8,
        refillPerMinute: 4,
      }),
    )
    .input(
      z
        .object({
          venueId: z.string().uuid(),
          courtId: z.string().uuid().optional(),
          targetDate: z.iso.date(),
          earliestMinute: z.number().int().min(0).max(1_439).default(0),
          latestMinute: z.number().int().min(1).max(1_440).default(1_440),
          durationMinutes: z.number().int().min(15).max(480),
          channel: z.enum(["sms", "push", "in-app"]).default("push"),
        })
        .refine(
          (value) => value.latestMinute > value.earliestMinute,
          "Alert end time must be later than its start time.",
        ),
    )
    .output(availabilityAlertResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createAvailabilityAlert({
          actor: ctx.actor!,
          venueId: input.venueId,
          courtId: input.courtId,
          targetDate: input.targetDate,
          earliestMinute: input.earliestMinute,
          latestMinute: input.latestMinute,
          durationMinutes: input.durationMinutes,
          channel: input.channel,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  startParticipantShareCheckout: adultProcedure
    .use(
      rateLimitMiddleware({
        id: "court-share-checkout",
        capacity: 8,
        refillPerMinute: 4,
      }),
    )
    .input(
      z.object({
        inviteToken: z.string().uuid(),
        policyAccepted: z.boolean(),
        policyFullScrollConfirmed: z.boolean(),
        successUrl: z.url(),
        cancelUrl: z.url(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(courtCheckoutResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "player.startParticipantShareCheckout",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await startParticipantShareCheckout({
              actor: ctx.actor!,
              inviteToken: input.inviteToken,
              policyAccepted: input.policyAccepted,
              policyFullScrollConfirmed: input.policyFullScrollConfirmed,
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
  eventDraft: organizationProcedure("sessions:read")
    .input(z.object({ sessionId: z.string().uuid() }))
    .output(eventDraftEditorSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadEventDraft(
          ctx.actor!.organizationId!,
          input.sessionId,
        );
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  createCatalogItem: organizationProcedure("payments:write")
    .input(
      z.object({
        type: z.enum(["event", "service", "good", "plan"]),
        subtype: z.string().trim().min(2).max(64),
        title: z.string().trim().min(2).max(140),
        shortSummary: z.string().trim().max(240).optional(),
        description: z.string().trim().max(20_000).optional(),
        visibility: z.enum(["public", "members", "private"]).default("public"),
        taxable: z.boolean().default(false),
        stripeTaxCode: z.string().trim().max(48).optional(),
        allowCard: z.boolean().default(true),
        allowCash: z.boolean().default(false),
        allowCredits: z.boolean().default(false),
        membershipRequired: z.boolean().default(false),
        priceMinor: z.number().int().min(0).max(100_000_000).optional(),
        memberPriceMinor: z.number().int().min(0).max(100_000_000).optional(),
        nonMemberPriceMinor: z
          .number()
          .int()
          .min(0)
          .max(100_000_000)
          .optional(),
        annualPriceMinor: z.number().int().min(0).max(100_000_000).optional(),
        annualMemberPriceMinor: z
          .number()
          .int()
          .min(0)
          .max(100_000_000)
          .optional(),
        annualNonMemberPriceMinor: z
          .number()
          .int()
          .min(0)
          .max(100_000_000)
          .optional(),
        creditCost: z.number().int().positive().max(100_000).optional(),
        recurringInterval: z.enum(["week", "month", "year"]).optional(),
        recurringIntervalCount: z.number().int().min(1).max(52).optional(),
        options: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(48),
              values: z.array(z.string().trim().min(1).max(96)).min(1).max(100),
            }),
          )
          .max(12)
          .default([]),
        configuration: z.record(z.string(), z.unknown()).default({}),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createCatalogItem",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createCatalogItem({
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
  createInventoryStock: organizationProcedure("payments:write")
    .input(
      z.object({
        catalogVariantId: z.string().uuid(),
        inventoryLocationId: z.string().uuid().optional(),
        locationName: z.string().trim().min(2).max(120).optional(),
        venueId: z.string().uuid().optional(),
        purpose: z.enum(["sale", "rental", "coach-use", "operations"]),
        trackingMode: z.enum(["quantity", "serialized"]),
        quantity: z.number().int().positive().max(1_000_000),
        reorderPoint: z.number().int().min(0).max(1_000_000).default(0),
        serialNumber: z.string().trim().max(128).optional(),
        assetTag: z.string().trim().max(128).optional(),
        condition: z.string().trim().min(2).max(48).default("new"),
        unitCostMinor: z.number().int().min(0).max(100_000_000).optional(),
        acquiredAt: z.iso.date().optional(),
        vendorName: z.string().trim().max(160).optional(),
        vendorReference: z.string().trim().max(160).optional(),
        receiptUrl: z.url().optional(),
        placedInServiceAt: z.iso.date().optional(),
        depreciationMethod: z
          .enum([
            "straight-line",
            "declining-balance",
            "section-179",
            "bonus",
            "none",
          ])
          .optional(),
        usefulLifeMonths: z.number().int().positive().max(600).optional(),
        salvageValueMinor: z.number().int().min(0).max(100_000_000).optional(),
        taxAssetClass: z.string().trim().max(96).optional(),
        notes: z.string().trim().max(2_000).optional(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createInventoryStock",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createInventoryStock({
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
  updateCatalogItem: organizationProcedure("payments:write")
    .input(
      z.object({
        catalogItemId: z.string().uuid(),
        title: z.string().trim().min(2).max(140),
        shortSummary: z.string().trim().max(240).optional(),
        description: z.string().trim().max(20_000).optional(),
        visibility: z.enum(["public", "members", "private"]),
        configuration: z.record(z.string(), z.unknown()).default({}),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateCatalogItem",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateCatalogItem({
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
  setCatalogItemStatus: organizationProcedure("payments:write")
    .input(
      z.object({
        catalogItemId: z.string().uuid(),
        status: z.enum(["draft", "active", "archived"]),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.setCatalogItemStatus",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await setCatalogItemStatus({
              actor: ctx.actor!,
              catalogItemId: input.catalogItemId,
              status: input.status,
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
  updateCommerceSettings: organizationProcedure("payments:write")
    .input(
      z.object({
        legalName: z.string().trim().max(180).optional(),
        addressLine1: z.string().trim().min(2).max(160),
        addressLine2: z.string().trim().max(160).optional(),
        locality: z.string().trim().min(2).max(100),
        administrativeArea: z.string().trim().min(1).max(100),
        postalCode: z.string().trim().min(2).max(24),
        countryCode: z.string().trim().length(2),
        googlePlaceId: z.string().trim().max(256).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        stripeTaxEnabled: z.boolean(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateCommerceSettings",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateOrganizationCommerceSettings({
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
  updateOrganizationProfile: organizationProcedure("members:write")
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        timezone: z.string().trim().min(3).max(64),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateOrganizationProfile",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateOrganizationProfileSettings({
              actor: ctx.actor!,
              name: input.name,
              timezone: input.timezone,
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
  updateTheme: organizationProcedure("sessions:write")
    .input(
      z.object({
        brandDisplayName: z.string().trim().max(120).optional(),
        membershipProgramName: z.string().trim().max(120).optional(),
        logoUrl: z.url().optional(),
        markUrl: z.url().optional(),
        logoLightUrl: z.url().optional(),
        logoDarkUrl: z.url().optional(),
        heroMediaType: z.enum(["image", "video"]).optional(),
        heroMediaUrl: z.url().optional(),
        heroPosterUrl: z.url().optional(),
        tagline: z.string().trim().max(180).optional(),
        profileSummary: z.string().trim().max(2_000).optional(),
        brandVoice: z.string().trim().max(4_000).optional(),
        palette: z.object({
          primary: z.string().regex(/^#[0-9a-f]{6}$/i),
          accent: z.string().regex(/^#[0-9a-f]{6}$/i),
          sand: z.string().regex(/^#[0-9a-f]{6}$/i),
          ink: z.string().regex(/^#[0-9a-f]{6}$/i),
          canvas: z.string().regex(/^#[0-9a-f]{6}$/i),
          success: z.string().regex(/^#[0-9a-f]{6}$/i),
        }),
        typography: z.object({
          heading: z.enum([
            "Instrument Sans",
            "DM Sans",
            "Space Grotesk",
            "Playfair Display",
          ]),
          body: z.enum(["Archivo", "Inter", "DM Sans", "Source Sans 3"]),
        }),
        fontLicenseConfirmed: z.boolean(),
        safeFallbackFont: z.string().trim().min(2).max(240),
        cardStyle: z.enum(["soft", "crisp", "borderless"]),
        profileLayout: z.enum(["editorial", "immersive", "compact"]),
        publish: z.boolean(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateTheme",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateOrganizationTheme({
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
  addBrandKnowledgeSource: organizationProcedure("sessions:write")
    .input(
      z.object({
        scope: z.enum(["brand", "organization", "venue", "service", "product"]),
        kind: z.enum(["note", "link", "document"]),
        title: z.string().trim().min(2).max(160),
        sourceUrl: z.url().optional(),
        storageUrl: z.url().optional(),
        mimeType: z.string().trim().max(120).optional(),
        originalFilename: z.string().trim().max(500).optional(),
        contentText: z.string().trim().min(20).max(100_000),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.addBrandKnowledgeSource",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await addOrganizationBrandKnowledgeSource({
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
  archiveBrandKnowledgeSource: organizationProcedure("sessions:write")
    .input(
      z.object({
        sourceId: z.string().uuid(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.archiveBrandKnowledgeSource",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await archiveOrganizationBrandKnowledgeSource({
              actor: ctx.actor!,
              sourceId: input.sourceId,
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
  issueOrganizationCredits: organizationProcedure("payments:write")
    .input(
      z.object({
        personId: z.string().uuid(),
        credits: z.number().int().positive().max(1_000_000),
        expiresAt: z.iso.datetime().optional(),
        reason: z.string().trim().min(5).max(1_000),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.issueOrganizationCredits",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await issueOrganizationCredits({
              actor: ctx.actor!,
              personId: input.personId,
              credits: input.credits,
              expiresAt: input.expiresAt
                ? new Date(input.expiresAt)
                : undefined,
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
  proposeCalendarChange: organizationProcedure("sessions:write")
    .input(
      z.object({
        sessionId: z.string().uuid(),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        courtId: z.string().uuid().optional(),
        coachPersonId: z.string().uuid().optional(),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.proposeCalendarChange",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await proposeCalendarChange({
              actor: ctx.actor!,
              sessionId: input.sessionId,
              startsAt: new Date(input.startsAt),
              endsAt: new Date(input.endsAt),
              courtId: input.courtId,
              coachPersonId: input.coachPersonId,
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
  confirmCalendarChange: organizationProcedure("sessions:write")
    .input(
      z.object({
        proposalId: z.string().uuid(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.confirmCalendarChange",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await confirmCalendarChange({
              actor: ctx.actor!,
              proposalId: input.proposalId,
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
  addCalendarParticipant: organizationProcedure("sessions:write")
    .input(
      z.object({
        sessionId: z.string().uuid(),
        personId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.addCalendarParticipant",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await addCalendarParticipant({
              actor: ctx.actor!,
              sessionId: input.sessionId,
              personId: input.personId,
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
  removeCalendarParticipant: organizationProcedure("sessions:write")
    .input(
      z.object({
        registrationId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.removeCalendarParticipant",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await removeCalendarParticipant({
              actor: ctx.actor!,
              registrationId: input.registrationId,
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
  cancelCalendarSession: organizationProcedure("sessions:write")
    .input(
      z.object({
        sessionId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.cancelCalendarSession",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await cancelCalendarSession({
              actor: ctx.actor!,
              sessionId: input.sessionId,
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
  createCalendarBlock: organizationProcedure("sessions:write")
    .input(
      z.object({
        resourceType: z.enum(["court", "coach"]),
        resourceId: z.string().uuid(),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        mode: z.enum(["blocked", "maintenance"]),
        reason: z.string().trim().min(3).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createCalendarBlock",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createCalendarBlock({
              actor: ctx.actor!,
              resourceType: input.resourceType,
              resourceId: input.resourceId,
              startsAt: new Date(input.startsAt),
              endsAt: new Date(input.endsAt),
              mode: input.mode,
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
  addCalendarEquipment: organizationProcedure("sessions:write")
    .input(
      z.object({
        sessionId: z.string().uuid(),
        inventoryStockItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(1_000),
        reason: z.string().trim().min(3).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.addCalendarEquipment",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await addCalendarEquipment({
              actor: ctx.actor!,
              sessionId: input.sessionId,
              inventoryStockItemId: input.inventoryStockItemId,
              quantity: input.quantity,
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
  removeCalendarEquipment: organizationProcedure("sessions:write")
    .input(
      z.object({
        reservationId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.removeCalendarEquipment",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await removeCalendarEquipment({
              actor: ctx.actor!,
              reservationId: input.reservationId,
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
  refundOrganizationOrder: organizationProcedure("payments:write")
    .input(
      z.object({
        orderId: z.string().uuid(),
        amountMinor: z.number().int().positive().max(100_000_000),
        disposition: z.enum(["original-payment", "organization-credit"]),
        credits: z.number().int().positive().max(1_000_000).optional(),
        reason: z.string().trim().min(5).max(1_000),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.refundOrganizationOrder",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await refundOrganizationOrder({
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
  createPlayerInvitation: organizationProcedure("members:write")
    .use(
      rateLimitMiddleware({
        id: "operator-player-invitation",
        capacity: 20,
        refillPerMinute: 10,
        scope: "organization",
      }),
    )
    .input(
      z
        .object({
          invitedName: z.string().trim().min(2).max(120),
          invitedEmail: z.email().optional(),
          invitedPhoneE164: z
            .string()
            .regex(/^\+[1-9]\d{7,14}$/)
            .optional(),
          relationship: z.enum(["player", "member"]).default("player"),
          isMinor: z.boolean().default(false),
          guardianName: z.string().trim().min(2).max(120).optional(),
          guardianEmail: z.email().optional(),
          guardianPhoneE164: z
            .string()
            .regex(/^\+[1-9]\d{7,14}$/)
            .optional(),
          confirmed: z.literal(true),
          idempotencyKey: z.string().uuid(),
        })
        .refine(
          (value) =>
            value.isMinor
              ? Boolean(value.guardianEmail || value.guardianPhoneE164)
              : Boolean(value.invitedEmail || value.invitedPhoneE164),
          "Provide a delivery destination for the player or their guardian.",
        ),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createPlayerInvitation",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createPlayerInvitation({
              actor: ctx.actor!,
              invitedName: input.invitedName,
              invitedEmail: input.invitedEmail,
              invitedPhoneE164: input.invitedPhoneE164,
              relationship: input.relationship,
              isMinor: input.isMinor,
              guardianName: input.guardianName,
              guardianEmail: input.guardianEmail,
              guardianPhoneE164: input.guardianPhoneE164,
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
  createStaffInvitation: organizationProcedure("members:write")
    .use(
      rateLimitMiddleware({
        id: "operator-staff-invitation",
        capacity: 20,
        refillPerMinute: 10,
        scope: "organization",
      }),
    )
    .input(
      z
        .object({
          invitedName: z.string().trim().min(2).max(120),
          invitedEmail: z.email().optional(),
          invitedPhoneE164: z
            .string()
            .regex(/^\+[1-9]\d{7,14}$/)
            .optional(),
          role: z.enum(["coach", "manager", "front-desk", "accountant"]),
          workerClassification: z.enum(["1099-contractor", "w2-employee"]),
          preferredChannel: z.enum(["email", "sms"]).optional(),
          deliveryMode: z.enum(["send", "link-only"]).default("send"),
          confirmed: z.literal(true),
          idempotencyKey: z.string().uuid(),
        })
        .refine(
          (value) =>
            value.deliveryMode === "link-only" ||
            Boolean(value.invitedEmail || value.invitedPhoneE164),
          "Provide an email address or mobile number.",
        ),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createStaffInvitation",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createStaffInvitation({
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
  updateStaffProfile: organizationProcedure("members:write")
    .use(
      rateLimitMiddleware({
        id: "operator-staff-profile-update",
        capacity: 40,
        refillPerMinute: 20,
        scope: "organization",
      }),
    )
    .input(
      z.object({
        personId: z.string().uuid(),
        displayName: z.string().trim().min(2).max(80),
        role: z.enum(["coach", "manager", "front-desk", "accountant"]),
        workerClassification: z.enum(["1099-contractor", "w2-employee"]),
        compensationModel: z.enum([
          "not-set",
          "hourly",
          "profit-share",
          "hourly-plus-profit-share",
        ]),
        hourlyRateMinor: z.number().int().nonnegative().optional(),
        profitShareBps: z.number().int().min(0).max(10_000).optional(),
        addressLine1: z.string().trim().max(240).optional(),
        addressLine2: z.string().trim().max(240).optional(),
        locality: z.string().trim().max(120).optional(),
        administrativeArea: z.string().trim().max(120).optional(),
        postalCode: z.string().trim().max(24).optional(),
        countryCode: z.string().trim().length(2),
        googlePlaceId: z.string().trim().max(255).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        availability: z
          .array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              startsAt: z.string().regex(/^\d{2}:\d{2}$/),
              endsAt: z.string().regex(/^\d{2}:\d{2}$/),
            }),
          )
          .max(28),
        incomeGoalMinor: z.number().int().nonnegative().optional(),
        incomeGoalPeriod: z
          .enum(["week", "month", "quarter", "year"])
          .optional(),
        active: z.boolean(),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateStaffProfile",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateStaffProfile({
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
        description: z.string().trim().max(2_000).optional(),
        capacity: z.number().int().min(0).max(100_000).optional(),
        heroImageUrl: z.url().optional(),
        amenities: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
        addressLine1: z.string().trim().max(160).optional(),
        locality: z.string().trim().max(100).optional(),
        administrativeArea: z.string().trim().max(100).optional(),
        postalCode: z.string().trim().max(24).optional(),
        countryCode: z.string().trim().length(2),
        googlePlaceId: z.string().trim().max(256).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
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
        imageUrl: z.url().optional(),
        lit: z.boolean(),
        capacity: z.number().int().min(1).max(1_000).optional(),
        bookingPolicy: z.enum(["public", "members", "tiers", "staff", "none"]),
        ratePlanId: z.string().uuid().optional(),
        minimumDurationMinutes: z.number().int().min(15).max(1_440),
        maximumDurationMinutes: z.number().int().min(15).max(1_440),
        durationOptionsMinutes: z
          .array(z.number().int().min(15).max(1_440))
          .min(1)
          .max(16)
          .optional(),
        bookingIncrementMinutes: z.number().int().min(5).max(240).optional(),
        bufferBeforeMinutes: z.number().int().min(0).max(240),
        bufferAfterMinutes: z.number().int().min(0).max(240),
        minimumNoticeMinutes: z.number().int().min(0).max(43_200),
        maximumAdvanceDays: z.number().int().min(1).max(730),
        cancellationPolicy: z
          .object({
            title: z.string().trim().min(2).max(120),
            markdown: z.string().trim().min(10).max(20_000),
            refundBeforeHours: z.number().int().min(0).max(8_760).optional(),
            creditBeforeHours: z.number().int().min(0).max(8_760).optional(),
            lateCancellation: z.string().trim().max(1_000).optional(),
            requireFullScroll: z.boolean(),
          })
          .optional(),
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
  updateVenueProfile: organizationProcedure("sessions:write")
    .input(
      z.object({
        venueId: z.string().uuid(),
        description: z.string().trim().max(2_000).optional(),
        capacity: z.number().int().min(0).max(100_000),
        heroImageUrl: z.url().optional(),
        amenities: z.array(z.string().trim().min(1).max(80)).max(40),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateVenueProfile",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateVenueProfile({
              actor: ctx.actor!,
              venueId: input.venueId,
              description: input.description,
              capacity: input.capacity,
              heroImageUrl: input.heroImageUrl,
              amenities: input.amenities,
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
  updateCourtBookingConfiguration: organizationProcedure("sessions:write")
    .input(
      z.object({
        courtId: z.string().uuid(),
        imageUrl: z.url().optional(),
        ratePlanId: z.string().uuid().nullable(),
        capacity: z.number().int().min(1).max(1_000),
        durationOptionsMinutes: z
          .array(z.number().int().min(15).max(1_440))
          .min(1)
          .max(16),
        bookingIncrementMinutes: z.number().int().min(5).max(240),
        minimumNoticeMinutes: z.number().int().min(0).max(43_200),
        maximumAdvanceDays: z.number().int().min(1).max(730),
        cancellationPolicy: z.object({
          title: z.string().trim().min(2).max(120),
          markdown: z.string().trim().min(10).max(20_000),
          refundBeforeHours: z.number().int().min(0).max(8_760).optional(),
          creditBeforeHours: z.number().int().min(0).max(8_760).optional(),
          lateCancellation: z.string().trim().max(1_000).optional(),
          requireFullScroll: z.boolean(),
        }),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateCourtBookingConfiguration",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateCourtBookingConfiguration({
              actor: ctx.actor!,
              courtId: input.courtId,
              imageUrl: input.imageUrl,
              ratePlanId: input.ratePlanId,
              capacity: input.capacity,
              durationOptionsMinutes: input.durationOptionsMinutes,
              bookingIncrementMinutes: input.bookingIncrementMinutes,
              minimumNoticeMinutes: input.minimumNoticeMinutes,
              maximumAdvanceDays: input.maximumAdvanceDays,
              cancellationPolicy: input.cancellationPolicy,
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
  draftCourtSchedule: organizationProcedure("sessions:write")
    .input(z.object({ prompt: z.string().trim().min(8).max(2_000) }))
    .output(courtScheduleProposalSchema)
    .query(({ input }) => draftCourtScheduleFromPrompt(input.prompt)),
  replaceCourtSchedule: organizationProcedure("sessions:write")
    .input(
      z.object({
        courtId: z.string().uuid(),
        blocks: z
          .array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              startsAtMinute: z.number().int().min(0).max(1_439),
              endsAtMinute: z.number().int().min(1).max(1_440),
              mode: z.enum([
                "open",
                "rentals-only",
                "members-only",
                "private-lessons-only",
                "group-only",
                "league-reserved",
                "maintenance",
                "blocked",
              ]),
            }),
          )
          .min(1)
          .max(64),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.replaceCourtSchedule",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await replaceCourtSchedule({
              actor: ctx.actor!,
              courtId: input.courtId,
              blocks: input.blocks,
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
  blockCourtTime: organizationProcedure("sessions:write")
    .input(
      z.object({
        courtId: z.string().uuid(),
        localStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        localEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        reason: z.string().trim().min(3).max(500),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.blockCourtTime",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await blockCourtTime({
              actor: ctx.actor!,
              courtId: input.courtId,
              localStartsAt: input.localStartsAt,
              localEndsAt: input.localEndsAt,
              reason: input.reason,
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
  updateEventDraft: organizationProcedure("sessions:write")
    .input(
      z.intersection(
        createEventDraftInputSchema,
        z.object({ sessionId: z.string().uuid() }),
      ),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.updateEventDraft",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateEventDraft({
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
  createMarketingFlow: organizationProcedure("messages:propose")
    .input(
      z.object({
        name: z.string().trim().min(2).max(140),
        description: z.string().trim().max(1_000).optional(),
        segment: z.enum([
          "all-active",
          "active-members",
          "inactive-30-days",
          "high-churn-risk",
          "upcoming-participants",
        ]),
        trigger: z.enum([
          "manual",
          "no-booking",
          "payment-failed",
          "event-published",
          "membership-renewal",
        ]),
        triggerDays: z.number().int().min(1).max(365).optional(),
        channel: z.enum(["email", "sms", "push"]),
        subject: z.string().trim().max(180).optional(),
        body: z.string().trim().min(1).max(8_000),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createMarketingFlow",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createMarketingFlow({
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
  createMarketingCampaignDraft: organizationProcedure("messages:propose")
    .input(
      z.object({
        name: z.string().trim().min(2).max(140),
        segment: z.enum([
          "all-active",
          "active-members",
          "inactive-30-days",
          "high-churn-risk",
          "upcoming-participants",
        ]),
        channel: z.enum(["email", "sms", "push"]),
        subject: z.string().trim().max(180).optional(),
        body: z.string().trim().min(1).max(8_000),
        confirmed: z.literal(true),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(operatorMutationResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.createMarketingCampaignDraft",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await createMarketingCampaignDraft({
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
  refreshStripeOnboarding: organizationProcedure("payments:write")
    .use(
      rateLimitMiddleware({
        id: "stripe-status-refresh",
        capacity: 12,
        refillPerMinute: 3,
        scope: "organization",
      }),
    )
    .input(z.object({ idempotencyKey: z.string().uuid() }))
    .output(stripeAccountReadinessResultSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "operator.refreshStripeOnboarding",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await refreshStripeOnboarding({
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
  videoOverview: adminProcedure
    .output(adminVideoOverviewSchema)
    .query(async ({ ctx }) => {
      try {
        return await loadAdminVideoOverview(
          ctx.now,
          ctx.actor.roles.includes("super-admin"),
        );
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  grantComplimentaryDunaPlus: superAdminProcedure
    .input(
      z.object({
        email: z.string().trim().email().max(320),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime().optional(),
        reason: z.string().trim().min(8).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(dunaPlusGrantSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.grantComplimentaryDunaPlus",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await grantComplimentaryDunaPlus({
              actor: ctx.actor!,
              email: input.email,
              startsAt: new Date(input.startsAt),
              endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
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
  revokeComplimentaryDunaPlus: superAdminProcedure
    .input(
      z.object({
        grantId: z.string().uuid(),
        reason: z.string().trim().min(8).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(dunaPlusGrantSchema)
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.revokeComplimentaryDunaPlus",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await revokeComplimentaryDunaPlus({
              actor: ctx.actor!,
              grantId: input.grantId,
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
  updateVideoQuotaPolicy: superAdminProcedure
    .input(
      z.object({
        personId: z.string().uuid().optional(),
        monthlyLiveSeconds: z
          .number()
          .int()
          .min(0)
          .max(31 * 24 * 60 * 60),
        monthlyUploadSeconds: z
          .number()
          .int()
          .min(0)
          .max(31 * 24 * 60 * 60),
        enforceLiveLimit: z.boolean(),
        enforceUploadLimit: z.boolean(),
        reason: z.string().trim().min(8).max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        monthlyLiveSeconds: z.number().int().nonnegative(),
        monthlyUploadSeconds: z.number().int().nonnegative(),
        enforceLiveLimit: z.boolean(),
        enforceUploadLimit: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      runIdempotentMutation({
        key: input.idempotencyKey,
        procedure: "admin.updateVideoQuotaPolicy",
        request: input,
        ctx,
        execute: async () => {
          try {
            return await updateVideoQuotaPolicy({
              ...input,
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
  sandData: adminProcedure.query(async () => {
    try {
      return await loadSandDataOverview();
    } catch (error) {
      return throwDomainError(error);
    }
  }),
  reviewMatchHistoryDispute: adminProcedure
    .input(
      z.object({
        disputeId: z.string().uuid(),
        decision: z.enum(["upheld", "rejected"]),
        resolutionNotes: z.string().trim().min(8).max(2_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await reviewMatchHistoryDispute({
          actor: ctx.actor!,
          disputeId: input.disputeId,
          decision: input.decision,
          resolutionNotes: input.resolutionNotes,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  sandPlayerSearch: adminProcedure
    .input(z.object({ query: z.string().trim().min(2).max(80) }))
    .query(async ({ input }) => {
      try {
        return await searchDunaPlayers(input.query);
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  importSandSource: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-sand-source-import",
        capacity: 20,
        refillPerMinute: 2,
      }),
    )
    .input(
      z.object({
        source: z.enum([
          "bvbinfo",
          "volleyball-life",
          "fivb-12ndr",
          "avp-league",
        ]),
        externalId: z.string().trim().min(1).max(400),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await importSandSource({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  refreshFivbIndex: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-fivb-index-refresh",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .input(
      z
        .object({
          season: z.number().int().min(1990).max(2100).optional(),
        })
        .optional(),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const index = await refreshFivbEventIndex({
          season: input?.season,
          actor: ctx.actor!,
          now: ctx.now,
        });
        const details = await refreshActiveFivbEvents({
          limit: 4,
          now: ctx.now,
        });
        return { ...index, details };
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  refreshWorldRankings: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-world-rankings-refresh",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .mutation(async ({ ctx }) => {
      try {
        return await refreshWorldRankings({
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  refreshSandRatingNetwork: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-sandrating-network-refresh",
        capacity: 2,
        refillPerMinute: 0.1,
      }),
    )
    .input(
      z
        .object({
          maxDepth: z.number().int().min(1).max(4).default(4),
          topPlayersPerGender: z.number().int().min(50).max(500).default(200),
        })
        .default({ maxDepth: 4, topPlayersPerGender: 200 }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await refreshSandRatingNetwork({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  approveReadySandRatingMatches: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-sandrating-backfill-approval",
        capacity: 1,
        refillPerMinute: 0.05,
      }),
    )
    .input(
      z.object({
        limit: z.number().int().min(1).max(5_000).default(5_000),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await approveReadySandRatingMatches({
          ...input,
          actor: ctx.actor!,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  refreshAvpLeague: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-avp-league-refresh",
        capacity: 4,
        refillPerMinute: 1,
      }),
    )
    .input(
      z
        .object({
          season: z.number().int().min(2000).max(2100).optional(),
        })
        .optional(),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await refreshAvpLeague({
          season: input?.season,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  professionalEventMediaUploadContext: adminProcedure
    .input(z.object({ professionalEventId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await loadProfessionalEventMediaUploadContext({
          ...input,
          actor: ctx.actor!,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  saveProfessionalEventEditorial: adminProcedure
    .input(
      z.object({
        professionalEventId: z.string().uuid(),
        overrides: z.object({
          name: z.string().trim().min(2).max(180).optional(),
          location: z.string().trim().min(2).max(180).optional(),
          category: z.string().trim().min(2).max(100).optional(),
          startsOn: z.iso.date().optional(),
          endsOn: z.iso.date().optional(),
        }),
        summary: z.string().trim().max(1_500).optional(),
        venueName: z.string().trim().max(180).optional(),
        venueAddress: z.string().trim().max(300).optional(),
        venue: z
          .object({
            googlePlaceId: z.string().trim().max(256).optional(),
            googleMapsUri: z.url().optional(),
            formattedAddress: z.string().trim().max(320).optional(),
            addressLine1: z.string().trim().max(180).optional(),
            addressLine2: z.string().trim().max(180).optional(),
            locality: z.string().trim().max(120).optional(),
            administrativeArea: z.string().trim().max(120).optional(),
            postalCode: z.string().trim().max(32).optional(),
            countryCode: z.string().trim().length(2).optional(),
            latitude: z.number().min(-90).max(90).optional(),
            longitude: z.number().min(-180).max(180).optional(),
          })
          .refine(
            (value) =>
              (value.latitude === undefined) ===
              (value.longitude === undefined),
            "Latitude and longitude must be supplied together.",
          )
          .optional(),
        timezone: z.string().trim().max(80).optional(),
        ticketUrl: z.url().optional(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await saveProfessionalEventEditorial({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  researchProfessionalEvent: adminProcedure
    .use(
      rateLimitMiddleware({
        id: "admin-professional-event-research",
        capacity: 8,
        refillPerMinute: 1,
      }),
    )
    .input(z.object({ professionalEventId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await researchProfessionalEvent({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  applyProfessionalEventResearch: adminProcedure
    .input(
      z.object({
        professionalEventId: z.string().uuid(),
        proposalId: z.string().uuid(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await applyProfessionalEventResearch({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  saveProfessionalEventMedia: adminProcedure
    .input(
      z.object({
        professionalEventId: z.string().uuid(),
        kind: z.enum(["poster", "hero-image", "hero-video"]),
        url: z.url(),
        posterUrl: z.url().optional(),
        alt: z.string().trim().min(2).max(240),
        caption: z.string().trim().max(500).optional(),
        featured: z.boolean(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await saveProfessionalEventMedia({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  removeProfessionalEventMedia: adminProcedure
    .input(
      z.object({
        professionalEventId: z.string().uuid(),
        mediaId: z.string().uuid(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await removeProfessionalEventMedia({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  saveProfessionalMatchSchedule: adminProcedure
    .input(
      z.object({
        professionalEventId: z.string().uuid(),
        importedMatchId: z.string().uuid().optional(),
        gender: z.enum(["men", "women"]),
        teamAName: z.string().trim().min(2).max(120),
        teamBName: z.string().trim().min(2).max(120),
        localStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        timezone: z.string().trim().min(2).max(80),
        roundLabel: z.string().trim().max(120).optional(),
        court: z.string().trim().max(120).optional(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await saveProfessionalMatchSchedule({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  saveProfessionalWatchOption: adminProcedure
    .input(
      z.object({
        professionalEventId: z.string().uuid(),
        importedMatchId: z.string().uuid().optional(),
        kind: z.enum(["vbtv", "youtube", "live-tv"]),
        label: z.string().trim().max(100).optional(),
        url: z.url().optional(),
        channelName: z.string().trim().max(100).optional(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await saveProfessionalWatchOption({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  saveAvpRosterAssignment: adminProcedure
    .input(
      z.object({
        season: z.number().int().min(2000).max(2100),
        teamName: z.string().trim().min(2).max(120),
        gender: z.enum(["men", "women"]),
        displayName: z.string().trim().min(2).max(120),
        personId: z.string().uuid(),
        role: z.enum(["starter", "substitute"]),
        effectiveFrom: z.iso.date().optional(),
        effectiveTo: z.iso.date().optional(),
        replacesExternalPersonId: z.string().trim().max(300).optional(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await saveAvpRosterAssignment({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  removeProfessionalWatchOption: adminProcedure
    .input(
      z.object({
        professionalEventId: z.string().uuid(),
        importedMatchId: z.string().uuid().optional(),
        optionId: z.string().trim().min(1).max(100),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await removeProfessionalWatchOption({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  linkSandPlayer: adminProcedure
    .input(
      z.object({
        externalProfileId: z.string().uuid(),
        personId: z.string().uuid(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await linkExternalPlayer({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  approveSandMatch: adminProcedure
    .input(
      z.object({
        importedMatchId: z.string().uuid(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await approveImportedMatch({
          ...input,
          actor: ctx.actor!,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  reviewSandMatch: adminProcedure
    .input(
      z.object({
        importedMatchId: z.string().uuid(),
        decision: z.enum(["rejected", "excluded", "duplicate"]),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await rejectImportedMatch({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  mergeSandProfiles: adminProcedure
    .input(
      z.object({
        sourcePersonId: z.string().uuid(),
        targetPersonId: z.string().uuid(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await mergeUnclaimedProfile({
          ...input,
          actor: ctx.actor!,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  reviewProfileClaim: adminProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        officialProfileMatched: z.boolean(),
        reason: z.string().trim().min(12).max(1_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await reviewProfileClaim({
          ...input,
          actor: ctx.actor!,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  evaluateRating: adminProcedure.mutation(async ({ ctx }) => {
    try {
      return await evaluateCurrentRating({
        actor: ctx.actor!,
        now: ctx.now,
      });
    } catch (error) {
      return throwDomainError(error);
    }
  }),
  createRatingConfiguration: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(3).max(100),
        parameters: z.record(
          z.string(),
          z.union([z.number(), z.boolean(), z.string()]),
        ),
        notes: z.string().trim().max(1_000).optional(),
        activate: z.boolean(),
        reason: z.string().trim().min(10).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await createRatingConfiguration({
          ...input,
          actor: ctx.actor!,
          now: ctx.now,
        });
      } catch (error) {
        return throwDomainError(error);
      }
    }),
  organization: adminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .output(adminOrganizationDetailSchema.nullable())
    .query(
      async ({ input }) =>
        (await getRepository().admin.organization(input.organizationId)) ??
        null,
    ),
  players: adminProcedure
    .input(
      z.object({
        query: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .output(z.array(personSummarySchema).readonly())
    .query(({ input }) =>
      getRepository().admin.players(input.query, input.limit),
    ),
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
