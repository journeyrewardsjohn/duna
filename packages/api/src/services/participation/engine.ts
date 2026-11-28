/**
 * The participation engine's booking-time and schedule steps for catalog
 * sessions: the duplicate block (decision 5), the race-safe last place, the
 * notices a booking queues, refunds when a late canceller's place is
 * refilled (decision 4) and the schedule (the cron). Lock-time decisions and
 * settlement live in ../../catalog-participation.ts, which this engine owns.
 */
import {
  auditLog,
  catalogFulfillments,
  catalogSessionOccurrences,
  getDatabase,
  getTransactionalDatabase,
  orders,
  participationAdjustments,
  participationWaitlistEntries,
  refundRecords,
} from "@duna/db";
import {
  PARTICIPATION_POLICY,
  PARTICIPATION_REMINDER_MINUTES_BEFORE_LOCK,
} from "@duna/core";
import { log } from "@duna/observability";
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import { processDueCatalogParticipation } from "../../catalog-participation";
import { refundOrganizationOrder } from "../../catalog-service";
import {
  acceptWaitlistOnBooking,
  expireWaitlistOffers,
  offerOpenPlaces,
} from "./waitlist";
import type { ApiActor } from "../../context";
import { processDueSubjectParticipation } from "./subjects";
import {
  ACTIVE_BOOKING_STATUSES,
  CATALOG_SUBJECT,
  decisionRule,
  effectiveLockAt,
  loadDecision,
  occurrencePlaces,
  queueParticipationNotices,
} from "./catalog";

/** Thrown before checkout writes anything when the person already holds a place. */
export class AlreadyBookedError extends Error {
  constructor() {
    super("You're already booked for this session. Add a player instead.");
    this.name = "AlreadyBookedError";
  }
}

/**
 * Decision 5: one active booking per participant per session. An abandoned
 * checkout whose hold has expired is released instead of blocking a retry.
 * The partial unique index in 0118 enforces the same rule under a race.
 */
export async function assertNotAlreadyBooked(input: {
  readonly occurrenceId: string;
  readonly participantPersonId: string;
  readonly organizationId: string;
  readonly surface: string;
  readonly now: Date;
}): Promise<void> {
  if (PARTICIPATION_POLICY.duplicateBooking !== "block") return;
  const database = getDatabase();
  const existing = await database
    .select({ fulfillment: catalogFulfillments, order: orders })
    .from(catalogFulfillments)
    .innerJoin(orders, eq(catalogFulfillments.orderId, orders.id))
    .where(
      and(
        eq(catalogFulfillments.catalogSessionOccurrenceId, input.occurrenceId),
        eq(catalogFulfillments.personId, input.participantPersonId),
        inArray(catalogFulfillments.status, [...ACTIVE_BOOKING_STATUSES]),
      ),
    );
  for (const { fulfillment, order } of existing) {
    const staleHold =
      order.status === "pending" &&
      order.expiresAt !== null &&
      order.expiresAt <= input.now;
    if (staleHold) {
      await database.batch([
        database
          .update(catalogFulfillments)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(eq(catalogFulfillments.id, fulfillment.id)),
        database
          .update(orders)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(and(eq(orders.id, order.id), eq(orders.status, "pending"))),
      ]);
      continue;
    }
    log.info("participation.duplicate.blocked", {
      organizationId: input.organizationId,
      subjectId: input.occurrenceId,
      surface: input.surface,
    });
    throw new AlreadyBookedError();
  }
}

/** True when a database error is the 0118 one-booking-per-person index. */
export function isDuplicateBookingViolation(error: unknown): boolean {
  const text = String(
    (error as { message?: unknown; cause?: { message?: unknown } })?.message ??
      "",
  ).concat(
    String((error as { cause?: { message?: unknown } })?.cause?.message ?? ""),
  );
  return text.includes("catalog_fulfillment_occurrence_person_active_unique");
}

/**
 * The last place, race-safe. A new booking is written with
 * `details.placeClaimPending`; this claims it under a row lock on the
 * session, counting every other booking that already holds a place. Two
 * people paying for the last place at once: exactly one keeps it.
 */
export async function claimOccurrencePlace(input: {
  readonly occurrenceId: string;
  readonly fulfillmentId: string;
  readonly now: Date;
}): Promise<boolean> {
  return getTransactionalDatabase().transaction(async (transaction) => {
    const locked = await transaction.execute(sql`
      SELECT capacity FROM catalog_session_occurrences
      WHERE id = ${input.occurrenceId}::uuid
      FOR UPDATE
    `);
    const capacity = Number(
      (locked as unknown as { rows: { capacity: number }[] }).rows[0]
        ?.capacity ?? 0,
    );
    const mine = await transaction.query.catalogFulfillments.findFirst({
      where: eq(catalogFulfillments.id, input.fulfillmentId),
    });
    if (!mine) return false;
    const others = await transaction
      .select({
        details: catalogFulfillments.details,
        id: catalogFulfillments.id,
      })
      .from(catalogFulfillments)
      .where(
        and(
          eq(
            catalogFulfillments.catalogSessionOccurrenceId,
            input.occurrenceId,
          ),
          inArray(catalogFulfillments.status, [...ACTIVE_BOOKING_STATUSES]),
        ),
      );
    const taken = others
      .filter(
        (row) => row.id !== mine.id && row.details.placeClaimPending !== true,
      )
      .reduce((total, row) => {
        const quantity = Number(row.details.quantity ?? 1);
        return (
          total +
          (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1)
        );
      }, 0);
    // Places held for someone else's waitlist offer are taken too.
    const offers = await transaction
      .select({ quantity: participationWaitlistEntries.quantity })
      .from(participationWaitlistEntries)
      .where(
        and(
          eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
          eq(participationWaitlistEntries.subjectId, input.occurrenceId),
          eq(participationWaitlistEntries.status, "offered"),
          gt(participationWaitlistEntries.holdExpiresAt, input.now),
          ne(participationWaitlistEntries.personId, mine.personId),
        ),
      );
    const held = offers.reduce((total, row) => total + row.quantity, 0);
    const quantity = Number(mine.details.quantity ?? 1);
    if (taken + held + quantity > capacity) return false;
    const { placeClaimPending: _pending, ...details } = mine.details;
    void _pending;
    await transaction
      .update(catalogFulfillments)
      .set({
        details: { ...details, placeClaimedAt: input.now.toISOString() },
        updatedAt: input.now,
      })
      .where(eq(catalogFulfillments.id, mine.id));
    return true;
  });
}

/**
 * After a booking is confirmed: the "help it happen" notices while the group
 * still needs players, and refunds for late cancellers whose place this
 * booking refilled.
 */
export async function afterCatalogBookingConfirmed(input: {
  readonly occurrenceId: string;
  readonly fulfillmentId: string;
  readonly now: Date;
}): Promise<void> {
  const database = getDatabase();
  const decision = await loadDecision(input.occurrenceId);
  if (!decision) return;
  const occurrence = await database.query.catalogSessionOccurrences.findFirst({
    where: eq(catalogSessionOccurrences.id, input.occurrenceId),
  });
  if (!occurrence) return;
  const rule = decisionRule(decision, occurrence.capacity);
  const booked = await database.query.catalogFulfillments.findFirst({
    where: eq(catalogFulfillments.id, input.fulfillmentId),
  });
  if (booked) {
    await acceptWaitlistOnBooking({
      subjectId: occurrence.id,
      personId: booked.personId,
      now: input.now,
    });
  }
  if (decision.outcome) {
    await settleRefilledPlaces({ occurrenceId: occurrence.id, now: input.now });
    return;
  }
  const places = await occurrencePlaces(occurrence.id, input.now);
  const booking = places.bookings.find(
    (entry) => entry.fulfillment.id === input.fulfillmentId,
  );
  if (!booking || rule.minParticipants <= 1) return;
  if (places.confirmed >= rule.minParticipants) return;
  const lockAt = effectiveLockAt(decision);
  const reminderAt = new Date(
    lockAt.getTime() - PARTICIPATION_REMINDER_MINUTES_BEFORE_LOCK * 60_000,
  );
  await queueParticipationNotices([
    {
      organizationId: occurrence.organizationId,
      subjectId: occurrence.id,
      recipientPersonId: booking.bookerPersonId,
      bookingId: booking.fulfillment.id,
      kind: "booked-needs-players",
      scheduledFor: input.now,
    },
    // The dispatcher re-checks the state before sending: no reminder once
    // the minimum is reached.
    ...(reminderAt > input.now
      ? [
          {
            organizationId: occurrence.organizationId,
            subjectId: occurrence.id,
            recipientPersonId: booking.bookerPersonId,
            bookingId: booking.fulfillment.id,
            kind: "needs-players-reminder" as const,
            scheduledFor: reminderAt,
          },
        ]
      : []),
  ]);
}

function systemActor(personId: string, organizationId: string): ApiActor {
  return {
    personId,
    displayName: "Duna",
    roles: ["player"],
    organizationId,
    scopes: [],
    ageBand: "adult",
    isDemo: false,
  };
}

/**
 * Decision 4: a late canceller pays the final price, given back when someone
 * takes their place. Places are refilled first-cancelled, first-refunded:
 * every place booked after the first pending late cancellation counts.
 * Re-entrant: the adjustment row is unique per booking and kind.
 */
export async function settleRefilledPlaces(input: {
  readonly occurrenceId: string;
  readonly now: Date;
}): Promise<number> {
  const database = getDatabase();
  const lateCancels = await database
    .select({
      adjustment: participationAdjustments,
      fulfillment: catalogFulfillments,
    })
    .from(participationAdjustments)
    .innerJoin(
      catalogFulfillments,
      eq(participationAdjustments.catalogFulfillmentId, catalogFulfillments.id),
    )
    .where(
      and(
        eq(catalogFulfillments.catalogSessionOccurrenceId, input.occurrenceId),
        eq(participationAdjustments.kind, "late-cancel-final-price"),
      ),
    )
    .orderBy(
      asc(participationAdjustments.createdAt),
      asc(participationAdjustments.id),
    );
  if (lateCancels.length === 0) return 0;
  const refilled = await database
    .select({ fulfillmentId: participationAdjustments.catalogFulfillmentId })
    .from(participationAdjustments)
    .where(
      and(
        inArray(
          participationAdjustments.catalogFulfillmentId,
          lateCancels.map((row) => row.fulfillment.id),
        ),
        eq(participationAdjustments.kind, "place-refilled"),
      ),
    );
  const refilledIds = new Set(refilled.map((row) => row.fulfillmentId));
  const quantityOf = (details: Record<string, unknown>) => {
    const quantity = Number(details.quantity ?? 1);
    return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
  };
  const firstCancelAt = lateCancels[0]!.adjustment.createdAt;
  const places = await occurrencePlaces(input.occurrenceId, input.now);
  const newPlaces = places.bookings
    .filter(
      (booking) =>
        booking.confirmed && booking.fulfillment.createdAt >= firstCancelAt,
    )
    .reduce((total, booking) => total + booking.quantity, 0);
  let used = lateCancels
    .filter((row) => refilledIds.has(row.fulfillment.id))
    .reduce((total, row) => total + quantityOf(row.fulfillment.details), 0);
  let refunded = 0;
  for (const { adjustment, fulfillment } of lateCancels) {
    if (refilledIds.has(fulfillment.id)) continue;
    const quantity = quantityOf(fulfillment.details);
    if (used + quantity > newPlaces) break;
    used += quantity;
    const order = await database.query.orders.findFirst({
      where: eq(orders.id, adjustment.orderId),
    });
    if (
      !order ||
      (order.status !== "paid" && order.status !== "partially-refunded")
    ) {
      continue;
    }
    const credits = Number(fulfillment.details.creditsApplied ?? 0) > 0;
    try {
      const refund = await refundOrganizationOrder({
        actor: systemActor(order.buyerPersonId, fulfillment.organizationId),
        orderId: order.id,
        amountMinor: credits ? 0 : order.totalMinor,
        disposition: "original-payment",
        reason: "Late cancellation: the place was taken by another player.",
        requestId: `participation-refill:${fulfillment.id}`,
        now: input.now,
      });
      const record = await database.query.refundRecords.findFirst({
        where: eq(refundRecords.id, refund.id),
      });
      await database
        .insert(participationAdjustments)
        .values({
          organizationId: fulfillment.organizationId,
          catalogFulfillmentId: fulfillment.id,
          orderId: order.id,
          kind: "place-refilled",
          credits: record?.creditsRestored ?? 0,
          amountMinor: credits ? 0 : (record?.amountMinor ?? order.totalMinor),
          creditJournalId: record?.ledgerJournalId ?? null,
          refundRecordId: record?.id ?? null,
          createdAt: input.now,
        })
        .onConflictDoNothing();
      await database.insert(auditLog).values({
        organizationId: fulfillment.organizationId,
        actorType: "system",
        action: "participation.place_refilled",
        entityType: "catalog-fulfillment",
        entityId: fulfillment.id,
        afterHash: stableHash({ orderId: order.id, refundId: refund.id }),
        reason:
          "A late cancellation's place was taken; the final price was returned.",
        traceId: `participation-refill:${fulfillment.id}`,
        createdAt: input.now,
      });
      await queueParticipationNotices([
        {
          organizationId: fulfillment.organizationId,
          subjectId: input.occurrenceId,
          recipientPersonId:
            typeof fulfillment.details.bookedByPersonId === "string"
              ? fulfillment.details.bookedByPersonId
              : order.buyerPersonId,
          bookingId: fulfillment.id,
          kind:
            refund.status === "failed" ? "refund-attention" : "place-refilled",
          scheduledFor: input.now,
        },
      ]);
      refunded += 1;
    } catch (error) {
      log.error("participation.refill.failed", {
        organizationId: fulfillment.organizationId,
        subjectId: input.occurrenceId,
        bookingId: fulfillment.id,
        error,
      });
    }
  }
  return refunded;
}

/**
 * The schedule (cron, every 5 minutes): decide due sessions, settle and
 * release cancelled sessions. Every step claims its work atomically, so
 * running twice or concurrently is safe.
 */
export async function processDueParticipation(input: {
  readonly now: Date;
  readonly limit?: number;
}): Promise<{
  readonly examined: number;
  readonly cancelled: number;
  readonly settled: number;
  readonly awaitingAttendance: number;
  readonly failed: number;
  readonly subjects: number;
  readonly waitlistExpired: number;
  readonly waitlistOffered: number;
}> {
  const catalog = await processDueCatalogParticipation(input);
  let subjects = 0;
  let waitlistExpired = 0;
  let waitlistOffered = 0;
  let failed = catalog.failed;
  if (process.env.DATABASE_URL) {
    try {
      const other = await processDueSubjectParticipation(input);
      subjects = other.examined;
      failed += other.failed;
    } catch (error) {
      failed += 1;
      log.error("participation.subjects.sweepFailed", { error });
    }
    try {
      waitlistExpired = await expireWaitlistOffers({ now: input.now });
      waitlistOffered = await offerOpenPlaces({ now: input.now });
    } catch (error) {
      failed += 1;
      log.error("participation.waitlist.sweepFailed", { error });
    }
  }
  if (failed > 0) {
    log.warn("participation.schedule.failures", { failed });
  }
  return { ...catalog, failed, subjects, waitlistExpired, waitlistOffered };
}

export { CATALOG_SUBJECT };
