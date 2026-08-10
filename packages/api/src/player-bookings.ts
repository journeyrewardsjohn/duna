import {
  auditLog,
  courtBookings,
  getDatabase,
  getTransactionalDatabase,
  orders,
  pickupParticipants,
  pickupSessions,
  registrations,
  sessions,
  teamEntries,
} from "@duna/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import { CommerceError } from "./commerce";
import type { ApiActor } from "./context";

export async function cancelPlayerBooking(input: {
  readonly actor: ApiActor;
  readonly bookingId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  if (!process.env.DATABASE_URL) {
    throw new CommerceError(
      "DATABASE_REQUIRED",
      "Booking changes require the connected Duna database.",
    );
  }
  const database = getDatabase();
  const [registration] = await database
    .select({
      registration: registrations,
      session: sessions,
      orderStatus: orders.status,
      orderTotalMinor: orders.totalMinor,
      teamEntry: teamEntries,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .leftJoin(orders, eq(registrations.orderId, orders.id))
    .leftJoin(teamEntries, eq(teamEntries.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.id, input.bookingId),
        eq(registrations.personId, input.actor.personId),
      ),
    )
    .limit(1);

  if (registration) {
    if (
      !["pending", "confirmed", "waitlisted"].includes(
        registration.registration.status,
      )
    ) {
      throw new CommerceError(
        "SESSION_NOT_OPEN",
        "This registration can no longer be cancelled.",
      );
    }
    if (registration.session.startsAt <= input.now) {
      throw new CommerceError(
        "SESSION_HAS_ENDED",
        "Cancellation closed when this session started.",
      );
    }
    if (
      registration.teamEntry?.paymentMode === "self" &&
      registration.teamEntry.roster.some((member) => member.paidAt)
    ) {
      throw new CommerceError(
        "SESSION_NOT_OPEN",
        "A teammate has already paid. Contact the organizer before cancelling the team entry.",
      );
    }
    await getTransactionalDatabase().transaction(async (transaction) => {
      await transaction
        .update(registrations)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(registrations.id, registration.registration.id));
      if (registration.teamEntry) {
        await transaction
          .update(teamEntries)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(eq(teamEntries.id, registration.teamEntry.id));
      }
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "registration.player-cancelled",
        entityType: "registration",
        entityId: registration.registration.id,
        beforeHash: stableHash(registration.registration),
        afterHash: stableHash({
          ...registration.registration,
          status: "cancelled",
        }),
        reason: "Player cancelled an upcoming booking from Duna Player.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
    });
    const paid =
      (registration.orderTotalMinor ?? 0) > 0 &&
      (registration.orderStatus === "paid" ||
        registration.orderStatus === "partially-refunded");
    return {
      id: registration.registration.id,
      status: "cancelled" as const,
      refundStatus: paid
        ? ("review-required" as const)
        : ("not-applicable" as const),
      message: paid
        ? "Registration cancelled. Any eligible refund or organization credit will follow the event’s cancellation policy."
        : "Registration cancelled.",
    };
  }

  const [pickup] = await database
    .select({
      participant: pickupParticipants,
      startsAt: pickupSessions.startsAt,
      orderStatus: orders.status,
      orderTotalMinor: orders.totalMinor,
      orderBuyerPersonId: orders.buyerPersonId,
    })
    .from(pickupParticipants)
    .innerJoin(
      pickupSessions,
      eq(pickupParticipants.pickupSessionId, pickupSessions.id),
    )
    .leftJoin(orders, eq(pickupParticipants.orderId, orders.id))
    .where(
      and(
        eq(pickupParticipants.id, input.bookingId),
        eq(pickupParticipants.personId, input.actor.personId),
        inArray(pickupParticipants.status, [
          "invited",
          "pending",
          "confirmed",
          "waitlisted",
        ]),
      ),
    )
    .limit(1);
  if (pickup) {
    if (pickup.startsAt <= input.now) {
      throw new CommerceError(
        "PICKUP_HAS_ENDED",
        "Cancellation closed when this pickup started.",
      );
    }
    if (
      pickup.participant.paidByPersonId &&
      pickup.participant.paidByPersonId !== input.actor.personId
    ) {
      throw new CommerceError(
        "PICKUP_NOT_JOINABLE",
        "The player who paid for this place manages the covered booking.",
      );
    }
    const pairedParticipants =
      pickup.participant.orderId &&
      pickup.orderBuyerPersonId === input.actor.personId
        ? await database
            .select({
              holdExpiresAt: pickupParticipants.holdExpiresAt,
              id: pickupParticipants.id,
              status: pickupParticipants.status,
            })
            .from(pickupParticipants)
            .where(
              and(
                eq(pickupParticipants.orderId, pickup.participant.orderId),
                inArray(pickupParticipants.status, [
                  "invited",
                  "pending",
                  "confirmed",
                  "waitlisted",
                ]),
              ),
            )
        : [pickup.participant];
    const participantIds = pairedParticipants.map(
      (participant) => participant.id,
    );
    const releasedCapacity = pairedParticipants.filter(
      (participant) =>
        ["confirmed", "checked-in"].includes(participant.status) ||
        (participant.status === "pending" &&
          Boolean(
            participant.holdExpiresAt && participant.holdExpiresAt > input.now,
          )),
    ).length;
    await getTransactionalDatabase().transaction(async (transaction) => {
      await transaction
        .update(pickupParticipants)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(inArray(pickupParticipants.id, participantIds));
      if (releasedCapacity > 0) {
        await transaction.execute(sql`
          SELECT duna_offer_pickup_waitlist(
            ${pickup.participant.pickupSessionId}::uuid,
            ${releasedCapacity}::integer,
            ${input.requestId}::text
          )
        `);
      }
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "pickup.player-left",
        entityType: "pickup-participant",
        entityId: pickup.participant.id,
        beforeHash: stableHash(pickup.participant),
        afterHash: stableHash({ ...pickup.participant, status: "cancelled" }),
        reason:
          participantIds.length > 1
            ? "Payer cancelled every covered place in a hosted-match booking."
            : "Player left an upcoming pickup from Duna Player.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
    });
    const paid =
      (pickup.orderTotalMinor ?? 0) > 0 &&
      (pickup.orderStatus === "paid" ||
        pickup.orderStatus === "partially-refunded");
    return {
      id: pickup.participant.id,
      status: "cancelled" as const,
      refundStatus: paid
        ? ("review-required" as const)
        : ("not-applicable" as const),
      message: paid
        ? participantIds.length > 1
          ? "All covered places were cancelled. Any eligible refund or organization credit will follow the host’s policy."
          : "Pickup cancelled. Any eligible refund or organization credit will follow the host’s policy."
        : participantIds.length > 1
          ? "All covered places were cancelled."
          : "Pickup cancelled.",
    };
  }

  const court = await database.query.courtBookings.findFirst({
    where: and(
      eq(courtBookings.id, input.bookingId),
      eq(courtBookings.personId, input.actor.personId),
      inArray(courtBookings.status, ["held", "confirmed"]),
    ),
  });
  if (court) {
    if (court.startsAt <= input.now) {
      throw new CommerceError(
        "INVALID_BOOKING_TIME",
        "Cancellation closed when this court reservation started.",
      );
    }
    await getTransactionalDatabase().transaction(async (transaction) => {
      await transaction
        .update(courtBookings)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(courtBookings.id, court.id));
      await transaction.insert(auditLog).values({
        organizationId: court.organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "court-booking.player-cancelled",
        entityType: "court-booking",
        entityId: court.id,
        beforeHash: stableHash(court),
        afterHash: stableHash({ ...court, status: "cancelled" }),
        reason: "Player cancelled an upcoming court reservation.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
    });
    return {
      id: court.id,
      status: "cancelled" as const,
      refundStatus:
        court.fundedAmountMinor > 0
          ? ("review-required" as const)
          : ("not-applicable" as const),
      message:
        court.fundedAmountMinor > 0
          ? "Court cancelled. Any eligible refund or organization credit will follow the reservation policy."
          : "Court reservation cancelled.",
    };
  }

  throw new CommerceError(
    "SESSION_NOT_FOUND",
    "This booking was not found in your Duna account.",
  );
}
