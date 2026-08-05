import { z } from "zod";

export const currencySchema = z.enum(["USD", "CAD", "AUD", "BRL", "EUR"]);
export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: currencySchema,
});
export const personRoleSchema = z.enum([
  "player",
  "guardian",
  "coach",
  "owner",
  "manager",
  "front-desk",
  "scorekeeper",
  "accountant",
  "admin",
  "super-admin",
]);
export const ratingSchema = z.object({
  display: z.number(),
  mu: z.number(),
  phi: z.number(),
  sigma: z.number(),
  confidence: z.enum(["Provisional", "Developing", "Reliable", "Locked"]),
  discipline: z.enum(["beach-2s", "beach-4s", "beach-6s", "grass", "indoor"]),
  delta: z.number().optional(),
  percentile: z.number().optional(),
});
export const personSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  handle: z.string(),
  initials: z.string(),
  homeMarket: z.string(),
  rating: ratingSchema,
  roles: z.array(personRoleSchema).readonly(),
  isMinor: z.boolean().optional(),
  guardianIds: z.array(z.string()).readonly().optional(),
  avatarUrl: z.string().optional(),
  profileClaimStatus: z
    .enum(["claimed", "unclaimed", "claim-pending", "merged"])
    .optional(),
  isProfessional: z.boolean().optional(),
});
export const organizationSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  legalName: z.string(),
  plan: z.enum(["coach", "small-club", "club", "multi-venue"]),
  memberCount: z.number().int().nonnegative(),
  staffCount: z.number().int().nonnegative(),
  venueCount: z.number().int().nonnegative(),
  timezone: z.string(),
  stripeStatus: z.enum(["connected", "pending", "restricted"]),
});
export const venueSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  city: z.string(),
  region: z.string(),
  timezone: z.string(),
  courtCount: z.number().int().nonnegative(),
  openNow: z.boolean(),
  latitude: z.number(),
  longitude: z.number(),
  imageUrl: z.string().optional(),
  tags: z.array(z.string()).readonly(),
});
export const weatherIconSchema = z.enum([
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "snow",
  "storm",
  "wind",
  "unknown",
]);
export const weatherForecastPointSchema = z.object({
  startsAt: z.iso.datetime(),
  temperatureC: z.number().optional(),
  apparentTemperatureC: z.number().optional(),
  precipitationProbability: z.number().min(0).max(100).optional(),
  precipitationIntensity: z.number().nonnegative().optional(),
  windSpeedKph: z.number().nonnegative().optional(),
  windGustKph: z.number().nonnegative().optional(),
  humidity: z.number().min(0).max(100).optional(),
  weatherCode: z.number().int().optional(),
  condition: z.string(),
  icon: weatherIconSchema,
});
export const weatherForecastDaySchema = z.object({
  date: z.iso.date(),
  temperatureHighC: z.number().optional(),
  temperatureLowC: z.number().optional(),
  precipitationProbability: z.number().min(0).max(100).optional(),
  windGustKph: z.number().nonnegative().optional(),
  weatherCode: z.number().int().optional(),
  condition: z.string(),
  icon: weatherIconSchema,
  sunriseAt: z.iso.datetime().optional(),
  sunsetAt: z.iso.datetime().optional(),
  daylightSource: z.enum(["tomorrow.io", "calculated"]),
});
export const weatherForecastSchema = z.object({
  provider: z.literal("Tomorrow.io"),
  source: z.enum(["tomorrow.io", "calculated-daylight"]),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  fetchedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  hourly: z.array(weatherForecastPointSchema).readonly(),
  days: z.array(weatherForecastDaySchema).readonly(),
});
export const eventKindSchema = z.enum([
  "tournament",
  "league",
  "clinic",
  "open-play",
  "private-lesson",
  "court-rental",
  "pickup",
]);
export const eventDivisionSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  discipline: z.enum(["beach-2s", "beach-4s", "beach-6s", "grass", "indoor"]),
  ratingBasis: z.string(),
  price: moneySchema,
  spotsRemaining: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  minimumTeams: z.number().int().positive().optional(),
  maximumTeams: z.number().int().positive().optional(),
  teamFormat: z
    .enum(["solo", "doubles", "three-person", "four-person", "six-person"])
    .optional(),
  teamSize: z.number().int().min(1).max(6).optional(),
  surface: z.enum(["sand", "grass", "water", "indoor-sand"]).optional(),
  gender: z.enum(["mens", "womens", "coed", "open"]).optional(),
  priceBasis: z.enum(["per-person", "per-team"]).optional(),
  ratingMinimum: z.number().optional(),
  ratingMaximum: z.number().optional(),
  ageMinimum: z.number().int().nonnegative().optional(),
  ageMaximum: z.number().int().positive().optional(),
  tournamentFormat: z
    .enum([
      "kob-qob",
      "single-elimination",
      "double-elimination-true",
      "double-elimination-crossover",
    ])
    .optional(),
  poolPlay: z
    .object({
      enabled: z.boolean(),
      teamsPerPool: z.number().int().min(2),
      format: z.enum(["full", "olympic-crossover"]),
      teamsAdvancing: z.number().int().positive(),
    })
    .optional(),
  seeding: z
    .enum([
      "first-come",
      "sand-rating-score",
      "sand-rating-best-8",
      "sand-rating-ttm",
      "manual",
    ])
    .optional(),
});
export const eventTicketSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  price: moneySchema,
  quantity: z.number().int().positive().optional(),
  remaining: z.number().int().nonnegative().optional(),
  waitlistEnabled: z.boolean(),
  approvalRequired: z.boolean(),
  availableOnline: z.boolean(),
  availableInPerson: z.boolean(),
});
export const eventMediaSchema = z.object({
  id: z.string(),
  kind: z.enum(["image", "video"]),
  url: z.string(),
  alt: z.string().optional(),
  posterUrl: z.string().optional(),
});
export const eventLocationSchema = z.object({
  mode: z.enum(["venue", "address", "online"]),
  venueName: z.string(),
  address: z.string().optional(),
  googlePlaceId: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  confidence: z.enum(["confirmed", "approximate"]).optional(),
  onlineUrl: z.string().optional(),
  courtNames: z.array(z.string()).readonly().optional(),
});
export const eventFeatureSchema = z.object({
  id: z.string(),
  kind: z.enum(["guest", "activity", "sponsor"]),
  title: z.string(),
  description: z.string().optional(),
  personId: z.string().optional(),
  personHandle: z.string().optional(),
  personInitials: z.string().optional(),
  imageUrl: z.string().optional(),
});
export const eventPolicySchema = z.object({
  id: z.string(),
  kind: z.enum(["policy", "waiver"]),
  title: z.string(),
  markdown: z.string(),
  required: z.boolean(),
  requireFullScroll: z.boolean(),
});
export const eventDraftSmartRulesSchema = z.object({
  waitlistEnabled: z.boolean(),
  allowLateCancellation: z.boolean(),
  freeCancellationHours: z.number().int().min(0).max(8_760),
  bookingOpensDays: z.number().int().min(0).max(730),
  bookingClosesMinutes: z.number().int().min(0).max(43_200),
  autoCancelLowAttendance: z.boolean(),
  minimumAttendance: z.number().int().min(1).max(10_000),
  approvalRequired: z.boolean(),
});
export const leagueRecurrenceSchema = z.object({
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
        startsAt: z.string(),
        endsAt: z.string(),
      }),
    )
    .readonly(),
  substitutesAllowed: z.boolean(),
  substituteApprovalRequired: z.boolean(),
  teamAssignment: z.enum(["signup", "rating-balanced", "manual"]),
});
export const eventDraftEditorSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  status: z.literal("draft"),
  title: z.string(),
  shortSummary: z.string().optional(),
  description: z.string().optional(),
  kind: z.enum(["tournament", "league"]),
  media: z.array(eventMediaSchema).readonly(),
  location: eventLocationSchema.extend({
    venueId: z.string().uuid().optional(),
    courtIds: z.array(z.string().uuid()).readonly(),
  }),
  timezone: z.string(),
  localStartsAt: z.string(),
  localEndsAt: z.string(),
  divisions: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        description: z.string().optional(),
        minimumTeams: z.number().int().positive(),
        maximumTeams: z.number().int().positive(),
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
        priceMinor: z.number().int().nonnegative(),
        ratingEnabled: z.boolean(),
        ratingMinimum: z.number().optional(),
        ratingMaximum: z.number().optional(),
        ageEnabled: z.boolean(),
        ageMinimum: z.number().int().nonnegative().optional(),
        ageMaximum: z.number().int().positive().optional(),
        tournamentFormat: z.enum([
          "kob-qob",
          "single-elimination",
          "double-elimination-true",
          "double-elimination-crossover",
        ]),
        poolPlay: z.object({
          enabled: z.boolean(),
          teamsPerPool: z.number().int().min(2),
          format: z.enum(["full", "olympic-crossover"]),
          teamsAdvancing: z.number().int().positive(),
        }),
        seeding: z.enum([
          "first-come",
          "sand-rating-score",
          "sand-rating-best-8",
          "sand-rating-ttm",
          "manual",
        ]),
      }),
    )
    .readonly(),
  tickets: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        description: z.string().optional(),
        priceMinor: z.number().int().nonnegative(),
        quantity: z.number().int().positive().optional(),
        waitlistEnabled: z.boolean(),
        approvalRequired: z.boolean(),
        availableOnline: z.boolean(),
        availableInPerson: z.boolean(),
      }),
    )
    .readonly(),
  features: z.array(eventFeatureSchema).readonly(),
  policies: z.array(eventPolicySchema).readonly(),
  smartRules: eventDraftSmartRulesSchema,
  recurrence: leagueRecurrenceSchema.optional(),
});
export const eventSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  kind: eventKindSchema,
  organizationId: z.string().uuid().optional(),
  organizationSlug: z.string().optional(),
  organizationName: z.string(),
  venueName: z.string(),
  shortSummary: z.string().optional(),
  description: z.string().optional(),
  format: z.string().optional(),
  recordMatches: z.boolean().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string(),
  price: moneySchema,
  spotsRemaining: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  ratingRange: z.tuple([z.number(), z.number()]).readonly().optional(),
  divisions: z.array(eventDivisionSummarySchema).readonly().optional(),
  tickets: z.array(eventTicketSummarySchema).readonly().optional(),
  media: z.array(eventMediaSchema).readonly().optional(),
  location: eventLocationSchema.optional(),
  features: z.array(eventFeatureSchema).readonly().optional(),
  policies: z.array(eventPolicySchema).readonly().optional(),
  recurrence: leagueRecurrenceSchema.optional(),
  attendees: z
    .array(
      z.object({
        id: z.string().uuid(),
        displayName: z.string(),
        handle: z.string(),
        initials: z.string(),
        avatarUrl: z.string().optional(),
        homeMarket: z.string().optional(),
        ratingDisplay: z.number().optional(),
      }),
    )
    .readonly()
    .optional(),
  host: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
      handle: z.string(),
      initials: z.string(),
      avatarUrl: z.string().optional(),
    })
    .optional(),
  approvalRequired: z.boolean().optional(),
  lifecycleStatus: z.enum(["active", "cancelled", "completed"]).optional(),
  live: z.boolean().optional(),
  imageUrl: z.string().optional(),
  weather: weatherForecastSchema.optional(),
  tags: z.array(z.string()).readonly(),
});
export const matchSummarySchema = z.object({
  id: z.string(),
  status: z
    .enum(["pending-verification", "verified", "disputed", "complete"])
    .optional(),
  confirmationRequired: z.boolean().optional(),
  playedAt: z.iso.datetime(),
  venueName: z.string(),
  eventName: z.string().optional(),
  eventSlug: z.string().optional(),
  roundLabel: z.string().optional(),
  sourceUrl: z.url().optional(),
  formatSummary: z.string().optional(),
  teamA: z.array(personSummarySchema).readonly(),
  teamB: z.array(personSummarySchema).readonly(),
  score: z
    .array(z.tuple([z.number().int(), z.number().int()]).readonly())
    .readonly(),
  winner: z.enum(["A", "B"]),
  ratingDelta: z.number(),
  ratingBefore: z.number().optional(),
  ratingAfter: z.number().optional(),
  ratingExplanation: z
    .object({
      expectedWinProbability: z.number().optional(),
      actualResult: z.number().optional(),
      pointShare: z.number().optional(),
      marginMultiplier: z.number().optional(),
      responsibilityWeight: z.number().optional(),
      verificationWeight: z.number().optional(),
      displayDelta: z.number().optional(),
    })
    .optional(),
  location: z
    .object({
      label: z.string(),
      googlePlaceId: z.string().optional(),
      name: z.string().optional(),
      address: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  prediction: z
    .object({
      teamA: z.number().min(0).max(100),
      teamB: z.number().min(0).max(100),
      favorite: z.enum(["A", "B", "even"]),
      outcome: z.enum(["predicted", "upset", "even"]),
      basis: z.literal("Sand Rating"),
    })
    .optional(),
  origin: z.enum(["imported", "self-reported", "live-scored"]).optional(),
  ratingEligibility: z.enum(["eligible", "held"]).optional(),
  matchType: z.enum(["competitive", "friendly"]).optional(),
  teamSize: z.number().int().min(1).max(6).optional(),
  recordingMode: z.enum(["completed", "live"]).optional(),
  ratingImpact: z.enum(["sand-rating", "history-only"]).optional(),
  dispute: z
    .object({
      status: z.enum(["pending", "upheld", "rejected", "withdrawn"]),
      reasonCode: z.string(),
    })
    .optional(),
  canRemove: z.boolean().optional(),
  verification: z.enum([
    "live-scored",
    "desk",
    "both-confirmed",
    "auto-accepted",
    "self-reported",
    "group-confirmed",
  ]),
});
export const bookingSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: eventKindSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  venueName: z.string(),
  status: z.enum(["confirmed", "waitlisted", "needs-action"]),
  amount: moneySchema,
  participantNames: z.array(z.string()).readonly(),
});
export const walletEntrySchema = z.object({
  id: z.string(),
  kind: z.enum([
    "load",
    "booking",
    "refund",
    "prize",
    "coach-earning",
    "withdrawal",
    "affiliate",
    "adjustment",
    "chargeback",
  ]),
  description: z.string(),
  amount: moneySchema,
  occurredAt: z.iso.datetime(),
  status: z.enum(["pending", "available", "complete", "held"]),
  taxCharacter: z.enum(["none", "prize", "contractor", "affiliate"]),
});
export const metricSchema = z.object({
  label: z.string(),
  value: z.string(),
  change: z.string().optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
  tone: z.enum(["default", "positive", "warning", "danger"]).optional(),
});
export const auditEventSchema = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime(),
  actorName: z.string(),
  action: z.string(),
  entity: z.string(),
  reason: z.string(),
  severity: z.enum(["info", "attention", "critical"]),
});

export const playerDashboardSchema = z.object({
  player: personSummarySchema,
  metrics: z.array(metricSchema).readonly(),
  bookings: z.array(bookingSummarySchema).readonly(),
  events: z.array(eventSummarySchema).readonly(),
  feed: z
    .array(
      z.object({
        id: z.string(),
        eyebrow: z.string(),
        title: z.string(),
        body: z.string(),
        meta: z.string(),
        accent: z.string(),
      }),
    )
    .readonly(),
  recentMatches: z.array(matchSummarySchema).readonly(),
  walletBalanceMinor: z.number().int(),
  currency: z.literal("USD"),
});
export const playerWalletSchema = z.object({
  balanceMinor: z.number().int(),
  availableMinor: z.number().int(),
  pendingMinor: z.number().int(),
  currency: z.literal("USD"),
  entries: z.array(walletEntrySchema).readonly(),
  taxFormStatus: z.enum(["not-required", "pending", "ready"]),
});

export const videoSourceSchema = z.enum(["live", "upload"]);
export const videoCategorySchema = z.enum([
  "practice",
  "event",
  "match",
  "social",
]);
export const videoStatusSchema = z.enum([
  "draft",
  "uploading",
  "processing",
  "ready",
  "live",
  "ended",
  "failed",
  "deleted",
]);
export const videoLiveVisibilitySchema = z.enum(["public", "link-only"]);
export const videoRecordingVisibilitySchema = z.enum(["public", "private"]);
export const videoMusicRemovalStatusSchema = z.enum([
  "not-requested",
  "queued",
  "processing",
  "complete",
  "failed",
  "provider-required",
]);
export const videoQualityGradeSchema = z.enum([
  "excellent",
  "good",
  "limited",
  "poor",
]);
export const courtCalibrationSchema = z.object({
  courtWidthMeters: z.number().positive().max(30),
  courtLengthMeters: z.number().positive().max(40),
  netHeightMeters: z.number().positive().max(4),
  qualityGrade: videoQualityGradeSchema,
  qualityScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  corners: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
    )
    .length(4)
    .readonly()
    .optional(),
  horizonY: z.number().min(0).max(1).optional(),
  projectionSource: z
    .enum(["lidar", "arkit", "vision", "estimated"])
    .optional(),
  lidarAvailable: z.boolean().optional(),
  groundPlaneDetected: z.boolean().optional(),
  courtDetected: z.boolean().optional(),
  cameraHeightMeters: z.number().nonnegative().max(20).optional(),
  preferredOrientation: z.enum(["landscape", "portrait"]).optional(),
  deviceOrientation: z.enum(["landscape", "portrait", "unknown"]).optional(),
  orientationMatches: z.boolean().optional(),
  trackingState: z
    .enum(["initializing", "limited", "normal", "unavailable"])
    .optional(),
  deviceAttitude: z
    .object({
      pitch: z.number(),
      roll: z.number(),
      yaw: z.number(),
    })
    .optional(),
  lens: z.string().max(80).optional(),
  zoomFactor: z.number().positive().max(30).optional(),
  warnings: z.array(z.string().max(240)).max(12).readonly(),
  calibratedAt: z.iso.datetime(),
});
export const visionSessionSettingsSchema = z.object({
  courtWidthMeters: z.number().positive().max(30),
  courtLengthMeters: z.number().positive().max(40),
  netHeightMeters: z.number().positive().max(4),
  cameraHeightMeters: z.number().positive().max(20).optional(),
  overlayScoreboard: z.boolean(),
  teamA: z.string().trim().min(1).max(80),
  teamB: z.string().trim().min(1).max(80),
  corners: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
    )
    .length(4)
    .readonly()
    .optional(),
});
export const visionScoreSnapshotSchema = z
  .object({
    setIndex: z.number().int().nonnegative(),
    sets: z
      .array(
        z.object({
          a: z.number().int().nonnegative(),
          b: z.number().int().nonnegative(),
        }),
      )
      .min(1)
      .max(5)
      .readonly(),
    serving: z.enum(["A", "B"]).optional(),
    status: z.enum(["not-started", "live", "complete", "forfeit"]),
  })
  .refine((score) => score.setIndex < score.sets.length, {
    message: "The active set must exist in the score snapshot.",
    path: ["setIndex"],
  });
export const visionTimelineEventSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    source: z.enum(["apple-watch", "iphone", "remote", "match"]),
    type: z.enum([
      "recording-started",
      "rally-won",
      "favorite",
      "undo",
      "side-change",
      "set-ended",
      "recording-stopped",
      "calibration-updated",
    ]),
    winnerSide: z.enum(["A", "B"]).optional(),
    targetEventId: z.string().uuid().optional(),
    elapsedMs: z
      .number()
      .int()
      .min(0)
      .max(12 * 60 * 60 * 1_000),
    occurredAt: z.iso.datetime(),
    score: visionScoreSnapshotSchema.optional(),
    label: z.string().trim().min(1).max(160).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((event, context) => {
    if (event.type === "rally-won" && !event.winnerSide) {
      context.addIssue({
        code: "custom",
        message: "A rally event requires the winning side.",
        path: ["winnerSide"],
      });
    }
    if (event.type === "undo" && !event.targetEventId) {
      context.addIssue({
        code: "custom",
        message: "An undo event must reference the event it reverses.",
        path: ["targetEventId"],
      });
    }
  });
export const visionSessionSchema = z.object({
  id: z.string().uuid(),
  videoId: z.string().uuid().optional(),
  matchId: z.string().uuid().optional(),
  title: z.string(),
  status: z.enum(["setup", "ready", "recording", "ended", "expired"]),
  settings: visionSessionSettingsSchema,
  controlVersion: z.number().int().positive(),
  previewDataUrl: z.string().max(300_000).optional(),
  previewCapturedAt: z.iso.datetime().optional(),
  recordingStartedAt: z.iso.datetime().optional(),
  recordingEndedAt: z.iso.datetime().optional(),
  remoteExpiresAt: z.iso.datetime(),
  remoteConnected: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const visionPlaybackSchema = z.object({
  sessionId: z.string().uuid(),
  settings: visionSessionSettingsSchema,
  recordingStartedAt: z.iso.datetime().optional(),
  events: z.array(visionTimelineEventSchema).readonly(),
});
export const healthCategorySchema = z.enum([
  "heart",
  "recovery",
  "activity",
  "body",
]);
export const healthMetricSchema = z.enum([
  "heart-rate",
  "resting-heart-rate",
  "heart-rate-variability",
  "walking-heart-rate",
  "vo2-max",
  "respiratory-rate",
  "oxygen-saturation",
  "body-temperature",
  "sleep",
  "active-energy",
  "basal-energy",
  "steps",
  "distance",
  "exercise-minutes",
  "stand-minutes",
  "workout",
  "weight",
  "body-fat",
  "lean-body-mass",
]);
const healthSampleBaseSchema = z.object({
  externalId: z.string().uuid(),
  metric: healthMetricSchema,
  kind: z.enum(["quantity", "category", "workout"]),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  value: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
  unit: z.string().trim().min(1).max(32).optional(),
  categoryValue: z.string().trim().min(1).max(80).optional(),
  workout: z
    .object({
      activityType: z.number().int().nonnegative(),
      durationSeconds: z
        .number()
        .finite()
        .nonnegative()
        .max(7 * 24 * 60 * 60),
      activeEnergyKcal: z.number().finite().nonnegative().optional(),
      distanceKilometers: z.number().finite().nonnegative().optional(),
    })
    .optional(),
});
export const healthSampleInputSchema = healthSampleBaseSchema.superRefine(
  (sample, context) => {
    if (new Date(sample.endedAt) < new Date(sample.startedAt)) {
      context.addIssue({
        code: "custom",
        message: "A health sample cannot end before it starts.",
        path: ["endedAt"],
      });
    }
    if (sample.kind === "quantity" && sample.value === undefined) {
      context.addIssue({
        code: "custom",
        message: "A quantity health sample requires a value.",
        path: ["value"],
      });
    }
    if (sample.kind === "category" && !sample.categoryValue) {
      context.addIssue({
        code: "custom",
        message: "A category health sample requires a category value.",
        path: ["categoryValue"],
      });
    }
    if (sample.kind === "workout" && !sample.workout) {
      context.addIssue({
        code: "custom",
        message: "A workout health sample requires workout details.",
        path: ["workout"],
      });
    }
  },
);
export const healthTimelineEntrySchema = healthSampleBaseSchema
  .omit({ externalId: true })
  .extend({ id: z.string().uuid(), category: healthCategorySchema });
export const healthSharingScopeSchema = z.enum([
  "summary",
  "timeline",
  "video-overlay",
]);
export const healthSharingCandidateSchema = z.object({
  id: z.string(),
  kind: z.enum(["player", "coach", "organization"]),
  label: z.string(),
  detail: z.string(),
  personId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});
export const healthSharingGrantSchema = z.object({
  id: z.string().uuid(),
  audience: healthSharingCandidateSchema,
  categories: z.array(healthCategorySchema).min(1).readonly(),
  scopes: z.array(healthSharingScopeSchema).min(1).readonly(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export const healthConnectionSchema = z.object({
  provider: z.literal("apple-health"),
  status: z.enum(["active", "paused", "revoked"]),
  enabledCategories: z.array(healthCategorySchema).readonly(),
  consentVersion: z.string(),
  timezone: z.string(),
  earliestAuthorizedAt: z.iso.datetime().optional(),
  lastSyncedAt: z.iso.datetime().optional(),
});
export const healthDailySummarySchema = z.object({
  date: z.string(),
  sleepHours: z.number().nonnegative().optional(),
  averageHeartRate: z.number().nonnegative().optional(),
  restingHeartRate: z.number().nonnegative().optional(),
  heartRateVariabilityMs: z.number().nonnegative().optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  steps: z.number().nonnegative().optional(),
  weightKilograms: z.number().positive().optional(),
});
export const healthSummarySchema = z.object({
  latestHeartRate: z.number().nonnegative().optional(),
  restingHeartRate: z.number().nonnegative().optional(),
  heartRateVariabilityMs: z.number().nonnegative().optional(),
  lastSleepHours: z.number().nonnegative().optional(),
  sevenDayActiveEnergyKcal: z.number().nonnegative().optional(),
  weightKilograms: z.number().positive().optional(),
  recoveryContext: z
    .object({
      score: z.number().int().min(0).max(100),
      label: z.enum([
        "limited-data",
        "below-baseline",
        "near-baseline",
        "above-baseline",
      ]),
      inputs: z.array(z.string()).readonly(),
    })
    .optional(),
});
export const healthMatchContextSchema = z.object({
  matchId: z.string().uuid(),
  label: z.string(),
  occurredAt: z.iso.datetime(),
  result: z.enum(["won", "lost", "unknown"]),
  sleepHours: z.number().nonnegative().optional(),
  activeEnergyKcalBefore: z.number().nonnegative().optional(),
  restingHeartRate: z.number().nonnegative().optional(),
  heartRateVariabilityMs: z.number().nonnegative().optional(),
  averageMatchHeartRate: z.number().nonnegative().optional(),
  weightKilograms: z.number().positive().optional(),
});
export const healthCorrelationSchema = z.object({
  metric: z.enum([
    "sleep-hours",
    "active-energy-before",
    "resting-heart-rate",
    "heart-rate-variability",
    "match-heart-rate",
  ]),
  coefficient: z.number().min(-1).max(1),
  sampleSize: z.number().int().min(5),
  interpretation: z.string(),
});
export const healthProfileSchema = z.object({
  subject: z.object({ id: z.string().uuid(), displayName: z.string() }),
  access: z.object({
    owner: z.boolean(),
    categories: z.array(healthCategorySchema).readonly(),
    scopes: z.array(healthSharingScopeSchema).readonly(),
  }),
  summary: healthSummarySchema,
  daily: z.array(healthDailySummarySchema).max(31).readonly(),
  timeline: z.array(healthTimelineEntrySchema).max(500).readonly(),
  matches: z.array(healthMatchContextSchema).max(30).readonly(),
  correlations: z.array(healthCorrelationSchema).readonly(),
  disclaimer: z.string(),
});
export const healthDashboardSchema = healthProfileSchema.extend({
  connection: healthConnectionSchema.optional(),
  grants: z.array(healthSharingGrantSchema).readonly(),
  candidates: z.array(healthSharingCandidateSchema).readonly(),
});
export const healthVideoOverlaySchema = z.object({
  subjectPersonId: z.string().uuid(),
  points: z
    .array(
      z.object({
        elapsedMs: z.number().int().nonnegative(),
        beatsPerMinute: z.number().nonnegative(),
      }),
    )
    .max(10_000)
    .readonly(),
  averageBeatsPerMinute: z.number().nonnegative().optional(),
});
export const videoSummarySchema = z.object({
  id: z.string().uuid(),
  owner: personSummarySchema,
  source: videoSourceSchema,
  category: videoCategorySchema,
  title: z.string(),
  status: videoStatusSchema,
  event: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      title: z.string(),
    })
    .optional(),
  match: z
    .object({
      id: z.string().uuid(),
      label: z.string(),
    })
    .optional(),
  venue: z
    .object({
      id: z.string().uuid().optional(),
      name: z.string(),
      address: z.string().optional(),
      googlePlaceId: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  liveVisibility: videoLiveVisibilitySchema,
  recordingVisibility: videoRecordingVisibilitySchema,
  publishedToProfile: z.boolean(),
  hasAudio: z.boolean(),
  musicRemovalRequested: z.boolean(),
  musicRemovalStatus: videoMusicRemovalStatusSchema,
  durationSeconds: z.number().int().nonnegative().optional(),
  bytes: z.number().int().nonnegative().optional(),
  courtCalibration: courtCalibrationSchema.optional(),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  readyAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
});
export const videoUsageSchema = z.object({
  periodStartsAt: z.iso.datetime(),
  periodEndsAt: z.iso.datetime(),
  live: z.object({
    usedSeconds: z.number().int().nonnegative(),
    limitSeconds: z.number().int().nonnegative(),
    remainingSeconds: z.number().int().nonnegative(),
    enforced: z.boolean(),
  }),
  uploads: z.object({
    usedSeconds: z.number().int().nonnegative(),
    limitSeconds: z.number().int().nonnegative(),
    remainingSeconds: z.number().int().nonnegative(),
    overageSeconds: z.number().int().nonnegative(),
    enforced: z.boolean(),
  }),
});
export const dunaPlusEntitlementSchema = z.object({
  active: z.boolean(),
  kind: z.enum(["paid", "complimentary", "none"]),
  label: z.string(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
});
export const videoStudioSchema = z.object({
  entitlement: dunaPlusEntitlementSchema,
  usage: videoUsageSchema,
  videos: z.array(videoSummarySchema).readonly(),
  liveNow: z.array(videoSummarySchema).readonly(),
  liveConfigured: z.boolean(),
  uploadsConfigured: z.boolean(),
  dataEnvironmentKey: z.string().optional(),
});
export const videoAssociationOptionSchema = z.object({
  type: z.enum(["event", "match"]),
  id: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  title: z.string(),
  subtitle: z.string(),
  associated: z.boolean(),
  startsAt: z.iso.datetime().optional(),
  venue: z
    .object({
      venueId: z.string().uuid().optional(),
      name: z.string(),
      address: z.string().optional(),
      googlePlaceId: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  captureDefaults: z
    .object({
      courtWidthMeters: z.number().positive().max(30),
      courtLengthMeters: z.number().positive().max(40),
      netHeightMeters: z.number().positive().max(4),
      orientation: z.enum(["landscape", "portrait"]).optional(),
    })
    .optional(),
});
export const videoPlaybackSchema = z.object({
  video: videoSummarySchema,
  provider: z.enum(["mux", "r2"]),
  playbackId: z.string().optional(),
  playbackToken: z.string().optional(),
  sourceUrl: z.url().optional(),
  posterUrl: z.url().optional(),
  dataEnvironmentKey: z.string().optional(),
  viewSessionId: z.string().uuid(),
  isOwner: z.boolean(),
  vision: visionPlaybackSchema.optional(),
  liveScore: visionScoreSnapshotSchema.optional(),
  healthOverlay: healthVideoOverlaySchema.optional(),
});
export const liveVideoSessionSchema = z.object({
  video: videoSummarySchema,
  streamUrl: z.url(),
  streamKey: z.string().min(8),
  maximumDurationSeconds: z.number().int().positive(),
  shareUrl: z.url(),
});
export const videoUploadSessionSchema = z.object({
  videoId: z.string().uuid(),
  uploadId: z.string(),
  objectKey: z.string(),
  partSizeBytes: z
    .number()
    .int()
    .min(5 * 1024 * 1024),
  totalParts: z.number().int().min(1).max(10_000),
  uploadedParts: z.array(z.number().int().min(1).max(10_000)).readonly(),
  expiresAt: z.iso.datetime(),
});
export const videoUploadPartUrlSchema = z.object({
  partNumber: z.number().int().min(1).max(10_000),
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export const videoMetricsSchema = z.object({
  video: videoSummarySchema,
  views: z.number().int().nonnegative(),
  uniqueViewers: z.number().int().nonnegative(),
  watchedSeconds: z.number().int().nonnegative(),
  averageWatchSeconds: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  mux: z
    .object({
      views: z.number().int().nonnegative().optional(),
      uniqueViewers: z.number().int().nonnegative().optional(),
      playingTimeSeconds: z.number().nonnegative().optional(),
      videoStartupTimeMs: z.number().nonnegative().optional(),
      rebufferPercentage: z.number().nonnegative().optional(),
      playbackFailurePercentage: z.number().nonnegative().optional(),
      currentConcurrentViewers: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export const dunaPlusGrantSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid().optional(),
  email: z.string().email(),
  displayName: z.string().optional(),
  status: z.enum(["active", "revoked"]),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  reason: z.string(),
  grantedByName: z.string().optional(),
});
export const adminVideoOverviewSchema = z.object({
  canManage: z.boolean(),
  settings: z.object({
    monthlyLiveSeconds: z.number().int().nonnegative(),
    monthlyUploadSeconds: z.number().int().nonnegative(),
    enforceLiveLimit: z.boolean(),
    enforceUploadLimit: z.boolean(),
  }),
  totals: z.object({
    videos: z.number().int().nonnegative(),
    liveNow: z.number().int().nonnegative(),
    storageBytes: z.number().int().nonnegative(),
    watchedSeconds: z.number().int().nonnegative(),
    complimentarySubscribers: z.number().int().nonnegative(),
  }),
  activeStreams: z.array(videoSummarySchema).readonly(),
  topUsage: z
    .array(
      z.object({
        person: personSummarySchema,
        usage: videoUsageSchema,
        videoCount: z.number().int().nonnegative(),
      }),
    )
    .readonly(),
  grants: z.array(dunaPlusGrantSchema).readonly(),
  muxConfigured: z.boolean(),
  r2Configured: z.boolean(),
});
export const accountDeletionReadinessSchema = z.object({
  canRequestDeletion: z.boolean(),
  blockingReasons: z
    .array(
      z.enum([
        "cash-balance",
        "pending-cash",
        "active-subscription",
        "owned-organization",
        "account-data-unavailable",
      ]),
    )
    .readonly(),
  cash: z.object({
    availableMinor: z.number().int(),
    pendingMinor: z.number().int(),
    heldMinor: z.number().int(),
    currency: z.string().length(3),
  }),
  organizationCredits: z
    .array(
      z.object({
        organizationId: z.string().uuid(),
        organizationName: z.string(),
        organizationSlug: z.string(),
        credits: z.number().int().nonnegative(),
        unit: z.string(),
      }),
    )
    .readonly(),
  totalOrganizationCredits: z.number().int().nonnegative(),
  activeSubscriptions: z
    .array(
      z.object({
        membershipId: z.string().uuid(),
        name: z.string(),
        organizationName: z.string().optional(),
        cancelAtPeriodEnd: z.boolean(),
      }),
    )
    .readonly(),
  ownedOrganizations: z
    .array(
      z.object({
        organizationId: z.string().uuid(),
        organizationName: z.string(),
        organizationSlug: z.string(),
      }),
    )
    .readonly(),
});
export const playerSettingsSchema = z.object({
  profile: z.object({
    person: personSummarySchema,
    email: z.string().email().optional(),
    phoneE164: z.string().optional(),
    visibility: z.enum(["public", "members", "private"]),
    locale: z.string(),
    measurementSystem: z.enum(["imperial", "metric"]),
    ageBand: z.enum(["unknown", "under-13", "teen", "adult"]),
    ageVerified: z.boolean(),
    birthDate: z.iso.date().optional(),
    parentalConsentRecorded: z.boolean(),
    legalGivenName: z.string().optional(),
    legalMiddleName: z.string().optional(),
    legalFamilyName: z.string().optional(),
    heightMillimeters: z.number().int().min(600).max(2600).optional(),
    playingExperience: z.enum([
      "not-set",
      "amateur",
      "high-school",
      "collegiate",
      "professional",
    ]),
    playedIndoorPrior: z.boolean().optional(),
    yearsPlaying: z.number().int().min(0).max(100).optional(),
    collegeName: z.string().optional(),
    experienceSummary: z.string().optional(),
    onboardingStatus: z.enum([
      "not-started",
      "in-progress",
      "guardian-required",
      "complete",
    ]),
    onboardingCompletedAt: z.iso.datetime().optional(),
  }),
  identityVerification: z.object({
    configured: z.boolean(),
    verificationId: z.string().uuid().optional(),
    status: z.enum([
      "not-started",
      "requires-input",
      "processing",
      "verified",
      "canceled",
      "redacted",
    ]),
    livemode: z.boolean().optional(),
    verifiedAt: z.iso.datetime().optional(),
    lastErrorCode: z.string().optional(),
  }),
  sourceConnections: z
    .array(
      z.object({
        id: z.string().uuid(),
        source: z.enum(["volleyball-life", "bvbinfo"]),
        profileUrl: z.string().url(),
        apiProfileUrl: z.string().url().optional(),
        externalPersonId: z.string(),
        profileSnapshot: z.record(z.string(), z.unknown()),
        verificationStatus: z.enum(["pending", "confirmed", "rejected"]),
        status: z.enum([
          "queued",
          "syncing",
          "linked",
          "review-required",
          "failed",
          "disconnected",
        ]),
        lastSyncedAt: z.iso.datetime().optional(),
        lastError: z.string().optional(),
        progress: z.object({
          phase: z.string(),
          current: z.number().int().nonnegative(),
          total: z.number().int().nonnegative(),
          matchesFound: z.number().int().nonnegative(),
          profilesFound: z.number().int().nonnegative(),
        }),
        nextRefreshAt: z.iso.datetime().optional(),
      }),
    )
    .readonly(),
  guardianInvitation: z
    .object({
      id: z.string().uuid(),
      status: z.enum(["pending", "claimed", "expired", "cancelled"]),
      expiresAt: z.iso.datetime(),
    })
    .optional(),
  voiceOnboarding: z.object({
    configured: z.boolean(),
    aiConfigured: z.boolean(),
  }),
  household: z
    .array(
      z.object({
        person: personSummarySchema,
        relationship: z.string(),
        role: z.enum(["guardian", "dependent"]),
        verified: z.boolean(),
        emergencyContact: z.boolean(),
        canApproveSpending: z.boolean(),
        onboardingStatus: z.enum([
          "not-started",
          "in-progress",
          "guardian-required",
          "complete",
        ]),
      }),
    )
    .readonly(),
  membership: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      tierName: z.string(),
      interval: z.enum(["month", "year"]),
      priceMinor: z.number().int().nonnegative(),
      currency: currencySchema,
      benefits: z.array(z.string()).readonly(),
      currentPeriodEndsAt: z.iso.datetime().optional(),
      pausedUntil: z.iso.datetime().optional(),
      pauseMonthsUsed: z.number().int().min(0).max(4),
      cancelAtPeriodEnd: z.boolean(),
    })
    .optional(),
  dunaPlus: dunaPlusEntitlementSchema,
  dunaPlusPlans: z
    .array(
      z.object({
        interval: z.enum(["month", "year"]),
        priceMinor: z.number().int().nonnegative(),
        currency: currencySchema,
        configured: z.boolean(),
      }),
    )
    .readonly(),
  consents: z
    .array(
      z.object({
        scope: z.enum([
          "transactional",
          "marketing-email",
          "marketing-sms",
          "marketing-push",
        ]),
        granted: z.boolean(),
        recordedAt: z.iso.datetime(),
      }),
    )
    .readonly(),
  privacyRequests: z
    .array(
      z.object({
        id: z.string().uuid(),
        kind: z.literal("account-deletion"),
        status: z.enum([
          "queued",
          "identity-review",
          "legal-hold",
          "completed",
          "cancelled",
        ]),
        requestedAt: z.iso.datetime(),
      }),
    )
    .readonly(),
});
export const pricingSchema = z.object({
  subtotalMinor: z.number().int().nonnegative(),
  fees: z
    .array(
      z.object({
        id: z.enum([
          "consumer-platform-v2",
          "registration-service-v2",
          "operator-online-v2",
          "operator-present-v2",
          "operator-ach-v2",
          "coach-marketplace-v2",
        ]),
        label: z.string(),
        amountMinor: z.number().int().nonnegative(),
        currency: currencySchema,
        payer: z.enum(["consumer", "operator", "coach"]),
        ruleInputs: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()]),
        ),
      }),
    )
    .readonly(),
  totalMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  dunaPlusSavingsMinor: z.number().int().nonnegative(),
});

export const operatorScheduleItemSchema = z.object({
  time: z.string(),
  court: z.string(),
  title: z.string(),
  detail: z.string(),
  state: z.string(),
});
export const operatorDashboardSchema = z.object({
  organization: organizationSummarySchema,
  metrics: z.array(metricSchema).readonly(),
  schedule: z.array(operatorScheduleItemSchema).readonly(),
  events: z.array(eventSummarySchema).readonly(),
  alerts: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string(),
        action: z.string(),
        tone: z.string(),
      }),
    )
    .readonly(),
});

export const courtCancellationPolicySchema = z.object({
  title: z.string(),
  markdown: z.string(),
  refundBeforeHours: z.number().int().nonnegative().optional(),
  creditBeforeHours: z.number().int().nonnegative().optional(),
  lateCancellation: z.string().optional(),
  requireFullScroll: z.boolean(),
});

export const operatorRatePlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  currency: currencySchema,
  baseAmountMinor: z.number().int().nonnegative(),
  memberAmountMinor: z.number().int().nonnegative().optional(),
  nonMemberAmountMinor: z.number().int().nonnegative().optional(),
  rateUnitMinutes: z.number().int().positive(),
});

export const operatorAvailabilityBlockSchema = z.object({
  id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  startsAtMinute: z.number().int().min(0).max(1_439),
  endsAtMinute: z.number().int().min(1).max(1_440),
  mode: z.enum([
    "open",
    "private-lessons-only",
    "group-only",
    "league-reserved",
    "rentals-only",
    "members-only",
    "maintenance",
    "blocked",
  ]),
  effectiveFrom: z.iso.date().optional(),
  effectiveTo: z.iso.date().optional(),
});

export const operatorScheduleOverrideSchema = z.object({
  id: z.string().uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  mode: z.enum([
    "open",
    "private-lessons-only",
    "group-only",
    "league-reserved",
    "rentals-only",
    "members-only",
    "maintenance",
    "blocked",
  ]),
  reason: z.string(),
});

export const operatorUtilizationSchema = z.object({
  percent: z.number().min(0).max(100),
  bookedMinutes30d: z.number().int().nonnegative(),
  availableMinutes30d: z.number().int().nonnegative(),
  bookingCount30d: z.number().int().nonnegative(),
  nextBookingAt: z.iso.datetime().optional(),
});

export const operatorCourtSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  name: z.string(),
  surface: z.string(),
  imageUrl: z.string().optional(),
  lit: z.boolean(),
  capacity: z.number().int().positive(),
  status: z.enum(["draft", "active", "maintenance", "seasonal", "closed"]),
  bookingPolicy: z.enum(["public", "members", "tiers", "staff", "none"]),
  ratePlanId: z.string().uuid().optional(),
  minimumDurationMinutes: z.number().int().positive(),
  maximumDurationMinutes: z.number().int().positive(),
  durationOptionsMinutes: z.array(z.number().int().positive()).readonly(),
  bookingIncrementMinutes: z.number().int().positive(),
  bufferBeforeMinutes: z.number().int().nonnegative(),
  bufferAfterMinutes: z.number().int().nonnegative(),
  minimumNoticeMinutes: z.number().int().nonnegative(),
  maximumAdvanceDays: z.number().int().positive(),
  cancellationPolicy: courtCancellationPolicySchema,
  schedule: z.array(operatorAvailabilityBlockSchema).readonly(),
  overrides: z.array(operatorScheduleOverrideSchema).readonly(),
  utilization: operatorUtilizationSchema,
});

export const operatorVenueSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  slug: z.string(),
  status: z.enum(["draft", "active", "maintenance", "seasonal", "closed"]),
  temporary: z.boolean(),
  capacity: z.number().int().nonnegative(),
  heroImageUrl: z.string().optional(),
  heroImageTreatmentUrl: z.string().optional(),
  amenities: z.array(z.string()).readonly(),
  addressLine1: z.string().optional(),
  locality: z.string().optional(),
  administrativeArea: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string(),
  googlePlaceId: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  timezone: z.string(),
  weather: weatherForecastSchema.optional(),
  utilization: operatorUtilizationSchema,
  courts: z.array(operatorCourtSchema).readonly(),
});

export const operatorSessionSchema = z.object({
  id: z.string().uuid(),
  programId: z.string().uuid().optional(),
  title: z.string(),
  slug: z.string(),
  kind: eventKindSchema,
  status: z.enum([
    "draft",
    "published",
    "registration-open",
    "live",
    "weather-hold",
    "completed",
    "cancelled",
  ]),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string(),
  capacity: z.number().int().positive(),
  venueId: z.string().uuid().optional(),
  venueName: z.string().optional(),
  courtId: z.string().uuid().optional(),
  courtName: z.string().optional(),
  shortSummary: z.string().optional(),
  description: z.string().optional(),
  media: z.array(z.record(z.string(), z.unknown())).readonly(),
  registrationClosesAt: z.iso.datetime().optional(),
  priceMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  analytics: z.object({
    impressions: z.number().int().nonnegative(),
    uniqueViewers: z.number().int().nonnegative(),
    registrations: z.number().int().nonnegative(),
    ticketHolders: z.number().int().nonnegative(),
    conversionRateBps: z.number().int().min(0).max(10_000),
  }),
});

export const operatorEventRegistrationSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  personId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  phoneE164: z.string().optional(),
  status: z.enum([
    "pending",
    "confirmed",
    "waitlisted",
    "cancelled",
    "refunded",
    "checked-in",
  ]),
  orderId: z.string().uuid().optional(),
  ticketCount: z.number().int().nonnegative(),
  checkedInAt: z.iso.datetime().optional(),
  registeredAt: z.iso.datetime(),
});

export const operatorEventAudienceSchema = z.object({
  sessionId: z.string().uuid(),
  kind: z.enum([
    "non-registered-members",
    "registered-attendees",
    "ticket-holders",
  ]),
  label: z.string(),
  description: z.string(),
  size: z.number().int().nonnegative(),
});

export const operatorMessageRecipientSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email().optional(),
  phoneE164: z.string().optional(),
  isMinor: z.boolean(),
  verifiedGuardianCount: z.number().int().nonnegative(),
});

export const operatorMessageDraftSchema = z.object({
  id: z.string().uuid(),
  recipientPersonId: z.string().uuid(),
  recipientName: z.string(),
  channel: z.enum(["email", "sms", "push", "in-app"]),
  kind: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  guardianCopyCount: z.number().int().nonnegative(),
  consentRecorded: z.boolean(),
  status: z.literal("draft"),
  createdAt: z.iso.datetime(),
});

export const operatorParticipantSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email().optional(),
  phoneE164: z.string().optional(),
  avatarUrl: z.string().optional(),
  isMinor: z.boolean(),
  relationship: z.enum(["player", "member", "guardian"]),
  status: z.enum(["active", "inactive", "pending"]),
  guardianStatus: z.enum(["not-required", "pending", "verified"]),
  joinedAt: z.iso.datetime(),
});

export const operatorInvitationSchema = z.object({
  id: z.string().uuid(),
  invitedName: z.string(),
  invitedEmail: z.string().email().optional(),
  invitedPhoneE164: z.string().optional(),
  isMinor: z.boolean(),
  guardianName: z.string().optional(),
  relationship: z.enum(["player", "member"]),
  status: z.enum(["pending", "claimed", "expired", "cancelled"]),
  deliveryChannel: z.enum(["email", "sms"]).optional(),
  deliveryStatus: z.enum(["not-configured", "queued", "sent", "failed"]),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const operatorCatalogPriceSchema = z.object({
  id: z.string().uuid(),
  audience: z.enum(["everyone", "member", "non-member"]),
  paymentKind: z.enum(["card", "cash", "credit"]),
  amountMinor: z.number().int().nonnegative().optional(),
  currency: currencySchema.optional(),
  creditAmount: z.number().int().positive().optional(),
  recurringInterval: z.enum(["week", "month", "year"]).optional(),
  recurringIntervalCount: z.number().int().positive().optional(),
  active: z.boolean(),
});

export const operatorCatalogVariantSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  sku: z.string().optional(),
  optionCoordinates: z.record(z.string(), z.string()),
  status: z.enum(["draft", "active", "archived"]),
  prices: z.array(operatorCatalogPriceSchema).readonly(),
});

export const operatorCatalogItemSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["event", "service", "good", "plan"]),
  subtype: z.string(),
  slug: z.string(),
  title: z.string(),
  shortSummary: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]),
  visibility: z.enum(["public", "members", "private"]),
  taxable: z.boolean(),
  stripeTaxCode: z.string().optional(),
  allowCard: z.boolean(),
  allowCash: z.boolean(),
  allowCredits: z.boolean(),
  membershipRequired: z.boolean(),
  defaultFulfillment: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  variants: z.array(operatorCatalogVariantSchema).readonly(),
  media: z
    .array(
      z.object({
        id: z.string().uuid(),
        kind: z.enum(["image", "video"]),
        url: z.string(),
        posterUrl: z.string().optional(),
        alt: z.string().optional(),
      }),
    )
    .readonly(),
  inventoryOnHand: z.number().int().nonnegative(),
  inventoryReserved: z.number().int().nonnegative(),
  publishedAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime(),
});

export const publicCatalogPriceSchema = operatorCatalogPriceSchema.pick({
  id: true,
  audience: true,
  paymentKind: true,
  amountMinor: true,
  currency: true,
  creditAmount: true,
  recurringInterval: true,
  recurringIntervalCount: true,
});

export const publicCatalogVariantSchema = operatorCatalogVariantSchema
  .pick({
    id: true,
    title: true,
    sku: true,
    optionCoordinates: true,
    prices: true,
  })
  .extend({
    prices: z.array(publicCatalogPriceSchema).readonly(),
    availableQuantity: z.number().int().nonnegative().optional(),
  });

export const publicCatalogItemSchema = operatorCatalogItemSchema
  .pick({
    id: true,
    type: true,
    subtype: true,
    slug: true,
    title: true,
    shortSummary: true,
    description: true,
    visibility: true,
    taxable: true,
    allowCard: true,
    allowCash: true,
    allowCredits: true,
    membershipRequired: true,
    defaultFulfillment: true,
    configuration: true,
    media: true,
  })
  .extend({
    variants: z.array(publicCatalogVariantSchema).readonly(),
  });

export const operatorInventoryItemSchema = z.object({
  id: z.string().uuid(),
  catalogItemId: z.string().uuid(),
  catalogVariantId: z.string().uuid(),
  itemTitle: z.string(),
  variantTitle: z.string(),
  locationName: z.string(),
  purpose: z.enum(["sale", "rental", "coach-use", "operations"]),
  trackingMode: z.enum(["quantity", "serialized"]),
  quantityOnHand: z.number().int().nonnegative(),
  quantityReserved: z.number().int().nonnegative(),
  reorderPoint: z.number().int().nonnegative(),
  serialNumber: z.string().optional(),
  assetTag: z.string().optional(),
  condition: z.string(),
  unitCostMinor: z.number().int().nonnegative().optional(),
  currency: currencySchema.optional(),
  acquiredAt: z.iso.date().optional(),
  vendorName: z.string().optional(),
  depreciationMethod: z.string().optional(),
  usefulLifeMonths: z.number().int().positive().optional(),
  bookValueMinor: z.number().int().nonnegative().optional(),
});

export const operatorInventoryLocationSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid().optional(),
  name: z.string(),
  kind: z.enum(["venue", "warehouse", "vehicle", "coach-kit", "virtual"]),
  active: z.boolean(),
});

export const operatorPersonRelationshipSchema = z.object({
  personId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  email: z.string().email().optional(),
  phoneE164: z.string().optional(),
  isMinor: z.boolean(),
  roles: z
    .array(
      z.enum([
        "player",
        "guardian",
        "owner",
        "manager",
        "coach",
        "front-desk",
        "scorekeeper",
        "accountant",
      ]),
    )
    .readonly(),
  status: z.enum(["active", "inactive", "pending"]),
  membershipStatus: z.string().optional(),
  membershipName: z.string().optional(),
  creditBalance: z.number().int().nonnegative(),
  lifetimeSpendMinor: z.number().int().nonnegative(),
  purchaseCount: z.number().int().nonnegative(),
  recentPurchases: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        description: z.string(),
        amountMinor: z.number().int().nonnegative(),
        currency: currencySchema,
        status: z.string(),
        purchasedAt: z.iso.datetime(),
      }),
    )
    .readonly(),
  upcomingCount: z.number().int().nonnegative(),
  churnRisk: z.object({
    score: z.number().int().min(0).max(100),
    level: z.enum(["low", "watch", "high"]),
    reasons: z.array(z.string()).readonly(),
    lastActivityAt: z.iso.datetime().optional(),
    daysSinceActivity: z.number().int().nonnegative().optional(),
    model: z.literal("activity-v1"),
  }),
  joinedAt: z.iso.datetime(),
});

export const operatorStaffProfileSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  displayName: z.string(),
  handle: z.string(),
  avatarUrl: z.string().optional(),
  email: z.string().email().optional(),
  phoneE164: z.string().optional(),
  homeMarket: z.string().optional(),
  bio: z.string().optional(),
  profileVisibility: z.enum(["public", "members", "private"]),
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
  currency: currencySchema,
  addressComplete: z.boolean(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  locality: z.string().optional(),
  administrativeArea: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string(),
  googlePlaceId: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  availability: z.array(z.record(z.string(), z.unknown())).readonly(),
  incomeGoalMinor: z.number().int().nonnegative().optional(),
  incomeGoalPeriod: z.enum(["week", "month", "quarter", "year"]).optional(),
  sessionsRun30d: z.number().int().nonnegative(),
  upcomingSessions: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const operatorStaffInvitationSchema = z.object({
  id: z.string().uuid(),
  invitedName: z.string(),
  invitedEmail: z.string().email().optional(),
  invitedPhoneE164: z.string().optional(),
  role: z.enum(["coach", "manager", "front-desk", "accountant"]),
  workerClassification: z.enum(["1099-contractor", "w2-employee"]),
  status: z.enum(["pending", "claimed", "expired", "cancelled"]),
  deliveryChannel: z.enum(["email", "sms"]).optional(),
  deliveryStatus: z.enum(["not-configured", "queued", "sent", "failed"]),
  inviteUrl: z.string().url(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const operatorMarketingFlowSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  name: z.string(),
  description: z.string().optional(),
  segment: z.record(z.string(), z.unknown()),
  trigger: z.record(z.string(), z.unknown()),
  action: z.record(z.string(), z.unknown()),
  audienceSize: z.number().int().nonnegative(),
  status: z.enum(["draft", "active", "paused", "archived"]),
  createdAt: z.iso.datetime(),
});

export const operatorOrganizationDomainSchema = z.object({
  id: z.string().uuid(),
  hostname: z.string(),
  kind: z.enum(["duna-subdomain", "custom", "purchased"]),
  status: z.enum(["pending", "verifying", "active", "failed", "disabled"]),
  isPrimary: z.boolean(),
  verification: z.array(z.record(z.string(), z.unknown())).readonly(),
  lastCheckedAt: z.iso.datetime().optional(),
});

export const operatorCommunicationSettingsSchema = z.object({
  senderDisplayName: z.string().optional(),
  senderEmailLocalPart: z.string().optional(),
  senderEmailDomain: z.string().optional(),
  senderEmail: z.string().email().optional(),
  emailDomainStatus: z.enum([
    "not-configured",
    "pending",
    "verified",
    "failed",
  ]),
  emailDnsRecords: z
    .array(
      z.object({
        type: z.string(),
        name: z.string(),
        value: z.string(),
        status: z.string(),
        priority: z.number().int().optional(),
      }),
    )
    .readonly(),
  messagingAddonStatus: z.enum([
    "disabled",
    "trialing",
    "active",
    "past-due",
    "cancelled",
  ]),
  messagingPhoneNumber: z.string().optional(),
  messagingSenderId: z.string().optional(),
  smsEnabled: z.boolean(),
  rcsEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  includedWithPlan: z.boolean(),
  emailMessageLimit: z.number().int().nonnegative(),
  emailContactLimit: z.number().int().nonnegative(),
  messagingMessageLimit: z.number().int().nonnegative(),
  messagingContactLimit: z.number().int().nonnegative(),
  boostUnits: z.number().int().nonnegative(),
  alertThresholdBps: z.number().int().min(1).max(10_000),
  softOverageBps: z.number().int().min(0).max(10_000),
});

export const operatorCommunicationUsageSchema = z.object({
  periodStart: z.string(),
  emailContacts: z.number().int().nonnegative(),
  emailMessages: z.number().int().nonnegative(),
  messagingContacts: z.number().int().nonnegative(),
  smsMessages: z.number().int().nonnegative(),
  rcsMessages: z.number().int().nonnegative(),
  whatsappMessages: z.number().int().nonnegative(),
  pushMessages: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  clicked: z.number().int().nonnegative(),
  bounced: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  converted: z.number().int().nonnegative(),
});

export const operatorMarketingCampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  segment: z.record(z.string(), z.unknown()),
  channel: z.enum(["email", "sms", "push", "in-app"]),
  subject: z.string().optional(),
  body: z.string(),
  status: z.enum([
    "draft",
    "scheduled",
    "sending",
    "sent",
    "paused",
    "cancelled",
  ]),
  scheduledAt: z.iso.datetime().optional(),
  sentAt: z.iso.datetime().optional(),
  stats: z.object({
    recipients: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    opened: z.number().int().nonnegative(),
    clicked: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  createdAt: z.iso.datetime(),
});

export const operatorBillingRecoverySchema = z.object({
  personId: z.string().uuid(),
  displayName: z.string(),
  membershipName: z.string(),
  membershipStatus: z.string(),
  retryState: z.enum(["processor-managed", "action-required"]),
  detail: z.string(),
});

export const operatorCalendarEntrySchema = z.object({
  id: z.string(),
  sourceType: z.enum(["session", "booking", "busy-block", "operator-block"]),
  title: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string(),
  status: z.string(),
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
  venueId: z.string().uuid().optional(),
  venueName: z.string().optional(),
  courtId: z.string().uuid().optional(),
  courtName: z.string().optional(),
  coachPersonId: z.string().uuid().optional(),
  coachName: z.string().optional(),
  participantCount: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  color: z.string(),
  draggable: z.boolean(),
  attendees: z
    .array(
      z.object({
        registrationId: z.string().uuid(),
        personId: z.string().uuid(),
        displayName: z.string(),
        avatarUrl: z.string().optional(),
        isMinor: z.boolean(),
        status: z.enum([
          "pending",
          "confirmed",
          "waitlisted",
          "cancelled",
          "refunded",
          "checked-in",
        ]),
      }),
    )
    .readonly(),
  equipment: z
    .array(
      z.object({
        reservationId: z.string().uuid(),
        inventoryStockItemId: z.string().uuid(),
        label: z.string(),
        quantity: z.number().int().positive(),
      }),
    )
    .readonly(),
});

export const operatorCalendarConnectionSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  personName: z.string(),
  provider: z.enum(["google", "apple", "ical"]),
  syncDirection: z.enum(["busy-only", "duna-to-external", "two-way"]),
  status: z.enum([
    "pending",
    "active",
    "reauthorization-required",
    "paused",
    "revoked",
  ]),
  lastSyncedAt: z.iso.datetime().optional(),
});

export const operatorThemeSchema = z.object({
  brandDisplayName: z.string().optional(),
  membershipProgramName: z.string().optional(),
  logoUrl: z.string().optional(),
  markUrl: z.string().optional(),
  logoLightUrl: z.string().optional(),
  logoDarkUrl: z.string().optional(),
  heroMediaType: z.enum(["image", "video"]).optional(),
  heroMediaUrl: z.string().optional(),
  heroPosterUrl: z.string().optional(),
  tagline: z.string().optional(),
  profileSummary: z.string().optional(),
  brandVoice: z.string().optional(),
  palette: z.object({
    primary: z.string(),
    accent: z.string(),
    sand: z.string(),
    ink: z.string(),
    canvas: z.string(),
    success: z.string(),
  }),
  typography: z.object({
    heading: z.string(),
    body: z.string(),
  }),
  fontLicenseConfirmed: z.boolean(),
  safeFallbackFont: z.string(),
  cardStyle: z.enum(["soft", "crisp", "borderless"]),
  profileLayout: z.string(),
  publishedAt: z.iso.datetime().optional(),
});

export const operatorBrandKnowledgeSourceSchema = z.object({
  id: z.string().uuid(),
  scope: z.enum(["brand", "organization", "venue", "service", "product"]),
  kind: z.enum(["note", "link", "document"]),
  title: z.string(),
  sourceUrl: z.string().optional(),
  storageUrl: z.string().optional(),
  mimeType: z.string().optional(),
  originalFilename: z.string().optional(),
  contentText: z.string().optional(),
  status: z.enum(["processing", "ready", "failed", "archived"]),
  approvedAt: z.iso.datetime().optional(),
  failureReason: z.string().optional(),
  lastProcessedAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime(),
});

export const operatorBrandKnowledgeSchema = z.object({
  sources: z.array(operatorBrandKnowledgeSourceSchema).readonly(),
  activeSourceCount: z.number().int().nonnegative(),
  contextRevision: z.string(),
  contextPreview: z.array(z.string()).readonly(),
  safetyRules: z.array(z.string()).readonly(),
});

export const publicOrganizationStorefrontSchema = z.object({
  organizationId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  currency: currencySchema,
  timezone: z.string(),
  paymentsReady: z.boolean(),
  theme: operatorThemeSchema,
  catalog: z.array(publicCatalogItemSchema).readonly(),
});

export const publicCoachSchema = z.object({
  personId: z.string().uuid(),
  organizationId: z.string().uuid(),
  organizationSlug: z.string(),
  organizationName: z.string(),
  displayName: z.string(),
  handle: z.string(),
  avatarUrl: z.string().optional(),
  homeMarket: z.string().optional(),
  bio: z.string().optional(),
  availability: z.array(z.record(z.string(), z.unknown())).readonly(),
  services: z.array(publicCatalogItemSchema).readonly(),
  upcomingSessions: z
    .array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        title: z.string(),
        kind: eventKindSchema,
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        timezone: z.string(),
        venueName: z.string().optional(),
      }),
    )
    .readonly(),
});

export const organizationWalletSummarySchema = z.object({
  organizationId: z.string().uuid(),
  organizationSlug: z.string(),
  organizationName: z.string(),
  credits: z.number().int().nonnegative(),
  status: z.enum(["active", "frozen", "closed"]),
  nextExpirationAt: z.iso.datetime().optional(),
  nextExpiringCredits: z.number().int().nonnegative(),
  membershipName: z.string().optional(),
  membershipStatus: z.string().optional(),
});

export const operatorWorkspaceSchema = z.object({
  organization: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    legalName: z.string().optional(),
    plan: z.enum(["coach", "small-club", "club", "multi-venue"]),
    currency: currencySchema,
    timezone: z.string(),
    stripeAccountId: z.string().optional(),
    stripeChargesEnabled: z.boolean(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    locality: z.string().optional(),
    administrativeArea: z.string().optional(),
    postalCode: z.string().optional(),
    countryCode: z.string(),
    googlePlaceId: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    stripeTaxEnabled: z.boolean(),
    taxRegistrationStatus: z.enum([
      "not-configured",
      "pending",
      "active",
      "restricted",
    ]),
  }),
  ratePlans: z.array(operatorRatePlanSchema).readonly(),
  venues: z.array(operatorVenueSchema).readonly(),
  sessions: z.array(operatorSessionSchema).readonly(),
  eventRegistrations: z.array(operatorEventRegistrationSchema).readonly(),
  eventAudiences: z.array(operatorEventAudienceSchema).readonly(),
  participants: z.array(operatorParticipantSchema).readonly(),
  people: z.array(operatorPersonRelationshipSchema).readonly(),
  invitations: z.array(operatorInvitationSchema).readonly(),
  staff: z.array(operatorStaffProfileSchema).readonly(),
  staffInvitations: z.array(operatorStaffInvitationSchema).readonly(),
  catalog: z.array(operatorCatalogItemSchema).readonly(),
  productPerformance: z
    .array(
      z.object({
        catalogItemId: z.string().uuid(),
        paidPurchases: z.number().int().nonnegative(),
        grossBookedMinor: z.number().int().nonnegative(),
        uniqueCustomers: z.number().int().nonnegative(),
        refundedOrders: z.number().int().nonnegative(),
        lastPurchaseAt: z.iso.datetime().optional(),
      }),
    )
    .readonly(),
  inventory: z.array(operatorInventoryItemSchema).readonly(),
  inventoryLocations: z.array(operatorInventoryLocationSchema).readonly(),
  calendar: z.object({
    entries: z.array(operatorCalendarEntrySchema).readonly(),
    connections: z.array(operatorCalendarConnectionSchema).readonly(),
    resourceConflicts: z.number().int().nonnegative(),
  }),
  theme: operatorThemeSchema,
  brandKnowledge: operatorBrandKnowledgeSchema,
  ledger: z.object({
    postedJournalCount: z.number().int().nonnegative(),
    draftJournalCount: z.number().int().nonnegative(),
    lastReconciledAt: z.iso.datetime().optional(),
    reconciliationStatus: z.enum([
      "not-started",
      "matched",
      "drift",
      "investigating",
      "resolved",
    ]),
    creditLiability: z.number().int().nonnegative(),
  }),
  recommendations: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string(),
        action: z.string(),
        href: z.string(),
        tone: z.enum(["growth", "attention", "setup"]),
      }),
    )
    .readonly(),
  messageRecipients: z.array(operatorMessageRecipientSchema).readonly(),
  messageDrafts: z.array(operatorMessageDraftSchema).readonly(),
  marketingFlows: z.array(operatorMarketingFlowSchema).readonly(),
  marketingCampaigns: z.array(operatorMarketingCampaignSchema).readonly(),
  billingRecovery: z.array(operatorBillingRecoverySchema).readonly(),
  organizationDomains: z.array(operatorOrganizationDomainSchema).readonly(),
  communicationSettings: operatorCommunicationSettingsSchema,
  communicationUsage: operatorCommunicationUsageSchema,
  deliveryProviders: z.object({
    email: z.boolean(),
    sms: z.boolean(),
    push: z.boolean(),
  }),
});

const scoringPersonSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  initials: z.string(),
  ratingDisplay: z.number(),
});

export const operatorScorableMatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["scheduled", "live"]),
  scheduledAt: z.iso.datetime().optional(),
  venueName: z.string(),
  courtName: z.string().optional(),
  authoritativeDeviceId: z.string().optional(),
  teamA: z.object({
    id: z.string().uuid(),
    name: z.string(),
    people: z.array(scoringPersonSchema).readonly(),
  }),
  teamB: z.object({
    id: z.string().uuid(),
    name: z.string(),
    people: z.array(scoringPersonSchema).readonly(),
  }),
});

export const operatorMutationResultSchema = z.object({
  id: z.string().uuid(),
  entity: z.enum([
    "rate-plan",
    "venue",
    "court",
    "session",
    "event",
    "message-draft",
    "schedule",
    "schedule-override",
    "player-invitation",
    "staff-invitation",
    "staff-profile",
    "marketing-flow",
    "event-playbook",
    "marketing-campaign",
    "catalog-item",
    "inventory-item",
    "organization-theme",
    "brand-knowledge-source",
    "organization-settings",
    "organization-domain",
    "communication-settings",
    "event-impression",
    "calendar-change",
    "registration",
    "inventory-reservation",
    "credit-adjustment",
    "refund",
  ]),
  status: z.string(),
});

export const playerInvitationSchema = z.object({
  id: z.string().uuid(),
  organizationName: z.string(),
  invitedName: z.string(),
  isMinor: z.boolean(),
  guardianName: z.string().optional(),
  relationship: z.enum(["player", "member"]),
  status: z.enum(["pending", "claimed", "expired", "cancelled"]),
  expiresAt: z.iso.datetime(),
});

export const playerInvitationClaimResultSchema = z.object({
  invitationId: z.string().uuid(),
  organizationId: z.string().uuid(),
  participantPersonId: z.string().uuid(),
  guardianReviewRequired: z.boolean(),
  status: z.literal("claimed"),
});

export const courtScheduleProposalSchema = z.object({
  summary: z.string(),
  blocks: z
    .array(operatorAvailabilityBlockSchema.omit({ id: true }))
    .readonly(),
  assumptions: z.array(z.string()).readonly(),
});

export const stripeOnboardingResultSchema = z.object({
  accountId: z.string(),
  onboardingUrl: z.url(),
  chargesEnabled: z.boolean(),
});

export const stripeAccountReadinessResultSchema = z.object({
  accountId: z.string(),
  chargesEnabled: z.boolean(),
});

export const ticketApprovalSummarySchema = z.object({
  orderId: z.string().uuid(),
  ticketTypeId: z.string().uuid(),
  sessionId: z.string().uuid(),
  eventTitle: z.string(),
  ticketName: z.string(),
  buyerName: z.string(),
  quantity: z.number().int().positive(),
  totalMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  purchasedAt: z.iso.datetime(),
});

export const ticketApprovalResultSchema = z.object({
  orderId: z.string().uuid(),
  ticketTypeId: z.string().uuid(),
  quantity: z.number().int().positive(),
  status: z.literal("issued"),
});

export type OperatorWorkspace = z.infer<typeof operatorWorkspaceSchema>;
export type EventDraftEditor = z.infer<typeof eventDraftEditorSchema>;
export type PublicCatalogItem = z.infer<typeof publicCatalogItemSchema>;
export type PublicOrganizationStorefront = z.infer<
  typeof publicOrganizationStorefrontSchema
>;
export type PublicCoach = z.infer<typeof publicCoachSchema>;
export type OperatorMutationResult = z.infer<
  typeof operatorMutationResultSchema
>;
export type PlayerInvitation = z.infer<typeof playerInvitationSchema>;
export type PlayerInvitationClaimResult = z.infer<
  typeof playerInvitationClaimResultSchema
>;
export type TicketApprovalSummary = z.infer<typeof ticketApprovalSummarySchema>;
export type TicketApprovalResult = z.infer<typeof ticketApprovalResultSchema>;
export type StripeOnboardingResult = z.infer<
  typeof stripeOnboardingResultSchema
>;
export type StripeAccountReadinessResult = z.infer<
  typeof stripeAccountReadinessResultSchema
>;
export const adminQueueSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  age: z.string(),
  sla: z.string(),
  priority: z.string(),
});
export const guardianReviewItemSchema = z.object({
  guardianId: z.string().uuid(),
  guardianName: z.string(),
  minorId: z.string().uuid(),
  minorName: z.string(),
  minorAgeBand: z.enum(["under-13", "teen"]),
  relationship: z.string(),
  emergencyContact: z.boolean(),
  canApproveSpending: z.boolean(),
  status: z.enum(["pending", "verified", "rejected"]),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().optional(),
  reviewReason: z.string().optional(),
  consent: z
    .object({
      granted: z.boolean(),
      method: z.enum([
        "signed-attestation",
        "identity-provider",
        "admin-review",
      ]),
      disclosureVersion: z.string(),
      occurredAt: z.iso.datetime(),
    })
    .optional(),
});
export const guardianReviewResultSchema = z.object({
  guardianId: z.string().uuid(),
  minorId: z.string().uuid(),
  status: z.enum(["verified", "rejected"]),
  reviewedAt: z.iso.datetime(),
});
export type GuardianReviewItem = z.infer<typeof guardianReviewItemSchema>;
export type GuardianReviewResult = z.infer<typeof guardianReviewResultSchema>;
export const adminOverviewSchema = z.object({
  metrics: z.array(metricSchema).readonly(),
  queues: z.array(adminQueueSchema).readonly(),
  audit: z.array(auditEventSchema).readonly(),
  system: z
    .array(
      z.object({
        service: z.string(),
        status: z.string(),
        detail: z.string(),
      }),
    )
    .readonly(),
});
export const adminOrganizationDetailSchema = z.object({
  organization: organizationSummarySchema,
  metrics: z.array(metricSchema).readonly(),
  people: z.array(personSummarySchema).readonly(),
  venues: z.array(venueSummarySchema).readonly(),
  events: z.array(eventSummarySchema).readonly(),
  audit: z.array(auditEventSchema).readonly(),
  commerce: z.object({
    paidOrders: z.number().int().nonnegative(),
    pendingOrders: z.number().int().nonnegative(),
    refundedOrders: z.number().int().nonnegative(),
    grossVolumeMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
});

export const scoreStateSchema = z.object({
  status: z.enum(["not-started", "live", "complete", "forfeit"]),
  sets: z
    .array(
      z.object({
        a: z.number().int().nonnegative(),
        b: z.number().int().nonnegative(),
        winner: z.enum(["A", "B"]).optional(),
      }),
    )
    .readonly(),
  setIndex: z.number().int().nonnegative(),
  setsWon: z.object({ A: z.number().int(), B: z.number().int() }),
  serving: z.enum(["A", "B"]),
  serverPersonId: z.string().uuid().optional(),
  timeouts: z.object({ A: z.number().int(), B: z.number().int() }),
  sideSwitchDue: z.boolean(),
  technicalTimeoutDue: z.boolean(),
  winner: z.enum(["A", "B"]).optional(),
  activeEventCount: z.number().int().nonnegative(),
});
export const scoreEventSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal("match-started"),
    initialServer: z.enum(["A", "B"]),
    initialServerPersonId: z.string().uuid().optional(),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("match-recorded"),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("set-score-recorded"),
    setIndex: z.number().int().nonnegative(),
    a: z.number().int().nonnegative(),
    b: z.number().int().nonnegative(),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("rally-won"),
    winner: z.enum(["A", "B"]),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("timeout"),
    team: z.enum(["A", "B"]),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("technical-timeout-completed"),
    setIndex: z.number().int().nonnegative(),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("undo"),
    targetEventId: z.string().uuid(),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("match-forfeited"),
    winner: z.enum(["A", "B"]),
    occurredAt: z.iso.datetime(),
  }),
]);
export const matchFormatSchema = z.object({
  setsToWin: z.number().int().positive(),
  maximumSets: z.number().int().positive(),
  pointTargets: z.array(z.number().int().positive()).readonly(),
  winBy: z.union([z.literal(1), z.literal(2)]),
  hardCaps: z.array(z.number().int().positive().nullable()).readonly(),
  scoringSystem: z.enum(["rally", "sideout"]),
  sideSwitchIntervals: z.array(z.number().int().nonnegative()).readonly(),
  timeoutsPerTeamPerSet: z.number().int().nonnegative(),
  technicalTimeoutAt: z.number().int().positive().optional(),
  lockedServeOrder: z.boolean(),
  teamSize: z.number().int().min(1).max(6).optional(),
  matchType: z.enum(["competitive", "friendly"]).optional(),
  recordingMode: z.enum(["completed", "live"]).optional(),
  allPlayersAgreedToRecord: z.boolean().optional(),
  serviceOrder: z
    .object({
      A: z.array(z.string().uuid()).readonly(),
      B: z.array(z.string().uuid()).readonly(),
    })
    .readonly()
    .optional(),
  playedAt: z.iso.datetime().optional(),
});
export const matchScoringStateSchema = z.object({
  matchId: z.string().uuid(),
  status: z.enum(["live", "pending-verification", "verified", "disputed"]),
  deviceId: z.string(),
  venueName: z.string(),
  teamA: z.object({
    id: z.string().uuid(),
    name: z.string(),
    people: z.array(scoringPersonSchema).readonly(),
  }),
  teamB: z.object({
    id: z.string().uuid(),
    name: z.string(),
    people: z.array(scoringPersonSchema).readonly(),
  }),
  format: matchFormatSchema,
  events: z.array(scoreEventSchema).readonly(),
  score: scoreStateSchema,
  nextSequence: z.number().int().positive(),
  nextMonotonicCounter: z.number().int().positive(),
  confirmation: z.object({
    confirmedPersonIds: z.array(z.string().uuid()).readonly(),
    disputedPersonIds: z.array(z.string().uuid()).readonly(),
  }),
  reporting: z.object({
    reporters: z
      .array(
        z.object({
          personId: z.string().uuid(),
          displayName: z.string(),
          eventCount: z.number().int().nonnegative(),
          lastReportedAt: z.iso.datetime(),
        }),
      )
      .readonly(),
    lastReporter: z
      .object({
        personId: z.string().uuid(),
        displayName: z.string(),
        reportedAt: z.iso.datetime(),
      })
      .optional(),
  }),
});
export const availableSlotSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  courtId: z.string(),
  coachId: z.string().optional(),
  mode: z.enum([
    "open",
    "private-lessons-only",
    "group-only",
    "league-reserved",
    "rentals-only",
    "members-only",
    "maintenance",
    "blocked",
  ]),
});
const bracketSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("seed"), seed: z.number().int() }),
  z.object({ kind: z.literal("winner"), matchId: z.string() }),
  z.object({ kind: z.literal("loser"), matchId: z.string() }),
  z.object({ kind: z.literal("bye") }),
]);
export const bracketSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  format: z.enum([
    "single-elimination",
    "double-elimination-true-reset",
    "double-elimination-modified",
    "double-elimination-crossover",
    "round-robin",
    "pool-play",
  ]),
  teams: z
    .array(
      z.object({
        id: z.string(),
        seed: z.number().int().positive(),
        name: z.string(),
      }),
    )
    .readonly(),
  matches: z
    .array(
      z.object({
        id: z.string(),
        bracket: z.enum(["winners", "losers", "final", "pool", "consolation"]),
        round: z.number().int().positive(),
        position: z.number().int().positive(),
        sideA: bracketSourceSchema,
        sideB: bracketSourceSchema,
        ifNecessary: z.boolean().optional(),
        label: z.string().optional(),
      }),
    )
    .readonly(),
  rounds: z.number().int().nonnegative(),
  pools: z.record(z.string(), z.array(z.string()).readonly()).optional(),
});
export const tournamentScheduleSchema = z.object({
  feasible: z.boolean(),
  matches: z
    .array(
      z.object({
        matchId: z.string(),
        courtId: z.string(),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
      }),
    )
    .readonly(),
  unscheduledMatchIds: z.array(z.string()).readonly(),
  violations: z.array(z.string()).readonly(),
});
export const agentDraftSchema = z.object({
  id: z.string().uuid(),
  toolName: z.enum([
    "events.search",
    "members.search",
    "reports.summary",
    "leagues.create",
    "bookings.reschedule",
    "payments.refund",
    "wallet.distributePurse",
    "messages.send",
    "events.publish",
    "prices.change",
    "ratings.override",
  ]),
  riskTier: z.enum(["read", "propose", "confirm-always"]),
  input: z.record(z.string(), z.unknown()),
  proposedDiff: z.record(z.string(), z.unknown()),
  inputHash: z.string(),
  actorPersonId: z.string(),
  organizationId: z.string().optional(),
  conversationId: z.string(),
  expiresAt: z.iso.datetime(),
  status: z.enum(["proposed", "confirmed", "expired"]),
  confirmationNonce: z.string().uuid().optional(),
});

export const registrationResultSchema = z.object({
  registrationId: z.string().uuid(),
  status: z.enum(["confirmed", "waitlisted"]),
  spotsRemaining: z.number().int().nonnegative(),
  waitlistPosition: z.number().int().positive().optional(),
});

export const timeRangeResultSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export const courtHoldResultSchema = z.object({
  success: z.boolean(),
  bookingId: z.string().uuid().optional(),
  status: z.enum(["held", "unavailable"]),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  holdExpiresAt: z.iso.datetime().optional(),
  alternatives: z.array(timeRangeResultSchema).readonly(),
});

export const courtBookingInventorySchema = z.object({
  venue: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    city: z.string(),
    region: z.string(),
    timezone: z.string(),
    organizationName: z.string(),
    paymentsReady: z.boolean(),
    capacity: z.number().int().nonnegative(),
    heroImageUrl: z.string().optional(),
    heroImageTreatmentUrl: z.string().optional(),
    amenities: z.array(z.string()).readonly(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }),
  courts: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        surface: z.string(),
        lit: z.boolean(),
        capacity: z.number().int().positive(),
        bookingPolicy: z.string(),
        minimumDurationMinutes: z.number().int().positive(),
        maximumDurationMinutes: z.number().int().positive(),
        durationOptionsMinutes: z
          .array(z.number().int().positive())
          .min(1)
          .readonly(),
        bookingIncrementMinutes: z.number().int().positive(),
        minimumNoticeMinutes: z.number().int().nonnegative(),
        maximumAdvanceDays: z.number().int().positive(),
        cancellationPolicy: courtCancellationPolicySchema,
        pricing: z
          .object({
            name: z.string(),
            currency: currencySchema,
            baseAmountMinor: z.number().int().nonnegative(),
            memberAmountMinor: z.number().int().nonnegative().optional(),
            nonMemberAmountMinor: z.number().int().nonnegative().optional(),
            rateUnitMinutes: z.number().int().positive(),
          })
          .optional(),
      }),
    )
    .readonly(),
});

export const courtAvailabilitySlotSchema = z.object({
  courtId: z.string().uuid(),
  courtName: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  localStartsAt: z.string(),
  localEndsAt: z.string(),
  durationMinutes: z.number().int().positive(),
  price: moneySchema.optional(),
  daylightStatus: z.enum([
    "daylight",
    "before-sunrise",
    "crosses-sunrise",
    "crosses-sunset",
    "after-dark",
    "unknown",
  ]),
  weather: weatherForecastPointSchema.optional(),
});

export const courtAvailabilitySchema = z.object({
  venueId: z.string().uuid(),
  date: z.iso.date(),
  durationMinutes: z.number().int().positive(),
  timezone: z.string(),
  generatedAt: z.iso.datetime(),
  forecast: weatherForecastSchema.optional(),
  excludedAfterDarkCount: z.number().int().nonnegative(),
  slots: z.array(courtAvailabilitySlotSchema).readonly(),
});

export const courtBookingParticipantSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid().optional(),
  displayName: z.string(),
  role: z.string(),
  status: z.enum([
    "organizer",
    "invited",
    "accepted",
    "payment-pending",
    "paid",
    "declined",
    "cancelled",
  ]),
  shareAmountMinor: z.number().int().nonnegative(),
  inviteToken: z.string().optional(),
});

export const courtCheckoutResultSchema = z.object({
  mode: z.enum(["free", "stripe", "unavailable"]),
  bookingId: z.string().uuid().optional(),
  bookingStatus: z.enum(["held", "confirmed", "unavailable"]),
  paymentMode: z.enum(["full", "split"]).optional(),
  checkoutSessionId: z.string().optional(),
  checkoutUrl: z.url().optional(),
  expiresAt: z.iso.datetime().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  alternatives: z.array(timeRangeResultSchema).readonly(),
  pricing: z
    .object({
      subtotalMinor: z.number().int().nonnegative(),
      feeTotalMinor: z.number().int().nonnegative(),
      totalMinor: z.number().int().nonnegative(),
      payNowMinor: z.number().int().nonnegative(),
      currency: currencySchema,
      rateUnitMinutes: z.number().int().positive(),
    })
    .optional(),
  policy: courtCancellationPolicySchema.optional(),
  participants: z.array(courtBookingParticipantSchema).readonly().optional(),
});

export const courtCheckoutStatusSchema = z.object({
  bookingId: z.string().uuid(),
  bookingStatus: z.enum([
    "held",
    "confirmed",
    "cancelled",
    "expired",
    "completed",
    "refunded",
  ]),
  orderStatus: z
    .enum([
      "draft",
      "pending",
      "paid",
      "partially-refunded",
      "refunded",
      "failed",
      "disputed",
      "cancelled",
    ])
    .optional(),
  complete: z.boolean(),
  sharePaid: z.boolean(),
  awaitingParticipants: z.boolean(),
  fundedAmountMinor: z.number().int().nonnegative().optional(),
  totalAmountMinor: z.number().int().nonnegative().optional(),
  paymentMode: z.enum(["full", "split"]).optional(),
  participants: z.array(courtBookingParticipantSchema).readonly().optional(),
});

export const catalogCheckoutResultSchema = z.object({
  mode: z.enum([
    "stripe",
    "organization-credit",
    "cash-reservation",
    "free",
    "unavailable",
  ]),
  orderId: z.string().uuid(),
  orderStatus: z.enum(["pending", "paid"]),
  checkoutSessionId: z.string().optional(),
  checkoutUrl: z.url().optional(),
  expiresAt: z.iso.datetime().optional(),
  paymentMethod: z.enum(["card", "credit", "cash"]),
  quantity: z.number().int().positive(),
  amountMinor: z.number().int().nonnegative(),
  creditsApplied: z.number().int().nonnegative(),
  currency: currencySchema,
});

export const catalogCheckoutStatusSchema = z.object({
  orderId: z.string().uuid(),
  orderStatus: z.enum([
    "draft",
    "pending",
    "paid",
    "partially-refunded",
    "refunded",
    "failed",
    "disputed",
    "cancelled",
  ]),
  fulfillmentStatus: z
    .enum(["held", "pending", "ready", "fulfilled", "cancelled", "refunded"])
    .optional(),
  complete: z.boolean(),
});

export const catalogOfferEligibilitySchema = z.object({
  isMember: z.boolean(),
  included: z.boolean(),
  remainingBookings: z.number().int().nonnegative().optional(),
});

export const availabilityAlertResultSchema = z.object({
  alertId: z.string().uuid().optional(),
  created: z.boolean(),
  status: z.enum(["active", "matched", "paused", "expired", "cancelled"]),
  freeAlertsRemaining: z.number().int().nonnegative(),
  premiumRequired: z.boolean(),
});

export const courtBookingInviteSummarySchema = z.object({
  bookingId: z.string().uuid(),
  inviteToken: z.string(),
  venueName: z.string(),
  courtName: z.string(),
  organizerName: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string(),
  bookingStatus: z.enum([
    "held",
    "confirmed",
    "cancelled",
    "expired",
    "refunded",
  ]),
  participant: courtBookingParticipantSchema,
  policy: courtCancellationPolicySchema,
  currency: currencySchema,
  available: z.boolean(),
});

export type CourtBookingInventory = z.infer<typeof courtBookingInventorySchema>;
export type CourtAvailability = z.infer<typeof courtAvailabilitySchema>;
export type WeatherForecast = z.infer<typeof weatherForecastSchema>;
export type WeatherForecastDay = z.infer<typeof weatherForecastDaySchema>;
export type WeatherForecastPoint = z.infer<typeof weatherForecastPointSchema>;
export type CourtCheckoutResult = z.infer<typeof courtCheckoutResultSchema>;
export type CourtCheckoutStatus = z.infer<typeof courtCheckoutStatusSchema>;
export type CourtCancellationPolicy = z.infer<
  typeof courtCancellationPolicySchema
>;

export const ticketScanResultSchema = z.object({
  scanEventId: z.string().uuid(),
  ticketId: z.string().uuid(),
  accepted: z.boolean(),
  duplicate: z.boolean(),
  reason: z
    .enum(["not-issued", "already-scanned", "void", "refunded"])
    .optional(),
  ticketStatus: z.enum([
    "held",
    "issued",
    "transferred",
    "scanned",
    "void",
    "refunded",
  ]),
});

export const formSubmissionResultSchema = z.object({
  responseId: z.string().uuid(),
  formId: z.string().uuid(),
  formVersion: z.number().int().positive(),
  subjectPersonId: z.string().uuid(),
  signed: z.boolean(),
  signedAt: z.iso.datetime().optional(),
  documentTextHash: z.string().optional(),
});

export const consentRecordResultSchema = z.object({
  consentId: z.string().uuid(),
  personId: z.string().uuid(),
  scope: z.enum([
    "transactional",
    "marketing-email",
    "marketing-sms",
    "marketing-push",
  ]),
  granted: z.boolean(),
  disclosureTextHash: z.string(),
  occurredAt: z.iso.datetime(),
});

export const eventCheckoutResultSchema = z.object({
  mode: z.enum(["free", "stripe", "waitlist", "already-registered"]),
  orderId: z.string().uuid().optional(),
  registrationId: z.string().uuid().optional(),
  registrationStatus: z.enum(["confirmed", "waitlisted", "pending"]).optional(),
  fulfillmentStatus: z.enum(["confirmed", "pending-approval"]).optional(),
  teamClaimToken: z.string().min(16).max(128).optional(),
  checkoutSessionId: z.string().optional(),
  checkoutUrl: z.url().optional(),
  expiresAt: z.iso.datetime().optional(),
  pricing: z.object({
    subtotalMinor: z.number().int().nonnegative(),
    feeTotalMinor: z.number().int().nonnegative(),
    totalMinor: z.number().int().nonnegative(),
    currency: currencySchema,
  }),
});

export const eventCheckoutStatusSchema = z.object({
  orderId: z.string().uuid(),
  orderStatus: z.enum([
    "draft",
    "pending",
    "paid",
    "partially-refunded",
    "refunded",
    "failed",
    "disputed",
    "cancelled",
  ]),
  registrationStatus: z
    .enum([
      "pending",
      "confirmed",
      "waitlisted",
      "cancelled",
      "refunded",
      "checked-in",
    ])
    .optional(),
  fulfillmentStatus: z.enum(["confirmed", "pending-approval"]).optional(),
  complete: z.boolean(),
});

export const teamClaimSummarySchema = z.object({
  eventTitle: z.string(),
  eventSlug: z.string(),
  divisionName: z.string(),
  captainName: z.string(),
  expectedTeamSize: z.number().int().min(2).max(6),
  claimedPlayers: z.number().int().min(1).max(6),
  paymentMode: z.enum(["self", "team"]),
  status: z.enum(["assembling", "ready", "confirmed", "cancelled", "expired"]),
  expiresAt: z.iso.datetime(),
  alreadyClaimed: z.boolean(),
  paymentRequired: z.boolean(),
  roster: z
    .array(
      z.object({
        displayName: z.string(),
        status: z.enum(["captain", "selected", "invited", "claimed"]),
      }),
    )
    .readonly(),
});

export const featureFlagSummarySchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(2).max(96),
  enabled: z.boolean(),
  organizationId: z.string().uuid().optional(),
  organizationName: z.string().optional(),
  market: z.string().optional(),
  configuration: z.record(z.string(), z.unknown()).readonly(),
  updatedAt: z.iso.datetime(),
  updatedByName: z.string().optional(),
});

export const featureFlagCollectionSchema = z.object({
  flags: z.array(featureFlagSummarySchema).readonly(),
  canManage: z.boolean(),
});

export type FeatureFlagSummary = z.infer<typeof featureFlagSummarySchema>;
export type FeatureFlagCollection = z.infer<typeof featureFlagCollectionSchema>;
export type VideoSummary = z.infer<typeof videoSummarySchema>;
export type VideoStudio = z.infer<typeof videoStudioSchema>;
export type VideoUsage = z.infer<typeof videoUsageSchema>;
export type VideoPlayback = z.infer<typeof videoPlaybackSchema>;
export type VideoMetrics = z.infer<typeof videoMetricsSchema>;
export type VisionSession = z.infer<typeof visionSessionSchema>;
export type VisionSessionSettings = z.infer<typeof visionSessionSettingsSchema>;
export type VisionTimelineEvent = z.infer<typeof visionTimelineEventSchema>;
export type VisionScoreSnapshot = z.infer<typeof visionScoreSnapshotSchema>;
export type HealthCategory = z.infer<typeof healthCategorySchema>;
export type HealthMetric = z.infer<typeof healthMetricSchema>;
export type HealthSampleInput = z.infer<typeof healthSampleInputSchema>;
export type HealthTimelineEntry = z.infer<typeof healthTimelineEntrySchema>;
export type HealthSharingScope = z.infer<typeof healthSharingScopeSchema>;
export type HealthSharingCandidate = z.infer<
  typeof healthSharingCandidateSchema
>;
export type HealthSharingGrant = z.infer<typeof healthSharingGrantSchema>;
export type HealthProfile = z.infer<typeof healthProfileSchema>;
export type HealthDashboard = z.infer<typeof healthDashboardSchema>;
export type HealthVideoOverlay = z.infer<typeof healthVideoOverlaySchema>;
export type HealthCorrelation = z.infer<typeof healthCorrelationSchema>;
export type AdminVideoOverview = z.infer<typeof adminVideoOverviewSchema>;
export type DunaPlusGrant = z.infer<typeof dunaPlusGrantSchema>;
