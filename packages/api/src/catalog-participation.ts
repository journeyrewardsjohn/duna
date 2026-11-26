import {
  auditLog,
  catalogFulfillments,
  catalogItems,
  catalogParticipationSettlements,
  catalogSessionOccurrences,
  getDatabase,
  getTransactionalDatabase,
  ledgerEntries,
  ledgerJournals,
  orders,
  organizationCreditApplications,
  organizationCreditGrants,
  organizationWallets,
  people,
  refundRecords,
} from "@duna/db";
import {
  assertBalancedJournal,
  decideParticipationMinimum,
  participationCutoffAt,
  planParticipationSettlement,
  reverseLedgerPostings,
  type LedgerPosting,
  type ParticipationCreditTier,
  type ParticipationMinimumOutcome,
} from "@duna/core";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  catalogItemParticipationRules,
  occurrenceParticipationState,
  positiveInteger,
  readBookingSnapshot,
  type BookingParticipationSnapshot,
  type OccurrenceParticipationState,
} from "./catalog-participation-rules";
import { refundOrganizationOrder } from "./catalog-service";
import type { ApiActor } from "./context";

export class CatalogParticipationError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "OCCURRENCE_NOT_FOUND"
      | "NO_PARTICIPATION_RULES"
      | "NOT_DUE"
      | "ATTENDANCE_REQUIRED"
      | "INVALID_ATTENDANCE",
    message: string,
  ) {
    super(message);
    this.name = "CatalogParticipationError";
  }
}

/** Bookings in these states hold a place in the session. */
export const ACTIVE_CATALOG_BOOKING_STATUSES = [
  "held",
  "pending",
  "ready",
  "fulfilled",
] as const;

interface OccurrenceBooking {
  readonly fulfillment: typeof catalogFulfillments.$inferSelect;
  readonly order: typeof orders.$inferSelect;
  readonly quantity: number;
  readonly paymentMethod?: string;
  /** Paid, or an unexpired pay-in-person reservation. */
  readonly confirmed: boolean;
  readonly reservedCredits: number;
  readonly snapshot?: BookingParticipationSnapshot;
}

async function loadOccurrenceBookings(
  occurrenceId: string,
  now: Date,
): Promise<readonly OccurrenceBooking[]> {
  const rows = await getDatabase()
    .select({ fulfillment: catalogFulfillments, order: orders })
    .from(catalogFulfillments)
    .innerJoin(orders, eq(catalogFulfillments.orderId, orders.id))
    .where(
      and(
        eq(catalogFulfillments.catalogSessionOccurrenceId, occurrenceId),
        inArray(catalogFulfillments.status, [
          ...ACTIVE_CATALOG_BOOKING_STATUSES,
        ]),
      ),
    )
    .orderBy(asc(catalogFulfillments.createdAt), asc(catalogFulfillments.id));
  return rows.map(({ fulfillment, order }) => {
    const paymentMethod =
      typeof fulfillment.details.paymentMethod === "string"
        ? fulfillment.details.paymentMethod
        : undefined;
    const paid =
      order.status === "paid" || order.status === "partially-refunded";
    const cashReservation =
      paymentMethod === "cash" &&
      order.status === "pending" &&
      (!order.expiresAt || order.expiresAt > now);
    const credits = Number(fulfillment.details.creditsApplied ?? 0);
    return {
      fulfillment,
      order,
      quantity: positiveInteger(fulfillment.details.quantity, 1),
      paymentMethod,
      confirmed: paid || cashReservation,
      reservedCredits:
        Number.isSafeInteger(credits) && credits > 0 ? credits : 0,
      snapshot: readBookingSnapshot(fulfillment.details),
    };
  });
}

/** Confirmed places in a session: the headcount minimums and tiers price on. */
export async function confirmedOccurrenceHeadcount(
  occurrenceId: string,
  now: Date,
): Promise<number> {
  return (await loadOccurrenceBookings(occurrenceId, now))
    .filter((booking) => booking.confirmed)
    .reduce((total, booking) => total + booking.quantity, 0);
}

export interface ParticipationSettlementResult {
  readonly fulfillmentId: string;
  readonly orderId: string;
  readonly payerPersonId: string;
  readonly quantity: number;
  readonly creditsPerPlayer: number;
  readonly reservedCredits: number;
  readonly settledCredits: number;
  readonly returnedCredits: number;
  /** False when this call found the booking already settled. */
  readonly applied: boolean;
}

/**
 * Settles one credit-paid booking to its final price and returns the
 * difference to the wallet it came from. Everything happens in one
 * transaction: the ledger journal, the grant and wallet balances, the refund
 * record, and the settlement row whose unique fulfillment index makes a
 * second attempt a no-op.
 */
async function settleBookingCredits(input: {
  readonly organizationId: string;
  readonly occurrenceId: string;
  readonly fulfillmentId: string;
  readonly basis: "cutoff" | "attendance";
  readonly headcount: number;
  readonly creditTiers: readonly ParticipationCreditTier[];
  readonly actorPersonId?: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<ParticipationSettlementResult | undefined> {
  return getTransactionalDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`
      SELECT id
      FROM catalog_fulfillments
      WHERE id = ${input.fulfillmentId}::uuid
        AND organization_id = ${input.organizationId}::uuid
      FOR UPDATE
    `);
    const fulfillment = await transaction.query.catalogFulfillments.findFirst({
      where: and(
        eq(catalogFulfillments.id, input.fulfillmentId),
        eq(catalogFulfillments.organizationId, input.organizationId),
      ),
    });
    if (!fulfillment) return undefined;
    const order = await transaction.query.orders.findFirst({
      where: eq(orders.id, fulfillment.orderId),
    });
    if (!order) return undefined;
    const quantity = positiveInteger(fulfillment.details.quantity, 1);
    const existing =
      await transaction.query.catalogParticipationSettlements.findFirst({
        where: eq(
          catalogParticipationSettlements.catalogFulfillmentId,
          fulfillment.id,
        ),
      });
    if (existing) {
      return {
        fulfillmentId: fulfillment.id,
        orderId: order.id,
        payerPersonId: existing.payerPersonId,
        quantity: existing.quantity,
        creditsPerPlayer: existing.creditsPerPlayer,
        reservedCredits: existing.reservedCredits,
        settledCredits: existing.settledCredits,
        returnedCredits: existing.returnedCredits,
        applied: false,
      };
    }
    if (
      !(ACTIVE_CATALOG_BOOKING_STATUSES as readonly string[]).includes(
        fulfillment.status,
      ) ||
      order.status !== "paid"
    ) {
      return undefined;
    }

    await transaction.execute(sql`
      SELECT id
      FROM organization_credit_applications
      WHERE organization_id = ${input.organizationId}::uuid
        AND order_id = ${order.id}::uuid
        AND restored_at IS NULL
      FOR UPDATE
    `);
    const applications = await transaction
      .select()
      .from(organizationCreditApplications)
      .where(
        and(
          eq(
            organizationCreditApplications.organizationId,
            input.organizationId,
          ),
          eq(organizationCreditApplications.orderId, order.id),
          isNull(organizationCreditApplications.restoredAt),
        ),
      );
    // The ledger, not the booking's JSON, is the source of truth for what was
    // actually taken from the wallet.
    const reservedCredits = applications.reduce(
      (total, application) =>
        total + application.credits - application.returnedCredits,
      0,
    );
    if (applications.length === 0 || reservedCredits <= 0) return undefined;
    const [line] = planParticipationSettlement({
      creditTiers: input.creditTiers,
      headcount: input.headcount,
      bookings: [{ id: fulfillment.id, quantity, reservedCredits }],
    });
    if (!line) return undefined;

    let creditJournalId: string | undefined;
    let refundRecordId: string | undefined;
    let returnedValueMinor = 0;
    if (line.returnedCredits > 0) {
      const originalJournalIds = [
        ...new Set(applications.map((application) => application.journalId)),
      ];
      if (originalJournalIds.length !== 1) {
        throw new Error(
          "This booking has an ambiguous credit redemption. No wallet changes were made.",
        );
      }
      const grantIds = [
        ...new Set(
          applications.map(
            (application) => application.organizationCreditGrantId,
          ),
        ),
      ];
      for (const grantId of grantIds) {
        await transaction.execute(sql`
          SELECT id
          FROM organization_credit_grants
          WHERE id = ${grantId}::uuid
            AND organization_id = ${input.organizationId}::uuid
          FOR UPDATE
        `);
      }
      const walletIds = [
        ...new Set(
          applications.map((application) => application.organizationWalletId),
        ),
      ];
      for (const walletId of walletIds) {
        await transaction.execute(sql`
          SELECT id
          FROM organization_wallets
          WHERE id = ${walletId}::uuid
            AND organization_id = ${input.organizationId}::uuid
          FOR UPDATE
        `);
      }
      const grants = await transaction
        .select()
        .from(organizationCreditGrants)
        .where(
          and(
            eq(organizationCreditGrants.organizationId, input.organizationId),
            inArray(organizationCreditGrants.id, grantIds),
          ),
        );
      const grantById = new Map(grants.map((grant) => [grant.id, grant]));
      // Redemption spends the soonest-expiring grant first. Returning in the
      // opposite order gives the player back their longest-lived credits.
      const returnOrder = [...applications].sort((left, right) => {
        const leftGrant = grantById.get(left.organizationCreditGrantId);
        const rightGrant = grantById.get(right.organizationCreditGrantId);
        const leftExpiry =
          leftGrant?.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightExpiry =
          rightGrant?.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (leftExpiry !== rightExpiry) return rightExpiry - leftExpiry;
        const created =
          (rightGrant?.createdAt.getTime() ?? 0) -
          (leftGrant?.createdAt.getTime() ?? 0);
        return created !== 0
          ? created
          : right.organizationCreditGrantId.localeCompare(
              left.organizationCreditGrantId,
            );
      });
      let remaining = line.returnedCredits;
      const returns: {
        readonly application: (typeof applications)[number];
        readonly credits: number;
        readonly valueMinor: number;
      }[] = [];
      for (const application of returnOrder) {
        if (remaining === 0) break;
        const outstandingCredits =
          application.credits - application.returnedCredits;
        if (outstandingCredits <= 0) continue;
        const outstandingValue =
          application.valueMinor - application.returnedValueMinor;
        const credits = Math.min(remaining, outstandingCredits);
        const valueMinor =
          credits === outstandingCredits
            ? outstandingValue
            : Math.floor((outstandingValue * credits) / outstandingCredits);
        returns.push({ application, credits, valueMinor });
        remaining -= credits;
      }
      if (remaining !== 0) {
        throw new Error(
          "The redeemed credits for this booking do not cover its settlement.",
        );
      }
      returnedValueMinor = returns.reduce(
        (total, entry) => total + entry.valueMinor,
        0,
      );

      const originalCreditEntries = await transaction
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.journalId, originalJournalIds[0]!))
        .orderBy(asc(ledgerEntries.sequence));
      if (originalCreditEntries.length === 0) {
        throw new Error("The original credit redemption journal is missing.");
      }
      const creditPostings = reverseLedgerPostings(
        originalCreditEntries.map((entry): LedgerPosting => ({
          accountId: entry.accountId,
          side: entry.side,
          amount: line.returnedCredits,
          unit: entry.unit,
          unitKind: entry.unitKind,
          currency: entry.currency ?? undefined,
        })),
      );
      assertBalancedJournal(creditPostings);
      creditJournalId = crypto.randomUUID();
      await transaction.insert(ledgerJournals).values({
        id: creditJournalId,
        organizationId: input.organizationId,
        idempotencyKey: `participation-settlement:${fulfillment.id}`,
        sourceType: "catalog-credit-settlement",
        sourceId: order.id,
        description:
          "Return unused organization credits after headcount settlement",
        status: "draft",
        actorPersonId: input.actorPersonId,
        occurredAt: input.now,
        metadata: {
          orderId: order.id,
          fulfillmentId: fulfillment.id,
          occurrenceId: input.occurrenceId,
          settlesJournalId: originalJournalIds[0],
          headcount: input.headcount,
          basis: input.basis,
          reservedCredits,
          settledCredits: line.settledCredits,
          returnedCredits: line.returnedCredits,
        },
      });
      await transaction.insert(ledgerEntries).values(
        creditPostings.map((posting, sequence) => ({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          journalId: creditJournalId!,
          sequence,
          ...posting,
        })),
      );
      await transaction
        .update(ledgerJournals)
        .set({ status: "posted", postedAt: input.now })
        .where(eq(ledgerJournals.id, creditJournalId));

      if (returnedValueMinor > 0) {
        const valueJournals = await transaction
          .select()
          .from(ledgerJournals)
          .where(
            and(
              eq(ledgerJournals.organizationId, input.organizationId),
              eq(ledgerJournals.sourceType, "catalog-credit-revenue"),
              eq(ledgerJournals.sourceId, order.id),
              eq(ledgerJournals.status, "posted"),
            ),
          );
        if (valueJournals.length !== 1) {
          throw new Error(
            "This booking has an ambiguous credit value journal. No wallet changes were made.",
          );
        }
        const valueEntries = await transaction
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.journalId, valueJournals[0]!.id))
          .orderBy(asc(ledgerEntries.sequence));
        const valuePostings = reverseLedgerPostings(
          valueEntries.map((entry): LedgerPosting => ({
            accountId: entry.accountId,
            side: entry.side,
            amount: returnedValueMinor,
            unit: entry.unit,
            unitKind: entry.unitKind,
            currency: entry.currency ?? undefined,
          })),
        );
        assertBalancedJournal(valuePostings);
        const valueJournalId = crypto.randomUUID();
        await transaction.insert(ledgerJournals).values({
          id: valueJournalId,
          organizationId: input.organizationId,
          idempotencyKey: `participation-settlement:${fulfillment.id}:value`,
          sourceType: "catalog-credit-settlement-value",
          sourceId: order.id,
          description: "Defer credit value returned by a headcount settlement",
          status: "draft",
          actorPersonId: input.actorPersonId,
          occurredAt: input.now,
          metadata: {
            orderId: order.id,
            fulfillmentId: fulfillment.id,
            settlesJournalId: valueJournals[0]!.id,
            valueMinor: returnedValueMinor,
          },
        });
        await transaction.insert(ledgerEntries).values(
          valuePostings.map((posting, sequence) => ({
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            journalId: valueJournalId,
            sequence,
            ...posting,
          })),
        );
        await transaction
          .update(ledgerJournals)
          .set({ status: "posted", postedAt: input.now })
          .where(eq(ledgerJournals.id, valueJournalId));
      }

      const walletCredits = new Map<string, number>();
      // One redemption journal touches each grant at most once, so every
      // return here belongs to a different grant.
      for (const entry of returns) {
        const grant = grantById.get(
          entry.application.organizationCreditGrantId,
        );
        if (!grant) throw new Error("The original credit grant is missing.");
        const restoredCredits = grant.remainingCredits + entry.credits;
        const restoredValue = grant.remainingValueMinor + entry.valueMinor;
        if (
          restoredCredits > grant.initialCredits ||
          restoredValue > grant.initialValueMinor
        ) {
          throw new Error(
            "Returning these credits would overstate the original credit grant.",
          );
        }
        await transaction
          .update(organizationCreditGrants)
          .set({
            remainingCredits: restoredCredits,
            remainingValueMinor: restoredValue,
            status: grant.status === "exhausted" ? "active" : grant.status,
            updatedAt: input.now,
          })
          .where(eq(organizationCreditGrants.id, grant.id));
      }
      for (const entry of returns) {
        walletCredits.set(
          entry.application.organizationWalletId,
          (walletCredits.get(entry.application.organizationWalletId) ?? 0) +
            entry.credits,
        );
        await transaction
          .update(organizationCreditApplications)
          .set({
            returnedCredits: sql`${organizationCreditApplications.returnedCredits} + ${entry.credits}`,
            returnedValueMinor: sql`${organizationCreditApplications.returnedValueMinor} + ${entry.valueMinor}`,
          })
          .where(eq(organizationCreditApplications.id, entry.application.id));
      }
      for (const [walletId, credits] of walletCredits) {
        await transaction
          .update(organizationWallets)
          .set({
            cachedAvailableCredits: sql`${organizationWallets.cachedAvailableCredits} + ${credits}`,
            cachedAt: input.now,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(organizationWallets.id, walletId),
              eq(organizationWallets.organizationId, input.organizationId),
            ),
          );
      }
      refundRecordId = crypto.randomUUID();
      await transaction.insert(refundRecords).values({
        id: refundRecordId,
        organizationId: input.organizationId,
        orderId: order.id,
        disposition: "organization-credit-restoration",
        amountMinor: 0,
        currency: order.currency,
        creditsRestored: line.returnedCredits,
        ledgerJournalId: creditJournalId,
        reason: `Headcount settlement: ${input.headcount} player${input.headcount === 1 ? "" : "s"} at ${line.creditsPerPlayer} credit${line.creditsPerPlayer === 1 ? "" : "s"} each.`,
        status: "succeeded",
        initiatedByPersonId: input.actorPersonId ?? order.buyerPersonId,
      });
    }

    await transaction.insert(catalogParticipationSettlements).values({
      organizationId: input.organizationId,
      catalogSessionOccurrenceId: input.occurrenceId,
      catalogFulfillmentId: fulfillment.id,
      orderId: order.id,
      payerPersonId: order.buyerPersonId,
      basis: input.basis,
      headcount: input.headcount,
      quantity,
      creditsPerPlayer: line.creditsPerPlayer,
      reservedCredits,
      settledCredits: line.settledCredits,
      returnedCredits: line.returnedCredits,
      returnedValueMinor,
      creditJournalId,
      refundRecordId,
      createdAt: input.now,
    });
    await transaction
      .update(catalogFulfillments)
      .set({
        details: {
          ...fulfillment.details,
          creditsSettled: line.settledCredits,
          creditsReturned: line.returnedCredits,
          settledHeadcount: input.headcount,
          settledCreditsPerPlayer: line.creditsPerPlayer,
          settledAt: input.now.toISOString(),
        },
        updatedAt: input.now,
      })
      .where(eq(catalogFulfillments.id, fulfillment.id));
    await transaction.insert(auditLog).values({
      organizationId: input.organizationId,
      actorPersonId: input.actorPersonId,
      actorType: input.actorPersonId ? "person" : "system",
      action: "catalog.participation_settled",
      entityType: "catalog-fulfillment",
      entityId: fulfillment.id,
      afterHash: stableHash({
        orderId: order.id,
        occurrenceId: input.occurrenceId,
        basis: input.basis,
        headcount: input.headcount,
        reservedCredits,
        settledCredits: line.settledCredits,
        returnedCredits: line.returnedCredits,
        creditJournalId,
      }),
      reason:
        line.returnedCredits > 0
          ? "Booking settled to the final headcount; unused credits returned to the wallet."
          : "Booking settled to the final headcount; nothing to return.",
      traceId: input.requestId,
      createdAt: input.now,
    });
    return {
      fulfillmentId: fulfillment.id,
      orderId: order.id,
      payerPersonId: order.buyerPersonId,
      quantity,
      creditsPerPlayer: line.creditsPerPlayer,
      reservedCredits,
      settledCredits: line.settledCredits,
      returnedCredits: line.returnedCredits,
      applied: true,
    };
  });
}

export interface ParticipationCancellationResult {
  readonly fulfillmentId: string;
  readonly orderId: string;
  readonly personId: string;
  readonly refundStatus:
    "credits-restored" | "refund-submitted" | "released" | "review-required";
}

async function systemActor(
  personId: string,
  organizationId: string,
): Promise<ApiActor> {
  const person = await getDatabase().query.people.findFirst({
    where: eq(people.id, personId),
  });
  return {
    personId,
    displayName: person?.displayName ?? "Duna",
    roles: ["player"],
    organizationId,
    scopes: [],
    ageBand: "adult",
    isDemo: false,
  };
}

/**
 * Releases every remaining booking of a session cancelled for missing its
 * minimum. Credits and card payments go back through the existing order
 * refund path; an unpaid pay-in-person reservation is simply released.
 * Re-entrant: bookings already refunded are no longer active and are skipped.
 */
async function refundCancelledOccurrenceBookings(input: {
  readonly organizationId: string;
  readonly occurrenceId: string;
  readonly actorPersonId?: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<readonly ParticipationCancellationResult[]> {
  const database = getDatabase();
  const bookings = await loadOccurrenceBookings(input.occurrenceId, input.now);
  const results: ParticipationCancellationResult[] = [];
  for (const booking of bookings) {
    const base = {
      fulfillmentId: booking.fulfillment.id,
      orderId: booking.order.id,
      personId: booking.fulfillment.personId,
    };
    const paid =
      booking.order.status === "paid" ||
      booking.order.status === "partially-refunded";
    if (!paid) {
      await database.batch([
        database
          .update(catalogFulfillments)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(eq(catalogFulfillments.id, booking.fulfillment.id)),
        database
          .update(orders)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(
            and(eq(orders.id, booking.order.id), eq(orders.status, "pending")),
          ),
      ]);
      results.push({ ...base, refundStatus: "released" });
      continue;
    }
    const free =
      booking.order.totalMinor === 0 && booking.reservedCredits === 0;
    if (free) {
      await database
        .update(catalogFulfillments)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(catalogFulfillments.id, booking.fulfillment.id));
      results.push({ ...base, refundStatus: "released" });
      continue;
    }
    try {
      const refund = await refundOrganizationOrder({
        actor: await systemActor(
          input.actorPersonId ?? booking.order.buyerPersonId,
          input.organizationId,
        ),
        orderId: booking.order.id,
        amountMinor: booking.order.totalMinor,
        disposition: "original-payment",
        reason: "Session cancelled: the minimum number of players was not met.",
        requestId: `participation-cancel:${booking.fulfillment.id}`,
        now: input.now,
      });
      results.push({
        ...base,
        refundStatus:
          refund.status === "failed"
            ? "review-required"
            : booking.reservedCredits > 0
              ? "credits-restored"
              : "refund-submitted",
      });
    } catch {
      results.push({ ...base, refundStatus: "review-required" });
    }
  }
  return results;
}

export interface ParticipationEvaluation {
  readonly occurrenceId: string;
  readonly status:
    "no-rules" | "not-due" | "cancelled" | "awaiting-attendance" | "settled";
  readonly outcome?: ParticipationMinimumOutcome;
  readonly headcount?: number;
  readonly minParticipants?: number;
  readonly settlements: readonly ParticipationSettlementResult[];
  readonly cancellations: readonly ParticipationCancellationResult[];
}

/**
 * Applies a session's participation rules once its cutoff has passed:
 * checks the minimum, cancels and refunds an under-filled session when the
 * policy says so, and otherwise settles every credit-paid booking to the
 * final headcount. Safe to call repeatedly from a schedule, a booking, or an
 * operator action; each step claims its work atomically and is re-entrant.
 */
export async function evaluateCatalogSessionParticipation(input: {
  readonly occurrenceId: string;
  readonly organizationId?: string;
  /** Operators may decide before the cutoff; a schedule may not. */
  readonly force?: boolean;
  /** Bookings that attended. Required to settle an attendance-priced session. */
  readonly attendedFulfillmentIds?: readonly string[];
  readonly actorPersonId?: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<ParticipationEvaluation> {
  if (!process.env.DATABASE_URL) {
    throw new CatalogParticipationError(
      "DATABASE_REQUIRED",
      "Session participation requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const row = await database
    .select({ occurrence: catalogSessionOccurrences, item: catalogItems })
    .from(catalogSessionOccurrences)
    .innerJoin(
      catalogItems,
      eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
    )
    .where(
      and(
        eq(catalogSessionOccurrences.id, input.occurrenceId),
        input.organizationId
          ? eq(catalogSessionOccurrences.organizationId, input.organizationId)
          : undefined,
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) {
    throw new CatalogParticipationError(
      "OCCURRENCE_NOT_FOUND",
      "This session was not found.",
    );
  }
  let occurrence = row.occurrence;
  const organizationId = occurrence.organizationId;
  const empty = { settlements: [], cancellations: [] } as const;
  const rules = catalogItemParticipationRules(
    row.item.configuration,
    occurrence.capacity,
  );
  if (!rules) {
    return { occurrenceId: occurrence.id, status: "no-rules", ...empty };
  }

  if (!occurrence.participationOutcome) {
    if (occurrence.status !== "scheduled") {
      return { occurrenceId: occurrence.id, status: "no-rules", ...empty };
    }
    if (
      !input.force &&
      input.now < participationCutoffAt(occurrence.startsAt, rules)
    ) {
      return {
        occurrenceId: occurrence.id,
        status: "not-due",
        minParticipants: rules.minParticipants,
        ...empty,
      };
    }
    const headcount = await confirmedOccurrenceHeadcount(
      occurrence.id,
      input.now,
    );
    const outcome = decideParticipationMinimum(rules, headcount);
    // Claiming the decision in one statement means two concurrent runs cannot
    // both decide; the loser re-reads what the winner recorded.
    await database
      .update(catalogSessionOccurrences)
      .set({
        participationOutcome: outcome,
        participationDecidedAt: input.now,
        decidedHeadcount: headcount,
        status: outcome === "cancel-under-minimum" ? "cancelled" : "scheduled",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(catalogSessionOccurrences.id, occurrence.id),
          eq(catalogSessionOccurrences.status, "scheduled"),
          isNull(catalogSessionOccurrences.participationOutcome),
        ),
      );
    const decided = await database.query.catalogSessionOccurrences.findFirst({
      where: eq(catalogSessionOccurrences.id, occurrence.id),
    });
    if (!decided?.participationOutcome) {
      return { occurrenceId: occurrence.id, status: "no-rules", ...empty };
    }
    if (
      decided.participationDecidedAt?.getTime() === input.now.getTime() &&
      decided.participationOutcome === outcome
    ) {
      await database.insert(auditLog).values({
        organizationId,
        actorPersonId: input.actorPersonId,
        actorType: input.actorPersonId ? "person" : "system",
        action:
          outcome === "cancel-under-minimum"
            ? "catalog.session_cancelled_under_minimum"
            : "catalog.session_minimum_decided",
        entityType: "catalog-session-occurrence",
        entityId: occurrence.id,
        beforeHash: stableHash({ status: occurrence.status }),
        afterHash: stableHash({
          outcome,
          headcount,
          minParticipants: rules.minParticipants,
          minimumPolicy: rules.minimumPolicy,
        }),
        reason:
          outcome === "cancel-under-minimum"
            ? `Session cancelled with ${headcount} of the ${rules.minParticipants} players it needs.`
            : outcome === "run-under-minimum"
              ? `Session runs with ${headcount} players, under its minimum of ${rules.minParticipants}.`
              : `Session confirmed with ${headcount} players.`,
        traceId: input.requestId,
        createdAt: input.now,
      });
    }
    occurrence = decided;
  }

  const outcome =
    occurrence.participationOutcome as ParticipationMinimumOutcome;
  if (outcome === "cancel-under-minimum") {
    return {
      occurrenceId: occurrence.id,
      status: "cancelled",
      outcome,
      headcount: occurrence.decidedHeadcount ?? 0,
      minParticipants: rules.minParticipants,
      settlements: [],
      cancellations: await refundCancelledOccurrenceBookings({
        organizationId,
        occurrenceId: occurrence.id,
        actorPersonId: input.actorPersonId,
        requestId: input.requestId,
        now: input.now,
      }),
    };
  }

  const bookings = (
    await loadOccurrenceBookings(occurrence.id, input.now)
  ).filter((booking) => booking.confirmed);
  if (!occurrence.participationSettledAt) {
    let headcount = occurrence.decidedHeadcount ?? 0;
    if (rules.settlementBasis === "attendance") {
      if (!input.attendedFulfillmentIds) {
        return {
          occurrenceId: occurrence.id,
          status: "awaiting-attendance",
          outcome,
          headcount: occurrence.decidedHeadcount ?? 0,
          minParticipants: rules.minParticipants,
          ...empty,
        };
      }
      if (input.now < occurrence.startsAt) {
        throw new CatalogParticipationError(
          "INVALID_ATTENDANCE",
          "Attendance can only be recorded once the session starts.",
        );
      }
      const attended = new Set(input.attendedFulfillmentIds);
      const known = new Set(bookings.map((booking) => booking.fulfillment.id));
      if ([...attended].some((id) => !known.has(id))) {
        throw new CatalogParticipationError(
          "INVALID_ATTENDANCE",
          "Attendance includes a booking that is not part of this session.",
        );
      }
      headcount = bookings
        .filter((booking) => attended.has(booking.fulfillment.id))
        .reduce((total, booking) => total + booking.quantity, 0);
      for (const booking of bookings) {
        const present = attended.has(booking.fulfillment.id);
        await database
          .update(catalogFulfillments)
          .set({
            status: present ? "fulfilled" : booking.fulfillment.status,
            fulfilledAt: present
              ? (booking.fulfillment.fulfilledAt ?? input.now)
              : booking.fulfillment.fulfilledAt,
            details: {
              ...booking.fulfillment.details,
              attendance: present ? "attended" : "no-show",
              attendanceRecordedAt: input.now.toISOString(),
            },
            updatedAt: input.now,
          })
          .where(eq(catalogFulfillments.id, booking.fulfillment.id));
      }
    }
    await database
      .update(catalogSessionOccurrences)
      .set({
        settledHeadcount: headcount,
        participationSettledAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(catalogSessionOccurrences.id, occurrence.id),
          isNull(catalogSessionOccurrences.participationSettledAt),
        ),
      );
    const settled = await database.query.catalogSessionOccurrences.findFirst({
      where: eq(catalogSessionOccurrences.id, occurrence.id),
    });
    if (!settled?.participationSettledAt) {
      throw new Error("The session headcount could not be finalized.");
    }
    occurrence = settled;
  }

  const headcount = occurrence.settledHeadcount ?? 0;
  const settlements: ParticipationSettlementResult[] = [];
  for (const booking of bookings) {
    // Only credit bookings that reserved against a tier table are settled.
    // Card, cash, membership-included, and late bookings priced at the final
    // headcount already paid exactly what they agreed to.
    if (
      booking.paymentMethod !== "credit" ||
      booking.reservedCredits <= 0 ||
      !booking.snapshot ||
      booking.snapshot.creditTiers.length === 0 ||
      booking.snapshot.pricedAtSettledHeadcount !== undefined
    ) {
      continue;
    }
    const result = await settleBookingCredits({
      organizationId,
      occurrenceId: occurrence.id,
      fulfillmentId: booking.fulfillment.id,
      basis: rules.settlementBasis,
      headcount,
      creditTiers: booking.snapshot.creditTiers,
      actorPersonId: input.actorPersonId,
      requestId: input.requestId,
      now: input.now,
    });
    if (result) settlements.push(result);
  }
  return {
    occurrenceId: occurrence.id,
    status: "settled",
    outcome,
    headcount,
    minParticipants: rules.minParticipants,
    settlements,
    cancellations: [],
  };
}

/**
 * Finds sessions whose participation cutoff has passed and applies their
 * rules. Intended for a frequent schedule; every evaluation is idempotent.
 */
export async function processDueCatalogParticipation(input: {
  readonly now: Date;
  readonly limit?: number;
}): Promise<{
  readonly examined: number;
  readonly cancelled: number;
  readonly settled: number;
  readonly awaitingAttendance: number;
  readonly failed: number;
}> {
  if (!process.env.DATABASE_URL) {
    return {
      examined: 0,
      cancelled: 0,
      settled: 0,
      awaitingAttendance: 0,
      failed: 0,
    };
  }
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  const horizon = new Date(input.now.getTime() + 7 * 24 * 60 * 60_000);
  const lookback = new Date(input.now.getTime() - 14 * 24 * 60 * 60_000);
  const candidates = await getDatabase()
    .select({ id: catalogSessionOccurrences.id })
    .from(catalogSessionOccurrences)
    .innerJoin(
      catalogItems,
      eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
    )
    .where(
      and(
        sql`${catalogItems.configuration} ? 'participation'`,
        gte(catalogSessionOccurrences.startsAt, lookback),
        lte(catalogSessionOccurrences.startsAt, horizon),
        or(
          // Not decided yet.
          and(
            eq(catalogSessionOccurrences.status, "scheduled"),
            isNull(catalogSessionOccurrences.participationOutcome),
          ),
          // Decided to run but not settled (cutoff basis settles here;
          // attendance basis waits for an operator).
          and(
            eq(catalogSessionOccurrences.status, "scheduled"),
            inArray(catalogSessionOccurrences.participationOutcome, [
              "minimum-met",
              "run-under-minimum",
            ]),
            isNull(catalogSessionOccurrences.participationSettledAt),
          ),
          // Cancelled under minimum with bookings still to release.
          and(
            eq(
              catalogSessionOccurrences.participationOutcome,
              "cancel-under-minimum",
            ),
            sql`EXISTS (
              SELECT 1 FROM catalog_fulfillments AS booking
              WHERE booking.catalog_session_occurrence_id = ${catalogSessionOccurrences.id}
                AND booking.status IN ('held', 'pending', 'ready', 'fulfilled')
            )`,
          ),
        ),
      ),
    )
    .orderBy(asc(catalogSessionOccurrences.startsAt))
    .limit(limit);
  const summary = {
    examined: candidates.length,
    cancelled: 0,
    settled: 0,
    awaitingAttendance: 0,
    failed: 0,
  };
  for (const candidate of candidates) {
    try {
      const evaluation = await evaluateCatalogSessionParticipation({
        occurrenceId: candidate.id,
        requestId: `participation-schedule:${candidate.id}`,
        now: input.now,
      });
      if (evaluation.status === "cancelled") summary.cancelled += 1;
      if (evaluation.status === "settled") summary.settled += 1;
      if (evaluation.status === "awaiting-attendance") {
        summary.awaitingAttendance += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

export interface OperatorCatalogSessionOccurrence {
  readonly id: string;
  readonly catalogItemId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly status: "scheduled" | "cancelled" | "complete";
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly participation?: OccurrenceParticipationState & {
    readonly minimumPolicy: "cancel" | "run";
    readonly settlementBasis: "cutoff" | "attendance";
    readonly decidedAt?: string;
    readonly settledAt?: string;
  };
  readonly bookings: readonly {
    readonly fulfillmentId: string;
    readonly orderId: string;
    readonly personId: string;
    readonly displayName: string;
    readonly payerPersonId: string;
    readonly quantity: number;
    readonly paymentMethod?: string;
    readonly confirmed: boolean;
    readonly reservedCredits: number;
    readonly settledCredits?: number;
    readonly returnedCredits?: number;
    readonly attendance?: "attended" | "no-show";
  }[];
}

/** Rosters with headcount, minimum, and settlement state for HQ. */
export async function loadOperatorCatalogSessionOccurrences(input: {
  readonly actor: ApiActor;
  readonly catalogItemId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly now: Date;
}): Promise<readonly OperatorCatalogSessionOccurrence[]> {
  if (!process.env.DATABASE_URL) return [];
  const organizationId = input.actor.organizationId;
  if (!organizationId) throw new Error("Choose an organization first.");
  const database = getDatabase();
  const from = input.from ?? new Date(input.now.getTime() - 24 * 60 * 60_000);
  const to = input.to ?? new Date(input.now.getTime() + 60 * 24 * 60 * 60_000);
  const rows = await database
    .select({ occurrence: catalogSessionOccurrences, item: catalogItems })
    .from(catalogSessionOccurrences)
    .innerJoin(
      catalogItems,
      eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
    )
    .where(
      and(
        eq(catalogSessionOccurrences.organizationId, organizationId),
        input.catalogItemId
          ? eq(catalogSessionOccurrences.catalogItemId, input.catalogItemId)
          : undefined,
        gte(catalogSessionOccurrences.startsAt, from),
        lte(catalogSessionOccurrences.startsAt, to),
      ),
    )
    .orderBy(asc(catalogSessionOccurrences.startsAt))
    .limit(200);
  const results: OperatorCatalogSessionOccurrence[] = [];
  for (const { occurrence, item } of rows) {
    const bookings = await loadOccurrenceBookings(occurrence.id, input.now);
    const personIds = [
      ...new Set(bookings.map((booking) => booking.fulfillment.personId)),
    ];
    const names =
      personIds.length === 0
        ? []
        : await database
            .select({ id: people.id, displayName: people.displayName })
            .from(people)
            .where(inArray(people.id, personIds));
    const nameById = new Map(names.map((row) => [row.id, row.displayName]));
    const confirmedCount = bookings
      .filter((booking) => booking.confirmed)
      .reduce((total, booking) => total + booking.quantity, 0);
    const rules = catalogItemParticipationRules(
      item.configuration,
      occurrence.capacity,
    );
    results.push({
      id: occurrence.id,
      catalogItemId: item.id,
      title: item.title,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      timezone: occurrence.timezone,
      status:
        occurrence.status === "cancelled" || occurrence.status === "complete"
          ? occurrence.status
          : "scheduled",
      capacity: occurrence.capacity,
      confirmedCount,
      participation: rules
        ? {
            ...occurrenceParticipationState({
              rules,
              occurrence,
              bookedCount: confirmedCount,
            }),
            minimumPolicy: rules.minimumPolicy,
            settlementBasis: rules.settlementBasis,
            decidedAt: occurrence.participationDecidedAt?.toISOString(),
            settledAt: occurrence.participationSettledAt?.toISOString(),
          }
        : undefined,
      bookings: bookings.map((booking) => ({
        fulfillmentId: booking.fulfillment.id,
        orderId: booking.order.id,
        personId: booking.fulfillment.personId,
        displayName:
          nameById.get(booking.fulfillment.personId) ?? "Duna member",
        payerPersonId: booking.order.buyerPersonId,
        quantity: booking.quantity,
        paymentMethod: booking.paymentMethod,
        confirmed: booking.confirmed,
        reservedCredits: booking.reservedCredits,
        settledCredits:
          typeof booking.fulfillment.details.creditsSettled === "number"
            ? booking.fulfillment.details.creditsSettled
            : undefined,
        returnedCredits:
          typeof booking.fulfillment.details.creditsReturned === "number"
            ? booking.fulfillment.details.creditsReturned
            : undefined,
        attendance:
          booking.fulfillment.details.attendance === "attended" ||
          booking.fulfillment.details.attendance === "no-show"
            ? booking.fulfillment.details.attendance
            : undefined,
      })),
    });
  }
  return results;
}
