/**
 * Invite links that bring a friend into a specific session (§7.2): created
 * by an adult who holds a place (never a junior account), resolved publicly
 * without names or prices beyond what the storefront already shows. Counts
 * only, no visitor data.
 */
import { randomBytes } from "node:crypto";
import {
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  organizations,
  participationInvites,
} from "@duna/db";
import {
  participationDisplay,
  renderParticipationDisplay,
  type ParticipationDecisionOutcome,
} from "@duna/core";
import { log } from "@duna/observability";
import { and, eq, sql } from "drizzle-orm";
import type { ApiActor } from "../../context";
import {
  CATALOG_SUBJECT,
  ParticipationError,
  catalogSessionPicture,
  occurrencePlaces,
  requireParticipationDatabase,
} from "./catalog";

function newCode(): string {
  return randomBytes(9).toString("base64url");
}

export function inviteUrl(code: string): string {
  return `/i/${code}`;
}

export async function createParticipationInvite(input: {
  readonly actor: ApiActor;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly now: Date;
}): Promise<{
  readonly url: string;
  readonly code: string;
  readonly expiresAt: string;
}> {
  requireParticipationDatabase();
  if (input.subjectType !== CATALOG_SUBJECT) {
    throw new ParticipationError(
      "INVALID",
      "Invite links for this kind of session arrive with PART-9.",
    );
  }
  if (input.actor.ageBand !== "adult") {
    throw new ParticipationError(
      "FORBIDDEN",
      "Ask a parent or guardian to share this session.",
    );
  }
  const database = getDatabase();
  const occurrence = await database.query.catalogSessionOccurrences.findFirst({
    where: eq(catalogSessionOccurrences.id, input.subjectId),
  });
  if (
    !occurrence ||
    occurrence.status !== "scheduled" ||
    occurrence.startsAt <= input.now
  ) {
    throw new ParticipationError(
      "NOT_ALLOWED",
      "This session is no longer taking bookings.",
    );
  }
  const places = await occurrencePlaces(occurrence.id, input.now);
  const holdsPlace = places.bookings.some(
    (booking) =>
      booking.confirmed &&
      (booking.fulfillment.personId === input.actor.personId ||
        booking.bookerPersonId === input.actor.personId),
  );
  if (!holdsPlace) {
    throw new ParticipationError(
      "FORBIDDEN",
      "Book a place first, then share the session.",
    );
  }
  await database
    .insert(participationInvites)
    .values({
      organizationId: occurrence.organizationId,
      subjectType: CATALOG_SUBJECT,
      subjectId: occurrence.id,
      createdByPersonId: input.actor.personId,
      code: newCode(),
      expiresAt: occurrence.startsAt,
      createdAt: input.now,
    })
    .onConflictDoNothing();
  const invite = await database.query.participationInvites.findFirst({
    where: and(
      eq(participationInvites.subjectType, CATALOG_SUBJECT),
      eq(participationInvites.subjectId, occurrence.id),
      eq(participationInvites.createdByPersonId, input.actor.personId),
    ),
  });
  if (!invite) throw new Error("The invite link could not be created.");
  log.info("participation.invite.changed", {
    organizationId: occurrence.organizationId,
    subjectId: occurrence.id,
    step: "link_created",
  });
  return {
    url: inviteUrl(invite.code),
    code: invite.code,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/** The public invite landing: no names, no roster, the storefront's facts only. */
export async function resolveParticipationInvite(input: {
  readonly code: string;
  readonly now: Date;
}) {
  requireParticipationDatabase();
  const database = getDatabase();
  const invite = await database.query.participationInvites.findFirst({
    where: eq(participationInvites.code, input.code),
  });
  if (!invite || invite.revokedAt || invite.expiresAt <= input.now) {
    throw new ParticipationError("NOT_FOUND", "This invite link has expired.");
  }
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
    .where(eq(catalogSessionOccurrences.id, invite.subjectId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row)
    throw new ParticipationError("NOT_FOUND", "This invite link has expired.");
  await database
    .update(participationInvites)
    .set({ openedCount: sql`${participationInvites.openedCount} + 1` })
    .where(eq(participationInvites.id, invite.id));
  log.info("participation.invite.changed", {
    organizationId: invite.organizationId,
    subjectId: invite.subjectId,
    step: "opened",
  });
  const { occurrence, item, organization } = row;
  const picture = await catalogSessionPicture({
    occurrence,
    item,
    now: input.now,
  });
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
    clubName: organization.name,
  });
  const copy = renderParticipationDisplay(display);
  return {
    title: item.title,
    club: organization.name,
    startsAt: occurrence.startsAt.toISOString(),
    timezone: occurrence.timezone,
    displayState: display.state,
    ...(display.state === "needs-players"
      ? { needs: display.numbers.needed }
      : {}),
    status: copy.status,
    ...(copy.line ? { line: copy.line } : {}),
    bookHref: `/clubs/${organization.slug}/products/${item.slug}?session=${occurrence.id}&invite=${invite.code}`,
  };
}

/** Counts a booking that came through an invite link (PART-8 passes the code). */
export async function recordInviteBooking(code: string): Promise<void> {
  await getDatabase()
    .update(participationInvites)
    .set({ bookedCount: sql`${participationInvites.bookedCount} + 1` })
    .where(eq(participationInvites.code, code));
}
