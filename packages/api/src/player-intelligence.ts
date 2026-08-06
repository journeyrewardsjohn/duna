import {
  auditLog,
  externalPlayerProfiles,
  follows,
  getDatabase,
  importedMatches,
  importLinks,
  importSources,
  messages,
  people,
  playerFollowDeliveries,
  playerFollowPreferences,
  playerMediaWorkflows,
  playerPublicProfiles,
  professionalEvents,
  profileMergeRecords,
  worldRankings,
} from "@duna/db";
import { playerIdFromPublicIdentifier, publicPlayerPath } from "@duna/core";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import { assertProfileSubjectAuthority } from "./profile-onboarding";
import {
  createPlayerResearchProposal,
  parsePlayerResearchProposal,
  type PlayerResearchProposal,
} from "./player-research";
import {
  effectiveProfessionalEvent,
  importSandSource,
  professionalEventSlug,
  professionalSource,
  professionalTour,
  rawProfessionalTeamEntries,
  watchOptionsFromPayload,
} from "./sand-data/service";
import { dedupeWorldRankingRows } from "./sand-data/rankings";

export class PlayerIntelligenceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "PLAYER_NOT_FOUND"
      | "HANDLE_UNAVAILABLE"
      | "FOLLOW_SELF"
      | "MEDIA_RIGHTS_REQUIRED"
      | "MEDIA_REFERENCES_INVALID"
      | "WORKFLOW_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "PlayerIntelligenceError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new PlayerIntelligenceError(
      "DATABASE_REQUIRED",
      "Player intelligence requires the connected Duna database.",
    );
  }
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function profileLinks(
  value: readonly {
    readonly label: string;
    readonly url: string;
    readonly kind: "website" | "instagram" | "youtube" | "news";
  }[],
) {
  return value.filter((link) => {
    try {
      const url = new URL(link.url);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !/(^|\.)sandrating\.com$/i.test(url.hostname)
      );
    } catch {
      return false;
    }
  });
}

function profileNews(
  value: readonly {
    readonly title: string;
    readonly url: string;
    readonly publisher?: string;
    readonly publishedAt?: string;
  }[],
) {
  return value.filter((item) => {
    try {
      const url = new URL(item.url);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !/(^|\.)sandrating\.com$/i.test(url.hostname)
      );
    } catch {
      return false;
    }
  });
}

async function publicPersonByHandle(handle: string) {
  return getDatabase().query.people.findFirst({
    where: and(
      eq(people.handle, handle),
      eq(people.status, "active"),
      eq(people.profileVisibility, "public"),
      eq(people.isMinor, false),
    ),
  });
}

async function canonicalPlayerPath(
  person: typeof people.$inferSelect,
): Promise<string> {
  const database = getDatabase();
  const [profile, ranking] = await Promise.all([
    database.query.playerPublicProfiles.findFirst({
      where: and(
        eq(playerPublicProfiles.personId, person.id),
        eq(playerPublicProfiles.publicationStatus, "published"),
      ),
      columns: { countryCode: true, hometown: true },
    }),
    database.query.worldRankings.findFirst({
      where: eq(worldRankings.personId, person.id),
      orderBy: [desc(worldRankings.rankingDate), asc(worldRankings.rank)],
      columns: { countryCode: true },
    }),
  ]);
  return publicPlayerPath({
    id: person.id,
    displayName: person.displayName,
    handle: person.handle,
    homeMarket: profile?.hometown ?? person.homeMarket,
    countryCode: profile?.countryCode ?? ranking?.countryCode,
    profileClaimStatus: person.profileClaimStatus as
      "claimed" | "unclaimed" | "claim-pending" | "merged",
  });
}

export async function resolvePublicPlayerRoute(identifier: string) {
  requireDatabase();
  const database = getDatabase();
  const normalized = identifier.trim().toLowerCase();
  const personId = playerIdFromPublicIdentifier(normalized);

  if (personId) {
    const source = await database.query.people.findFirst({
      where: eq(people.id, personId),
    });
    if (source) {
      const sourceIsPublic =
        source.status === "active" &&
        source.profileVisibility === "public" &&
        !source.isMinor;
      if (
        sourceIsPublic &&
        (source.profileClaimStatus === "unclaimed" ||
          source.profileClaimStatus === "claim-pending" ||
          source.profileClaimStatus === "claimed")
      ) {
        return {
          personId: source.id,
          handle: source.handle,
          canonicalPath: await canonicalPlayerPath(source),
        };
      }

      const merge = await database.query.profileMergeRecords.findFirst({
        where: eq(profileMergeRecords.sourcePersonId, source.id),
        orderBy: [desc(profileMergeRecords.createdAt)],
        columns: { targetPersonId: true },
      });
      if (merge) {
        const target = await database.query.people.findFirst({
          where: and(
            eq(people.id, merge.targetPersonId),
            eq(people.status, "active"),
            eq(people.profileVisibility, "public"),
            eq(people.isMinor, false),
            eq(people.profileClaimStatus, "claimed"),
          ),
        });
        if (target) {
          return {
            personId: target.id,
            handle: target.handle,
            canonicalPath: await canonicalPlayerPath(target),
          };
        }
      }
    }
    return undefined;
  }

  const person = await database.query.people.findFirst({
    where: and(
      eq(people.handle, normalized),
      eq(people.status, "active"),
      eq(people.profileVisibility, "public"),
      eq(people.isMinor, false),
      eq(people.profileClaimStatus, "claimed"),
    ),
  });
  return person
    ? {
        personId: person.id,
        handle: person.handle,
        canonicalPath: await canonicalPlayerPath(person),
      }
    : undefined;
}

type UpcomingPlayerEvent = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly location?: string;
  readonly countryCode?: string;
  readonly category?: string;
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly status: string;
  readonly source: "fivb" | "avp";
  readonly tour: ReturnType<typeof professionalTour>;
  readonly entryStatus?: string;
  readonly teamLabel?: string;
  readonly partners: readonly string[];
  readonly watchOptions: ReturnType<typeof watchOptionsFromPayload>;
  readonly featuredMedia?: {
    readonly kind: "poster" | "hero-image" | "hero-video";
    readonly url: string;
    readonly posterUrl?: string;
    readonly alt: string;
  };
};

async function upcomingEventsForPlayer(
  personId: string,
  now: Date,
): Promise<readonly UpcomingPlayerEvent[]> {
  const database = getDatabase();
  const eventRows = await database
    .select({ event: professionalEvents, sourceSlug: importSources.slug })
    .from(professionalEvents)
    .innerJoin(importSources, eq(professionalEvents.sourceId, importSources.id))
    .where(
      and(
        inArray(professionalEvents.status, ["upcoming", "live"]),
        or(
          isNull(professionalEvents.endsOn),
          gte(professionalEvents.endsOn, today(now)),
        ),
      ),
    )
    .orderBy(asc(professionalEvents.startsOn))
    .limit(150);
  if (eventRows.length === 0) return [];

  const links = await database
    .select({
      sourceId: importLinks.sourceId,
      externalPersonId: importLinks.externalPersonId,
    })
    .from(importLinks)
    .where(
      and(
        eq(importLinks.personId, personId),
        eq(importLinks.resolutionState, "linked"),
      ),
    );
  const externalIds = new Set(
    links.map((link) => `${link.sourceId}:${link.externalPersonId}`),
  );
  const sourceIds = [...new Set(eventRows.map((row) => row.event.sourceId))];
  const matchRows = await database
    .select({
      sourceId: importedMatches.sourceId,
      externalEventId: importedMatches.externalEventId,
      participants: importedMatches.participants,
      playedAt: importedMatches.playedAt,
    })
    .from(importedMatches)
    .where(
      and(
        inArray(importedMatches.sourceId, sourceIds),
        or(
          isNull(importedMatches.playedAt),
          gte(importedMatches.playedAt, now),
        ),
      ),
    )
    .limit(1_000);

  return eventRows.flatMap(({ event, sourceSlug }) => {
    const entry = rawProfessionalTeamEntries(event.rawPayload).find((team) =>
      team.players.some((player) =>
        externalIds.has(`${event.sourceId}:${player.externalPersonId}`),
      ),
    );
    const scheduledMatch = matchRows.find(
      (match) =>
        match.sourceId === event.sourceId &&
        match.externalEventId === event.externalEventId &&
        match.participants.some(
          (participant) => participant.personId === personId,
        ),
    );
    if (!entry && !scheduledMatch) return [];
    const effective = effectiveProfessionalEvent(event);
    const watchOptions = watchOptionsFromPayload(event.rawPayload);
    const media =
      effective.editorial.media.find((asset) => asset.featured) ??
      effective.editorial.media[0];
    const participants = scheduledMatch?.participants ?? [];
    const playerSide = participants.find(
      (participant) => participant.personId === personId,
    )?.side;
    const matchPartners = playerSide
      ? participants
          .filter(
            (participant) =>
              participant.side === playerSide &&
              participant.personId !== personId,
          )
          .map((participant) => participant.name)
      : [];
    const entryPartners = entry
      ? entry.players
          .filter(
            (player) =>
              !externalIds.has(`${event.sourceId}:${player.externalPersonId}`),
          )
          .map((player) => player.displayName)
      : [];
    return [
      {
        id: event.id,
        slug: professionalEventSlug(event),
        name: effective.name,
        ...(effective.location ? { location: effective.location } : {}),
        ...(event.countryCode ? { countryCode: event.countryCode } : {}),
        ...(effective.category ? { category: effective.category } : {}),
        ...(effective.startsOn ? { startsOn: effective.startsOn } : {}),
        ...(effective.endsOn ? { endsOn: effective.endsOn } : {}),
        status: event.status,
        source: professionalSource(sourceSlug),
        tour: professionalTour(sourceSlug, effective.category),
        ...(entry?.list ? { entryStatus: entry.list } : {}),
        ...(entry?.label ? { teamLabel: entry.label } : {}),
        partners: [...new Set([...entryPartners, ...matchPartners])],
        watchOptions,
        ...(media
          ? {
              featuredMedia: {
                kind: media.kind,
                url: media.url,
                ...(media.posterUrl ? { posterUrl: media.posterUrl } : {}),
                alt: media.alt,
              },
            }
          : {}),
      },
    ];
  });
}

export async function loadPublicPlayerIntelligenceByHandle(
  handle: string,
  now = new Date(),
) {
  requireDatabase();
  const database = getDatabase();
  const person = await publicPersonByHandle(handle);
  if (!person) return undefined;
  const [profile, followerRows, upcomingEvents] = await Promise.all([
    database.query.playerPublicProfiles.findFirst({
      where: and(
        eq(playerPublicProfiles.personId, person.id),
        eq(playerPublicProfiles.publicationStatus, "published"),
      ),
    }),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(
        and(eq(follows.entityType, "person"), eq(follows.entityId, person.id)),
      ),
    upcomingEventsForPlayer(person.id, now),
  ]);
  const proposal = parsePlayerResearchProposal(profile?.researchProposal);
  return {
    personId: person.id,
    followerCount: followerRows[0]?.count ?? 0,
    profile: profile
      ? {
          shortBio: profile.shortBio ?? undefined,
          biography: profile.biography ?? undefined,
          countryCode: profile.countryCode ?? undefined,
          hometown: profile.hometown ?? undefined,
          collegeName: profile.collegeName ?? undefined,
          collegeLogoUrl: profile.collegeLogoUrl ?? undefined,
          playingRole: profile.playingRole ?? undefined,
          accentId: profile.accentId,
          cutoutImageUrl: profile.cutoutImageUrl ?? undefined,
          heroImageUrl: profile.heroImageUrl ?? undefined,
          heroVideoUrl: profile.heroVideoUrl ?? undefined,
          imageAlt: profile.imageAlt ?? undefined,
          careerStats: profile.careerStats,
          links: profileLinks(profile.links),
          news: profileNews(profile.news),
          researchedAt: profile.researchedAt?.toISOString(),
          publishedAt: profile.publishedAt?.toISOString(),
          sourceLabel: "Researched and verified by Duna" as const,
          evidenceCount: profile.researchEvidence.length,
          ...(proposal?.generatedAt
            ? { researchGeneratedAt: proposal.generatedAt }
            : {}),
        }
      : undefined,
    upcomingEvents,
  };
}

async function targetPlayer(personId: string) {
  const person = await getDatabase().query.people.findFirst({
    where: and(
      eq(people.id, personId),
      eq(people.status, "active"),
      eq(people.profileVisibility, "public"),
      eq(people.isMinor, false),
    ),
  });
  if (!person) {
    throw new PlayerIntelligenceError(
      "PLAYER_NOT_FOUND",
      "That public player profile is not available.",
    );
  }
  return person;
}

export async function loadPlayerFollowState(input: {
  readonly followerPersonId: string;
  readonly playerPersonId: string;
}) {
  requireDatabase();
  await targetPlayer(input.playerPersonId);
  const database = getDatabase();
  const [follow, preferences] = await Promise.all([
    database.query.follows.findFirst({
      where: and(
        eq(follows.followerPersonId, input.followerPersonId),
        eq(follows.entityType, "person"),
        eq(follows.entityId, input.playerPersonId),
      ),
    }),
    database.query.playerFollowPreferences.findFirst({
      where: and(
        eq(playerFollowPreferences.followerPersonId, input.followerPersonId),
        eq(playerFollowPreferences.playerPersonId, input.playerPersonId),
      ),
    }),
  ]);
  return {
    following: Boolean(follow),
    notifyRegistrations: preferences?.notifyRegistrations ?? true,
    notifyWatch: preferences?.notifyWatch ?? true,
    notifyResults: preferences?.notifyResults ?? false,
  };
}

export async function setPlayerFollow(input: {
  readonly actor: ApiActor;
  readonly playerPersonId: string;
  readonly following: boolean;
  readonly notifyRegistrations: boolean;
  readonly notifyWatch: boolean;
  readonly notifyResults: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const target = await targetPlayer(input.playerPersonId);
  if (target.id === input.actor.personId) {
    throw new PlayerIntelligenceError(
      "FOLLOW_SELF",
      "You do not need to follow your own profile.",
    );
  }
  const database = getDatabase();
  const before = await loadPlayerFollowState({
    followerPersonId: input.actor.personId,
    playerPersonId: target.id,
  });
  const audit = database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: input.following ? "player.followed" : "player.unfollowed",
    entityType: "person",
    entityId: target.id,
    beforeHash: stableHash(before),
    afterHash: stableHash({
      following: input.following,
      notifyRegistrations: input.notifyRegistrations,
      notifyWatch: input.notifyWatch,
      notifyResults: input.notifyResults,
    }),
    reason: input.following
      ? "Player chose to follow a public athlete profile."
      : "Player chose to stop following a public athlete profile.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  if (input.following) {
    await database.batch([
      database
        .insert(follows)
        .values({
          followerPersonId: input.actor.personId,
          entityType: "person",
          entityId: target.id,
          createdAt: input.now,
        })
        .onConflictDoNothing(),
      database
        .insert(playerFollowPreferences)
        .values({
          followerPersonId: input.actor.personId,
          playerPersonId: target.id,
          notifyRegistrations: input.notifyRegistrations,
          notifyWatch: input.notifyWatch,
          notifyResults: input.notifyResults,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [
            playerFollowPreferences.followerPersonId,
            playerFollowPreferences.playerPersonId,
          ],
          set: {
            notifyRegistrations: input.notifyRegistrations,
            notifyWatch: input.notifyWatch,
            notifyResults: input.notifyResults,
            updatedAt: input.now,
          },
        }),
      audit,
    ]);
  } else {
    await database.batch([
      database
        .delete(follows)
        .where(
          and(
            eq(follows.followerPersonId, input.actor.personId),
            eq(follows.entityType, "person"),
            eq(follows.entityId, target.id),
          ),
        ),
      database
        .delete(playerFollowPreferences)
        .where(
          and(
            eq(playerFollowPreferences.followerPersonId, input.actor.personId),
            eq(playerFollowPreferences.playerPersonId, target.id),
          ),
        ),
      audit,
    ]);
  }
  return loadPlayerFollowState({
    followerPersonId: input.actor.personId,
    playerPersonId: target.id,
  });
}

function mediaPrompt(displayName: string, brief?: string) {
  const guardrails =
    "Preserve the athlete's facial identity, skin tone, body proportions, and distinguishing features exactly from the approved reference images. Do not alter age, physique, tattoos, uniform marks, or nationality. No invented sponsors, medals, text, or logos.";
  return {
    cutout:
      `${guardrails} Create an ultra-high-resolution editorial beach-volleyball athlete cutout of ${displayName}, full body, authentic competition posture, crisp natural rim light, transparent background, realistic sand detail, no shadow plate. ${brief ?? ""}`.trim(),
    poster:
      `${guardrails} Create a cinematic 16:9 beach-volleyball profile hero for ${displayName}, using the approved action photograph for pose and the portraits for face consistency. Deep Duna navy, Atlantic blue, aqua, warm sand and restrained coral color energy, abstract sand spray and court-line geometry, generous negative space for live HTML typography, no embedded words. ${brief ?? ""}`.trim(),
  };
}

export async function loadOwnPlayerMediaStudio(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
}) {
  requireDatabase();
  const subject = await assertProfileSubjectAuthority(input);
  const workflow = await getDatabase().query.playerMediaWorkflows.findFirst({
    where: eq(playerMediaWorkflows.personId, subject.id),
    orderBy: [desc(playerMediaWorkflows.createdAt)],
  });
  return {
    personId: subject.id,
    displayName: subject.displayName,
    workflow: workflow
      ? {
          id: workflow.id,
          status: workflow.status,
          referenceImages: workflow.referenceImages,
          brief: workflow.brief ?? undefined,
          generationPrompt: workflow.generationPrompt ?? undefined,
          models: workflow.models,
          outputImages: workflow.outputImages,
          rightsConfirmedAt: workflow.rightsConfirmedAt?.toISOString(),
          reviewedAt: workflow.reviewedAt?.toISOString(),
          failureReason: workflow.failureReason ?? undefined,
          createdAt: workflow.createdAt.toISOString(),
          updatedAt: workflow.updatedAt.toISOString(),
        }
      : undefined,
    requirements: {
      minimumPortraits: 2,
      maximumPortraits: 3,
      actionImages: 1,
      accepted: ["image/jpeg", "image/png", "image/webp", "image/avif"],
      guidance: [
        "One uncropped action photo with the full body, ball, and sand visible.",
        "Two or three sharp portraits: front-facing, three-quarter, and optional side profile.",
        "Natural light, no sunglasses on at least two portraits, and no beauty filters.",
        "Upload only images you own or have permission to use for AI generation.",
      ],
    },
  };
}

export async function createPlayerMediaWorkflow(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
  readonly referenceImages: readonly {
    readonly url: string;
    readonly kind: "action" | "portrait";
  }[];
  readonly brief?: string;
  readonly rightsConfirmed: true;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  if (!input.rightsConfirmed) {
    throw new PlayerIntelligenceError(
      "MEDIA_RIGHTS_REQUIRED",
      "Confirm that you own or can license every reference image.",
    );
  }
  const subject = await assertProfileSubjectAuthority(input);
  const actionCount = input.referenceImages.filter(
    (image) => image.kind === "action",
  ).length;
  const portraitCount = input.referenceImages.filter(
    (image) => image.kind === "portrait",
  ).length;
  if (
    input.referenceImages.length < 3 ||
    input.referenceImages.length > 4 ||
    actionCount !== 1 ||
    portraitCount < 2 ||
    portraitCount > 3 ||
    input.referenceImages.some((image) => {
      try {
        const url = new URL(image.url);
        const escapedPersonId = subject.id.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        const path = new RegExp(
          `^/player-media/${escapedPersonId}/${image.kind}/[0-9a-f-]{36}\\.(?:jpg|png|webp|avif)$`,
          "i",
        );
        return (
          url.protocol !== "https:" ||
          !url.hostname.endsWith(".public.blob.vercel-storage.com") ||
          !path.test(url.pathname)
        );
      } catch {
        return true;
      }
    })
  ) {
    throw new PlayerIntelligenceError(
      "MEDIA_REFERENCES_INVALID",
      "Add one action image and two or three portrait images uploaded through Duna.",
    );
  }
  const prompts = mediaPrompt(subject.displayName, input.brief);
  const [workflow] = await getDatabase()
    .insert(playerMediaWorkflows)
    .values({
      personId: subject.id,
      requestedByPersonId: input.actor.personId,
      status: "ready",
      referenceImages: input.referenceImages.map((image) => ({
        ...image,
        uploadedAt: input.now.toISOString(),
      })),
      brief: input.brief,
      generationPrompt: JSON.stringify(prompts),
      models: { cutout: "nano_banana_2", poster: "gpt_image_2" },
      rightsConfirmedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  if (!workflow) throw new Error("Duna could not create the media brief.");
  await getDatabase()
    .insert(auditLog)
    .values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "player-media.workflow.created",
      entityType: "player-media-workflow",
      entityId: workflow.id,
      afterHash: stableHash({
        personId: subject.id,
        references: input.referenceImages.length,
        models: workflow.models,
      }),
      reason:
        "Player supplied image references, confirmed rights, and requested a reviewable Duna athlete media package.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  return { id: workflow.id, status: "ready" as const };
}

export async function playerMediaUploadContext(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
}) {
  requireDatabase();
  const subject = await assertProfileSubjectAuthority(input);
  return { personId: subject.id };
}

export async function loadPlayerIntelligenceAdmin(input: {
  readonly page?: number;
  readonly pageSize?: number;
  readonly query?: string;
  readonly gender?: "men" | "women";
  readonly status?: "all" | "not-started" | "review" | "published" | "failed";
}) {
  requireDatabase();
  const database = getDatabase();
  const genders = input.gender ? [input.gender] : (["men", "women"] as const);
  const latestDates = Object.fromEntries(
    await Promise.all(
      genders.map(async (gender) => {
        const [latest] = await database
          .select({ date: worldRankings.rankingDate })
          .from(worldRankings)
          .where(eq(worldRankings.genderCategory, gender))
          .orderBy(desc(worldRankings.rankingDate))
          .limit(1);
        return [gender, latest?.date] as const;
      }),
    ),
  );
  const rows = dedupeWorldRankingRows(
    await Promise.all(
      genders.map(async (gender) => {
        const date = latestDates[gender];
        if (!date) return [];
        return database
          .select({
            genderCategory: worldRankings.genderCategory,
            rankingDate: worldRankings.rankingDate,
            rank: worldRankings.rank,
            points: worldRankings.points,
            externalPersonId: worldRankings.externalPersonId,
            countryCode: worldRankings.countryCode,
            displayName: worldRankings.displayName,
            personId: worldRankings.personId,
            personDisplayName: people.displayName,
            handle: people.handle,
            avatarUrl: people.avatarUrl,
            publicationStatus: playerPublicProfiles.publicationStatus,
            researchStatus: playerPublicProfiles.researchStatus,
            shortBio: playerPublicProfiles.shortBio,
            cutoutImageUrl: playerPublicProfiles.cutoutImageUrl,
            heroImageUrl: playerPublicProfiles.heroImageUrl,
            researchedAt: playerPublicProfiles.researchedAt,
            updatedAt: playerPublicProfiles.updatedAt,
            rawPayload: worldRankings.rawPayload,
          })
          .from(worldRankings)
          .leftJoin(people, eq(worldRankings.personId, people.id))
          .leftJoin(
            playerPublicProfiles,
            eq(worldRankings.personId, playerPublicProfiles.personId),
          )
          .where(
            and(
              eq(worldRankings.genderCategory, gender),
              eq(worldRankings.rankingDate, date),
              sql`${worldRankings.rank} <= 50`,
            ),
          )
          .orderBy(asc(worldRankings.rank));
      }),
    ).then((values) => values.flat()),
  );
  const query = input.query?.trim().toLowerCase();
  const status = input.status ?? "all";
  const filtered = rows.filter((row) => {
    const rowStatus = row.researchStatus ?? "not-started";
    const displayName = row.personDisplayName ?? row.displayName;
    return (
      (!query ||
        displayName.toLowerCase().includes(query) ||
        row.displayName.toLowerCase().includes(query) ||
        row.handle?.toLowerCase().includes(query)) &&
      (status === "all" || rowStatus === status)
    );
  });
  const pageSize = Math.min(50, Math.max(10, input.pageSize ?? 25));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, input.page ?? 1));
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  const itemPersonIds = items.flatMap((item) =>
    item.personId ? [item.personId] : [],
  );
  const mediaRows =
    itemPersonIds.length > 0
      ? await database
          .select({
            personId: playerMediaWorkflows.personId,
            status: playerMediaWorkflows.status,
            createdAt: playerMediaWorkflows.createdAt,
          })
          .from(playerMediaWorkflows)
          .where(inArray(playerMediaWorkflows.personId, itemPersonIds))
          .orderBy(desc(playerMediaWorkflows.createdAt))
      : [];
  const mediaByPerson = new Map<string, (typeof mediaRows)[number]>();
  for (const media of mediaRows) {
    if (!mediaByPerson.has(media.personId)) {
      mediaByPerson.set(media.personId, media);
    }
  }
  const counts = rows.reduce(
    (value, row) => {
      const rowStatus = row.researchStatus ?? "not-started";
      value.total += 1;
      if (row.personId) value.mapped += 1;
      if (rowStatus === "review") value.review += 1;
      if (row.publicationStatus === "published") value.published += 1;
      if (row.heroImageUrl || row.cutoutImageUrl) value.withMedia += 1;
      return value;
    },
    { total: 0, mapped: 0, review: 0, published: 0, withMedia: 0 },
  );
  return {
    page,
    pageSize,
    total: filtered.length,
    totalPages,
    counts,
    latestDates,
    items: items.map((row) => ({
      ...row,
      sourceDisplayName:
        row.personDisplayName &&
        row.personDisplayName.localeCompare(row.displayName, undefined, {
          sensitivity: "base",
        }) !== 0
          ? row.displayName
          : undefined,
      displayName: row.personDisplayName ?? row.displayName,
      personDisplayName: undefined,
      personId: row.personId ?? undefined,
      handle: row.handle ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
      countryCode: row.countryCode ?? undefined,
      publicationStatus: row.publicationStatus ?? "draft",
      researchStatus: row.researchStatus ?? "not-started",
      shortBio: row.shortBio ?? undefined,
      cutoutImageUrl: row.cutoutImageUrl ?? undefined,
      heroImageUrl: row.heroImageUrl ?? undefined,
      mediaStatus: row.personId
        ? mediaByPerson.get(row.personId)?.status
        : undefined,
      researchedAt: row.researchedAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    })),
  };
}

export async function loadPlayerIntelligenceDetail(personId: string) {
  requireDatabase();
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, personId),
  });
  if (!person) {
    throw new PlayerIntelligenceError(
      "PLAYER_NOT_FOUND",
      "The player intelligence record was not found.",
    );
  }
  const identityToken =
    person.displayName.trim().split(/\s+/).filter(Boolean).at(-1) ??
    person.displayName.trim();
  const [ranking, profile, workflows, sourceProfiles, possibleMatches] =
    await Promise.all([
      database
        .select()
        .from(worldRankings)
        .where(eq(worldRankings.personId, personId))
        .orderBy(desc(worldRankings.rankingDate), asc(worldRankings.rank))
        .limit(1)
        .then((rows) => rows[0]),
      database.query.playerPublicProfiles.findFirst({
        where: eq(playerPublicProfiles.personId, personId),
      }),
      database.query.playerMediaWorkflows.findMany({
        where: eq(playerMediaWorkflows.personId, personId),
        orderBy: [desc(playerMediaWorkflows.createdAt)],
        limit: 10,
      }),
      database
        .select({
          source: importSources.slug,
          sourceName: importSources.name,
          externalPersonId: externalPlayerProfiles.externalPersonId,
          displayName: externalPlayerProfiles.displayName,
          profileUrl: externalPlayerProfiles.profileUrl,
          countryCode: externalPlayerProfiles.countryCode,
          lastImportedAt: externalPlayerProfiles.lastImportedAt,
        })
        .from(externalPlayerProfiles)
        .innerJoin(
          importSources,
          eq(externalPlayerProfiles.sourceId, importSources.id),
        )
        .where(
          and(
            eq(externalPlayerProfiles.personId, personId),
            eq(externalPlayerProfiles.mappingState, "linked"),
          ),
        )
        .orderBy(desc(externalPlayerProfiles.lastImportedAt)),
      database
        .select({
          id: people.id,
          displayName: people.displayName,
          handle: people.handle,
          profileClaimStatus: people.profileClaimStatus,
          homeMarket: people.homeMarket,
        })
        .from(people)
        .where(
          and(
            ne(people.id, personId),
            eq(people.status, "active"),
            eq(people.isProfessional, true),
            ne(people.profileClaimStatus, "merged"),
            ilike(people.displayName, `%${identityToken}%`),
          ),
        )
        .orderBy(asc(people.displayName))
        .limit(6),
    ]);
  const sourcePlayerName =
    ranking?.rawPayload &&
    typeof ranking.rawPayload === "object" &&
    "sourcePlayerName" in ranking.rawPayload &&
    typeof ranking.rawPayload.sourcePlayerName === "string"
      ? ranking.rawPayload.sourcePlayerName.trim() || undefined
      : undefined;
  const sourceTeamKey =
    ranking?.rawPayload &&
    typeof ranking.rawPayload === "object" &&
    "teamKey" in ranking.rawPayload &&
    typeof ranking.rawPayload.teamKey === "string"
      ? ranking.rawPayload.teamKey.trim() || undefined
      : undefined;
  return {
    person: {
      id: person.id,
      displayName: person.displayName,
      handle: person.handle,
      givenName: person.givenName ?? undefined,
      familyName: person.familyName ?? undefined,
      profileClaimStatus: person.profileClaimStatus as
        "claimed" | "unclaimed" | "claim-pending" | "merged",
      avatarUrl: person.avatarUrl ?? undefined,
      heightMillimeters: person.heightMillimeters ?? undefined,
      homeMarket: person.homeMarket ?? undefined,
      collegeName: person.collegeName ?? undefined,
    },
    publicPath: publicPlayerPath({
      id: person.id,
      displayName: person.displayName,
      handle: person.handle,
      homeMarket: profile?.hometown ?? person.homeMarket,
      countryCode: profile?.countryCode ?? ranking?.countryCode,
      profileClaimStatus: person.profileClaimStatus as
        "claimed" | "unclaimed" | "claim-pending" | "merged",
    }),
    ranking: ranking
      ? {
          rank: ranking.rank,
          points: ranking.points,
          countryCode: ranking.countryCode ?? undefined,
          genderCategory: ranking.genderCategory,
          rankingDate: ranking.rankingDate,
          externalPersonId: ranking.externalPersonId,
          sourceDisplayName: ranking.displayName,
          sourcePlayerName,
          sourceTeamKey,
        }
      : undefined,
    sourceProfiles: sourceProfiles.map((source) => ({
      ...source,
      profileUrl: source.profileUrl ?? undefined,
      countryCode: source.countryCode ?? undefined,
      lastImportedAt: source.lastImportedAt?.toISOString(),
    })),
    possibleCanonicalMatches: possibleMatches.map((match) => ({
      ...match,
      profileClaimStatus: match.profileClaimStatus as
        "claimed" | "unclaimed" | "claim-pending" | "merged",
      homeMarket: match.homeMarket ?? undefined,
    })),
    profile: profile
      ? {
          ...profile,
          proposal: parsePlayerResearchProposal(profile.researchProposal),
          researchedAt: profile.researchedAt?.toISOString(),
          reviewedAt: profile.reviewedAt?.toISOString(),
          publishedAt: profile.publishedAt?.toISOString(),
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
        }
      : undefined,
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      status: workflow.status,
      referenceImages: workflow.referenceImages,
      brief: workflow.brief ?? undefined,
      generationPrompt: workflow.generationPrompt ?? undefined,
      models: workflow.models,
      outputImages: workflow.outputImages,
      rightsConfirmedAt: workflow.rightsConfirmedAt?.toISOString(),
      reviewedAt: workflow.reviewedAt?.toISOString(),
      failureReason: workflow.failureReason ?? undefined,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    })),
  };
}

export async function updatePlayerIdentity(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly displayName: string;
  readonly handle: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly homeMarket?: string;
  readonly heightMillimeters?: number;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const person = await targetPlayer(input.personId);
  const displayName = input.displayName.trim();
  const handle = input.handle.trim().toLowerCase();
  if (handle !== person.handle) {
    const owner = await database.query.people.findFirst({
      where: eq(people.handle, handle),
      columns: { id: true },
    });
    if (owner) {
      throw new PlayerIntelligenceError(
        "HANDLE_UNAVAILABLE",
        `@${handle} is already connected to another Duna player.`,
      );
    }
  }
  const before = {
    displayName: person.displayName,
    handle: person.handle,
    givenName: person.givenName,
    familyName: person.familyName,
    homeMarket: person.homeMarket,
    heightMillimeters: person.heightMillimeters,
  };
  const values = {
    displayName,
    handle,
    givenName: input.givenName?.trim() || null,
    familyName: input.familyName?.trim() || null,
    homeMarket: input.homeMarket?.trim() || null,
    heightMillimeters: input.heightMillimeters ?? null,
    updatedAt: input.now,
  } as const;
  await database.batch([
    database.update(people).set(values).where(eq(people.id, person.id)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "player-intelligence.identity-updated",
      entityType: "person",
      entityId: person.id,
      beforeHash: stableHash(before),
      afterHash: stableHash(values),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    personId: person.id,
    displayName,
    handle,
    status: "updated" as const,
  };
}

export async function researchPlayerProfile(input: {
  readonly actor?: ApiActor;
  readonly personId: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const now = input.now ?? new Date();
  const person = await database.query.people.findFirst({
    where: eq(people.id, input.personId),
  });
  if (!person) {
    throw new PlayerIntelligenceError(
      "PLAYER_NOT_FOUND",
      "The player could not be researched.",
    );
  }
  const [ranking] = await database
    .select()
    .from(worldRankings)
    .where(eq(worldRankings.personId, person.id))
    .orderBy(desc(worldRankings.rankingDate), asc(worldRankings.rank))
    .limit(1);
  await database
    .insert(playerPublicProfiles)
    .values({
      personId: person.id,
      researchStatus: "researching",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: playerPublicProfiles.personId,
      set: { researchStatus: "researching", updatedAt: now },
    });
  try {
    const proposal = await createPlayerResearchProposal(
      {
        displayName: person.displayName,
        countryCode: ranking?.countryCode ?? undefined,
        worldRank: ranking?.rank,
        genderCategory:
          ranking?.genderCategory ?? person.genderCategory ?? undefined,
      },
      { now },
    );
    const sourceEnrichment: {
      readonly source: "bvbinfo" | "volleyball-life";
      readonly externalId: string;
      readonly status: "succeeded" | "partial" | "failed";
      readonly matches?: number;
      readonly message?: string;
    }[] = [];
    for (const sourceProfile of proposal.sourceProfiles) {
      try {
        const imported = await importSandSource({
          source: sourceProfile.source,
          externalId: sourceProfile.externalId,
          now,
        });
        sourceEnrichment.push({
          source: sourceProfile.source,
          externalId: sourceProfile.externalId,
          status: imported.status,
          matches: imported.counters.matches,
        });
      } catch (error) {
        sourceEnrichment.push({
          source: sourceProfile.source,
          externalId: sourceProfile.externalId,
          status: "failed",
          message: error instanceof Error ? error.message : "Import failed",
        });
      }
    }
    await database.batch([
      database
        .update(playerPublicProfiles)
        .set({
          publicationStatus: "review",
          researchStatus: "review",
          researchProposal: proposal,
          researchEvidence: proposal.evidence,
          researchModel: proposal.model,
          researchedAt: now,
          updatedAt: now,
        })
        .where(eq(playerPublicProfiles.personId, person.id)),
      database.insert(auditLog).values({
        actorPersonId: input.actor?.personId,
        actorType: input.actor ? "person" : "system",
        action: "player-intelligence.researched",
        entityType: "person",
        entityId: person.id,
        afterHash: stableHash({
          proposalId: proposal.id,
          evidence: proposal.evidence.map((item) => item.url),
          model: proposal.model,
          sourceEnrichment,
        }),
        reason:
          "Duna researched a ranked player through Firecrawl and Vercel AI Gateway, then staged exact discovered source histories; proposed facts remain pending human review.",
        traceId: proposal.id,
        createdAt: now,
      }),
    ]);
    return { ...proposal, sourceEnrichment };
  } catch (error) {
    await database
      .update(playerPublicProfiles)
      .set({ researchStatus: "failed", updatedAt: now })
      .where(eq(playerPublicProfiles.personId, person.id));
    throw error;
  }
}

export async function refreshRankedPlayerHistories(input: {
  readonly limit?: number;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const overviews = await Promise.all(
    (["men", "women"] as const).map((gender) =>
      loadPlayerIntelligenceAdmin({
        page: 1,
        pageSize: 50,
        gender,
        status: "all",
      }),
    ),
  );
  const rankedPersonIds = [
    ...new Set(
      overviews.flatMap((overview) =>
        overview.items.flatMap((item) =>
          item.personId ? [item.personId] : [],
        ),
      ),
    ),
  ];
  if (rankedPersonIds.length === 0) {
    return { attempted: 0, succeeded: 0, partial: 0, results: [] };
  }
  const sourceRows = await getDatabase()
    .select({
      source: importSources.slug,
      externalId: externalPlayerProfiles.externalPersonId,
      lastImportedAt: externalPlayerProfiles.lastImportedAt,
    })
    .from(externalPlayerProfiles)
    .innerJoin(
      importSources,
      eq(externalPlayerProfiles.sourceId, importSources.id),
    )
    .where(
      and(
        inArray(externalPlayerProfiles.personId, rankedPersonIds),
        eq(externalPlayerProfiles.mappingState, "linked"),
        inArray(importSources.slug, ["bvbinfo", "volleyball-life"]),
      ),
    );
  const staleBefore = now.getTime() - 12 * 60 * 60 * 1_000;
  const candidates = [
    ...new Map(
      sourceRows
        .filter(
          (row) =>
            !row.lastImportedAt || row.lastImportedAt.getTime() < staleBefore,
        )
        .sort(
          (left, right) =>
            (left.lastImportedAt?.getTime() ?? 0) -
            (right.lastImportedAt?.getTime() ?? 0),
        )
        .map((row) => [`${row.source}:${row.externalId}`, row] as const),
    ).values(),
  ].slice(0, Math.min(10, Math.max(1, input.limit ?? 2)));
  const results: {
    readonly source: "bvbinfo" | "volleyball-life";
    readonly externalId: string;
    readonly status: "succeeded" | "partial" | "failed";
    readonly matches?: number;
    readonly message?: string;
  }[] = [];
  for (const candidate of candidates) {
    if (
      candidate.source !== "bvbinfo" &&
      candidate.source !== "volleyball-life"
    ) {
      continue;
    }
    try {
      const imported = await importSandSource({
        source: candidate.source,
        externalId: candidate.externalId,
        now,
      });
      results.push({
        source: candidate.source,
        externalId: candidate.externalId,
        status: imported.status,
        matches: imported.counters.matches,
      });
    } catch (error) {
      results.push({
        source: candidate.source,
        externalId: candidate.externalId,
        status: "failed",
        message: error instanceof Error ? error.message : "Refresh failed",
      });
    }
  }
  return {
    attempted: results.length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
    partial: results.filter((result) => result.status === "partial").length,
    results,
  };
}

export async function researchRankedPlayers(input: {
  readonly limit?: number;
  readonly now?: Date;
}) {
  const overviews = await Promise.all(
    (["men", "women"] as const).map((gender) =>
      loadPlayerIntelligenceAdmin({
        page: 1,
        pageSize: 50,
        gender,
        status: "not-started",
      }),
    ),
  );
  const candidates = overviews
    .flatMap((overview) => overview.items)
    .sort((left, right) => left.rank - right.rank)
    .filter((item) => item.personId)
    .slice(0, Math.min(10, Math.max(1, input.limit ?? 2)));
  const results: {
    readonly personId: string;
    readonly status: "succeeded" | "failed";
    readonly message?: string;
  }[] = [];
  for (const candidate of candidates) {
    try {
      await researchPlayerProfile({
        personId: candidate.personId!,
        now: input.now,
      });
      results.push({ personId: candidate.personId!, status: "succeeded" });
    } catch (error) {
      results.push({
        personId: candidate.personId!,
        status: "failed",
        message: error instanceof Error ? error.message : "Research failed",
      });
    }
  }
  return {
    attempted: results.length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
    results,
  };
}

export async function savePlayerPublicProfile(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly publicationStatus: "draft" | "published";
  readonly shortBio?: string;
  readonly biography?: string;
  readonly countryCode?: string;
  readonly hometown?: string;
  readonly collegeName?: string;
  readonly collegeLogoUrl?: string;
  readonly playingRole?: string;
  readonly cutoutImageUrl?: string;
  readonly heroImageUrl?: string;
  readonly heroVideoUrl?: string;
  readonly imageAlt?: string;
  readonly careerStats: {
    readonly events?: number;
    readonly wins?: number;
    readonly podiums?: number;
    readonly gold?: number;
    readonly silver?: number;
    readonly bronze?: number;
    readonly earningsMinor?: number;
    readonly earningsCurrency?: string;
  };
  readonly links: readonly {
    readonly label: string;
    readonly url: string;
    readonly kind: "website" | "instagram" | "youtube" | "news";
  }[];
  readonly news: readonly {
    readonly title: string;
    readonly url: string;
    readonly publisher?: string;
    readonly publishedAt?: string;
  }[];
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  await targetPlayer(input.personId);
  const database = getDatabase();
  const existing = await database.query.playerPublicProfiles.findFirst({
    where: eq(playerPublicProfiles.personId, input.personId),
  });
  const proposal = parsePlayerResearchProposal(existing?.researchProposal);
  const appliedProposal: PlayerResearchProposal | undefined = proposal
    ? {
        ...proposal,
        status: "applied",
        appliedAt: input.now.toISOString(),
      }
    : undefined;
  const values = {
    publicationStatus: input.publicationStatus,
    shortBio: input.shortBio,
    biography: input.biography,
    countryCode: input.countryCode?.toUpperCase(),
    hometown: input.hometown,
    collegeName: input.collegeName,
    collegeLogoUrl: input.collegeLogoUrl,
    playingRole: input.playingRole,
    cutoutImageUrl: input.cutoutImageUrl,
    heroImageUrl: input.heroImageUrl,
    heroVideoUrl: input.heroVideoUrl,
    imageAlt: input.imageAlt,
    careerStats: input.careerStats,
    links: input.links,
    news: input.news,
    researchStatus:
      input.publicationStatus === "published" ? "published" : "review",
    ...(appliedProposal ? { researchProposal: appliedProposal } : {}),
    reviewedByPersonId: input.actor.personId,
    reviewedAt: input.now,
    publishedAt:
      input.publicationStatus === "published"
        ? input.now
        : existing?.publishedAt,
    updatedAt: input.now,
  } as const;
  await database.batch([
    database
      .insert(playerPublicProfiles)
      .values({
        personId: input.personId,
        ...values,
        createdAt: input.now,
      })
      .onConflictDoUpdate({
        target: playerPublicProfiles.personId,
        set: values,
      }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action:
        input.publicationStatus === "published"
          ? "player-intelligence.published"
          : "player-intelligence.draft-saved",
      entityType: "person",
      entityId: input.personId,
      beforeHash: stableHash(existing ?? {}),
      afterHash: stableHash(values),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { personId: input.personId, status: input.publicationStatus };
}

export async function reviewPlayerMediaWorkflow(input: {
  readonly actor: ApiActor;
  readonly workflowId: string;
  readonly decision: "review" | "published" | "rejected";
  readonly outputs: readonly {
    readonly url: string;
    readonly kind: "cutout" | "poster" | "background";
    readonly jobId?: string;
  }[];
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const workflow = await database.query.playerMediaWorkflows.findFirst({
    where: eq(playerMediaWorkflows.id, input.workflowId),
  });
  if (!workflow) {
    throw new PlayerIntelligenceError(
      "WORKFLOW_NOT_FOUND",
      "The player media workflow was not found.",
    );
  }
  const status = input.decision;
  const cutout = input.outputs.find((output) => output.kind === "cutout");
  const poster = input.outputs.find((output) => output.kind === "poster");
  const workflowUpdate = database
    .update(playerMediaWorkflows)
    .set({
      status,
      outputImages: input.outputs,
      reviewedByPersonId: input.actor.personId,
      reviewedAt: input.now,
      failureReason: input.decision === "rejected" ? input.reason : null,
      updatedAt: input.now,
    })
    .where(eq(playerMediaWorkflows.id, workflow.id));
  const audit = database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: `player-media.${status}`,
    entityType: "player-media-workflow",
    entityId: workflow.id,
    beforeHash: stableHash({
      status: workflow.status,
      outputs: workflow.outputImages,
    }),
    afterHash: stableHash({ status, outputs: input.outputs }),
    reason: input.reason,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  if (input.decision === "published" && (cutout || poster)) {
    await database.batch([
      database
        .insert(playerPublicProfiles)
        .values({
          personId: workflow.personId,
          cutoutImageUrl: cutout?.url,
          heroImageUrl: poster?.url,
          publicationStatus: "published",
          publishedAt: input.now,
          reviewedAt: input.now,
          reviewedByPersonId: input.actor.personId,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: playerPublicProfiles.personId,
          set: {
            ...(cutout ? { cutoutImageUrl: cutout.url } : {}),
            ...(poster ? { heroImageUrl: poster.url } : {}),
            publicationStatus: "published",
            publishedAt: input.now,
            reviewedAt: input.now,
            reviewedByPersonId: input.actor.personId,
            updatedAt: input.now,
          },
        }),
      workflowUpdate,
      audit,
    ]);
  } else {
    await database.batch([workflowUpdate, audit]);
  }
  return { workflowId: workflow.id, status };
}

async function queueFollowMessage(input: {
  readonly followerPersonId: string;
  readonly playerPersonId: string;
  readonly playerName: string;
  readonly kind: "registration" | "watch";
  readonly event: UpcomingPlayerEvent;
  readonly now: Date;
}) {
  const database = getDatabase();
  const entityKey = input.event.id;
  const watch = input.event.watchOptions[0];
  const body =
    input.kind === "registration"
      ? `${input.playerName} is registered for ${input.event.name}${input.event.startsOn ? ` beginning ${input.event.startsOn}` : ""}. Open Duna for the event, team list, and schedule.`
      : `${input.playerName}'s ${input.event.name} coverage is now available${watch ? ` on ${watch.label}` : ""}. Open Duna for match-specific watch links and times.`;
  return database.transaction(async (transaction) => {
    const [delivery] = await transaction
      .insert(playerFollowDeliveries)
      .values({
        followerPersonId: input.followerPersonId,
        playerPersonId: input.playerPersonId,
        kind: input.kind,
        entityKey,
        payload: {
          eventId: input.event.id,
          eventSlug: input.event.slug,
          startsOn: input.event.startsOn,
        },
        createdAt: input.now,
      })
      .onConflictDoNothing()
      .returning({ id: playerFollowDeliveries.id });
    if (!delivery) return false;
    const [message] = await transaction
      .insert(messages)
      .values({
        recipientPersonId: input.followerPersonId,
        channel: "in-app",
        kind: `player-follow-${input.kind}`,
        subject:
          input.kind === "registration"
            ? `${input.playerName} added an event`
            : `${input.playerName} is now watchable`,
        body,
        status: "queued",
        scheduledAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: messages.id });
    if (!message) throw new Error("Duna could not queue the player alert.");
    await transaction
      .update(playerFollowDeliveries)
      .set({ messageId: message.id })
      .where(eq(playerFollowDeliveries.id, delivery.id));
    return true;
  });
}

export async function dispatchPlayerFollowNotifications(input: {
  readonly limit?: number;
  readonly now?: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const now = input.now ?? new Date();
  const rows = await database
    .select({
      followerPersonId: follows.followerPersonId,
      playerPersonId: follows.entityId,
      displayName: people.displayName,
      notifyRegistrations: playerFollowPreferences.notifyRegistrations,
      notifyWatch: playerFollowPreferences.notifyWatch,
      notifyResults: playerFollowPreferences.notifyResults,
    })
    .from(follows)
    .innerJoin(people, eq(follows.entityId, people.id))
    .leftJoin(
      playerFollowPreferences,
      and(
        eq(playerFollowPreferences.followerPersonId, follows.followerPersonId),
        eq(playerFollowPreferences.playerPersonId, follows.entityId),
      ),
    )
    .where(eq(follows.entityType, "person"))
    .orderBy(asc(follows.createdAt))
    .limit(Math.min(100, Math.max(1, input.limit ?? 50)));
  const followedPlayerIds = [...new Set(rows.map((row) => row.playerPersonId))];
  const recentResults =
    followedPlayerIds.length > 0
      ? (
          await database
            .select({
              id: importedMatches.id,
              title: importedMatches.title,
              playedAt: importedMatches.playedAt,
              participants: importedMatches.participants,
              sets: importedMatches.sets,
              winnerSide: importedMatches.winnerSide,
            })
            .from(importedMatches)
            .where(
              and(
                eq(importedMatches.importState, "approved"),
                gte(
                  importedMatches.playedAt,
                  new Date(now.getTime() - 2 * 24 * 60 * 60 * 1_000),
                ),
              ),
            )
            .orderBy(desc(importedMatches.playedAt))
            .limit(500)
        ).filter(
          (match) =>
            match.winnerSide &&
            match.participants.some((participant) =>
              followedPlayerIds.includes(participant.personId ?? ""),
            ),
        )
      : [];
  let queued = 0;
  for (const row of rows) {
    const events = await upcomingEventsForPlayer(row.playerPersonId, now);
    for (const event of events) {
      if (row.notifyRegistrations ?? true) {
        queued += (await queueFollowMessage({
          ...row,
          playerName: row.displayName,
          kind: "registration",
          event,
          now,
        }))
          ? 1
          : 0;
      }
      if ((row.notifyWatch ?? true) && event.watchOptions.length > 0) {
        queued += (await queueFollowMessage({
          ...row,
          playerName: row.displayName,
          kind: "watch",
          event,
          now,
        }))
          ? 1
          : 0;
      }
    }
    if (row.notifyResults ?? false) {
      for (const match of recentResults.filter((candidate) =>
        candidate.participants.some(
          (participant) => participant.personId === row.playerPersonId,
        ),
      )) {
        const playerSide = match.participants.find(
          (participant) => participant.personId === row.playerPersonId,
        )?.side;
        if (!playerSide || !match.winnerSide) continue;
        const opponents = match.participants
          .filter((participant) => participant.side !== playerSide)
          .map((participant) => participant.name)
          .join(" / ");
        const won = playerSide === match.winnerSide;
        const score = match.sets.map((set) => `${set.a}–${set.b}`).join(", ");
        const resultQueued = await database.transaction(async (transaction) => {
          const [delivery] = await transaction
            .insert(playerFollowDeliveries)
            .values({
              followerPersonId: row.followerPersonId,
              playerPersonId: row.playerPersonId,
              kind: "result",
              entityKey: match.id,
              payload: {
                matchId: match.id,
                playedAt: match.playedAt?.toISOString(),
                won,
              },
              createdAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: playerFollowDeliveries.id });
          if (!delivery) return false;
          const [message] = await transaction
            .insert(messages)
            .values({
              recipientPersonId: row.followerPersonId,
              channel: "in-app",
              kind: "player-follow-result",
              subject: `${row.displayName} ${won ? "won" : "finished"} a match`,
              body: `${row.displayName} ${won ? "defeated" : "played"} ${opponents || "their latest opponents"}${score ? `, ${score}` : ""}. Open Duna for the set scores and Sand Rating impact.`,
              status: "queued",
              scheduledAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: messages.id });
          if (!message) {
            throw new Error("Duna could not queue the player result alert.");
          }
          await transaction
            .update(playerFollowDeliveries)
            .set({ messageId: message.id })
            .where(eq(playerFollowDeliveries.id, delivery.id));
          return true;
        });
        queued += resultQueued ? 1 : 0;
      }
    }
  }
  return { scanned: rows.length, queued };
}

export type PublicPlayerIntelligence = NonNullable<
  Awaited<ReturnType<typeof loadPublicPlayerIntelligenceByHandle>>
>;
export type PlayerIntelligenceAdmin = Awaited<
  ReturnType<typeof loadPlayerIntelligenceAdmin>
>;
export type PlayerIntelligenceDetail = Awaited<
  ReturnType<typeof loadPlayerIntelligenceDetail>
>;
export type PlayerMediaStudio = Awaited<
  ReturnType<typeof loadOwnPlayerMediaStudio>
>;
