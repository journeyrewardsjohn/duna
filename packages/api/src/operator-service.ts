import {
  auditLog,
  consents,
  courtBookings,
  courts,
  divisions,
  eventBlueprints,
  eventTypes,
  getDatabase,
  guardianships,
  messages,
  organizationInvitations,
  organizationMemberships,
  organizationParticipants,
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
  venues,
} from "@duna/db";
import { demoOrganization } from "@duna/core/demo";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  loadDemoCommerceWorkspace,
  loadOperatorCommerceWorkspace,
} from "./catalog-service";
import type {
  OperatorMutationResult,
  OperatorWorkspace,
  PlayerInvitation,
  PlayerInvitationClaimResult,
  StripeOnboardingResult,
} from "./contracts";
import type { ApiActor } from "./context";
import {
  normalizeCourtCancellationPolicy,
  venueWallTimeToUtc,
} from "./court-checkout";
import { enforceGuardianCopies } from "./messaging";
import { createConnectOnboarding } from "./payments";
import { isSentConfigured, sendTemplateSms } from "./sent";

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
    "https://duna.com";
  return `${origin.replace(/\/$/, "")}/join/organization/${encodeURIComponent(inviteToken)}`;
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
    email: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
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
  return {
    organization: {
      id: demoOrganization.id,
      name: demoOrganization.name,
      plan: plan(demoOrganization.plan),
      currency: "USD",
      timezone: demoOrganization.timezone,
      stripeChargesEnabled: false,
      countryCode: "US",
      stripeTaxEnabled: false,
      taxRegistrationStatus: "not-configured",
    },
    ratePlans: [],
    venues: [],
    sessions: [],
    participants: [],
    invitations: [],
    messageRecipients: [],
    messageDrafts: [],
    deliveryProviders: {
      email: false,
      sms: false,
      push: false,
    },
    ...loadDemoCommerceWorkspace(),
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
    bookingRows,
    sessionRows,
    memberRows,
    registrationRows,
    participantRows,
    invitationRows,
    draftRows,
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
        courtId: sessions.courtId,
        kindFromProgram: programs.kind,
        kindFromEventType: eventTypes.kind,
        priceMinor: eventTypes.priceMinor,
        currency: eventTypes.currency,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
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
        id: people.id,
        displayName: people.displayName,
        email: people.email,
        phoneE164: people.phoneE164,
        isMinor: people.isMinor,
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
  ]);

  const recipientMap = new Map(
    [
      ...memberRows,
      ...registrationRows,
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

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      plan: plan(organization.plan),
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
    venues: venueRows.map((venue) => ({
      id: venue.id,
      name: venue.name,
      description: venue.description ?? undefined,
      slug: venue.slug,
      status: venue.status,
      temporary: venue.temporary,
      capacity: venue.capacity,
      heroImageUrl: venue.heroImageUrl ?? undefined,
      heroImageTreatmentUrl: venue.heroImageTreatmentUrl ?? undefined,
      amenities: venue.amenities,
      addressLine1: venue.addressLine1 ?? undefined,
      locality: venue.locality ?? undefined,
      administrativeArea: venue.administrativeArea ?? undefined,
      postalCode: venue.postalCode ?? undefined,
      countryCode: venue.countryCode,
      timezone: venue.timezone,
      utilization: utilizationForVenue(venue.id),
      courts: courtRows
        .filter((row) => row.court.venueId === venue.id)
        .map(({ court }) => ({
          id: court.id,
          venueId: court.venueId,
          name: court.name,
          surface: court.surface,
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
          utilization: utilizationForCourt(court.id),
        })),
    })),
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
      courtId: row.courtId ?? undefined,
      priceMinor: row.priceMinor ?? 0,
      currency: currency(row.currency ?? organization.currency),
    })),
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
    deliveryProviders: providerReadiness(),
    ...commerce,
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
  readonly description?: string;
  readonly capacity?: number;
  readonly heroImageUrl?: string;
  readonly amenities?: readonly string[];
  readonly addressLine1?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
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
  const values = {
    name: input.name.trim(),
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
    locality: input.locality?.trim() || undefined,
    administrativeArea: input.administrativeArea?.trim() || undefined,
    postalCode: input.postalCode?.trim() || undefined,
    countryCode: input.countryCode.toUpperCase(),
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
      reason: "Operator created a private venue draft.",
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
  readonly description?: string;
  readonly capacity: number;
  readonly heroImageUrl?: string;
  readonly amenities: readonly string[];
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
  const values = {
    description: input.description?.trim() || null,
    capacity: input.capacity,
    heroImageUrl: input.heroImageUrl?.trim() || null,
    amenities: input.amenities.map((amenity) => amenity.trim()).filter(Boolean),
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
        description: venue.description,
        capacity: venue.capacity,
        heroImageUrl: venue.heroImageUrl,
        amenities: venue.amenities,
      }),
      afterHash: stableHash(values),
      reason: "Operator updated the player-facing venue profile.",
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
  readonly ratePlanId: string | null;
  readonly capacity: number;
  readonly durationOptionsMinutes: readonly number[];
  readonly bookingIncrementMinutes: number;
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
  const durationOptionsMinutes = [
    ...new Set(input.durationOptionsMinutes),
  ].sort((left, right) => left - right);
  if (
    durationOptionsMinutes.length === 0 ||
    durationOptionsMinutes.some(
      (minutes) =>
        minutes < court.minimumDurationMinutes ||
        minutes > court.maximumDurationMinutes,
    )
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Every booking length must be inside the court duration range.",
    );
  }
  const values = {
    ratePlanId: input.ratePlanId,
    capacity: input.capacity,
    durationOptionsMinutes,
    bookingIncrementMinutes: input.bookingIncrementMinutes,
    minimumNoticeMinutes: input.minimumNoticeMinutes,
    maximumAdvanceDays: input.maximumAdvanceDays,
    cancellationPolicy: input.cancellationPolicy,
    updatedAt: input.now,
  };
  const database = getDatabase();
  await database.batch([
    database.update(courts).set(values).where(eq(courts.id, input.courtId)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "court.booking_configuration_updated",
      entityType: "court",
      entityId: input.courtId,
      beforeHash: stableHash({
        ratePlanId: court.ratePlanId,
        capacity: court.capacity,
        durationOptionsMinutes: court.durationOptionsMinutes,
        bookingIncrementMinutes: court.bookingIncrementMinutes,
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

export async function createEventDraft(
  input: CreateEventDraftInput,
): Promise<OperatorMutationResult> {
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
      "Finish Stripe Connect before publishing a paid session.",
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
  });
  const database = getDatabase();
  await database.batch([
    database
      .update(organizations)
      .set({
        stripeAccountId: onboarding.accountId,
        stripeAccountType: "v2-recipient",
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
