import {
  MEMBERSHIP_PLANS,
  PAID_MEMBERSHIP_PLAN_IDS,
  PLATFORM_MEMBERSHIP_TIER_CODES,
  membershipPlanForTierCode,
  membershipPriceMinor,
  type MembershipBillingInterval,
  type MembershipPlanId,
  type PaidMembershipPlanId,
} from "@duna/core";
import {
  auditLog,
  dunaPlusGrants,
  getDatabase,
  memberships,
  membershipTiers,
  organizations,
  people,
} from "@duna/db";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import type { ApiActor } from "./context";
import {
  createBillingPortalSession,
  getStripeClient,
  isMembershipPriceConfigured,
  isStripeConfigured,
} from "./payments";

export type MembershipAction = "cancel" | "pause" | "resume";
export type OrganizationMembershipAction = "cancel" | "resume";

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

export interface DunaPlusEntitlement {
  readonly active: boolean;
  readonly kind: "paid" | "complimentary" | "none";
  readonly plan: MembershipPlanId;
  readonly label: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export interface MembershipPlanOffer {
  readonly plan: PaidMembershipPlanId;
  readonly name: string;
  readonly tagline: string;
  readonly interval: MembershipBillingInterval;
  readonly priceMinor: number;
  readonly currency: "USD";
  readonly configured: boolean;
  readonly monthlyUploadSeconds: number;
  readonly monthlyLiveSeconds: number;
  readonly benefits: readonly string[];
}

export function membershipPlanOffers(): readonly MembershipPlanOffer[] {
  const intervals = ["month", "year"] as const;
  return PAID_MEMBERSHIP_PLAN_IDS.flatMap((plan) => {
    const definition = MEMBERSHIP_PLANS[plan];
    return intervals.map((interval) => ({
      plan,
      name: definition.name,
      tagline: definition.tagline,
      interval,
      priceMinor: membershipPriceMinor(plan, interval),
      currency: "USD" as const,
      configured: isMembershipPriceConfigured(plan, interval),
      monthlyUploadSeconds: definition.monthlyUploadSeconds,
      monthlyLiveSeconds: definition.monthlyLiveSeconds,
      benefits: definition.benefits,
    }));
  });
}

export async function getDunaPlusEntitlement(
  personId: string,
  now = new Date(),
): Promise<DunaPlusEntitlement> {
  if (!process.env.DATABASE_URL) {
    return { active: false, kind: "none", plan: "free", label: "Free" };
  }
  const database = getDatabase();
  const [person, paid] = await Promise.all([
    database.query.people.findFirst({
      columns: { id: true, email: true },
      where: eq(people.id, personId),
    }),
    database
      .select({
        id: memberships.id,
        currentPeriodStartsAt: memberships.currentPeriodStartsAt,
        currentPeriodEndsAt: memberships.currentPeriodEndsAt,
        pausedUntil: memberships.pausedUntil,
        tierCode: membershipTiers.code,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, personId),
          inArray(memberships.status, ["active", "trialing"]),
          isNull(membershipTiers.organizationId),
          inArray(membershipTiers.code, [...PLATFORM_MEMBERSHIP_TIER_CODES]),
        ),
      )
      .orderBy(desc(memberships.updatedAt))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (
    paid &&
    (!paid.pausedUntil || paid.pausedUntil <= now) &&
    (!paid.currentPeriodEndsAt || paid.currentPeriodEndsAt >= now)
  ) {
    const plan = membershipPlanForTierCode(paid.tierCode);
    return {
      active: true,
      kind: "paid",
      plan,
      label: MEMBERSHIP_PLANS[plan].name,
      startsAt: paid.currentPeriodStartsAt?.toISOString(),
      endsAt: paid.currentPeriodEndsAt?.toISOString(),
    };
  }
  if (!person) {
    return { active: false, kind: "none", plan: "free", label: "Free" };
  }
  const identityCondition = person.email
    ? or(
        eq(dunaPlusGrants.personId, personId),
        eq(dunaPlusGrants.emailNormalized, person.email.trim().toLowerCase()),
      )
    : eq(dunaPlusGrants.personId, personId);
  const grant = (
    await database
      .select({
        id: dunaPlusGrants.id,
        startsAt: dunaPlusGrants.startsAt,
        endsAt: dunaPlusGrants.endsAt,
      })
      .from(dunaPlusGrants)
      .where(
        and(
          identityCondition,
          eq(dunaPlusGrants.status, "active"),
          isNull(dunaPlusGrants.revokedAt),
          lte(dunaPlusGrants.startsAt, now),
          or(isNull(dunaPlusGrants.endsAt), gte(dunaPlusGrants.endsAt, now)),
        ),
      )
      .orderBy(desc(dunaPlusGrants.updatedAt))
      .limit(1)
  )[0];
  if (!grant) {
    return { active: false, kind: "none", plan: "free", label: "Free" };
  }
  return {
    active: true,
    kind: "complimentary",
    plan: "premium-plus",
    label: "Complimentary Premium+",
    startsAt: grant.startsAt.toISOString(),
    endsAt: grant.endsAt?.toISOString(),
  };
}

export async function hasActiveDunaPlusMembership(
  personId: string,
  now = new Date(),
): Promise<boolean> {
  return (await getDunaPlusEntitlement(personId, now)).active;
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
      .where(
        and(
          eq(memberships.personId, personId),
          inArray(memberships.status, [
            "active",
            "trialing",
            "past_due",
            "unpaid",
            "incomplete",
          ]),
          isNull(membershipTiers.organizationId),
          inArray(membershipTiers.code, [...PLATFORM_MEMBERSHIP_TIER_CODES]),
        ),
      )
      .orderBy(desc(memberships.updatedAt))
      .limit(1)
  )[0];
  if (!row) {
    throw new MembershipError(
      "MEMBERSHIP_NOT_FOUND",
      "No Premium membership was found.",
    );
  }
  const stripeSubscriptionId = row.stripeSubscriptionId;
  if (!stripeSubscriptionId) {
    throw new MembershipError(
      "MEMBERSHIP_NOT_MANAGEABLE",
      "This membership is not linked to recurring billing.",
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

export async function openPlayerBillingPortal(input: {
  readonly actor: ApiActor;
  readonly returnUrl: string;
  readonly now: Date;
}): Promise<{ readonly url: string }> {
  requireConnections();
  const person = await getDatabase().query.people.findFirst({
    columns: { stripeCustomerId: true },
    where: eq(people.id, input.actor.personId),
  });
  let customerId = person?.stripeCustomerId ?? undefined;
  if (!customerId) {
    const recurringMembership = (
      await getDatabase()
        .select({ stripeSubscriptionId: memberships.stripeSubscriptionId })
        .from(memberships)
        .where(
          and(
            eq(memberships.personId, input.actor.personId),
            isNotNull(memberships.stripeSubscriptionId),
          ),
        )
        .orderBy(desc(memberships.updatedAt))
        .limit(1)
    )[0];
    if (recurringMembership?.stripeSubscriptionId) {
      const subscription = await getStripeClient().subscriptions.retrieve(
        recurringMembership.stripeSubscriptionId,
      );
      customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      await getDatabase()
        .update(people)
        .set({ stripeCustomerId: customerId, updatedAt: input.now })
        .where(eq(people.id, input.actor.personId));
    }
  }
  if (!customerId) {
    throw new MembershipError(
      "MEMBERSHIP_NOT_FOUND",
      "No saved Duna billing profile was found yet.",
    );
  }
  return createBillingPortalSession({
    customerId,
    returnUrl: input.returnUrl,
  });
}

async function connectedOrganizationMembership(
  personId: string,
  membershipId: string,
) {
  const row = (
    await getDatabase()
      .select({
        id: memberships.id,
        cancelAtPeriodEnd: memberships.cancelAtPeriodEnd,
        organizationId: organizations.id,
        organizationName: organizations.name,
        stripeSubscriptionId: memberships.stripeSubscriptionId,
        tierName: membershipTiers.name,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .innerJoin(
        organizations,
        eq(membershipTiers.organizationId, organizations.id),
      )
      .where(
        and(
          eq(memberships.id, membershipId),
          eq(memberships.personId, personId),
          inArray(memberships.status, [
            "active",
            "trialing",
            "past_due",
            "unpaid",
            "incomplete",
          ]),
        ),
      )
      .limit(1)
  )[0];
  if (!row) {
    throw new MembershipError(
      "MEMBERSHIP_NOT_FOUND",
      "That organization membership was not found in this Duna account.",
    );
  }
  if (!row.stripeSubscriptionId) {
    throw new MembershipError(
      "MEMBERSHIP_NOT_MANAGEABLE",
      "This organization manages that membership outside Stripe billing.",
    );
  }
  return { ...row, stripeSubscriptionId: row.stripeSubscriptionId };
}

export async function changeOrganizationMembership(input: {
  readonly actor: ApiActor;
  readonly membershipId: string;
  readonly action: OrganizationMembershipAction;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly membershipId: string;
  readonly action: OrganizationMembershipAction;
  readonly effectiveAt?: string;
  readonly cancelAtPeriodEnd: boolean;
}> {
  requireConnections();
  const database = getDatabase();
  const membership = await connectedOrganizationMembership(
    input.actor.personId,
    input.membershipId,
  );
  const cancelAtPeriodEnd = input.action === "cancel";
  const subscription = await getStripeClient().subscriptions.update(
    membership.stripeSubscriptionId,
    { cancel_at_period_end: cancelAtPeriodEnd },
    { idempotencyKey: input.idempotencyKey },
  );
  const firstItem = subscription.items.data[0];
  const effectiveAt =
    cancelAtPeriodEnd && firstItem
      ? new Date(firstItem.current_period_end * 1_000)
      : undefined;
  await database
    .update(memberships)
    .set({ cancelAtPeriodEnd, updatedAt: input.now })
    .where(
      and(
        eq(memberships.id, membership.id),
        eq(memberships.personId, input.actor.personId),
      ),
    );
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: `membership.organization.${input.action}`,
    entityType: "membership",
    entityId: membership.id,
    organizationId: membership.organizationId,
    reason: cancelAtPeriodEnd
      ? `Member requested ${membership.organizationName} membership cancellation at the end of the paid period.`
      : `Member resumed the ${membership.organizationName} membership.`,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  return {
    membershipId: membership.id,
    action: input.action,
    effectiveAt: effectiveAt?.toISOString(),
    cancelAtPeriodEnd,
  };
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
        "The four-month Premium pause allowance has been used.",
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
        ? "Member requested a one-month Premium billing pause."
        : input.action === "cancel"
          ? "Member requested cancellation at the end of the paid period."
          : "Member resumed Premium billing.",
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
