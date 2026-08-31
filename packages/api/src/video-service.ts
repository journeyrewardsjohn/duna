import { createHash, randomUUID } from "node:crypto";
import {
  MEMBERSHIP_PLANS,
  ORGANIZATION_PLANS,
  freePlanVideoBonus,
  incrementalVideoOverageSeconds,
  netCollectedOrganizationFeeMinor,
  type MembershipPlanId,
  type OrganizationPlanId,
  type PersonRole,
  type PersonSummary,
} from "@duna/core";
import {
  auditLog,
  divisions,
  dunaPlusGrants,
  getDatabase,
  getTransactionalDatabase,
  matches,
  organizationMemberships,
  organizations,
  paymentFundSchedules,
  people,
  ratings,
  registrations,
  sessions,
  teamMembers,
  teams,
  venues,
  videoAllowanceGrants,
  videoBroadcastDestinations,
  videoQuotaPolicies,
  videoInsightFeedback,
  videoShareLinks,
  videoUploadParts,
  videoViews,
  videos,
  idempotencyRecords,
  visionCalibrationSamples,
  visionSessions,
  webhookEvents,
} from "@duna/db";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { ApiActor } from "./context";
import type {
  AdminVideoOverview,
  DunaPlusGrant,
  LiveVideoSession,
  VideoMetrics,
  VideoPlayback,
  VideoStudio,
  VideoSummary,
  VideoUsage,
} from "./contracts";
import { courtCalibrationSchema } from "./contracts";
import type { VideoAllowanceGrant } from "./repository-contract";
import { getDunaPlusEntitlement } from "./membership";
import { resolveOrganizationCommissionPolicy } from "./organization-billing";
import { recordOrganizationVideoMeterEvent } from "./payments";
import { loadPublicMatchScoringState } from "./match-service";
import { loadHealthVideoOverlay } from "./health-service";
import {
  abortR2VideoUpload,
  cloudflareEmbedUrl,
  cloudflareSignedPlaybackUrl,
  completeMuxLiveVideo,
  completeR2VideoUpload,
  createCloudflareLiveVideo,
  createMuxLiveVideo,
  createR2VideoUpload,
  disableCloudflareLiveInput,
  deleteMuxLiveVideo,
  headR2VideoObject,
  isCloudflareSrtIngestEnabled,
  isCloudflareStreamConfigured,
  isR2MultipartUploadAlreadyAbsent,
  isMuxSignedPlaybackConfigured,
  isMuxLivePlanUnavailable,
  isMuxVideoConfigured,
  isR2VideoConfigured,
  loadCloudflareLiveVideo,
  loadMuxLiveIngest,
  loadMuxVideoMetrics,
  muxDataEnvironmentKey,
  listR2VideoUploadParts,
  listCloudflareLiveRecordings,
  presignR2VideoPart,
  presignR2VideoPlayback,
  R2_VIDEO_PART_SIZE_BYTES,
  replaceMuxAssetPlaybackPolicy,
  replaceMuxLivePlaybackPolicy,
  signMuxPlayback,
  signMuxThumbnail,
  signCloudflarePlayback,
  updateCloudflareLiveInputAccess,
  updateCloudflareVideoAccess,
  type R2MultipartPart,
} from "./video-providers";
import {
  endYoutubeBroadcastDestinations,
  loadYoutubeBroadcastOptions,
  provisionYoutubeBroadcastDestinations,
} from "./video-youtube-service";
import { loadVisionPlayback } from "./vision-service";

const DEFAULT_MONTHLY_LIVE_SAFETY_CEILING_SECONDS = 8 * 60 * 60;
const DEFAULT_MONTHLY_UPLOAD_SAFETY_CEILING_SECONDS = 30 * 60 * 60;
const VIDEO_UPLOAD_SESSION_SECONDS = 24 * 60 * 60;
// Uploads opened before the durable part-size column was introduced used
// 16 MiB parts. Keep their layout stable until they complete instead of
// reinterpreting a partially uploaded object after rollout.
const LEGACY_R2_VIDEO_PART_SIZE_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 ** 4;
const PUBLIC_VIDEO_STATUSES = ["live", "ready", "ended", "processing"] as const;

type LiveVideoProvider = "cloudflare" | "mux";

interface LiveVideoProviderContext {
  readonly membershipPlan?: MembershipPlanId;
  readonly organizationPlan?: OrganizationPlanId;
}

/**
 * `auto` is a product policy, not a provider failover alias. Community and
 * everyday broadcasts use Cloudflare's economical origin; the highest Duna
 * tiers retain Mux's player, low-latency pipeline, and included Mux Data.
 * Explicit environment choices remain available for staged rollout and
 * incident response.
 */
export function preferredLiveVideoProvider(
  context: LiveVideoProviderContext = {},
): LiveVideoProvider | undefined {
  const preference = (process.env.DUNA_LIVE_PROVIDER ?? "auto")
    .trim()
    .toLowerCase();
  if (preference === "cloudflare") {
    return isCloudflareStreamConfigured() ? "cloudflare" : undefined;
  }
  if (preference === "mux") {
    return isMuxVideoConfigured() ? "mux" : undefined;
  }
  const premiumExperience = context.organizationPlan
    ? context.organizationPlan === "club"
    : context.membershipPlan === "premium-plus";
  if (premiumExperience && isMuxVideoConfigured()) return "mux";
  if (isCloudflareStreamConfigured()) return "cloudflare";
  return isMuxVideoConfigured() ? "mux" : undefined;
}

interface VideoQuotaLimits {
  readonly monthlyLiveSeconds: number;
  readonly monthlyUploadSeconds: number;
  readonly enforceLiveLimit: boolean;
  readonly enforceUploadLimit: boolean;
}

export function resolveMembershipVideoQuota(input: {
  readonly plan: MembershipPlanId;
  readonly personPolicy?: VideoQuotaLimits;
  readonly globalPolicy?: VideoQuotaLimits;
}): VideoQuotaLimits {
  if (input.personPolicy) return input.personPolicy;
  const plan = MEMBERSHIP_PLANS[input.plan];
  const globalLiveSeconds =
    input.globalPolicy?.monthlyLiveSeconds ??
    DEFAULT_MONTHLY_LIVE_SAFETY_CEILING_SECONDS;
  const globalUploadSeconds =
    input.globalPolicy?.monthlyUploadSeconds ??
    DEFAULT_MONTHLY_UPLOAD_SAFETY_CEILING_SECONDS;
  return {
    monthlyLiveSeconds: input.globalPolicy?.enforceLiveLimit
      ? Math.min(plan.monthlyLiveSeconds, globalLiveSeconds)
      : plan.monthlyLiveSeconds,
    monthlyUploadSeconds: input.globalPolicy?.enforceUploadLimit
      ? Math.min(plan.monthlyUploadSeconds, globalUploadSeconds)
      : plan.monthlyUploadSeconds,
    enforceLiveLimit: true,
    enforceUploadLimit: true,
  };
}

type VideoCategory = "practice" | "event" | "match" | "social";
type LiveVisibility = "public" | "link-only";
type RecordingVisibility = "public" | "private";
type CourtCalibration = NonNullable<VideoSummary["courtCalibration"]>;

export function normalizeStoredCourtCalibration(
  value: unknown,
): CourtCalibration | undefined {
  const parsed = courtCalibrationSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const calibratedAt = (value as { readonly calibratedAt?: unknown })
    .calibratedAt;
  if (typeof calibratedAt !== "string") return undefined;

  const timestamp = new Date(calibratedAt);
  if (Number.isNaN(timestamp.getTime())) return undefined;

  const normalized = courtCalibrationSchema.safeParse({
    ...value,
    calibratedAt: timestamp.toISOString(),
  });
  return normalized.success ? normalized.data : undefined;
}

export class VideoServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "LIVE_PROVIDER_REQUIRED"
      | "MUX_REQUIRED"
      | "R2_REQUIRED"
      | "SIGNED_PLAYBACK_REQUIRED"
      | "LIVE_PLAN_UNAVAILABLE"
      | "LIVE_PROVIDER_FAILED"
      | "UPLOAD_PROVIDER_FAILED"
      | "DUNA_PLUS_REQUIRED"
      | "ADULT_REQUIRED"
      | "LIVE_QUOTA_EXCEEDED"
      | "UPLOAD_QUOTA_EXCEEDED"
      | "VIDEO_NOT_FOUND"
      | "ASSOCIATION_NOT_FOUND"
      | "INVALID_ASSOCIATION"
      | "PLAYBACK_NOT_READY"
      | "PLAYBACK_FORBIDDEN"
      | "UPLOAD_NOT_ACTIVE"
      | "UPLOAD_PART_INVALID"
      | "UPLOAD_INCOMPLETE"
      | "GRANT_NOT_FOUND"
      | "ALLOWANCE_GRANT_NOT_FOUND"
      | "INVALID_ALLOWANCE_GRANT"
      | "CALIBRATION_SAMPLE_NOT_FOUND"
      | "CALIBRATION_SAMPLE_ALREADY_REVIEWED"
      | "CALIBRATION_SAMPLE_PREVIEW_REQUIRED"
      | "INVALID_GRANT_WINDOW",
    message: string,
  ) {
    super(message);
    this.name = "VideoServiceError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new VideoServiceError(
      "DATABASE_REQUIRED",
      "Video requires a connected Duna database.",
    );
  }
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function shareToken(): string {
  return `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
}

function publicWebOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_DUNA_WEB_URL ??
    process.env.DUNA_WEB_URL ??
    "https://duna-web.vercel.app"
  ).replace(/\/+$/, "");
}

function videoShareUrl(videoId: string, token: string): string {
  return `${publicWebOrigin()}/watch/${videoId}?token=${encodeURIComponent(token)}`;
}

function monthBounds(now: Date): { startsAt: Date; endsAt: Date } {
  return {
    startsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

type VideoAllowanceGrantWindow = Pick<
  typeof videoAllowanceGrants.$inferSelect,
  "uploadSeconds" | "liveSeconds" | "startsAt" | "endsAt" | "revokedAt"
>;

function videoAllowanceGrantIsActive(
  grant: VideoAllowanceGrantWindow,
  now: Date,
): boolean {
  return (
    !grant.revokedAt &&
    grant.startsAt <= now &&
    (!grant.endsAt || grant.endsAt > now)
  );
}

export function activeVideoAllowanceTotals(
  grants: readonly VideoAllowanceGrantWindow[],
  now = new Date(),
): { readonly uploadSeconds: number; readonly liveSeconds: number } {
  return grants
    .filter((grant) => videoAllowanceGrantIsActive(grant, now))
    .reduce(
      (total, grant) => ({
        uploadSeconds: total.uploadSeconds + grant.uploadSeconds,
        liveSeconds: total.liveSeconds + grant.liveSeconds,
      }),
      { uploadSeconds: 0, liveSeconds: 0 },
    );
}

function validRoles(roles: readonly string[]): readonly PersonRole[] {
  const supported = new Set<PersonRole>([
    "player",
    "guardian",
    "coach",
    "owner",
    "manager",
    "front-desk",
    "scorekeeper",
    "accountant",
    "admin",
    "super-admin",
  ]);
  return roles.filter((role): role is PersonRole =>
    supported.has(role as PersonRole),
  );
}

async function loadPersonSummaries(
  personIds: readonly string[],
): Promise<Map<string, PersonSummary>> {
  const uniqueIds = [...new Set(personIds)];
  if (uniqueIds.length === 0) return new Map();
  const database = getDatabase();
  const [personRows, ratingRows, membershipRows] = await Promise.all([
    database.select().from(people).where(inArray(people.id, uniqueIds)),
    database
      .select()
      .from(ratings)
      .where(
        and(
          inArray(ratings.personId, uniqueIds),
          eq(ratings.discipline, "beach-2s"),
        ),
      ),
    database
      .select({
        personId: organizationMemberships.personId,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .where(
        and(
          inArray(organizationMemberships.personId, uniqueIds),
          eq(organizationMemberships.active, true),
        ),
      ),
  ]);
  const ratingByPerson = new Map(
    ratingRows.map((rating) => [rating.personId, rating] as const),
  );
  const rolesByPerson = new Map<string, Set<string>>();
  for (const personId of uniqueIds) {
    rolesByPerson.set(personId, new Set(["player"]));
  }
  for (const membership of membershipRows) {
    rolesByPerson.get(membership.personId)?.add(membership.role);
  }
  return new Map(
    personRows.map((person) => {
      const rating = ratingByPerson.get(person.id);
      const summary: PersonSummary = {
        id: person.id,
        displayName: person.displayName,
        handle: person.handle,
        initials: initials(person.displayName),
        homeMarket: person.homeMarket ?? "Market not set",
        rating: rating
          ? {
              display: rating.display,
              mu: rating.mu,
              phi: rating.phi,
              sigma: rating.sigma,
              confidence: rating.confidence,
              discipline: rating.discipline,
            }
          : {
              display: 3,
              mu: 1_500,
              phi: 350,
              sigma: 0.06,
              confidence: "Provisional",
              discipline: "beach-2s",
            },
        roles: validRoles([...(rolesByPerson.get(person.id) ?? ["player"])]),
        isMinor: person.isMinor,
        avatarUrl: person.avatarUrl ?? undefined,
        profileClaimStatus: person.profileClaimStatus as
          "claimed" | "unclaimed" | "claim-pending" | "merged",
        isProfessional: person.isProfessional,
      };
      return [person.id, summary] as const;
    }),
  );
}

interface VideoQuery {
  readonly where?: SQL;
  readonly limit?: number;
  readonly includePrivatePosters?: boolean;
}

async function loadVideoSummaries(
  input: VideoQuery = {},
): Promise<VideoSummary[]> {
  const database = getDatabase();
  const rows = await database
    .select({
      video: videos,
      event: {
        id: sessions.id,
        slug: sessions.slug,
        title: sessions.title,
      },
      venue: {
        id: venues.id,
        name: venues.name,
      },
      match: {
        id: matches.id,
        teamAId: matches.teamAId,
        teamBId: matches.teamBId,
      },
    })
    .from(videos)
    .leftJoin(sessions, eq(videos.eventId, sessions.id))
    .leftJoin(venues, eq(videos.venueId, venues.id))
    .leftJoin(matches, eq(videos.matchId, matches.id))
    .where(input.where)
    .orderBy(desc(videos.createdAt))
    .limit(input.limit ?? 100);
  const owners = await loadPersonSummaries(
    rows.map((row) => row.video.ownerPersonId),
  );
  const videoIds = rows.map((row) => row.video.id);
  const previewRows = videoIds.length
    ? await database
        .select({
          videoId: visionSessions.videoId,
          previewJpegBase64: visionSessions.previewJpegBase64,
        })
        .from(visionSessions)
        .where(inArray(visionSessions.videoId, videoIds))
    : [];
  const previewByVideo = new Map(
    previewRows.flatMap((preview) =>
      preview.videoId && preview.previewJpegBase64
        ? [
            [
              preview.videoId,
              `data:image/jpeg;base64,${preview.previewJpegBase64}`,
            ] as const,
          ]
        : [],
    ),
  );
  const privatePosterEntries = input.includePrivatePosters
    ? await Promise.all(
        rows.map(async ({ video }) => {
          const playbackId =
            video.muxAssetPlaybackPolicy === "signed" &&
            video.muxAssetPlaybackId
              ? video.muxAssetPlaybackId
              : video.muxLivePlaybackPolicy === "signed" &&
                  video.muxLivePlaybackId
                ? video.muxLivePlaybackId
                : undefined;
          if (!playbackId || !isMuxSignedPlaybackConfigured()) return undefined;
          const token = await signMuxThumbnail({
            playbackId,
            durationSeconds: video.durationSeconds ?? undefined,
          }).catch(() => undefined);
          return token
            ? ([
                video.id,
                `https://image.mux.com/${playbackId}/thumbnail.jpg?token=${encodeURIComponent(token)}`,
              ] as const)
            : undefined;
        }),
      )
    : [];
  const privatePosterByVideo = new Map<string, string>();
  for (const entry of privatePosterEntries) {
    if (entry) privatePosterByVideo.set(entry[0], entry[1]);
  }
  const teamIds = rows.flatMap((row) =>
    [row.match?.teamAId, row.match?.teamBId].filter((id): id is string =>
      Boolean(id),
    ),
  );
  const teamRows =
    teamIds.length > 0
      ? await database
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, [...new Set(teamIds)]))
      : [];
  const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
  return rows.flatMap((row) => {
    const video = row.video;
    const owner = owners.get(video.ownerPersonId);
    if (!owner) return [];
    const matchLabel = row.match
      ? `${row.match.teamAId ? (teamNameById.get(row.match.teamAId) ?? "Team A") : "Team A"} vs ${row.match.teamBId ? (teamNameById.get(row.match.teamBId) ?? "Team B") : "Team B"}`
      : undefined;
    const publicMuxPlaybackId =
      video.muxAssetPlaybackPolicy !== "signed" && video.muxAssetPlaybackId
        ? video.muxAssetPlaybackId
        : video.muxLivePlaybackPolicy !== "signed" && video.muxLivePlaybackId
          ? video.muxLivePlaybackId
          : undefined;
    const posterUrl =
      video.liveProviderPosterUrl ??
      (publicMuxPlaybackId
        ? `https://image.mux.com/${publicMuxPlaybackId}/thumbnail.jpg`
        : undefined) ??
      privatePosterByVideo.get(video.id) ??
      previewByVideo.get(video.id);
    return [
      {
        id: video.id,
        organizationId: video.organizationId ?? undefined,
        owner,
        source: video.source as "live" | "upload",
        liveProvider:
          video.liveProvider === "cloudflare" || video.liveProvider === "mux"
            ? video.liveProvider
            : video.muxLiveStreamId
              ? "mux"
              : undefined,
        category: video.category as VideoCategory,
        title: video.title,
        status: video.status as VideoSummary["status"],
        event: row.event?.id
          ? {
              id: row.event.id,
              slug: row.event.slug,
              title: row.event.title,
            }
          : undefined,
        match:
          row.match?.id && matchLabel
            ? { id: row.match.id, label: matchLabel }
            : undefined,
        venue:
          video.venueName || row.venue?.name
            ? {
                id: row.venue?.id ?? undefined,
                name: video.venueName ?? row.venue?.name ?? "Venue",
                address: video.venueAddress ?? undefined,
                googlePlaceId: video.googlePlaceId ?? undefined,
                latitude: video.latitude ?? undefined,
                longitude: video.longitude ?? undefined,
              }
            : undefined,
        liveVisibility: video.liveVisibility as LiveVisibility,
        recordingVisibility: video.recordingVisibility as RecordingVisibility,
        publishedToProfile: video.publishedToProfile,
        hasAudio: video.hasAudio,
        musicRemovalRequested: video.musicRemovalRequested,
        musicRemovalStatus:
          video.musicRemovalStatus as VideoSummary["musicRemovalStatus"],
        durationSeconds: video.durationSeconds ?? undefined,
        bytes: video.bytes ?? undefined,
        posterUrl,
        courtCalibration: normalizeStoredCourtCalibration(
          video.courtCalibration,
        ),
        startedAt: video.startedAt?.toISOString(),
        endedAt: video.endedAt?.toISOString(),
        readyAt: video.readyAt?.toISOString(),
        createdAt: video.createdAt.toISOString(),
      },
    ];
  });
}

async function loadVideoSummary(videoId: string): Promise<VideoSummary> {
  const summary = (
    await loadVideoSummaries({ where: eq(videos.id, videoId), limit: 1 })
  )[0];
  if (!summary) {
    throw new VideoServiceError("VIDEO_NOT_FOUND", "Video not found.");
  }
  return summary;
}

async function loadOrganizationQuotaBreakdown(
  organizationId: string,
  now: Date,
) {
  const database = getDatabase();
  const { startsAt, endsAt } = monthBounds(now);
  const [organization, feeRows, grantRows] = await Promise.all([
    database.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    }),
    database
      .select({
        grossMinor: paymentFundSchedules.grossMinor,
        organizationFeeMinor: paymentFundSchedules.organizationFeeMinor,
        refundedMinor: paymentFundSchedules.refundedMinor,
        disputedMinor: paymentFundSchedules.disputedMinor,
      })
      .from(paymentFundSchedules)
      .where(
        and(
          eq(paymentFundSchedules.organizationId, organizationId),
          gte(paymentFundSchedules.createdAt, startsAt),
          lt(paymentFundSchedules.createdAt, endsAt),
        ),
      ),
    database
      .select()
      .from(videoAllowanceGrants)
      .where(
        and(
          eq(videoAllowanceGrants.organizationId, organizationId),
          isNull(videoAllowanceGrants.revokedAt),
          lte(videoAllowanceGrants.startsAt, now),
          or(
            isNull(videoAllowanceGrants.endsAt),
            gt(videoAllowanceGrants.endsAt, now),
          ),
        ),
      ),
  ]);
  if (!organization) {
    throw new VideoServiceError(
      "VIDEO_NOT_FOUND",
      "Organization video workspace was not found.",
    );
  }
  const effectivePlan =
    resolveOrganizationCommissionPolicy(organization).effectivePlan;
  const plan = ORGANIZATION_PLANS[effectivePlan];
  const feesCollectedMinor = feeRows.reduce(
    (sum, row) => sum + netCollectedOrganizationFeeMinor(row),
    0,
  );
  const earnedBonus =
    effectivePlan === "coach"
      ? freePlanVideoBonus(feesCollectedMinor)
      : { uploadSeconds: 0, liveSeconds: 0 };
  const granted = activeVideoAllowanceTotals(grantRows, now);
  return {
    organization,
    effectivePlan,
    plan,
    earnedBonus,
    granted,
    periodEndsAt: endsAt,
    monthlyLiveSeconds:
      plan.monthlyLiveSeconds +
      organization.videoLiveAddonSeconds +
      earnedBonus.liveSeconds +
      granted.liveSeconds,
    monthlyUploadSeconds:
      plan.monthlyUploadSeconds +
      organization.videoUploadAddonSeconds +
      earnedBonus.uploadSeconds +
      granted.uploadSeconds,
    enforceLiveLimit: !organization.videoPaygEnabled,
    enforceUploadLimit: !organization.videoPaygEnabled,
  };
}

function videoAllowanceGrantResult(
  grant: typeof videoAllowanceGrants.$inferSelect,
  organizationName: string,
  peopleById: ReadonlyMap<string, PersonSummary>,
  now: Date,
): VideoAllowanceGrant {
  const targetType = grant.organizationId ? "organization" : "person";
  const targetId = grant.organizationId ?? grant.personId;
  if (!targetId) {
    throw new VideoServiceError(
      "GRANT_NOT_FOUND",
      "Video allowance grant target was not found.",
    );
  }
  return {
    id: grant.id,
    targetType,
    targetId,
    targetName:
      targetType === "organization"
        ? organizationName
        : (peopleById.get(targetId)?.displayName ?? "Removed player"),
    uploadSeconds: grant.uploadSeconds,
    liveSeconds: grant.liveSeconds,
    cadence: grant.cadence as "current-period" | "recurring",
    startsAt: grant.startsAt.toISOString(),
    endsAt: grant.endsAt?.toISOString(),
    reason: grant.reason,
    active: videoAllowanceGrantIsActive(grant, now),
    grantedByName: grant.grantedByPersonId
      ? peopleById.get(grant.grantedByPersonId)?.displayName
      : undefined,
    revokedAt: grant.revokedAt?.toISOString(),
    revokedByName: grant.revokedByPersonId
      ? peopleById.get(grant.revokedByPersonId)?.displayName
      : undefined,
  };
}

export async function loadOrganizationVideoAllowance(
  organizationId: string,
  now = new Date(),
) {
  requireDatabase();
  const database = getDatabase();
  const [breakdown, grantRows] = await Promise.all([
    loadOrganizationQuotaBreakdown(organizationId, now),
    database
      .select()
      .from(videoAllowanceGrants)
      .where(
        or(
          eq(videoAllowanceGrants.scopeOrganizationId, organizationId),
          eq(videoAllowanceGrants.organizationId, organizationId),
        ),
      )
      .orderBy(desc(videoAllowanceGrants.createdAt))
      .limit(100),
  ]);
  const peopleById = await loadPersonSummaries(
    grantRows.flatMap((grant) =>
      [grant.personId, grant.grantedByPersonId, grant.revokedByPersonId].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
  return {
    baseUploadSeconds: breakdown.plan.monthlyUploadSeconds,
    baseLiveSeconds: breakdown.plan.monthlyLiveSeconds,
    paidUploadSeconds: breakdown.organization.videoUploadAddonSeconds,
    paidLiveSeconds: breakdown.organization.videoLiveAddonSeconds,
    earnedUploadSeconds: breakdown.earnedBonus.uploadSeconds,
    earnedLiveSeconds: breakdown.earnedBonus.liveSeconds,
    grantedUploadSeconds: breakdown.granted.uploadSeconds,
    grantedLiveSeconds: breakdown.granted.liveSeconds,
    totalUploadSeconds: breakdown.monthlyUploadSeconds,
    totalLiveSeconds: breakdown.monthlyLiveSeconds,
    payAsYouGo: breakdown.organization.videoPaygEnabled,
    periodEndsAt: breakdown.periodEndsAt.toISOString(),
    grants: grantRows.map((grant) =>
      videoAllowanceGrantResult(
        grant,
        breakdown.organization.name,
        peopleById,
        now,
      ),
    ),
  };
}

async function loadQuotaPolicy(
  personId?: string,
  now = new Date(),
  organizationId?: string,
): Promise<VideoQuotaLimits> {
  const database = getDatabase();
  if (organizationId) {
    const breakdown = await loadOrganizationQuotaBreakdown(organizationId, now);
    return {
      monthlyLiveSeconds: breakdown.monthlyLiveSeconds,
      monthlyUploadSeconds: breakdown.monthlyUploadSeconds,
      enforceLiveLimit: breakdown.enforceLiveLimit,
      enforceUploadLimit: breakdown.enforceUploadLimit,
    };
  }
  const [personPolicy, globalPolicy, entitlement, grantRows] =
    await Promise.all([
      personId
        ? database.query.videoQuotaPolicies.findFirst({
            where: eq(videoQuotaPolicies.personId, personId),
          })
        : Promise.resolve(undefined),
      database.query.videoQuotaPolicies.findFirst({
        where: isNull(videoQuotaPolicies.personId),
      }),
      personId
        ? getDunaPlusEntitlement(personId, now)
        : Promise.resolve(undefined),
      personId
        ? database
            .select()
            .from(videoAllowanceGrants)
            .where(
              and(
                eq(videoAllowanceGrants.personId, personId),
                isNull(videoAllowanceGrants.revokedAt),
                lte(videoAllowanceGrants.startsAt, now),
                or(
                  isNull(videoAllowanceGrants.endsAt),
                  gt(videoAllowanceGrants.endsAt, now),
                ),
              ),
            )
        : Promise.resolve([]),
    ]);
  const globalLiveSeconds =
    globalPolicy?.monthlyLiveSeconds ??
    DEFAULT_MONTHLY_LIVE_SAFETY_CEILING_SECONDS;
  const globalUploadSeconds =
    globalPolicy?.monthlyUploadSeconds ??
    DEFAULT_MONTHLY_UPLOAD_SAFETY_CEILING_SECONDS;
  const base =
    personId && entitlement
      ? resolveMembershipVideoQuota({
          plan: entitlement.plan,
          personPolicy,
          globalPolicy,
        })
      : {
          monthlyLiveSeconds: globalLiveSeconds,
          monthlyUploadSeconds: globalUploadSeconds,
          enforceLiveLimit: globalPolicy?.enforceLiveLimit ?? true,
          enforceUploadLimit: globalPolicy?.enforceUploadLimit ?? true,
        };
  const granted = activeVideoAllowanceTotals(grantRows, now);
  return {
    monthlyLiveSeconds: base.monthlyLiveSeconds + granted.liveSeconds,
    monthlyUploadSeconds: base.monthlyUploadSeconds + granted.uploadSeconds,
    enforceLiveLimit: base.enforceLiveLimit,
    enforceUploadLimit: base.enforceUploadLimit,
  };
}

export async function loadVideoUsage(
  personId: string,
  now = new Date(),
  organizationId?: string,
): Promise<VideoUsage> {
  requireDatabase();
  const database = getDatabase();
  const { startsAt, endsAt } = monthBounds(now);
  const [policy, rows] = await Promise.all([
    loadQuotaPolicy(personId, now, organizationId),
    database
      .select({
        source: videos.source,
        durationSeconds: videos.durationSeconds,
        startedAt: videos.startedAt,
        endedAt: videos.endedAt,
        createdAt: videos.createdAt,
        status: videos.status,
      })
      .from(videos)
      .where(
        organizationId
          ? eq(videos.organizationId, organizationId)
          : and(
              eq(videos.ownerPersonId, personId),
              isNull(videos.organizationId),
            ),
      ),
  ]);
  let liveSeconds = 0;
  let uploadSeconds = 0;
  for (const row of rows) {
    if (row.status === "failed") continue;
    if (
      row.source === "upload" &&
      row.createdAt >= startsAt &&
      row.createdAt < endsAt
    ) {
      uploadSeconds += row.durationSeconds ?? 0;
      continue;
    }
    if (row.source !== "live" || !row.startedAt) continue;
    const streamEnd = row.endedAt ?? now;
    const overlapStart = Math.max(row.startedAt.getTime(), startsAt.getTime());
    const overlapEnd = Math.min(streamEnd.getTime(), endsAt.getTime());
    if (overlapEnd > overlapStart) {
      liveSeconds += Math.floor((overlapEnd - overlapStart) / 1_000);
    }
  }
  const liveRemaining = Math.max(0, policy.monthlyLiveSeconds - liveSeconds);
  const uploadRemaining = Math.max(
    0,
    policy.monthlyUploadSeconds - uploadSeconds,
  );
  return {
    periodStartsAt: startsAt.toISOString(),
    periodEndsAt: endsAt.toISOString(),
    live: {
      usedSeconds: liveSeconds,
      limitSeconds: policy.monthlyLiveSeconds,
      remainingSeconds: liveRemaining,
      overageSeconds: Math.max(0, liveSeconds - policy.monthlyLiveSeconds),
      enforced: policy.enforceLiveLimit,
    },
    uploads: {
      usedSeconds: uploadSeconds,
      limitSeconds: policy.monthlyUploadSeconds,
      remainingSeconds: uploadRemaining,
      overageSeconds: Math.max(0, uploadSeconds - policy.monthlyUploadSeconds),
      enforced: policy.enforceUploadLimit,
    },
  };
}

async function reportOrganizationVideoOverage(input: {
  readonly organizationId?: string | null;
  readonly personId: string;
  readonly kind: "upload" | "live";
  readonly completedSeconds: number;
  readonly videoId: string;
  readonly now: Date;
}): Promise<void> {
  if (!input.organizationId || input.completedSeconds <= 0) return;
  const organization = await getDatabase().query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (
    !organization?.videoPaygEnabled ||
    !organization.stripeBillingCustomerId
  ) {
    return;
  }
  const usage = await loadVideoUsage(
    input.personId,
    input.now,
    input.organizationId,
  );
  const meter = input.kind === "upload" ? usage.uploads : usage.live;
  const overageSeconds = incrementalVideoOverageSeconds({
    usedSeconds: meter.usedSeconds,
    includedSeconds: meter.limitSeconds,
    completedSeconds: input.completedSeconds,
  });
  await recordOrganizationVideoMeterEvent({
    customerId: organization.stripeBillingCustomerId,
    kind: input.kind,
    overageSeconds,
    videoId: input.videoId,
    occurredAt: input.now,
  });
}

export async function loadVideoStudio(
  actor: ApiActor,
  now = new Date(),
): Promise<VideoStudio> {
  requireDatabase();
  const personId = actor.personId;
  const organizationId = actor.organizationId;
  const [entitlement, usage, ownVideos, liveNow, organization, youtube] =
    await Promise.all([
      getDunaPlusEntitlement(personId, now),
      loadVideoUsage(personId, now, organizationId),
      loadVideoSummaries({
        where: organizationId
          ? eq(videos.organizationId, organizationId)
          : and(
              eq(videos.ownerPersonId, personId),
              isNull(videos.organizationId),
            ),
        limit: 100,
        includePrivatePosters: true,
      }),
      loadVideoSummaries({
        where: and(
          eq(videos.status, "live"),
          eq(videos.liveVisibility, "public"),
        ),
        limit: 30,
      }),
      organizationId
        ? getDatabase().query.organizations.findFirst({
            where: eq(organizations.id, organizationId),
          })
        : Promise.resolve(undefined),
      loadYoutubeBroadcastOptions(actor),
    ]);
  const organizationPlan = organization
    ? resolveOrganizationCommissionPolicy(organization).effectivePlan
    : undefined;
  const preferredProvider = preferredLiveVideoProvider({
    membershipPlan: entitlement.plan,
    organizationPlan,
  });
  const liveConfigured =
    preferredProvider === "cloudflare" ||
    (preferredProvider === "mux" && isMuxSignedPlaybackConfigured());
  const srtIngestAvailable =
    preferredProvider === "mux" ||
    (preferredProvider === "cloudflare" && isCloudflareSrtIngestEnabled());
  return {
    entitlement,
    quotaScope: organization
      ? {
          type: "organization",
          label: `${organization.name} · ${ORGANIZATION_PLANS[organizationPlan!].name}`,
          organizationId: organization.id,
          organizationPlan,
        }
      : {
          type: "person",
          label: entitlement.label,
        },
    canBroadcast: usage.live.limitSeconds > 0,
    usage,
    videos: ownVideos,
    liveNow,
    liveConfigured,
    uploadsConfigured: isR2VideoConfigured(),
    dataEnvironmentKey: muxDataEnvironmentKey(),
    broadcast: {
      preferredProvider,
      cloudflareConfigured: isCloudflareStreamConfigured(),
      muxConfigured: isMuxVideoConfigured(),
      srtIngestAvailable,
      // Provider capability selects SRT contribution. Network telemetry tunes
      // bitrate, while the native encoder retains RTMPS as its fallback.
      activeClientIngest: srtIngestAvailable ? "srt" : "rtmps",
      youtube,
    },
  };
}

async function associatedIds(personId: string): Promise<{
  readonly eventIds: ReadonlySet<string>;
  readonly teamIds: ReadonlySet<string>;
}> {
  const database = getDatabase();
  const [registrationRows, membershipRows] = await Promise.all([
    database
      .select({ sessionId: registrations.sessionId })
      .from(registrations)
      .where(
        and(
          eq(registrations.personId, personId),
          sql`${registrations.status} NOT IN ('cancelled', 'refunded')`,
        ),
      ),
    database
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.personId, personId)),
  ]);
  return {
    eventIds: new Set(registrationRows.map((row) => row.sessionId)),
    teamIds: new Set(membershipRows.map((row) => row.teamId)),
  };
}

export async function searchVideoAssociations(
  personId: string,
  query: string,
  now = new Date(),
): Promise<
  readonly {
    type: "event" | "match";
    id: string;
    eventId?: string;
    title: string;
    subtitle: string;
    associated: boolean;
    startsAt?: string;
    venue?: {
      venueId?: string;
      name: string;
      address?: string;
      googlePlaceId?: string;
      latitude?: number;
      longitude?: number;
    };
    captureDefaults?: {
      courtWidthMeters: number;
      courtLengthMeters: number;
      netHeightMeters: number;
      orientation?: "landscape" | "portrait";
    };
  }[]
> {
  requireDatabase();
  const database = getDatabase();
  const normalized = query.trim();
  const { eventIds, teamIds } = await associatedIds(personId);
  const eventWhere = normalized
    ? ilike(sessions.title, `%${normalized}%`)
    : or(
        inArray(sessions.id, [...eventIds]),
        gte(sessions.startsAt, new Date(now.getTime() - 30 * 24 * 60 * 60_000)),
      );
  const [eventRows, matchRows] = await Promise.all([
    database
      .select({
        id: sessions.id,
        title: sessions.title,
        startsAt: sessions.startsAt,
        timezone: sessions.timezone,
        venueId: sessions.venueId,
      })
      .from(sessions)
      .where(eventWhere)
      .orderBy(desc(sessions.startsAt))
      .limit(50),
    database
      .select({
        id: matches.id,
        eventId: sessions.id,
        eventTitle: sessions.title,
        eventVenueId: sessions.venueId,
        matchVenueId: matches.venueId,
        divisionName: divisions.name,
        divisionSettings: divisions.settings,
        scheduledAt: matches.scheduledAt,
        teamAId: matches.teamAId,
        teamBId: matches.teamBId,
        status: matches.status,
      })
      .from(matches)
      .innerJoin(divisions, eq(matches.divisionId, divisions.id))
      .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
      .orderBy(desc(matches.scheduledAt))
      .limit(150),
  ]);
  const matchTeamIds = matchRows.flatMap((match) =>
    [match.teamAId, match.teamBId].filter((id): id is string => Boolean(id)),
  );
  const teamRows =
    matchTeamIds.length > 0
      ? await database
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, [...new Set(matchTeamIds)]))
      : [];
  const venueIds = [
    ...eventRows.map((event) => event.venueId),
    ...matchRows.flatMap((match) => [match.matchVenueId, match.eventVenueId]),
  ].filter((id): id is string => Boolean(id));
  const venueRows =
    venueIds.length > 0
      ? await database
          .select({
            id: venues.id,
            name: venues.name,
            addressLine1: venues.addressLine1,
            addressLine2: venues.addressLine2,
            locality: venues.locality,
            administrativeArea: venues.administrativeArea,
            postalCode: venues.postalCode,
            googlePlaceId: venues.googlePlaceId,
            latitude: venues.latitude,
            longitude: venues.longitude,
          })
          .from(venues)
          .where(inArray(venues.id, [...new Set(venueIds)]))
      : [];
  const venueOptions = new Map(
    venueRows.map((venue) => {
      const address = [
        venue.addressLine1,
        venue.addressLine2,
        venue.locality,
        venue.administrativeArea,
        venue.postalCode,
      ]
        .filter(Boolean)
        .join(", ");
      return [
        venue.id,
        {
          venueId: venue.id,
          name: venue.name,
          address: address || undefined,
          googlePlaceId: venue.googlePlaceId ?? undefined,
          latitude: venue.latitude ?? undefined,
          longitude: venue.longitude ?? undefined,
        },
      ] as const;
    }),
  );
  const teamNames = new Map(teamRows.map((team) => [team.id, team.name]));
  const eventsResult = eventRows.map((event) => ({
    type: "event" as const,
    id: event.id,
    title: event.title,
    subtitle: `${eventIds.has(event.id) ? "Your event" : "Event"} · ${event.startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: event.timezone })}`,
    associated: eventIds.has(event.id),
    startsAt: event.startsAt.toISOString(),
    venue: event.venueId ? venueOptions.get(event.venueId) : undefined,
    captureDefaults: {
      courtWidthMeters: 8,
      courtLengthMeters: 16,
      netHeightMeters: 2.43,
      orientation: "landscape" as const,
    },
  }));
  const queryLower = normalized.toLowerCase();
  const matchesResult = matchRows
    .map((match) => {
      const teamA = match.teamAId
        ? (teamNames.get(match.teamAId) ?? "Team A")
        : "Team A";
      const teamB = match.teamBId
        ? (teamNames.get(match.teamBId) ?? "Team B")
        : "Team B";
      const title = `${teamA} vs ${teamB}`;
      const associated =
        (match.teamAId ? teamIds.has(match.teamAId) : false) ||
        (match.teamBId ? teamIds.has(match.teamBId) : false) ||
        eventIds.has(match.eventId);
      const settings = match.divisionSettings;
      const configuredNetHeight =
        typeof settings.netHeightMeters === "number" &&
        settings.netHeightMeters >= 1.8 &&
        settings.netHeightMeters <= 3
          ? settings.netHeightMeters
          : undefined;
      const divisionLabel = match.divisionName.toLowerCase();
      const inferredNetHeight =
        configuredNetHeight ??
        (/(women|women's|girls|female)/.test(divisionLabel)
          ? 2.24
          : /(junior|youth|u1[234]|12u|13u|14u)/.test(divisionLabel)
            ? 2.12
            : 2.43);
      const courtLengthMeters =
        typeof settings.courtLengthMeters === "number" &&
        settings.courtLengthMeters >= 8 &&
        settings.courtLengthMeters <= 40
          ? settings.courtLengthMeters
          : 16;
      const courtWidthMeters =
        typeof settings.courtWidthMeters === "number" &&
        settings.courtWidthMeters >= 4 &&
        settings.courtWidthMeters <= 30
          ? settings.courtWidthMeters
          : 8;
      const configuredOrientation: "portrait" | "landscape" =
        settings.videoOrientation === "portrait" ||
        settings.videoOrientation === "landscape"
          ? settings.videoOrientation
          : "landscape";
      return {
        type: "match" as const,
        id: match.id,
        eventId: match.eventId,
        title,
        subtitle: `${match.eventTitle} · ${match.status}`,
        associated,
        startsAt: match.scheduledAt?.toISOString(),
        venue: venueOptions.get(match.matchVenueId ?? match.eventVenueId ?? ""),
        captureDefaults: {
          courtWidthMeters,
          courtLengthMeters,
          netHeightMeters: inferredNetHeight,
          orientation: configuredOrientation,
        },
      };
    })
    .filter(
      (match) =>
        !queryLower ||
        match.title.toLowerCase().includes(queryLower) ||
        match.subtitle.toLowerCase().includes(queryLower),
    )
    .slice(0, 50);
  return [...eventsResult, ...matchesResult].sort(
    (left, right) =>
      Number(right.associated) - Number(left.associated) ||
      (right.startsAt ?? "").localeCompare(left.startsAt ?? ""),
  );
}

async function validateAssociation(input: {
  readonly category: VideoCategory;
  readonly eventId?: string;
  readonly matchId?: string;
}): Promise<{ readonly eventId?: string; readonly matchId?: string }> {
  const database = getDatabase();
  if (input.category === "event") {
    if (!input.eventId || input.matchId) {
      throw new VideoServiceError(
        "INVALID_ASSOCIATION",
        "Choose one event for an event video.",
      );
    }
    const event = await database.query.sessions.findFirst({
      columns: { id: true },
      where: eq(sessions.id, input.eventId),
    });
    if (!event) {
      throw new VideoServiceError(
        "ASSOCIATION_NOT_FOUND",
        "That event could not be found.",
      );
    }
    return { eventId: event.id };
  }
  if (input.category === "match") {
    if (!input.matchId) {
      throw new VideoServiceError(
        "INVALID_ASSOCIATION",
        "Choose a match for a match video.",
      );
    }
    const match = await database
      .select({
        id: matches.id,
        eventId: sessions.id,
      })
      .from(matches)
      .innerJoin(divisions, eq(matches.divisionId, divisions.id))
      .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
      .where(eq(matches.id, input.matchId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!match) {
      throw new VideoServiceError(
        "ASSOCIATION_NOT_FOUND",
        "That match could not be found.",
      );
    }
    if (input.eventId && input.eventId !== match.eventId) {
      throw new VideoServiceError(
        "INVALID_ASSOCIATION",
        "The selected match does not belong to that event.",
      );
    }
    return { eventId: match.eventId, matchId: match.id };
  }
  if (input.eventId || input.matchId) {
    throw new VideoServiceError(
      "INVALID_ASSOCIATION",
      "Practice and social videos are not tied to an event or match.",
    );
  }
  return {};
}

async function recordAudit(input: {
  readonly actorPersonId?: string;
  readonly organizationId?: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<void> {
  await getDatabase()
    .insert(auditLog)
    .values({
      actorPersonId: input.actorPersonId,
      organizationId: input.organizationId,
      actorType: input.actorPersonId ? "person" : "provider",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
}

async function createStoredShareLink(input: {
  readonly videoId: string;
  readonly ownerPersonId: string;
  readonly expiresAt?: Date;
}): Promise<{ readonly token: string; readonly url: string }> {
  const token = shareToken();
  await getDatabase()
    .insert(videoShareLinks)
    .values({
      videoId: input.videoId,
      tokenHash: hashToken(token),
      createdByPersonId: input.ownerPersonId,
      expiresAt: input.expiresAt,
    });
  return { token, url: videoShareUrl(input.videoId, token) };
}

export async function createLiveVideo(input: {
  readonly actor: ApiActor;
  readonly title: string;
  readonly category: VideoCategory;
  readonly eventId?: string;
  readonly matchId?: string;
  readonly venue?: {
    readonly venueId?: string;
    readonly name: string;
    readonly address?: string;
    readonly googlePlaceId?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly liveVisibility: LiveVisibility;
  readonly recordingVisibility: RecordingVisibility;
  readonly hasAudio: boolean;
  readonly simulcastToDunaYoutube: boolean;
  readonly youtubeConnectionIds: readonly string[];
  readonly visionLearningConsent: boolean;
  readonly courtCalibration?: CourtCalibration;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<LiveVideoSession> {
  requireDatabase();
  if (input.actor.ageBand !== "adult") {
    throw new VideoServiceError(
      "ADULT_REQUIRED",
      "Live streaming currently requires an adult Duna account.",
    );
  }
  const [entitlement, usage, association, organization] = await Promise.all([
    getDunaPlusEntitlement(input.actor.personId, input.now),
    loadVideoUsage(input.actor.personId, input.now, input.actor.organizationId),
    validateAssociation(input),
    input.actor.organizationId
      ? getDatabase().query.organizations.findFirst({
          where: eq(organizations.id, input.actor.organizationId),
        })
      : Promise.resolve(undefined),
  ]);
  const organizationPlan = organization
    ? resolveOrganizationCommissionPolicy(organization).effectivePlan
    : undefined;
  const liveProvider = preferredLiveVideoProvider({
    membershipPlan: entitlement.plan,
    organizationPlan,
  });
  if (!liveProvider) {
    throw new VideoServiceError(
      "LIVE_PROVIDER_REQUIRED",
      "Cloudflare Stream or Mux Video must be connected before live streaming.",
    );
  }
  if (
    liveProvider === "mux" &&
    (input.liveVisibility === "link-only" ||
      input.recordingVisibility === "private") &&
    !isMuxSignedPlaybackConfigured()
  ) {
    throw new VideoServiceError(
      "SIGNED_PLAYBACK_REQUIRED",
      "Mux signed playback must be configured for private video.",
    );
  }
  if (
    !input.actor.organizationId &&
    !entitlement.active &&
    usage.live.limitSeconds <= 0
  ) {
    throw new VideoServiceError(
      "DUNA_PLUS_REQUIRED",
      "Live broadcasting is available with Premium or Premium+.",
    );
  }
  if (usage.live.enforced && usage.live.remainingSeconds < 60) {
    throw new VideoServiceError(
      "LIVE_QUOTA_EXCEEDED",
      "This month's live-stream allowance has been used.",
    );
  }
  const maximumDurationSeconds = usage.live.enforced
    ? Math.max(60, usage.live.remainingSeconds)
    : 12 * 60 * 60;
  const database = getDatabase();
  const videoId = randomUUID();
  await database.insert(videos).values({
    id: videoId,
    ownerPersonId: input.actor.personId,
    organizationId: input.actor.organizationId,
    source: "live",
    category: input.category,
    title: input.title,
    eventId: association.eventId,
    matchId: association.matchId,
    venueId: input.venue?.venueId,
    venueName: input.venue?.name,
    venueAddress: input.venue?.address,
    googlePlaceId: input.venue?.googlePlaceId,
    latitude: input.venue?.latitude,
    longitude: input.venue?.longitude,
    status: "draft",
    liveProvider,
    liveVisibility: input.liveVisibility,
    recordingVisibility: input.recordingVisibility,
    hasAudio: input.hasAudio,
    visionLearningConsent: input.visionLearningConsent,
    visionLearningConsentedAt: input.visionLearningConsent
      ? input.now
      : undefined,
    courtCalibration: input.courtCalibration,
    createdAt: input.now,
    updatedAt: input.now,
  });
  let cloudflareLiveInputId: string | undefined;
  let muxLiveInputId: string | undefined;
  try {
    if (liveProvider === "cloudflare") {
      const cloudflare = await createCloudflareLiveVideo({
        videoId,
        title: input.title,
        liveVisibility: input.liveVisibility,
        recordingVisibility: input.recordingVisibility,
      });
      cloudflareLiveInputId = cloudflare.liveInputId;
      await database
        .update(videos)
        .set({
          liveProviderInputId: cloudflare.liveInputId,
          liveProviderPlaybackId: cloudflare.playbackId,
          liveProviderPlaybackUrl: cloudflare.playbackHlsUrl,
          liveProviderPlaybackPolicy: cloudflare.playbackPolicy,
          updatedAt: input.now,
        })
        .where(eq(videos.id, videoId));
      const [share, destinations] = await Promise.all([
        createStoredShareLink({
          videoId,
          ownerPersonId: input.actor.personId,
        }),
        provisionYoutubeBroadcastDestinations({
          actor: input.actor,
          videoId,
          liveProvider: "cloudflare",
          liveInputId: cloudflare.liveInputId,
          title: input.title,
          liveVisibility: input.liveVisibility,
          simulcastToDunaYoutube: input.simulcastToDunaYoutube,
          youtubeConnectionIds: input.youtubeConnectionIds,
          now: input.now,
        }),
      ]);
      await recordAudit({
        actorPersonId: input.actor.personId,
        organizationId: input.actor.organizationId,
        action: "video.live-created",
        entityType: "video",
        entityId: videoId,
        reason: `Created ${input.liveVisibility} Duna live stream with Cloudflare and ${destinations.filter((destination) => destination.status === "ready").length} simulcast destination(s).`,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
      return {
        video: await loadVideoSummary(videoId),
        provider: "cloudflare",
        streamUrl: cloudflare.rtmps.url,
        streamKey: cloudflare.rtmps.streamKey,
        ingests: {
          rtmps: cloudflare.rtmps,
          srt: cloudflare.srt,
        },
        destinations,
        maximumDurationSeconds,
        shareUrl: share.url,
      };
    }

    const mux = await createMuxLiveVideo({
      videoId,
      title: input.title,
      liveVisibility: input.liveVisibility,
      recordingVisibility: input.recordingVisibility,
      maximumDurationSeconds,
      idempotencyKey: input.idempotencyKey,
    });
    muxLiveInputId = mux.liveStreamId;
    await database
      .update(videos)
      .set({
        muxLiveStreamId: mux.liveStreamId,
        muxLivePlaybackId: mux.playbackId,
        muxLivePlaybackPolicy: mux.playbackPolicy,
        liveProviderInputId: mux.liveStreamId,
        liveProviderPlaybackId: mux.playbackId,
        liveProviderPlaybackPolicy: mux.playbackPolicy,
        updatedAt: input.now,
      })
      .where(eq(videos.id, videoId));
    const [share, destinations] = await Promise.all([
      createStoredShareLink({
        videoId,
        ownerPersonId: input.actor.personId,
      }),
      provisionYoutubeBroadcastDestinations({
        actor: input.actor,
        videoId,
        liveProvider: "mux",
        liveInputId: mux.liveStreamId,
        title: input.title,
        liveVisibility: input.liveVisibility,
        simulcastToDunaYoutube: input.simulcastToDunaYoutube,
        youtubeConnectionIds: input.youtubeConnectionIds,
        now: input.now,
      }),
    ]);
    await recordAudit({
      actorPersonId: input.actor.personId,
      organizationId: input.actor.organizationId,
      action: "video.live-created",
      entityType: "video",
      entityId: videoId,
      reason: `Created ${input.liveVisibility} Duna live stream with Mux and ${destinations.filter((destination) => destination.status === "ready").length} simulcast destination(s).`,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    return {
      video: await loadVideoSummary(videoId),
      provider: "mux",
      streamUrl: "rtmps://global-live.mux.com:443/app",
      streamKey: mux.streamKey,
      ingests: {
        rtmps: {
          url: "rtmps://global-live.mux.com:443/app",
          streamKey: mux.streamKey,
        },
        srt: {
          url: "srt://global-live.mux.com:6001",
          streamId: mux.streamKey,
          passphrase: mux.srtPassphrase,
        },
      },
      destinations,
      maximumDurationSeconds,
      shareUrl: share.url,
    };
  } catch (error) {
    if (cloudflareLiveInputId) {
      await disableCloudflareLiveInput(cloudflareLiveInputId).catch(
        () => undefined,
      );
    }
    if (muxLiveInputId) {
      await deleteMuxLiveVideo(muxLiveInputId).catch(() => undefined);
    }
    await database
      .update(videos)
      .set({
        status: "failed",
        failureReason: `${liveProvider} live setup failed before ingest began.`,
        updatedAt: input.now,
      })
      .where(eq(videos.id, videoId));
    // Provider errors can carry request objects containing ingest credentials.
    // Keep operational logs useful without ever serializing those payloads.
    console.error("Duna live provider setup failed", {
      errorType: error instanceof Error ? error.name : "unknown",
      provider: liveProvider,
      videoId,
    });
    if (liveProvider === "mux" && isMuxLivePlanUnavailable(error)) {
      throw new VideoServiceError(
        "LIVE_PLAN_UNAVAILABLE",
        "Mux still reports that live streaming is unavailable for Duna's account. Record with Duna now while an administrator enables Mux live access.",
      );
    }
    throw new VideoServiceError(
      "LIVE_PROVIDER_FAILED",
      "Duna could not open the live stream. Please try again in a moment.",
    );
  }
}

async function ownedVideo(
  ownerPersonId: string,
  videoId: string,
): Promise<typeof videos.$inferSelect> {
  const video = await getDatabase().query.videos.findFirst({
    where: and(eq(videos.id, videoId), eq(videos.ownerPersonId, ownerPersonId)),
  });
  if (!video) {
    throw new VideoServiceError("VIDEO_NOT_FOUND", "Video not found.");
  }
  return video;
}

export async function hydrateLiveVideoSessionReplay(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly maximumDurationSeconds: number;
}): Promise<LiveVideoSession> {
  requireDatabase();
  const video = await ownedVideo(input.actor.personId, input.videoId);
  const provider =
    video.liveProvider === "cloudflare" || video.liveProvider === "mux"
      ? video.liveProvider
      : video.muxLiveStreamId
        ? "mux"
        : undefined;
  const liveInputId = video.liveProviderInputId ?? video.muxLiveStreamId;
  if (
    video.source !== "live" ||
    !provider ||
    !liveInputId ||
    video.status === "failed" ||
    video.status === "deleted"
  ) {
    throw new VideoServiceError(
      "VIDEO_NOT_FOUND",
      "The original live-stream session is no longer available.",
    );
  }
  const [summary, share, storedDestinations] = await Promise.all([
    loadVideoSummary(video.id),
    createStoredShareLink({
      videoId: video.id,
      ownerPersonId: input.actor.personId,
    }),
    getDatabase()
      .select()
      .from(videoBroadcastDestinations)
      .where(eq(videoBroadcastDestinations.videoId, video.id))
      .orderBy(videoBroadcastDestinations.createdAt),
  ]);
  const destinations = storedDestinations.map((destination) => ({
    id: destination.id,
    kind: destination.kind as "duna-youtube" | "connected-youtube",
    channelId: destination.channelId,
    channelTitle: destination.channelTitle,
    status: destination.youtubeWatchUrl
      ? ("ready" as const)
      : ("failed" as const),
    watchUrl: destination.youtubeWatchUrl ?? undefined,
    error: destination.failureReason ?? undefined,
  }));
  if (provider === "cloudflare") {
    const cloudflare = await loadCloudflareLiveVideo(liveInputId);
    return {
      video: summary,
      provider,
      streamUrl: cloudflare.rtmps.url,
      streamKey: cloudflare.rtmps.streamKey,
      ingests: { rtmps: cloudflare.rtmps, srt: cloudflare.srt },
      destinations,
      maximumDurationSeconds: input.maximumDurationSeconds,
      shareUrl: share.url,
    };
  }
  const { streamKey, srtPassphrase } = await loadMuxLiveIngest(liveInputId);
  const rtmps = {
    url: "rtmps://global-live.mux.com:443/app",
    streamKey,
  };
  return {
    video: summary,
    provider,
    streamUrl: rtmps.url,
    streamKey,
    ingests: {
      rtmps,
      srt: {
        url: "srt://global-live.mux.com:6001",
        streamId: streamKey,
        passphrase: srtPassphrase,
      },
    },
    destinations,
    maximumDurationSeconds: input.maximumDurationSeconds,
    shareUrl: share.url,
  };
}

export function videoIdFromBeginUploadIdempotencyResult(
  result: Readonly<Record<string, unknown>> | null | undefined,
): string | undefined {
  return typeof result?.videoId === "string" ? result.videoId : undefined;
}

/**
 * Revocation is deliberately one-way and naturally idempotent. The update and
 * its audit row share one transaction, while the begin idempotency lookup
 * recovers a video whose successful response an older client never received.
 */
export async function revokeVideoVisionLearningConsent(input: {
  readonly actor: ApiActor;
  readonly videoId?: string;
  readonly beginIdempotencyKey?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly revoked: boolean; readonly videoId?: string }> {
  requireDatabase();
  const database = getDatabase();
  let videoId = input.videoId;
  if (!videoId && input.beginIdempotencyKey) {
    const beginRecord = await database.query.idempotencyRecords.findFirst({
      where: and(
        eq(idempotencyRecords.procedure, "player.beginVideoUpload"),
        eq(idempotencyRecords.key, input.beginIdempotencyKey),
        eq(idempotencyRecords.personId, input.actor.personId),
      ),
    });
    videoId = videoIdFromBeginUploadIdempotencyResult(beginRecord?.result);
  }
  if (!videoId) return { revoked: false };

  const video = await ownedVideo(input.actor.personId, videoId);
  if (!video.visionLearningConsent) return { revoked: false, videoId };

  const revoked = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const updated = await transaction
        .update(videos)
        .set({
          visionLearningConsent: false,
          visionLearningConsentedAt: null,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(videos.id, videoId),
            eq(videos.ownerPersonId, input.actor.personId),
            eq(videos.visionLearningConsent, true),
          ),
        )
        .returning({ id: videos.id });
      if (!updated[0]) return false;
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        organizationId: video.organizationId,
        actorType: "person",
        action: "video.vision-learning-consent-revoked",
        entityType: "video",
        entityId: videoId,
        reason: "Revoked Vision learning consent for this video.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
      return true;
    },
  );
  return { revoked, videoId };
}

export async function finishLiveVideo(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoSummary> {
  requireDatabase();
  const video = await ownedVideo(input.actor.personId, input.videoId);
  const provider =
    video.liveProvider === "cloudflare" || video.liveProvider === "mux"
      ? video.liveProvider
      : video.muxLiveStreamId
        ? "mux"
        : undefined;
  const liveInputId = video.liveProviderInputId ?? video.muxLiveStreamId;
  if (video.source !== "live" || !provider || !liveInputId) {
    throw new VideoServiceError(
      "VIDEO_NOT_FOUND",
      "An active live stream was not found.",
    );
  }
  if (provider === "cloudflare") {
    await disableCloudflareLiveInput(liveInputId);
  } else {
    await completeMuxLiveVideo(video.muxLiveStreamId ?? liveInputId);
  }
  const durationSeconds = video.startedAt
    ? Math.max(
        0,
        Math.floor((input.now.getTime() - video.startedAt.getTime()) / 1_000),
      )
    : video.durationSeconds;
  await Promise.all([
    getDatabase()
      .update(videos)
      .set({
        status: "processing",
        endedAt: input.now,
        durationSeconds,
        updatedAt: input.now,
      })
      .where(eq(videos.id, video.id)),
    recordAudit({
      actorPersonId: input.actor.personId,
      action: "video.live-ended",
      entityType: "video",
      entityId: video.id,
      reason: "Player ended the Duna live stream.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    }),
    reportOrganizationVideoOverage({
      organizationId: video.organizationId,
      personId: input.actor.personId,
      kind: "live",
      completedSeconds: durationSeconds ?? 0,
      videoId: video.id,
      now: input.now,
    }),
    endYoutubeBroadcastDestinations(video.id, input.now),
  ]);
  return loadVideoSummary(video.id);
}

export async function handleCloudflareLiveWebhook(
  payload: unknown,
  now = new Date(),
): Promise<{ readonly handled: boolean; readonly videoId?: string }> {
  requireDatabase();
  if (!payload || typeof payload !== "object") return { handled: false };
  const data = (payload as { readonly data?: unknown }).data;
  if (!data || typeof data !== "object") return { handled: false };
  const eventType = (data as { readonly event_type?: unknown }).event_type;
  const liveInputId = (data as { readonly input_id?: unknown }).input_id;
  if (typeof eventType !== "string" || typeof liveInputId !== "string") {
    return { handled: false };
  }
  const video = await getDatabase().query.videos.findFirst({
    where: and(
      eq(videos.liveProvider, "cloudflare"),
      eq(videos.liveProviderInputId, liveInputId),
    ),
  });
  if (!video) return { handled: false };
  if (eventType === "live_input.connected") {
    await getDatabase()
      .update(videos)
      .set({
        status: "live",
        startedAt: video.startedAt ?? now,
        failureReason: null,
        updatedAt: now,
      })
      .where(eq(videos.id, video.id));
    return { handled: true, videoId: video.id };
  }
  if (eventType === "live_input.disconnected") {
    const endedAt = video.endedAt ?? now;
    const durationSeconds = video.startedAt
      ? Math.max(
          0,
          Math.floor((endedAt.getTime() - video.startedAt.getTime()) / 1_000),
        )
      : video.durationSeconds;
    await Promise.all([
      getDatabase()
        .update(videos)
        .set({
          status: "processing",
          endedAt,
          durationSeconds,
          updatedAt: now,
        })
        .where(eq(videos.id, video.id)),
      endYoutubeBroadcastDestinations(video.id, now),
    ]);
    return { handled: true, videoId: video.id };
  }
  if (eventType === "live_input.errored") {
    const error = (
      data as {
        readonly live_input_errored?: {
          readonly error?: {
            readonly code?: unknown;
            readonly message?: unknown;
          };
        };
      }
    ).live_input_errored?.error;
    const failureReason = [error?.code, error?.message]
      .filter((value): value is string => typeof value === "string")
      .join(" · ")
      .slice(0, 2_000);
    await getDatabase()
      .update(videos)
      .set({
        status: "failed",
        failureReason: failureReason || "Cloudflare live input failed.",
        endedAt: video.endedAt ?? now,
        updatedAt: now,
      })
      .where(eq(videos.id, video.id));
    return { handled: true, videoId: video.id };
  }
  return { handled: false };
}

export async function updateVideoPrivacy(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly liveVisibility: LiveVisibility;
  readonly recordingVisibility: RecordingVisibility;
  readonly publishedToProfile: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoSummary> {
  requireDatabase();
  const video = await ownedVideo(input.actor.personId, input.videoId);
  const liveVisibility =
    input.actor.ageBand === "adult" ? input.liveVisibility : "link-only";
  const recordingVisibility =
    input.actor.ageBand === "adult" ? input.recordingVisibility : "private";
  let livePlaybackId = video.muxLivePlaybackId;
  let assetPlaybackId = video.muxAssetPlaybackId;
  const provider =
    video.liveProvider === "cloudflare" || video.liveProvider === "mux"
      ? video.liveProvider
      : video.muxLiveStreamId
        ? "mux"
        : undefined;
  const cloudflareRequiresSignedUrls =
    liveVisibility === "link-only" || recordingVisibility === "private";
  if (provider === "cloudflare") {
    if (video.liveProviderInputId) {
      await updateCloudflareLiveInputAccess({
        liveInputId: video.liveProviderInputId,
        requireSignedUrls: cloudflareRequiresSignedUrls,
      });
    }
    if (
      video.liveProviderPlaybackId &&
      video.liveProviderPlaybackId !== video.liveProviderInputId
    ) {
      await updateCloudflareVideoAccess({
        videoId: video.liveProviderPlaybackId,
        requireSignedUrls: cloudflareRequiresSignedUrls,
      });
    }
  } else {
    if (
      liveVisibility !== video.liveVisibility &&
      video.muxLiveStreamId &&
      video.muxLivePlaybackId
    ) {
      livePlaybackId = await replaceMuxLivePlaybackPolicy({
        liveStreamId: video.muxLiveStreamId,
        previousPlaybackId: video.muxLivePlaybackId,
        policy: liveVisibility === "public" ? "public" : "signed",
      });
    }
    if (
      recordingVisibility !== video.recordingVisibility &&
      video.muxAssetId &&
      video.muxAssetPlaybackId
    ) {
      assetPlaybackId = await replaceMuxAssetPlaybackPolicy({
        assetId: video.muxAssetId,
        previousPlaybackId: video.muxAssetPlaybackId,
        policy: recordingVisibility === "public" ? "public" : "signed",
      });
    }
  }
  const publishedToProfile =
    recordingVisibility === "public" && input.publishedToProfile;
  await Promise.all([
    getDatabase()
      .update(videos)
      .set({
        liveVisibility,
        recordingVisibility,
        publishedToProfile,
        liveProviderPlaybackPolicy:
          provider === "cloudflare"
            ? cloudflareRequiresSignedUrls
              ? "signed"
              : "public"
            : video.liveProviderPlaybackPolicy,
        muxLivePlaybackId: livePlaybackId,
        muxLivePlaybackPolicy:
          provider === "mux"
            ? liveVisibility === "public"
              ? "public"
              : "signed"
            : video.muxLivePlaybackPolicy,
        muxAssetPlaybackId: assetPlaybackId,
        muxAssetPlaybackPolicy:
          provider === "mux"
            ? recordingVisibility === "public"
              ? "public"
              : "signed"
            : video.muxAssetPlaybackPolicy,
        updatedAt: input.now,
      })
      .where(eq(videos.id, video.id)),
    recordAudit({
      actorPersonId: input.actor.personId,
      action: "video.privacy-updated",
      entityType: "video",
      entityId: video.id,
      reason: `Live ${liveVisibility}; recording ${recordingVisibility}; profile ${publishedToProfile ? "published" : "hidden"}.`,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    }),
  ]);
  return loadVideoSummary(video.id);
}

export async function createVideoShareLink(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly expiresAt?: Date;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly shareUrl: string; readonly expiresAt?: string }> {
  requireDatabase();
  const video = await ownedVideo(input.actor.personId, input.videoId);
  if (input.expiresAt && input.expiresAt <= input.now) {
    throw new VideoServiceError(
      "INVALID_GRANT_WINDOW",
      "The share-link expiration must be in the future.",
    );
  }
  const share = await createStoredShareLink({
    videoId: video.id,
    ownerPersonId: input.actor.personId,
    expiresAt: input.expiresAt,
  });
  await recordAudit({
    actorPersonId: input.actor.personId,
    action: "video.share-link-created",
    entityType: "video",
    entityId: video.id,
    reason: input.expiresAt
      ? `Created expiring private share link through ${input.expiresAt.toISOString()}.`
      : "Created private share link.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return {
    shareUrl: share.url,
    expiresAt: input.expiresAt?.toISOString(),
  };
}

export async function requestVideoMusicRemoval(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoSummary> {
  requireDatabase();
  const video = await ownedVideo(input.actor.personId, input.videoId);
  const status = "provider-required";
  const database = getDatabase();
  await Promise.all([
    database
      .update(videos)
      .set({
        musicRemovalRequested: true,
        musicRemovalStatus: status,
        updatedAt: input.now,
      })
      .where(eq(videos.id, video.id)),
    recordAudit({
      actorPersonId: input.actor.personId,
      action: "video.music-removal-requested",
      entityType: "video",
      entityId: video.id,
      reason:
        "Recorded request; an audio isolation provider must be connected.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    }),
  ]);
  return loadVideoSummary(video.id);
}

export async function beginVideoUpload(input: {
  readonly actor: ApiActor;
  readonly title: string;
  readonly category: VideoCategory;
  readonly eventId?: string;
  readonly matchId?: string;
  readonly venue?: {
    readonly venueId?: string;
    readonly name: string;
    readonly address?: string;
    readonly googlePlaceId?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly recordingVisibility: RecordingVisibility;
  readonly publishedToProfile: boolean;
  readonly hasAudio: boolean;
  readonly visionLearningConsent: boolean;
  readonly originalFileName: string;
  readonly mimeType: "video/mp4" | "video/quicktime";
  readonly bytes: number;
  readonly durationSeconds: number;
  readonly courtCalibration?: CourtCalibration;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly videoId: string;
  readonly uploadId: string;
  readonly objectKey: string;
  readonly partSizeBytes: number;
  readonly totalParts: number;
  readonly uploadedParts: readonly number[];
  readonly authoritativeParts: readonly R2MultipartPart[];
  readonly expiresAt: string;
}> {
  requireDatabase();
  if (!isR2VideoConfigured()) {
    throw new VideoServiceError(
      "R2_REQUIRED",
      "Cloudflare R2 must be connected before uploading video.",
    );
  }
  if (input.bytes <= 0 || input.bytes > MAX_VIDEO_BYTES) {
    throw new VideoServiceError(
      "UPLOAD_PART_INVALID",
      "The video file size is invalid.",
    );
  }
  const [usage, association] = await Promise.all([
    loadVideoUsage(input.actor.personId, input.now, input.actor.organizationId),
    validateAssociation(input),
  ]);
  if (
    usage.uploads.enforced &&
    input.durationSeconds > usage.uploads.remainingSeconds
  ) {
    throw new VideoServiceError(
      "UPLOAD_QUOTA_EXCEEDED",
      "This upload would exceed the monthly uploaded-video allowance.",
    );
  }
  const videoId = randomUUID();
  const objectKey = input.actor.organizationId
    ? `videos/organizations/${input.actor.organizationId}/${videoId}/source.mp4`
    : `videos/people/${input.actor.personId}/${videoId}/source.mp4`;
  const totalParts = Math.ceil(input.bytes / R2_VIDEO_PART_SIZE_BYTES);
  if (totalParts > 10_000) {
    throw new VideoServiceError(
      "UPLOAD_PART_INVALID",
      "The video needs too many upload parts.",
    );
  }
  const recordingVisibility =
    input.category === "practice" || input.actor.ageBand !== "adult"
      ? "private"
      : input.recordingVisibility;
  const publishedToProfile =
    recordingVisibility === "public" &&
    input.category !== "practice" &&
    input.publishedToProfile;
  const database = getDatabase();
  await database.insert(videos).values({
    id: videoId,
    ownerPersonId: input.actor.personId,
    organizationId: input.actor.organizationId,
    source: "upload",
    category: input.category,
    title: input.title,
    eventId: association.eventId,
    matchId: association.matchId,
    venueId: input.venue?.venueId,
    venueName: input.venue?.name,
    venueAddress: input.venue?.address,
    googlePlaceId: input.venue?.googlePlaceId,
    latitude: input.venue?.latitude,
    longitude: input.venue?.longitude,
    status: "uploading",
    liveVisibility: "link-only",
    recordingVisibility,
    publishedToProfile,
    hasAudio: input.hasAudio,
    visionLearningConsent: input.visionLearningConsent,
    visionLearningConsentedAt: input.visionLearningConsent
      ? input.now
      : undefined,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
    durationSeconds: input.durationSeconds,
    r2PartSizeBytes: R2_VIDEO_PART_SIZE_BYTES,
    r2ObjectKey: objectKey,
    courtCalibration: input.courtCalibration,
    createdAt: input.now,
    updatedAt: input.now,
  });
  try {
    const upload = await createR2VideoUpload({
      objectKey,
      contentType: input.mimeType,
      videoId,
      ownerPersonId: input.actor.personId,
    });
    await Promise.all([
      database
        .update(videos)
        .set({ r2UploadId: upload.uploadId, updatedAt: input.now })
        .where(eq(videos.id, videoId)),
      recordAudit({
        actorPersonId: input.actor.personId,
        organizationId: input.actor.organizationId,
        action: "video.upload-started",
        entityType: "video",
        entityId: videoId,
        reason: `Started ${totalParts}-part direct R2 upload.`,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      }),
    ]);
    return {
      videoId,
      uploadId: upload.uploadId,
      objectKey,
      partSizeBytes: R2_VIDEO_PART_SIZE_BYTES,
      totalParts,
      uploadedParts: [],
      authoritativeParts: [],
      // This is a stable session boundary, not a rolling client-only timer.
      // Individual presigned PUT URLs are valid for the same 24-hour window.
      expiresAt: new Date(
        input.now.getTime() + VIDEO_UPLOAD_SESSION_SECONDS * 1_000,
      ).toISOString(),
    };
  } catch (error) {
    await database
      .update(videos)
      .set({
        status: "failed",
        failureReason:
          error instanceof Error ? error.message.slice(0, 2_000) : "Unknown",
        updatedAt: input.now,
      })
      .where(eq(videos.id, videoId));
    console.error("Duna upload provider setup failed", { error, videoId });
    throw new VideoServiceError(
      "UPLOAD_PROVIDER_FAILED",
      "Duna could not open a secure upload. Please try again in a moment.",
    );
  }
}

async function activeUpload(
  ownerPersonId: string,
  videoId: string,
): Promise<typeof videos.$inferSelect> {
  const video = await ownedVideo(ownerPersonId, videoId);
  if (
    video.source !== "upload" ||
    video.status !== "uploading" ||
    !video.r2ObjectKey ||
    !video.r2UploadId ||
    !video.bytes
  ) {
    throw new VideoServiceError(
      "UPLOAD_NOT_ACTIVE",
      "An active upload was not found.",
    );
  }
  return video;
}

function uploadPartSizeBytes(video: typeof videos.$inferSelect): number {
  const size = video.r2PartSizeBytes ?? LEGACY_R2_VIDEO_PART_SIZE_BYTES;
  if (
    !Number.isSafeInteger(size) ||
    size < 5 * 1024 * 1024 ||
    size > R2_VIDEO_PART_SIZE_BYTES
  ) {
    throw new VideoServiceError(
      "UPLOAD_PART_INVALID",
      "This upload has an invalid persisted part size.",
    );
  }
  return size;
}

function totalUploadParts(video: typeof videos.$inferSelect): number {
  return Math.ceil(video.bytes! / uploadPartSizeBytes(video));
}

function expectedUploadPartSize(
  video: typeof videos.$inferSelect,
  partNumber: number,
): number {
  const totalParts = totalUploadParts(video);
  return partNumber === totalParts
    ? video.bytes! - (totalParts - 1) * uploadPartSizeBytes(video)
    : uploadPartSizeBytes(video);
}

function uploadSessionExpiresAt(video: typeof videos.$inferSelect): string {
  return new Date(
    video.createdAt.getTime() + VIDEO_UPLOAD_SESSION_SECONDS * 1_000,
  ).toISOString();
}

function normalizedEtag(value: string): string {
  return value.trim().replaceAll(/^"|"$/g, "");
}

/**
 * Reject anything that cannot be completed exactly as the original file. This
 * runs against R2 ListParts output, never the optimistic client-side mirror.
 */
export function validateAuthoritativeVideoUploadParts(input: {
  readonly videoBytes: number;
  readonly partSizeBytes: number;
  readonly parts: readonly R2MultipartPart[];
}): readonly R2MultipartPart[] {
  const expectedParts = Math.ceil(input.videoBytes / input.partSizeBytes);
  validateAuthoritativeResumableVideoUploadParts(input);
  if (input.parts.length !== expectedParts) {
    throw new VideoServiceError(
      "UPLOAD_INCOMPLETE",
      "Every video part must finish uploading before completion.",
    );
  }
  for (const [index, part] of input.parts.entries()) {
    const partNumber = index + 1;
    const expectedSize =
      partNumber === expectedParts
        ? input.videoBytes - (expectedParts - 1) * input.partSizeBytes
        : input.partSizeBytes;
    if (part.partNumber !== partNumber || part.sizeBytes !== expectedSize) {
      throw new VideoServiceError(
        "UPLOAD_INCOMPLETE",
        "R2 did not confirm the expected video parts and bytes.",
      );
    }
  }
  return input.parts;
}

/**
 * ListParts can contain an R2-confirmed part whose client acknowledgement was
 * lost. Resume accepts that partial, authoritative set (including gaps) and
 * lets the client schedule only the remaining ranges. Completion calls the
 * stricter validator above.
 */
export function validateAuthoritativeResumableVideoUploadParts(input: {
  readonly videoBytes: number;
  readonly partSizeBytes: number;
  readonly parts: readonly R2MultipartPart[];
}): readonly R2MultipartPart[] {
  const expectedParts = Math.ceil(input.videoBytes / input.partSizeBytes);
  const seen = new Set<number>();
  for (const part of input.parts) {
    const expectedSize =
      part.partNumber === expectedParts
        ? input.videoBytes - (expectedParts - 1) * input.partSizeBytes
        : input.partSizeBytes;
    if (
      part.partNumber < 1 ||
      part.partNumber > expectedParts ||
      seen.has(part.partNumber) ||
      !normalizedEtag(part.etag) ||
      part.sizeBytes !== expectedSize
    ) {
      throw new VideoServiceError(
        "UPLOAD_PART_INVALID",
        "R2 returned an invalid video upload part.",
      );
    }
    seen.add(part.partNumber);
  }
  return input.parts;
}

async function authoritativeUploadParts(
  video: typeof videos.$inferSelect,
): Promise<readonly R2MultipartPart[]> {
  const parts = await listR2VideoUploadParts({
    objectKey: video.r2ObjectKey!,
    uploadId: video.r2UploadId!,
  });
  // A partial upload is valid for resume, but every returned part must still
  // match the file layout. Completion separately requires the full sequence.
  return validateAuthoritativeResumableVideoUploadParts({
    videoBytes: video.bytes!,
    partSizeBytes: uploadPartSizeBytes(video),
    parts,
  });
}

function uploadSessionFromVideo(input: {
  readonly video: typeof videos.$inferSelect;
  readonly parts: readonly R2MultipartPart[];
}) {
  return {
    videoId: input.video.id,
    uploadId: input.video.r2UploadId!,
    objectKey: input.video.r2ObjectKey!,
    partSizeBytes: uploadPartSizeBytes(input.video),
    totalParts: totalUploadParts(input.video),
    uploadedParts: input.parts.map((part) => part.partNumber),
    authoritativeParts: input.parts,
    expiresAt: uploadSessionExpiresAt(input.video),
  };
}

export async function resumeVideoUpload(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
}) {
  requireDatabase();
  const video = await activeUpload(input.actor.personId, input.videoId);
  return uploadSessionFromVideo({
    video,
    parts: await authoritativeUploadParts(video),
  });
}

export async function presignVideoUploadPart(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly partNumber: number;
}): Promise<{
  readonly partNumber: number;
  readonly url: string;
  readonly expiresAt: string;
}> {
  requireDatabase();
  const video = await activeUpload(input.actor.personId, input.videoId);
  const totalParts = totalUploadParts(video);
  if (input.partNumber < 1 || input.partNumber > totalParts) {
    throw new VideoServiceError(
      "UPLOAD_PART_INVALID",
      "That upload part is outside the file's range.",
    );
  }
  const signed = await presignR2VideoPart({
    objectKey: video.r2ObjectKey!,
    uploadId: video.r2UploadId!,
    partNumber: input.partNumber,
  });
  return {
    partNumber: input.partNumber,
    url: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
  };
}

export async function recordVideoUploadPart(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly partNumber: number;
  readonly etag: string;
  readonly sizeBytes: number;
  readonly now: Date;
}): Promise<{ readonly uploadedParts: readonly number[] }> {
  requireDatabase();
  const video = await activeUpload(input.actor.personId, input.videoId);
  const totalParts = totalUploadParts(video);
  const expectedMaximum = expectedUploadPartSize(video, input.partNumber);
  if (
    input.partNumber < 1 ||
    input.partNumber > totalParts ||
    input.sizeBytes <= 0 ||
    input.sizeBytes !== expectedMaximum ||
    (input.partNumber < totalParts && input.sizeBytes < 5 * 1024 * 1024)
  ) {
    throw new VideoServiceError(
      "UPLOAD_PART_INVALID",
      "The uploaded part metadata is invalid.",
    );
  }
  const authoritativeParts = await authoritativeUploadParts(video);
  const confirmed = authoritativeParts.find(
    (part) => part.partNumber === input.partNumber,
  );
  if (
    !confirmed ||
    normalizedEtag(confirmed.etag) !== normalizedEtag(input.etag) ||
    confirmed.sizeBytes !== input.sizeBytes
  ) {
    throw new VideoServiceError(
      "UPLOAD_PART_INVALID",
      "R2 has not confirmed this uploaded video part yet.",
    );
  }
  await getDatabase()
    .insert(videoUploadParts)
    .values({
      videoId: video.id,
      partNumber: input.partNumber,
      etag: input.etag,
      sizeBytes: input.sizeBytes,
      uploadedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [videoUploadParts.videoId, videoUploadParts.partNumber],
      set: {
        etag: input.etag,
        sizeBytes: input.sizeBytes,
        uploadedAt: input.now,
      },
    });
  return { uploadedParts: authoritativeParts.map((part) => part.partNumber) };
}

async function finalizeVideoUpload(input: {
  readonly video: typeof videos.$inferSelect;
  readonly actor: ApiActor;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
  readonly etag?: string;
}): Promise<void> {
  // Side effects happen before the ready transition. Metering uses a stable
  // Stripe identifier and audit creation is guarded, so an R2-success retry
  // can safely recover any interrupted completion without skipping history or
  // usage reporting just because the video already became ready.
  const existingAudit = await getDatabase()
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityId, input.video.id),
        eq(auditLog.action, "video.upload-completed"),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  await Promise.all([
    existingAudit
      ? Promise.resolve()
      : recordAudit({
          actorPersonId: input.actor.personId,
          organizationId: input.video.organizationId ?? undefined,
          action: "video.upload-completed",
          entityType: "video",
          entityId: input.video.id,
          reason: `Completed direct R2 upload (${input.video.bytes} bytes).`,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
          now: input.now,
        }),
    reportOrganizationVideoOverage({
      organizationId: input.video.organizationId,
      personId: input.actor.personId,
      kind: "upload",
      completedSeconds: input.video.durationSeconds ?? 0,
      videoId: input.video.id,
      now: input.now,
    }),
  ]);
  await getDatabase()
    .update(videos)
    .set({
      status: "ready",
      r2Etag: input.etag,
      r2UploadId: null,
      readyAt: input.now,
      updatedAt: input.now,
    })
    .where(and(eq(videos.id, input.video.id), eq(videos.status, "uploading")));
}

export async function completeVideoUpload(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoSummary> {
  requireDatabase();
  const existing = await ownedVideo(input.actor.personId, input.videoId);
  // A response may have reached R2 just before the database write failed. A
  // later retry must return the ready object rather than attempting to complete
  // the now-closed multipart upload again.
  if (existing.source === "upload" && existing.status === "ready") {
    await finalizeVideoUpload({
      video: existing,
      actor: input.actor,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
      etag: existing.r2Etag ?? undefined,
    });
    return loadVideoSummary(existing.id);
  }
  const video = await activeUpload(input.actor.personId, input.videoId);
  let parts: readonly R2MultipartPart[];
  try {
    parts = validateAuthoritativeVideoUploadParts({
      videoBytes: video.bytes!,
      partSizeBytes: uploadPartSizeBytes(video),
      parts: await authoritativeUploadParts(video),
    });
  } catch (error) {
    // If ListParts cannot find an upload that was already completed, prove the
    // immutable object size before treating it as an idempotent completion.
    try {
      const object = await headR2VideoObject(video.r2ObjectKey!);
      if (object.sizeBytes === video.bytes) {
        await finalizeVideoUpload({
          video,
          actor: input.actor,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
          now: input.now,
          etag: object.etag,
        });
        return loadVideoSummary(video.id);
      }
    } catch {
      // Preserve the original ListParts validation error below.
    }
    throw error;
  }
  const completed = await completeR2VideoUpload({
    objectKey: video.r2ObjectKey!,
    uploadId: video.r2UploadId!,
    parts: parts.map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag,
    })),
  });
  await finalizeVideoUpload({
    video,
    actor: input.actor,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
    etag: completed.etag,
  });
  return loadVideoSummary(video.id);
}

export async function abortVideoUpload(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly aborted: true }> {
  requireDatabase();
  const existing = await ownedVideo(input.actor.personId, input.videoId);
  if (
    existing.source === "upload" &&
    existing.status === "failed" &&
    existing.failureReason === "Upload cancelled by player."
  ) {
    return { aborted: true };
  }
  const video = await activeUpload(input.actor.personId, input.videoId);
  try {
    await abortR2VideoUpload({
      objectKey: video.r2ObjectKey!,
      uploadId: video.r2UploadId!,
    });
  } catch (error) {
    if (!isR2MultipartUploadAlreadyAbsent(error)) {
      // A timeout, permission issue, or transport failure is not proof that
      // R2 accepted cancellation. Preserve the resumable upload state.
      throw error;
    }
    // A previous cancel may have reached R2 while its response was lost. If an
    // object exists at the exact source length, it actually completed and must
    // not be overwritten as a cancelled video.
    const completedObject = await headR2VideoObject(video.r2ObjectKey!)
      .then((object) => object)
      .catch(() => undefined);
    if (completedObject?.sizeBytes === video.bytes) {
      await finalizeVideoUpload({
        video,
        actor: input.actor,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
        etag: completedObject.etag,
      });
      throw new VideoServiceError(
        "UPLOAD_NOT_ACTIVE",
        "This upload completed before it could be cancelled.",
      );
    }
    // This specific provider response proves the multipart upload is gone.
    // Treat an explicit repeated cancel as idempotent.
    console.warn("Duna upload abort was already settled by R2", { error });
  }
  await Promise.all([
    getDatabase()
      .update(videos)
      .set({
        status: "failed",
        r2UploadId: null,
        failureReason: "Upload cancelled by player.",
        updatedAt: input.now,
      })
      .where(eq(videos.id, video.id)),
    recordAudit({
      actorPersonId: input.actor.personId,
      action: "video.upload-aborted",
      entityType: "video",
      entityId: video.id,
      reason: "Player cancelled the direct video upload.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    }),
  ]);
  return { aborted: true };
}

export async function loadPublicVideos(input: {
  readonly eventId?: string;
  readonly matchId?: string;
  readonly ownerHandle?: string;
  readonly liveOnly?: boolean;
}): Promise<readonly VideoSummary[]> {
  requireDatabase();
  const database = getDatabase();
  let ownerId: string | undefined;
  if (input.ownerHandle) {
    ownerId = await database.query.people
      .findFirst({
        columns: { id: true },
        where: eq(people.handle, input.ownerHandle),
      })
      .then((person) => person?.id);
    if (!ownerId) return [];
  }
  const visibility = input.liveOnly
    ? and(eq(videos.status, "live"), eq(videos.liveVisibility, "public"))
    : or(
        and(eq(videos.status, "live"), eq(videos.liveVisibility, "public")),
        and(
          inArray(videos.status, [...PUBLIC_VIDEO_STATUSES]),
          sql`${videos.status} <> 'live'`,
          eq(videos.recordingVisibility, "public"),
        ),
      );
  return loadVideoSummaries({
    where: and(
      visibility,
      input.eventId ? eq(videos.eventId, input.eventId) : undefined,
      input.matchId ? eq(videos.matchId, input.matchId) : undefined,
      ownerId ? eq(videos.ownerPersonId, ownerId) : undefined,
      ownerId ? eq(videos.publishedToProfile, true) : undefined,
    ),
    limit: 50,
  });
}

async function resolveShareAccess(
  videoId: string,
  token: string | undefined,
  now: Date,
): Promise<string | undefined> {
  if (!token) return undefined;
  const database = getDatabase();
  const link = await database.query.videoShareLinks.findFirst({
    where: and(
      eq(videoShareLinks.videoId, videoId),
      eq(videoShareLinks.tokenHash, hashToken(token)),
      isNull(videoShareLinks.revokedAt),
      or(
        isNull(videoShareLinks.expiresAt),
        gte(videoShareLinks.expiresAt, now),
      ),
    ),
  });
  if (!link) return undefined;
  await database
    .update(videoShareLinks)
    .set({
      lastUsedAt: now,
      useCount: sql`${videoShareLinks.useCount} + 1`,
    })
    .where(eq(videoShareLinks.id, link.id));
  return link.id;
}

async function reconcileCloudflareRecording(
  video: typeof videos.$inferSelect,
  now: Date,
): Promise<typeof videos.$inferSelect> {
  if (
    video.liveProvider !== "cloudflare" ||
    !video.liveProviderInputId ||
    (video.status !== "processing" && video.status !== "ended")
  ) {
    return video;
  }
  try {
    const recordings = await listCloudflareLiveRecordings(
      video.liveProviderInputId,
    );
    const recording = recordings
      .filter((item) => item.ready)
      .sort((left, right) =>
        (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
      )[0];
    if (!recording) return video;
    const playbackUrl =
      recording.playbackHlsUrl ?? video.liveProviderPlaybackUrl;
    await getDatabase()
      .update(videos)
      .set({
        liveProviderPlaybackId: recording.videoId,
        liveProviderPlaybackUrl: playbackUrl,
        liveProviderPosterUrl:
          recording.thumbnailUrl ?? video.liveProviderPosterUrl,
        durationSeconds: recording.durationSeconds ?? video.durationSeconds,
        status: "ready",
        readyAt: now,
        updatedAt: now,
      })
      .where(eq(videos.id, video.id));
    return {
      ...video,
      liveProviderPlaybackId: recording.videoId,
      liveProviderPlaybackUrl: playbackUrl,
      liveProviderPosterUrl:
        recording.thumbnailUrl ?? video.liveProviderPosterUrl,
      durationSeconds: recording.durationSeconds ?? video.durationSeconds,
      status: "ready",
      readyAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error("Duna Cloudflare recording reconciliation failed", {
      error,
      videoId: video.id,
    });
    return video;
  }
}

export async function loadVideoPlayback(input: {
  readonly videoId: string;
  readonly accessToken?: string;
  readonly actor?: ApiActor;
  readonly platform: "ios" | "web";
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<VideoPlayback> {
  requireDatabase();
  const database = getDatabase();
  const storedVideo = await database.query.videos.findFirst({
    where: eq(videos.id, input.videoId),
  });
  if (
    !storedVideo ||
    storedVideo.status === "deleted" ||
    storedVideo.status === "failed"
  ) {
    throw new VideoServiceError("VIDEO_NOT_FOUND", "Video not found.");
  }
  const video = await reconcileCloudflareRecording(storedVideo, input.now);
  const isOwner = input.actor?.personId === video.ownerPersonId;
  const shareLinkId = isOwner
    ? undefined
    : await resolveShareAccess(video.id, input.accessToken, input.now);
  const livePlayback =
    video.status === "live" ||
    (video.source === "live" &&
      (video.liveProvider === "cloudflare"
        ? video.status === "draft"
        : !video.muxAssetPlaybackId && Boolean(video.muxLivePlaybackId)));
  const visibility = livePlayback
    ? video.liveVisibility
    : video.recordingVisibility === "public"
      ? "public"
      : "link-only";
  if (!isOwner && visibility !== "public" && !shareLinkId) {
    throw new VideoServiceError(
      "PLAYBACK_FORBIDDEN",
      "This private video requires its share link.",
    );
  }
  let provider: "cloudflare" | "mux" | "r2";
  let playbackId: string | undefined;
  let playbackToken: string | undefined;
  let sourceUrl: string | undefined;
  let embedUrl: string | undefined;
  let posterUrl: string | undefined;
  if (video.source === "live" && video.liveProvider === "cloudflare") {
    provider = "cloudflare";
    playbackId = video.liveProviderPlaybackId ?? undefined;
    const playbackUrl = video.liveProviderPlaybackUrl ?? undefined;
    if (!playbackId || !playbackUrl) {
      throw new VideoServiceError(
        "PLAYBACK_NOT_READY",
        "The Cloudflare live recording is still being prepared.",
      );
    }
    if (video.liveProviderPlaybackPolicy === "signed") {
      playbackToken = await signCloudflarePlayback({
        playbackId,
        durationSeconds: video.durationSeconds ?? undefined,
      });
      sourceUrl = cloudflareSignedPlaybackUrl(
        playbackUrl,
        playbackId,
        playbackToken,
      );
    } else {
      sourceUrl = playbackUrl;
    }
    embedUrl = cloudflareEmbedUrl(playbackUrl, playbackId, playbackToken);
    posterUrl = video.liveProviderPosterUrl ?? undefined;
  } else if (video.source === "live") {
    provider = "mux";
    playbackId = livePlayback
      ? (video.muxLivePlaybackId ?? undefined)
      : (video.muxAssetPlaybackId ?? undefined);
    const policy = livePlayback
      ? video.muxLivePlaybackPolicy
      : video.muxAssetPlaybackPolicy;
    if (!playbackId) {
      throw new VideoServiceError(
        "PLAYBACK_NOT_READY",
        "The live recording is still being prepared.",
      );
    }
    if (policy === "signed") {
      playbackToken = await signMuxPlayback({
        playbackId,
        durationSeconds: video.durationSeconds ?? undefined,
      });
    } else {
      posterUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg`;
    }
  } else {
    provider = "r2";
    if (!video.r2ObjectKey || video.status !== "ready") {
      throw new VideoServiceError(
        "PLAYBACK_NOT_READY",
        "The uploaded video is still being prepared.",
      );
    }
    sourceUrl = (
      await presignR2VideoPlayback({
        objectKey: video.r2ObjectKey,
        contentType: video.mimeType ?? undefined,
        title: video.title,
        expiresInSeconds: Math.max(
          60 * 60,
          (video.durationSeconds ?? 0) + 30 * 60,
        ),
      })
    ).url;
  }
  const viewSessionId = randomUUID();
  await database.insert(videoViews).values({
    id: viewSessionId,
    videoId: video.id,
    viewerPersonId: input.actor?.personId,
    shareLinkId,
    sessionTokenHash: hashToken(viewSessionId),
    platform: input.platform,
    startedAt: input.now,
    lastHeartbeatAt: input.now,
  });
  const [summary, vision, scoring, healthOverlay] = await Promise.all([
    loadVideoSummary(video.id),
    loadVisionPlayback(video.id),
    video.matchId
      ? loadPublicMatchScoringState(video.matchId).catch(() => undefined)
      : Promise.resolve(undefined),
    loadHealthVideoOverlay({
      ownerPersonId: video.ownerPersonId,
      actor: input.actor,
      startedAt: video.startedAt,
      endedAt: video.endedAt,
      durationSeconds: video.durationSeconds,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    }).catch(() => undefined),
  ]);
  return {
    video: summary,
    provider,
    playbackId,
    playbackToken,
    sourceUrl,
    embedUrl,
    posterUrl,
    dataEnvironmentKey: muxDataEnvironmentKey(),
    viewSessionId,
    isOwner,
    vision,
    liveScore: scoring
      ? {
          setIndex: scoring.score.setIndex,
          sets: scoring.score.sets.map((set) => ({ a: set.a, b: set.b })),
          serving: scoring.score.serving,
          status: scoring.score.status,
        }
      : undefined,
    healthOverlay,
  };
}

export async function recordVideoViewHeartbeat(input: {
  readonly videoId: string;
  readonly viewSessionId: string;
  readonly watchedSeconds: number;
  readonly completed: boolean;
  readonly now: Date;
}): Promise<{ readonly recorded: true }> {
  requireDatabase();
  const view = await getDatabase().query.videoViews.findFirst({
    where: and(
      eq(videoViews.id, input.viewSessionId),
      eq(videoViews.videoId, input.videoId),
      eq(videoViews.sessionTokenHash, hashToken(input.viewSessionId)),
    ),
  });
  if (!view) {
    throw new VideoServiceError("VIDEO_NOT_FOUND", "View session not found.");
  }
  const watchedSeconds = Math.max(
    view.watchedSeconds,
    Math.min(12 * 60 * 60, Math.floor(input.watchedSeconds)),
  );
  await getDatabase()
    .update(videoViews)
    .set({
      watchedSeconds,
      completed: view.completed || input.completed,
      completedAt:
        view.completedAt ?? (input.completed ? input.now : undefined),
      lastHeartbeatAt: input.now,
    })
    .where(eq(videoViews.id, view.id));
  return { recorded: true };
}

export async function loadOwnedVideoMetrics(
  personId: string,
): Promise<readonly VideoMetrics[]> {
  requireDatabase();
  const owned = await loadVideoSummaries({
    where: eq(videos.ownerPersonId, personId),
    limit: 100,
  });
  if (owned.length === 0) return [];
  const views = await getDatabase()
    .select()
    .from(videoViews)
    .where(
      inArray(
        videoViews.videoId,
        owned.map((video) => video.id),
      ),
    );
  return Promise.all(
    owned.map(async (video) => {
      const videoViewRows = views.filter((view) => view.videoId === video.id);
      const watchedSeconds = videoViewRows.reduce(
        (sum, view) => sum + view.watchedSeconds,
        0,
      );
      const mux =
        video.source === "live"
          ? await loadMuxVideoMetrics(video.id)
          : undefined;
      return {
        video,
        views: videoViewRows.length,
        uniqueViewers: new Set(
          videoViewRows.map(
            (view) => view.viewerPersonId ?? view.sessionTokenHash,
          ),
        ).size,
        watchedSeconds,
        averageWatchSeconds:
          videoViewRows.length === 0
            ? 0
            : Math.round(watchedSeconds / videoViewRows.length),
        completionRate:
          videoViewRows.length === 0
            ? 0
            : videoViewRows.filter((view) => view.completed).length /
              videoViewRows.length,
        mux,
      };
    }),
  );
}

function grantResult(
  grant: typeof dunaPlusGrants.$inferSelect,
  peopleById: ReadonlyMap<string, PersonSummary>,
): DunaPlusGrant {
  return {
    id: grant.id,
    personId: grant.personId ?? undefined,
    email: grant.emailNormalized,
    displayName: grant.personId
      ? peopleById.get(grant.personId)?.displayName
      : undefined,
    status: grant.status as "active" | "revoked",
    startsAt: grant.startsAt.toISOString(),
    endsAt: grant.endsAt?.toISOString(),
    reason: grant.reason,
    grantedByName: grant.grantedByPersonId
      ? peopleById.get(grant.grantedByPersonId)?.displayName
      : undefined,
  };
}

export async function loadAdminVideoOverview(
  now = new Date(),
  canManage = false,
): Promise<AdminVideoOverview> {
  requireDatabase();
  const database = getDatabase();
  const [
    policy,
    totalRows,
    viewRows,
    grantRows,
    activeStreams,
    usageRows,
    calibrationRows,
    calibrationCountRows,
    insightFeedbackRows,
  ] = await Promise.all([
    loadQuotaPolicy(),
    database
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${videos.bytes}), 0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(videos)
      .where(sql`${videos.status} <> 'deleted'`)
      .then((rows) => rows[0]),
    database
      .select({
        watched:
          sql<number>`coalesce(sum(${videoViews.watchedSeconds}), 0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(videoViews)
      .then((rows) => rows[0]),
    database
      .select()
      .from(dunaPlusGrants)
      .orderBy(desc(dunaPlusGrants.createdAt))
      .limit(100),
    loadVideoSummaries({
      where: eq(videos.status, "live"),
      limit: 50,
    }),
    database
      .select({
        personId: videos.ownerPersonId,
        videoCount: sql<number>`count(*)::int`,
      })
      .from(videos)
      .where(sql`${videos.status} <> 'deleted'`)
      .groupBy(videos.ownerPersonId)
      .orderBy(desc(sql`count(*)`))
      .limit(20),
    database
      .select({
        sample: visionCalibrationSamples,
        videoTitle: videos.title,
        previewJpegBase64: visionSessions.previewJpegBase64,
        sessionPreviewCapturedAt: visionSessions.previewCapturedAt,
      })
      .from(visionCalibrationSamples)
      .innerJoin(videos, eq(videos.id, visionCalibrationSamples.videoId))
      .innerJoin(
        visionSessions,
        eq(visionSessions.id, visionCalibrationSamples.sessionId),
      )
      .orderBy(
        sql`case when ${visionCalibrationSamples.status} = 'pending' then 0 else 1 end`,
        desc(visionCalibrationSamples.createdAt),
      )
      .limit(50),
    database
      .select({
        status: visionCalibrationSamples.status,
        count: sql<number>`count(*)::int`,
      })
      .from(visionCalibrationSamples)
      .groupBy(visionCalibrationSamples.status),
    database
      .select({
        vote: videoInsightFeedback.vote,
        count: sql<number>`count(*)::int`,
      })
      .from(videoInsightFeedback)
      .groupBy(videoInsightFeedback.vote),
  ]);
  const personIds = [
    ...usageRows.map((row) => row.personId),
    ...grantRows.flatMap((grant) =>
      [grant.personId, grant.grantedByPersonId].filter((id): id is string =>
        Boolean(id),
      ),
    ),
    ...calibrationRows.flatMap(({ sample }) =>
      [sample.ownerPersonId, sample.reviewedByPersonId].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const peopleById = await loadPersonSummaries(personIds);
  const topUsage = await Promise.all(
    usageRows.flatMap((row) => {
      const person = peopleById.get(row.personId);
      return person
        ? [
            loadVideoUsage(row.personId, now).then((usage) => ({
              person,
              usage,
              videoCount: row.videoCount,
            })),
          ]
        : [];
    }),
  );
  const calibrationCounts = new Map(
    calibrationCountRows.map((row) => [row.status, row.count]),
  );
  const feedbackCounts = new Map(
    insightFeedbackRows.map((row) => [row.vote, row.count]),
  );
  return {
    canManage,
    settings: policy,
    totals: {
      videos: totalRows?.count ?? 0,
      liveNow: activeStreams.length,
      // Neon returns PostgreSQL bigint aggregates as strings unless the SQL
      // expression supplies an explicit runtime decoder. Number() remains a
      // defensive boundary for older drivers and cached query results.
      storageBytes: Number(totalRows?.bytes ?? 0),
      watchedSeconds: Number(viewRows?.watched ?? 0),
      complimentarySubscribers: grantRows.filter(
        (grant) =>
          grant.status === "active" &&
          !grant.revokedAt &&
          grant.startsAt <= now &&
          (!grant.endsAt || grant.endsAt >= now),
      ).length,
    },
    activeStreams,
    topUsage,
    grants: grantRows.map((grant) => grantResult(grant, peopleById)),
    visionLearning: {
      automaticTraining: false,
      reviewRequired: true,
      counts: {
        pending: calibrationCounts.get("pending") ?? 0,
        approved: calibrationCounts.get("approved") ?? 0,
        rejected: calibrationCounts.get("rejected") ?? 0,
        training: calibrationCounts.get("training") ?? 0,
        trained: calibrationCounts.get("trained") ?? 0,
      },
      insightFeedback: {
        helpful: feedbackCounts.get(1) ?? 0,
        notHelpful: feedbackCounts.get(-1) ?? 0,
      },
      calibrationSamples: calibrationRows.flatMap((row) => {
        const owner = peopleById.get(row.sample.ownerPersonId);
        if (!owner) return [];
        const previewCapturedAt =
          row.sample.previewCapturedAt ?? row.sessionPreviewCapturedAt;
        return [
          {
            id: row.sample.id,
            videoId: row.sample.videoId,
            sessionId: row.sample.sessionId,
            videoTitle: row.videoTitle,
            owner,
            sourceModelVersion: row.sample.sourceModelVersion ?? undefined,
            qualityScore: row.sample.qualityScore ?? undefined,
            geometry: row.sample.geometry,
            previewDataUrl: row.previewJpegBase64
              ? `data:image/jpeg;base64,${row.previewJpegBase64}`
              : undefined,
            previewCapturedAt: previewCapturedAt?.toISOString(),
            status: row.sample.status as
              "pending" | "approved" | "rejected" | "training" | "trained",
            reviewedByName: row.sample.reviewedByPersonId
              ? peopleById.get(row.sample.reviewedByPersonId)?.displayName
              : undefined,
            reviewNotes: row.sample.reviewNotes ?? undefined,
            reviewedAt: row.sample.reviewedAt?.toISOString(),
            approvedForTrainingAt:
              row.sample.approvedForTrainingAt?.toISOString(),
            createdAt: row.sample.createdAt.toISOString(),
          },
        ];
      }),
    },
    cloudflareConfigured: isCloudflareStreamConfigured(),
    muxConfigured: isMuxVideoConfigured(),
    r2Configured: isR2VideoConfigured(),
  };
}

export async function reviewVisionCalibrationSample(input: {
  readonly actor: ApiActor;
  readonly sampleId: string;
  readonly decision: "approved" | "rejected";
  readonly notes: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly status: "approved" | "rejected";
  readonly reviewedAt: string;
  readonly approvedForTrainingAt?: string;
}> {
  requireDatabase();
  const database = getDatabase();
  const sample = await database.query.visionCalibrationSamples.findFirst({
    where: eq(visionCalibrationSamples.id, input.sampleId),
  });
  if (!sample) {
    throw new VideoServiceError(
      "CALIBRATION_SAMPLE_NOT_FOUND",
      "Calibration sample not found.",
    );
  }
  if (sample.status !== "pending") {
    throw new VideoServiceError(
      "CALIBRATION_SAMPLE_ALREADY_REVIEWED",
      "This calibration sample has already been reviewed.",
    );
  }
  if (input.decision === "approved") {
    const session = await database.query.visionSessions.findFirst({
      columns: { previewJpegBase64: true },
      where: eq(visionSessions.id, sample.sessionId),
    });
    if (!session?.previewJpegBase64) {
      throw new VideoServiceError(
        "CALIBRATION_SAMPLE_PREVIEW_REQUIRED",
        "A court preview is required before this sample can be approved.",
      );
    }
  }

  const approvedForTrainingAt =
    input.decision === "approved" ? input.now : null;
  const updated = await database
    .update(visionCalibrationSamples)
    .set({
      status: input.decision,
      reviewedByPersonId: input.actor.personId,
      reviewNotes: input.notes,
      reviewedAt: input.now,
      approvedForTrainingAt,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(visionCalibrationSamples.id, sample.id),
        eq(visionCalibrationSamples.status, "pending"),
      ),
    )
    .returning({
      id: visionCalibrationSamples.id,
      status: visionCalibrationSamples.status,
      reviewedAt: visionCalibrationSamples.reviewedAt,
      approvedForTrainingAt: visionCalibrationSamples.approvedForTrainingAt,
    })
    .then((rows) => rows[0]);
  if (!updated || !updated.reviewedAt) {
    throw new VideoServiceError(
      "CALIBRATION_SAMPLE_ALREADY_REVIEWED",
      "This calibration sample was reviewed by another administrator.",
    );
  }

  await recordAudit({
    actorPersonId: input.actor.personId,
    action: `vision.calibration-sample-${input.decision}`,
    entityType: "vision-calibration-sample",
    entityId: updated.id,
    reason: `${input.notes} No automatic model training was started.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });

  return {
    id: updated.id,
    status: input.decision,
    reviewedAt: updated.reviewedAt.toISOString(),
    approvedForTrainingAt: updated.approvedForTrainingAt?.toISOString(),
  };
}

export async function grantComplimentaryDunaPlus(input: {
  readonly actor: ApiActor;
  readonly email: string;
  readonly startsAt: Date;
  readonly endsAt?: Date;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<DunaPlusGrant> {
  requireDatabase();
  if (input.endsAt && input.endsAt <= input.startsAt) {
    throw new VideoServiceError(
      "INVALID_GRANT_WINDOW",
      "The complimentary end date must be after its start date.",
    );
  }
  const database = getDatabase();
  const email = input.email.trim().toLowerCase();
  const person = await database
    .select({ id: people.id })
    .from(people)
    .where(sql`lower(${people.email}) = ${email}`)
    .limit(1)
    .then((rows) => rows[0]);
  await database
    .insert(dunaPlusGrants)
    .values({
      personId: person?.id,
      emailNormalized: email,
      status: "active",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason,
      grantedByPersonId: input.actor.personId,
      revokedAt: null,
      revokedByPersonId: null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: dunaPlusGrants.emailNormalized,
      set: {
        personId: person?.id,
        status: "active",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
        grantedByPersonId: input.actor.personId,
        revokedAt: null,
        revokedByPersonId: null,
        updatedAt: input.now,
      },
    });
  const grant = await database.query.dunaPlusGrants.findFirst({
    where: eq(dunaPlusGrants.emailNormalized, email),
  });
  if (!grant) {
    throw new VideoServiceError("GRANT_NOT_FOUND", "Grant was not created.");
  }
  await recordAudit({
    actorPersonId: input.actor.personId,
    action: "duna-plus.complimentary-granted",
    entityType: "duna-plus-grant",
    entityId: grant.id,
    reason: `${input.reason}${input.endsAt ? ` through ${input.endsAt.toISOString()}` : " indefinitely"}.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  const peopleById = await loadPersonSummaries(
    [grant.personId, grant.grantedByPersonId].filter((id): id is string =>
      Boolean(id),
    ),
  );
  return grantResult(grant, peopleById);
}

export async function revokeComplimentaryDunaPlus(input: {
  readonly actor: ApiActor;
  readonly grantId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<DunaPlusGrant> {
  requireDatabase();
  const database = getDatabase();
  const grant = await database.query.dunaPlusGrants.findFirst({
    where: eq(dunaPlusGrants.id, input.grantId),
  });
  if (!grant) {
    throw new VideoServiceError("GRANT_NOT_FOUND", "Grant not found.");
  }
  await database
    .update(dunaPlusGrants)
    .set({
      status: "revoked",
      revokedAt: input.now,
      revokedByPersonId: input.actor.personId,
      updatedAt: input.now,
    })
    .where(eq(dunaPlusGrants.id, grant.id));
  await recordAudit({
    actorPersonId: input.actor.personId,
    action: "duna-plus.complimentary-revoked",
    entityType: "duna-plus-grant",
    entityId: grant.id,
    reason: input.reason,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  const updated = await database.query.dunaPlusGrants.findFirst({
    where: eq(dunaPlusGrants.id, grant.id),
  });
  if (!updated) {
    throw new VideoServiceError("GRANT_NOT_FOUND", "Grant not found.");
  }
  const peopleById = await loadPersonSummaries(
    [updated.personId, updated.grantedByPersonId].filter((id): id is string =>
      Boolean(id),
    ),
  );
  return grantResult(updated, peopleById);
}

export async function grantVideoAllowance(input: {
  readonly actor: ApiActor;
  readonly scopeOrganizationId: string;
  readonly targetType: "organization" | "person";
  readonly targetId: string;
  readonly uploadSeconds: number;
  readonly liveSeconds: number;
  readonly cadence: "current-period" | "recurring";
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoAllowanceGrant> {
  requireDatabase();
  if (
    !Number.isSafeInteger(input.uploadSeconds) ||
    !Number.isSafeInteger(input.liveSeconds) ||
    input.uploadSeconds < 0 ||
    input.liveSeconds < 0 ||
    (input.uploadSeconds === 0 && input.liveSeconds === 0)
  ) {
    throw new VideoServiceError(
      "INVALID_ALLOWANCE_GRANT",
      "Add a positive number of upload or live-stream hours.",
    );
  }
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.scopeOrganizationId),
  });
  if (!organization) {
    throw new VideoServiceError(
      "INVALID_ALLOWANCE_GRANT",
      "Organization was not found.",
    );
  }
  if (
    input.targetType === "organization" &&
    input.targetId !== input.scopeOrganizationId
  ) {
    throw new VideoServiceError(
      "INVALID_ALLOWANCE_GRANT",
      "The organization allowance target does not match this workspace.",
    );
  }
  if (input.targetType === "person") {
    const membership = await database.query.organizationMemberships.findFirst({
      where: and(
        eq(organizationMemberships.organizationId, input.scopeOrganizationId),
        eq(organizationMemberships.personId, input.targetId),
        eq(organizationMemberships.active, true),
      ),
    });
    if (!membership) {
      throw new VideoServiceError(
        "INVALID_ALLOWANCE_GRANT",
        "Choose an active member of this organization.",
      );
    }
  }
  const endsAt =
    input.cadence === "current-period"
      ? monthBounds(input.now).endsAt
      : undefined;
  const grant = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [createdGrant] = await transaction
        .insert(videoAllowanceGrants)
        .values({
          organizationId:
            input.targetType === "organization" ? input.targetId : null,
          personId: input.targetType === "person" ? input.targetId : null,
          scopeOrganizationId: input.scopeOrganizationId,
          uploadSeconds: input.uploadSeconds,
          liveSeconds: input.liveSeconds,
          cadence: input.cadence,
          startsAt: input.now,
          endsAt,
          reason: input.reason,
          grantedByPersonId: input.actor.personId,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning();
      if (!createdGrant) {
        throw new VideoServiceError(
          "ALLOWANCE_GRANT_NOT_FOUND",
          "Video allowance grant was not created.",
        );
      }
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        organizationId: input.scopeOrganizationId,
        actorType: "person",
        action: "video.allowance-granted",
        entityType:
          input.targetType === "organization" ? "organization" : "person",
        entityId: input.targetId,
        reason: `${input.reason} Added ${input.uploadSeconds / 3_600} upload hours and ${input.liveSeconds / 3_600} live hours ${input.cadence === "recurring" ? "each month until revoked" : `through ${endsAt!.toISOString()}`}.`,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
      return createdGrant;
    },
  );
  const peopleById = await loadPersonSummaries(
    [grant.personId, grant.grantedByPersonId].filter((id): id is string =>
      Boolean(id),
    ),
  );
  return videoAllowanceGrantResult(
    grant,
    organization.name,
    peopleById,
    input.now,
  );
}

export async function revokeVideoAllowance(input: {
  readonly actor: ApiActor;
  readonly scopeOrganizationId: string;
  readonly grantId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoAllowanceGrant> {
  requireDatabase();
  const database = getDatabase();
  const [organization, grant] = await Promise.all([
    database.query.organizations.findFirst({
      where: eq(organizations.id, input.scopeOrganizationId),
    }),
    database.query.videoAllowanceGrants.findFirst({
      where: eq(videoAllowanceGrants.id, input.grantId),
    }),
  ]);
  if (!organization || !grant) {
    throw new VideoServiceError(
      "ALLOWANCE_GRANT_NOT_FOUND",
      "Video allowance grant was not found.",
    );
  }
  if (
    grant.scopeOrganizationId !== input.scopeOrganizationId &&
    grant.organizationId !== input.scopeOrganizationId
  ) {
    throw new VideoServiceError(
      "ALLOWANCE_GRANT_NOT_FOUND",
      "Video allowance grant does not belong to this organization.",
    );
  }
  if (grant.revokedAt) {
    throw new VideoServiceError(
      "INVALID_ALLOWANCE_GRANT",
      "Video allowance grant has already been revoked.",
    );
  }
  const updated = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [revokedGrant] = await transaction
        .update(videoAllowanceGrants)
        .set({
          revokedAt: input.now,
          revokedByPersonId: input.actor.personId,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(videoAllowanceGrants.id, grant.id),
            isNull(videoAllowanceGrants.revokedAt),
          ),
        )
        .returning();
      if (!revokedGrant) {
        throw new VideoServiceError(
          "INVALID_ALLOWANCE_GRANT",
          "Video allowance grant was already revoked by another administrator.",
        );
      }
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        organizationId: input.scopeOrganizationId,
        actorType: "person",
        action: "video.allowance-revoked",
        entityType: "video-allowance-grant",
        entityId: grant.id,
        reason: input.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
      return revokedGrant;
    },
  );
  const peopleById = await loadPersonSummaries(
    [
      updated.personId,
      updated.grantedByPersonId,
      updated.revokedByPersonId,
    ].filter((id): id is string => Boolean(id)),
  );
  return videoAllowanceGrantResult(
    updated,
    organization.name,
    peopleById,
    input.now,
  );
}

export async function updateVideoQuotaPolicy(input: {
  readonly actor: ApiActor;
  readonly personId?: string;
  readonly monthlyLiveSeconds: number;
  readonly monthlyUploadSeconds: number;
  readonly enforceLiveLimit: boolean;
  readonly enforceUploadLimit: boolean;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly monthlyLiveSeconds: number;
  readonly monthlyUploadSeconds: number;
  readonly enforceLiveLimit: boolean;
  readonly enforceUploadLimit: boolean;
}> {
  requireDatabase();
  const database = getDatabase();
  const existing = await database.query.videoQuotaPolicies.findFirst({
    where: input.personId
      ? eq(videoQuotaPolicies.personId, input.personId)
      : isNull(videoQuotaPolicies.personId),
  });
  if (existing) {
    await database
      .update(videoQuotaPolicies)
      .set({
        monthlyLiveSeconds: input.monthlyLiveSeconds,
        monthlyUploadSeconds: input.monthlyUploadSeconds,
        enforceLiveLimit: input.enforceLiveLimit,
        enforceUploadLimit: input.enforceUploadLimit,
        updatedByPersonId: input.actor.personId,
        updatedAt: input.now,
      })
      .where(eq(videoQuotaPolicies.id, existing.id));
  } else {
    await database.insert(videoQuotaPolicies).values({
      personId: input.personId,
      monthlyLiveSeconds: input.monthlyLiveSeconds,
      monthlyUploadSeconds: input.monthlyUploadSeconds,
      enforceLiveLimit: input.enforceLiveLimit,
      enforceUploadLimit: input.enforceUploadLimit,
      updatedByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  await recordAudit({
    actorPersonId: input.actor.personId,
    action: "video.quota-updated",
    entityType: input.personId ? "person" : "video-quota-policy",
    entityId: input.personId ?? "global",
    reason: input.reason,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return {
    monthlyLiveSeconds: input.monthlyLiveSeconds,
    monthlyUploadSeconds: input.monthlyUploadSeconds,
    enforceLiveLimit: input.enforceLiveLimit,
    enforceUploadLimit: input.enforceUploadLimit,
  };
}

interface MuxWebhookData {
  readonly id?: string;
  readonly status?: string;
  readonly passthrough?: string;
  readonly live_stream_id?: string;
  readonly duration?: number;
  readonly playback_ids?: readonly {
    readonly id?: string;
    readonly policy?: string;
  }[];
  readonly errors?: { readonly messages?: readonly string[] };
}

interface MuxWebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly created_at?: string;
  readonly data: MuxWebhookData;
}

function muxWebhookEvent(value: unknown): MuxWebhookEvent {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("type" in value) ||
    !("data" in value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    !value.data ||
    typeof value.data !== "object"
  ) {
    throw new Error("Mux webhook payload is invalid.");
  }
  return value as MuxWebhookEvent;
}

export async function handleMuxVideoWebhook(
  unwrappedEvent: unknown,
  now = new Date(),
): Promise<{ readonly handled: true; readonly duplicate: boolean }> {
  requireDatabase();
  const event = muxWebhookEvent(unwrappedEvent);
  const database = getDatabase();
  const inserted = await database
    .insert(webhookEvents)
    .values({
      provider: "mux",
      providerEventId: event.id,
      eventType: event.type,
      payload: unwrappedEvent as Record<string, unknown>,
      signatureVerified: true,
      status: "received",
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return { handled: true, duplicate: true };
  try {
    const occurredAt = event.created_at ? new Date(event.created_at) : now;
    if (event.type === "video.live_stream.active" && event.data.id) {
      await database
        .update(videos)
        .set({
          status: "live",
          startedAt: sql`coalesce(${videos.startedAt}, ${occurredAt})`,
          updatedAt: now,
        })
        .where(eq(videos.muxLiveStreamId, event.data.id));
    } else if (
      (event.type === "video.live_stream.idle" ||
        event.type === "video.live_stream.disconnected") &&
      event.data.id
    ) {
      await database
        .update(videos)
        .set({
          status: "processing",
          endedAt: sql`coalesce(${videos.endedAt}, ${occurredAt})`,
          durationSeconds: sql`coalesce(${videos.durationSeconds}, greatest(0, extract(epoch from (${occurredAt} - ${videos.startedAt}))::int))`,
          updatedAt: now,
        })
        .where(eq(videos.muxLiveStreamId, event.data.id));
    } else if (event.type === "video.asset.ready" && event.data.id) {
      const playback = event.data.playback_ids?.[0];
      const lookup = event.data.passthrough
        ? eq(videos.id, event.data.passthrough)
        : event.data.live_stream_id
          ? eq(videos.muxLiveStreamId, event.data.live_stream_id)
          : undefined;
      if (lookup) {
        await database
          .update(videos)
          .set({
            status: "ready",
            muxAssetId: event.data.id,
            muxAssetPlaybackId: playback?.id,
            muxAssetPlaybackPolicy: playback?.policy,
            durationSeconds:
              event.data.duration === undefined
                ? undefined
                : Math.max(0, Math.round(event.data.duration)),
            readyAt: occurredAt,
            updatedAt: now,
          })
          .where(lookup);
      }
    } else if (event.type === "video.asset.errored" && event.data.id) {
      const lookup = event.data.passthrough
        ? eq(videos.id, event.data.passthrough)
        : event.data.live_stream_id
          ? eq(videos.muxLiveStreamId, event.data.live_stream_id)
          : eq(videos.muxAssetId, event.data.id);
      await database
        .update(videos)
        .set({
          status: "failed",
          failureReason:
            event.data.errors?.messages?.join(" ").slice(0, 2_000) ??
            "Mux could not process the live recording.",
          updatedAt: now,
        })
        .where(lookup);
    }
    await database
      .update(webhookEvents)
      .set({ status: "processed", processedAt: now })
      .where(eq(webhookEvents.providerEventId, event.id));
    return { handled: true, duplicate: false };
  } catch (error) {
    await database
      .update(webhookEvents)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(webhookEvents.providerEventId, event.id));
    throw error;
  }
}
