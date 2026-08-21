import {
  appliedFees,
  auditLog,
  catalogItems,
  catalogEntitlements,
  catalogFulfillments,
  catalogPrices,
  courtBookingParticipants,
  courtBookings,
  getDatabase,
  isDatabaseConfigured,
  memberships,
  membershipPolicyAcceptances,
  membershipInvoiceTransactions,
  membershipTiers,
  operatorPaymentCollections,
  operatorPaymentEvents,
  orderItems,
  orders,
  orderTaxContexts,
  organizations,
  payments,
  people,
  pickupParticipants,
  registrations,
  tickets,
  webhookEvents,
  workflowJobs,
} from "@duna/db";
import {
  isOrganizationPlanId,
  membershipEntitlementMultiplier,
  ORGANIZATION_VIDEO_ADD_ONS,
  type MembershipSubscriptionPolicy,
} from "@duna/core";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  fulfillPaidCatalogOrder,
  releaseCatalogOrderInventory,
} from "./catalog-checkout";
import { reconcileTeamEntryPayment } from "./checkout";
import { reconcilePaidOrderDivisionSelections } from "./event-operations-service";
import {
  containAccountMedia,
  permanentlyDeleteAccount,
} from "./account-deletion";
import { issueOrganizationCredits } from "./catalog-service";
import { synchronizeIdentityVerification } from "./identity-verification";
import {
  processPlayerSourceConnection,
  processSandAutoApproveMatch,
} from "./sand-data/service";
import { connectAccountMoneyReady } from "./stripe-connect";
import {
  organizationSubscriptionIsActive,
  synchronizeOrganizationFeeMetadata,
} from "./organization-billing";
import {
  capCatalogInstallmentSubscription,
  organizationPlanForPriceId,
  organizationVideoPriceKindForPriceId,
  ensureMembershipSubscriptionSchedule,
  getStripeClient,
  retrieveChargeSettlementAvailableAt,
  withholdDestinationChargeTax,
  withholdDestinationChargePlatformFee,
} from "./payments";
import { processMessageSafetyWorkflow } from "./duna-ai-support";
import {
  dispatchMessagingPushNotifications,
  processMessagingPushReceipts,
} from "./messaging-notifications";
import {
  recordPaymentFundSchedule,
  synchronizeMoneyDispute,
  synchronizeMoneyPayout,
  synchronizeMoneyRefund,
} from "./money-service";
import { sendTransactionalEmail } from "./resend";
import {
  redeemPromoCodeForOrder,
  releasePromoCodeForOrder,
} from "./promo-codes";

export { connectAccountMoneyReady } from "./stripe-connect";

export type WorkflowStatus =
  "queued" | "running" | "retry" | "succeeded" | "failed";

export interface WorkflowJobResult {
  readonly id: string;
  readonly kind: string;
  readonly status: WorkflowStatus;
  readonly attempts: number;
  readonly completedAt?: string;
}

export function retryDelayMilliseconds(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("Workflow attempt must be a positive integer");
  }
  return Math.min(15 * 60_000, 5_000 * 2 ** Math.min(attempt - 1, 12));
}

function workflowStatus(value: string): WorkflowStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "retry" ||
    value === "succeeded" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error(`Invalid workflow status: ${value}`);
}

function stringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Workflow payload is missing ${key}`);
  }
  return field;
}

function optionalString(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function unixDate(value: unknown): Date | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1_000)
    : undefined;
}

export function stripeSubscriptionItemPriceId(
  item: Readonly<Record<string, unknown>>,
): string | undefined {
  const price = item.price as Readonly<Record<string, unknown>> | undefined;
  return typeof price?.id === "string"
    ? price.id
    : typeof item.price === "string"
      ? item.price
      : undefined;
}

function stripeSubscriptionItemQuantity(
  item: Readonly<Record<string, unknown>>,
): number {
  return typeof item.quantity === "number" &&
    Number.isSafeInteger(item.quantity)
    ? Math.max(0, item.quantity)
    : 0;
}

export function organizationVideoCapacityForSubscription(input: {
  readonly status: string;
  readonly uploadPackQuantity: number;
  readonly livePackQuantity: number;
  readonly payAsYouGo: boolean;
}): {
  readonly uploadAddonSeconds: number;
  readonly liveAddonSeconds: number;
  readonly payAsYouGo: boolean;
} {
  if (!organizationSubscriptionIsActive(input.status)) {
    return {
      uploadAddonSeconds: 0,
      liveAddonSeconds: 0,
      payAsYouGo: false,
    };
  }
  return {
    uploadAddonSeconds:
      input.uploadPackQuantity *
      ORGANIZATION_VIDEO_ADD_ONS.upload.hours *
      60 *
      60,
    liveAddonSeconds:
      input.livePackQuantity * ORGANIZATION_VIDEO_ADD_ONS.live.hours * 60 * 60,
    payAsYouGo: input.payAsYouGo,
  };
}

async function synchronizeOrganizationSubscription(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly traceId: string;
}): Promise<void> {
  const database = getDatabase();
  const metadata = input.object.metadata as
    Readonly<Record<string, unknown>> | undefined;
  const subscriptionId = optionalString(input.object, "id");
  if (!subscriptionId) {
    throw new Error("Stripe organization subscription is missing its id");
  }
  const existing = await database.query.organizations.findFirst({
    where: eq(organizations.stripeSubscriptionId, subscriptionId),
  });
  const organizationId =
    typeof metadata?.dunaOrganizationId === "string"
      ? metadata.dunaOrganizationId
      : existing?.id;
  if (!organizationId) {
    throw new Error(
      "Stripe subscription is missing Duna organization metadata",
    );
  }
  const organization =
    existing ??
    (await database.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    }));
  if (!organization) throw new Error("Duna organization was not found");
  if (
    organization.stripeSubscriptionId &&
    organization.stripeSubscriptionId !== subscriptionId &&
    !["canceled", "cancelled", "incomplete_expired"].includes(
      organization.stripeSubscriptionStatus ?? "",
    )
  ) {
    throw new Error("Duna organization is bound to another subscription");
  }
  const items = input.object.items as
    | {
        readonly data?: readonly Readonly<Record<string, unknown>>[];
      }
    | undefined;
  const subscriptionItems = items?.data ?? [];
  const mappedPlan = subscriptionItems
    .map(stripeSubscriptionItemPriceId)
    .flatMap((priceId) =>
      priceId ? [organizationPlanForPriceId(priceId)] : [],
    )
    .find(Boolean);
  const metadataPlan =
    typeof metadata?.dunaPlan === "string" &&
    isOrganizationPlanId(metadata.dunaPlan) &&
    metadata.dunaPlan !== "coach"
      ? metadata.dunaPlan
      : undefined;
  const selectedPlan = mappedPlan?.plan ?? metadataPlan;
  if (!selectedPlan) {
    throw new Error(
      "Stripe subscription price is not mapped to a Duna HQ plan",
    );
  }
  const selectedItem = subscriptionItems.find(
    (item) =>
      organizationPlanForPriceId(stripeSubscriptionItemPriceId(item) ?? "")
        ?.plan === selectedPlan,
  );
  const videoItems = subscriptionItems.map((item) => ({
    kind: organizationVideoPriceKindForPriceId(
      stripeSubscriptionItemPriceId(item) ?? "",
    ),
    quantity: stripeSubscriptionItemQuantity(item),
  }));
  const uploadPackQuantity = videoItems
    .filter((item) => item.kind === "upload-pack")
    .reduce((sum, item) => sum + item.quantity, 0);
  const livePackQuantity = videoItems
    .filter((item) => item.kind === "live-pack")
    .reduce((sum, item) => sum + item.quantity, 0);
  const payAsYouGo =
    videoItems.some((item) => item.kind === "upload-payg") &&
    videoItems.some((item) => item.kind === "live-payg");
  const customer = input.object.customer;
  const customerId =
    typeof customer === "string"
      ? customer
      : customer && typeof customer === "object" && "id" in customer
        ? String(customer.id)
        : organization.stripeBillingCustomerId;
  const status = optionalString(input.object, "status") ?? "unknown";
  const videoCapacity = organizationVideoCapacityForSubscription({
    status,
    uploadPackQuantity,
    livePackQuantity,
    payAsYouGo,
  });
  const currentPeriodStartsAt =
    unixDate(input.object.current_period_start) ??
    unixDate(selectedItem?.current_period_start);
  const currentPeriodEndsAt =
    unixDate(input.object.current_period_end) ??
    unixDate(selectedItem?.current_period_end);
  await database.batch([
    database
      .update(organizations)
      .set({
        plan: selectedPlan,
        stripeBillingCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeSubscriptionStatus: status,
        planBillingInterval:
          mappedPlan?.interval ?? organization.planBillingInterval,
        planCurrentPeriodStartsAt: currentPeriodStartsAt,
        planCurrentPeriodEndsAt: currentPeriodEndsAt,
        planCancelAtPeriodEnd: input.object.cancel_at_period_end === true,
        videoUploadAddonSeconds: videoCapacity.uploadAddonSeconds,
        videoLiveAddonSeconds: videoCapacity.liveAddonSeconds,
        videoPaygEnabled: videoCapacity.payAsYouGo,
        stripeFeeMetadataStatus: organization.stripeAccountId
          ? "pending"
          : "not-connected",
        stripeFeeMetadataSyncedAt: null,
        updatedAt: input.occurredAt,
      })
      .where(eq(organizations.id, organization.id)),
    database.insert(auditLog).values({
      organizationId: organization.id,
      actorType: "system",
      action: "organization.plan_synchronized",
      entityType: "organization",
      entityId: organization.id,
      reason: `Stripe synchronized the ${selectedPlan} organization plan as ${status}.`,
      traceId: input.traceId,
      createdAt: input.occurredAt,
    }),
  ]);
  await synchronizeOrganizationFeeMetadata({
    organizationId: organization.id,
    now: input.occurredAt,
  });
}

async function synchronizeSubscription(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly traceId: string;
}): Promise<void> {
  const metadata = input.object.metadata as
    Readonly<Record<string, unknown>> | undefined;
  const subscriptionId = optionalString(input.object, "id");
  const organization = subscriptionId
    ? await getDatabase().query.organizations.findFirst({
        where: eq(organizations.stripeSubscriptionId, subscriptionId),
      })
    : undefined;
  if (metadata?.product === "duna-hq" || organization) {
    await synchronizeOrganizationSubscription(input);
    return;
  }
  await synchronizeMembership(input);
}

async function synchronizeMembership(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly traceId: string;
}): Promise<void> {
  const database = getDatabase();
  const metadata = input.object.metadata as
    Readonly<Record<string, unknown>> | undefined;
  const personId =
    typeof metadata?.dunaPersonId === "string"
      ? metadata.dunaPersonId
      : undefined;
  const subscriptionId = optionalString(input.object, "id");
  if (!personId || !subscriptionId) {
    throw new Error("Stripe subscription is missing Duna membership metadata");
  }
  const items = input.object.items as
    | {
        readonly data?: readonly Readonly<Record<string, unknown>>[];
      }
    | undefined;
  const subscriptionItems = items?.data ?? [];
  const priceIds = subscriptionItems
    .map(stripeSubscriptionItemPriceId)
    .filter((priceId): priceId is string => Boolean(priceId));
  if (priceIds.length === 0) {
    throw new Error("Stripe subscription price is missing");
  }
  const tier = await database.query.membershipTiers.findFirst({
    where: inArray(membershipTiers.stripePriceId, priceIds),
  });
  if (!tier) {
    throw new Error("Stripe subscription price is not mapped to a Duna tier");
  }
  const priceId = tier.stripePriceId;
  if (!priceId) {
    throw new Error("Duna membership tier is missing its Stripe price");
  }
  const membershipItem = subscriptionItems.find(
    (item) => stripeSubscriptionItemPriceId(item) === priceId,
  );
  const pauseCollection = input.object.pause_collection as
    Readonly<Record<string, unknown>> | null | undefined;
  const currentPeriodStartsAt =
    unixDate(input.object.current_period_start) ??
    unixDate(membershipItem?.current_period_start);
  const currentPeriodEndsAt =
    unixDate(input.object.current_period_end) ??
    unixDate(membershipItem?.current_period_end);
  const pausedUntil = unixDate(pauseCollection?.resumes_at);
  const status = optionalString(input.object, "status") ?? "unknown";
  const cancelAtPeriodEnd = input.object.cancel_at_period_end === true;
  const catalogOrderId =
    typeof metadata?.dunaOrderId === "string"
      ? metadata.dunaOrderId
      : undefined;
  const policyAcceptance = catalogOrderId
    ? await database.query.membershipPolicyAcceptances.findFirst({
        where: eq(membershipPolicyAcceptances.orderId, catalogOrderId),
      })
    : undefined;
  const policy = policyAcceptance?.policySnapshot as
    MembershipSubscriptionPolicy | undefined;
  const trialEndsAt = unixDate(input.object.trial_end);
  const existing = await database.query.memberships.findFirst({
    where: eq(memberships.stripeSubscriptionId, subscriptionId),
  });
  const membershipId = existing?.id ?? crypto.randomUUID();
  if (existing && existing.personId !== personId) {
    throw new Error("Stripe subscription is bound to a different Duna person");
  }
  if (existing) {
    await database
      .update(memberships)
      .set({
        tierId: tier.id,
        status,
        currentPeriodStartsAt,
        currentPeriodEndsAt,
        pausedUntil,
        cancelAtPeriodEnd,
        subscriptionPolicySnapshot:
          policy ?? existing.subscriptionPolicySnapshot,
        trialEndsAt,
        updatedAt: input.occurredAt,
      })
      .where(eq(memberships.id, existing.id));
  } else {
    await database.insert(memberships).values({
      id: membershipId,
      personId,
      tierId: tier.id,
      status,
      stripeSubscriptionId: subscriptionId,
      currentPeriodStartsAt,
      currentPeriodEndsAt,
      pausedUntil,
      cancelAtPeriodEnd,
      subscriptionPolicySnapshot: policy,
      trialEndsAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }
  if (policy?.initialTermMonths) {
    const schedule = await ensureMembershipSubscriptionSchedule({
      subscriptionId,
      policy,
      idempotencyKey: `membership-schedule:${subscriptionId}:${policy.version}`,
    });
    await database
      .update(memberships)
      .set({
        stripeSubscriptionScheduleId: schedule.scheduleId,
        initialTermEndsAt: schedule.initialTermEndsAt,
        updatedAt: input.occurredAt,
      })
      .where(eq(memberships.stripeSubscriptionId, subscriptionId));
  }
  if (policyAcceptance) {
    await database
      .insert(workflowJobs)
      .values({
        kind: "membership.policy-acknowledgment",
        idempotencyKey: `membership-policy-acknowledgment:${policyAcceptance.id}`,
        payload: { acceptanceId: policyAcceptance.id },
        availableAt: input.occurredAt,
        traceId: input.traceId,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      })
      .onConflictDoNothing();
  }
  const reminderTarget = trialEndsAt ?? currentPeriodEndsAt;
  if (
    policy &&
    reminderTarget &&
    policy.renewalBehavior === "automatic" &&
    !cancelAtPeriodEnd
  ) {
    const reminderDays = trialEndsAt
      ? policy.trialDays > 31
        ? Math.min(21, Math.max(3, policy.renewalReminderDays))
        : policy.renewalReminderDays
      : tier.interval === "year" || (policy.initialTermMonths ?? 0) >= 12
        ? Math.min(45, Math.max(15, policy.renewalReminderDays))
        : policy.renewalReminderDays;
    const availableAt = new Date(
      Math.max(
        input.occurredAt.getTime(),
        reminderTarget.getTime() - reminderDays * 86_400_000,
      ),
    );
    await database
      .insert(workflowJobs)
      .values({
        kind: "membership.renewal-reminder",
        idempotencyKey: `membership:${subscriptionId}:renewal:${reminderTarget.toISOString()}`,
        payload: {
          membershipId,
          subscriptionId,
          targetAt: reminderTarget.toISOString(),
          policyVersion: policy.version,
        },
        availableAt,
        traceId: input.traceId,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      })
      .onConflictDoNothing();
  }
  if (catalogOrderId) {
    const catalogPrice = await database.query.catalogPrices.findFirst({
      where: eq(catalogPrices.stripePriceId, priceId),
    });
    if (catalogPrice) {
      await database
        .update(catalogFulfillments)
        .set({
          status:
            status === "active" || status === "trialing"
              ? "fulfilled"
              : "pending",
          fulfilledAt:
            status === "active" || status === "trialing"
              ? input.occurredAt
              : null,
          updatedAt: input.occurredAt,
        })
        .where(
          and(
            eq(catalogFulfillments.orderId, catalogOrderId),
            eq(catalogFulfillments.catalogItemId, catalogPrice.catalogItemId),
          ),
        );
    }
  }
  await database.insert(auditLog).values({
    actorType: "system",
    action: "membership.synchronized",
    entityType: "membership",
    entityId: membershipId,
    reason: `Stripe subscription state synchronized as ${status}.`,
    traceId: input.traceId,
    createdAt: input.occurredAt,
  });
}

async function sendMembershipRenewalReminder(
  payload: Readonly<Record<string, unknown>>,
  now: Date,
): Promise<void> {
  const membershipId = stringField(payload, "membershipId");
  const targetAt = stringField(payload, "targetAt");
  const database = getDatabase();
  const row = (
    await database
      .select({
        membership: memberships,
        tier: membershipTiers,
        organization: organizations,
        person: people,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .innerJoin(
        organizations,
        eq(membershipTiers.organizationId, organizations.id),
      )
      .innerJoin(people, eq(memberships.personId, people.id))
      .where(eq(memberships.id, membershipId))
      .limit(1)
  )[0];
  if (
    !row ||
    !row.person.email ||
    row.membership.cancelAtPeriodEnd ||
    !["active", "trialing"].includes(row.membership.status)
  ) {
    return;
  }
  const currentTarget =
    row.membership.trialEndsAt ?? row.membership.currentPeriodEndsAt;
  if (!currentTarget || currentTarget.toISOString() !== targetAt) return;
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(currentTarget);
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: row.tier.currency,
  }).format(row.tier.priceMinor / 100);
  const result = await sendTransactionalEmail({
    to: row.person.email,
    subject: `${row.organization.name} membership renewal reminder`,
    text: `${row.tier.name} is scheduled to renew on ${formatted} for ${amount}. You can review the accepted policy or cancel online in Duna before renewal.`,
    idempotencyKey: `membership-renewal:${membershipId}:${targetAt}`,
  });
  if (!result.sent) {
    throw new Error(
      result.reason ?? "Membership renewal reminder could not be delivered.",
    );
  }
  await database.insert(auditLog).values({
    organizationId: row.organization.id,
    actorType: "system",
    action: "membership.renewal_reminder_sent",
    entityType: "membership",
    entityId: membershipId,
    reason: `Transactional renewal reminder sent for ${targetAt}.`,
    traceId:
      result.messageId ?? `membership-renewal:${membershipId}:${targetAt}`,
    createdAt: now,
  });
}

async function sendMembershipPolicyAcknowledgment(
  payload: Readonly<Record<string, unknown>>,
  now: Date,
): Promise<void> {
  const acceptanceId = stringField(payload, "acceptanceId");
  const database = getDatabase();
  const row = (
    await database
      .select({
        acceptance: membershipPolicyAcceptances,
        itemTitle: catalogItems.title,
        organizationName: organizations.name,
        email: people.email,
      })
      .from(membershipPolicyAcceptances)
      .innerJoin(
        catalogItems,
        eq(membershipPolicyAcceptances.catalogItemId, catalogItems.id),
      )
      .innerJoin(
        organizations,
        eq(membershipPolicyAcceptances.organizationId, organizations.id),
      )
      .innerJoin(people, eq(membershipPolicyAcceptances.personId, people.id))
      .where(eq(membershipPolicyAcceptances.id, acceptanceId))
      .limit(1)
  )[0];
  if (!row?.email) return;
  const result = await sendTransactionalEmail({
    to: row.email,
    subject: `${row.organizationName} membership confirmation`,
    text: `${row.itemTitle}\n\nTerms you accepted:\n${row.acceptance.disclosureText}\n\nManage or cancel online: https://duna.coach/app/wallet#memberships\n\nPolicy version: ${row.acceptance.policyVersion}\nAccepted: ${row.acceptance.acceptedAt.toISOString()}`,
    idempotencyKey: `membership-policy-acknowledgment:${acceptanceId}`,
  });
  if (!result.sent) {
    throw new Error(
      result.reason ?? "Membership confirmation could not be delivered.",
    );
  }
  await database.insert(auditLog).values({
    organizationId: row.acceptance.organizationId,
    actorType: "system",
    action: "membership.policy_acknowledgment_sent",
    entityType: "membership-policy-acceptance",
    entityId: row.acceptance.id,
    reason: "Retainable membership terms and online cancellation link sent.",
    traceId: result.messageId ?? `membership-policy:${acceptanceId}`,
    createdAt: now,
  });
}

async function markMembershipPaymentFailed(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly traceId: string;
}): Promise<void> {
  const subscriptionField = input.object.subscription;
  const parent = input.object.parent as
    | {
        readonly subscription_details?: Readonly<Record<string, unknown>>;
      }
    | undefined;
  const subscriptionId =
    typeof subscriptionField === "string"
      ? subscriptionField
      : typeof parent?.subscription_details?.subscription === "string"
        ? parent.subscription_details.subscription
        : undefined;
  if (!subscriptionId) {
    throw new Error("Failed Stripe invoice is missing its subscription");
  }
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.stripeSubscriptionId, subscriptionId),
  });
  if (organization) {
    await database.batch([
      database
        .update(organizations)
        .set({
          stripeSubscriptionStatus: "past_due",
          stripeFeeMetadataStatus: organization.stripeAccountId
            ? "pending"
            : "not-connected",
          stripeFeeMetadataSyncedAt: null,
          updatedAt: input.occurredAt,
        })
        .where(eq(organizations.id, organization.id)),
      database.insert(auditLog).values({
        organizationId: organization.id,
        actorType: "system",
        action: "organization.plan_payment_failed",
        entityType: "organization",
        entityId: organization.id,
        reason:
          "Stripe reported a failed Duna HQ invoice; Free-plan transaction pricing is effective until billing recovers.",
        traceId: input.traceId,
        createdAt: input.occurredAt,
      }),
    ]);
    await synchronizeOrganizationFeeMetadata({
      organizationId: organization.id,
      now: input.occurredAt,
    });
    return;
  }
  const membership = await database.query.memberships.findFirst({
    where: eq(memberships.stripeSubscriptionId, subscriptionId),
  });
  if (!membership) {
    throw new Error("Failed Stripe invoice membership was not found");
  }
  const tier = await database.query.membershipTiers.findFirst({
    where: eq(membershipTiers.id, membership.tierId),
  });
  const invoiceId = optionalString(input.object, "id") ?? input.traceId;
  await database.batch([
    database
      .update(memberships)
      .set({ status: "past_due", updatedAt: input.occurredAt })
      .where(eq(memberships.id, membership.id)),
    database.insert(auditLog).values({
      actorType: "system",
      action: "membership.payment_failed",
      entityType: "membership",
      entityId: membership.id,
      reason: "Stripe reported a failed membership invoice.",
      traceId: input.traceId,
      createdAt: input.occurredAt,
    }),
    ...(tier?.organizationId
      ? [
          database
            .insert(membershipInvoiceTransactions)
            .values({
              membershipId: membership.id,
              organizationId: tier.organizationId,
              personId: membership.personId,
              stripeSubscriptionId: subscriptionId,
              stripeInvoiceId: invoiceId,
              amountPaidMinor: 0,
              taxAmountMinor: 0,
              currency:
                typeof input.object.currency === "string"
                  ? input.object.currency.toUpperCase()
                  : tier.currency,
              status: "failed",
              createdAt: input.occurredAt,
              updatedAt: input.occurredAt,
            })
            .onConflictDoUpdate({
              target: membershipInvoiceTransactions.stripeInvoiceId,
              set: { status: "failed", updatedAt: input.occurredAt },
            }),
        ]
      : []),
  ]);
}

async function applyMembershipCycleBenefits(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly traceId: string;
}): Promise<void> {
  const subscriptionField = input.object.subscription;
  const parent = input.object.parent as
    | {
        readonly subscription_details?: Readonly<Record<string, unknown>>;
      }
    | undefined;
  const subscriptionId =
    typeof subscriptionField === "string"
      ? subscriptionField
      : typeof parent?.subscription_details?.subscription === "string"
        ? parent.subscription_details.subscription
        : undefined;
  if (!subscriptionId) {
    throw new Error("Paid membership invoice is missing its subscription");
  }
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.stripeSubscriptionId, subscriptionId),
  });
  if (organization) {
    const recovered = ["past_due", "unpaid", "incomplete"].includes(
      organization.stripeSubscriptionStatus ?? "",
    );
    if (recovered) {
      await database
        .update(organizations)
        .set({
          stripeSubscriptionStatus: "active",
          stripeFeeMetadataStatus: organization.stripeAccountId
            ? "pending"
            : "not-connected",
          stripeFeeMetadataSyncedAt: null,
          updatedAt: input.occurredAt,
        })
        .where(eq(organizations.id, organization.id));
    }
    await database.insert(auditLog).values({
      organizationId: organization.id,
      actorType: "system",
      action: "organization.plan_payment_succeeded",
      entityType: "organization",
      entityId: organization.id,
      reason: recovered
        ? "Stripe reported a paid Duna HQ invoice and restored paid-plan economics."
        : "Stripe reported a paid Duna HQ subscription invoice.",
      traceId: input.traceId,
      createdAt: input.occurredAt,
    });
    if (recovered) {
      await synchronizeOrganizationFeeMetadata({
        organizationId: organization.id,
        now: input.occurredAt,
      });
    }
    return;
  }
  const membership = await database.query.memberships.findFirst({
    where: eq(memberships.stripeSubscriptionId, subscriptionId),
  });
  if (!membership) {
    // Stripe does not guarantee event ordering. Retrying allows the
    // subscription projection to land before cycle benefits are granted.
    throw new Error(
      "Membership is not synchronized yet; retrying cycle benefits",
    );
  }
  const tier = await database.query.membershipTiers.findFirst({
    where: eq(membershipTiers.id, membership.tierId),
  });
  if (!tier?.organizationId || !tier.stripePriceId) {
    return;
  }
  const catalogPrice = await database.query.catalogPrices.findFirst({
    where: eq(catalogPrices.stripePriceId, tier.stripePriceId),
  });
  if (!catalogPrice) return;
  const invoiceId = optionalString(input.object, "id") ?? input.traceId;
  const amountPaidMinor =
    typeof input.object.amount_paid === "number" ? input.object.amount_paid : 0;
  const currency =
    typeof input.object.currency === "string"
      ? input.object.currency.toUpperCase()
      : tier.currency;
  const taxRows = Array.isArray(input.object.total_taxes)
    ? input.object.total_taxes
    : Array.isArray(input.object.total_tax_amounts)
      ? input.object.total_tax_amounts
      : [];
  const taxAmountMinor = taxRows.reduce(
    (total, row) =>
      total +
      (row &&
      typeof row === "object" &&
      "amount" in row &&
      typeof row.amount === "number"
        ? row.amount
        : 0),
    0,
  );
  const paidInvoicePayment = (
    await getStripeClient().invoicePayments.list({
      invoice: invoiceId,
      status: "paid",
      limit: 10,
    })
  ).data.find((payment) => payment.payment.type === "payment_intent");
  const paymentIntentId =
    typeof paidInvoicePayment?.payment.payment_intent === "string"
      ? paidInvoicePayment.payment.payment_intent
      : paidInvoicePayment?.payment.payment_intent?.id;
  const taxTransferReversalId =
    taxAmountMinor > 0 && paymentIntentId
      ? await withholdDestinationChargeTax({
          paymentIntentId,
          taxAmountMinor,
          orderId: `membership-invoice:${invoiceId}`,
          idempotencyKey: `membership-invoice:${invoiceId}:tax-withholding`,
        })
      : undefined;
  const subscriptionDetails = parent?.subscription_details;
  const subscriptionMetadata = subscriptionDetails?.metadata as
    Readonly<Record<string, unknown>> | undefined;
  const originalOrderId =
    typeof subscriptionMetadata?.dunaOrderId === "string"
      ? subscriptionMetadata.dunaOrderId
      : undefined;
  const originalOrder = originalOrderId
    ? await database.query.orders.findFirst({
        where: eq(orders.id, originalOrderId),
      })
    : undefined;
  const renewalOrder = paymentIntentId
    ? await database.query.orders.findFirst({
        where: eq(orders.stripePaymentIntentId, paymentIntentId),
      })
    : undefined;
  const orderId = originalOrder?.id ?? renewalOrder?.id ?? crypto.randomUUID();
  const applicationFeeMinor = Number(
    subscriptionMetadata?.dunaApplicationFeeMinor ?? 0,
  );
  if (
    paymentIntentId &&
    Number.isSafeInteger(applicationFeeMinor) &&
    applicationFeeMinor > 0
  ) {
    await withholdDestinationChargePlatformFee({
      paymentIntentId,
      amountMinor: applicationFeeMinor,
      invoiceId,
      idempotencyKey: `membership-invoice:${invoiceId}:platform-fee`,
    });
  }
  if (originalOrder || renewalOrder) {
    await database
      .update(orders)
      .set({
        status: "paid",
        taxTotalMinor: taxAmountMinor,
        totalMinor: amountPaidMinor,
        stripePaymentIntentId:
          paymentIntentId ??
          originalOrder?.stripePaymentIntentId ??
          renewalOrder?.stripePaymentIntentId,
        updatedAt: input.occurredAt,
      })
      .where(eq(orders.id, orderId));
  } else {
    await database.batch([
      database.insert(orders).values({
        id: orderId,
        organizationId: tier.organizationId,
        buyerPersonId: membership.personId,
        status: "paid",
        currency,
        subtotalMinor: Math.max(0, amountPaidMinor - taxAmountMinor),
        feeTotalMinor: 0,
        taxTotalMinor: taxAmountMinor,
        totalMinor: amountPaidMinor,
        stripePaymentIntentId: paymentIntentId,
        idempotencyKey: `stripe-membership-invoice:${invoiceId}`,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      }),
      database.insert(orderItems).values({
        orderId,
        kind: "catalog-plan",
        referenceId: catalogPrice.catalogVariantId,
        description: `${tier.name} renewal`,
        quantity: 1,
        unitAmountMinor: Math.max(0, amountPaidMinor - taxAmountMinor),
        totalAmountMinor: Math.max(0, amountPaidMinor - taxAmountMinor),
      }),
    ]);
  }
  const existingPayment = await database.query.payments.findFirst({
    where: eq(payments.orderId, orderId),
  });
  if (!existingPayment) {
    await database.insert(payments).values({
      orderId,
      method: "stripe-subscription-invoice",
      amountMinor: amountPaidMinor,
      currency,
      status: "succeeded",
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }
  if (applicationFeeMinor > 0) {
    await database
      .insert(appliedFees)
      .values({
        orderId,
        ruleId: `stripe-subscription-application-fee:${invoiceId}`,
        payer: "operator",
        amountMinor: applicationFeeMinor,
        currency,
        ruleInputs: { stripeInvoiceId: invoiceId },
      })
      .onConflictDoNothing();
  }
  await database
    .insert(membershipInvoiceTransactions)
    .values({
      membershipId: membership.id,
      organizationId: tier.organizationId,
      personId: membership.personId,
      stripeSubscriptionId: subscriptionId,
      stripeInvoiceId: invoiceId,
      stripePaymentIntentId: paymentIntentId,
      stripeTaxTransactionId:
        typeof input.object.tax === "string" ? input.object.tax : undefined,
      stripeTaxTransferReversalId: taxTransferReversalId,
      amountPaidMinor,
      taxAmountMinor,
      currency,
      status: "paid",
      paidAt: input.occurredAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    })
    .onConflictDoUpdate({
      target: membershipInvoiceTransactions.stripeInvoiceId,
      set: {
        stripePaymentIntentId: paymentIntentId,
        stripeTaxTransferReversalId: taxTransferReversalId,
        amountPaidMinor,
        taxAmountMinor,
        currency,
        status: "paid",
        paidAt: input.occurredAt,
        updatedAt: input.occurredAt,
      },
    });
  const acceptedPolicy = membership.subscriptionPolicySnapshot as
    MembershipSubscriptionPolicy | undefined;
  await recordPaymentFundSchedule({
    orderId,
    policyOverride: acceptedPolicy
      ? acceptedPolicy.refundBehavior === "none"
        ? {
            mode: "non-refundable",
            name: "Membership · non-refundable",
            version: 1,
          }
        : acceptedPolicy.refundBehavior === "prorated"
          ? {
              mode: "refundable",
              refundBeforeMinutes: 0,
              releaseAt: membership.currentPeriodEndsAt ?? undefined,
              name: "Membership · prorated through period end",
              version: 1,
            }
          : {
              mode: "refundable",
              refundBeforeMinutes:
                (acceptedPolicy.refundWindowDays ?? 7) * 24 * 60,
              name: `Membership · ${acceptedPolicy.refundWindowDays ?? 7}-day refund window`,
              version: 1,
            }
      : undefined,
    now: input.occurredAt,
  });
  const entitlement = await database.query.catalogEntitlements.findFirst({
    where: and(
      eq(catalogEntitlements.planCatalogItemId, catalogPrice.catalogItemId),
      eq(catalogEntitlements.kind, "credit-grant"),
    ),
  });
  if (!entitlement?.quantity) return;
  const person = await database.query.people.findFirst({
    where: eq(people.id, membership.personId),
  });
  await issueOrganizationCredits({
    actor: {
      personId: membership.personId,
      displayName: person?.displayName ?? "Duna member",
      roles: ["player"],
      organizationId: tier.organizationId,
      scopes: ["wallet:write"],
      ageBand: "adult",
      isDemo: false,
    },
    personId: membership.personId,
    credits:
      entitlement.quantity *
      membershipEntitlementMultiplier(
        catalogPrice.recurringInterval,
        catalogPrice.recurringIntervalCount ?? 1,
      ),
    expiresAt: membership.currentPeriodEndsAt ?? undefined,
    valueMinor: 0,
    currency: tier.currency,
    valueSource: "membership-benefit",
    reason: `Membership cycle credits issued for invoice ${invoiceId}.`,
    requestId: `membership-invoice:${invoiceId}:credits`,
    now: input.occurredAt,
  });
}

async function synchronizeConnectAccount(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly traceId: string;
}): Promise<void> {
  const accountId = optionalString(input.object, "id");
  if (!accountId) throw new Error("Stripe account update is missing its id");
  const metadata = input.object.metadata as
    Readonly<Record<string, unknown>> | undefined;
  const metadataOrganizationId =
    typeof metadata?.dunaEntityId === "string"
      ? metadata.dunaEntityId
      : undefined;
  const database = getDatabase();
  const organization =
    (await database.query.organizations.findFirst({
      where: eq(organizations.stripeAccountId, accountId),
    })) ??
    (metadataOrganizationId
      ? await database.query.organizations.findFirst({
          where: eq(organizations.id, metadataOrganizationId),
        })
      : undefined);
  if (!organization) {
    throw new Error("Stripe account is not mapped to a Duna organization");
  }
  if (
    organization.stripeAccountId &&
    organization.stripeAccountId !== accountId
  ) {
    throw new Error("Stripe account metadata conflicts with the Duna mapping");
  }
  const transfersEnabled = connectAccountTransfersReady(input.object);
  const chargesEnabled = connectAccountMoneyReady(input.object);
  const accountType =
    optionalString(input.object, "type") ??
    (transfersEnabled ? "v2-recipient" : "connected");
  await database.batch([
    database
      .update(organizations)
      .set({
        stripeAccountId: accountId,
        stripeAccountType: accountType,
        stripeChargesEnabled: chargesEnabled,
        stripeTaxEnabled: chargesEnabled,
        taxRegistrationStatus: chargesEnabled
          ? organization.taxRegistrationStatus === "active"
            ? "active"
            : "pending"
          : "not-configured",
        updatedAt: input.occurredAt,
      })
      .where(eq(organizations.id, organization.id)),
    database.insert(auditLog).values({
      organizationId: organization.id,
      actorType: "system",
      action: "stripe.account_synchronized",
      entityType: "organization",
      entityId: organization.id,
      reason: chargesEnabled
        ? "Stripe confirmed that the connected account can receive Duna payments."
        : "Stripe connected-account requirements remain incomplete or restricted.",
      traceId: input.traceId,
      createdAt: input.occurredAt,
    }),
  ]);
}

function connectAccountTransfersReady(
  object: Readonly<Record<string, unknown>>,
): boolean {
  const capabilities = object.capabilities as
    Readonly<Record<string, unknown>> | undefined;
  return (
    capabilities?.transfers === "active" && object.payouts_enabled === true
  );
}

async function processStripeWorkflow(
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
  const webhookEventId = stringField(payload, "webhookEventId");
  const database = getDatabase();
  const webhook = await database.query.webhookEvents.findFirst({
    where: eq(webhookEvents.id, webhookEventId),
  });
  if (!webhook) throw new Error("Persisted Stripe webhook was not found");

  const action = stringField(payload, "action");
  const eventPayload = webhook.payload as {
    readonly id?: string;
    readonly created?: number;
    readonly data?: { readonly object?: Readonly<Record<string, unknown>> };
  };
  const object = eventPayload.data?.object;
  if (!object) throw new Error("Stripe event object is missing");
  const occurredAt =
    typeof eventPayload.created === "number"
      ? new Date(eventPayload.created * 1_000)
      : new Date();

  if (action === "membership.synchronized") {
    await synchronizeSubscription({
      object,
      occurredAt,
      traceId: eventPayload.id ?? webhook.providerEventId,
    });
  } else if (action === "membership.payment_succeeded") {
    await applyMembershipCycleBenefits({
      object,
      occurredAt,
      traceId: eventPayload.id ?? webhook.providerEventId,
    });
  } else if (action === "membership.payment_failed") {
    await markMembershipPaymentFailed({
      object,
      occurredAt,
      traceId: eventPayload.id ?? webhook.providerEventId,
    });
  } else if (action === "connect.synchronized") {
    await synchronizeConnectAccount({
      object,
      occurredAt,
      traceId: eventPayload.id ?? webhook.providerEventId,
    });
  } else if (action === "payout.synchronized") {
    await synchronizeMoneyPayout({ object, now: occurredAt });
  } else if (action === "dispute.synchronized") {
    await synchronizeMoneyDispute({ object, now: occurredAt });
  } else if (action === "refund.synchronized") {
    await synchronizeMoneyRefund({ object, now: occurredAt });
  } else if (action === "identity.synchronized") {
    await synchronizeIdentityVerification({
      object,
      eventType: webhook.eventType,
      occurredAt,
      traceId: eventPayload.id ?? webhook.providerEventId,
    });
  } else if (action === "order.payment_succeeded") {
    const metadata = object.metadata as
      Readonly<Record<string, unknown>> | undefined;
    const paymentIntentId =
      typeof object.id === "string" ? object.id : undefined;
    const intentOrder = paymentIntentId
      ? await database.query.orders.findFirst({
          where: eq(orders.stripePaymentIntentId, paymentIntentId),
        })
      : undefined;
    const orderId =
      typeof metadata?.dunaOrderId === "string"
        ? metadata.dunaOrderId
        : intentOrder?.id;
    if (!orderId) throw new Error("Stripe payment is missing dunaOrderId");
    const order = await database.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) throw new Error("Stripe payment order was not found");
    const amountReceived =
      typeof object.amount_received === "number"
        ? object.amount_received
        : undefined;
    const paymentCurrency =
      typeof object.currency === "string"
        ? object.currency.toUpperCase()
        : undefined;
    if (
      amountReceived === undefined ||
      amountReceived < order.totalMinor ||
      paymentCurrency !== order.currency
    ) {
      throw new Error("Stripe payment amount does not match the Duna order");
    }
    if (!paymentIntentId)
      throw new Error("Stripe payment intent id is missing");
    const latestCharge =
      typeof object.latest_charge === "string"
        ? object.latest_charge
        : typeof object.latest_charge === "object" &&
            object.latest_charge !== null &&
            "id" in object.latest_charge &&
            typeof object.latest_charge.id === "string"
          ? object.latest_charge.id
          : null;
    if (amountReceived !== order.totalMinor) {
      const taxTotalMinor = amountReceived - order.totalMinor;
      const taxContext = await database.query.orderTaxContexts.findFirst({
        where: eq(orderTaxContexts.orderId, order.id),
      });
      const stripeTransferReversalId =
        taxContext?.stripeTransferReversalId ??
        (await withholdDestinationChargeTax({
          paymentIntentId,
          latestChargeId: latestCharge ?? undefined,
          taxAmountMinor: taxTotalMinor,
          orderId: order.id,
          idempotencyKey: `marketplace-tax:${order.id}:${paymentIntentId}`,
        }));
      await database.batch([
        database
          .update(orders)
          .set({
            taxTotalMinor: order.taxTotalMinor + taxTotalMinor,
            totalMinor: amountReceived,
            updatedAt: occurredAt,
          })
          .where(eq(orders.id, order.id)),
        database
          .update(orderTaxContexts)
          .set({
            taxAmountMinor: taxTotalMinor,
            status: "committed",
            committedAt: occurredAt,
            stripeTransferReversalId,
            taxWithheldAt: stripeTransferReversalId ? occurredAt : undefined,
          })
          .where(eq(orderTaxContexts.orderId, order.id)),
      ]);
    }
    await database.execute(sql`
      SELECT duna_project_order_payment(
        ${order.id}::uuid,
        ${paymentIntentId}::text,
        ${latestCharge}::text,
        ${occurredAt}::timestamptz,
        ${eventPayload.id ?? webhook.providerEventId}::text
      )
    `);
    const operatorCollectionId =
      typeof metadata?.dunaCollectionId === "string"
        ? metadata.dunaCollectionId
        : undefined;
    if (operatorCollectionId) {
      await database.batch([
        database
          .update(payments)
          .set({ method: "stripe-terminal", updatedAt: occurredAt })
          .where(eq(payments.orderId, order.id)),
        database
          .update(operatorPaymentCollections)
          .set({
            status: "succeeded",
            declineCode: null,
            failureCode: null,
            failureMessage: null,
            completedAt: occurredAt,
            updatedAt: occurredAt,
          })
          .where(eq(operatorPaymentCollections.id, operatorCollectionId)),
        database
          .insert(operatorPaymentEvents)
          .values({
            collectionId: operatorCollectionId,
            organizationId: order.organizationId!,
            eventType: "terminal.approved",
            status: "succeeded",
            idempotencyKey: `stripe:${eventPayload.id ?? webhook.providerEventId}:operator-payment`,
            message: "Stripe webhook confirmed the card-present payment.",
            details: { paymentIntentId },
            createdAt: occurredAt,
          })
          .onConflictDoNothing(),
      ]);
    }
    await fulfillPaidCatalogOrder(order.id, occurredAt);
    await redeemPromoCodeForOrder(order.id, occurredAt);
    await reconcileTeamEntryPayment(order.id, occurredAt);
    await reconcilePaidOrderDivisionSelections({
      orderId: order.id,
      now: occurredAt,
      requestId: `payment-selection:${webhook.providerEventId}`,
    });
    await recordPaymentFundSchedule({
      orderId: order.id,
      processorAvailableAt: latestCharge
        ? await retrieveChargeSettlementAvailableAt(latestCharge)
        : undefined,
      now: occurredAt,
    });
  } else if (action === "checkout.completed") {
    const mode = optionalString(object, "mode");
    if (mode === "subscription") {
      const paymentStatus = optionalString(object, "payment_status");
      if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
        throw new Error(
          "Subscription checkout completed without a settled payment status",
        );
      }
      const metadata = object.metadata as
        Readonly<Record<string, unknown>> | undefined;
      const installmentCount = Number(metadata?.dunaInstallmentCount ?? 0);
      const installmentCheckout =
        metadata?.dunaPaymentOption === "installments" &&
        Number.isSafeInteger(installmentCount) &&
        installmentCount >= 2;
      const orderId =
        typeof metadata?.dunaOrderId === "string"
          ? metadata.dunaOrderId
          : undefined;
      if (
        !orderId &&
        (metadata?.product === "duna-membership" ||
          metadata?.product === "duna-hq")
      ) {
        return;
      }
      if (!orderId) {
        throw new Error("Subscription checkout is missing dunaOrderId");
      }
      const order = await database.query.orders.findFirst({
        where: eq(orders.id, orderId),
      });
      if (!order) throw new Error("Subscription checkout order was not found");
      if (installmentCheckout) {
        const subscriptionId = optionalString(object, "subscription");
        if (!subscriptionId) {
          throw new Error("Installment checkout is missing its subscription");
        }
        await capCatalogInstallmentSubscription({
          subscriptionId,
          installmentCount,
          idempotencyKey: `stripe:${webhook.providerEventId}:installment`,
        });
      }
      const amountTotal =
        typeof object.amount_total === "number"
          ? object.amount_total
          : order.totalMinor;
      const checkoutCurrency =
        typeof object.currency === "string"
          ? object.currency.toUpperCase()
          : order.currency;
      const firstInvoiceMinor = Number(
        metadata?.dunaInstallmentFirstInvoiceMinor ?? 0,
      );
      if (
        checkoutCurrency !== order.currency ||
        (installmentCheckout
          ? !Number.isSafeInteger(firstInvoiceMinor) ||
            firstInvoiceMinor <= 0 ||
            amountTotal < firstInvoiceMinor
          : amountTotal < order.totalMinor)
      ) {
        throw new Error(
          "Subscription checkout amount does not match its order",
        );
      }
      const taxTotalMinor = installmentCheckout
        ? amountTotal - firstInvoiceMinor
        : amountTotal - order.totalMinor;
      await database.batch([
        database
          .update(orders)
          .set({
            status: "paid",
            taxTotalMinor: order.taxTotalMinor + taxTotalMinor,
            totalMinor: installmentCheckout
              ? order.totalMinor + taxTotalMinor
              : amountTotal,
            updatedAt: occurredAt,
          })
          .where(eq(orders.id, order.id)),
        database
          .update(orderTaxContexts)
          .set({
            taxAmountMinor: taxTotalMinor,
            status: "committed",
            committedAt: occurredAt,
          })
          .where(eq(orderTaxContexts.orderId, order.id)),
      ]);
      const existingPayment = await database.query.payments.findFirst({
        where: and(
          eq(payments.orderId, order.id),
          eq(payments.method, "stripe-subscription-checkout"),
          eq(payments.status, "succeeded"),
        ),
      });
      if (!existingPayment) {
        await database.insert(payments).values({
          orderId: order.id,
          method: "stripe-subscription-checkout",
          amountMinor: amountTotal,
          currency: order.currency,
          status: "succeeded",
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
      }
      await fulfillPaidCatalogOrder(order.id, occurredAt);
      await redeemPromoCodeForOrder(order.id, occurredAt);
      await reconcileTeamEntryPayment(order.id, occurredAt);
      await reconcilePaidOrderDivisionSelections({
        orderId: order.id,
        now: occurredAt,
        requestId: `payment-selection:${webhook.providerEventId}`,
      });
      await recordPaymentFundSchedule({ orderId: order.id, now: occurredAt });
    }
  } else if (
    action === "order.payment_failed" ||
    action === "order.checkout_expired"
  ) {
    const metadata = object.metadata as
      Readonly<Record<string, unknown>> | undefined;
    const failedPaymentIntentId =
      typeof object.id === "string" ? object.id : undefined;
    const intentOrder = failedPaymentIntentId
      ? await database.query.orders.findFirst({
          where: eq(orders.stripePaymentIntentId, failedPaymentIntentId),
        })
      : undefined;
    const orderId =
      typeof metadata?.dunaOrderId === "string"
        ? metadata.dunaOrderId
        : intentOrder?.id;
    const operatorCollectionId =
      typeof metadata?.dunaCollectionId === "string"
        ? metadata.dunaCollectionId
        : undefined;
    if (operatorCollectionId && action === "order.payment_failed") {
      const lastPaymentError = object.last_payment_error as
        Readonly<Record<string, unknown>> | undefined;
      const declineCode = optionalString(
        lastPaymentError ?? {},
        "decline_code",
      );
      const failureCode = optionalString(lastPaymentError ?? {}, "code");
      const failureMessage = optionalString(lastPaymentError ?? {}, "message");
      const collection =
        await database.query.operatorPaymentCollections.findFirst({
          where: eq(operatorPaymentCollections.id, operatorCollectionId),
        });
      if (collection && collection.status !== "succeeded") {
        const nextStatus = declineCode ? "declined" : "failed";
        await database.batch([
          database
            .update(operatorPaymentCollections)
            .set({
              status: nextStatus,
              declineCode: declineCode ?? null,
              failureCode: failureCode ?? null,
              failureMessage: failureMessage ?? null,
              updatedAt: occurredAt,
            })
            .where(eq(operatorPaymentCollections.id, operatorCollectionId)),
          database
            .insert(operatorPaymentEvents)
            .values({
              collectionId: operatorCollectionId,
              organizationId: collection.organizationId,
              eventType: declineCode ? "terminal.declined" : "terminal.error",
              status: nextStatus,
              processorCode: declineCode ?? failureCode,
              message:
                failureMessage ?? "Stripe reported a card-present failure.",
              idempotencyKey: `stripe:${eventPayload.id ?? webhook.providerEventId}:operator-payment`,
              details: {},
              createdAt: occurredAt,
            })
            .onConflictDoNothing(),
        ]);
      }
      return;
    }
    if (orderId) {
      const failedAt = occurredAt;
      const failedOrder = await database.query.orders.findFirst({
        where: eq(orders.id, orderId),
      });
      if (failedOrder?.organizationId) {
        await releaseCatalogOrderInventory(
          failedOrder.organizationId,
          orderId,
          failedAt,
        );
      }
      await releasePromoCodeForOrder(orderId, failedAt);
      await database.batch([
        database
          .update(orders)
          .set({
            status:
              action === "order.checkout_expired" ? "cancelled" : "failed",
            updatedAt: failedAt,
          })
          .where(eq(orders.id, orderId)),
        database
          .update(registrations)
          .set({
            status: "cancelled",
            updatedAt: failedAt,
          })
          .where(eq(registrations.orderId, orderId)),
        database
          .update(pickupParticipants)
          .set({
            status: "cancelled",
            updatedAt: failedAt,
          })
          .where(eq(pickupParticipants.orderId, orderId)),
        database
          .update(tickets)
          .set({
            status: "void",
            updatedAt: failedAt,
          })
          .where(eq(tickets.orderId, orderId)),
        database
          .update(courtBookings)
          .set({
            status:
              action === "order.checkout_expired" ? "expired" : "cancelled",
            holdExpiresAt: null,
            updatedAt: failedAt,
          })
          .where(eq(courtBookings.orderId, orderId)),
        database
          .update(courtBookingParticipants)
          .set({
            status: "cancelled",
            updatedAt: failedAt,
          })
          .where(eq(courtBookingParticipants.orderId, orderId)),
        database
          .update(catalogFulfillments)
          .set({ status: "cancelled", updatedAt: failedAt })
          .where(eq(catalogFulfillments.orderId, orderId)),
        database.insert(auditLog).values({
          actorType: "system",
          action,
          entityType: "order",
          entityId: orderId,
          reason:
            action === "order.checkout_expired"
              ? "Stripe checkout expired and its capacity hold was released."
              : "Stripe payment failed and its capacity hold was released.",
          traceId: eventPayload.id ?? webhook.providerEventId,
          createdAt: failedAt,
        }),
      ]);
    }
  }

  // Each raw event remains replayable after projection so corrected handlers
  // can be rerun without asking Stripe to resend it.
  await database
    .update(webhookEvents)
    .set({
      status: "processed",
      attempts: sql`${webhookEvents.attempts} + 1`,
      processedAt: new Date(),
      error: null,
    })
    .where(eq(webhookEvents.id, webhook.id));
}

async function claimWorkflowJob(
  id: string,
  now: Date,
): Promise<
  | {
      readonly id: string;
      readonly kind: string;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly attempts: number;
      readonly maximumAttempts: number;
      readonly lockToken: string;
    }
  | undefined
> {
  const database = getDatabase();
  const lockToken = crypto.randomUUID();
  const [claimed] = await database
    .update(workflowJobs)
    .set({
      status: "running",
      attempts: sql`${workflowJobs.attempts} + 1`,
      lockedAt: now,
      lockToken,
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowJobs.id, id),
        or(
          and(
            eq(workflowJobs.status, "queued"),
            lte(workflowJobs.availableAt, now),
          ),
          and(
            eq(workflowJobs.status, "retry"),
            lte(workflowJobs.availableAt, now),
          ),
        ),
      ),
    )
    .returning({
      id: workflowJobs.id,
      kind: workflowJobs.kind,
      payload: workflowJobs.payload,
      attempts: workflowJobs.attempts,
      maximumAttempts: workflowJobs.maximumAttempts,
      lockToken: workflowJobs.lockToken,
    });
  if (!claimed?.lockToken) return undefined;
  return { ...claimed, lockToken: claimed.lockToken };
}

export async function processWorkflowJobById(
  id: string,
  now = new Date(),
): Promise<WorkflowJobResult | undefined> {
  if (!isDatabaseConfigured()) return undefined;
  const database = getDatabase();
  const claimed = await claimWorkflowJob(id, now);
  if (!claimed) {
    const existing = await database.query.workflowJobs.findFirst({
      where: eq(workflowJobs.id, id),
    });
    if (!existing) return undefined;
    return {
      id: existing.id,
      kind: existing.kind,
      status: workflowStatus(existing.status),
      attempts: existing.attempts,
      completedAt: existing.completedAt?.toISOString(),
    };
  }

  try {
    if (claimed.kind.startsWith("stripe.")) {
      await processStripeWorkflow(claimed.payload);
    } else if (claimed.kind === "sand.profile-import") {
      await processPlayerSourceConnection(claimed.payload);
    } else if (claimed.kind === "sand.auto-approve-match") {
      await processSandAutoApproveMatch(claimed.payload);
    } else if (claimed.kind === "privacy.account-containment") {
      await containAccountMedia({
        requestId: stringField(claimed.payload, "requestId"),
        personId: stringField(claimed.payload, "personId"),
        now,
      });
    } else if (claimed.kind === "privacy.account-deletion") {
      await permanentlyDeleteAccount({
        requestId: stringField(claimed.payload, "requestId"),
        personId: stringField(claimed.payload, "personId"),
        workflowJobId: claimed.id,
        now,
      });
    } else if (claimed.kind === "messaging.safesport-screen") {
      await processMessageSafetyWorkflow(
        { ...claimed.payload, traceId: claimed.id },
        now,
      );
    } else if (claimed.kind === "messaging.push-message") {
      await dispatchMessagingPushNotifications(claimed.payload, now);
    } else if (claimed.kind === "messaging.push-receipts") {
      await processMessagingPushReceipts(claimed.payload, now);
    } else if (claimed.kind === "membership.renewal-reminder") {
      await sendMembershipRenewalReminder(claimed.payload, now);
    } else if (claimed.kind === "membership.policy-acknowledgment") {
      await sendMembershipPolicyAcknowledgment(claimed.payload, now);
    } else {
      throw new Error(`No workflow handler is registered for ${claimed.kind}`);
    }
    const completedAt = new Date();
    await database
      .update(workflowJobs)
      .set({
        status: "succeeded",
        completedAt,
        lockedAt: null,
        lockToken: null,
        lastError: null,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(workflowJobs.id, claimed.id),
          eq(workflowJobs.lockToken, claimed.lockToken),
          eq(workflowJobs.status, "running"),
        ),
      );
    return {
      id: claimed.id,
      kind: claimed.kind,
      status: "succeeded",
      attempts: claimed.attempts,
      completedAt: completedAt.toISOString(),
    };
  } catch (error) {
    const terminal = claimed.attempts >= claimed.maximumAttempts;
    const message =
      error instanceof Error ? error.message : "Unknown workflow failure";
    await database
      .update(workflowJobs)
      .set({
        status: terminal ? "failed" : "retry",
        availableAt: terminal
          ? now
          : new Date(now.getTime() + retryDelayMilliseconds(claimed.attempts)),
        lockedAt: null,
        lockToken: null,
        lastError: message,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowJobs.id, claimed.id),
          eq(workflowJobs.lockToken, claimed.lockToken),
          eq(workflowJobs.status, "running"),
        ),
      );
    throw error;
  }
}

export async function recoverReadyWorkflowJobs(input?: {
  readonly limit?: number;
  readonly now?: Date;
}): Promise<readonly WorkflowJobResult[]> {
  if (!isDatabaseConfigured()) return [];
  const database = getDatabase();
  const now = input?.now ?? new Date();
  const candidates = await database
    .select({ id: workflowJobs.id })
    .from(workflowJobs)
    .where(
      and(
        or(
          and(
            eq(workflowJobs.status, "queued"),
            lte(workflowJobs.availableAt, now),
          ),
          and(
            eq(workflowJobs.status, "retry"),
            lte(workflowJobs.availableAt, now),
          ),
        ),
      ),
    )
    .orderBy(asc(workflowJobs.availableAt), asc(workflowJobs.createdAt))
    .limit(Math.min(100, Math.max(1, input?.limit ?? 25)));
  const settled = await Promise.allSettled(
    candidates.map(({ id }) => processWorkflowJobById(id, now)),
  );
  return settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}
