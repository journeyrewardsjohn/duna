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
  discipline: z.enum(["beach-2s", "beach-4s", "beach-6s", "grass", "indoor"]),
  ratingBasis: z.string(),
  price: moneySchema,
  spotsRemaining: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
});
export const eventSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  kind: eventKindSchema,
  organizationName: z.string(),
  venueName: z.string(),
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
  live: z.boolean().optional(),
  imageUrl: z.string().optional(),
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
  teamA: z.array(personSummarySchema).readonly(),
  teamB: z.array(personSummarySchema).readonly(),
  score: z
    .array(z.tuple([z.number().int(), z.number().int()]).readonly())
    .readonly(),
  winner: z.enum(["A", "B"]),
  ratingDelta: z.number(),
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

export const operatorRatePlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  currency: currencySchema,
  baseAmountMinor: z.number().int().nonnegative(),
  memberAmountMinor: z.number().int().nonnegative().optional(),
  nonMemberAmountMinor: z.number().int().nonnegative().optional(),
  rateUnitMinutes: z.number().int().positive(),
});

export const operatorCourtSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  name: z.string(),
  surface: z.string(),
  lit: z.boolean(),
  status: z.enum(["draft", "active", "maintenance", "seasonal", "closed"]),
  bookingPolicy: z.enum(["public", "members", "tiers", "staff", "none"]),
  ratePlanId: z.string().uuid().optional(),
  minimumDurationMinutes: z.number().int().positive(),
  maximumDurationMinutes: z.number().int().positive(),
  bufferBeforeMinutes: z.number().int().nonnegative(),
  bufferAfterMinutes: z.number().int().nonnegative(),
  minimumNoticeMinutes: z.number().int().nonnegative(),
  maximumAdvanceDays: z.number().int().positive(),
});

export const operatorVenueSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "active", "maintenance", "seasonal", "closed"]),
  temporary: z.boolean(),
  addressLine1: z.string().optional(),
  locality: z.string().optional(),
  administrativeArea: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string(),
  timezone: z.string(),
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
  courtId: z.string().uuid().optional(),
  priceMinor: z.number().int().nonnegative(),
  currency: currencySchema,
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

export const operatorWorkspaceSchema = z.object({
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    plan: z.enum(["coach", "small-club", "club", "multi-venue"]),
    currency: currencySchema,
    timezone: z.string(),
    stripeAccountId: z.string().optional(),
    stripeChargesEnabled: z.boolean(),
  }),
  ratePlans: z.array(operatorRatePlanSchema).readonly(),
  venues: z.array(operatorVenueSchema).readonly(),
  sessions: z.array(operatorSessionSchema).readonly(),
  messageRecipients: z.array(operatorMessageRecipientSchema).readonly(),
  messageDrafts: z.array(operatorMessageDraftSchema).readonly(),
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
  entity: z.enum(["rate-plan", "venue", "court", "session", "message-draft"]),
  status: z.string(),
});

export const stripeOnboardingResultSchema = z.object({
  accountId: z.string(),
  onboardingUrl: z.url(),
  chargesEnabled: z.boolean(),
});

export type OperatorWorkspace = z.infer<typeof operatorWorkspaceSchema>;
export type OperatorMutationResult = z.infer<
  typeof operatorMutationResultSchema
>;
export type StripeOnboardingResult = z.infer<
  typeof stripeOnboardingResultSchema
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
    city: z.string(),
    region: z.string(),
    timezone: z.string(),
    organizationName: z.string(),
    paymentsReady: z.boolean(),
  }),
  courts: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        surface: z.string(),
        lit: z.boolean(),
        bookingPolicy: z.string(),
        minimumDurationMinutes: z.number().int().positive(),
        maximumDurationMinutes: z.number().int().positive(),
        minimumNoticeMinutes: z.number().int().nonnegative(),
        maximumAdvanceDays: z.number().int().positive(),
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

export const courtCheckoutResultSchema = z.object({
  mode: z.enum(["free", "stripe", "unavailable"]),
  bookingId: z.string().uuid().optional(),
  bookingStatus: z.enum(["held", "confirmed", "unavailable"]),
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
      currency: currencySchema,
      rateUnitMinutes: z.number().int().positive(),
    })
    .optional(),
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
});

export type CourtBookingInventory = z.infer<typeof courtBookingInventorySchema>;
export type CourtCheckoutResult = z.infer<typeof courtCheckoutResultSchema>;
export type CourtCheckoutStatus = z.infer<typeof courtCheckoutStatusSchema>;

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
  complete: z.boolean(),
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
