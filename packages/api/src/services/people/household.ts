/**
 * Household view and guardian links for HQ People (PEOPLE-API).
 *
 * Authority over a junior is `guardianships` (as Duna Health reads it); a
 * staff link is created `pending` and carries no authority until Duna's
 * existing review verifies it. Guardian invitations reuse the existing
 * `/join/guardian/[token]` flow (`issueGuardianInvitation`): the result is
 * the link plus a draft for staff to review and send. Nothing is sent here.
 */
import {
  catalogFulfillments,
  getDatabase,
  guardianConsents,
  guardianships,
  orders,
  people,
  registrations,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import type { PeopleHousehold } from "../../contracts/people";
import { issueGuardianInvitation } from "../../profile-onboarding";
import {
  PeopleError,
  adultBand,
  clubPersonIds,
  maskContact,
  readsPayments,
  requireManager,
  requireReadablePerson,
  writeAudit,
  type PeopleContext,
} from "./shared";

type ReviewStatus = "pending" | "verified" | "rejected";

function reviewStatus(value: string): ReviewStatus {
  return value === "verified" || value === "rejected" ? value : "pending";
}

/** Fixed query count: person, links, names, consents, payers (no per-row reads). */
export async function loadPersonHousehold(
  context: PeopleContext,
  personId: string,
): Promise<PeopleHousehold> {
  const person = await requireReadablePerson(context, personId);
  const database = getDatabase();
  const links = await database
    .select()
    .from(guardianships)
    .where(
      or(
        eq(guardianships.minorId, personId),
        eq(guardianships.guardianId, personId),
      ),
    );
  const juniorIds = [
    ...new Set(
      links
        .filter((link) => link.guardianId === personId)
        .map((link) => link.minorId),
    ),
  ];
  // A guardian's juniors appear only when the club knows them too.
  const clubJuniors = await clubPersonIds(context.organizationId, juniorIds);
  const visibleLinks = links.filter(
    (link) => link.minorId === personId || clubJuniors.has(link.minorId),
  );
  const relatedIds = [
    ...new Set(visibleLinks.flatMap((link) => [link.guardianId, link.minorId])),
  ];
  const showPayments = readsPayments(context.actor);
  const [names, consentRows, payerRows] = await Promise.all([
    relatedIds.length
      ? database
          .select({
            id: people.id,
            displayName: people.displayName,
            birthDate: people.birthDate,
            isMinor: people.isMinor,
          })
          .from(people)
          .where(inArray(people.id, relatedIds))
      : Promise.resolve([]),
    relatedIds.length
      ? database
          .select()
          .from(guardianConsents)
          .where(inArray(guardianConsents.minorId, relatedIds))
          .orderBy(desc(guardianConsents.occurredAt))
      : Promise.resolve([]),
    showPayments
      ? database
          .select({ buyerPersonId: orders.buyerPersonId })
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, context.organizationId),
              or(
                inArray(
                  orders.id,
                  database
                    .select({ id: catalogFulfillments.orderId })
                    .from(catalogFulfillments)
                    .where(
                      and(
                        eq(
                          catalogFulfillments.organizationId,
                          context.organizationId,
                        ),
                        eq(catalogFulfillments.personId, personId),
                      ),
                    ),
                ),
                inArray(
                  orders.id,
                  database
                    .select({ id: registrations.orderId })
                    .from(registrations)
                    .where(eq(registrations.personId, personId)),
                ),
                eq(orders.buyerPersonId, personId),
              ),
              ne(orders.status, "draft"),
            ),
          )
          .orderBy(desc(orders.createdAt))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const nameOf = new Map(names.map((row) => [row.id, row]));
  const ref = (id: string) => ({
    personId: id,
    displayName: nameOf.get(id)?.displayName ?? "Club member",
  });
  const payerId = payerRows[0]?.buyerPersonId;
  const isJunior =
    person.isMinor ||
    ["under-13", "teen"].includes(
      adultBand(person.birthDate, person.isMinor, context.now),
    );
  const guardians = visibleLinks
    .filter((link) => link.minorId === personId)
    .map((link) => ({
      ...ref(link.guardianId),
      juniorPersonId: link.minorId,
      relationship: link.relationship,
      reviewStatus: reviewStatus(link.reviewStatus),
      canApproveSpending: link.canApproveSpending,
      pays: showPayments ? payerId === link.guardianId : undefined,
      contacted: link.reviewStatus === "verified" && link.verified,
    }));
  const juniors = visibleLinks
    .filter((link) => link.guardianId === personId)
    .map((link) => {
      const junior = nameOf.get(link.minorId);
      const consent = consentRows.find(
        (row) => row.minorId === link.minorId && row.guardianId === personId,
      );
      return {
        ...ref(link.minorId),
        ageBand: adultBand(
          junior?.birthDate,
          junior?.isMinor ?? true,
          context.now,
        ),
        consent: consent
          ? {
              state: consent.granted
                ? ("recorded" as const)
                : ("withdrawn" as const),
              method: consent.method,
              version: consent.disclosureVersion,
              at: consent.occurredAt.toISOString(),
            }
          : { state: "not-recorded" as const },
      };
    });
  const contactGuardian = guardians.find((guardian) => guardian.contacted);
  return {
    personId,
    guardians,
    juniors,
    payer:
      showPayments && payerId
        ? payerId === personId
          ? { personId, displayName: person.displayName }
          : ref(payerId)
        : undefined,
    // A junior's own contact is never used: the verified guardian is.
    contact: isJunior
      ? contactGuardian
        ? {
            personId: contactGuardian.personId,
            displayName: contactGuardian.displayName,
          }
        : undefined
      : { personId, displayName: person.displayName },
  };
}

async function requireJunior(context: PeopleContext, juniorPersonId: string) {
  const junior = await requireReadablePerson(context, juniorPersonId);
  const band = adultBand(junior.birthDate, junior.isMinor, context.now);
  if (!junior.isMinor && band !== "teen" && band !== "under-13") {
    throw new PeopleError(
      "BAD_REQUEST",
      "Guardians are linked only to a junior (under 18).",
    );
  }
  return junior;
}

/**
 * Creates a guardian invitation through the existing `/join/guardian/[token]`
 * flow and returns it with a draft message for staff to review and send from
 * Inbox. Nothing is sent; the guardian's address is not stored.
 */
export async function inviteGuardian(
  context: PeopleContext,
  input: {
    readonly juniorPersonId: string;
    readonly guardianName: string;
    readonly relationship: string;
    readonly email?: string;
    readonly phoneE164?: string;
    readonly applicationOrigin: string;
  },
) {
  requireManager(context.actor);
  const junior = await requireJunior(context, input.juniorPersonId);
  const invitation = await issueGuardianInvitation({
    minorId: junior.id,
    createdByPersonId: context.actor.personId,
    relationship: input.relationship,
    applicationOrigin: input.applicationOrigin,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    now: context.now,
  });
  const channel: "email" | "sms" = input.phoneE164 ? "sms" : "email";
  const destination = (input.phoneE164 ?? input.email)!;
  await writeAudit(context, {
    action: "people.guardian.invitation-drafted",
    entityType: "guardian-invitation",
    entityId: invitation.invitationId,
    reason:
      "Staff created a guardian invitation link for a junior; nothing was sent.",
  });
  log.info("people.guardian.invitation-drafted", {
    organizationId: context.organizationId,
    invitationId: invitation.invitationId,
  });
  return {
    invitationId: invitation.invitationId,
    inviteUrl: invitation.inviteUrl,
    expiresAt: invitation.expiresAt,
    draft: {
      channel,
      contactHint: maskContact(destination),
      body: `Hi ${input.guardianName}, please confirm you are ${junior.displayName}'s ${input.relationship} so the club can keep you in the loop: ${invitation.inviteUrl}`,
    },
    sent: false as const,
  };
}

/** Links a person the club knows as a junior's guardian, pending Duna review. */
export async function linkGuardian(
  context: PeopleContext,
  input: {
    readonly juniorPersonId: string;
    readonly guardianPersonId: string;
    readonly relationship: string;
  },
) {
  requireManager(context.actor);
  if (input.juniorPersonId === input.guardianPersonId) {
    throw new PeopleError(
      "BAD_REQUEST",
      "A person cannot be their own guardian.",
    );
  }
  await requireJunior(context, input.juniorPersonId);
  const guardian = await requireReadablePerson(context, input.guardianPersonId);
  if (
    guardian.isMinor ||
    adultBand(guardian.birthDate, guardian.isMinor, context.now) !== "adult"
  ) {
    throw new PeopleError(
      "BAD_REQUEST",
      "A guardian must be an adult with a date of birth on their record.",
    );
  }
  const database = getDatabase();
  const existing = await database.query.guardianships.findFirst({
    where: and(
      eq(guardianships.guardianId, guardian.id),
      eq(guardianships.minorId, input.juniorPersonId),
    ),
  });
  if (existing && existing.reviewStatus !== "rejected") {
    throw new PeopleError(
      "CONFLICT",
      "This guardian is already linked to this junior.",
    );
  }
  await database
    .insert(guardianships)
    .values({
      guardianId: guardian.id,
      minorId: input.juniorPersonId,
      relationship: input.relationship,
      verified: false,
      emergencyContact: true,
      canApproveSpending: false,
      reviewStatus: "pending",
      createdAt: context.now,
    })
    .onConflictDoUpdate({
      target: [guardianships.guardianId, guardianships.minorId],
      set: {
        relationship: input.relationship,
        verified: false,
        reviewStatus: "pending",
        reviewReason: null,
        reviewedByPersonId: null,
        reviewedAt: null,
        verifiedAt: null,
      },
    });
  await writeAudit(context, {
    action: "people.guardian.linked",
    entityType: "guardianship",
    entityId: `${guardian.id}:${input.juniorPersonId}`,
    reason:
      "Staff linked a guardian to a junior; review pending, consent not recorded.",
  });
  return {
    juniorPersonId: input.juniorPersonId,
    guardianPersonId: guardian.id,
    reviewStatus: "pending" as const,
    consent: "not-recorded" as const,
  };
}
