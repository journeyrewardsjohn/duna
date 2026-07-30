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
export const eventSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  kind: eventKindSchema,
  organizationName: z.string(),
  venueName: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string(),
  price: moneySchema,
  spotsRemaining: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  ratingRange: z.tuple([z.number(), z.number()]).readonly().optional(),
  live: z.boolean().optional(),
  imageUrl: z.string().optional(),
  tags: z.array(z.string()).readonly(),
});
export const matchSummarySchema = z.object({
  id: z.string(),
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
export const adminQueueSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  age: z.string(),
  sla: z.string(),
  priority: z.string(),
});
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
