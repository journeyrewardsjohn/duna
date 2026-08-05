import {
  auditLog,
  consents,
  formResponses,
  getDatabase,
  guardianConsents,
  guardianships,
  healthConnections,
  healthSharingGrants,
  liveActivitySubscriptions,
  memberships,
  membershipTiers,
  organizationMemberships,
  organizations,
  organizationWallets,
  orderItems,
  orders,
  people,
  pickupParticipants,
  privacyRequests,
  ratings,
  registrations,
  videoShareLinks,
  videos,
  visionSessions,
  walletAccounts,
  walletLedger,
  workflowJobs,
} from "@duna/db";
import { foldWalletLedger } from "@duna/core";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { ApiActor } from "./context";
import type { AccountDeletionReadiness } from "./repository-contract";
import { exportHealthDataForPerson } from "./health-service";
import { accountDeletionScheduledFor } from "./account-deletion";

export class PrivacyError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "REQUEST_NOT_FOUND"
      | "REQUEST_NOT_CANCELLABLE"
      | "CASH_BALANCE_REMAINS"
      | "PENDING_CASH_REMAINS"
      | "ACTIVE_SUBSCRIPTION_REMAINS"
      | "ORGANIZATION_OWNERSHIP_REMAINS"
      | "CREDIT_FORFEITURE_REQUIRED",
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

export async function getAccountDeletionReadiness(
  personId: string,
): Promise<AccountDeletionReadiness> {
  requireDatabase();
  const database = getDatabase();
  const [walletAccount, walletRows, membershipRows, creditRows, ownerRows] =
    await Promise.all([
      database.query.walletAccounts.findFirst({
        where: eq(walletAccounts.personId, personId),
      }),
      database
        .select({
          id: walletLedger.id,
          direction: walletLedger.direction,
          amountMinor: walletLedger.amountMinor,
          currency: walletLedger.currency,
          status: walletLedger.status,
          taxCharacter: walletLedger.taxCharacter,
          reasonCode: walletLedger.reasonCode,
          createdAt: walletLedger.createdAt,
        })
        .from(walletLedger)
        .innerJoin(
          walletAccounts,
          eq(walletLedger.walletAccountId, walletAccounts.id),
        )
        .where(eq(walletAccounts.personId, personId))
        .orderBy(desc(walletLedger.createdAt)),
      database
        .select({
          membershipId: memberships.id,
          status: memberships.status,
          cancelAtPeriodEnd: memberships.cancelAtPeriodEnd,
          tierName: membershipTiers.name,
          organizationName: organizations.name,
        })
        .from(memberships)
        .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
        .leftJoin(
          organizations,
          eq(membershipTiers.organizationId, organizations.id),
        )
        .where(
          and(
            eq(memberships.personId, personId),
            inArray(memberships.status, [
              "active",
              "trialing",
              "past_due",
              "incomplete",
              "unpaid",
            ]),
          ),
        ),
      database
        .select({
          organizationId: organizations.id,
          organizationName: organizations.name,
          organizationSlug: organizations.slug,
          credits: organizationWallets.cachedAvailableCredits,
          unit: organizationWallets.unit,
        })
        .from(organizationWallets)
        .innerJoin(
          organizations,
          eq(organizationWallets.organizationId, organizations.id),
        )
        .where(
          and(
            eq(organizationWallets.personId, personId),
            inArray(organizationWallets.status, ["active", "frozen"]),
          ),
        ),
      database
        .select({
          organizationId: organizations.id,
          organizationName: organizations.name,
          organizationSlug: organizations.slug,
        })
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizationMemberships.organizationId, organizations.id),
        )
        .where(
          and(
            eq(organizationMemberships.personId, personId),
            eq(organizationMemberships.role, "owner"),
            eq(organizationMemberships.active, true),
          ),
        ),
    ]);

  const cash = foldWalletLedger(
    walletRows.map((row) => ({
      id: row.id,
      direction: row.direction,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status,
      taxCharacter: row.taxCharacter,
      reasonCode: row.reasonCode,
      occurredAt: row.createdAt.toISOString(),
    })),
  );
  const organizationCredits = creditRows.filter((row) => row.credits > 0);
  const blockingReasons: AccountDeletionReadiness["blockingReasons"][number][] =
    [];
  if (cash.availableMinor !== 0) blockingReasons.push("cash-balance");
  if (cash.pendingMinor !== 0 || cash.heldMinor !== 0) {
    blockingReasons.push("pending-cash");
  }
  if (membershipRows.length > 0) {
    blockingReasons.push("active-subscription");
  }
  if (ownerRows.length > 0) {
    blockingReasons.push("owned-organization");
  }

  return {
    canRequestDeletion: blockingReasons.length === 0,
    blockingReasons,
    cash: {
      availableMinor: cash.availableMinor,
      pendingMinor: cash.pendingMinor,
      heldMinor: cash.heldMinor,
      currency: walletAccount?.currency ?? cash.currency,
    },
    organizationCredits,
    totalOrganizationCredits: organizationCredits.reduce(
      (total, row) => total + row.credits,
      0,
    ),
    activeSubscriptions: membershipRows.map((membership) => ({
      membershipId: membership.membershipId,
      name: membership.tierName,
      organizationName: membership.organizationName ?? undefined,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    })),
    ownedOrganizations: ownerRows,
  };
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
    healthData,
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
    exportHealthDataForPerson(personId),
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
    health: healthData,
  };
}

export async function requestAccountDeletion(input: {
  readonly actor: ApiActor;
  readonly reason?: string;
  readonly forfeitOrganizationCredits: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly status: "queued" | "identity-review" | "legal-hold";
}> {
  requireDatabase();
  const database = getDatabase();
  const readiness = await getAccountDeletionReadiness(input.actor.personId);
  if (readiness.blockingReasons.includes("cash-balance")) {
    throw new PrivacyError(
      "CASH_BALANCE_REMAINS",
      "Withdraw or resolve the cash balance before deleting this account.",
    );
  }
  if (readiness.blockingReasons.includes("pending-cash")) {
    throw new PrivacyError(
      "PENDING_CASH_REMAINS",
      "Pending or held money must settle before deleting this account.",
    );
  }
  if (readiness.blockingReasons.includes("active-subscription")) {
    throw new PrivacyError(
      "ACTIVE_SUBSCRIPTION_REMAINS",
      "Cancel active memberships and subscriptions before deleting this account.",
    );
  }
  if (readiness.blockingReasons.includes("owned-organization")) {
    throw new PrivacyError(
      "ORGANIZATION_OWNERSHIP_REMAINS",
      "Transfer or close each organization you own before deleting this account.",
    );
  }
  if (
    readiness.totalOrganizationCredits > 0 &&
    !input.forfeitOrganizationCredits
  ) {
    throw new PrivacyError(
      "CREDIT_FORFEITURE_REQUIRED",
      "Explicit consent is required before unused organization credits can be forfeited.",
    );
  }
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
    const scheduledFor = accountDeletionScheduledFor(existing.createdAt);
    await database.batch([
      database
        .insert(workflowJobs)
        .values([
          {
            kind: "privacy.account-containment",
            idempotencyKey: existing.id,
            payload: {
              requestId: existing.id,
              personId: input.actor.personId,
            },
            maximumAttempts: 24,
            availableAt: input.now,
            traceId: input.requestId,
            createdAt: input.now,
            updatedAt: input.now,
          },
          {
            kind: "privacy.account-deletion",
            idempotencyKey: existing.id,
            payload: {
              requestId: existing.id,
              personId: input.actor.personId,
            },
            maximumAttempts: 48,
            availableAt: scheduledFor,
            traceId: input.requestId,
            createdAt: input.now,
            updatedAt: input.now,
          },
        ])
        .onConflictDoNothing(),
      database
        .update(healthSharingGrants)
        .set({ revokedAt: input.now, updatedAt: input.now })
        .where(
          and(
            or(
              eq(healthSharingGrants.ownerPersonId, input.actor.personId),
              eq(healthSharingGrants.audiencePersonId, input.actor.personId),
            ),
            isNull(healthSharingGrants.revokedAt),
          ),
        ),
      database
        .update(healthConnections)
        .set({
          status: "revoked",
          enabledCategories: [],
          revokedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(healthConnections.personId, input.actor.personId)),
      database
        .update(visionSessions)
        .set({
          status: "expired",
          revokedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(visionSessions.ownerPersonId, input.actor.personId)),
      database
        .update(videoShareLinks)
        .set({ revokedAt: input.now })
        .where(
          inArray(
            videoShareLinks.videoId,
            database
              .select({ id: videos.id })
              .from(videos)
              .where(eq(videos.ownerPersonId, input.actor.personId)),
          ),
        ),
      database
        .update(videos)
        .set({
          liveVisibility: "link-only",
          recordingVisibility: "private",
          publishedToProfile: false,
          updatedAt: input.now,
        })
        .where(eq(videos.ownerPersonId, input.actor.personId)),
      database
        .update(liveActivitySubscriptions)
        .set({ status: "revoked", revokedAt: input.now, updatedAt: input.now })
        .where(eq(liveActivitySubscriptions.personId, input.actor.personId)),
    ]);
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
  const scheduledFor = accountDeletionScheduledFor(input.now);
  await database.batch([
    database.insert(privacyRequests).values({
      id,
      personId: input.actor.personId,
      kind: "account-deletion",
      status: "queued",
      reason: [
        input.reason?.trim(),
        readiness.totalOrganizationCredits > 0
          ? `Account holder consented to forfeit ${readiness.totalOrganizationCredits} non-cash organization credits, subject to the issuing plan terms and applicable law.`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n\n"),
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database
      .update(healthSharingGrants)
      .set({ revokedAt: input.now, updatedAt: input.now })
      .where(
        and(
          or(
            eq(healthSharingGrants.ownerPersonId, input.actor.personId),
            eq(healthSharingGrants.audiencePersonId, input.actor.personId),
          ),
          isNull(healthSharingGrants.revokedAt),
        ),
      ),
    database
      .update(healthConnections)
      .set({
        status: "revoked",
        enabledCategories: [],
        revokedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(healthConnections.personId, input.actor.personId)),
    database
      .update(visionSessions)
      .set({
        status: "expired",
        revokedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(visionSessions.ownerPersonId, input.actor.personId)),
    database
      .update(videoShareLinks)
      .set({ revokedAt: input.now })
      .where(
        inArray(
          videoShareLinks.videoId,
          database
            .select({ id: videos.id })
            .from(videos)
            .where(eq(videos.ownerPersonId, input.actor.personId)),
        ),
      ),
    database
      .update(videos)
      .set({
        liveVisibility: "link-only",
        recordingVisibility: "private",
        publishedToProfile: false,
        updatedAt: input.now,
      })
      .where(eq(videos.ownerPersonId, input.actor.personId)),
    database
      .update(liveActivitySubscriptions)
      .set({ status: "revoked", revokedAt: input.now, updatedAt: input.now })
      .where(eq(liveActivitySubscriptions.personId, input.actor.personId)),
    database.insert(workflowJobs).values([
      {
        kind: "privacy.account-containment",
        idempotencyKey: id,
        payload: { requestId: id, personId: input.actor.personId },
        maximumAttempts: 24,
        availableAt: input.now,
        traceId: input.requestId,
        createdAt: input.now,
        updatedAt: input.now,
      },
      {
        kind: "privacy.account-deletion",
        idempotencyKey: id,
        payload: { requestId: id, personId: input.actor.personId },
        maximumAttempts: 48,
        availableAt: scheduledFor,
        traceId: input.requestId,
        createdAt: input.now,
        updatedAt: input.now,
      },
    ]),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "privacy.account_deletion_requested",
      entityType: "privacy-request",
      entityId: id,
      reason: `${
        readiness.totalOrganizationCredits > 0
          ? `Account deletion was requested with explicit consent to forfeit ${readiness.totalOrganizationCredits} eligible non-cash organization credits. `
          : "Account deletion was requested. "
      }Cash, subscription, and organization-ownership blockers were rechecked server-side. Health sharing, remote controls, public video visibility, share links, and live updates were revoked immediately. Permanent deletion is scheduled for ${scheduledFor.toISOString()}.`,
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
    database
      .update(workflowJobs)
      .set({
        status: "succeeded",
        completedAt: input.now,
        lockedAt: null,
        lockToken: null,
        lastError: null,
        updatedAt: input.now,
      })
      .where(
        and(
          inArray(workflowJobs.kind, [
            "privacy.account-containment",
            "privacy.account-deletion",
          ]),
          eq(workflowJobs.idempotencyKey, request.id),
          inArray(workflowJobs.status, ["queued", "retry"]),
        ),
      ),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "privacy.account_deletion_cancelled",
      entityType: "privacy-request",
      entityId: request.id,
      reason:
        "Account deletion was cancelled during the recovery window. Previously revoked Health grants, share links, remote controls, and public visibility were not automatically restored.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: request.id, status: "cancelled" };
}
