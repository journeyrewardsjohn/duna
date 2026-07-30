import {
  appliedFees,
  divisions,
  eventTypes,
  getDatabase,
  orderItems,
  orders,
  organizations,
  people,
  pickupParticipants,
  pickupSessions,
  programs,
  registrations,
  sessions,
  venues,
} from "@duna/db";
import {
  calculateOperatorProcessingFee,
  priceConsumerOrder,
  type CurrencyCode,
  type OrderItemKind,
} from "@duna/pricing";
import { eq, sql } from "drizzle-orm";
import {
  evaluatePickupParticipant,
  evaluateRegistrationForSession,
  joinPickup,
  registerForSession,
} from "./commerce";
import type { ApiActor } from "./context";
import { hasActiveDunaPlusMembership } from "./membership";
import {
  createEventCheckoutSession,
  getStripeClient,
  isStripeConfigured,
} from "./payments";

export class CheckoutError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "EVENT_NOT_FOUND"
      | "EVENT_NOT_CHECKOUT_ELIGIBLE"
      | "STRIPE_REQUIRED"
      | "CHECKOUT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface EventCheckoutResult {
  readonly mode: "free" | "stripe" | "waitlist" | "already-registered";
  readonly orderId?: string;
  readonly registrationId?: string;
  readonly registrationStatus?: "confirmed" | "waitlisted" | "pending";
  readonly checkoutSessionId?: string;
  readonly checkoutUrl?: string;
  readonly expiresAt?: string;
  readonly pricing: {
    readonly subtotalMinor: number;
    readonly feeTotalMinor: number;
    readonly totalMinor: number;
    readonly currency: CurrencyCode;
  };
}

export interface EventCheckoutStatus {
  readonly orderId: string;
  readonly orderStatus:
    | "draft"
    | "pending"
    | "paid"
    | "partially-refunded"
    | "refunded"
    | "failed"
    | "disputed"
    | "cancelled";
  readonly registrationStatus?:
    | "pending"
    | "confirmed"
    | "waitlisted"
    | "cancelled"
    | "refunded"
    | "checked-in";
  readonly complete: boolean;
}

function currency(value: string): CurrencyCode {
  const supported: readonly CurrencyCode[] = [
    "USD",
    "CAD",
    "AUD",
    "BRL",
    "EUR",
  ];
  if (!supported.includes(value as CurrencyCode)) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Event currency is not supported.",
    );
  }
  return value as CurrencyCode;
}

interface CheckoutEvent {
  readonly id: string;
  readonly source: "session" | "pickup";
  readonly title: string;
  readonly kind:
    | "tournament"
    | "league"
    | "clinic"
    | "open-play"
    | "private-lesson"
    | "court-rental"
    | "pickup";
  readonly priceMinor: number;
  readonly currency: CurrencyCode;
  readonly organization?: typeof organizations.$inferSelect;
}

async function loadCheckoutEvent(
  eventId: string,
  divisionId?: string,
): Promise<CheckoutEvent> {
  const row = (
    await getDatabase()
      .select({
        id: sessions.id,
        title: sessions.title,
        kindFromProgram: programs.kind,
        kindFromEventType: eventTypes.kind,
        organizationFromProgram: programs.organizationId,
        organizationFromEventType: eventTypes.organizationId,
        organizationFromVenue: venues.organizationId,
        priceMinor: eventTypes.priceMinor,
        currency: eventTypes.currency,
        divisionId: divisions.id,
        divisionPriceMinor: divisions.entryFeeMinor,
        divisionCurrency: divisions.currency,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(
        divisions,
        divisionId
          ? sql`${divisions.id} = ${divisionId}::uuid AND ${divisions.sessionId} = ${sessions.id}`
          : sql`false`,
      )
      .where(eq(sessions.id, eventId))
      .limit(1)
  )[0];
  if (row) {
    if (divisionId && row.divisionId !== divisionId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "The selected division is not available for this event.",
      );
    }
    const organizationId =
      row.organizationFromProgram ??
      row.organizationFromEventType ??
      row.organizationFromVenue;
    if (!organizationId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Event is not attached to a billable organization.",
      );
    }
    const organization = await getDatabase().query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    if (!organization) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Event organization was not found.",
      );
    }
    return {
      id: row.id,
      source: "session",
      title: row.title,
      kind: row.kindFromProgram ?? row.kindFromEventType ?? "open-play",
      priceMinor: row.divisionPriceMinor ?? row.priceMinor ?? 0,
      currency: currency(
        row.divisionCurrency ?? row.currency ?? organization.currency,
      ),
      organization,
    };
  }

  const pickup = (
    await getDatabase()
      .select({
        id: pickupSessions.id,
        title: pickupSessions.title,
        organizationId: pickupSessions.organizationId,
        venueOrganizationId: venues.organizationId,
        priceMinor: pickupSessions.costMinor,
        currency: pickupSessions.currency,
      })
      .from(pickupSessions)
      .leftJoin(venues, eq(pickupSessions.venueId, venues.id))
      .where(eq(pickupSessions.id, eventId))
      .limit(1)
  )[0];
  if (!pickup) {
    throw new CheckoutError("EVENT_NOT_FOUND", "Event was not found.");
  }
  const organizationId =
    pickup.organizationId ?? pickup.venueOrganizationId ?? undefined;
  const organization = organizationId
    ? await getDatabase().query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
      })
    : undefined;
  return {
    id: pickup.id,
    source: "pickup",
    title: pickup.title,
    kind: "pickup",
    priceMinor: pickup.priceMinor,
    currency: currency(pickup.currency),
    organization,
  };
}

async function existingCheckoutResult(input: {
  readonly orderId: string;
  readonly registrationId?: string;
  readonly pricing: EventCheckoutResult["pricing"];
}): Promise<EventCheckoutResult | undefined> {
  const order = await getDatabase().query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order?.stripeCheckoutSessionId || !isStripeConfigured()) {
    return undefined;
  }
  const checkout = await getStripeClient().checkout.sessions.retrieve(
    order.stripeCheckoutSessionId,
  );
  if (!checkout.url || checkout.status !== "open") return undefined;
  return {
    mode: "stripe",
    orderId: order.id,
    registrationId: input.registrationId,
    registrationStatus: "pending",
    checkoutSessionId: checkout.id,
    checkoutUrl: checkout.url,
    expiresAt: new Date(checkout.expires_at * 1_000).toISOString(),
    pricing: input.pricing,
  };
}

export async function startEventCheckout(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly divisionId?: string;
  readonly subjectPersonId?: string;
  readonly isDunaPlus: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<EventCheckoutResult> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Checkout requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  const event = await loadCheckoutEvent(input.sessionId, input.divisionId);
  const hasDunaPlus = await hasActiveDunaPlusMembership(
    input.actor.personId,
    input.now,
  );
  const itemKind: OrderItemKind =
    event.kind === "league" || event.kind === "tournament"
      ? "registration"
      : "booking";
  const priced = priceConsumerOrder({
    currency: event.currency,
    isDunaPlus: hasDunaPlus,
    items: [
      {
        id: event.id,
        kind: itemKind,
        description: event.title,
        quantity: 1,
        unitAmountMinor: event.priceMinor,
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
  };

  if (priced.totalMinor === 0) {
    const registration =
      event.source === "pickup"
        ? await joinPickup({
            actor: input.actor,
            pickupSessionId: event.id,
            subjectPersonId,
            requestId: input.requestId,
            ipAddress: input.ipAddress,
            now: input.now,
          })
        : await registerForSession({
            actor: input.actor,
            sessionId: event.id,
            divisionId: input.divisionId,
            subjectPersonId,
            requestId: input.requestId,
            ipAddress: input.ipAddress,
            now: input.now,
          });
    return {
      mode: registration.status === "waitlisted" ? "waitlist" : "free",
      registrationId:
        "registrationId" in registration
          ? registration.registrationId
          : registration.participantId,
      registrationStatus: registration.status,
      pricing,
    };
  }
  if (
    !event.organization?.stripeAccountId ||
    !event.organization.stripeChargesEnabled
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Paid registration is unavailable until the operator finishes Stripe Connect.",
    );
  }
  if (!isStripeConfigured()) {
    throw new CheckoutError(
      "STRIPE_REQUIRED",
      "Stripe checkout is not configured.",
    );
  }

  const eligibility =
    event.source === "pickup"
      ? await evaluatePickupParticipant({
          actor: input.actor,
          pickupSessionId: event.id,
          subjectPersonId,
          now: input.now,
        })
      : await evaluateRegistrationForSession({
          actor: input.actor,
          sessionId: event.id,
          divisionId: input.divisionId,
          subjectPersonId,
          inviteCodes: [],
          now: input.now,
        });
  const existingOrder = await database.query.orders.findFirst({
    where: eq(orders.idempotencyKey, input.idempotencyKey),
  });
  const orderId = existingOrder?.id ?? crypto.randomUUID();
  const holdExpiresAt = new Date(input.now.getTime() + 35 * 60_000);
  const checkoutExpiresAt = new Date(input.now.getTime() + 30 * 60_000);
  const operatorProcessingFee = calculateOperatorProcessingFee({
    amountMinor: priced.subtotalMinor,
    currency: priced.currency,
    method: "online-card",
  });
  if (!existingOrder) {
    await database.batch([
      database.insert(orders).values({
        id: orderId,
        organizationId: event.organization?.id,
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
        kind: itemKind,
        referenceId: event.id,
        description: event.title,
        quantity: 1,
        unitAmountMinor: event.priceMinor,
        totalAmountMinor: event.priceMinor,
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
    ]);
  }

  let hold:
    | {
        registration_id?: string | null;
        result_status?: string;
        spots_remaining?: number;
      }
    | undefined;
  try {
    if (event.source === "pickup") {
      const participation = await joinPickup({
        actor: input.actor,
        pickupSessionId: event.id,
        subjectPersonId,
        orderId,
        holdExpiresAt,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
      hold = {
        registration_id: participation.participantId,
        result_status: participation.status,
        spots_remaining: participation.spotsRemaining,
      };
    } else {
      const result = await database.execute(sql`
        SELECT *
        FROM duna_hold_session_registration(
          ${event.id}::uuid,
          ${input.divisionId ?? null}::uuid,
          ${subjectPersonId}::uuid,
          ${input.actor.personId}::uuid,
          ${orderId}::uuid,
          ${holdExpiresAt}::timestamptz,
          ${JSON.stringify(eligibility.decision)}::jsonb,
          ${"ruleVersion" in eligibility ? eligibility.ruleVersion : 0}::integer,
          ${input.requestId}::text,
          ${input.ipAddress ?? null}::text
        )
      `);
      hold = result.rows[0] as typeof hold;
    }
  } catch (error) {
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    throw error;
  }
  if (hold?.result_status === "confirmed") {
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    return {
      mode: "already-registered",
      registrationId: hold.registration_id ?? undefined,
      registrationStatus: "confirmed",
      pricing,
    };
  }
  if (hold?.result_status === "full" || hold?.result_status === "waitlisted") {
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    return {
      mode: "waitlist",
      registrationId: hold.registration_id ?? undefined,
      registrationStatus: "waitlisted",
      pricing,
    };
  }
  if (hold?.result_status === "pending" && hold.registration_id) {
    const heldRegistration =
      event.source === "pickup"
        ? await database.query.pickupParticipants.findFirst({
            where: eq(pickupParticipants.id, hold.registration_id),
          })
        : await database.query.registrations.findFirst({
            where: eq(registrations.id, hold.registration_id),
          });
    if (heldRegistration?.orderId && heldRegistration.orderId !== orderId) {
      await database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId));
      const resumed = await existingCheckoutResult({
        orderId: heldRegistration.orderId,
        registrationId: heldRegistration.id,
        pricing,
      });
      if (resumed) return resumed;
      throw new CheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "A checkout is already active for this participant.",
      );
    }
    const resumed = await existingCheckoutResult({
      orderId,
      registrationId: hold.registration_id,
      pricing,
    });
    if (resumed) return resumed;
  }
  if (!hold?.registration_id || hold.result_status !== "pending") {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "The event could not be held for checkout.",
    );
  }

  const buyer = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  try {
    const applicationFeeMinor = Math.min(
      priced.totalMinor,
      feeTotalMinor + operatorProcessingFee.amountMinor,
    );
    const checkout = await createEventCheckoutSession({
      orderId,
      personId: input.actor.personId,
      customerEmail: buyer?.email ?? undefined,
      eventId: event.id,
      eventTitle: event.title,
      amountMinor: priced.totalMinor,
      currency: priced.currency,
      applicationFeeMinor,
      connectedAccountId: event.organization.stripeAccountId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: checkoutExpiresAt,
      idempotencyKey: input.idempotencyKey,
    });
    if (!checkout.url) {
      throw new CheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "Stripe did not return a checkout URL.",
      );
    }
    await database
      .update(orders)
      .set({
        stripeCheckoutSessionId: checkout.id,
        expiresAt: new Date(checkout.expiresAt),
        updatedAt: input.now,
      })
      .where(eq(orders.id, orderId));
    return {
      mode: "stripe",
      orderId,
      registrationId: hold.registration_id,
      registrationStatus: "pending",
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiresAt: checkout.expiresAt,
      pricing,
    };
  } catch (error) {
    await database.batch([
      database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId)),
      database
        .update(registrations)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(registrations.orderId, orderId)),
      database
        .update(pickupParticipants)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(pickupParticipants.orderId, orderId)),
    ]);
    throw error;
  }
}

export async function getEventCheckoutStatus(input: {
  readonly actor: ApiActor;
  readonly checkoutSessionId: string;
}): Promise<EventCheckoutStatus> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Checkout status requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: eq(orders.stripeCheckoutSessionId, input.checkoutSessionId),
  });
  if (!order || order.buyerPersonId !== input.actor.personId) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "Checkout session was not found.",
    );
  }
  const registration = await database.query.registrations.findFirst({
    where: eq(registrations.orderId, order.id),
  });
  const pickupParticipant =
    registration ??
    (await database.query.pickupParticipants.findFirst({
      where: eq(pickupParticipants.orderId, order.id),
    }));
  return {
    orderId: order.id,
    orderStatus: order.status,
    registrationStatus: pickupParticipant?.status,
    complete:
      order.status === "paid" &&
      (pickupParticipant === undefined ||
        pickupParticipant.status === "confirmed" ||
        pickupParticipant.status === "checked-in"),
  };
}
