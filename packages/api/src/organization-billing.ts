import {
  ORGANIZATION_PLANS,
  organizationPlan,
  type OrganizationBillingInterval,
  type OrganizationPlanId,
  type PaidOrganizationPlanId,
} from "@duna/core";
import { auditLog, getDatabase, organizations, people } from "@duna/db";
import { eq } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import {
  createBillingPortalSession,
  createOrganizationPlanCheckout,
  isStripeConfigured,
  type OrganizationSubscriptionDiscount,
  updateOrganizationPlanSubscription,
  updateConnectAccountFeeMetadata,
} from "./payments";

export type OrganizationFeePolicySource = "plan-default" | "admin-override";
export type OrganizationFeeSyncStatus =
  "not-connected" | "pending" | "synced" | "failed";

export interface OrganizationCommissionPolicy {
  readonly organizationId: string;
  readonly configuredPlan: OrganizationPlanId;
  readonly effectivePlan: OrganizationPlanId;
  readonly subscriptionStatus: string;
  readonly defaultRateBps: number;
  readonly overrideRateBps?: number;
  readonly rateBps: number;
  readonly source: OrganizationFeePolicySource;
  readonly stripeSyncStatus: OrganizationFeeSyncStatus;
  readonly stripeSyncedAt?: string;
  readonly stripeSyncError?: string;
}

export type OrganizationPlanSource =
  "admin-assigned" | "stripe-subscription" | "free";
export type OrganizationDiscountDuration = "once" | "repeating" | "forever";

export interface OrganizationPlanPolicy {
  readonly organizationId: string;
  readonly configuredPlan: OrganizationPlanId;
  readonly adminPlanOverride?: OrganizationPlanId;
  readonly effectivePlan: OrganizationPlanId;
  readonly source: OrganizationPlanSource;
  readonly subscriptionStatus: string;
  readonly hasStripeSubscription: boolean;
  readonly interval?: OrganizationBillingInterval;
  readonly currentPeriodEndsAt?: string;
  readonly cancelAtPeriodEnd: boolean;
  readonly discount?: {
    readonly percentBps: number;
    readonly duration: OrganizationDiscountDuration;
    readonly months?: number;
    readonly couponId?: string;
  };
  readonly stripeSyncStatus:
    "not-connected" | "not-synced" | "synced" | "failed";
  readonly stripeSyncedAt?: string;
  readonly stripeSyncError?: string;
}

function organizationPlanId(value: string): OrganizationPlanId {
  return organizationPlan(value).id;
}

export function organizationSubscriptionIsActive(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "trialing";
}

export function effectiveOrganizationPlan(input: {
  readonly plan: string;
  readonly adminPlanOverride?: string | null;
  readonly stripeSubscriptionStatus?: string | null;
}): OrganizationPlanId {
  if (input.adminPlanOverride) {
    return organizationPlanId(input.adminPlanOverride);
  }
  const configured = organizationPlanId(input.plan);
  if (configured === "coach") return "coach";
  return organizationSubscriptionIsActive(input.stripeSubscriptionStatus)
    ? configured
    : "coach";
}

export function resolveOrganizationPlanPolicy(
  organization: typeof organizations.$inferSelect,
): OrganizationPlanPolicy {
  const configuredPlan = organizationPlanId(organization.plan);
  const adminPlanOverride = organization.adminPlanOverride
    ? organizationPlanId(organization.adminPlanOverride)
    : undefined;
  const effectivePlan = effectiveOrganizationPlan(organization);
  const subscriptionStatus =
    organization.stripeSubscriptionStatus ??
    (configuredPlan === "coach" ? "free" : "incomplete");
  const discountDuration = ["once", "repeating", "forever"].includes(
    organization.stripeSubscriptionDiscountDuration ?? "",
  )
    ? (organization.stripeSubscriptionDiscountDuration as OrganizationDiscountDuration)
    : undefined;
  const discount =
    organization.stripeSubscriptionDiscountBps && discountDuration
      ? {
          percentBps: organization.stripeSubscriptionDiscountBps,
          duration: discountDuration,
          months: organization.stripeSubscriptionDiscountMonths ?? undefined,
          couponId:
            organization.stripeSubscriptionDiscountCouponId ?? undefined,
        }
      : undefined;
  return {
    organizationId: organization.id,
    configuredPlan,
    adminPlanOverride,
    effectivePlan,
    source: adminPlanOverride
      ? "admin-assigned"
      : configuredPlan === "coach"
        ? "free"
        : "stripe-subscription",
    subscriptionStatus,
    hasStripeSubscription: Boolean(organization.stripeSubscriptionId),
    interval:
      organization.planBillingInterval === "month" ||
      organization.planBillingInterval === "year"
        ? organization.planBillingInterval
        : undefined,
    currentPeriodEndsAt: organization.planCurrentPeriodEndsAt?.toISOString(),
    cancelAtPeriodEnd: organization.planCancelAtPeriodEnd,
    discount,
    stripeSyncStatus: !organization.stripeSubscriptionId
      ? "not-connected"
      : organization.stripeBillingPolicyError
        ? "failed"
        : organization.stripeBillingPolicySyncedAt
          ? "synced"
          : "not-synced",
    stripeSyncedAt:
      organization.stripeBillingPolicySyncedAt?.toISOString() ?? undefined,
    stripeSyncError: organization.stripeBillingPolicyError ?? undefined,
  };
}

export function resolveOrganizationCommissionPolicy(
  organization: typeof organizations.$inferSelect,
): OrganizationCommissionPolicy {
  const configuredPlan = organizationPlanId(organization.plan);
  const effectivePlan = effectiveOrganizationPlan(organization);
  const defaultRateBps = ORGANIZATION_PLANS[effectivePlan].defaultCommissionBps;
  const overrideRateBps =
    organization.operatorCommissionBpsOverride ?? undefined;
  const stripeSyncStatus = [
    "not-connected",
    "pending",
    "synced",
    "failed",
  ].includes(organization.stripeFeeMetadataStatus)
    ? (organization.stripeFeeMetadataStatus as OrganizationFeeSyncStatus)
    : "pending";
  return {
    organizationId: organization.id,
    configuredPlan,
    effectivePlan,
    subscriptionStatus:
      organization.stripeSubscriptionStatus ??
      (configuredPlan === "coach" ? "free" : "incomplete"),
    defaultRateBps,
    overrideRateBps,
    rateBps: overrideRateBps ?? defaultRateBps,
    source: overrideRateBps === undefined ? "plan-default" : "admin-override",
    stripeSyncStatus,
    stripeSyncedAt:
      organization.stripeFeeMetadataSyncedAt?.toISOString() ?? undefined,
    stripeSyncError: organization.stripeFeeMetadataError ?? undefined,
  };
}

function validateOrganizationDiscount(
  discount: OrganizationSubscriptionDiscount,
): void {
  if (discount.mode !== "apply") return;
  if (
    !Number.isSafeInteger(discount.percentBps) ||
    discount.percentBps < 1 ||
    discount.percentBps > 10_000
  ) {
    throw new Error(
      "Stripe subscription discount must be between 0.01% and 100%.",
    );
  }
  if (
    discount.duration === "repeating" &&
    (!Number.isSafeInteger(discount.months) ||
      (discount.months ?? 0) < 1 ||
      (discount.months ?? 0) > 36)
  ) {
    throw new Error("A first-month discount must run for 1 to 36 months.");
  }
}

export async function updateOrganizationPlanPolicy(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly accessMode: "admin-assigned" | "billing-managed";
  readonly plan: OrganizationPlanId;
  readonly synchronizeStripe: boolean;
  readonly discount: OrganizationSubscriptionDiscount;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
  readonly idempotencyKey: string;
}): Promise<OrganizationPlanPolicy> {
  validateOrganizationDiscount(input.discount);
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  const before = resolveOrganizationPlanPolicy(organization);
  let stripeResult:
    | {
        readonly interval: OrganizationBillingInterval;
        readonly couponId?: string;
      }
    | undefined;

  if (input.synchronizeStripe) {
    if (input.plan === "coach") {
      throw new Error(
        "Free is a local access plan. To stop a paid subscription, use Stripe billing or keep the paid plan and apply a 100% discount.",
      );
    }
    if (!organization.stripeSubscriptionId) {
      throw new Error(
        "This organization does not have a Stripe subscription to update. Assign access locally or have the organization start checkout first.",
      );
    }
    try {
      stripeResult = await updateOrganizationPlanSubscription({
        organizationId: organization.id,
        organizationName: organization.name,
        subscriptionId: organization.stripeSubscriptionId,
        plan: input.plan,
        discount: input.discount,
        changedAt: input.now,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 1_000)
          : "Stripe billing synchronization failed.";
      await database.batch([
        database
          .update(organizations)
          .set({
            stripeBillingPolicySyncedAt: null,
            stripeBillingPolicyError: message,
            updatedAt: input.now,
          })
          .where(eq(organizations.id, organization.id)),
        database.insert(auditLog).values({
          organizationId: organization.id,
          actorPersonId: input.actor.personId,
          actorType: "person",
          action: "organization.plan_policy_sync_failed",
          entityType: "organization",
          entityId: organization.id,
          beforeHash: stableHash(before),
          afterHash: stableHash({ requestedPlan: input.plan, error: message }),
          reason: `${input.reason} Stripe rejected the requested billing change: ${message}`,
          traceId: input.requestId,
          ipAddress: input.ipAddress,
          createdAt: input.now,
        }),
      ]);
      throw new Error(message, { cause: error });
    }
  }

  const nextDiscount =
    input.discount.mode === "preserve"
      ? {
          stripeSubscriptionDiscountBps:
            organization.stripeSubscriptionDiscountBps,
          stripeSubscriptionDiscountDuration:
            organization.stripeSubscriptionDiscountDuration,
          stripeSubscriptionDiscountMonths:
            organization.stripeSubscriptionDiscountMonths,
          stripeSubscriptionDiscountCouponId:
            organization.stripeSubscriptionDiscountCouponId,
        }
      : input.discount.mode === "clear"
        ? {
            stripeSubscriptionDiscountBps: null,
            stripeSubscriptionDiscountDuration: null,
            stripeSubscriptionDiscountMonths: null,
            stripeSubscriptionDiscountCouponId: null,
          }
        : {
            stripeSubscriptionDiscountBps: input.discount.percentBps,
            stripeSubscriptionDiscountDuration: input.discount.duration,
            stripeSubscriptionDiscountMonths:
              input.discount.duration === "repeating"
                ? input.discount.months
                : null,
            stripeSubscriptionDiscountCouponId: stripeResult?.couponId ?? null,
          };
  const adminPlanOverride =
    input.accessMode === "admin-assigned" ? input.plan : null;
  await database.batch([
    database
      .update(organizations)
      .set({
        ...(stripeResult
          ? {
              plan: input.plan,
              planBillingInterval: stripeResult.interval,
              stripeBillingPolicySyncedAt: input.now,
              stripeBillingPolicyError: null,
              ...nextDiscount,
            }
          : {}),
        adminPlanOverride,
        stripeFeeMetadataStatus: organization.stripeAccountId
          ? "pending"
          : "not-connected",
        stripeFeeMetadataSyncedAt: null,
        stripeFeeMetadataError: null,
        updatedAt: input.now,
      })
      .where(eq(organizations.id, organization.id)),
    database.insert(auditLog).values({
      organizationId: organization.id,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "organization.plan_policy_updated",
      entityType: "organization",
      entityId: organization.id,
      beforeHash: stableHash(before),
      afterHash: stableHash({
        accessMode: input.accessMode,
        plan: input.plan,
        synchronizeStripe: input.synchronizeStripe,
        discount: input.discount,
      }),
      reason: `${input.reason} Access is ${
        input.accessMode === "admin-assigned"
          ? `admin-assigned to ${ORGANIZATION_PLANS[input.plan].name}`
          : "managed by Stripe billing"
      }; Stripe billing was ${input.synchronizeStripe ? "updated" : "left unchanged"}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  await synchronizeOrganizationFeeMetadata({
    organizationId: organization.id,
    now: input.now,
  });
  const updated = await database.query.organizations.findFirst({
    where: eq(organizations.id, organization.id),
  });
  if (!updated) throw new Error("Organization was not found after the update.");
  return resolveOrganizationPlanPolicy(updated);
}

export async function loadOrganizationCommissionPolicy(
  organizationId: string,
): Promise<OrganizationCommissionPolicy> {
  const organization = await getDatabase().query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  return resolveOrganizationCommissionPolicy(organization);
}

async function saveFeeSyncResult(input: {
  readonly organizationId: string;
  readonly status: OrganizationFeeSyncStatus;
  readonly error?: string;
  readonly now: Date;
}): Promise<void> {
  await getDatabase()
    .update(organizations)
    .set({
      stripeFeeMetadataStatus: input.status,
      stripeFeeMetadataSyncedAt: input.status === "synced" ? input.now : null,
      stripeFeeMetadataError: input.error ?? null,
      updatedAt: input.now,
    })
    .where(eq(organizations.id, input.organizationId));
}

export async function synchronizeOrganizationFeeMetadata(input: {
  readonly organizationId: string;
  readonly now: Date;
}): Promise<OrganizationCommissionPolicy> {
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  const policy = resolveOrganizationCommissionPolicy(organization);
  if (!organization.stripeAccountId) {
    await saveFeeSyncResult({
      organizationId: organization.id,
      status: "not-connected",
      now: input.now,
    });
    return {
      ...policy,
      stripeSyncStatus: "not-connected",
      stripeSyncedAt: undefined,
      stripeSyncError: undefined,
    };
  }
  if (!isStripeConfigured()) {
    const error = "Stripe is not configured for metadata synchronization.";
    await saveFeeSyncResult({
      organizationId: organization.id,
      status: "pending",
      error,
      now: input.now,
    });
    return {
      ...policy,
      stripeSyncStatus: "pending",
      stripeSyncedAt: undefined,
      stripeSyncError: error,
    };
  }
  try {
    await updateConnectAccountFeeMetadata({
      accountId: organization.stripeAccountId,
      organizationId: organization.id,
      rateBps: policy.rateBps,
      source: policy.source,
      plan: policy.effectivePlan,
    });
    await saveFeeSyncResult({
      organizationId: organization.id,
      status: "synced",
      now: input.now,
    });
    return {
      ...policy,
      stripeSyncStatus: "synced",
      stripeSyncedAt: input.now.toISOString(),
      stripeSyncError: undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 1_000) : "Stripe failed";
    await saveFeeSyncResult({
      organizationId: organization.id,
      status: "failed",
      error: message,
      now: input.now,
    });
    return {
      ...policy,
      stripeSyncStatus: "failed",
      stripeSyncedAt: undefined,
      stripeSyncError: message,
    };
  }
}

export async function updateOrganizationCommissionOverride(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly overrideRateBps?: number;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OrganizationCommissionPolicy> {
  if (
    input.overrideRateBps !== undefined &&
    (!Number.isSafeInteger(input.overrideRateBps) ||
      input.overrideRateBps < 0 ||
      input.overrideRateBps > 2_500)
  ) {
    throw new Error("Organization commission must be between 0% and 25%.");
  }
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  const before = resolveOrganizationCommissionPolicy(organization);
  const pendingStatus = organization.stripeAccountId
    ? "pending"
    : "not-connected";
  await database.batch([
    database
      .update(organizations)
      .set({
        operatorCommissionBpsOverride: input.overrideRateBps ?? null,
        stripeFeeMetadataStatus: pendingStatus,
        stripeFeeMetadataSyncedAt: null,
        stripeFeeMetadataError: null,
        updatedAt: input.now,
      })
      .where(eq(organizations.id, input.organizationId)),
    database.insert(auditLog).values({
      organizationId: input.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "organization.commission_override_updated",
      entityType: "organization",
      entityId: input.organizationId,
      beforeHash: stableHash(before),
      afterHash: stableHash({
        ...before,
        overrideRateBps: input.overrideRateBps,
      }),
      reason: `${input.reason} Effective override: ${
        input.overrideRateBps === undefined
          ? "plan default"
          : `${input.overrideRateBps / 100}%`
      }.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return synchronizeOrganizationFeeMetadata({
    organizationId: input.organizationId,
    now: input.now,
  });
}

export async function startOrganizationPlanCheckout(input: {
  readonly actor: ApiActor;
  readonly plan: PaidOrganizationPlanId;
  readonly interval: OrganizationBillingInterval;
  readonly uploadPackQuantity?: number;
  readonly livePackQuantity?: number;
  readonly payAsYouGo?: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly url: string | null }> {
  if (!input.actor.organizationId) throw new Error("Organization is required.");
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.actor.organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  if (
    organization.stripeSubscriptionId &&
    !["canceled", "cancelled", "incomplete_expired"].includes(
      organization.stripeSubscriptionStatus ?? "",
    )
  ) {
    throw new Error(
      "This organization already has a plan subscription. Open billing management to change it.",
    );
  }
  const person = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  const checkout = await createOrganizationPlanCheckout({
    organizationId: organization.id,
    customerId: organization.stripeBillingCustomerId ?? undefined,
    email: person?.email ?? undefined,
    plan: input.plan,
    interval: input.interval,
    uploadPackQuantity: input.uploadPackQuantity,
    livePackQuantity: input.livePackQuantity,
    payAsYouGo: input.payAsYouGo,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    idempotencyKey: input.idempotencyKey,
  });
  await database.batch([
    database
      .update(organizations)
      .set({
        plan: input.plan,
        stripeSubscriptionStatus: "incomplete",
        planBillingInterval: input.interval,
        updatedAt: input.now,
      })
      .where(eq(organizations.id, organization.id)),
    database.insert(auditLog).values({
      organizationId: organization.id,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "organization.plan_checkout_started",
      entityType: "organization",
      entityId: organization.id,
      reason: `Started ${ORGANIZATION_PLANS[input.plan].name} ${input.interval} checkout with ${input.uploadPackQuantity ?? 0} upload packs, ${input.livePackQuantity ?? 0} live packs, and pay as you go ${input.payAsYouGo ? "enabled" : "disabled"}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return checkout;
}

export async function openOrganizationBillingPortal(input: {
  readonly actor: ApiActor;
  readonly returnUrl: string;
}): Promise<{ readonly url: string }> {
  if (!input.actor.organizationId) throw new Error("Organization is required.");
  const organization = await getDatabase().query.organizations.findFirst({
    where: eq(organizations.id, input.actor.organizationId),
  });
  if (!organization?.stripeBillingCustomerId) {
    throw new Error("Organization billing is not active yet.");
  }
  return createBillingPortalSession({
    customerId: organization.stripeBillingCustomerId,
    returnUrl: input.returnUrl,
  });
}
