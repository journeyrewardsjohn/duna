import {
  auditLog,
  courts,
  divisions,
  eventTypes,
  getDatabase,
  matchConfirmations,
  matches,
  people,
  programs,
  rallyEvents,
  ratingEvents,
  ratings,
  sessions,
  teamMembers,
  teams,
  venues,
} from "@duna/db";
import {
  foldScore,
  standardBeachFormat,
  type MatchFormat,
  type ScoreEvent,
  type ScoreState,
  type ScoringSystem,
} from "@duna/league-engine";
import {
  createInitialRating,
  rateDoublesMatch,
  type RatingState,
} from "@duna/rating";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";

export class MatchServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "MATCH_NOT_FOUND"
      | "MATCH_NOT_SCORABLE"
      | "MATCH_NOT_READY"
      | "MATCH_NOT_CONFIRMABLE"
      | "PARTICIPANT_NOT_FOUND"
      | "PARTICIPANT_DUPLICATE"
      | "PARTICIPANT_REQUIRED"
      | "DEVICE_MISMATCH"
      | "EVENT_SEQUENCE_CONFLICT"
      | "RATING_PROJECTION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "MatchServiceError";
  }
}

export interface ScoringPerson {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
  readonly ratingDisplay: number;
}

export interface MatchScoringState {
  readonly matchId: string;
  readonly status: "live" | "pending-verification" | "verified" | "disputed";
  readonly deviceId: string;
  readonly venueName: string;
  readonly teamA: {
    readonly id: string;
    readonly name: string;
    readonly people: readonly ScoringPerson[];
  };
  readonly teamB: {
    readonly id: string;
    readonly name: string;
    readonly people: readonly ScoringPerson[];
  };
  readonly format: MatchFormat;
  readonly events: readonly ScoreEvent[];
  readonly score: ScoreState;
  readonly nextSequence: number;
  readonly nextMonotonicCounter: number;
  readonly confirmation: {
    readonly confirmedPersonIds: readonly string[];
    readonly disputedPersonIds: readonly string[];
  };
}

export interface ScoreEventEnvelope {
  readonly sequence: number;
  readonly monotonicCounter: number;
  readonly event: ScoreEvent;
}

export interface OperatorScorableMatch {
  readonly id: string;
  readonly status: "scheduled" | "live";
  readonly scheduledAt?: string;
  readonly venueName: string;
  readonly courtName?: string;
  readonly authoritativeDeviceId?: string;
  readonly teamA: {
    readonly id: string;
    readonly name: string;
    readonly people: readonly ScoringPerson[];
  };
  readonly teamB: {
    readonly id: string;
    readonly name: string;
    readonly people: readonly ScoringPerson[];
  };
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new MatchServiceError(
      "DATABASE_REQUIRED",
      "Match scoring requires the connected Duna database.",
    );
  }
}

function matchFormat(value: unknown): MatchFormat {
  const stored =
    typeof value === "object" && value !== null
      ? (value as Partial<MatchFormat>)
      : {};
  return {
    ...standardBeachFormat,
    ...stored,
    scoringSystem: stored.scoringSystem === "sideout" ? "sideout" : "rally",
  };
}

function storedScoreEvent(row: typeof rallyEvents.$inferSelect): ScoreEvent {
  const event = row.payload as unknown as ScoreEvent;
  if (
    !event ||
    typeof event !== "object" ||
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    typeof event.occurredAt !== "string"
  ) {
    throw new MatchServiceError(
      "EVENT_SEQUENCE_CONFLICT",
      "Persisted scoring event is invalid.",
    );
  }
  return event;
}

async function loadScoringPeople(
  personIds: readonly string[],
): Promise<readonly ScoringPerson[]> {
  const database = getDatabase();
  const [personRows, ratingRows] = await Promise.all([
    database
      .select()
      .from(people)
      .where(inArray(people.id, [...personIds])),
    database
      .select()
      .from(ratings)
      .where(
        and(
          inArray(ratings.personId, [...personIds]),
          eq(ratings.discipline, "beach-2s"),
        ),
      ),
  ]);
  const ratingByPerson = new Map(
    ratingRows.map((rating) => [rating.personId, rating] as const),
  );
  const byId = new Map(
    personRows.map((person) => [
      person.id,
      {
        id: person.id,
        displayName: person.displayName,
        initials: person.displayName
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join(""),
        ratingDisplay: ratingByPerson.get(person.id)?.display ?? 3,
      },
    ]),
  );
  return personIds.flatMap((id) => {
    const person = byId.get(id);
    return person ? [person] : [];
  });
}

async function matchParticipants(matchId: string): Promise<{
  readonly match: typeof matches.$inferSelect;
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
}> {
  const database = getDatabase();
  const match = await database.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match?.teamAId || !match.teamBId) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "Scorable match was not found.",
    );
  }
  const memberRows = await database
    .select()
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId]));
  return {
    match,
    teamAIds: memberRows
      .filter((member) => member.teamId === match.teamAId)
      .map((member) => member.personId),
    teamBIds: memberRows
      .filter((member) => member.teamId === match.teamBId)
      .map((member) => member.personId),
  };
}

function assertMatchAuthority(input: {
  readonly actor: ApiActor;
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
}): void {
  const isParticipant = [...input.teamAIds, ...input.teamBIds].includes(
    input.actor.personId,
  );
  const isScorekeeper =
    input.actor.scopes.includes("*") ||
    input.actor.scopes.includes("matches:score");
  if (!isParticipant && !isScorekeeper) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Only a participant or assigned scoring operator can score this match.",
    );
  }
}

export async function loadOperatorScorableMatches(
  actor: ApiActor,
): Promise<readonly OperatorScorableMatch[]> {
  requireDatabase();
  if (!actor.organizationId) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "An organization context is required.",
    );
  }
  const database = getDatabase();
  const rows = await database
    .select({
      id: matches.id,
      status: matches.status,
      scheduledAt: matches.scheduledAt,
      authoritativeDeviceId: matches.authoritativeDeviceId,
      teamAId: matches.teamAId,
      teamBId: matches.teamBId,
      venueName: venues.name,
      courtName: courts.name,
    })
    .from(matches)
    .leftJoin(venues, eq(matches.venueId, venues.id))
    .leftJoin(courts, eq(matches.courtId, courts.id))
    .leftJoin(divisions, eq(matches.divisionId, divisions.id))
    .leftJoin(sessions, eq(divisions.sessionId, sessions.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .where(
      and(
        inArray(matches.status, ["scheduled", "live"]),
        or(
          eq(venues.organizationId, actor.organizationId),
          eq(programs.organizationId, actor.organizationId),
          eq(eventTypes.organizationId, actor.organizationId),
        ),
      ),
    )
    .orderBy(asc(matches.scheduledAt), asc(matches.createdAt))
    .limit(50);

  return Promise.all(
    rows.flatMap((row) => {
      if (
        !row.teamAId ||
        !row.teamBId ||
        (row.status !== "scheduled" && row.status !== "live")
      ) {
        return [];
      }
      return [
        (async (): Promise<OperatorScorableMatch> => {
          const status =
            row.status === "live" ? ("live" as const) : ("scheduled" as const);
          const [teamRows, memberRows] = await Promise.all([
            database
              .select()
              .from(teams)
              .where(inArray(teams.id, [row.teamAId!, row.teamBId!])),
            database
              .select()
              .from(teamMembers)
              .where(inArray(teamMembers.teamId, [row.teamAId!, row.teamBId!])),
          ]);
          const teamA = teamRows.find((team) => team.id === row.teamAId);
          const teamB = teamRows.find((team) => team.id === row.teamBId);
          if (!teamA || !teamB) {
            throw new MatchServiceError(
              "MATCH_NOT_READY",
              "A scheduled match is missing one or both teams.",
            );
          }
          const teamAIds = memberRows
            .filter((member) => member.teamId === teamA.id)
            .map((member) => member.personId);
          const teamBIds = memberRows
            .filter((member) => member.teamId === teamB.id)
            .map((member) => member.personId);
          const scoringPeople = await loadScoringPeople([
            ...teamAIds,
            ...teamBIds,
          ]);
          const personById = new Map(
            scoringPeople.map((person) => [person.id, person] as const),
          );
          return {
            id: row.id,
            status,
            scheduledAt: row.scheduledAt?.toISOString(),
            venueName: row.venueName ?? "Location not recorded",
            courtName: row.courtName ?? undefined,
            authoritativeDeviceId: row.authoritativeDeviceId ?? undefined,
            teamA: {
              id: teamA.id,
              name: teamA.name,
              people: teamAIds.flatMap((id) => {
                const person = personById.get(id);
                return person ? [person] : [];
              }),
            },
            teamB: {
              id: teamB.id,
              name: teamB.name,
              people: teamBIds.flatMap((id) => {
                const person = personById.get(id);
                return person ? [person] : [];
              }),
            },
          };
        })(),
      ];
    }),
  );
}

async function assertOperatorMatch(
  actor: ApiActor,
  matchId: string,
): Promise<OperatorScorableMatch> {
  const match = (await loadOperatorScorableMatches(actor)).find(
    (candidate) => candidate.id === matchId,
  );
  if (!match) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "Scorable match was not found for this organization.",
    );
  }
  return match;
}

export async function startOperatorMatchScoring(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly deviceId: string;
  readonly initialServer: "A" | "B";
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<MatchScoringState> {
  const organizationId = input.actor.organizationId;
  if (!organizationId) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "An organization context is required.",
    );
  }
  const match = await assertOperatorMatch(input.actor, input.matchId);
  if (match.status === "live") {
    if (match.authoritativeDeviceId !== input.deviceId) {
      throw new MatchServiceError(
        "DEVICE_MISMATCH",
        "This match is already controlled by another scoring device.",
      );
    }
    return loadMatchScoringState({
      actor: input.actor,
      matchId: input.matchId,
    });
  }
  if (match.teamA.people.length === 0 || match.teamB.people.length === 0) {
    throw new MatchServiceError(
      "MATCH_NOT_READY",
      "Both teams need rostered players before scoring can begin.",
    );
  }
  const startEvent: ScoreEvent = {
    id: crypto.randomUUID(),
    type: "match-started",
    initialServer: input.initialServer,
    occurredAt: input.now.toISOString(),
  };
  const result = await getDatabase().execute(sql`
    WITH claimed AS (
      UPDATE ${matches}
      SET
        "status" = 'live',
        "started_at" = ${input.now},
        "authoritative_device_id" = ${input.deviceId},
        "assigned_scorekeeper_person_id" = ${input.actor.personId}::uuid,
        "updated_at" = ${input.now}
      WHERE
        "id" = ${input.matchId}::uuid
        AND "status" = 'scheduled'
        AND "authoritative_device_id" IS NULL
      RETURNING "id"
    ),
    started AS (
      INSERT INTO ${rallyEvents} (
        "match_id",
        "sequence",
        "device_id",
        "monotonic_counter",
        "event_type",
        "payload",
        "wall_clock_at",
        "received_at"
      )
      SELECT
        "id",
        1,
        ${input.deviceId},
        1,
        'match-started',
        ${JSON.stringify(startEvent)}::jsonb,
        ${input.now},
        ${input.now}
      FROM claimed
      RETURNING "match_id"
    )
    INSERT INTO ${auditLog} (
      "organization_id",
      "actor_person_id",
      "actor_type",
      "action",
      "entity_type",
      "entity_id",
      "after_hash",
      "reason",
      "trace_id",
      "ip_address",
      "created_at"
    )
    SELECT
      ${organizationId}::uuid,
      ${input.actor.personId}::uuid,
      'person',
      'match.operator_scoring_started',
      'match',
      "match_id"::text,
      ${stableHash({
        deviceId: input.deviceId,
        initialServer: input.initialServer,
      })},
      'Authorized operator began scoring a scheduled match.',
      ${input.requestId},
      ${input.ipAddress ?? null},
      ${input.now}
    FROM started
    RETURNING "entity_id"
  `);
  if (!result.rows[0]) {
    throw new MatchServiceError(
      "MATCH_NOT_SCORABLE",
      "This scheduled match was already started or changed.",
    );
  }
  return loadMatchScoringState({
    actor: input.actor,
    matchId: input.matchId,
  });
}

export async function loadOperatorMatchScoringState(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
}): Promise<MatchScoringState> {
  await assertOperatorMatch(input.actor, input.matchId);
  return loadMatchScoringState(input);
}

export async function appendOperatorMatchEvents(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly deviceId: string;
  readonly events: readonly ScoreEventEnvelope[];
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly accepted: number;
  readonly scoring: MatchScoringState;
}> {
  await assertOperatorMatch(input.actor, input.matchId);
  return appendMatchEvents(input);
}

export async function startSelfReportedMatch(input: {
  readonly actor: ApiActor;
  readonly teamAIds: readonly [string, string];
  readonly teamBIds: readonly [string, string];
  readonly venueId?: string;
  readonly scoringSystem: ScoringSystem;
  readonly initialServer: "A" | "B";
  readonly deviceId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<MatchScoringState> {
  requireDatabase();
  const database = getDatabase();
  const participantIds = [...input.teamAIds, ...input.teamBIds];
  if (new Set(participantIds).size !== 4) {
    throw new MatchServiceError(
      "PARTICIPANT_DUPLICATE",
      "A player can appear only once in a doubles match.",
    );
  }
  if (!participantIds.includes(input.actor.personId)) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "The person recording a self-reported match must be one of its players.",
    );
  }
  const participantRows = await database
    .select({ id: people.id, status: people.status })
    .from(people)
    .where(inArray(people.id, participantIds));
  if (
    participantRows.length !== 4 ||
    participantRows.some((person) => person.status !== "active")
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_NOT_FOUND",
      "Every match participant must have an active Duna profile.",
    );
  }
  const scoringPeople = await loadScoringPeople(participantIds);
  const personById = new Map(
    scoringPeople.map((person) => [person.id, person] as const),
  );
  const teamName = (ids: readonly string[]) =>
    ids
      .map(
        (id) =>
          personById.get(id)?.displayName.split(/\s+/)[0] ?? "Duna player",
      )
      .join(" / ");
  const matchId = crypto.randomUUID();
  const teamAId = crypto.randomUUID();
  const teamBId = crypto.randomUUID();
  const startEvent: ScoreEvent = {
    id: crypto.randomUUID(),
    type: "match-started",
    initialServer: input.initialServer,
    occurredAt: input.now.toISOString(),
  };
  const format: MatchFormat = {
    ...standardBeachFormat,
    scoringSystem: input.scoringSystem,
  };
  await database.batch([
    database.insert(teams).values({
      id: teamAId,
      name: teamName(input.teamAIds),
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(teams).values({
      id: teamBId,
      name: teamName(input.teamBIds),
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(matches).values({
      id: matchId,
      teamAId,
      teamBId,
      venueId: input.venueId,
      createdByPersonId: input.actor.personId,
      status: "live",
      startedAt: input.now,
      format: format as unknown as Record<string, unknown>,
      authoritativeDeviceId: input.deviceId,
      ratingEligible: false,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...participantIds.map((personId, index) =>
      database.insert(teamMembers).values({
        teamId: index < 2 ? teamAId : teamBId,
        personId,
        role: "player",
        joinedAt: input.now,
      }),
    ),
    database.insert(rallyEvents).values({
      matchId,
      sequence: 1,
      deviceId: input.deviceId,
      monotonicCounter: 1,
      eventType: startEvent.type,
      payload: startEvent,
      wallClockAt: input.now,
      receivedAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "match.scoring_started",
      entityType: "match",
      entityId: matchId,
      afterHash: stableHash({
        teamAIds: input.teamAIds,
        teamBIds: input.teamBIds,
        venueId: input.venueId,
        format,
        deviceId: input.deviceId,
      }),
      reason: "Participant started a self-reported doubles match.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return loadMatchScoringState({
    actor: input.actor,
    matchId,
  });
}

export async function loadMatchScoringState(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
}): Promise<MatchScoringState> {
  requireDatabase();
  const database = getDatabase();
  const participation = await matchParticipants(input.matchId);
  assertMatchAuthority({
    actor: input.actor,
    teamAIds: participation.teamAIds,
    teamBIds: participation.teamBIds,
  });
  const [teamRows, scoringPeople, eventRows, confirmationRows, venue] =
    await Promise.all([
      database
        .select()
        .from(teams)
        .where(
          inArray(teams.id, [
            participation.match.teamAId!,
            participation.match.teamBId!,
          ]),
        ),
      loadScoringPeople([...participation.teamAIds, ...participation.teamBIds]),
      database
        .select()
        .from(rallyEvents)
        .where(eq(rallyEvents.matchId, input.matchId))
        .orderBy(asc(rallyEvents.sequence)),
      database
        .select()
        .from(matchConfirmations)
        .where(eq(matchConfirmations.matchId, input.matchId)),
      participation.match.venueId
        ? database.query.venues.findFirst({
            where: eq(venues.id, participation.match.venueId),
          })
        : Promise.resolve(undefined),
    ]);
  const peopleById = new Map(
    scoringPeople.map((person) => [person.id, person] as const),
  );
  const teamA = teamRows.find(
    (team) => team.id === participation.match.teamAId,
  );
  const teamB = teamRows.find(
    (team) => team.id === participation.match.teamBId,
  );
  if (!teamA || !teamB) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "Match teams were not found.",
    );
  }
  const events = eventRows.map(storedScoreEvent);
  const format = matchFormat(participation.match.format);
  const score = foldScore(events, format);
  const status =
    participation.match.status === "verified"
      ? "verified"
      : participation.match.status === "disputed"
        ? "disputed"
        : participation.match.status === "pending-verification"
          ? "pending-verification"
          : "live";
  return {
    matchId: participation.match.id,
    status,
    deviceId: participation.match.authoritativeDeviceId ?? "unknown-device",
    venueName: venue?.name ?? "Location not recorded",
    teamA: {
      id: teamA.id,
      name: teamA.name,
      people: participation.teamAIds.flatMap((id) => {
        const person = peopleById.get(id);
        return person ? [person] : [];
      }),
    },
    teamB: {
      id: teamB.id,
      name: teamB.name,
      people: participation.teamBIds.flatMap((id) => {
        const person = peopleById.get(id);
        return person ? [person] : [];
      }),
    },
    format,
    events,
    score,
    nextSequence: (eventRows.at(-1)?.sequence ?? 0) + 1,
    nextMonotonicCounter: (eventRows.at(-1)?.monotonicCounter ?? 0) + 1,
    confirmation: {
      confirmedPersonIds: confirmationRows
        .filter((row) => row.decision === "confirmed")
        .map((row) => row.personId),
      disputedPersonIds: confirmationRows
        .filter((row) => row.decision === "disputed")
        .map((row) => row.personId),
    },
  };
}

export async function loadPublicMatchScoringState(
  matchId: string,
): Promise<MatchScoringState> {
  requireDatabase();
  const database = getDatabase();
  const participation = await matchParticipants(matchId);
  const participantIds = [...participation.teamAIds, ...participation.teamBIds];
  const participantRows = await database
    .select({
      id: people.id,
      isMinor: people.isMinor,
      visibility: people.profileVisibility,
    })
    .from(people)
    .where(inArray(people.id, participantIds));
  if (
    participantRows.length !== participantIds.length ||
    participantRows.some(
      (person) => person.isMinor || person.visibility !== "public",
    )
  ) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "This match is not available on the public live surface.",
    );
  }
  return loadMatchScoringState({
    matchId,
    actor: {
      personId: "00000000-0000-4000-8000-000000000000",
      displayName: "Duna live view",
      roles: ["scorekeeper"],
      scopes: ["matches:score"],
      ageBand: "adult",
      isDemo: false,
    },
  });
}

export async function appendMatchEvents(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly deviceId: string;
  readonly events: readonly ScoreEventEnvelope[];
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly accepted: number;
  readonly scoring: MatchScoringState;
}> {
  requireDatabase();
  const database = getDatabase();
  const participation = await matchParticipants(input.matchId);
  assertMatchAuthority({
    actor: input.actor,
    teamAIds: participation.teamAIds,
    teamBIds: participation.teamBIds,
  });
  if (participation.match.status !== "live") {
    throw new MatchServiceError(
      "MATCH_NOT_SCORABLE",
      "This match is no longer accepting score events.",
    );
  }
  if (participation.match.authoritativeDeviceId !== input.deviceId) {
    throw new MatchServiceError(
      "DEVICE_MISMATCH",
      "This device is not authoritative for the match.",
    );
  }
  const existingRows = await database
    .select()
    .from(rallyEvents)
    .where(eq(rallyEvents.matchId, input.matchId))
    .orderBy(asc(rallyEvents.sequence));
  let lastSequence = existingRows.at(-1)?.sequence ?? 0;
  let lastCounter = existingRows.at(-1)?.monotonicCounter ?? 0;
  let accepted = 0;
  for (const envelope of [...input.events].sort(
    (a, b) => a.sequence - b.sequence,
  )) {
    if (envelope.event.type === "match-started") {
      throw new MatchServiceError(
        "EVENT_SEQUENCE_CONFLICT",
        "A match can have only its server-created start event.",
      );
    }
    const existing = existingRows.find(
      (row) =>
        row.sequence === envelope.sequence && row.deviceId === input.deviceId,
    );
    if (existing) {
      if (
        existing.monotonicCounter !== envelope.monotonicCounter ||
        existing.eventType !== envelope.event.type ||
        stableHash(existing.payload) !== stableHash(envelope.event)
      ) {
        throw new MatchServiceError(
          "EVENT_SEQUENCE_CONFLICT",
          "A scoring sequence was reused with different event data.",
        );
      }
      continue;
    }
    if (
      envelope.sequence !== lastSequence + 1 ||
      envelope.monotonicCounter <= lastCounter
    ) {
      throw new MatchServiceError(
        "EVENT_SEQUENCE_CONFLICT",
        "Score events must be uploaded in uninterrupted device order.",
      );
    }
    const inserted = await database
      .insert(rallyEvents)
      .values({
        matchId: input.matchId,
        sequence: envelope.sequence,
        deviceId: input.deviceId,
        monotonicCounter: envelope.monotonicCounter,
        eventType: envelope.event.type,
        payload: envelope.event,
        wallClockAt: new Date(envelope.event.occurredAt),
        receivedAt: input.now,
      })
      .onConflictDoNothing()
      .returning({ id: rallyEvents.id });
    if (!inserted[0]) {
      throw new MatchServiceError(
        "EVENT_SEQUENCE_CONFLICT",
        "A concurrent score event used this sequence.",
      );
    }
    accepted += 1;
    lastSequence = envelope.sequence;
    lastCounter = envelope.monotonicCounter;
  }

  const rows = await database
    .select()
    .from(rallyEvents)
    .where(eq(rallyEvents.matchId, input.matchId))
    .orderBy(asc(rallyEvents.sequence));
  const score = foldScore(
    rows.map(storedScoreEvent),
    matchFormat(participation.match.format),
  );
  if (score.status === "complete" || score.status === "forfeit") {
    const winnerTeamId =
      score.winner === "A"
        ? participation.match.teamAId
        : participation.match.teamBId;
    const actorIsParticipant = [
      ...participation.teamAIds,
      ...participation.teamBIds,
    ].includes(input.actor.personId);
    await database.batch([
      database
        .update(matches)
        .set({
          status: "pending-verification",
          completedAt: input.now,
          verification: "self-reported",
          verificationWeightBps: 2_500,
          winnerTeamId,
          ratingEligible: false,
          updatedAt: input.now,
        })
        .where(and(eq(matches.id, input.matchId), eq(matches.status, "live"))),
      ...(actorIsParticipant
        ? [
            database
              .insert(matchConfirmations)
              .values({
                matchId: input.matchId,
                personId: input.actor.personId,
                decision: "confirmed",
                occurredAt: input.now,
              })
              .onConflictDoUpdate({
                target: [
                  matchConfirmations.matchId,
                  matchConfirmations.personId,
                ],
                set: {
                  decision: "confirmed",
                  reason: null,
                  occurredAt: input.now,
                },
              }),
          ]
        : []),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "match.result_submitted",
        entityType: "match",
        entityId: input.matchId,
        afterHash: stableHash({
          score,
          winnerTeamId,
          eventCount: rows.length,
        }),
        reason:
          "Completed score was submitted for opponent verification; no rating was changed yet.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
  }
  return {
    accepted,
    scoring: await loadMatchScoringState({
      actor: input.actor,
      matchId: input.matchId,
    }),
  };
}

function ratingStateFor(
  personId: string,
  row: typeof ratings.$inferSelect | undefined,
  now: Date,
): {
  readonly state: RatingState;
  readonly windowStart: Date;
  readonly currentPeak: number;
} {
  if (!row) {
    const initial = createInitialRating({ playerId: personId });
    return {
      state: initial,
      windowStart: now,
      currentPeak: initial.display,
    };
  }
  const windowExpired =
    now.getTime() - row.weeklyGainWindowStart.getTime() >= 7 * 24 * 60 * 60_000;
  return {
    state: {
      playerId: personId,
      mu: row.mu,
      phi: row.phi,
      sigma: row.sigma,
      display: row.display,
      confidence: row.confidence,
      ratedMatches: row.ratedMatches,
      weeklyPositiveDisplayGain: windowExpired
        ? 0
        : row.weeklyPositiveDisplayGain,
    },
    windowStart: windowExpired ? now : row.weeklyGainWindowStart,
    currentPeak: row.current52WeekPeak,
  };
}

async function applyVerifiedRatings(input: {
  readonly actor: ApiActor;
  readonly participation: Awaited<ReturnType<typeof matchParticipants>>;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
  readonly setScores?: readonly { readonly a: number; readonly b: number }[];
  readonly verification?:
    "both-confirmed" | "imported-professional" | "imported-amateur";
  readonly verificationWeightBps?: number;
  readonly reason?: string;
}): Promise<void> {
  const database = getDatabase();
  const allPersonIds = [
    ...input.participation.teamAIds,
    ...input.participation.teamBIds,
  ];
  if (
    input.participation.teamAIds.length !== 2 ||
    input.participation.teamBIds.length !== 2
  ) {
    throw new MatchServiceError(
      "RATING_PROJECTION_FAILED",
      "Only complete doubles teams can enter the Sand Rating.",
    );
  }
  const [ratingRows, eventRows, rallyRows] = await Promise.all([
    database
      .select()
      .from(ratings)
      .where(
        and(
          inArray(ratings.personId, allPersonIds),
          eq(ratings.discipline, "beach-2s"),
        ),
      ),
    database
      .select({
        personId: ratingEvents.personId,
        sequence: ratingEvents.sequence,
      })
      .from(ratingEvents)
      .where(
        and(
          inArray(ratingEvents.personId, allPersonIds),
          eq(ratingEvents.discipline, "beach-2s"),
        ),
      )
      .orderBy(desc(ratingEvents.sequence)),
    database
      .select()
      .from(rallyEvents)
      .where(eq(rallyEvents.matchId, input.participation.match.id))
      .orderBy(asc(rallyEvents.sequence)),
  ]);
  const ratingByPerson = new Map(
    ratingRows.map((rating) => [rating.personId, rating] as const),
  );
  const stateByPerson = new Map(
    allPersonIds.map((personId) => [
      personId,
      ratingStateFor(personId, ratingByPerson.get(personId), input.now),
    ]),
  );
  const foldedScore = input.setScores
    ? undefined
    : foldScore(
        rallyRows.map(storedScoreEvent),
        matchFormat(input.participation.match.format),
      );
  const setScores =
    input.setScores ??
    foldedScore?.sets
      .filter((set) => set.winner)
      .map((set) => ({ a: set.a, b: set.b })) ??
    [];
  const hasWinner =
    setScores.filter((set) => set.a > set.b).length !==
    setScores.filter((set) => set.b > set.a).length;
  if (!hasWinner) {
    throw new MatchServiceError(
      "RATING_PROJECTION_FAILED",
      "A verified match must have a winner.",
    );
  }
  const result = rateDoublesMatch({
    teamA: input.participation.teamAIds.map((personId) => ({
      state: stateByPerson.get(personId)!.state,
    })) as [{ state: RatingState }, { state: RatingState }],
    teamB: input.participation.teamBIds.map((personId) => ({
      state: stateByPerson.get(personId)!.state,
    })) as [{ state: RatingState }, { state: RatingState }],
    setScores,
    verificationWeight: (input.verificationWeightBps ?? 10_000) / 10_000,
  });
  const nextSequence = (personId: string) =>
    (eventRows.find((event) => event.personId === personId)?.sequence ?? 0) + 1;
  try {
    await database.batch([
      database
        .update(matches)
        .set({
          status: "verified",
          verification: input.verification ?? "both-confirmed",
          verificationWeightBps: input.verificationWeightBps ?? 10_000,
          ratingEligible: true,
          ratingAppliedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(matches.id, input.participation.match.id),
            eq(matches.status, "pending-verification"),
          ),
        ),
      ...result.updates.map((update) => {
        const context = stateByPerson.get(update.playerId)!;
        return database
          .insert(ratings)
          .values({
            personId: update.playerId,
            discipline: "beach-2s",
            mu: update.after.mu,
            phi: update.after.phi,
            sigma: update.after.sigma,
            display: update.after.display,
            confidence: update.after.confidence,
            current52WeekPeak: Math.max(
              context.currentPeak,
              update.after.display,
            ),
            ratedMatches: update.after.ratedMatches,
            weeklyPositiveDisplayGain: update.after.weeklyPositiveDisplayGain,
            weeklyGainWindowStart: context.windowStart,
            updatedAt: input.now,
          })
          .onConflictDoUpdate({
            target: [ratings.personId, ratings.discipline],
            set: {
              mu: update.after.mu,
              phi: update.after.phi,
              sigma: update.after.sigma,
              display: update.after.display,
              confidence: update.after.confidence,
              current52WeekPeak: Math.max(
                context.currentPeak,
                update.after.display,
              ),
              ratedMatches: update.after.ratedMatches,
              weeklyPositiveDisplayGain: update.after.weeklyPositiveDisplayGain,
              weeklyGainWindowStart: context.windowStart,
              updatedAt: input.now,
            },
          });
      }),
      ...result.updates.map((update) =>
        database.insert(ratingEvents).values({
          personId: update.playerId,
          matchId: input.participation.match.id,
          discipline: "beach-2s",
          sequence: nextSequence(update.playerId),
          before: update.before as unknown as Record<string, number | string>,
          after: update.after as unknown as Record<string, number | string>,
          explanation: update.explanation as unknown as Record<
            string,
            number | string | boolean
          >,
          verificationWeightBps: input.verificationWeightBps ?? 10_000,
          createdAt: input.now,
        }),
      ),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "rating.match_applied",
        entityType: "match",
        entityId: input.participation.match.id,
        afterHash: stableHash({
          expectedTeamA: result.expectedTeamA,
          updates: result.updates.map((update) => ({
            personId: update.playerId,
            displayDelta: update.explanation.displayDelta,
          })),
        }),
        reason:
          input.reason ??
          "Both sides confirmed the result; deterministic rating updates were applied.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
  } catch (error) {
    const current = await database.query.matches.findFirst({
      where: eq(matches.id, input.participation.match.id),
    });
    if (current?.status === "verified" && current.ratingAppliedAt) return;
    throw error;
  }
}

export async function applyApprovedImportedMatchRating(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly setScores: readonly { readonly a: number; readonly b: number }[];
  readonly verification: "imported-professional" | "imported-amateur";
  readonly verificationWeightBps: number;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<void> {
  requireDatabase();
  const participation = await matchParticipants(input.matchId);
  if (
    participation.match.status === "verified" &&
    participation.match.ratingAppliedAt
  ) {
    return;
  }
  if (participation.match.status !== "pending-verification") {
    throw new MatchServiceError(
      "MATCH_NOT_CONFIRMABLE",
      "The imported match is not staged for rating approval.",
    );
  }
  await applyVerifiedRatings({
    actor: input.actor,
    participation,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
    setScores: input.setScores,
    verification: input.verification,
    verificationWeightBps: input.verificationWeightBps,
    reason:
      "A platform administrator approved mapped external match evidence; deterministic rating updates were applied.",
  });
}

export async function confirmMatchResult(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly decision: "confirmed" | "disputed";
  readonly reason?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly status: "pending-verification" | "verified" | "disputed";
  readonly ratingApplied: boolean;
}> {
  requireDatabase();
  const database = getDatabase();
  const participation = await matchParticipants(input.matchId);
  const participantIds = [...participation.teamAIds, ...participation.teamBIds];
  if (!participantIds.includes(input.actor.personId)) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Only a match participant can confirm or dispute this result.",
    );
  }
  if (
    participation.match.status === "verified" &&
    participation.match.ratingAppliedAt
  ) {
    return { status: "verified", ratingApplied: true };
  }
  if (
    participation.match.status !== "pending-verification" &&
    participation.match.status !== "disputed"
  ) {
    throw new MatchServiceError(
      "MATCH_NOT_CONFIRMABLE",
      "This match is not awaiting participant confirmation.",
    );
  }
  await database
    .insert(matchConfirmations)
    .values({
      matchId: input.matchId,
      personId: input.actor.personId,
      decision: input.decision,
      reason: input.reason,
      occurredAt: input.now,
    })
    .onConflictDoUpdate({
      target: [matchConfirmations.matchId, matchConfirmations.personId],
      set: {
        decision: input.decision,
        reason: input.reason,
        occurredAt: input.now,
      },
    });
  if (input.decision === "disputed") {
    await database.batch([
      database
        .update(matches)
        .set({
          status: "disputed",
          ratingEligible: false,
          updatedAt: input.now,
        })
        .where(eq(matches.id, input.matchId)),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "match.result_disputed",
        entityType: "match",
        entityId: input.matchId,
        reason: input.reason ?? "Participant disputed the submitted result.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
    return { status: "disputed", ratingApplied: false };
  }
  const confirmationRows = await database
    .select()
    .from(matchConfirmations)
    .where(eq(matchConfirmations.matchId, input.matchId));
  const confirmed = new Set(
    confirmationRows
      .filter((row) => row.decision === "confirmed")
      .map((row) => row.personId),
  );
  const disputed = confirmationRows.some((row) => row.decision === "disputed");
  const bothSidesConfirmed =
    participation.teamAIds.some((personId) => confirmed.has(personId)) &&
    participation.teamBIds.some((personId) => confirmed.has(personId));
  if (!bothSidesConfirmed || disputed) {
    return {
      status: disputed ? "disputed" : "pending-verification",
      ratingApplied: false,
    };
  }
  await applyVerifiedRatings({
    actor: input.actor,
    participation,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return { status: "verified", ratingApplied: true };
}
