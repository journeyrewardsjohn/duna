import {
  getDatabase,
  membershipInvoiceTransactions,
  operatorPaymentCollections,
  operatorPaymentEvents,
  orders,
  payments,
  paymentFundSchedules,
  payouts,
  people,
  promoCodeRedemptions,
  refundRecords,
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
  const max = Math.min(Math.max(limit, 1), 100);
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
  const [paymentRows, refundRows] = orderIds.length
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
      ])
    : [[], []];
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

  const collections: TransactionSummary[] = collectionRows.map(
    ({ collection, person, order, funds, discount }) => ({
      id: `collection:${collection.id}`,
      occurredAt: collection.createdAt.toISOString(),
      status: collection.status,
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
        buyerName: person.displayName,
        description: "Order",
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
  limit = 100,
): Promise<readonly TransactionSummary[]> {
  if (actor.isDemo) return [demoTransaction];
  if (!process.env.DATABASE_URL)
    throw new TransactionServiceError(
      "FORBIDDEN",
      "Transactions require the connected Duna database.",
    );
  return queryTransactions(actor, limit);
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
      timeline: [
        {
          at: demoTransaction.occurredAt,
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
    const events = await db
      .select()
      .from(operatorPaymentEvents)
      .where(
        and(
          eq(operatorPaymentEvents.collectionId, exact.id),
          eq(operatorPaymentEvents.organizationId, org(actor)),
        ),
      )
      .orderBy(operatorPaymentEvents.createdAt);
    return {
      ...summary,
      timeline: [
        {
          at: summary.occurredAt,
          label: "Collection created",
          detail: summary.description,
        },
        ...events.map((event) => ({
          at: event.createdAt.toISOString(),
          label: event.eventType,
          detail: event.message ?? event.status,
        })),
      ],
    };
  }
  if (exact.source === "order") {
    const [orderRows, paymentRows, refunds] = await Promise.all([
      db
        .select({ createdAt: orders.createdAt })
        .from(orders)
        .where(
          and(eq(orders.id, exact.id), eq(orders.organizationId, org(actor))),
        )
        .limit(1),
      db
        .select()
        .from(payments)
        .where(eq(payments.orderId, exact.id))
        .orderBy(payments.createdAt),
      db
        .select()
        .from(refundRecords)
        .where(
          and(
            eq(refundRecords.organizationId, org(actor)),
            eq(refundRecords.orderId, exact.id),
          ),
        )
        .orderBy(refundRecords.createdAt),
    ]);
    return {
      ...summary,
      timeline: [
        {
          at: orderRows[0]!.createdAt.toISOString(),
          label: "Order recorded",
          detail: summary.description,
        },
        ...paymentRows.map((payment) => ({
          at: payment.createdAt.toISOString(),
          label: `Payment ${payment.status}`,
          detail: `${payment.method} payment`,
        })),
        ...refunds.map((refund) => ({
          at: refund.createdAt.toISOString(),
          label: `Refund ${refund.status}`,
          detail: refund.reason,
        })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    };
  }
  return {
    ...summary,
    timeline: [
      {
        at: summary.occurredAt,
        label:
          exact.source === "membership-invoice"
            ? "Membership invoice recorded"
            : "Payout recorded",
        detail: summary.description,
      },
    ],
  };
}
