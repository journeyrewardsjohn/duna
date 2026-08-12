import {
  auditLog,
  communicationUsagePeriods,
  consents,
  courtBookings,
  courts,
  divisions,
  eventBlueprints,
  eventImpressions,
  eventTypes,
  getDatabase,
  guardianships,
  marketingCampaigns,
  marketingFlows,
  memberships,
  membershipTiers,
  messages,
  organizationCommunicationSettings,
  organizationDomains,
  organizationInvitations,
  organizationMemberships,
  organizationParticipants,
  organizationStaffInvitations,
  organizationStaffProfiles,
  organizations,
  people,
  programs,
  ratePlans,
  registrations,
  scheduleBlocks,
  scheduleOverrides,
  schedules,
  sessions,
  ticketTypes,
  tickets,
  venues,
} from "@duna/db";
import { demoOrganization } from "@duna/core/demo";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  eventDraftSmartRulesSchema,
  eventFeatureSchema,
  eventLocationSchema,
  eventMediaSchema,
  eventPolicySchema,
  leagueRecurrenceSchema,
} from "./contracts";
import {
  loadDemoCommerceWorkspace,
  loadOperatorCommerceWorkspace,
} from "./catalog-service";
import type {
  EventDraftEditor,
  OperatorMutationResult,
  OperatorWorkspace,
  PlayerInvitation,
  PlayerInvitationClaimResult,
  StripeAccountReadinessResult,
  StripeOnboardingResult,
} from "./contracts";
import type { ApiActor } from "./context";
import { requireActiveMembershipOffer } from "./organization-membership-policy";
import { resolveOrganizationCommissionPolicy } from "./organization-billing";
import {
  normalizeCourtCancellationPolicy,
  venueWallTimeToUtc,
} from "./court-checkout";
import { enforceGuardianCopies } from "./messaging";
import {
  createConnectOnboarding,
  retrieveConnectAccountReadiness,
} from "./payments";
import { isResendConfigured, sendTransactionalEmail } from "./resend";
import { isSentConfigured, sendTemplateSms } from "./sent";
import { loadWeatherForecast, resolveWeatherCoordinates } from "./weather";

type CurrencyCode = OperatorWorkspace["organization"]["currency"];
type EventKind = OperatorWorkspace["sessions"][number]["kind"];

export interface EventDraftDivisionInput {
  readonly name: string;
  readonly description?: string;
  readonly minimumTeams: number;
  readonly maximumTeams: number;
  readonly teamFormat:
    "solo" | "doubles" | "three-person" | "four-person" | "six-person";
  readonly surface: "sand" | "grass" | "water" | "indoor-sand";
  readonly gender: "mens" | "womens" | "coed" | "open";
  readonly priceBasis: "per-person" | "per-team";
  readonly priceMinor: number;
  readonly ratingEnabled: boolean;
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
  readonly ageEnabled: boolean;
  readonly ageMinimum?: number;
  readonly ageMaximum?: number;
  readonly tournamentFormat:
    | "kob-qob"
    | "single-elimination"
    | "double-elimination-true"
    | "double-elimination-crossover";
  readonly poolPlay: {
    readonly enabled: boolean;
    readonly teamsPerPool: number;
    readonly format: "full" | "olympic-crossover";
    readonly teamsAdvancing: number;
  };
  readonly seeding:
    | "first-come"
    | "sand-rating-score"
    | "sand-rating-best-8"
    | "sand-rating-ttm"
    | "manual";
}

export interface EventDraftTicketInput {
  readonly name: string;
  readonly description?: string;
  readonly priceMinor: number;
  readonly quantity?: number;
  readonly waitlistEnabled: boolean;
  readonly approvalRequired: boolean;
  readonly availableOnline: boolean;
  readonly availableInPerson: boolean;
}

export interface CreateEventDraftInput {
  readonly actor: ApiActor;
  readonly title: string;
  readonly shortSummary?: string;
  readonly description?: string;
  readonly kind: "tournament" | "league";
  readonly media: readonly {
    readonly id: string;
    readonly kind: "image" | "video";
    readonly url: string;
    readonly alt?: string;
    readonly posterUrl?: string;
  }[];
  readonly location: {
    readonly mode: "venue" | "address" | "online";
    readonly venueId?: string;
    readonly venueName: string;
    readonly address?: string;
    readonly googlePlaceId?: string;
    readonly latitude?: number;
    readonly longitude?: number;
    readonly onlineUrl?: string;
    readonly courtIds: readonly string[];
    readonly courtNames: readonly string[];
  };
  readonly timezone: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly divisions: readonly EventDraftDivisionInput[];
  readonly tickets: readonly EventDraftTicketInput[];
  readonly features: readonly {
    readonly id: string;
    readonly kind: "guest" | "activity" | "sponsor";
    readonly title: string;
    readonly description?: string;
    readonly personId?: string;
    readonly personHandle?: string;
    readonly personInitials?: string;
    readonly imageUrl?: string;
  }[];
  readonly policies: readonly {
    readonly id: string;
    readonly kind: "policy" | "waiver";
    readonly title: string;
    readonly markdown: string;
    readonly required: boolean;
    readonly requireFullScroll: boolean;
  }[];
  readonly smartRules: {
    readonly waitlistEnabled: boolean;
    readonly allowLateCancellation: boolean;
    readonly freeCancellationHours: number;
    readonly bookingOpensDays: number;
    readonly bookingClosesMinutes: number;
    readonly autoCancelLowAttendance: boolean;
    readonly minimumAttendance: number;
    readonly approvalRequired: boolean;
  };
  readonly recurrence?: {
    readonly interval: "weekly" | "biweekly";
    readonly days: readonly {
      readonly day:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday";
      readonly startsAt: string;
      readonly endsAt: string;
    }[];
    readonly substitutesAllowed: boolean;
    readonly substituteApprovalRequired: boolean;
    readonly teamAssignment: "signup" | "rating-balanced" | "manual";
  };
  readonly confirmedPrice: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}

export interface UpdateEventDraftInput extends CreateEventDraftInput {
  readonly sessionId: string;
}

export class OperatorServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "ORGANIZATION_NOT_FOUND"
      | "RESOURCE_NOT_FOUND"
      | "RESOURCE_WRONG_ORGANIZATION"
      | "INVALID_TIMEZONE"
      | "INVALID_SCHEDULE"
      | "INVALID_CONFIGURATION"
      | "PRICE_CONFIRMATION_REQUIRED"
      | "PUBLISH_CONFIRMATION_REQUIRED"
      | "PAYMENTS_NOT_READY"
      | "RECIPIENT_NOT_FOUND"
      | "RECIPIENT_NOT_ELIGIBLE"
      | "CONSENT_REQUIRED"
      | "DELIVERY_DESTINATION_MISSING"
      | "INVITATION_NOT_FOUND"
      | "INVITATION_EXPIRED"
      | "INVITATION_ALREADY_CLAIMED",
    message: string,
  ) {
    super(message);
    this.name = "OperatorServiceError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new OperatorServiceError(
      "DATABASE_REQUIRED",
      "Operator changes require the connected Duna database.",
    );
  }
}

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "An organization context is required.",
    );
  }
  return actor.organizationId;
}

function plan(value: string): OperatorWorkspace["organization"]["plan"] {
  if (
    value === "coach" ||
    value === "small-club" ||
    value === "club" ||
    value === "multi-venue"
  ) {
    return value;
  }
  return "coach";
}

function organizationDomainKind(
  value: string,
): OperatorWorkspace["organizationDomains"][number]["kind"] {
  if (value === "custom" || value === "purchased") return value;
  return "duna-subdomain";
}

function organizationDomainStatus(
  value: string,
): OperatorWorkspace["organizationDomains"][number]["status"] {
  if (
    value === "verifying" ||
    value === "active" ||
    value === "failed" ||
    value === "disabled"
  ) {
    return value;
  }
  return "pending";
}

function emailDomainStatus(
  value: string | undefined,
): OperatorWorkspace["communicationSettings"]["emailDomainStatus"] {
  if (value === "pending" || value === "verified" || value === "failed") {
    return value;
  }
  return "not-configured";
}

function messagingAddonStatus(
  value: string | undefined,
): OperatorWorkspace["communicationSettings"]["messagingAddonStatus"] {
  if (
    value === "trialing" ||
    value === "active" ||
    value === "past-due" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "disabled";
}

function currency(value: string): CurrencyCode {
  if (
    value === "USD" ||
    value === "CAD" ||
    value === "AUD" ||
    value === "BRL" ||
    value === "EUR"
  ) {
    return value;
  }
  throw new OperatorServiceError(
    "INVALID_CONFIGURATION",
    `Unsupported organization currency: ${value}.`,
  );
}

function teamSize(format: EventDraftDivisionInput["teamFormat"]): number {
  switch (format) {
    case "solo":
      return 1;
    case "doubles":
      return 2;
    case "three-person":
      return 3;
    case "four-person":
      return 4;
    case "six-person":
      return 6;
  }
}

function divisionDiscipline(
  division: EventDraftDivisionInput,
): "beach-2s" | "beach-4s" | "beach-6s" | "grass" | "indoor" {
  if (division.surface === "grass") return "grass";
  if (division.surface === "indoor-sand") return "indoor";
  const size = teamSize(division.teamFormat);
  if (size >= 6) return "beach-6s";
  if (size >= 3) return "beach-4s";
  return "beach-2s";
}

function timeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    throw new OperatorServiceError(
      "INVALID_TIMEZONE",
      "Choose a valid IANA timezone.",
    );
  }
}

function venueLocalDateTime(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function settingChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && choices.includes(value)
    ? (value as T[number])
    : fallback;
}

function settingNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function slugBase(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/(^-|-$)/g, "")
      .slice(0, 70) || "duna"
  );
}

async function uniqueVenueSlug(
  organizationId: string,
  value: string,
): Promise<string> {
  const database = getDatabase();
  const base = slugBase(value).slice(0, 56);
  const existing = await database.query.venues.findFirst({
    where: and(
      eq(venues.organizationId, organizationId),
      eq(venues.slug, base),
    ),
  });
  return existing ? `${base}-${crypto.randomUUID().slice(0, 7)}` : base;
}

async function uniqueSessionSlug(value: string): Promise<string> {
  const database = getDatabase();
  const base = slugBase(value).slice(0, 78);
  const existing = await database.query.sessions.findFirst({
    where: eq(sessions.slug, base),
  });
  return existing ? `${base}-${crypto.randomUUID().slice(0, 8)}` : base;
}

async function uniquePersonHandle(value: string): Promise<string> {
  const database = getDatabase();
  const base = (slugBase(value) || "player").slice(0, 38);
  const existing = await database.query.people.findFirst({
    where: eq(people.handle, base),
  });
  return existing ? `${base}-${crypto.randomUUID().slice(0, 7)}` : base;
}

function playerInvitationUrl(inviteToken: string): string {
  const origin =
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://duna.coach";
  return `${origin.replace(/\/$/, "")}/join/organization/${encodeURIComponent(inviteToken)}`;
}

function staffInvitationUrl(inviteToken: string): string {
  const origin =
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://duna.coach";
  return `${origin.replace(/\/$/, "")}/join/team/${encodeURIComponent(inviteToken)}`;
}

async function organizationRow(organizationId: string) {
  const organization = await getDatabase().query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) {
    throw new OperatorServiceError(
      "ORGANIZATION_NOT_FOUND",
      "Organization was not found.",
    );
  }
  return organization;
}

function providerReadiness() {
  return {
    email: isResendConfigured(),
    sms:
      isSentConfigured() ||
      Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER,
      ),
    push: Boolean(process.env.EXPO_ACCESS_TOKEN),
  };
}

export function loadDemoOperatorWorkspace(
  organizationId: string,
): OperatorWorkspace {
  if (organizationId !== demoOrganization.id) {
    throw new OperatorServiceError(
      "ORGANIZATION_NOT_FOUND",
      "Demo organization was not found.",
    );
  }
  const commerce = loadDemoCommerceWorkspace();
  const venueId = "10000000-0000-4000-8000-000000000101";
  const ratePlanId = "10000000-0000-4000-8000-000000000102";
  const courtOneId = "10000000-0000-4000-8000-000000000103";
  const courtTwoId = "10000000-0000-4000-8000-000000000104";
  const nextSession = new Date();
  nextSession.setDate(nextSession.getDate() + 1);
  nextSession.setHours(18, 0, 0, 0);
  const nextSessionEnd = new Date(nextSession.getTime() + 90 * 60_000);
  const completedSession = new Date();
  completedSession.setDate(completedSession.getDate() - 2);
  completedSession.setHours(17, 30, 0, 0);
  const completedSessionEnd = new Date(
    completedSession.getTime() + 90 * 60_000,
  );
  const cancelledSession = new Date();
  cancelledSession.setDate(cancelledSession.getDate() - 9);
  cancelledSession.setHours(9, 0, 0, 0);
  const cancelledSessionEnd = new Date(
    cancelledSession.getTime() + 3 * 60 * 60_000,
  );
  const demoSessionIds = {
    upcoming: "10000000-0000-4000-8000-000000000301",
    completed: "10000000-0000-4000-8000-000000000302",
    cancelled: "10000000-0000-4000-8000-000000000303",
  } as const;
  const demoPersonIds = {
    maya: "10000000-0000-4000-8000-000000000201",
    jordan: "10000000-0000-4000-8000-000000000202",
    ava: "10000000-0000-4000-8000-000000000203",
    elena: "10000000-0000-4000-8000-000000000204",
    noah: "10000000-0000-4000-8000-000000000205",
  } as const;
  const joinedAt = new Date(Date.now() - 180 * 24 * 60 * 60_000);
  const purchaseAt = new Date(Date.now() - 21 * 24 * 60 * 60_000);
  const peopleWorkspace: OperatorWorkspace["people"] = [
    {
      personId: demoPersonIds.maya,
      displayName: "Maya Chen",
      email: "maya@example.com",
      phoneE164: "+13105550121",
      isMinor: false,
      roles: ["player"],
      status: "active",
      membershipStatus: "active",
      membershipName: "Performance membership",
      creditBalance: 8,
      lifetimeSpendMinor: 148_500,
      purchaseCount: 12,
      recentPurchases: [
        {
          orderId: "10000000-0000-4000-8000-000000000501",
          description: "Performance membership",
          amountMinor: 18_500,
          currency: "USD",
          status: "paid",
          purchasedAt: purchaseAt.toISOString(),
        },
      ],
      upcomingCount: 1,
      churnRisk: {
        score: 18,
        level: "low",
        reasons: ["Active this week", "Upcoming session booked"],
        lastActivityAt: completedSession.toISOString(),
        daysSinceActivity: 2,
        model: "activity-v1",
      },
      joinedAt: joinedAt.toISOString(),
    },
    {
      personId: demoPersonIds.jordan,
      displayName: "Jordan Smith",
      email: "jordan@example.com",
      phoneE164: "+13105550122",
      isMinor: false,
      roles: ["player"],
      status: "active",
      membershipStatus: "past-due",
      membershipName: "Club unlimited",
      creditBalance: 0,
      lifetimeSpendMinor: 96_000,
      purchaseCount: 8,
      recentPurchases: [],
      upcomingCount: 1,
      churnRisk: {
        score: 61,
        level: "watch",
        reasons: ["Membership payment needs attention", "Recent no-show"],
        lastActivityAt: completedSession.toISOString(),
        daysSinceActivity: 2,
        model: "activity-v1",
      },
      joinedAt: joinedAt.toISOString(),
    },
    {
      personId: demoPersonIds.ava,
      displayName: "Ava Patel",
      email: "elena@example.com",
      isMinor: true,
      roles: ["player"],
      status: "active",
      creditBalance: 3,
      lifetimeSpendMinor: 42_000,
      purchaseCount: 5,
      recentPurchases: [],
      upcomingCount: 1,
      churnRisk: {
        score: 33,
        level: "low",
        reasons: ["Guardian verified", "Upcoming clinic booked"],
        lastActivityAt: completedSession.toISOString(),
        daysSinceActivity: 2,
        model: "activity-v1",
      },
      joinedAt: joinedAt.toISOString(),
    },
    {
      personId: demoPersonIds.elena,
      displayName: "Elena Patel",
      email: "elena@example.com",
      phoneE164: "+13105550124",
      isMinor: false,
      roles: ["guardian"],
      status: "active",
      creditBalance: 0,
      lifetimeSpendMinor: 42_000,
      purchaseCount: 5,
      recentPurchases: [],
      upcomingCount: 1,
      churnRisk: {
        score: 25,
        level: "low",
        reasons: ["Household has an upcoming clinic"],
        lastActivityAt: purchaseAt.toISOString(),
        daysSinceActivity: 21,
        model: "activity-v1",
      },
      joinedAt: joinedAt.toISOString(),
    },
    {
      personId: demoPersonIds.noah,
      displayName: "Noah Martinez",
      email: "noah@example.com",
      phoneE164: "+13105550125",
      isMinor: false,
      roles: ["player"],
      status: "active",
      membershipStatus: "cancelled",
      membershipName: "Training 4-pack",
      creditBalance: 0,
      lifetimeSpendMinor: 58_000,
      purchaseCount: 6,
      recentPurchases: [],
      upcomingCount: 0,
      churnRisk: {
        score: 84,
        level: "high",
        reasons: ["No upcoming activity", "Plan ended", "45 days quiet"],
        lastActivityAt: new Date(
          Date.now() - 45 * 24 * 60 * 60_000,
        ).toISOString(),
        daysSinceActivity: 45,
        model: "activity-v1",
      },
      joinedAt: joinedAt.toISOString(),
    },
  ];
  const schedule = (courtOffset: number) =>
    Array.from({ length: 7 }, (_, weekday) => ({
      id: `10000000-0000-4000-8000-${String(
        200 + courtOffset * 10 + weekday,
      ).padStart(12, "0")}`,
      weekday,
      startsAtMinute: weekday === 0 || weekday === 6 ? 480 : 420,
      endsAtMinute: weekday === 0 || weekday === 6 ? 1_200 : 1_320,
      mode: "open" as const,
    }));
  return {
    organization: {
      id: demoOrganization.id,
      name: demoOrganization.name,
      slug: "beach-elite-vb-academy",
      plan: plan(demoOrganization.plan),
      effectivePlan: "club",
      planSubscriptionStatus: "active",
      planBillingInterval: "month",
      planCancelAtPeriodEnd: false,
      billingPortalAvailable: false,
      commission: {
        organizationId: demoOrganization.id,
        configuredPlan: "club",
        effectivePlan: "club",
        subscriptionStatus: "active",
        defaultRateBps: 0,
        rateBps: 0,
        source: "plan-default",
        stripeSyncStatus: "synced",
      },
      currency: "USD",
      timezone: demoOrganization.timezone,
      stripeChargesEnabled: false,
      countryCode: "US",
      stripeTaxEnabled: false,
      taxRegistrationStatus: "not-configured",
    },
    ratePlans: [
      {
        id: ratePlanId,
        name: "Standard court time",
        currency: "USD",
        baseAmountMinor: 6_000,
        memberAmountMinor: 4_800,
        nonMemberAmountMinor: 6_000,
        rateUnitMinutes: 60,
      },
    ],
    venues: [
      {
        id: venueId,
        name: "Beach Elite Training Center",
        description:
          "Two purpose-built sand courts for training, rentals, and competition.",
        slug: "beach-elite-training-center",
        status: "active",
        locationKind: "private-venue",
        environment: "outdoor",
        temporary: false,
        capacity: 24,
        amenities: [
          "Outdoor showers",
          "Equipment storage",
          "spectator-seating",
        ],
        addressLine1: "1400 Ocean Front Walk",
        locality: "Manhattan Beach",
        administrativeArea: "CA",
        postalCode: "90266",
        countryCode: "US",
        latitude: 33.8847,
        longitude: -118.4109,
        timezone: "America/Los_Angeles",
        utilization: {
          percent: 58,
          bookedMinutes30d: 9_570,
          availableMinutes30d: 16_500,
          bookingCount30d: 84,
          nextBookingAt: nextSession.toISOString(),
        },
        courts: [
          {
            id: courtOneId,
            venueId,
            name: "Championship Court",
            surface: "sand",
            lit: true,
            capacity: 12,
            status: "active",
            bookingPolicy: "public",
            ratePlanId,
            minimumDurationMinutes: 60,
            maximumDurationMinutes: 120,
            durationOptionsMinutes: [60, 90, 120],
            bookingIncrementMinutes: 30,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 15,
            minimumNoticeMinutes: 120,
            maximumAdvanceDays: 30,
            cancellationPolicy: {
              title: "Court booking cancellation policy",
              markdown:
                "Cancel at least 24 hours before the reservation for a full refund.",
              refundBeforeHours: 24,
              lateCancellation: "Late cancellations are non-refundable.",
              requireFullScroll: false,
            },
            schedule: schedule(1),
            overrides: [],
            utilization: {
              percent: 72,
              bookedMinutes30d: 5_940,
              availableMinutes30d: 8_250,
              bookingCount30d: 51,
              nextBookingAt: nextSession.toISOString(),
            },
          },
          {
            id: courtTwoId,
            venueId,
            name: "Community Court",
            surface: "sand",
            lit: false,
            capacity: 12,
            status: "active",
            bookingPolicy: "members",
            ratePlanId,
            minimumDurationMinutes: 60,
            maximumDurationMinutes: 120,
            durationOptionsMinutes: [60, 90, 120],
            bookingIncrementMinutes: 30,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 15,
            minimumNoticeMinutes: 120,
            maximumAdvanceDays: 30,
            cancellationPolicy: {
              title: "Court booking cancellation policy",
              markdown:
                "Cancel at least 24 hours before the reservation for a full refund.",
              refundBeforeHours: 24,
              lateCancellation: "Late cancellations are non-refundable.",
              requireFullScroll: false,
            },
            schedule: schedule(2),
            overrides: [],
            utilization: {
              percent: 44,
              bookedMinutes30d: 3_630,
              availableMinutes30d: 8_250,
              bookingCount30d: 33,
            },
          },
        ],
      },
    ],
    sessions: [
      {
        id: demoSessionIds.upcoming,
        title: "Sunset doubles training",
        slug: "sunset-doubles-training",
        kind: "clinic",
        status: "registration-open",
        startsAt: nextSession.toISOString(),
        endsAt: nextSessionEnd.toISOString(),
        timezone: "America/Los_Angeles",
        capacity: 8,
        venueId,
        venueName: "Beach Elite Training Center",
        courtId: courtOneId,
        courtName: "Championship Court",
        shortSummary: "Small-group sideout and transition training.",
        media: [],
        priceMinor: 9_000,
        currency: "USD",
        analytics: {
          impressions: 420,
          uniqueViewers: 286,
          registrations: 3,
          ticketHolders: 3,
          conversionRateBps: 1_049,
        },
      },
      {
        id: demoSessionIds.completed,
        title: "Serve receive lab",
        slug: "serve-receive-lab",
        kind: "clinic",
        status: "completed",
        startsAt: completedSession.toISOString(),
        endsAt: completedSessionEnd.toISOString(),
        timezone: "America/Los_Angeles",
        capacity: 6,
        venueId,
        venueName: "Beach Elite Training Center",
        courtId: courtTwoId,
        courtName: "Community Court",
        shortSummary: "Repetition-driven serve receive clinic.",
        media: [],
        priceMinor: 7_500,
        currency: "USD",
        analytics: {
          impressions: 312,
          uniqueViewers: 201,
          registrations: 4,
          ticketHolders: 4,
          conversionRateBps: 1_990,
        },
      },
      {
        id: demoSessionIds.cancelled,
        title: "Saturday king of the beach",
        slug: "saturday-king-of-the-beach",
        kind: "tournament",
        status: "cancelled",
        startsAt: cancelledSession.toISOString(),
        endsAt: cancelledSessionEnd.toISOString(),
        timezone: "America/Los_Angeles",
        capacity: 16,
        venueId,
        venueName: "Beach Elite Training Center",
        courtId: courtOneId,
        courtName: "Championship Court",
        shortSummary: "Round-robin king of the beach format.",
        media: [],
        priceMinor: 12_000,
        currency: "USD",
        analytics: {
          impressions: 648,
          uniqueViewers: 438,
          registrations: 4,
          ticketHolders: 4,
          conversionRateBps: 913,
        },
      },
    ],
    eventRegistrations: [
      {
        id: "10000000-0000-4000-8000-000000000401",
        sessionId: demoSessionIds.upcoming,
        personId: demoPersonIds.maya,
        displayName: "Maya Chen",
        email: "maya@example.com",
        phoneE164: "+13105550121",
        status: "confirmed",
        orderId: "10000000-0000-4000-8000-000000000501",
        ticketCount: 1,
        registeredAt: purchaseAt.toISOString(),
      },
      {
        id: "10000000-0000-4000-8000-000000000402",
        sessionId: demoSessionIds.upcoming,
        personId: demoPersonIds.jordan,
        displayName: "Jordan Smith",
        email: "jordan@example.com",
        phoneE164: "+13105550122",
        status: "confirmed",
        orderId: "10000000-0000-4000-8000-000000000502",
        ticketCount: 1,
        registeredAt: purchaseAt.toISOString(),
      },
      {
        id: "10000000-0000-4000-8000-000000000403",
        sessionId: demoSessionIds.upcoming,
        personId: demoPersonIds.ava,
        displayName: "Ava Patel",
        email: "elena@example.com",
        status: "confirmed",
        orderId: "10000000-0000-4000-8000-000000000503",
        ticketCount: 1,
        registeredAt: purchaseAt.toISOString(),
      },
      {
        id: "10000000-0000-4000-8000-000000000404",
        sessionId: demoSessionIds.completed,
        personId: demoPersonIds.maya,
        displayName: "Maya Chen",
        email: "maya@example.com",
        phoneE164: "+13105550121",
        status: "checked-in",
        orderId: "10000000-0000-4000-8000-000000000504",
        ticketCount: 1,
        checkedInAt: completedSession.toISOString(),
        registeredAt: purchaseAt.toISOString(),
      },
      {
        id: "10000000-0000-4000-8000-000000000405",
        sessionId: demoSessionIds.completed,
        personId: demoPersonIds.jordan,
        displayName: "Jordan Smith",
        email: "jordan@example.com",
        phoneE164: "+13105550122",
        status: "confirmed",
        orderId: "10000000-0000-4000-8000-000000000505",
        ticketCount: 1,
        registeredAt: purchaseAt.toISOString(),
      },
      {
        id: "10000000-0000-4000-8000-000000000406",
        sessionId: demoSessionIds.completed,
        personId: demoPersonIds.ava,
        displayName: "Ava Patel",
        email: "elena@example.com",
        status: "cancelled",
        orderId: "10000000-0000-4000-8000-000000000506",
        ticketCount: 1,
        registeredAt: purchaseAt.toISOString(),
      },
      {
        id: "10000000-0000-4000-8000-000000000407",
        sessionId: demoSessionIds.completed,
        personId: demoPersonIds.noah,
        displayName: "Noah Martinez",
        email: "noah@example.com",
        phoneE164: "+13105550125",
        status: "checked-in",
        orderId: "10000000-0000-4000-8000-000000000507",
        ticketCount: 1,
        checkedInAt: completedSession.toISOString(),
        registeredAt: purchaseAt.toISOString(),
      },
      ...[demoPersonIds.maya, demoPersonIds.jordan].map((personId, index) => ({
        id: `10000000-0000-4000-8000-00000000041${index}`,
        sessionId: demoSessionIds.cancelled,
        personId,
        displayName: index === 0 ? "Maya Chen" : "Jordan Smith",
        email: index === 0 ? "maya@example.com" : "jordan@example.com",
        status: "refunded" as const,
        orderId: `10000000-0000-4000-8000-00000000051${index}`,
        ticketCount: 1,
        registeredAt: purchaseAt.toISOString(),
      })),
    ],
    eventAudiences: [],
    participants: peopleWorkspace.map((person, index) => ({
      id: `10000000-0000-4000-8000-00000000060${index}`,
      personId: person.personId,
      displayName: person.displayName,
      email: person.email,
      phoneE164: person.phoneE164,
      avatarUrl: person.avatarUrl,
      isMinor: person.isMinor,
      relationship: person.roles.includes("guardian")
        ? ("guardian" as const)
        : person.membershipStatus
          ? ("member" as const)
          : ("player" as const),
      status: person.status,
      guardianStatus: person.isMinor
        ? ("verified" as const)
        : ("not-required" as const),
      joinedAt: person.joinedAt,
    })),
    invitations: [],
    staff: [],
    staffInvitations: [],
    messageRecipients: [],
    messageDrafts: [],
    marketingFlows: [],
    marketingCampaigns: [],
    billingRecovery: [],
    organizationDomains: [],
    communicationSettings: {
      emailDomainStatus: "not-configured",
      emailDnsRecords: [],
      messagingAddonStatus: "disabled",
      smsEnabled: false,
      rcsEnabled: false,
      whatsappEnabled: false,
      includedWithPlan: true,
      emailMessageLimit: 1_000,
      emailContactLimit: 100,
      messagingMessageLimit: 1_000,
      messagingContactLimit: 100,
      boostUnits: 0,
      alertThresholdBps: 8_000,
      softOverageBps: 5_000,
    },
    communicationUsage: {
      periodStart: new Date().toISOString().slice(0, 10),
      emailContacts: 0,
      emailMessages: 0,
      messagingContacts: 0,
      smsMessages: 0,
      rcsMessages: 0,
      whatsappMessages: 0,
      pushMessages: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
      converted: 0,
    },
    deliveryProviders: {
      email: false,
      sms: false,
      push: false,
    },
    ...commerce,
    people: peopleWorkspace,
    calendar: {
      ...commerce.calendar,
      entries: [
        {
          id: demoSessionIds.upcoming,
          sourceType: "session",
          title: "Sunset doubles training",
          startsAt: nextSession.toISOString(),
          endsAt: nextSessionEnd.toISOString(),
          timezone: "America/Los_Angeles",
          status: "registration-open",
          kind: "clinic",
          venueName: "Beach Elite Training Center",
          courtId: courtOneId,
          courtName: "Championship Court",
          participantCount: 6,
          capacity: 8,
          color: "#2867a5",
          draggable: true,
          attendees: [
            {
              registrationId: "10000000-0000-4000-8000-000000000401",
              personId: demoPersonIds.maya,
              displayName: "Maya Chen",
              status: "confirmed",
              isMinor: false,
            },
            {
              registrationId: "10000000-0000-4000-8000-000000000402",
              personId: demoPersonIds.jordan,
              displayName: "Jordan Smith",
              status: "confirmed",
              isMinor: false,
            },
            {
              registrationId: "10000000-0000-4000-8000-000000000403",
              personId: demoPersonIds.ava,
              displayName: "Ava Patel",
              status: "confirmed",
              isMinor: true,
            },
          ],
          equipment: [],
        },
      ],
    },
  };
}

export async function loadOperatorWorkspace(
  organizationId: string,
): Promise<OperatorWorkspace> {
  requireDatabase();
  const database = getDatabase();
  const organization = await organizationRow(organizationId);
  const now = new Date();
  const commerce = await loadOperatorCommerceWorkspace(organizationId, now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const [
    ratePlanRows,
    venueRows,
    courtRows,
    scheduleRows,
    scheduleBlockRows,
    scheduleOverrideRows,
    bookingRows,
    sessionRows,
    memberRows,
    registrationRows,
    ticketRows,
    impressionRows,
    participantRows,
    invitationRows,
    draftRows,
    staffProfileRows,
    staffInvitationRows,
    marketingFlowRows,
    marketingCampaignRows,
    billingRecoveryRows,
    organizationDomainRows,
    communicationSettingRows,
    communicationUsageRows,
  ] = await Promise.all([
    database
      .select()
      .from(ratePlans)
      .where(eq(ratePlans.organizationId, organizationId))
      .orderBy(asc(ratePlans.name)),
    database
      .select()
      .from(venues)
      .where(eq(venues.organizationId, organizationId))
      .orderBy(asc(venues.name)),
    database
      .select({
        court: courts,
        venueOrganizationId: venues.organizationId,
      })
      .from(courts)
      .innerJoin(venues, eq(courts.venueId, venues.id))
      .where(eq(venues.organizationId, organizationId))
      .orderBy(asc(courts.name)),
    database
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.organizationId, organizationId),
          eq(schedules.resourceType, "court"),
        ),
      ),
    database
      .select({
        block: scheduleBlocks,
        resourceId: schedules.resourceId,
      })
      .from(scheduleBlocks)
      .innerJoin(schedules, eq(scheduleBlocks.scheduleId, schedules.id))
      .where(
        and(
          eq(schedules.organizationId, organizationId),
          eq(schedules.resourceType, "court"),
        ),
      )
      .orderBy(
        asc(schedules.resourceId),
        asc(scheduleBlocks.weekday),
        asc(scheduleBlocks.startsAtMinute),
      ),
    database
      .select({
        override: scheduleOverrides,
        resourceId: schedules.resourceId,
      })
      .from(scheduleOverrides)
      .innerJoin(schedules, eq(scheduleOverrides.scheduleId, schedules.id))
      .where(
        and(
          eq(schedules.organizationId, organizationId),
          eq(schedules.resourceType, "court"),
          gt(scheduleOverrides.endsAt, thirtyDaysAgo),
          lt(scheduleOverrides.startsAt, thirtyDaysAhead),
        ),
      )
      .orderBy(asc(schedules.resourceId), asc(scheduleOverrides.startsAt)),
    database
      .select({
        id: courtBookings.id,
        venueId: courtBookings.venueId,
        courtId: courtBookings.courtId,
        startsAt: courtBookings.startsAt,
        endsAt: courtBookings.endsAt,
      })
      .from(courtBookings)
      .innerJoin(venues, eq(courtBookings.venueId, venues.id))
      .where(
        and(
          eq(venues.organizationId, organizationId),
          eq(courtBookings.status, "confirmed"),
          gt(courtBookings.endsAt, thirtyDaysAgo),
          lt(courtBookings.startsAt, thirtyDaysAhead),
        ),
      ),
    database
      .select({
        id: sessions.id,
        programId: sessions.programId,
        title: sessions.title,
        slug: sessions.slug,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        timezone: sessions.timezone,
        status: sessions.status,
        capacity: sessions.capacity,
        venueId: sessions.venueId,
        venueName: venues.name,
        courtId: sessions.courtId,
        courtName: courts.name,
        coachPersonId: sessions.coachPersonId,
        kindFromProgram: programs.kind,
        kindFromEventType: eventTypes.kind,
        priceMinor: eventTypes.priceMinor,
        currency: eventTypes.currency,
        shortSummary: eventBlueprints.shortSummary,
        description: eventBlueprints.description,
        media: eventBlueprints.media,
        registrationSettings: eventBlueprints.registrationSettings,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(courts, eq(sessions.courtId, courts.id))
      .leftJoin(eventBlueprints, eq(sessions.id, eventBlueprints.sessionId))
      .where(
        or(
          eq(programs.organizationId, organizationId),
          eq(eventTypes.organizationId, organizationId),
          eq(venues.organizationId, organizationId),
        ),
      )
      .orderBy(desc(sessions.startsAt)),
    database
      .select({
        id: people.id,
        displayName: people.displayName,
        email: people.email,
        phoneE164: people.phoneE164,
        isMinor: people.isMinor,
      })
      .from(organizationMemberships)
      .innerJoin(people, eq(organizationMemberships.personId, people.id))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.active, true),
        ),
      ),
    database
      .select({
        id: registrations.id,
        sessionId: registrations.sessionId,
        personId: registrations.personId,
        displayName: people.displayName,
        avatarUrl: people.avatarUrl,
        email: people.email,
        phoneE164: people.phoneE164,
        isMinor: people.isMinor,
        status: registrations.status,
        orderId: registrations.orderId,
        checkedInAt: registrations.checkedInAt,
        createdAt: registrations.createdAt,
      })
      .from(registrations)
      .innerJoin(people, eq(registrations.personId, people.id))
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        or(
          eq(programs.organizationId, organizationId),
          eq(eventTypes.organizationId, organizationId),
          eq(venues.organizationId, organizationId),
        ),
      ),
    database
      .select({
        id: tickets.id,
        sessionId: ticketTypes.sessionId,
        ownerPersonId: tickets.ownerPersonId,
        status: tickets.status,
      })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        or(
          eq(programs.organizationId, organizationId),
          eq(eventTypes.organizationId, organizationId),
          eq(venues.organizationId, organizationId),
        ),
      ),
    database
      .select({
        id: eventImpressions.id,
        sessionId: eventImpressions.sessionId,
        viewerPersonId: eventImpressions.viewerPersonId,
        anonymousId: eventImpressions.anonymousId,
      })
      .from(eventImpressions)
      .innerJoin(sessions, eq(eventImpressions.sessionId, sessions.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        or(
          eq(programs.organizationId, organizationId),
          eq(eventTypes.organizationId, organizationId),
          eq(venues.organizationId, organizationId),
        ),
      ),
    database
      .select({
        id: organizationParticipants.id,
        personId: people.id,
        displayName: people.displayName,
        email: people.email,
        phoneE164: people.phoneE164,
        avatarUrl: people.avatarUrl,
        isMinor: people.isMinor,
        relationship: organizationParticipants.relationship,
        status: organizationParticipants.status,
        joinedAt: organizationParticipants.joinedAt,
      })
      .from(organizationParticipants)
      .innerJoin(people, eq(organizationParticipants.personId, people.id))
      .where(eq(organizationParticipants.organizationId, organizationId))
      .orderBy(asc(people.displayName)),
    database
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.organizationId, organizationId))
      .orderBy(desc(organizationInvitations.createdAt))
      .limit(50),
    database
      .select({
        id: messages.id,
        recipientPersonId: messages.recipientPersonId,
        recipientName: people.displayName,
        channel: messages.channel,
        kind: messages.kind,
        subject: messages.subject,
        body: messages.body,
        guardianCopyPersonIds: messages.guardianCopyPersonIds,
        consentId: messages.consentId,
        status: messages.status,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(people, eq(messages.recipientPersonId, people.id))
      .where(
        and(
          eq(messages.organizationId, organizationId),
          eq(messages.status, "draft"),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(20),
    database
      .select({
        profile: organizationStaffProfiles,
        displayName: people.displayName,
        handle: people.handle,
        avatarUrl: people.avatarUrl,
        email: people.email,
        phoneE164: people.phoneE164,
        homeMarket: people.homeMarket,
        bio: people.experienceSummary,
        profileVisibility: people.profileVisibility,
      })
      .from(organizationStaffProfiles)
      .innerJoin(people, eq(organizationStaffProfiles.personId, people.id))
      .where(eq(organizationStaffProfiles.organizationId, organizationId))
      .orderBy(asc(people.displayName)),
    database
      .select()
      .from(organizationStaffInvitations)
      .where(eq(organizationStaffInvitations.organizationId, organizationId))
      .orderBy(desc(organizationStaffInvitations.createdAt))
      .limit(50),
    database
      .select()
      .from(marketingFlows)
      .where(eq(marketingFlows.organizationId, organizationId))
      .orderBy(desc(marketingFlows.createdAt))
      .limit(100),
    database
      .select()
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.organizationId, organizationId))
      .orderBy(desc(marketingCampaigns.createdAt))
      .limit(100),
    database
      .select({
        personId: memberships.personId,
        displayName: people.displayName,
        membershipName: membershipTiers.name,
        membershipStatus: memberships.status,
      })
      .from(memberships)
      .innerJoin(people, eq(memberships.personId, people.id))
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(membershipTiers.organizationId, organizationId),
          inArray(memberships.status, ["past_due", "incomplete", "unpaid"]),
        ),
      )
      .orderBy(desc(memberships.updatedAt)),
    database
      .select()
      .from(organizationDomains)
      .where(eq(organizationDomains.organizationId, organizationId))
      .orderBy(
        desc(organizationDomains.isPrimary),
        asc(organizationDomains.hostname),
      ),
    database
      .select()
      .from(organizationCommunicationSettings)
      .where(
        eq(organizationCommunicationSettings.organizationId, organizationId),
      )
      .limit(1),
    database
      .select()
      .from(communicationUsagePeriods)
      .where(eq(communicationUsagePeriods.organizationId, organizationId))
      .orderBy(desc(communicationUsagePeriods.periodStart))
      .limit(1),
  ]);

  const recipientMap = new Map(
    [
      ...memberRows,
      ...registrationRows.map((row) => ({
        id: row.personId,
        displayName: row.displayName,
        email: row.email,
        phoneE164: row.phoneE164,
        isMinor: row.isMinor,
      })),
      ...participantRows.map((row) => ({
        id: row.personId,
        displayName: row.displayName,
        email: row.email,
        phoneE164: row.phoneE164,
        isMinor: row.isMinor,
      })),
    ].map((row) => [row.id, row]),
  );
  const recipientIds = [
    ...new Set([
      ...recipientMap.keys(),
      ...participantRows.map((row) => row.personId),
    ]),
  ];
  const guardianRows =
    recipientIds.length > 0
      ? await database
          .select({
            minorId: guardianships.minorId,
            guardianId: guardianships.guardianId,
          })
          .from(guardianships)
          .where(
            and(
              inArray(guardianships.minorId, recipientIds),
              eq(guardianships.verified, true),
              eq(guardianships.reviewStatus, "verified"),
            ),
          )
      : [];
  const guardianCounts = new Map<string, number>();
  const guardianPendingCounts = new Map<string, number>();
  for (const row of guardianRows) {
    guardianCounts.set(row.minorId, (guardianCounts.get(row.minorId) ?? 0) + 1);
  }
  if (participantRows.some((row) => row.isMinor)) {
    const pendingGuardianRows = await database
      .select({ minorId: guardianships.minorId })
      .from(guardianships)
      .where(
        and(
          inArray(
            guardianships.minorId,
            participantRows
              .filter((row) => row.isMinor)
              .map((row) => row.personId),
          ),
          eq(guardianships.reviewStatus, "pending"),
        ),
      );
    for (const row of pendingGuardianRows) {
      guardianPendingCounts.set(
        row.minorId,
        (guardianPendingCounts.get(row.minorId) ?? 0) + 1,
      );
    }
  }
  const activeRegistrationStatuses = new Set(["confirmed", "checked-in"]);
  const activeTicketStatuses = new Set(["issued", "transferred", "scanned"]);
  const ticketCountBySessionAndPerson = new Map<string, number>();
  const ticketHolderIdsBySession = new Map<string, Set<string>>();
  for (const ticket of ticketRows) {
    if (!activeTicketStatuses.has(ticket.status)) continue;
    const key = `${ticket.sessionId}:${ticket.ownerPersonId}`;
    ticketCountBySessionAndPerson.set(
      key,
      (ticketCountBySessionAndPerson.get(key) ?? 0) + 1,
    );
    const holders =
      ticketHolderIdsBySession.get(ticket.sessionId) ?? new Set<string>();
    holders.add(ticket.ownerPersonId);
    ticketHolderIdsBySession.set(ticket.sessionId, holders);
  }
  const registeredPersonIdsBySession = new Map<string, Set<string>>();
  for (const registration of registrationRows) {
    if (!activeRegistrationStatuses.has(registration.status)) continue;
    const peopleForSession =
      registeredPersonIdsBySession.get(registration.sessionId) ??
      new Set<string>();
    peopleForSession.add(registration.personId);
    registeredPersonIdsBySession.set(registration.sessionId, peopleForSession);
  }
  const audienceSizeBySessionAndKind = new Map<string, number>();
  const eventAudiences = sessionRows.flatMap((session) => {
    const registered =
      registeredPersonIdsBySession.get(session.id) ?? new Set<string>();
    const ticketHolders =
      ticketHolderIdsBySession.get(session.id) ?? new Set<string>();
    const audiences = [
      {
        sessionId: session.id,
        kind: "non-registered-members" as const,
        label: "All non-registered members",
        description:
          "Active organization members who have not registered for this event.",
        size: memberRows.filter((member) => !registered.has(member.id)).length,
      },
      {
        sessionId: session.id,
        kind: "registered-attendees" as const,
        label: "All registered attendees",
        description:
          "People with confirmed registrations or completed check-in.",
        size: registered.size,
      },
      {
        sessionId: session.id,
        kind: "ticket-holders" as const,
        label: "All ticket holders",
        description: "People who currently hold one or more valid tickets.",
        size: ticketHolders.size,
      },
    ];
    for (const audience of audiences) {
      audienceSizeBySessionAndKind.set(
        `${session.id}:${audience.kind}`,
        audience.size,
      );
    }
    return audiences;
  });
  const impressionMetricsBySession = new Map<
    string,
    { impressions: number; uniqueViewerKeys: Set<string> }
  >();
  for (const impression of impressionRows) {
    const metric = impressionMetricsBySession.get(impression.sessionId) ?? {
      impressions: 0,
      uniqueViewerKeys: new Set<string>(),
    };
    metric.impressions += 1;
    const viewerKey = impression.viewerPersonId
      ? `person:${impression.viewerPersonId}`
      : impression.anonymousId
        ? `anonymous:${impression.anonymousId}`
        : undefined;
    if (viewerKey) metric.uniqueViewerKeys.add(viewerKey);
    impressionMetricsBySession.set(impression.sessionId, metric);
  }
  const registrationClosesAt = (
    settings: Record<string, unknown> | null | undefined,
  ): string | undefined => {
    const value =
      settings?.registrationClosesAt ??
      settings?.registrationCloseAt ??
      settings?.closesAt;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      return undefined;
    }
    return new Date(value).toISOString();
  };
  const audienceSizeForFlow = (
    sessionId: string | null | undefined,
    segment: Record<string, unknown>,
  ): number => {
    const kind =
      typeof segment.kind === "string"
        ? segment.kind
        : typeof segment.audience === "string"
          ? segment.audience
          : "all-active-people";
    if (sessionId) {
      const eventAudience = audienceSizeBySessionAndKind.get(
        `${sessionId}:${kind}`,
      );
      if (eventAudience !== undefined) return eventAudience;
    }
    if (kind === "registered-attendees") {
      return new Set(
        registrationRows
          .filter((row) => activeRegistrationStatuses.has(row.status))
          .map((row) => row.personId),
      ).size;
    }
    if (kind === "ticket-holders") {
      return new Set(
        ticketRows
          .filter((row) => activeTicketStatuses.has(row.status))
          .map((row) => row.ownerPersonId),
      ).size;
    }
    return memberRows.length;
  };
  const availabilityModes = new Set([
    "open",
    "rentals-only",
    "members-only",
    "private-lessons-only",
    "group-only",
    "league-reserved",
  ]);
  const scheduleBlocksForCourt = (courtId: string) =>
    scheduleBlockRows
      .filter((row) => row.resourceId === courtId)
      .map((row) => row.block);
  const scheduleOverridesForCourt = (courtId: string) =>
    scheduleOverrideRows
      .filter((row) => row.resourceId === courtId)
      .map((row) => row.override);
  const utilizationForCourt = (courtId: string) => {
    const configured = scheduleRows.some(
      (schedule) => schedule.resourceId === courtId,
    );
    const weeklyMinutes = scheduleBlocksForCourt(courtId)
      .filter((block) => availabilityModes.has(block.mode))
      .reduce(
        (total, block) =>
          total + Math.max(0, block.endsAtMinute - block.startsAtMinute),
        0,
      );
    const availableMinutes30d = Math.max(
      1,
      Math.round((configured ? weeklyMinutes : 14 * 60 * 7) * (30 / 7)),
    );
    const historical = bookingRows.filter(
      (booking) =>
        booking.courtId === courtId &&
        booking.startsAt < now &&
        booking.endsAt > thirtyDaysAgo,
    );
    const bookedMinutes30d = Math.round(
      historical.reduce((total, booking) => {
        const startsAt = Math.max(
          booking.startsAt.getTime(),
          thirtyDaysAgo.getTime(),
        );
        const endsAt = Math.min(booking.endsAt.getTime(), now.getTime());
        return total + Math.max(0, endsAt - startsAt) / 60_000;
      }, 0),
    );
    const nextBookingAt = bookingRows
      .filter(
        (booking) => booking.courtId === courtId && booking.startsAt >= now,
      )
      .sort(
        (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
      )[0]?.startsAt;
    return {
      percent: Math.min(
        100,
        Math.round((bookedMinutes30d / availableMinutes30d) * 1_000) / 10,
      ),
      bookedMinutes30d,
      availableMinutes30d,
      bookingCount30d: historical.length,
      nextBookingAt: nextBookingAt?.toISOString(),
    };
  };
  const utilizationForVenue = (venueId: string) => {
    const venueCourtIds = courtRows
      .filter((row) => row.court.venueId === venueId)
      .map((row) => row.court.id);
    const metrics = venueCourtIds.map(utilizationForCourt);
    const bookedMinutes30d = metrics.reduce(
      (total, item) => total + item.bookedMinutes30d,
      0,
    );
    const availableMinutes30d = metrics.reduce(
      (total, item) => total + item.availableMinutes30d,
      0,
    );
    const nextBookingAt = metrics
      .flatMap((item) => (item.nextBookingAt ? [item.nextBookingAt] : []))
      .sort()[0];
    return {
      percent:
        availableMinutes30d > 0
          ? Math.min(
              100,
              Math.round((bookedMinutes30d / availableMinutes30d) * 1_000) / 10,
            )
          : 0,
      bookedMinutes30d,
      availableMinutes30d,
      bookingCount30d: metrics.reduce(
        (total, item) => total + item.bookingCount30d,
        0,
      ),
      nextBookingAt,
    };
  };
  const venuePlanningWeather = new Map(
    (
      await Promise.all(
        venueRows.map(async (venue) => {
          const coordinates = await resolveWeatherCoordinates({
            latitude: venue.latitude ?? undefined,
            longitude: venue.longitude ?? undefined,
            googlePlaceId: venue.googlePlaceId ?? undefined,
            query: [
              venue.name,
              venue.addressLine1,
              venue.addressLine2,
              venue.locality,
              venue.administrativeArea,
              venue.postalCode,
              venue.countryCode,
            ]
              .filter(Boolean)
              .join(", "),
            now,
          });
          if (!coordinates) return undefined;
          const forecast = await loadWeatherForecast({
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            timezone: venue.timezone,
            startsAt: now,
            endsAt: new Date(now.getTime() + 8 * 24 * 60 * 60_000),
            now,
          });
          return [venue.id, { coordinates, forecast }] as const;
        }),
      )
    ).flatMap((entry) => (entry ? [entry] : [])),
  );

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: plan(organization.plan),
      effectivePlan:
        resolveOrganizationCommissionPolicy(organization).effectivePlan,
      planSubscriptionStatus:
        resolveOrganizationCommissionPolicy(organization).subscriptionStatus,
      planBillingInterval:
        organization.planBillingInterval === "month" ||
        organization.planBillingInterval === "year"
          ? organization.planBillingInterval
          : undefined,
      planCurrentPeriodEndsAt:
        organization.planCurrentPeriodEndsAt?.toISOString(),
      planCancelAtPeriodEnd: organization.planCancelAtPeriodEnd,
      billingPortalAvailable: Boolean(organization.stripeBillingCustomerId),
      commission: resolveOrganizationCommissionPolicy(organization),
      currency: currency(organization.currency),
      timezone: organization.timezone,
      stripeAccountId: organization.stripeAccountId ?? undefined,
      stripeChargesEnabled: organization.stripeChargesEnabled,
      legalName: organization.legalName ?? undefined,
      countryCode: organization.countryCode,
      addressLine1: organization.addressLine1 ?? undefined,
      addressLine2: organization.addressLine2 ?? undefined,
      locality: organization.locality ?? undefined,
      administrativeArea: organization.administrativeArea ?? undefined,
      postalCode: organization.postalCode ?? undefined,
      googlePlaceId: organization.googlePlaceId ?? undefined,
      latitude: organization.latitude ?? undefined,
      longitude: organization.longitude ?? undefined,
      stripeTaxEnabled: organization.stripeTaxEnabled,
      taxRegistrationStatus:
        organization.taxRegistrationStatus === "pending" ||
        organization.taxRegistrationStatus === "active" ||
        organization.taxRegistrationStatus === "restricted"
          ? organization.taxRegistrationStatus
          : "not-configured",
    },
    ratePlans: ratePlanRows.map((row) => ({
      id: row.id,
      name: row.name,
      currency: currency(row.currency),
      baseAmountMinor: row.baseAmountMinor,
      memberAmountMinor: row.memberAmountMinor ?? undefined,
      nonMemberAmountMinor: row.nonMemberAmountMinor ?? undefined,
      rateUnitMinutes: row.rateUnitMinutes,
    })),
    venues: venueRows.map((venue) => {
      const planningWeather = venuePlanningWeather.get(venue.id);
      return {
        id: venue.id,
        name: venue.name,
        description: venue.description ?? undefined,
        slug: venue.slug,
        status: venue.status,
        locationKind:
          venue.locationKind === "public-location"
            ? "public-location"
            : "private-venue",
        environment: venue.environment === "indoor" ? "indoor" : "outdoor",
        temporary: venue.temporary,
        capacity: venue.capacity,
        heroImageUrl: venue.heroImageUrl ?? undefined,
        heroImageTreatmentUrl: venue.heroImageTreatmentUrl ?? undefined,
        amenities: venue.amenities,
        addressLine1: venue.addressLine1 ?? undefined,
        addressLine2: venue.addressLine2 ?? undefined,
        locality: venue.locality ?? undefined,
        administrativeArea: venue.administrativeArea ?? undefined,
        postalCode: venue.postalCode ?? undefined,
        countryCode: venue.countryCode,
        googlePlaceId:
          venue.googlePlaceId ??
          planningWeather?.coordinates.googlePlaceId ??
          undefined,
        latitude:
          venue.latitude ?? planningWeather?.coordinates.latitude ?? undefined,
        longitude:
          venue.longitude ??
          planningWeather?.coordinates.longitude ??
          undefined,
        timezone: venue.timezone,
        weather: planningWeather?.forecast,
        utilization: utilizationForVenue(venue.id),
        courts: courtRows
          .filter((row) => row.court.venueId === venue.id)
          .map(({ court }) => ({
            id: court.id,
            venueId: court.venueId,
            name: court.name,
            surface: court.surface,
            imageUrl: court.imageUrl ?? undefined,
            lit: court.lit,
            capacity: court.capacity,
            status: court.status,
            bookingPolicy:
              court.bookingPolicy === "members" ||
              court.bookingPolicy === "tiers" ||
              court.bookingPolicy === "staff" ||
              court.bookingPolicy === "none"
                ? court.bookingPolicy
                : "public",
            ratePlanId: court.ratePlanId ?? undefined,
            minimumDurationMinutes: court.minimumDurationMinutes,
            maximumDurationMinutes: court.maximumDurationMinutes,
            durationOptionsMinutes: court.durationOptionsMinutes,
            bookingIncrementMinutes: court.bookingIncrementMinutes,
            bufferBeforeMinutes: court.bufferBeforeMinutes,
            bufferAfterMinutes: court.bufferAfterMinutes,
            minimumNoticeMinutes: court.minimumNoticeMinutes,
            maximumAdvanceDays: court.maximumAdvanceDays,
            cancellationPolicy: normalizeCourtCancellationPolicy(
              court.cancellationPolicy,
            ),
            schedule: scheduleBlocksForCourt(court.id).map((block) => ({
              id: block.id,
              weekday: block.weekday,
              startsAtMinute: block.startsAtMinute,
              endsAtMinute: block.endsAtMinute,
              mode: block.mode,
              effectiveFrom: block.effectiveFrom ?? undefined,
              effectiveTo: block.effectiveTo ?? undefined,
            })),
            overrides: scheduleOverridesForCourt(court.id).map((override) => ({
              id: override.id,
              startsAt: override.startsAt.toISOString(),
              endsAt: override.endsAt.toISOString(),
              mode: override.mode,
              reason: override.reason,
            })),
            utilization: utilizationForCourt(court.id),
          })),
      };
    }),
    sessions: sessionRows.map((row) => ({
      id: row.id,
      programId: row.programId ?? undefined,
      title: row.title,
      slug: row.slug,
      kind: (row.kindFromProgram ??
        row.kindFromEventType ??
        "open-play") as EventKind,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timezone: row.timezone,
      capacity: row.capacity,
      venueId: row.venueId ?? undefined,
      venueName: row.venueName ?? undefined,
      courtId: row.courtId ?? undefined,
      courtName: row.courtName ?? undefined,
      shortSummary: row.shortSummary ?? undefined,
      description: row.description ?? undefined,
      media: row.media ?? [],
      registrationClosesAt: registrationClosesAt(row.registrationSettings),
      priceMinor: row.priceMinor ?? 0,
      currency: currency(row.currency ?? organization.currency),
      analytics: (() => {
        const impressionMetric = impressionMetricsBySession.get(row.id);
        const registrations =
          registeredPersonIdsBySession.get(row.id)?.size ?? 0;
        const ticketHolders = ticketHolderIdsBySession.get(row.id)?.size ?? 0;
        const impressions = impressionMetric?.impressions ?? 0;
        return {
          impressions,
          uniqueViewers: impressionMetric?.uniqueViewerKeys.size ?? 0,
          registrations,
          ticketHolders,
          conversionRateBps:
            impressions > 0
              ? Math.min(
                  10_000,
                  Math.round((registrations / impressions) * 10_000),
                )
              : 0,
        };
      })(),
    })),
    eventRegistrations: registrationRows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      personId: row.personId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? undefined,
      email: row.email ?? undefined,
      phoneE164: row.phoneE164 ?? undefined,
      status: row.status,
      orderId: row.orderId ?? undefined,
      ticketCount:
        ticketCountBySessionAndPerson.get(`${row.sessionId}:${row.personId}`) ??
        0,
      checkedInAt: row.checkedInAt?.toISOString(),
      registeredAt: row.createdAt.toISOString(),
    })),
    eventAudiences,
    participants: participantRows.map((row) => ({
      id: row.id,
      personId: row.personId,
      displayName: row.displayName,
      email: row.email ?? undefined,
      phoneE164: row.phoneE164 ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
      isMinor: row.isMinor,
      relationship:
        row.relationship === "member" || row.relationship === "guardian"
          ? row.relationship
          : "player",
      status:
        row.status === "inactive" || row.status === "pending"
          ? row.status
          : "active",
      guardianStatus: !row.isMinor
        ? "not-required"
        : (guardianCounts.get(row.personId) ?? 0) > 0
          ? "verified"
          : (guardianPendingCounts.get(row.personId) ?? 0) > 0
            ? "pending"
            : "pending",
      joinedAt: row.joinedAt.toISOString(),
    })),
    invitations: invitationRows.map((row) => ({
      id: row.id,
      invitedName: row.invitedName,
      invitedEmail: row.invitedEmail ?? undefined,
      invitedPhoneE164: row.invitedPhoneE164 ?? undefined,
      isMinor: row.isMinor,
      guardianName: row.guardianName ?? undefined,
      relationship: row.relationship === "member" ? "member" : "player",
      status:
        row.status === "claimed" ||
        row.status === "expired" ||
        row.status === "cancelled"
          ? row.status
          : row.expiresAt <= now
            ? "expired"
            : "pending",
      deliveryChannel:
        row.deliveryChannel === "sms" || row.deliveryChannel === "email"
          ? row.deliveryChannel
          : undefined,
      deliveryStatus:
        row.deliveryStatus === "queued" ||
        row.deliveryStatus === "sent" ||
        row.deliveryStatus === "failed"
          ? row.deliveryStatus
          : "not-configured",
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    staff: staffProfileRows.map((row) => {
      const role =
        row.profile.staffRole === "director" ||
        row.profile.staffRole === "manager" ||
        row.profile.staffRole === "front-desk" ||
        row.profile.staffRole === "accountant"
          ? row.profile.staffRole
          : "coach";
      return {
        id: row.profile.id,
        personId: row.profile.personId,
        displayName: row.displayName,
        handle: row.handle,
        avatarUrl: row.avatarUrl ?? undefined,
        email: row.email ?? undefined,
        phoneE164: row.phoneE164 ?? undefined,
        homeMarket: row.homeMarket ?? undefined,
        bio: row.bio ?? undefined,
        profileVisibility:
          row.profileVisibility === "public" ||
          row.profileVisibility === "members"
            ? row.profileVisibility
            : "private",
        role: role as OperatorWorkspace["staff"][number]["role"],
        workerClassification:
          row.profile.workerClassification === "w2-employee" ||
          row.profile.workerClassification === "1099-contractor"
            ? row.profile.workerClassification
            : "not-set",
        compensationModel:
          row.profile.compensationModel === "hourly" ||
          row.profile.compensationModel === "profit-share" ||
          row.profile.compensationModel === "hourly-plus-profit-share"
            ? row.profile.compensationModel
            : "not-set",
        hourlyRateMinor: row.profile.hourlyRateMinor ?? undefined,
        profitShareBps: row.profile.profitShareBps ?? undefined,
        currency: currency(row.profile.currency),
        addressComplete: Boolean(
          row.profile.addressLine1 &&
          row.profile.locality &&
          row.profile.administrativeArea &&
          row.profile.postalCode &&
          row.profile.countryCode,
        ),
        addressLine1: row.profile.addressLine1 ?? undefined,
        addressLine2: row.profile.addressLine2 ?? undefined,
        locality: row.profile.locality ?? undefined,
        administrativeArea: row.profile.administrativeArea ?? undefined,
        postalCode: row.profile.postalCode ?? undefined,
        countryCode: row.profile.countryCode,
        googlePlaceId: row.profile.googlePlaceId ?? undefined,
        latitude: row.profile.latitude ?? undefined,
        longitude: row.profile.longitude ?? undefined,
        availability: row.profile.availability,
        incomeGoalMinor: row.profile.incomeGoalMinor ?? undefined,
        incomeGoalPeriod:
          row.profile.incomeGoalPeriod === "week" ||
          row.profile.incomeGoalPeriod === "month" ||
          row.profile.incomeGoalPeriod === "quarter" ||
          row.profile.incomeGoalPeriod === "year"
            ? row.profile.incomeGoalPeriod
            : undefined,
        sessionsRun30d: sessionRows.filter(
          (session) =>
            session.coachPersonId === row.profile.personId &&
            session.startsAt >= thirtyDaysAgo &&
            session.startsAt < now &&
            !["cancelled", "draft"].includes(session.status),
        ).length,
        upcomingSessions: sessionRows.filter(
          (session) =>
            session.coachPersonId === row.profile.personId &&
            session.startsAt >= now &&
            !["cancelled", "completed"].includes(session.status),
        ).length,
        active: row.profile.active,
      };
    }),
    staffInvitations: staffInvitationRows.map((row) => ({
      id: row.id,
      invitedName: row.invitedName,
      invitedEmail: row.invitedEmail ?? undefined,
      invitedPhoneE164: row.invitedPhoneE164 ?? undefined,
      role:
        row.role === "director" ||
        row.role === "manager" ||
        row.role === "front-desk" ||
        row.role === "accountant"
          ? row.role
          : "coach",
      workerClassification:
        row.workerClassification === "w2-employee"
          ? "w2-employee"
          : "1099-contractor",
      status:
        row.status === "claimed" ||
        row.status === "expired" ||
        row.status === "cancelled"
          ? row.status
          : row.expiresAt <= now
            ? "expired"
            : "pending",
      deliveryChannel:
        row.deliveryChannel === "email" || row.deliveryChannel === "sms"
          ? row.deliveryChannel
          : undefined,
      deliveryStatus:
        row.deliveryStatus === "queued" ||
        row.deliveryStatus === "sent" ||
        row.deliveryStatus === "failed"
          ? row.deliveryStatus
          : "not-configured",
      inviteUrl: staffInvitationUrl(row.inviteToken),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    messageRecipients: [...recipientMap.values()]
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((recipient) => ({
        id: recipient.id,
        displayName: recipient.displayName,
        email: recipient.email ?? undefined,
        phoneE164: recipient.phoneE164 ?? undefined,
        isMinor: recipient.isMinor,
        verifiedGuardianCount: guardianCounts.get(recipient.id) ?? 0,
      })),
    messageDrafts: draftRows.map((row) => ({
      id: row.id,
      recipientPersonId: row.recipientPersonId,
      recipientName: row.recipientName,
      channel: row.channel,
      kind: row.kind,
      subject: row.subject ?? undefined,
      body: row.body,
      guardianCopyCount: row.guardianCopyPersonIds.length,
      consentRecorded: Boolean(row.consentId),
      status: "draft",
      createdAt: row.createdAt.toISOString(),
    })),
    marketingFlows: marketingFlowRows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId ?? undefined,
      name: row.name,
      description: row.description ?? undefined,
      segment: row.segment,
      trigger: row.trigger,
      action: row.action,
      audienceSize: audienceSizeForFlow(row.sessionId, row.segment),
      status:
        row.status === "active" ||
        row.status === "paused" ||
        row.status === "archived"
          ? row.status
          : "draft",
      createdAt: row.createdAt.toISOString(),
    })),
    marketingCampaigns: marketingCampaignRows.map((row) => ({
      id: row.id,
      name: row.name,
      segment: row.segment,
      channel: row.channel,
      subject: row.subject ?? undefined,
      body: row.body,
      status:
        row.status === "scheduled" ||
        row.status === "sending" ||
        row.status === "sent" ||
        row.status === "paused" ||
        row.status === "cancelled"
          ? row.status
          : "draft",
      scheduledAt: row.scheduledAt?.toISOString(),
      sentAt: row.sentAt?.toISOString(),
      stats: row.stats,
      createdAt: row.createdAt.toISOString(),
    })),
    billingRecovery: billingRecoveryRows.map((row) => ({
      personId: row.personId,
      displayName: row.displayName,
      membershipName: row.membershipName,
      membershipStatus: row.membershipStatus,
      retryState:
        row.membershipStatus === "past_due"
          ? "processor-managed"
          : "action-required",
      detail:
        row.membershipStatus === "past_due"
          ? "Automatic retries and customer notifications are managed through the subscription billing schedule."
          : "The member needs to update their payment method before access can resume.",
    })),
    deliveryProviders: providerReadiness(),
    organizationDomains: organizationDomainRows.map((row) => ({
      id: row.id,
      hostname: row.hostname,
      kind: organizationDomainKind(row.kind),
      status: organizationDomainStatus(row.status),
      isPrimary: row.isPrimary,
      verification: row.verification,
      lastCheckedAt: row.lastCheckedAt?.toISOString(),
    })),
    communicationSettings: (() => {
      const row = communicationSettingRows[0];
      return {
        senderDisplayName: row?.senderDisplayName ?? organization.name,
        senderEmailLocalPart: row?.senderEmailLocalPart ?? "hello",
        senderEmailDomain: row?.senderEmailDomain ?? undefined,
        senderEmail: row?.senderEmail ?? undefined,
        emailDomainStatus: emailDomainStatus(row?.emailDomainStatus),
        emailDnsRecords: row?.emailDnsRecords ?? [],
        messagingAddonStatus: messagingAddonStatus(row?.messagingAddonStatus),
        messagingPhoneNumber: row?.messagingPhoneNumber ?? undefined,
        messagingSenderId: row?.messagingSenderId ?? undefined,
        smsEnabled: row?.smsEnabled ?? false,
        rcsEnabled: row?.rcsEnabled ?? false,
        whatsappEnabled: row?.whatsappEnabled ?? false,
        includedWithPlan: true,
        emailMessageLimit: row?.emailMessageLimit ?? 1_000,
        emailContactLimit: row?.emailContactLimit ?? 100,
        messagingMessageLimit: row?.messagingMessageLimit ?? 1_000,
        messagingContactLimit: row?.messagingContactLimit ?? 100,
        boostUnits: row?.boostUnits ?? 0,
        alertThresholdBps: row?.alertThresholdBps ?? 8_000,
        softOverageBps: row?.softOverageBps ?? 5_000,
      };
    })(),
    communicationUsage: (() => {
      const row = communicationUsageRows[0];
      return {
        periodStart:
          row?.periodStart.toISOString().slice(0, 10) ??
          now.toISOString().slice(0, 10),
        emailContacts: row?.emailContacts ?? 0,
        emailMessages: row?.emailMessages ?? 0,
        messagingContacts: row?.messagingContacts ?? 0,
        smsMessages: row?.smsMessages ?? 0,
        rcsMessages: row?.rcsMessages ?? 0,
        whatsappMessages: row?.whatsappMessages ?? 0,
        pushMessages: row?.pushMessages ?? 0,
        delivered: row?.delivered ?? 0,
        opened: row?.opened ?? 0,
        clicked: row?.clicked ?? 0,
        bounced: row?.bounced ?? 0,
        failed: row?.failed ?? 0,
        converted: row?.converted ?? 0,
      };
    })(),
    ...commerce,
  };
}

export async function loadEventDraft(
  organizationId: string,
  sessionId: string,
): Promise<EventDraftEditor> {
  requireDatabase();
  const database = getDatabase();
  const row = (
    await database
      .select({
        id: sessions.id,
        slug: sessions.slug,
        status: sessions.status,
        title: sessions.title,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        timezone: sessions.timezone,
        venueId: sessions.venueId,
        venueName: venues.name,
        venueOrganizationId: venues.organizationId,
        courtId: sessions.courtId,
        courtName: courts.name,
        kindFromEventType: eventTypes.kind,
        eventTypeOrganizationId: eventTypes.organizationId,
        kindFromProgram: programs.kind,
        programOrganizationId: programs.organizationId,
        shortSummary: eventBlueprints.shortSummary,
        description: eventBlueprints.description,
        media: eventBlueprints.media,
        location: eventBlueprints.location,
        features: eventBlueprints.features,
        policies: eventBlueprints.policies,
        recurrence: eventBlueprints.recurrence,
        registrationSettings: eventBlueprints.registrationSettings,
      })
      .from(sessions)
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(courts, eq(sessions.courtId, courts.id))
      .leftJoin(eventBlueprints, eq(sessions.id, eventBlueprints.sessionId))
      .where(eq(sessions.id, sessionId))
      .limit(1)
  )[0];

  if (!row) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Event draft was not found.",
    );
  }
  const ownerOrganizationId =
    row.eventTypeOrganizationId ??
    row.programOrganizationId ??
    row.venueOrganizationId;
  if (ownerOrganizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Event draft belongs to another organization.",
    );
  }
  if (row.status !== "draft") {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Only private drafts can be edited in the event builder.",
    );
  }
  const kind = row.kindFromEventType ?? row.kindFromProgram;
  if (kind !== "tournament" && kind !== "league") {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "This session type is not supported by the event builder.",
    );
  }

  const [divisionRows, ticketTypeRows] = await Promise.all([
    database
      .select()
      .from(divisions)
      .where(eq(divisions.sessionId, sessionId))
      .orderBy(asc(divisions.createdAt)),
    database
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.sessionId, sessionId))
      .orderBy(asc(ticketTypes.createdAt)),
  ]);

  const parsedLocation = eventLocationSchema.safeParse(row.location);
  const location = parsedLocation.success
    ? parsedLocation.data
    : {
        mode: row.venueId ? ("venue" as const) : ("address" as const),
        venueName: row.venueName ?? "Event venue",
        courtNames: row.courtName ? [row.courtName] : [],
      };
  const parsedMedia = eventMediaSchema.array().safeParse(row.media ?? []);
  const parsedFeatures = eventFeatureSchema
    .array()
    .safeParse(row.features ?? []);
  const parsedPolicies = eventPolicySchema
    .array()
    .safeParse(row.policies ?? []);
  const parsedRecurrence = leagueRecurrenceSchema.safeParse(row.recurrence);
  const registrationSettings =
    row.registrationSettings && typeof row.registrationSettings === "object"
      ? row.registrationSettings
      : {};
  const parsedSmartRules = eventDraftSmartRulesSchema.safeParse(
    registrationSettings.smartRules,
  );

  return {
    id: row.id,
    slug: row.slug,
    status: "draft",
    title: row.title,
    shortSummary: row.shortSummary ?? undefined,
    description: row.description ?? undefined,
    kind,
    media: parsedMedia.success ? parsedMedia.data : [],
    location: {
      ...location,
      venueId: row.venueId ?? undefined,
      courtIds: row.courtId ? [row.courtId] : [],
    },
    timezone: row.timezone,
    localStartsAt: venueLocalDateTime(row.startsAt, row.timezone),
    localEndsAt: venueLocalDateTime(row.endsAt, row.timezone),
    divisions: divisionRows.map((division) => {
      const settings = division.settings;
      const teamFormat = settingChoice(
        settings.teamFormat,
        [
          "solo",
          "doubles",
          "three-person",
          "four-person",
          "six-person",
        ] as const,
        division.teamSize === 1
          ? "solo"
          : division.teamSize === 3
            ? "three-person"
            : division.teamSize === 4
              ? "four-person"
              : division.teamSize >= 6
                ? "six-person"
                : "doubles",
      );
      const maximumTeams = Math.max(
        division.minimumTeams,
        division.maximumTeams ??
          Math.max(1, Math.ceil(division.capacity / division.teamSize)),
      );
      const rawPoolPlay =
        settings.poolPlay && typeof settings.poolPlay === "object"
          ? (settings.poolPlay as Record<string, unknown>)
          : {};
      const teamsPerPool = Math.max(
        2,
        Math.min(
          maximumTeams,
          Math.round(settingNumber(rawPoolPlay.teamsPerPool) ?? 4),
        ),
      );
      const teamsAdvancing = Math.max(
        1,
        Math.min(
          teamsPerPool,
          Math.round(settingNumber(rawPoolPlay.teamsAdvancing) ?? 2),
        ),
      );
      const ratingMinimum = settingNumber(settings.ratingMinimum);
      const ratingMaximum = settingNumber(settings.ratingMaximum);
      const ageMinimum = settingNumber(settings.ageMinimum);
      const ageMaximum = settingNumber(settings.ageMaximum);
      return {
        id: division.id,
        name: division.name,
        description: division.description ?? undefined,
        minimumTeams: division.minimumTeams,
        maximumTeams,
        teamFormat,
        surface: settingChoice(
          settings.surface,
          ["sand", "grass", "water", "indoor-sand"] as const,
          division.discipline === "grass"
            ? "grass"
            : division.discipline === "indoor"
              ? "indoor-sand"
              : "sand",
        ),
        gender: settingChoice(
          settings.gender,
          ["mens", "womens", "coed", "open"] as const,
          "open",
        ),
        priceBasis: settingChoice(
          division.priceBasis,
          ["per-person", "per-team"] as const,
          "per-team",
        ),
        priceMinor: division.entryFeeMinor,
        ratingEnabled:
          ratingMinimum !== undefined && ratingMaximum !== undefined,
        ratingMinimum,
        ratingMaximum,
        ageEnabled: ageMinimum !== undefined && ageMaximum !== undefined,
        ageMinimum:
          ageMinimum === undefined
            ? undefined
            : Math.max(0, Math.round(ageMinimum)),
        ageMaximum:
          ageMaximum === undefined
            ? undefined
            : Math.max(1, Math.round(ageMaximum)),
        tournamentFormat: settingChoice(
          settings.tournamentFormat,
          [
            "kob-qob",
            "single-elimination",
            "double-elimination-true",
            "double-elimination-crossover",
          ] as const,
          "double-elimination-true",
        ),
        poolPlay: {
          enabled:
            typeof rawPoolPlay.enabled === "boolean"
              ? rawPoolPlay.enabled
              : true,
          teamsPerPool,
          format: settingChoice(
            rawPoolPlay.format,
            ["full", "olympic-crossover"] as const,
            "full",
          ),
          teamsAdvancing,
        },
        seeding: settingChoice(
          settings.seeding ?? division.ratingBasis,
          [
            "first-come",
            "sand-rating-score",
            "sand-rating-best-8",
            "sand-rating-ttm",
            "manual",
          ] as const,
          "sand-rating-best-8",
        ),
      };
    }),
    tickets: ticketTypeRows.map((ticket) => ({
      id: ticket.id,
      name: ticket.name,
      description: ticket.description ?? undefined,
      priceMinor: ticket.priceMinor,
      quantity: ticket.quantity ?? undefined,
      waitlistEnabled: ticket.waitlistEnabled,
      approvalRequired: ticket.approvalRequired,
      availableOnline: ticket.availableOnline,
      availableInPerson: ticket.availableInPerson,
    })),
    features: parsedFeatures.success ? parsedFeatures.data : [],
    policies: parsedPolicies.success ? parsedPolicies.data : [],
    smartRules: parsedSmartRules.success
      ? parsedSmartRules.data
      : {
          waitlistEnabled: true,
          allowLateCancellation: false,
          freeCancellationHours: 24,
          bookingOpensDays: 90,
          bookingClosesMinutes: 60,
          autoCancelLowAttendance: false,
          minimumAttendance: 4,
          approvalRequired: false,
        },
    recurrence: parsedRecurrence.success ? parsedRecurrence.data : undefined,
  };
}

export async function createPlayerInvitation(input: {
  readonly actor: ApiActor;
  readonly invitedName: string;
  readonly invitedEmail?: string;
  readonly invitedPhoneE164?: string;
  readonly relationship: "player" | "member";
  readonly isMinor: boolean;
  readonly guardianName?: string;
  readonly guardianEmail?: string;
  readonly guardianPhoneE164?: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Confirm the invitation recipient before sending.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const organization = await organizationRow(organizationId);
  const invitedName = input.invitedName.trim();
  const invitedEmail = input.invitedEmail?.trim().toLowerCase() || undefined;
  const invitedPhoneE164 = input.invitedPhoneE164?.trim() || undefined;
  const guardianName = input.guardianName?.trim() || undefined;
  const guardianEmail = input.guardianEmail?.trim().toLowerCase() || undefined;
  const guardianPhoneE164 = input.guardianPhoneE164?.trim() || undefined;
  if (!invitedName) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Enter the player's name.",
    );
  }
  if (input.isMinor && !guardianEmail && !guardianPhoneE164) {
    throw new OperatorServiceError(
      "DELIVERY_DESTINATION_MISSING",
      "A parent or guardian email or phone number is required for a minor.",
    );
  }
  if (!input.isMinor && !invitedEmail && !invitedPhoneE164) {
    throw new OperatorServiceError(
      "DELIVERY_DESTINATION_MISSING",
      "Enter an email address or mobile number for the player.",
    );
  }
  const id = crypto.randomUUID();
  const inviteToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    "-",
    "",
  );
  const expiresAt = new Date(input.now.getTime() + 14 * 24 * 60 * 60_000);
  const targetPhone = input.isMinor ? guardianPhoneE164 : invitedPhoneE164;
  const targetEmail = input.isMinor ? guardianEmail : invitedEmail;
  const deliveryChannel = targetPhone
    ? "sms"
    : targetEmail
      ? "email"
      : undefined;
  const values = {
    invitedName,
    invitedEmail,
    invitedPhoneE164,
    isMinor: input.isMinor,
    guardianName,
    guardianEmail,
    guardianPhoneE164,
    relationship: input.relationship,
    deliveryChannel,
    expiresAt,
  };
  const database = getDatabase();
  await database.batch([
    database.insert(organizationInvitations).values({
      id,
      organizationId,
      invitedByPersonId: input.actor.personId,
      inviteToken,
      ...values,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "player-invitation.created",
      entityType: "player-invitation",
      entityId: id,
      afterHash: stableHash({
        ...values,
        expiresAt: expiresAt.toISOString(),
      }),
      reason: input.isMinor
        ? "Operator invited a minor through a parent or guardian."
        : "Operator invited a player to the organization.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);

  if (targetPhone) {
    const delivery = await sendTemplateSms({
      to: targetPhone,
      templateName:
        process.env.SENT_DM_PLAYER_INVITE_TEMPLATE_NAME ??
        "duna_player_invitation",
      parameters: {
        organization_name: organization.name,
        player_name: invitedName,
        inviter_name: input.actor.displayName,
        invite_url: playerInvitationUrl(inviteToken),
      },
      idempotencyKey: `player-invite:${id}`,
    }).catch((error: unknown) => ({
      configured: true,
      sent: false,
      messageId: undefined,
      reason:
        error instanceof Error
          ? error.message
          : "SMS delivery did not complete.",
    }));
    await database
      .update(organizationInvitations)
      .set({
        deliveryStatus: delivery.configured
          ? delivery.sent
            ? "sent"
            : "failed"
          : "not-configured",
        deliveryMessageId: delivery.messageId,
        updatedAt: input.now,
      })
      .where(eq(organizationInvitations.id, id));
  }

  return {
    id,
    entity: "player-invitation",
    status:
      deliveryChannel === "sms" && isSentConfigured()
        ? "sent"
        : "invite-created",
  };
}

export async function createStaffInvitation(input: {
  readonly actor: ApiActor;
  readonly invitedName: string;
  readonly invitedEmail?: string;
  readonly invitedPhoneE164?: string;
  readonly role: "coach" | "director" | "manager" | "front-desk" | "accountant";
  readonly workerClassification: "1099-contractor" | "w2-employee";
  readonly preferredChannel?: "email" | "sms";
  readonly deliveryMode?: "send" | "link-only";
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Confirm the team member, role, and worker classification.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const organization = await organizationRow(organizationId);
  const invitedName = input.invitedName.trim();
  const invitedEmail = input.invitedEmail?.trim().toLowerCase() || undefined;
  const invitedPhoneE164 = input.invitedPhoneE164?.trim() || undefined;
  if (!invitedName) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Enter the team member's name.",
    );
  }
  const deliveryMode = input.deliveryMode ?? "send";
  if (deliveryMode === "send" && !invitedEmail && !invitedPhoneE164) {
    throw new OperatorServiceError(
      "DELIVERY_DESTINATION_MISSING",
      "Enter an email address or mobile number for the team member.",
    );
  }
  const deliveryChannel =
    deliveryMode === "link-only"
      ? undefined
      : input.preferredChannel === "sms" && invitedPhoneE164
        ? "sms"
        : invitedEmail
          ? "email"
          : "sms";
  const id = crypto.randomUUID();
  const inviteToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    "-",
    "",
  );
  const expiresAt = new Date(input.now.getTime() + 7 * 24 * 60 * 60_000);
  const database = getDatabase();
  await database.batch([
    database.insert(organizationStaffInvitations).values({
      id,
      organizationId,
      invitedByPersonId: input.actor.personId,
      inviteToken,
      invitedName,
      invitedEmail,
      invitedPhoneE164,
      role: input.role,
      workerClassification: input.workerClassification,
      deliveryChannel,
      expiresAt,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "staff-invitation.created",
      entityType: "staff-invitation",
      entityId: id,
      afterHash: stableHash({
        invitedName,
        invitedEmail,
        invitedPhoneE164,
        role: input.role,
        workerClassification: input.workerClassification,
        expiresAt: expiresAt.toISOString(),
      }),
      reason:
        "Operator invited a team member and set the organization-controlled worker classification.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);

  const inviteUrl = staffInvitationUrl(inviteToken);
  const delivery =
    deliveryMode === "link-only"
      ? {
          configured: false,
          sent: false,
          messageId: undefined,
          reason: "A private claim link was created without sending it.",
        }
      : deliveryChannel === "email" && invitedEmail
        ? await sendTransactionalEmail({
            to: invitedEmail,
            subject: `Join ${organization.name} on Duna`,
            text: [
              `${input.actor.displayName} invited you to join ${organization.name} as ${input.role.replaceAll("-", " ")}.`,
              "",
              `Your worker classification is set by the organization as ${input.workerClassification === "w2-employee" ? "W-2 employee" : "1099 contractor"}. You can complete your own contact, address, availability, and goals after accepting.`,
              "",
              `Accept your invitation: ${inviteUrl}`,
              "",
              "This invitation expires in 7 days.",
            ].join("\n"),
            idempotencyKey: `staff-invite:${id}`,
          }).catch((error: unknown) => ({
            configured: true,
            sent: false,
            messageId: undefined,
            reason:
              error instanceof Error
                ? error.message
                : "Email delivery did not complete.",
          }))
        : invitedPhoneE164
          ? await sendTemplateSms({
              to: invitedPhoneE164,
              templateName:
                process.env.SENT_DM_STAFF_INVITE_TEMPLATE_NAME ??
                "duna_staff_invitation",
              parameters: {
                organization_name: organization.name,
                invited_name: invitedName,
                inviter_name: input.actor.displayName,
                role: input.role.replaceAll("-", " "),
                invite_url: inviteUrl,
              },
              idempotencyKey: `staff-invite:${id}`,
            }).catch((error: unknown) => ({
              configured: true,
              sent: false,
              messageId: undefined,
              reason:
                error instanceof Error
                  ? error.message
                  : "SMS delivery did not complete.",
            }))
          : {
              configured: false,
              sent: false,
              messageId: undefined,
              reason: "No delivery destination was available.",
            };
  await database
    .update(organizationStaffInvitations)
    .set({
      deliveryStatus: delivery.configured
        ? delivery.sent
          ? "sent"
          : "failed"
        : "not-configured",
      deliveryMessageId: delivery.messageId,
      updatedAt: input.now,
    })
    .where(eq(organizationStaffInvitations.id, id));

  return {
    id,
    entity: "staff-invitation",
    status: delivery.sent ? "sent" : "invite-created",
  };
}

export async function loadStaffInvitation(
  inviteToken: string,
  now = new Date(),
): Promise<{
  readonly id: string;
  readonly organizationName: string;
  readonly invitedName: string;
  readonly role: "coach" | "director" | "manager" | "front-desk" | "accountant";
  readonly workerClassification: "1099-contractor" | "w2-employee";
  readonly status: "pending" | "claimed" | "expired" | "cancelled";
  readonly expiresAt: string;
}> {
  requireDatabase();
  const row = await getDatabase()
    .select({
      id: organizationStaffInvitations.id,
      invitedName: organizationStaffInvitations.invitedName,
      role: organizationStaffInvitations.role,
      workerClassification: organizationStaffInvitations.workerClassification,
      status: organizationStaffInvitations.status,
      expiresAt: organizationStaffInvitations.expiresAt,
      organizationName: organizations.name,
    })
    .from(organizationStaffInvitations)
    .innerJoin(
      organizations,
      eq(organizationStaffInvitations.organizationId, organizations.id),
    )
    .where(eq(organizationStaffInvitations.inviteToken, inviteToken))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) {
    throw new OperatorServiceError(
      "INVITATION_NOT_FOUND",
      "This team invitation could not be found.",
    );
  }
  const status =
    row.status === "claimed" ||
    row.status === "cancelled" ||
    row.status === "expired"
      ? row.status
      : row.expiresAt <= now
        ? "expired"
        : "pending";
  const role =
    row.role === "director" ||
    row.role === "manager" ||
    row.role === "front-desk" ||
    row.role === "accountant"
      ? row.role
      : "coach";
  return {
    id: row.id,
    organizationName: row.organizationName,
    invitedName: row.invitedName,
    role,
    workerClassification:
      row.workerClassification === "w2-employee"
        ? "w2-employee"
        : "1099-contractor",
    status,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function claimStaffInvitation(input: {
  readonly actor: ApiActor;
  readonly inviteToken: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const database = getDatabase();
  let invitationId = "";
  await database.transaction(async (transaction) => {
    const claimed = await transaction
      .update(organizationStaffInvitations)
      .set({
        status: "claimed",
        claimedByPersonId: input.actor.personId,
        claimedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(organizationStaffInvitations.inviteToken, input.inviteToken),
          eq(organizationStaffInvitations.status, "pending"),
          gt(organizationStaffInvitations.expiresAt, input.now),
        ),
      )
      .returning();
    const invitation = claimed[0];
    if (!invitation) {
      const existing =
        await transaction.query.organizationStaffInvitations.findFirst({
          where: eq(
            organizationStaffInvitations.inviteToken,
            input.inviteToken,
          ),
        });
      if (!existing) {
        throw new OperatorServiceError(
          "INVITATION_NOT_FOUND",
          "This team invitation could not be found.",
        );
      }
      throw new OperatorServiceError(
        existing.status === "claimed"
          ? "INVITATION_ALREADY_CLAIMED"
          : "INVITATION_EXPIRED",
        existing.status === "claimed"
          ? "This team invitation has already been claimed."
          : "This team invitation is no longer active.",
      );
    }
    invitationId = invitation.id;
    const staffRole =
      invitation.role === "director" ||
      invitation.role === "manager" ||
      invitation.role === "front-desk" ||
      invitation.role === "accountant"
        ? invitation.role
        : "coach";
    const membershipRole = staffRole === "director" ? "manager" : staffRole;
    await transaction
      .insert(organizationMemberships)
      .values({
        organizationId: invitation.organizationId,
        personId: input.actor.personId,
        role: membershipRole,
        scopes:
          membershipRole === "coach"
            ? ["sessions:read", "sessions:write", "members:read"]
            : membershipRole === "accountant"
              ? ["reports:read", "payments:read"]
              : [
                  "sessions:read",
                  "sessions:write",
                  "members:read",
                  "members:write",
                  "reports:read",
                ],
        active: true,
      })
      .onConflictDoUpdate({
        target: [
          organizationMemberships.organizationId,
          organizationMemberships.personId,
          organizationMemberships.role,
        ],
        set: { active: true, updatedAt: input.now },
      });
    await transaction
      .insert(organizationStaffProfiles)
      .values({
        organizationId: invitation.organizationId,
        personId: input.actor.personId,
        staffRole,
        workerClassification:
          invitation.workerClassification === "w2-employee"
            ? "w2-employee"
            : "1099-contractor",
      })
      .onConflictDoUpdate({
        target: [
          organizationStaffProfiles.organizationId,
          organizationStaffProfiles.personId,
        ],
        set: {
          staffRole,
          workerClassification:
            invitation.workerClassification === "w2-employee"
              ? "w2-employee"
              : "1099-contractor",
          active: true,
          updatedAt: input.now,
        },
      });
    await transaction.insert(auditLog).values({
      organizationId: invitation.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "staff-invitation.claimed",
      entityType: "staff-invitation",
      entityId: invitation.id,
      afterHash: stableHash({
        personId: input.actor.personId,
        role: staffRole,
        workerClassification: invitation.workerClassification,
      }),
      reason:
        "Team member accepted the organization-assigned role and worker classification.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: invitationId,
    entity: "staff-invitation",
    status: "claimed",
  };
}

export async function updateStaffProfile(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly displayName: string;
  readonly role: "coach" | "director" | "manager" | "front-desk" | "accountant";
  readonly workerClassification: "not-set" | "1099-contractor" | "w2-employee";
  readonly compensationModel:
    "not-set" | "hourly" | "profit-share" | "hourly-plus-profit-share";
  readonly hourlyRateMinor?: number;
  readonly profitShareBps?: number;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly availability: readonly {
    readonly weekday: number;
    readonly startsAt: string;
    readonly endsAt: string;
  }[];
  readonly incomeGoalMinor?: number;
  readonly incomeGoalPeriod?: "week" | "month" | "quarter" | "year";
  readonly active: boolean;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Review and confirm this team member update.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 80) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Display name must be between 2 and 80 characters.",
    );
  }
  if (
    (input.compensationModel === "hourly" ||
      input.compensationModel === "hourly-plus-profit-share") &&
    input.hourlyRateMinor === undefined
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Add the hourly rate for this compensation model.",
    );
  }
  if (
    (input.compensationModel === "profit-share" ||
      input.compensationModel === "hourly-plus-profit-share") &&
    input.profitShareBps === undefined
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Add the profit-share percentage for this compensation model.",
    );
  }
  if (
    input.profitShareBps !== undefined &&
    (input.profitShareBps < 0 || input.profitShareBps > 10_000)
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Profit share must be between 0% and 100%.",
    );
  }
  if (
    input.availability.some(
      (block) =>
        block.weekday < 0 ||
        block.weekday > 6 ||
        !/^\d{2}:\d{2}$/.test(block.startsAt) ||
        !/^\d{2}:\d{2}$/.test(block.endsAt) ||
        block.startsAt >= block.endsAt,
    )
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Every availability window needs a valid day, start, and end time.",
    );
  }
  const database = getDatabase();
  const current = await database.query.organizationStaffProfiles.findFirst({
    where: and(
      eq(organizationStaffProfiles.organizationId, organizationId),
      eq(organizationStaffProfiles.personId, input.personId),
    ),
  });
  if (!current) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "This team member is not connected to the organization.",
    );
  }
  const scopes =
    input.role === "coach"
      ? ["sessions:read", "sessions:write", "members:read"]
      : input.role === "accountant"
        ? ["reports:read", "payments:read"]
        : [
            "sessions:read",
            "sessions:write",
            "members:read",
            "members:write",
            "reports:read",
          ];
  const membershipRole = input.role === "director" ? "manager" : input.role;
  const values = {
    staffRole: input.role,
    workerClassification: input.workerClassification,
    compensationModel: input.compensationModel,
    hourlyRateMinor:
      input.compensationModel === "hourly" ||
      input.compensationModel === "hourly-plus-profit-share"
        ? input.hourlyRateMinor
        : null,
    profitShareBps:
      input.compensationModel === "profit-share" ||
      input.compensationModel === "hourly-plus-profit-share"
        ? input.profitShareBps
        : null,
    addressLine1: input.addressLine1?.trim() || null,
    addressLine2: input.addressLine2?.trim() || null,
    locality: input.locality?.trim() || null,
    administrativeArea: input.administrativeArea?.trim() || null,
    postalCode: input.postalCode?.trim() || null,
    countryCode: input.countryCode.toUpperCase(),
    googlePlaceId: input.googlePlaceId?.trim() || null,
    latitude: input.latitude,
    longitude: input.longitude,
    availability: input.availability,
    incomeGoalMinor: input.incomeGoalMinor,
    incomeGoalPeriod: input.incomeGoalPeriod,
    active: input.active,
    updatedAt: input.now,
  };
  await database.transaction(async (transaction) => {
    await transaction
      .update(people)
      .set({ displayName, updatedAt: input.now })
      .where(eq(people.id, input.personId));
    await transaction
      .update(organizationMemberships)
      .set({ active: false, updatedAt: input.now })
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.personId, input.personId),
          inArray(organizationMemberships.role, [
            "coach",
            "manager",
            "front-desk",
            "accountant",
          ]),
        ),
      );
    await transaction
      .insert(organizationMemberships)
      .values({
        organizationId,
        personId: input.personId,
        role: membershipRole,
        scopes,
        active: input.active,
      })
      .onConflictDoUpdate({
        target: [
          organizationMemberships.organizationId,
          organizationMemberships.personId,
          organizationMemberships.role,
        ],
        set: { scopes, active: input.active, updatedAt: input.now },
      });
    await transaction
      .update(organizationStaffProfiles)
      .set(values)
      .where(eq(organizationStaffProfiles.id, current.id));
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "staff-profile.updated",
      entityType: "staff-profile",
      entityId: current.id,
      beforeHash: stableHash(current),
      afterHash: stableHash({
        ...values,
        displayName,
        role: input.role,
        scopes,
      }),
      reason:
        "Organization administrator updated display name, role, classification, compensation, availability, goals, or payroll-readiness details.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: current.id,
    entity: "staff-profile",
    status: input.active ? "active" : "inactive",
  };
}

export async function loadPlayerInvitation(
  inviteToken: string,
  now = new Date(),
): Promise<PlayerInvitation> {
  requireDatabase();
  const row = await getDatabase()
    .select({
      id: organizationInvitations.id,
      invitedName: organizationInvitations.invitedName,
      isMinor: organizationInvitations.isMinor,
      guardianName: organizationInvitations.guardianName,
      relationship: organizationInvitations.relationship,
      status: organizationInvitations.status,
      expiresAt: organizationInvitations.expiresAt,
      organizationName: organizations.name,
    })
    .from(organizationInvitations)
    .innerJoin(
      organizations,
      eq(organizationInvitations.organizationId, organizations.id),
    )
    .where(eq(organizationInvitations.inviteToken, inviteToken))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) {
    throw new OperatorServiceError(
      "INVITATION_NOT_FOUND",
      "This invitation could not be found.",
    );
  }
  const status =
    row.status === "claimed" ||
    row.status === "cancelled" ||
    row.status === "expired"
      ? row.status
      : row.expiresAt <= now
        ? "expired"
        : "pending";
  return {
    id: row.id,
    organizationName: row.organizationName,
    invitedName: row.invitedName,
    isMinor: row.isMinor,
    guardianName: row.guardianName ?? undefined,
    relationship: row.relationship === "member" ? "member" : "player",
    status,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function claimPlayerInvitation(input: {
  readonly actor: ApiActor;
  readonly inviteToken: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<PlayerInvitationClaimResult> {
  requireDatabase();
  const database = getDatabase();
  const invitation = await database.query.organizationInvitations.findFirst({
    where: eq(organizationInvitations.inviteToken, input.inviteToken),
  });
  if (!invitation) {
    throw new OperatorServiceError(
      "INVITATION_NOT_FOUND",
      "This invitation could not be found.",
    );
  }
  if (invitation.status === "claimed") {
    throw new OperatorServiceError(
      "INVITATION_ALREADY_CLAIMED",
      "This invitation has already been claimed.",
    );
  }
  if (invitation.status !== "pending" || invitation.expiresAt <= input.now) {
    throw new OperatorServiceError(
      "INVITATION_EXPIRED",
      "This invitation is no longer active.",
    );
  }
  if (invitation.isMinor && input.actor.ageBand !== "adult") {
    throw new OperatorServiceError(
      "RECIPIENT_NOT_ELIGIBLE",
      "A parent or guardian who is 18 or older must accept this invitation.",
    );
  }

  const childId = invitation.isMinor ? crypto.randomUUID() : undefined;
  const participantPersonId = childId ?? input.actor.personId;
  const relationship =
    invitation.relationship === "member" ? "member" : "player";
  const childHandle = childId
    ? await uniquePersonHandle(invitation.invitedName)
    : undefined;

  const afterHash = stableHash({
    participantPersonId,
    guardianReviewRequired: Boolean(childId),
  });
  const claimReason = childId
    ? "Guardian accepted an invitation and created a protected minor profile."
    : "Player accepted an organization invitation.";
  const claimResult =
    childId && childHandle
      ? await database.execute(sql`
          WITH claimed AS (
            UPDATE ${organizationInvitations}
               SET "status" = 'claimed',
                   "claimed_by_person_id" = ${input.actor.personId}::uuid,
                   "claimed_person_id" = ${participantPersonId}::uuid,
                   "claimed_at" = ${input.now}::timestamptz,
                   "updated_at" = ${input.now}::timestamptz
             WHERE "id" = ${invitation.id}::uuid
               AND "status" = 'pending'
               AND "expires_at" > ${input.now}::timestamptz
            RETURNING "organization_id", "invited_by_person_id"
          ),
          child_profile AS (
            INSERT INTO ${people} (
              "id",
              "display_name",
              "handle",
              "profile_claim_status",
              "is_minor",
              "age_band",
              "profile_visibility"
            )
            SELECT
              ${childId}::uuid,
              ${invitation.invitedName},
              ${childHandle},
              'claim-pending',
              true,
              'unknown',
              'private'
            FROM claimed
            RETURNING "id"
          ),
          player_participant AS (
            INSERT INTO ${organizationParticipants} (
              "organization_id",
              "person_id",
              "relationship",
              "status",
              "added_by_person_id",
              "joined_at"
            )
            SELECT
              "organization_id",
              ${participantPersonId}::uuid,
              ${relationship},
              'active',
              "invited_by_person_id",
              ${input.now}::timestamptz
            FROM claimed
            ON CONFLICT ("organization_id", "person_id", "relationship")
            DO NOTHING
            RETURNING "id"
          ),
          guardian_participant AS (
            INSERT INTO ${organizationParticipants} (
              "organization_id",
              "person_id",
              "relationship",
              "status",
              "added_by_person_id",
              "joined_at"
            )
            SELECT
              "organization_id",
              ${input.actor.personId}::uuid,
              'guardian',
              'active',
              "invited_by_person_id",
              ${input.now}::timestamptz
            FROM claimed
            ON CONFLICT ("organization_id", "person_id", "relationship")
            DO NOTHING
            RETURNING "id"
          ),
          guardian_link AS (
            INSERT INTO ${guardianships} (
              "guardian_id",
              "minor_id",
              "relationship",
              "verified",
              "review_status",
              "created_at"
            )
            SELECT
              ${input.actor.personId}::uuid,
              ${childId}::uuid,
              'parent-or-guardian',
              false,
              'pending',
              ${input.now}::timestamptz
            FROM claimed
            ON CONFLICT ("guardian_id", "minor_id") DO NOTHING
            RETURNING "minor_id"
          ),
          audited AS (
            INSERT INTO ${auditLog} (
              "organization_id",
              "actor_person_id",
              "actor_type",
              "action",
              "entity_type",
              "entity_id",
              "after_hash",
              "reason",
              "trace_id",
              "ip_address",
              "created_at"
            )
            SELECT
              "organization_id",
              ${input.actor.personId}::uuid,
              'person',
              'player-invitation.claimed',
              'player-invitation',
              ${invitation.id},
              ${afterHash},
              ${claimReason},
              ${input.requestId},
              ${input.ipAddress ?? null},
              ${input.now}::timestamptz
            FROM claimed
            RETURNING "id"
          )
          SELECT "organization_id" FROM claimed
        `)
      : await database.execute(sql`
          WITH claimed AS (
            UPDATE ${organizationInvitations}
               SET "status" = 'claimed',
                   "claimed_by_person_id" = ${input.actor.personId}::uuid,
                   "claimed_person_id" = ${participantPersonId}::uuid,
                   "claimed_at" = ${input.now}::timestamptz,
                   "updated_at" = ${input.now}::timestamptz
             WHERE "id" = ${invitation.id}::uuid
               AND "status" = 'pending'
               AND "expires_at" > ${input.now}::timestamptz
            RETURNING "organization_id", "invited_by_person_id"
          ),
          player_participant AS (
            INSERT INTO ${organizationParticipants} (
              "organization_id",
              "person_id",
              "relationship",
              "status",
              "added_by_person_id",
              "joined_at"
            )
            SELECT
              "organization_id",
              ${participantPersonId}::uuid,
              ${relationship},
              'active',
              "invited_by_person_id",
              ${input.now}::timestamptz
            FROM claimed
            ON CONFLICT ("organization_id", "person_id", "relationship")
            DO NOTHING
            RETURNING "id"
          ),
          audited AS (
            INSERT INTO ${auditLog} (
              "organization_id",
              "actor_person_id",
              "actor_type",
              "action",
              "entity_type",
              "entity_id",
              "after_hash",
              "reason",
              "trace_id",
              "ip_address",
              "created_at"
            )
            SELECT
              "organization_id",
              ${input.actor.personId}::uuid,
              'person',
              'player-invitation.claimed',
              'player-invitation',
              ${invitation.id},
              ${afterHash},
              ${claimReason},
              ${input.requestId},
              ${input.ipAddress ?? null},
              ${input.now}::timestamptz
            FROM claimed
            RETURNING "id"
          )
          SELECT "organization_id" FROM claimed
        `);
  if (claimResult.rows.length === 0) {
    throw new OperatorServiceError(
      "INVITATION_ALREADY_CLAIMED",
      "This invitation was claimed in another session.",
    );
  }

  return {
    invitationId: invitation.id,
    organizationId: invitation.organizationId,
    participantPersonId,
    guardianReviewRequired: Boolean(childId),
    status: "claimed",
  };
}

export async function createRatePlan(input: {
  readonly actor: ApiActor;
  readonly name: string;
  readonly baseAmountMinor: number;
  readonly memberAmountMinor?: number;
  readonly nonMemberAmountMinor?: number;
  readonly rateUnitMinutes: number;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PRICE_CONFIRMATION_REQUIRED",
      "Confirm the exact prices before creating this rate plan.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const organization = await organizationRow(organizationId);
  const id = crypto.randomUUID();
  const values = {
    name: input.name.trim(),
    currency: currency(organization.currency),
    baseAmountMinor: input.baseAmountMinor,
    memberAmountMinor: input.memberAmountMinor,
    nonMemberAmountMinor: input.nonMemberAmountMinor,
    rateUnitMinutes: input.rateUnitMinutes,
  };
  const database = getDatabase();
  await database.batch([
    database.insert(ratePlans).values({
      id,
      organizationId,
      ...values,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "rate-plan.created",
      entityType: "rate-plan",
      entityId: id,
      afterHash: stableHash(values),
      reason: "Operator confirmed and created an auditable court rate plan.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, entity: "rate-plan", status: "active" };
}

export async function createVenue(input: {
  readonly actor: ApiActor;
  readonly name: string;
  readonly locationKind: "public-location" | "private-venue";
  readonly environment: "indoor" | "outdoor";
  readonly description?: string;
  readonly capacity?: number;
  readonly heroImageUrl?: string;
  readonly amenities?: readonly string[];
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly timezone: string;
  readonly temporary: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  await organizationRow(organizationId);
  const id = crypto.randomUUID();
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Latitude and longitude must be provided together.",
    );
  }
  const values = {
    name: input.name.trim(),
    locationKind: input.locationKind,
    environment: input.environment,
    description: input.description?.trim() || undefined,
    slug: await uniqueVenueSlug(organizationId, input.name),
    status: "draft" as const,
    temporary: input.temporary,
    capacity: input.capacity ?? 0,
    heroImageUrl: input.heroImageUrl?.trim() || undefined,
    amenities: (input.amenities ?? [])
      .map((amenity) => amenity.trim())
      .filter(Boolean),
    addressLine1: input.addressLine1?.trim() || undefined,
    addressLine2: input.addressLine2?.trim() || undefined,
    locality: input.locality?.trim() || undefined,
    administrativeArea: input.administrativeArea?.trim() || undefined,
    postalCode: input.postalCode?.trim() || undefined,
    countryCode: input.countryCode.toUpperCase(),
    googlePlaceId: input.googlePlaceId?.trim() || undefined,
    latitude: input.latitude,
    longitude: input.longitude,
    timezone: timeZone(input.timezone),
  };
  const database = getDatabase();
  await database.batch([
    database.insert(venues).values({
      id,
      organizationId,
      ...values,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "venue.created",
      entityType: "venue",
      entityId: id,
      afterHash: stableHash(values),
      reason:
        input.locationKind === "public-location"
          ? "Operator created a public location draft."
          : "Operator created a private venue draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, entity: "venue", status: "draft" };
}

export async function createCourt(input: {
  readonly actor: ApiActor;
  readonly venueId: string;
  readonly name: string;
  readonly surface: string;
  readonly imageUrl?: string;
  readonly lit: boolean;
  readonly capacity?: number;
  readonly bookingPolicy: "public" | "members" | "tiers" | "staff" | "none";
  readonly ratePlanId?: string;
  readonly minimumDurationMinutes: number;
  readonly maximumDurationMinutes: number;
  readonly durationOptionsMinutes?: readonly number[];
  readonly bookingIncrementMinutes?: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly minimumNoticeMinutes: number;
  readonly maximumAdvanceDays: number;
  readonly cancellationPolicy?: {
    readonly title: string;
    readonly markdown: string;
    readonly refundBeforeHours?: number;
    readonly creditBeforeHours?: number;
    readonly lateCancellation?: string;
    readonly requireFullScroll: boolean;
  };
  readonly weeklySchedule?: readonly {
    readonly weekday: number;
    readonly startsAtMinute: number;
    readonly endsAtMinute: number;
    readonly mode:
      | "open"
      | "rentals-only"
      | "members-only"
      | "private-lessons-only"
      | "group-only"
      | "league-reserved"
      | "maintenance"
      | "blocked";
  }[];
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const venue = await database.query.venues.findFirst({
    where: eq(venues.id, input.venueId),
  });
  if (!venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue was not found.",
    );
  }
  if (venue.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Venue belongs to another organization.",
    );
  }
  if (
    input.bookingPolicy === "members" ||
    input.bookingPolicy === "tiers" ||
    input.weeklySchedule?.some((block) => block.mode === "members-only")
  ) {
    await requireActiveMembershipOffer(organizationId);
  }
  if (input.maximumDurationMinutes < input.minimumDurationMinutes) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Maximum duration must be at least the minimum duration.",
    );
  }
  const durationOptionsMinutes = [
    ...new Set(
      input.durationOptionsMinutes?.length
        ? input.durationOptionsMinutes
        : [
            input.minimumDurationMinutes,
            Math.min(90, input.maximumDurationMinutes),
            input.maximumDurationMinutes,
          ],
    ),
  ]
    .filter(
      (minutes) =>
        minutes >= input.minimumDurationMinutes &&
        minutes <= input.maximumDurationMinutes,
    )
    .sort((left, right) => left - right);
  if (durationOptionsMinutes.length === 0) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Configure at least one booking length inside the court duration range.",
    );
  }
  if (input.ratePlanId) {
    const ratePlan = await database.query.ratePlans.findFirst({
      where: eq(ratePlans.id, input.ratePlanId),
    });
    if (!ratePlan) {
      throw new OperatorServiceError(
        "RESOURCE_NOT_FOUND",
        "Rate plan was not found.",
      );
    }
    if (ratePlan.organizationId !== organizationId) {
      throw new OperatorServiceError(
        "RESOURCE_WRONG_ORGANIZATION",
        "Rate plan belongs to another organization.",
      );
    }
  }
  const id = crypto.randomUUID();
  const scheduleId = crypto.randomUUID();
  const weeklySchedule = input.weeklySchedule?.length
    ? input.weeklySchedule
    : Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startsAtMinute: 8 * 60,
        endsAtMinute: 22 * 60,
        mode: "rentals-only" as const,
      }));
  const values = {
    venueId: input.venueId,
    name: input.name.trim(),
    surface: input.surface.trim().toLowerCase(),
    imageUrl: input.imageUrl?.trim() || null,
    lit: input.lit,
    capacity: input.capacity ?? 12,
    status: "draft" as const,
    bookingPolicy: input.bookingPolicy,
    ratePlanId: input.ratePlanId,
    minimumDurationMinutes: input.minimumDurationMinutes,
    maximumDurationMinutes: input.maximumDurationMinutes,
    durationOptionsMinutes,
    bookingIncrementMinutes: input.bookingIncrementMinutes ?? 30,
    bufferBeforeMinutes: input.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes,
    minimumNoticeMinutes: input.minimumNoticeMinutes,
    maximumAdvanceDays: input.maximumAdvanceDays,
    cancellationPolicy:
      input.cancellationPolicy ??
      ({
        title: "Reservation cancellation policy",
        markdown:
          "Cancel at least 24 hours before your reservation for a refund to the original payment method. Later cancellations are non-refundable.",
        refundBeforeHours: 24,
        creditBeforeHours: 2,
        lateCancellation: "Non-refundable inside 24 hours.",
        requireFullScroll: true,
      } as const),
  };
  await database.batch([
    database.insert(courts).values({
      id,
      ...values,
      qrToken: crypto.randomUUID().replaceAll("-", ""),
    }),
    database.insert(schedules).values({
      id: scheduleId,
      organizationId,
      name: `${input.name.trim()} availability`,
      timezone: venue.timezone,
      resourceType: "court",
      resourceId: id,
    }),
    database.insert(scheduleBlocks).values(
      weeklySchedule.map((block) => ({
        scheduleId,
        weekday: block.weekday,
        startsAtMinute: block.startsAtMinute,
        endsAtMinute: block.endsAtMinute,
        mode: block.mode,
      })),
    ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "court.created",
      entityType: "court",
      entityId: id,
      afterHash: stableHash(values),
      reason: "Operator created a private court draft with booking policy.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, entity: "court", status: "draft" };
}

async function ownedCourt(actor: ApiActor, courtId: string) {
  const organizationId = requireOrganization(actor);
  const row = (
    await getDatabase()
      .select({ court: courts, venue: venues })
      .from(courts)
      .innerJoin(venues, eq(courts.venueId, venues.id))
      .where(eq(courts.id, courtId))
      .limit(1)
  )[0];
  if (!row) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Court was not found.",
    );
  }
  if (row.venue.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Court belongs to another organization.",
    );
  }
  return { ...row, organizationId };
}

export async function updateVenueProfile(input: {
  readonly actor: ApiActor;
  readonly venueId: string;
  readonly name?: string;
  readonly locationKind?: "public-location" | "private-venue";
  readonly environment?: "indoor" | "outdoor";
  readonly description?: string;
  readonly capacity: number;
  readonly heroImageUrl?: string;
  readonly amenities: readonly string[];
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly timezone?: string;
  readonly temporary?: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const venue = await database.query.venues.findFirst({
    where: eq(venues.id, input.venueId),
  });
  if (!venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue was not found.",
    );
  }
  if (venue.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Venue belongs to another organization.",
    );
  }
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Latitude and longitude must be provided together.",
    );
  }
  const values = {
    name: input.name?.trim() || venue.name,
    locationKind:
      input.locationKind ??
      (venue.locationKind === "public-location"
        ? "public-location"
        : "private-venue"),
    environment:
      input.environment ??
      (venue.environment === "indoor" ? "indoor" : "outdoor"),
    description: input.description?.trim() || null,
    capacity: input.capacity,
    heroImageUrl: input.heroImageUrl?.trim() || null,
    amenities: input.amenities.map((amenity) => amenity.trim()).filter(Boolean),
    addressLine1:
      input.addressLine1 === undefined
        ? venue.addressLine1
        : input.addressLine1.trim() || null,
    addressLine2:
      input.addressLine2 === undefined
        ? venue.addressLine2
        : input.addressLine2.trim() || null,
    locality:
      input.locality === undefined
        ? venue.locality
        : input.locality.trim() || null,
    administrativeArea:
      input.administrativeArea === undefined
        ? venue.administrativeArea
        : input.administrativeArea.trim() || null,
    postalCode:
      input.postalCode === undefined
        ? venue.postalCode
        : input.postalCode.trim() || null,
    countryCode: input.countryCode?.trim().toUpperCase() || venue.countryCode,
    googlePlaceId:
      input.googlePlaceId === undefined
        ? venue.googlePlaceId
        : input.googlePlaceId.trim() || null,
    latitude: input.latitude ?? venue.latitude,
    longitude: input.longitude ?? venue.longitude,
    timezone: input.timezone ? timeZone(input.timezone) : venue.timezone,
    temporary: input.temporary ?? venue.temporary,
    updatedAt: input.now,
  };
  await database.batch([
    database.update(venues).set(values).where(eq(venues.id, input.venueId)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "venue.profile_updated",
      entityType: "venue",
      entityId: input.venueId,
      beforeHash: stableHash({
        name: venue.name,
        locationKind: venue.locationKind,
        environment: venue.environment,
        description: venue.description,
        capacity: venue.capacity,
        heroImageUrl: venue.heroImageUrl,
        amenities: venue.amenities,
        addressLine1: venue.addressLine1,
        addressLine2: venue.addressLine2,
        locality: venue.locality,
        administrativeArea: venue.administrativeArea,
        postalCode: venue.postalCode,
        countryCode: venue.countryCode,
        googlePlaceId: venue.googlePlaceId,
        latitude: venue.latitude,
        longitude: venue.longitude,
        timezone: venue.timezone,
        temporary: venue.temporary,
      }),
      afterHash: stableHash(values),
      reason:
        "Operator updated venue identity, location, and player-facing details.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: input.venueId, entity: "venue", status: venue.status };
}

export async function updateCourtBookingConfiguration(input: {
  readonly actor: ApiActor;
  readonly courtId: string;
  readonly name?: string;
  readonly surface?: string;
  readonly imageUrl?: string;
  readonly lit?: boolean;
  readonly bookingPolicy?: "public" | "members" | "tiers" | "staff" | "none";
  readonly ratePlanId: string | null;
  readonly capacity: number;
  readonly minimumDurationMinutes?: number;
  readonly maximumDurationMinutes?: number;
  readonly durationOptionsMinutes: readonly number[];
  readonly bookingIncrementMinutes: number;
  readonly bufferBeforeMinutes?: number;
  readonly bufferAfterMinutes?: number;
  readonly minimumNoticeMinutes: number;
  readonly maximumAdvanceDays: number;
  readonly cancellationPolicy: {
    readonly title: string;
    readonly markdown: string;
    readonly refundBeforeHours?: number;
    readonly creditBeforeHours?: number;
    readonly lateCancellation?: string;
    readonly requireFullScroll: boolean;
  };
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Review and confirm the booking rules before applying them.",
    );
  }
  const { court, organizationId } = await ownedCourt(
    input.actor,
    input.courtId,
  );
  if (input.bookingPolicy === "members" || input.bookingPolicy === "tiers") {
    await requireActiveMembershipOffer(organizationId);
  }
  if (input.ratePlanId) {
    const ratePlan = await getDatabase().query.ratePlans.findFirst({
      where: eq(ratePlans.id, input.ratePlanId),
    });
    if (!ratePlan || ratePlan.organizationId !== organizationId) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Choose a rate plan owned by this organization.",
      );
    }
  }
  const minimumDurationMinutes =
    input.minimumDurationMinutes ?? court.minimumDurationMinutes;
  const maximumDurationMinutes =
    input.maximumDurationMinutes ?? court.maximumDurationMinutes;
  if (maximumDurationMinutes < minimumDurationMinutes) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Maximum duration must be at least the minimum duration.",
    );
  }
  const durationOptionsMinutes = [
    ...new Set(input.durationOptionsMinutes),
  ].sort((left, right) => left - right);
  if (
    durationOptionsMinutes.length === 0 ||
    durationOptionsMinutes.some(
      (minutes) =>
        minutes < minimumDurationMinutes || minutes > maximumDurationMinutes,
    )
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Every booking length must be inside the court duration range.",
    );
  }
  const values = {
    name: input.name?.trim() || court.name,
    surface: input.surface?.trim().toLowerCase() || court.surface,
    imageUrl:
      input.imageUrl === undefined
        ? court.imageUrl
        : input.imageUrl.trim() || null,
    lit: input.lit ?? court.lit,
    bookingPolicy: input.bookingPolicy ?? court.bookingPolicy,
    ratePlanId: input.ratePlanId,
    capacity: input.capacity,
    minimumDurationMinutes,
    maximumDurationMinutes,
    durationOptionsMinutes,
    bookingIncrementMinutes: input.bookingIncrementMinutes,
    bufferBeforeMinutes: input.bufferBeforeMinutes ?? court.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes ?? court.bufferAfterMinutes,
    minimumNoticeMinutes: input.minimumNoticeMinutes,
    maximumAdvanceDays: input.maximumAdvanceDays,
    cancellationPolicy: input.cancellationPolicy,
    updatedAt: input.now,
  };
  const database = getDatabase();
  await database.batch([
    database.update(courts).set(values).where(eq(courts.id, input.courtId)),
    database
      .update(schedules)
      .set({ name: `${values.name} availability`, updatedAt: input.now })
      .where(
        and(
          eq(schedules.resourceType, "court"),
          eq(schedules.resourceId, input.courtId),
        ),
      ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "court.booking_configuration_updated",
      entityType: "court",
      entityId: input.courtId,
      beforeHash: stableHash({
        name: court.name,
        surface: court.surface,
        imageUrl: court.imageUrl,
        lit: court.lit,
        bookingPolicy: court.bookingPolicy,
        ratePlanId: court.ratePlanId,
        capacity: court.capacity,
        minimumDurationMinutes: court.minimumDurationMinutes,
        maximumDurationMinutes: court.maximumDurationMinutes,
        durationOptionsMinutes: court.durationOptionsMinutes,
        bookingIncrementMinutes: court.bookingIncrementMinutes,
        bufferBeforeMinutes: court.bufferBeforeMinutes,
        bufferAfterMinutes: court.bufferAfterMinutes,
        minimumNoticeMinutes: court.minimumNoticeMinutes,
        maximumAdvanceDays: court.maximumAdvanceDays,
        cancellationPolicy: court.cancellationPolicy,
      }),
      afterHash: stableHash(values),
      reason: "Operator confirmed court booking and cancellation rules.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: input.courtId, entity: "court", status: court.status };
}

type ScheduleMode =
  | "open"
  | "rentals-only"
  | "members-only"
  | "private-lessons-only"
  | "group-only"
  | "league-reserved"
  | "maintenance"
  | "blocked";

function timeMatches(prompt: string): number[] {
  return [...prompt.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi)].map(
    (match) => {
      let hour = Number(match[1] ?? 0) % 12;
      const minute = Number(match[2] ?? 0);
      if (match[3]?.toLowerCase() === "pm") hour += 12;
      return hour * 60 + minute;
    },
  );
}

export function draftCourtScheduleFromPrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  const times = timeMatches(normalized);
  const mode: ScheduleMode = normalized.includes("member")
    ? "members-only"
    : normalized.includes("lesson")
      ? "private-lessons-only"
      : "rentals-only";
  const weekdayTimes: readonly [number, number] =
    times.length >= 2 ? [times[0]!, times[1]!] : [8 * 60, 22 * 60];
  const weekendTimes: readonly [number, number] =
    times.length >= 4 ? [times[2]!, times[3]!] : weekdayTimes;
  const closedDays = new Set<number>();
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  dayNames.forEach((day, index) => {
    if (
      normalized.includes(`closed ${day}`) ||
      normalized.includes(`${day} closed`)
    ) {
      closedDays.add(index);
    }
  });
  const blocks = Array.from({ length: 7 }, (_, weekday) => {
    if (closedDays.has(weekday)) return undefined;
    const [startsAtMinute, endsAtMinute] =
      weekday === 0 || weekday === 6 ? weekendTimes : weekdayTimes;
    return {
      weekday,
      startsAtMinute,
      endsAtMinute,
      mode,
    };
  }).filter((block): block is NonNullable<typeof block> => Boolean(block));
  return {
    summary: `Open ${blocks.length} days each week for ${mode.replaceAll("-", " ")}.`,
    blocks,
    assumptions: [
      times.length >= 2
        ? "Times were read from your instruction."
        : "No complete time range was found, so 8:00 AM–10:00 PM was proposed.",
      "This is a draft. Nothing changes until an operator confirms it.",
      "Existing bookings remain protected when the schedule changes.",
    ],
  };
}

export async function replaceCourtSchedule(input: {
  readonly actor: ApiActor;
  readonly courtId: string;
  readonly blocks: readonly {
    readonly weekday: number;
    readonly startsAtMinute: number;
    readonly endsAtMinute: number;
    readonly mode: ScheduleMode;
  }[];
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Confirm the proposed weekly schedule before applying it.",
    );
  }
  if (
    input.blocks.length === 0 ||
    input.blocks.some(
      (block) =>
        block.weekday < 0 ||
        block.weekday > 6 ||
        block.startsAtMinute < 0 ||
        block.endsAtMinute > 1_440 ||
        block.endsAtMinute <= block.startsAtMinute,
    )
  ) {
    throw new OperatorServiceError(
      "INVALID_SCHEDULE",
      "Every schedule block needs a valid day and start/end time.",
    );
  }
  const { court, venue, organizationId } = await ownedCourt(
    input.actor,
    input.courtId,
  );
  if (input.blocks.some((block) => block.mode === "members-only")) {
    await requireActiveMembershipOffer(organizationId);
  }
  const database = getDatabase();
  let schedule = await database.query.schedules.findFirst({
    where: and(
      eq(schedules.resourceType, "court"),
      eq(schedules.resourceId, court.id),
    ),
  });
  if (!schedule) {
    const id = crypto.randomUUID();
    await database.insert(schedules).values({
      id,
      organizationId,
      name: `${court.name} availability`,
      timezone: venue.timezone,
      resourceType: "court",
      resourceId: court.id,
    });
    schedule = await database.query.schedules.findFirst({
      where: eq(schedules.id, id),
    });
  }
  if (!schedule) {
    throw new OperatorServiceError(
      "INVALID_SCHEDULE",
      "The court schedule could not be initialized.",
    );
  }
  const previous = await database
    .select()
    .from(scheduleBlocks)
    .where(eq(scheduleBlocks.scheduleId, schedule.id));
  await database.batch([
    database
      .delete(scheduleBlocks)
      .where(eq(scheduleBlocks.scheduleId, schedule.id)),
    database.insert(scheduleBlocks).values(
      input.blocks.map((block) => ({
        scheduleId: schedule.id,
        weekday: block.weekday,
        startsAtMinute: block.startsAtMinute,
        endsAtMinute: block.endsAtMinute,
        mode: block.mode,
      })),
    ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "court.schedule_replaced",
      entityType: "schedule",
      entityId: schedule.id,
      beforeHash: stableHash(previous),
      afterHash: stableHash(input.blocks),
      reason: "Operator confirmed and replaced the court weekly schedule.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: schedule.id, entity: "schedule", status: "active" };
}

export async function blockCourtTime(input: {
  readonly actor: ApiActor;
  readonly courtId: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly reason: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Confirm the blackout before blocking player bookings.",
    );
  }
  const { court, venue, organizationId } = await ownedCourt(
    input.actor,
    input.courtId,
  );
  const startsAt = venueWallTimeToUtc(input.localStartsAt, venue.timezone);
  const endsAt = venueWallTimeToUtc(input.localEndsAt, venue.timezone);
  if (endsAt <= startsAt) {
    throw new OperatorServiceError(
      "INVALID_SCHEDULE",
      "The blackout must end after it begins.",
    );
  }
  const database = getDatabase();
  let schedule = await database.query.schedules.findFirst({
    where: and(
      eq(schedules.resourceType, "court"),
      eq(schedules.resourceId, court.id),
    ),
  });
  if (!schedule) {
    const id = crypto.randomUUID();
    await database.insert(schedules).values({
      id,
      organizationId,
      name: `${court.name} availability`,
      timezone: venue.timezone,
      resourceType: "court",
      resourceId: court.id,
    });
    schedule = await database.query.schedules.findFirst({
      where: eq(schedules.id, id),
    });
  }
  if (!schedule) {
    throw new OperatorServiceError(
      "INVALID_SCHEDULE",
      "The court schedule could not be initialized.",
    );
  }
  const id = crypto.randomUUID();
  await database.batch([
    database.insert(scheduleOverrides).values({
      id,
      scheduleId: schedule.id,
      startsAt,
      endsAt,
      mode: "blocked",
      reason: input.reason.trim(),
      createdAt: input.now,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "court.blackout_created",
      entityType: "schedule-override",
      entityId: id,
      afterHash: stableHash({ courtId: court.id, startsAt, endsAt }),
      reason: input.reason.trim(),
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    id,
    entity: "schedule-override",
    status: "blocked",
  };
}

export async function activateCourt(input: {
  readonly actor: ApiActor;
  readonly courtId: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Confirm before making this court bookable.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const row = (
    await database
      .select({ court: courts, organizationId: venues.organizationId })
      .from(courts)
      .innerJoin(venues, eq(courts.venueId, venues.id))
      .where(eq(courts.id, input.courtId))
      .limit(1)
  )[0];
  if (!row) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Court was not found.",
    );
  }
  if (row.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Court belongs to another organization.",
    );
  }
  if (row.court.bookingPolicy !== "none" && !row.court.ratePlanId) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Attach a rate plan before making this court bookable.",
    );
  }
  await database.batch([
    database
      .update(courts)
      .set({ status: "active", updatedAt: input.now })
      .where(eq(courts.id, input.courtId)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "court.activated",
      entityType: "court",
      entityId: input.courtId,
      beforeHash: stableHash({ status: row.court.status }),
      afterHash: stableHash({ status: "active" }),
      reason: "Operator explicitly confirmed court activation.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: input.courtId, entity: "court", status: "active" };
}

export async function publishVenue(input: {
  readonly actor: ApiActor;
  readonly venueId: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Confirm before publishing this venue.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const venue = await database.query.venues.findFirst({
    where: eq(venues.id, input.venueId),
  });
  if (!venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue was not found.",
    );
  }
  if (venue.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Venue belongs to another organization.",
    );
  }
  if (!venue.locality || !venue.administrativeArea) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Add the venue city and region before publishing.",
    );
  }
  const activeCourt = await database.query.courts.findFirst({
    where: and(eq(courts.venueId, venue.id), eq(courts.status, "active")),
  });
  if (!activeCourt) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Activate at least one court before publishing the venue.",
    );
  }
  await database.batch([
    database
      .update(venues)
      .set({ status: "active", updatedAt: input.now })
      .where(eq(venues.id, venue.id)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "venue.published",
      entityType: "venue",
      entityId: venue.id,
      beforeHash: stableHash({ status: venue.status }),
      afterHash: stableHash({ status: "active" }),
      reason: "Operator explicitly confirmed player-facing venue publication.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: venue.id, entity: "venue", status: "active" };
}

export async function createProgramSession(input: {
  readonly actor: ApiActor;
  readonly title: string;
  readonly description?: string;
  readonly kind: EventKind;
  readonly venueId: string;
  readonly courtId?: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly capacity: number;
  readonly minimumCapacity: number;
  readonly priceMinor: number;
  readonly confirmedPrice: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmedPrice) {
    throw new OperatorServiceError(
      "PRICE_CONFIRMATION_REQUIRED",
      "Confirm the exact session price before saving the draft.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const organization = await organizationRow(organizationId);
  const venue = await database.query.venues.findFirst({
    where: eq(venues.id, input.venueId),
  });
  if (!venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue was not found.",
    );
  }
  if (venue.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Venue belongs to another organization.",
    );
  }
  if (input.courtId) {
    const court = await database.query.courts.findFirst({
      where: eq(courts.id, input.courtId),
    });
    if (!court || court.venueId !== venue.id) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Selected court is not part of this venue.",
      );
    }
  }
  const startsAt = venueWallTimeToUtc(
    input.localStartsAt,
    timeZone(venue.timezone),
  );
  const endsAt = venueWallTimeToUtc(
    input.localEndsAt,
    timeZone(venue.timezone),
  );
  if (
    endsAt.getTime() <= startsAt.getTime() ||
    startsAt.getTime() <= input.now.getTime()
  ) {
    throw new OperatorServiceError(
      "INVALID_SCHEDULE",
      "Session must start in the future and end after it begins.",
    );
  }
  if (input.minimumCapacity > input.capacity) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Minimum capacity cannot exceed total capacity.",
    );
  }
  const programId = crypto.randomUUID();
  const eventTypeId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const slug = await uniqueSessionSlug(input.title);
  const storedCurrency = currency(organization.currency);
  const values = {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    kind: input.kind,
    venueId: venue.id,
    courtId: input.courtId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: venue.timezone,
    capacity: input.capacity,
    minimumCapacity: input.minimumCapacity,
    priceMinor: input.priceMinor,
    currency: storedCurrency,
  };
  await database.batch([
    database.insert(programs).values({
      id: programId,
      organizationId,
      slug: `${slug}-program`.slice(0, 80),
      title: values.title,
      description: values.description,
      kind: values.kind,
      status: "draft",
    }),
    database.insert(eventTypes).values({
      id: eventTypeId,
      organizationId,
      title: values.title,
      kind: values.kind,
      durationMinutes: Math.round(
        (endsAt.getTime() - startsAt.getTime()) / 60_000,
      ),
      capacity: values.capacity,
      minimumCapacity: values.minimumCapacity,
      priceMinor: values.priceMinor,
      currency: values.currency,
      cancellationPolicy: {
        refundBeforeHours: 48,
        creditBeforeHours: 12,
        lateCancellation: "non-refundable",
      },
    }),
    database.insert(sessions).values({
      id: sessionId,
      programId,
      eventTypeId,
      venueId: values.venueId,
      courtId: values.courtId,
      createdByPersonId: input.actor.personId,
      title: values.title,
      slug,
      startsAt,
      endsAt,
      timezone: values.timezone,
      status: "draft",
      capacity: values.capacity,
      minimumCapacity: values.minimumCapacity,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "session.draft_created",
      entityType: "session",
      entityId: sessionId,
      afterHash: stableHash({ ...values, programId, eventTypeId }),
      reason:
        "Operator confirmed pricing and created a private program/session draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: sessionId, entity: "session", status: "draft" };
}

async function prepareEventDraftWrite(input: CreateEventDraftInput) {
  requireDatabase();
  if (!input.confirmedPrice) {
    throw new OperatorServiceError(
      "PRICE_CONFIRMATION_REQUIRED",
      "Confirm the exact division and ticket prices before saving the draft.",
    );
  }
  if (input.divisions.length === 0) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Add at least one division before saving this event.",
    );
  }
  const divisionNames = new Set<string>();
  for (const division of input.divisions) {
    const normalizedName = division.name.trim().toLowerCase();
    if (!normalizedName || divisionNames.has(normalizedName)) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Every division needs a unique name.",
      );
    }
    divisionNames.add(normalizedName);
    if (
      division.minimumTeams < 1 ||
      division.maximumTeams < division.minimumTeams
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        `${division.name}: maximum teams must be at least the minimum.`,
      );
    }
    if (
      division.ratingEnabled &&
      (division.ratingMinimum === undefined ||
        division.ratingMaximum === undefined ||
        division.ratingMaximum < division.ratingMinimum)
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        `${division.name}: complete a valid rating range or turn it off.`,
      );
    }
    if (
      division.ageEnabled &&
      (division.ageMinimum === undefined ||
        division.ageMaximum === undefined ||
        division.ageMaximum < division.ageMinimum)
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        `${division.name}: complete a valid age range or turn it off.`,
      );
    }
    if (
      division.poolPlay.enabled &&
      (division.poolPlay.teamsAdvancing > division.poolPlay.teamsPerPool ||
        division.poolPlay.teamsPerPool > division.maximumTeams)
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        `${division.name}: pool progression cannot exceed the pool or division size.`,
      );
    }
  }
  for (const ticket of input.tickets) {
    if (!ticket.availableOnline && !ticket.availableInPerson) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        `${ticket.name}: choose online, in-person, or both.`,
      );
    }
  }
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const organization = await organizationRow(organizationId);
  const venue = input.location.venueId
    ? await database.query.venues.findFirst({
        where: eq(venues.id, input.location.venueId),
      })
    : undefined;
  if (input.location.mode === "venue" && !venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Choose a connected venue for this event.",
    );
  }
  if (venue && venue.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "The selected venue belongs to another organization.",
    );
  }
  if (input.location.courtIds.length > 0) {
    if (!venue) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Connected courts require a connected venue.",
      );
    }
    const selectedCourts = await database
      .select({ id: courts.id, venueId: courts.venueId })
      .from(courts)
      .where(inArray(courts.id, [...input.location.courtIds]));
    if (
      selectedCourts.length !== input.location.courtIds.length ||
      selectedCourts.some((court) => court.venueId !== venue.id)
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Every selected court must belong to the selected venue.",
      );
    }
  }
  if (
    input.location.mode === "online" &&
    !input.location.onlineUrl?.startsWith("https://")
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Online events require a secure HTTPS location.",
    );
  }
  if (input.location.mode === "address" && !input.location.address?.trim()) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Add the event address.",
    );
  }
  const eventTimezone = timeZone(venue?.timezone ?? input.timezone);
  const startsAt = venueWallTimeToUtc(input.localStartsAt, eventTimezone);
  const endsAt = venueWallTimeToUtc(input.localEndsAt, eventTimezone);
  if (
    endsAt.getTime() <= startsAt.getTime() ||
    startsAt.getTime() <= input.now.getTime()
  ) {
    throw new OperatorServiceError(
      "INVALID_SCHEDULE",
      "The event must start in the future and end after it begins.",
    );
  }
  const capacity = input.divisions.reduce(
    (total, division) =>
      total + division.maximumTeams * teamSize(division.teamFormat),
    0,
  );
  const minimumCapacity = input.divisions.reduce(
    (total, division) =>
      total + division.minimumTeams * teamSize(division.teamFormat),
    0,
  );
  const offeredPrices = [
    ...input.divisions.map((division) => division.priceMinor),
    ...input.tickets.map((ticket) => ticket.priceMinor),
  ];
  const startingPrice = offeredPrices.length ? Math.min(...offeredPrices) : 0;
  const storedCurrency = currency(organization.currency);
  return {
    organizationId,
    database,
    venue,
    eventTimezone,
    startsAt,
    endsAt,
    capacity,
    minimumCapacity,
    startingPrice,
    storedCurrency,
  };
}

export async function createEventDraft(
  input: CreateEventDraftInput,
): Promise<OperatorMutationResult> {
  const {
    organizationId,
    database,
    venue,
    eventTimezone,
    startsAt,
    endsAt,
    capacity,
    minimumCapacity,
    startingPrice,
    storedCurrency,
  } = await prepareEventDraftWrite(input);
  const programId = crypto.randomUUID();
  const eventTypeId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const slug = await uniqueSessionSlug(input.title);
  const values = {
    title: input.title.trim(),
    shortSummary: input.shortSummary?.trim() || undefined,
    description: input.description?.trim() || undefined,
    kind: input.kind,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: eventTimezone,
    venueId: venue?.id,
    courtId: input.location.courtIds[0],
    capacity,
    minimumCapacity,
    priceMinor: startingPrice,
    currency: storedCurrency,
  };
  await database.batch([
    database.insert(programs).values({
      id: programId,
      organizationId,
      slug: `${slug}-program`.slice(0, 80),
      title: values.title,
      description: values.description,
      kind: values.kind,
      status: "draft",
    }),
    database.insert(eventTypes).values({
      id: eventTypeId,
      organizationId,
      title: values.title,
      kind: values.kind,
      durationMinutes: Math.round(
        (endsAt.getTime() - startsAt.getTime()) / 60_000,
      ),
      capacity: values.capacity,
      minimumCapacity: values.minimumCapacity,
      priceMinor: values.priceMinor,
      currency: values.currency,
      cancellationPolicy: {
        refundBeforeHours: 48,
        creditBeforeHours: 12,
        lateCancellation: "non-refundable",
      },
    }),
    database.insert(sessions).values({
      id: sessionId,
      programId,
      eventTypeId,
      venueId: values.venueId,
      courtId: values.courtId,
      createdByPersonId: input.actor.personId,
      title: values.title,
      slug,
      startsAt,
      endsAt,
      timezone: values.timezone,
      status: "draft",
      capacity: values.capacity,
      minimumCapacity: values.minimumCapacity,
    }),
    database.insert(eventBlueprints).values({
      sessionId,
      shortSummary: values.shortSummary,
      description: values.description,
      media: input.media,
      location: {
        mode: input.location.mode,
        venueName: input.location.venueName.trim(),
        address: input.location.address?.trim() || undefined,
        googlePlaceId: input.location.googlePlaceId?.trim() || undefined,
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        onlineUrl: input.location.onlineUrl?.trim() || undefined,
        courtNames: input.location.courtNames,
      },
      features: input.features,
      policies: input.policies,
      recurrence: input.recurrence,
      registrationSettings: {
        teamConfirmationRequired: true,
        allowPlayerSearch: true,
        allowInviteLink: true,
        allowEmailInvite: true,
        allowSmsInvite: true,
        paymentResponsibility: ["self", "entire-team"],
        smartRules: input.smartRules,
      },
    }),
    ...input.divisions.map((division) =>
      database.insert(divisions).values({
        id: crypto.randomUUID(),
        sessionId,
        name: division.name.trim(),
        description: division.description?.trim() || undefined,
        discipline: divisionDiscipline(division),
        ratingBasis: division.seeding,
        capacity: division.maximumTeams * teamSize(division.teamFormat),
        minimumTeams: division.minimumTeams,
        maximumTeams: division.maximumTeams,
        teamSize: teamSize(division.teamFormat),
        priceBasis: division.priceBasis,
        settings: {
          teamFormat: division.teamFormat,
          surface: division.surface,
          gender: division.gender,
          ratingMinimum: division.ratingEnabled
            ? division.ratingMinimum
            : undefined,
          ratingMaximum: division.ratingEnabled
            ? division.ratingMaximum
            : undefined,
          ageMinimum: division.ageEnabled ? division.ageMinimum : undefined,
          ageMaximum: division.ageEnabled ? division.ageMaximum : undefined,
          tournamentFormat: division.tournamentFormat,
          poolPlay: division.poolPlay,
          seeding: division.seeding,
        },
        entryFeeMinor: division.priceMinor,
        currency: values.currency,
      }),
    ),
    ...input.tickets.map((ticket) =>
      database.insert(ticketTypes).values({
        id: crypto.randomUUID(),
        sessionId,
        name: ticket.name.trim(),
        description: ticket.description?.trim() || undefined,
        priceMinor: ticket.priceMinor,
        currency: values.currency,
        quantity: ticket.quantity,
        availableOnline: ticket.availableOnline,
        availableInPerson: ticket.availableInPerson,
        waitlistEnabled: ticket.waitlistEnabled,
        approvalRequired: ticket.approvalRequired,
      }),
    ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "event.draft_created",
      entityType: "session",
      entityId: sessionId,
      afterHash: stableHash({
        ...values,
        divisions: input.divisions,
        tickets: input.tickets,
        features: input.features,
        policies: input.policies,
        recurrence: input.recurrence,
      }),
      reason:
        "Operator confirmed event pricing and created a private event draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: sessionId, entity: "event", status: "draft" };
}

export async function updateEventDraft(
  input: UpdateEventDraftInput,
): Promise<OperatorMutationResult> {
  const organizationId = requireOrganization(input.actor);
  const before = await loadEventDraft(organizationId, input.sessionId);
  const {
    database,
    venue,
    eventTimezone,
    startsAt,
    endsAt,
    capacity,
    minimumCapacity,
    startingPrice,
    storedCurrency,
  } = await prepareEventDraftWrite(input);
  const target = await database.query.sessions.findFirst({
    where: eq(sessions.id, input.sessionId),
  });
  if (!target?.programId || !target.eventTypeId || target.status !== "draft") {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Only complete private event drafts can be edited.",
    );
  }

  const values = {
    title: input.title.trim(),
    shortSummary: input.shortSummary?.trim() || undefined,
    description: input.description?.trim() || undefined,
    kind: input.kind,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: eventTimezone,
    venueId: venue?.id,
    courtId: input.location.courtIds[0],
    capacity,
    minimumCapacity,
    priceMinor: startingPrice,
    currency: storedCurrency,
  };

  await database.batch([
    database
      .update(programs)
      .set({
        title: values.title,
        description: values.description ?? null,
        kind: values.kind,
        updatedAt: input.now,
      })
      .where(eq(programs.id, target.programId)),
    database
      .update(eventTypes)
      .set({
        title: values.title,
        kind: values.kind,
        durationMinutes: Math.round(
          (endsAt.getTime() - startsAt.getTime()) / 60_000,
        ),
        capacity: values.capacity,
        minimumCapacity: values.minimumCapacity,
        priceMinor: values.priceMinor,
        currency: values.currency,
        updatedAt: input.now,
      })
      .where(eq(eventTypes.id, target.eventTypeId)),
    database
      .update(sessions)
      .set({
        title: values.title,
        startsAt,
        endsAt,
        timezone: values.timezone,
        venueId: values.venueId ?? null,
        courtId: values.courtId ?? null,
        capacity: values.capacity,
        minimumCapacity: values.minimumCapacity,
        updatedAt: input.now,
      })
      .where(eq(sessions.id, input.sessionId)),
    database
      .update(eventBlueprints)
      .set({
        shortSummary: values.shortSummary ?? null,
        description: values.description ?? null,
        media: input.media,
        location: {
          mode: input.location.mode,
          venueName: input.location.venueName.trim(),
          address: input.location.address?.trim() || undefined,
          googlePlaceId: input.location.googlePlaceId?.trim() || undefined,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          onlineUrl: input.location.onlineUrl?.trim() || undefined,
          courtNames: input.location.courtNames,
        },
        features: input.features,
        policies: input.policies,
        recurrence: input.recurrence ?? null,
        registrationSettings: {
          teamConfirmationRequired: true,
          allowPlayerSearch: true,
          allowInviteLink: true,
          allowEmailInvite: true,
          allowSmsInvite: true,
          paymentResponsibility: ["self", "entire-team"],
          smartRules: input.smartRules,
        },
        updatedAt: input.now,
      })
      .where(eq(eventBlueprints.sessionId, input.sessionId)),
    database.delete(divisions).where(eq(divisions.sessionId, input.sessionId)),
    database
      .delete(ticketTypes)
      .where(eq(ticketTypes.sessionId, input.sessionId)),
    ...input.divisions.map((division) =>
      database.insert(divisions).values({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        name: division.name.trim(),
        description: division.description?.trim() || undefined,
        discipline: divisionDiscipline(division),
        ratingBasis: division.seeding,
        capacity: division.maximumTeams * teamSize(division.teamFormat),
        minimumTeams: division.minimumTeams,
        maximumTeams: division.maximumTeams,
        teamSize: teamSize(division.teamFormat),
        priceBasis: division.priceBasis,
        settings: {
          teamFormat: division.teamFormat,
          surface: division.surface,
          gender: division.gender,
          ratingMinimum: division.ratingEnabled
            ? division.ratingMinimum
            : undefined,
          ratingMaximum: division.ratingEnabled
            ? division.ratingMaximum
            : undefined,
          ageMinimum: division.ageEnabled ? division.ageMinimum : undefined,
          ageMaximum: division.ageEnabled ? division.ageMaximum : undefined,
          tournamentFormat: division.tournamentFormat,
          poolPlay: division.poolPlay,
          seeding: division.seeding,
        },
        entryFeeMinor: division.priceMinor,
        currency: values.currency,
      }),
    ),
    ...input.tickets.map((ticket) =>
      database.insert(ticketTypes).values({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        name: ticket.name.trim(),
        description: ticket.description?.trim() || undefined,
        priceMinor: ticket.priceMinor,
        currency: values.currency,
        quantity: ticket.quantity,
        availableOnline: ticket.availableOnline,
        availableInPerson: ticket.availableInPerson,
        waitlistEnabled: ticket.waitlistEnabled,
        approvalRequired: ticket.approvalRequired,
      }),
    ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "event.draft_updated",
      entityType: "session",
      entityId: input.sessionId,
      beforeHash: stableHash(before),
      afterHash: stableHash({
        ...values,
        divisions: input.divisions,
        tickets: input.tickets,
        features: input.features,
        policies: input.policies,
        recurrence: input.recurrence,
      }),
      reason: "Operator reviewed and saved changes to a private event draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: input.sessionId, entity: "event", status: "draft" };
}

export async function publishSession(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Confirm before opening this session to players.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const row = (
    await database
      .select({
        session: sessions,
        programOrganizationId: programs.organizationId,
        eventOrganizationId: eventTypes.organizationId,
        priceMinor: eventTypes.priceMinor,
        venueStatus: venues.status,
        blueprintLocation: eventBlueprints.location,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(eventBlueprints, eq(sessions.id, eventBlueprints.sessionId))
      .where(eq(sessions.id, input.sessionId))
      .limit(1)
  )[0];
  if (!row) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Session was not found.",
    );
  }
  if (
    row.programOrganizationId !== organizationId &&
    row.eventOrganizationId !== organizationId
  ) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Session belongs to another organization.",
    );
  }
  const locationMode =
    row.blueprintLocation && typeof row.blueprintLocation.mode === "string"
      ? row.blueprintLocation.mode
      : undefined;
  const customLocationReady =
    locationMode === "address" || locationMode === "online";
  if (
    !row.session.eventTypeId ||
    (row.venueStatus !== "active" && !customLocationReady)
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Attach an active venue, event address, or online location before publishing.",
    );
  }
  if (row.session.startsAt.getTime() <= input.now.getTime()) {
    throw new OperatorServiceError(
      "INVALID_SCHEDULE",
      "Past sessions cannot be published.",
    );
  }
  const organization = await organizationRow(organizationId);
  if (
    (row.priceMinor ?? 0) > 0 &&
    (!organization.stripeAccountId || !organization.stripeChargesEnabled)
  ) {
    throw new OperatorServiceError(
      "PAYMENTS_NOT_READY",
      "Finish payment setup before publishing a paid session.",
    );
  }
  await database.batch([
    database
      .update(sessions)
      .set({
        status: "registration-open",
        publishedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(sessions.id, row.session.id)),
    ...(row.session.programId
      ? [
          database
            .update(programs)
            .set({ status: "registration-open", updatedAt: input.now })
            .where(eq(programs.id, row.session.programId)),
        ]
      : []),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "session.published",
      entityType: "session",
      entityId: row.session.id,
      beforeHash: stableHash({ status: row.session.status }),
      afterHash: stableHash({
        status: "registration-open",
        publishedAt: input.now.toISOString(),
      }),
      reason: "Operator explicitly confirmed player-facing publication.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    id: row.session.id,
    entity: "session",
    status: "registration-open",
  };
}

async function recipientBelongsToOrganization(
  organizationId: string,
  personId: string,
): Promise<boolean> {
  const database = getDatabase();
  const membership = await database.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.personId, personId),
      eq(organizationMemberships.active, true),
    ),
  });
  if (membership) return true;
  const registration = (
    await database
      .select({ id: registrations.id })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        and(
          eq(registrations.personId, personId),
          or(
            eq(programs.organizationId, organizationId),
            eq(eventTypes.organizationId, organizationId),
            eq(venues.organizationId, organizationId),
          ),
        ),
      )
      .limit(1)
  )[0];
  return Boolean(registration);
}

export async function saveMessageDraft(input: {
  readonly actor: ApiActor;
  readonly recipientPersonId: string;
  readonly channel: "email" | "sms" | "push";
  readonly classification: "transactional" | "marketing";
  readonly subject?: string;
  readonly body: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const recipient = await database.query.people.findFirst({
    where: eq(people.id, input.recipientPersonId),
  });
  if (!recipient) {
    throw new OperatorServiceError(
      "RECIPIENT_NOT_FOUND",
      "Recipient was not found.",
    );
  }
  if (!(await recipientBelongsToOrganization(organizationId, recipient.id))) {
    throw new OperatorServiceError(
      "RECIPIENT_NOT_ELIGIBLE",
      "Recipient is not part of this organization or one of its sessions.",
    );
  }
  if (input.channel === "email" && !recipient.email) {
    throw new OperatorServiceError(
      "DELIVERY_DESTINATION_MISSING",
      "Recipient does not have an email address.",
    );
  }
  if (input.channel === "sms" && !recipient.phoneE164) {
    throw new OperatorServiceError(
      "DELIVERY_DESTINATION_MISSING",
      "Recipient does not have a verified mobile number.",
    );
  }
  const consentScope =
    input.classification === "transactional"
      ? "transactional"
      : input.channel === "email"
        ? "marketing-email"
        : input.channel === "sms"
          ? "marketing-sms"
          : "marketing-push";
  const consent = (
    await database
      .select()
      .from(consents)
      .where(
        and(
          eq(consents.personId, recipient.id),
          eq(consents.scope, consentScope),
        ),
      )
      .orderBy(desc(consents.occurredAt))
      .limit(1)
  )[0];
  if (!consent?.granted) {
    throw new OperatorServiceError(
      "CONSENT_REQUIRED",
      `Recipient has not granted current ${consentScope} consent.`,
    );
  }
  const verifiedGuardianRows = recipient.isMinor
    ? await database
        .select({ guardianId: guardianships.guardianId })
        .from(guardianships)
        .where(
          and(
            eq(guardianships.minorId, recipient.id),
            eq(guardianships.verified, true),
            eq(guardianships.reviewStatus, "verified"),
          ),
        )
    : [];
  let guardianDecision;
  try {
    guardianDecision = enforceGuardianCopies({
      recipientPersonId: recipient.id,
      recipientIsMinor: recipient.isMinor,
      verifiedGuardianPersonIds: verifiedGuardianRows.map(
        (row) => row.guardianId,
      ),
    });
  } catch {
    throw new OperatorServiceError(
      "RECIPIENT_NOT_ELIGIBLE",
      "A verified guardian is required before drafting to a minor.",
    );
  }
  const id = crypto.randomUUID();
  const values = {
    recipientPersonId: recipient.id,
    channel: input.channel,
    kind: `operator-${input.classification}`,
    consentId: consent.id,
    subject: input.subject?.trim() || undefined,
    body: input.body.trim(),
    guardianCopyPersonIds: [...guardianDecision.guardianCopyPersonIds],
  };
  await database.batch([
    database.insert(messages).values({
      id,
      organizationId,
      senderPersonId: input.actor.personId,
      ...values,
      status: "draft",
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "message.draft_saved",
      entityType: "message",
      entityId: id,
      afterHash: stableHash({
        recipientPersonId: values.recipientPersonId,
        channel: values.channel,
        kind: values.kind,
        consentId: values.consentId,
        guardianCopyPersonIds: values.guardianCopyPersonIds,
        contentHash: stableHash({
          subject: values.subject,
          body: values.body,
        }),
      }),
      reason:
        "Operator saved a consent-checked draft; no outbound delivery occurred.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, entity: "message-draft", status: "draft" };
}

export async function createMarketingFlow(input: {
  readonly actor: ApiActor;
  readonly name: string;
  readonly description?: string;
  readonly segment:
    | "all-active"
    | "active-members"
    | "inactive-30-days"
    | "high-churn-risk"
    | "upcoming-participants";
  readonly trigger:
    | "manual"
    | "no-booking"
    | "payment-failed"
    | "event-published"
    | "membership-renewal";
  readonly triggerDays?: number;
  readonly channel: "email" | "sms" | "push";
  readonly subject?: string;
  readonly body: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Review the segment, trigger, and action before saving this flow.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const id = crypto.randomUUID();
  const segment = {
    kind: input.segment,
    consentRequired: true,
    organizationScoped: true,
  };
  const trigger = {
    kind: input.trigger,
    ...(input.trigger === "no-booking"
      ? { days: input.triggerDays ?? 30 }
      : {}),
  };
  const action = {
    kind: "send-message",
    channel: input.channel,
    subject: input.subject?.trim() || undefined,
    body: input.body.trim(),
    guardianRouting: "enforced",
    dispatchMode: "review-required",
  };
  const database = getDatabase();
  await database.batch([
    database.insert(marketingFlows).values({
      id,
      organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      segment,
      trigger,
      action,
      status: "draft",
      createdByPersonId: input.actor.personId,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "marketing-flow.draft_created",
      entityType: "marketing-flow",
      entityId: id,
      afterHash: stableHash({
        name: input.name.trim(),
        description: input.description?.trim(),
        segment,
        trigger,
        action: {
          ...action,
          body: stableHash({ body: action.body }),
        },
      }),
      reason:
        "Operator saved a consent-aware Segment, Trigger, Action flow as a private draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, entity: "marketing-flow", status: "draft" };
}

export async function createMarketingCampaignDraft(input: {
  readonly actor: ApiActor;
  readonly name: string;
  readonly segment:
    | "all-active"
    | "active-members"
    | "inactive-30-days"
    | "high-churn-risk"
    | "upcoming-participants";
  readonly channel: "email" | "sms" | "push";
  readonly subject?: string;
  readonly body: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      "Review the audience and content before saving this campaign.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const id = crypto.randomUUID();
  const segment = {
    kind: input.segment,
    consentRequired: true,
    organizationScoped: true,
  };
  const database = getDatabase();
  await database.batch([
    database.insert(marketingCampaigns).values({
      id,
      organizationId,
      name: input.name.trim(),
      segment,
      channel: input.channel,
      subject: input.subject?.trim() || undefined,
      body: input.body.trim(),
      status: "draft",
      createdByPersonId: input.actor.personId,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "marketing-campaign.draft_created",
      entityType: "marketing-campaign",
      entityId: id,
      afterHash: stableHash({
        name: input.name.trim(),
        segment,
        channel: input.channel,
        subject: input.subject?.trim(),
        contentHash: stableHash({ body: input.body.trim() }),
      }),
      reason:
        "Operator saved an organization-scoped campaign draft; no messages were sent.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, entity: "marketing-campaign", status: "draft" };
}

function validateCallbackUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Stripe callback URL is invalid.",
    );
  }
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Stripe callback URLs must use HTTPS.",
    );
  }
  return url.toString();
}

export async function refreshStripeOnboarding(input: {
  readonly actor: ApiActor;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<StripeAccountReadinessResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const organization = await organizationRow(organizationId);
  if (!organization.stripeAccountId) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Start Stripe onboarding before refreshing payment status.",
    );
  }

  const readiness = await retrieveConnectAccountReadiness(
    organization.stripeAccountId,
  );
  if (
    readiness.accountId !== organization.stripeAccountId ||
    (readiness.metadataEntityId &&
      readiness.metadataEntityId !== organization.id)
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Stripe account metadata conflicts with the Duna organization mapping.",
    );
  }

  const changed =
    organization.stripeAccountType !== readiness.accountType ||
    organization.stripeChargesEnabled !== readiness.chargesEnabled;
  if (changed) {
    const database = getDatabase();
    await database.batch([
      database
        .update(organizations)
        .set({
          stripeAccountType: readiness.accountType,
          stripeChargesEnabled: readiness.chargesEnabled,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(organizations.id, organizationId),
            eq(organizations.stripeAccountId, readiness.accountId),
          ),
        ),
      database.insert(auditLog).values({
        organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "stripe.account_status_refreshed",
        entityType: "organization",
        entityId: organizationId,
        beforeHash: stableHash({
          accountId: organization.stripeAccountId,
          accountType: organization.stripeAccountType,
          chargesEnabled: organization.stripeChargesEnabled,
        }),
        afterHash: stableHash({
          accountId: readiness.accountId,
          accountType: readiness.accountType,
          chargesEnabled: readiness.chargesEnabled,
        }),
        reason: readiness.chargesEnabled
          ? "Stripe confirmed that the connected account can receive Duna sandbox payments."
          : "Stripe still reports incomplete or restricted connected-account capabilities.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
  }

  return {
    accountId: readiness.accountId,
    chargesEnabled: readiness.chargesEnabled,
  };
}

export async function startStripeOnboarding(input: {
  readonly actor: ApiActor;
  readonly refreshUrl: string;
  readonly returnUrl: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<StripeOnboardingResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const organization = await organizationRow(organizationId);
  const operator = await getDatabase().query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!operator?.email) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Add an email address to your Duna profile before starting Stripe onboarding.",
    );
  }
  const onboarding = await createConnectOnboarding({
    accountId: organization.stripeAccountId ?? undefined,
    personOrOrganizationId: organization.id,
    partyType: organization.plan === "coach" ? "coach" : "club",
    contactEmail: operator.email,
    displayName: organization.name,
    countryCode: organization.countryCode,
    refreshUrl: validateCallbackUrl(input.refreshUrl),
    returnUrl: validateCallbackUrl(input.returnUrl),
    feePolicy: (() => {
      const policy = resolveOrganizationCommissionPolicy(organization);
      return {
        rateBps: policy.rateBps,
        source: policy.source,
        plan: policy.effectivePlan,
      };
    })(),
  });
  const database = getDatabase();
  await database.batch([
    database
      .update(organizations)
      .set({
        stripeAccountId: onboarding.accountId,
        stripeAccountType: "v2-recipient",
        stripeFeeMetadataStatus: "synced",
        stripeFeeMetadataSyncedAt: input.now,
        stripeFeeMetadataError: null,
        updatedAt: input.now,
      })
      .where(eq(organizations.id, organizationId)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "stripe.onboarding_started",
      entityType: "organization",
      entityId: organizationId,
      beforeHash: stableHash({
        accountId: organization.stripeAccountId,
        chargesEnabled: organization.stripeChargesEnabled,
      }),
      afterHash: stableHash({
        accountId: onboarding.accountId,
        chargesEnabled: organization.stripeChargesEnabled,
      }),
      reason:
        "Operator requested a Stripe-hosted onboarding link; identity and legal attestations remain for the operator.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    accountId: onboarding.accountId,
    onboardingUrl: onboarding.url,
    chargesEnabled: organization.stripeChargesEnabled,
  };
}
