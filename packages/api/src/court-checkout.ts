import {
  appliedFees,
  availabilityAlerts,
  auditLog,
  bookingPolicyAcceptances,
  courtBookingParticipants,
  courtBookings,
  courts,
  getDatabase,
  memberships,
  membershipTiers,
  organizationMemberships,
  organizations,
  orderItems,
  orders,
  people,
  ratePlans,
  scheduleBlocks,
  scheduleOverrides,
  schedules,
  venues,
} from "@duna/db";
import {
  calculateOperatorProcessingFee,
  priceConsumerOrder,
  type CurrencyCode,
} from "@duna/pricing";
import { solveAvailableSlots } from "@duna/scheduling";
import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import type {
  CourtAvailability,
  CourtBookingInventory,
  CourtCancellationPolicy,
  CourtCheckoutResult,
  CourtCheckoutStatus,
} from "./contracts";
import { stableHash } from "./canonical";
import { assertSubjectAuthority, createCourtHold } from "./commerce";
import type { ApiActor } from "./context";
import { hasActiveDunaPlusMembership } from "./membership";
import { createCourtCheckoutSession, isStripeConfigured } from "./payments";
import { sendTemplateSms } from "./sent";

export class CourtCheckoutError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "COURT_NOT_FOUND"
      | "RATE_NOT_CONFIGURED"
      | "PAYMENTS_NOT_READY"
      | "INVALID_LOCAL_TIME"
      | "INVALID_DURATION"
      | "POLICY_ACCEPTANCE_REQUIRED"
      | "ALERT_LIMIT_REACHED"
      | "PARTICIPANT_NOT_FOUND"
      | "CHECKOUT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "CourtCheckoutError";
  }
}

const supportedCurrencies: readonly CurrencyCode[] = [
  "USD",
  "CAD",
  "AUD",
  "BRL",
  "EUR",
];

function currencyCode(value: string): CurrencyCode | undefined {
  return supportedCurrencies.includes(value as CurrencyCode)
    ? (value as CurrencyCode)
    : undefined;
}

const defaultCancellationPolicy: CourtCancellationPolicy = {
  title: "Reservation cancellation policy",
  markdown:
    "Cancel at least 24 hours before your reservation for a refund to the original payment method. Later cancellations are non-refundable unless the operator states otherwise.",
  refundBeforeHours: 24,
  lateCancellation: "Non-refundable inside the cancellation window.",
  requireFullScroll: true,
};

export function normalizeCourtCancellationPolicy(
  value: Readonly<Record<string, unknown>> | null | undefined,
): CourtCancellationPolicy {
  if (!value) return defaultCancellationPolicy;
  return {
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title
        : defaultCancellationPolicy.title,
    markdown:
      typeof value.markdown === "string" && value.markdown.trim()
        ? value.markdown
        : defaultCancellationPolicy.markdown,
    refundBeforeHours:
      typeof value.refundBeforeHours === "number" &&
      Number.isInteger(value.refundBeforeHours) &&
      value.refundBeforeHours >= 0
        ? value.refundBeforeHours
        : defaultCancellationPolicy.refundBeforeHours,
    creditBeforeHours:
      typeof value.creditBeforeHours === "number" &&
      Number.isInteger(value.creditBeforeHours) &&
      value.creditBeforeHours >= 0
        ? value.creditBeforeHours
        : undefined,
    lateCancellation:
      typeof value.lateCancellation === "string"
        ? value.lateCancellation
        : defaultCancellationPolicy.lateCancellation,
    requireFullScroll:
      typeof value.requireFullScroll === "boolean"
        ? value.requireFullScroll
        : true,
  };
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function localMinute(date: string, minute: number): string {
  if (minute === 1440) return `${addCalendarDays(date, 1)}T00:00`;
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function localDateTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

function dateOfLocalDateTime(value: string): string {
  return value.slice(0, 10);
}

export interface CourtBookingInviteInput {
  readonly personId?: string;
  readonly name?: string;
  readonly email?: string;
  readonly phoneE164?: string;
}

function formattedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function venueWallTimeToUtc(
  localDateTime: string,
  timeZone: string,
): Date {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/.exec(
      localDateTime,
    );
  if (!match?.groups) {
    throw new CourtCheckoutError(
      "INVALID_LOCAL_TIME",
      "Choose a valid venue date and time.",
    );
  }
  const desired = {
    year: Number(match.groups.year),
    month: Number(match.groups.month),
    day: Number(match.groups.day),
    hour: Number(match.groups.hour),
    minute: Number(match.groups.minute),
    second: 0,
  };
  const desiredEpoch = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  let candidate = desiredEpoch;
  try {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const actual = formattedParts(new Date(candidate), timeZone);
      const actualEpoch = Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second,
      );
      candidate += desiredEpoch - actualEpoch;
    }
    const projected = formattedParts(new Date(candidate), timeZone);
    if (
      projected.year !== desired.year ||
      projected.month !== desired.month ||
      projected.day !== desired.day ||
      projected.hour !== desired.hour ||
      projected.minute !== desired.minute
    ) {
      throw new Error("Venue time does not exist");
    }
  } catch {
    throw new CourtCheckoutError(
      "INVALID_LOCAL_TIME",
      "That venue time is invalid or falls inside a daylight-saving transition.",
    );
  }
  return new Date(candidate);
}

export async function loadCourtBookingInventory(
  venueId: string,
): Promise<CourtBookingInventory> {
  if (!process.env.DATABASE_URL) {
    throw new CourtCheckoutError(
      "DATABASE_REQUIRED",
      "Court inventory requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const venue = (
    await database
      .select({
        id: venues.id,
        name: venues.name,
        description: venues.description,
        city: venues.locality,
        region: venues.administrativeArea,
        timezone: venues.timezone,
        status: venues.status,
        capacity: venues.capacity,
        heroImageUrl: venues.heroImageUrl,
        heroImageTreatmentUrl: venues.heroImageTreatmentUrl,
        amenities: venues.amenities,
        organizationName: organizations.name,
        paymentsReady: organizations.stripeChargesEnabled,
      })
      .from(venues)
      .innerJoin(organizations, eq(venues.organizationId, organizations.id))
      .where(eq(venues.id, venueId))
      .limit(1)
  )[0];
  if (!venue || venue.status !== "active") {
    throw new CourtCheckoutError(
      "COURT_NOT_FOUND",
      "Bookable venue was not found.",
    );
  }
  const courtRows = await database
    .select({
      id: courts.id,
      name: courts.name,
      surface: courts.surface,
      lit: courts.lit,
      capacity: courts.capacity,
      status: courts.status,
      bookingPolicy: courts.bookingPolicy,
      minimumDurationMinutes: courts.minimumDurationMinutes,
      maximumDurationMinutes: courts.maximumDurationMinutes,
      durationOptionsMinutes: courts.durationOptionsMinutes,
      bookingIncrementMinutes: courts.bookingIncrementMinutes,
      minimumNoticeMinutes: courts.minimumNoticeMinutes,
      maximumAdvanceDays: courts.maximumAdvanceDays,
      cancellationPolicy: courts.cancellationPolicy,
      rateName: ratePlans.name,
      rateCurrency: ratePlans.currency,
      baseAmountMinor: ratePlans.baseAmountMinor,
      memberAmountMinor: ratePlans.memberAmountMinor,
      nonMemberAmountMinor: ratePlans.nonMemberAmountMinor,
      rateUnitMinutes: ratePlans.rateUnitMinutes,
    })
    .from(courts)
    .leftJoin(ratePlans, eq(courts.ratePlanId, ratePlans.id))
    .where(eq(courts.venueId, venueId))
    .orderBy(asc(courts.name));
  return {
    venue: {
      id: venue.id,
      name: venue.name,
      description: venue.description ?? undefined,
      city: venue.city ?? "City not set",
      region: venue.region ?? "Region not set",
      timezone: venue.timezone,
      organizationName: venue.organizationName,
      paymentsReady: venue.paymentsReady,
      capacity: venue.capacity,
      heroImageUrl: venue.heroImageUrl ?? undefined,
      heroImageTreatmentUrl: venue.heroImageTreatmentUrl ?? undefined,
      amenities: venue.amenities,
    },
    courts: courtRows.flatMap((court) => {
      if (court.status !== "active" || court.bookingPolicy === "none")
        return [];
      const rateCurrency = court.rateCurrency
        ? currencyCode(court.rateCurrency)
        : undefined;
      return [
        {
          id: court.id,
          name: court.name,
          surface: court.surface,
          lit: court.lit,
          capacity: court.capacity,
          bookingPolicy: court.bookingPolicy,
          minimumDurationMinutes: court.minimumDurationMinutes,
          maximumDurationMinutes: court.maximumDurationMinutes,
          durationOptionsMinutes: court.durationOptionsMinutes,
          bookingIncrementMinutes: court.bookingIncrementMinutes,
          minimumNoticeMinutes: court.minimumNoticeMinutes,
          maximumAdvanceDays: court.maximumAdvanceDays,
          cancellationPolicy: normalizeCourtCancellationPolicy(
            court.cancellationPolicy,
          ),
          pricing:
            court.rateName &&
            rateCurrency &&
            court.baseAmountMinor !== null &&
            court.rateUnitMinutes !== null
              ? {
                  name: court.rateName,
                  currency: rateCurrency,
                  baseAmountMinor: court.baseAmountMinor,
                  memberAmountMinor: court.memberAmountMinor ?? undefined,
                  nonMemberAmountMinor: court.nonMemberAmountMinor ?? undefined,
                  rateUnitMinutes: court.rateUnitMinutes,
                }
              : undefined,
        },
      ];
    }),
  };
}

export async function loadCourtAvailability(input: {
  readonly venueId: string;
  readonly date: string;
  readonly durationMinutes: number;
  readonly now?: Date;
}): Promise<CourtAvailability> {
  if (!process.env.DATABASE_URL) {
    throw new CourtCheckoutError(
      "DATABASE_REQUIRED",
      "Court availability requires the connected Duna database.",
    );
  }
  const now = input.now ?? new Date();
  const inventory = await loadCourtBookingInventory(input.venueId);
  const candidates = inventory.courts.filter((court) =>
    court.durationOptionsMinutes.includes(input.durationMinutes),
  );
  if (candidates.length === 0) {
    throw new CourtCheckoutError(
      "INVALID_DURATION",
      "Choose one of the rental lengths configured by this venue.",
    );
  }
  const dayStart = venueWallTimeToUtc(
    `${input.date}T00:00`,
    inventory.venue.timezone,
  );
  const nextDate = addCalendarDays(input.date, 1);
  const dayEnd = venueWallTimeToUtc(
    `${nextDate}T00:00`,
    inventory.venue.timezone,
  );
  const courtIds = candidates.map((court) => court.id);
  const database = getDatabase();
  const scheduleRows = await database
    .select({
      id: schedules.id,
      resourceId: schedules.resourceId,
    })
    .from(schedules)
    .where(
      and(
        eq(schedules.resourceType, "court"),
        inArray(schedules.resourceId, courtIds),
      ),
    );
  const scheduleIds = scheduleRows.map((schedule) => schedule.id);
  const [blockRows, overrideRows, bookingRows] = await Promise.all([
    scheduleIds.length > 0
      ? database
          .select()
          .from(scheduleBlocks)
          .where(inArray(scheduleBlocks.scheduleId, scheduleIds))
      : Promise.resolve([]),
    scheduleIds.length > 0
      ? database
          .select()
          .from(scheduleOverrides)
          .where(
            and(
              inArray(scheduleOverrides.scheduleId, scheduleIds),
              lt(scheduleOverrides.startsAt, dayEnd),
              gt(scheduleOverrides.endsAt, dayStart),
            ),
          )
      : Promise.resolve([]),
    database
      .select({
        id: courtBookings.id,
        courtId: courtBookings.courtId,
        startsAt: courtBookings.startsAt,
        endsAt: courtBookings.endsAt,
        bufferBeforeMinutes: courtBookings.bufferBeforeMinutes,
        bufferAfterMinutes: courtBookings.bufferAfterMinutes,
      })
      .from(courtBookings)
      .where(
        and(
          inArray(courtBookings.courtId, courtIds),
          inArray(courtBookings.status, ["held", "confirmed"]),
          lt(courtBookings.startsAt, dayEnd),
          gt(courtBookings.endsAt, dayStart),
          or(
            eq(courtBookings.status, "confirmed"),
            gt(courtBookings.holdExpiresAt, now),
          ),
        ),
      ),
  ]);
  const scheduleById = new Map(
    scheduleRows.map((schedule) => [schedule.id, schedule]),
  );
  const schedulesByCourt = new Map<string, string[]>();
  for (const schedule of scheduleRows) {
    const existing = schedulesByCourt.get(schedule.resourceId) ?? [];
    existing.push(schedule.id);
    schedulesByCourt.set(schedule.resourceId, existing);
  }
  const weekday = new Date(`${input.date}T12:00:00Z`).getUTCDay();
  const slots = candidates.flatMap((court) => {
    const courtScheduleIds = schedulesByCourt.get(court.id) ?? [];
    const recurringBlocks = blockRows.filter(
      (block) =>
        courtScheduleIds.includes(block.scheduleId) &&
        block.weekday === weekday &&
        (!block.effectiveFrom || block.effectiveFrom <= input.date) &&
        (!block.effectiveTo || block.effectiveTo >= input.date),
    );
    const availability = recurringBlocks
      .filter(
        (block) =>
          block.mode === "open" ||
          block.mode === "rentals-only" ||
          block.mode === "members-only",
      )
      .map((block) => ({
        id: block.id,
        resourceId: court.id,
        startsAt: venueWallTimeToUtc(
          localMinute(input.date, block.startsAtMinute),
          inventory.venue.timezone,
        ).toISOString(),
        endsAt: venueWallTimeToUtc(
          localMinute(input.date, block.endsAtMinute),
          inventory.venue.timezone,
        ).toISOString(),
        mode: block.mode,
      }));
    const hasConfiguredSchedule = courtScheduleIds.length > 0;
    if (!hasConfiguredSchedule) {
      availability.push({
        id: `default-${court.id}`,
        resourceId: court.id,
        startsAt: venueWallTimeToUtc(
          `${input.date}T08:00`,
          inventory.venue.timezone,
        ).toISOString(),
        endsAt: venueWallTimeToUtc(
          `${input.date}T22:00`,
          inventory.venue.timezone,
        ).toISOString(),
        mode: "rentals-only",
      });
    }
    const matchingOverrides = overrideRows.filter(
      (override) =>
        scheduleById.get(override.scheduleId)?.resourceId === court.id,
    );
    for (const override of matchingOverrides) {
      if (
        override.mode === "open" ||
        override.mode === "rentals-only" ||
        override.mode === "members-only"
      ) {
        availability.push({
          id: override.id,
          resourceId: court.id,
          startsAt: override.startsAt.toISOString(),
          endsAt: override.endsAt.toISOString(),
          mode: override.mode,
        });
      }
    }
    const busyRanges = [
      ...bookingRows
        .filter((booking) => booking.courtId === court.id)
        .map((booking) => ({
          id: booking.id,
          resourceId: court.id,
          startsAt: new Date(
            booking.startsAt.getTime() - booking.bufferBeforeMinutes * 60_000,
          ).toISOString(),
          endsAt: new Date(
            booking.endsAt.getTime() + booking.bufferAfterMinutes * 60_000,
          ).toISOString(),
          kind: "booking" as const,
        })),
      ...matchingOverrides
        .filter(
          (override) =>
            override.mode === "blocked" || override.mode === "maintenance",
        )
        .map((override) => ({
          id: override.id,
          resourceId: court.id,
          startsAt: override.startsAt.toISOString(),
          endsAt: override.endsAt.toISOString(),
          kind: "blackout" as const,
        })),
    ];
    const noticeBoundary = new Date(
      now.getTime() + court.minimumNoticeMinutes * 60_000,
    );
    const advanceBoundary = new Date(
      now.getTime() + court.maximumAdvanceDays * 24 * 60 * 60_000,
    );
    const solved = solveAvailableSlots({
      courtIds: [court.id],
      durationMinutes: input.durationMinutes,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      incrementMinutes: court.bookingIncrementMinutes,
      window: {
        startsAt: dayStart.toISOString(),
        endsAt: dayEnd.toISOString(),
      },
      allowedModes: ["open", "rentals-only", "members-only"],
      courtAvailability: availability,
      busyRanges,
    }).filter(
      (slot) =>
        new Date(slot.startsAt) >= noticeBoundary &&
        new Date(slot.endsAt) <= advanceBoundary,
    );
    const rate = court.pricing;
    const price =
      rate &&
      currencyCode(rate.currency) &&
      Number.isFinite(rate.nonMemberAmountMinor ?? rate.baseAmountMinor)
        ? {
            amountMinor: Math.max(
              (rate.nonMemberAmountMinor ?? rate.baseAmountMinor) === 0 ? 0 : 1,
              Math.round(
                ((rate.nonMemberAmountMinor ?? rate.baseAmountMinor) *
                  input.durationMinutes) /
                  rate.rateUnitMinutes,
              ),
            ),
            currency: rate.currency,
          }
        : undefined;
    return solved.map((slot) => ({
      courtId: court.id,
      courtName: court.name,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      localStartsAt: localDateTime(
        new Date(slot.startsAt),
        inventory.venue.timezone,
      ),
      localEndsAt: localDateTime(
        new Date(slot.endsAt),
        inventory.venue.timezone,
      ),
      durationMinutes: input.durationMinutes,
      price,
    }));
  });
  return {
    venueId: input.venueId,
    date: input.date,
    durationMinutes: input.durationMinutes,
    timezone: inventory.venue.timezone,
    generatedAt: now.toISOString(),
    slots: slots.sort(
      (left, right) =>
        Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
        left.courtName.localeCompare(right.courtName),
    ),
  };
}

export async function createAvailabilityAlert(input: {
  readonly actor: ApiActor;
  readonly venueId: string;
  readonly courtId?: string;
  readonly targetDate: string;
  readonly earliestMinute: number;
  readonly latestMinute: number;
  readonly durationMinutes: number;
  readonly channel: "sms" | "push" | "in-app";
  readonly now: Date;
}): Promise<{
  readonly alertId?: string;
  readonly created: boolean;
  readonly status: "active";
  readonly freeAlertsRemaining: number;
  readonly premiumRequired: boolean;
}> {
  if (!process.env.DATABASE_URL) {
    throw new CourtCheckoutError(
      "DATABASE_REQUIRED",
      "Availability alerts require the connected Duna database.",
    );
  }
  const inventory = await loadCourtBookingInventory(input.venueId);
  const targetCourts = input.courtId
    ? inventory.courts.filter((court) => court.id === input.courtId)
    : inventory.courts;
  if (
    targetCourts.length === 0 ||
    !targetCourts.some((court) =>
      court.durationOptionsMinutes.includes(input.durationMinutes),
    )
  ) {
    throw new CourtCheckoutError(
      "INVALID_DURATION",
      "The selected venue or court does not offer that rental length.",
    );
  }
  const database = getDatabase();
  const hasDunaPlus = await hasActiveDunaPlusMembership(
    input.actor.personId,
    input.now,
  );
  const existing = await database.query.availabilityAlerts.findFirst({
    where: and(
      eq(availabilityAlerts.personId, input.actor.personId),
      eq(availabilityAlerts.venueId, input.venueId),
      input.courtId
        ? eq(availabilityAlerts.courtId, input.courtId)
        : sql`${availabilityAlerts.courtId} IS NULL`,
      eq(availabilityAlerts.targetDate, input.targetDate),
      eq(availabilityAlerts.durationMinutes, input.durationMinutes),
      eq(availabilityAlerts.status, "active"),
    ),
  });
  if (existing) {
    return {
      alertId: existing.id,
      created: false,
      status: "active",
      freeAlertsRemaining: hasDunaPlus ? 999 : 0,
      premiumRequired: false,
    };
  }
  const countRows = await database
    .select({ count: sql<number>`count(*)::integer` })
    .from(availabilityAlerts)
    .where(
      and(
        eq(availabilityAlerts.personId, input.actor.personId),
        eq(availabilityAlerts.status, "active"),
      ),
    );
  const activeCount = countRows[0]?.count ?? 0;
  if (!hasDunaPlus && activeCount >= 1) {
    return {
      created: false,
      status: "active",
      freeAlertsRemaining: 0,
      premiumRequired: true,
    };
  }
  const created = (
    await database
      .insert(availabilityAlerts)
      .values({
        personId: input.actor.personId,
        venueId: input.venueId,
        courtId: input.courtId,
        targetDate: input.targetDate,
        earliestMinute: input.earliestMinute,
        latestMinute: input.latestMinute,
        durationMinutes: input.durationMinutes,
        channel: input.channel,
        status: "active",
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: availabilityAlerts.id })
  )[0];
  if (!created) {
    throw new CourtCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "The availability alert could not be created.",
    );
  }
  return {
    alertId: created.id,
    created: true,
    status: "active",
    freeAlertsRemaining: hasDunaPlus ? 999 : Math.max(0, 1 - activeCount - 1),
    premiumRequired: false,
  };
}

async function checkoutResource(courtId: string) {
  const row = (
    await getDatabase()
      .select({
        courtId: courts.id,
        courtName: courts.name,
        courtStatus: courts.status,
        venueId: venues.id,
        venueName: venues.name,
        venueStatus: venues.status,
        timezone: venues.timezone,
        organizationId: organizations.id,
        organizationName: organizations.name,
        stripeAccountId: organizations.stripeAccountId,
        stripeChargesEnabled: organizations.stripeChargesEnabled,
        bookingPolicy: courts.bookingPolicy,
        minimumDurationMinutes: courts.minimumDurationMinutes,
        maximumDurationMinutes: courts.maximumDurationMinutes,
        durationOptionsMinutes: courts.durationOptionsMinutes,
        bookingIncrementMinutes: courts.bookingIncrementMinutes,
        bufferBeforeMinutes: courts.bufferBeforeMinutes,
        bufferAfterMinutes: courts.bufferAfterMinutes,
        minimumNoticeMinutes: courts.minimumNoticeMinutes,
        maximumAdvanceDays: courts.maximumAdvanceDays,
        cancellationPolicy: courts.cancellationPolicy,
        ratePlanId: ratePlans.id,
        rateOrganizationId: ratePlans.organizationId,
        rateName: ratePlans.name,
        currency: ratePlans.currency,
        baseAmountMinor: ratePlans.baseAmountMinor,
        memberAmountMinor: ratePlans.memberAmountMinor,
        nonMemberAmountMinor: ratePlans.nonMemberAmountMinor,
        rateUnitMinutes: ratePlans.rateUnitMinutes,
      })
      .from(courts)
      .innerJoin(venues, eq(courts.venueId, venues.id))
      .innerJoin(organizations, eq(venues.organizationId, organizations.id))
      .leftJoin(ratePlans, eq(courts.ratePlanId, ratePlans.id))
      .where(eq(courts.id, courtId))
      .limit(1)
  )[0];
  if (!row) {
    throw new CourtCheckoutError("COURT_NOT_FOUND", "Court was not found.");
  }
  if (
    row.courtStatus !== "active" ||
    row.venueStatus !== "active" ||
    row.bookingPolicy === "none"
  ) {
    throw new CourtCheckoutError(
      "COURT_NOT_FOUND",
      "This court is not open for consumer booking.",
    );
  }
  if (
    !row.ratePlanId ||
    row.baseAmountMinor === null ||
    row.rateUnitMinutes === null ||
    row.rateOrganizationId !== row.organizationId
  ) {
    throw new CourtCheckoutError(
      "RATE_NOT_CONFIGURED",
      "This court does not have an operator-approved rate plan yet.",
    );
  }
  const currency = row.currency ? currencyCode(row.currency) : undefined;
  if (!currency) {
    throw new CourtCheckoutError(
      "RATE_NOT_CONFIGURED",
      "This court rate uses an unsupported currency.",
    );
  }
  return {
    ...row,
    currency,
    ratePlanId: row.ratePlanId,
    baseAmountMinor: row.baseAmountMinor,
    rateUnitMinutes: row.rateUnitMinutes,
  };
}

async function hasOrganizationMembership(input: {
  readonly personId: string;
  readonly organizationId: string;
}): Promise<boolean> {
  const database = getDatabase();
  const [staff, member] = await Promise.all([
    database.query.organizationMemberships.findFirst({
      where: and(
        eq(organizationMemberships.personId, input.personId),
        eq(organizationMemberships.organizationId, input.organizationId),
        eq(organizationMemberships.active, true),
      ),
    }),
    database
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, input.personId),
          eq(membershipTiers.organizationId, input.organizationId),
          inArray(memberships.status, ["active", "trialing"]),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  return Boolean(staff || member);
}

async function sendBookingInviteSms(input: {
  readonly participantRows: readonly {
    readonly id: string;
    readonly invitedName: string | null;
    readonly invitedPhoneE164: string | null;
    readonly inviteToken: string;
    readonly role: string;
    readonly shareAmountMinor: number;
  }[];
  readonly organizerName: string;
  readonly venueName: string;
  readonly courtName: string;
  readonly startsAt: Date;
  readonly timeZone: string;
  readonly currency: string;
  readonly applicationOrigin: string;
}): Promise<void> {
  const startsAt = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(input.startsAt);
  await Promise.all(
    input.participantRows
      .filter(
        (participant) =>
          participant.role !== "organizer" &&
          Boolean(participant.invitedPhoneE164),
      )
      .map(async (participant) => {
        try {
          await sendTemplateSms({
            to: participant.invitedPhoneE164!,
            idempotencyKey: `court-invite-${participant.id}`,
            parameters: {
              invitee_name: participant.invitedName ?? "Player",
              organizer_name: input.organizerName,
              venue_name: input.venueName,
              court_name: input.courtName,
              starts_at: startsAt,
              share_amount: new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: input.currency,
              }).format(participant.shareAmountMinor / 100),
              invite_url: `${input.applicationOrigin}/app/booking-invite/${participant.inviteToken}`,
            },
          });
        } catch {
          // Checkout remains successful. The invitation can be retried from HQ.
        }
      }),
  );
}

export async function startCourtCheckout(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
  readonly courtId: string;
  readonly localStartsAt: string;
  readonly durationMinutes: number;
  readonly paymentMode: "full" | "split";
  readonly participants: readonly CourtBookingInviteInput[];
  readonly policyAccepted: boolean;
  readonly policyFullScrollConfirmed: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<CourtCheckoutResult> {
  if (!process.env.DATABASE_URL) {
    throw new CourtCheckoutError(
      "DATABASE_REQUIRED",
      "Court checkout requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  const subjectAuthority = await assertSubjectAuthority({
    actor: input.actor,
    subjectPersonId,
  });
  const resource = await checkoutResource(input.courtId);
  if (!resource.durationOptionsMinutes.includes(input.durationMinutes)) {
    throw new CourtCheckoutError(
      "INVALID_DURATION",
      "Choose one of the rental lengths configured by this venue.",
    );
  }
  const policy = normalizeCourtCancellationPolicy(resource.cancellationPolicy);
  if (
    !input.policyAccepted ||
    (policy.requireFullScroll && !input.policyFullScrollConfirmed)
  ) {
    throw new CourtCheckoutError(
      "POLICY_ACCEPTANCE_REQUIRED",
      "Read and accept the venue cancellation policy before checkout.",
    );
  }
  const startsAt = venueWallTimeToUtc(input.localStartsAt, resource.timezone);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  const availability = await loadCourtAvailability({
    venueId: resource.venueId,
    date: dateOfLocalDateTime(input.localStartsAt),
    durationMinutes: input.durationMinutes,
    now: input.now,
  });
  if (
    !availability.slots.some(
      (slot) =>
        slot.courtId === input.courtId &&
        slot.localStartsAt === input.localStartsAt,
    )
  ) {
    return {
      mode: "unavailable",
      bookingStatus: "unavailable",
      paymentMode: input.paymentMode,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      alternatives: availability.slots
        .filter((slot) => slot.courtId === input.courtId)
        .slice(0, 4)
        .map((slot) => ({
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
        })),
      policy,
    };
  }
  const invitedPeople = input.participants.filter((participant, index, all) => {
    const key =
      participant.personId ??
      participant.email?.trim().toLowerCase() ??
      participant.phoneE164?.trim();
    return (
      Boolean(key) &&
      all.findIndex((candidate) => {
        const candidateKey =
          candidate.personId ??
          candidate.email?.trim().toLowerCase() ??
          candidate.phoneE164?.trim();
        return candidateKey === key;
      }) === index &&
      participant.personId !== input.actor.personId &&
      participant.personId !== subjectPersonId
    );
  });
  const personIds = invitedPeople.flatMap((participant) =>
    participant.personId ? [participant.personId] : [],
  );
  const invitedPersonRows =
    personIds.length > 0
      ? await database
          .select({
            id: people.id,
            displayName: people.displayName,
            email: people.email,
            phoneE164: people.phoneE164,
          })
          .from(people)
          .where(inArray(people.id, personIds))
      : [];
  if (invitedPersonRows.length !== new Set(personIds).size) {
    throw new CourtCheckoutError(
      "PARTICIPANT_NOT_FOUND",
      "One or more selected Duna players could not be found.",
    );
  }
  const organizationMember = await hasOrganizationMembership({
    personId: subjectPersonId,
    organizationId: resource.organizationId,
  });
  const rateAmountMinor = organizationMember
    ? (resource.memberAmountMinor ?? resource.baseAmountMinor)
    : (resource.nonMemberAmountMinor ?? resource.baseAmountMinor);
  const subtotalMinor = Math.max(
    rateAmountMinor === 0 ? 0 : 1,
    Math.round(
      (rateAmountMinor * input.durationMinutes) / resource.rateUnitMinutes,
    ),
  );
  const hasDunaPlus = await hasActiveDunaPlusMembership(
    input.actor.personId,
    input.now,
  );
  const priced = priceConsumerOrder({
    currency: resource.currency,
    isDunaPlus: hasDunaPlus,
    items: [
      {
        id: resource.courtId,
        kind: "booking",
        description: `${resource.venueName} · ${resource.courtName}`,
        quantity: 1,
        unitAmountMinor: subtotalMinor,
      },
    ],
  });
  const feeTotalMinor = priced.fees.reduce(
    (total, fee) => total + fee.amountMinor,
    0,
  );
  const pricing = {
    subtotalMinor: priced.subtotalMinor,
    feeTotalMinor,
    totalMinor: priced.totalMinor,
    payNowMinor: priced.totalMinor,
    currency: priced.currency,
    rateUnitMinutes: resource.rateUnitMinutes,
  };
  if (
    priced.totalMinor > 0 &&
    (!resource.stripeChargesEnabled ||
      !resource.stripeAccountId ||
      !isStripeConfigured())
  ) {
    throw new CourtCheckoutError(
      "PAYMENTS_NOT_READY",
      "This operator must finish payment activation before accepting paid court bookings.",
    );
  }
  const hold = await createCourtHold({
    actor: input.actor,
    subjectPersonId,
    courtId: input.courtId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    holdMinutes:
      priced.totalMinor > 0 ? (input.paymentMode === "split" ? 120 : 35) : 10,
    now: input.now,
  });
  if (!hold.success || !hold.bookingId) {
    return {
      mode: "unavailable",
      bookingStatus: "unavailable",
      paymentMode: input.paymentMode,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      alternatives: hold.alternatives,
      pricing,
      policy,
    };
  }

  const buyer = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!buyer) {
    throw new CourtCheckoutError(
      "PARTICIPANT_NOT_FOUND",
      "The booking organizer could not be found.",
    );
  }
  const orderId = priced.totalMinor > 0 ? crypto.randomUUID() : undefined;
  const participantCount =
    input.paymentMode === "split" ? invitedPeople.length + 1 : 1;
  if (
    input.paymentMode === "split" &&
    priced.totalMinor > 0 &&
    priced.totalMinor < participantCount
  ) {
    throw new CourtCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "There are too many payment shares for this booking total.",
    );
  }
  const baseShare =
    input.paymentMode === "split" && priced.totalMinor > 0
      ? Math.floor(priced.totalMinor / participantCount)
      : priced.totalMinor;
  const organizerShare =
    input.paymentMode === "split" && priced.totalMinor > 0
      ? baseShare + (priced.totalMinor - baseShare * participantCount)
      : priced.totalMinor;
  const participantRows = [
    {
      id: crypto.randomUUID(),
      bookingId: hold.bookingId,
      personId: subjectPersonId,
      invitedName: subjectAuthority.person.displayName,
      invitedEmail: subjectAuthority.person.email,
      invitedPhoneE164: subjectAuthority.person.phoneE164,
      inviteToken: crypto.randomUUID(),
      role: "organizer",
      status:
        priced.totalMinor === 0
          ? ("paid" as const)
          : ("payment-pending" as const),
      shareAmountMinor: organizerShare,
      orderId,
      paidAt: priced.totalMinor === 0 ? input.now : null,
      acceptedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    },
    ...invitedPeople.map((participant) => {
      const linked = participant.personId
        ? invitedPersonRows.find((person) => person.id === participant.personId)
        : undefined;
      return {
        id: crypto.randomUUID(),
        bookingId: hold.bookingId!,
        personId: linked?.id,
        invitedName:
          linked?.displayName ?? participant.name?.trim() ?? "Invited player",
        invitedEmail:
          linked?.email ?? participant.email?.trim().toLowerCase() ?? null,
        invitedPhoneE164:
          linked?.phoneE164 ?? participant.phoneE164?.trim() ?? null,
        inviteToken: crypto.randomUUID(),
        role: "player",
        status: "invited" as const,
        shareAmountMinor: input.paymentMode === "split" ? baseShare : 0,
        orderId: null,
        paidAt: null,
        acceptedAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
    }),
  ];
  const participantOutput = participantRows.map((participant) => ({
    id: participant.id,
    personId: participant.personId ?? undefined,
    displayName: participant.invitedName ?? "Invited player",
    role: participant.role,
    status: participant.status,
    shareAmountMinor: participant.shareAmountMinor,
    inviteToken:
      participant.role === "organizer" ? undefined : participant.inviteToken,
  }));
  const policyHash = stableHash(policy.markdown);
  const policyAcceptance = {
    acceptanceKey: stableHash({
      bookingId: hold.bookingId,
      personId: subjectPersonId,
      policyHash,
    }),
    bookingId: hold.bookingId,
    subjectPersonId,
    acceptedByPersonId: input.actor.personId,
    policyTitle: policy.title,
    documentText: policy.markdown,
    documentTextHash: policyHash,
    fullScrollConfirmed: input.policyFullScrollConfirmed,
    ipAddress: input.ipAddress,
    acceptedAt: input.now,
    createdAt: input.now,
  };

  if (priced.totalMinor === 0) {
    await database.batch([
      database.insert(courtBookingParticipants).values(participantRows),
      database.insert(bookingPolicyAcceptances).values(policyAcceptance),
      database
        .update(courtBookings)
        .set({
          status: "confirmed",
          paymentMode: input.paymentMode,
          totalAmountMinor: 0,
          fundedAmountMinor: 0,
          currency: priced.currency,
          participantTarget: 1,
          policySnapshot: policy,
          holdExpiresAt: null,
          updatedAt: input.now,
        })
        .where(eq(courtBookings.id, hold.bookingId)),
      database.insert(auditLog).values({
        organizationId: resource.organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "court-booking.confirmed",
        entityType: "court-booking",
        entityId: hold.bookingId,
        reason: "A no-charge court booking was confirmed without payment.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
    await sendBookingInviteSms({
      participantRows,
      organizerName: buyer.displayName,
      venueName: resource.venueName,
      courtName: resource.courtName,
      startsAt,
      timeZone: resource.timezone,
      currency: priced.currency,
      applicationOrigin: new URL(input.successUrl).origin,
    });
    return {
      mode: "free",
      bookingId: hold.bookingId,
      bookingStatus: "confirmed",
      paymentMode: input.paymentMode,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      alternatives: [],
      pricing: { ...pricing, payNowMinor: 0 },
      policy,
      participants: participantOutput,
    };
  }

  const checkoutExpiresAt = new Date(
    input.now.getTime() + (input.paymentMode === "split" ? 115 : 30) * 60_000,
  );
  const operatorProcessingFee = calculateOperatorProcessingFee({
    amountMinor: priced.subtotalMinor,
    currency: priced.currency,
    method: "online-card",
  });
  const organizerSubtotal =
    input.paymentMode === "split"
      ? Math.min(
          organizerShare,
          Math.round(
            (priced.subtotalMinor * organizerShare) / priced.totalMinor,
          ),
        )
      : priced.subtotalMinor;
  const organizerConsumerFee = organizerShare - organizerSubtotal;
  const organizerOperatorFee =
    input.paymentMode === "split"
      ? Math.round(
          (operatorProcessingFee.amountMinor * organizerShare) /
            priced.totalMinor,
        )
      : operatorProcessingFee.amountMinor;
  pricing.payNowMinor = organizerShare;
  await database.batch([
    database.insert(orders).values({
      id: orderId!,
      organizationId: resource.organizationId,
      buyerPersonId: input.actor.personId,
      status: "pending",
      currency: priced.currency,
      subtotalMinor: organizerSubtotal,
      feeTotalMinor: organizerConsumerFee,
      taxTotalMinor: 0,
      totalMinor: organizerShare,
      idempotencyKey: input.idempotencyKey,
      expiresAt: checkoutExpiresAt,
    }),
    database.insert(orderItems).values({
      orderId: orderId!,
      kind: "booking",
      referenceId: hold.bookingId,
      description: `${resource.venueName} · ${resource.courtName} · ${input.durationMinutes} minutes`,
      quantity: 1,
      unitAmountMinor: organizerSubtotal,
      totalAmountMinor: organizerSubtotal,
    }),
    ...(input.paymentMode === "split"
      ? [
          ...(organizerConsumerFee > 0
            ? [
                database.insert(appliedFees).values({
                  orderId: orderId!,
                  ruleId: "duna-booking-split-share",
                  payer: "consumer",
                  amountMinor: organizerConsumerFee,
                  currency: priced.currency,
                  ruleInputs: {
                    bookingTotalMinor: priced.totalMinor,
                    participantTarget: participantCount,
                  },
                }),
              ]
            : []),
          ...(organizerOperatorFee > 0
            ? [
                database.insert(appliedFees).values({
                  orderId: orderId!,
                  ruleId: "stripe-processing-estimate",
                  payer: "operator",
                  amountMinor: organizerOperatorFee,
                  currency: priced.currency,
                  ruleInputs: {
                    bookingTotalMinor: priced.totalMinor,
                    paymentMode: "split",
                  },
                }),
              ]
            : []),
        ]
      : [...priced.fees, operatorProcessingFee]
          .filter((fee) => fee.amountMinor > 0)
          .map((fee) =>
            database.insert(appliedFees).values({
              orderId: orderId!,
              ruleId: fee.id,
              payer: fee.payer,
              amountMinor: fee.amountMinor,
              currency: fee.currency,
              ruleInputs: fee.ruleInputs,
            }),
          )),
    database.insert(courtBookingParticipants).values(participantRows),
    database.insert(bookingPolicyAcceptances).values(policyAcceptance),
    database
      .update(courtBookings)
      .set({
        orderId: input.paymentMode === "full" ? orderId : null,
        paymentMode: input.paymentMode,
        totalAmountMinor: priced.totalMinor,
        fundedAmountMinor: 0,
        currency: priced.currency,
        participantTarget: input.paymentMode === "split" ? participantCount : 1,
        policySnapshot: policy,
        updatedAt: input.now,
      })
      .where(eq(courtBookings.id, hold.bookingId)),
  ]);

  try {
    const checkout = await createCourtCheckoutSession({
      orderId: orderId!,
      bookingId: hold.bookingId,
      personId: input.actor.personId,
      customerEmail: buyer?.email ?? undefined,
      description: `${resource.venueName} · ${resource.courtName}`,
      amountMinor: organizerShare,
      currency: priced.currency,
      applicationFeeMinor: Math.min(
        organizerShare,
        organizerConsumerFee + organizerOperatorFee,
      ),
      connectedAccountId: resource.stripeAccountId!,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: checkoutExpiresAt,
      idempotencyKey: input.idempotencyKey,
    });
    if (!checkout.url) {
      throw new CourtCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The payment processor did not return a checkout URL.",
      );
    }
    await database.batch([
      database
        .update(orders)
        .set({
          stripeCheckoutSessionId: checkout.id,
          expiresAt: new Date(checkout.expiresAt),
          updatedAt: input.now,
        })
        .where(eq(orders.id, orderId!)),
      database
        .update(courtBookings)
        .set({
          holdExpiresAt: new Date(
            new Date(checkout.expiresAt).getTime() + 5 * 60_000,
          ),
          updatedAt: input.now,
        })
        .where(eq(courtBookings.id, hold.bookingId)),
    ]);
    await sendBookingInviteSms({
      participantRows,
      organizerName: buyer.displayName,
      venueName: resource.venueName,
      courtName: resource.courtName,
      startsAt,
      timeZone: resource.timezone,
      currency: priced.currency,
      applicationOrigin: new URL(input.successUrl).origin,
    });
    return {
      mode: "stripe",
      bookingId: hold.bookingId,
      bookingStatus: "held",
      paymentMode: input.paymentMode,
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiresAt: checkout.expiresAt,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      alternatives: [],
      pricing,
      policy,
      participants: participantOutput,
    };
  } catch (error) {
    await database.batch([
      database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId!)),
      database
        .update(courtBookingParticipants)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(courtBookingParticipants.orderId, orderId!)),
      ...(input.paymentMode === "full"
        ? [
            database
              .update(courtBookings)
              .set({
                status: "cancelled" as const,
                holdExpiresAt: null,
                updatedAt: input.now,
              })
              .where(eq(courtBookings.id, hold.bookingId)),
          ]
        : []),
    ]);
    throw error;
  }
}

export async function startParticipantShareCheckout(input: {
  readonly actor: ApiActor;
  readonly inviteToken: string;
  readonly policyAccepted: boolean;
  readonly policyFullScrollConfirmed: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<CourtCheckoutResult> {
  if (!process.env.DATABASE_URL) {
    throw new CourtCheckoutError(
      "DATABASE_REQUIRED",
      "Participant checkout requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const participant = await database.query.courtBookingParticipants.findFirst({
    where: eq(courtBookingParticipants.inviteToken, input.inviteToken),
  });
  if (!participant) {
    throw new CourtCheckoutError(
      "PARTICIPANT_NOT_FOUND",
      "This booking invitation is not available.",
    );
  }
  const booking = await database.query.courtBookings.findFirst({
    where: eq(courtBookings.id, participant.bookingId),
  });
  if (
    !booking ||
    booking.paymentMode !== "split" ||
    booking.status !== "held" ||
    !booking.holdExpiresAt ||
    booking.holdExpiresAt <= input.now
  ) {
    throw new CourtCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "This shared booking is no longer awaiting payment.",
    );
  }
  const actorPerson = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!actorPerson) {
    throw new CourtCheckoutError(
      "PARTICIPANT_NOT_FOUND",
      "The signed-in player could not be found.",
    );
  }
  if (participant.personId) {
    await assertSubjectAuthority({
      actor: input.actor,
      subjectPersonId: participant.personId,
    });
  } else {
    const emailMatches =
      participant.invitedEmail &&
      actorPerson.email &&
      participant.invitedEmail.trim().toLowerCase() ===
        actorPerson.email.trim().toLowerCase();
    const phoneMatches =
      participant.invitedPhoneE164 &&
      actorPerson.phoneE164 &&
      participant.invitedPhoneE164 === actorPerson.phoneE164;
    if (!emailMatches && !phoneMatches) {
      throw new CourtCheckoutError(
        "PARTICIPANT_NOT_FOUND",
        "Sign in with the email or phone number that received this invitation.",
      );
    }
  }
  const policy = normalizeCourtCancellationPolicy(booking.policySnapshot);
  if (
    !input.policyAccepted ||
    (policy.requireFullScroll && !input.policyFullScrollConfirmed)
  ) {
    throw new CourtCheckoutError(
      "POLICY_ACCEPTANCE_REQUIRED",
      "Read and accept the venue cancellation policy before paying your share.",
    );
  }
  const resource = await checkoutResource(booking.courtId);
  if (
    !resource.stripeChargesEnabled ||
    !resource.stripeAccountId ||
    !isStripeConfigured()
  ) {
    throw new CourtCheckoutError(
      "PAYMENTS_NOT_READY",
      "This operator is not ready to accept participant payments.",
    );
  }
  const organizerParticipant = (
    await database
      .select({
        orderId: courtBookingParticipants.orderId,
      })
      .from(courtBookingParticipants)
      .where(
        and(
          eq(courtBookingParticipants.bookingId, booking.id),
          eq(courtBookingParticipants.role, "organizer"),
        ),
      )
      .limit(1)
  )[0];
  const organizerOrder = organizerParticipant?.orderId
    ? await database.query.orders.findFirst({
        where: eq(orders.id, organizerParticipant.orderId),
      })
    : undefined;
  const shareAmountMinor = participant.shareAmountMinor;
  if (shareAmountMinor <= 0) {
    await database
      .update(courtBookingParticipants)
      .set({
        personId: participant.personId ?? input.actor.personId,
        status: "accepted",
        acceptedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(courtBookingParticipants.id, participant.id));
    return {
      mode: "free",
      bookingId: booking.id,
      bookingStatus: "held",
      paymentMode: "split",
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      alternatives: [],
      pricing: {
        subtotalMinor: 0,
        feeTotalMinor: 0,
        totalMinor: booking.totalAmountMinor,
        payNowMinor: 0,
        currency: currencyCode(booking.currency) ?? "USD",
        rateUnitMinutes: resource.rateUnitMinutes,
      },
      policy,
    };
  }
  const subtotalMinor =
    organizerOrder && organizerOrder.totalMinor > 0
      ? Math.min(
          shareAmountMinor,
          Math.round(
            (shareAmountMinor * organizerOrder.subtotalMinor) /
              organizerOrder.totalMinor,
          ),
        )
      : shareAmountMinor;
  const feeTotalMinor = shareAmountMinor - subtotalMinor;
  const processingFee = calculateOperatorProcessingFee({
    amountMinor: subtotalMinor,
    currency: currencyCode(booking.currency) ?? resource.currency,
    method: "online-card",
  });
  const orderId = crypto.randomUUID();
  const checkoutExpiresAt = new Date(input.now.getTime() + 30 * 60_000);
  const policyHash = stableHash(policy.markdown);
  await database.batch([
    database.insert(orders).values({
      id: orderId,
      organizationId: booking.organizationId,
      buyerPersonId: input.actor.personId,
      status: "pending",
      currency: booking.currency,
      subtotalMinor,
      feeTotalMinor,
      taxTotalMinor: 0,
      totalMinor: shareAmountMinor,
      idempotencyKey: input.idempotencyKey,
      expiresAt: checkoutExpiresAt,
    }),
    database.insert(orderItems).values({
      orderId,
      kind: "booking",
      referenceId: booking.id,
      description: `${resource.venueName} · ${resource.courtName} · participant share`,
      quantity: 1,
      unitAmountMinor: subtotalMinor,
      totalAmountMinor: subtotalMinor,
    }),
    ...(feeTotalMinor > 0
      ? [
          database.insert(appliedFees).values({
            orderId,
            ruleId: "duna-booking-split-share",
            payer: "consumer",
            amountMinor: feeTotalMinor,
            currency: booking.currency,
            ruleInputs: {
              bookingTotalMinor: booking.totalAmountMinor,
              shareAmountMinor,
            },
          }),
        ]
      : []),
    ...(processingFee.amountMinor > 0
      ? [
          database.insert(appliedFees).values({
            orderId,
            ruleId: processingFee.id,
            payer: processingFee.payer,
            amountMinor: processingFee.amountMinor,
            currency: processingFee.currency,
            ruleInputs: processingFee.ruleInputs,
          }),
        ]
      : []),
    database
      .update(courtBookingParticipants)
      .set({
        personId: participant.personId ?? input.actor.personId,
        status: "payment-pending",
        orderId,
        acceptedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(courtBookingParticipants.id, participant.id)),
    database.insert(bookingPolicyAcceptances).values({
      acceptanceKey: stableHash({
        bookingId: booking.id,
        subjectPersonId: participant.personId ?? input.actor.personId,
        acceptedByPersonId: input.actor.personId,
        policyHash,
      }),
      bookingId: booking.id,
      subjectPersonId: participant.personId ?? input.actor.personId,
      acceptedByPersonId: input.actor.personId,
      policyTitle: policy.title,
      documentText: policy.markdown,
      documentTextHash: policyHash,
      fullScrollConfirmed: input.policyFullScrollConfirmed,
      ipAddress: input.ipAddress,
      acceptedAt: input.now,
      createdAt: input.now,
    }),
  ]);
  try {
    const checkout = await createCourtCheckoutSession({
      orderId,
      bookingId: booking.id,
      personId: input.actor.personId,
      customerEmail: actorPerson.email ?? undefined,
      description: `${resource.venueName} · ${resource.courtName} · your share`,
      amountMinor: shareAmountMinor,
      currency: booking.currency,
      applicationFeeMinor: Math.min(
        shareAmountMinor,
        feeTotalMinor + processingFee.amountMinor,
      ),
      connectedAccountId: resource.stripeAccountId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: checkoutExpiresAt,
      idempotencyKey: input.idempotencyKey,
    });
    if (!checkout.url) {
      throw new CourtCheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The payment processor did not return a checkout URL.",
      );
    }
    await database.batch([
      database
        .update(orders)
        .set({
          stripeCheckoutSessionId: checkout.id,
          expiresAt: new Date(checkout.expiresAt),
          updatedAt: input.now,
        })
        .where(eq(orders.id, orderId)),
      database
        .update(courtBookings)
        .set({
          holdExpiresAt: new Date(
            new Date(checkout.expiresAt).getTime() + 5 * 60_000,
          ),
          updatedAt: input.now,
        })
        .where(eq(courtBookings.id, booking.id)),
    ]);
    return {
      mode: "stripe",
      bookingId: booking.id,
      bookingStatus: "held",
      paymentMode: "split",
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiresAt: checkout.expiresAt,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      alternatives: [],
      pricing: {
        subtotalMinor,
        feeTotalMinor,
        totalMinor: booking.totalAmountMinor,
        payNowMinor: shareAmountMinor,
        currency: currencyCode(booking.currency) ?? "USD",
        rateUnitMinutes: resource.rateUnitMinutes,
      },
      policy,
    };
  } catch (error) {
    await database.batch([
      database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId)),
      database
        .update(courtBookingParticipants)
        .set({
          status: "invited",
          orderId: null,
          updatedAt: input.now,
        })
        .where(eq(courtBookingParticipants.id, participant.id)),
    ]);
    throw error;
  }
}

export async function loadCourtBookingInvite(inviteToken: string) {
  if (!process.env.DATABASE_URL) {
    throw new CourtCheckoutError(
      "DATABASE_REQUIRED",
      "Booking invitations require the connected Duna database.",
    );
  }
  const database = getDatabase();
  const participant = await database.query.courtBookingParticipants.findFirst({
    where: eq(courtBookingParticipants.inviteToken, inviteToken),
  });
  if (!participant) {
    throw new CourtCheckoutError(
      "PARTICIPANT_NOT_FOUND",
      "This booking invitation was not found.",
    );
  }
  const booking = await database.query.courtBookings.findFirst({
    where: eq(courtBookings.id, participant.bookingId),
  });
  if (!booking) {
    throw new CourtCheckoutError(
      "COURT_NOT_FOUND",
      "The invited court booking was not found.",
    );
  }
  const [venue, court, organizer, linkedPerson] = await Promise.all([
    database.query.venues.findFirst({
      where: eq(venues.id, booking.venueId),
    }),
    database.query.courts.findFirst({
      where: eq(courts.id, booking.courtId),
    }),
    database.query.people.findFirst({
      where: eq(people.id, booking.personId),
    }),
    participant.personId
      ? database.query.people.findFirst({
          where: eq(people.id, participant.personId),
        })
      : Promise.resolve(undefined),
  ]);
  if (!venue || !court || !organizer) {
    throw new CourtCheckoutError(
      "COURT_NOT_FOUND",
      "The invited court booking is incomplete.",
    );
  }
  return {
    bookingId: booking.id,
    inviteToken,
    venueName: venue.name,
    courtName: court.name,
    organizerName: organizer.displayName,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    timezone: venue.timezone,
    bookingStatus: booking.status,
    participant: {
      id: participant.id,
      personId: participant.personId ?? undefined,
      displayName:
        linkedPerson?.displayName ??
        participant.invitedName ??
        "Invited player",
      role: participant.role,
      status: participant.status as
        | "organizer"
        | "invited"
        | "accepted"
        | "payment-pending"
        | "paid"
        | "declined"
        | "cancelled",
      shareAmountMinor: participant.shareAmountMinor,
    },
    policy: normalizeCourtCancellationPolicy(booking.policySnapshot),
    currency: currencyCode(booking.currency) ?? "USD",
    available:
      booking.status === "held" &&
      Boolean(booking.holdExpiresAt && booking.holdExpiresAt > new Date()) &&
      !["paid", "cancelled", "declined"].includes(participant.status),
  };
}

export async function getCourtCheckoutStatus(input: {
  readonly actor: ApiActor;
  readonly checkoutSessionId: string;
}): Promise<CourtCheckoutStatus> {
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: eq(orders.stripeCheckoutSessionId, input.checkoutSessionId),
  });
  if (!order || order.buyerPersonId !== input.actor.personId) {
    throw new CourtCheckoutError(
      "COURT_NOT_FOUND",
      "Court checkout session was not found.",
    );
  }
  let booking = await database.query.courtBookings.findFirst({
    where: eq(courtBookings.orderId, order.id),
  });
  if (!booking) {
    const participant = await database.query.courtBookingParticipants.findFirst(
      {
        where: eq(courtBookingParticipants.orderId, order.id),
      },
    );
    if (participant) {
      booking = await database.query.courtBookings.findFirst({
        where: eq(courtBookings.id, participant.bookingId),
      });
    }
  }
  if (!booking) {
    throw new CourtCheckoutError(
      "COURT_NOT_FOUND",
      "Court booking was not found.",
    );
  }
  const participantRows = await database
    .select({
      id: courtBookingParticipants.id,
      personId: courtBookingParticipants.personId,
      invitedName: courtBookingParticipants.invitedName,
      displayName: people.displayName,
      role: courtBookingParticipants.role,
      status: courtBookingParticipants.status,
      shareAmountMinor: courtBookingParticipants.shareAmountMinor,
    })
    .from(courtBookingParticipants)
    .leftJoin(people, eq(courtBookingParticipants.personId, people.id))
    .where(eq(courtBookingParticipants.bookingId, booking.id))
    .orderBy(asc(courtBookingParticipants.createdAt));
  const sharePaid = order.status === "paid";
  return {
    bookingId: booking.id,
    bookingStatus: booking.status,
    orderStatus: order.status,
    complete: sharePaid && booking.status === "confirmed",
    sharePaid,
    awaitingParticipants:
      sharePaid && booking.paymentMode === "split" && booking.status === "held",
    fundedAmountMinor: booking.fundedAmountMinor,
    totalAmountMinor: booking.totalAmountMinor,
    paymentMode: booking.paymentMode === "split" ? "split" : "full",
    participants: participantRows.map((participant) => ({
      id: participant.id,
      personId: participant.personId ?? undefined,
      displayName:
        participant.displayName ?? participant.invitedName ?? "Invited player",
      role: participant.role,
      status: participant.status as
        | "organizer"
        | "invited"
        | "accepted"
        | "payment-pending"
        | "paid"
        | "declined"
        | "cancelled",
      shareAmountMinor: participant.shareAmountMinor,
    })),
  };
}
