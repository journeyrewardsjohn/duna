import {
  auditLog,
  courtBookings,
  getDatabase,
  isDatabaseConfigured,
  memberships,
  membershipTiers,
  orders,
  organizations,
  pickupParticipants,
  registrations,
  webhookEvents,
  workflowJobs,
} from "@duna/db";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";

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
  const firstItem = items?.data?.[0];
  const price = firstItem?.price as
    Readonly<Record<string, unknown>> | undefined;
  const priceId =
    typeof price?.id === "string"
      ? price.id
      : typeof firstItem?.price === "string"
        ? firstItem.price
        : undefined;
  if (!priceId) throw new Error("Stripe subscription price is missing");
  const tier = await database.query.membershipTiers.findFirst({
    where: eq(membershipTiers.stripePriceId, priceId),
  });
  if (!tier) {
    throw new Error("Stripe subscription price is not mapped to a Duna tier");
  }
  const pauseCollection = input.object.pause_collection as
    Readonly<Record<string, unknown>> | null | undefined;
  const currentPeriodStartsAt =
    unixDate(input.object.current_period_start) ??
    unixDate(firstItem?.current_period_start);
  const currentPeriodEndsAt =
    unixDate(input.object.current_period_end) ??
    unixDate(firstItem?.current_period_end);
  const pausedUntil = unixDate(pauseCollection?.resumes_at);
  const status = optionalString(input.object, "status") ?? "unknown";
  const cancelAtPeriodEnd = input.object.cancel_at_period_end === true;
  const existing = await database.query.memberships.findFirst({
    where: eq(memberships.stripeSubscriptionId, subscriptionId),
  });
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
        updatedAt: input.occurredAt,
      })
      .where(eq(memberships.id, existing.id));
  } else {
    await database.insert(memberships).values({
      personId,
      tierId: tier.id,
      status,
      stripeSubscriptionId: subscriptionId,
      currentPeriodStartsAt,
      currentPeriodEndsAt,
      pausedUntil,
      cancelAtPeriodEnd,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }
  await database.insert(auditLog).values({
    actorType: "system",
    action: "membership.synchronized",
    entityType: "membership",
    entityId: existing?.id ?? subscriptionId,
    reason: `Stripe subscription state synchronized as ${status}.`,
    traceId: input.traceId,
    createdAt: input.occurredAt,
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
  const membership = await database.query.memberships.findFirst({
    where: eq(memberships.stripeSubscriptionId, subscriptionId),
  });
  if (!membership) {
    throw new Error("Failed Stripe invoice membership was not found");
  }
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
  ]);
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
  const chargesEnabled = input.object.charges_enabled === true;
  const accountType = optionalString(input.object, "type") ?? "express";
  await database.batch([
    database
      .update(organizations)
      .set({
        stripeAccountId: accountId,
        stripeAccountType: accountType,
        stripeChargesEnabled: chargesEnabled,
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
        ? "Stripe confirmed that connected charges are enabled."
        : "Stripe connected-account requirements remain incomplete or restricted.",
      traceId: input.traceId,
      createdAt: input.occurredAt,
    }),
  ]);
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
    await synchronizeMembership({
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
  } else if (action === "order.payment_succeeded") {
    const metadata = object.metadata as
      Readonly<Record<string, unknown>> | undefined;
    const orderId =
      typeof metadata?.dunaOrderId === "string"
        ? metadata.dunaOrderId
        : undefined;
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
      amountReceived !== order.totalMinor ||
      paymentCurrency !== order.currency
    ) {
      throw new Error("Stripe payment amount does not match the Duna order");
    }
    const paymentIntentId =
      typeof object.id === "string" ? object.id : undefined;
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
    await database.execute(sql`
      SELECT duna_project_order_payment(
        ${order.id}::uuid,
        ${paymentIntentId}::text,
        ${latestCharge}::text,
        ${occurredAt}::timestamptz,
        ${eventPayload.id ?? webhook.providerEventId}::text
      )
    `);
  } else if (
    action === "order.payment_failed" ||
    action === "order.checkout_expired"
  ) {
    const metadata = object.metadata as
      Readonly<Record<string, unknown>> | undefined;
    const orderId =
      typeof metadata?.dunaOrderId === "string"
        ? metadata.dunaOrderId
        : undefined;
    if (orderId) {
      const failedAt = occurredAt;
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
          .update(courtBookings)
          .set({
            status:
              action === "order.checkout_expired" ? "expired" : "cancelled",
            holdExpiresAt: null,
            updatedAt: failedAt,
          })
          .where(eq(courtBookings.orderId, orderId)),
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
          eq(workflowJobs.status, "queued"),
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
          eq(workflowJobs.status, "queued"),
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
