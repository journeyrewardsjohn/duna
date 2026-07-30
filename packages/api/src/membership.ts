import { auditLog, getDatabase, memberships, membershipTiers } from "@duna/db";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { ApiActor } from "./context";
import {
  createBillingPortalSession,
  getStripeClient,
  isStripeConfigured,
} from "./payments";

export type MembershipAction = "cancel" | "pause" | "resume";

export class MembershipError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "STRIPE_REQUIRED"
      | "MEMBERSHIP_NOT_FOUND"
      | "MEMBERSHIP_NOT_MANAGEABLE"
      | "PAUSE_LIMIT_REACHED",
    message: string,
  ) {
    super(message);
    this.name = "MembershipError";
  }
}

export async function hasActiveDunaPlusMembership(
  personId: string,
  now = new Date(),
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const row = (
    await getDatabase()
      .select({
        id: memberships.id,
        currentPeriodEndsAt: memberships.currentPeriodEndsAt,
        pausedUntil: memberships.pausedUntil,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, personId),
          inArray(memberships.status, ["active", "trialing"]),
          isNull(membershipTiers.organizationId),
          or(
            eq(membershipTiers.code, "duna-plus-monthly"),
            eq(membershipTiers.code, "duna-plus-annual"),
          ),
        ),
      )
      .orderBy(desc(memberships.updatedAt))
      .limit(1)
  )[0];
  if (!row) return false;
  if (row.pausedUntil && row.pausedUntil > now) return false;
  return !row.currentPeriodEndsAt || row.currentPeriodEndsAt >= now;
}

async function connectedMembership(personId: string) {
  const row = (
    await getDatabase()
      .select({
        id: memberships.id,
        personId: memberships.personId,
        status: memberships.status,
        stripeSubscriptionId: memberships.stripeSubscriptionId,
        pauseMonthsUsed: memberships.pauseMonthsUsed,
        cancelAtPeriodEnd: memberships.cancelAtPeriodEnd,
        tierName: membershipTiers.name,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(eq(memberships.personId, personId))
      .orderBy(desc(memberships.updatedAt))
      .limit(1)
  )[0];
  if (!row) {
    throw new MembershipError(
      "MEMBERSHIP_NOT_FOUND",
      "No Duna+ membership was found.",
    );
  }
  const stripeSubscriptionId = row.stripeSubscriptionId;
  if (!stripeSubscriptionId) {
    throw new MembershipError(
      "MEMBERSHIP_NOT_MANAGEABLE",
      "This membership is not linked to Stripe billing.",
    );
  }
  return { ...row, stripeSubscriptionId };
}

function requireConnections(): void {
  if (!process.env.DATABASE_URL) {
    throw new MembershipError(
      "DATABASE_REQUIRED",
      "Membership management requires the connected Duna database.",
    );
  }
  if (!isStripeConfigured()) {
    throw new MembershipError(
      "STRIPE_REQUIRED",
      "Membership billing is not configured.",
    );
  }
}

export async function openDunaPlusPortal(input: {
  readonly actor: ApiActor;
  readonly returnUrl: string;
}): Promise<{ readonly url: string }> {
  requireConnections();
  const membership = await connectedMembership(input.actor.personId);
  const subscription = await getStripeClient().subscriptions.retrieve(
    membership.stripeSubscriptionId,
  );
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  return createBillingPortalSession({
    customerId,
    returnUrl: input.returnUrl,
  });
}

export async function changeDunaPlusMembership(input: {
  readonly actor: ApiActor;
  readonly action: MembershipAction;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly action: MembershipAction;
  readonly effectiveAt?: string;
  readonly pauseMonthsUsed: number;
  readonly cancelAtPeriodEnd: boolean;
}> {
  requireConnections();
  const database = getDatabase();
  const membership = await connectedMembership(input.actor.personId);
  let effectiveAt: Date | undefined;
  let pauseMonthsUsed = membership.pauseMonthsUsed;
  let cancelAtPeriodEnd = membership.cancelAtPeriodEnd;

  if (input.action === "pause") {
    if (membership.pauseMonthsUsed >= 4) {
      throw new MembershipError(
        "PAUSE_LIMIT_REACHED",
        "The four-month Duna+ pause allowance has been used.",
      );
    }
    effectiveAt = new Date(input.now);
    effectiveAt.setUTCMonth(effectiveAt.getUTCMonth() + 1);
    await getStripeClient().subscriptions.update(
      membership.stripeSubscriptionId,
      {
        pause_collection: {
          behavior: "void",
          resumes_at: Math.floor(effectiveAt.getTime() / 1_000),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    pauseMonthsUsed += 1;
    await database
      .update(memberships)
      .set({
        pausedUntil: effectiveAt,
        pauseMonthsUsed,
        updatedAt: input.now,
      })
      .where(eq(memberships.id, membership.id));
  } else if (input.action === "cancel") {
    const subscription = await getStripeClient().subscriptions.update(
      membership.stripeSubscriptionId,
      { cancel_at_period_end: true },
      { idempotencyKey: input.idempotencyKey },
    );
    const firstItem = subscription.items.data[0];
    effectiveAt = firstItem
      ? new Date(firstItem.current_period_end * 1_000)
      : undefined;
    cancelAtPeriodEnd = true;
    await database
      .update(memberships)
      .set({ cancelAtPeriodEnd: true, updatedAt: input.now })
      .where(eq(memberships.id, membership.id));
  } else {
    await getStripeClient().subscriptions.update(
      membership.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
        pause_collection: "",
      },
      { idempotencyKey: input.idempotencyKey },
    );
    cancelAtPeriodEnd = false;
    await database
      .update(memberships)
      .set({
        pausedUntil: null,
        cancelAtPeriodEnd: false,
        updatedAt: input.now,
      })
      .where(eq(memberships.id, membership.id));
  }

  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: `membership.${input.action}`,
    entityType: "membership",
    entityId: membership.id,
    reason:
      input.action === "pause"
        ? "Member requested a one-month Duna+ billing pause."
        : input.action === "cancel"
          ? "Member requested cancellation at the end of the paid period."
          : "Member resumed Duna+ billing.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });

  return {
    action: input.action,
    effectiveAt: effectiveAt?.toISOString(),
    pauseMonthsUsed,
    cancelAtPeriodEnd,
  };
}
