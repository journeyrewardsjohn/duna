import {
  adminRoles,
  auditLog,
  externalPlayerProfiles,
  getDatabase,
  importedMatches,
  importLinks,
  importSources,
  matches,
  people,
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
} from "@duna/db";
import {
  defaultRatingConfig,
  evaluatePredictions,
  worldRankingSignal,
} from "@duna/rating";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { stableHash } from "../canonical";
import type { ApiActor } from "../context";
import { applyApprovedImportedMatchRating } from "../match-service";
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
} from "./sources";
import {
  SandDataUpstreamError,
  type ExternalPlayerRecord,
  type SandDataSource,
  type SourceImportResult,
} from "./types";

const sourceNames: Readonly<Record<SandDataSource, string>> = {
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
  const [personRows, existingLinks] = await Promise.all([
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
  ]);
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
      } else if (input.source !== "volleyball-world") {
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

  for (const match of input.result.matches) {
    if (match.participants.length !== 4) continue;
    const sourceFingerprint = sourceMatchFingerprint(
      input.result.source,
      match,
    );
    const crossFingerprint = crossSourceMatchFingerprint(match);
    const duplicate = await database.query.importedMatches.findFirst({
      where: and(
        eq(importedMatches.crossSourceFingerprint, crossFingerprint),
        ne(importedMatches.sourceId, input.sourceId),
      ),
    });
    const participants = match.participants.map((participant) => ({
      ...participant,
      personId: peopleByExternalId.get(participant.externalPersonId),
    }));
    const allMapped = participants.every((participant) => participant.personId);
    const complete = Boolean(match.winnerSide && match.sets.length > 0);
    const importState =
      duplicate?.canonicalMatchId || duplicate?.importState === "approved"
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
        rawPayload: match.raw,
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
          rawPayload: match.raw,
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
        teamCount: Math.floor(event.teamCount),
        matchCount: event.matchCount,
        rawPayload: event.raw,
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
          teamCount: Math.floor(event.teamCount),
          matchCount: event.matchCount,
          rawPayload: event.raw,
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
        input.source === "volleyball-life" ||
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
  readonly source: "bvbinfo" | "volleyball-life" | "fivb-12ndr";
  readonly externalId: string;
  readonly actor?: ApiActor;
  readonly now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.source === "bvbinfo") {
    return executeImport({
      source: input.source,
      mode: "player",
      requestedExternalId: input.externalId,
      actor: input.actor,
      now,
      loader: () => importBvbInfoPlayer(input.externalId),
    });
  }
  if (input.source === "volleyball-life") {
    return executeImport({
      source: input.source,
      mode: "player",
      requestedExternalId: input.externalId,
      actor: input.actor,
      now,
      loader: () => importVolleyballLifePlayer(input.externalId),
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
      status: professionalEvents.status,
    })
    .from(professionalEvents)
    .where(
      and(
        eq(professionalEvents.sourceId, source.id),
        inArray(professionalEvents.status, ["live", "upcoming"]),
      ),
    )
    .orderBy(desc(professionalEvents.live), asc(professionalEvents.startsOn))
    .limit(input.limit ?? 4);
  const results: {
    readonly externalEventId: string;
    readonly status: "succeeded" | "failed";
    readonly message?: string;
  }[] = [];
  for (const row of rows) {
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
    imported,
    events,
    rankingDates,
    configurations,
    evaluations,
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
      .limit(50),
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
  ]);
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
    })),
    rankingDates,
    configurations: configurations.map((configuration) => ({
      ...configuration,
      createdAt: configuration.createdAt.toISOString(),
    })),
    evaluations: evaluations.map((evaluation) => ({
      ...evaluation,
      createdAt: evaluation.createdAt.toISOString(),
    })),
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
    source?.slug === "bvbinfo" || source?.slug === "fivb-12ndr";
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
  const [eventRows, matchRows, latestDate] = await Promise.all([
    database
      .select()
      .from(professionalEvents)
      .where(inArray(professionalEvents.status, ["live", "upcoming"]))
      .orderBy(desc(professionalEvents.live), asc(professionalEvents.startsOn))
      .limit(24),
    database
      .select({
        id: importedMatches.id,
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
      .where(eq(importSources.slug, "fivb-12ndr"))
      .orderBy(desc(importedMatches.playedAt))
      .limit(100),
    database
      .select({ date: worldRankings.rankingDate })
      .from(worldRankings)
      .orderBy(desc(worldRankings.rankingDate))
      .limit(1),
  ]);
  const rankingDate = latestDate[0]?.date;
  const rankingRows = rankingDate
    ? await database
        .select()
        .from(worldRankings)
        .where(eq(worldRankings.rankingDate, rankingDate))
        .orderBy(asc(worldRankings.genderCategory), asc(worldRankings.rank))
        .limit(40)
    : [];
  return {
    events: eventRows.map((event) => ({
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
    })),
    matches: matchRows.map((match) => ({
      ...match,
      playedAt: match.playedAt?.toISOString(),
    })),
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
        matchTitle: importedMatches.title,
        sourceUrl: importedMatches.sourceUrl,
        sets: importedMatches.sets,
        participants: importedMatches.participants,
      })
      .from(ratingEvents)
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
      occurredAt: event.createdAt.toISOString(),
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
export type PublicPlayerPerformance = Awaited<
  ReturnType<typeof loadPublicPlayerPerformance>
>;
