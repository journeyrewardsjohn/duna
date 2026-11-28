/**
 * Membership plan changes for HQ People (PEOPLE-API).
 *
 * Duna Pay (docs/money/duna-pay.md, payments.ts) has paths to start, cancel
 * and resume a membership subscription, but none to switch a running
 * subscription to another plan: no proration rule, and no renewal-phase
 * change that keeps the member's entitlement and the club's payout routing
 * in step. This service does not invent one. So:
 *
 * - A plan billed through Duna Pay (it has a processor subscription): the
 *   preview shows exactly what each plan costs and when the next charge is
 *   due, and the change answers `unavailable` with the reason, for both
 *   "now" and "at renewal". Nothing changes.
 * - A plan not billed through Duna Pay (no processor subscription, e.g. a
 *   complimentary plan or one the club collects itself): the switch is a
 *   record change. "Now" moves the membership to the new plan; Duna charges
 *   and credits nothing. "At renewal" is unavailable: such a plan has no
 *   Duna renewal to hang the change on.
 *
 * The preview id is a hash of the membership and both plans; a change whose
 * preview no longer matches is refused (preview again).
 */
import { getDatabase, membershipTiers, memberships } from "@duna/db";
import { log } from "@duna/observability";
import { and, eq } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type { PeopleMembershipChangePreview } from "../../contracts/people";
import {
  PeopleError,
  requireManager,
  requireReadablePerson,
  writeAudit,
  type PeopleContext,
} from "./shared";

export const NO_PRORATION_REASON =
  "Duna Pay has no proration rule, so a plan cannot change part-way through a billing period.";
export const NO_RENEWAL_SWITCH_REASON =
  "Duna Pay cannot yet switch a plan it bills at renewal. To move this member, cancel the current plan at the end of its period and invite them to the new plan.";
export const NO_UNBILLED_RENEWAL_REASON =
  "This plan is not billed through Duna Pay, so it has no Duna renewal. Change it now instead.";

interface Input {
  readonly personId: string;
  readonly membershipId: string;
  readonly toTierId: string;
  readonly timing: "now" | "at-renewal";
}

async function load(context: PeopleContext, input: Input) {
  await requireReadablePerson(context, input.personId);
  const database = getDatabase();
  const [current] = await database
    .select({ membership: memberships, tier: membershipTiers })
    .from(memberships)
    .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
    .where(
      and(
        eq(memberships.id, input.membershipId),
        eq(memberships.personId, input.personId),
        eq(membershipTiers.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!current) {
    throw new PeopleError("NOT_FOUND", "This membership was not found.");
  }
  const target = await database.query.membershipTiers.findFirst({
    where: and(
      eq(membershipTiers.id, input.toTierId),
      eq(membershipTiers.organizationId, context.organizationId),
    ),
  });
  if (!target || !target.active) {
    throw new PeopleError("NOT_FOUND", "This plan was not found.");
  }
  if (target.id === current.tier.id) {
    throw new PeopleError("BAD_REQUEST", "The member is already on this plan.");
  }
  if (!["active", "trialing"].includes(current.membership.status)) {
    throw new PeopleError(
      "PRECONDITION_FAILED",
      "Only an active membership can change plan.",
    );
  }
  return { ...current, target };
}

function plan(tier: typeof membershipTiers.$inferSelect) {
  return {
    tierId: tier.id,
    name: tier.name,
    priceMinor: tier.priceMinor,
    currency: tier.currency,
    interval: tier.interval,
  };
}

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export async function previewMembershipChange(
  context: PeopleContext,
  input: Input,
): Promise<PeopleMembershipChangePreview> {
  const { membership, tier, target } = await load(context, input);
  const billed = Boolean(membership.stripeSubscriptionId);
  const kind =
    target.interval !== tier.interval || target.currency !== tier.currency
      ? ("switch" as const)
      : target.priceMinor > tier.priceMinor
        ? ("upgrade" as const)
        : target.priceMinor < tier.priceMinor
          ? ("downgrade" as const)
          : ("switch" as const);
  const renewal = membership.currentPeriodEndsAt ?? undefined;
  const reason = billed
    ? input.timing === "now"
      ? NO_PRORATION_REASON
      : NO_RENEWAL_SWITCH_REASON
    : input.timing === "at-renewal"
      ? NO_UNBILLED_RENEWAL_REASON
      : undefined;
  const available = reason === undefined;
  const wording = available
    ? `Moves this membership from ${tier.name} to ${target.name} now. This plan is not billed through Duna Pay, so Duna charges and credits nothing.`
    : billed && renewal
      ? `${tier.name} renews on ${renewal.toISOString().slice(0, 10)} at ${money(tier.priceMinor, tier.currency)}. ${target.name} costs ${money(target.priceMinor, target.currency)} per ${target.interval}. Nothing changes.`
      : `Nothing changes.`;
  return {
    previewId: stableHash({
      membership: [membership.id, membership.updatedAt.toISOString()],
      from: [tier.id, tier.priceMinor, tier.currency, tier.interval],
      to: [target.id, target.priceMinor, target.currency, target.interval],
      timing: input.timing,
    }),
    status: available ? "available" : "unavailable",
    reason,
    kind,
    from: plan(tier),
    to: plan(target),
    timing: input.timing,
    effectiveAt: available ? context.now.toISOString() : undefined,
    chargeNowMinor: 0,
    creditNowMinor: 0,
    // What Duna Pay will charge next on the current plan (unchanged).
    nextCharge:
      billed && renewal && !membership.cancelAtPeriodEnd
        ? { amountMinor: tier.priceMinor, at: renewal.toISOString() }
        : undefined,
    billedThroughDuna: billed,
    wording,
  };
}

export async function changeMembershipPlan(
  context: PeopleContext,
  input: Input & { readonly previewId: string },
) {
  requireManager(context.actor);
  const preview = await previewMembershipChange(context, input);
  if (preview.previewId !== input.previewId) {
    throw new PeopleError(
      "PRECONDITION_FAILED",
      "This membership changed since the preview. Preview the change again.",
    );
  }
  if (preview.status === "unavailable") {
    return {
      membershipId: input.membershipId,
      status: "unavailable" as const,
      reason: preview.reason,
      tierId: preview.from.tierId,
      chargeNowMinor: 0,
      creditNowMinor: 0,
    };
  }
  await getDatabase()
    .update(memberships)
    .set({ tierId: preview.to.tierId, updatedAt: context.now })
    .where(
      and(
        eq(memberships.id, input.membershipId),
        eq(memberships.tierId, preview.from.tierId),
      ),
    );
  await writeAudit(context, {
    action: "people.membership.plan-changed",
    entityType: "membership",
    entityId: input.membershipId,
    reason: `Staff moved an unbilled membership to another plan; no money moved.`,
    after: { from: preview.from.tierId, to: preview.to.tierId },
  });
  log.info("people.membership.plan-changed", {
    organizationId: context.organizationId,
    membershipId: input.membershipId,
  });
  return {
    membershipId: input.membershipId,
    status: "changed" as const,
    tierId: preview.to.tierId,
    effectiveAt: context.now.toISOString(),
    chargeNowMinor: 0,
    creditNowMinor: 0,
  };
}
