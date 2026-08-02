import {
  auditLog,
  courts,
  divisions,
  eventTypes,
  getDatabase,
  matchConfirmations,
  matchHistoryDisputes,
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
  rateDoublesPerformance,
  rateDoublesMatch,
  type RatingState,
} from "@duna/rating";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
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
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
  readonly venueId?: string;
  readonly scoringSystem: ScoringSystem;
  readonly matchType: "competitive" | "friendly";
  readonly allPlayersAgreedToRecord: true;
  readonly serviceOrder: Readonly<{
    readonly A: readonly string[];
    readonly B: readonly string[];
  }>;
  readonly initialServerPersonId: string;
  readonly deviceId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<MatchScoringState> {
  requireDatabase();
  const database = getDatabase();
  if (
    input.teamAIds.length < 1 ||
    input.teamAIds.length > 6 ||
    input.teamAIds.length !== input.teamBIds.length
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Choose equally sized teams with one to six players per side.",
    );
  }
  const participantIds = [...input.teamAIds, ...input.teamBIds];
  if (new Set(participantIds).size !== participantIds.length) {
    throw new MatchServiceError(
      "PARTICIPANT_DUPLICATE",
      "A player can appear only once in a match.",
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
    participantRows.length !== participantIds.length ||
    participantRows.some((person) => person.status !== "active")
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_NOT_FOUND",
      "Every match participant must have an active Duna profile.",
    );
  }
  const samePlayers = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length &&
    left.every((personId) => right.includes(personId)) &&
    new Set(left).size === left.length;
  if (
    !samePlayers(input.serviceOrder.A, input.teamAIds) ||
    !samePlayers(input.serviceOrder.B, input.teamBIds) ||
    ![input.serviceOrder.A[0], input.serviceOrder.B[0]].includes(
      input.initialServerPersonId,
    )
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Serving order must include every player once, and the match must start with the first server from either side.",
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
  const initialServer = input.teamAIds.includes(input.initialServerPersonId)
    ? "A"
    : "B";
  const startEvent: ScoreEvent = {
    id: crypto.randomUUID(),
    type: "match-started",
    initialServer,
    initialServerPersonId: input.initialServerPersonId,
    occurredAt: input.now.toISOString(),
  };
  const format: MatchFormat = {
    ...standardBeachFormat,
    scoringSystem: input.scoringSystem,
    teamSize: input.teamAIds.length,
    matchType: input.matchType,
    recordingMode: "live",
    allPlayersAgreedToRecord: input.allPlayersAgreedToRecord,
    serviceOrder: input.serviceOrder,
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
    ...input.teamAIds.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamAId,
        personId,
        role: "player",
        joinedAt: input.now,
      }),
    ),
    ...input.teamBIds.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamBId,
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
      reason:
        "Participant started optional live scoring after every player agreed to record the match.",
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

export async function recordCompletedMatch(input: {
  readonly actor: ApiActor;
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
  readonly venueId?: string;
  readonly playedAt: Date;
  readonly setScores: readonly {
    readonly a: number;
    readonly b: number;
  }[];
  readonly matchType: "competitive" | "friendly";
  readonly allPlayersAgreedToRecord: true;
  readonly deviceId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<MatchScoringState> {
  requireDatabase();
  const database = getDatabase();
  if (
    input.teamAIds.length < 1 ||
    input.teamAIds.length > 6 ||
    input.teamAIds.length !== input.teamBIds.length
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Choose equally sized teams with one to six players per side.",
    );
  }
  const participantIds = [...input.teamAIds, ...input.teamBIds];
  if (new Set(participantIds).size !== participantIds.length) {
    throw new MatchServiceError(
      "PARTICIPANT_DUPLICATE",
      "A player can appear only once in a match.",
    );
  }
  if (!participantIds.includes(input.actor.personId)) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "The person recording a match must be one of its players.",
    );
  }
  if (input.setScores.length < 1 || input.setScores.length > 3) {
    throw new MatchServiceError(
      "MATCH_NOT_READY",
      "Record one set, a two-set sweep, or a full three-set result.",
    );
  }
  if (
    input.setScores.some(
      (set) =>
        !Number.isSafeInteger(set.a) ||
        !Number.isSafeInteger(set.b) ||
        set.a < 0 ||
        set.b < 0 ||
        set.a === set.b ||
        Math.abs(set.a - set.b) < 2,
    )
  ) {
    throw new MatchServiceError(
      "MATCH_NOT_READY",
      "Every recorded set needs a winner by at least two points.",
    );
  }
  const teamAWins = input.setScores.filter((set) => set.a > set.b).length;
  const teamBWins = input.setScores.filter((set) => set.b > set.a).length;
  const setsToWin = input.setScores.length === 1 ? 1 : 2;
  if (
    Math.max(teamAWins, teamBWins) !== setsToWin ||
    Math.min(teamAWins, teamBWins) !== input.setScores.length - setsToWin
  ) {
    throw new MatchServiceError(
      "MATCH_NOT_READY",
      "The set scores must describe a single set, a 2–0 sweep, or a 2–1 result.",
    );
  }
  const participantRows = await database
    .select({ id: people.id, status: people.status })
    .from(people)
    .where(inArray(people.id, participantIds));
  if (
    participantRows.length !== participantIds.length ||
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
  const winnerTeamId = teamAWins > teamBWins ? teamAId : teamBId;
  const format: MatchFormat = {
    ...standardBeachFormat,
    setsToWin,
    maximumSets: input.setScores.length,
    pointTargets: input.setScores.map((set) => Math.max(set.a, set.b)),
    hardCaps: input.setScores.map(() => null),
    sideSwitchIntervals: input.setScores.map(() => 7),
    teamSize: input.teamAIds.length,
    matchType: input.matchType,
    recordingMode: "completed",
    allPlayersAgreedToRecord: input.allPlayersAgreedToRecord,
    playedAt: input.playedAt.toISOString(),
  };
  const scoreEvents: readonly ScoreEvent[] = [
    {
      id: crypto.randomUUID(),
      type: "match-recorded",
      occurredAt: input.playedAt.toISOString(),
    },
    ...input.setScores.map((set, setIndex): ScoreEvent => ({
      id: crypto.randomUUID(),
      type: "set-score-recorded",
      setIndex,
      a: set.a,
      b: set.b,
      occurredAt: input.playedAt.toISOString(),
    })),
  ];
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
    ...input.teamAIds.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamAId,
        personId,
        role: "player",
        joinedAt: input.now,
      }),
    ),
    ...input.teamBIds.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamBId,
        personId,
        role: "player",
        joinedAt: input.now,
      }),
    ),
    database.insert(matches).values({
      id: matchId,
      teamAId,
      teamBId,
      venueId: input.venueId,
      createdByPersonId: input.actor.personId,
      status: "pending-verification",
      startedAt: input.playedAt,
      completedAt: input.playedAt,
      format: format as unknown as Record<string, unknown>,
      authoritativeDeviceId: input.deviceId,
      verification: "self-reported",
      verificationWeightBps:
        input.matchType === "competitive" && input.teamAIds.length === 2
          ? 2_500
          : 0,
      winnerTeamId,
      ratingEligible: false,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...scoreEvents.map((event, index) =>
      database.insert(rallyEvents).values({
        matchId,
        sequence: index + 1,
        deviceId: input.deviceId,
        monotonicCounter: index + 1,
        eventType: event.type,
        payload: event,
        wallClockAt: input.playedAt,
        receivedAt: input.now,
      }),
    ),
    database.insert(matchConfirmations).values({
      matchId,
      personId: input.actor.personId,
      decision: "confirmed",
      occurredAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "match.result_submitted",
      entityType: "match",
      entityId: matchId,
      afterHash: stableHash({
        teamAIds: input.teamAIds,
        teamBIds: input.teamBIds,
        venueId: input.venueId,
        setScores: input.setScores,
        format,
      }),
      reason:
        input.matchType === "competitive"
          ? "Participant recorded a completed competitive match after every player agreed."
          : "Participant recorded a completed friendly match for history only after every player agreed.",
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
    const completedFormat = matchFormat(participation.match.format);
    const ratingCapable =
      completedFormat.matchType !== "friendly" &&
      participation.teamAIds.length === 2 &&
      participation.teamBIds.length === 2;
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
          verificationWeightBps: ratingCapable ? 2_500 : 0,
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
  const teamAPerformance = result.updates.find((update) =>
    input.participation.teamAIds.includes(update.playerId),
  )!.explanation;
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
          ratingEvidence: {
            setScores,
            actualTeamA: teamAPerformance.actualResult,
            pointShareTeamA: teamAPerformance.pointShare,
            marginMultiplier: teamAPerformance.marginMultiplier,
            repeatOpponentWeight: teamAPerformance.repeatOpponentWeight,
          },
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

export async function rebuildSandRatingProjection(input: {
  readonly actor: ApiActor;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const historicalMatches = await database
    .select({
      id: matches.id,
      teamAId: matches.teamAId,
      teamBId: matches.teamBId,
      ratingEligible: matches.ratingEligible,
      ratingEvidence: matches.ratingEvidence,
      verificationWeightBps: matches.verificationWeightBps,
      ratingAppliedAt: matches.ratingAppliedAt,
    })
    .from(matches)
    .where(isNotNull(matches.ratingAppliedAt))
    .orderBy(asc(matches.ratingAppliedAt), asc(matches.id));
  const matchIds = historicalMatches.map((match) => match.id);
  const teamIds = [
    ...new Set(
      historicalMatches.flatMap((match) =>
        [match.teamAId, match.teamBId].filter((teamId): teamId is string =>
          Boolean(teamId),
        ),
      ),
    ),
  ];
  const [memberRows, storedEvents] = await Promise.all([
    teamIds.length
      ? database
          .select({
            teamId: teamMembers.teamId,
            personId: teamMembers.personId,
          })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, teamIds))
      : Promise.resolve([]),
    matchIds.length
      ? database
          .select()
          .from(ratingEvents)
          .where(
            and(
              eq(ratingEvents.discipline, "beach-2s"),
              inArray(ratingEvents.matchId, matchIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const membersByTeam = new Map<string, string[]>();
  for (const member of memberRows) {
    const current = membersByTeam.get(member.teamId) ?? [];
    current.push(member.personId);
    membersByTeam.set(member.teamId, current);
  }
  const eventsByMatch = new Map<string, (typeof storedEvents)[number][]>();
  for (const event of storedEvents) {
    const current = eventsByMatch.get(event.matchId) ?? [];
    current.push(event);
    eventsByMatch.set(event.matchId, current);
  }

  type ProjectionState = {
    state: RatingState;
    windowStart: Date;
    peak: number;
    sequence: number;
  };
  const projection = new Map<string, ProjectionState>();
  const replayedEvents: (typeof ratingEvents.$inferInsert)[] = [];
  const evidenceBackfills: {
    readonly matchId: string;
    readonly evidence: Record<string, unknown>;
  }[] = [];
  let skipped = 0;

  const stateAt = (personId: string, occurredAt: Date): ProjectionState => {
    const existing = projection.get(personId);
    if (!existing) {
      const state = createInitialRating({ playerId: personId });
      const initial = {
        state,
        windowStart: occurredAt,
        peak: state.display,
        sequence: 0,
      };
      projection.set(personId, initial);
      return initial;
    }
    if (
      occurredAt.getTime() - existing.windowStart.getTime() >=
      7 * 24 * 60 * 60_000
    ) {
      const reset = {
        ...existing,
        state: {
          ...existing.state,
          weeklyPositiveDisplayGain: 0,
        },
        windowStart: occurredAt,
      };
      projection.set(personId, reset);
      return reset;
    }
    return existing;
  };

  for (const match of historicalMatches) {
    if (!match.teamAId || !match.teamBId || !match.ratingAppliedAt) {
      continue;
    }
    const teamAIds = membersByTeam.get(match.teamAId) ?? [];
    const teamBIds = membersByTeam.get(match.teamBId) ?? [];
    if (teamAIds.length !== 2 || teamBIds.length !== 2) {
      skipped += 1;
      continue;
    }
    const storedEvidence = recordValue(match.ratingEvidence);
    const priorTeamAEvent = (eventsByMatch.get(match.id) ?? []).find((event) =>
      teamAIds.includes(event.personId),
    );
    const priorExplanation = recordValue(priorTeamAEvent?.explanation);
    const actualTeamA =
      finiteNumber(storedEvidence.actualTeamA) ??
      finiteNumber(priorExplanation.actualResult);
    const pointShareTeamA =
      finiteNumber(storedEvidence.pointShareTeamA) ??
      finiteNumber(priorExplanation.pointShare);
    const marginMultiplier =
      finiteNumber(storedEvidence.marginMultiplier) ??
      finiteNumber(priorExplanation.marginMultiplier);
    const repeatOpponentWeight =
      finiteNumber(storedEvidence.repeatOpponentWeight) ??
      finiteNumber(priorExplanation.repeatOpponentWeight);
    const setScores = Array.isArray(storedEvidence.setScores)
      ? storedEvidence.setScores.flatMap((score) => {
          const row = recordValue(score);
          const a = finiteNumber(row.a);
          const b = finiteNumber(row.b);
          return a !== undefined &&
            b !== undefined &&
            Number.isSafeInteger(a) &&
            Number.isSafeInteger(b)
            ? [{ a, b }]
            : [];
        })
      : [];
    if (
      actualTeamA === undefined ||
      pointShareTeamA === undefined ||
      marginMultiplier === undefined
    ) {
      skipped += 1;
      continue;
    }
    const evidence = {
      ...storedEvidence,
      actualTeamA,
      pointShareTeamA,
      marginMultiplier,
      ...(repeatOpponentWeight === undefined ? {} : { repeatOpponentWeight }),
    };
    if (!match.ratingEvidence) {
      evidenceBackfills.push({ matchId: match.id, evidence });
    }
    if (!match.ratingEligible) continue;
    const teamAState = teamAIds.map((personId) =>
      stateAt(personId, match.ratingAppliedAt!),
    ) as [ProjectionState, ProjectionState];
    const teamBState = teamBIds.map((personId) =>
      stateAt(personId, match.ratingAppliedAt!),
    ) as [ProjectionState, ProjectionState];
    const teamA = [
      { state: teamAState[0].state },
      { state: teamAState[1].state },
    ] as const;
    const teamB = [
      { state: teamBState[0].state },
      { state: teamBState[1].state },
    ] as const;
    const verificationWeight =
      (match.verificationWeightBps ??
        priorTeamAEvent?.verificationWeightBps ??
        10_000) / 10_000;
    const result =
      setScores.length > 0
        ? rateDoublesMatch({
            teamA,
            teamB,
            setScores,
            verificationWeight,
            previousPairMeetingsInWindow:
              repeatOpponentWeight && repeatOpponentWeight > 0
                ? Math.max(0, Math.round(1 / repeatOpponentWeight ** 2) - 1)
                : undefined,
          })
        : rateDoublesPerformance({
            teamA,
            teamB,
            actualTeamA,
            pointShareTeamA,
            marginMultiplier,
            verificationWeight,
            repeatOpponentWeight,
          });
    for (const update of result.updates) {
      const current = projection.get(update.playerId)!;
      const sequence = current.sequence + 1;
      projection.set(update.playerId, {
        ...current,
        state: update.after,
        peak: Math.max(current.peak, update.after.display),
        sequence,
      });
      replayedEvents.push({
        personId: update.playerId,
        matchId: match.id,
        discipline: "beach-2s",
        sequence,
        before: update.before as unknown as Record<string, number | string>,
        after: update.after as unknown as Record<string, number | string>,
        explanation: update.explanation as unknown as Record<
          string,
          number | string | boolean
        >,
        verificationWeightBps:
          match.verificationWeightBps ??
          priorTeamAEvent?.verificationWeightBps ??
          10_000,
        createdAt: match.ratingAppliedAt,
      });
    }
  }

  const projectedRatings = [...projection.values()].map((entry) => ({
    personId: entry.state.playerId,
    discipline: "beach-2s" as const,
    mu: entry.state.mu,
    phi: entry.state.phi,
    sigma: entry.state.sigma,
    display: entry.state.display,
    confidence: entry.state.confidence,
    current52WeekPeak: entry.peak,
    ratedMatches: entry.state.ratedMatches,
    weeklyPositiveDisplayGain: entry.state.weeklyPositiveDisplayGain,
    weeklyGainWindowStart: entry.windowStart,
    updatedAt: input.now,
  }));
  await database.batch([
    database
      .delete(ratingEvents)
      .where(eq(ratingEvents.discipline, "beach-2s")),
    database.delete(ratings).where(eq(ratings.discipline, "beach-2s")),
    ...evidenceBackfills.map((backfill) =>
      database
        .update(matches)
        .set({ ratingEvidence: backfill.evidence })
        .where(eq(matches.id, backfill.matchId)),
    ),
    ...(projectedRatings.length
      ? [database.insert(ratings).values(projectedRatings)]
      : []),
    ...(replayedEvents.length
      ? [database.insert(ratingEvents).values(replayedEvents)]
      : []),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "rating.projection.rebuilt",
      entityType: "rating-projection",
      entityId: "beach-2s",
      afterHash: stableHash({
        matches: historicalMatches.filter((match) => match.ratingEligible)
          .length,
        events: replayedEvents.length,
        players: projectedRatings.length,
        skipped,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    matches: new Set(replayedEvents.map((event) => event.matchId)).size,
    players: projectedRatings.length,
    events: replayedEvents.length,
    skipped,
  };
}

export async function flagMatchHistoryInaccurate(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly reasonCode:
    "not-me" | "wrong-score" | "wrong-opponents" | "duplicate" | "other";
  readonly details?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const participation = await matchParticipants(input.matchId);
  const participantIds = [...participation.teamAIds, ...participation.teamBIds];
  if (!participantIds.includes(input.actor.personId)) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Only a match participant can flag this result.",
    );
  }
  await database.batch([
    database
      .insert(matchHistoryDisputes)
      .values({
        matchId: input.matchId,
        personId: input.actor.personId,
        reasonCode: input.reasonCode,
        details: input.details?.trim() || null,
        status: "pending",
        excludesFromRating: true,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [matchHistoryDisputes.personId, matchHistoryDisputes.matchId],
        set: {
          reasonCode: input.reasonCode,
          details: input.details?.trim() || null,
          status: "pending",
          excludesFromRating: true,
          reviewedByPersonId: null,
          reviewedAt: null,
          resolutionNotes: null,
          updatedAt: input.now,
        },
      }),
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
      action: "match.history.flagged-inaccurate",
      entityType: "match",
      entityId: input.matchId,
      afterHash: stableHash({
        reasonCode: input.reasonCode,
        excludesFromRating: true,
      }),
      reason:
        "A participant flagged imported match evidence for administrator review.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  const replay = await rebuildSandRatingProjection({
    actor: input.actor,
    reason:
      "A participant disputed match evidence, so the beach rating projection was rebuilt without held evidence.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return {
    matchId: input.matchId,
    status: "pending" as const,
    ratingEligibility: "held" as const,
    replay,
  };
}

export async function reviewMatchHistoryDispute(input: {
  readonly actor: ApiActor;
  readonly disputeId: string;
  readonly decision: "upheld" | "rejected";
  readonly resolutionNotes: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  if (
    !input.actor.roles.includes("admin") &&
    !input.actor.roles.includes("super-admin")
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Only a platform administrator can resolve match-history evidence.",
    );
  }
  const database = getDatabase();
  const dispute = await database.query.matchHistoryDisputes.findFirst({
    where: eq(matchHistoryDisputes.id, input.disputeId),
  });
  if (!dispute) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "The match-history review was not found.",
    );
  }
  const otherHeldDisputes = await database
    .select({ status: matchHistoryDisputes.status })
    .from(matchHistoryDisputes)
    .where(
      and(
        eq(matchHistoryDisputes.matchId, dispute.matchId),
        ne(matchHistoryDisputes.id, dispute.id),
        inArray(matchHistoryDisputes.status, ["pending", "upheld"]),
      ),
    );
  const remainsHeld =
    input.decision === "upheld" || otherHeldDisputes.length > 0;
  await database.batch([
    database
      .update(matchHistoryDisputes)
      .set({
        status: input.decision,
        excludesFromRating: input.decision === "upheld",
        reviewedByPersonId: input.actor.personId,
        reviewedAt: input.now,
        resolutionNotes: input.resolutionNotes.trim(),
        updatedAt: input.now,
      })
      .where(eq(matchHistoryDisputes.id, dispute.id)),
    database
      .update(matches)
      .set({
        status: remainsHeld ? "disputed" : "verified",
        ratingEligible: !remainsHeld,
        updatedAt: input.now,
      })
      .where(eq(matches.id, dispute.matchId)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: `match.history-review.${input.decision}`,
      entityType: "match-history-dispute",
      entityId: dispute.id,
      beforeHash: stableHash({
        status: dispute.status,
        excludesFromRating: dispute.excludesFromRating,
      }),
      afterHash: stableHash({
        status: input.decision,
        excludesFromRating: remainsHeld,
      }),
      reason: input.resolutionNotes.trim(),
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  const replay = await rebuildSandRatingProjection({
    actor: input.actor,
    reason: `Match-history evidence review was ${input.decision}; rebuild preserves an auditable rating projection.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return {
    disputeId: dispute.id,
    matchId: dispute.matchId,
    status: input.decision,
    ratingEligibility: remainsHeld ? "held" : "eligible",
    replay,
  };
}

export async function removeSelfReportedMatch(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const participation = await matchParticipants(input.matchId);
  if (
    participation.match.createdByPersonId !== input.actor.personId ||
    participation.match.verification !== "self-reported" ||
    participation.match.status !== "pending-verification" ||
    participation.match.ratingAppliedAt
  ) {
    throw new MatchServiceError(
      "MATCH_NOT_CONFIRMABLE",
      "Only an unrated self-reported match can be removed. Flag rated or imported history as inaccurate instead.",
    );
  }
  await database.batch([
    database
      .update(matches)
      .set({
        status: "cancelled",
        ratingEligible: false,
        updatedAt: input.now,
      })
      .where(eq(matches.id, input.matchId)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "match.self-reported.removed",
      entityType: "match",
      entityId: input.matchId,
      reason: "Creator removed an unrated self-reported match.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { matchId: input.matchId, removed: true as const };
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
  if (participation.match.status === "verified") {
    return {
      status: "verified",
      ratingApplied: Boolean(participation.match.ratingAppliedAt),
    };
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
  const format = matchFormat(participation.match.format);
  const ratingCapable =
    format.matchType !== "friendly" &&
    participation.teamAIds.length === 2 &&
    participation.teamBIds.length === 2;
  if (!ratingCapable) {
    await database.batch([
      database
        .update(matches)
        .set({
          status: "verified",
          verification: "both-confirmed",
          verificationWeightBps: 0,
          ratingEligible: false,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(matches.id, input.matchId),
            eq(matches.status, "pending-verification"),
          ),
        ),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "match.result_verified",
        entityType: "match",
        entityId: input.matchId,
        afterHash: stableHash({
          matchType: format.matchType ?? "competitive",
          teamSize: format.teamSize ?? participation.teamAIds.length,
          ratingApplied: false,
        }),
        reason:
          format.matchType === "friendly"
            ? "Both sides confirmed a friendly match; it remains in history without moving Sand Rating."
            : "Both sides confirmed a non-doubles result; it remains in history while that format is not yet rated.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
    return { status: "verified", ratingApplied: false };
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
