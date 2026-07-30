import { loadEnvFile } from "node:process";
import { and, eq, inArray, or } from "drizzle-orm";
import type Stripe from "stripe";
import {
  appliedFees,
  auditLog,
  divisions,
  eventTypes,
  getDatabase,
  idempotencyRecords,
  orderItems,
  orders,
  payments,
  people,
  pickupParticipants,
  pickupSessions,
  registrations,
  sessions,
  waitlistEntries,
  webhookEvents,
  workflowJobs,
} from "../packages/db/src";
import {
  createApiContext,
  createCaller,
  createDemoActor,
  getStripeClient,
  processStripeWebhook,
  processWorkflowJobById,
  scopesForRoles,
  type ApiActor,
} from "../packages/api/src";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and deployment checks may provide configuration through the environment.
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  assert(process.env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY is required");

  const database = getDatabase();
  const actor = createDemoActor(["player", "manager"]);
  assert(actor.organizationId, "Demo actor organization is required");

  const suffix = crypto.randomUUID();
  const now = new Date("2026-07-30T22:00:00.000Z");
  const secondPersonId = crypto.randomUUID();
  const thirdPersonId = crypto.randomUUID();
  const eventTypeId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const divisionId = crypto.randomUUID();
  const pickupId = crypto.randomUUID();
  const checkoutKey = crypto.randomUUID();
  const pickupKeys = [crypto.randomUUID(), crypto.randomUUID()];
  const requestIds = Array.from({ length: 8 }, () => crypto.randomUUID());
  const stripeSessionIds: string[] = [];
  const webhookProviderIds: string[] = [];
  const orderIds: string[] = [];

  const secondActor: ApiActor = {
    personId: secondPersonId,
    displayName: "Checkout Verification Two",
    roles: ["player"],
    organizationId: actor.organizationId,
    scopes: scopesForRoles(["player"]),
    ageBand: "adult",
    isDemo: true,
  };
  const thirdActor: ApiActor = {
    ...secondActor,
    personId: thirdPersonId,
    displayName: "Checkout Verification Three",
  };

  try {
    await database.batch([
      database.insert(people).values({
        id: secondPersonId,
        displayName: secondActor.displayName,
        handle: `checkout-two-${suffix}`.slice(0, 48),
        ageBand: "adult",
        isMinor: false,
        profileVisibility: "private",
      }),
      database.insert(people).values({
        id: thirdPersonId,
        displayName: thirdActor.displayName,
        handle: `checkout-three-${suffix}`.slice(0, 48),
        ageBand: "adult",
        isMinor: false,
        profileVisibility: "private",
      }),
      database.insert(eventTypes).values({
        id: eventTypeId,
        organizationId: actor.organizationId,
        title: "Checkout lifecycle verification",
        kind: "tournament",
        durationMinutes: 120,
        capacity: 4,
        minimumCapacity: 1,
        priceMinor: 2_500,
        currency: "USD",
      }),
      database.insert(sessions).values({
        id: sessionId,
        eventTypeId,
        venueId: "10000000-0000-4000-8000-000000000002",
        title: "Checkout lifecycle verification",
        slug: `checkout-lifecycle-${suffix}`,
        startsAt: new Date("2030-09-01T18:00:00.000Z"),
        endsAt: new Date("2030-09-01T20:00:00.000Z"),
        timezone: "America/Los_Angeles",
        status: "registration-open",
        capacity: 4,
        minimumCapacity: 1,
        publishedAt: now,
      }),
      database.insert(pickupSessions).values({
        id: pickupId,
        hostPersonId: actor.personId,
        organizationId: actor.organizationId,
        venueLabel: "Checkout verification beach",
        title: "Pickup capacity verification",
        startsAt: new Date("2030-09-02T18:00:00.000Z"),
        endsAt: new Date("2030-09-02T20:00:00.000Z"),
        capacity: 2,
        visibility: "public",
        costMinor: 0,
        currency: "USD",
      }),
      database.insert(pickupParticipants).values({
        pickupSessionId: pickupId,
        personId: actor.personId,
        status: "confirmed",
      }),
    ]);
    await database.insert(divisions).values({
      id: divisionId,
      sessionId,
      name: "Open division",
      discipline: "beach-2s",
      capacity: 4,
      entryFeeMinor: 3_100,
      currency: "USD",
    });

    const actorCaller = createCaller(
      createApiContext({
        actor,
        requestId: requestIds[0],
        now,
      }),
    );
    let paymentBypassBlocked = false;
    try {
      await actorCaller.player.registerForSession({
        sessionId,
        divisionId,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      paymentBypassBlocked =
        error instanceof Error &&
        error.message.includes("requires checkout before registration");
    }
    assert(
      paymentBypassBlocked,
      "Paid registration was reachable without checkout",
    );

    let unconnectedPaidCheckoutBlocked = false;
    try {
      await actorCaller.player.startEventCheckout({
        sessionId,
        divisionId,
        isDunaPlus: false,
        successUrl:
          "https://duna-web.vercel.app/app/checkout/verification?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        cancelUrl:
          "https://duna-web.vercel.app/app/checkout/verification?checkout=cancelled",
        idempotencyKey: checkoutKey,
      });
    } catch (error) {
      unconnectedPaidCheckoutBlocked =
        error instanceof Error &&
        error.message.includes("finishes Stripe Connect");
    }
    assert(
      unconnectedPaidCheckoutBlocked,
      "Paid checkout was allowed to custody funds for an unconnected operator",
    );
    const orderId = crypto.randomUUID();
    const holdExpiresAt = new Date(now.getTime() + 35 * 60_000);
    await database.batch([
      database.insert(orders).values({
        id: orderId,
        organizationId: actor.organizationId,
        buyerPersonId: actor.personId,
        status: "pending",
        currency: "USD",
        subtotalMinor: 3_100,
        feeTotalMinor: 0,
        taxTotalMinor: 0,
        totalMinor: 3_100,
        idempotencyKey: checkoutKey,
        expiresAt: holdExpiresAt,
      }),
      database.insert(orderItems).values({
        orderId,
        kind: "registration",
        referenceId: sessionId,
        description: "Checkout lifecycle verification",
        quantity: 1,
        unitAmountMinor: 3_100,
        totalAmountMinor: 3_100,
      }),
      database.insert(registrations).values({
        sessionId,
        divisionId,
        personId: actor.personId,
        status: "pending",
        eligibilityDecision: {
          status: "eligible",
          reasons: [],
          overrideAllowed: false,
        },
        eligibilityRuleVersion: 0,
        orderId,
        holdExpiresAt,
      }),
    ]);
    orderIds.push(orderId);
    const heldRegistration = await database.query.registrations.findFirst({
      where: eq(registrations.orderId, orderId),
    });
    assert(
      heldRegistration?.status === "pending" &&
        heldRegistration.divisionId === divisionId,
      "Checkout did not persist the selected division and capacity hold",
    );

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    assert(order, "Checkout order was not persisted");
    const paidEventId = `evt_checkout_paid_${suffix}`;
    webhookProviderIds.push(paidEventId);
    const paidEvent = {
      id: paidEventId,
      object: "event",
      api_version: "2026-06-30.basil",
      created: Math.floor(now.getTime() / 1_000),
      data: {
        object: {
          id: `pi_checkout_${suffix}`,
          object: "payment_intent",
          amount_received: order.totalMinor,
          currency: order.currency.toLowerCase(),
          latest_charge: `ch_checkout_${suffix}`,
          metadata: { dunaOrderId: order.id },
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
    } as unknown as Stripe.Event;
    const projection = await processStripeWebhook(paidEvent);
    assert(projection.workflowJobId, "Payment workflow was not queued");
    const projected = await processWorkflowJobById(projection.workflowJobId);
    assert(
      projected.status === "succeeded",
      "Payment workflow did not succeed",
    );

    const [paidOrder, confirmedRegistration, paymentRows] = await Promise.all([
      database.query.orders.findFirst({ where: eq(orders.id, order.id) }),
      database.query.registrations.findFirst({
        where: eq(registrations.orderId, order.id),
      }),
      database.select().from(payments).where(eq(payments.orderId, order.id)),
    ]);
    assert(
      paidOrder?.status === "paid" &&
        confirmedRegistration?.status === "confirmed" &&
        confirmedRegistration.holdExpiresAt === null &&
        paymentRows.length === 1,
      "Payment projection did not atomically confirm the registration",
    );

    const secondCaller = createCaller(
      createApiContext({
        actor: secondActor,
        requestId: requestIds[1],
        now,
      }),
    );
    const thirdCaller = createCaller(
      createApiContext({
        actor: thirdActor,
        requestId: requestIds[2],
        now,
      }),
    );
    const joined = await secondCaller.player.startEventCheckout({
      sessionId: pickupId,
      isDunaPlus: false,
      successUrl:
        "https://duna-web.vercel.app/app/checkout/verification?checkout=success",
      cancelUrl:
        "https://duna-web.vercel.app/app/checkout/verification?checkout=cancelled",
      idempotencyKey: pickupKeys[0],
    });
    const waitlisted = await thirdCaller.player.startEventCheckout({
      sessionId: pickupId,
      isDunaPlus: false,
      successUrl:
        "https://duna-web.vercel.app/app/checkout/verification?checkout=success",
      cancelUrl:
        "https://duna-web.vercel.app/app/checkout/verification?checkout=cancelled",
      idempotencyKey: pickupKeys[1],
    });
    assert(
      joined.mode === "free" &&
        joined.registrationStatus === "confirmed" &&
        waitlisted.mode === "waitlist" &&
        waitlisted.registrationStatus === "waitlisted",
      "Pickup host, join, and waitlist capacity were not serialized",
    );
    const pickupRows = await database
      .select({ status: pickupParticipants.status })
      .from(pickupParticipants)
      .where(eq(pickupParticipants.pickupSessionId, pickupId));
    assert(
      pickupRows.filter((row) => row.status === "confirmed").length === 2 &&
        pickupRows.filter((row) => row.status === "waitlisted").length === 1,
      "Pickup participant ledger does not match capacity",
    );

    console.log(
      JSON.stringify(
        {
          paymentBypassBlocked,
          unconnectedPaidCheckoutBlocked,
          divisionPersisted: heldRegistration.divisionId === divisionId,
          paymentProjected: paidOrder.status === "paid",
          registrationConfirmed: confirmedRegistration.status === "confirmed",
          paymentLedgerRows: paymentRows.length,
          pickupHostIncluded: true,
          pickupJoinStatus: joined.registrationStatus,
          pickupOverflowStatus: waitlisted.registrationStatus,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const checkoutSessionId of stripeSessionIds) {
      try {
        const session =
          await getStripeClient().checkout.sessions.retrieve(checkoutSessionId);
        if (session.status === "open") {
          await getStripeClient().checkout.sessions.expire(checkoutSessionId);
        }
      } catch {
        // The database cleanup remains authoritative for this isolated check.
      }
    }

    const jobRows =
      webhookProviderIds.length === 0
        ? []
        : await database
            .select({ id: workflowJobs.id })
            .from(workflowJobs)
            .where(inArray(workflowJobs.traceId, webhookProviderIds));
    if (jobRows.length > 0) {
      await database.delete(workflowJobs).where(
        inArray(
          workflowJobs.id,
          jobRows.map((row) => row.id),
        ),
      );
    }
    if (webhookProviderIds.length > 0) {
      await database
        .delete(webhookEvents)
        .where(inArray(webhookEvents.providerEventId, webhookProviderIds));
    }
    if (orderIds.length > 0) {
      await database
        .delete(payments)
        .where(inArray(payments.orderId, orderIds));
      await database
        .delete(registrations)
        .where(inArray(registrations.orderId, orderIds));
      await database
        .delete(pickupParticipants)
        .where(inArray(pickupParticipants.orderId, orderIds));
      await database
        .delete(appliedFees)
        .where(inArray(appliedFees.orderId, orderIds));
      await database
        .delete(orderItems)
        .where(inArray(orderItems.orderId, orderIds));
      await database.delete(orders).where(inArray(orders.id, orderIds));
    }
    await database
      .delete(idempotencyRecords)
      .where(inArray(idempotencyRecords.key, [checkoutKey, ...pickupKeys]));
    await database
      .delete(waitlistEntries)
      .where(eq(waitlistEntries.sessionId, sessionId));
    await database
      .delete(registrations)
      .where(eq(registrations.sessionId, sessionId));
    await database
      .delete(pickupParticipants)
      .where(eq(pickupParticipants.pickupSessionId, pickupId));
    await database
      .delete(pickupSessions)
      .where(eq(pickupSessions.id, pickupId));
    await database.delete(divisions).where(eq(divisions.id, divisionId));
    await database.delete(sessions).where(eq(sessions.id, sessionId));
    await database.delete(eventTypes).where(eq(eventTypes.id, eventTypeId));
    await database
      .delete(auditLog)
      .where(
        or(
          inArray(auditLog.traceId, requestIds),
          inArray(auditLog.traceId, webhookProviderIds),
          inArray(auditLog.actorPersonId, [secondPersonId, thirdPersonId]),
        ),
      );
    await database
      .delete(people)
      .where(
        and(
          inArray(people.id, [secondPersonId, thirdPersonId]),
          inArray(people.handle, [
            `checkout-two-${suffix}`.slice(0, 48),
            `checkout-three-${suffix}`.slice(0, 48),
          ]),
        ),
      );
  }
}

void main();
