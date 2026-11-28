/**
 * Player procedures for group sessions (participation.md §7.2): the one
 * display model for a session, as tokens and numbers plus the rendered
 * English, so web checkout, the Player app and invite pages say the same
 * thing. Read on the primary: capacity and "already booked" must be current.
 */
import {
  catalogFulfillments,
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  orders,
  organizations,
} from "@duna/db";
import {
  participationDisplay,
  renderParticipationDisplay,
  type ParticipationDecisionOutcome,
  type ParticipationDisplay,
} from "@duna/core";
import { and, eq, gt, inArray, or, isNull } from "drizzle-orm";
import { assertGuardianCanBookFor } from "../../catalog-checkout";
import type { ApiActor } from "../../context";
import { myWaitlistEntry } from "./waitlist";
import {
  ACTIVE_BOOKING_STATUSES,
  ParticipationError,
  catalogSessionPicture,
  requireParticipationDatabase,
} from "./catalog";

export interface ParticipationQuote {
  readonly subjectType: "catalog-session-occurrence";
  readonly subjectId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly timezone: string;
  readonly hasGroupRule: boolean;
  readonly displayState: ParticipationDisplay["state"];
  readonly display: ParticipationDisplay;
  readonly copy: ReturnType<typeof renderParticipationDisplay>;
  /** Credits reserved per player now (the most a player can be charged). */
  readonly reserve?: number;
  readonly maxCharge?: number;
  readonly alreadyBooked: boolean;
  readonly lockAt?: string;
  /** PART-4: the viewer's place on the waitlist, if any. */
  readonly waitlist?: Awaited<ReturnType<typeof myWaitlistEntry>>;
}

/** Whether this person already holds a place (decision 5). */
export async function personHoldsPlace(input: {
  readonly occurrenceId: string;
  readonly personId: string;
  readonly now: Date;
}): Promise<boolean> {
  const rows = await getDatabase()
    .select({ id: catalogFulfillments.id })
    .from(catalogFulfillments)
    .innerJoin(orders, eq(catalogFulfillments.orderId, orders.id))
    .where(
      and(
        eq(catalogFulfillments.catalogSessionOccurrenceId, input.occurrenceId),
        eq(catalogFulfillments.personId, input.personId),
        inArray(catalogFulfillments.status, [...ACTIVE_BOOKING_STATUSES]),
        or(
          inArray(orders.status, ["paid", "partially-refunded"]),
          isNull(orders.expiresAt),
          gt(orders.expiresAt, input.now),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function participationQuote(input: {
  readonly actor?: ApiActor;
  readonly catalogItemId: string;
  readonly catalogSessionOccurrenceId: string;
  readonly participantPersonId?: string;
  readonly quantity: number;
  readonly paymentMethod: "credit" | "card" | "cash";
  readonly viewerTimeZone?: string;
  readonly now: Date;
}): Promise<ParticipationQuote> {
  requireParticipationDatabase();
  const database = getDatabase();
  const row = await database
    .select({
      occurrence: catalogSessionOccurrences,
      item: catalogItems,
      organization: organizations,
    })
    .from(catalogSessionOccurrences)
    .innerJoin(
      catalogItems,
      eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
    )
    .innerJoin(organizations, eq(catalogItems.organizationId, organizations.id))
    .where(
      and(
        eq(catalogSessionOccurrences.id, input.catalogSessionOccurrenceId),
        eq(catalogSessionOccurrences.catalogItemId, input.catalogItemId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || row.item.status !== "active") {
    throw new ParticipationError("NOT_FOUND", "This session was not found.");
  }
  const { occurrence, item, organization } = row;
  const picture = await catalogSessionPicture({
    occurrence,
    item,
    now: input.now,
  });
  const participantPersonId =
    input.participantPersonId ?? input.actor?.personId;
  if (
    input.actor &&
    input.participantPersonId &&
    input.participantPersonId !== input.actor.personId
  ) {
    // Only a verified guardian may ask about a family member's booking.
    try {
      await assertGuardianCanBookFor({
        actor: input.actor,
        participantPersonId: input.participantPersonId,
      });
    } catch {
      throw new ParticipationError(
        "FORBIDDEN",
        "You can only book for family members you manage.",
      );
    }
  }
  const alreadyBooked = participantPersonId
    ? await personHoldsPlace({
        occurrenceId: occurrence.id,
        personId: participantPersonId,
        now: input.now,
      })
    : false;
  const waitlist = participantPersonId
    ? await myWaitlistEntry({
        subjectId: occurrence.id,
        personId: participantPersonId,
      })
    : undefined;
  const display = participationDisplay({
    rule: picture?.rule,
    title: item.title,
    capacity: occurrence.capacity,
    booked: picture?.confirmed ?? 0,
    held: picture?.held ?? 0,
    waiting: picture?.waitlistCount ?? 0,
    outcome:
      (picture?.decision?.outcome as
        ParticipationDecisionOutcome | null | undefined) ??
      (occurrence.status === "cancelled" ? "cancelled-by-club" : undefined),
    decidedGroupSize: picture?.decision?.decidedGroupSize,
    lockAt: picture?.lockAt,
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    now: input.now,
    timeZone: occurrence.timezone,
    viewerTimeZone: input.viewerTimeZone,
    clubName: organization.name,
    payment: { method: input.paymentMethod },
    viewer: { booked: alreadyBooked, quantity: input.quantity },
  });
  return {
    subjectType: "catalog-session-occurrence",
    subjectId: occurrence.id,
    title: item.title,
    startsAt: occurrence.startsAt.toISOString(),
    timezone: occurrence.timezone,
    hasGroupRule: display.hasGroupRule,
    displayState: display.state,
    display,
    copy: renderParticipationDisplay(display),
    ...(display.price
      ? {
          reserve: display.price.reservePerPlayer,
          maxCharge: display.price.maxCharge,
        }
      : {}),
    alreadyBooked,
    ...(picture ? { lockAt: picture.lockAt.toISOString() } : {}),
    ...(waitlist ? { waitlist } : {}),
  };
}
