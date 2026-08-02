import {
  appliedFees,
  auditLog,
  divisions,
  eventBlueprints,
  eventPolicyAcceptances,
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
  teamEntries,
  tickets,
  ticketTypes,
  venues,
} from "@duna/db";
import {
  calculateOperatorProcessingFee,
  priceConsumerOrder,
  type CurrencyCode,
  type OrderItemKind,
} from "@duna/pricing";
import { and, eq, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
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
  readonly fulfillmentStatus?: "confirmed" | "pending-approval";
  readonly teamClaimToken?: string;
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
  readonly fulfillmentStatus?: "confirmed" | "pending-approval";
  readonly complete: boolean;
}

export interface TeamClaimSummary {
  readonly eventTitle: string;
  readonly eventSlug: string;
  readonly divisionName: string;
  readonly captainName: string;
  readonly expectedTeamSize: number;
  readonly claimedPlayers: number;
  readonly paymentMode: "self" | "team";
  readonly status:
    "assembling" | "ready" | "confirmed" | "cancelled" | "expired";
  readonly expiresAt: string;
  readonly alreadyClaimed: boolean;
  readonly paymentRequired: boolean;
  readonly roster: readonly {
    readonly displayName: string;
    readonly status: "captain" | "selected" | "invited" | "claimed";
  }[];
}

export interface PendingTicketApproval {
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly sessionId: string;
  readonly eventTitle: string;
  readonly ticketName: string;
  readonly buyerName: string;
  readonly quantity: number;
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  readonly purchasedAt: string;
}

export interface ApprovedTicketOrder {
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly quantity: number;
  readonly status: "issued";
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
  readonly itemKind?: OrderItemKind;
  readonly itemReferenceId?: string;
  readonly quantity?: number;
  readonly ticketTypeId?: string;
  readonly approvalRequired?: boolean;
  readonly teamSize?: number;
  readonly priceBasis?: "per-person" | "per-team";
  readonly organization?: typeof organizations.$inferSelect;
}

export interface CheckoutPolicy {
  readonly id: string;
  readonly kind: "policy" | "waiver";
  readonly title: string;
  readonly markdown: string;
  readonly required: boolean;
  readonly requireFullScroll: boolean;
}

function checkoutPolicy(
  value: Record<string, unknown>,
): CheckoutPolicy | undefined {
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    (value.kind !== "policy" && value.kind !== "waiver") ||
    typeof value.title !== "string" ||
    value.title.length === 0 ||
    typeof value.markdown !== "string" ||
    typeof value.required !== "boolean" ||
    typeof value.requireFullScroll !== "boolean"
  ) {
    return undefined;
  }
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    markdown: value.markdown,
    required: value.required,
    requireFullScroll: value.requireFullScroll,
  };
}

async function loadCheckoutPolicies(
  sessionId: string,
  ticketPurchase: boolean,
): Promise<readonly CheckoutPolicy[]> {
  const blueprint = await getDatabase().query.eventBlueprints.findFirst({
    where: eq(eventBlueprints.sessionId, sessionId),
  });
  const policies = (blueprint?.policies ?? [])
    .map(checkoutPolicy)
    .filter((policy): policy is CheckoutPolicy => Boolean(policy));
  return ticketPurchase
    ? policies.filter((policy) => policy.kind !== "waiver")
    : policies;
}

export function validatePolicyAcceptances(input: {
  readonly policies: readonly CheckoutPolicy[];
  readonly acceptedPolicyIds: readonly string[];
  readonly readPolicyIds: readonly string[];
}): readonly CheckoutPolicy[] {
  const accepted = new Set(input.acceptedPolicyIds);
  const read = new Set(input.readPolicyIds);
  const knownIds = new Set(input.policies.map((policy) => policy.id));
  if (
    input.acceptedPolicyIds.some((id) => !knownIds.has(id)) ||
    input.readPolicyIds.some((id) => !knownIds.has(id))
  ) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "An event policy changed. Review the current agreements before continuing.",
    );
  }
  for (const policy of input.policies) {
    if (policy.required && !accepted.has(policy.id)) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        `${policy.title} must be accepted before checkout.`,
      );
    }
    if (
      accepted.has(policy.id) &&
      (policy.kind === "waiver" || policy.requireFullScroll) &&
      !read.has(policy.id)
    ) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        `${policy.title} must be read to the end before it can be accepted.`,
      );
    }
  }
  return input.policies.filter((policy) => accepted.has(policy.id));
}

async function recordPolicyAcceptances(input: {
  readonly policies: readonly CheckoutPolicy[];
  readonly readPolicyIds: readonly string[];
  readonly actor: ApiActor;
  readonly subjectPersonId: string;
  readonly sessionId: string;
  readonly orderId?: string;
  readonly registrationId?: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  if (input.policies.length === 0) return;
  const database = getDatabase();
  const read = new Set(input.readPolicyIds);
  for (const policy of input.policies) {
    const documentTextHash = stableHash(policy.markdown);
    const acceptanceKey = stableHash({
      checkout: input.idempotencyKey,
      policyId: policy.id,
      subjectPersonId: input.subjectPersonId,
      documentTextHash,
    });
    const accepted = await database
      .insert(eventPolicyAcceptances)
      .values({
        acceptanceKey,
        sessionId: input.sessionId,
        policyId: policy.id,
        policyKind: policy.kind,
        policyTitle: policy.title,
        documentText: policy.markdown,
        documentTextHash,
        subjectPersonId: input.subjectPersonId,
        acceptedByPersonId: input.actor.personId,
        orderId: input.orderId,
        registrationId: input.registrationId,
        fullScrollConfirmed: read.has(policy.id),
        ipAddress: input.ipAddress,
        acceptedAt: input.now,
      })
      .onConflictDoNothing({
        target: eventPolicyAcceptances.acceptanceKey,
      })
      .returning({ id: eventPolicyAcceptances.id });
    const acceptanceId = accepted[0]?.id;
    if (!acceptanceId) continue;
    await database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      organizationId: input.actor.organizationId,
      actorType: "person",
      action:
        policy.kind === "waiver"
          ? "event.waiver.accepted"
          : "event.policy.accepted",
      entityType: "event-policy-acceptance",
      entityId: acceptanceId,
      afterHash: stableHash({
        sessionId: input.sessionId,
        policyId: policy.id,
        documentTextHash,
        subjectPersonId: input.subjectPersonId,
        acceptedByPersonId: input.actor.personId,
        fullScrollConfirmed: read.has(policy.id),
      }),
      reason: `Accepted the exact ${policy.kind} document presented during event checkout.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    });
  }
}

async function loadCheckoutEvent(
  eventId: string,
  divisionId?: string,
  ticketTypeId?: string,
  ticketQuantity = 1,
): Promise<CheckoutEvent> {
  if (ticketTypeId) {
    if (
      !Number.isSafeInteger(ticketQuantity) ||
      ticketQuantity < 1 ||
      ticketQuantity > 10
    ) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Ticket quantity must be between 1 and 10.",
      );
    }
    const ticket = (
      await getDatabase()
        .select({
          eventId: sessions.id,
          eventTitle: sessions.title,
          ticketTypeId: ticketTypes.id,
          ticketName: ticketTypes.name,
          priceMinor: ticketTypes.priceMinor,
          currency: ticketTypes.currency,
          quantity: ticketTypes.quantity,
          minimumPerOrder: ticketTypes.minimumPerOrder,
          maximumPerOrder: ticketTypes.maximumPerOrder,
          salesStartsAt: ticketTypes.salesStartsAt,
          salesEndsAt: ticketTypes.salesEndsAt,
          hidden: ticketTypes.hidden,
          availableOnline: ticketTypes.availableOnline,
          manualSoldOut: ticketTypes.manualSoldOut,
          approvalRequired: ticketTypes.approvalRequired,
          organizationFromProgram: programs.organizationId,
          organizationFromEventType: eventTypes.organizationId,
          organizationFromVenue: venues.organizationId,
        })
        .from(ticketTypes)
        .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
        .leftJoin(programs, eq(sessions.programId, programs.id))
        .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
        .leftJoin(venues, eq(sessions.venueId, venues.id))
        .where(eq(ticketTypes.id, ticketTypeId))
        .limit(1)
    )[0];
    if (!ticket || ticket.eventId !== eventId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "The selected ticket is not available for this event.",
      );
    }
    const now = new Date();
    if (
      ticket.hidden ||
      !ticket.availableOnline ||
      ticket.manualSoldOut ||
      ticketQuantity < ticket.minimumPerOrder ||
      ticketQuantity > ticket.maximumPerOrder ||
      (ticket.salesStartsAt && ticket.salesStartsAt > now) ||
      (ticket.salesEndsAt && ticket.salesEndsAt <= now)
    ) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "The selected ticket is not currently available online.",
      );
    }
    if (ticket.quantity !== null) {
      const issued = await getDatabase()
        .select({ count: sql<number>`count(*)::integer` })
        .from(tickets)
        .where(
          sql`${tickets.ticketTypeId} = ${ticketTypeId}::uuid AND ${tickets.status} IN ('held', 'issued', 'transferred', 'scanned')`,
        );
      if ((issued[0]?.count ?? 0) + ticketQuantity > ticket.quantity) {
        throw new CheckoutError(
          "EVENT_NOT_CHECKOUT_ELIGIBLE",
          "There are not enough tickets remaining for that quantity.",
        );
      }
    }
    const organizationId =
      ticket.organizationFromProgram ??
      ticket.organizationFromEventType ??
      ticket.organizationFromVenue;
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
      id: ticket.eventId,
      source: "session",
      title: `${ticket.eventTitle} · ${ticket.ticketName}`,
      kind: "open-play",
      priceMinor: ticket.priceMinor,
      currency: currency(ticket.currency),
      itemKind: "ticket",
      itemReferenceId: ticket.ticketTypeId,
      quantity: ticketQuantity,
      ticketTypeId: ticket.ticketTypeId,
      approvalRequired: ticket.approvalRequired,
      organization,
    };
  }

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
        divisionTeamSize: divisions.teamSize,
        divisionPriceBasis: divisions.priceBasis,
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
      teamSize: row.divisionTeamSize ?? 1,
      priceBasis:
        row.divisionPriceBasis === "per-person" ? "per-person" : "per-team",
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
  readonly teamClaimToken?: string;
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
    teamClaimToken: input.teamClaimToken,
    checkoutSessionId: checkout.id,
    checkoutUrl: checkout.url,
    expiresAt: new Date(checkout.expires_at * 1_000).toISOString(),
    pricing: input.pricing,
  };
}

interface CheckoutTeamMember {
  readonly personId?: string;
  readonly inviteTarget?: string;
  readonly displayName?: string;
}

async function saveTeamEntry(input: {
  readonly registrationId: string;
  readonly payingPersonId: string;
  readonly expectedTeamSize: number;
  readonly paymentMode: "self" | "team";
  readonly roster: readonly CheckoutTeamMember[];
  readonly now: Date;
}): Promise<string> {
  const existing = await getDatabase().query.teamEntries.findFirst({
    where: eq(teamEntries.registrationId, input.registrationId),
  });
  if (existing) return existing.claimToken;
  const claimToken = crypto.randomUUID();
  await getDatabase()
    .insert(teamEntries)
    .values({
      registrationId: input.registrationId,
      payingPersonId: input.payingPersonId,
      partnerPersonId: input.roster.find((member) => member.personId)?.personId,
      expectedTeamSize: input.expectedTeamSize,
      paymentMode: input.paymentMode,
      roster: input.roster.map((member) => ({
        ...member,
        status: member.personId ? ("selected" as const) : ("invited" as const),
      })),
      status: "assembling",
      claimToken,
      claimExpiresAt: new Date(input.now.getTime() + 14 * 24 * 60 * 60_000),
    });
  return claimToken;
}

export async function startEventCheckout(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly divisionId?: string;
  readonly ticketTypeId?: string;
  readonly ticketQuantity?: number;
  readonly teamPaymentMode?: "self" | "team";
  readonly teamRoster?: readonly CheckoutTeamMember[];
  readonly subjectPersonId?: string;
  readonly acceptedPolicyIds?: readonly string[];
  readonly readPolicyIds?: readonly string[];
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
  if (input.divisionId && input.ticketTypeId) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Choose either a player division or an event ticket.",
    );
  }
  const event = await loadCheckoutEvent(
    input.sessionId,
    input.divisionId,
    input.ticketTypeId,
    input.ticketQuantity,
  );
  const policies = await loadCheckoutPolicies(
    input.sessionId,
    Boolean(event.ticketTypeId),
  );
  const acceptedPolicies = validatePolicyAcceptances({
    policies,
    acceptedPolicyIds: input.acceptedPolicyIds ?? [],
    readPolicyIds: input.readPolicyIds ?? [],
  });
  const expectedTeamSize = Math.max(1, event.teamSize ?? 1);
  const teamRoster = input.teamRoster ?? [];
  if (event.ticketTypeId && teamRoster.length > 0) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Team members apply to player entries, not spectator tickets.",
    );
  }
  if (
    teamRoster.length > Math.max(0, expectedTeamSize - 1) ||
    teamRoster.some(
      (member) =>
        !member.personId &&
        !member.inviteTarget?.trim() &&
        !member.displayName?.trim(),
    )
  ) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "The team roster does not match the selected division.",
    );
  }
  const hasDunaPlus = await hasActiveDunaPlusMembership(
    input.actor.personId,
    input.now,
  );
  const itemKind: OrderItemKind =
    event.itemKind ??
    (event.kind === "league" || event.kind === "tournament"
      ? "registration"
      : "booking");
  const itemQuantity =
    event.quantity ??
    (input.teamPaymentMode === "team" &&
    event.priceBasis === "per-person" &&
    expectedTeamSize > 1
      ? expectedTeamSize
      : 1);
  const priced = priceConsumerOrder({
    currency: event.currency,
    isDunaPlus: hasDunaPlus,
    items: [
      {
        id: event.itemReferenceId ?? event.id,
        kind: itemKind,
        description: event.title,
        quantity: itemQuantity,
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
    if (event.ticketTypeId) {
      const existingOrder = await database.query.orders.findFirst({
        where: eq(orders.idempotencyKey, input.idempotencyKey),
      });
      if (existingOrder) {
        await recordPolicyAcceptances({
          policies: acceptedPolicies,
          readPolicyIds: input.readPolicyIds ?? [],
          actor: input.actor,
          subjectPersonId,
          sessionId: input.sessionId,
          orderId: existingOrder.id,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
          now: input.now,
        });
        return {
          mode: "free",
          orderId: existingOrder.id,
          fulfillmentStatus: event.approvalRequired
            ? "pending-approval"
            : "confirmed",
          pricing,
        };
      }
      const orderId = crypto.randomUUID();
      await database.batch([
        database.insert(orders).values({
          id: orderId,
          organizationId: event.organization?.id,
          buyerPersonId: input.actor.personId,
          status: "pending",
          currency: priced.currency,
          subtotalMinor: 0,
          feeTotalMinor: 0,
          taxTotalMinor: 0,
          totalMinor: 0,
          idempotencyKey: input.idempotencyKey,
        }),
        database.insert(orderItems).values({
          orderId,
          kind: "ticket",
          referenceId: event.ticketTypeId,
          description: event.title,
          quantity: itemQuantity,
          unitAmountMinor: 0,
          totalAmountMinor: 0,
        }),
      ]);
      try {
        await database.execute(sql`
          SELECT *
          FROM duna_hold_event_tickets(
            ${event.ticketTypeId}::uuid,
            ${orderId}::uuid,
            ${input.actor.personId}::uuid,
            ${itemQuantity}::integer
          )
        `);
        await database.batch([
          database
            .update(orders)
            .set({ status: "paid", updatedAt: input.now })
            .where(eq(orders.id, orderId)),
          ...(event.approvalRequired
            ? []
            : [
                database
                  .update(tickets)
                  .set({ status: "issued", updatedAt: input.now })
                  .where(eq(tickets.orderId, orderId)),
              ]),
        ]);
      } catch (error) {
        await database
          .update(orders)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(eq(orders.id, orderId));
        throw error;
      }
      await recordPolicyAcceptances({
        policies: acceptedPolicies,
        readPolicyIds: input.readPolicyIds ?? [],
        actor: input.actor,
        subjectPersonId,
        sessionId: input.sessionId,
        orderId,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
      return {
        mode: "free",
        orderId,
        fulfillmentStatus: event.approvalRequired
          ? "pending-approval"
          : "confirmed",
        pricing,
      };
    }
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
    const registrationId =
      "registrationId" in registration
        ? registration.registrationId
        : registration.participantId;
    const teamClaimToken =
      event.source === "session" &&
      expectedTeamSize > 1 &&
      registration.status !== "waitlisted"
        ? await saveTeamEntry({
            registrationId,
            payingPersonId: input.actor.personId,
            expectedTeamSize,
            paymentMode: input.teamPaymentMode ?? "self",
            roster: teamRoster,
            now: input.now,
          })
        : undefined;
    await recordPolicyAcceptances({
      policies: acceptedPolicies,
      readPolicyIds: input.readPolicyIds ?? [],
      actor: input.actor,
      subjectPersonId,
      sessionId: input.sessionId,
      registrationId,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    return {
      mode: registration.status === "waitlisted" ? "waitlist" : "free",
      registrationId,
      registrationStatus: registration.status,
      teamClaimToken,
      pricing,
    };
  }
  if (
    !event.organization?.stripeAccountId ||
    !event.organization.stripeChargesEnabled
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Paid registration is unavailable until the operator finishes payment setup.",
    );
  }
  if (!isStripeConfigured()) {
    throw new CheckoutError(
      "STRIPE_REQUIRED",
      "Secure checkout is not configured.",
    );
  }

  const eligibility = event.ticketTypeId
    ? undefined
    : event.source === "pickup"
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
        referenceId: event.itemReferenceId ?? event.id,
        description: event.title,
        quantity: itemQuantity,
        unitAmountMinor: event.priceMinor,
        totalAmountMinor: event.priceMinor * itemQuantity,
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
    if (event.ticketTypeId) {
      await database.execute(sql`
        SELECT *
        FROM duna_hold_event_tickets(
          ${event.ticketTypeId}::uuid,
          ${orderId}::uuid,
          ${input.actor.personId}::uuid,
          ${itemQuantity}::integer
        )
      `);
    } else if (event.source === "pickup") {
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
          ${JSON.stringify(eligibility!.decision)}::jsonb,
          ${eligibility && "ruleVersion" in eligibility ? eligibility.ruleVersion : 0}::integer,
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
  const teamClaimToken =
    !event.ticketTypeId &&
    event.source === "session" &&
    expectedTeamSize > 1 &&
    hold?.result_status === "pending" &&
    hold.registration_id
      ? await saveTeamEntry({
          registrationId: hold.registration_id,
          payingPersonId: input.actor.personId,
          expectedTeamSize,
          paymentMode: input.teamPaymentMode ?? "self",
          roster: teamRoster,
          now: input.now,
        })
      : undefined;
  if (!event.ticketTypeId && hold?.result_status === "confirmed") {
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
  if (
    !event.ticketTypeId &&
    (hold?.result_status === "full" || hold?.result_status === "waitlisted")
  ) {
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    if (hold.registration_id) {
      await recordPolicyAcceptances({
        policies: acceptedPolicies,
        readPolicyIds: input.readPolicyIds ?? [],
        actor: input.actor,
        subjectPersonId,
        sessionId: input.sessionId,
        registrationId: hold.registration_id,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
    }
    return {
      mode: "waitlist",
      registrationId: hold.registration_id ?? undefined,
      registrationStatus: "waitlisted",
      pricing,
    };
  }
  if (
    !event.ticketTypeId &&
    hold?.result_status === "pending" &&
    hold.registration_id
  ) {
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
        teamClaimToken,
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
      teamClaimToken,
      pricing,
    });
    if (resumed) return resumed;
  }
  if (
    !event.ticketTypeId &&
    (!hold?.registration_id || hold.result_status !== "pending")
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "The event could not be held for checkout.",
    );
  }

  await recordPolicyAcceptances({
    policies: acceptedPolicies,
    readPolicyIds: input.readPolicyIds ?? [],
    actor: input.actor,
    subjectPersonId,
    sessionId: input.sessionId,
    orderId,
    registrationId: event.ticketTypeId
      ? undefined
      : (hold?.registration_id ?? undefined),
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });

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
      successUrl: teamClaimToken
        ? `${input.successUrl}&team=${encodeURIComponent(teamClaimToken)}`
        : input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: checkoutExpiresAt,
      idempotencyKey: input.idempotencyKey,
    });
    if (!checkout.url) {
      throw new CheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The payment processor did not return a checkout URL.",
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
      registrationId: hold?.registration_id ?? undefined,
      registrationStatus: event.ticketTypeId ? undefined : "pending",
      teamClaimToken,
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
      database
        .update(tickets)
        .set({ status: "void", updatedAt: input.now })
        .where(eq(tickets.orderId, orderId)),
    ]);
    throw error;
  }
}

export async function loadPendingTicketApprovals(input: {
  readonly actor: ApiActor;
}): Promise<readonly PendingTicketApproval[]> {
  if (!process.env.DATABASE_URL) return [];
  if (!input.actor.organizationId) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "An organization workspace is required.",
    );
  }
  const rows = await getDatabase()
    .select({
      orderId: orders.id,
      ticketTypeId: ticketTypes.id,
      sessionId: sessions.id,
      eventTitle: sessions.title,
      ticketName: ticketTypes.name,
      buyerName: people.displayName,
      quantity: sql<number>`count(${tickets.id})::integer`,
      totalMinor: orders.totalMinor,
      currency: orders.currency,
      purchasedAt: orders.createdAt,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(people, eq(orders.buyerPersonId, people.id))
    .where(
      and(
        eq(orders.organizationId, input.actor.organizationId),
        eq(orders.status, "paid"),
        eq(tickets.status, "held"),
        eq(ticketTypes.approvalRequired, true),
      ),
    )
    .groupBy(
      orders.id,
      ticketTypes.id,
      sessions.id,
      sessions.title,
      ticketTypes.name,
      people.displayName,
      orders.totalMinor,
      orders.currency,
      orders.createdAt,
    )
    .orderBy(orders.createdAt);
  return rows.map((row) => ({
    ...row,
    currency: currency(row.currency),
    purchasedAt: row.purchasedAt.toISOString(),
  }));
}

export async function approveTicketOrder(input: {
  readonly actor: ApiActor;
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<ApprovedTicketOrder> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Ticket approval requires the connected Duna database.",
    );
  }
  if (!input.actor.organizationId) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "An organization workspace is required.",
    );
  }
  const database = getDatabase();
  const pending = await database
    .select({
      ticketId: tickets.id,
      ticketName: ticketTypes.name,
      eventTitle: sessions.title,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(
      and(
        eq(tickets.orderId, input.orderId),
        eq(tickets.ticketTypeId, input.ticketTypeId),
        eq(tickets.status, "held"),
        eq(ticketTypes.approvalRequired, true),
        eq(orders.status, "paid"),
        eq(orders.organizationId, input.actor.organizationId),
      ),
    );
  if (pending.length === 0) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "This paid ticket request is not awaiting approval.",
    );
  }
  const issued = await database
    .update(tickets)
    .set({ status: "issued", updatedAt: input.now })
    .where(
      and(
        eq(tickets.orderId, input.orderId),
        eq(tickets.ticketTypeId, input.ticketTypeId),
        eq(tickets.status, "held"),
      ),
    )
    .returning({ id: tickets.id });
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    organizationId: input.actor.organizationId,
    actorType: "person",
    action: "ticket.order.approved",
    entityType: "order",
    entityId: input.orderId,
    afterHash: stableHash({
      orderId: input.orderId,
      ticketTypeId: input.ticketTypeId,
      issuedTicketIds: issued.map((ticket) => ticket.id),
    }),
    reason: `Approved ${issued.length} ${pending[0]!.ticketName} ticket(s) for ${pending[0]!.eventTitle}.`,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
  });
  return {
    orderId: input.orderId,
    ticketTypeId: input.ticketTypeId,
    quantity: issued.length,
    status: "issued",
  };
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
  const orderTickets = await database
    .select({
      status: tickets.status,
      approvalRequired: ticketTypes.approvalRequired,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .where(eq(tickets.orderId, order.id));
  const pendingApproval =
    order.status === "paid" &&
    orderTickets.some(
      (ticket) => ticket.approvalRequired && ticket.status === "held",
    );
  return {
    orderId: order.id,
    orderStatus: order.status,
    registrationStatus: pickupParticipant?.status,
    fulfillmentStatus:
      order.status === "paid" && orderTickets.length > 0
        ? pendingApproval
          ? "pending-approval"
          : "confirmed"
        : undefined,
    complete:
      order.status === "paid" &&
      (orderTickets.length > 0 ||
        pickupParticipant === undefined ||
        pickupParticipant.status === "confirmed" ||
        pickupParticipant.status === "checked-in"),
  };
}

async function loadTeamClaimRecord(claimToken: string) {
  return (
    await getDatabase()
      .select({
        id: teamEntries.id,
        payingPersonId: teamEntries.payingPersonId,
        expectedTeamSize: teamEntries.expectedTeamSize,
        paymentMode: teamEntries.paymentMode,
        roster: teamEntries.roster,
        status: teamEntries.status,
        claimExpiresAt: teamEntries.claimExpiresAt,
        eventTitle: sessions.title,
        eventSlug: sessions.slug,
        divisionName: divisions.name,
        captainName: people.displayName,
      })
      .from(teamEntries)
      .innerJoin(
        registrations,
        eq(teamEntries.registrationId, registrations.id),
      )
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .innerJoin(divisions, eq(registrations.divisionId, divisions.id))
      .innerJoin(people, eq(teamEntries.payingPersonId, people.id))
      .where(eq(teamEntries.claimToken, claimToken))
      .limit(1)
  )[0];
}

function teamEntryStatus(value: string): TeamClaimSummary["status"] {
  if (
    value === "assembling" ||
    value === "ready" ||
    value === "confirmed" ||
    value === "cancelled" ||
    value === "expired"
  ) {
    return value;
  }
  throw new CheckoutError(
    "CHECKOUT_UNAVAILABLE",
    "The team invitation has an invalid status.",
  );
}

async function buildTeamClaimSummary(
  claimToken: string,
  actorPersonId: string,
  now: Date,
): Promise<TeamClaimSummary> {
  const record = await loadTeamClaimRecord(claimToken);
  if (!record) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "This team invitation was not found.",
    );
  }
  const expired =
    record.claimExpiresAt <= now && record.status === "assembling";
  if (expired) {
    await getDatabase()
      .update(teamEntries)
      .set({ status: "expired", updatedAt: now })
      .where(eq(teamEntries.id, record.id));
  }
  const roster = record.roster;
  const alreadyClaimed =
    record.payingPersonId === actorPersonId ||
    roster.some(
      (member) =>
        member.personId === actorPersonId && member.status === "claimed",
    );
  const claimedPlayers =
    1 + roster.filter((member) => member.status === "claimed").length;
  return {
    eventTitle: record.eventTitle,
    eventSlug: record.eventSlug,
    divisionName: record.divisionName,
    captainName: record.captainName,
    expectedTeamSize: record.expectedTeamSize,
    claimedPlayers,
    paymentMode: record.paymentMode === "team" ? "team" : "self",
    status: expired ? "expired" : teamEntryStatus(record.status),
    expiresAt: record.claimExpiresAt.toISOString(),
    alreadyClaimed,
    paymentRequired:
      record.paymentMode !== "team" &&
      record.payingPersonId !== actorPersonId &&
      alreadyClaimed,
    roster: [
      { displayName: record.captainName, status: "captain" as const },
      ...roster.map((member) => ({
        displayName:
          member.displayName ??
          (member.status === "claimed" ? "Duna player" : "Invite pending"),
        status: member.status,
      })),
    ],
  };
}

export async function loadTeamClaim(input: {
  readonly actor: ApiActor;
  readonly claimToken: string;
  readonly now: Date;
}): Promise<TeamClaimSummary> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Team invitations require the connected Duna database.",
    );
  }
  return buildTeamClaimSummary(
    input.claimToken,
    input.actor.personId,
    input.now,
  );
}

export async function claimTeamEntry(input: {
  readonly actor: ApiActor;
  readonly claimToken: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<TeamClaimSummary> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Team invitations require the connected Duna database.",
    );
  }
  const database = getDatabase();
  const record = await loadTeamClaimRecord(input.claimToken);
  if (!record) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "This team invitation was not found.",
    );
  }
  if (
    record.status === "cancelled" ||
    record.status === "expired" ||
    record.claimExpiresAt <= input.now
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "This team invitation is no longer active.",
    );
  }
  if (record.payingPersonId !== input.actor.personId) {
    const person = await database.query.people.findFirst({
      where: eq(people.id, input.actor.personId),
    });
    if (!person) {
      throw new CheckoutError(
        "EVENT_NOT_FOUND",
        "Your Duna player profile was not found.",
      );
    }
    const normalizedEmail = person.email?.trim().toLowerCase();
    const normalizedPhone = person.phoneE164?.replace(/\D/g, "");
    const roster = record.roster.map((member) => ({ ...member }));
    let slotIndex = roster.findIndex(
      (member) => member.personId === input.actor.personId,
    );
    if (slotIndex < 0) {
      slotIndex = roster.findIndex((member) => {
        const target = member.inviteTarget?.trim().toLowerCase();
        const targetPhone = target?.replace(/\D/g, "");
        return (
          member.status !== "claimed" &&
          ((normalizedEmail && target === normalizedEmail) ||
            (normalizedPhone &&
              normalizedPhone.length >= 7 &&
              targetPhone === normalizedPhone))
        );
      });
    }
    if (slotIndex < 0) {
      slotIndex = roster.findIndex((member) => member.status !== "claimed");
    }
    if (slotIndex < 0) {
      throw new CheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "Every place on this team has already been claimed.",
      );
    }
    roster[slotIndex] = {
      ...roster[slotIndex]!,
      personId: input.actor.personId,
      displayName: input.actor.displayName,
      status: "claimed",
    };
    const claimedPlayers =
      1 + roster.filter((member) => member.status === "claimed").length;
    const ready = claimedPlayers >= record.expectedTeamSize;
    await database.batch([
      database
        .update(teamEntries)
        .set({
          partnerPersonId:
            record.expectedTeamSize === 2
              ? input.actor.personId
              : (record.roster.find((member) => member.personId)?.personId ??
                input.actor.personId),
          roster,
          status: ready ? "ready" : "assembling",
          claimedAt: ready ? input.now : undefined,
          rosterLockedAt: ready ? input.now : undefined,
          updatedAt: input.now,
        })
        .where(eq(teamEntries.id, record.id)),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "team-entry.claimed",
        entityType: "team-entry",
        entityId: record.id,
        reason: ready
          ? "The final invited player claimed the team entry."
          : "An invited player claimed a team entry slot.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
      }),
    ]);
  }
  return buildTeamClaimSummary(
    input.claimToken,
    input.actor.personId,
    input.now,
  );
}
