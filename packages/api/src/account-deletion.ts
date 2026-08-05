import { WorkOS } from "@workos-inc/node";
import { foldWalletLedger } from "@duna/core";
import {
  adminRoles,
  agentDrafts,
  auditLog,
  calendarChangeProposals,
  calendarConnections,
  consents,
  dunaPlusGrants,
  externalPlayerProfiles,
  follows,
  formResponses,
  getDatabase,
  guardianConsents,
  guardianInvitations,
  guardianships,
  healthConnections,
  healthDailyCheckIns,
  healthSamples,
  healthSharingGrants,
  idempotencyRecords,
  identityVerificationSessions,
  importLinks,
  legalAcceptances,
  liveActivitySubscriptions,
  memberships,
  messages,
  organizationMemberships,
  organizationParticipants,
  organizationStaffProfiles,
  organizations,
  people,
  playerSourceConnections,
  posts,
  privacyRequests,
  ratingEvents,
  ratings,
  reports,
  videoShareLinks,
  videos,
  videoViews,
  visionSessions,
  walletAccounts,
  walletLedger,
  workflowJobs,
  worldRankings,
} from "@duna/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  completeMuxLiveVideo,
  deleteMuxLiveVideo,
  deleteMuxVideoAsset,
  deleteR2VideoObject,
  replaceMuxAssetPlaybackPolicy,
  replaceMuxLivePlaybackPolicy,
} from "./video-providers";
import { resolveWorkOSCredentials } from "./workos-environment";

export const ACCOUNT_DELETION_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1_000;

export function accountDeletionScheduledFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_MS);
}

export function deletedPersonHandle(personId: string): string {
  return `deleted-${personId.replaceAll("-", "")}`.slice(0, 48);
}

function externalResourceMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    readonly name?: string;
    readonly status?: number;
    readonly statusCode?: number;
    readonly response?: { readonly status?: number };
  };
  return (
    candidate.name === "NotFoundException" ||
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    candidate.response?.status === 404
  );
}

async function deleteWorkOSIdentity(workosUserId: string): Promise<void> {
  const credentials = resolveWorkOSCredentials();
  if (!credentials) {
    throw new Error(
      "WorkOS credentials are required before an account can be permanently deleted.",
    );
  }
  try {
    const workos = new WorkOS(credentials.apiKey, {
      appInfo: { name: "duna", version: "0.1.0" },
    });
    await workos.userManagement.deleteUser(workosUserId);
  } catch (error) {
    if (!externalResourceMissing(error)) throw error;
  }
}

type DeletionVideo = {
  readonly id: string;
  readonly status: string;
  readonly muxLiveStreamId: string | null;
  readonly muxLivePlaybackId: string | null;
  readonly muxLivePlaybackPolicy: string | null;
  readonly muxAssetId: string | null;
  readonly muxAssetPlaybackId: string | null;
  readonly muxAssetPlaybackPolicy: string | null;
  readonly r2ObjectKey: string | null;
};

async function loadDeletionVideos(personId: string): Promise<DeletionVideo[]> {
  return getDatabase()
    .select({
      id: videos.id,
      status: videos.status,
      muxLiveStreamId: videos.muxLiveStreamId,
      muxLivePlaybackId: videos.muxLivePlaybackId,
      muxLivePlaybackPolicy: videos.muxLivePlaybackPolicy,
      muxAssetId: videos.muxAssetId,
      muxAssetPlaybackId: videos.muxAssetPlaybackId,
      muxAssetPlaybackPolicy: videos.muxAssetPlaybackPolicy,
      r2ObjectKey: videos.r2ObjectKey,
    })
    .from(videos)
    .where(eq(videos.ownerPersonId, personId));
}

export async function containAccountMedia(input: {
  readonly requestId: string;
  readonly personId: string;
  readonly now: Date;
}): Promise<{ readonly contained: number; readonly cancelled: boolean }> {
  const database = getDatabase();
  const request = await database.query.privacyRequests.findFirst({
    where: and(
      eq(privacyRequests.id, input.requestId),
      eq(privacyRequests.personId, input.personId),
      eq(privacyRequests.kind, "account-deletion"),
    ),
  });
  if (!request || request.status === "cancelled") {
    return { contained: 0, cancelled: true };
  }
  if (request.status === "completed") {
    return { contained: 0, cancelled: false };
  }

  const videoRows = await loadDeletionVideos(input.personId);
  for (const video of videoRows) {
    let livePlaybackId = video.muxLivePlaybackId;
    let livePlaybackPolicy = video.muxLivePlaybackPolicy;
    let assetPlaybackId = video.muxAssetPlaybackId;
    let assetPlaybackPolicy = video.muxAssetPlaybackPolicy;

    if (video.muxLiveStreamId) {
      try {
        await completeMuxLiveVideo(video.muxLiveStreamId);
      } catch (error) {
        if (!externalResourceMissing(error)) throw error;
      }
    }
    if (
      video.muxLiveStreamId &&
      video.muxLivePlaybackId &&
      video.muxLivePlaybackPolicy === "public"
    ) {
      livePlaybackId = await replaceMuxLivePlaybackPolicy({
        liveStreamId: video.muxLiveStreamId,
        previousPlaybackId: video.muxLivePlaybackId,
        policy: "signed",
      });
      livePlaybackPolicy = "signed";
    }
    if (
      video.muxAssetId &&
      video.muxAssetPlaybackId &&
      video.muxAssetPlaybackPolicy === "public"
    ) {
      assetPlaybackId = await replaceMuxAssetPlaybackPolicy({
        assetId: video.muxAssetId,
        previousPlaybackId: video.muxAssetPlaybackId,
        policy: "signed",
      });
      assetPlaybackPolicy = "signed";
    }

    await database
      .update(videos)
      .set({
        status: video.status === "live" ? "ended" : video.status,
        liveVisibility: "link-only",
        recordingVisibility: "private",
        publishedToProfile: false,
        muxLivePlaybackId: livePlaybackId,
        muxLivePlaybackPolicy: livePlaybackPolicy,
        muxAssetPlaybackId: assetPlaybackId,
        muxAssetPlaybackPolicy: assetPlaybackPolicy,
        endedAt: video.status === "live" ? input.now : undefined,
        updatedAt: input.now,
      })
      .where(eq(videos.id, video.id));
  }
  return { contained: videoRows.length, cancelled: false };
}

async function deletionStillReady(personId: string): Promise<boolean> {
  const database = getDatabase();
  const [walletRows, membershipRows, ownerRows] = await Promise.all([
    database
      .select({
        id: walletLedger.id,
        direction: walletLedger.direction,
        amountMinor: walletLedger.amountMinor,
        currency: walletLedger.currency,
        status: walletLedger.status,
        taxCharacter: walletLedger.taxCharacter,
        reasonCode: walletLedger.reasonCode,
        createdAt: walletLedger.createdAt,
      })
      .from(walletLedger)
      .innerJoin(
        walletAccounts,
        eq(walletLedger.walletAccountId, walletAccounts.id),
      )
      .where(eq(walletAccounts.personId, personId))
      .orderBy(desc(walletLedger.createdAt)),
    database
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.personId, personId),
          inArray(memberships.status, [
            "active",
            "trialing",
            "past_due",
            "incomplete",
            "unpaid",
          ]),
        ),
      )
      .limit(1),
    database
      .select({ id: organizations.id })
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizationMemberships.organizationId, organizations.id),
      )
      .where(
        and(
          eq(organizationMemberships.personId, personId),
          eq(organizationMemberships.role, "owner"),
          eq(organizationMemberships.active, true),
        ),
      )
      .limit(1),
  ]);
  const wallet = foldWalletLedger(
    walletRows.map((row) => ({
      id: row.id,
      direction: row.direction,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status,
      taxCharacter: row.taxCharacter,
      reasonCode: row.reasonCode,
      occurredAt: row.createdAt.toISOString(),
    })),
  );
  return (
    wallet.availableMinor === 0 &&
    wallet.pendingMinor === 0 &&
    wallet.heldMinor === 0 &&
    membershipRows.length === 0 &&
    ownerRows.length === 0
  );
}

export async function permanentlyDeleteAccount(input: {
  readonly requestId: string;
  readonly personId: string;
  readonly workflowJobId: string;
  readonly now: Date;
}): Promise<{
  readonly status: "completed" | "cancelled" | "identity-review";
}> {
  const database = getDatabase();
  const request = await database.query.privacyRequests.findFirst({
    where: and(
      eq(privacyRequests.id, input.requestId),
      eq(privacyRequests.personId, input.personId),
      eq(privacyRequests.kind, "account-deletion"),
    ),
  });
  if (!request || request.status === "cancelled") {
    return { status: "cancelled" };
  }
  if (request.status === "completed") {
    return { status: "completed" };
  }
  if (request.status !== "queued") {
    return { status: "identity-review" };
  }
  if (accountDeletionScheduledFor(request.createdAt) > input.now) {
    throw new Error("Account deletion cannot run before its recovery window.");
  }
  if (!(await deletionStillReady(input.personId))) {
    await database.batch([
      database
        .update(privacyRequests)
        .set({ status: "identity-review", updatedAt: input.now })
        .where(eq(privacyRequests.id, request.id)),
      database.insert(auditLog).values({
        actorType: "system",
        action: "privacy.account_deletion_paused",
        entityType: "privacy-request",
        entityId: request.id,
        reason:
          "Permanent deletion was paused because a money, subscription, or organization-ownership blocker appeared during the recovery window.",
        traceId: input.workflowJobId,
        createdAt: input.now,
      }),
    ]);
    return { status: "identity-review" };
  }

  const person = await database.query.people.findFirst({
    where: eq(people.id, input.personId),
  });
  if (!person) return { status: "completed" };
  const [videoRows, postRows] = await Promise.all([
    loadDeletionVideos(input.personId),
    database
      .select({ mediaKeys: posts.mediaKeys })
      .from(posts)
      .where(eq(posts.authorPersonId, input.personId)),
  ]);

  for (const video of videoRows) {
    if (video.muxLiveStreamId) {
      await deleteMuxLiveVideo(video.muxLiveStreamId);
    }
    if (video.muxAssetId) {
      await deleteMuxVideoAsset(video.muxAssetId);
    }
    if (video.r2ObjectKey) {
      await deleteR2VideoObject(video.r2ObjectKey);
    }
  }
  for (const mediaKey of new Set(postRows.flatMap((row) => row.mediaKeys))) {
    await deleteR2VideoObject(mediaKey);
  }
  if (person.workosUserId) {
    await deleteWorkOSIdentity(person.workosUserId);
  }

  await database.batch([
    database
      .delete(healthSharingGrants)
      .where(
        or(
          eq(healthSharingGrants.ownerPersonId, input.personId),
          eq(healthSharingGrants.audiencePersonId, input.personId),
        ),
      ),
    database
      .delete(healthSamples)
      .where(eq(healthSamples.personId, input.personId)),
    database
      .delete(healthDailyCheckIns)
      .where(eq(healthDailyCheckIns.personId, input.personId)),
    database
      .delete(healthConnections)
      .where(eq(healthConnections.personId, input.personId)),
    database
      .delete(visionSessions)
      .where(eq(visionSessions.ownerPersonId, input.personId)),
    database
      .delete(videoShareLinks)
      .where(eq(videoShareLinks.createdByPersonId, input.personId)),
    database
      .update(videoViews)
      .set({ viewerPersonId: null })
      .where(eq(videoViews.viewerPersonId, input.personId)),
    database.delete(videos).where(eq(videos.ownerPersonId, input.personId)),
    database.delete(posts).where(eq(posts.authorPersonId, input.personId)),
    database
      .delete(messages)
      .where(
        or(
          eq(messages.senderPersonId, input.personId),
          eq(messages.recipientPersonId, input.personId),
        ),
      ),
    database
      .update(messages)
      .set({
        guardianCopyPersonIds: sql`array_remove(${messages.guardianCopyPersonIds}, ${input.personId}::uuid)`,
      })
      .where(
        sql`${input.personId}::uuid = ANY(${messages.guardianCopyPersonIds})`,
      ),
    database
      .delete(formResponses)
      .where(
        or(
          eq(formResponses.personId, input.personId),
          eq(formResponses.subjectPersonId, input.personId),
          eq(formResponses.signedByPersonId, input.personId),
        ),
      ),
    database
      .delete(playerSourceConnections)
      .where(eq(playerSourceConnections.personId, input.personId)),
    database
      .delete(calendarConnections)
      .where(eq(calendarConnections.personId, input.personId)),
    database
      .delete(calendarChangeProposals)
      .where(eq(calendarChangeProposals.createdByPersonId, input.personId)),
    database
      .update(calendarChangeProposals)
      .set({ proposedCoachPersonId: null })
      .where(eq(calendarChangeProposals.proposedCoachPersonId, input.personId)),
    database
      .delete(identityVerificationSessions)
      .where(eq(identityVerificationSessions.personId, input.personId)),
    database
      .delete(organizationStaffProfiles)
      .where(eq(organizationStaffProfiles.personId, input.personId)),
    database
      .delete(organizationParticipants)
      .where(eq(organizationParticipants.personId, input.personId)),
    database
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.personId, input.personId)),
    database
      .delete(guardianConsents)
      .where(
        or(
          eq(guardianConsents.guardianId, input.personId),
          eq(guardianConsents.minorId, input.personId),
        ),
      ),
    database
      .delete(guardianships)
      .where(
        or(
          eq(guardianships.guardianId, input.personId),
          eq(guardianships.minorId, input.personId),
        ),
      ),
    database
      .delete(guardianInvitations)
      .where(
        or(
          eq(guardianInvitations.minorId, input.personId),
          eq(guardianInvitations.createdByPersonId, input.personId),
          eq(guardianInvitations.claimedByPersonId, input.personId),
        ),
      ),
    database
      .delete(dunaPlusGrants)
      .where(eq(dunaPlusGrants.personId, input.personId)),
    database
      .update(dunaPlusGrants)
      .set({ grantedByPersonId: null, revokedByPersonId: null })
      .where(
        or(
          eq(dunaPlusGrants.grantedByPersonId, input.personId),
          eq(dunaPlusGrants.revokedByPersonId, input.personId),
        ),
      ),
    database.delete(ratings).where(eq(ratings.personId, input.personId)),
    database
      .delete(ratingEvents)
      .where(eq(ratingEvents.personId, input.personId)),
    database
      .update(worldRankings)
      .set({ personId: null, rawPayload: {} })
      .where(eq(worldRankings.personId, input.personId)),
    database
      .delete(follows)
      .where(
        or(
          eq(follows.followerPersonId, input.personId),
          and(
            eq(follows.entityType, "person"),
            eq(follows.entityId, input.personId),
          ),
        ),
      ),
    database
      .delete(liveActivitySubscriptions)
      .where(eq(liveActivitySubscriptions.personId, input.personId)),
    database
      .delete(agentDrafts)
      .where(eq(agentDrafts.personId, input.personId)),
    database.delete(adminRoles).where(eq(adminRoles.personId, input.personId)),
    database
      .delete(idempotencyRecords)
      .where(eq(idempotencyRecords.personId, input.personId)),
    database
      .update(importLinks)
      .set({
        personId: null,
        resolutionScoreBps: null,
        resolutionState: "unresolved",
        evidence: {},
        claimedAt: null,
        updatedAt: input.now,
      })
      .where(eq(importLinks.personId, input.personId)),
    database
      .update(externalPlayerProfiles)
      .set({
        personId: null,
        mappingState: "unresolved",
        mappingScoreBps: null,
        mappingEvidence: {},
        rawProfile: {},
        updatedAt: input.now,
      })
      .where(eq(externalPlayerProfiles.personId, input.personId)),
    database
      .update(consents)
      .set({ ipAddress: null, userAgent: null })
      .where(eq(consents.personId, input.personId)),
    database
      .update(legalAcceptances)
      .set({ ipAddress: null, userAgent: null })
      .where(eq(legalAcceptances.personId, input.personId)),
    database
      .update(reports)
      .set({ details: "Removed after account deletion." })
      .where(eq(reports.reporterPersonId, input.personId)),
    database
      .update(reports)
      .set({ assignedToPersonId: null })
      .where(eq(reports.assignedToPersonId, input.personId)),
    database
      .update(auditLog)
      .set({
        actorPersonId: null,
        reason:
          "De-identified audit event retained for security and legal integrity.",
        conversationId: null,
        ipAddress: null,
      })
      .where(eq(auditLog.actorPersonId, input.personId)),
    database
      .delete(workflowJobs)
      .where(eq(workflowJobs.personId, input.personId)),
    database
      .update(workflowJobs)
      .set({
        status: "succeeded",
        completedAt: input.now,
        lockedAt: null,
        lockToken: null,
        lastError: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(workflowJobs.kind, "privacy.account-containment"),
          eq(workflowJobs.idempotencyKey, request.id),
          inArray(workflowJobs.status, ["queued", "retry"]),
        ),
      ),
    database.execute(
      sql`UPDATE workflow_jobs
          SET payload = jsonb_build_object('requestId', ${request.id}::text), updated_at = ${input.now}::timestamptz
          WHERE kind LIKE 'privacy.account-%'
            AND payload ->> 'personId' = ${input.personId}::text`,
    ),
    database
      .update(people)
      .set({
        workosUserId: null,
        clerkUserId: null,
        phoneE164: null,
        email: null,
        givenName: null,
        familyName: null,
        legalGivenName: null,
        legalMiddleName: null,
        legalFamilyName: null,
        displayName: "Deleted Duna Player",
        handle: deletedPersonHandle(input.personId),
        avatarUrl: null,
        profileClaimStatus: "claimed",
        isProfessional: false,
        professionalSince: null,
        professionalDefinition: null,
        genderCategory: null,
        birthDate: null,
        isMinor: false,
        ageBand: "unknown",
        ageVerifiedAt: null,
        parentalConsentAt: null,
        profileVisibility: "private",
        homeMarket: null,
        locale: "en-US",
        measurementSystem: "imperial",
        heightMillimeters: null,
        playingExperience: "not-set",
        playedIndoorPrior: null,
        yearsPlaying: null,
        collegeName: null,
        experienceSummary: null,
        profileOnboardingStatus: "not-started",
        profileOnboardingCompletedAt: null,
        status: "deleted",
        updatedAt: input.now,
      })
      .where(eq(people.id, input.personId)),
    database
      .update(privacyRequests)
      .set({
        status: "completed",
        reason:
          "Deletion completed. Only de-identified records required for financial, consent, dispute, security, and system-integrity obligations were retained.",
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(privacyRequests.id, request.id)),
    database.insert(auditLog).values({
      actorType: "system",
      action: "privacy.account_deletion_completed",
      entityType: "privacy-request",
      entityId: request.id,
      reason:
        "Sensitive account data and connected provider copies were deleted after the recovery window; retained records were de-identified.",
      traceId: input.workflowJobId,
      createdAt: input.now,
    }),
  ]);
  return { status: "completed" };
}
