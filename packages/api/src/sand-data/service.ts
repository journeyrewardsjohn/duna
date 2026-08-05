import {
  adminRoles,
  auditLog,
  externalPlayerProfiles,
  getDatabase,
  importedMatches,
  importLinks,
  importSources,
  matchHistoryDisputes,
  matches,
  people,
  playerPublicProfiles,
  playerSourceConnections,
  professionalEventPredictionHistory,
  professionalEventPredictions,
  professionalEvents,
  professionalMatchPredictionHistory,
  professionalMatchPredictions,
  ratingBacktestPredictions,
  ratingBacktestRuns,
  profileMergeRecords,
  ratingConfigurations,
  ratingEvaluations,
  ratingEvents,
  ratings,
  sandIngestionRuns,
  teamMembers,
  teams,
  worldRankings,
  workflowJobs,
} from "@duna/db";
import {
  defaultRatingConfig,
  evaluatePredictions,
  performanceEvidenceFromSetScores,
  runRatingBacktest,
  worldRankingSignal,
  type RatingBacktestMatch,
} from "@duna/rating";
import { publicPlayerPath } from "@duna/core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { stableHash } from "../canonical";
import { scopesForRoles, type ApiActor } from "../context";
import { venueWallTimeToUtc } from "../court-checkout";
import { publishImportedProfessionalActivities } from "../live-activities";
import {
  applyApprovedImportedMatchRating,
  rebuildSandRatingProjection,
} from "../match-service";
import { assertProfileSubjectAuthority } from "../profile-onboarding";
import { avpExternalPlayerId, importAvpLeague } from "./avp";
import { importSandRatingNetwork } from "./sandrating";
import {
  crossSourceMatchFingerprint,
  matchMappingConfidence,
  normalizePersonName,
  safeExternalHandle,
  sourceMatchFingerprint,
} from "./normalize";
import { dedupeWorldRankingRows } from "./rankings";
import {
  createProfessionalEventResearchProposal,
  parseProfessionalEventResearchProposal,
  type ProfessionalEventResearchProposal,
} from "./research";
import {
  importBvbInfoPlayer,
  importFivbTournament,
  importVolleyballLifePlayer,
  importWorldRankings,
  listFivbEvents,
  type SourceImportProgress,
} from "./sources";
import {
  SandDataUpstreamError,
  type ExternalMatchRecord,
  type ExternalPlayerRecord,
  type SandDataSource,
  type SourceImportResult,
} from "./types";

const sourceNames: Readonly<Record<SandDataSource, string>> = {
  "avp-league": "AVP League",
  bvbinfo: "BVBInfo",
  "fivb-12ndr": "FIVB via fivb.12ndr",
  sandrating: "SandRating",
  "volleyball-life": "VolleyballLife",
  "volleyball-world": "Volleyball World Rankings",
};

export class SandDataServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "SOURCE_UNAVAILABLE"
      | "MATCH_NOT_FOUND"
      | "MATCH_NOT_READY"
      | "PLAYER_NOT_FOUND"
      | "MAPPING_CONFLICT"
      | "MERGE_CONFLICT"
      | "CLAIM_CONFLICT"
      | "INVALID_PROFILE_URL"
      | "INVALID_WATCH_OPTION"
      | "INVALID_PROFESSIONAL_EVENT"
      | "PROFESSIONAL_REQUIRED"
      | "SUPER_ADMIN_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "SandDataServiceError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new SandDataServiceError(
      "DATABASE_REQUIRED",
      "Sand data operations require the connected Duna database.",
    );
  }
}

function unknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function preserveEditorialPayload(
  incoming: Readonly<Record<string, unknown>>,
  existing: unknown,
): Record<string, unknown> {
  const previous = unknownRecord(existing);
  return {
    ...incoming,
    ...(Array.isArray(previous.watchOptions)
      ? { watchOptions: previous.watchOptions }
      : {}),
    ...(Array.isArray(previous.rosterOverrides)
      ? { rosterOverrides: previous.rosterOverrides }
      : {}),
    ...(previous.professionalEditorial
      ? { professionalEditorial: previous.professionalEditorial }
      : {}),
    ...(previous.professionalResearch
      ? { professionalResearch: previous.professionalResearch }
      : {}),
  };
}

function hasTournamentDetail(payload: Record<string, unknown>): boolean {
  return (
    payload.detailLevel === "tournament" || Array.isArray(payload.teamEntries)
  );
}

export function mergeProfessionalEventPayload(input: {
  readonly incoming: Readonly<Record<string, unknown>>;
  readonly existing: unknown;
  readonly syncedAt: Date;
}): Record<string, unknown> {
  const previous = unknownRecord(input.existing);
  const incoming = unknownRecord(input.incoming);
  const incomingHasDetail = hasTournamentDetail(incoming);
  const retainsDetail = incomingHasDetail || hasTournamentDetail(previous);
  return preserveEditorialPayload(
    {
      ...previous,
      ...incoming,
      detailLevel: retainsDetail ? "tournament" : "index",
      ...(incomingHasDetail
        ? { detailSyncedAt: input.syncedAt.toISOString() }
        : {}),
    },
    previous,
  );
}

export interface FivbRefreshCandidate {
  readonly externalEventId: string;
  readonly live: boolean;
  readonly startsOn?: string | null;
  readonly rawPayload: unknown;
}

function detailSyncedAt(candidate: FivbRefreshCandidate): string {
  const value = unknownRecord(candidate.rawPayload).detailSyncedAt;
  return typeof value === "string" ? value : "";
}

export function selectFivbRefreshCandidates(
  rows: readonly FivbRefreshCandidate[],
  limit: number,
): readonly FivbRefreshCandidate[] {
  return [...rows]
    .sort((left, right) => {
      if (left.live !== right.live) return left.live ? -1 : 1;
      const leftDetail = hasTournamentDetail(unknownRecord(left.rawPayload));
      const rightDetail = hasTournamentDetail(unknownRecord(right.rawPayload));
      if (leftDetail !== rightDetail) return leftDetail ? 1 : -1;
      const detailOrder = detailSyncedAt(left).localeCompare(
        detailSyncedAt(right),
      );
      if (detailOrder !== 0) return detailOrder;
      const dateOrder = (left.startsOn ?? "9999-12-31").localeCompare(
        right.startsOn ?? "9999-12-31",
      );
      if (dateOrder !== 0) return dateOrder;
      return left.externalEventId.localeCompare(right.externalEventId);
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function inferHistoricalPersonId(input: {
  readonly displayName: string;
  readonly previous: readonly {
    readonly normalizedName: string;
    readonly personId: string;
  }[];
}): string | undefined {
  const normalizedName = normalizePersonName(input.displayName);
  const personIds = new Set(
    input.previous
      .filter((profile) => profile.normalizedName === normalizedName)
      .map((profile) => profile.personId),
  );
  return personIds.size === 1 ? [...personIds][0] : undefined;
}

export function shouldCreateUnclaimedSourceProfile(input: {
  readonly source: SandDataSource;
  readonly displayName: string;
  readonly candidateCount: number;
}): boolean {
  if (input.source === "volleyball-world" || input.candidateCount > 0) {
    return false;
  }
  if (
    input.source === "avp-league" &&
    normalizePersonName(input.displayName).split(" ").length < 2
  ) {
    return false;
  }
  return true;
}

export function shouldAutoLinkProfessionalSource(input: {
  readonly source: SandDataSource;
  readonly externalName: string;
  readonly candidateName: string;
  readonly candidateClaimStatus: string;
  readonly scoreBps: number;
  readonly tied: boolean;
  readonly isProfessional: boolean;
}): boolean {
  return (
    (input.source === "bvbinfo" || input.source === "volleyball-life") &&
    input.isProfessional &&
    !input.tied &&
    input.scoreBps === 9_500 &&
    input.candidateClaimStatus === "unclaimed" &&
    normalizePersonName(input.externalName).split(" ").length >= 2 &&
    normalizePersonName(input.externalName) ===
      normalizePersonName(input.candidateName)
  );
}

function optionalSnapshotString(value: unknown): string | undefined {
  const normalized =
    typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : "";
  return normalized || undefined;
}

function sourceProfileSnapshot(
  profile: typeof externalPlayerProfiles.$inferSelect,
) {
  const raw = unknownRecord(profile.rawProfile);
  const finishes = unknownRecord(raw.finishes);
  const truVolley = unknownRecord(raw.truVolley);
  const tournamentRows = Array.isArray(finishes.tournaments)
    ? finishes.tournaments
    : Array.isArray(raw.tournaments)
      ? raw.tournaments
      : [];
  const memberships = Array.isArray(raw.memberships)
    ? raw.memberships.flatMap((membership) => {
        const value = optionalSnapshotString(membership);
        return value ? [value] : [];
      })
    : [];
  return {
    displayName: profile.displayName,
    profileUrl: profile.profileUrl,
    avatarUrl: profile.avatarUrl,
    hometown: profile.hometown,
    birthDate: profile.birthDate,
    isProfessional: profile.isProfessional,
    externalRating: profile.externalRating,
    externalRatingConfidence: profile.externalRatingConfidence,
    externalMatchCount: profile.externalMatchCount,
    height: optionalSnapshotString(raw.height),
    collegeName:
      optionalSnapshotString(raw.college) ??
      optionalSnapshotString(raw.committedSchool),
    clubName: optionalSnapshotString(raw.club),
    highSchool: optionalSnapshotString(raw.highSchool),
    memberships,
    eventFinishes: tournamentRows.length,
    truVolleyPeak:
      typeof truVolley.peak === "number" ? truVolley.peak : undefined,
  };
}

async function ensureSource(source: SandDataSource) {
  const database = getDatabase();
  await database
    .insert(importSources)
    .values({
      slug: source,
      name: sourceNames[source],
      licenseStatus: "operator-authorized",
    })
    .onConflictDoNothing();
  const row = await database.query.importSources.findFirst({
    where: eq(importSources.slug, source),
  });
  if (!row) throw new Error(`Could not initialize source ${source}`);
  return row;
}

function normalizeExternalConfidence(
  value: number | undefined,
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value > 1 ? Math.min(1, value / 100) : Math.max(0, value);
}

function storedCountryCode(value: string | undefined): string | undefined {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2,3}$/.test(code) ? code : undefined;
}

type PartnerIdentityReference = {
  readonly source: "bvbinfo" | "volleyball-life";
  readonly externalPersonId: string;
};

function partnerIdentityReferences(
  raw: Readonly<Record<string, unknown>>,
): readonly PartnerIdentityReference[] {
  const references: PartnerIdentityReference[] = [];
  const bvbInfoUrl = optionalSnapshotString(raw.bvbInfoUrl);
  const bvbInfoId = bvbInfoUrl?.match(/[?&]id=0*(\d+)/i)?.[1];
  if (bvbInfoId) {
    references.push({ source: "bvbinfo", externalPersonId: bvbInfoId });
  }
  const volleyballLifeUrl = optionalSnapshotString(raw.volleyballLifeUrl);
  const volleyballLifeId = volleyballLifeUrl?.match(
    /\/(?:player|playerprofile)\/0*(\d+)/i,
  )?.[1];
  if (volleyballLifeId) {
    references.push({
      source: "volleyball-life",
      externalPersonId: volleyballLifeId,
    });
  }
  return references;
}

async function persistExternalPlayers(input: {
  readonly source: SandDataSource;
  readonly sourceId: string;
  readonly players: readonly ExternalPlayerRecord[];
  readonly now: Date;
}): Promise<{
  readonly inserted: number;
  readonly linked: number;
  readonly suggested: number;
}> {
  const database = getDatabase();
  const [personRows, existingLinks, historicalProfiles, partnerIdentityLinks] =
    await Promise.all([
      database
        .select({
          id: people.id,
          displayName: people.displayName,
          handle: people.handle,
          profileClaimStatus: people.profileClaimStatus,
          isProfessional: people.isProfessional,
          genderCategory: people.genderCategory,
        })
        .from(people)
        .where(ne(people.status, "deleted")),
      database
        .select()
        .from(importLinks)
        .where(eq(importLinks.sourceId, input.sourceId)),
      database
        .select({
          normalizedName: externalPlayerProfiles.normalizedName,
          personId: externalPlayerProfiles.personId,
        })
        .from(externalPlayerProfiles)
        .innerJoin(people, eq(externalPlayerProfiles.personId, people.id))
        .where(
          and(
            eq(externalPlayerProfiles.sourceId, input.sourceId),
            eq(externalPlayerProfiles.mappingState, "linked"),
            ne(people.status, "deleted"),
            sql`${externalPlayerProfiles.personId} IS NOT NULL`,
          ),
        ),
      database
        .select({
          source: importSources.slug,
          externalPersonId: importLinks.externalPersonId,
          personId: importLinks.personId,
        })
        .from(importLinks)
        .innerJoin(importSources, eq(importLinks.sourceId, importSources.id))
        .where(
          and(
            inArray(importSources.slug, ["bvbinfo", "volleyball-life"]),
            eq(importLinks.resolutionState, "linked"),
            sql`${importLinks.personId} IS NOT NULL`,
          ),
        ),
    ]);
  const reusableHistoricalProfiles = historicalProfiles.flatMap((profile) =>
    profile.personId
      ? [
          {
            normalizedName: profile.normalizedName,
            personId: profile.personId,
          },
        ]
      : [],
  );
  const linkByExternalId = new Map(
    existingLinks.map((link) => [link.externalPersonId, link] as const),
  );
  const partnerPersonByExternalId = new Map(
    partnerIdentityLinks.flatMap((link) =>
      link.personId
        ? [[`${link.source}:${link.externalPersonId}`, link.personId] as const]
        : [],
    ),
  );
  let inserted = 0;
  let linked = 0;
  let suggested = 0;
  const newPeople: (typeof people.$inferInsert)[] = [];
  const unclaimedPeopleUpdates: {
    readonly personId: string;
    readonly external: ExternalPlayerRecord;
  }[] = [];
  const externalProfiles: (typeof externalPlayerProfiles.$inferInsert)[] = [];
  const sourceLinks: (typeof importLinks.$inferInsert)[] = [];

  for (const external of input.players) {
    if (!external.externalPersonId || !external.displayName) continue;
    const existingLink = linkByExternalId.get(external.externalPersonId);
    let personId =
      existingLink?.resolutionState === "linked"
        ? (existingLink.personId ?? undefined)
        : undefined;
    let mappingState = personId ? "linked" : "unresolved";
    let mappingScoreBps = personId ? 10_000 : undefined;
    let evidence: Record<string, unknown> = personId
      ? { method: "existing-source-id" }
      : {};
    let partnerIdentityConflict = false;

    if (
      personId &&
      input.source === "sandrating" &&
      external.raw.rankingStub === true &&
      external.genderCategory
    ) {
      const existingPerson = personRows.find(
        (candidate) => candidate.id === personId,
      );
      if (
        existingPerson?.profileClaimStatus === "unclaimed" &&
        existingPerson.genderCategory &&
        existingPerson.genderCategory !== external.genderCategory
      ) {
        personId = undefined;
        mappingState = "unresolved";
        mappingScoreBps = undefined;
        evidence = {
          method: "detached-cross-division-ranking-stub",
          previousPersonId: existingPerson.id,
          previousGenderCategory: existingPerson.genderCategory,
          incomingGenderCategory: external.genderCategory,
        };
      }
    }

    if (!personId && input.source === "sandrating") {
      const references = partnerIdentityReferences(external.raw);
      const partnerPersonIds = new Set(
        references.flatMap((reference) => {
          const candidate = partnerPersonByExternalId.get(
            `${reference.source}:${reference.externalPersonId}`,
          );
          return candidate ? [candidate] : [];
        }),
      );
      if (partnerPersonIds.size === 1) {
        personId = [...partnerPersonIds][0];
        mappingState = "linked";
        mappingScoreBps = 9_980;
        evidence = {
          method: "partner-source-id",
          references,
        };
      } else if (partnerPersonIds.size > 1) {
        partnerIdentityConflict = true;
        evidence = {
          method: "conflicting-partner-source-ids",
          references,
          candidatePersonIds: [...partnerPersonIds],
        };
      }
    }

    if (
      !personId &&
      !partnerIdentityConflict &&
      external.raw.rankingStub !== true
    ) {
      const historicalPersonId = inferHistoricalPersonId({
        displayName: external.displayName,
        previous: reusableHistoricalProfiles,
      });
      if (historicalPersonId) {
        personId = historicalPersonId;
        mappingState = "linked";
        mappingScoreBps = 9_900;
        evidence = {
          method: "same-source-name-history",
          normalizedName: normalizePersonName(external.displayName),
        };
      }
    }

    if (!personId && !partnerIdentityConflict) {
      const candidates = personRows
        .map((candidate) => ({
          candidate,
          score: matchMappingConfidence({
            externalIdMatched: false,
            externalName: external.displayName,
            candidateName: candidate.displayName,
          }),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);
      const best = candidates[0];
      const tied =
        best &&
        candidates.filter((candidate) => candidate.score === best.score)
          .length > 1;
      const createClaimableRankingSeed =
        input.source === "sandrating" && external.raw.rankingSeed === true;
      if (
        best &&
        shouldAutoLinkProfessionalSource({
          source: input.source,
          externalName: external.displayName,
          candidateName: best.candidate.displayName,
          candidateClaimStatus: best.candidate.profileClaimStatus,
          scoreBps: best.score,
          tied: Boolean(tied),
          isProfessional: external.isProfessional === true,
        })
      ) {
        personId = best.candidate.id;
        mappingState = "linked";
        mappingScoreBps = 9_850;
        evidence = {
          method: "professional-exact-name-unclaimed",
          candidatePersonId: best.candidate.id,
          candidateHandle: best.candidate.handle,
          candidateDisplayName: best.candidate.displayName,
          source: input.source,
        };
        linked += 1;
      } else if (
        best &&
        !tied &&
        input.source === "sandrating" &&
        best.score === 9_500 &&
        best.candidate.profileClaimStatus === "unclaimed" &&
        external.raw.rankingStub !== true &&
        (!external.genderCategory ||
          !best.candidate.genderCategory ||
          external.genderCategory === best.candidate.genderCategory)
      ) {
        personId = best.candidate.id;
        mappingState = "linked";
        mappingScoreBps = 9_700;
        evidence = {
          method: "partner-exact-name-unclaimed",
          candidatePersonId: best.candidate.id,
          candidateHandle: best.candidate.handle,
          candidateDisplayName: best.candidate.displayName,
        };
        linked += 1;
      } else if (best && !tied && !createClaimableRankingSeed) {
        mappingState = "suggested";
        mappingScoreBps = best.score;
        evidence = {
          method: "normalized-name",
          candidatePersonId: best.candidate.id,
          candidateHandle: best.candidate.handle,
          candidateDisplayName: best.candidate.displayName,
        };
        suggested += 1;
      } else if (tied && !createClaimableRankingSeed) {
        evidence = {
          method: "ambiguous-name",
          candidates: candidates.slice(0, 5).map(({ candidate, score }) => ({
            personId: candidate.id,
            displayName: candidate.displayName,
            handle: candidate.handle,
            scoreBps: score,
          })),
        };
      } else if (
        createClaimableRankingSeed ||
        shouldCreateUnclaimedSourceProfile({
          source: input.source,
          displayName: external.displayName,
          candidateCount: candidates.length,
        })
      ) {
        const handle = safeExternalHandle(
          input.source,
          external.externalPersonId,
        );
        personId = crypto.randomUUID();
        newPeople.push({
          id: personId,
          displayName: external.displayName,
          handle,
          avatarUrl: external.avatarUrl,
          profileClaimStatus: "unclaimed",
          isProfessional: external.isProfessional ?? false,
          professionalDefinition: external.isProfessional
            ? `Imported verified professional competition identity from ${sourceNames[input.source]}.`
            : undefined,
          genderCategory: external.genderCategory,
          birthDate: external.birthDate,
          homeMarket: external.hometown,
          profileVisibility: external.isProfessional ? "public" : "private",
          ageBand: "unknown",
          isMinor: false,
          status: "active",
          createdAt: input.now,
          updatedAt: input.now,
        });
        if (personId) {
          mappingState = "linked";
          mappingScoreBps = 10_000;
          evidence = createClaimableRankingSeed
            ? {
                method: "created-unclaimed-ranking-seed",
                reviewCandidates: candidates
                  .slice(0, 5)
                  .map(({ candidate, score }) => ({
                    personId: candidate.id,
                    displayName: candidate.displayName,
                    handle: candidate.handle,
                    scoreBps: score,
                  })),
              }
            : { method: "created-unclaimed-source-profile" };
          personRows.push({
            id: personId,
            displayName: external.displayName,
            handle,
            profileClaimStatus: "unclaimed",
            isProfessional: external.isProfessional ?? false,
            genderCategory: external.genderCategory ?? null,
          });
          inserted += 1;
          linked += 1;
        }
      } else if (input.source === "avp-league") {
        evidence = {
          method: "insufficient-name-evidence",
          searchQuery: external.displayName,
        };
      }
    } else if (personId) {
      linked += 1;
    }

    const linkedPerson = personId
      ? personRows.find((person) => person.id === personId)
      : undefined;
    if (personId && linkedPerson?.profileClaimStatus === "unclaimed") {
      unclaimedPeopleUpdates.push({ personId, external });
      if (external.genderCategory) {
        linkedPerson.genderCategory = external.genderCategory;
      }
    }

    externalProfiles.push({
      sourceId: input.sourceId,
      externalPersonId: external.externalPersonId,
      personId,
      displayName: external.displayName,
      normalizedName: normalizePersonName(external.displayName),
      profileUrl: external.profileUrl,
      hometown: external.hometown,
      countryCode: storedCountryCode(external.countryCode),
      birthDate: external.birthDate,
      avatarUrl: external.avatarUrl,
      mappingState,
      mappingScoreBps,
      mappingEvidence: evidence,
      isProfessional: external.isProfessional ?? false,
      externalRating: external.externalRating,
      externalRatingConfidence: normalizeExternalConfidence(
        external.externalRatingConfidence,
      ),
      externalMatchCount: external.externalMatchCount,
      rawProfile: external.raw,
      lastSeenAt: input.now,
      lastImportedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
    sourceLinks.push({
      sourceId: input.sourceId,
      externalPersonId: external.externalPersonId,
      personId,
      resolutionScoreBps: mappingScoreBps,
      resolutionState: mappingState,
      evidence,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  for (let offset = 0; offset < newPeople.length; offset += 250) {
    await database
      .insert(people)
      .values(newPeople.slice(offset, offset + 250))
      .onConflictDoNothing();
  }
  for (let offset = 0; offset < unclaimedPeopleUpdates.length; offset += 50) {
    const statements = unclaimedPeopleUpdates
      .slice(offset, offset + 50)
      .map(({ personId, external }) =>
        database
          .update(people)
          .set({
            displayName: external.displayName,
            ...(external.avatarUrl ? { avatarUrl: external.avatarUrl } : {}),
            ...(external.birthDate ? { birthDate: external.birthDate } : {}),
            ...(external.hometown ? { homeMarket: external.hometown } : {}),
            ...(external.genderCategory
              ? { genderCategory: external.genderCategory }
              : {}),
            ...(external.isProfessional
              ? {
                  isProfessional: true,
                  profileVisibility: "public" as const,
                  professionalDefinition: `Imported verified professional competition identity from ${sourceNames[input.source]}.`,
                }
              : {}),
            updatedAt: input.now,
          })
          .where(eq(people.id, personId)),
      );
    const [first, ...rest] = statements;
    if (first) await database.batch([first, ...rest]);
  }
  for (let offset = 0; offset < externalProfiles.length; offset += 50) {
    const statements = externalProfiles
      .slice(offset, offset + 50)
      .map((profile) =>
        database
          .insert(externalPlayerProfiles)
          .values(profile)
          .onConflictDoUpdate({
            target: [
              externalPlayerProfiles.sourceId,
              externalPlayerProfiles.externalPersonId,
            ],
            set: {
              personId: profile.personId,
              displayName: profile.displayName,
              normalizedName: profile.normalizedName,
              profileUrl: profile.profileUrl,
              hometown: profile.hometown,
              countryCode: profile.countryCode,
              birthDate: profile.birthDate,
              avatarUrl: profile.avatarUrl,
              mappingState: profile.mappingState,
              mappingScoreBps: profile.mappingScoreBps,
              mappingEvidence: profile.mappingEvidence,
              isProfessional: profile.isProfessional,
              externalRating: profile.externalRating,
              externalRatingConfidence: profile.externalRatingConfidence,
              externalMatchCount: profile.externalMatchCount,
              rawProfile: profile.rawProfile,
              lastSeenAt: profile.lastSeenAt,
              lastImportedAt: profile.lastImportedAt,
              updatedAt: input.now,
            },
          }),
      );
    const [first, ...rest] = statements;
    if (first) await database.batch([first, ...rest]);
  }
  for (let offset = 0; offset < sourceLinks.length; offset += 50) {
    const statements = sourceLinks.slice(offset, offset + 50).map((link) =>
      database
        .insert(importLinks)
        .values(link)
        .onConflictDoUpdate({
          target: [importLinks.sourceId, importLinks.externalPersonId],
          set: {
            personId: link.personId,
            resolutionScoreBps: link.resolutionScoreBps,
            resolutionState: link.resolutionState,
            evidence: link.evidence,
            updatedAt: input.now,
          },
        }),
    );
    const [first, ...rest] = statements;
    if (first) await database.batch([first, ...rest]);
  }
  return { inserted, linked, suggested };
}

async function resolvedPeopleByExternalId(
  sourceId: string,
): Promise<ReadonlyMap<string, string>> {
  const rows = await getDatabase()
    .select({
      externalPersonId: importLinks.externalPersonId,
      personId: importLinks.personId,
      resolutionState: importLinks.resolutionState,
    })
    .from(importLinks)
    .where(eq(importLinks.sourceId, sourceId));
  return new Map(
    rows.flatMap((row) =>
      row.personId && row.resolutionState === "linked"
        ? [[row.externalPersonId, row.personId] as const]
        : [],
    ),
  );
}

function hasDecisiveImportedScore(
  sets: readonly { readonly a: number; readonly b: number }[],
  winnerSide: string | null | undefined,
): boolean {
  if (sets.length === 0 || (winnerSide !== "A" && winnerSide !== "B")) {
    return false;
  }
  try {
    const evidence = performanceEvidenceFromSetScores(sets);
    return (evidence.actualTeamA > 0.5 ? "A" : "B") === winnerSide;
  } catch {
    return false;
  }
}

async function persistImportedMatches(input: {
  readonly result: SourceImportResult;
  readonly sourceId: string;
  readonly runId: string;
  readonly now: Date;
}): Promise<{
  readonly staged: number;
  readonly ready: number;
  readonly needsMapping: number;
  readonly duplicates: number;
  readonly approved: number;
}> {
  const database = getDatabase();
  const peopleByExternalId = await resolvedPeopleByExternalId(input.sourceId);
  let staged = 0;
  let ready = 0;
  let needsMapping = 0;
  let duplicates = 0;
  let approved = 0;
  const storedMatches = await database.select().from(importedMatches);
  const existingByExternalId = new Map(
    storedMatches
      .filter((match) => match.sourceId === input.sourceId)
      .map((match) => [match.externalMatchId, match] as const),
  );
  const matchesByCrossFingerprint = new Map<
    string,
    (typeof storedMatches)[number][]
  >();
  for (const match of storedMatches) {
    const rows =
      matchesByCrossFingerprint.get(match.crossSourceFingerprint) ?? [];
    rows.push(match);
    matchesByCrossFingerprint.set(match.crossSourceFingerprint, rows);
  }
  const incomingByCrossFingerprint = new Map<
    string,
    {
      readonly id: string;
      readonly sourceId: string;
      readonly externalMatchId: string;
      readonly canonicalMatchId: null;
      readonly importState: string;
    }
  >();
  const pendingMatches: (typeof importedMatches.$inferInsert)[] = [];
  const avpRosterOverrides =
    input.result.source === "avp-league"
      ? [
          ...new Map(
            (
              await database
                .select({ rawPayload: professionalEvents.rawPayload })
                .from(professionalEvents)
                .where(eq(professionalEvents.sourceId, input.sourceId))
            )
              .flatMap((event) => {
                const raw = unknownRecord(event.rawPayload);
                return Array.isArray(raw.rosterOverrides)
                  ? raw.rosterOverrides
                  : [];
              })
              .map((candidate) => {
                const override = unknownRecord(candidate);
                return [
                  optionalSnapshotString(override.id) ?? stableHash(override),
                  override,
                ] as const;
              }),
          ).values(),
        ]
      : [];

  for (const sourceMatch of input.result.matches) {
    const raw = unknownRecord(sourceMatch.raw);
    const matchDate = sourceMatch.playedAt?.slice(0, 10);
    const appliedAssignmentIds: string[] = [];
    let effectiveParticipants = [...sourceMatch.participants];
    for (const override of avpRosterOverrides) {
      const season = optionalNumber(override.season);
      const gender = optionalSnapshotString(override.gender);
      const teamName = optionalSnapshotString(override.teamName);
      const externalPersonId = optionalSnapshotString(
        override.externalPersonId,
      );
      const replacesExternalPersonId = optionalSnapshotString(
        override.replacesExternalPersonId,
      );
      const displayName = optionalSnapshotString(override.displayName);
      if (
        season !== optionalNumber(raw.season) ||
        gender !== optionalSnapshotString(raw.gender) ||
        !teamName ||
        !externalPersonId ||
        !replacesExternalPersonId ||
        !displayName ||
        (optionalSnapshotString(override.effectiveFrom) &&
          matchDate &&
          matchDate < optionalSnapshotString(override.effectiveFrom)!) ||
        (optionalSnapshotString(override.effectiveTo) &&
          matchDate &&
          matchDate > optionalSnapshotString(override.effectiveTo)!)
      ) {
        continue;
      }
      const side =
        normalizePersonName(optionalSnapshotString(raw.teamAName) ?? "") ===
        normalizePersonName(teamName)
          ? "A"
          : normalizePersonName(optionalSnapshotString(raw.teamBName) ?? "") ===
              normalizePersonName(teamName)
            ? "B"
            : undefined;
      if (!side) continue;
      let replaced = false;
      effectiveParticipants = effectiveParticipants.map((participant) => {
        if (
          participant.side === side &&
          participant.externalPersonId === replacesExternalPersonId
        ) {
          replaced = true;
          return {
            ...participant,
            externalPersonId,
            name: displayName,
          };
        }
        return participant;
      });
      if (replaced) {
        appliedAssignmentIds.push(
          optionalSnapshotString(override.id) ?? stableHash(override),
        );
      }
    }
    const match: ExternalMatchRecord =
      appliedAssignmentIds.length > 0
        ? {
            ...sourceMatch,
            participants: effectiveParticipants,
            raw: {
              ...sourceMatch.raw,
              rosterAssignmentIds: appliedAssignmentIds,
            },
          }
        : sourceMatch;
    if (match.participants.length !== 4) continue;
    const sourceFingerprint = sourceMatchFingerprint(
      input.result.source,
      match,
    );
    const crossFingerprint = crossSourceMatchFingerprint(match);
    const existing = existingByExternalId.get(match.externalMatchId);
    const crossCandidates = [
      ...(matchesByCrossFingerprint.get(crossFingerprint) ?? []),
      ...(() => {
        const incoming = incomingByCrossFingerprint.get(crossFingerprint);
        return incoming ? [incoming] : [];
      })(),
    ];
    const sameSourceCandidates = crossCandidates.filter(
      (candidate) =>
        candidate.sourceId === input.sourceId &&
        candidate.externalMatchId !== match.externalMatchId,
    );
    const duplicateWinnerExternalId = [
      match.externalMatchId,
      ...sameSourceCandidates.map((candidate) => candidate.externalMatchId),
    ].sort((left, right) => {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      return Number.isSafeInteger(leftNumber) &&
        Number.isSafeInteger(rightNumber)
        ? leftNumber - rightNumber
        : left.localeCompare(right);
    })[0];
    const sameSourceDuplicate =
      duplicateWinnerExternalId === match.externalMatchId
        ? undefined
        : sameSourceCandidates.find(
            (candidate) =>
              candidate.externalMatchId === duplicateWinnerExternalId,
          );
    const approvedCrossSourceDuplicate = crossCandidates.find(
      (candidate) =>
        candidate.sourceId !== input.sourceId &&
        Boolean(
          candidate.canonicalMatchId || candidate.importState === "approved",
        ),
    );
    const distinctDuplicate =
      sameSourceDuplicate ?? approvedCrossSourceDuplicate;
    const shouldMarkDuplicate = Boolean(distinctDuplicate);
    const participants = match.participants.map((participant) => ({
      ...participant,
      personId: peopleByExternalId.get(participant.externalPersonId),
    }));
    const allMapped = participants.every((participant) => participant.personId);
    const complete = hasDecisiveImportedScore(match.sets, match.winnerSide);
    const hasSourceDate = Boolean(match.playedAt);
    const importState =
      existing?.importState === "approved"
        ? "approved"
        : shouldMarkDuplicate
          ? "duplicate"
          : complete && allMapped && hasSourceDate
            ? "ready"
            : complete && !allMapped
              ? "needs-mapping"
              : "staged";
    const storedMatch = {
      id: existing?.id ?? crypto.randomUUID(),
      sourceId: input.sourceId,
      ingestionRunId: input.runId,
      externalMatchId: match.externalMatchId,
      externalEventId: match.externalEventId,
      sourceUrl: match.sourceUrl,
      sourceFingerprint,
      crossSourceFingerprint: crossFingerprint,
      title: match.title,
      roundLabel: match.roundLabel,
      location: match.location,
      genderCategory: match.genderCategory,
      playedAt: match.playedAt ? new Date(match.playedAt) : undefined,
      participants,
      sets: match.sets,
      winnerSide: match.winnerSide,
      importState,
      exclusionReason:
        !hasSourceDate && !shouldMarkDuplicate
          ? "Missing or invalid source match date."
          : undefined,
      possibleDuplicateOfId: distinctDuplicate?.id,
      rawPayload: preserveEditorialPayload(match.raw, existing?.rawPayload),
      createdAt: input.now,
      updatedAt: input.now,
    } satisfies typeof importedMatches.$inferInsert;
    pendingMatches.push(storedMatch);
    incomingByCrossFingerprint.set(crossFingerprint, {
      id: storedMatch.id!,
      sourceId: input.sourceId,
      externalMatchId: match.externalMatchId,
      canonicalMatchId: null,
      importState,
    });
    if (importState === "approved") approved += 1;
    else if (importState === "ready") ready += 1;
    else if (importState === "needs-mapping") needsMapping += 1;
    else if (importState === "duplicate") duplicates += 1;
    else staged += 1;
  }
  for (let offset = 0; offset < pendingMatches.length; offset += 50) {
    const statements = pendingMatches.slice(offset, offset + 50).map((match) =>
      database
        .insert(importedMatches)
        .values(match)
        .onConflictDoUpdate({
          target: [importedMatches.sourceId, importedMatches.externalMatchId],
          set: {
            ingestionRunId: match.ingestionRunId,
            externalEventId: match.externalEventId,
            sourceUrl: match.sourceUrl,
            sourceFingerprint: match.sourceFingerprint,
            crossSourceFingerprint: match.crossSourceFingerprint,
            title: match.title,
            roundLabel: match.roundLabel,
            location: match.location,
            genderCategory: match.genderCategory,
            playedAt: match.playedAt,
            participants: match.participants,
            sets: match.sets,
            winnerSide: match.winnerSide,
            importState: match.importState,
            exclusionReason: match.exclusionReason,
            possibleDuplicateOfId: match.possibleDuplicateOfId,
            rawPayload: match.rawPayload,
            updatedAt: input.now,
          },
        }),
    );
    const [first, ...rest] = statements;
    if (first) await database.batch([first, ...rest]);
  }
  return { staged, ready, needsMapping, duplicates, approved };
}

async function persistProfessionalEvents(input: {
  readonly result: SourceImportResult;
  readonly sourceId: string;
  readonly now: Date;
}): Promise<number> {
  const database = getDatabase();
  for (const event of input.result.events ?? []) {
    const existing = await database.query.professionalEvents.findFirst({
      where: and(
        eq(professionalEvents.sourceId, input.sourceId),
        eq(professionalEvents.externalEventId, event.externalEventId),
      ),
    });
    const incomingHasDetail = hasTournamentDetail(unknownRecord(event.raw));
    const isFivbIndexEvent =
      input.result.source === "fivb-12ndr" && !incomingHasDetail;
    const rawPayload =
      input.result.source === "fivb-12ndr"
        ? mergeProfessionalEventPayload({
            incoming: event.raw,
            existing: existing?.rawPayload,
            syncedAt: input.now,
          })
        : preserveEditorialPayload(event.raw, existing?.rawPayload);
    const teamCount =
      isFivbIndexEvent && event.teamCount === 0
        ? (existing?.teamCount ?? 0)
        : Math.floor(event.teamCount);
    const matchCount =
      isFivbIndexEvent && event.matchCount === 0
        ? (existing?.matchCount ?? 0)
        : event.matchCount;
    await database
      .insert(professionalEvents)
      .values({
        sourceId: input.sourceId,
        externalEventId: event.externalEventId,
        sourceUrl: event.sourceUrl,
        name: event.name,
        location: event.location,
        countryCode: storedCountryCode(event.countryCode),
        category: event.category,
        genderCategory: event.genderCategory,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        status: event.status,
        live: event.live,
        teamCount,
        matchCount,
        rawPayload,
        lastSyncedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          professionalEvents.sourceId,
          professionalEvents.externalEventId,
        ],
        set: {
          sourceUrl: event.sourceUrl,
          name: event.name,
          location: event.location,
          countryCode: storedCountryCode(event.countryCode),
          category: event.category,
          genderCategory: event.genderCategory,
          startsOn: event.startsOn,
          endsOn: event.endsOn,
          status: event.status,
          live: event.live,
          teamCount,
          matchCount,
          rawPayload,
          lastSyncedAt: input.now,
          updatedAt: input.now,
        },
      });
  }
  return input.result.events?.length ?? 0;
}

async function persistWorldRankings(input: {
  readonly result: SourceImportResult;
  readonly sourceId: string;
  readonly now: Date;
}): Promise<number> {
  const database = getDatabase();
  const peopleByExternalId = await resolvedPeopleByExternalId(input.sourceId);
  const rankingByIdentity = new Map(
    (input.result.rankings ?? []).map((ranking) => [
      `${ranking.rankingDate}:${ranking.genderCategory}:${ranking.externalPersonId}`,
      ranking,
    ]),
  );
  const rankingRows = dedupeWorldRankingRows(
    [...rankingByIdentity.values()].map((ranking) => ({
      sourceId: input.sourceId,
      rankingDate: ranking.rankingDate,
      genderCategory: ranking.genderCategory,
      rank: ranking.rank,
      points: ranking.points,
      externalPersonId: ranking.externalPersonId,
      displayName: ranking.displayName,
      countryCode: storedCountryCode(ranking.countryCode),
      personId: peopleByExternalId.get(ranking.externalPersonId),
      previousRank: ranking.previousRank,
      rawPayload: ranking.raw,
      createdAt: input.now,
    })),
  );
  if (rankingRows.length === 0) return 0;
  const snapshotKeys = new Map(
    rankingRows.map((ranking) => [
      `${ranking.rankingDate}:${ranking.genderCategory}`,
      {
        rankingDate: ranking.rankingDate,
        genderCategory: ranking.genderCategory,
      },
    ]),
  );
  const insertStatements = [];
  for (let offset = 0; offset < rankingRows.length; offset += 250) {
    insertStatements.push(
      database
        .insert(worldRankings)
        .values(rankingRows.slice(offset, offset + 250)),
    );
  }
  const statements = [
    ...[...snapshotKeys.values()].map((snapshot) =>
      database
        .delete(worldRankings)
        .where(
          and(
            eq(worldRankings.sourceId, input.sourceId),
            eq(worldRankings.rankingDate, snapshot.rankingDate),
            eq(worldRankings.genderCategory, snapshot.genderCategory),
          ),
        ),
    ),
    ...insertStatements,
  ];
  const [first, ...rest] = statements;
  if (first) await database.batch([first, ...rest]);
  return rankingRows.length;
}

async function executeImport(input: {
  readonly source: SandDataSource;
  readonly mode: string;
  readonly requestedExternalId?: string;
  readonly actor?: ApiActor;
  readonly now: Date;
  readonly loader: () => Promise<SourceImportResult>;
}) {
  requireDatabase();
  const database = getDatabase();
  const source = await ensureSource(input.source);
  const [run] = await database
    .insert(sandIngestionRuns)
    .values({
      sourceId: source.id,
      mode: input.mode,
      requestedExternalId: input.requestedExternalId,
      engine:
        input.source === "avp-league"
          ? "firecrawl"
          : input.source === "volleyball-life" ||
              input.source === "sandrating" ||
              input.source === "volleyball-world"
            ? "native"
            : process.env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_API
              ? "firecrawl"
              : "native",
      createdByPersonId: input.actor?.personId,
      startedAt: input.now,
      createdAt: input.now,
    })
    .returning();
  if (!run) throw new Error("Could not create ingestion run");

  try {
    const result = await input.loader();
    const playerCounts = await persistExternalPlayers({
      source: input.source,
      sourceId: source.id,
      players: result.players,
      now: input.now,
    });
    const [matchCounts, eventCount, rankingCount] = await Promise.all([
      persistImportedMatches({
        result,
        sourceId: source.id,
        runId: run.id,
        now: input.now,
      }),
      persistProfessionalEvents({
        result,
        sourceId: source.id,
        now: input.now,
      }),
      persistWorldRankings({
        result,
        sourceId: source.id,
        now: input.now,
      }),
    ]);
    const counters = {
      players: result.players.length,
      playerProfilesCreated: playerCounts.inserted,
      playerLinks: playerCounts.linked,
      mappingSuggestions: playerCounts.suggested,
      matches: result.matches.length,
      staged: matchCounts.staged,
      ready: matchCounts.ready,
      needsMapping: matchCounts.needsMapping,
      duplicates: matchCounts.duplicates,
      approved: matchCounts.approved,
      events: eventCount,
      rankings: rankingCount,
    };
    const objectiveStatus = unknownRecord(result.checkpoint).objectiveStatus;
    const runStatus =
      objectiveStatus === "partial" || objectiveStatus === "degraded"
        ? ("partial" as const)
        : ("succeeded" as const);
    await database.batch([
      database
        .update(sandIngestionRuns)
        .set({
          status: runStatus,
          requestedUrl: result.requestedUrl,
          counters,
          checkpoint: result.checkpoint ?? {},
          completedAt: input.now,
        })
        .where(eq(sandIngestionRuns.id, run.id)),
      database
        .update(importSources)
        .set({ latestImportedAt: input.now, updatedAt: input.now })
        .where(eq(importSources.id, source.id)),
      database.insert(auditLog).values({
        actorPersonId: input.actor?.personId,
        actorType: input.actor ? "person" : "system",
        action: "sand-data.import.completed",
        entityType: "sand-ingestion-run",
        entityId: run.id,
        afterHash: stableHash(counters),
        reason: `${source.name} import completed into the staged evidence pipeline with ${String(objectiveStatus || "met")} objective coverage.`,
        traceId: run.id,
        createdAt: input.now,
      }),
    ]);
    if (input.source === "fivb-12ndr" || input.source === "avp-league") {
      const externalEventIds = [
        ...new Set(
          result.matches.flatMap((match) =>
            match.externalEventId ? [match.externalEventId] : [],
          ),
        ),
      ];
      await publishImportedProfessionalActivities({
        sourceId: source.id,
        externalEventIds,
        now: input.now,
      }).catch(() => undefined);
    }
    return { runId: run.id, status: runStatus, counters };
  } catch (error) {
    const upstream = error instanceof SandDataUpstreamError ? error : undefined;
    await database
      .update(sandIngestionRuns)
      .set({
        status: upstream ? "unavailable" : "failed",
        errorKind: upstream?.kind ?? "internal",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : String(error),
        completedAt: input.now,
      })
      .where(eq(sandIngestionRuns.id, run.id));
    if (upstream) {
      throw new SandDataServiceError("SOURCE_UNAVAILABLE", upstream.message);
    }
    throw error;
  }
}

export function importSandSource(input: {
  readonly source: "bvbinfo" | "volleyball-life" | "fivb-12ndr" | "avp-league";
  readonly externalId: string;
  readonly actor?: ApiActor;
  readonly now?: Date;
  readonly onProgress?: (
    progress: SourceImportProgress,
  ) => void | Promise<void>;
}) {
  const now = input.now ?? new Date();
  if (input.source === "bvbinfo") {
    return executeImport({
      source: input.source,
      mode: "player",
      requestedExternalId: input.externalId,
      actor: input.actor,
      now,
      loader: () => importBvbInfoPlayer(input.externalId, input.onProgress),
    });
  }
  if (input.source === "volleyball-life") {
    return executeImport({
      source: input.source,
      mode: "player",
      requestedExternalId: input.externalId,
      actor: input.actor,
      now,
      loader: () =>
        importVolleyballLifePlayer(input.externalId, input.onProgress),
    });
  }
  if (input.source === "avp-league") {
    const parsedSeason = Number.parseInt(input.externalId, 10);
    return executeImport({
      source: input.source,
      mode: "season",
      requestedExternalId: input.externalId,
      actor: input.actor,
      now,
      loader: () =>
        importAvpLeague(
          Number.isInteger(parsedSeason) ? parsedSeason : undefined,
        ),
    });
  }
  return executeImport({
    source: input.source,
    mode: "event",
    requestedExternalId: input.externalId,
    actor: input.actor,
    now,
    loader: () => importFivbTournament(input.externalId),
  });
}

export function refreshAvpLeague(input: {
  readonly season?: number;
  readonly actor?: ApiActor;
  readonly now?: Date;
}) {
  return importSandSource({
    source: "avp-league",
    externalId: String(input.season ?? new Date().getUTCFullYear()),
    actor: input.actor,
    now: input.now,
  });
}

export function refreshWorldRankings(input: {
  readonly actor?: ApiActor;
  readonly now?: Date;
}) {
  const now = input.now ?? new Date();
  return executeImport({
    source: "volleyball-world",
    mode: "ranking-snapshot",
    actor: input.actor,
    now,
    loader: () => importWorldRankings(),
  });
}

export function refreshSandRatingNetwork(input: {
  readonly maxDepth?: number;
  readonly topPlayersPerGender?: number;
  readonly actor?: ApiActor;
  readonly now?: Date;
  readonly onProgress?: (
    progress: SourceImportProgress,
  ) => void | Promise<void>;
}) {
  const now = input.now ?? new Date();
  const maxDepth = Math.min(4, Math.max(1, Math.floor(input.maxDepth ?? 4)));
  const topPlayersPerGender = Math.min(
    500,
    Math.max(1, Math.floor(input.topPlayersPerGender ?? 200)),
  );
  return executeImport({
    source: "sandrating",
    mode: "network-snapshot",
    requestedExternalId: `top-${topPlayersPerGender}:depth-${maxDepth}`,
    actor: input.actor,
    now,
    loader: () =>
      importSandRatingNetwork(
        { maxDepth, topPlayersPerGender },
        input.onProgress,
      ),
  });
}

export async function refreshFivbEventIndex(input: {
  readonly season?: number;
  readonly actor?: ApiActor;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const source = await ensureSource("fivb-12ndr");
  const events = await listFivbEvents(input.season);
  await persistProfessionalEvents({
    result: {
      source: "fivb-12ndr",
      players: [],
      matches: [],
      events,
    },
    sourceId: source.id,
    now,
  });
  await getDatabase()
    .insert(auditLog)
    .values({
      actorPersonId: input.actor?.personId,
      actorType: input.actor ? "person" : "system",
      action: "sand-data.fivb-index.refreshed",
      entityType: "import-source",
      entityId: source.id,
      afterHash: stableHash({ season: input.season, events: events.length }),
      reason: "FIVB professional event index refreshed.",
      createdAt: now,
    });
  return { events: events.length };
}

export async function refreshActiveFivbEvents(input: {
  readonly limit?: number;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const source = await ensureSource("fivb-12ndr");
  const rows = await getDatabase()
    .select({
      externalEventId: professionalEvents.externalEventId,
      live: professionalEvents.live,
      startsOn: professionalEvents.startsOn,
      rawPayload: professionalEvents.rawPayload,
    })
    .from(professionalEvents)
    .where(
      and(
        eq(professionalEvents.sourceId, source.id),
        inArray(professionalEvents.status, ["live", "upcoming"]),
      ),
    )
    .limit(250);
  const candidates = selectFivbRefreshCandidates(rows, input.limit ?? 4);
  const results: {
    readonly externalEventId: string;
    readonly status: "succeeded" | "failed";
    readonly message?: string;
  }[] = [];
  for (const row of candidates) {
    try {
      await importSandSource({
        source: "fivb-12ndr",
        externalId: row.externalEventId,
        now,
      });
      results.push({
        externalEventId: row.externalEventId,
        status: "succeeded",
      });
    } catch (error) {
      results.push({
        externalEventId: row.externalEventId,
        status: "failed",
        message: error instanceof Error ? error.message : "Refresh failed",
      });
    }
  }
  return {
    attempted: results.length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
    results,
  };
}

export async function loadSandDataOverview() {
  requireDatabase();
  const database = getDatabase();
  const [
    sources,
    runs,
    mappingRows,
    linkedMappingRows,
    imported,
    events,
    rankingDates,
    configurations,
    evaluations,
    backtests,
    claimReviewRows,
    truVolleyRows,
    historyDisputeRows,
    professionalMatchRows,
  ] = await Promise.all([
    database.select().from(importSources).orderBy(asc(importSources.name)),
    database
      .select()
      .from(sandIngestionRuns)
      .orderBy(desc(sandIngestionRuns.startedAt))
      .limit(20),
    database
      .select({
        id: externalPlayerProfiles.id,
        sourceId: externalPlayerProfiles.sourceId,
        externalPersonId: externalPlayerProfiles.externalPersonId,
        displayName: externalPlayerProfiles.displayName,
        profileUrl: externalPlayerProfiles.profileUrl,
        mappingState: externalPlayerProfiles.mappingState,
        mappingScoreBps: externalPlayerProfiles.mappingScoreBps,
        mappingEvidence: externalPlayerProfiles.mappingEvidence,
        personId: externalPlayerProfiles.personId,
        isProfessional: externalPlayerProfiles.isProfessional,
        rawProfile: externalPlayerProfiles.rawProfile,
      })
      .from(externalPlayerProfiles)
      .where(
        inArray(externalPlayerProfiles.mappingState, [
          "unresolved",
          "suggested",
        ]),
      )
      .orderBy(desc(externalPlayerProfiles.mappingScoreBps))
      .limit(100),
    database
      .select({
        id: externalPlayerProfiles.id,
        sourceId: externalPlayerProfiles.sourceId,
        externalPersonId: externalPlayerProfiles.externalPersonId,
        displayName: externalPlayerProfiles.displayName,
        profileUrl: externalPlayerProfiles.profileUrl,
        mappingScoreBps: externalPlayerProfiles.mappingScoreBps,
        mappingEvidence: externalPlayerProfiles.mappingEvidence,
        personId: externalPlayerProfiles.personId,
        rawProfile: externalPlayerProfiles.rawProfile,
        personDisplayName: people.displayName,
        personHandle: people.handle,
        updatedAt: externalPlayerProfiles.updatedAt,
      })
      .from(externalPlayerProfiles)
      .leftJoin(people, eq(externalPlayerProfiles.personId, people.id))
      .where(eq(externalPlayerProfiles.mappingState, "linked"))
      .orderBy(
        desc(
          sql`CASE WHEN ${externalPlayerProfiles.rawProfile}->>'source' = 'avp-league' THEN 1 ELSE 0 END`,
        ),
        desc(externalPlayerProfiles.updatedAt),
      )
      .limit(500),
    database
      .select({
        id: importedMatches.id,
        sourceId: importedMatches.sourceId,
        title: importedMatches.title,
        playedAt: importedMatches.playedAt,
        participants: importedMatches.participants,
        sets: importedMatches.sets,
        winnerSide: importedMatches.winnerSide,
        importState: importedMatches.importState,
        possibleDuplicateOfId: importedMatches.possibleDuplicateOfId,
      })
      .from(importedMatches)
      .where(
        inArray(importedMatches.importState, [
          "staged",
          "needs-mapping",
          "ready",
          "duplicate",
        ]),
      )
      .orderBy(desc(importedMatches.playedAt))
      .limit(100),
    database
      .select()
      .from(professionalEvents)
      .orderBy(desc(professionalEvents.live), desc(professionalEvents.startsOn))
      .limit(200),
    database
      .select({
        rankingDate: worldRankings.rankingDate,
        count: sql<number>`count(*)::int`,
      })
      .from(worldRankings)
      .groupBy(worldRankings.rankingDate)
      .orderBy(desc(worldRankings.rankingDate))
      .limit(5),
    database
      .select()
      .from(ratingConfigurations)
      .orderBy(desc(ratingConfigurations.createdAt))
      .limit(20),
    database
      .select()
      .from(ratingEvaluations)
      .orderBy(desc(ratingEvaluations.createdAt))
      .limit(20),
    database
      .select()
      .from(ratingBacktestRuns)
      .orderBy(desc(ratingBacktestRuns.createdAt))
      .limit(20),
    database
      .select()
      .from(workflowJobs)
      .where(
        and(
          eq(workflowJobs.kind, "sand.profile-claim-review"),
          eq(workflowJobs.status, "review-required"),
        ),
      )
      .orderBy(asc(workflowJobs.createdAt))
      .limit(100),
    database
      .select({
        personId: externalPlayerProfiles.personId,
        playerName: externalPlayerProfiles.displayName,
        sandRating: ratings.display,
        truVolleyRating: externalPlayerProfiles.externalRating,
        truVolleyConfidence: externalPlayerProfiles.externalRatingConfidence,
        truVolleyMatches: externalPlayerProfiles.externalMatchCount,
      })
      .from(externalPlayerProfiles)
      .innerJoin(
        importSources,
        eq(importSources.id, externalPlayerProfiles.sourceId),
      )
      .innerJoin(
        ratings,
        and(
          eq(ratings.personId, externalPlayerProfiles.personId),
          eq(ratings.discipline, "beach-2s"),
        ),
      )
      .where(
        and(
          eq(importSources.slug, "volleyball-life"),
          sql`${externalPlayerProfiles.personId} IS NOT NULL`,
          sql`${externalPlayerProfiles.externalRating} IS NOT NULL`,
        ),
      )
      .limit(1_000),
    database
      .select({
        id: matchHistoryDisputes.id,
        matchId: matchHistoryDisputes.matchId,
        personId: matchHistoryDisputes.personId,
        reporterName: people.displayName,
        reasonCode: matchHistoryDisputes.reasonCode,
        details: matchHistoryDisputes.details,
        status: matchHistoryDisputes.status,
        excludesFromRating: matchHistoryDisputes.excludesFromRating,
        createdAt: matchHistoryDisputes.createdAt,
        matchStatus: matches.status,
        title: importedMatches.title,
        playedAt: importedMatches.playedAt,
      })
      .from(matchHistoryDisputes)
      .innerJoin(people, eq(people.id, matchHistoryDisputes.personId))
      .innerJoin(matches, eq(matches.id, matchHistoryDisputes.matchId))
      .leftJoin(
        importedMatches,
        eq(importedMatches.canonicalMatchId, matches.id),
      )
      .where(eq(matchHistoryDisputes.status, "pending"))
      .orderBy(asc(matchHistoryDisputes.createdAt))
      .limit(100),
    database
      .select({
        id: importedMatches.id,
        sourceId: importedMatches.sourceId,
        externalEventId: importedMatches.externalEventId,
        title: importedMatches.title,
        roundLabel: importedMatches.roundLabel,
        playedAt: importedMatches.playedAt,
        participants: importedMatches.participants,
        rawPayload: importedMatches.rawPayload,
      })
      .from(importedMatches)
      .innerJoin(importSources, eq(importedMatches.sourceId, importSources.id))
      .where(
        and(
          inArray(importSources.slug, ["fivb-12ndr", "avp-league"]),
          sql`${importedMatches.externalEventId} IS NOT NULL`,
        ),
      )
      .orderBy(desc(importedMatches.playedAt))
      .limit(500),
  ]);
  const benchmarkPairs = truVolleyRows.flatMap((row) =>
    row.truVolleyRating === null
      ? []
      : [
          {
            personId: row.personId!,
            playerName: row.playerName,
            sandRating: row.sandRating,
            truVolleyRating: row.truVolleyRating,
            confidence: row.truVolleyConfidence ?? undefined,
            matches: row.truVolleyMatches ?? undefined,
          },
        ],
  );
  const sampleSize = benchmarkPairs.length;
  const mean = (values: readonly number[]) =>
    values.reduce((total, value) => total + value, 0) /
    Math.max(1, values.length);
  const sandMean = mean(benchmarkPairs.map((pair) => pair.sandRating));
  const truVolleyMean = mean(
    benchmarkPairs.map((pair) => pair.truVolleyRating),
  );
  const covariance = benchmarkPairs.reduce(
    (total, pair) =>
      total +
      (pair.sandRating - sandMean) * (pair.truVolleyRating - truVolleyMean),
    0,
  );
  const sandSpread = Math.sqrt(
    benchmarkPairs.reduce(
      (total, pair) => total + (pair.sandRating - sandMean) ** 2,
      0,
    ),
  );
  const truVolleySpread = Math.sqrt(
    benchmarkPairs.reduce(
      (total, pair) => total + (pair.truVolleyRating - truVolleyMean) ** 2,
      0,
    ),
  );
  const correlation =
    sampleSize > 1 && sandSpread > 0 && truVolleySpread > 0
      ? covariance / (sandSpread * truVolleySpread)
      : undefined;
  const meanAbsoluteDifference =
    sampleSize > 0
      ? mean(
          benchmarkPairs.map((pair) =>
            Math.abs(pair.sandRating - pair.truVolleyRating),
          ),
        )
      : undefined;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const linkedPlayerBySourceIdentity = new Map(
    linkedMappingRows.map((mapping) => [
      `${mapping.sourceId}:${mapping.externalPersonId}`,
      mapping.personId && mapping.personDisplayName && mapping.personHandle
        ? {
            id: mapping.personId,
            displayName: mapping.personDisplayName,
            handle: mapping.personHandle,
          }
        : undefined,
    ]),
  );
  const claimIdentities = claimReviewRows.map((job) => {
    const payload = unknownRecord(job.payload);
    return {
      job,
      payload,
      subjectPersonId:
        typeof payload.subjectPersonId === "string"
          ? payload.subjectPersonId
          : undefined,
      targetPersonId:
        typeof payload.targetPersonId === "string"
          ? payload.targetPersonId
          : undefined,
    };
  });
  const claimPersonIds = [
    ...new Set(
      claimIdentities.flatMap((claim) =>
        [claim.subjectPersonId, claim.targetPersonId].filter(
          (personId): personId is string => Boolean(personId),
        ),
      ),
    ),
  ];
  const claimPeople = claimPersonIds.length
    ? await database
        .select({
          id: people.id,
          displayName: people.displayName,
          handle: people.handle,
          isProfessional: people.isProfessional,
          profileClaimStatus: people.profileClaimStatus,
        })
        .from(people)
        .where(inArray(people.id, claimPersonIds))
    : [];
  const claimPersonById = new Map(
    claimPeople.map((person) => [person.id, person]),
  );
  return {
    sources: sources.map((source) => ({
      id: source.id,
      slug: source.slug,
      name: source.name,
      licenseStatus: source.licenseStatus,
      latestImportedAt: source.latestImportedAt?.toISOString(),
    })),
    runs: runs.map((run) => ({
      id: run.id,
      source: sourceById.get(run.sourceId)?.name ?? "Unknown source",
      mode: run.mode,
      status: run.status,
      engine: run.engine,
      counters: run.counters,
      errorKind: run.errorKind ?? undefined,
      errorMessage: run.errorMessage ?? undefined,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
    })),
    mappings: mappingRows.map((mapping) => ({
      ...mapping,
      source: sourceById.get(mapping.sourceId)?.name ?? "Unknown source",
      profileUrl: mapping.profileUrl ?? undefined,
      mappingScoreBps: mapping.mappingScoreBps ?? undefined,
      personId: mapping.personId ?? undefined,
      sourceContext: {
        season: optionalNumber(unknownRecord(mapping.rawProfile).season),
        teamName: optionalSnapshotString(
          unknownRecord(mapping.rawProfile).teamName,
        ),
        gender: optionalSnapshotString(
          unknownRecord(mapping.rawProfile).gender,
        ),
        role: optionalSnapshotString(unknownRecord(mapping.rawProfile).role),
      },
    })),
    linkedMappings: linkedMappingRows.map((mapping) => ({
      id: mapping.id,
      source: sourceById.get(mapping.sourceId)?.name ?? "Unknown source",
      externalPersonId: mapping.externalPersonId,
      displayName: mapping.displayName,
      profileUrl: mapping.profileUrl ?? undefined,
      mappingScoreBps: mapping.mappingScoreBps ?? undefined,
      mappingEvidence: mapping.mappingEvidence,
      personId: mapping.personId ?? undefined,
      currentPlayer:
        mapping.personId && mapping.personDisplayName && mapping.personHandle
          ? {
              id: mapping.personId,
              displayName: mapping.personDisplayName,
              handle: mapping.personHandle,
            }
          : undefined,
      sourceContext: {
        season: optionalNumber(unknownRecord(mapping.rawProfile).season),
        teamName: optionalSnapshotString(
          unknownRecord(mapping.rawProfile).teamName,
        ),
        gender: optionalSnapshotString(
          unknownRecord(mapping.rawProfile).gender,
        ),
        role: optionalSnapshotString(unknownRecord(mapping.rawProfile).role),
      },
      updatedAt: mapping.updatedAt.toISOString(),
    })),
    matches: imported.map((match) => ({
      ...match,
      playedAt: match.playedAt?.toISOString(),
      source: sourceById.get(match.sourceId)?.name ?? "Unknown source",
      possibleDuplicateOfId: match.possibleDuplicateOfId ?? undefined,
    })),
    events: events.map((event) => {
      const effective = effectiveProfessionalEvent(event);
      return {
        id: event.id,
        externalEventId: event.externalEventId,
        sourceSlug: sourceById.get(event.sourceId)?.slug ?? "unknown",
        sourceName: sourceById.get(event.sourceId)?.name ?? "Unknown source",
        sourceUrl: event.sourceUrl,
        publicPath: `/events/${professionalEventSlug(event)}`,
        name: effective.name,
        location: effective.location,
        countryCode: event.countryCode ?? undefined,
        category: effective.category,
        genderCategory: event.genderCategory,
        startsOn: effective.startsOn,
        endsOn: effective.endsOn,
        status: event.status,
        live: event.live,
        teamCount: event.teamCount,
        matchCount: event.matchCount,
        lastSyncedAt: event.lastSyncedAt.toISOString(),
        avpSeason: optionalNumber(unknownRecord(event.rawPayload).season),
        scraped: {
          name: event.name,
          location: event.location ?? undefined,
          category: event.category ?? undefined,
          startsOn: event.startsOn ?? undefined,
          endsOn: event.endsOn ?? undefined,
        },
        editorial: effective.editorial,
        research: professionalEventResearchFromPayload(event.rawPayload),
        watchOptions: watchOptionsFromPayload(event.rawPayload),
        matches: professionalMatchRows
          .filter(
            (match) =>
              match.sourceId === event.sourceId &&
              match.externalEventId === event.externalEventId,
          )
          .map((match) => ({
            id: match.id,
            label:
              match.participants
                .map((participant) => participant.name)
                .join(" / ") || match.title,
            roundLabel: match.roundLabel ?? undefined,
            playedAt: match.playedAt?.toISOString(),
            gender:
              objectString(match.rawPayload, "gender") === "women" ||
              (!objectString(match.rawPayload, "gender") &&
                match.roundLabel?.toLowerCase().includes("women"))
                ? ("women" as const)
                : ("men" as const),
            teamAName:
              objectString(match.rawPayload, "teamAName") ??
              match.participants
                .filter((participant) => participant.side === "A")
                .map((participant) => participant.name)
                .join(" / "),
            teamBName:
              objectString(match.rawPayload, "teamBName") ??
              match.participants
                .filter((participant) => participant.side === "B")
                .map((participant) => participant.name)
                .join(" / "),
            time: objectString(match.rawPayload, "time"),
            court: objectString(match.rawPayload, "court"),
            timezone:
              objectString(match.rawPayload, "timezone") ??
              effective.editorial.timezone,
            watchOptions: watchOptionsFromPayload(match.rawPayload),
          })),
      };
    }),
    avpTeams: [
      ...new Map(
        events
          .filter(
            (event) => sourceById.get(event.sourceId)?.slug === "avp-league",
          )
          .flatMap((event) => {
            const season = optionalNumber(
              unknownRecord(event.rawPayload).season,
            );
            return rawProfessionalTeamEntries(event.rawPayload)
              .filter((entry) => entry.list === "league")
              .map((entry) => ({
                key: `${season}:${entry.entryTag}:${entry.label}`,
                season: season ?? new Date().getUTCFullYear(),
                teamName: entry.label,
                gender:
                  entry.entryTag === "women"
                    ? ("women" as const)
                    : ("men" as const),
                standing: {
                  rank: entry.seed,
                  matchesPlayed: entry.matchesPlayed,
                  wins: entry.wins,
                  losses: entry.losses,
                  matchPoints: entry.matchPoints,
                  winPercentage: entry.winPercentage,
                },
                players: entry.players.map((player) => ({
                  ...player,
                  mappedPlayer: linkedPlayerBySourceIdentity.get(
                    `${event.sourceId}:${player.externalPersonId}`,
                  ),
                })),
              }));
          })
          .map((team) => [team.key, team] as const),
      ).values(),
    ].sort(
      (a, b) =>
        b.season - a.season ||
        a.teamName.localeCompare(b.teamName) ||
        a.gender.localeCompare(b.gender),
    ),
    rankingDates,
    configurations: configurations.map((configuration) => ({
      ...configuration,
      createdAt: configuration.createdAt.toISOString(),
    })),
    evaluations: evaluations.map((evaluation) => ({
      ...evaluation,
      createdAt: evaluation.createdAt.toISOString(),
    })),
    backtests: backtests.map((backtest) => ({
      ...backtest,
      dateFrom: backtest.dateFrom?.toISOString(),
      dateTo: backtest.dateTo?.toISOString(),
      startedAt: backtest.startedAt.toISOString(),
      completedAt: backtest.completedAt?.toISOString(),
      createdAt: backtest.createdAt.toISOString(),
      updatedAt: backtest.updatedAt.toISOString(),
    })),
    profileClaimReviews: claimIdentities.flatMap((claim) => {
      const subject = claim.subjectPersonId
        ? claimPersonById.get(claim.subjectPersonId)
        : undefined;
      const target = claim.targetPersonId
        ? claimPersonById.get(claim.targetPersonId)
        : undefined;
      if (!subject || !target) return [];
      const evidence = unknownRecord(claim.payload.evidence);
      return [
        {
          jobId: claim.job.id,
          subject,
          target,
          nameMatched: evidence.nameMatched === true,
          birthDateMatched: evidence.birthDateMatched === true,
          birthDateEvidenceAvailable:
            evidence.birthDateEvidenceAvailable === true,
          professionalClaim: evidence.professionalClaim === true,
          verificationTier:
            typeof evidence.verificationTier === "string"
              ? evidence.verificationTier
              : "standard-manual",
          officialSourceProfiles: Array.isArray(evidence.officialSourceProfiles)
            ? evidence.officialSourceProfiles.flatMap((value) => {
                const source = unknownRecord(value);
                return typeof source.profileUrl === "string" &&
                  typeof source.sourceName === "string"
                  ? [
                      {
                        sourceName: source.sourceName,
                        profileUrl: source.profileUrl,
                        displayName:
                          typeof source.displayName === "string"
                            ? source.displayName
                            : target.displayName,
                      },
                    ]
                  : [];
              })
            : [],
          worldRanking: (() => {
            const ranking = unknownRecord(evidence.worldRanking);
            return typeof ranking.rank === "number" &&
              typeof ranking.rankingDate === "string"
              ? {
                  rank: ranking.rank,
                  rankingDate: ranking.rankingDate,
                  countryCode:
                    typeof ranking.countryCode === "string"
                      ? ranking.countryCode
                      : undefined,
                }
              : undefined;
          })(),
          createdAt: claim.job.createdAt.toISOString(),
        },
      ];
    }),
    historyDisputes: historyDisputeRows.map((dispute) => ({
      ...dispute,
      details: dispute.details ?? undefined,
      title: dispute.title ?? "Connected match",
      playedAt: dispute.playedAt?.toISOString(),
      createdAt: dispute.createdAt.toISOString(),
    })),
    truVolleyBenchmark: {
      visibility: "super-admin-only" as const,
      sampleSize,
      correlation,
      meanAbsoluteDifference,
      comparedAt: new Date().toISOString(),
      players: benchmarkPairs
        .sort(
          (a, b) =>
            Math.abs(b.sandRating - b.truVolleyRating) -
            Math.abs(a.sandRating - a.truVolleyRating),
        )
        .slice(0, 25),
    },
  };
}

export async function linkExternalPlayer(input: {
  readonly actor: ApiActor;
  readonly externalProfileId: string;
  readonly personId: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const database = getDatabase();
  const [profile, person] = await Promise.all([
    database.query.externalPlayerProfiles.findFirst({
      where: eq(externalPlayerProfiles.id, input.externalProfileId),
    }),
    database.query.people.findFirst({
      where: eq(people.id, input.personId),
    }),
  ]);
  if (!profile || !person) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "The external or Duna player profile was not found.",
    );
  }
  const evidence = {
    method: "administrator-link",
    reason: input.reason,
    linkedByPersonId: input.actor.personId,
  };
  await database.batch([
    database
      .update(externalPlayerProfiles)
      .set({
        personId: person.id,
        mappingState: "linked",
        mappingScoreBps: 10_000,
        mappingEvidence: evidence,
        updatedAt: now,
      })
      .where(eq(externalPlayerProfiles.id, profile.id)),
    database
      .update(importLinks)
      .set({
        personId: person.id,
        resolutionState: "linked",
        resolutionScoreBps: 10_000,
        evidence,
        claimedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(importLinks.sourceId, profile.sourceId),
          eq(importLinks.externalPersonId, profile.externalPersonId),
        ),
      ),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "sand-data.player.linked",
      entityType: "external-player-profile",
      entityId: profile.id,
      afterHash: stableHash({ personId: person.id, evidence }),
      reason: input.reason,
      createdAt: now,
    }),
  ]);
  const rawProfile = unknownRecord(profile.rawProfile);
  if (rawProfile.source === "avp-league") {
    const eventRows = await database
      .select({
        id: professionalEvents.id,
        rawPayload: professionalEvents.rawPayload,
      })
      .from(professionalEvents)
      .where(eq(professionalEvents.sourceId, profile.sourceId));
    for (const event of eventRows) {
      const rawPayload = unknownRecord(event.rawPayload);
      if (!Array.isArray(rawPayload.rosterOverrides)) continue;
      let changed = false;
      const rosterOverrides = rawPayload.rosterOverrides.map((candidate) => {
        const assignment = unknownRecord(candidate);
        if (assignment.externalPersonId !== profile.externalPersonId) {
          return candidate;
        }
        changed = true;
        return { ...assignment, personId: person.id };
      });
      if (!changed) continue;
      await database
        .update(professionalEvents)
        .set({
          rawPayload: { ...rawPayload, rosterOverrides },
          updatedAt: now,
        })
        .where(eq(professionalEvents.id, event.id));
    }
  }
  await refreshMatchMappingStates(profile.sourceId, now);
  return {
    externalProfileId: profile.id,
    personId: person.id,
    displayName: person.displayName,
  };
}

async function refreshMatchMappingStates(
  sourceId: string,
  now: Date,
): Promise<void> {
  const database = getDatabase();
  const peopleByExternalId = await resolvedPeopleByExternalId(sourceId);
  const rows = await database
    .select()
    .from(importedMatches)
    .where(
      and(
        eq(importedMatches.sourceId, sourceId),
        inArray(importedMatches.importState, [
          "staged",
          "needs-mapping",
          "ready",
        ]),
      ),
    );
  for (const row of rows) {
    const participants = row.participants.map((participant) => ({
      ...participant,
      personId: peopleByExternalId.get(participant.externalPersonId),
    }));
    const complete = hasDecisiveImportedScore(row.sets, row.winnerSide);
    const allMapped = participants.every((participant) => participant.personId);
    const importState =
      complete && row.playedAt && allMapped
        ? "ready"
        : complete && !allMapped
          ? "needs-mapping"
          : "staged";
    await database
      .update(importedMatches)
      .set({ participants, importState, updatedAt: now })
      .where(eq(importedMatches.id, row.id));
  }
}

export async function approveImportedMatch(input: {
  readonly actor: ApiActor;
  readonly importedMatchId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const database = getDatabase();
  const imported = await database.query.importedMatches.findFirst({
    where: eq(importedMatches.id, input.importedMatchId),
  });
  if (!imported) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The imported match was not found.",
    );
  }
  if (imported.importState === "approved" && imported.canonicalMatchId) {
    return {
      importedMatchId: imported.id,
      canonicalMatchId: imported.canonicalMatchId,
      status: "approved" as const,
    };
  }
  const peopleA = imported.participants
    .filter((participant) => participant.side === "A")
    .flatMap((participant) =>
      participant.personId ? [participant.personId] : [],
    );
  const peopleB = imported.participants
    .filter((participant) => participant.side === "B")
    .flatMap((participant) =>
      participant.personId ? [participant.personId] : [],
    );
  if (
    imported.importState !== "ready" ||
    !imported.playedAt ||
    peopleA.length !== 2 ||
    peopleB.length !== 2 ||
    imported.sets.length === 0 ||
    !imported.winnerSide
  ) {
    throw new SandDataServiceError(
      "MATCH_NOT_READY",
      "Resolve all four players, a source date, a complete score, and duplicates before approval.",
    );
  }
  const source = await database.query.importSources.findFirst({
    where: eq(importSources.id, imported.sourceId),
  });
  const professional =
    source?.slug === "bvbinfo" ||
    source?.slug === "fivb-12ndr" ||
    source?.slug === "sandrating" ||
    source?.slug === "avp-league";
  const teamAId = crypto.randomUUID();
  const teamBId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const teamName = (side: "A" | "B") =>
    imported.participants
      .filter((participant) => participant.side === side)
      .map((participant) => participant.name.split(/\s+/)[0])
      .join(" / ");
  await database.batch([
    database.insert(teams).values({
      id: teamAId,
      name: teamName("A"),
      status: "active",
      createdAt: now,
      updatedAt: now,
    }),
    database.insert(teams).values({
      id: teamBId,
      name: teamName("B"),
      status: "active",
      createdAt: now,
      updatedAt: now,
    }),
    ...peopleA.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamAId,
        personId,
        role: "player",
        joinedAt: now,
      }),
    ),
    ...peopleB.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamBId,
        personId,
        role: "player",
        joinedAt: now,
      }),
    ),
    database.insert(matches).values({
      id: matchId,
      teamAId,
      teamBId,
      createdByPersonId: input.actor.personId,
      status: "pending-verification",
      scheduledAt: imported.playedAt,
      startedAt: imported.playedAt,
      completedAt: imported.playedAt,
      format: {
        sport: "beach-volleyball",
        teamSize: 2,
        scoringSystem: "rally",
        bestOf: imported.sets.length,
        source: source?.slug,
        sourceUrl: imported.sourceUrl,
        importedMatchId: imported.id,
        sets: imported.sets,
      },
      verification: professional ? "imported-professional" : "imported-amateur",
      verificationWeightBps: professional ? 10_000 : 9_000,
      winnerTeamId: imported.winnerSide === "A" ? teamAId : teamBId,
      ratingEligible: true,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  await applyApprovedImportedMatchRating({
    actor: input.actor,
    matchId,
    setScores: imported.sets,
    verification: professional ? "imported-professional" : "imported-amateur",
    verificationWeightBps: professional ? 10_000 : 9_000,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now,
  });
  await database.batch([
    database
      .update(importedMatches)
      .set({
        importState: "approved",
        canonicalMatchId: matchId,
        approvedByPersonId: input.actor.personId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(importedMatches.id, imported.id)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "sand-data.match.approved",
      entityType: "imported-match",
      entityId: imported.id,
      afterHash: stableHash({ canonicalMatchId: matchId }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: now,
    }),
  ]);
  return {
    importedMatchId: imported.id,
    canonicalMatchId: matchId,
    status: "approved" as const,
  };
}

export async function approveReadySandRatingMatches(input: {
  readonly actor: ApiActor;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly limit?: number;
  readonly now?: Date;
}) {
  requireDatabase();
  if (!input.actor.roles.includes("super-admin")) {
    throw new SandDataServiceError(
      "SUPER_ADMIN_REQUIRED",
      "Only a super administrator can approve a partner match backfill.",
    );
  }
  const now = input.now ?? new Date();
  const database = getDatabase();
  const source = await database.query.importSources.findFirst({
    where: eq(importSources.slug, "sandrating"),
  });
  if (!source) {
    throw new SandDataServiceError(
      "SOURCE_UNAVAILABLE",
      "Import a SandRating network snapshot before approving its matches.",
    );
  }
  const limit = Math.min(5_000, Math.max(1, Math.floor(input.limit ?? 5_000)));
  const readyMatches = await database
    .select()
    .from(importedMatches)
    .where(
      and(
        eq(importedMatches.sourceId, source.id),
        eq(importedMatches.importState, "ready"),
      ),
    )
    .orderBy(asc(importedMatches.playedAt), asc(importedMatches.id))
    .limit(limit);
  const prepared: {
    readonly importedMatchId: string;
    readonly canonicalMatchId: string;
    readonly teamRows: readonly (typeof teams.$inferInsert)[];
    readonly memberRows: readonly (typeof teamMembers.$inferInsert)[];
    readonly matchRow: typeof matches.$inferInsert;
  }[] = [];
  let skipped = 0;

  for (const imported of readyMatches) {
    const peopleA = imported.participants
      .filter((participant) => participant.side === "A")
      .flatMap((participant) =>
        participant.personId ? [participant.personId] : [],
      );
    const peopleB = imported.participants
      .filter((participant) => participant.side === "B")
      .flatMap((participant) =>
        participant.personId ? [participant.personId] : [],
      );
    if (
      peopleA.length !== 2 ||
      peopleB.length !== 2 ||
      new Set([...peopleA, ...peopleB]).size !== 4 ||
      !imported.playedAt ||
      imported.sets.length === 0 ||
      (imported.winnerSide !== "A" && imported.winnerSide !== "B")
    ) {
      skipped += 1;
      continue;
    }
    let performanceEvidence: ReturnType<
      typeof performanceEvidenceFromSetScores
    >;
    try {
      performanceEvidence = performanceEvidenceFromSetScores(imported.sets);
    } catch {
      skipped += 1;
      continue;
    }
    const teamAId = crypto.randomUUID();
    const teamBId = crypto.randomUUID();
    const canonicalMatchId = crypto.randomUUID();
    const teamName = (side: "A" | "B") =>
      imported.participants
        .filter((participant) => participant.side === side)
        .map((participant) => participant.name.split(/\s+/)[0])
        .join(" / ");
    prepared.push({
      importedMatchId: imported.id,
      canonicalMatchId,
      teamRows: [
        {
          id: teamAId,
          name: teamName("A"),
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teamBId,
          name: teamName("B"),
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      memberRows: [
        ...peopleA.map((personId) => ({
          teamId: teamAId,
          personId,
          role: "player" as const,
          joinedAt: now,
        })),
        ...peopleB.map((personId) => ({
          teamId: teamBId,
          personId,
          role: "player" as const,
          joinedAt: now,
        })),
      ],
      matchRow: {
        id: canonicalMatchId,
        teamAId,
        teamBId,
        createdByPersonId: input.actor.personId,
        status: "verified",
        scheduledAt: imported.playedAt,
        startedAt: imported.playedAt,
        completedAt: imported.playedAt,
        format: {
          sport: "beach-volleyball",
          teamSize: 2,
          scoringSystem: "rally",
          bestOf: imported.sets.length,
          source: source.slug,
          sourceUrl: imported.sourceUrl,
          importedMatchId: imported.id,
          sets: imported.sets,
        },
        verification: "imported-professional",
        verificationWeightBps: 10_000,
        winnerTeamId: imported.winnerSide === "A" ? teamAId : teamBId,
        ratingEligible: true,
        ratingEvidence: {
          setScores: imported.sets,
          ...performanceEvidence,
        },
        ratingAppliedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  for (let offset = 0; offset < prepared.length; offset += 40) {
    const chunk = prepared.slice(offset, offset + 40);
    await database.batch([
      database.insert(teams).values(chunk.flatMap((match) => match.teamRows)),
      database
        .insert(teamMembers)
        .values(chunk.flatMap((match) => match.memberRows)),
      database.insert(matches).values(chunk.map((match) => match.matchRow)),
      ...chunk.map((match) =>
        database
          .update(importedMatches)
          .set({
            importState: "approved",
            canonicalMatchId: match.canonicalMatchId,
            approvedByPersonId: input.actor.personId,
            approvedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(importedMatches.id, match.importedMatchId),
              eq(importedMatches.importState, "ready"),
            ),
          ),
      ),
    ]);
  }

  const replay = await rebuildSandRatingProjection({
    actor: input.actor,
    reason:
      "Partner-authorized SandRating match history was approved and replayed in chronological order.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now,
  });
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "sand-data.sandrating-backfill.approved",
    entityType: "import-source",
    entityId: source.id,
    afterHash: stableHash({ approved: prepared.length, skipped, replay }),
    reason: input.reason,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: now,
  });
  return {
    approved: prepared.length,
    skipped,
    replay,
  };
}

export async function repairApprovedSandRatingMatchDates(input: {
  readonly actor: ApiActor;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now?: Date;
}) {
  requireDatabase();
  if (!input.actor.roles.includes("super-admin")) {
    throw new SandDataServiceError(
      "SUPER_ADMIN_REQUIRED",
      "Only a super administrator can repair approved partner match dates.",
    );
  }
  const now = input.now ?? new Date();
  const database = getDatabase();
  const source = await database.query.importSources.findFirst({
    where: eq(importSources.slug, "sandrating"),
  });
  if (!source) {
    throw new SandDataServiceError(
      "SOURCE_UNAVAILABLE",
      "Import a SandRating network snapshot before repairing match dates.",
    );
  }
  const candidates = await database
    .select({
      importedMatchId: importedMatches.id,
      canonicalMatchId: importedMatches.canonicalMatchId,
      playedAt: importedMatches.playedAt,
      rawPayload: importedMatches.rawPayload,
      scheduledAt: matches.scheduledAt,
      startedAt: matches.startedAt,
      completedAt: matches.completedAt,
      format: matches.format,
    })
    .from(importedMatches)
    .innerJoin(matches, eq(importedMatches.canonicalMatchId, matches.id))
    .where(
      and(
        eq(importedMatches.sourceId, source.id),
        eq(importedMatches.importState, "approved"),
        isNotNull(importedMatches.canonicalMatchId),
        isNotNull(importedMatches.playedAt),
      ),
    );
  const repairs = candidates.flatMap((candidate) => {
    const canonicalMatchId = candidate.canonicalMatchId;
    const playedAt = candidate.playedAt;
    if (
      !canonicalMatchId ||
      !playedAt ||
      (candidate.scheduledAt && candidate.startedAt && candidate.completedAt)
    ) {
      return [];
    }
    const raw = unknownRecord(candidate.rawPayload);
    const sourceMatchDate = optionalSnapshotString(raw.sourceMatchDate);
    const sourceMatchDateEnd = optionalSnapshotString(raw.sourceMatchDateEnd);
    return [
      {
        ...candidate,
        canonicalMatchId,
        playedAt,
        sourceMatchDate,
        sourceMatchDateEnd,
      },
    ];
  });
  for (let offset = 0; offset < repairs.length; offset += 50) {
    const statements = repairs.slice(offset, offset + 50).map((repair) =>
      database
        .update(matches)
        .set({
          scheduledAt: repair.scheduledAt ?? repair.playedAt,
          startedAt: repair.startedAt ?? repair.playedAt,
          completedAt: repair.completedAt ?? repair.playedAt,
          format: {
            ...unknownRecord(repair.format),
            ...(repair.sourceMatchDate
              ? { sourceMatchDate: repair.sourceMatchDate }
              : {}),
            ...(repair.sourceMatchDateEnd
              ? { sourceMatchDateEnd: repair.sourceMatchDateEnd }
              : {}),
          },
          updatedAt: now,
        })
        .where(eq(matches.id, repair.canonicalMatchId)),
    );
    const [first, ...rest] = statements;
    if (first) await database.batch([first, ...rest]);
  }
  if (repairs.length === 0) {
    return { repaired: 0, replay: undefined };
  }
  const replay = await rebuildSandRatingProjection({
    actor: input.actor,
    reason:
      "Corrected partner source dates were replayed chronologically so displayed history and Sand Ratings remain aligned.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now,
  });
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "sand-data.sandrating-dates.repaired",
    entityType: "import-source",
    entityId: source.id,
    afterHash: stableHash({ repaired: repairs.length, replay }),
    reason: input.reason,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: now,
  });
  return { repaired: repairs.length, replay };
}

export async function rejectImportedMatch(input: {
  readonly actor: ApiActor;
  readonly importedMatchId: string;
  readonly decision: "rejected" | "excluded" | "duplicate";
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const database = getDatabase();
  const [updated] = await database
    .update(importedMatches)
    .set({
      importState: input.decision,
      exclusionReason: input.reason,
      updatedAt: now,
    })
    .where(eq(importedMatches.id, input.importedMatchId))
    .returning({ id: importedMatches.id });
  if (!updated) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The imported match was not found.",
    );
  }
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: `sand-data.match.${input.decision}`,
    entityType: "imported-match",
    entityId: updated.id,
    reason: input.reason,
    createdAt: now,
  });
  return { id: updated.id, status: input.decision };
}

export async function mergeUnclaimedProfile(input: {
  readonly actor: ApiActor;
  readonly sourcePersonId: string;
  readonly targetPersonId: string;
  readonly reason: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now?: Date;
}) {
  requireDatabase();
  if (!input.actor.roles.includes("super-admin")) {
    throw new SandDataServiceError(
      "SUPER_ADMIN_REQUIRED",
      "Only a super administrator can merge player identities.",
    );
  }
  if (input.sourcePersonId === input.targetPersonId) {
    throw new SandDataServiceError(
      "MERGE_CONFLICT",
      "Choose two different profiles.",
    );
  }
  const now = input.now ?? new Date();
  const database = getDatabase();
  const [source, target, sourceEvents, targetEvents] = await Promise.all([
    database.query.people.findFirst({
      where: eq(people.id, input.sourcePersonId),
    }),
    database.query.people.findFirst({
      where: eq(people.id, input.targetPersonId),
    }),
    database
      .select({ id: ratingEvents.id })
      .from(ratingEvents)
      .where(eq(ratingEvents.personId, input.sourcePersonId)),
    database
      .select({ id: ratingEvents.id })
      .from(ratingEvents)
      .where(eq(ratingEvents.personId, input.targetPersonId)),
  ]);
  if (!source || !target) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "One or both profiles were not found.",
    );
  }
  if (
    source.profileClaimStatus !== "unclaimed" &&
    source.profileClaimStatus !== "claim-pending"
  ) {
    throw new SandDataServiceError(
      "MERGE_CONFLICT",
      "Only an unclaimed or identity-reviewed source profile can be merged.",
    );
  }
  const needsRatingReplay = sourceEvents.length > 0 && targetEvents.length > 0;
  const sourceTeamRows = await database
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.personId, source.id));
  const targetTeamRows = await database
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.personId, target.id));
  const targetTeams = new Set(targetTeamRows.map((row) => row.teamId));
  const operations = [
    ...sourceTeamRows
      .filter((row) => !targetTeams.has(row.teamId))
      .map((row) =>
        database
          .update(teamMembers)
          .set({ personId: target.id })
          .where(
            and(
              eq(teamMembers.teamId, row.teamId),
              eq(teamMembers.personId, source.id),
            ),
          ),
      ),
    ...sourceTeamRows
      .filter((row) => targetTeams.has(row.teamId))
      .map((row) =>
        database
          .delete(teamMembers)
          .where(
            and(
              eq(teamMembers.teamId, row.teamId),
              eq(teamMembers.personId, source.id),
            ),
          ),
      ),
    database
      .update(externalPlayerProfiles)
      .set({
        personId: target.id,
        mappingState: "linked",
        mappingScoreBps: 10_000,
        mappingEvidence: {
          method: "profile-merge",
          sourcePersonId: source.id,
          targetPersonId: target.id,
        },
        updatedAt: now,
      })
      .where(eq(externalPlayerProfiles.personId, source.id)),
    database
      .update(importLinks)
      .set({
        personId: target.id,
        resolutionState: "linked",
        resolutionScoreBps: 10_000,
        evidence: {
          method: "profile-merge",
          sourcePersonId: source.id,
          targetPersonId: target.id,
        },
        updatedAt: now,
      })
      .where(eq(importLinks.personId, source.id)),
    database
      .update(worldRankings)
      .set({ personId: target.id })
      .where(eq(worldRankings.personId, source.id)),
    ...(needsRatingReplay
      ? [database.delete(ratings).where(eq(ratings.personId, source.id))]
      : [
          database
            .update(ratingEvents)
            .set({ personId: target.id })
            .where(eq(ratingEvents.personId, source.id)),
          database.delete(ratings).where(
            and(
              eq(ratings.personId, source.id),
              sql`NOT EXISTS (
                  SELECT 1 FROM ${ratings} target_rating
                  WHERE target_rating.person_id = ${target.id}::uuid
                    AND target_rating.discipline = ${ratings.discipline}
                )`,
            ),
          ),
          database
            .update(ratings)
            .set({ personId: target.id })
            .where(eq(ratings.personId, source.id)),
        ]),
    database
      .update(people)
      .set({
        profileClaimStatus: "merged",
        profileVisibility: "private",
        status: "restricted",
        updatedAt: now,
      })
      .where(eq(people.id, source.id)),
    database.insert(profileMergeRecords).values({
      sourcePersonId: source.id,
      targetPersonId: target.id,
      reason: input.reason,
      movedCounts: {
        teams: sourceTeamRows.length,
        ratingEvents: sourceEvents.length,
        ratingReplay: needsRatingReplay ? 1 : 0,
      },
      performedByPersonId: input.actor.personId,
      createdAt: now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "sand-data.profile.merged",
      entityType: "person",
      entityId: source.id,
      afterHash: stableHash({ targetPersonId: target.id }),
      reason: input.reason,
      createdAt: now,
    }),
  ];
  for (const operation of operations) await operation;
  const ratingReplay = needsRatingReplay
    ? await rebuildSandRatingProjection({
        actor: input.actor,
        reason: `${input.reason} Duplicate player histories were rebuilt chronologically after identity consolidation.`,
        requestId: input.requestId ?? crypto.randomUUID(),
        ipAddress: input.ipAddress,
        now,
      })
    : undefined;
  return {
    sourcePersonId: source.id,
    targetPersonId: target.id,
    status: "completed" as const,
    ratingReplay,
  };
}

async function ensureRatingConfiguration(actor: ApiActor, now: Date) {
  const database = getDatabase();
  const active = await database.query.ratingConfigurations.findFirst({
    where: eq(ratingConfigurations.active, true),
  });
  if (active) return active;
  const [created] = await database
    .insert(ratingConfigurations)
    .values({
      name: "Duna Sand Rating",
      version: 1,
      algorithmVersion: "duna-1.0",
      active: true,
      parameters: {
        ...defaultRatingConfig,
        sparseThreshold: 12,
        externalBlendCap: 0.45,
      },
      notes:
        "Canonical 1–8 rating with external priors limited to sparse profiles.",
      createdByPersonId: actor.personId,
      createdAt: now,
    })
    .returning();
  if (!created) throw new Error("Could not initialize rating configuration");
  return created;
}

function backtestSetScores(value: unknown): readonly {
  readonly a: number;
  readonly b: number;
}[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((score) => {
    const row = unknownRecord(score);
    const a =
      typeof row.a === "number" && Number.isFinite(row.a) ? row.a : undefined;
    const b =
      typeof row.b === "number" && Number.isFinite(row.b) ? row.b : undefined;
    return a !== undefined &&
      b !== undefined &&
      Number.isSafeInteger(a) &&
      Number.isSafeInteger(b) &&
      a >= 0 &&
      b >= 0 &&
      a !== b
      ? [{ a, b }]
      : [];
  });
}

async function loadRatingBacktestMatches(): Promise<
  readonly RatingBacktestMatch[]
> {
  const database = getDatabase();
  const matchRows = await database
    .select({
      id: matches.id,
      teamAId: matches.teamAId,
      teamBId: matches.teamBId,
      completedAt: matches.completedAt,
      startedAt: matches.startedAt,
      scheduledAt: matches.scheduledAt,
      ratingAppliedAt: matches.ratingAppliedAt,
      verificationWeightBps: matches.verificationWeightBps,
      ratingEvidence: matches.ratingEvidence,
      format: matches.format,
    })
    .from(matches)
    .where(
      and(isNotNull(matches.ratingAppliedAt), eq(matches.ratingEligible, true)),
    );
  const teamIds = [
    ...new Set(
      matchRows.flatMap((match) =>
        [match.teamAId, match.teamBId].filter((teamId): teamId is string =>
          Boolean(teamId),
        ),
      ),
    ),
  ];
  const memberRows = teamIds.length
    ? await database
        .select({
          teamId: teamMembers.teamId,
          personId: teamMembers.personId,
        })
        .from(teamMembers)
        .where(inArray(teamMembers.teamId, teamIds))
    : [];
  const membersByTeam = new Map<string, string[]>();
  for (const member of memberRows) {
    const current = membersByTeam.get(member.teamId) ?? [];
    current.push(member.personId);
    membersByTeam.set(member.teamId, current);
  }
  return matchRows.flatMap((match) => {
    if (!match.teamAId || !match.teamBId) return [];
    const teamA = [...(membersByTeam.get(match.teamAId) ?? [])].sort();
    const teamB = [...(membersByTeam.get(match.teamBId) ?? [])].sort();
    if (teamA.length !== 2 || teamB.length !== 2) return [];
    const evidence = unknownRecord(match.ratingEvidence);
    const format = unknownRecord(match.format);
    const setScores = backtestSetScores(evidence.setScores);
    const fallbackSetScores = backtestSetScores(format.sets);
    const usableScores = setScores.length > 0 ? setScores : fallbackSetScores;
    if (usableScores.length === 0) return [];
    const occurredAt =
      match.completedAt ??
      match.startedAt ??
      match.scheduledAt ??
      match.ratingAppliedAt;
    if (!occurredAt) return [];
    return [
      {
        id: match.id,
        occurredAt,
        teamA: teamA as [string, string],
        teamB: teamB as [string, string],
        setScores: usableScores,
        verificationWeight: (match.verificationWeightBps ?? 10_000) / 10_000,
      },
    ];
  });
}

export async function evaluateCurrentRating(input: {
  readonly actor: ApiActor;
  readonly now?: Date;
}) {
  requireDatabase();
  if (!input.actor.roles.includes("super-admin")) {
    throw new SandDataServiceError(
      "SUPER_ADMIN_REQUIRED",
      "Only a super administrator can run and publish a ratings backtest.",
    );
  }
  const now = input.now ?? new Date();
  const database = getDatabase();
  const configuration = await ensureRatingConfiguration(input.actor, now);
  const historicalMatches = await loadRatingBacktestMatches();
  const report = runRatingBacktest(historicalMatches, now);
  const champion = report.models.find(
    (model) => model.modelId === report.championModelId,
  );
  const [run] = await database
    .insert(ratingBacktestRuns)
    .values({
      configurationId: configuration.id,
      methodologyVersion: report.methodologyVersion,
      status: "running",
      matchesProcessed: report.matches,
      playersProcessed: report.players,
      dateFrom: report.dateFrom ? new Date(report.dateFrom) : null,
      dateTo: report.dateTo ? new Date(report.dateTo) : null,
      championModelId: report.championModelId,
      modelSummaries: report.models,
      createdByPersonId: input.actor.personId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!run) throw new Error("Could not save the ratings backtest run");
  try {
    for (let offset = 0; offset < report.predictions.length; offset += 400) {
      await database.insert(ratingBacktestPredictions).values(
        report.predictions.slice(offset, offset + 400).map((prediction) => ({
          runId: run.id,
          matchId: prediction.matchId,
          occurredAt: new Date(prediction.occurredAt),
          actualTeamA: prediction.actualTeamA,
          probabilities: prediction.probabilities,
          ensembleWeights: prediction.ensembleWeights,
          preMatchRatings: prediction.dunaPreMatchRatings,
          createdAt: now,
        })),
      );
    }
    const evaluation = champion
      ? {
          sampleSize: champion.sampleSize,
          accuracy: champion.accuracy,
          brierScore: champion.brierScore,
          calibration: champion.calibration,
        }
      : evaluatePredictions([]);
    const [saved] = await database
      .insert(ratingEvaluations)
      .values({
        configurationId: configuration.id,
        sampleSize: evaluation.sampleSize,
        predictionAccuracy: evaluation.accuracy,
        brierScore: evaluation.brierScore,
        calibration: evaluation.calibration,
        createdByPersonId: input.actor.personId,
        createdAt: now,
      })
      .returning();
    const completedAt = new Date();
    await database.batch([
      database
        .update(ratingBacktestRuns)
        .set({ status: "completed", completedAt, updatedAt: completedAt })
        .where(eq(ratingBacktestRuns.id, run.id)),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "rating.backtest.completed",
        entityType: "rating-backtest-run",
        entityId: run.id,
        afterHash: stableHash({
          methodologyVersion: report.methodologyVersion,
          matches: report.matches,
          players: report.players,
          championModelId: report.championModelId,
          models: report.models.map((model) => ({
            modelId: model.modelId,
            brierScore: model.brierScore,
            logLoss: model.logLoss,
          })),
        }),
        reason:
          "Chronological pre-match predictions were replayed and compared without future-result leakage.",
        createdAt: completedAt,
      }),
    ]);
    return {
      id: saved?.id ?? "",
      runId: run.id,
      configurationId: configuration.id,
      ...evaluation,
      methodologyVersion: report.methodologyVersion,
      matches: report.matches,
      players: report.players,
      championModelId: report.championModelId,
      models: report.models,
      createdAt: completedAt.toISOString(),
    };
  } catch (error) {
    const failedAt = new Date();
    await database
      .update(ratingBacktestRuns)
      .set({
        status: "failed",
        failureReason: (error instanceof Error
          ? error.message
          : "Backtest failed"
        ).slice(0, 2_000),
        completedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(eq(ratingBacktestRuns.id, run.id));
    throw error;
  }
}

export async function createRatingConfiguration(input: {
  readonly actor: ApiActor;
  readonly name: string;
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
  readonly notes?: string;
  readonly activate: boolean;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  if (!input.actor.roles.includes("super-admin")) {
    throw new SandDataServiceError(
      "SUPER_ADMIN_REQUIRED",
      "Only a super administrator can activate rating parameters.",
    );
  }
  const now = input.now ?? new Date();
  const database = getDatabase();
  const versions = await database
    .select({ version: ratingConfigurations.version })
    .from(ratingConfigurations)
    .where(eq(ratingConfigurations.name, input.name))
    .orderBy(desc(ratingConfigurations.version))
    .limit(1);
  const version = (versions[0]?.version ?? 0) + 1;
  if (input.activate) {
    await database
      .update(ratingConfigurations)
      .set({ active: false })
      .where(eq(ratingConfigurations.active, true));
  }
  const [configuration] = await database
    .insert(ratingConfigurations)
    .values({
      name: input.name,
      version,
      algorithmVersion: "duna-1.0",
      active: input.activate,
      parameters: input.parameters,
      notes: input.notes,
      createdByPersonId: input.actor.personId,
      createdAt: now,
    })
    .returning();
  if (!configuration) throw new Error("Could not save rating configuration");
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: input.activate
      ? "rating.configuration.activated"
      : "rating.configuration.created",
    entityType: "rating-configuration",
    entityId: configuration.id,
    afterHash: stableHash(input.parameters),
    reason: input.reason,
    createdAt: now,
  });
  return {
    ...configuration,
    createdAt: configuration.createdAt.toISOString(),
  };
}

export async function loadPublicRatingLab() {
  requireDatabase();
  const database = getDatabase();
  const run = await database.query.ratingBacktestRuns.findFirst({
    where: eq(ratingBacktestRuns.status, "completed"),
    orderBy: [desc(ratingBacktestRuns.completedAt)],
  });
  if (!run) return undefined;
  const examples = await database
    .select({
      matchId: ratingBacktestPredictions.matchId,
      occurredAt: ratingBacktestPredictions.occurredAt,
      actualTeamA: ratingBacktestPredictions.actualTeamA,
      probabilities: ratingBacktestPredictions.probabilities,
      preMatchRatings: ratingBacktestPredictions.preMatchRatings,
      title: importedMatches.title,
      participants: importedMatches.participants,
      sets: importedMatches.sets,
    })
    .from(ratingBacktestPredictions)
    .leftJoin(
      importedMatches,
      and(
        eq(importedMatches.canonicalMatchId, ratingBacktestPredictions.matchId),
        eq(importedMatches.importState, "approved"),
      ),
    )
    .where(eq(ratingBacktestPredictions.runId, run.id))
    .orderBy(desc(ratingBacktestPredictions.occurredAt))
    .limit(12);
  return {
    id: run.id,
    methodologyVersion: run.methodologyVersion,
    matchesProcessed: run.matchesProcessed,
    playersProcessed: run.playersProcessed,
    dateFrom: run.dateFrom?.toISOString(),
    dateTo: run.dateTo?.toISOString(),
    championModelId: run.championModelId ?? undefined,
    models: run.modelSummaries,
    examples: examples.map((example) => ({
      ...example,
      occurredAt: example.occurredAt.toISOString(),
      title: example.title ?? "Duna rated match",
      participants: example.participants ?? [],
      sets: example.sets ?? [],
    })),
    completedAt: run.completedAt?.toISOString() ?? run.createdAt.toISOString(),
  };
}

export async function searchPublicPlayers(input: {
  readonly query: string;
  readonly limit?: number;
}) {
  requireDatabase();
  const query = input.query.trim().toLowerCase().replaceAll("%", "");
  if (query.length < 2) return [];
  const pattern = `%${query}%`;
  const rows = await getDatabase()
    .select({
      id: people.id,
      displayName: people.displayName,
      handle: people.handle,
      avatarUrl: people.avatarUrl,
      homeMarket: people.homeMarket,
      isProfessional: people.isProfessional,
      profileClaimStatus: people.profileClaimStatus,
      sandRating: ratings.display,
      confidence: ratings.confidence,
      ratedMatches: ratings.ratedMatches,
    })
    .from(people)
    .leftJoin(
      ratings,
      and(eq(ratings.personId, people.id), eq(ratings.discipline, "beach-2s")),
    )
    .where(
      and(
        eq(people.status, "active"),
        eq(people.profileVisibility, "public"),
        eq(people.isMinor, false),
        sql`(lower(${people.displayName}) LIKE ${pattern} OR lower(${people.handle}) LIKE ${pattern})`,
      ),
    )
    .orderBy(
      desc(people.isProfessional),
      desc(ratings.display),
      asc(people.displayName),
    )
    .limit(Math.min(50, Math.max(1, input.limit ?? 20)));
  return rows.map((row) => ({
    ...row,
    publicPath: publicPlayerPath({
      id: row.id,
      displayName: row.displayName,
      handle: row.handle,
      homeMarket: row.homeMarket,
      profileClaimStatus: row.profileClaimStatus as
        "claimed" | "unclaimed" | "claim-pending" | "merged",
    }),
  }));
}

export async function loadPublicWorldRankings() {
  requireDatabase();
  const database = getDatabase();
  const genders = ["men", "women"] as const;
  const latestDates = Object.fromEntries(
    await Promise.all(
      genders.map(async (genderCategory) => {
        const [latest] = await database
          .select({ rankingDate: worldRankings.rankingDate })
          .from(worldRankings)
          .where(eq(worldRankings.genderCategory, genderCategory))
          .orderBy(desc(worldRankings.rankingDate))
          .limit(1);
        return [genderCategory, latest?.rankingDate] as const;
      }),
    ),
  ) as Record<(typeof genders)[number], string | undefined>;
  const worldRows = dedupeWorldRankingRows(
    await Promise.all(
      genders.map(async (genderCategory) => {
        const rankingDate = latestDates[genderCategory];
        if (!rankingDate) return [];
        return database
          .select({
            genderCategory: worldRankings.genderCategory,
            rankingDate: worldRankings.rankingDate,
            rank: worldRankings.rank,
            previousRank: worldRankings.previousRank,
            points: worldRankings.points,
            externalPersonId: worldRankings.externalPersonId,
            displayName: worldRankings.displayName,
            countryCode: worldRankings.countryCode,
            personId: worldRankings.personId,
            handle: people.handle,
            homeMarket: people.homeMarket,
            profileClaimStatus: people.profileClaimStatus,
            avatarUrl: people.avatarUrl,
            profileVisibility: people.profileVisibility,
            personStatus: people.status,
            isMinor: people.isMinor,
            sandRating: ratings.display,
            ratedMatches: ratings.ratedMatches,
          })
          .from(worldRankings)
          .leftJoin(people, eq(worldRankings.personId, people.id))
          .leftJoin(
            ratings,
            and(
              eq(ratings.personId, worldRankings.personId),
              eq(ratings.discipline, "beach-2s"),
            ),
          )
          .where(
            and(
              eq(worldRankings.genderCategory, genderCategory),
              eq(worldRankings.rankingDate, rankingDate),
            ),
          )
          .orderBy(asc(worldRankings.rank))
          .limit(200);
      }),
    ).then((rows) => rows.flat()),
  );
  const worldRankByPerson = new Map(
    worldRows.flatMap((row) =>
      row.personId
        ? [
            [
              `${row.genderCategory}:${row.personId}`,
              {
                rank: row.rank,
                points: row.points,
                countryCode: row.countryCode ?? undefined,
              },
            ] as const,
          ]
        : [],
    ),
  );
  const dunaRows = await database
    .select({
      personId: people.id,
      displayName: people.displayName,
      handle: people.handle,
      homeMarket: people.homeMarket,
      profileClaimStatus: people.profileClaimStatus,
      avatarUrl: people.avatarUrl,
      genderCategory: people.genderCategory,
      sandRating: ratings.display,
      confidence: ratings.confidence,
      ratedMatches: ratings.ratedMatches,
    })
    .from(ratings)
    .innerJoin(people, eq(ratings.personId, people.id))
    .where(
      and(
        eq(ratings.discipline, "beach-2s"),
        eq(people.status, "active"),
        eq(people.profileVisibility, "public"),
        eq(people.isMinor, false),
        inArray(people.genderCategory, genders),
      ),
    )
    .orderBy(desc(ratings.display), desc(ratings.ratedMatches), asc(people.id));
  const dunaFor = (genderCategory: (typeof genders)[number]) =>
    dunaRows
      .filter((row) => row.genderCategory === genderCategory)
      .slice(0, 200)
      .map((row, index) => {
        const worldRanking = worldRankByPerson.get(
          `${genderCategory}:${row.personId}`,
        );
        return {
          rank: index + 1,
          personId: row.personId,
          displayName: row.displayName,
          handle: row.handle,
          publicPath: publicPlayerPath({
            id: row.personId,
            displayName: row.displayName,
            handle: row.handle,
            homeMarket: row.homeMarket,
            countryCode: worldRanking?.countryCode,
            profileClaimStatus: row.profileClaimStatus as
              "claimed" | "unclaimed" | "claim-pending" | "merged",
          }),
          avatarUrl: row.avatarUrl ?? undefined,
          countryCode: worldRanking?.countryCode,
          sandRating: row.sandRating,
          confidence: row.confidence,
          ratedMatches: row.ratedMatches,
          worldRanking,
        };
      });
  const worldFor = (genderCategory: (typeof genders)[number]) =>
    worldRows
      .filter((row) => row.genderCategory === genderCategory)
      .map((row) => {
        const publicProfile =
          row.personStatus === "active" &&
          row.profileVisibility === "public" &&
          row.isMinor === false;
        return {
          rank: row.rank,
          previousRank: row.previousRank ?? undefined,
          points: row.points,
          displayName: row.displayName,
          countryCode: row.countryCode ?? undefined,
          personId: row.personId ?? undefined,
          handle: publicProfile ? (row.handle ?? undefined) : undefined,
          publicPath:
            publicProfile && row.personId && row.handle
              ? publicPlayerPath({
                  id: row.personId,
                  displayName: row.displayName,
                  handle: row.handle,
                  homeMarket: row.homeMarket,
                  countryCode: row.countryCode,
                  profileClaimStatus: row.profileClaimStatus as
                    "claimed" | "unclaimed" | "claim-pending" | "merged",
                })
              : undefined,
          avatarUrl: publicProfile ? (row.avatarUrl ?? undefined) : undefined,
          sandRating: row.sandRating ?? undefined,
          ratedMatches: row.ratedMatches ?? undefined,
        };
      });
  const duna = { men: dunaFor("men"), women: dunaFor("women") };
  const world = { men: worldFor("men"), women: worldFor("women") };
  return {
    latestDates,
    limitPerGender: 200,
    world,
    duna,
  };
}

export async function loadPublicProCoverage(now = new Date()) {
  requireDatabase();
  const database = getDatabase();
  const [storedEventRows, matchRows, latestDate] = await Promise.all([
    database
      .select({
        event: professionalEvents,
        sourceSlug: importSources.slug,
      })
      .from(professionalEvents)
      .innerJoin(
        importSources,
        eq(professionalEvents.sourceId, importSources.id),
      )
      .where(
        inArray(professionalEvents.status, ["live", "upcoming", "completed"]),
      )
      .limit(200),
    database
      .select({
        id: importedMatches.id,
        sourceId: importedMatches.sourceId,
        externalEventId: importedMatches.externalEventId,
        title: importedMatches.title,
        roundLabel: importedMatches.roundLabel,
        playedAt: importedMatches.playedAt,
        participants: importedMatches.participants,
        sets: importedMatches.sets,
        winnerSide: importedMatches.winnerSide,
        rawPayload: importedMatches.rawPayload,
      })
      .from(importedMatches)
      .innerJoin(importSources, eq(importedMatches.sourceId, importSources.id))
      .where(inArray(importSources.slug, ["fivb-12ndr", "avp-league"]))
      .orderBy(desc(importedMatches.playedAt))
      .limit(2_000),
    database
      .select({ date: worldRankings.rankingDate })
      .from(worldRankings)
      .orderBy(desc(worldRankings.rankingDate))
      .limit(1),
  ]);
  const eventRows = storedEventRows
    .map((row) => ({
      ...row.event,
      sourceSlug: row.sourceSlug,
      effective: effectiveProfessionalEvent(row.event),
    }))
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      if (a.status !== b.status) {
        const order = { upcoming: 0, live: 0, completed: 1 } as const;
        return (
          order[a.status as keyof typeof order] -
          order[b.status as keyof typeof order]
        );
      }
      if (a.status === "completed") {
        return (b.effective.startsOn ?? "").localeCompare(
          a.effective.startsOn ?? "",
        );
      }
      return (a.effective.startsOn ?? "9999").localeCompare(
        b.effective.startsOn ?? "9999",
      );
    });
  const rankingDate = latestDate[0]?.date;
  const matchPersonIds = [
    ...new Set(
      matchRows.flatMap((match) =>
        match.participants.flatMap((participant) =>
          participant.personId ? [participant.personId] : [],
        ),
      ),
    ),
  ];
  const matchRatingRows =
    matchPersonIds.length > 0
      ? await database
          .select({ personId: ratings.personId, display: ratings.display })
          .from(ratings)
          .where(
            and(
              inArray(ratings.personId, matchPersonIds),
              eq(ratings.discipline, "beach-2s"),
            ),
          )
      : [];
  const matchRatingByPersonId = new Map(
    matchRatingRows.map((rating) => [rating.personId, rating.display]),
  );
  const rankingRows = rankingDate
    ? (
        await Promise.all(
          (["men", "women"] as const).map((genderCategory) =>
            database
              .select()
              .from(worldRankings)
              .where(
                and(
                  eq(worldRankings.rankingDate, rankingDate),
                  eq(worldRankings.genderCategory, genderCategory),
                ),
              )
              .orderBy(asc(worldRankings.rank))
              .limit(20),
          ),
        )
      ).flat()
    : [];
  const coverageTeam = (
    participants: (typeof matchRows)[number]["participants"],
    side: "A" | "B",
  ) => {
    const players = participants
      .filter((participant) => participant.side === side)
      .map((participant) => ({
        name: participant.name,
        ...(participant.personId ? { personId: participant.personId } : {}),
        ...(participant.personId &&
        matchRatingByPersonId.has(participant.personId)
          ? { rating: matchRatingByPersonId.get(participant.personId) }
          : {}),
      }));
    const rated = players.flatMap((player) =>
      player.rating !== undefined ? [player.rating] : [],
    );
    return {
      label: players.map((player) => player.name).join(" / ") || "TBD",
      players,
      ...(rated.length > 0
        ? {
            averageRating:
              rated.reduce((sum, rating) => sum + rating, 0) / rated.length,
          }
        : {}),
    };
  };
  return {
    events: eventRows.map((event) => {
      const sibling = eventRows.find(
        (candidate) =>
          candidate.id !== event.id &&
          candidate.startsOn === event.startsOn &&
          slugSegment(proEventBaseName(candidate.name)) ===
            slugSegment(proEventBaseName(event.name)) &&
          normalizedProGender(candidate.genderCategory) !==
            normalizedProGender(event.genderCategory),
      );
      const editorial = inheritProfessionalEventEditorial(
        event.effective.editorial,
        sibling?.effective.editorial,
      );
      const featuredMedia =
        editorial.media.find((media) => media.featured) ?? editorial.media[0];
      const posterUrl =
        featuredMedia?.kind === "hero-video"
          ? featuredMedia.posterUrl
          : featuredMedia?.url;
      const eventMatches = matchRows
        .filter(
          (match) =>
            match.sourceId === event.sourceId &&
            match.externalEventId === event.externalEventId,
        )
        .map((match) => {
          const time = objectString(match.rawPayload, "time");
          const timezone =
            objectString(match.rawPayload, "timezone") ?? editorial.timezone;
          const scheduledAt = professionalMatchScheduledAt({
            playedAt: match.playedAt ?? undefined,
            time,
            timezone,
          });
          return {
            roundLabel: match.roundLabel ?? "Match",
            ...(match.playedAt
              ? { playedAt: match.playedAt.toISOString() }
              : {}),
            ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
            status: professionalMatchStatus({
              winnerSide: match.winnerSide,
              eventLive: event.live,
              hasScore: match.sets.length > 0,
              scheduledAt,
              now,
            }),
          };
        });
      const liveMatchCount = eventMatches.filter(
        (match) => match.status === "live",
      ).length;
      const completedMatchCount = eventMatches.filter(
        (match) => match.status === "completed",
      ).length;
      const nextMatchAt = eventMatches
        .flatMap((match) =>
          match.status === "scheduled" &&
          match.scheduledAt &&
          Date.parse(match.scheduledAt) >= now.getTime() - 15 * 60_000
            ? [match.scheduledAt]
            : [],
        )
        .sort()[0];
      return {
        id: event.id,
        externalEventId: event.externalEventId,
        slug: professionalEventSlug(event),
        name: event.effective.name,
        location: event.effective.location,
        category: event.effective.category,
        genderCategory: event.genderCategory,
        startsOn: event.effective.startsOn,
        endsOn: event.effective.endsOn,
        status: event.status,
        live: event.live,
        teamCount: event.teamCount,
        matchCount: Math.max(event.matchCount, eventMatches.length),
        completedMatchCount,
        liveMatchCount,
        currentRound: professionalEventCurrentRound(eventMatches, now),
        ...(nextMatchAt ? { nextMatchAt } : {}),
        ...(posterUrl && featuredMedia
          ? {
              poster: {
                url: posterUrl,
                alt: featuredMedia.alt,
                kind: featuredMedia.kind,
              },
            }
          : {}),
        lastSyncedAt: event.lastSyncedAt.toISOString(),
        source:
          event.sourceSlug === "avp-league"
            ? ("avp" as const)
            : ("fivb" as const),
        tour: professionalTour(event.sourceSlug, event.effective.category),
      };
    }),
    matches: matchRows.map((match) => {
      const event = eventRows.find(
        (candidate) =>
          candidate.sourceId === match.sourceId &&
          candidate.externalEventId === match.externalEventId,
      );
      const teamA = coverageTeam(match.participants, "A");
      const teamB = coverageTeam(match.participants, "B");
      const time = objectString(match.rawPayload, "time");
      const timezone =
        objectString(match.rawPayload, "timezone") ??
        event?.effective.editorial.timezone;
      const scheduledAt = professionalMatchScheduledAt({
        playedAt: match.playedAt ?? undefined,
        time,
        timezone,
      });
      return {
        ...match,
        playedAt: match.playedAt?.toISOString(),
        ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
        ...(time ? { time } : {}),
        teamA,
        teamB,
        ...(event
          ? {
              canonicalPath: professionalMatchCanonicalPath({
                event,
                matchId: match.id,
                participants: match.participants,
              }),
              source: professionalSource(event.sourceSlug),
              status: professionalMatchStatus({
                winnerSide: match.winnerSide,
                eventLive: event.live,
                hasScore: match.sets.length > 0,
                scheduledAt,
                now,
              }),
              tour: professionalTour(
                event.sourceSlug,
                event.effective.category,
              ),
            }
          : {}),
      };
    }),
    rankingDate,
    rankings: rankingRows.map((ranking) => ({
      id: ranking.id,
      rank: ranking.rank,
      points: ranking.points,
      displayName: ranking.displayName,
      countryCode: ranking.countryCode ?? undefined,
      genderCategory: ranking.genderCategory,
      personId: ranking.personId ?? undefined,
      previousRank: ranking.previousRank ?? undefined,
      signal: worldRankingSignal(ranking.rank),
    })),
  };
}

function slugSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function professionalSource(sourceSlug: string): "fivb" | "avp" {
  return sourceSlug === "avp-league" ? "avp" : "fivb";
}

export function professionalTour(sourceSlug: string, category?: string | null) {
  if (sourceSlug === "avp-league") return "avp" as const;
  const normalized = category?.toLowerCase() ?? "";
  if (normalized.includes("elite")) return "elite" as const;
  if (normalized.includes("challeng")) return "challenger" as const;
  if (normalized.includes("future")) return "futures" as const;
  return "other" as const;
}

function normalizedProGender(value: string): "mens" | "womens" | string {
  const normalized = value.toLowerCase();
  if (normalized.includes("women") || normalized === "female") return "womens";
  if (normalized.includes("men") || normalized === "male") return "mens";
  return slugSegment(value) || "open";
}

function proEventBaseName(value: string): string {
  return value
    .replace(
      /\s*(?:[-–—|]\s*)?(?:men(?:'s)?|women(?:'s)?|male|female)\s*$/i,
      "",
    )
    .trim();
}

export function professionalEventSlug(event: {
  readonly name: string;
  readonly genderCategory: string;
  readonly startsOn?: string | null;
}): string {
  return [
    slugSegment(proEventBaseName(event.name)),
    normalizedProGender(event.genderCategory),
    event.startsOn,
  ]
    .filter(Boolean)
    .join("-");
}

export function professionalMatchCanonicalPath(input: {
  readonly event: {
    readonly name: string;
    readonly genderCategory: string;
    readonly startsOn?: string | null;
  };
  readonly matchId: string;
  readonly participants: readonly {
    readonly name: string;
    readonly side: "A" | "B";
  }[];
}): string {
  const team = (side: "A" | "B") =>
    input.participants
      .filter((participant) => participant.side === side)
      .map((participant) => participant.name)
      .join(" / ");
  const matchSlug = slugSegment(`${team("A")}-vs-${team("B")}`) || "match";
  return `/events/${professionalEventSlug(input.event)}/match/${matchSlug}/${input.matchId}`;
}

type ProParticipant = {
  readonly name: string;
  readonly personId?: string;
  readonly handle?: string;
  readonly publicPath?: string;
  readonly avatarUrl?: string;
  readonly rating?: number;
};

type ProTeam = {
  readonly key: string;
  readonly label: string;
  readonly players: readonly ProParticipant[];
  readonly averageRating?: number;
  readonly seed?: number;
  readonly countryCode?: string;
};

type PublicProMatch = {
  readonly id: string;
  readonly externalMatchId: string;
  readonly roundLabel: string;
  readonly playedAt?: string;
  readonly scheduledAt?: string;
  readonly sourceUrl?: string;
  readonly time?: string;
  readonly court?: string;
  readonly timezone?: string;
  readonly leagueTeamAName?: string;
  readonly leagueTeamBName?: string;
  readonly teamA: ProTeam;
  readonly teamB: ProTeam;
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly winnerSide?: "A" | "B";
  readonly status: "scheduled" | "live" | "completed";
  readonly slug: string;
  readonly canonicalPath: string;
  readonly prediction: {
    readonly teamA: number;
    readonly teamB: number;
    readonly favorite: "A" | "B" | "even";
    readonly basis: "SandRating" | "Even prior";
    readonly outcome?: "predicted" | "upset" | "even";
  };
  readonly communityPrediction: {
    readonly total: number;
    readonly teamACount: number;
    readonly teamBCount: number;
    readonly teamA: number;
    readonly teamB: number;
    readonly viewerAuthenticated: boolean;
    readonly viewerSide?: "A" | "B";
    readonly viewerHistory: readonly {
      readonly previousSide?: "A" | "B";
      readonly newSide: "A" | "B";
      readonly changedAt: string;
    }[];
    readonly closed: boolean;
  };
  readonly watchOptions: readonly PublicWatchOption[];
};

export type PublicWatchOption = {
  readonly id: string;
  readonly kind: "vbtv" | "youtube" | "live-tv";
  readonly label: string;
  readonly url?: string;
  readonly channelName?: string;
};

type ProfessionalEventMedia = {
  readonly id: string;
  readonly kind: "poster" | "hero-image" | "hero-video";
  readonly url: string;
  readonly posterUrl?: string;
  readonly alt: string;
  readonly caption?: string;
  readonly featured: boolean;
};

type ProfessionalEventVenue = {
  readonly googlePlaceId?: string;
  readonly googleMapsUri?: string;
  readonly formattedAddress?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
};

export type ProfessionalEventEditorial = {
  readonly overrides: {
    readonly name?: string;
    readonly location?: string;
    readonly category?: string;
    readonly startsOn?: string;
    readonly endsOn?: string;
  };
  readonly summary?: string;
  readonly venueName?: string;
  readonly venueAddress?: string;
  readonly venue?: ProfessionalEventVenue;
  readonly timezone?: string;
  readonly ticketUrl?: string;
  readonly media: readonly ProfessionalEventMedia[];
  readonly updatedAt?: string;
};

type ProfessionalEventResearchState = {
  readonly latest?: ProfessionalEventResearchProposal;
  readonly history: readonly ProfessionalEventResearchProposal[];
};

function professionalEventResearchFromPayload(
  value: unknown,
): ProfessionalEventResearchState {
  const payload = unknownRecord(value);
  const stored = unknownRecord(payload.professionalResearch);
  const latest = parseProfessionalEventResearchProposal(stored.latest);
  const history = Array.isArray(stored.history)
    ? stored.history.flatMap((proposal) => {
        const parsed = parseProfessionalEventResearchProposal(proposal);
        return parsed ? [parsed] : [];
      })
    : [];
  return { ...(latest ? { latest } : {}), history };
}

function professionalEventVenueFromValue(
  value: unknown,
): ProfessionalEventVenue | undefined {
  const venue = unknownRecord(value);
  const latitude = optionalNumber(venue.latitude);
  const longitude = optionalNumber(venue.longitude);
  const coordinatesValid =
    latitude !== undefined &&
    longitude !== undefined &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  const parsed: ProfessionalEventVenue = {
    ...(optionalSnapshotString(venue.googlePlaceId)
      ? { googlePlaceId: optionalSnapshotString(venue.googlePlaceId) }
      : {}),
    ...(optionalSnapshotString(venue.googleMapsUri)
      ? { googleMapsUri: optionalSnapshotString(venue.googleMapsUri) }
      : {}),
    ...(optionalSnapshotString(venue.formattedAddress)
      ? { formattedAddress: optionalSnapshotString(venue.formattedAddress) }
      : {}),
    ...(optionalSnapshotString(venue.addressLine1)
      ? { addressLine1: optionalSnapshotString(venue.addressLine1) }
      : {}),
    ...(optionalSnapshotString(venue.addressLine2)
      ? { addressLine2: optionalSnapshotString(venue.addressLine2) }
      : {}),
    ...(optionalSnapshotString(venue.locality)
      ? { locality: optionalSnapshotString(venue.locality) }
      : {}),
    ...(optionalSnapshotString(venue.administrativeArea)
      ? {
          administrativeArea: optionalSnapshotString(venue.administrativeArea),
        }
      : {}),
    ...(optionalSnapshotString(venue.postalCode)
      ? { postalCode: optionalSnapshotString(venue.postalCode) }
      : {}),
    ...(optionalSnapshotString(venue.countryCode)
      ? {
          countryCode: optionalSnapshotString(venue.countryCode)?.toUpperCase(),
        }
      : {}),
    ...(coordinatesValid ? { latitude, longitude } : {}),
  };
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function professionalEventEditorialFromPayload(
  value: unknown,
): ProfessionalEventEditorial {
  const payload = unknownRecord(value);
  const stored = unknownRecord(payload.professionalEditorial);
  const overrides = unknownRecord(stored.overrides);
  const optionalDate = (candidate: unknown) => {
    const value = optionalSnapshotString(candidate);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  };
  const media = Array.isArray(stored.media)
    ? stored.media.flatMap<ProfessionalEventMedia>((candidate) => {
        const row = unknownRecord(candidate);
        const id = optionalSnapshotString(row.id);
        const url = optionalSnapshotString(row.url);
        const kind =
          row.kind === "poster" ||
          row.kind === "hero-image" ||
          row.kind === "hero-video"
            ? row.kind
            : undefined;
        if (!id || !url || !kind) return [];
        return [
          {
            id,
            kind,
            url,
            alt: optionalSnapshotString(row.alt) ?? "Professional event media",
            featured: row.featured === true,
            ...(optionalSnapshotString(row.posterUrl)
              ? { posterUrl: optionalSnapshotString(row.posterUrl) }
              : {}),
            ...(optionalSnapshotString(row.caption)
              ? { caption: optionalSnapshotString(row.caption) }
              : {}),
          },
        ];
      })
    : [];
  return {
    overrides: {
      ...(optionalSnapshotString(overrides.name)
        ? { name: optionalSnapshotString(overrides.name) }
        : {}),
      ...(optionalSnapshotString(overrides.location)
        ? { location: optionalSnapshotString(overrides.location) }
        : {}),
      ...(optionalSnapshotString(overrides.category)
        ? { category: optionalSnapshotString(overrides.category) }
        : {}),
      ...(optionalDate(overrides.startsOn)
        ? { startsOn: optionalDate(overrides.startsOn) }
        : {}),
      ...(optionalDate(overrides.endsOn)
        ? { endsOn: optionalDate(overrides.endsOn) }
        : {}),
    },
    media,
    ...(optionalSnapshotString(stored.summary)
      ? { summary: optionalSnapshotString(stored.summary) }
      : {}),
    ...(optionalSnapshotString(stored.venueName)
      ? { venueName: optionalSnapshotString(stored.venueName) }
      : {}),
    ...(optionalSnapshotString(stored.venueAddress)
      ? { venueAddress: optionalSnapshotString(stored.venueAddress) }
      : {}),
    ...(professionalEventVenueFromValue(stored.venue)
      ? { venue: professionalEventVenueFromValue(stored.venue) }
      : {}),
    ...(optionalSnapshotString(stored.timezone)
      ? { timezone: optionalSnapshotString(stored.timezone) }
      : {}),
    ...(optionalSnapshotString(stored.ticketUrl)
      ? { ticketUrl: optionalSnapshotString(stored.ticketUrl) }
      : {}),
    ...(optionalSnapshotString(stored.updatedAt)
      ? { updatedAt: optionalSnapshotString(stored.updatedAt) }
      : {}),
  };
}

export function inheritProfessionalEventEditorial(
  primary: ProfessionalEventEditorial,
  sibling?: ProfessionalEventEditorial,
): ProfessionalEventEditorial {
  if (!sibling) return primary;
  return {
    overrides: primary.overrides,
    media: primary.media.length > 0 ? primary.media : sibling.media,
    ...((primary.summary ?? sibling.summary)
      ? { summary: primary.summary ?? sibling.summary }
      : {}),
    ...((primary.venueName ?? sibling.venueName)
      ? { venueName: primary.venueName ?? sibling.venueName }
      : {}),
    ...((primary.venueAddress ?? sibling.venueAddress)
      ? { venueAddress: primary.venueAddress ?? sibling.venueAddress }
      : {}),
    ...((primary.venue ?? sibling.venue)
      ? { venue: primary.venue ?? sibling.venue }
      : {}),
    ...((primary.timezone ?? sibling.timezone)
      ? { timezone: primary.timezone ?? sibling.timezone }
      : {}),
    ...((primary.ticketUrl ?? sibling.ticketUrl)
      ? { ticketUrl: primary.ticketUrl ?? sibling.ticketUrl }
      : {}),
    ...((primary.updatedAt ?? sibling.updatedAt)
      ? { updatedAt: primary.updatedAt ?? sibling.updatedAt }
      : {}),
  };
}

export function effectiveProfessionalEvent(event: {
  readonly name: string;
  readonly location?: string | null;
  readonly category?: string | null;
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
  readonly rawPayload: unknown;
}) {
  const editorial = professionalEventEditorialFromPayload(event.rawPayload);
  return {
    name: editorial.overrides.name ?? event.name,
    location: editorial.overrides.location ?? event.location ?? undefined,
    category: editorial.overrides.category ?? event.category ?? undefined,
    startsOn: editorial.overrides.startsOn ?? event.startsOn ?? undefined,
    endsOn: editorial.overrides.endsOn ?? event.endsOn ?? undefined,
    editorial,
  };
}

export type RawProfessionalTeamEntry = {
  readonly externalTeamId: string;
  readonly list:
    "main-draw" | "qualification" | "reserve" | "withdrawn" | "league";
  readonly label: string;
  readonly seed?: number;
  readonly entryPoints?: number;
  readonly entryTechnicalPoints?: number;
  readonly seedPoints?: number;
  readonly seedTechnicalPoints?: number;
  readonly countryCode?: string;
  readonly entryTag?: string;
  readonly matchesPlayed?: number;
  readonly wins?: number;
  readonly losses?: number;
  readonly matchPoints?: number;
  readonly winPercentage?: number;
  readonly players: readonly {
    readonly externalPersonId: string;
    readonly displayName: string;
  }[];
};

type TeamStanding = {
  readonly team: ProTeam;
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly setsFor: number;
  readonly setsAgainst: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
};

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

type AvpLeagueStanding = {
  readonly rank: number;
  readonly teamName: string;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly matchPoints: number;
  readonly winPercentage: number;
};

type AvpLeagueRosterStanding = AvpLeagueStanding & {
  readonly gender: "men" | "women";
  readonly playerNames: readonly string[];
};

export function parseAvpLeagueEventPayload(value: unknown):
  | {
      readonly season: number;
      readonly overall: readonly AvpLeagueStanding[];
      readonly men: readonly AvpLeagueRosterStanding[];
      readonly women: readonly AvpLeagueRosterStanding[];
    }
  | undefined {
  const payload = unknownRecord(value);
  const season = optionalNumber(payload.season);
  if (!season || !Array.isArray(payload.rosters)) return undefined;

  const standing = (candidate: unknown): AvpLeagueStanding | undefined => {
    const row = unknownRecord(candidate);
    const teamName = optionalSnapshotString(row.teamName);
    const rank = optionalNumber(row.rank);
    if (!teamName || rank === undefined) return undefined;
    return {
      rank,
      teamName,
      matchesPlayed: optionalNumber(row.matchesPlayed) ?? 0,
      wins: optionalNumber(row.wins) ?? 0,
      losses: optionalNumber(row.losses) ?? 0,
      matchPoints: optionalNumber(row.matchPoints) ?? 0,
      winPercentage: optionalNumber(row.winPercentage) ?? 0,
    };
  };

  const rosters = payload.rosters.flatMap<AvpLeagueRosterStanding>(
    (candidate) => {
      const row = unknownRecord(candidate);
      const base = standing(row);
      const gender =
        row.gender === "men" || row.gender === "women" ? row.gender : undefined;
      const playerNames = Array.isArray(row.playerNames)
        ? row.playerNames.flatMap((name) => {
            const normalized = optionalSnapshotString(name);
            return normalized ? [normalized] : [];
          })
        : [];
      return base && gender && playerNames.length >= 2
        ? [{ ...base, gender, playerNames }]
        : [];
    },
  );
  const overall = Array.isArray(payload.cityStandings)
    ? payload.cityStandings.flatMap((candidate) => {
        const parsed = standing(candidate);
        return parsed ? [parsed] : [];
      })
    : [];
  if (rosters.length === 0 && overall.length === 0) return undefined;
  return {
    season,
    overall,
    men: rosters.filter((roster) => roster.gender === "men"),
    women: rosters.filter((roster) => roster.gender === "women"),
  };
}

export function watchOptionsFromPayload(
  value: unknown,
): readonly PublicWatchOption[] {
  const payload = unknownRecord(value);
  if (!Array.isArray(payload.watchOptions)) return [];
  return payload.watchOptions.flatMap((candidate, index) => {
    const option = unknownRecord(candidate);
    const kind =
      option.kind === "vbtv" ||
      option.kind === "youtube" ||
      option.kind === "live-tv"
        ? option.kind
        : undefined;
    if (!kind) return [];
    const label =
      optionalSnapshotString(option.label) ??
      (kind === "vbtv"
        ? "VBTV"
        : kind === "youtube"
          ? "YouTube"
          : (optionalSnapshotString(option.channelName) ?? "Live TV"));
    return [
      {
        id: optionalSnapshotString(option.id) ?? `${kind}-${index}`,
        kind,
        label,
        ...(optionalSnapshotString(option.url)
          ? { url: optionalSnapshotString(option.url) }
          : {}),
        ...(optionalSnapshotString(option.channelName)
          ? { channelName: optionalSnapshotString(option.channelName) }
          : {}),
      },
    ];
  });
}

export function rawProfessionalTeamEntries(
  payloadValue: unknown,
): readonly RawProfessionalTeamEntry[] {
  const payload = unknownRecord(payloadValue);
  if (Array.isArray(payload.teamEntries)) {
    return payload.teamEntries.flatMap((candidate) => {
      const entry = unknownRecord(candidate);
      const list =
        entry.list === "main-draw" ||
        entry.list === "qualification" ||
        entry.list === "reserve" ||
        entry.list === "withdrawn"
          ? entry.list
          : undefined;
      const externalTeamId = optionalSnapshotString(entry.externalTeamId);
      const label = optionalSnapshotString(entry.label);
      const players = Array.isArray(entry.players)
        ? entry.players.flatMap((candidatePlayer) => {
            const player = unknownRecord(candidatePlayer);
            const externalPersonId = optionalSnapshotString(
              player.externalPersonId,
            );
            const displayName = optionalSnapshotString(player.displayName);
            return externalPersonId && displayName
              ? [{ externalPersonId, displayName }]
              : [];
          })
        : [];
      if (!list || !externalTeamId || !label || players.length < 2) return [];
      return [
        {
          externalTeamId,
          list,
          label,
          ...(optionalNumber(entry.seed) !== undefined
            ? { seed: optionalNumber(entry.seed) }
            : {}),
          ...(optionalNumber(entry.entryPoints) !== undefined
            ? { entryPoints: optionalNumber(entry.entryPoints) }
            : {}),
          ...(optionalNumber(entry.entryTechnicalPoints) !== undefined
            ? {
                entryTechnicalPoints: optionalNumber(
                  entry.entryTechnicalPoints,
                ),
              }
            : {}),
          ...(optionalNumber(entry.seedPoints) !== undefined
            ? { seedPoints: optionalNumber(entry.seedPoints) }
            : {}),
          ...(optionalNumber(entry.seedTechnicalPoints) !== undefined
            ? {
                seedTechnicalPoints: optionalNumber(entry.seedTechnicalPoints),
              }
            : {}),
          ...(optionalSnapshotString(entry.countryCode)
            ? { countryCode: optionalSnapshotString(entry.countryCode) }
            : {}),
          ...(optionalSnapshotString(entry.entryTag)
            ? { entryTag: optionalSnapshotString(entry.entryTag) }
            : {}),
          players,
        },
      ];
    });
  }
  const avpLeague = parseAvpLeagueEventPayload(payload);
  if (!avpLeague) return [];
  return [...avpLeague.women, ...avpLeague.men].map((roster) => ({
    externalTeamId: `${roster.gender}:${slugSegment(roster.teamName)}`,
    list: "league" as const,
    label: roster.teamName,
    seed: roster.rank,
    entryPoints: roster.matchPoints,
    entryTag: roster.gender,
    matchesPlayed: roster.matchesPlayed,
    wins: roster.wins,
    losses: roster.losses,
    matchPoints: roster.matchPoints,
    winPercentage: roster.winPercentage,
    players: roster.playerNames.map((displayName) => ({
      externalPersonId: avpExternalPlayerId({
        season: avpLeague.season,
        teamName: roster.teamName,
        gender: roster.gender,
        displayName,
      }),
      displayName,
    })),
  }));
}

function requireSuperAdmin(actor: ApiActor): void {
  if (!actor.roles.includes("super-admin")) {
    throw new SandDataServiceError(
      "SUPER_ADMIN_REQUIRED",
      "Only a super administrator can change professional event broadcasts.",
    );
  }
}

function validatedWatchUrl(
  value: string | undefined,
  kind: PublicWatchOption["kind"],
): string | undefined {
  if (!value?.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SandDataServiceError(
      "INVALID_WATCH_OPTION",
      "Use a complete http or https broadcast link.",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SandDataServiceError(
      "INVALID_WATCH_OPTION",
      "Broadcast links must use http or https.",
    );
  }
  if (
    kind === "youtube" &&
    !["youtube.com", "www.youtube.com", "youtu.be"].includes(
      parsed.hostname.toLowerCase(),
    )
  ) {
    throw new SandDataServiceError(
      "INVALID_WATCH_OPTION",
      "YouTube coverage must link to youtube.com or youtu.be.",
    );
  }
  return parsed.toString();
}

export async function saveProfessionalWatchOption(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
  readonly importedMatchId?: string;
  readonly kind: PublicWatchOption["kind"];
  readonly label?: string;
  readonly url?: string;
  readonly channelName?: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  const url = validatedWatchUrl(input.url, input.kind);
  const channelName = input.channelName?.trim() || undefined;
  if (input.kind === "live-tv" && !channelName) {
    throw new SandDataServiceError(
      "INVALID_WATCH_OPTION",
      "Add the live TV channel name.",
    );
  }
  const option: PublicWatchOption = {
    id: crypto.randomUUID(),
    kind: input.kind,
    label:
      input.label?.trim() ||
      (input.kind === "vbtv"
        ? "VBTV"
        : input.kind === "youtube"
          ? "YouTube"
          : (channelName ?? "Live TV")),
    ...(url ? { url } : {}),
    ...(channelName ? { channelName } : {}),
  };
  let entityType = "professional-event";
  let entityId = event.id;
  if (input.importedMatchId) {
    const match = await database.query.importedMatches.findFirst({
      where: eq(importedMatches.id, input.importedMatchId),
    });
    if (
      !match ||
      match.sourceId !== event.sourceId ||
      match.externalEventId !== event.externalEventId
    ) {
      throw new SandDataServiceError(
        "MATCH_NOT_FOUND",
        "The selected match does not belong to this professional event.",
      );
    }
    const rawPayload = unknownRecord(match.rawPayload);
    const watchOptions = [
      ...watchOptionsFromPayload(rawPayload),
      option,
    ] satisfies readonly PublicWatchOption[];
    await database
      .update(importedMatches)
      .set({
        rawPayload: { ...rawPayload, watchOptions },
        updatedAt: now,
      })
      .where(eq(importedMatches.id, match.id));
    entityType = "imported-match";
    entityId = match.id;
  } else {
    const rawPayload = unknownRecord(event.rawPayload);
    const watchOptions = [
      ...watchOptionsFromPayload(rawPayload),
      option,
    ] satisfies readonly PublicWatchOption[];
    await database
      .update(professionalEvents)
      .set({
        rawPayload: { ...rawPayload, watchOptions },
        updatedAt: now,
      })
      .where(eq(professionalEvents.id, event.id));
  }
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "professional-watch-option.created",
    entityType,
    entityId,
    afterHash: stableHash(option),
    reason: input.reason,
    createdAt: now,
  });
  return {
    ...option,
    professionalEventId: event.id,
    importedMatchId: input.importedMatchId,
  };
}

function validatedPublicUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      `${label} must be a complete http or https URL.`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      `${label} must use http or https.`,
    );
  }
  return parsed.toString();
}

function validatedTimeZone(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const timeZone = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "Choose a valid IANA timezone such as America/Chicago.",
    );
  }
  return timeZone;
}

export async function loadProfessionalEventMediaUploadContext(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const event = await getDatabase().query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  return { professionalEventId: event.id };
}

export async function saveProfessionalEventEditorial(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
  readonly overrides: {
    readonly name?: string;
    readonly location?: string;
    readonly category?: string;
    readonly startsOn?: string;
    readonly endsOn?: string;
  };
  readonly summary?: string;
  readonly venueName?: string;
  readonly venueAddress?: string;
  readonly venue?: ProfessionalEventVenue;
  readonly timezone?: string;
  readonly ticketUrl?: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  if (
    input.overrides.startsOn &&
    input.overrides.endsOn &&
    input.overrides.endsOn < input.overrides.startsOn
  ) {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "The event end date must be on or after its start date.",
    );
  }
  const previous = professionalEventEditorialFromPayload(event.rawPayload);
  const venue = professionalEventVenueFromValue(input.venue);
  const professionalEditorial: ProfessionalEventEditorial = {
    overrides: {
      ...(input.overrides.name?.trim()
        ? { name: input.overrides.name.trim() }
        : {}),
      ...(input.overrides.location?.trim()
        ? { location: input.overrides.location.trim() }
        : {}),
      ...(input.overrides.category?.trim()
        ? { category: input.overrides.category.trim() }
        : {}),
      ...(input.overrides.startsOn
        ? { startsOn: input.overrides.startsOn }
        : {}),
      ...(input.overrides.endsOn ? { endsOn: input.overrides.endsOn } : {}),
    },
    media: previous.media,
    updatedAt: now.toISOString(),
    ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
    ...(input.venueName?.trim() ? { venueName: input.venueName.trim() } : {}),
    ...(input.venueAddress?.trim()
      ? { venueAddress: input.venueAddress.trim() }
      : {}),
    ...(venue ? { venue } : {}),
    ...(validatedTimeZone(input.timezone)
      ? { timezone: validatedTimeZone(input.timezone) }
      : {}),
    ...(input.ticketUrl?.trim()
      ? { ticketUrl: validatedPublicUrl(input.ticketUrl, "Ticket URL") }
      : {}),
  };
  const rawPayload = unknownRecord(event.rawPayload);
  await database
    .update(professionalEvents)
    .set({
      rawPayload: { ...rawPayload, professionalEditorial },
      updatedAt: now,
    })
    .where(eq(professionalEvents.id, event.id));
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "professional-event.editorial.saved",
    entityType: "professional-event",
    entityId: event.id,
    beforeHash: stableHash(previous),
    afterHash: stableHash(professionalEditorial),
    reason: input.reason,
    createdAt: now,
  });
  return professionalEditorial;
}

export async function researchProfessionalEvent(input: {
  readonly professionalEventId: string;
  readonly actor?: ApiActor;
  readonly now?: Date;
}) {
  requireDatabase();
  if (input.actor) requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  const effective = effectiveProfessionalEvent(event);
  const year = Number.parseInt(
    (
      effective.startsOn ??
      event.startsOn ??
      String(now.getUTCFullYear())
    ).slice(0, 4),
    10,
  );
  const proposal = await createProfessionalEventResearchProposal(
    {
      name: effective.name,
      year: Number.isInteger(year) ? year : now.getUTCFullYear(),
      currentLocation: effective.location,
      currentStartsOn: effective.startsOn,
      currentEndsOn: effective.endsOn,
      sourceUrl: event.sourceUrl,
    },
    { now },
  );
  const previous = professionalEventResearchFromPayload(event.rawPayload);
  const professionalResearch: ProfessionalEventResearchState = {
    latest: proposal,
    history: [
      ...(previous.latest ? [previous.latest] : []),
      ...previous.history,
    ].slice(0, 5),
  };
  await database
    .update(professionalEvents)
    .set({
      rawPayload: {
        ...unknownRecord(event.rawPayload),
        professionalResearch,
      },
      updatedAt: now,
    })
    .where(eq(professionalEvents.id, event.id));
  await database.insert(auditLog).values({
    actorPersonId: input.actor?.personId,
    actorType: input.actor ? "person" : "system",
    action: "professional-event.research.completed",
    entityType: "professional-event",
    entityId: event.id,
    afterHash: stableHash(proposal),
    reason: input.actor
      ? "Super administrator requested evidence-backed event research."
      : "Scheduled evidence-backed event research completed.",
    createdAt: now,
  });
  return proposal;
}

export async function researchUpcomingProfessionalEvents(
  input: {
    readonly limit?: number;
    readonly now?: Date;
  } = {},
) {
  requireDatabase();
  const database = getDatabase();
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const freshSince = now.getTime() - 7 * 24 * 60 * 60 * 1_000;
  const limit = Math.min(5, Math.max(1, input.limit ?? 3));
  const rows = await database
    .select()
    .from(professionalEvents)
    .where(inArray(professionalEvents.status, ["live", "upcoming"]))
    .orderBy(asc(professionalEvents.startsOn))
    .limit(40);
  const candidates = rows
    .filter((event) => {
      const editorial = professionalEventEditorialFromPayload(event.rawPayload);
      const research = professionalEventResearchFromPayload(event.rawPayload);
      const effective = effectiveProfessionalEvent(event);
      if ((effective.endsOn ?? effective.startsOn ?? today) < today)
        return false;
      if (research.latest?.status === "review") return false;
      if (
        research.latest &&
        Date.parse(research.latest.generatedAt) >= freshSince
      ) {
        return false;
      }
      return (
        !research.latest ||
        (!editorial.venue &&
          !editorial.ticketUrl &&
          watchOptionsFromPayload(event.rawPayload).length === 0)
      );
    })
    .slice(0, limit);
  const results: {
    readonly professionalEventId: string;
    readonly status: "completed" | "failed";
    readonly message?: string;
  }[] = [];
  for (const event of candidates) {
    try {
      await researchProfessionalEvent({
        professionalEventId: event.id,
        now,
      });
      results.push({ professionalEventId: event.id, status: "completed" });
    } catch (error) {
      results.push({
        professionalEventId: event.id,
        status: "failed",
        message:
          error instanceof Error ? error.message : "Event research failed.",
      });
    }
  }
  return { reviewed: candidates.length, results };
}

export async function applyProfessionalEventResearch(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
  readonly proposalId: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  const research = professionalEventResearchFromPayload(event.rawPayload);
  const proposal = research.latest;
  if (
    !proposal ||
    proposal.id !== input.proposalId ||
    proposal.status !== "review"
  ) {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "That research proposal is no longer available for review.",
    );
  }
  if (
    proposal.startsOn &&
    proposal.endsOn &&
    proposal.endsOn < proposal.startsOn
  ) {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "The researched end date is before the start date.",
    );
  }
  const previousEditorial = professionalEventEditorialFromPayload(
    event.rawPayload,
  );
  const researchedVenue: ProfessionalEventVenue | undefined = proposal.venue
    ? {
        googlePlaceId: proposal.venue.googlePlaceId,
        googleMapsUri: proposal.venue.googleMapsUri,
        formattedAddress: proposal.venue.formattedAddress,
        addressLine1: proposal.venue.addressLine1,
        locality: proposal.venue.locality,
        administrativeArea: proposal.venue.administrativeArea,
        postalCode: proposal.venue.postalCode,
        countryCode: proposal.venue.countryCode,
        latitude: proposal.venue.latitude,
        longitude: proposal.venue.longitude,
      }
    : undefined;
  const professionalEditorial: ProfessionalEventEditorial = {
    ...previousEditorial,
    overrides: {
      ...previousEditorial.overrides,
      ...(!previousEditorial.overrides.startsOn && proposal.startsOn
        ? { startsOn: proposal.startsOn }
        : {}),
      ...(!previousEditorial.overrides.endsOn && proposal.endsOn
        ? { endsOn: proposal.endsOn }
        : {}),
      ...(!previousEditorial.overrides.location && proposal.venue?.locality
        ? { location: proposal.venue.locality }
        : {}),
    },
    ...(!previousEditorial.summary && proposal.overview
      ? { summary: proposal.overview }
      : {}),
    ...(!previousEditorial.venueName && proposal.venueName
      ? { venueName: proposal.venueName }
      : {}),
    ...(!previousEditorial.venueAddress &&
    (proposal.venueAddress || proposal.venue?.formattedAddress)
      ? {
          venueAddress:
            proposal.venue?.formattedAddress ?? proposal.venueAddress,
        }
      : {}),
    ...(!previousEditorial.venue && researchedVenue
      ? { venue: researchedVenue }
      : {}),
    ...(!previousEditorial.timezone && proposal.venue?.timezone
      ? { timezone: validatedTimeZone(proposal.venue.timezone) }
      : {}),
    ...(!previousEditorial.ticketUrl && proposal.ticketUrl
      ? { ticketUrl: validatedPublicUrl(proposal.ticketUrl, "Ticket URL") }
      : {}),
    updatedAt: now.toISOString(),
  };
  const existingWatchOptions = watchOptionsFromPayload(event.rawPayload);
  const signatures = new Set(
    existingWatchOptions.map(
      (option) =>
        `${option.kind}:${option.url ?? ""}:${option.channelName ?? ""}`,
    ),
  );
  const researchedWatchOptions = proposal.watchOptions.flatMap((option) => {
    const url = validatedWatchUrl(option.url, option.kind);
    const signature = `${option.kind}:${url ?? ""}:${option.channelName ?? ""}`;
    if (signatures.has(signature)) return [];
    signatures.add(signature);
    return [
      {
        id: crypto.randomUUID(),
        kind: option.kind,
        label: option.label,
        ...(url ? { url } : {}),
        ...(option.channelName ? { channelName: option.channelName } : {}),
      } satisfies PublicWatchOption,
    ];
  });
  const appliedProposal: ProfessionalEventResearchProposal = {
    ...proposal,
    status: "applied",
    appliedAt: now.toISOString(),
  };
  const professionalResearch: ProfessionalEventResearchState = {
    latest: appliedProposal,
    history: research.history,
  };
  await database
    .update(professionalEvents)
    .set({
      rawPayload: {
        ...unknownRecord(event.rawPayload),
        professionalEditorial,
        professionalResearch,
        watchOptions: [...existingWatchOptions, ...researchedWatchOptions],
      },
      updatedAt: now,
    })
    .where(eq(professionalEvents.id, event.id));
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "professional-event.research.applied",
    entityType: "professional-event",
    entityId: event.id,
    beforeHash: stableHash(previousEditorial),
    afterHash: stableHash({ professionalEditorial, researchedWatchOptions }),
    reason: input.reason,
    createdAt: now,
  });
  return {
    professionalEditorial,
    addedWatchOptions: researchedWatchOptions.length,
    proposal: appliedProposal,
  };
}

export async function saveProfessionalEventMedia(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
  readonly kind: ProfessionalEventMedia["kind"];
  readonly url: string;
  readonly posterUrl?: string;
  readonly alt: string;
  readonly caption?: string;
  readonly featured: boolean;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  const previous = professionalEventEditorialFromPayload(event.rawPayload);
  const media: ProfessionalEventMedia = {
    id: crypto.randomUUID(),
    kind: input.kind,
    url: validatedPublicUrl(input.url, "Media URL"),
    alt: input.alt.trim(),
    featured: input.featured,
    ...(input.posterUrl
      ? { posterUrl: validatedPublicUrl(input.posterUrl, "Video poster URL") }
      : {}),
    ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
  };
  const professionalEditorial: ProfessionalEventEditorial = {
    ...previous,
    media: [
      ...previous.media.map((item) =>
        input.featured ? { ...item, featured: false } : item,
      ),
      media,
    ],
    updatedAt: now.toISOString(),
  };
  await database
    .update(professionalEvents)
    .set({
      rawPayload: {
        ...unknownRecord(event.rawPayload),
        professionalEditorial,
      },
      updatedAt: now,
    })
    .where(eq(professionalEvents.id, event.id));
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "professional-event.media.saved",
    entityType: "professional-event",
    entityId: event.id,
    afterHash: stableHash(media),
    reason: input.reason,
    createdAt: now,
  });
  return media;
}

export async function removeProfessionalEventMedia(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
  readonly mediaId: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  const previous = professionalEventEditorialFromPayload(event.rawPayload);
  const removed = previous.media.find((item) => item.id === input.mediaId);
  if (!removed) {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "That event media item no longer exists.",
    );
  }
  const professionalEditorial: ProfessionalEventEditorial = {
    ...previous,
    media: previous.media.filter((item) => item.id !== input.mediaId),
    updatedAt: now.toISOString(),
  };
  await database
    .update(professionalEvents)
    .set({
      rawPayload: {
        ...unknownRecord(event.rawPayload),
        professionalEditorial,
      },
      updatedAt: now,
    })
    .where(eq(professionalEvents.id, event.id));
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "professional-event.media.removed",
    entityType: "professional-event",
    entityId: event.id,
    beforeHash: stableHash(removed),
    reason: input.reason,
    createdAt: now,
  });
  return { removed: true };
}

export async function removeProfessionalWatchOption(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
  readonly importedMatchId?: string;
  readonly optionId: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  let entityType = "professional-event";
  let entityId = event.id;
  let previous: readonly PublicWatchOption[];
  if (input.importedMatchId) {
    const match = await database.query.importedMatches.findFirst({
      where: eq(importedMatches.id, input.importedMatchId),
    });
    if (
      !match ||
      match.sourceId !== event.sourceId ||
      match.externalEventId !== event.externalEventId
    ) {
      throw new SandDataServiceError(
        "MATCH_NOT_FOUND",
        "The selected match does not belong to this professional event.",
      );
    }
    const rawPayload = unknownRecord(match.rawPayload);
    previous = watchOptionsFromPayload(rawPayload);
    await database
      .update(importedMatches)
      .set({
        rawPayload: {
          ...rawPayload,
          watchOptions: previous.filter(
            (option) => option.id !== input.optionId,
          ),
        },
        updatedAt: now,
      })
      .where(eq(importedMatches.id, match.id));
    entityType = "imported-match";
    entityId = match.id;
  } else {
    const rawPayload = unknownRecord(event.rawPayload);
    previous = watchOptionsFromPayload(rawPayload);
    await database
      .update(professionalEvents)
      .set({
        rawPayload: {
          ...rawPayload,
          watchOptions: previous.filter(
            (option) => option.id !== input.optionId,
          ),
        },
        updatedAt: now,
      })
      .where(eq(professionalEvents.id, event.id));
  }
  if (!previous.some((option) => option.id === input.optionId)) {
    throw new SandDataServiceError(
      "INVALID_WATCH_OPTION",
      "That broadcast option is no longer present.",
    );
  }
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "professional-watch-option.removed",
    entityType,
    entityId,
    reason: input.reason,
    createdAt: now,
  });
  return { optionId: input.optionId, removed: true as const };
}

export async function saveProfessionalMatchSchedule(input: {
  readonly actor: ApiActor;
  readonly professionalEventId: string;
  readonly importedMatchId?: string;
  readonly gender: "men" | "women";
  readonly teamAName: string;
  readonly teamBName: string;
  readonly localStartsAt: string;
  readonly timezone: string;
  readonly roundLabel?: string;
  readonly court?: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  const now = input.now ?? new Date();
  const database = getDatabase();
  const event = await database.query.professionalEvents.findFirst({
    where: eq(professionalEvents.id, input.professionalEventId),
  });
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The professional event was not found.",
    );
  }
  const source = await database.query.importSources.findFirst({
    where: eq(importSources.id, event.sourceId),
  });
  if (source?.slug !== "avp-league") {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "Manual schedule creation is currently available for AVP League events.",
    );
  }
  if (
    normalizePersonName(input.teamAName) ===
    normalizePersonName(input.teamBName)
  ) {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "Choose two different AVP teams.",
    );
  }
  const timeZone = validatedTimeZone(input.timezone)!;
  let playedAt: Date;
  try {
    playedAt = venueWallTimeToUtc(input.localStartsAt, timeZone);
  } catch {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "Choose a valid local match date and time.",
    );
  }
  const entries = rawProfessionalTeamEntries(event.rawPayload).filter(
    (entry) => entry.list === "league" && entry.entryTag === input.gender,
  );
  const findTeam = (name: string) =>
    entries.find(
      (entry) => normalizePersonName(entry.label) === normalizePersonName(name),
    );
  const teamA = findTeam(input.teamAName);
  const teamB = findTeam(input.teamBName);
  if (!teamA || !teamB) {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "Choose teams from the synced AVP season roster for this division.",
    );
  }
  const externalPersonIds = [
    ...teamA.players.map((player) => player.externalPersonId),
    ...teamB.players.map((player) => player.externalPersonId),
  ];
  const linkRows = await database
    .select({
      externalPersonId: importLinks.externalPersonId,
      personId: importLinks.personId,
    })
    .from(importLinks)
    .where(
      and(
        eq(importLinks.sourceId, event.sourceId),
        inArray(importLinks.externalPersonId, externalPersonIds),
      ),
    );
  const personIdByExternalId = new Map(
    linkRows.flatMap((link) =>
      link.personId ? [[link.externalPersonId, link.personId] as const] : [],
    ),
  );
  const participants = [
    ...teamA.players.map((player) => ({ ...player, side: "A" as const })),
    ...teamB.players.map((player) => ({ ...player, side: "B" as const })),
  ].map((player) => ({
    externalPersonId: player.externalPersonId,
    name: player.displayName,
    side: player.side,
    ...(personIdByExternalId.get(player.externalPersonId)
      ? { personId: personIdByExternalId.get(player.externalPersonId) }
      : {}),
  }));
  const effective = effectiveProfessionalEvent(event);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(playedAt);
  const season = optionalNumber(unknownRecord(event.rawPayload).season);
  const defaultRoundLabel = `${input.gender === "women" ? "Women" : "Men"}${season ? ` · ${season}` : ""}`;
  const scheduleIdentity = {
    professionalEventId: event.id,
    gender: input.gender,
    teamAName: teamA.label,
    teamBName: teamB.label,
    localStartsAt: input.localStartsAt,
  };
  const externalMatchId = `admin:${event.externalEventId}:${stableHash(scheduleIdentity).slice(0, 24)}`;
  const nextRawPayload = {
    season,
    gender: input.gender,
    teamAName: teamA.label,
    teamBName: teamB.label,
    time,
    timezone: timeZone,
    localStartsAt: input.localStartsAt,
    adminScheduled: true,
    ...(input.court?.trim() ? { court: input.court.trim() } : {}),
  };
  let previousMatch = input.importedMatchId
    ? await database.query.importedMatches.findFirst({
        where: eq(importedMatches.id, input.importedMatchId),
      })
    : await database.query.importedMatches.findFirst({
        where: and(
          eq(importedMatches.sourceId, event.sourceId),
          eq(importedMatches.externalMatchId, externalMatchId),
        ),
      });
  if (
    previousMatch &&
    (previousMatch.sourceId !== event.sourceId ||
      previousMatch.externalEventId !== event.externalEventId)
  ) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The selected match does not belong to this professional event.",
    );
  }
  const roundLabel = input.roundLabel?.trim() || defaultRoundLabel;
  if (previousMatch) {
    const rawPayload = unknownRecord(previousMatch.rawPayload);
    await database
      .update(importedMatches)
      .set({
        title: effective.name,
        roundLabel,
        location:
          effective.editorial.venueName ?? effective.location ?? undefined,
        genderCategory: input.gender,
        playedAt,
        participants,
        rawPayload: preserveEditorialPayload(
          { ...rawPayload, ...nextRawPayload },
          rawPayload,
        ),
        updatedAt: now,
      })
      .where(eq(importedMatches.id, previousMatch.id));
  } else {
    const sourceFingerprint = stableHash({
      sourceId: event.sourceId,
      externalMatchId,
    });
    const [created] = await database
      .insert(importedMatches)
      .values({
        sourceId: event.sourceId,
        externalMatchId,
        externalEventId: event.externalEventId,
        sourceUrl: event.sourceUrl,
        sourceFingerprint,
        crossSourceFingerprint: stableHash(scheduleIdentity),
        title: effective.name,
        roundLabel,
        location:
          effective.editorial.venueName ?? effective.location ?? undefined,
        genderCategory: input.gender,
        playedAt,
        participants,
        sets: [],
        importState: "staged",
        rawPayload: nextRawPayload,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    previousMatch = created;
  }
  if (!previousMatch) throw new Error("Could not save professional match");
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: input.importedMatchId
      ? "professional-match.schedule.updated"
      : "professional-match.schedule.created",
    entityType: "imported-match",
    entityId: previousMatch.id,
    afterHash: stableHash({ scheduleIdentity, timeZone, roundLabel }),
    reason: input.reason,
    createdAt: now,
  });
  return {
    id: previousMatch.id,
    professionalEventId: event.id,
    playedAt: playedAt.toISOString(),
    time,
  };
}

export async function saveAvpRosterAssignment(input: {
  readonly actor: ApiActor;
  readonly season: number;
  readonly teamName: string;
  readonly gender: "men" | "women";
  readonly displayName: string;
  readonly personId: string;
  readonly role: "starter" | "substitute";
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly replacesExternalPersonId?: string;
  readonly reason: string;
  readonly now?: Date;
}) {
  requireDatabase();
  requireSuperAdmin(input.actor);
  if (
    input.effectiveFrom &&
    input.effectiveTo &&
    input.effectiveTo < input.effectiveFrom
  ) {
    throw new SandDataServiceError(
      "MAPPING_CONFLICT",
      "The roster assignment end date must be after its start date.",
    );
  }
  if (input.role === "substitute" && !input.replacesExternalPersonId) {
    throw new SandDataServiceError(
      "MAPPING_CONFLICT",
      "Choose the roster player this substitute replaces.",
    );
  }
  const now = input.now ?? new Date();
  const database = getDatabase();
  const [source, person] = await Promise.all([
    ensureSource("avp-league"),
    database.query.people.findFirst({
      where: eq(people.id, input.personId),
    }),
  ]);
  if (!person) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "The selected Duna player was not found.",
    );
  }
  const eventRows = await database
    .select()
    .from(professionalEvents)
    .where(eq(professionalEvents.sourceId, source.id));
  const seasonEvents = eventRows.filter(
    (event) =>
      optionalNumber(unknownRecord(event.rawPayload).season) === input.season,
  );
  const teamExists = seasonEvents.some((event) =>
    rawProfessionalTeamEntries(event.rawPayload).some(
      (entry) =>
        entry.list === "league" &&
        normalizePersonName(entry.label) ===
          normalizePersonName(input.teamName) &&
        entry.entryTag === input.gender,
    ),
  );
  if (!teamExists) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "Refresh the AVP season before adding a roster assignment.",
    );
  }
  const externalPersonId = avpExternalPlayerId({
    season: input.season,
    teamName: input.teamName,
    gender: input.gender,
    displayName: input.displayName,
  });
  const assignment = {
    id: crypto.randomUUID(),
    season: input.season,
    teamName: input.teamName,
    teamExternalId: slugSegment(input.teamName),
    gender: input.gender,
    externalPersonId,
    displayName: input.displayName.trim(),
    personId: person.id,
    role: input.role,
    ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
    ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
    ...(input.replacesExternalPersonId
      ? { replacesExternalPersonId: input.replacesExternalPersonId }
      : {}),
  };
  const evidence = {
    method: "administrator-avp-roster",
    reason: input.reason,
    assignment,
    linkedByPersonId: input.actor.personId,
  };
  await database
    .insert(externalPlayerProfiles)
    .values({
      sourceId: source.id,
      externalPersonId,
      personId: person.id,
      displayName: assignment.displayName,
      normalizedName: normalizePersonName(assignment.displayName),
      mappingState: "linked",
      mappingScoreBps: 10_000,
      mappingEvidence: evidence,
      isProfessional: true,
      rawProfile: {
        source: "avp-league",
        ...assignment,
      },
      lastSeenAt: now,
      lastImportedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        externalPlayerProfiles.sourceId,
        externalPlayerProfiles.externalPersonId,
      ],
      set: {
        personId: person.id,
        displayName: assignment.displayName,
        normalizedName: normalizePersonName(assignment.displayName),
        mappingState: "linked",
        mappingScoreBps: 10_000,
        mappingEvidence: evidence,
        rawProfile: { source: "avp-league", ...assignment },
        lastSeenAt: now,
        lastImportedAt: now,
        updatedAt: now,
      },
    });
  await database
    .insert(importLinks)
    .values({
      sourceId: source.id,
      externalPersonId,
      personId: person.id,
      resolutionScoreBps: 10_000,
      resolutionState: "linked",
      evidence,
      claimedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [importLinks.sourceId, importLinks.externalPersonId],
      set: {
        personId: person.id,
        resolutionScoreBps: 10_000,
        resolutionState: "linked",
        evidence,
        claimedAt: now,
        updatedAt: now,
      },
    });
  for (const event of seasonEvents) {
    const rawPayload = unknownRecord(event.rawPayload);
    const previous = Array.isArray(rawPayload.rosterOverrides)
      ? rawPayload.rosterOverrides
      : [];
    const rosterOverrides = [
      ...previous.filter((candidate) => {
        const stored = unknownRecord(candidate);
        return !(
          stored.teamExternalId === assignment.teamExternalId &&
          stored.gender === assignment.gender &&
          stored.externalPersonId === assignment.externalPersonId &&
          stored.effectiveFrom === assignment.effectiveFrom
        );
      }),
      assignment,
    ];
    await database
      .update(professionalEvents)
      .set({
        rawPayload: { ...rawPayload, rosterOverrides },
        updatedAt: now,
      })
      .where(eq(professionalEvents.id, event.id));
  }
  if (input.replacesExternalPersonId) {
    const matchRows = await database
      .select()
      .from(importedMatches)
      .where(
        and(
          eq(importedMatches.sourceId, source.id),
          inArray(importedMatches.importState, [
            "staged",
            "needs-mapping",
            "ready",
          ]),
        ),
      );
    for (const match of matchRows) {
      const raw = unknownRecord(match.rawPayload);
      const playedOn = match.playedAt?.toISOString().slice(0, 10);
      if (
        optionalNumber(raw.season) !== input.season ||
        raw.gender !== input.gender ||
        (input.effectiveFrom && playedOn && playedOn < input.effectiveFrom) ||
        (input.effectiveTo && playedOn && playedOn > input.effectiveTo)
      ) {
        continue;
      }
      const side =
        normalizePersonName(optionalSnapshotString(raw.teamAName) ?? "") ===
        normalizePersonName(input.teamName)
          ? "A"
          : normalizePersonName(optionalSnapshotString(raw.teamBName) ?? "") ===
              normalizePersonName(input.teamName)
            ? "B"
            : undefined;
      if (!side) continue;
      let replaced = false;
      const participants = match.participants.map((participant) => {
        if (
          participant.side === side &&
          participant.externalPersonId === input.replacesExternalPersonId
        ) {
          replaced = true;
          return {
            ...participant,
            externalPersonId,
            name: assignment.displayName,
            personId: person.id,
          };
        }
        return participant;
      });
      if (!replaced) continue;
      const complete = Boolean(match.winnerSide && match.sets.length > 0);
      await database
        .update(importedMatches)
        .set({
          participants,
          importState:
            complete &&
            participants.every((participant) => participant.personId)
              ? "ready"
              : complete
                ? "needs-mapping"
                : "staged",
          rawPayload: {
            ...raw,
            rosterAssignmentIds: [
              ...(Array.isArray(raw.rosterAssignmentIds)
                ? raw.rosterAssignmentIds
                : []),
              assignment.id,
            ],
          },
          updatedAt: now,
        })
        .where(eq(importedMatches.id, match.id));
    }
  }
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "avp.roster-assignment.saved",
    entityType: "avp-season",
    entityId: source.id,
    afterHash: stableHash(assignment),
    reason: input.reason,
    createdAt: now,
  });
  await refreshMatchMappingStates(source.id, now);
  return assignment;
}

function objectString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : typeof candidate === "number"
      ? String(candidate)
      : undefined;
}

function normalizedMatchClock(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i);
  if (!match) return undefined;
  let hour = Number.parseInt(match[1] ?? "0", 10);
  const minute = Number.parseInt(match[2] ?? "0", 10);
  if (hour > 23 || minute > 59) return undefined;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    if (meridiem === "p" && hour !== 12) hour += 12;
    if (meridiem === "a" && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function professionalMatchScheduledAt(input: {
  readonly playedAt?: Date;
  readonly time?: string;
  readonly timezone?: string;
}): Date | undefined {
  const time = normalizedMatchClock(input.time);
  if (!input.playedAt || !time) return undefined;
  const day = input.playedAt.toISOString().slice(0, 10);
  try {
    return venueWallTimeToUtc(
      `${day}T${time}`,
      validatedTimeZone(input.timezone) ?? "UTC",
    );
  } catch {
    return undefined;
  }
}

export function professionalMatchStatus(input: {
  readonly winnerSide?: string | null;
  readonly eventLive: boolean;
  readonly hasScore?: boolean;
  readonly scheduledAt?: Date;
  readonly now?: Date;
}): "scheduled" | "live" | "completed" {
  if (input.winnerSide === "A" || input.winnerSide === "B") {
    return "completed";
  }
  if (input.eventLive && input.hasScore) return "live";
  if (!input.eventLive || !input.scheduledAt) return "scheduled";
  const now = (input.now ?? new Date()).getTime();
  const start = input.scheduledAt.getTime();
  return now >= start - 5 * 60_000 && now <= start + 3 * 60 * 60_000
    ? "live"
    : "scheduled";
}

export function professionalMatchPredictionClosed(input: {
  readonly status: "scheduled" | "live" | "completed";
  readonly eventStatus?: string;
  readonly scheduledAt?: Date;
  readonly now?: Date;
}): boolean {
  if (input.status !== "scheduled" || input.eventStatus === "completed") {
    return true;
  }
  return Boolean(
    input.scheduledAt &&
    input.scheduledAt.getTime() <= (input.now ?? new Date()).getTime(),
  );
}

function roundImportance(roundLabel: string): number {
  return bracketRound(roundLabel)?.order ?? (poolName(roundLabel) ? 0 : -1);
}

function cleanRoundLabel(roundLabel: string): string {
  return roundLabel.replace(/\s*\(standings\)\s*$/i, "").trim() || "Match";
}

export function professionalEventCurrentRound(
  matches: readonly {
    readonly roundLabel: string;
    readonly status: "scheduled" | "live" | "completed";
    readonly scheduledAt?: string;
    readonly playedAt?: string;
  }[],
  now = new Date(),
): string | undefined {
  const live = matches
    .filter((match) => match.status === "live")
    .sort(
      (a, b) =>
        roundImportance(b.roundLabel) - roundImportance(a.roundLabel) ||
        (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""),
    );
  if (live[0]) return cleanRoundLabel(live[0].roundLabel);

  const next = matches
    .filter(
      (match) =>
        match.status === "scheduled" &&
        (!match.scheduledAt ||
          Date.parse(match.scheduledAt) >= now.getTime() - 15 * 60_000),
    )
    .sort((a, b) => {
      const left = a.scheduledAt ? Date.parse(a.scheduledAt) : Infinity;
      const right = b.scheduledAt ? Date.parse(b.scheduledAt) : Infinity;
      return (
        left - right ||
        roundImportance(b.roundLabel) - roundImportance(a.roundLabel)
      );
    });
  if (next[0]) return cleanRoundLabel(next[0].roundLabel);

  const latest = matches
    .filter((match) => match.status === "completed")
    .sort(
      (a, b) =>
        roundImportance(b.roundLabel) - roundImportance(a.roundLabel) ||
        (b.playedAt ?? "").localeCompare(a.playedAt ?? ""),
    );
  return latest[0] ? cleanRoundLabel(latest[0].roundLabel) : undefined;
}

function poolName(roundLabel: string): string | undefined {
  const match = roundLabel.match(/\b(?:pool|group)\s*([a-z0-9]+)\b/i);
  return match?.[1] ? `Pool ${match[1].toUpperCase()}` : undefined;
}

function bracketRound(roundLabel: string):
  | {
      readonly key: string;
      readonly label: string;
      readonly order: number;
    }
  | undefined {
  const normalized = roundLabel.toLowerCase();
  if (poolName(roundLabel)) return undefined;
  if (/(?:final\s*(?:3rd|third)|bronze|third[\s-]*place)/i.test(normalized)) {
    return { key: "bronze", label: "Third place", order: 7 };
  }
  if (/(?:final\s*(?:1st|first)|gold|championship|^final$)/i.test(normalized)) {
    return { key: "final", label: "Final", order: 6 };
  }
  if (/(?:semi|1\/2)/i.test(normalized)) {
    return { key: "semifinals", label: "Semifinals", order: 5 };
  }
  if (/(?:quarter|1\/4)/i.test(normalized)) {
    return { key: "quarterfinals", label: "Quarterfinals", order: 4 };
  }
  if (/(?:round\s*of\s*16|\br16\b|1\/8)/i.test(normalized)) {
    return { key: "round-of-16", label: "Round of 16", order: 3 };
  }
  if (/(?:round\s*of\s*32|\br32\b|1\/16)/i.test(normalized)) {
    return { key: "round-of-32", label: "Round of 32", order: 2 };
  }
  if (/(?:qualification|qualifier|lucky loser)/i.test(normalized)) {
    return { key: slugSegment(roundLabel), label: roundLabel, order: 1 };
  }
  return undefined;
}

function isKnownProfessionalTeam(team: ProTeam): boolean {
  const placeholder = /\b(?:bye|loser|tbd|to be determined|unknown|winner)\b/i;
  return (
    team.players.length >= 2 &&
    !placeholder.test(team.label) &&
    team.players.every(
      (player) =>
        player.name.trim().length > 1 && !placeholder.test(player.name),
    )
  );
}

function standingRows(
  matches: readonly PublicProMatch[],
): readonly TeamStanding[] {
  const standings = new Map<
    string,
    {
      team: ProTeam;
      played: number;
      wins: number;
      losses: number;
      setsFor: number;
      setsAgainst: number;
      pointsFor: number;
      pointsAgainst: number;
    }
  >();
  const ensure = (team: ProTeam) => {
    const existing = standings.get(team.key);
    if (existing) return existing;
    const next = {
      team,
      played: 0,
      wins: 0,
      losses: 0,
      setsFor: 0,
      setsAgainst: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
    standings.set(team.key, next);
    return next;
  };
  for (const match of matches) {
    if (
      !isKnownProfessionalTeam(match.teamA) ||
      !isKnownProfessionalTeam(match.teamB)
    ) {
      continue;
    }
    const a = ensure(match.teamA);
    const b = ensure(match.teamB);
    if (match.sets.length === 0) continue;
    a.played += 1;
    b.played += 1;
    for (const set of match.sets) {
      a.pointsFor += set.a;
      a.pointsAgainst += set.b;
      b.pointsFor += set.b;
      b.pointsAgainst += set.a;
      if (set.a > set.b) {
        a.setsFor += 1;
        b.setsAgainst += 1;
      } else if (set.b > set.a) {
        b.setsFor += 1;
        a.setsAgainst += 1;
      }
    }
    if (match.winnerSide === "A") {
      a.wins += 1;
      b.losses += 1;
    } else if (match.winnerSide === "B") {
      b.wins += 1;
      a.losses += 1;
    }
  }
  return [...standings.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.setsFor - b.setsAgainst - (a.setsFor - a.setsAgainst) ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      (a.team.seed ?? Number.MAX_SAFE_INTEGER) -
        (b.team.seed ?? Number.MAX_SAFE_INTEGER) ||
      a.team.label.localeCompare(b.team.label),
  );
}

function liveStandingRows(matches: readonly PublicProMatch[]) {
  const base = standingRows(matches);
  const progress = new Map<
    string,
    {
      stage: number;
      stageLabel: string;
      active: boolean;
      lostAtStage: number;
    }
  >();
  const ensure = (team: ProTeam) => {
    const existing = progress.get(team.key);
    if (existing) return existing;
    const next = {
      stage: -1,
      stageLabel: "Entry list",
      active: false,
      lostAtStage: -1,
    };
    progress.set(team.key, next);
    return next;
  };
  for (const match of matches) {
    if (
      !isKnownProfessionalTeam(match.teamA) ||
      !isKnownProfessionalTeam(match.teamB)
    ) {
      continue;
    }
    const stage = roundImportance(match.roundLabel);
    for (const team of [match.teamA, match.teamB]) {
      const row = ensure(team);
      if (stage >= row.stage) {
        row.stage = stage;
        row.stageLabel = cleanRoundLabel(match.roundLabel);
      }
      if (match.status !== "completed" && stage >= row.stage) row.active = true;
    }
    if (match.status === "completed" && stage > 0 && match.winnerSide) {
      const loser = match.winnerSide === "A" ? match.teamB : match.teamA;
      const row = ensure(loser);
      row.lostAtStage = Math.max(row.lostAtStage, stage);
    }
  }
  const podium = podiumFromMatches(matches);
  const medalByKey = new Map<string, 1 | 2 | 3>();
  if (podium.champion) medalByKey.set(podium.champion.key, 1);
  if (podium.runnerUp) medalByKey.set(podium.runnerUp.key, 2);
  if (podium.thirdPlace) medalByKey.set(podium.thirdPlace.key, 3);
  return base
    .map((standing) => {
      const tournament = progress.get(standing.team.key) ?? {
        stage: -1,
        stageLabel: "Entry list",
        active: false,
        lostAtStage: -1,
      };
      const medal = medalByKey.get(standing.team.key);
      return {
        ...standing,
        stageLabel: tournament.stageLabel,
        state: medal
          ? ("placed" as const)
          : tournament.active
            ? ("active" as const)
            : tournament.lostAtStage === tournament.stage &&
                tournament.stage > 0
              ? ("eliminated" as const)
              : ("waiting" as const),
        ...(medal ? { medal } : {}),
        stageOrder: tournament.stage,
      };
    })
    .sort((a, b) => {
      if (a.medal || b.medal) {
        return (a.medal ?? 99) - (b.medal ?? 99);
      }
      return (
        b.stageOrder - a.stageOrder ||
        Number(b.state === "active") - Number(a.state === "active") ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        b.setsFor - b.setsAgainst - (a.setsFor - a.setsAgainst) ||
        b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
        (a.team.seed ?? Number.MAX_SAFE_INTEGER) -
          (b.team.seed ?? Number.MAX_SAFE_INTEGER) ||
        a.team.label.localeCompare(b.team.label)
      );
    });
}

function podiumFromMatches(matches: readonly PublicProMatch[]) {
  const final = matches.find(
    (match) => bracketRound(match.roundLabel)?.key === "final",
  );
  const bronze = matches.find(
    (match) => bracketRound(match.roundLabel)?.key === "bronze",
  );
  const winner = (match: PublicProMatch | undefined) =>
    match?.winnerSide === "A"
      ? match.teamA
      : match?.winnerSide === "B"
        ? match.teamB
        : undefined;
  const loser = (match: PublicProMatch | undefined) =>
    match?.winnerSide === "A"
      ? match.teamB
      : match?.winnerSide === "B"
        ? match.teamA
        : undefined;
  return {
    champion: winner(final),
    runnerUp: loser(final),
    thirdPlace: winner(bronze),
  };
}

export async function loadPublicProEvent(
  slug: string,
  viewerPersonId?: string,
  now = new Date(),
) {
  requireDatabase();
  const database = getDatabase();
  const eventRows = await database
    .select()
    .from(professionalEvents)
    .orderBy(desc(professionalEvents.startsOn))
    .limit(500);
  const event = eventRows.find(
    (candidate) => professionalEventSlug(candidate) === slug,
  );
  if (!event) return undefined;
  const sourceRows = await database
    .select({ slug: importSources.slug })
    .from(importSources)
    .where(eq(importSources.id, event.sourceId))
    .limit(1);
  const sourceSlug = sourceRows[0]?.slug ?? "fivb-12ndr";
  const effective = effectiveProfessionalEvent(event);
  const sibling = eventRows.find(
    (candidate) =>
      candidate.id !== event.id &&
      candidate.startsOn === event.startsOn &&
      slugSegment(proEventBaseName(candidate.name)) ===
        slugSegment(proEventBaseName(event.name)) &&
      normalizedProGender(candidate.genderCategory) !==
        normalizedProGender(event.genderCategory),
  );
  const siblingEffective = sibling
    ? effectiveProfessionalEvent(sibling)
    : undefined;
  const publicEditorial = inheritProfessionalEventEditorial(
    effective.editorial,
    siblingEffective?.editorial,
  );

  const matchRows = await database
    .select()
    .from(importedMatches)
    .where(
      and(
        eq(importedMatches.sourceId, event.sourceId),
        eq(importedMatches.externalEventId, event.externalEventId),
      ),
    )
    .orderBy(asc(importedMatches.playedAt), asc(importedMatches.createdAt));
  const rawTeamEntries = rawProfessionalTeamEntries(event.rawPayload);
  const avpLeaguePayload = parseAvpLeagueEventPayload(event.rawPayload);
  const entryExternalPersonIds = [
    ...new Set(
      rawTeamEntries.flatMap((entry) =>
        entry.players.map((player) => player.externalPersonId),
      ),
    ),
  ];
  const entryLinkRows =
    entryExternalPersonIds.length > 0
      ? await database
          .select({
            externalPersonId: importLinks.externalPersonId,
            personId: importLinks.personId,
          })
          .from(importLinks)
          .where(
            and(
              eq(importLinks.sourceId, event.sourceId),
              inArray(importLinks.externalPersonId, entryExternalPersonIds),
            ),
          )
      : [];
  const personIds = [
    ...new Set([
      ...matchRows.flatMap((match) =>
        match.participants.flatMap((participant) =>
          participant.personId ? [participant.personId] : [],
        ),
      ),
      ...entryLinkRows.flatMap((link) =>
        link.personId ? [link.personId] : [],
      ),
    ]),
  ];
  const [personRows, ratingRows, publicProfileRows, rankingCountryRows] =
    personIds.length > 0
      ? await Promise.all([
          database
            .select({
              id: people.id,
              displayName: people.displayName,
              handle: people.handle,
              homeMarket: people.homeMarket,
              profileClaimStatus: people.profileClaimStatus,
              avatarUrl: people.avatarUrl,
            })
            .from(people)
            .where(inArray(people.id, personIds)),
          database
            .select({
              personId: ratings.personId,
              display: ratings.display,
            })
            .from(ratings)
            .where(
              and(
                inArray(ratings.personId, personIds),
                eq(ratings.discipline, "beach-2s"),
              ),
            ),
          database
            .select({
              personId: playerPublicProfiles.personId,
              countryCode: playerPublicProfiles.countryCode,
              hometown: playerPublicProfiles.hometown,
            })
            .from(playerPublicProfiles)
            .where(
              and(
                inArray(playerPublicProfiles.personId, personIds),
                eq(playerPublicProfiles.publicationStatus, "published"),
              ),
            ),
          database
            .select({
              personId: worldRankings.personId,
              countryCode: worldRankings.countryCode,
              rankingDate: worldRankings.rankingDate,
            })
            .from(worldRankings)
            .where(inArray(worldRankings.personId, personIds))
            .orderBy(desc(worldRankings.rankingDate)),
        ])
      : [[], [], [], []];
  const publicProfileByPersonId = new Map(
    publicProfileRows.map((profile) => [profile.personId, profile] as const),
  );
  const rankingCountryByPersonId = new Map<string, string>();
  for (const ranking of rankingCountryRows) {
    if (
      ranking.personId &&
      ranking.countryCode &&
      !rankingCountryByPersonId.has(ranking.personId)
    ) {
      rankingCountryByPersonId.set(ranking.personId, ranking.countryCode);
    }
  }
  const personById = new Map(
    personRows.map((person) => {
      const profile = publicProfileByPersonId.get(person.id);
      return [
        person.id,
        {
          ...person,
          publicPath: publicPlayerPath({
            id: person.id,
            displayName: person.displayName,
            handle: person.handle,
            homeMarket: profile?.hometown ?? person.homeMarket,
            countryCode:
              profile?.countryCode ?? rankingCountryByPersonId.get(person.id),
            profileClaimStatus: person.profileClaimStatus as
              "claimed" | "unclaimed" | "claim-pending" | "merged",
          }),
        },
      ] as const;
    }),
  );
  const ratingByPersonId = new Map(
    ratingRows.map((rating) => [rating.personId, rating.display]),
  );
  const personIdByExternalId = new Map(
    entryLinkRows.flatMap((link) =>
      link.personId ? [[link.externalPersonId, link.personId] as const] : [],
    ),
  );
  const publicTeamEntries = rawTeamEntries.map((entry) => ({
    ...entry,
    players: entry.players.map((player) => {
      const personId = personIdByExternalId.get(player.externalPersonId);
      const person = personId ? personById.get(personId) : undefined;
      const rating = personId ? ratingByPersonId.get(personId) : undefined;
      return {
        externalPersonId: player.externalPersonId,
        name: person?.displayName ?? player.displayName,
        ...(personId ? { personId } : {}),
        ...(person?.handle ? { handle: person.handle } : {}),
        ...(person?.publicPath ? { publicPath: person.publicPath } : {}),
        ...(person?.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
        ...(rating !== undefined ? { rating } : {}),
      };
    }),
  }));
  const avpLeague = avpLeaguePayload
    ? {
        season: avpLeaguePayload.season,
        overall: avpLeaguePayload.overall,
        men: publicTeamEntries.filter((entry) => entry.entryTag === "men"),
        women: publicTeamEntries.filter((entry) => entry.entryTag === "women"),
      }
    : undefined;
  const eventSlug = professionalEventSlug(event);
  const ownEventWatchOptions = watchOptionsFromPayload(event.rawPayload);
  const eventWatchOptions =
    ownEventWatchOptions.length > 0
      ? ownEventWatchOptions
      : sibling
        ? watchOptionsFromPayload(sibling.rawPayload)
        : [];
  const toTeam = (
    participants: (typeof matchRows)[number]["participants"],
    side: "A" | "B",
  ): ProTeam => {
    const sideParticipants = participants.filter(
      (participant) => participant.side === side,
    );
    const players = sideParticipants.map((participant) => {
      const person = participant.personId
        ? personById.get(participant.personId)
        : undefined;
      const rating = participant.personId
        ? ratingByPersonId.get(participant.personId)
        : undefined;
      return {
        name: person?.displayName ?? participant.name,
        ...(participant.personId ? { personId: participant.personId } : {}),
        ...(person?.handle ? { handle: person.handle } : {}),
        ...(person?.publicPath ? { publicPath: person.publicPath } : {}),
        ...(person?.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
        ...(rating !== undefined ? { rating } : {}),
      };
    });
    const rated = players.flatMap((player) =>
      player.rating !== undefined ? [player.rating] : [],
    );
    const participantExternalIds = sideParticipants
      .map((participant) => participant.externalPersonId)
      .sort();
    const entry = rawTeamEntries.find(
      (candidate) =>
        candidate.players
          .map((player) => player.externalPersonId)
          .sort()
          .join(":") === participantExternalIds.join(":"),
    );
    return {
      key:
        players
          .map((player) => player.personId ?? normalizePersonName(player.name))
          .sort()
          .join(":") || `${side}-unknown`,
      label: players.map((player) => player.name).join(" / ") || "TBD",
      players,
      ...(rated.length
        ? {
            averageRating:
              rated.reduce((sum, rating) => sum + rating, 0) / rated.length,
          }
        : {}),
      ...(entry?.seed !== undefined ? { seed: entry.seed } : {}),
      ...(entry?.countryCode ? { countryCode: entry.countryCode } : {}),
    };
  };
  const basePublicMatches: readonly PublicProMatch[] = matchRows.map(
    (match) => {
      const teamA = toTeam(match.participants, "A");
      const teamB = toTeam(match.participants, "B");
      const hasRatings =
        teamA.averageRating !== undefined && teamB.averageRating !== undefined;
      const teamAChance = hasRatings
        ? Math.round(
            (100 /
              (1 +
                10 **
                  (((teamB.averageRating ?? 0) - (teamA.averageRating ?? 0)) /
                    1.5))) *
              10,
          ) / 10
        : 50;
      const matchSlug =
        slugSegment(`${teamA.label}-vs-${teamB.label}`) || "match";
      const winnerSide =
        match.winnerSide === "A" || match.winnerSide === "B"
          ? match.winnerSide
          : undefined;
      const time = objectString(match.rawPayload, "time");
      const timezone =
        objectString(match.rawPayload, "timezone") ??
        effective.editorial.timezone;
      const scheduledAt = professionalMatchScheduledAt({
        playedAt: match.playedAt ?? undefined,
        time,
        timezone,
      });
      const status = professionalMatchStatus({
        winnerSide,
        eventLive: event.live,
        hasScore: match.sets.length > 0,
        scheduledAt,
        now,
      });
      const predictionClosed = professionalMatchPredictionClosed({
        status,
        eventStatus: event.status,
        scheduledAt,
        now,
      });
      const favorite =
        teamAChance > 50 ? "A" : teamAChance < 50 ? "B" : ("even" as const);
      const matchWatchOptions = watchOptionsFromPayload(match.rawPayload);
      return {
        id: match.id,
        externalMatchId: match.externalMatchId,
        roundLabel: match.roundLabel ?? "Match",
        ...(match.playedAt ? { playedAt: match.playedAt.toISOString() } : {}),
        ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
        ...(match.sourceUrl ? { sourceUrl: match.sourceUrl } : {}),
        ...(time ? { time } : {}),
        ...(objectString(match.rawPayload, "court")
          ? { court: objectString(match.rawPayload, "court") }
          : {}),
        ...(timezone ? { timezone } : {}),
        ...(objectString(match.rawPayload, "teamAName")
          ? { leagueTeamAName: objectString(match.rawPayload, "teamAName") }
          : {}),
        ...(objectString(match.rawPayload, "teamBName")
          ? { leagueTeamBName: objectString(match.rawPayload, "teamBName") }
          : {}),
        teamA,
        teamB,
        sets: match.sets,
        ...(winnerSide ? { winnerSide } : {}),
        status,
        slug: matchSlug,
        canonicalPath: `/events/${eventSlug}/match/${matchSlug}/${match.id}`,
        prediction: {
          teamA: teamAChance,
          teamB: Math.round((100 - teamAChance) * 10) / 10,
          favorite,
          basis: hasRatings ? "SandRating" : "Even prior",
          ...(winnerSide
            ? {
                outcome:
                  favorite === "even"
                    ? ("even" as const)
                    : winnerSide === favorite
                      ? ("predicted" as const)
                      : ("upset" as const),
              }
            : {}),
        },
        communityPrediction: {
          total: 0,
          teamACount: 0,
          teamBCount: 0,
          teamA: 50,
          teamB: 50,
          viewerAuthenticated: Boolean(viewerPersonId),
          viewerHistory: [],
          closed: predictionClosed,
        },
        watchOptions:
          matchWatchOptions.length > 0 ? matchWatchOptions : eventWatchOptions,
      };
    },
  );
  const primaryWinnerEntries = publicTeamEntries.filter(
    (entry) => entry.list === "main-draw" || entry.list === "league",
  );
  const winnerEntries =
    primaryWinnerEntries.length > 0
      ? primaryWinnerEntries
      : publicTeamEntries.filter((entry) => entry.list === "qualification");
  const matchIds = basePublicMatches.map((match) => match.id);
  const [
    eventPredictionCounts,
    matchPredictionCounts,
    viewerEventPrediction,
    viewerEventHistory,
    viewerMatchPredictions,
    viewerMatchHistory,
  ] = await Promise.all([
    database
      .select({
        externalTeamId: professionalEventPredictions.externalTeamId,
        count: count(),
      })
      .from(professionalEventPredictions)
      .where(eq(professionalEventPredictions.eventId, event.id))
      .groupBy(professionalEventPredictions.externalTeamId),
    matchIds.length > 0
      ? database
          .select({
            importedMatchId: professionalMatchPredictions.importedMatchId,
            predictedSide: professionalMatchPredictions.predictedSide,
            count: count(),
          })
          .from(professionalMatchPredictions)
          .where(
            inArray(professionalMatchPredictions.importedMatchId, matchIds),
          )
          .groupBy(
            professionalMatchPredictions.importedMatchId,
            professionalMatchPredictions.predictedSide,
          )
      : Promise.resolve([]),
    viewerPersonId
      ? database.query.professionalEventPredictions.findFirst({
          where: and(
            eq(professionalEventPredictions.eventId, event.id),
            eq(professionalEventPredictions.personId, viewerPersonId),
          ),
        })
      : Promise.resolve(undefined),
    viewerPersonId
      ? database
          .select({
            previousExternalTeamId:
              professionalEventPredictionHistory.previousExternalTeamId,
            newExternalTeamId:
              professionalEventPredictionHistory.newExternalTeamId,
            changedAt: professionalEventPredictionHistory.changedAt,
          })
          .from(professionalEventPredictionHistory)
          .where(
            and(
              eq(professionalEventPredictionHistory.eventId, event.id),
              eq(professionalEventPredictionHistory.personId, viewerPersonId),
            ),
          )
          .orderBy(desc(professionalEventPredictionHistory.changedAt))
          .limit(20)
      : Promise.resolve([]),
    viewerPersonId && matchIds.length > 0
      ? database
          .select({
            importedMatchId: professionalMatchPredictions.importedMatchId,
            predictedSide: professionalMatchPredictions.predictedSide,
          })
          .from(professionalMatchPredictions)
          .where(
            and(
              inArray(professionalMatchPredictions.importedMatchId, matchIds),
              eq(professionalMatchPredictions.personId, viewerPersonId),
            ),
          )
      : Promise.resolve([]),
    viewerPersonId && matchIds.length > 0
      ? database
          .select({
            importedMatchId: professionalMatchPredictionHistory.importedMatchId,
            previousSide: professionalMatchPredictionHistory.previousSide,
            newSide: professionalMatchPredictionHistory.newSide,
            changedAt: professionalMatchPredictionHistory.changedAt,
          })
          .from(professionalMatchPredictionHistory)
          .where(
            and(
              inArray(
                professionalMatchPredictionHistory.importedMatchId,
                matchIds,
              ),
              eq(professionalMatchPredictionHistory.personId, viewerPersonId),
            ),
          )
          .orderBy(desc(professionalMatchPredictionHistory.changedAt))
          .limit(500)
      : Promise.resolve([]),
  ]);
  const matchCountById = new Map<string, { A: number; B: number }>();
  for (const prediction of matchPredictionCounts) {
    const counts = matchCountById.get(prediction.importedMatchId) ?? {
      A: 0,
      B: 0,
    };
    if (prediction.predictedSide === "A") counts.A = Number(prediction.count);
    if (prediction.predictedSide === "B") counts.B = Number(prediction.count);
    matchCountById.set(prediction.importedMatchId, counts);
  }
  const viewerMatchById = new Map(
    viewerMatchPredictions.flatMap((prediction) =>
      prediction.predictedSide === "A" || prediction.predictedSide === "B"
        ? [[prediction.importedMatchId, prediction.predictedSide] as const]
        : [],
    ),
  );
  const viewerMatchHistoryById = new Map<
    string,
    {
      previousSide?: "A" | "B";
      newSide: "A" | "B";
      changedAt: string;
    }[]
  >();
  for (const history of viewerMatchHistory) {
    if (history.newSide !== "A" && history.newSide !== "B") continue;
    const rows = viewerMatchHistoryById.get(history.importedMatchId) ?? [];
    rows.push({
      ...(history.previousSide === "A" || history.previousSide === "B"
        ? { previousSide: history.previousSide }
        : {}),
      newSide: history.newSide,
      changedAt: history.changedAt.toISOString(),
    });
    viewerMatchHistoryById.set(history.importedMatchId, rows);
  }
  const publicMatches: readonly PublicProMatch[] = basePublicMatches.map(
    (match) => {
      const counts = matchCountById.get(match.id) ?? { A: 0, B: 0 };
      const total = counts.A + counts.B;
      const teamA = total > 0 ? Math.round((counts.A / total) * 100) : 50;
      return {
        ...match,
        communityPrediction: {
          total,
          teamACount: counts.A,
          teamBCount: counts.B,
          teamA,
          teamB: 100 - teamA,
          viewerAuthenticated: Boolean(viewerPersonId),
          ...(viewerMatchById.get(match.id)
            ? { viewerSide: viewerMatchById.get(match.id) }
            : {}),
          viewerHistory: viewerMatchHistoryById.get(match.id) ?? [],
          closed: match.communityPrediction.closed,
        },
      };
    },
  );
  const eventPredictionCountByTeam = new Map(
    eventPredictionCounts.map((prediction) => [
      prediction.externalTeamId,
      Number(prediction.count),
    ]),
  );
  const totalEventPredictions = [...eventPredictionCountByTeam.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const systemPick = [...winnerEntries].sort((a, b) => {
    const average = (entry: (typeof winnerEntries)[number]) => {
      const values = entry.players.flatMap((player) =>
        player.rating !== undefined ? [player.rating] : [],
      );
      return values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : undefined;
    };
    const ratingA = average(a);
    const ratingB = average(b);
    if (ratingA !== undefined || ratingB !== undefined) {
      return (ratingB ?? -Infinity) - (ratingA ?? -Infinity);
    }
    return (
      (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER)
    );
  })[0];
  const winnerPrediction = {
    total: totalEventPredictions,
    closed: event.status === "completed",
    viewerAuthenticated: Boolean(viewerPersonId),
    ...(viewerEventPrediction
      ? { viewerExternalTeamId: viewerEventPrediction.externalTeamId }
      : {}),
    systemPickExternalTeamId: systemPick?.externalTeamId,
    entries: winnerEntries.map((entry) => {
      const predictionCount =
        eventPredictionCountByTeam.get(entry.externalTeamId) ?? 0;
      const rated = entry.players.flatMap((player) =>
        player.rating !== undefined ? [player.rating] : [],
      );
      return {
        externalTeamId: entry.externalTeamId,
        label: entry.label,
        countryCode: entry.countryCode,
        seed: entry.seed,
        averageRating:
          rated.length > 0
            ? rated.reduce((sum, rating) => sum + rating, 0) / rated.length
            : undefined,
        predictionCount,
        percentage:
          totalEventPredictions > 0
            ? Math.round((predictionCount / totalEventPredictions) * 100)
            : 0,
      };
    }),
    history: viewerEventHistory.map((history) => ({
      previousExternalTeamId: history.previousExternalTeamId ?? undefined,
      newExternalTeamId: history.newExternalTeamId,
      previousLabel: history.previousExternalTeamId
        ? winnerEntries.find(
            (entry) => entry.externalTeamId === history.previousExternalTeamId,
          )?.label
        : undefined,
      newLabel:
        winnerEntries.find(
          (entry) => entry.externalTeamId === history.newExternalTeamId,
        )?.label ?? history.newExternalTeamId,
      changedAt: history.changedAt.toISOString(),
    })),
  };
  const poolMap = new Map<string, PublicProMatch[]>();
  const bracketMap = new Map<
    string,
    {
      label: string;
      order: number;
      matches: PublicProMatch[];
    }
  >();
  for (const match of publicMatches) {
    const pool = poolName(match.roundLabel);
    if (pool) {
      poolMap.set(pool, [...(poolMap.get(pool) ?? []), match]);
      continue;
    }
    const round = bracketRound(match.roundLabel);
    if (!round) continue;
    const existing = bracketMap.get(round.key);
    if (existing) existing.matches.push(match);
    else {
      bracketMap.set(round.key, {
        label: round.label,
        order: round.order,
        matches: [match],
      });
    }
  }
  return {
    id: event.id,
    slug: eventSlug,
    externalEventId: event.externalEventId,
    name: effective.name,
    location: effective.location,
    countryCode: event.countryCode ?? undefined,
    category: effective.category,
    source: professionalSource(sourceSlug),
    tour: professionalTour(sourceSlug, effective.category),
    genderCategory: event.genderCategory,
    startsOn: effective.startsOn,
    endsOn: effective.endsOn,
    status: event.status,
    live: event.live,
    teamCount:
      avpLeague && avpLeague.overall.length > 0
        ? avpLeague.overall.length
        : event.teamCount,
    matchCount: Math.max(event.matchCount, publicMatches.length),
    completedMatchCount: publicMatches.filter(
      (match) => match.status === "completed",
    ).length,
    liveMatchCount: publicMatches.filter((match) => match.status === "live")
      .length,
    currentRound: professionalEventCurrentRound(publicMatches, now),
    sourceUrl: event.sourceUrl,
    lastSyncedAt: event.lastSyncedAt.toISOString(),
    teamEntries: publicTeamEntries,
    avpLeague,
    editorial: {
      summary: publicEditorial.summary,
      venueName: publicEditorial.venueName,
      venueAddress: publicEditorial.venueAddress,
      venue: publicEditorial.venue,
      timezone: publicEditorial.timezone,
      ticketUrl: publicEditorial.ticketUrl,
      media: publicEditorial.media,
    },
    watchOptions: eventWatchOptions,
    winnerPrediction,
    sibling: sibling
      ? {
          name: sibling.name,
          genderCategory: sibling.genderCategory,
          slug: professionalEventSlug(sibling),
          status: sibling.status,
        }
      : undefined,
    podium: podiumFromMatches(publicMatches),
    pools: [...poolMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, poolMatches]) => ({
        name,
        completedMatches: poolMatches.filter(
          (match) => match.status === "completed",
        ).length,
        matchCount: poolMatches.length,
        standings: standingRows(poolMatches),
        matches: poolMatches,
      })),
    liveStandings: liveStandingRows(publicMatches),
    bracket: [...bracketMap.entries()]
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key, round]) => ({
        key,
        label: round.label,
        matches: round.matches,
      })),
    matches: publicMatches,
  };
}

async function storedProfessionalEventBySlug(slug: string) {
  const rows = await getDatabase()
    .select()
    .from(professionalEvents)
    .orderBy(desc(professionalEvents.startsOn))
    .limit(500);
  return rows.find((event) => professionalEventSlug(event) === slug);
}

export async function saveProfessionalEventPrediction(input: {
  readonly actor: ApiActor;
  readonly eventSlug: string;
  readonly externalTeamId: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const now = input.now ?? new Date();
  const event = await storedProfessionalEventBySlug(input.eventSlug);
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The event was not found.",
    );
  }
  if (event.status === "completed") {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "Tournament winner picks are closed after the event is complete.",
    );
  }
  const entries = rawProfessionalTeamEntries(event.rawPayload);
  const primary = entries.filter(
    (entry) => entry.list === "main-draw" || entry.list === "league",
  );
  const eligible =
    primary.length > 0
      ? primary
      : entries.filter((entry) => entry.list === "qualification");
  const team = eligible.find(
    (entry) => entry.externalTeamId === input.externalTeamId,
  );
  if (!team) {
    throw new SandDataServiceError(
      "INVALID_PROFESSIONAL_EVENT",
      "Choose a team in this tournament's active draw.",
    );
  }
  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(professionalEventPredictions)
      .where(
        and(
          eq(professionalEventPredictions.eventId, event.id),
          eq(professionalEventPredictions.personId, input.actor.personId),
        ),
      )
      .limit(1);
    if (existing?.externalTeamId === team.externalTeamId) {
      return {
        eventId: event.id,
        externalTeamId: team.externalTeamId,
        changed: false as const,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }
    await transaction.insert(professionalEventPredictionHistory).values({
      eventId: event.id,
      personId: input.actor.personId,
      previousExternalTeamId: existing?.externalTeamId,
      newExternalTeamId: team.externalTeamId,
      changedAt: now,
    });
    const [saved] = await transaction
      .insert(professionalEventPredictions)
      .values({
        eventId: event.id,
        personId: input.actor.personId,
        externalTeamId: team.externalTeamId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          professionalEventPredictions.eventId,
          professionalEventPredictions.personId,
        ],
        set: { externalTeamId: team.externalTeamId, updatedAt: now },
      })
      .returning();
    if (!saved) throw new Error("Duna could not save the tournament pick.");
    return {
      eventId: event.id,
      externalTeamId: saved.externalTeamId,
      changed: true as const,
      updatedAt: saved.updatedAt.toISOString(),
    };
  });
}

export async function saveProfessionalMatchPrediction(input: {
  readonly actor: ApiActor;
  readonly eventSlug: string;
  readonly matchId: string;
  readonly predictedSide: "A" | "B";
  readonly now?: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const now = input.now ?? new Date();
  const event = await storedProfessionalEventBySlug(input.eventSlug);
  if (!event) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The event was not found.",
    );
  }
  const match = await database.query.importedMatches.findFirst({
    where: and(
      eq(importedMatches.id, input.matchId),
      eq(importedMatches.sourceId, event.sourceId),
      eq(importedMatches.externalEventId, event.externalEventId),
    ),
  });
  if (!match) {
    throw new SandDataServiceError(
      "MATCH_NOT_FOUND",
      "The match was not found.",
    );
  }
  const editorial = effectiveProfessionalEvent(event).editorial;
  const scheduledAt = professionalMatchScheduledAt({
    playedAt: match.playedAt ?? undefined,
    time: objectString(match.rawPayload, "time"),
    timezone: objectString(match.rawPayload, "timezone") ?? editorial.timezone,
  });
  const status = professionalMatchStatus({
    winnerSide: match.winnerSide,
    eventLive: event.live,
    hasScore: match.sets.length > 0,
    scheduledAt,
    now,
  });
  if (
    professionalMatchPredictionClosed({
      status,
      eventStatus: event.status,
      scheduledAt,
      now,
    })
  ) {
    throw new SandDataServiceError(
      "MATCH_NOT_READY",
      "Match picks close when the match begins.",
    );
  }
  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(professionalMatchPredictions)
      .where(
        and(
          eq(professionalMatchPredictions.importedMatchId, match.id),
          eq(professionalMatchPredictions.personId, input.actor.personId),
        ),
      )
      .limit(1);
    if (existing?.predictedSide === input.predictedSide) {
      return {
        matchId: match.id,
        predictedSide: input.predictedSide,
        changed: false as const,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }
    await transaction.insert(professionalMatchPredictionHistory).values({
      importedMatchId: match.id,
      personId: input.actor.personId,
      previousSide: existing?.predictedSide,
      newSide: input.predictedSide,
      changedAt: now,
    });
    const [saved] = await transaction
      .insert(professionalMatchPredictions)
      .values({
        importedMatchId: match.id,
        personId: input.actor.personId,
        predictedSide: input.predictedSide,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          professionalMatchPredictions.importedMatchId,
          professionalMatchPredictions.personId,
        ],
        set: { predictedSide: input.predictedSide, updatedAt: now },
      })
      .returning();
    if (!saved) throw new Error("Duna could not save the match pick.");
    return {
      matchId: match.id,
      predictedSide:
        saved.predictedSide === "B" ? ("B" as const) : ("A" as const),
      changed: true as const,
      updatedAt: saved.updatedAt.toISOString(),
    };
  });
}

function teamIdentity(
  players: readonly { readonly personId?: string; readonly name: string }[],
  usePersonIds: boolean,
): string {
  return (
    usePersonIds
      ? players.map((player) => player.personId ?? "")
      : players.map((player) => normalizePersonName(player.name))
  )
    .sort()
    .join(":");
}

async function loadProfessionalHeadToHead(
  match: PublicProMatch,
  event: Awaited<ReturnType<typeof loadPublicProEvent>>,
) {
  if (!event) {
    return { total: 0, teamAWins: 0, teamBWins: 0, meetings: [] as const };
  }
  const database = getDatabase();
  const currentRow = await database.query.importedMatches.findFirst({
    where: eq(importedMatches.id, match.id),
  });
  if (!currentRow) {
    return { total: 0, teamAWins: 0, teamBWins: 0, meetings: [] as const };
  }
  const currentPlayers = [...match.teamA.players, ...match.teamB.players];
  const usePersonIds =
    currentPlayers.length === 4 &&
    currentPlayers.every((player) => Boolean(player.personId));
  const personIds = usePersonIds
    ? currentPlayers.flatMap((player) =>
        player.personId ? [player.personId] : [],
      )
    : [];
  const containment = personIds.map(
    (personId) =>
      sql`${importedMatches.participants} @> ${JSON.stringify([{ personId }])}::jsonb`,
  );
  const candidates = await database
    .select({ match: importedMatches, sourceSlug: importSources.slug })
    .from(importedMatches)
    .innerJoin(importSources, eq(importedMatches.sourceId, importSources.id))
    .where(
      and(
        ne(importedMatches.id, match.id),
        isNotNull(importedMatches.winnerSide),
        ...(match.playedAt
          ? [lte(importedMatches.playedAt, new Date(match.playedAt))]
          : []),
        ...containment,
      ),
    )
    .orderBy(desc(importedMatches.playedAt))
    .limit(usePersonIds ? 100 : 2_000);
  const eventRows = await database
    .select({ event: professionalEvents, sourceSlug: importSources.slug })
    .from(professionalEvents)
    .innerJoin(importSources, eq(professionalEvents.sourceId, importSources.id))
    .orderBy(desc(professionalEvents.startsOn))
    .limit(500);
  const teamAKey = teamIdentity(match.teamA.players, usePersonIds);
  const teamBKey = teamIdentity(match.teamB.players, usePersonIds);
  const sourcePriority: Readonly<Record<string, number>> = {
    "fivb-12ndr": 0,
    "avp-league": 1,
    "volleyball-world": 2,
    bvbinfo: 3,
    "volleyball-life": 4,
    sandrating: 5,
  };
  candidates.sort(
    (a, b) =>
      (b.match.playedAt?.getTime() ?? 0) - (a.match.playedAt?.getTime() ?? 0) ||
      (sourcePriority[a.sourceSlug] ?? 99) -
        (sourcePriority[b.sourceSlug] ?? 99),
  );
  const seen = new Set<string>([currentRow.crossSourceFingerprint]);
  const meetings: {
    id: string;
    eventName: string;
    roundLabel?: string;
    playedAt?: string;
    teamALabel: string;
    teamBLabel: string;
    sets: readonly { a: number; b: number }[];
    winnerSide: "A" | "B";
    source: string;
    sourceUrl?: string;
    canonicalPath?: string;
  }[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.match.crossSourceFingerprint)) continue;
    const sideA = candidate.match.participants.filter(
      (participant) => participant.side === "A",
    );
    const sideB = candidate.match.participants.filter(
      (participant) => participant.side === "B",
    );
    const candidateAKey = teamIdentity(sideA, usePersonIds);
    const candidateBKey = teamIdentity(sideB, usePersonIds);
    const direct = candidateAKey === teamAKey && candidateBKey === teamBKey;
    const reversed = candidateAKey === teamBKey && candidateBKey === teamAKey;
    if (!direct && !reversed) continue;
    const winnerSide =
      candidate.match.winnerSide === (reversed ? "B" : "A") ? "A" : "B";
    const sets = reversed
      ? candidate.match.sets.map((set) => ({ a: set.b, b: set.a }))
      : candidate.match.sets;
    const pastEvent = eventRows.find(
      (row) =>
        row.event.sourceId === candidate.match.sourceId &&
        row.event.externalEventId === candidate.match.externalEventId,
    );
    const pastTeamA = direct ? sideA : sideB;
    const pastTeamB = direct ? sideB : sideA;
    const teamALabel = pastTeamA.map((player) => player.name).join(" / ");
    const teamBLabel = pastTeamB.map((player) => player.name).join(" / ");
    const pastMatchSlug =
      slugSegment(`${teamALabel}-vs-${teamBLabel}`) || "match";
    seen.add(candidate.match.crossSourceFingerprint);
    meetings.push({
      id: candidate.match.id,
      eventName: pastEvent?.event.name ?? candidate.match.title,
      ...(candidate.match.roundLabel
        ? { roundLabel: candidate.match.roundLabel }
        : {}),
      ...(candidate.match.playedAt
        ? { playedAt: candidate.match.playedAt.toISOString() }
        : {}),
      teamALabel,
      teamBLabel,
      sets,
      winnerSide,
      source: candidate.sourceSlug,
      ...(candidate.match.sourceUrl
        ? { sourceUrl: candidate.match.sourceUrl }
        : {}),
      ...(pastEvent
        ? {
            canonicalPath: `/events/${professionalEventSlug(pastEvent.event)}/match/${pastMatchSlug}/${candidate.match.id}`,
          }
        : {}),
    });
    if (meetings.length >= 12) break;
  }
  return {
    total: meetings.length,
    teamAWins: meetings.filter((meeting) => meeting.winnerSide === "A").length,
    teamBWins: meetings.filter((meeting) => meeting.winnerSide === "B").length,
    meetings,
  };
}

export async function loadPublicProMatch(
  eventSlug: string,
  matchId: string,
  viewerPersonId?: string,
  now = new Date(),
) {
  const event = await loadPublicProEvent(eventSlug, viewerPersonId, now);
  if (!event) return undefined;
  const match = event.matches.find((candidate) => candidate.id === matchId);
  if (!match) return undefined;
  return {
    event,
    match,
    headToHead: await loadProfessionalHeadToHead(match, event),
  };
}

export async function loadPublicPlayerPerformance(personId: string) {
  requireDatabase();
  const database = getDatabase();
  const [eventRows, externalRows, latestRanking] = await Promise.all([
    database
      .select({
        id: ratingEvents.id,
        matchId: ratingEvents.matchId,
        before: ratingEvents.before,
        after: ratingEvents.after,
        explanation: ratingEvents.explanation,
        verificationWeightBps: ratingEvents.verificationWeightBps,
        createdAt: ratingEvents.createdAt,
        completedAt: matches.completedAt,
        startedAt: matches.startedAt,
        scheduledAt: matches.scheduledAt,
        matchCreatedAt: matches.createdAt,
        importedMatchId: importedMatches.id,
        matchTitle: importedMatches.title,
        sourceUrl: importedMatches.sourceUrl,
        sets: importedMatches.sets,
        participants: importedMatches.participants,
        professionalEventName: professionalEvents.name,
        professionalEventGenderCategory: professionalEvents.genderCategory,
        professionalEventStartsOn: professionalEvents.startsOn,
      })
      .from(ratingEvents)
      .leftJoin(matches, eq(matches.id, ratingEvents.matchId))
      .leftJoin(
        importedMatches,
        and(
          eq(importedMatches.canonicalMatchId, ratingEvents.matchId),
          eq(importedMatches.importState, "approved"),
        ),
      )
      .leftJoin(
        professionalEvents,
        and(
          eq(professionalEvents.sourceId, importedMatches.sourceId),
          eq(
            professionalEvents.externalEventId,
            importedMatches.externalEventId,
          ),
        ),
      )
      .where(eq(ratingEvents.personId, personId))
      .orderBy(desc(ratingEvents.createdAt))
      .limit(100),
    database
      .select({
        id: externalPlayerProfiles.id,
        source: importSources.name,
        sourceSlug: importSources.slug,
        profileUrl: externalPlayerProfiles.profileUrl,
        externalRating: externalPlayerProfiles.externalRating,
        externalRatingConfidence:
          externalPlayerProfiles.externalRatingConfidence,
        externalMatchCount: externalPlayerProfiles.externalMatchCount,
        isProfessional: externalPlayerProfiles.isProfessional,
        lastImportedAt: externalPlayerProfiles.lastImportedAt,
      })
      .from(externalPlayerProfiles)
      .innerJoin(
        importSources,
        eq(externalPlayerProfiles.sourceId, importSources.id),
      )
      .where(eq(externalPlayerProfiles.personId, personId)),
    database
      .select()
      .from(worldRankings)
      .where(eq(worldRankings.personId, personId))
      .orderBy(desc(worldRankings.rankingDate), asc(worldRankings.rank))
      .limit(1),
  ]);
  const latestBacktest = await database.query.ratingBacktestRuns.findFirst({
    where: eq(ratingBacktestRuns.status, "completed"),
    orderBy: [desc(ratingBacktestRuns.completedAt)],
  });
  const backtestPredictions =
    latestBacktest && eventRows.length > 0
      ? await database
          .select({
            matchId: ratingBacktestPredictions.matchId,
            actualTeamA: ratingBacktestPredictions.actualTeamA,
            probabilities: ratingBacktestPredictions.probabilities,
            preMatchRatings: ratingBacktestPredictions.preMatchRatings,
          })
          .from(ratingBacktestPredictions)
          .where(
            and(
              eq(ratingBacktestPredictions.runId, latestBacktest.id),
              inArray(
                ratingBacktestPredictions.matchId,
                eventRows.map((event) => event.matchId),
              ),
            ),
          )
      : [];
  const backtestByMatchId = new Map(
    backtestPredictions.map((prediction) => [prediction.matchId, prediction]),
  );
  const participantPersonIds = [
    ...new Set(
      eventRows.flatMap((event) =>
        (event.participants ?? []).flatMap((participant) =>
          participant.personId ? [participant.personId] : [],
        ),
      ),
    ),
  ];
  const [participantProfiles, participantRankingRows] =
    participantPersonIds.length > 0
      ? await Promise.all([
          database
            .select({
              id: people.id,
              handle: people.handle,
              displayName: people.displayName,
              avatarUrl: people.avatarUrl,
              homeMarket: people.homeMarket,
              profileClaimStatus: people.profileClaimStatus,
              isProfessional: people.isProfessional,
              countryCode: playerPublicProfiles.countryCode,
              sandRating: ratings.display,
              ratedMatches: ratings.ratedMatches,
            })
            .from(people)
            .leftJoin(
              playerPublicProfiles,
              and(
                eq(playerPublicProfiles.personId, people.id),
                eq(playerPublicProfiles.publicationStatus, "published"),
              ),
            )
            .leftJoin(
              ratings,
              and(
                eq(ratings.personId, people.id),
                eq(ratings.discipline, "beach-2s"),
              ),
            )
            .where(
              and(
                inArray(people.id, participantPersonIds),
                eq(people.status, "active"),
                eq(people.profileVisibility, "public"),
                eq(people.isMinor, false),
              ),
            ),
          database
            .select({
              personId: worldRankings.personId,
              countryCode: worldRankings.countryCode,
              rankingDate: worldRankings.rankingDate,
            })
            .from(worldRankings)
            .where(inArray(worldRankings.personId, participantPersonIds))
            .orderBy(desc(worldRankings.rankingDate)),
        ])
      : [[], []];
  const participantRankingCountry = new Map<string, string>();
  for (const ranking of participantRankingRows) {
    if (
      ranking.personId &&
      ranking.countryCode &&
      !participantRankingCountry.has(ranking.personId)
    ) {
      participantRankingCountry.set(ranking.personId, ranking.countryCode);
    }
  }
  const world = latestRanking[0];
  return {
    history: eventRows.map((event) => {
      const backtest = backtestByMatchId.get(event.matchId);
      const side = (event.participants ?? []).find(
        (participant) => participant.personId === personId,
      )?.side;
      const scoreAwareProbability =
        typeof backtest?.probabilities["duna-score-aware"] === "number"
          ? backtest.probabilities["duna-score-aware"]
          : undefined;
      const walkForwardWinProbability =
        scoreAwareProbability === undefined || !side
          ? undefined
          : side === "A"
            ? scoreAwareProbability
            : 1 - scoreAwareProbability;
      const walkForwardActualWin =
        backtest && side
          ? side === "A"
            ? backtest.actualTeamA === 1
            : backtest.actualTeamA === 0
          : undefined;
      const participants = event.participants ?? [];
      const canonicalMatchPath =
        event.importedMatchId &&
        event.professionalEventName &&
        event.professionalEventGenderCategory
          ? professionalMatchCanonicalPath({
              event: {
                name: event.professionalEventName,
                genderCategory: event.professionalEventGenderCategory,
                startsOn: event.professionalEventStartsOn,
              },
              matchId: event.importedMatchId,
              participants,
            })
          : event.importedMatchId
            ? `/matches/${event.matchId}`
            : undefined;
      return {
        id: event.id,
        matchId: event.matchId,
        ...(canonicalMatchPath ? { canonicalMatchPath } : {}),
        beforeDisplay:
          typeof event.before.display === "number" ? event.before.display : 3,
        afterDisplay:
          typeof event.after.display === "number" ? event.after.display : 3,
        delta:
          typeof event.explanation.displayDelta === "number"
            ? event.explanation.displayDelta
            : 0,
        expectedWinProbability:
          typeof event.explanation.expectedWinProbability === "number"
            ? event.explanation.expectedWinProbability
            : 0.5,
        actualResult:
          typeof event.explanation.actualResult === "number"
            ? event.explanation.actualResult
            : 0,
        pointShare:
          typeof event.explanation.pointShare === "number"
            ? event.explanation.pointShare
            : 0,
        verificationWeightBps: event.verificationWeightBps,
        occurredAt: (
          event.completedAt ??
          event.startedAt ??
          event.scheduledAt ??
          event.matchCreatedAt ??
          event.createdAt
        ).toISOString(),
        matchTitle: event.matchTitle ?? "Duna match",
        sourceUrl: event.sourceUrl ?? undefined,
        sets: event.sets ?? [],
        participants,
        ...(walkForwardWinProbability === undefined
          ? {}
          : {
              walkForwardPrediction: {
                methodologyVersion: latestBacktest?.methodologyVersion ?? "",
                winProbability: walkForwardWinProbability,
                actualWin: walkForwardActualWin ?? false,
                preMatchRating:
                  backtest?.preMatchRatings.players?.[personId] ?? undefined,
              },
            }),
      };
    }),
    sources: externalRows.map((source) => ({
      id: source.id,
      source:
        source.sourceSlug === "sandrating"
          ? "Duna match archive"
          : source.source,
      ...(source.sourceSlug === "sandrating" || !source.profileUrl
        ? {}
        : { profileUrl: source.profileUrl }),
      externalRating: source.externalRating ?? undefined,
      externalRatingConfidence: source.externalRatingConfidence ?? undefined,
      externalMatchCount: source.externalMatchCount ?? undefined,
      isProfessional: source.isProfessional,
      lastImportedAt: source.lastImportedAt?.toISOString(),
    })),
    participantProfiles: participantProfiles.map((profile) => {
      const countryCode =
        profile.countryCode ?? participantRankingCountry.get(profile.id);
      return {
        id: profile.id,
        handle: profile.handle,
        displayName: profile.displayName,
        publicPath: publicPlayerPath({
          id: profile.id,
          displayName: profile.displayName,
          handle: profile.handle,
          homeMarket: profile.homeMarket,
          countryCode,
          profileClaimStatus: profile.profileClaimStatus as
            "claimed" | "unclaimed" | "claim-pending" | "merged",
        }),
        avatarUrl: profile.avatarUrl ?? undefined,
        homeMarket: profile.homeMarket ?? undefined,
        countryCode,
        isProfessional: profile.isProfessional,
        sandRating: profile.sandRating ?? undefined,
        ratedMatches: profile.ratedMatches ?? undefined,
      };
    }),
    worldRanking: world
      ? {
          rank: world.rank,
          points: world.points,
          countryCode: world.countryCode ?? undefined,
          genderCategory: world.genderCategory,
          rankingDate: world.rankingDate,
          previousRank: world.previousRank ?? undefined,
          signal: worldRankingSignal(world.rank),
        }
      : undefined,
  };
}

export async function loadPublicPlayerPerformanceByHandle(handle: string) {
  requireDatabase();
  const person = await getDatabase().query.people.findFirst({
    where: and(
      eq(people.handle, handle),
      eq(people.status, "active"),
      eq(people.profileVisibility, "public"),
      eq(people.isMinor, false),
    ),
  });
  return person ? loadPublicPlayerPerformance(person.id) : undefined;
}

export type PlayerSourceConnectionSource = "volleyball-life" | "bvbinfo";

export function parsePlayerSourceProfile(
  source: PlayerSourceConnectionSource,
  value: string,
): {
  readonly externalId: string;
  readonly profileUrl: string;
  readonly apiProfileUrl?: string;
} {
  const trimmed = value.trim();
  if (/^\d{1,12}$/.test(trimmed) && Number.parseInt(trimmed, 10) > 0) {
    return source === "volleyball-life"
      ? {
          externalId: String(Number.parseInt(trimmed, 10)),
          profileUrl: `https://volleyballlife.com/player/${Number.parseInt(trimmed, 10)}`,
          apiProfileUrl: `https://api-v8.volleyballlife.com/playerprofile/${Number.parseInt(trimmed, 10)}`,
        }
      : {
          externalId: String(Number.parseInt(trimmed, 10)),
          profileUrl: `http://www.bvbinfo.com/player.asp?ID=${Number.parseInt(trimmed, 10)}&Page=1`,
        };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SandDataServiceError(
      "INVALID_PROFILE_URL",
      "Paste a complete profile URL or the numeric player ID.",
    );
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (source === "volleyball-life") {
    const match = url.pathname.match(/\/(?:player|playerprofile)\/(\d+)/i);
    if (
      !["volleyballlife.com", "api-v8.volleyballlife.com"].includes(hostname) ||
      !match?.[1]
    ) {
      throw new SandDataServiceError(
        "INVALID_PROFILE_URL",
        "Use a VolleyballLife player profile URL.",
      );
    }
    return {
      externalId: String(Number.parseInt(match[1], 10)),
      profileUrl: `https://volleyballlife.com/player/${Number.parseInt(match[1], 10)}`,
      apiProfileUrl: `https://api-v8.volleyballlife.com/playerprofile/${Number.parseInt(match[1], 10)}`,
    };
  }
  const externalId =
    url.searchParams.get("ID") ?? url.searchParams.get("id") ?? "";
  if (
    hostname !== "bvbinfo.com" ||
    !/^\d{1,12}$/.test(externalId) ||
    Number.parseInt(externalId, 10) < 1
  ) {
    throw new SandDataServiceError(
      "INVALID_PROFILE_URL",
      "Use a BVBInfo player profile URL.",
    );
  }
  return {
    externalId: String(Number.parseInt(externalId, 10)),
    profileUrl: `http://www.bvbinfo.com/player.asp?ID=${Number.parseInt(externalId, 10)}&Page=1`,
  };
}

async function workflowActor(personId: string): Promise<ApiActor> {
  const person = await getDatabase().query.people.findFirst({
    where: eq(people.id, personId),
  });
  if (!person) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "The player requesting this import was not found.",
    );
  }
  const roles = ["player"] as const;
  return {
    personId: person.id,
    displayName: person.displayName,
    roles,
    scopes: scopesForRoles(roles),
    ageBand:
      person.ageBand === "under-13" ||
      person.ageBand === "teen" ||
      person.ageBand === "adult"
        ? person.ageBand
        : "unknown",
    isDemo: false,
  };
}

export async function queuePlayerSourceConnection(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
  readonly source: PlayerSourceConnectionSource;
  readonly profileUrl: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const subject = await assertProfileSubjectAuthority({
    actor: input.actor,
    subjectPersonId: input.subjectPersonId,
  });
  if (
    input.source === "bvbinfo" &&
    !subject.isProfessional &&
    subject.playingExperience !== "professional"
  ) {
    throw new SandDataServiceError(
      "PROFESSIONAL_REQUIRED",
      "BVBInfo linking is available after the player is marked Professional.",
    );
  }
  const parsed = parsePlayerSourceProfile(input.source, input.profileUrl);
  const occupied = await database.query.playerSourceConnections.findFirst({
    where: and(
      eq(playerSourceConnections.source, input.source),
      eq(playerSourceConnections.externalPersonId, parsed.externalId),
    ),
  });
  if (occupied && occupied.personId !== subject.id) {
    throw new SandDataServiceError(
      "MAPPING_CONFLICT",
      "This source profile is already connected to another Duna player. Send it to profile review instead.",
    );
  }
  if (occupied) {
    const [activeJob] = await database
      .select({ id: workflowJobs.id })
      .from(workflowJobs)
      .where(
        and(
          eq(workflowJobs.kind, "sand.profile-import"),
          inArray(workflowJobs.status, ["queued", "running", "retry"]),
          sql`${workflowJobs.payload} ->> 'connectionId' = ${occupied.id}`,
        ),
      )
      .orderBy(asc(workflowJobs.createdAt))
      .limit(1);
    if (activeJob) {
      return {
        connectionId: occupied.id,
        jobId: activeJob.id,
        status: "queued" as const,
        source: input.source,
        profileUrl: parsed.profileUrl,
        apiProfileUrl: parsed.apiProfileUrl,
      };
    }
  }
  const connectionId = occupied?.id ?? crypto.randomUUID();
  await database
    .insert(playerSourceConnections)
    .values({
      id: connectionId,
      personId: subject.id,
      source: input.source,
      externalPersonId: parsed.externalId,
      profileUrl: parsed.profileUrl,
      apiProfileUrl: parsed.apiProfileUrl,
      verificationStatus: "pending",
      status: "queued",
      progressPhase: "queued",
      progressCurrent: 0,
      progressTotal: 0,
      matchesFound: 0,
      profilesFound: 0,
      lastError: null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [
        playerSourceConnections.personId,
        playerSourceConnections.source,
      ],
      set: {
        externalPersonId: parsed.externalId,
        profileUrl: parsed.profileUrl,
        apiProfileUrl: parsed.apiProfileUrl,
        verificationStatus: "pending",
        verifiedAt: null,
        status: "queued",
        progressPhase: "queued",
        progressCurrent: 0,
        progressTotal: 0,
        matchesFound: 0,
        profilesFound: 0,
        lastError: null,
        updatedAt: input.now,
      },
    });
  const connection = await database.query.playerSourceConnections.findFirst({
    where: and(
      eq(playerSourceConnections.personId, subject.id),
      eq(playerSourceConnections.source, input.source),
    ),
  });
  if (!connection) throw new Error("Source connection could not be created");
  const [activeJob] = await database
    .select({
      id: workflowJobs.id,
    })
    .from(workflowJobs)
    .where(
      and(
        eq(workflowJobs.kind, "sand.profile-import"),
        inArray(workflowJobs.status, ["queued", "running", "retry"]),
        sql`${workflowJobs.payload} ->> 'connectionId' = ${connection.id}`,
      ),
    )
    .orderBy(asc(workflowJobs.createdAt))
    .limit(1);
  if (activeJob) {
    return {
      connectionId: connection.id,
      jobId: activeJob.id,
      status: "queued" as const,
      source: input.source,
      profileUrl: parsed.profileUrl,
      apiProfileUrl: parsed.apiProfileUrl,
    };
  }
  const jobId = crypto.randomUUID();
  await database.batch([
    database.insert(workflowJobs).values({
      id: jobId,
      kind: "sand.profile-import",
      idempotencyKey: `sand-profile:${connection.id}:${input.idempotencyKey}`,
      payload: {
        connectionId: connection.id,
        requestedByPersonId: input.actor.personId,
        subjectPersonId: subject.id,
        source: input.source,
        externalId: parsed.externalId,
        requestId: input.requestId,
      },
      traceId: input.requestId,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "sand-data.profile-import.queued",
      entityType: "player-source-connection",
      entityId: connection.id,
      afterHash: stableHash({
        personId: subject.id,
        source: input.source,
        externalId: parsed.externalId,
      }),
      reason:
        "Player or connected guardian queued a source-owned match-history import.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    connectionId: connection.id,
    jobId,
    status: "queued" as const,
    source: input.source,
    profileUrl: parsed.profileUrl,
    apiProfileUrl: parsed.apiProfileUrl,
  };
}

function personNameVariants(
  person: Pick<
    typeof people.$inferSelect,
    | "displayName"
    | "givenName"
    | "familyName"
    | "legalGivenName"
    | "legalMiddleName"
    | "legalFamilyName"
  >,
): Set<string> {
  const variants = [
    person.displayName,
    [person.givenName, person.familyName].filter(Boolean).join(" "),
    [person.legalGivenName, person.legalFamilyName].filter(Boolean).join(" "),
    [person.legalGivenName, person.legalMiddleName, person.legalFamilyName]
      .filter(Boolean)
      .join(" "),
  ];
  return new Set(
    variants
      .map((value) => normalizePersonName(value))
      .filter((value) => value.length > 0),
  );
}

export async function requestProfileClaim(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
  readonly targetHandle: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const subject = await assertProfileSubjectAuthority({
    actor: input.actor,
    subjectPersonId: input.subjectPersonId,
  });
  const target = await database.query.people.findFirst({
    where: and(
      eq(people.handle, input.targetHandle),
      eq(people.status, "active"),
      eq(people.isMinor, false),
    ),
  });
  if (!target) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "That public player profile is no longer available.",
    );
  }
  if (target.id === subject.id) {
    throw new SandDataServiceError(
      "CLAIM_CONFLICT",
      "This profile is already connected to your account.",
    );
  }
  if (target.profileClaimStatus === "claimed") {
    throw new SandDataServiceError(
      "CLAIM_CONFLICT",
      "This player profile already has an owner. Use account recovery or ask Duna support to review it.",
    );
  }
  if (target.profileClaimStatus === "merged") {
    throw new SandDataServiceError(
      "CLAIM_CONFLICT",
      "This player profile has already been consolidated into another profile.",
    );
  }

  const [targetSources, targetRanking] = await Promise.all([
    database
      .select({
        normalizedName: externalPlayerProfiles.normalizedName,
        displayName: externalPlayerProfiles.displayName,
        birthDate: externalPlayerProfiles.birthDate,
        profileUrl: externalPlayerProfiles.profileUrl,
        sourceSlug: importSources.slug,
        sourceName: importSources.name,
        isProfessional: externalPlayerProfiles.isProfessional,
      })
      .from(externalPlayerProfiles)
      .innerJoin(
        importSources,
        eq(externalPlayerProfiles.sourceId, importSources.id),
      )
      .where(eq(externalPlayerProfiles.personId, target.id)),
    database
      .select({
        rank: worldRankings.rank,
        rankingDate: worldRankings.rankingDate,
        displayName: worldRankings.displayName,
        countryCode: worldRankings.countryCode,
      })
      .from(worldRankings)
      .where(eq(worldRankings.personId, target.id))
      .orderBy(desc(worldRankings.rankingDate), asc(worldRankings.rank))
      .limit(1),
  ]);
  const subjectNames = new Set(
    [
      [subject.legalGivenName, subject.legalFamilyName]
        .filter(Boolean)
        .join(" "),
      [subject.legalGivenName, subject.legalMiddleName, subject.legalFamilyName]
        .filter(Boolean)
        .join(" "),
    ]
      .map((value) => normalizePersonName(value))
      .filter((value) => value.length > 0),
  );
  const targetNames = personNameVariants(target);
  for (const source of targetSources) {
    const normalized =
      source.normalizedName || normalizePersonName(source.displayName);
    if (normalized) targetNames.add(normalized);
  }
  const nameMatched = [...subjectNames].some((name) => targetNames.has(name));
  const targetBirthDates = new Set(
    [
      target.birthDate,
      ...targetSources.map((source) => source.birthDate),
    ].filter((value): value is string => Boolean(value)),
  );
  const birthDateMatched =
    Boolean(subject.birthDate) && targetBirthDates.has(subject.birthDate!);
  const birthDateEvidenceAvailable = targetBirthDates.size > 0;
  const professionalClaim =
    target.isProfessional ||
    targetSources.some((source) => source.isProfessional) ||
    targetRanking.length > 0;
  const birthDateConflict = birthDateEvidenceAvailable && !birthDateMatched;
  if (
    !nameMatched ||
    !subject.birthDate ||
    birthDateConflict ||
    (!professionalClaim && !birthDateMatched)
  ) {
    throw new SandDataServiceError(
      "CLAIM_CONFLICT",
      "We could not verify the required legal-name and birth-date evidence. Check your player details or send this profile to Duna support for a manual review.",
    );
  }
  const officialSourceProfiles = targetSources.flatMap((source) =>
    source.profileUrl
      ? [
          {
            source: source.sourceSlug,
            sourceName: source.sourceName,
            profileUrl: source.profileUrl,
            displayName: source.displayName,
          },
        ]
      : [],
  );

  const existingRequest = await database.query.workflowJobs.findFirst({
    where: and(
      eq(workflowJobs.kind, "sand.profile-claim-review"),
      inArray(workflowJobs.status, ["queued", "review-required", "running"]),
      sql`${workflowJobs.payload} ->> 'subjectPersonId' = ${subject.id}`,
      sql`${workflowJobs.payload} ->> 'targetPersonId' = ${target.id}`,
    ),
  });
  if (existingRequest) {
    return {
      jobId: existingRequest.id,
      status: "review-required" as const,
      targetPersonId: target.id,
      targetHandle: target.handle,
    };
  }

  const evidenceHash = stableHash({
    subjectPersonId: subject.id,
    targetPersonId: target.id,
    nameMatched,
    birthDateMatched,
    birthDateEvidenceAvailable,
    professionalClaim,
    officialSourceProfiles,
    worldRanking: targetRanking[0],
  });
  const jobId = crypto.randomUUID();
  await database.batch([
    database.insert(workflowJobs).values({
      id: jobId,
      kind: "sand.profile-claim-review",
      idempotencyKey: `sand-profile-claim:${subject.id}:${target.id}:${input.idempotencyKey}`,
      personId: subject.id,
      payload: {
        requestedByPersonId: input.actor.personId,
        subjectPersonId: subject.id,
        targetPersonId: target.id,
        targetHandle: target.handle,
        evidence: {
          nameMatched,
          birthDateMatched,
          birthDateEvidenceAvailable,
          verificationTier: professionalClaim
            ? "professional-manual"
            : "standard-manual",
          professionalClaim,
          officialSourceProfiles,
          worldRanking: targetRanking[0],
          evidenceHash,
        },
        requestId: input.requestId,
      },
      status: "review-required",
      maximumAttempts: 1,
      traceId: input.requestId,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database
      .update(people)
      .set({
        profileClaimStatus: "claim-pending",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(people.id, target.id),
          eq(people.profileClaimStatus, "unclaimed"),
        ),
      ),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "sand-data.profile-claim.requested",
      entityType: "person",
      entityId: target.id,
      afterHash: evidenceHash,
      reason: professionalClaim
        ? "A professional player requested a claim after exact legal-name and birth-date matching; official source pages require super-admin comparison before approval."
        : "A signed-in player requested an identity-reviewed claim after exact legal-name and birth-date matching.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    jobId,
    status: "review-required" as const,
    targetPersonId: target.id,
    targetHandle: target.handle,
  };
}

export async function reviewProfileClaim(input: {
  readonly actor: ApiActor;
  readonly jobId: string;
  readonly decision: "approved" | "rejected";
  readonly officialProfileMatched: boolean;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  if (!input.actor.roles.includes("super-admin")) {
    throw new SandDataServiceError(
      "SUPER_ADMIN_REQUIRED",
      "Only a super administrator can resolve a player profile claim.",
    );
  }
  const database = getDatabase();
  const job = await database.query.workflowJobs.findFirst({
    where: and(
      eq(workflowJobs.id, input.jobId),
      eq(workflowJobs.kind, "sand.profile-claim-review"),
      eq(workflowJobs.status, "review-required"),
    ),
  });
  if (!job) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "That profile claim is no longer waiting for review.",
    );
  }
  const payload = unknownRecord(job.payload);
  const evidence = unknownRecord(payload.evidence);
  const subjectPersonId =
    typeof payload.subjectPersonId === "string" ? payload.subjectPersonId : "";
  const targetPersonId =
    typeof payload.targetPersonId === "string" ? payload.targetPersonId : "";
  if (!subjectPersonId || !targetPersonId) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "The profile claim is missing its identity subjects.",
    );
  }
  const professionalClaim = evidence.professionalClaim === true;
  const officialSourceProfiles = Array.isArray(evidence.officialSourceProfiles)
    ? evidence.officialSourceProfiles
    : [];
  if (
    input.decision === "approved" &&
    professionalClaim &&
    (!input.officialProfileMatched || officialSourceProfiles.length === 0)
  ) {
    throw new SandDataServiceError(
      "CLAIM_CONFLICT",
      "Professional claims require a matching official player page before approval.",
    );
  }

  const merge =
    input.decision === "approved"
      ? await mergeUnclaimedProfile({
          actor: input.actor,
          sourcePersonId: targetPersonId,
          targetPersonId: subjectPersonId,
          reason: input.reason,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
          now: input.now,
        })
      : undefined;
  await database.batch([
    database
      .update(workflowJobs)
      .set({
        status: "completed",
        payload: {
          ...payload,
          review: {
            decision: input.decision,
            officialProfileMatched: input.officialProfileMatched,
            reviewedByPersonId: input.actor.personId,
            reason: input.reason,
            reviewedAt: input.now.toISOString(),
          },
        },
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(workflowJobs.id, job.id),
          eq(workflowJobs.status, "review-required"),
        ),
      ),
    ...(input.decision === "rejected"
      ? [
          database
            .update(people)
            .set({ profileClaimStatus: "unclaimed", updatedAt: input.now })
            .where(
              and(
                eq(people.id, targetPersonId),
                eq(people.profileClaimStatus, "claim-pending"),
              ),
            ),
        ]
      : []),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: `sand-data.profile-claim.${input.decision}`,
      entityType: "workflow-job",
      entityId: job.id,
      beforeHash: stableHash(evidence),
      afterHash: stableHash({
        decision: input.decision,
        officialProfileMatched: input.officialProfileMatched,
        merge,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { jobId: job.id, decision: input.decision, merge };
}

export async function processPlayerSourceConnection(
  payload: Readonly<Record<string, unknown>>,
) {
  requireDatabase();
  const connectionId =
    typeof payload.connectionId === "string" ? payload.connectionId : "";
  const requestedByPersonId =
    typeof payload.requestedByPersonId === "string"
      ? payload.requestedByPersonId
      : "";
  const subjectPersonId =
    typeof payload.subjectPersonId === "string" ? payload.subjectPersonId : "";
  const source =
    payload.source === "volleyball-life" || payload.source === "bvbinfo"
      ? payload.source
      : undefined;
  const externalId =
    typeof payload.externalId === "string" ? payload.externalId : "";
  const requestId =
    typeof payload.requestId === "string"
      ? payload.requestId
      : crypto.randomUUID();
  if (
    !connectionId ||
    !requestedByPersonId ||
    !subjectPersonId ||
    !source ||
    !externalId
  ) {
    throw new Error("Sand profile-import workflow payload is incomplete");
  }
  const database = getDatabase();
  const connection = await database.query.playerSourceConnections.findFirst({
    where: eq(playerSourceConnections.id, connectionId),
  });
  if (!connection) {
    throw new Error("Player source connection was not found");
  }
  await database
    .update(playerSourceConnections)
    .set({
      status: "syncing",
      progressPhase: "fetching-profile",
      progressCurrent: 0,
      progressTotal: 3,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(playerSourceConnections.id, connection.id));
  const actor = await workflowActor(requestedByPersonId);
  const now = new Date();
  try {
    const imported = await importSandSource({
      source,
      externalId,
      actor,
      now,
      onProgress: async (progress) => {
        await database
          .update(playerSourceConnections)
          .set({
            progressPhase: progress.phase,
            progressCurrent: progress.current,
            progressTotal: progress.total,
            matchesFound: progress.matchesFound,
            profilesFound: progress.profilesFound,
            updatedAt: new Date(),
          })
          .where(eq(playerSourceConnections.id, connection.id));
      },
    });
    await database
      .update(playerSourceConnections)
      .set({
        progressPhase: "matching-history",
        progressCurrent: 2,
        progressTotal: 3,
        matchesFound: imported.counters.matches,
        profilesFound: imported.counters.players,
        updatedAt: new Date(),
      })
      .where(eq(playerSourceConnections.id, connection.id));
    const sourceRow = await database.query.importSources.findFirst({
      where: eq(importSources.slug, source),
    });
    const profile = sourceRow
      ? await database.query.externalPlayerProfiles.findFirst({
          where: and(
            eq(externalPlayerProfiles.sourceId, sourceRow.id),
            eq(externalPlayerProfiles.externalPersonId, externalId),
          ),
        })
      : undefined;
    if (!sourceRow || !profile) {
      throw new Error("Imported source profile was not persisted");
    }
    const profileSnapshot = sourceProfileSnapshot(profile);
    if (connection.verificationStatus !== "confirmed") {
      await database
        .update(playerSourceConnections)
        .set({
          status: "review-required",
          profileSnapshot,
          lastProfileFetchedAt: now,
          progressPhase: "confirm-profile",
          progressCurrent: 3,
          progressTotal: 3,
          matchesFound: imported.counters.matches,
          profilesFound: imported.counters.players,
          lastIngestionRunId: imported.runId,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(playerSourceConnections.id, connection.id));
      return {
        connectionId,
        status: "review-required" as const,
        queuedMatches: imported.counters.matches,
      };
    }
    if (profile.personId && profile.personId !== subjectPersonId) {
      const mappedPerson = await database.query.people.findFirst({
        where: eq(people.id, profile.personId),
      });
      if (mappedPerson?.profileClaimStatus === "claimed") {
        await database
          .update(playerSourceConnections)
          .set({
            status: "review-required",
            profileSnapshot,
            lastProfileFetchedAt: now,
            progressPhase: "needs-review",
            progressCurrent: 3,
            progressTotal: 3,
            matchesFound: imported.counters.matches,
            profilesFound: imported.counters.players,
            lastIngestionRunId: imported.runId,
            lastError:
              "This profile is already linked to a claimed Duna identity.",
            updatedAt: now,
          })
          .where(eq(playerSourceConnections.id, connection.id));
        return {
          connectionId,
          status: "review-required" as const,
          queuedMatches: 0,
        };
      }
    }
    await linkExternalPlayer({
      actor,
      externalProfileId: profile.id,
      personId: subjectPersonId,
      reason:
        "Player supplied and claimed this exact source profile during onboarding.",
      now,
    });
    if (source === "bvbinfo") {
      await database
        .update(people)
        .set({
          isProfessional: true,
          professionalDefinition:
            "Professional competition history linked from BVBInfo.",
          updatedAt: now,
        })
        .where(eq(people.id, subjectPersonId));
    }
    const ready = await database
      .select({
        id: importedMatches.id,
        participants: importedMatches.participants,
      })
      .from(importedMatches)
      .where(
        and(
          eq(importedMatches.sourceId, sourceRow.id),
          eq(importedMatches.importState, "ready"),
        ),
      );
    const relevant = ready.filter((match) =>
      match.participants.some(
        (participant) => participant.personId === subjectPersonId,
      ),
    );
    for (const match of relevant) {
      await approveImportedMatch({
        actor,
        importedMatchId: match.id,
        reason:
          "Source-owned match auto-approved after the player claimed the exact source profile.",
        requestId,
        now,
      });
    }
    await database
      .update(playerSourceConnections)
      .set({
        status: "linked",
        profileSnapshot,
        lastProfileFetchedAt: now,
        nextRefreshAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
        progressPhase: "complete",
        progressCurrent: 3,
        progressTotal: 3,
        matchesFound: imported.counters.matches,
        profilesFound: imported.counters.players,
        lastIngestionRunId: imported.runId,
        lastError: null,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(playerSourceConnections.id, connection.id));
    return {
      connectionId,
      status: "linked" as const,
      queuedMatches: relevant.length,
    };
  } catch (error) {
    await database
      .update(playerSourceConnections)
      .set({
        status: "failed",
        progressPhase: "failed",
        lastError:
          error instanceof Error
            ? error.message.slice(0, 1_000)
            : "Profile import failed.",
        updatedAt: now,
      })
      .where(eq(playerSourceConnections.id, connection.id));
    throw error;
  }
}

export async function reviewPlayerSourceConnection(input: {
  readonly actor: ApiActor;
  readonly connectionId: string;
  readonly decision: "confirmed" | "rejected";
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const connection = await database.query.playerSourceConnections.findFirst({
    where: eq(playerSourceConnections.id, input.connectionId),
  });
  if (!connection) {
    throw new SandDataServiceError(
      "PLAYER_NOT_FOUND",
      "The source profile connection was not found.",
    );
  }
  await assertProfileSubjectAuthority({
    actor: input.actor,
    subjectPersonId: connection.personId,
  });
  if (input.decision === "rejected") {
    await database.batch([
      database
        .update(playerSourceConnections)
        .set({
          verificationStatus: "rejected",
          verifiedAt: null,
          status: "disconnected",
          progressPhase: "profile-rejected",
          nextRefreshAt: null,
          lastError: "The player said this source profile was not theirs.",
          updatedAt: input.now,
        })
        .where(eq(playerSourceConnections.id, connection.id)),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "sand-data.profile-connection.rejected",
        entityType: "player-source-connection",
        entityId: connection.id,
        reason: "Player or connected guardian rejected the discovered profile.",
        traceId: input.requestId,
        createdAt: input.now,
      }),
    ]);
    return {
      connectionId: connection.id,
      status: "disconnected" as const,
      jobId: undefined,
    };
  }
  const jobId = crypto.randomUUID();
  await database.batch([
    database
      .update(playerSourceConnections)
      .set({
        verificationStatus: "confirmed",
        verifiedAt: input.now,
        status: "queued",
        progressPhase: "confirmed-import",
        progressCurrent: 0,
        progressTotal: 3,
        lastError: null,
        updatedAt: input.now,
      })
      .where(eq(playerSourceConnections.id, connection.id)),
    database.insert(workflowJobs).values({
      id: jobId,
      kind: "sand.profile-import",
      idempotencyKey: `sand-profile-confirm:${connection.id}:${input.idempotencyKey}`,
      personId: connection.personId,
      payload: {
        connectionId: connection.id,
        requestedByPersonId: input.actor.personId,
        subjectPersonId: connection.personId,
        source: connection.source,
        externalId: connection.externalPersonId,
        requestId: input.requestId,
      },
      traceId: input.requestId,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "sand-data.profile-connection.confirmed",
      entityType: "player-source-connection",
      entityId: connection.id,
      reason:
        "Player or connected guardian confirmed the discovered source profile.",
      traceId: input.requestId,
      createdAt: input.now,
    }),
  ]);
  return {
    connectionId: connection.id,
    status: "queued" as const,
    jobId,
  };
}

export async function queueDuePlayerSourceRefreshes(
  input: {
    readonly limit?: number;
    readonly now?: Date;
  } = {},
) {
  requireDatabase();
  const database = getDatabase();
  const now = input.now ?? new Date();
  const due = await database
    .select()
    .from(playerSourceConnections)
    .where(
      and(
        eq(playerSourceConnections.status, "linked"),
        eq(playerSourceConnections.verificationStatus, "confirmed"),
        lte(playerSourceConnections.nextRefreshAt, now),
      ),
    )
    .orderBy(asc(playerSourceConnections.nextRefreshAt))
    .limit(Math.min(100, Math.max(1, input.limit ?? 25)));
  let queued = 0;
  for (const connection of due) {
    const dateKey = now.toISOString().slice(0, 10);
    const inserted = await database
      .insert(workflowJobs)
      .values({
        kind: "sand.profile-import",
        idempotencyKey: `sand-profile-refresh:${connection.id}:${dateKey}`,
        personId: connection.personId,
        payload: {
          connectionId: connection.id,
          requestedByPersonId: connection.personId,
          subjectPersonId: connection.personId,
          source: connection.source,
          externalId: connection.externalPersonId,
          requestId: `scheduled-profile-refresh:${connection.id}:${dateKey}`,
        },
        traceId: `scheduled-profile-refresh:${connection.id}:${dateKey}`,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: workflowJobs.id });
    if (inserted.length === 0) continue;
    queued += 1;
    await database
      .update(playerSourceConnections)
      .set({
        status: "queued",
        progressPhase: "scheduled-refresh",
        progressCurrent: 0,
        progressTotal: 3,
        updatedAt: now,
      })
      .where(eq(playerSourceConnections.id, connection.id));
  }
  return { queued };
}

export async function processSandAutoApproveMatch(
  payload: Readonly<Record<string, unknown>>,
) {
  const importedMatchId =
    typeof payload.importedMatchId === "string" ? payload.importedMatchId : "";
  const requestedByPersonId =
    typeof payload.requestedByPersonId === "string"
      ? payload.requestedByPersonId
      : "";
  const requestId =
    typeof payload.requestId === "string"
      ? payload.requestId
      : crypto.randomUUID();
  if (!importedMatchId || !requestedByPersonId) {
    throw new Error("Sand match approval workflow payload is incomplete");
  }
  return approveImportedMatch({
    actor: await workflowActor(requestedByPersonId),
    importedMatchId,
    reason:
      "Source-owned match auto-approved after the player claimed the exact source profile.",
    requestId,
  });
}

export async function searchDunaPlayers(query: string) {
  requireDatabase();
  const normalized = `%${query.trim().toLowerCase().replaceAll("%", "")}%`;
  if (normalized === "%%") return [];
  const rows = await getDatabase()
    .select({
      id: people.id,
      displayName: people.displayName,
      handle: people.handle,
      profileClaimStatus: people.profileClaimStatus,
      isProfessional: people.isProfessional,
    })
    .from(people)
    .where(
      and(
        ne(people.status, "deleted"),
        sql`(
          lower(${people.displayName}) LIKE ${normalized}
          OR lower(${people.handle}) LIKE ${normalized}
        )`,
      ),
    )
    .orderBy(asc(people.displayName))
    .limit(20);
  return rows;
}

export async function grantPlatformRoleFromBootstrap(input: {
  readonly actorPersonId: string;
  readonly role: "admin" | "super-admin";
  readonly grantedByPersonId?: string;
}) {
  requireDatabase();
  await getDatabase()
    .insert(adminRoles)
    .values({
      personId: input.actorPersonId,
      role: input.role,
      scopes: [],
      grantedByPersonId: input.grantedByPersonId,
    })
    .onConflictDoNothing();
}

export type SandDataOverview = Awaited<ReturnType<typeof loadSandDataOverview>>;
export type PublicProCoverage = Awaited<
  ReturnType<typeof loadPublicProCoverage>
>;
export type PublicProEvent = NonNullable<
  Awaited<ReturnType<typeof loadPublicProEvent>>
>;
export type PublicProMatchDetail = NonNullable<
  Awaited<ReturnType<typeof loadPublicProMatch>>
>;
export type PublicPlayerPerformance = Awaited<
  ReturnType<typeof loadPublicPlayerPerformance>
>;
export type PublicRatingLab = Awaited<ReturnType<typeof loadPublicRatingLab>>;
export type PublicWorldRankings = Awaited<
  ReturnType<typeof loadPublicWorldRankings>
>;
