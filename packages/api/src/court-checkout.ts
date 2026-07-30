import {
  appliedFees,
  auditLog,
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
  venues,
} from "@duna/db";
import {
  calculateOperatorProcessingFee,
  priceConsumerOrder,
  type CurrencyCode,
} from "@duna/pricing";
import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CourtBookingInventory,
  CourtCheckoutResult,
  CourtCheckoutStatus,
} from "./contracts";
import { createCourtHold } from "./commerce";
import type { ApiActor } from "./context";
import { hasActiveDunaPlusMembership } from "./membership";
import { createCourtCheckoutSession, isStripeConfigured } from "./payments";

export class CourtCheckoutError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "COURT_NOT_FOUND"
      | "RATE_NOT_CONFIGURED"
      | "PAYMENTS_NOT_READY"
      | "INVALID_LOCAL_TIME"
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
        city: venues.locality,
        region: venues.administrativeArea,
        timezone: venues.timezone,
        status: venues.status,
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
      status: courts.status,
      bookingPolicy: courts.bookingPolicy,
      minimumDurationMinutes: courts.minimumDurationMinutes,
      maximumDurationMinutes: courts.maximumDurationMinutes,
      minimumNoticeMinutes: courts.minimumNoticeMinutes,
      maximumAdvanceDays: courts.maximumAdvanceDays,
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
      city: venue.city ?? "City not set",
      region: venue.region ?? "Region not set",
      timezone: venue.timezone,
      organizationName: venue.organizationName,
      paymentsReady: venue.paymentsReady,
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
          bookingPolicy: court.bookingPolicy,
          minimumDurationMinutes: court.minimumDurationMinutes,
          maximumDurationMinutes: court.maximumDurationMinutes,
          minimumNoticeMinutes: court.minimumNoticeMinutes,
          maximumAdvanceDays: court.maximumAdvanceDays,
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

async function checkoutResource(courtId: string) {
  const row = (
    await getDatabase()
      .select({
        courtId: courts.id,
        courtName: courts.name,
        venueId: venues.id,
        venueName: venues.name,
        timezone: venues.timezone,
        organizationId: organizations.id,
        organizationName: organizations.name,
        stripeAccountId: organizations.stripeAccountId,
        stripeChargesEnabled: organizations.stripeChargesEnabled,
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

export async function startCourtCheckout(input: {
  readonly actor: ApiActor;
  readonly courtId: string;
  readonly localStartsAt: string;
  readonly durationMinutes: number;
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
  const resource = await checkoutResource(input.courtId);
  const startsAt = venueWallTimeToUtc(input.localStartsAt, resource.timezone);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  const organizationMember = await hasOrganizationMembership({
    personId: input.actor.personId,
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
      "This operator must finish Stripe payout activation before accepting paid court bookings.",
    );
  }
  const hold = await createCourtHold({
    actor: input.actor,
    courtId: input.courtId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    holdMinutes: priced.totalMinor > 0 ? 35 : 10,
    now: input.now,
  });
  if (!hold.success || !hold.bookingId) {
    return {
      mode: "unavailable",
      bookingStatus: "unavailable",
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      alternatives: hold.alternatives,
      pricing,
    };
  }

  if (priced.totalMinor === 0) {
    await database.batch([
      database
        .update(courtBookings)
        .set({
          status: "confirmed",
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
    return {
      mode: "free",
      bookingId: hold.bookingId,
      bookingStatus: "confirmed",
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      alternatives: [],
      pricing,
    };
  }

  const orderId = crypto.randomUUID();
  const checkoutExpiresAt = new Date(input.now.getTime() + 30 * 60_000);
  const operatorProcessingFee = calculateOperatorProcessingFee({
    amountMinor: priced.subtotalMinor,
    currency: priced.currency,
    method: "online-card",
  });
  await database.batch([
    database.insert(orders).values({
      id: orderId,
      organizationId: resource.organizationId,
      buyerPersonId: input.actor.personId,
      status: "pending",
      currency: priced.currency,
      subtotalMinor: priced.subtotalMinor,
      feeTotalMinor,
      taxTotalMinor: 0,
      totalMinor: priced.totalMinor,
      idempotencyKey: input.idempotencyKey,
      expiresAt: checkoutExpiresAt,
    }),
    database.insert(orderItems).values({
      orderId,
      kind: "booking",
      referenceId: hold.bookingId,
      description: `${resource.venueName} · ${resource.courtName} · ${input.durationMinutes} minutes`,
      quantity: 1,
      unitAmountMinor: priced.subtotalMinor,
      totalAmountMinor: priced.subtotalMinor,
    }),
    ...[...priced.fees, operatorProcessingFee]
      .filter((fee) => fee.amountMinor > 0)
      .map((fee) =>
        database.insert(appliedFees).values({
          orderId,
          ruleId: fee.id,
          payer: fee.payer,
          amountMinor: fee.amountMinor,
          currency: fee.currency,
          ruleInputs: fee.ruleInputs,
        }),
      ),
    database
      .update(courtBookings)
      .set({ orderId, updatedAt: input.now })
      .where(eq(courtBookings.id, hold.bookingId)),
  ]);

  const buyer = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  try {
    const checkout = await createCourtCheckoutSession({
      orderId,
      bookingId: hold.bookingId,
      personId: input.actor.personId,
      customerEmail: buyer?.email ?? undefined,
      description: `${resource.venueName} · ${resource.courtName}`,
      amountMinor: priced.totalMinor,
      currency: priced.currency,
      applicationFeeMinor: Math.min(
        priced.totalMinor,
        feeTotalMinor + operatorProcessingFee.amountMinor,
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
        "Stripe did not return a checkout URL.",
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
        .where(eq(courtBookings.id, hold.bookingId)),
    ]);
    return {
      mode: "stripe",
      bookingId: hold.bookingId,
      bookingStatus: "held",
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiresAt: checkout.expiresAt,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      alternatives: [],
      pricing,
    };
  } catch (error) {
    await database.batch([
      database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId)),
      database
        .update(courtBookings)
        .set({
          status: "cancelled",
          holdExpiresAt: null,
          updatedAt: input.now,
        })
        .where(eq(courtBookings.id, hold.bookingId)),
    ]);
    throw error;
  }
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
  const booking = await database.query.courtBookings.findFirst({
    where: eq(courtBookings.orderId, order.id),
  });
  if (!booking) {
    throw new CourtCheckoutError(
      "COURT_NOT_FOUND",
      "Court booking was not found.",
    );
  }
  return {
    bookingId: booking.id,
    bookingStatus: booking.status,
    orderStatus: order.status,
    complete: order.status === "paid" && booking.status === "confirmed",
  };
}
