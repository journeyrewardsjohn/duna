import { createHash, randomUUID } from "node:crypto";
import type { PersonRole, PersonSummary } from "@duna/core";
import {
  auditLog,
  divisions,
  dunaPlusGrants,
  getDatabase,
  matches,
  organizationMemberships,
  people,
  ratings,
  registrations,
  sessions,
  teamMembers,
  teams,
  venues,
  videoQuotaPolicies,
  videoShareLinks,
  videoUploadParts,
  videoViews,
  videos,
  webhookEvents,
} from "@duna/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { ApiActor } from "./context";
import type {
  AdminVideoOverview,
  DunaPlusGrant,
  VideoMetrics,
  VideoPlayback,
  VideoStudio,
  VideoSummary,
  VideoUsage,
} from "./contracts";
import { getDunaPlusEntitlement } from "./membership";
import {
  abortR2VideoUpload,
  completeMuxLiveVideo,
  completeR2VideoUpload,
  createMuxLiveVideo,
  createR2VideoUpload,
  isMuxSignedPlaybackConfigured,
  isMuxVideoConfigured,
  isR2VideoConfigured,
  loadMuxVideoMetrics,
  muxDataEnvironmentKey,
  presignR2VideoPart,
  presignR2VideoPlayback,
  R2_VIDEO_PART_SIZE_BYTES,
  replaceMuxAssetPlaybackPolicy,
  replaceMuxLivePlaybackPolicy,
  signMuxPlayback,
} from "./video-providers";

const DEFAULT_MONTHLY_LIVE_SECONDS = 4 * 60 * 60;
const DEFAULT_MONTHLY_UPLOAD_SECONDS = 24 * 60 * 60;
const VIDEO_UPLOAD_SESSION_SECONDS = 24 * 60 * 60;
const MAX_VIDEO_BYTES = 5 * 1024 ** 4;
const PUBLIC_VIDEO_STATUSES = ["live", "ready", "ended", "processing"] as const;

type VideoCategory = "practice" | "event" | "match" | "social";
type LiveVisibility = "public" | "link-only";
type RecordingVisibility = "public" | "private";
type CourtCalibration = NonNullable<VideoSummary["courtCalibration"]>;

export class VideoServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "MUX_REQUIRED"
      | "R2_REQUIRED"
      | "SIGNED_PLAYBACK_REQUIRED"
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
    return [
      {
        id: video.id,
        owner,
        source: video.source as "live" | "upload",
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
        courtCalibration:
          (video.courtCalibration as CourtCalibration | null) ?? undefined,
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

async function loadQuotaPolicy(personId?: string): Promise<{
  readonly monthlyLiveSeconds: number;
  readonly monthlyUploadSeconds: number;
  readonly enforceLiveLimit: boolean;
  readonly enforceUploadLimit: boolean;
}> {
  const database = getDatabase();
  const [personPolicy, globalPolicy] = await Promise.all([
    personId
      ? database.query.videoQuotaPolicies.findFirst({
          where: eq(videoQuotaPolicies.personId, personId),
        })
      : Promise.resolve(undefined),
    database.query.videoQuotaPolicies.findFirst({
      where: isNull(videoQuotaPolicies.personId),
    }),
  ]);
  const policy = personPolicy ?? globalPolicy;
  return {
    monthlyLiveSeconds:
      policy?.monthlyLiveSeconds ?? DEFAULT_MONTHLY_LIVE_SECONDS,
    monthlyUploadSeconds:
      policy?.monthlyUploadSeconds ?? DEFAULT_MONTHLY_UPLOAD_SECONDS,
    enforceLiveLimit: policy?.enforceLiveLimit ?? true,
    enforceUploadLimit: policy?.enforceUploadLimit ?? false,
  };
}

export async function loadVideoUsage(
  personId: string,
  now = new Date(),
): Promise<VideoUsage> {
  requireDatabase();
  const database = getDatabase();
  const { startsAt, endsAt } = monthBounds(now);
  const [policy, rows] = await Promise.all([
    loadQuotaPolicy(personId),
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
        and(
          eq(videos.ownerPersonId, personId),
          sql`${videos.status} <> 'deleted'`,
        ),
      ),
  ]);
  let liveSeconds = 0;
  let uploadSeconds = 0;
  for (const row of rows) {
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

export async function loadVideoStudio(
  personId: string,
  now = new Date(),
): Promise<VideoStudio> {
  requireDatabase();
  const [entitlement, usage, ownVideos, liveNow] = await Promise.all([
    getDunaPlusEntitlement(personId, now),
    loadVideoUsage(personId, now),
    loadVideoSummaries({
      where: eq(videos.ownerPersonId, personId),
      limit: 100,
    }),
    loadVideoSummaries({
      where: and(
        eq(videos.status, "live"),
        eq(videos.liveVisibility, "public"),
      ),
      limit: 30,
    }),
  ]);
  return {
    entitlement,
    usage,
    videos: ownVideos,
    liveNow,
    liveConfigured:
      isMuxVideoConfigured() &&
      (isMuxSignedPlaybackConfigured() ||
        !ownVideos.some((video) => video.liveVisibility === "link-only")),
    uploadsConfigured: isR2VideoConfigured(),
    dataEnvironmentKey: muxDataEnvironmentKey(),
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
  readonly courtCalibration?: CourtCalibration;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly video: VideoSummary;
  readonly streamUrl: string;
  readonly streamKey: string;
  readonly maximumDurationSeconds: number;
  readonly shareUrl: string;
}> {
  requireDatabase();
  if (input.actor.ageBand !== "adult") {
    throw new VideoServiceError(
      "ADULT_REQUIRED",
      "Live streaming currently requires an adult Duna account.",
    );
  }
  if (!isMuxVideoConfigured()) {
    throw new VideoServiceError(
      "MUX_REQUIRED",
      "Mux Video must be connected before live streaming.",
    );
  }
  if (
    (input.liveVisibility === "link-only" ||
      input.recordingVisibility === "private") &&
    !isMuxSignedPlaybackConfigured()
  ) {
    throw new VideoServiceError(
      "SIGNED_PLAYBACK_REQUIRED",
      "Mux signed playback must be configured for private video.",
    );
  }
  const [entitlement, usage, association] = await Promise.all([
    getDunaPlusEntitlement(input.actor.personId, input.now),
    loadVideoUsage(input.actor.personId, input.now),
    validateAssociation(input),
  ]);
  if (!entitlement.active) {
    throw new VideoServiceError(
      "DUNA_PLUS_REQUIRED",
      "Live streaming is available with Duna+.",
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
    liveVisibility: input.liveVisibility,
    recordingVisibility: input.recordingVisibility,
    hasAudio: input.hasAudio,
    courtCalibration: input.courtCalibration,
    createdAt: input.now,
    updatedAt: input.now,
  });
  try {
    const [mux, share] = await Promise.all([
      createMuxLiveVideo({
        videoId,
        title: input.title,
        liveVisibility: input.liveVisibility,
        recordingVisibility: input.recordingVisibility,
        maximumDurationSeconds,
        idempotencyKey: input.idempotencyKey,
      }),
      createStoredShareLink({
        videoId,
        ownerPersonId: input.actor.personId,
      }),
    ]);
    await Promise.all([
      database
        .update(videos)
        .set({
          muxLiveStreamId: mux.liveStreamId,
          muxLivePlaybackId: mux.playbackId,
          muxLivePlaybackPolicy: mux.playbackPolicy,
          updatedAt: input.now,
        })
        .where(eq(videos.id, videoId)),
      recordAudit({
        actorPersonId: input.actor.personId,
        action: "video.live-created",
        entityType: "video",
        entityId: videoId,
        reason: `Created ${input.liveVisibility} Duna live stream.`,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      }),
    ]);
    return {
      video: await loadVideoSummary(videoId),
      streamUrl: "rtmps://global-live.mux.com:443/app",
      streamKey: mux.streamKey,
      maximumDurationSeconds,
      shareUrl: share.url,
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
    console.error("Duna live provider setup failed", { error, videoId });
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

export async function finishLiveVideo(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoSummary> {
  requireDatabase();
  const video = await ownedVideo(input.actor.personId, input.videoId);
  if (video.source !== "live" || !video.muxLiveStreamId) {
    throw new VideoServiceError(
      "VIDEO_NOT_FOUND",
      "An active live stream was not found.",
    );
  }
  await completeMuxLiveVideo(video.muxLiveStreamId);
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
  ]);
  return loadVideoSummary(video.id);
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
  const publishedToProfile =
    recordingVisibility === "public" && input.publishedToProfile;
  await Promise.all([
    getDatabase()
      .update(videos)
      .set({
        liveVisibility,
        recordingVisibility,
        publishedToProfile,
        muxLivePlaybackId: livePlaybackId,
        muxLivePlaybackPolicy:
          liveVisibility === "public" ? "public" : "signed",
        muxAssetPlaybackId: assetPlaybackId,
        muxAssetPlaybackPolicy:
          recordingVisibility === "public" ? "public" : "signed",
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
    loadVideoUsage(input.actor.personId, input.now),
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
  const objectKey = `videos/${input.actor.personId}/${videoId}/source.mp4`;
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
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
    durationSeconds: input.durationSeconds,
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
  const totalParts = Math.ceil(video.bytes! / R2_VIDEO_PART_SIZE_BYTES);
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
  const totalParts = Math.ceil(video.bytes! / R2_VIDEO_PART_SIZE_BYTES);
  const expectedMaximum =
    input.partNumber === totalParts
      ? video.bytes! - (totalParts - 1) * R2_VIDEO_PART_SIZE_BYTES
      : R2_VIDEO_PART_SIZE_BYTES;
  if (
    input.partNumber < 1 ||
    input.partNumber > totalParts ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > expectedMaximum ||
    (input.partNumber < totalParts && input.sizeBytes < 5 * 1024 * 1024)
  ) {
    throw new VideoServiceError(
      "UPLOAD_PART_INVALID",
      "The uploaded part metadata is invalid.",
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
  const parts = await getDatabase()
    .select({ partNumber: videoUploadParts.partNumber })
    .from(videoUploadParts)
    .where(eq(videoUploadParts.videoId, video.id))
    .orderBy(asc(videoUploadParts.partNumber));
  return { uploadedParts: parts.map((part) => part.partNumber) };
}

export async function completeVideoUpload(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoSummary> {
  requireDatabase();
  const video = await activeUpload(input.actor.personId, input.videoId);
  const expectedParts = Math.ceil(video.bytes! / R2_VIDEO_PART_SIZE_BYTES);
  const parts = await getDatabase()
    .select()
    .from(videoUploadParts)
    .where(eq(videoUploadParts.videoId, video.id))
    .orderBy(asc(videoUploadParts.partNumber));
  const uploadedBytes = parts.reduce((sum, part) => sum + part.sizeBytes, 0);
  if (
    parts.length !== expectedParts ||
    uploadedBytes !== video.bytes ||
    parts.some((part, index) => part.partNumber !== index + 1)
  ) {
    throw new VideoServiceError(
      "UPLOAD_INCOMPLETE",
      "Every video part must finish uploading before completion.",
    );
  }
  const completed = await completeR2VideoUpload({
    objectKey: video.r2ObjectKey!,
    uploadId: video.r2UploadId!,
    parts: parts.map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag,
    })),
  });
  await Promise.all([
    getDatabase()
      .update(videos)
      .set({
        status: "ready",
        r2Etag: completed.etag,
        r2UploadId: null,
        readyAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(videos.id, video.id)),
    recordAudit({
      actorPersonId: input.actor.personId,
      action: "video.upload-completed",
      entityType: "video",
      entityId: video.id,
      reason: `Completed direct R2 upload (${video.bytes} bytes).`,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    }),
  ]);
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
  const video = await activeUpload(input.actor.personId, input.videoId);
  await abortR2VideoUpload({
    objectKey: video.r2ObjectKey!,
    uploadId: video.r2UploadId!,
  });
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

export async function loadVideoPlayback(input: {
  readonly videoId: string;
  readonly accessToken?: string;
  readonly actor?: ApiActor;
  readonly platform: "ios" | "web";
  readonly now: Date;
}): Promise<VideoPlayback> {
  requireDatabase();
  const database = getDatabase();
  const video = await database.query.videos.findFirst({
    where: eq(videos.id, input.videoId),
  });
  if (!video || video.status === "deleted" || video.status === "failed") {
    throw new VideoServiceError("VIDEO_NOT_FOUND", "Video not found.");
  }
  const isOwner = input.actor?.personId === video.ownerPersonId;
  const shareLinkId = isOwner
    ? undefined
    : await resolveShareAccess(video.id, input.accessToken, input.now);
  const livePlayback =
    video.status === "live" ||
    (!video.muxAssetPlaybackId &&
      video.source === "live" &&
      Boolean(video.muxLivePlaybackId));
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
  let provider: "mux" | "r2";
  let playbackId: string | undefined;
  let playbackToken: string | undefined;
  let sourceUrl: string | undefined;
  let posterUrl: string | undefined;
  if (video.source === "live") {
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
  return {
    video: await loadVideoSummary(video.id),
    provider,
    playbackId,
    playbackToken,
    sourceUrl,
    posterUrl,
    dataEnvironmentKey: muxDataEnvironmentKey(),
    viewSessionId,
    isOwner,
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
  const [policy, totalRows, viewRows, grantRows, activeStreams, usageRows] =
    await Promise.all([
      loadQuotaPolicy(),
      database
        .select({
          count: sql<number>`count(*)::int`,
          bytes: sql<number>`coalesce(sum(${videos.bytes}), 0)::bigint`,
        })
        .from(videos)
        .where(sql`${videos.status} <> 'deleted'`)
        .then((rows) => rows[0]),
      database
        .select({
          watched: sql<number>`coalesce(sum(${videoViews.watchedSeconds}), 0)::bigint`,
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
    ]);
  const personIds = [
    ...usageRows.map((row) => row.personId),
    ...grantRows.flatMap((grant) =>
      [grant.personId, grant.grantedByPersonId].filter((id): id is string =>
        Boolean(id),
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
  return {
    canManage,
    settings: policy,
    totals: {
      videos: totalRows?.count ?? 0,
      liveNow: activeStreams.length,
      storageBytes: totalRows?.bytes ?? 0,
      watchedSeconds: viewRows?.watched ?? 0,
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
    muxConfigured: isMuxVideoConfigured(),
    r2Configured: isR2VideoConfigured(),
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
