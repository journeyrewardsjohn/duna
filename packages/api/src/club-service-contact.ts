import { createHash } from "node:crypto";
import { and, eq, isNull, isNotNull, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getTransactionalDatabase,
  organizations,
  organizationThemes,
  websiteSites,
  people,
  guardianships,
  messagingBlocks,
  messagingConversations,
  messagingConversationParticipants,
  messagingRelationships,
  auditLog,
  idempotencyRecords,
} from "@duna/db";
import type { ApiActor } from "./context";
import { MessagingError, sendConversationMessage } from "./messaging-service";

export const clubContactInput = z.object({
  club: z.string().trim().min(1).max(64),
  body: z.string().trim().min(1).max(10000),
  clientMessageId: z.string().uuid(),
});
type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

async function publicClub(transaction: Transaction, slug: string) {
  const [club] = await transaction
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
    })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.systemKey)))
    .limit(1);
  if (!club)
    throw new MessagingError(
      "NOT_FOUND",
      "This club is not available for contact.",
    );
  const [theme] = await transaction
    .select({ id: organizationThemes.organizationId })
    .from(organizationThemes)
    .where(
      and(
        eq(organizationThemes.organizationId, club.id),
        isNotNull(organizationThemes.publishedAt),
      ),
    )
    .limit(1);
  const [site] = theme
    ? []
    : await transaction
        .select({ id: websiteSites.id })
        .from(websiteSites)
        .where(
          and(
            eq(websiteSites.organizationId, club.id),
            isNotNull(websiteSites.publishedRevisionId),
          ),
        )
        .limit(1);
  if (!theme && !site)
    throw new MessagingError(
      "NOT_FOUND",
      "This club has not published its contact page yet.",
    );
  return club;
}

/** Read-only recipient preview. A GET never creates participants or sends a message. */
export async function loadClubContact(slug: string) {
  return getTransactionalDatabase().transaction((transaction) =>
    publicClub(transaction, slug),
  );
}

export async function createClubServiceConversation(input: {
  actor: ApiActor;
  club: string;
  body: string;
  clientMessageId: string;
  requestId: string;
  now?: Date;
}) {
  const parsed = clubContactInput.parse(input);
  if (input.actor.isDemo)
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "Sign in to contact a club.",
    );
  const now = input.now ?? new Date();
  const result = await getTransactionalDatabase().transaction(
    async (transaction) => {
      // Serialize initiations for this person, including simultaneous double submits.
      const [person] = await transaction
        .select({
          id: people.id,
          isMinor: people.isMinor,
          status: people.status,
        })
        .from(people)
        .where(eq(people.id, input.actor.personId))
        .for("update");
      if (!person || person.status !== "active")
        throw new MessagingError(
          "FORBIDDEN",
          "An active Duna account is required.",
        );
      const requestKey = `${person.id}:${parsed.clientMessageId}`;
      const requestHash = createHash("sha256")
        .update(JSON.stringify([parsed.club, parsed.body]))
        .digest("hex");
      const [receipt] = await transaction
        .select({
          result: idempotencyRecords.result,
          requestHash: idempotencyRecords.requestHash,
        })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.procedure, "messaging.contactClub"),
            eq(idempotencyRecords.key, requestKey),
          ),
        )
        .limit(1);
      if (receipt && receipt.requestHash !== requestHash)
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "This request was already used for another message. Refresh before sending again.",
        );
      const club = await publicClub(transaction, parsed.club);
      const guardianRows = person.isMinor
        ? await transaction
            .select({ guardianId: guardianships.guardianId })
            .from(guardianships)
            .innerJoin(people, eq(people.id, guardianships.guardianId))
            .where(
              and(
                eq(guardianships.minorId, person.id),
                eq(guardianships.verified, true),
                eq(guardianships.reviewStatus, "verified"),
                eq(people.status, "active"),
                eq(people.isMinor, false),
              ),
            )
        : [];
      const guardianIds = [
        ...new Set(guardianRows.map((row) => row.guardianId)),
      ];
      if (person.isMinor && guardianIds.length === 0)
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "A verified parent or guardian must be included before you contact this club.",
        );
      const participantIds = [person.id, ...guardianIds];
      const blocks = await transaction
        .select({ id: messagingBlocks.id })
        .from(messagingBlocks)
        .where(
          and(
            isNull(messagingBlocks.revokedAt),
            or(
              and(
                inArray(messagingBlocks.blockerPersonId, participantIds),
                eq(messagingBlocks.blockedPrincipalType, "organization"),
                eq(messagingBlocks.blockedPrincipalId, club.id),
              ),
              and(
                inArray(messagingBlocks.blockerPersonId, participantIds),
                eq(messagingBlocks.blockedPrincipalType, "user"),
                inArray(messagingBlocks.blockedPrincipalId, participantIds),
              ),
            ),
          ),
        );
      if (blocks.length)
        throw new MessagingError(
          "FORBIDDEN",
          "Messaging is blocked for this club or family relationship. Review your blocked contacts first.",
        );
      const contextId = `club-service:${person.id}`;
      const [existing] = await transaction
        .select({
          id: messagingConversations.id,
          creator: messagingConversations.createdByPrincipalId,
          metadata: messagingConversations.metadata,
        })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.organizationId, club.id),
            eq(messagingConversations.type, "group"),
            eq(messagingConversations.contextType, "support-case"),
            eq(messagingConversations.contextId, contextId),
            ...(receipt?.result && typeof receipt.result.id === "string"
              ? [eq(messagingConversations.id, receipt.result.id)]
              : [eq(messagingConversations.status, "open")]),
          ),
        )
        .limit(1);
      if (receipt && !existing)
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "The original conversation is no longer available. Refresh before sending a new request.",
        );
      if (
        existing &&
        (existing.creator !== person.id ||
          existing.metadata.serviceContact !== true)
      )
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "This conversation cannot be reused. Contact Duna support.",
        );
      const [created] = existing
        ? []
        : await transaction
            .insert(messagingConversations)
            .values({
              organizationId: club.id,
              type: "group",
              title: `Contact ${club.name}`,
              contextType: "support-case",
              contextId,
              contextLabel: club.name,
              createdByPrincipalType: "user",
              createdByPrincipalId: person.id,
              minorPresent: person.isMinor,
              guardianCoverageComplete: true,
              safetyScreeningRequired: person.isMinor,
              metadata: { serviceContact: true },
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: messagingConversations.id });
      const conversation = existing ?? created;
      if (!conversation)
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "Please try opening this conversation again.",
        );
      // A previous guardian never retains access after their verified relationship ends.
      await transaction
        .update(messagingConversationParticipants)
        .set({ leftAt: now, updatedAt: now })
        .where(
          and(
            eq(
              messagingConversationParticipants.conversationId,
              conversation.id,
            ),
            eq(messagingConversationParticipants.role, "guardian"),
          ),
        );
      const participants: (typeof messagingConversationParticipants.$inferInsert)[] =
        [
          {
            conversationId: conversation.id,
            principalType: "organization",
            principalId: club.id,
            organizationId: club.id,
            role: "moderator",
          },
          {
            conversationId: conversation.id,
            principalType: "user",
            principalId: person.id,
            personId: person.id,
            role: "member",
          },
          ...guardianIds.map((id) => ({
            conversationId: conversation.id,
            principalType: "user" as const,
            principalId: id,
            personId: id,
            role: "guardian" as const,
            guardianOfPersonId: person.id,
          })),
        ];
      await transaction
        .insert(messagingConversationParticipants)
        .values(participants)
        .onConflictDoUpdate({
          target: [
            messagingConversationParticipants.conversationId,
            messagingConversationParticipants.principalType,
            messagingConversationParticipants.principalId,
          ],
          set: {
            leftAt: null,
            canPost: true,
            role: sql`excluded.role`,
            guardianOfPersonId: sql`excluded.guardian_of_person_id`,
            updatedAt: now,
          },
        });
      for (const personId of participantIds)
        await transaction
          .insert(messagingRelationships)
          .values({
            sourcePrincipalType: "organization",
            sourcePrincipalId: club.id,
            targetPrincipalType: "user",
            targetPrincipalId: personId,
            organizationId: club.id,
            personId,
            kind: "support",
            sourceKey: `club-service:${club.id}:${personId}`,
            contextType: "support-case",
            contextId,
            startedAt: now,
          })
          .onConflictDoNothing();
      if (!existing)
        await transaction.insert(auditLog).values({
          organizationId: club.id,
          actorPersonId: person.id,
          actorType: "user",
          action: "messaging.club_contact_started",
          entityType: "messaging_conversation",
          entityId: conversation.id,
          conversationId: conversation.id,
          traceId: input.requestId,
          reason:
            "Member explicitly requested club service contact; verified guardians included.",
          createdAt: now,
        });
      if (!receipt)
        await transaction.insert(idempotencyRecords).values({
          key: requestKey,
          procedure: "messaging.contactClub",
          personId: person.id,
          organizationId: club.id,
          requestHash,
          result: { id: conversation.id },
          expiresAt: new Date(now.getTime() + 365 * 86400000),
          createdAt: now,
        });
      return { id: conversation.id };
    },
  );
  // Canonical send retains message idempotency, youth screening and delivery behavior.
  // A failed send is safely retried against the same durable club/person conversation.
  await sendConversationMessage({
    actor: input.actor,
    asPrincipal: "user",
    message: {
      conversationId: result.id,
      clientMessageId: parsed.clientMessageId,
      kind: "text",
      body: parsed.body,
      widgets: [],
      attachmentUploadIds: [],
    },
    requestId: input.requestId,
    now,
  });
  return {
    ok: true as const,
    id: result.id,
    message: "Your club conversation is ready.",
  };
}
