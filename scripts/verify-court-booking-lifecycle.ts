import { loadEnvFile } from "node:process";
import { eq, inArray, or } from "drizzle-orm";
import type Stripe from "stripe";
import {
  appliedFees,
  auditLog,
  courtBookings,
  courtBookingParticipants,
  courts,
  getDatabase,
  orderItems,
  orders,
  payments,
  ratePlans,
  webhookEvents,
  workflowJobs,
} from "../packages/db/src";
import {
  CourtCheckoutError,
  createDemoActor,
  getCourtCheckoutStatus,
  loadCourtBookingInventory,
  processStripeWebhook,
  processWorkflowJobById,
  startCourtCheckout,
  venueWallTimeToUtc,
} from "../packages/api/src";
import { databaseRepository } from "../packages/api/src/database-repository";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and deployment checks may provide configuration through the environment.
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function project(event: Stripe.Event) {
  const accepted = await processStripeWebhook(event);
  assert(accepted.workflowJobId, `${event.type} did not queue a workflow`);
  const result = await processWorkflowJobById(accepted.workflowJobId);
  assert(result?.status === "succeeded", `${event.type} projection failed`);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const database = getDatabase();
  const actor = createDemoActor(["player", "manager"]);
  assert(actor.organizationId, "Demo organization is required");
  const suffix = crypto.randomUUID();
  const now = new Date("2030-08-01T16:00:00.000Z");
  const venueId = "10000000-0000-4000-8000-000000000002";
  const freeRateId = crypto.randomUUID();
  const paidRateId = crypto.randomUUID();
  const freeCourtId = crypto.randomUUID();
  const paidCourtId = crypto.randomUUID();
  const directOrderId = crypto.randomUUID();
  const expiredOrderId = crypto.randomUUID();
  const directBookingId = crypto.randomUUID();
  const expiredBookingId = crypto.randomUUID();
  const splitBookingId = crypto.randomUUID();
  const splitOrganizerOrderId = crypto.randomUUID();
  const splitGuestOrderId = crypto.randomUUID();
  const directCheckoutSessionId = `cs_court_verify_${suffix}`;
  const webhookIds = [
    `evt_court_paid_${suffix}`,
    `evt_court_expired_${suffix}`,
    `evt_court_split_organizer_${suffix}`,
    `evt_court_split_guest_${suffix}`,
  ];
  const orderIds = [
    directOrderId,
    expiredOrderId,
    splitOrganizerOrderId,
    splitGuestOrderId,
  ];
  const bookingIds = [directBookingId, expiredBookingId, splitBookingId];
  let freeBookingId: string | undefined;

  try {
    await database.batch([
      database.insert(ratePlans).values({
        id: freeRateId,
        organizationId: actor.organizationId,
        name: "No-charge verification rate",
        currency: "USD",
        baseAmountMinor: 0,
        rateUnitMinutes: 60,
      }),
      database.insert(ratePlans).values({
        id: paidRateId,
        organizationId: actor.organizationId,
        name: "Hourly verification rate",
        currency: "USD",
        baseAmountMinor: 2_500,
        memberAmountMinor: 2_000,
        nonMemberAmountMinor: 2_500,
        rateUnitMinutes: 60,
      }),
      database.insert(courts).values({
        id: freeCourtId,
        venueId,
        name: `Free verification ${suffix}`,
        surface: "sand",
        lit: true,
        status: "active",
        bookingPolicy: "public",
        ratePlanId: freeRateId,
        minimumDurationMinutes: 30,
        maximumDurationMinutes: 180,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        minimumNoticeMinutes: 60,
        maximumAdvanceDays: 90,
        qrToken: `court-free-${suffix}`,
      }),
      database.insert(courts).values({
        id: paidCourtId,
        venueId,
        name: `Paid verification ${suffix}`,
        surface: "sand",
        lit: true,
        status: "active",
        bookingPolicy: "public",
        ratePlanId: paidRateId,
        minimumDurationMinutes: 30,
        maximumDurationMinutes: 180,
        minimumNoticeMinutes: 60,
        maximumAdvanceDays: 90,
        qrToken: `court-paid-${suffix}`,
      }),
    ]);

    const inventory = await loadCourtBookingInventory(venueId);
    assert(
      inventory.courts.some(
        (court) =>
          court.id === freeCourtId &&
          court.pricing?.baseAmountMinor === 0 &&
          court.minimumNoticeMinutes === 60,
      ) &&
        inventory.courts.some(
          (court) =>
            court.id === paidCourtId &&
            court.pricing?.baseAmountMinor === 2_500,
        ),
      "Connected inventory omitted court policy or rates",
    );

    let daylightGapBlocked = false;
    try {
      venueWallTimeToUtc("2030-03-10T02:30", "America/Los_Angeles");
    } catch (error) {
      daylightGapBlocked =
        error instanceof CourtCheckoutError &&
        error.code === "INVALID_LOCAL_TIME";
    }
    assert(
      daylightGapBlocked,
      "Invalid daylight-saving wall time was accepted",
    );

    let policyGateBlocked = false;
    try {
      await startCourtCheckout({
        actor,
        courtId: freeCourtId,
        localStartsAt: "2030-09-01T09:00",
        durationMinutes: 60,
        paymentMode: "full",
        participants: [],
        policyAccepted: false,
        policyFullScrollConfirmed: false,
        successUrl:
          "https://duna-web.vercel.app/app/venues/verification?checkout=success",
        cancelUrl:
          "https://duna-web.vercel.app/app/venues/verification?checkout=cancelled",
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        now,
      });
    } catch (error) {
      policyGateBlocked =
        error instanceof CourtCheckoutError &&
        error.code === "POLICY_ACCEPTANCE_REQUIRED";
    }
    assert(
      policyGateBlocked,
      "Court checkout bypassed the cancellation policy gate",
    );

    const free = await startCourtCheckout({
      actor,
      courtId: freeCourtId,
      localStartsAt: "2030-09-01T10:00",
      durationMinutes: 60,
      paymentMode: "full",
      participants: [],
      policyAccepted: true,
      policyFullScrollConfirmed: true,
      successUrl:
        "https://duna-web.vercel.app/app/venues/verification?checkout=success",
      cancelUrl:
        "https://duna-web.vercel.app/app/venues/verification?checkout=cancelled",
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      now,
    });
    assert(
      free.mode === "free" &&
        free.bookingStatus === "confirmed" &&
        free.bookingId,
      "No-charge court did not confirm atomically",
    );
    freeBookingId = free.bookingId;
    bookingIds.push(free.bookingId);

    const bufferedConflict = await startCourtCheckout({
      actor,
      courtId: freeCourtId,
      localStartsAt: "2030-09-01T11:00",
      durationMinutes: 60,
      paymentMode: "full",
      participants: [],
      policyAccepted: true,
      policyFullScrollConfirmed: true,
      successUrl:
        "https://duna-web.vercel.app/app/venues/verification?checkout=success",
      cancelUrl:
        "https://duna-web.vercel.app/app/venues/verification?checkout=cancelled",
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      now,
    });
    assert(
      bufferedConflict.mode === "unavailable" &&
        bufferedConflict.alternatives.length > 0,
      "Court setup buffer did not block an adjacent booking",
    );

    let unconnectedPaidBlocked = false;
    try {
      await startCourtCheckout({
        actor,
        courtId: paidCourtId,
        localStartsAt: "2030-09-01T13:00",
        durationMinutes: 60,
        paymentMode: "full",
        participants: [],
        policyAccepted: true,
        policyFullScrollConfirmed: true,
        successUrl:
          "https://duna-web.vercel.app/app/venues/verification?checkout=success",
        cancelUrl:
          "https://duna-web.vercel.app/app/venues/verification?checkout=cancelled",
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        now,
      });
    } catch (error) {
      unconnectedPaidBlocked =
        error instanceof CourtCheckoutError &&
        error.code === "PAYMENTS_NOT_READY";
    }
    assert(
      unconnectedPaidBlocked,
      "Paid court checkout bypassed connected-account readiness",
    );

    const directStartsAt = venueWallTimeToUtc(
      "2030-09-01T14:00",
      "America/Los_Angeles",
    );
    const expiredStartsAt = venueWallTimeToUtc(
      "2030-09-01T16:00",
      "America/Los_Angeles",
    );
    const splitStartsAt = venueWallTimeToUtc(
      "2030-09-01T18:00",
      "America/Los_Angeles",
    );
    await database.batch([
      database.insert(orders).values({
        id: directOrderId,
        organizationId: actor.organizationId,
        buyerPersonId: actor.personId,
        status: "pending",
        currency: "USD",
        subtotalMinor: 2_500,
        feeTotalMinor: 75,
        taxTotalMinor: 0,
        totalMinor: 2_575,
        stripeCheckoutSessionId: directCheckoutSessionId,
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(now.getTime() + 30 * 60_000),
      }),
      database.insert(orderItems).values({
        orderId: directOrderId,
        kind: "booking",
        referenceId: directBookingId,
        description: "Court payment projection verification",
        quantity: 1,
        unitAmountMinor: 2_500,
        totalAmountMinor: 2_500,
      }),
      database.insert(courtBookings).values({
        id: directBookingId,
        organizationId: actor.organizationId,
        venueId,
        courtId: paidCourtId,
        personId: actor.personId,
        orderId: directOrderId,
        startsAt: directStartsAt,
        endsAt: new Date(directStartsAt.getTime() + 60 * 60_000),
        status: "held",
        holdExpiresAt: new Date(now.getTime() + 35 * 60_000),
        idempotencyKey: crypto.randomUUID(),
      }),
      database.insert(orders).values({
        id: expiredOrderId,
        organizationId: actor.organizationId,
        buyerPersonId: actor.personId,
        status: "pending",
        currency: "USD",
        subtotalMinor: 2_500,
        feeTotalMinor: 75,
        taxTotalMinor: 0,
        totalMinor: 2_575,
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(now.getTime() + 30 * 60_000),
      }),
      database.insert(orderItems).values({
        orderId: expiredOrderId,
        kind: "booking",
        referenceId: expiredBookingId,
        description: "Court expiry projection verification",
        quantity: 1,
        unitAmountMinor: 2_500,
        totalAmountMinor: 2_500,
      }),
      database.insert(courtBookings).values({
        id: expiredBookingId,
        organizationId: actor.organizationId,
        venueId,
        courtId: paidCourtId,
        personId: actor.personId,
        orderId: expiredOrderId,
        startsAt: expiredStartsAt,
        endsAt: new Date(expiredStartsAt.getTime() + 60 * 60_000),
        status: "held",
        holdExpiresAt: new Date(now.getTime() + 35 * 60_000),
        idempotencyKey: crypto.randomUUID(),
      }),
      database.insert(orders).values({
        id: splitOrganizerOrderId,
        organizationId: actor.organizationId,
        buyerPersonId: actor.personId,
        status: "pending",
        currency: "USD",
        subtotalMinor: 1_940,
        feeTotalMinor: 60,
        taxTotalMinor: 0,
        totalMinor: 2_000,
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(now.getTime() + 120 * 60_000),
      }),
      database.insert(orders).values({
        id: splitGuestOrderId,
        organizationId: actor.organizationId,
        buyerPersonId: actor.personId,
        status: "pending",
        currency: "USD",
        subtotalMinor: 1_940,
        feeTotalMinor: 60,
        taxTotalMinor: 0,
        totalMinor: 2_000,
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(now.getTime() + 120 * 60_000),
      }),
      database.insert(orderItems).values({
        orderId: splitOrganizerOrderId,
        kind: "booking",
        referenceId: splitBookingId,
        description: "Split court organizer share verification",
        quantity: 1,
        unitAmountMinor: 1_940,
        totalAmountMinor: 1_940,
      }),
      database.insert(orderItems).values({
        orderId: splitGuestOrderId,
        kind: "booking",
        referenceId: splitBookingId,
        description: "Split court guest share verification",
        quantity: 1,
        unitAmountMinor: 1_940,
        totalAmountMinor: 1_940,
      }),
      database.insert(courtBookings).values({
        id: splitBookingId,
        organizationId: actor.organizationId,
        venueId,
        courtId: paidCourtId,
        personId: actor.personId,
        startsAt: splitStartsAt,
        endsAt: new Date(splitStartsAt.getTime() + 60 * 60_000),
        status: "held",
        holdExpiresAt: new Date(now.getTime() + 120 * 60_000),
        paymentMode: "split",
        totalAmountMinor: 4_000,
        fundedAmountMinor: 0,
        currency: "USD",
        participantTarget: 2,
        idempotencyKey: crypto.randomUUID(),
      }),
      database.insert(courtBookingParticipants).values({
        bookingId: splitBookingId,
        personId: actor.personId,
        invitedName: actor.displayName,
        inviteToken: crypto.randomUUID(),
        role: "organizer",
        status: "payment-pending",
        shareAmountMinor: 2_000,
        orderId: splitOrganizerOrderId,
        acceptedAt: now,
      }),
      database.insert(courtBookingParticipants).values({
        bookingId: splitBookingId,
        invitedName: "Split Payment Guest",
        invitedEmail: `split-${suffix}@example.test`,
        inviteToken: crypto.randomUUID(),
        role: "player",
        status: "payment-pending",
        shareAmountMinor: 2_000,
        orderId: splitGuestOrderId,
        acceptedAt: now,
      }),
    ]);

    await project({
      id: webhookIds[0],
      object: "event",
      api_version: "2026-06-30.basil",
      created: Math.floor((now.getTime() + 1_000) / 1_000),
      data: {
        object: {
          id: `pi_court_${suffix}`,
          object: "payment_intent",
          amount_received: 2_575,
          currency: "usd",
          latest_charge: `ch_court_${suffix}`,
          metadata: { dunaOrderId: directOrderId },
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    } as unknown as Stripe.Event);
    await project({
      id: webhookIds[1],
      object: "event",
      api_version: "2026-06-30.basil",
      created: Math.floor((now.getTime() + 2_000) / 1_000),
      data: {
        object: {
          id: `cs_expired_${suffix}`,
          object: "checkout.session",
          metadata: { dunaOrderId: expiredOrderId },
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "checkout.session.expired",
    } as unknown as Stripe.Event);
    await project({
      id: webhookIds[2],
      object: "event",
      api_version: "2026-06-30.basil",
      created: Math.floor((now.getTime() + 3_000) / 1_000),
      data: {
        object: {
          id: `pi_court_split_organizer_${suffix}`,
          object: "payment_intent",
          amount_received: 2_000,
          currency: "usd",
          latest_charge: `ch_court_split_organizer_${suffix}`,
          metadata: { dunaOrderId: splitOrganizerOrderId },
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    } as unknown as Stripe.Event);
    const partiallyFundedSplit = await database.query.courtBookings.findFirst({
      where: eq(courtBookings.id, splitBookingId),
    });
    assert(
      partiallyFundedSplit?.status === "held" &&
        partiallyFundedSplit.fundedAmountMinor === 2_000,
      "The first split payment confirmed the court before every share was paid",
    );
    await project({
      id: webhookIds[3],
      object: "event",
      api_version: "2026-06-30.basil",
      created: Math.floor((now.getTime() + 4_000) / 1_000),
      data: {
        object: {
          id: `pi_court_split_guest_${suffix}`,
          object: "payment_intent",
          amount_received: 2_000,
          currency: "usd",
          latest_charge: `ch_court_split_guest_${suffix}`,
          metadata: { dunaOrderId: splitGuestOrderId },
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    } as unknown as Stripe.Event);

    const [
      paidBooking,
      paidOrder,
      paymentRows,
      expiredBooking,
      expiredOrder,
      status,
      dashboard,
      fundedSplit,
    ] = await Promise.all([
      database.query.courtBookings.findFirst({
        where: eq(courtBookings.id, directBookingId),
      }),
      database.query.orders.findFirst({
        where: eq(orders.id, directOrderId),
      }),
      database
        .select()
        .from(payments)
        .where(eq(payments.orderId, directOrderId)),
      database.query.courtBookings.findFirst({
        where: eq(courtBookings.id, expiredBookingId),
      }),
      database.query.orders.findFirst({
        where: eq(orders.id, expiredOrderId),
      }),
      getCourtCheckoutStatus({
        actor,
        checkoutSessionId: directCheckoutSessionId,
      }),
      databaseRepository.player.dashboard(actor.personId),
      database.query.courtBookings.findFirst({
        where: eq(courtBookings.id, splitBookingId),
      }),
    ]);
    assert(
      paidBooking?.status === "confirmed" &&
        paidBooking.holdExpiresAt === null &&
        paidOrder?.status === "paid" &&
        paymentRows.length === 1 &&
        status.complete,
      "Payment projection did not confirm court, order, ledger, and status",
    );
    assert(
      expiredBooking?.status === "expired" &&
        expiredOrder?.status === "cancelled",
      "Expired checkout did not release its court hold",
    );
    assert(
      fundedSplit?.status === "confirmed" &&
        fundedSplit.fundedAmountMinor === 4_000 &&
        fundedSplit.holdExpiresAt === null,
      "All split shares did not fund and confirm the court booking",
    );
    assert(
      dashboard.bookings.some(
        (booking) =>
          booking.id === freeBookingId && booking.kind === "court-rental",
      ) &&
        dashboard.bookings.some(
          (booking) =>
            booking.id === directBookingId &&
            booking.amount.amountMinor === 2_575,
        ),
      "Confirmed courts did not project into the player calendar",
    );

    console.log(
      JSON.stringify(
        {
          inventoryProjected: true,
          venueTimezoneValidated: true,
          daylightGapBlocked,
          policyGateBlocked,
          freeBookingConfirmed: true,
          bufferedCollisionBlocked: true,
          alternativesReturned: bufferedConflict.alternatives.length,
          unconnectedPaidBlocked,
          paidBookingProjected: paidBooking.status,
          checkoutStatusComplete: status.complete,
          expiredHoldReleased: expiredBooking.status,
          splitPaymentsConfirmed: fundedSplit.status,
          playerCalendarProjected: true,
        },
        null,
        2,
      ),
    );
  } finally {
    const jobRows = await database
      .select({ id: workflowJobs.id })
      .from(workflowJobs)
      .where(inArray(workflowJobs.traceId, webhookIds));
    if (jobRows.length > 0) {
      await database.delete(workflowJobs).where(
        inArray(
          workflowJobs.id,
          jobRows.map((row) => row.id),
        ),
      );
    }
    await database
      .delete(webhookEvents)
      .where(inArray(webhookEvents.providerEventId, webhookIds));
    await database
      .delete(auditLog)
      .where(
        or(
          inArray(auditLog.entityId, [...bookingIds, ...orderIds]),
          inArray(auditLog.traceId, webhookIds),
        ),
      );
    await database.delete(payments).where(inArray(payments.orderId, orderIds));
    await database
      .delete(appliedFees)
      .where(inArray(appliedFees.orderId, orderIds));
    await database
      .delete(courtBookings)
      .where(inArray(courtBookings.id, bookingIds));
    await database.delete(orders).where(inArray(orders.id, orderIds));
    await database
      .delete(courts)
      .where(inArray(courts.id, [freeCourtId, paidCourtId]));
    await database
      .delete(ratePlans)
      .where(inArray(ratePlans.id, [freeRateId, paidRateId]));
  }
}

void main();
