/**
 * What a text invitation is FOR, built on the invitations Duna already has
 * (INVITE-SMS). Each kind answers three things:
 *
 * 1. may this signed-in adult invite to it (host or booked in)? Anyone
 *    else's subject answers "not found";
 * 2. the "what and when" phrase, in the venue's time zone;
 * 3. for each chosen number, which claim link the text carries:
 *
 * | kind            | subject id                     | link the text carries                                     |
 * | --------------- | ------------------------------ | --------------------------------------------------------- |
 * | `court-booking` | `court_bookings.id`            | that number's participant (`/app/booking-invite/<token>`), created at send when new |
 * | `session`       | `catalog_session_occurrences.id` | the sender's share link (`/i/<code>`, `player.participation.createInvite`) |
 * | `pickup`        | `pickup_sessions.id`           | the public pickup page (`/events/pickup-<id>`); public pickups only |
 * | `match`         | `matches.id`                   | that number's pending match invitation (`/join/match/<token>`) |
 * | `club`          | `organizations.id`             | that number's pending club invitation the sender made (`/join/organization/<token>`) |
 *
 * Match and club texts only re-send invitations that already exist (made
 * when the match was recorded or the person was added in HQ People); a
 * number without one is listed as "not on this invitation".
 */
import {
  catalogItems,
  catalogSessionOccurrences,
  courtBookingParticipants,
  courtBookings,
  getDatabase,
  matchParticipantInvitations,
  matches,
  organizationInvitations,
  organizations,
  pickupParticipants,
  pickupSessions,
  venues,
} from "@duna/db";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { ApiActor } from "../../context";
import { canonicalPublicWebUrl } from "../../public-web-url";
import { createParticipationInvite } from "../participation/invites";
import { ParticipationError } from "../participation/catalog";
import { inviteDetails, type InviteSmsKind } from "./sms-text";

export type InviteSmsErrorCode =
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "TOO_MANY_REQUESTS";

export class InviteSmsError extends Error {
  constructor(
    readonly code: InviteSmsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InviteSmsError";
  }
}

export type RecipientLink =
  | {
      readonly kind: "existing";
      readonly path: string;
      readonly invitationRef: string;
      /** Invitation flags a junior (club invitations record this). */
      readonly junior?: boolean;
    }
  /** A court-booking participant the send creates with this token. */
  | { readonly kind: "new-participant"; readonly path: string }
  | { readonly kind: "none" };

export interface ResolvedInviteSubject {
  readonly kind: InviteSmsKind;
  readonly subjectId: string;
  readonly organizationId: string | null;
  readonly details: string;
  /** The link for one number; `reservedToken` is the preview's new token. */
  linkFor(e164: string, reservedToken: string): RecipientLink;
  /** Create the invitation a new link needs (court booking only). */
  materialise(input: {
    readonly e164: string;
    readonly name: string;
    readonly token: string;
    readonly now: Date;
  }): Promise<string>;
  /** Mirror a send outcome onto the existing invitation record, if it keeps one. */
  recordDelivery(input: {
    readonly invitationRef: string;
    readonly outcome: "queued" | "sent" | "failed";
    readonly providerMessageId?: string;
    readonly now: Date;
  }): Promise<void>;
}

const notFound = (what: string) =>
  new InviteSmsError("NOT_FOUND", `This ${what} was not found.`);

const noMaterialise = async (): Promise<string> => {
  throw new Error("This invitation kind never creates a record at send.");
};
const noDelivery = async (): Promise<void> => undefined;

export async function resolveInviteSubject(input: {
  readonly actor: ApiActor;
  readonly kind: InviteSmsKind;
  readonly subjectId: string;
  readonly now: Date;
}): Promise<ResolvedInviteSubject> {
  switch (input.kind) {
    case "court-booking":
      return courtBookingSubject(input);
    case "session":
      return sessionSubject(input);
    case "pickup":
      return pickupSubject(input);
    case "match":
      return matchSubject(input);
    case "club":
      return clubSubject(input);
  }
}

async function courtBookingSubject(input: {
  readonly actor: ApiActor;
  readonly subjectId: string;
  readonly now: Date;
}): Promise<ResolvedInviteSubject> {
  const database = getDatabase();
  const row = await database
    .select({ booking: courtBookings, venue: venues })
    .from(courtBookings)
    .innerJoin(venues, eq(venues.id, courtBookings.venueId))
    .where(eq(courtBookings.id, input.subjectId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) throw notFound("booking");
  const participants = await database.query.courtBookingParticipants.findMany({
    where: eq(courtBookingParticipants.bookingId, row.booking.id),
  });
  const bookedIn =
    row.booking.personId === input.actor.personId ||
    participants.some(
      (participant) =>
        participant.personId === input.actor.personId &&
        ["organizer", "accepted", "payment-pending", "paid"].includes(
          participant.status,
        ),
    );
  if (!bookedIn) throw notFound("booking");
  if (row.booking.status !== "confirmed" || row.booking.startsAt <= input.now) {
    throw new InviteSmsError(
      "BAD_REQUEST",
      "This booking has started or is no longer active.",
    );
  }
  const open = new Set(["invited", "accepted", "payment-pending"]);
  return {
    kind: "court-booking",
    subjectId: row.booking.id,
    organizationId: row.booking.organizationId,
    details: inviteDetails({
      kind: "court-booking",
      place: row.venue.name,
      startsAt: row.booking.startsAt,
      timeZone: row.venue.timezone,
    }),
    linkFor(e164, reservedToken) {
      const existing = participants.find(
        (participant) =>
          participant.invitedPhoneE164 === e164 && open.has(participant.status),
      );
      if (existing) {
        return {
          kind: "existing",
          path: `/app/booking-invite/${existing.inviteToken}`,
          invitationRef: existing.id,
        };
      }
      if (participants.some((p) => p.invitedPhoneE164 === e164)) {
        return { kind: "none" };
      }
      return {
        kind: "new-participant",
        path: `/app/booking-invite/${reservedToken}`,
      };
    },
    async materialise({ e164, name, token, now }) {
      const [created] = await database
        .insert(courtBookingParticipants)
        .values({
          bookingId: row.booking.id,
          invitedName: name,
          invitedPhoneE164: e164,
          inviteToken: token,
          role: "player",
          status: "invited",
          shareAmountMinor: 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: courtBookingParticipants.id });
      if (created) return created.id;
      const existing = await database.query.courtBookingParticipants.findFirst({
        where: eq(courtBookingParticipants.inviteToken, token),
      });
      if (!existing) throw new Error("The booking invitation was not created.");
      return existing.id;
    },
    recordDelivery: noDelivery,
  };
}

async function sessionSubject(input: {
  readonly actor: ApiActor;
  readonly subjectId: string;
  readonly now: Date;
}): Promise<ResolvedInviteSubject> {
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
      eq(catalogItems.id, catalogSessionOccurrences.catalogItemId),
    )
    .innerJoin(
      organizations,
      eq(organizations.id, catalogSessionOccurrences.organizationId),
    )
    .where(eq(catalogSessionOccurrences.id, input.subjectId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) throw notFound("session");
  let link: { readonly url: string; readonly code: string };
  try {
    // The same share link the player already gets; one per person and session.
    link = await createParticipationInvite({
      actor: input.actor,
      subjectType: "catalog-session-occurrence",
      subjectId: input.subjectId,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof ParticipationError) {
      if (error.code === "NOT_ALLOWED") {
        throw new InviteSmsError("BAD_REQUEST", error.message);
      }
      throw notFound("session");
    }
    throw error;
  }
  return {
    kind: "session",
    subjectId: row.occurrence.id,
    organizationId: row.occurrence.organizationId,
    details: inviteDetails({
      kind: "session",
      title: row.item.title,
      place: row.organization.name,
      startsAt: row.occurrence.startsAt,
      timeZone: row.occurrence.timezone,
    }),
    linkFor: () => ({
      kind: "existing",
      path: link.url,
      invitationRef: `share:${link.code}`,
    }),
    materialise: noMaterialise,
    recordDelivery: noDelivery,
  };
}

async function pickupSubject(input: {
  readonly actor: ApiActor;
  readonly subjectId: string;
  readonly now: Date;
}): Promise<ResolvedInviteSubject> {
  const database = getDatabase();
  const pickup = await database.query.pickupSessions.findFirst({
    where: eq(pickupSessions.id, input.subjectId),
  });
  if (!pickup) throw notFound("pickup");
  const joined =
    pickup.hostPersonId === input.actor.personId ||
    Boolean(
      await database.query.pickupParticipants.findFirst({
        where: and(
          eq(pickupParticipants.pickupSessionId, pickup.id),
          eq(pickupParticipants.personId, input.actor.personId),
          inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
        ),
      }),
    );
  if (!joined) throw notFound("pickup");
  if (pickup.status !== "active" || pickup.startsAt <= input.now) {
    throw new InviteSmsError(
      "BAD_REQUEST",
      "This pickup has started or is no longer active.",
    );
  }
  if (pickup.visibility !== "public") {
    throw new InviteSmsError(
      "BAD_REQUEST",
      "A private pickup can only be shared with people already on Duna.",
    );
  }
  const venue = pickup.venueId
    ? await database.query.venues.findFirst({
        where: eq(venues.id, pickup.venueId),
      })
    : undefined;
  return {
    kind: "pickup",
    subjectId: pickup.id,
    organizationId: pickup.organizationId,
    details: inviteDetails({
      kind: "pickup",
      place: pickup.venueLabel,
      startsAt: pickup.startsAt,
      timeZone: venue?.timezone ?? "America/New_York",
    }),
    linkFor: () => ({
      kind: "existing",
      path: `/events/pickup-${pickup.id}`,
      invitationRef: `pickup:${pickup.id}`,
    }),
    materialise: noMaterialise,
    recordDelivery: noDelivery,
  };
}

async function matchSubject(input: {
  readonly actor: ApiActor;
  readonly subjectId: string;
  readonly now: Date;
}): Promise<ResolvedInviteSubject> {
  const database = getDatabase();
  const match = await database.query.matches.findFirst({
    where: eq(matches.id, input.subjectId),
  });
  if (!match) throw notFound("match");
  const invitations = await database.query.matchParticipantInvitations.findMany(
    {
      where: and(
        eq(matchParticipantInvitations.matchId, match.id),
        eq(matchParticipantInvitations.status, "pending"),
        gt(matchParticipantInvitations.expiresAt, input.now),
      ),
    },
  );
  const mine =
    match.createdByPersonId === input.actor.personId ||
    invitations.some(
      (invitation) => invitation.invitedByPersonId === input.actor.personId,
    );
  if (!mine) throw notFound("match");
  const venue = match.venueId
    ? await database.query.venues.findFirst({
        where: eq(venues.id, match.venueId),
      })
    : undefined;
  const playedAt = match.completedAt ?? match.scheduledAt ?? undefined;
  return {
    kind: "match",
    subjectId: match.id,
    organizationId: null,
    details: inviteDetails({
      kind: "match",
      place: venue?.name,
      startsAt: playedAt ?? undefined,
      timeZone: venue?.timezone ?? "UTC",
    }),
    linkFor(e164) {
      const invitation = invitations.find(
        (candidate) => candidate.invitedPhoneE164 === e164,
      );
      return invitation
        ? {
            kind: "existing",
            path: `/join/match/${invitation.inviteToken}`,
            invitationRef: invitation.id,
          }
        : { kind: "none" };
    },
    materialise: noMaterialise,
    async recordDelivery({ invitationRef, outcome, providerMessageId, now }) {
      await database
        .update(matchParticipantInvitations)
        .set({
          deliveryChannel: "sms",
          deliveryStatus: outcome,
          ...(providerMessageId
            ? { deliveryMessageId: providerMessageId }
            : {}),
          updatedAt: now,
        })
        .where(eq(matchParticipantInvitations.id, invitationRef));
    },
  };
}

async function clubSubject(input: {
  readonly actor: ApiActor;
  readonly subjectId: string;
  readonly now: Date;
}): Promise<ResolvedInviteSubject> {
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.subjectId),
  });
  if (!organization) throw notFound("club");
  const invitations = await database.query.organizationInvitations.findMany({
    where: and(
      eq(organizationInvitations.organizationId, organization.id),
      eq(organizationInvitations.invitedByPersonId, input.actor.personId),
      eq(organizationInvitations.status, "pending"),
      gt(organizationInvitations.expiresAt, input.now),
    ),
  });
  if (invitations.length === 0) throw notFound("club");
  return {
    kind: "club",
    subjectId: organization.id,
    organizationId: organization.id,
    details: inviteDetails({ kind: "club", place: organization.name }),
    linkFor(e164) {
      const invitation = invitations.find(
        (candidate) =>
          candidate.invitedPhoneE164 === e164 ||
          candidate.guardianPhoneE164 === e164,
      );
      if (!invitation) return { kind: "none" };
      return {
        kind: "existing",
        path: `/join/organization/${encodeURIComponent(invitation.inviteToken)}`,
        invitationRef: invitation.id,
        // A junior's invitation goes through the guardian flow, never a text
        // to the junior; the guardian's own number is not a junior's.
        junior:
          invitation.isMinor && invitation.invitedPhoneE164 === e164
            ? true
            : undefined,
      };
    },
    materialise: noMaterialise,
    async recordDelivery({ invitationRef, outcome, providerMessageId, now }) {
      await database
        .update(organizationInvitations)
        .set({
          deliveryChannel: "sms",
          deliveryStatus: outcome,
          ...(providerMessageId
            ? { deliveryMessageId: providerMessageId }
            : {}),
          updatedAt: now,
        })
        .where(eq(organizationInvitations.id, invitationRef));
    },
  };
}

export function claimUrl(path: string): string {
  return canonicalPublicWebUrl(path);
}
