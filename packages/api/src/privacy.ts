import {
  auditLog,
  consents,
  formResponses,
  getDatabase,
  guardianConsents,
  guardianships,
  memberships,
  membershipTiers,
  orderItems,
  orders,
  people,
  pickupParticipants,
  privacyRequests,
  ratings,
  registrations,
  walletAccounts,
  walletLedger,
} from "@duna/db";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { ApiActor } from "./context";

export class PrivacyError extends Error {
  constructor(
    readonly code:
      "DATABASE_REQUIRED" | "REQUEST_NOT_FOUND" | "REQUEST_NOT_CANCELLABLE",
    message: string,
  ) {
    super(message);
    this.name = "PrivacyError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new PrivacyError(
      "DATABASE_REQUIRED",
      "Privacy workflows require the connected Duna database.",
    );
  }
}

export async function buildPersonDataExport(input: {
  readonly actor: ApiActor;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const personId = input.actor.personId;
  const [
    person,
    ratingRows,
    guardianshipRows,
    guardianConsentRows,
    registrationRows,
    pickupRows,
    orderRows,
    membershipRows,
    consentRows,
    responseRows,
    walletAccount,
    auditRows,
  ] = await Promise.all([
    database.query.people.findFirst({ where: eq(people.id, personId) }),
    database.select().from(ratings).where(eq(ratings.personId, personId)),
    database
      .select()
      .from(guardianships)
      .where(
        or(
          eq(guardianships.guardianId, personId),
          eq(guardianships.minorId, personId),
        ),
      ),
    database
      .select()
      .from(guardianConsents)
      .where(
        or(
          eq(guardianConsents.guardianId, personId),
          eq(guardianConsents.minorId, personId),
        ),
      )
      .orderBy(desc(guardianConsents.occurredAt)),
    database
      .select()
      .from(registrations)
      .where(eq(registrations.personId, personId))
      .orderBy(desc(registrations.createdAt)),
    database
      .select()
      .from(pickupParticipants)
      .where(eq(pickupParticipants.personId, personId))
      .orderBy(desc(pickupParticipants.createdAt)),
    database
      .select({
        id: orders.id,
        organizationId: orders.organizationId,
        status: orders.status,
        currency: orders.currency,
        subtotalMinor: orders.subtotalMinor,
        feeTotalMinor: orders.feeTotalMinor,
        taxTotalMinor: orders.taxTotalMinor,
        totalMinor: orders.totalMinor,
        walletAppliedMinor: orders.walletAppliedMinor,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .where(eq(orders.buyerPersonId, personId))
      .orderBy(desc(orders.createdAt)),
    database
      .select({
        id: memberships.id,
        status: memberships.status,
        currentPeriodStartsAt: memberships.currentPeriodStartsAt,
        currentPeriodEndsAt: memberships.currentPeriodEndsAt,
        pausedUntil: memberships.pausedUntil,
        pauseMonthsUsed: memberships.pauseMonthsUsed,
        cancelAtPeriodEnd: memberships.cancelAtPeriodEnd,
        tierName: membershipTiers.name,
        tierCode: membershipTiers.code,
        createdAt: memberships.createdAt,
        updatedAt: memberships.updatedAt,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(eq(memberships.personId, personId))
      .orderBy(desc(memberships.createdAt)),
    database
      .select()
      .from(consents)
      .where(eq(consents.personId, personId))
      .orderBy(desc(consents.occurredAt)),
    database
      .select()
      .from(formResponses)
      .where(
        or(
          eq(formResponses.personId, personId),
          eq(formResponses.subjectPersonId, personId),
        ),
      )
      .orderBy(desc(formResponses.createdAt)),
    database.query.walletAccounts.findFirst({
      where: eq(walletAccounts.personId, personId),
    }),
    database
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        reason: auditLog.reason,
        occurredAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.actorPersonId, personId))
      .orderBy(desc(auditLog.createdAt)),
  ]);
  if (!person) throw new Error("Player profile was not found");

  const orderIds = orderRows.map((order) => order.id);
  const [itemRows, ledgerRows] = await Promise.all([
    orderIds.length === 0
      ? Promise.resolve([])
      : database
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds)),
    walletAccount
      ? database
          .select()
          .from(walletLedger)
          .where(eq(walletLedger.walletAccountId, walletAccount.id))
          .orderBy(desc(walletLedger.createdAt))
      : Promise.resolve([]),
  ]);

  return {
    schema: "duna-personal-data-export/v1",
    generatedAt: input.now.toISOString(),
    person: {
      id: person.id,
      email: person.email,
      phoneE164: person.phoneE164,
      givenName: person.givenName,
      familyName: person.familyName,
      displayName: person.displayName,
      handle: person.handle,
      birthDate: person.birthDate,
      ageBand: person.ageBand,
      isMinor: person.isMinor,
      profileVisibility: person.profileVisibility,
      homeMarket: person.homeMarket,
      locale: person.locale,
      measurementSystem: person.measurementSystem,
      status: person.status,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    },
    ratings: ratingRows,
    householdRelationships: guardianshipRows,
    guardianConsentHistory: guardianConsentRows,
    registrations: registrationRows,
    pickupParticipation: pickupRows,
    orders: orderRows.map((order) => ({
      ...order,
      items: itemRows.filter((item) => item.orderId === order.id),
    })),
    memberships: membershipRows,
    consentHistory: consentRows,
    formResponses: responseRows,
    wallet: walletAccount
      ? {
          currency: walletAccount.currency,
          kycStatus: walletAccount.kycStatus,
          spendingBlocked: walletAccount.spendingBlocked,
          payoutHeld: walletAccount.payoutHeld,
          ledger: ledgerRows,
        }
      : null,
    auditEventsInitiatedByYou: auditRows,
  };
}

export async function requestAccountDeletion(input: {
  readonly actor: ApiActor;
  readonly reason?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly status: "queued" | "identity-review" | "legal-hold";
}> {
  requireDatabase();
  const database = getDatabase();
  const existing = await database.query.privacyRequests.findFirst({
    where: and(
      eq(privacyRequests.personId, input.actor.personId),
      eq(privacyRequests.kind, "account-deletion"),
      inArray(privacyRequests.status, [
        "queued",
        "identity-review",
        "legal-hold",
      ]),
    ),
  });
  if (existing) {
    return {
      id: existing.id,
      status:
        existing.status === "identity-review"
          ? "identity-review"
          : existing.status === "legal-hold"
            ? "legal-hold"
            : "queued",
    };
  }
  const id = crypto.randomUUID();
  await database.batch([
    database.insert(privacyRequests).values({
      id,
      personId: input.actor.personId,
      kind: "account-deletion",
      status: "queued",
      reason: input.reason,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "privacy.account_deletion_requested",
      entityType: "privacy-request",
      entityId: id,
      reason:
        "Account deletion was requested for identity and retention review.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, status: "queued" };
}

export async function cancelAccountDeletion(input: {
  readonly actor: ApiActor;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "cancelled" }> {
  requireDatabase();
  const database = getDatabase();
  const request = await database.query.privacyRequests.findFirst({
    where: and(
      eq(privacyRequests.personId, input.actor.personId),
      eq(privacyRequests.kind, "account-deletion"),
      inArray(privacyRequests.status, ["queued", "identity-review"]),
    ),
  });
  if (!request) {
    throw new PrivacyError(
      "REQUEST_NOT_FOUND",
      "No cancellable account-deletion request was found.",
    );
  }
  if (!["queued", "identity-review"].includes(request.status)) {
    throw new PrivacyError(
      "REQUEST_NOT_CANCELLABLE",
      "This deletion request can no longer be cancelled online.",
    );
  }
  await database.batch([
    database
      .update(privacyRequests)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(privacyRequests.id, request.id)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "privacy.account_deletion_cancelled",
      entityType: "privacy-request",
      entityId: request.id,
      reason: "Account deletion request was cancelled by the account holder.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: request.id, status: "cancelled" };
}
