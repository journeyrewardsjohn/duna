import {
  auditLog,
  courts,
  divisions,
  eventTypes,
  getDatabase,
  getTransactionalDatabase,
  matchConfirmations,
  matchHistoryDisputes,
  matchParticipantInvitations,
  matches,
  organizationMemberships,
  organizationParticipants,
  people,
  programs,
  rallyEvents,
  registrations,
  ratingEvents,
  ratings,
  sessions,
  teamMembers,
  teams,
  venues,
  worldRankings,
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
  professionalSeed,
  rateDoublesPerformance,
  rateDoublesMatch,
  type RatingState,
} from "@duna/rating";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import { publishMatchLiveActivity } from "./live-activities";
import { canonicalPublicWebUrl } from "./public-web-url";
import { sendTransactionalEmail } from "./resend";
import { sendTemplateSms } from "./sent";
import {
  captureMatchWeatherSnapshot,
  resolveWeatherCoordinates,
} from "./weather";

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

async function captureStoredMatchWeather(input: {
  readonly venueId?: string;
  readonly location?: MatchFormat["location"];
  readonly matchTime: Date;
  readonly now: Date;
}) {
  const database = getDatabase();
  const venue = input.venueId
    ? await database
        .select({
          name: venues.name,
          addressLine1: venues.addressLine1,
          addressLine2: venues.addressLine2,
          locality: venues.locality,
          administrativeArea: venues.administrativeArea,
          postalCode: venues.postalCode,
          countryCode: venues.countryCode,
          googlePlaceId: venues.googlePlaceId,
          latitude: venues.latitude,
          longitude: venues.longitude,
        })
        .from(venues)
        .where(eq(venues.id, input.venueId))
        .limit(1)
        .then((rows) => rows[0])
    : undefined;
  const locationHasCoordinates =
    input.location?.latitude !== undefined &&
    input.location.longitude !== undefined;
  const venueLatitude = venue?.latitude ?? undefined;
  const venueLongitude = venue?.longitude ?? undefined;
  const venueHasCoordinates =
    venueLatitude !== undefined && venueLongitude !== undefined;
  const coordinates = await resolveWeatherCoordinates({
    latitude: locationHasCoordinates
      ? input.location?.latitude
      : venueHasCoordinates
        ? venueLatitude
        : undefined,
    longitude: locationHasCoordinates
      ? input.location?.longitude
      : venueHasCoordinates
        ? venueLongitude
        : undefined,
    googlePlaceId:
      input.location?.googlePlaceId ?? venue?.googlePlaceId ?? undefined,
    query: [
      input.location?.name,
      input.location?.address,
      venue?.name,
      venue?.addressLine1,
      venue?.addressLine2,
      venue?.locality,
      venue?.administrativeArea,
      venue?.postalCode,
      venue?.countryCode,
    ]
      .filter(Boolean)
      .join(", "),
    now: input.now,
  });
  if (!coordinates) return undefined;
  return captureMatchWeatherSnapshot({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    matchTime: input.matchTime,
    now: input.now,
  });
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
  readonly reporting: {
    readonly reporters: readonly {
      readonly personId: string;
      readonly displayName: string;
      readonly eventCount: number;
      readonly lastReportedAt: string;
    }[];
    readonly lastReporter?: {
      readonly personId: string;
      readonly displayName: string;
      readonly reportedAt: string;
    };
  };
  readonly participantClaims?: {
    readonly shareUrl: string;
    readonly pending: readonly {
      readonly personId: string;
      readonly displayName: string;
      readonly side: "A" | "B";
    }[];
  };
}

export interface ScoreEventEnvelope {
  readonly sequence: number;
  readonly monotonicCounter: number;
  readonly event: ScoreEvent;
}

export interface ProvisionalMatchParticipantInput {
  readonly side: "A" | "B";
  readonly givenName: string;
  readonly familyName: string;
  readonly email?: string;
  readonly phoneE164?: string;
}

export interface MatchParticipantInvitationSummary {
  readonly matchId: string;
  readonly invitedName: string;
  readonly reporterName: string;
  readonly opponentNames: readonly string[];
  readonly playedAt: string;
  readonly venueName: string;
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly status: "pending" | "claimed" | "expired" | "cancelled";
  readonly expiresAt: string;
  readonly appDeepLink: string;
  readonly availablePlayers: readonly {
    readonly personId: string;
    readonly displayName: string;
    readonly side: "A" | "B";
  }[];
}

export function matchParticipantInvitationMessage(input: {
  readonly opponentNames: readonly string[];
  readonly inviteUrl: string;
}): string {
  const opponentLabel =
    input.opponentNames.filter(Boolean).join(" & ") || "your opponents";
  return `Your match against ${opponentLabel} has been reported in Duna. Join now to see your rating and track your progress for free. ${input.inviteUrl}`;
}

export interface OperatorScorableMatch {
  readonly id: string;
  readonly status: "scheduled" | "live";
  readonly scheduledAt?: string;
  readonly venueId?: string;
  readonly venueName: string;
  readonly courtId?: string;
  readonly courtName?: string;
  readonly sessionId?: string;
  readonly sessionTitle?: string;
  readonly divisionName?: string;
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

function matchInvitationUrl(inviteToken: string): string {
  return canonicalPublicWebUrl(
    `/join/match/${encodeURIComponent(inviteToken)}`,
  );
}

function provisionalHandle(input: {
  readonly givenName: string;
  readonly familyName: string;
  readonly id: string;
}): string {
  const base = `${input.givenName}-${input.familyName}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "")
    .slice(0, 30);
  return `${base || "player"}-pending-${input.id.replaceAll("-", "").slice(-8)}`.slice(
    0,
    48,
  );
}

function firstNames(displayNames: readonly string[]): readonly string[] {
  return displayNames.map(
    (name) => name.trim().split(/\s+/)[0] || "Duna player",
  );
}

async function deliverMatchParticipantInvitation(input: {
  readonly invitationId: string;
  readonly inviteToken: string;
  readonly invitedName: string;
  readonly invitedEmail?: string;
  readonly invitedPhoneE164?: string;
  readonly reporterName: string;
  readonly opponentNames: readonly string[];
  readonly now: Date;
}): Promise<void> {
  const inviteUrl = matchInvitationUrl(input.inviteToken);
  const message = matchParticipantInvitationMessage({
    opponentNames: input.opponentNames,
    inviteUrl,
  });
  const delivery = input.invitedPhoneE164
    ? await sendTemplateSms({
        to: input.invitedPhoneE164,
        templateName:
          process.env.SENT_DM_MATCH_INVITE_TEMPLATE_NAME ??
          "duna_match_report_invitation",
        parameters: {
          player_name: input.invitedName,
          reporter_name: input.reporterName,
          opponents: input.opponentNames.join(" & "),
          invite_url: inviteUrl,
          message,
        },
        idempotencyKey: `match-participant-invite:${input.invitationId}`,
      }).catch((error: unknown) => ({
        configured: true,
        sent: false,
        messageId: undefined,
        reason:
          error instanceof Error
            ? error.message
            : "SMS delivery did not complete.",
      }))
    : input.invitedEmail
      ? await sendTransactionalEmail({
          to: input.invitedEmail,
          subject: "Your match has been reported in Duna",
          text: [
            `Hi ${input.invitedName.split(/\s+/)[0] || input.invitedName},`,
            "",
            message,
            "",
            `${input.reporterName} added the result. The match will not affect Sand Rating until every required player has joined Duna and the result is confirmed.`,
          ].join("\n"),
          idempotencyKey: `match-participant-invite:${input.invitationId}`,
        }).catch((error: unknown) => ({
          configured: true,
          sent: false,
          messageId: undefined,
          reason:
            error instanceof Error
              ? error.message
              : "Email delivery did not complete.",
        }))
      : {
          configured: false,
          sent: false,
          messageId: undefined,
          reason: "No delivery destination was available.",
        };
  await getDatabase()
    .update(matchParticipantInvitations)
    .set({
      deliveryStatus: delivery.configured
        ? delivery.sent
          ? "sent"
          : "failed"
        : "not-configured",
      deliveryMessageId: delivery.messageId,
      updatedAt: input.now,
    })
    .where(eq(matchParticipantInvitations.id, input.invitationId));
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
  readonly sessionId?: string;
  readonly organizationIds: readonly string[];
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
  const [memberRows, divisionContextRows] = await Promise.all([
    database
      .select()
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId])),
    match.divisionId
      ? database
          .select({
            sessionId: divisions.sessionId,
            programId: sessions.programId,
            eventTypeId: sessions.eventTypeId,
            sessionVenueId: sessions.venueId,
          })
          .from(divisions)
          .leftJoin(sessions, eq(divisions.sessionId, sessions.id))
          .where(eq(divisions.id, match.divisionId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const divisionContext = divisionContextRows[0];
  const venueIds = [match.venueId, divisionContext?.sessionVenueId].filter(
    (id): id is string => Boolean(id),
  );
  const [venueOrganizations, program, eventType] = await Promise.all([
    venueIds.length > 0
      ? database
          .select({ organizationId: venues.organizationId })
          .from(venues)
          .where(inArray(venues.id, venueIds))
      : Promise.resolve([]),
    divisionContext?.programId
      ? database.query.programs.findFirst({
          where: eq(programs.id, divisionContext.programId),
        })
      : Promise.resolve(undefined),
    divisionContext?.eventTypeId
      ? database.query.eventTypes.findFirst({
          where: eq(eventTypes.id, divisionContext.eventTypeId),
        })
      : Promise.resolve(undefined),
  ]);
  return {
    match,
    teamAIds: memberRows
      .filter((member) => member.teamId === match.teamAId)
      .map((member) => member.personId),
    teamBIds: memberRows
      .filter((member) => member.teamId === match.teamBId)
      .map((member) => member.personId),
    sessionId: divisionContext?.sessionId,
    organizationIds: [
      ...new Set(
        [
          ...venueOrganizations.map((row) => row.organizationId),
          program?.organizationId,
          eventType?.organizationId,
        ].filter((id): id is string => Boolean(id)),
      ),
    ],
  };
}

async function assertMatchAuthority(input: {
  readonly actor: ApiActor;
  readonly match: typeof matches.$inferSelect;
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
  readonly sessionId?: string;
  readonly organizationIds: readonly string[];
}): Promise<void> {
  const isParticipant = [...input.teamAIds, ...input.teamBIds].includes(
    input.actor.personId,
  );
  const isNamedReporter =
    input.match.createdByPersonId === input.actor.personId ||
    input.match.assignedScorekeeperPersonId === input.actor.personId;
  if (isParticipant || isNamedReporter) return;

  const database = getDatabase();
  const [registration, staffMembership, organizationParticipant] =
    await Promise.all([
      input.sessionId
        ? database.query.registrations.findFirst({
            where: and(
              eq(registrations.sessionId, input.sessionId),
              eq(registrations.personId, input.actor.personId),
              inArray(registrations.status, ["confirmed", "checked-in"]),
            ),
          })
        : Promise.resolve(undefined),
      input.organizationIds.length > 0
        ? database.query.organizationMemberships.findFirst({
            where: and(
              inArray(organizationMemberships.organizationId, [
                ...input.organizationIds,
              ]),
              eq(organizationMemberships.personId, input.actor.personId),
              eq(organizationMemberships.active, true),
            ),
          })
        : Promise.resolve(undefined),
      input.organizationIds.length > 0
        ? database.query.organizationParticipants.findFirst({
            where: and(
              inArray(organizationParticipants.organizationId, [
                ...input.organizationIds,
              ]),
              eq(organizationParticipants.personId, input.actor.personId),
              eq(organizationParticipants.status, "active"),
            ),
          })
        : Promise.resolve(undefined),
    ]);
  if (!registration && !staffMembership && !organizationParticipant) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Only a player, confirmed event participant, assigned scorer, match creator, or active organization member can report this score.",
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
      venueId: matches.venueId,
      courtId: matches.courtId,
      authoritativeDeviceId: matches.authoritativeDeviceId,
      teamAId: matches.teamAId,
      teamBId: matches.teamBId,
      venueName: venues.name,
      courtName: courts.name,
      sessionId: sessions.id,
      sessionTitle: sessions.title,
      divisionName: divisions.name,
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
            venueId: row.venueId ?? undefined,
            venueName: row.venueName ?? "Location not recorded",
            courtId: row.courtId ?? undefined,
            courtName: row.courtName ?? undefined,
            sessionId: row.sessionId ?? undefined,
            sessionTitle: row.sessionTitle ?? undefined,
            divisionName: row.divisionName ?? undefined,
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
  const weatherSnapshot = await captureStoredMatchWeather({
    venueId: match.venueId,
    matchTime: input.now,
    now: input.now,
  }).catch(() => undefined);
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
        "reported_by_person_id",
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
        ${input.actor.personId}::uuid,
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
  if (weatherSnapshot) {
    await getDatabase()
      .update(matches)
      .set({
        weatherSnapshot,
        weatherCapturedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(eq(matches.id, input.matchId), isNull(matches.weatherSnapshot)),
      )
      .catch(() => undefined);
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
  readonly provisionalParticipants?: readonly ProvisionalMatchParticipantInput[];
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
  const provisionalParticipants = (input.provisionalParticipants ?? []).map(
    (participant) => ({
      ...participant,
      givenName: participant.givenName.trim(),
      familyName: participant.familyName.trim(),
      email: participant.email?.trim().toLowerCase() || undefined,
      phoneE164: participant.phoneE164?.trim() || undefined,
    }),
  );
  const provisionalTeamA = provisionalParticipants.filter(
    (participant) => participant.side === "A",
  );
  const provisionalTeamB = provisionalParticipants.filter(
    (participant) => participant.side === "B",
  );
  const teamASize = input.teamAIds.length + provisionalTeamA.length;
  const teamBSize = input.teamBIds.length + provisionalTeamB.length;
  if (teamASize < 1 || teamASize > 6 || teamASize !== teamBSize) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Choose equally sized teams with one to six players per side.",
    );
  }
  if (
    provisionalParticipants.some(
      (participant) => !participant.givenName || !participant.familyName,
    )
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Every guest needs a first and last name.",
    );
  }
  const provisionalDestinations = provisionalParticipants.flatMap(
    (participant) =>
      participant.phoneE164
        ? [`phone:${participant.phoneE164}`]
        : participant.email
          ? [`email:${participant.email}`]
          : [],
  );
  if (
    new Set(provisionalDestinations).size !== provisionalDestinations.length
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_DUPLICATE",
      "Use a different email or mobile number for each guest.",
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
  for (const participant of provisionalParticipants) {
    if (!participant.email && !participant.phoneE164) continue;
    const existing = participant.email
      ? await database
          .select({
            displayName: people.displayName,
            profileClaimStatus: people.profileClaimStatus,
            status: people.status,
          })
          .from(people)
          .where(sql`lower(${people.email}) = ${participant.email}`)
          .limit(1)
      : await database
          .select({
            displayName: people.displayName,
            profileClaimStatus: people.profileClaimStatus,
            status: people.status,
          })
          .from(people)
          .where(eq(people.phoneE164, participant.phoneE164!))
          .limit(1);
    if (
      existing[0]?.status === "active" &&
      existing[0].profileClaimStatus === "claimed"
    ) {
      throw new MatchServiceError(
        "PARTICIPANT_DUPLICATE",
        `${existing[0].displayName} already has a Duna profile. Add that profile from player search instead.`,
      );
    }
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
  const provisionalRows = provisionalParticipants.map((participant) => {
    const id = crypto.randomUUID();
    const displayName = `${participant.givenName} ${participant.familyName}`;
    return {
      ...participant,
      id,
      displayName,
      handle: provisionalHandle({
        givenName: participant.givenName,
        familyName: participant.familyName,
        id,
      }),
      inviteToken: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
        "-",
        "",
      ),
      invitationId: crypto.randomUUID(),
    };
  });
  const provisionalA = provisionalRows.filter(
    (participant) => participant.side === "A",
  );
  const provisionalB = provisionalRows.filter(
    (participant) => participant.side === "B",
  );
  const teamAAllIds = [...input.teamAIds, ...provisionalA.map(({ id }) => id)];
  const teamBAllIds = [...input.teamBIds, ...provisionalB.map(({ id }) => id)];
  const teamName = (
    ids: readonly string[],
    provisional: readonly (typeof provisionalRows)[number][],
  ) =>
    firstNames([
      ...ids.map((id) => personById.get(id)?.displayName ?? "Duna player"),
      ...provisional.map((participant) => participant.displayName),
    ]).join(" / ");
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
  const format = {
    ...standardBeachFormat,
    scoringSystem: input.scoringSystem,
    teamSize: teamASize,
    matchType: input.matchType,
    recordingMode: "live",
    allPlayersAgreedToRecord: input.allPlayersAgreedToRecord,
    serviceOrder: {
      A: [...input.serviceOrder.A, ...provisionalA.map(({ id }) => id)],
      B: [...input.serviceOrder.B, ...provisionalB.map(({ id }) => id)],
    },
    ratingReadiness:
      provisionalRows.length > 0
        ? {
            status: "awaiting-player-claims",
            requiredClaims: provisionalRows.length,
            message:
              "This match will not affect Sand Rating until every required player joins Duna and the result is confirmed.",
          }
        : { status: "ready-for-confirmation", requiredClaims: 0 },
  };
  const weatherSnapshot = await captureStoredMatchWeather({
    venueId: input.venueId,
    matchTime: input.now,
    now: input.now,
  }).catch(() => undefined);
  await database.batch([
    database.insert(teams).values({
      id: teamAId,
      name: teamName(input.teamAIds, provisionalA),
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...provisionalRows.map((participant) =>
      database.insert(people).values({
        id: participant.id,
        givenName: participant.givenName,
        familyName: participant.familyName,
        displayName: participant.displayName,
        handle: participant.handle,
        profileClaimStatus: "unclaimed",
        profileVisibility: "private",
        status: "active",
        ageBand: "unknown",
        createdAt: input.now,
        updatedAt: input.now,
      }),
    ),
    database.insert(teams).values({
      id: teamBId,
      name: teamName(input.teamBIds, provisionalB),
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
      weatherSnapshot,
      weatherCapturedAt: weatherSnapshot ? input.now : undefined,
      authoritativeDeviceId: input.deviceId,
      ratingEligible: false,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...teamAAllIds.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamAId,
        personId,
        role: "player",
        joinedAt: input.now,
      }),
    ),
    ...teamBAllIds.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamBId,
        personId,
        role: "player",
        joinedAt: input.now,
      }),
    ),
    ...provisionalRows.map((participant) =>
      database.insert(matchParticipantInvitations).values({
        id: participant.invitationId,
        matchId,
        provisionalPersonId: participant.id,
        invitedByPersonId: input.actor.personId,
        inviteToken: participant.inviteToken,
        invitedEmail: participant.email,
        invitedPhoneE164: participant.phoneE164,
        deliveryChannel: participant.phoneE164
          ? "sms"
          : participant.email
            ? "email"
            : undefined,
        expiresAt: new Date(input.now.getTime() + 30 * 24 * 60 * 60_000),
        createdAt: input.now,
        updatedAt: input.now,
      }),
    ),
    database.insert(rallyEvents).values({
      matchId,
      reportedByPersonId: input.actor.personId,
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
        provisionalPersonIds: provisionalRows.map(({ id }) => id),
        venueId: input.venueId,
        format,
        deviceId: input.deviceId,
      }),
      reason:
        provisionalRows.length > 0
          ? "Participant started live scoring with named guest places; rating stays locked until every guest claims a Duna identity."
          : "Participant started optional live scoring after every player agreed to record the match.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  await Promise.all(
    provisionalRows.map((participant) =>
      deliverMatchParticipantInvitation({
        invitationId: participant.invitationId,
        inviteToken: participant.inviteToken,
        invitedName: participant.displayName,
        invitedEmail: participant.email,
        invitedPhoneE164: participant.phoneE164,
        reporterName: input.actor.displayName,
        opponentNames: firstNames(
          participant.side === "A"
            ? [
                ...input.teamBIds.map(
                  (id) => personById.get(id)?.displayName ?? "Duna player",
                ),
                ...provisionalB.map(({ displayName }) => displayName),
              ]
            : [
                ...input.teamAIds.map(
                  (id) => personById.get(id)?.displayName ?? "Duna player",
                ),
                ...provisionalA.map(({ displayName }) => displayName),
              ],
        ),
        now: input.now,
      }).catch(() => undefined),
    ),
  );
  return loadMatchScoringState({
    actor: input.actor,
    matchId,
  });
}

export async function recordCompletedMatch(input: {
  readonly actor: ApiActor;
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
  readonly provisionalParticipants?: readonly ProvisionalMatchParticipantInput[];
  readonly venueId?: string;
  readonly location?: MatchFormat["location"];
  readonly playedAt: Date;
  readonly setsToWin: 1 | 2 | 3;
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
  const provisionalParticipants = (input.provisionalParticipants ?? []).map(
    (participant) => ({
      ...participant,
      givenName: participant.givenName.trim(),
      familyName: participant.familyName.trim(),
      email: participant.email?.trim().toLowerCase() || undefined,
      phoneE164: participant.phoneE164?.trim() || undefined,
    }),
  );
  const provisionalTeamA = provisionalParticipants.filter(
    (participant) => participant.side === "A",
  );
  const provisionalTeamB = provisionalParticipants.filter(
    (participant) => participant.side === "B",
  );
  const teamASize = input.teamAIds.length + provisionalTeamA.length;
  const teamBSize = input.teamBIds.length + provisionalTeamB.length;
  if (![2, 3, 4, 6].includes(teamASize) || teamASize !== teamBSize) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Choose equally sized 2v2, 3v3, 4v4, or 6v6 teams.",
    );
  }
  if (
    provisionalParticipants.some(
      (participant) => !participant.givenName || !participant.familyName,
    )
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "A provisional player needs a first and last name.",
    );
  }
  const provisionalDestinations = provisionalParticipants.flatMap(
    (participant) =>
      participant.phoneE164
        ? [`phone:${participant.phoneE164}`]
        : participant.email
          ? [`email:${participant.email}`]
          : [],
  );
  if (
    new Set(provisionalDestinations).size !== provisionalDestinations.length
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_DUPLICATE",
      "Use a different email or mobile number for each provisional player.",
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
  for (const participant of provisionalParticipants) {
    if (!participant.email && !participant.phoneE164) continue;
    const existing = participant.email
      ? await database
          .select({
            id: people.id,
            displayName: people.displayName,
            profileClaimStatus: people.profileClaimStatus,
            status: people.status,
          })
          .from(people)
          .where(
            sql`lower(${people.email}) = ${participant.email.toLowerCase()}`,
          )
          .limit(1)
      : await database
          .select({
            id: people.id,
            displayName: people.displayName,
            profileClaimStatus: people.profileClaimStatus,
            status: people.status,
          })
          .from(people)
          .where(eq(people.phoneE164, participant.phoneE164!))
          .limit(1);
    if (
      existing[0]?.status === "active" &&
      existing[0].profileClaimStatus === "claimed"
    ) {
      throw new MatchServiceError(
        "PARTICIPANT_DUPLICATE",
        `${existing[0].displayName} already has a Duna profile. Add that profile from player search instead.`,
      );
    }
  }
  const maximumSets = input.setsToWin * 2 - 1;
  if (
    input.setScores.length < input.setsToWin ||
    input.setScores.length > maximumSets
  ) {
    throw new MatchServiceError(
      "MATCH_NOT_READY",
      `A best-of-${maximumSets} match needs ${input.setsToWin} to ${maximumSets} completed sets.`,
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
  let runningAWins = 0;
  let runningBWins = 0;
  const endedBeforeFinalSet = input.setScores.some((set, index) => {
    if (set.a > set.b) runningAWins += 1;
    else runningBWins += 1;
    return (
      index < input.setScores.length - 1 &&
      (runningAWins === input.setsToWin || runningBWins === input.setsToWin)
    );
  });
  if (
    endedBeforeFinalSet ||
    Math.max(teamAWins, teamBWins) !== input.setsToWin ||
    Math.min(teamAWins, teamBWins) >= input.setsToWin
  ) {
    throw new MatchServiceError(
      "MATCH_NOT_READY",
      `The final score must end when one team wins ${input.setsToWin} ${input.setsToWin === 1 ? "set" : "sets"}.`,
    );
  }
  const participantRows = await database
    .select({
      id: people.id,
      status: people.status,
      profileClaimStatus: people.profileClaimStatus,
    })
    .from(people)
    .where(inArray(people.id, participantIds));
  if (
    participantRows.length !== participantIds.length ||
    participantRows.some((person) => person.status !== "active")
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_NOT_FOUND",
      "Every selected Duna player must have an active profile.",
    );
  }
  const scoringPeople = await loadScoringPeople(participantIds);
  const personById = new Map(
    scoringPeople.map((person) => [person.id, person] as const),
  );
  const provisionalRows = provisionalParticipants.map((participant) => {
    const id = crypto.randomUUID();
    const displayName = `${participant.givenName} ${participant.familyName}`;
    return {
      ...participant,
      id,
      displayName,
      handle: provisionalHandle({
        givenName: participant.givenName,
        familyName: participant.familyName,
        id,
      }),
      inviteToken: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
        "-",
        "",
      ),
      invitationId: crypto.randomUUID(),
    };
  });
  const provisionalA = provisionalRows.filter(
    (participant) => participant.side === "A",
  );
  const provisionalB = provisionalRows.filter(
    (participant) => participant.side === "B",
  );
  const teamAAllIds = [...input.teamAIds, ...provisionalA.map(({ id }) => id)];
  const teamBAllIds = [...input.teamBIds, ...provisionalB.map(({ id }) => id)];
  const selectedNames = (ids: readonly string[]) =>
    ids.map((id) => personById.get(id)?.displayName ?? "Duna player");
  const teamADisplayNames = [
    ...selectedNames(input.teamAIds),
    ...provisionalA.map(({ displayName }) => displayName),
  ];
  const teamBDisplayNames = [
    ...selectedNames(input.teamBIds),
    ...provisionalB.map(({ displayName }) => displayName),
  ];
  const teamName = (displayNames: readonly string[]) =>
    firstNames(displayNames).join(" / ");
  const matchId = crypto.randomUUID();
  const teamAId = crypto.randomUUID();
  const teamBId = crypto.randomUUID();
  const winnerTeamId = teamAWins > teamBWins ? teamAId : teamBId;
  const format = {
    ...standardBeachFormat,
    setsToWin: input.setsToWin,
    maximumSets,
    pointTargets: Array.from({ length: maximumSets }, (_, index) => {
      const recorded = input.setScores[index];
      return recorded
        ? Math.max(recorded.a, recorded.b)
        : index === maximumSets - 1
          ? 15
          : 21;
    }),
    hardCaps: Array.from({ length: maximumSets }, () => null),
    sideSwitchIntervals: Array.from({ length: maximumSets }, (_, index) =>
      index === maximumSets - 1 ? 5 : 7,
    ),
    teamSize: teamASize,
    matchType: input.matchType,
    recordingMode: "completed",
    allPlayersAgreedToRecord: input.allPlayersAgreedToRecord,
    playedAt: input.playedAt.toISOString(),
    location: input.location,
    ratingReadiness:
      provisionalRows.length > 0
        ? {
            status: "awaiting-player-claims",
            requiredClaims: provisionalRows.length,
            message:
              "This match will not affect Sand Rating until every required player joins Duna and the result is confirmed.",
          }
        : { status: "ready-for-confirmation", requiredClaims: 0 },
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
  const weatherSnapshot = await captureStoredMatchWeather({
    venueId: input.venueId,
    location: input.location,
    matchTime: input.playedAt,
    now: input.now,
  }).catch(() => undefined);
  await database.batch([
    database.insert(teams).values({
      id: teamAId,
      name: teamName(teamADisplayNames),
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...provisionalRows.map((participant) =>
      database.insert(people).values({
        id: participant.id,
        givenName: participant.givenName,
        familyName: participant.familyName,
        displayName: participant.displayName,
        handle: participant.handle,
        profileClaimStatus: "unclaimed",
        profileVisibility: "private",
        status: "active",
        ageBand: "unknown",
        createdAt: input.now,
        updatedAt: input.now,
      }),
    ),
    database.insert(teams).values({
      id: teamBId,
      name: teamName(teamBDisplayNames),
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...teamAAllIds.map((personId) =>
      database.insert(teamMembers).values({
        teamId: teamAId,
        personId,
        role: "player",
        joinedAt: input.now,
      }),
    ),
    ...teamBAllIds.map((personId) =>
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
      weatherSnapshot,
      weatherCapturedAt: weatherSnapshot ? input.now : undefined,
      authoritativeDeviceId: input.deviceId,
      verification: "self-reported",
      verificationWeightBps:
        input.matchType === "competitive" &&
        teamASize === 2 &&
        provisionalRows.length === 0
          ? 2_500
          : 0,
      winnerTeamId,
      ratingEligible: false,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...provisionalRows.map((participant) =>
      database.insert(matchParticipantInvitations).values({
        id: participant.invitationId,
        matchId,
        provisionalPersonId: participant.id,
        invitedByPersonId: input.actor.personId,
        inviteToken: participant.inviteToken,
        invitedEmail: participant.email,
        invitedPhoneE164: participant.phoneE164,
        deliveryChannel: participant.phoneE164
          ? "sms"
          : participant.email
            ? "email"
            : undefined,
        expiresAt: new Date(input.now.getTime() + 30 * 24 * 60 * 60_000),
        createdAt: input.now,
        updatedAt: input.now,
      }),
    ),
    ...scoreEvents.map((event, index) =>
      database.insert(rallyEvents).values({
        matchId,
        reportedByPersonId: input.actor.personId,
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
        provisionalPersonIds: provisionalRows.map(({ id }) => id),
        venueId: input.venueId,
        setScores: input.setScores,
        format,
      }),
      reason:
        provisionalRows.length > 0
          ? "Participant recorded a completed match with provisional players; rating remains locked until every required player claims a Duna identity and the result is confirmed."
          : input.matchType === "competitive"
            ? "Participant recorded a completed competitive match after every player agreed."
            : "Participant recorded a completed friendly match for history only after every player agreed.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  await Promise.all(
    provisionalRows.map((participant) =>
      deliverMatchParticipantInvitation({
        invitationId: participant.invitationId,
        inviteToken: participant.inviteToken,
        invitedName: participant.displayName,
        invitedEmail: participant.email,
        invitedPhoneE164: participant.phoneE164,
        reporterName: input.actor.displayName,
        opponentNames:
          participant.side === "A"
            ? firstNames(teamBDisplayNames)
            : firstNames(teamADisplayNames),
        now: input.now,
      }).catch(() => undefined),
    ),
  );
  return loadMatchScoringState({
    actor: input.actor,
    matchId,
  });
}

export async function loadMatchParticipantInvitation(
  inviteToken: string,
  now = new Date(),
): Promise<MatchParticipantInvitationSummary> {
  requireDatabase();
  const database = getDatabase();
  const invitation = await database.query.matchParticipantInvitations.findFirst(
    {
      where: eq(matchParticipantInvitations.inviteToken, inviteToken),
    },
  );
  if (!invitation) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "That match invitation was not found.",
    );
  }
  const [provisionalPerson, reporter, participation, availableRows] =
    await Promise.all([
      database.query.people.findFirst({
        where: eq(people.id, invitation.provisionalPersonId),
      }),
      database.query.people.findFirst({
        where: eq(people.id, invitation.invitedByPersonId),
      }),
      matchParticipants(invitation.matchId),
      database
        .select({
          personId: matchParticipantInvitations.provisionalPersonId,
          displayName: people.displayName,
        })
        .from(matchParticipantInvitations)
        .innerJoin(
          people,
          eq(people.id, matchParticipantInvitations.provisionalPersonId),
        )
        .where(
          and(
            eq(matchParticipantInvitations.matchId, invitation.matchId),
            eq(matchParticipantInvitations.status, "pending"),
            gt(matchParticipantInvitations.expiresAt, now),
          ),
        )
        .orderBy(asc(matchParticipantInvitations.createdAt)),
    ]);
  if (!provisionalPerson || !reporter) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "That match invitation is no longer available.",
    );
  }
  const scoring = await loadMatchScoringState({
    actor: {
      personId: reporter.id,
      displayName: reporter.displayName,
      roles: ["player"],
      scopes: ["matches:read"],
      ageBand: "adult",
      isDemo: false,
    },
    matchId: invitation.matchId,
    bypassAuthority: true,
  });
  const provisionalSide = participation.teamAIds.includes(
    invitation.provisionalPersonId,
  )
    ? "A"
    : "B";
  const opponentNames = (
    provisionalSide === "A" ? scoring.teamB.people : scoring.teamA.people
  ).map((person) => person.displayName);
  const storedFormat = recordValue(participation.match.format);
  const playedAt =
    typeof storedFormat.playedAt === "string"
      ? storedFormat.playedAt
      : (
          participation.match.completedAt ??
          participation.match.startedAt ??
          invitation.createdAt
        ).toISOString();
  return {
    matchId: invitation.matchId,
    invitedName: provisionalPerson.displayName,
    reporterName: reporter.displayName,
    opponentNames,
    playedAt,
    venueName: scoring.venueName,
    sets: scoring.score.sets
      .filter((set) => set.winner)
      .map((set) => ({ a: set.a, b: set.b })),
    status:
      invitation.status === "pending" && invitation.expiresAt <= now
        ? "expired"
        : (invitation.status as MatchParticipantInvitationSummary["status"]),
    expiresAt: invitation.expiresAt.toISOString(),
    appDeepLink: `duna://join/match/${encodeURIComponent(inviteToken)}`,
    availablePlayers: availableRows.map((row) => ({
      personId: row.personId,
      displayName: row.displayName,
      side: participation.teamAIds.includes(row.personId) ? "A" : "B",
    })),
  };
}

export async function claimMatchParticipantInvitation(input: {
  readonly actor: ApiActor;
  readonly inviteToken: string;
  readonly provisionalPersonId?: string;
  readonly correctedDisplayName?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly matchId: string;
  readonly status: "claimed";
  readonly appDeepLink: string;
}> {
  requireDatabase();
  const database = getDatabase();
  const anchorInvitation =
    await database.query.matchParticipantInvitations.findFirst({
      where: eq(matchParticipantInvitations.inviteToken, input.inviteToken),
    });
  if (!anchorInvitation) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "That match invitation was not found.",
    );
  }
  const invitation = input.provisionalPersonId
    ? await database.query.matchParticipantInvitations.findFirst({
        where: and(
          eq(matchParticipantInvitations.matchId, anchorInvitation.matchId),
          eq(
            matchParticipantInvitations.provisionalPersonId,
            input.provisionalPersonId,
          ),
        ),
      })
    : anchorInvitation;
  if (!invitation) {
    throw new MatchServiceError(
      "MATCH_NOT_CONFIRMABLE",
      "That player place is not available in this match.",
    );
  }
  if (
    invitation.status === "claimed" &&
    invitation.claimedByPersonId === input.actor.personId
  ) {
    return {
      matchId: invitation.matchId,
      status: "claimed",
      appDeepLink: `duna://match/${invitation.matchId}`,
    };
  }
  if (invitation.status !== "pending" || invitation.expiresAt <= input.now) {
    throw new MatchServiceError(
      "MATCH_NOT_CONFIRMABLE",
      invitation.expiresAt <= input.now
        ? "This match invitation has expired."
        : "This match invitation is no longer available.",
    );
  }
  const correctedName = input.correctedDisplayName
    ?.trim()
    .replaceAll(/\s+/g, " ");
  const correctedParts = correctedName?.split(" ") ?? [];
  if (correctedName && correctedParts.length < 2) {
    throw new MatchServiceError(
      "PARTICIPANT_REQUIRED",
      "Enter both your first and last name.",
    );
  }
  const participation = await matchParticipants(invitation.matchId);
  const participantIds = [...participation.teamAIds, ...participation.teamBIds];
  if (
    participantIds.includes(input.actor.personId) &&
    input.actor.personId !== invitation.provisionalPersonId
  ) {
    throw new MatchServiceError(
      "PARTICIPANT_DUPLICATE",
      "Your Duna profile is already assigned to this match.",
    );
  }
  const teamId = participation.teamAIds.includes(invitation.provisionalPersonId)
    ? participation.match.teamAId
    : participation.match.teamBId;
  if (!teamId) {
    throw new MatchServiceError(
      "MATCH_NOT_FOUND",
      "The invited team could not be found.",
    );
  }
  const tx = getTransactionalDatabase();
  await tx.transaction(async (transaction) => {
    if (input.actor.personId !== invitation.provisionalPersonId) {
      await transaction
        .update(teamMembers)
        .set({ personId: input.actor.personId })
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.personId, invitation.provisionalPersonId),
          ),
        );
      await transaction
        .update(people)
        .set({
          profileClaimStatus: "merged",
          profileVisibility: "private",
          status: "restricted",
          updatedAt: input.now,
        })
        .where(eq(people.id, invitation.provisionalPersonId));
    } else {
      await transaction
        .update(people)
        .set({ profileClaimStatus: "claimed", updatedAt: input.now })
        .where(eq(people.id, invitation.provisionalPersonId));
    }
    if (correctedName) {
      await transaction
        .update(people)
        .set({
          givenName: correctedParts[0]!,
          familyName: correctedParts.slice(1).join(" "),
          displayName: correctedName,
          updatedAt: input.now,
        })
        .where(eq(people.id, input.actor.personId));
    }
    const claimedInvitation = await transaction
      .update(matchParticipantInvitations)
      .set({
        status: "claimed",
        claimedByPersonId: input.actor.personId,
        claimedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(matchParticipantInvitations.id, invitation.id),
          eq(matchParticipantInvitations.status, "pending"),
        ),
      )
      .returning({ id: matchParticipantInvitations.id });
    if (!claimedInvitation[0]) {
      throw new MatchServiceError(
        "MATCH_NOT_CONFIRMABLE",
        "This match invitation was already claimed.",
      );
    }
    const remainingInvitations = await transaction
      .select({ id: matchParticipantInvitations.id })
      .from(matchParticipantInvitations)
      .where(
        and(
          eq(matchParticipantInvitations.matchId, invitation.matchId),
          eq(matchParticipantInvitations.status, "pending"),
          ne(matchParticipantInvitations.id, invitation.id),
        ),
      );
    const currentFormat = recordValue(participation.match.format);
    await transaction
      .update(matches)
      .set({
        format: {
          ...currentFormat,
          ratingReadiness:
            remainingInvitations.length > 0
              ? {
                  status: "awaiting-player-claims",
                  requiredClaims: remainingInvitations.length,
                  message:
                    "This match will not affect Sand Rating until every required player joins Duna and the result is confirmed.",
                }
              : {
                  status: "ready-for-confirmation",
                  requiredClaims: 0,
                },
        },
        updatedAt: input.now,
      })
      .where(eq(matches.id, invitation.matchId));
    const teamPeople = await transaction
      .select({ displayName: people.displayName })
      .from(teamMembers)
      .innerJoin(people, eq(teamMembers.personId, people.id))
      .where(eq(teamMembers.teamId, teamId));
    await transaction
      .update(teams)
      .set({
        name: firstNames(teamPeople.map((person) => person.displayName)).join(
          " / ",
        ),
        updatedAt: input.now,
      })
      .where(eq(teams.id, teamId));
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "match.participant-invitation.claimed",
      entityType: "match-participant-invitation",
      entityId: invitation.id,
      afterHash: stableHash({
        matchId: invitation.matchId,
        provisionalPersonId: invitation.provisionalPersonId,
        claimedByPersonId: input.actor.personId,
      }),
      reason:
        "Invited player claimed an available provisional place through the shared match link.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    matchId: invitation.matchId,
    status: "claimed",
    appDeepLink: `duna://match/${invitation.matchId}`,
  };
}

export async function loadMatchScoringState(input: {
  readonly actor: ApiActor;
  readonly matchId: string;
  readonly bypassAuthority?: boolean;
}): Promise<MatchScoringState> {
  requireDatabase();
  const database = getDatabase();
  const participation = await matchParticipants(input.matchId);
  if (!input.bypassAuthority) {
    await assertMatchAuthority({
      actor: input.actor,
      ...participation,
    });
  }
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
  const reporterIds = [
    ...new Set(
      eventRows.flatMap((row) =>
        row.reportedByPersonId ? [row.reportedByPersonId] : [],
      ),
    ),
  ];
  const reporterRows =
    reporterIds.length > 0
      ? await database
          .select({
            id: people.id,
            displayName: people.displayName,
          })
          .from(people)
          .where(inArray(people.id, reporterIds))
      : [];
  const reporterNames = new Map(
    reporterRows.map((person) => [person.id, person.displayName] as const),
  );
  const reportingByPerson = new Map<
    string,
    {
      personId: string;
      displayName: string;
      eventCount: number;
      lastReportedAt: string;
    }
  >();
  for (const row of eventRows) {
    if (!row.reportedByPersonId) continue;
    const displayName = reporterNames.get(row.reportedByPersonId);
    if (!displayName) continue;
    const current = reportingByPerson.get(row.reportedByPersonId);
    reportingByPerson.set(row.reportedByPersonId, {
      personId: row.reportedByPersonId,
      displayName,
      eventCount: (current?.eventCount ?? 0) + 1,
      lastReportedAt: row.receivedAt.toISOString(),
    });
  }
  const lastReportedRow = [...eventRows]
    .reverse()
    .find(
      (row) =>
        row.reportedByPersonId && reporterNames.has(row.reportedByPersonId),
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
  const pendingClaimRows = input.bypassAuthority
    ? []
    : await database
        .select({
          inviteToken: matchParticipantInvitations.inviteToken,
          personId: matchParticipantInvitations.provisionalPersonId,
          displayName: people.displayName,
        })
        .from(matchParticipantInvitations)
        .innerJoin(
          people,
          eq(people.id, matchParticipantInvitations.provisionalPersonId),
        )
        .where(
          and(
            eq(matchParticipantInvitations.matchId, input.matchId),
            eq(matchParticipantInvitations.status, "pending"),
            gt(matchParticipantInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(asc(matchParticipantInvitations.createdAt));
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
    reporting: {
      reporters: [...reportingByPerson.values()].sort((a, b) =>
        b.lastReportedAt.localeCompare(a.lastReportedAt),
      ),
      ...(lastReportedRow?.reportedByPersonId
        ? {
            lastReporter: {
              personId: lastReportedRow.reportedByPersonId,
              displayName:
                reporterNames.get(lastReportedRow.reportedByPersonId) ??
                "Duna scorer",
              reportedAt: lastReportedRow.receivedAt.toISOString(),
            },
          }
        : {}),
    },
    ...(pendingClaimRows[0]
      ? {
          participantClaims: {
            shareUrl: matchInvitationUrl(pendingClaimRows[0].inviteToken),
            pending: pendingClaimRows.map((row) => ({
              personId: row.personId,
              displayName: row.displayName,
              side: participation.teamAIds.includes(row.personId)
                ? ("A" as const)
                : ("B" as const),
            })),
          },
        }
      : {}),
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
    bypassAuthority: true,
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
  await assertMatchAuthority({
    actor: input.actor,
    ...participation,
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
        reportedByPersonId: input.actor.personId,
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
    const weatherSnapshot =
      participation.match.weatherSnapshot ??
      (await captureStoredMatchWeather({
        venueId: participation.match.venueId ?? undefined,
        location: completedFormat.location,
        matchTime: participation.match.startedAt ?? input.now,
        now: input.now,
      }).catch(() => undefined));
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
          weatherSnapshot,
          weatherCapturedAt:
            participation.match.weatherCapturedAt ??
            (weatherSnapshot ? input.now : undefined),
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
  const scoring = await loadMatchScoringState({
    actor: input.actor,
    matchId: input.matchId,
  });
  await publishMatchLiveActivity(scoring, input.now).catch(() => undefined);
  return {
    accepted,
    scoring,
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
  const occurredAtFor = (match: {
    readonly completedAt: Date | null;
    readonly scheduledAt: Date | null;
    readonly ratingAppliedAt: Date | null;
  }): Date =>
    match.completedAt ??
    match.scheduledAt ??
    match.ratingAppliedAt ??
    input.now;
  const historicalMatches = (
    await database
      .select({
        id: matches.id,
        teamAId: matches.teamAId,
        teamBId: matches.teamBId,
        ratingEligible: matches.ratingEligible,
        ratingEvidence: matches.ratingEvidence,
        verificationWeightBps: matches.verificationWeightBps,
        completedAt: matches.completedAt,
        scheduledAt: matches.scheduledAt,
        ratingAppliedAt: matches.ratingAppliedAt,
      })
      .from(matches)
      .where(isNotNull(matches.ratingAppliedAt))
  ).sort(
    (left, right) =>
      occurredAtFor(left).getTime() - occurredAtFor(right).getTime() ||
      left.id.localeCompare(right.id),
  );
  const rankingCandidates = await database
    .select({
      rankingDate: worldRankings.rankingDate,
      genderCategory: worldRankings.genderCategory,
      rank: worldRankings.rank,
      personId: worldRankings.personId,
    })
    .from(worldRankings)
    .where(
      and(
        isNotNull(worldRankings.personId),
        inArray(worldRankings.genderCategory, ["men", "women"]),
      ),
    );
  const professionalSeedIds: string[] = [];
  for (const gender of ["men", "women"] as const) {
    const latestDate = rankingCandidates
      .filter((ranking) => ranking.genderCategory === gender)
      .reduce(
        (latest, ranking) =>
          ranking.rankingDate > latest ? ranking.rankingDate : latest,
        "",
      );
    const seen = new Set<string>();
    for (const ranking of rankingCandidates
      .filter(
        (candidate) =>
          candidate.genderCategory === gender &&
          candidate.rankingDate === latestDate &&
          candidate.personId,
      )
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          (left.personId ?? "").localeCompare(right.personId ?? ""),
      )) {
      if (!ranking.personId || seen.has(ranking.personId)) continue;
      seen.add(ranking.personId);
      professionalSeedIds.push(ranking.personId);
      if (seen.size >= 200) break;
    }
  }
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

  const seedWindowStart = historicalMatches[0]
    ? occurredAtFor(historicalMatches[0])
    : input.now;
  for (const personId of new Set(professionalSeedIds)) {
    const state = professionalSeed({ playerId: personId, source: "fivb" });
    projection.set(personId, {
      state,
      windowStart: seedWindowStart,
      peak: state.display,
      sequence: 0,
    });
  }

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
    const occurredAt = occurredAtFor(match);
    const teamAState = teamAIds.map((personId) =>
      stateAt(personId, occurredAt),
    ) as [ProjectionState, ProjectionState];
    const teamBState = teamBIds.map((personId) =>
      stateAt(personId, occurredAt),
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
        createdAt: occurredAt,
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
  const projectedRatingStatements = [];
  for (let offset = 0; offset < projectedRatings.length; offset += 500) {
    projectedRatingStatements.push(
      database
        .insert(ratings)
        .values(projectedRatings.slice(offset, offset + 500)),
    );
  }
  const replayedEventStatements = [];
  for (let offset = 0; offset < replayedEvents.length; offset += 500) {
    replayedEventStatements.push(
      database
        .insert(ratingEvents)
        .values(replayedEvents.slice(offset, offset + 500)),
    );
  }
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
    ...projectedRatingStatements,
    ...replayedEventStatements,
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
        professionalSeeds: new Set(professionalSeedIds).size,
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
    professionalSeeds: new Set(professionalSeedIds).size,
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
  if (ratingCapable) {
    const ratingParticipants = await database
      .select({
        id: people.id,
        profileClaimStatus: people.profileClaimStatus,
        status: people.status,
      })
      .from(people)
      .where(inArray(people.id, participantIds));
    const everyPlayerOnDuna =
      ratingParticipants.length === participantIds.length &&
      ratingParticipants.every(
        (person) =>
          person.status === "active" && person.profileClaimStatus === "claimed",
      );
    if (!everyPlayerOnDuna) {
      return { status: "pending-verification", ratingApplied: false };
    }
  }
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
