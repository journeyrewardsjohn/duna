import {
  auditLog,
  communityComments,
  getDatabase,
  getTransactionalDatabase,
  importedMatches,
  matches,
  people,
  playerMatchNotes,
  playerMatchNoteShares,
  predictionMarkets,
  professionalEvents,
  teamMembers,
  videos,
} from "@duna/db";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { ApiActor } from "./context";
import { stableHash } from "./canonical";
import { summarizeMatchJournalFeedback } from "./duna-ai";
import { screenPublicCommunityComment } from "./duna-ai-support";
import { getDunaPlusEntitlement } from "./membership";

export type CommunitySubject = {
  readonly type: "match" | "live-stream" | "pro-event" | "prediction-market";
  readonly id: string;
};

export class MatchSocialError extends Error {
  constructor(
    readonly code:
      | "MATCH_NOT_FOUND"
      | "SUBJECT_NOT_FOUND"
      | "PARTICIPANT_REQUIRED"
      | "VERIFIED_ACCOUNT_REQUIRED"
      | "PAID_PREMIUM_REQUIRED"
      | "NOTE_NOT_FOUND"
      | "SHARE_NOT_FOUND"
      | "SHARE_EXPIRED"
      | "SHARE_ALREADY_CLAIMED"
      | "COMMENT_NOT_FOUND"
      | "COMMENT_FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "MatchSocialError";
  }
}

export interface CommunityAccess {
  readonly verified: boolean;
  readonly paidPremium: boolean;
  readonly canComment: boolean;
  readonly reason?: string;
}

export function communityAccessFromFacts(input: {
  readonly verified: boolean;
  readonly paidPremium: boolean;
}): CommunityAccess {
  return {
    verified: input.verified,
    paidPremium: input.paidPremium,
    canComment: input.verified && input.paidPremium,
    ...(!input.verified
      ? {
          reason:
            "Finish verifying and claiming your Duna account to join public match conversation.",
        }
      : !input.paidPremium
        ? {
            reason:
              "Player Premium includes private match journals and community comments.",
          }
        : {}),
  };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function communityAccess(
  actor: ApiActor,
  now: Date,
): Promise<CommunityAccess> {
  const [person, entitlement] = await Promise.all([
    getDatabase().query.people.findFirst({
      columns: {
        id: true,
        status: true,
        profileClaimStatus: true,
        workosUserId: true,
        clerkUserId: true,
      },
      where: eq(people.id, actor.personId),
    }),
    getDunaPlusEntitlement(actor.personId, now),
  ]);
  const verified = Boolean(
    person &&
    person.status === "active" &&
    person.profileClaimStatus === "claimed" &&
    (person.workosUserId || person.clerkUserId),
  );
  const paidPremium = entitlement.active && entitlement.kind === "paid";
  return communityAccessFromFacts({ verified, paidPremium });
}

export async function loadCommunityAccess(input: {
  readonly actor: ApiActor;
  readonly now: Date;
}) {
  return communityAccess(input.actor, input.now);
}

async function requireVerifiedMember(actor: ApiActor, now: Date) {
  const access = await communityAccess(actor, now);
  if (!access.verified) {
    throw new MatchSocialError(
      "VERIFIED_ACCOUNT_REQUIRED",
      access.reason ?? "A verified Duna account is required.",
    );
  }
  return access;
}

async function requirePaidPremium(actor: ApiActor, now: Date) {
  const access = await requireVerifiedMember(actor, now);
  if (!access.paidPremium) {
    throw new MatchSocialError(
      "PAID_PREMIUM_REQUIRED",
      access.reason ?? "An active Player Premium membership is required.",
    );
  }
  return access;
}

async function loadMatchRoster(matchId: string, actorPersonId: string) {
  const match = await getDatabase().query.matches.findFirst({
    columns: { id: true, teamAId: true, teamBId: true },
    where: eq(matches.id, matchId),
  });
  if (!match?.teamAId || !match.teamBId) {
    throw new MatchSocialError("MATCH_NOT_FOUND", "Match not found.");
  }
  const members = await getDatabase()
    .select({
      teamId: teamMembers.teamId,
      personId: people.id,
      name: people.displayName,
    })
    .from(teamMembers)
    .innerJoin(people, eq(teamMembers.personId, people.id))
    .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId]));
  const own = members.find((member) => member.personId === actorPersonId);
  return {
    participant: Boolean(own),
    roster: members.map((member) => ({
      personId: member.personId,
      name: member.name,
      relationship:
        member.personId === actorPersonId
          ? ("self" as const)
          : own?.teamId === member.teamId
            ? ("teammate" as const)
            : ("opponent" as const),
    })),
  };
}

function noteSummary(note: typeof playerMatchNotes.$inferSelect) {
  return {
    id: note.id,
    matchId: note.matchId,
    body: note.body,
    source: note.source as "typed" | "voice",
    ...(note.aiSummary ? { aiSummary: note.aiSummary } : {}),
    ...(note.aiInsights ? { aiInsights: note.aiInsights } : {}),
    aiStatus: note.aiStatus as "pending" | "ready" | "unavailable",
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function loadMatchJournal(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly now: Date;
}) {
  const [{ participant }, access] = await Promise.all([
    loadMatchRoster(input.matchId, input.actor.personId),
    communityAccess(input.actor, input.now),
  ]);
  const database = getDatabase();
  const [ownNotes, ownShares, receivedShares] = await Promise.all([
    participant
      ? database
          .select()
          .from(playerMatchNotes)
          .where(
            and(
              eq(playerMatchNotes.matchId, input.matchId),
              eq(playerMatchNotes.personId, input.actor.personId),
            ),
          )
          .orderBy(desc(playerMatchNotes.createdAt))
      : Promise.resolve([]),
    participant
      ? database
          .select()
          .from(playerMatchNoteShares)
          .where(
            and(
              eq(playerMatchNoteShares.matchId, input.matchId),
              eq(playerMatchNoteShares.ownerPersonId, input.actor.personId),
            ),
          )
          .orderBy(desc(playerMatchNoteShares.createdAt))
      : Promise.resolve([]),
    access.verified
      ? database
          .select()
          .from(playerMatchNoteShares)
          .where(
            and(
              eq(playerMatchNoteShares.matchId, input.matchId),
              eq(playerMatchNoteShares.claimedByPersonId, input.actor.personId),
              eq(playerMatchNoteShares.status, "active"),
              isNull(playerMatchNoteShares.revokedAt),
              or(
                isNull(playerMatchNoteShares.expiresAt),
                gt(playerMatchNoteShares.expiresAt, input.now),
              ),
            ),
          )
      : Promise.resolve([]),
  ]);
  const ownerIds = [
    ...new Set(receivedShares.map((share) => share.ownerPersonId)),
  ];
  const [sharedNotes, owners, claimants] = await Promise.all([
    ownerIds.length
      ? database
          .select()
          .from(playerMatchNotes)
          .where(
            and(
              eq(playerMatchNotes.matchId, input.matchId),
              inArray(playerMatchNotes.personId, ownerIds),
            ),
          )
          .orderBy(desc(playerMatchNotes.createdAt))
      : Promise.resolve([]),
    ownerIds.length
      ? database
          .select({
            id: people.id,
            displayName: people.displayName,
            handle: people.handle,
            avatarUrl: people.avatarUrl,
          })
          .from(people)
          .where(inArray(people.id, ownerIds))
      : Promise.resolve([]),
    ownShares.some((share) => share.claimedByPersonId)
      ? database
          .select({
            id: people.id,
            displayName: people.displayName,
            handle: people.handle,
          })
          .from(people)
          .where(
            inArray(
              people.id,
              ownShares.flatMap((share) =>
                share.claimedByPersonId ? [share.claimedByPersonId] : [],
              ),
            ),
          )
      : Promise.resolve([]),
  ]);
  const ownerById = new Map(owners.map((owner) => [owner.id, owner] as const));
  const claimantById = new Map(
    claimants.map((claimant) => [claimant.id, claimant] as const),
  );
  if (receivedShares.length) {
    await database
      .update(playerMatchNoteShares)
      .set({ lastViewedAt: input.now, updatedAt: input.now })
      .where(
        inArray(
          playerMatchNoteShares.id,
          receivedShares.map((share) => share.id),
        ),
      );
  }
  return {
    access: {
      ...access,
      participant,
      canWriteNotes: participant && access.verified && access.paidPremium,
      canUseAi: input.actor.ageBand === "adult",
    },
    notes: ownNotes.map(noteSummary),
    sharedJournals: ownerIds.flatMap((ownerId) => {
      const owner = ownerById.get(ownerId);
      if (!owner) return [];
      return [
        {
          owner: {
            id: owner.id,
            displayName: owner.displayName,
            handle: owner.handle,
            ...(owner.avatarUrl ? { avatarUrl: owner.avatarUrl } : {}),
          },
          notes: sharedNotes
            .filter((note) => note.personId === ownerId)
            .map(noteSummary),
        },
      ];
    }),
    shares: ownShares.map((share) => {
      const claimedBy = share.claimedByPersonId
        ? claimantById.get(share.claimedByPersonId)
        : undefined;
      return {
        id: share.id,
        ...(claimedBy ? { claimedBy } : {}),
        status: share.status as "active" | "revoked",
        ...(share.expiresAt
          ? { expiresAt: share.expiresAt.toISOString() }
          : {}),
        ...(share.claimedAt
          ? { claimedAt: share.claimedAt.toISOString() }
          : {}),
        createdAt: share.createdAt.toISOString(),
      };
    }),
  };
}

async function summarizeStoredNote(input: {
  readonly note: typeof playerMatchNotes.$inferSelect;
  readonly actor: ApiActor;
  readonly roster: readonly {
    readonly personId: string;
    readonly name: string;
    readonly relationship: "self" | "teammate" | "opponent";
  }[];
  readonly now: Date;
}) {
  const result = await summarizeMatchJournalFeedback({
    actor: input.actor,
    body: input.note.body,
    roster: input.roster,
    now: input.now,
  });
  const [updated] = await getDatabase()
    .update(playerMatchNotes)
    .set({
      aiStatus: result.status,
      aiSummary: result.summary ?? null,
      aiInsights: result.insights ?? null,
      aiModel: result.model ?? null,
      updatedAt: input.now,
    })
    .where(eq(playerMatchNotes.id, input.note.id))
    .returning();
  return noteSummary(updated ?? input.note);
}

export async function createMatchJournalNote(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly body: string;
  readonly source: "typed" | "voice";
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  const [{ participant, roster }] = await Promise.all([
    loadMatchRoster(input.matchId, input.actor.personId),
    requirePaidPremium(input.actor, input.now),
  ]);
  if (!participant) {
    throw new MatchSocialError(
      "PARTICIPANT_REQUIRED",
      "Only a player in this match can keep a private match journal.",
    );
  }
  const id = crypto.randomUUID();
  const database = getTransactionalDatabase();
  const note = await database.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(playerMatchNotes)
      .values({
        id,
        matchId: input.matchId,
        personId: input.actor.personId,
        body: input.body,
        source: input.source,
        aiStatus: "pending",
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "player.match_note_created",
      entityType: "player-match-note",
      entityId: id,
      afterHash: stableHash({
        matchId: input.matchId,
        source: input.source,
        body: input.body,
      }),
      reason: "Player saved a private match journal entry.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
    return created!;
  });
  return summarizeStoredNote({
    note,
    actor: input.actor,
    roster,
    now: input.now,
  });
}

export async function refreshMatchJournalSummary(input: {
  readonly actor: ApiActor;
  readonly noteId: string;
  readonly now: Date;
}) {
  await requirePaidPremium(input.actor, input.now);
  const note = await getDatabase().query.playerMatchNotes.findFirst({
    where: and(
      eq(playerMatchNotes.id, input.noteId),
      eq(playerMatchNotes.personId, input.actor.personId),
    ),
  });
  if (!note) {
    throw new MatchSocialError("NOTE_NOT_FOUND", "Match note not found.");
  }
  const { roster } = await loadMatchRoster(note.matchId, input.actor.personId);
  return summarizeStoredNote({
    note,
    actor: input.actor,
    roster,
    now: input.now,
  });
}

export async function createMatchNoteShare(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  const [{ participant }] = await Promise.all([
    loadMatchRoster(input.matchId, input.actor.personId),
    requirePaidPremium(input.actor, input.now),
  ]);
  if (!participant) {
    throw new MatchSocialError(
      "PARTICIPANT_REQUIRED",
      "Only a player in this match can share their private notes.",
    );
  }
  const token = randomBytes(32).toString("base64url");
  const id = crypto.randomUUID();
  const expiresAt = new Date(input.now.getTime() + 30 * 24 * 60 * 60 * 1_000);
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction.insert(playerMatchNoteShares).values({
      id,
      matchId: input.matchId,
      ownerPersonId: input.actor.personId,
      tokenHash: tokenHash(token),
      expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "player.match_note_share_created",
      entityType: "player-match-note-share",
      entityId: id,
      afterHash: stableHash({ matchId: input.matchId, expiresAt }),
      reason: "Player created a revocable private match-note share link.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id,
    token,
    path: `/matches/${input.matchId}?notes=${encodeURIComponent(token)}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function claimMatchNoteShare(input: {
  readonly actor: ApiActor;
  readonly token: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  await requireVerifiedMember(input.actor, input.now);
  const database = getTransactionalDatabase();
  const share = await database.query.playerMatchNoteShares.findFirst({
    where: and(
      eq(playerMatchNoteShares.tokenHash, tokenHash(input.token)),
      eq(playerMatchNoteShares.status, "active"),
      isNull(playerMatchNoteShares.revokedAt),
    ),
  });
  if (!share) {
    throw new MatchSocialError(
      "SHARE_NOT_FOUND",
      "This notes link is no longer available.",
    );
  }
  if (share.expiresAt && share.expiresAt <= input.now) {
    throw new MatchSocialError("SHARE_EXPIRED", "This notes link has expired.");
  }
  if (share.ownerPersonId === input.actor.personId) {
    throw new MatchSocialError(
      "SHARE_ALREADY_CLAIMED",
      "This is your own private match journal.",
    );
  }
  if (
    share.claimedByPersonId &&
    share.claimedByPersonId !== input.actor.personId
  ) {
    throw new MatchSocialError(
      "SHARE_ALREADY_CLAIMED",
      "This private notes link has already been accepted by another Duna member.",
    );
  }
  if (!share.claimedByPersonId) {
    await database.transaction(async (transaction) => {
      const [claimed] = await transaction
        .update(playerMatchNoteShares)
        .set({
          claimedByPersonId: input.actor.personId,
          claimedAt: input.now,
          lastViewedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(playerMatchNoteShares.id, share.id),
            isNull(playerMatchNoteShares.claimedByPersonId),
          ),
        )
        .returning();
      if (!claimed) {
        throw new MatchSocialError(
          "SHARE_ALREADY_CLAIMED",
          "This private notes link was accepted by another Duna member.",
        );
      }
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "player.match_note_share_claimed",
        entityType: "player-match-note-share",
        entityId: share.id,
        afterHash: stableHash({ matchId: share.matchId, claimed: true }),
        reason: "Verified Duna member accepted a private match-note share.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
    });
  }
  return { matchId: share.matchId, claimed: true as const };
}

export async function revokeMatchNoteShare(input: {
  readonly actor: ApiActor;
  readonly shareId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  await getTransactionalDatabase().transaction(async (transaction) => {
    const [share] = await transaction
      .update(playerMatchNoteShares)
      .set({ status: "revoked", revokedAt: input.now, updatedAt: input.now })
      .where(
        and(
          eq(playerMatchNoteShares.id, input.shareId),
          eq(playerMatchNoteShares.ownerPersonId, input.actor.personId),
          eq(playerMatchNoteShares.status, "active"),
        ),
      )
      .returning();
    if (!share) {
      throw new MatchSocialError(
        "SHARE_NOT_FOUND",
        "Active notes share not found.",
      );
    }
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "player.match_note_share_revoked",
      entityType: "player-match-note-share",
      entityId: share.id,
      reason: "Player revoked access to their private match notes.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { revoked: true as const };
}

async function requireCommunitySubject(subject: CommunitySubject) {
  const database = getDatabase();
  const found =
    subject.type === "match"
      ? ((await database.query.matches.findFirst({
          columns: { id: true },
          where: eq(matches.id, subject.id),
        })) ??
        (await database.query.importedMatches.findFirst({
          columns: { id: true },
          where: eq(importedMatches.id, subject.id),
        })))
      : subject.type === "live-stream"
        ? await database.query.videos.findFirst({
            columns: { id: true },
            where: and(
              eq(videos.id, subject.id),
              eq(videos.liveVisibility, "public"),
            ),
          })
        : subject.type === "pro-event"
          ? await database.query.professionalEvents.findFirst({
              columns: { id: true },
              where: eq(professionalEvents.id, subject.id),
            })
          : await database.query.predictionMarkets.findFirst({
              columns: { id: true },
              where: eq(predictionMarkets.id, subject.id),
            });
  if (!found) {
    throw new MatchSocialError(
      "SUBJECT_NOT_FOUND",
      "This conversation is not available.",
    );
  }
}

function commentSummary(
  row: {
    readonly comment: typeof communityComments.$inferSelect;
    readonly author: {
      readonly id: string;
      readonly displayName: string;
      readonly handle: string;
      readonly avatarUrl: string | null;
    };
  },
  actor?: ApiActor,
) {
  return {
    id: row.comment.id,
    subject: {
      type: row.comment.subjectType as CommunitySubject["type"],
      id: row.comment.subjectId,
    },
    author: {
      id: row.author.id,
      displayName: row.author.displayName,
      handle: row.author.handle,
      ...(row.author.avatarUrl ? { avatarUrl: row.author.avatarUrl } : {}),
      publicPath: `/players/${row.author.handle}`,
    },
    body: row.comment.body,
    status: row.comment.status as "held" | "visible",
    moderationState: row.comment.moderationState as
      "screening" | "safe" | "review" | "blocked",
    viewerCanDelete: Boolean(
      actor &&
      (actor.personId === row.comment.authorPersonId ||
        actor.scopes.includes("*")),
    ),
    ...(row.comment.editedAt
      ? { editedAt: row.comment.editedAt.toISOString() }
      : {}),
    createdAt: row.comment.createdAt.toISOString(),
  };
}

export async function loadCommunityComments(input: {
  readonly subject: CommunitySubject;
  readonly actor?: ApiActor;
}) {
  await requireCommunitySubject(input.subject);
  const rows = await getDatabase()
    .select({
      comment: communityComments,
      author: {
        id: people.id,
        displayName: people.displayName,
        handle: people.handle,
        avatarUrl: people.avatarUrl,
      },
    })
    .from(communityComments)
    .innerJoin(people, eq(communityComments.authorPersonId, people.id))
    .where(
      and(
        eq(communityComments.subjectType, input.subject.type),
        eq(communityComments.subjectId, input.subject.id),
        eq(communityComments.status, "visible"),
        eq(people.status, "active"),
      ),
    )
    .orderBy(asc(communityComments.createdAt))
    .limit(200);
  return rows.map((row) => commentSummary(row, input.actor));
}

export async function createCommunityComment(input: {
  readonly actor: ApiActor;
  readonly subject: CommunitySubject;
  readonly body: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  await Promise.all([
    requirePaidPremium(input.actor, input.now),
    requireCommunitySubject(input.subject),
  ]);
  const moderation = await screenPublicCommunityComment(input.body);
  const id = crypto.randomUUID();
  const status = moderation.decision === "safe" ? "visible" : "held";
  const database = getTransactionalDatabase();
  const author = await database.query.people.findFirst({
    columns: {
      id: true,
      displayName: true,
      handle: true,
      avatarUrl: true,
    },
    where: eq(people.id, input.actor.personId),
  });
  if (!author) {
    throw new MatchSocialError(
      "VERIFIED_ACCOUNT_REQUIRED",
      "Verified account not found.",
    );
  }
  const comment = await database.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(communityComments)
      .values({
        id,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        authorPersonId: input.actor.personId,
        body: input.body,
        status,
        moderationState:
          moderation.decision === "safe"
            ? "safe"
            : moderation.decision === "block"
              ? "blocked"
              : "review",
        moderationReason: moderation.explanation,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "community.comment_created",
      entityType: "community-comment",
      entityId: id,
      afterHash: stableHash({
        subject: input.subject,
        body: input.body,
        moderation: moderation.decision,
      }),
      reason:
        status === "visible"
          ? "Verified Premium member published a screened community comment."
          : "Community comment was held by the public safety screen.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
    return created!;
  });
  return commentSummary({ comment, author }, input.actor);
}

export async function deleteCommunityComment(input: {
  readonly actor: ApiActor;
  readonly commentId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  const comment = await getDatabase().query.communityComments.findFirst({
    where: eq(communityComments.id, input.commentId),
  });
  if (!comment) {
    throw new MatchSocialError("COMMENT_NOT_FOUND", "Comment not found.");
  }
  if (
    comment.authorPersonId !== input.actor.personId &&
    !input.actor.scopes.includes("*")
  ) {
    throw new MatchSocialError(
      "COMMENT_FORBIDDEN",
      "You cannot remove another member's comment.",
    );
  }
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .update(communityComments)
      .set({ status: "removed", deletedAt: input.now, updatedAt: input.now })
      .where(eq(communityComments.id, comment.id));
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "community.comment_removed",
      entityType: "community-comment",
      entityId: comment.id,
      beforeHash: stableHash({ body: comment.body, status: comment.status }),
      reason: "Member or platform administrator removed a community comment.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { removed: true as const };
}
