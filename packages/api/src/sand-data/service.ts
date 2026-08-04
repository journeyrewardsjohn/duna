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
  playerSourceConnections,
  professionalEvents,
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
  worldRankingSignal,
} from "@duna/rating";
import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { stableHash } from "../canonical";
import { scopesForRoles, type ApiActor } from "../context";
import { publishImportedProfessionalActivities } from "../live-activities";
import { applyApprovedImportedMatchRating } from "../match-service";
import { assertProfileSubjectAuthority } from "../profile-onboarding";
import { avpExternalPlayerId, importAvpLeague } from "./avp";
import {
  crossSourceMatchFingerprint,
  matchMappingConfidence,
  normalizePersonName,
  safeExternalHandle,
  sourceMatchFingerprint,
} from "./normalize";
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
  const [personRows, existingLinks, historicalProfiles] = await Promise.all([
    database
      .select({
        id: people.id,
        displayName: people.displayName,
        handle: people.handle,
        profileClaimStatus: people.profileClaimStatus,
        isProfessional: people.isProfessional,
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
  let inserted = 0;
  let linked = 0;
  let suggested = 0;

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

    if (!personId) {
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

    if (!personId) {
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
      if (best && !tied) {
        mappingState = "suggested";
        mappingScoreBps = best.score;
        evidence = {
          method: "normalized-name",
          candidatePersonId: best.candidate.id,
          candidateHandle: best.candidate.handle,
          candidateDisplayName: best.candidate.displayName,
        };
        suggested += 1;
      } else if (tied) {
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
        const insertedRows = await database
          .insert(people)
          .values({
            displayName: external.displayName,
            handle,
            avatarUrl: external.avatarUrl,
            profileClaimStatus: "unclaimed",
            isProfessional: external.isProfessional ?? false,
            professionalDefinition: external.isProfessional
              ? `Imported verified professional competition identity from ${sourceNames[input.source]}.`
              : undefined,
            genderCategory: undefined,
            birthDate: external.birthDate,
            homeMarket: external.hometown,
            profileVisibility: external.isProfessional ? "public" : "private",
            ageBand: "unknown",
            isMinor: false,
            status: "active",
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoNothing()
          .returning({ id: people.id });
        personId =
          insertedRows[0]?.id ??
          (
            await database.query.people.findFirst({
              where: eq(people.handle, handle),
            })
          )?.id;
        if (personId) {
          mappingState = "linked";
          mappingScoreBps = 10_000;
          evidence = { method: "created-unclaimed-source-profile" };
          personRows.push({
            id: personId,
            displayName: external.displayName,
            handle,
            profileClaimStatus: "unclaimed",
            isProfessional: external.isProfessional ?? false,
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
    } else {
      linked += 1;
    }

    const linkedPerson = personId
      ? personRows.find((person) => person.id === personId)
      : undefined;
    if (personId && linkedPerson?.profileClaimStatus === "unclaimed") {
      await database
        .update(people)
        .set({
          displayName: external.displayName,
          ...(external.avatarUrl ? { avatarUrl: external.avatarUrl } : {}),
          ...(external.birthDate ? { birthDate: external.birthDate } : {}),
          ...(external.hometown ? { homeMarket: external.hometown } : {}),
          ...(external.isProfessional
            ? {
                isProfessional: true,
                profileVisibility: "public" as const,
                professionalDefinition: `Imported verified professional competition identity from ${sourceNames[input.source]}.`,
              }
            : {}),
          updatedAt: input.now,
        })
        .where(eq(people.id, personId));
    }

    await database
      .insert(externalPlayerProfiles)
      .values({
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
      })
      .onConflictDoUpdate({
        target: [
          externalPlayerProfiles.sourceId,
          externalPlayerProfiles.externalPersonId,
        ],
        set: {
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
          updatedAt: input.now,
        },
      });
    await database
      .insert(importLinks)
      .values({
        sourceId: input.sourceId,
        externalPersonId: external.externalPersonId,
        personId,
        resolutionScoreBps: mappingScoreBps,
        resolutionState: mappingState,
        evidence,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [importLinks.sourceId, importLinks.externalPersonId],
        set: {
          personId,
          resolutionScoreBps: mappingScoreBps,
          resolutionState: mappingState,
          evidence,
          updatedAt: input.now,
        },
      });
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
}> {
  const database = getDatabase();
  const peopleByExternalId = await resolvedPeopleByExternalId(input.sourceId);
  let staged = 0;
  let ready = 0;
  let needsMapping = 0;
  let duplicates = 0;
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
    const [duplicate, existing] = await Promise.all([
      database.query.importedMatches.findFirst({
        where: and(
          eq(importedMatches.crossSourceFingerprint, crossFingerprint),
          ne(importedMatches.sourceId, input.sourceId),
        ),
      }),
      database.query.importedMatches.findFirst({
        where: and(
          eq(importedMatches.sourceId, input.sourceId),
          eq(importedMatches.externalMatchId, match.externalMatchId),
        ),
      }),
    ]);
    const participants = match.participants.map((participant) => ({
      ...participant,
      personId: peopleByExternalId.get(participant.externalPersonId),
    }));
    const allMapped = participants.every((participant) => participant.personId);
    const complete = Boolean(match.winnerSide && match.sets.length > 0);
    const importState =
      existing?.importState === "approved"
        ? "approved"
        : duplicate?.canonicalMatchId || duplicate?.importState === "approved"
          ? "duplicate"
          : complete && allMapped
            ? "ready"
            : complete
              ? "needs-mapping"
              : "staged";
    await database
      .insert(importedMatches)
      .values({
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
        possibleDuplicateOfId: duplicate?.id,
        rawPayload: preserveEditorialPayload(match.raw, existing?.rawPayload),
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [importedMatches.sourceId, importedMatches.externalMatchId],
        set: {
          ingestionRunId: input.runId,
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
          possibleDuplicateOfId: duplicate?.id,
          rawPayload: preserveEditorialPayload(match.raw, existing?.rawPayload),
          updatedAt: input.now,
        },
      });
    if (importState === "ready") ready += 1;
    else if (importState === "needs-mapping") needsMapping += 1;
    else if (importState === "duplicate") duplicates += 1;
    else staged += 1;
  }
  return { staged, ready, needsMapping, duplicates };
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
  for (const ranking of input.result.rankings ?? []) {
    await database
      .insert(worldRankings)
      .values({
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
      })
      .onConflictDoUpdate({
        target: [
          worldRankings.sourceId,
          worldRankings.rankingDate,
          worldRankings.genderCategory,
          worldRankings.externalPersonId,
        ],
        set: {
          rank: ranking.rank,
          points: ranking.points,
          displayName: ranking.displayName,
          countryCode: storedCountryCode(ranking.countryCode),
          personId: peopleByExternalId.get(ranking.externalPersonId),
          previousRank: ranking.previousRank,
          rawPayload: ranking.raw,
        },
      });
  }
  return input.result.rankings?.length ?? 0;
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
    const [playerCounts, matchCounts, eventCount, rankingCount] =
      await Promise.all([
        persistExternalPlayers({
          source: input.source,
          sourceId: source.id,
          players: result.players,
          now: input.now,
        }),
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
      events: eventCount,
      rankings: rankingCount,
    };
    await database.batch([
      database
        .update(sandIngestionRuns)
        .set({
          status: "succeeded",
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
        reason: `${source.name} import completed into the staged evidence pipeline.`,
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
    return { runId: run.id, status: "succeeded" as const, counters };
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
    events: events.map((event) => ({
      id: event.id,
      externalEventId: event.externalEventId,
      name: event.name,
      location: event.location ?? undefined,
      category: event.category ?? undefined,
      genderCategory: event.genderCategory,
      startsOn: event.startsOn ?? undefined,
      endsOn: event.endsOn ?? undefined,
      status: event.status,
      live: event.live,
      teamCount: event.teamCount,
      matchCount: event.matchCount,
      lastSyncedAt: event.lastSyncedAt.toISOString(),
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
          watchOptions: watchOptionsFromPayload(match.rawPayload),
        })),
    })),
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
                players: entry.players,
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
    const complete = Boolean(row.winnerSide && row.sets.length > 0);
    const importState =
      complete && participants.every((participant) => participant.personId)
        ? "ready"
        : complete
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
    peopleA.length !== 2 ||
    peopleB.length !== 2 ||
    imported.sets.length === 0 ||
    !imported.winnerSide
  ) {
    throw new SandDataServiceError(
      "MATCH_NOT_READY",
      "Resolve all four players, a complete score, and duplicates before approval.",
    );
  }
  const source = await database.query.importSources.findFirst({
    where: eq(importSources.id, imported.sourceId),
  });
  const professional =
    source?.slug === "bvbinfo" ||
    source?.slug === "fivb-12ndr" ||
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
  readonly now?: Date;
}) {
  requireDatabase();
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
  if (source.profileClaimStatus !== "unclaimed") {
    throw new SandDataServiceError(
      "MERGE_CONFLICT",
      "Only an unclaimed source profile can be merged automatically.",
    );
  }
  if (sourceEvents.length > 0 && targetEvents.length > 0) {
    throw new SandDataServiceError(
      "MERGE_CONFLICT",
      "Both profiles have rating history. Run a Ratings Lab replay before merging them.",
    );
  }
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
  return {
    sourcePersonId: source.id,
    targetPersonId: target.id,
    status: "completed" as const,
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

export async function evaluateCurrentRating(input: {
  readonly actor: ApiActor;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const database = getDatabase();
  const configuration = await ensureRatingConfiguration(input.actor, now);
  const rows = await database
    .select({ explanation: ratingEvents.explanation })
    .from(ratingEvents)
    .orderBy(asc(ratingEvents.createdAt));
  const evaluation = evaluatePredictions(
    rows.flatMap((row) => {
      const expected = row.explanation.expectedWinProbability;
      const actual = row.explanation.actualResult;
      return typeof expected === "number" && (actual === 0 || actual === 1)
        ? [{ expectedTeamA: expected, actualTeamA: actual }]
        : [];
    }),
  );
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
  return {
    id: saved?.id ?? "",
    configurationId: configuration.id,
    ...evaluation,
    createdAt: now.toISOString(),
  };
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

export async function loadPublicProCoverage() {
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
      })
      .from(importedMatches)
      .innerJoin(importSources, eq(importedMatches.sourceId, importSources.id))
      .where(inArray(importSources.slug, ["fivb-12ndr", "avp-league"]))
      .orderBy(desc(importedMatches.playedAt))
      .limit(200),
    database
      .select({ date: worldRankings.rankingDate })
      .from(worldRankings)
      .orderBy(desc(worldRankings.rankingDate))
      .limit(1),
  ]);
  const eventRows = storedEventRows
    .map((row) => ({ ...row.event, sourceSlug: row.sourceSlug }))
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
        return (b.startsOn ?? "").localeCompare(a.startsOn ?? "");
      }
      return (a.startsOn ?? "9999").localeCompare(b.startsOn ?? "9999");
    });
  const rankingDate = latestDate[0]?.date;
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
  const tourForEvent = (event: (typeof eventRows)[number]) =>
    event.sourceSlug === "avp-league"
      ? ("avp" as const)
      : event.category?.toLowerCase().includes("elite")
        ? ("elite" as const)
        : event.category?.toLowerCase().includes("challeng")
          ? ("challenger" as const)
          : event.category?.toLowerCase().includes("future")
            ? ("futures" as const)
            : ("other" as const);
  return {
    events: eventRows.map((event) => ({
      id: event.id,
      externalEventId: event.externalEventId,
      slug: professionalEventSlug(event),
      name: event.name,
      location: event.location ?? undefined,
      category: event.category ?? undefined,
      genderCategory: event.genderCategory,
      startsOn: event.startsOn ?? undefined,
      endsOn: event.endsOn ?? undefined,
      status: event.status,
      live: event.live,
      teamCount: event.teamCount,
      matchCount: event.matchCount,
      lastSyncedAt: event.lastSyncedAt.toISOString(),
      source:
        event.sourceSlug === "avp-league"
          ? ("avp" as const)
          : ("fivb" as const),
      tour: tourForEvent(event),
    })),
    matches: matchRows.map((match) => {
      const event = eventRows.find(
        (candidate) =>
          candidate.sourceId === match.sourceId &&
          candidate.externalEventId === match.externalEventId,
      );
      const team = (side: "A" | "B") =>
        match.participants
          .filter((participant) => participant.side === side)
          .map((participant) => participant.name)
          .join(" / ");
      const matchSlug = slugSegment(`${team("A")}-vs-${team("B")}`) || "match";
      return {
        ...match,
        playedAt: match.playedAt?.toISOString(),
        ...(event
          ? {
              canonicalPath: `/events/${professionalEventSlug(event)}/match/${matchSlug}/${match.id}`,
              tour: tourForEvent(event),
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

type ProParticipant = {
  readonly name: string;
  readonly personId?: string;
  readonly handle?: string;
  readonly avatarUrl?: string;
  readonly rating?: number;
};

type ProTeam = {
  readonly key: string;
  readonly label: string;
  readonly players: readonly ProParticipant[];
  readonly averageRating?: number;
};

type PublicProMatch = {
  readonly id: string;
  readonly externalMatchId: string;
  readonly roundLabel: string;
  readonly playedAt?: string;
  readonly sourceUrl?: string;
  readonly time?: string;
  readonly court?: string;
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
  readonly watchOptions: readonly PublicWatchOption[];
};

type PublicWatchOption = {
  readonly id: string;
  readonly kind: "vbtv" | "youtube" | "live-tv";
  readonly label: string;
  readonly url?: string;
  readonly channelName?: string;
};

type RawProfessionalTeamEntry = {
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

function watchOptionsFromPayload(value: unknown): readonly PublicWatchOption[] {
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

function rawProfessionalTeamEntries(
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
  if (input.kind === "youtube" && !url) {
    throw new SandDataServiceError(
      "INVALID_WATCH_OPTION",
      "Add the YouTube link for this broadcast.",
    );
  }
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
      a.team.label.localeCompare(b.team.label),
  );
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

export async function loadPublicProEvent(slug: string) {
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
  const [personRows, ratingRows] =
    personIds.length > 0
      ? await Promise.all([
          database
            .select({
              id: people.id,
              displayName: people.displayName,
              handle: people.handle,
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
        ])
      : [[], []];
  const personById = new Map(personRows.map((person) => [person.id, person]));
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
  const eventWatchOptions = watchOptionsFromPayload(event.rawPayload);
  const toTeam = (
    participants: (typeof matchRows)[number]["participants"],
    side: "A" | "B",
  ): ProTeam => {
    const players = participants
      .filter((participant) => participant.side === side)
      .map((participant) => {
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
          ...(person?.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
          ...(rating !== undefined ? { rating } : {}),
        };
      });
    const rated = players.flatMap((player) =>
      player.rating !== undefined ? [player.rating] : [],
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
    };
  };
  const publicMatches: readonly PublicProMatch[] = matchRows.map((match) => {
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
    const favorite =
      teamAChance > 50 ? "A" : teamAChance < 50 ? "B" : ("even" as const);
    const matchWatchOptions = watchOptionsFromPayload(match.rawPayload);
    return {
      id: match.id,
      externalMatchId: match.externalMatchId,
      roundLabel: match.roundLabel ?? "Match",
      ...(match.playedAt ? { playedAt: match.playedAt.toISOString() } : {}),
      ...(match.sourceUrl ? { sourceUrl: match.sourceUrl } : {}),
      ...(objectString(match.rawPayload, "time")
        ? { time: objectString(match.rawPayload, "time") }
        : {}),
      ...(objectString(match.rawPayload, "court")
        ? { court: objectString(match.rawPayload, "court") }
        : {}),
      teamA,
      teamB,
      sets: match.sets,
      ...(winnerSide ? { winnerSide } : {}),
      status: winnerSide ? "completed" : event.live ? "live" : "scheduled",
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
      watchOptions:
        matchWatchOptions.length > 0 ? matchWatchOptions : eventWatchOptions,
    };
  });
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
  const sibling = eventRows.find(
    (candidate) =>
      candidate.id !== event.id &&
      candidate.startsOn === event.startsOn &&
      slugSegment(proEventBaseName(candidate.name)) ===
        slugSegment(proEventBaseName(event.name)) &&
      normalizedProGender(candidate.genderCategory) !==
        normalizedProGender(event.genderCategory),
  );
  return {
    id: event.id,
    slug: eventSlug,
    externalEventId: event.externalEventId,
    name: event.name,
    location: event.location ?? undefined,
    countryCode: event.countryCode ?? undefined,
    category: event.category ?? undefined,
    genderCategory: event.genderCategory,
    startsOn: event.startsOn ?? undefined,
    endsOn: event.endsOn ?? undefined,
    status: event.status,
    live: event.live,
    teamCount:
      avpLeague && avpLeague.overall.length > 0
        ? avpLeague.overall.length
        : event.teamCount,
    matchCount: Math.max(event.matchCount, publicMatches.length),
    sourceUrl: event.sourceUrl,
    lastSyncedAt: event.lastSyncedAt.toISOString(),
    teamEntries: publicTeamEntries,
    avpLeague,
    watchOptions: eventWatchOptions,
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
    liveStandings: standingRows(publicMatches),
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

export async function loadPublicProMatch(eventSlug: string, matchId: string) {
  const event = await loadPublicProEvent(eventSlug);
  if (!event) return undefined;
  const match = event.matches.find((candidate) => candidate.id === matchId);
  return match ? { event, match } : undefined;
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
        matchTitle: importedMatches.title,
        sourceUrl: importedMatches.sourceUrl,
        sets: importedMatches.sets,
        participants: importedMatches.participants,
      })
      .from(ratingEvents)
      .leftJoin(matches, eq(matches.id, ratingEvents.matchId))
      .leftJoin(
        importedMatches,
        eq(importedMatches.canonicalMatchId, ratingEvents.matchId),
      )
      .where(eq(ratingEvents.personId, personId))
      .orderBy(desc(ratingEvents.createdAt))
      .limit(100),
    database
      .select({
        id: externalPlayerProfiles.id,
        source: importSources.name,
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
  const participantPersonIds = [
    ...new Set(
      eventRows.flatMap((event) =>
        (event.participants ?? []).flatMap((participant) =>
          participant.personId ? [participant.personId] : [],
        ),
      ),
    ),
  ];
  const participantProfiles =
    participantPersonIds.length > 0
      ? await database
          .select({
            id: people.id,
            handle: people.handle,
            displayName: people.displayName,
            avatarUrl: people.avatarUrl,
          })
          .from(people)
          .where(
            and(
              inArray(people.id, participantPersonIds),
              eq(people.status, "active"),
              eq(people.profileVisibility, "public"),
              eq(people.isMinor, false),
            ),
          )
      : [];
  const world = latestRanking[0];
  return {
    history: eventRows.map((event) => ({
      id: event.id,
      matchId: event.matchId,
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
      participants: event.participants ?? [],
    })),
    sources: externalRows.map((source) => ({
      ...source,
      profileUrl: source.profileUrl ?? undefined,
      externalRating: source.externalRating ?? undefined,
      externalRatingConfidence: source.externalRatingConfidence ?? undefined,
      externalMatchCount: source.externalMatchCount ?? undefined,
      lastImportedAt: source.lastImportedAt?.toISOString(),
    })),
    participantProfiles: participantProfiles.map((profile) => ({
      ...profile,
      avatarUrl: profile.avatarUrl ?? undefined,
    })),
    worldRanking: world
      ? {
          rank: world.rank,
          points: world.points,
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

  const targetSources = await database
    .select({
      normalizedName: externalPlayerProfiles.normalizedName,
      displayName: externalPlayerProfiles.displayName,
      birthDate: externalPlayerProfiles.birthDate,
    })
    .from(externalPlayerProfiles)
    .where(eq(externalPlayerProfiles.personId, target.id));
  const subjectNames = personNameVariants(subject);
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
  if (!nameMatched || !birthDateMatched) {
    throw new SandDataServiceError(
      "CLAIM_CONFLICT",
      "We could not verify an exact legal-name and birth-date match. Check your player details or send this profile to Duna support for a manual review.",
    );
  }

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
      reason:
        "A signed-in player requested an identity-reviewed claim after exact legal-name and birth-date matching.",
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
