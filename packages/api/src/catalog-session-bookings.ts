import {
  auditLog,
  catalogFulfillments,
  catalogItems,
  catalogSessionOccurrences,
  catalogVariants,
  getDatabase,
  guardianships,
  orders,
  organizationRefundPolicies,
  organizations,
  people,
  venues,
} from "@duna/db";
import { and, asc, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  assertGuardianCanBookFor,
  CatalogCheckoutError,
  startCatalogCheckout,
} from "./catalog-checkout";
import { ACTIVE_CATALOG_BOOKING_STATUSES } from "./catalog-participation";
import {
  positiveInteger,
  type OccurrenceParticipationState,
} from "./catalog-participation-rules";
import { lateCancellationCharge } from "@duna/core";
import { evaluateCatalogSessionParticipation } from "./catalog-participation";
import {
  catalogSessionPicture,
  decisionRule,
  effectiveLockAt,
  loadDecision,
} from "./services/participation/catalog";
import { participationAdjustments } from "@duna/db";
import { refundOrganizationOrder } from "./catalog-service";
import type { ApiActor } from "./context";

/** Matches the default organization refund policy: 24 hours before start. */
const DEFAULT_REFUND_MINUTES = 24 * 60;
export const MAX_CATALOG_SESSIONS_PER_BOOKING = 20;

export class CatalogSessionBookingError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "INVALID_REQUEST"
      | "BOOKING_NOT_FOUND"
      | "NOT_ALLOWED"
      | "NOT_CANCELLABLE"
      | "REFUND_WINDOW_CLOSED",
    message: string,
  ) {
    super(message);
    this.name = "CatalogSessionBookingError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new CatalogSessionBookingError(
      "DATABASE_REQUIRED",
      "Session bookings require the connected Duna database.",
    );
  }
}

const activeStatuses = [...ACTIVE_CATALOG_BOOKING_STATUSES];

/** Dependents whose schedule this guardian may see. Read on the primary. */
async function verifiedDependentIds(
  guardianPersonId: string,
): Promise<readonly string[]> {
  const rows = await getDatabase()
    .select({ minorId: guardianships.minorId })
    .from(guardianships)
    .where(
      and(
        eq(guardianships.guardianId, guardianPersonId),
        eq(guardianships.verified, true),
        eq(guardianships.reviewStatus, "verified"),
      ),
    );
  return rows.map((row) => row.minorId);
}

async function refundWindow(organizationId: string): Promise<{
  readonly refundable: boolean;
  readonly refundBeforeMinutes: number;
  readonly policyName: string;
}> {
  const policy = await getDatabase().query.organizationRefundPolicies.findFirst(
    {
      where: and(
        eq(organizationRefundPolicies.organizationId, organizationId),
        eq(organizationRefundPolicies.isDefault, true),
        eq(organizationRefundPolicies.active, true),
      ),
    },
  );
  if (policy?.mode === "non-refundable") {
    return {
      refundable: false,
      refundBeforeMinutes: 0,
      policyName: policy.name,
    };
  }
  return {
    refundable: true,
    refundBeforeMinutes: policy?.refundBeforeMinutes ?? DEFAULT_REFUND_MINUTES,
    policyName: policy?.name ?? "Flexible · 24 hours",
  };
}

// ---------------------------------------------------------------------------
// Booking several sessions in one call
// ---------------------------------------------------------------------------

export interface CatalogSessionBookingRequest {
  readonly catalogItemId: string;
  readonly catalogVariantId: string;
  readonly catalogSessionOccurrenceId: string;
  /** Defaults to the caller. A dependent requires a verified guardian. */
  readonly participantPersonId?: string;
  readonly quantity?: number;
}

export interface CatalogSessionBookingItemResult {
  readonly index: number;
  readonly catalogSessionOccurrenceId: string;
  readonly participantPersonId: string;
  readonly status: "booked" | "failed" | "rolled-back" | "skipped";
  readonly bookingId?: string;
  readonly orderId?: string;
  readonly creditsApplied?: number;
  readonly errorCode?: string;
  readonly message?: string;
}

export interface CatalogSessionBookingResult {
  /**
   * booked: every session is booked. failed: nothing remains booked.
   * partial: only when `atomic` is false, or a rollback could not complete.
   */
  readonly status: "booked" | "partial" | "failed";
  readonly atomic: boolean;
  readonly totalCreditsApplied: number;
  readonly results: readonly CatalogSessionBookingItemResult[];
}

interface PreparedBooking {
  readonly index: number;
  readonly request: CatalogSessionBookingRequest;
  readonly participantPersonId: string;
  readonly quantity: number;
  readonly organizationId: string;
  /** The booking an earlier attempt of this same call already completed. */
  readonly completed?: {
    readonly bookingId: string;
    readonly orderId: string;
    readonly creditsApplied: number;
  };
}

function failure(error: unknown): {
  readonly errorCode: string;
  readonly message: string;
} {
  if (
    error instanceof CatalogCheckoutError ||
    error instanceof CatalogSessionBookingError
  ) {
    return { errorCode: error.code, message: error.message };
  }
  return {
    errorCode: "CHECKOUT_UNAVAILABLE",
    message: error instanceof Error ? error.message : "Booking failed.",
  };
}

/**
 * Books several session occurrences with organization credits.
 *
 * Every request is validated before anything is written. Sessions are then
 * booked one at a time, each as its own order with a key derived from the
 * call's idempotency key, so a retried call never books a session twice. With
 * `atomic` (the default) a failure part-way restores the credits of the
 * sessions already booked through the existing refund path, leaving nothing
 * booked; without it, the per-session results say exactly what happened.
 */
export async function bookCatalogSessions(input: {
  readonly actor: ApiActor;
  readonly bookings: readonly CatalogSessionBookingRequest[];
  readonly creditSource?: "self" | "participant";
  readonly atomic?: boolean;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}): Promise<CatalogSessionBookingResult> {
  requireDatabase();
  const atomic = input.atomic !== false;
  if (
    input.bookings.length === 0 ||
    input.bookings.length > MAX_CATALOG_SESSIONS_PER_BOOKING
  ) {
    throw new CatalogSessionBookingError(
      "INVALID_REQUEST",
      `Choose between 1 and ${MAX_CATALOG_SESSIONS_PER_BOOKING} sessions.`,
    );
  }
  const database = getDatabase();
  const seen = new Set<string>();
  const prepared: PreparedBooking[] = [];
  const requestedByOccurrence = new Map<string, number>();

  // Validate everything before the first write.
  for (const [index, request] of input.bookings.entries()) {
    const participantPersonId =
      request.participantPersonId ?? input.actor.personId;
    const quantity = request.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new CatalogSessionBookingError(
        "INVALID_REQUEST",
        "Choose a quantity from 1 to 50.",
      );
    }
    const pair = `${request.catalogSessionOccurrenceId}:${participantPersonId}`;
    if (seen.has(pair)) {
      throw new CatalogSessionBookingError(
        "INVALID_REQUEST",
        "The same session was chosen twice for the same person.",
      );
    }
    seen.add(pair);
    if (participantPersonId !== input.actor.personId) {
      await assertGuardianCanBookFor({
        actor: input.actor,
        participantPersonId,
      });
    } else if (input.creditSource === "participant") {
      throw new CatalogSessionBookingError(
        "INVALID_REQUEST",
        "Paying from a family member's wallet applies to bookings made for that family member.",
      );
    }
    const row = await database
      .select({
        occurrence: catalogSessionOccurrences,
        item: catalogItems,
        variantId: catalogVariants.id,
      })
      .from(catalogSessionOccurrences)
      .innerJoin(
        catalogItems,
        eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
      )
      .innerJoin(
        catalogVariants,
        and(
          eq(catalogVariants.catalogItemId, catalogItems.id),
          eq(catalogVariants.id, request.catalogVariantId),
        ),
      )
      .where(
        and(
          eq(catalogSessionOccurrences.id, request.catalogSessionOccurrenceId),
          eq(catalogItems.id, request.catalogItemId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (!row || row.item.type !== "service" || row.item.status !== "active") {
      throw new CatalogCheckoutError(
        "CATALOG_ITEM_NOT_FOUND",
        "One of the chosen sessions was not found.",
      );
    }
    if (!row.item.allowCredits) {
      throw new CatalogCheckoutError(
        "PRICE_UNAVAILABLE",
        `${row.item.title} does not accept organization credits.`,
      );
    }
    if (
      row.occurrence.status !== "scheduled" ||
      row.occurrence.startsAt <= input.now
    ) {
      throw new CatalogCheckoutError(
        "CATALOG_ITEM_UNAVAILABLE",
        `${row.item.title} is no longer open for booking at that time.`,
      );
    }
    // A retried call finds the order an earlier attempt already created for
    // this position, and treats that session as done rather than as a clash.
    const prior = await database
      .select({ order: orders, fulfillment: catalogFulfillments })
      .from(orders)
      .innerJoin(
        catalogFulfillments,
        eq(catalogFulfillments.orderId, orders.id),
      )
      .where(eq(orders.idempotencyKey, `${input.idempotencyKey}:${index}`))
      .limit(1)
      .then((rows) => rows[0]);
    if (prior) {
      const sameBooking =
        prior.order.status === "paid" &&
        (activeStatuses as readonly string[]).includes(
          prior.fulfillment.status,
        ) &&
        prior.fulfillment.catalogSessionOccurrenceId === row.occurrence.id &&
        prior.fulfillment.personId === participantPersonId;
      if (!sameBooking) {
        throw new CatalogSessionBookingError(
          "INVALID_REQUEST",
          "This booking attempt was already used. Start a new booking.",
        );
      }
      const credits = Number(prior.fulfillment.details.creditsApplied ?? 0);
      prepared.push({
        index,
        request,
        participantPersonId,
        quantity,
        organizationId: row.item.organizationId,
        completed: {
          bookingId: prior.fulfillment.id,
          orderId: prior.order.id,
          creditsApplied: Number.isSafeInteger(credits) ? credits : 0,
        },
      });
      continue;
    }
    const existing = await database
      .select({
        personId: catalogFulfillments.personId,
        details: catalogFulfillments.details,
      })
      .from(catalogFulfillments)
      .where(
        and(
          eq(catalogFulfillments.catalogSessionOccurrenceId, row.occurrence.id),
          inArray(catalogFulfillments.status, activeStatuses),
        ),
      );
    if (existing.some((booking) => booking.personId === participantPersonId)) {
      throw new CatalogCheckoutError(
        "CATALOG_ITEM_UNAVAILABLE",
        `${row.item.title} is already booked for this person at that time.`,
      );
    }
    const reserved = existing.reduce(
      (total, booking) => total + positiveInteger(booking.details.quantity, 1),
      0,
    );
    const requested =
      (requestedByOccurrence.get(row.occurrence.id) ?? 0) + quantity;
    requestedByOccurrence.set(row.occurrence.id, requested);
    if (reserved + requested > row.occurrence.capacity) {
      throw new CatalogCheckoutError(
        "CATALOG_ITEM_UNAVAILABLE",
        `${row.item.title} no longer has enough open places at that time.`,
      );
    }
    prepared.push({
      index,
      request,
      participantPersonId,
      quantity,
      organizationId: row.item.organizationId,
    });
  }

  const results: CatalogSessionBookingItemResult[] = [];
  const base = (booking: PreparedBooking) => ({
    index: booking.index,
    catalogSessionOccurrenceId: booking.request.catalogSessionOccurrenceId,
    participantPersonId: booking.participantPersonId,
  });
  let failed = false;
  for (const booking of prepared) {
    if (failed && atomic) {
      results.push({
        ...base(booking),
        status: "skipped",
        message:
          "Not attempted because an earlier session could not be booked.",
      });
      continue;
    }
    if (booking.completed) {
      results.push({
        ...base(booking),
        status: "booked",
        ...booking.completed,
      });
      continue;
    }
    const orderKey = `${input.idempotencyKey}:${booking.index}`;
    try {
      const checkout = await startCatalogCheckout({
        actor: input.actor,
        catalogItemId: booking.request.catalogItemId,
        catalogVariantId: booking.request.catalogVariantId,
        paymentMethod: "credit",
        quantity: booking.quantity,
        catalogSessionOccurrenceId: booking.request.catalogSessionOccurrenceId,
        participantPersonId:
          booking.participantPersonId === input.actor.personId
            ? undefined
            : booking.participantPersonId,
        creditSource:
          booking.participantPersonId === input.actor.personId
            ? undefined
            : input.creditSource,
        // Credit and membership-included bookings never reach a card flow.
        successUrl: "",
        cancelUrl: "",
        idempotencyKey: orderKey,
        // The ledger keys each redemption on the request id.
        requestId: `${input.requestId}:${booking.index}`,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        now: input.now,
      });
      const fulfillment = await database.query.catalogFulfillments.findFirst({
        where: eq(catalogFulfillments.orderId, checkout.orderId),
      });
      results.push({
        ...base(booking),
        status: "booked",
        bookingId: fulfillment?.id,
        orderId: checkout.orderId,
        creditsApplied: checkout.creditsApplied,
      });
    } catch (error) {
      failed = true;
      results.push({ ...base(booking), status: "failed", ...failure(error) });
    }
  }

  let rollbackIncomplete = false;
  if (failed && atomic) {
    for (const [position, result] of results.entries()) {
      if (result.status !== "booked" || !result.orderId) continue;
      const booking = prepared.find((entry) => entry.index === result.index)!;
      try {
        await releaseBooking({
          actor: input.actor,
          organizationId: booking.organizationId,
          orderId: result.orderId,
          reason:
            "Booked with other sessions that could not all be booked together.",
          requestId: `${input.requestId}:rollback:${result.index}`,
          ipAddress: input.ipAddress,
          now: input.now,
        });
        // Keeps a booking that never really happened out of the schedule.
        await database
          .update(catalogFulfillments)
          .set({
            details: sql`${catalogFulfillments.details} || '{"rolledBack": true}'::jsonb`,
            updatedAt: input.now,
          })
          .where(eq(catalogFulfillments.orderId, result.orderId));
        results[position] = {
          ...result,
          status: "rolled-back",
          creditsApplied: 0,
          message: "Released because another session could not be booked.",
        };
      } catch {
        rollbackIncomplete = true;
        results[position] = {
          ...result,
          message:
            "This session stayed booked because its release did not complete. Cancel it from your bookings.",
        };
      }
    }
  }
  const bookedCount = results.filter(
    (result) => result.status === "booked",
  ).length;
  return {
    status:
      bookedCount === results.length
        ? "booked"
        : bookedCount === 0 && !rollbackIncomplete
          ? "failed"
          : "partial",
    atomic,
    totalCreditsApplied: results.reduce(
      (total, result) =>
        total + (result.status === "booked" ? (result.creditsApplied ?? 0) : 0),
      0,
    ),
    results,
  };
}

/**
 * Gives a paid booking back in full: redeemed credits return to the wallet
 * they came from through the order refund path, and a booking that cost
 * nothing is simply released.
 */
async function releaseBooking(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly orderId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<"credits-returned" | "submitted" | "released" | "review-required"> {
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order) throw new Error("The booking order was not found.");
  const fulfillment = await database.query.catalogFulfillments.findFirst({
    where: eq(catalogFulfillments.orderId, order.id),
  });
  const reservedCredits = Number(fulfillment?.details.creditsApplied ?? 0);
  const paid = order.status === "paid" || order.status === "partially-refunded";
  if (!paid || (order.totalMinor === 0 && !(reservedCredits > 0))) {
    await database.batch([
      database
        .update(catalogFulfillments)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(catalogFulfillments.orderId, order.id)),
      database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(and(eq(orders.id, order.id), eq(orders.status, "pending"))),
    ]);
    return "released";
  }
  const refund = await refundOrganizationOrder({
    actor: { ...input.actor, organizationId: input.organizationId },
    orderId: order.id,
    amountMinor: order.totalMinor,
    disposition: "original-payment",
    reason: input.reason,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  if (refund.status === "failed") return "review-required";
  return reservedCredits > 0 ? "credits-returned" : "submitted";
}

// ---------------------------------------------------------------------------
// Listing a player's (and their dependents') session bookings
// ---------------------------------------------------------------------------

export interface PlayerCatalogSessionBooking {
  readonly bookingId: string;
  readonly orderId: string;
  readonly status:
    | "confirmed"
    | "pending-payment"
    | "attended"
    | "no-show"
    | "cancelled"
    | "refunded";
  readonly catalogItemId: string;
  readonly catalogItemSlug: string;
  readonly title: string;
  readonly subtype: string;
  readonly organization: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly sessionStatus: "scheduled" | "cancelled" | "complete";
  readonly sessionCancellationReason?: "minimum-not-met";
  readonly deliveryMode: "venue" | "online";
  readonly venue?: {
    readonly id: string;
    readonly name: string;
    readonly addressLine1?: string;
    readonly locality?: string;
    readonly administrativeArea?: string;
    readonly postalCode?: string;
    readonly countryCode: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly coaches: readonly {
    readonly personId: string;
    readonly displayName: string;
  }[];
  readonly participant: {
    readonly personId: string;
    readonly displayName: string;
    readonly isSelf: boolean;
  };
  readonly bookedBy: {
    readonly personId: string;
    readonly displayName: string;
    readonly isSelf: boolean;
  };
  readonly paidByPersonId: string;
  readonly quantity: number;
  readonly paymentMethod?: "card" | "credit" | "cash";
  readonly creditsReserved: number;
  readonly creditsSettled?: number;
  readonly creditsReturned?: number;
  readonly participation?: OccurrenceParticipationState;
  /** PART decision 4: credits a cancellation now costs (after the lock). */
  readonly lateCancelCharge?: number;
  /** PART-4 fills it: this person's place on the waitlist. */
  readonly waitlistPosition?: number;
  readonly cancellable: boolean;
  /** Cancel by this time to get the booking's credits or payment back. */
  readonly refundableUntil?: string;
  readonly refundIfCancelledNow: boolean;
  readonly bookedAt: string;
}

function mayManageBooking(input: {
  readonly actorPersonId: string;
  readonly participantPersonId: string;
  readonly payerPersonId: string;
  readonly bookedByPersonId?: string;
  readonly spendingDependentIds: ReadonlySet<string>;
}): boolean {
  // The person who paid or booked manages the booking. A dependent whose
  // guardian paid cannot cancel it on their own.
  return (
    input.payerPersonId === input.actorPersonId ||
    input.bookedByPersonId === input.actorPersonId ||
    input.spendingDependentIds.has(input.participantPersonId)
  );
}

async function spendingDependentIds(
  guardian: ApiActor,
): Promise<ReadonlySet<string>> {
  if (guardian.ageBand !== "adult") return new Set();
  const rows = await getDatabase()
    .select({ minorId: guardianships.minorId })
    .from(guardianships)
    .where(
      and(
        eq(guardianships.guardianId, guardian.personId),
        eq(guardianships.verified, true),
        eq(guardianships.reviewStatus, "verified"),
        eq(guardianships.canApproveSpending, true),
      ),
    );
  return new Set(rows.map((row) => row.minorId));
}

export async function loadPlayerCatalogSessionBookings(input: {
  readonly actor: ApiActor;
  readonly scope?: "upcoming" | "past" | "all";
  readonly includeDependents?: boolean;
  readonly limit?: number;
  readonly now: Date;
}): Promise<readonly PlayerCatalogSessionBooking[]> {
  if (!process.env.DATABASE_URL) return [];
  const database = getDatabase();
  const scope = input.scope ?? "upcoming";
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  const dependents =
    input.includeDependents === false
      ? []
      : await verifiedDependentIds(input.actor.personId);
  const spending = await spendingDependentIds(input.actor);
  const visiblePersonIds = [input.actor.personId, ...dependents];
  const rows = await database
    .select({
      fulfillment: catalogFulfillments,
      order: orders,
      occurrence: catalogSessionOccurrences,
      item: catalogItems,
      organization: {
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
      },
    })
    .from(catalogFulfillments)
    .innerJoin(orders, eq(catalogFulfillments.orderId, orders.id))
    .innerJoin(
      catalogSessionOccurrences,
      eq(
        catalogFulfillments.catalogSessionOccurrenceId,
        catalogSessionOccurrences.id,
      ),
    )
    .innerJoin(
      catalogItems,
      eq(catalogFulfillments.catalogItemId, catalogItems.id),
    )
    .innerJoin(
      organizations,
      eq(catalogFulfillments.organizationId, organizations.id),
    )
    .where(
      and(
        or(
          inArray(catalogFulfillments.personId, visiblePersonIds),
          eq(orders.buyerPersonId, input.actor.personId),
          sql`${catalogFulfillments.details} ->> 'bookedByPersonId' = ${input.actor.personId}`,
        ),
        // A checkout that never completed, or a session released because
        // the rest of a multi-session booking failed, is not a booking.
        sql`NOT (${orders.status} IN ('cancelled', 'failed', 'draft') AND ${catalogFulfillments.details} ->> 'cancelledAt' IS NULL)`,
        sql`${catalogFulfillments.details} ->> 'rolledBack' IS NULL`,
        scope === "upcoming"
          ? gt(catalogSessionOccurrences.endsAt, input.now)
          : scope === "past"
            ? lte(catalogSessionOccurrences.endsAt, input.now)
            : undefined,
      ),
    )
    .orderBy(
      scope === "past"
        ? desc(catalogSessionOccurrences.startsAt)
        : asc(catalogSessionOccurrences.startsAt),
      asc(catalogFulfillments.createdAt),
    )
    .limit(limit);
  if (rows.length === 0) return [];

  const occurrenceIds = [...new Set(rows.map((row) => row.occurrence.id))];
  const personIds = new Set<string>();
  const venueIds = new Set<string>();
  for (const row of rows) {
    personIds.add(row.fulfillment.personId);
    personIds.add(row.order.buyerPersonId);
    if (typeof row.fulfillment.details.bookedByPersonId === "string") {
      personIds.add(row.fulfillment.details.bookedByPersonId);
    }
    for (const coach of row.occurrence.coachPersonIds) personIds.add(coach);
    if (typeof row.item.configuration.venueId === "string") {
      venueIds.add(row.item.configuration.venueId);
    }
  }
  const [personRows, venueRows, headcountRows] = await Promise.all([
    database
      .select({ id: people.id, displayName: people.displayName })
      .from(people)
      .where(inArray(people.id, [...personIds])),
    venueIds.size === 0
      ? Promise.resolve([])
      : database
          .select()
          .from(venues)
          .where(inArray(venues.id, [...venueIds])),
    database
      .select({
        occurrenceId: catalogFulfillments.catalogSessionOccurrenceId,
        details: catalogFulfillments.details,
      })
      .from(catalogFulfillments)
      .where(
        and(
          inArray(
            catalogFulfillments.catalogSessionOccurrenceId,
            occurrenceIds,
          ),
          inArray(catalogFulfillments.status, activeStatuses),
        ),
      ),
  ]);
  const nameById = new Map(personRows.map((row) => [row.id, row.displayName]));
  const venueById = new Map(venueRows.map((row) => [row.id, row]));
  const bookedByOccurrence = new Map<string, number>();
  for (const row of headcountRows) {
    if (!row.occurrenceId) continue;
    bookedByOccurrence.set(
      row.occurrenceId,
      (bookedByOccurrence.get(row.occurrenceId) ?? 0) +
        positiveInteger(row.details.quantity, 1),
    );
  }
  const windows = new Map<string, Awaited<ReturnType<typeof refundWindow>>>();
  for (const organizationId of new Set(
    rows.map((row) => row.organization.id),
  )) {
    windows.set(organizationId, await refundWindow(organizationId));
  }
  const name = (personId: string) => nameById.get(personId) ?? "Duna member";
  // One participation picture per session: the snapshot rule, the lock and
  // the confirmed count (the same count capacity and the minimum use).
  const pictures = new Map<
    string,
    Awaited<ReturnType<typeof catalogSessionPicture>>
  >();
  for (const { occurrence, item } of rows) {
    if (!pictures.has(occurrence.id)) {
      pictures.set(
        occurrence.id,
        await catalogSessionPicture({ occurrence, item, now: input.now }),
      );
    }
  }

  return rows.map(({ fulfillment, order, occurrence, item, organization }) => {
    const details = fulfillment.details;
    const active = (activeStatuses as readonly string[]).includes(
      fulfillment.status,
    );
    const bookedByPersonId =
      typeof details.bookedByPersonId === "string"
        ? details.bookedByPersonId
        : order.buyerPersonId;
    const paid =
      order.status === "paid" || order.status === "partially-refunded";
    const window = windows.get(organization.id)!;
    const picture = pictures.get(occurrence.id);
    // Decision 1: with a group rule, the lock is the free-cancellation deadline.
    const refundableUntil = !window.refundable
      ? undefined
      : picture
        ? picture.lockAt
        : new Date(
            occurrence.startsAt.getTime() - window.refundBeforeMinutes * 60_000,
          );
    const cancellable =
      active &&
      occurrence.status === "scheduled" &&
      occurrence.startsAt > input.now &&
      mayManageBooking({
        actorPersonId: input.actor.personId,
        participantPersonId: fulfillment.personId,
        payerPersonId: order.buyerPersonId,
        bookedByPersonId:
          typeof details.bookedByPersonId === "string"
            ? details.bookedByPersonId
            : undefined,
        spendingDependentIds: spending,
      });
    const venue =
      typeof item.configuration.venueId === "string"
        ? venueById.get(item.configuration.venueId)
        : undefined;
    const credits = Number(details.creditsApplied ?? 0);
    const reserved = Number.isSafeInteger(credits) && credits > 0 ? credits : 0;
    const lateCancelCharge =
      picture &&
      active &&
      reserved > 0 &&
      refundableUntil &&
      input.now > refundableUntil
        ? lateCancellationCharge({
            tiers: picture.rule.tiers,
            finalGroupSize:
              picture.decision?.decidedGroupSize ?? picture.confirmed,
            quantity: positiveInteger(details.quantity, 1),
            reserved:
              typeof details.creditsSettled === "number"
                ? details.creditsSettled
                : reserved,
          })
        : undefined;
    return {
      bookingId: fulfillment.id,
      orderId: order.id,
      status:
        fulfillment.status === "refunded"
          ? "refunded"
          : fulfillment.status === "cancelled"
            ? "cancelled"
            : details.attendance === "no-show"
              ? "no-show"
              : details.attendance === "attended" ||
                  fulfillment.status === "fulfilled"
                ? "attended"
                : paid
                  ? "confirmed"
                  : "pending-payment",
      catalogItemId: item.id,
      catalogItemSlug: item.slug,
      title: item.title,
      subtype: item.subtype,
      organization,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      timezone: occurrence.timezone,
      sessionStatus:
        occurrence.status === "cancelled" || occurrence.status === "complete"
          ? occurrence.status
          : "scheduled",
      sessionCancellationReason:
        occurrence.participationOutcome === "cancel-under-minimum"
          ? "minimum-not-met"
          : undefined,
      deliveryMode:
        item.configuration.deliveryMode === "online" ? "online" : "venue",
      venue: venue
        ? {
            id: venue.id,
            name: venue.name,
            addressLine1: venue.addressLine1 ?? undefined,
            locality: venue.locality ?? undefined,
            administrativeArea: venue.administrativeArea ?? undefined,
            postalCode: venue.postalCode ?? undefined,
            countryCode: venue.countryCode,
            latitude: venue.latitude ?? undefined,
            longitude: venue.longitude ?? undefined,
          }
        : undefined,
      coaches: occurrence.coachPersonIds.map((personId) => ({
        personId,
        displayName: name(personId),
      })),
      participant: {
        personId: fulfillment.personId,
        displayName: name(fulfillment.personId),
        isSelf: fulfillment.personId === input.actor.personId,
      },
      bookedBy: {
        personId: bookedByPersonId,
        displayName: name(bookedByPersonId),
        isSelf: bookedByPersonId === input.actor.personId,
      },
      paidByPersonId: order.buyerPersonId,
      quantity: positiveInteger(details.quantity, 1),
      paymentMethod:
        details.paymentMethod === "card" ||
        details.paymentMethod === "credit" ||
        details.paymentMethod === "cash"
          ? details.paymentMethod
          : undefined,
      creditsReserved:
        Number.isSafeInteger(credits) && credits > 0 ? credits : 0,
      creditsSettled:
        typeof details.creditsSettled === "number"
          ? details.creditsSettled
          : undefined,
      creditsReturned:
        typeof details.creditsReturned === "number"
          ? details.creditsReturned
          : undefined,
      participation: picture && active ? picture.state : undefined,
      ...(lateCancelCharge !== undefined ? { lateCancelCharge } : {}),
      cancellable,
      refundableUntil: refundableUntil?.toISOString(),
      refundIfCancelledNow:
        cancellable && Boolean(refundableUntil && input.now <= refundableUntil),
      bookedAt: fulfillment.createdAt.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Cancelling a session booking
// ---------------------------------------------------------------------------

export interface CatalogSessionCancellationResult {
  readonly id: string;
  readonly status: "cancelled";
  readonly refundStatus:
    "credits-returned" | "submitted" | "review-required" | "not-applicable";
  readonly creditsReturned: number;
  /** PART decision 4: what a late cancellation costs (the final price). */
  readonly chargedCredits?: number;
  readonly message: string;
}

/**
 * Cancels an upcoming session booking. Inside the organization's refund
 * window the booking's credits (what is still redeemed after any headcount
 * settlement) or card payment go back through the existing refund path.
 * Outside it nothing is returned, so the caller must acknowledge that
 * explicitly; a late cancellation never forfeits credits by accident.
 */
export async function cancelCatalogSessionBooking(input: {
  readonly actor: ApiActor;
  readonly bookingId: string;
  readonly acknowledgeNoRefund?: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<CatalogSessionCancellationResult> {
  requireDatabase();
  const database = getDatabase();
  const row = await database
    .select({
      fulfillment: catalogFulfillments,
      order: orders,
      occurrence: catalogSessionOccurrences,
      title: catalogItems.title,
    })
    .from(catalogFulfillments)
    .innerJoin(orders, eq(catalogFulfillments.orderId, orders.id))
    .innerJoin(
      catalogSessionOccurrences,
      eq(
        catalogFulfillments.catalogSessionOccurrenceId,
        catalogSessionOccurrences.id,
      ),
    )
    .innerJoin(
      catalogItems,
      eq(catalogFulfillments.catalogItemId, catalogItems.id),
    )
    .where(eq(catalogFulfillments.id, input.bookingId))
    .limit(1)
    .then((rows) => rows[0]);
  const bookedByPersonId =
    typeof row?.fulfillment.details.bookedByPersonId === "string"
      ? row.fulfillment.details.bookedByPersonId
      : undefined;
  const related =
    row &&
    (row.fulfillment.personId === input.actor.personId ||
      row.order.buyerPersonId === input.actor.personId ||
      bookedByPersonId === input.actor.personId ||
      (await verifiedDependentIds(input.actor.personId)).includes(
        row.fulfillment.personId,
      ));
  // A booking the caller has no relationship to does not exist for them.
  if (!row || !related) {
    throw new CatalogSessionBookingError(
      "BOOKING_NOT_FOUND",
      "This booking was not found in your Duna account.",
    );
  }
  if (
    !mayManageBooking({
      actorPersonId: input.actor.personId,
      participantPersonId: row.fulfillment.personId,
      payerPersonId: row.order.buyerPersonId,
      bookedByPersonId,
      spendingDependentIds: await spendingDependentIds(input.actor),
    })
  ) {
    throw new CatalogSessionBookingError(
      "NOT_ALLOWED",
      "The family member who booked this session manages it.",
    );
  }
  if (!(activeStatuses as readonly string[]).includes(row.fulfillment.status)) {
    throw new CatalogSessionBookingError(
      "NOT_CANCELLABLE",
      "This booking can no longer be cancelled.",
    );
  }
  if (
    row.occurrence.status !== "scheduled" ||
    row.occurrence.startsAt <= input.now
  ) {
    throw new CatalogSessionBookingError(
      "NOT_CANCELLABLE",
      "Cancellation closed when this session started.",
    );
  }
  const organizationId = row.fulfillment.organizationId;
  const window = await refundWindow(organizationId);
  // A group session: the lock is the free-cancellation deadline (decision 1).
  let decision = await loadDecision(row.occurrence.id);
  if (decision && !decision.outcome && input.now >= effectiveLockAt(decision)) {
    // The lock passed before the schedule decided: decide first, so a
    // session cancelled under its minimum returns everything instead.
    await evaluateCatalogSessionParticipation({
      occurrenceId: row.occurrence.id,
      requestId: `${input.requestId}:decide`,
      now: input.now,
    });
    decision = await loadDecision(row.occurrence.id);
    const fresh = await database.query.catalogFulfillments.findFirst({
      where: eq(catalogFulfillments.id, row.fulfillment.id),
    });
    if (
      !fresh ||
      !(activeStatuses as readonly string[]).includes(fresh.status)
    ) {
      throw new CatalogSessionBookingError(
        "NOT_CANCELLABLE",
        "This session was cancelled because it did not reach its minimum. Everything was returned.",
      );
    }
    row.fulfillment = fresh;
  }
  const refundableUntil = decision
    ? effectiveLockAt(decision)
    : new Date(
        row.occurrence.startsAt.getTime() - window.refundBeforeMinutes * 60_000,
      );
  const insideWindow = window.refundable && input.now <= refundableUntil;
  const paid =
    row.order.status === "paid" || row.order.status === "partially-refunded";
  const reservedCredits = Number(row.fulfillment.details.creditsApplied ?? 0);
  const hasValue = paid && (row.order.totalMinor > 0 || reservedCredits > 0);
  const quantity = positiveInteger(row.fulfillment.details.quantity, 1);
  const finalCharge = (() => {
    if (!decision || reservedCredits <= 0) return undefined;
    const rule = decisionRule(decision, row.occurrence.capacity);
    const settled = row.fulfillment.details.creditsSettled;
    return typeof settled === "number"
      ? settled
      : lateCancellationCharge({
          tiers: rule.tiers,
          finalGroupSize: decision.decidedGroupSize ?? 0,
          quantity,
          reserved: reservedCredits,
        });
  })();
  if (hasValue && !insideWindow && !input.acknowledgeNoRefund) {
    throw new CatalogSessionBookingError(
      "REFUND_WINDOW_CLOSED",
      !window.refundable
        ? "This organization's bookings are non-refundable. Cancelling returns nothing."
        : decision && finalCharge !== undefined
          ? `Cancelling now costs ${finalCharge} credit${finalCharge === 1 ? "" : "s"}. You get them back if someone takes your place.`
          : decision
            ? "Cancelling now returns nothing unless someone takes your place."
            : `Cancellations with credits or payment returned closed ${Math.round(window.refundBeforeMinutes / 60)} hours before the session. Cancelling now returns nothing.`,
    );
  }
  let chargedCredits: number | undefined;
  if (hasValue && !insideWindow && decision?.outcome && window.refundable) {
    // Decision 4: the late canceller pays the final price, never the reserve.
    // Settling first returns the difference; what remains is the final price.
    if (
      reservedCredits > 0 &&
      typeof row.fulfillment.details.creditsSettled !== "number"
    ) {
      await evaluateCatalogSessionParticipation({
        occurrenceId: row.occurrence.id,
        requestId: `${input.requestId}:settle`,
        now: input.now,
      });
      const settled = await database.query.catalogFulfillments.findFirst({
        where: eq(catalogFulfillments.id, row.fulfillment.id),
      });
      if (settled) row.fulfillment = settled;
    }
    const settled = row.fulfillment.details.creditsSettled;
    chargedCredits =
      reservedCredits > 0
        ? typeof settled === "number"
          ? settled
          : reservedCredits
        : undefined;
  }

  let refundStatus: CatalogSessionCancellationResult["refundStatus"] =
    "not-applicable";
  let creditsReturned = 0;
  if (hasValue && insideWindow) {
    const outcome = await releaseBooking({
      actor: input.actor,
      organizationId,
      orderId: row.order.id,
      reason: "Player cancelled within the cancellation policy.",
      requestId: `${input.requestId}:cancel`,
      ipAddress: input.ipAddress,
      now: input.now,
    }).catch((error: unknown) => {
      // A credit booking is only cancelled together with its credits coming
      // back. If that fails the booking stays exactly as it was. A card
      // refund that cannot be submitted is handed to the organization, as
      // event registrations already do.
      if (reservedCredits > 0) throw error;
      return "review-required" as const;
    });
    if (outcome === "credits-returned") {
      refundStatus = "credits-returned";
      const settled = row.fulfillment.details.creditsSettled;
      creditsReturned = typeof settled === "number" ? settled : reservedCredits;
    } else if (outcome === "submitted") {
      refundStatus = "submitted";
    } else if (outcome === "review-required") {
      refundStatus = "review-required";
    }
  }
  // The refund path marks a fully refunded booking itself. Anything else
  // (no value, a late cancellation, or a refund awaiting review) is released
  // here so the place opens up.
  const after = await database.query.catalogFulfillments.findFirst({
    where: eq(catalogFulfillments.id, row.fulfillment.id),
  });
  if (after && (activeStatuses as readonly string[]).includes(after.status)) {
    await database.batch([
      database
        .update(catalogFulfillments)
        .set({
          status: "cancelled",
          details: {
            ...after.details,
            cancelledAt: input.now.toISOString(),
            cancelledByPersonId: input.actor.personId,
          },
          updatedAt: input.now,
        })
        .where(eq(catalogFulfillments.id, after.id)),
      database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(and(eq(orders.id, row.order.id), eq(orders.status, "pending"))),
    ]);
  } else if (after) {
    await database
      .update(catalogFulfillments)
      .set({
        details: {
          ...after.details,
          cancelledAt: input.now.toISOString(),
          cancelledByPersonId: input.actor.personId,
        },
        updatedAt: input.now,
      })
      .where(eq(catalogFulfillments.id, after.id));
  }
  if (hasValue && !insideWindow && decision?.outcome && window.refundable) {
    // The place can be refilled; the refund then follows (engine).
    await database
      .insert(participationAdjustments)
      .values({
        organizationId,
        catalogFulfillmentId: row.fulfillment.id,
        orderId: row.order.id,
        kind: "late-cancel-final-price",
        credits: 0,
        amountMinor: 0,
        // Database time, like the bookings that may refill the place.
      })
      .onConflictDoNothing();
  }
  await database.insert(auditLog).values({
    organizationId,
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "catalog.session_booking_cancelled",
    entityType: "catalog-fulfillment",
    entityId: row.fulfillment.id,
    beforeHash: stableHash({ status: row.fulfillment.status }),
    afterHash: stableHash({
      status: after?.status === "refunded" ? "refunded" : "cancelled",
      refundStatus,
      creditsReturned,
      participantPersonId: row.fulfillment.personId,
    }),
    reason:
      refundStatus === "credits-returned"
        ? "Player cancelled a session booking; credits returned to the wallet."
        : hasValue && !insideWindow
          ? "Player cancelled a session booking after the refund window; nothing returned."
          : "Player cancelled a session booking.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  return {
    id: row.fulfillment.id,
    status: "cancelled",
    refundStatus,
    creditsReturned,
    ...(chargedCredits !== undefined ? { chargedCredits } : {}),
    message:
      refundStatus === "credits-returned"
        ? `${row.title} cancelled. ${creditsReturned} credit${creditsReturned === 1 ? " was" : "s were"} returned to the wallet.`
        : refundStatus === "submitted"
          ? `${row.title} cancelled. Your refund was submitted to the original payment method.`
          : refundStatus === "review-required"
            ? `${row.title} cancelled. The refund needs the organization's attention.`
            : chargedCredits !== undefined
              ? `${row.title} cancelled. You paid ${chargedCredits} credit${chargedCredits === 1 ? "" : "s"}; they come back if someone takes your place.`
              : hasValue
                ? `${row.title} cancelled after the refund window. Nothing was returned.`
                : `${row.title} cancelled.`,
  };
}
