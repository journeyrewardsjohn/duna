import {
  auditLog,
  consents,
  courts,
  divisions,
  eventBlueprints,
  eventTypes,
  getDatabase,
  guardianships,
  messages,
  organizationMemberships,
  organizations,
  people,
  programs,
  ratePlans,
  registrations,
  sessions,
  ticketTypes,
  venues,
} from "@duna/db";
import { demoOrganization } from "@duna/core/demo";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { stableHash } from "./canonical";
import type {
  OperatorMutationResult,
  OperatorWorkspace,
  StripeOnboardingResult,
} from "./contracts";
import type { ApiActor } from "./context";
import { venueWallTimeToUtc } from "./court-checkout";
import { enforceGuardianCopies } from "./messaging";
import { createConnectOnboarding } from "./payments";

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
      | "DELIVERY_DESTINATION_MISSING",
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
    sms: Boolean(
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
    },
    ratePlans: [],
    venues: [],
    sessions: [],
    messageRecipients: [],
    messageDrafts: [],
    deliveryProviders: {
      email: false,
      sms: false,
      push: false,
    },
  };
}

export async function loadOperatorWorkspace(
  organizationId: string,
): Promise<OperatorWorkspace> {
  requireDatabase();
  const database = getDatabase();
  const organization = await organizationRow(organizationId);
  const [
    ratePlanRows,
    venueRows,
    courtRows,
    sessionRows,
    memberRows,
    registrationRows,
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
    [...memberRows, ...registrationRows].map((row) => [row.id, row]),
  );
  const recipientIds = [...recipientMap.keys()];
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
  for (const row of guardianRows) {
    guardianCounts.set(row.minorId, (guardianCounts.get(row.minorId) ?? 0) + 1);
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      plan: plan(organization.plan),
      currency: currency(organization.currency),
      timezone: organization.timezone,
      stripeAccountId: organization.stripeAccountId ?? undefined,
      stripeChargesEnabled: organization.stripeChargesEnabled,
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
      slug: venue.slug,
      status: venue.status,
      temporary: venue.temporary,
      addressLine1: venue.addressLine1 ?? undefined,
      locality: venue.locality ?? undefined,
      administrativeArea: venue.administrativeArea ?? undefined,
      postalCode: venue.postalCode ?? undefined,
      countryCode: venue.countryCode,
      timezone: venue.timezone,
      courts: courtRows
        .filter((row) => row.court.venueId === venue.id)
        .map(({ court }) => ({
          id: court.id,
          venueId: court.venueId,
          name: court.name,
          surface: court.surface,
          lit: court.lit,
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
          bufferBeforeMinutes: court.bufferBeforeMinutes,
          bufferAfterMinutes: court.bufferAfterMinutes,
          minimumNoticeMinutes: court.minimumNoticeMinutes,
          maximumAdvanceDays: court.maximumAdvanceDays,
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
    slug: await uniqueVenueSlug(organizationId, input.name),
    status: "draft" as const,
    temporary: input.temporary,
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
  readonly bookingPolicy: "public" | "members" | "tiers" | "staff" | "none";
  readonly ratePlanId?: string;
  readonly minimumDurationMinutes: number;
  readonly maximumDurationMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly minimumNoticeMinutes: number;
  readonly maximumAdvanceDays: number;
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
  const values = {
    venueId: input.venueId,
    name: input.name.trim(),
    surface: input.surface.trim().toLowerCase(),
    lit: input.lit,
    status: "draft" as const,
    bookingPolicy: input.bookingPolicy,
    ratePlanId: input.ratePlanId,
    minimumDurationMinutes: input.minimumDurationMinutes,
    maximumDurationMinutes: input.maximumDurationMinutes,
    bufferBeforeMinutes: input.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes,
    minimumNoticeMinutes: input.minimumNoticeMinutes,
    maximumAdvanceDays: input.maximumAdvanceDays,
    cancellationPolicy: {
      refundBeforeHours: 24,
      creditBeforeHours: 2,
      lateCancellation: "non-refundable",
    },
  };
  await database.batch([
    database.insert(courts).values({
      id,
      ...values,
      qrToken: crypto.randomUUID().replaceAll("-", ""),
    }),
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
