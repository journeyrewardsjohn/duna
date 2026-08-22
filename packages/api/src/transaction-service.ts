import {
  bookingPolicyAcceptances,
  catalogFulfillments,
  eventPolicyAcceptances,
  getDatabase,
  membershipPolicyAcceptances,
  membershipInvoiceTransactions,
  operatorPaymentCollections,
  operatorPaymentEvents,
  orderItems,
  orders,
  organizations,
  payments,
  paymentFundSchedules,
  payouts,
  people,
  promoCodeRedemptions,
  registrations,
  refundRecords,
  sessions,
  stripeTransactionLinks,
  courtBookings,
  tickets,
  ticketTypes,
} from "@duna/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ApiActor } from "./context";

export class TransactionServiceError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export interface TransactionSummary {
  readonly id: string;
  readonly occurredAt: string;
  readonly status: string;
  readonly buyerPersonId?: string;
  readonly buyerName: string;
  readonly description: string;
  readonly source: string;
  readonly currency: "USD" | "CAD" | "AUD" | "BRL" | "EUR";
  readonly grossMinor: number;
  readonly processingFeeMinor?: number;
  readonly organizationFeeMinor?: number;
  readonly taxMinor?: number;
  readonly discountMinor?: number;
  readonly refundMinor?: number;
  readonly disputedMinor?: number;
  readonly netMinor?: number;
  readonly amountStatus: "complete" | "partial";
}

function org(actor: ApiActor): string {
  if (!actor.organizationId)
    throw new TransactionServiceError(
      "FORBIDDEN",
      "An organization context is required.",
    );
  return actor.organizationId;
}

const demoTransaction: TransactionSummary = {
  id: "00000000-0000-4000-8000-000000000093",
  occurredAt: "2026-08-21T12:00:00.000Z",
  status: "succeeded",
  buyerPersonId: "00000000-0000-4000-8000-000000000091",
  buyerName: "Maya Chen",
  description: "Camp registration",
  source: "card-present",
  currency: "USD",
  grossMinor: 6500,
  processingFeeMinor: 218,
  organizationFeeMinor: 0,
  taxMinor: 0,
  discountMinor: 0,
  refundMinor: 0,
  disputedMinor: 0,
  netMinor: 6282,
  amountStatus: "complete",
};

type Source = "collection" | "order" | "membership-invoice" | "payout";

function parseSourceId(
  id?: string,
): { source: Source; id: string } | undefined {
  if (!id) return undefined;
  const match =
    /^(collection|order|membership-invoice|payout):([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(
      id,
    );
  return match
    ? { source: match[1]!.toLowerCase() as Source, id: match[2]! }
    : undefined;
}

async function queryTransactions(
  actor: ApiActor,
  limit: number,
  exactId?: string,
): Promise<readonly TransactionSummary[]> {
  const organizationId = org(actor);
  const db = getDatabase();
  const max = Math.min(Math.max(limit, 1), 500);
  const exact = parseSourceId(exactId);
  if (exactId && !exact) return [];

  const [collectionRows, orderRows, invoiceRows, payoutRows] =
    await Promise.all([
      !exact || exact.source === "collection"
        ? db
            .select({
              collection: operatorPaymentCollections,
              person: people,
              order: orders,
              funds: paymentFundSchedules,
              discount: promoCodeRedemptions,
            })
            .from(operatorPaymentCollections)
            .innerJoin(
              people,
              eq(operatorPaymentCollections.payerPersonId, people.id),
            )
            .innerJoin(
              orders,
              eq(operatorPaymentCollections.orderId, orders.id),
            )
            .leftJoin(
              paymentFundSchedules,
              eq(paymentFundSchedules.orderId, orders.id),
            )
            .leftJoin(
              promoCodeRedemptions,
              and(
                eq(promoCodeRedemptions.orderId, orders.id),
                inArray(promoCodeRedemptions.status, ["redeemed", "refunded"]),
              ),
            )
            .where(
              and(
                eq(operatorPaymentCollections.organizationId, organizationId),
                ...(exact ? [eq(operatorPaymentCollections.id, exact.id)] : []),
              ),
            )
            .orderBy(desc(operatorPaymentCollections.createdAt))
            .limit(max)
        : Promise.resolve([]),
      !exact || exact.source === "order"
        ? db
            .select({
              order: orders,
              person: people,
              funds: paymentFundSchedules,
              discount: promoCodeRedemptions,
            })
            .from(orders)
            .innerJoin(people, eq(orders.buyerPersonId, people.id))
            .leftJoin(
              operatorPaymentCollections,
              eq(operatorPaymentCollections.orderId, orders.id),
            )
            .leftJoin(
              paymentFundSchedules,
              eq(paymentFundSchedules.orderId, orders.id),
            )
            .leftJoin(
              promoCodeRedemptions,
              and(
                eq(promoCodeRedemptions.orderId, orders.id),
                inArray(promoCodeRedemptions.status, ["redeemed", "refunded"]),
              ),
            )
            .where(
              and(
                eq(orders.organizationId, organizationId),
                isNull(operatorPaymentCollections.id),
                ...(exact ? [eq(orders.id, exact.id)] : []),
              ),
            )
            .orderBy(desc(orders.createdAt))
            .limit(max)
        : Promise.resolve([]),
      !exact || exact.source === "membership-invoice"
        ? db
            .select({ invoice: membershipInvoiceTransactions, person: people })
            .from(membershipInvoiceTransactions)
            .innerJoin(
              people,
              eq(membershipInvoiceTransactions.personId, people.id),
            )
            .where(
              and(
                eq(
                  membershipInvoiceTransactions.organizationId,
                  organizationId,
                ),
                ...(exact
                  ? [eq(membershipInvoiceTransactions.id, exact.id)]
                  : []),
              ),
            )
            .orderBy(desc(membershipInvoiceTransactions.createdAt))
            .limit(max)
        : Promise.resolve([]),
      !exact || exact.source === "payout"
        ? db
            .select()
            .from(payouts)
            .where(
              and(
                eq(payouts.organizationId, organizationId),
                ...(exact ? [eq(payouts.id, exact.id)] : []),
              ),
            )
            .orderBy(desc(payouts.createdAt))
            .limit(max)
        : Promise.resolve([]),
    ]);

  const orderIds = orderRows.map(({ order }) => order.id);
  const [paymentRows, refundRows, itemRows] = orderIds.length
    ? await Promise.all([
        db
          .select()
          .from(payments)
          .where(inArray(payments.orderId, orderIds))
          .orderBy(desc(payments.createdAt)),
        db
          .select()
          .from(refundRecords)
          .where(
            and(
              eq(refundRecords.organizationId, organizationId),
              inArray(refundRecords.orderId, orderIds),
              eq(refundRecords.status, "succeeded"),
            ),
          ),
        db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds))
          .orderBy(orderItems.createdAt),
      ])
    : [[], [], []];
  const latestPayment = new Map<string, (typeof paymentRows)[number]>();
  for (const payment of paymentRows)
    if (!latestPayment.has(payment.orderId))
      latestPayment.set(payment.orderId, payment);
  const refunds = new Map<string, number>();
  for (const refund of refundRows)
    refunds.set(
      refund.orderId,
      (refunds.get(refund.orderId) ?? 0) + refund.amountMinor,
    );
  const descriptions = new Map<string, string>();
  for (const item of itemRows) {
    if (!descriptions.has(item.orderId)) {
      descriptions.set(item.orderId, item.description);
    }
  }

  const collections: TransactionSummary[] = collectionRows.map(
    ({ collection, person, order, funds, discount }) => ({
      id: `collection:${collection.id}`,
      occurredAt: collection.createdAt.toISOString(),
      status: collection.status,
      buyerPersonId: person.id,
      buyerName: person.displayName,
      description: collection.referenceLabel,
      source: collection.tender,
      currency: collection.currency as TransactionSummary["currency"],
      grossMinor: funds?.grossMinor ?? collection.amountMinor,
      processingFeeMinor:
        funds?.processingFeeMinor ?? collection.processingFeeMinor,
      organizationFeeMinor:
        funds?.organizationFeeMinor ?? collection.applicationFeeMinor,
      taxMinor: funds?.taxMinor ?? order.taxTotalMinor,
      discountMinor: discount?.discountMinor ?? 0,
      ...(funds
        ? {
            refundMinor: funds.refundedMinor,
            disputedMinor: funds.disputedMinor,
            netMinor: funds.netMinor,
            amountStatus: "complete" as const,
          }
        : { amountStatus: "partial" as const }),
    }),
  );
  const orderTransactions: TransactionSummary[] = orderRows.map(
    ({ order, person, funds, discount }) => {
      const payment = latestPayment.get(order.id);
      const refundedMinor = refunds.get(order.id) ?? 0;
      return {
        id: `order:${order.id}`,
        occurredAt: (payment?.createdAt ?? order.createdAt).toISOString(),
        status: payment?.status ?? order.status,
        buyerPersonId: person.id,
        buyerName: person.displayName,
        description: descriptions.get(order.id) ?? "Order",
        source: payment?.method ?? "order",
        currency: order.currency as TransactionSummary["currency"],
        grossMinor: funds?.grossMinor ?? order.totalMinor,
        taxMinor: funds?.taxMinor ?? order.taxTotalMinor,
        discountMinor: discount?.discountMinor ?? 0,
        refundMinor: funds?.refundedMinor ?? refundedMinor,
        ...(funds
          ? {
              processingFeeMinor: funds.processingFeeMinor,
              organizationFeeMinor: funds.organizationFeeMinor,
              disputedMinor: funds.disputedMinor,
              netMinor: funds.netMinor,
              amountStatus: "complete" as const,
            }
          : { amountStatus: "partial" as const }),
      };
    },
  );
  const invoices: TransactionSummary[] = invoiceRows.map(
    ({ invoice, person }) => ({
      id: `membership-invoice:${invoice.id}`,
      occurredAt: (invoice.paidAt ?? invoice.createdAt).toISOString(),
      status: invoice.status,
      buyerPersonId: person.id,
      buyerName: person.displayName,
      description: "Membership invoice",
      source: "stripe-billing",
      currency: invoice.currency as TransactionSummary["currency"],
      grossMinor: invoice.amountPaidMinor,
      taxMinor: invoice.taxAmountMinor,
      refundMinor: invoice.refundedMinor,
      amountStatus: "partial",
    }),
  );
  const payoutTransactions: TransactionSummary[] = payoutRows.map((payout) => ({
    id: `payout:${payout.id}`,
    occurredAt: payout.createdAt.toISOString(),
    status: payout.status,
    buyerName: "Organization payout",
    description: "Payout",
    source: "stripe-payout",
    currency: payout.currency as TransactionSummary["currency"],
    grossMinor: payout.amountMinor,
    netMinor: payout.amountMinor,
    amountStatus: "partial",
  }));
  return [
    ...collections,
    ...orderTransactions,
    ...invoices,
    ...payoutTransactions,
  ]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, max);
}

export async function listTransactions(
  actor: ApiActor,
  limit = 500,
): Promise<readonly TransactionSummary[]> {
  if (actor.isDemo) return [demoTransaction];
  if (!process.env.DATABASE_URL)
    throw new TransactionServiceError(
      "FORBIDDEN",
      "Transactions require the connected Duna database.",
    );
  return queryTransactions(actor, limit);
}

function stripeDashboardUrl(input: {
  readonly accountId?: string;
  readonly livemode: boolean;
  readonly page: string;
}) {
  const mode = input.livemode ? "" : "test/";
  const account = input.accountId
    ? `${encodeURIComponent(input.accountId)}/`
    : "";
  return `https://dashboard.stripe.com/${mode}${account}${input.page}`;
}

async function getOrderDetail(actor: ApiActor, orderId: string) {
  const organizationId = org(actor);
  const db = getDatabase();
  const [orderRow] = await db
    .select({ order: orders, buyer: people, organization: organizations })
    .from(orders)
    .innerJoin(people, eq(orders.buyerPersonId, people.id))
    .innerJoin(organizations, eq(orders.organizationId, organizations.id))
    .where(
      and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)),
    )
    .limit(1);
  if (!orderRow) return undefined;

  const [
    itemRows,
    paymentRows,
    refundRows,
    fundRows,
    processorRows,
    eventRows,
    registrationRows,
    ticketRows,
    bookingRows,
    membershipRows,
    fulfillmentRows,
  ] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.createdAt),
    db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(payments.createdAt),
    db
      .select()
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.organizationId, organizationId),
          eq(refundRecords.orderId, orderId),
        ),
      )
      .orderBy(refundRecords.createdAt),
    db
      .select()
      .from(paymentFundSchedules)
      .where(
        and(
          eq(paymentFundSchedules.organizationId, organizationId),
          eq(paymentFundSchedules.orderId, orderId),
        ),
      )
      .orderBy(paymentFundSchedules.createdAt),
    db
      .select()
      .from(stripeTransactionLinks)
      .where(
        and(
          eq(stripeTransactionLinks.organizationId, organizationId),
          eq(stripeTransactionLinks.orderId, orderId),
        ),
      )
      .orderBy(stripeTransactionLinks.createdAt),
    db
      .select({ acceptance: eventPolicyAcceptances, session: sessions })
      .from(eventPolicyAcceptances)
      .innerJoin(sessions, eq(eventPolicyAcceptances.sessionId, sessions.id))
      .where(eq(eventPolicyAcceptances.orderId, orderId))
      .orderBy(eventPolicyAcceptances.acceptedAt),
    db
      .select({ registration: registrations, session: sessions })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .where(eq(registrations.orderId, orderId))
      .orderBy(registrations.createdAt),
    db
      .select({ ticket: tickets, ticketType: ticketTypes, session: sessions })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
      .where(eq(tickets.orderId, orderId))
      .orderBy(tickets.createdAt),
    db
      .select()
      .from(courtBookings)
      .where(
        and(
          eq(courtBookings.organizationId, organizationId),
          eq(courtBookings.orderId, orderId),
        ),
      )
      .orderBy(courtBookings.createdAt),
    db
      .select()
      .from(membershipPolicyAcceptances)
      .where(
        and(
          eq(membershipPolicyAcceptances.organizationId, organizationId),
          eq(membershipPolicyAcceptances.orderId, orderId),
        ),
      ),
    db
      .select()
      .from(catalogFulfillments)
      .where(
        and(
          eq(catalogFulfillments.organizationId, organizationId),
          eq(catalogFulfillments.orderId, orderId),
        ),
      ),
  ]);

  const bookingAcceptances = bookingRows.length
    ? await db
        .select()
        .from(bookingPolicyAcceptances)
        .where(
          inArray(
            bookingPolicyAcceptances.bookingId,
            bookingRows.map((booking) => booking.id),
          ),
        )
        .orderBy(bookingPolicyAcceptances.acceptedAt)
    : [];
  const purchasedForId =
    eventRows[0]?.acceptance.subjectPersonId ??
    registrationRows[0]?.registration.personId ??
    ticketRows[0]?.ticket.ownerPersonId ??
    bookingAcceptances[0]?.subjectPersonId ??
    membershipRows[0]?.personId ??
    fulfillmentRows[0]?.personId;
  const [purchasedFor] =
    purchasedForId && purchasedForId !== orderRow.buyer.id
      ? await db
          .select()
          .from(people)
          .where(eq(people.id, purchasedForId))
          .limit(1)
      : [];

  const event = eventRows[0];
  const eventSession =
    event?.session ?? registrationRows[0]?.session ?? ticketRows[0]?.session;
  const booking = bookingRows[0];
  const fund = fundRows.at(-1);
  const membership = membershipRows[0];
  const fulfillmentByItem = new Map(
    fulfillmentRows.map((fulfillment) => [
      fulfillment.orderItemId,
      fulfillment,
    ]),
  );
  const items = itemRows.map((item) => {
    const fulfillment = fulfillmentByItem.get(item.id);
    const href = fulfillment
      ? `/products/${fulfillment.catalogItemId}`
      : booking
        ? `/events/court-bookings/${booking.id}`
        : eventSession
          ? `/events/${eventSession.id}`
          : membership
            ? `/products/${membership.catalogItemId}`
            : fund?.sessionId
              ? `/events/${fund.sessionId}`
              : undefined;
    return {
      id: item.id,
      kind: item.kind,
      description: item.description,
      quantity: item.quantity,
      unitAmountMinor: item.unitAmountMinor,
      totalAmountMinor: item.totalAmountMinor,
      href,
    };
  });

  const processor = processorRows.at(-1);
  const payment = paymentRows.at(-1);
  const livemode = processor?.livemode ?? true;
  const connectedAccountId = orderRow.organization.stripeAccountId ?? undefined;
  const connectedPaymentId =
    processor?.stripeDestinationPaymentId ??
    processor?.stripePaymentIntentId ??
    payment?.stripeDestinationPaymentId ??
    payment?.stripePaymentIntentId ??
    orderRow.order.stripePaymentIntentId ??
    undefined;
  const stripePaymentIntentId =
    processor?.stripePaymentIntentId ??
    payment?.stripePaymentIntentId ??
    orderRow.order.stripePaymentIntentId ??
    undefined;
  const ipAddress =
    orderRow.order.checkoutIpAddress ??
    eventRows.find((row) => row.acceptance.ipAddress)?.acceptance.ipAddress ??
    bookingAcceptances.find((row) => row.ipAddress)?.ipAddress ??
    membershipRows.find((row) => row.ipAddress)?.ipAddress ??
    undefined;
  const acceptedAt =
    eventRows[0]?.acceptance.acceptedAt ??
    bookingAcceptances[0]?.acceptedAt ??
    membershipRows[0]?.acceptedAt;

  const timeline = [
    {
      at: orderRow.order.createdAt.toISOString(),
      kind: "order" as const,
      status: orderRow.order.status,
      label: "Order created",
      detail: items[0]?.description ?? "Order recorded in Duna",
    },
    ...eventRows.map(({ acceptance, session }) => ({
      at: acceptance.acceptedAt.toISOString(),
      kind: "policy" as const,
      status: "accepted",
      label:
        acceptance.policyKind === "waiver"
          ? "Waiver accepted"
          : "Policy accepted",
      detail: `${acceptance.policyTitle} · ${session.title}`,
    })),
    ...registrationRows.map(({ registration, session }) => ({
      at: registration.createdAt.toISOString(),
      kind: "order" as const,
      status: registration.status,
      label: "Registration recorded",
      detail: session.title,
    })),
    ...ticketRows.map(({ ticket, ticketType, session }) => ({
      at: ticket.createdAt.toISOString(),
      kind: "order" as const,
      status: ticket.status,
      label: "Ticket issued",
      detail: `${ticketType.name} · ${session.title}`,
    })),
    ...bookingAcceptances.map((acceptance) => ({
      at: acceptance.acceptedAt.toISOString(),
      kind: "policy" as const,
      status: "accepted",
      label: "Booking policy accepted",
      detail: acceptance.policyTitle,
    })),
    ...membershipRows.map((acceptance) => ({
      at: acceptance.acceptedAt.toISOString(),
      kind: "policy" as const,
      status: "accepted",
      label: "Membership terms accepted",
      detail: `Policy version ${acceptance.policyVersion}`,
    })),
    ...paymentRows.map((paymentRow) => ({
      at: paymentRow.createdAt.toISOString(),
      kind: "payment" as const,
      status: paymentRow.status,
      label: `Payment ${paymentRow.status}`,
      detail: `${paymentRow.method} · ${paymentRow.stripePaymentIntentId ?? "Duna payment record"}`,
    })),
    ...refundRows.map((refund) => ({
      at: refund.createdAt.toISOString(),
      kind: "refund" as const,
      status: refund.status,
      label: `Refund ${refund.status}`,
      detail: refund.reason,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    orderId: orderRow.order.id,
    people: [
      {
        personId: orderRow.buyer.id,
        name: orderRow.buyer.displayName,
        email: orderRow.buyer.email ?? undefined,
        role: purchasedFor ? "Parent or purchaser" : "Purchaser",
        profileHref: `/members/${orderRow.buyer.id}`,
      },
      ...(purchasedFor
        ? [
            {
              personId: purchasedFor.id,
              name: purchasedFor.displayName,
              email: purchasedFor.email ?? undefined,
              role: "Purchased for",
              profileHref: `/members/${purchasedFor.id}`,
            },
          ]
        : []),
    ],
    items,
    processor: {
      connectedAccountId,
      paymentId: payment?.id,
      paymentStatus: payment?.status,
      paymentMethod: payment?.method,
      stripePaymentIntentId,
      stripeChargeId:
        processor?.stripeChargeId ?? payment?.stripeChargeId ?? undefined,
      stripeTransferId:
        processor?.stripeTransferId ?? payment?.stripeTransferId ?? undefined,
      stripeBalanceTransactionId:
        processor?.stripeBalanceTransactionId ??
        payment?.stripeBalanceTransactionId ??
        undefined,
      stripeCheckoutSessionId:
        orderRow.order.stripeCheckoutSessionId ?? undefined,
      livemode,
      dashboardUrl: connectedPaymentId
        ? stripeDashboardUrl({
            accountId: connectedAccountId,
            livemode,
            page: `payments/${encodeURIComponent(connectedPaymentId)}`,
          })
        : undefined,
      accountUrl: connectedAccountId
        ? stripeDashboardUrl({
            accountId: connectedAccountId,
            livemode,
            page: "activity",
          })
        : undefined,
    },
    evidence: {
      ipAddress,
      userAgent: orderRow.order.checkoutUserAgent ?? undefined,
      surface: orderRow.order.checkoutSurface ?? undefined,
      capturedAt: (acceptedAt ?? orderRow.order.createdAt).toISOString(),
    },
    timeline,
  };
}

export async function getTransaction(actor: ApiActor, id: string) {
  if (actor.isDemo) {
    if (id !== demoTransaction.id)
      throw new TransactionServiceError(
        "NOT_FOUND",
        "Transaction not found for this organization.",
      );
    return {
      ...demoTransaction,
      orderId: "00000000-0000-4000-8000-000000000093",
      people: [
        {
          personId: demoTransaction.buyerPersonId!,
          name: demoTransaction.buyerName,
          role: "Purchaser",
          profileHref: `/members/${demoTransaction.buyerPersonId}`,
        },
      ],
      items: [
        {
          id: "00000000-0000-4000-8000-000000000094",
          kind: "registration",
          description: demoTransaction.description,
          quantity: 1,
          unitAmountMinor: demoTransaction.grossMinor,
          totalAmountMinor: demoTransaction.grossMinor,
          href: "/events/00000000-0000-4000-8000-000000000095",
        },
      ],
      processor: {
        paymentStatus: "succeeded",
        paymentMethod: "card-present",
        livemode: false,
      },
      evidence: {
        ipAddress: "203.0.113.42",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        surface: "operator",
        capturedAt: demoTransaction.occurredAt,
      },
      timeline: [
        {
          at: demoTransaction.occurredAt,
          kind: "payment" as const,
          status: "succeeded",
          label: "Payment recorded",
          detail: "Demo transaction timeline.",
        },
      ],
    };
  }
  if (!process.env.DATABASE_URL)
    throw new TransactionServiceError(
      "FORBIDDEN",
      "Transactions require the connected Duna database.",
    );
  const [summary] = await queryTransactions(actor, 1, id);
  if (!summary)
    throw new TransactionServiceError(
      "NOT_FOUND",
      "Transaction not found for this organization.",
    );
  const exact = parseSourceId(id)!;
  const db = getDatabase();
  if (exact.source === "collection") {
    const [collectionRows, events] = await Promise.all([
      db
        .select({ orderId: operatorPaymentCollections.orderId })
        .from(operatorPaymentCollections)
        .where(
          and(
            eq(operatorPaymentCollections.id, exact.id),
            eq(operatorPaymentCollections.organizationId, org(actor)),
          ),
        )
        .limit(1),
      db
        .select()
        .from(operatorPaymentEvents)
        .where(
          and(
            eq(operatorPaymentEvents.collectionId, exact.id),
            eq(operatorPaymentEvents.organizationId, org(actor)),
          ),
        )
        .orderBy(operatorPaymentEvents.createdAt),
    ]);
    const detail = collectionRows[0]
      ? await getOrderDetail(actor, collectionRows[0].orderId)
      : undefined;
    if (!detail)
      throw new TransactionServiceError(
        "NOT_FOUND",
        "Transaction order not found for this organization.",
      );
    return {
      ...summary,
      ...detail,
      timeline: [
        ...detail.timeline,
        {
          at: summary.occurredAt,
          kind: "collection" as const,
          status: summary.status,
          label: "Collection created",
          detail: summary.description,
        },
        ...events.map((event) => ({
          at: event.createdAt.toISOString(),
          kind: "collection" as const,
          status: event.status,
          label: event.eventType,
          detail: event.message ?? event.status,
        })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    };
  }
  if (exact.source === "order") {
    const detail = await getOrderDetail(actor, exact.id);
    if (!detail)
      throw new TransactionServiceError(
        "NOT_FOUND",
        "Transaction not found for this organization.",
      );
    return { ...summary, ...detail };
  }
  return {
    ...summary,
    people: summary.buyerPersonId
      ? [
          {
            personId: summary.buyerPersonId,
            name: summary.buyerName,
            role: "Member",
            profileHref: `/members/${summary.buyerPersonId}`,
          },
        ]
      : [],
    items: [],
    processor: { livemode: true },
    evidence: { capturedAt: summary.occurredAt },
    timeline: [
      {
        at: summary.occurredAt,
        kind:
          exact.source === "payout"
            ? ("payout" as const)
            : ("payment" as const),
        status: summary.status,
        label:
          exact.source === "membership-invoice"
            ? "Membership invoice recorded"
            : "Payout recorded",
        detail: summary.description,
      },
    ],
  };
}
