/**
 * Read model for `operator.pay` obligation, tranche and hold procedures.
 * Organisation-scoped: every query filters by the caller's organisation, so
 * an id from another organisation is simply not found. Reads use the
 * primary database: money views must observe the latest write.
 */
import {
  getDatabase,
  orders,
  payDeliveryEvents,
  payHolds,
  payObligationRefunds,
  payObligations,
  payReleaseTranches,
  people,
} from "@duna/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type {
  payHoldSchema,
  payObligationDetailSchema,
  payObligationSummarySchema,
  payObligationsInputSchema,
} from "../../contracts/pay";
import { currencySchema } from "../../contracts";
import { CLOSED_OBLIGATION_STATUSES } from "./release-job";

type Summary = z.infer<typeof payObligationSummarySchema>;
type Detail = z.infer<typeof payObligationDetailSchema>;
type Hold = z.infer<typeof payHoldSchema>;
type Obligation = typeof payObligations.$inferSelect;

function money(amountMinor: number, currency: string) {
  return {
    amountMinor: Math.max(0, amountMinor),
    currency: currencySchema.catch("USD").parse(currency.toUpperCase()),
  };
}

function iso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function initials(name: string): string | undefined {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return letters || undefined;
}

function summary(
  obligation: Obligation,
  buyer: { personId: string; displayName: string } | undefined,
  nextReleaseAt: Date | undefined,
): Summary {
  const snapshot = obligation.refundPolicySnapshot as { title?: unknown };
  const title =
    typeof snapshot.title === "string" && snapshot.title.trim()
      ? snapshot.title.trim()
      : obligation.productKind;
  const amount = (value: number) => money(value, obligation.currency);
  return {
    id: obligation.id,
    orderId: obligation.orderId,
    title,
    buyer: buyer
      ? {
          personId: buyer.personId,
          displayName: buyer.displayName,
          initials: initials(buyer.displayName),
        }
      : undefined,
    productKind: obligation.productKind,
    deliveryRule: obligation.deliveryRule as Summary["deliveryRule"],
    status: obligation.status as Summary["status"],
    gross: amount(obligation.grossMinor),
    applicationFee: amount(obligation.applicationFeeMinor),
    tax: amount(obligation.taxMinor),
    proceeds: amount(obligation.proceedsMinor),
    released: amount(obligation.releasedMinor),
    refunded: amount(obligation.refundedMinor),
    disputed: amount(obligation.disputedMinor),
    reserved: amount(obligation.reservedMinor),
    settledAt: iso(obligation.settledAt),
    deliveryStartsAt: iso(obligation.deliveryStartsAt),
    deliveryEndsAt: iso(obligation.deliveryEndsAt),
    refundWindowEndsAt: iso(obligation.refundWindowEndsAt),
    shipByAt: iso(obligation.shipByAt),
    buyerCancelEligibleAt: iso(obligation.buyerCancelEligibleAt),
    nextReleaseAt: iso(nextReleaseAt),
  };
}

async function buyers(orderIds: readonly string[]) {
  if (!orderIds.length)
    return new Map<string, { personId: string; displayName: string }>();
  const rows = await getDatabase()
    .select({
      orderId: orders.id,
      personId: people.id,
      displayName: people.displayName,
    })
    .from(orders)
    .innerJoin(people, eq(orders.buyerPersonId, people.id))
    .where(inArray(orders.id, [...orderIds]));
  return new Map(
    rows
      .filter((row) => row.displayName)
      .map((row) => [
        row.orderId,
        { personId: row.personId, displayName: row.displayName! },
      ]),
  );
}

async function nextReleases(obligationIds: readonly string[]) {
  if (!obligationIds.length) return new Map<string, Date>();
  const rows = await getDatabase()
    .select({
      obligationId: payReleaseTranches.obligationId,
      releasableAt: payReleaseTranches.releasableAt,
    })
    .from(payReleaseTranches)
    .where(
      and(
        inArray(payReleaseTranches.obligationId, [...obligationIds]),
        inArray(payReleaseTranches.status, [
          "scheduled",
          "delivered",
          "releasable",
          "held",
        ]),
      ),
    );
  const next = new Map<string, Date>();
  for (const row of rows) {
    if (!row.releasableAt) continue;
    const current = next.get(row.obligationId);
    if (!current || row.releasableAt < current)
      next.set(row.obligationId, row.releasableAt);
  }
  return next;
}

/** Cursor: "<createdAt ISO>|<id>" of the last item (newest first). */
function cursorCondition(cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const [at, id] = cursor.split("|");
  const createdAt = at ? new Date(at) : undefined;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return undefined;
  return or(
    lt(payObligations.createdAt, createdAt),
    and(eq(payObligations.createdAt, createdAt), lt(payObligations.id, id)),
  );
}

export async function listPayObligations(
  organizationId: string,
  input: z.infer<typeof payObligationsInputSchema>,
): Promise<{ items: Summary[]; nextCursor?: string }> {
  const limit = input.limit ?? 25;
  const rows = await getDatabase()
    .select()
    .from(payObligations)
    .where(
      and(
        eq(payObligations.organizationId, organizationId),
        input.status ? eq(payObligations.status, input.status) : undefined,
        input.deliveryRule
          ? eq(payObligations.deliveryRule, input.deliveryRule)
          : undefined,
        cursorCondition(input.cursor),
      ),
    )
    .orderBy(desc(payObligations.createdAt), desc(payObligations.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const [buyerMap, nextMap] = await Promise.all([
    buyers(page.map((row) => row.orderId)),
    nextReleases(
      page
        .filter(
          (row) =>
            !(CLOSED_OBLIGATION_STATUSES as readonly string[]).includes(
              row.status,
            ),
        )
        .map((row) => row.id),
    ),
  ]);
  const last = page.at(-1);
  return {
    items: page.map((row) =>
      summary(row, buyerMap.get(row.orderId), nextMap.get(row.id)),
    ),
    nextCursor:
      rows.length > limit && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : undefined,
  };
}

export async function loadPayObligationDetail(
  organizationId: string,
  obligationId: string,
): Promise<Detail> {
  const database = getDatabase();
  const [obligation] = await database
    .select()
    .from(payObligations)
    .where(
      and(
        eq(payObligations.id, obligationId),
        eq(payObligations.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!obligation) throw new TRPCError({ code: "NOT_FOUND" });
  const [tranches, events, refunds, holds, buyerMap] = await Promise.all([
    database
      .select()
      .from(payReleaseTranches)
      .where(eq(payReleaseTranches.obligationId, obligation.id))
      .orderBy(asc(payReleaseTranches.sequence)),
    database
      .select()
      .from(payDeliveryEvents)
      .where(eq(payDeliveryEvents.obligationId, obligation.id))
      .orderBy(asc(payDeliveryEvents.occurredAt), asc(payDeliveryEvents.id)),
    database
      .select()
      .from(payObligationRefunds)
      .where(eq(payObligationRefunds.obligationId, obligation.id))
      .orderBy(asc(payObligationRefunds.createdAt)),
    database
      .select({ id: payHolds.id })
      .from(payHolds)
      .where(eq(payHolds.obligationId, obligation.id)),
    buyers([obligation.orderId]),
  ]);
  const next = tranches
    .filter((tranche) =>
      ["scheduled", "delivered", "releasable", "held"].includes(tranche.status),
    )
    .map((tranche) => tranche.releasableAt)
    .filter((value): value is Date => value !== null)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const amount = (value: number) => money(value, obligation.currency);
  return {
    ...summary(obligation, buyerMap.get(obligation.orderId), next),
    tranches: tranches.map((tranche) => ({
      id: tranche.id,
      sequence: tranche.sequence,
      kind: tranche.kind as Detail["tranches"][number]["kind"],
      status: tranche.status as Detail["tranches"][number]["status"],
      amount: amount(tranche.amountMinor),
      sessionId: tranche.sessionId ?? undefined,
      deliveryDueAt: iso(tranche.deliveryDueAt),
      deliveredAt: iso(tranche.deliveredAt),
      releasableAt: iso(tranche.releasableAt),
      releasedAt: iso(tranche.releasedAt),
      payoutId: tranche.payoutId ?? undefined,
    })),
    deliveryEvents: events.map((event) => ({
      id: event.id,
      kind: event.kind as Detail["deliveryEvents"][number]["kind"],
      occurredAt: event.occurredAt.toISOString(),
      trancheId: event.trancheId ?? undefined,
      sourceType: event.sourceType,
      details: event.details as Record<string, unknown>,
    })),
    refunds: refunds.map((refund) => ({
      id: refund.id,
      refundRecordId: refund.refundRecordId,
      source: refund.source as Detail["refunds"][number]["source"],
      amount: amount(refund.amountMinor),
      serviceFeeKept: amount(refund.serviceFeeKeptMinor),
      createdAt: refund.createdAt.toISOString(),
    })),
    holdIds: holds.map((hold) => hold.id),
  };
}

export async function listPayHolds(organizationId: string): Promise<Hold[]> {
  const rows = await getDatabase()
    .select()
    .from(payHolds)
    .where(eq(payHolds.organizationId, organizationId))
    .orderBy(desc(payHolds.startsAt), desc(payHolds.id))
    .limit(500);
  return rows.map((hold) => ({
    id: hold.id,
    kind: hold.kind as Hold["kind"],
    status: hold.status as Hold["status"],
    amount: money(hold.amountMinor, hold.currency),
    reason: hold.reason,
    obligationId: hold.obligationId ?? undefined,
    reserveId: hold.reserveId ?? undefined,
    disputeCaseId: hold.disputeCaseId ?? undefined,
    startsAt: hold.startsAt.toISOString(),
    releaseAfter: iso(hold.releaseAfter),
    releasedAt: iso(hold.releasedAt),
  }));
}
