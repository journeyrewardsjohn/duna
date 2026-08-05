import { connect } from "node:http2";
import {
  courtBookingParticipants,
  courtBookings,
  follows,
  getDatabase,
  importedMatches,
  importSources,
  liveActivitySubscriptions,
  matches,
  playerFollowPreferences,
  pickupParticipants,
  professionalEvents,
  registrations,
  teamMembers,
} from "@duna/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { importPKCS8, SignJWT } from "jose";
import type { MatchScoringState } from "./match-service";

export type LiveActivityKind =
  "upcoming" | "match" | "event" | "player" | "coach";
export type LiveActivityApp = "player" | "pro";
export type LiveActivityEnvironment = "sandbox" | "production";

export interface LiveActivityContentState {
  readonly subjectId: string;
  readonly kind: LiveActivityKind;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly startsAt?: string;
  readonly teamA?: string;
  readonly teamB?: string;
  readonly scoreA?: number;
  readonly scoreB?: number;
  readonly setLabel?: string;
  readonly phase?:
    "prepare" | "leave" | "travel" | "arrived" | "live" | "final";
  readonly distanceMeters?: number;
  readonly travelDurationSeconds?: number;
  readonly leaveBy?: string;
  readonly leaveByLabel?: string;
  readonly startsAtLabel?: string;
  readonly venueName?: string;
  readonly rosterSummary?: string;
  readonly playerOneName?: string;
  readonly playerOneEtaMinutes?: number;
  readonly playerOneStatus?: string;
  readonly playerTwoName?: string;
  readonly playerTwoEtaMinutes?: number;
  readonly playerTwoStatus?: string;
  readonly liveMatchCount?: number;
  readonly updatedAt: string;
}

interface ApnsConfiguration {
  readonly teamId: string;
  readonly keyId: string;
  readonly privateKey: string;
  readonly bundleIds: Readonly<Record<LiveActivityApp, string>>;
}

interface ApnsResult {
  readonly delivered: boolean;
  readonly status: number;
  readonly reason?: string;
  readonly terminal: boolean;
}

let cachedProviderToken:
  | {
      readonly value: string;
      readonly expiresAt: number;
      readonly signature: string;
    }
  | undefined;

function apnsConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ApnsConfiguration | undefined {
  const teamId = environment.APNS_TEAM_ID?.trim();
  const keyId = environment.APNS_KEY_ID?.trim();
  const privateKey = environment.APNS_PRIVATE_KEY?.trim().replaceAll(
    String.raw`\n`,
    "\n",
  );
  if (!teamId || !keyId || !privateKey) return undefined;
  return {
    teamId,
    keyId,
    privateKey,
    bundleIds: {
      player:
        environment.APNS_PLAYER_BUNDLE_ID?.trim() ||
        environment.APNS_BUNDLE_ID?.trim() ||
        "com.duna.player",
      pro: environment.APNS_PRO_BUNDLE_ID?.trim() || "com.duna.pro",
    },
  };
}

export function liveActivityDeliveryConfigured(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(apnsConfiguration(environment));
}

export async function canRegisterLiveActivity(input: {
  readonly personId: string;
  readonly kind: LiveActivityKind;
  readonly subjectId: string;
}): Promise<boolean> {
  const database = getDatabase();
  if (input.kind === "upcoming") {
    const [registration, pickup, court, courtParticipant] = await Promise.all([
      database.query.registrations.findFirst({
        where: and(
          eq(registrations.id, input.subjectId),
          eq(registrations.personId, input.personId),
        ),
        columns: { id: true },
      }),
      database.query.pickupParticipants.findFirst({
        where: and(
          eq(pickupParticipants.id, input.subjectId),
          eq(pickupParticipants.personId, input.personId),
        ),
        columns: { id: true },
      }),
      database.query.courtBookings.findFirst({
        where: and(
          eq(courtBookings.id, input.subjectId),
          eq(courtBookings.personId, input.personId),
        ),
        columns: { id: true },
      }),
      database.query.courtBookingParticipants.findFirst({
        where: and(
          eq(courtBookingParticipants.bookingId, input.subjectId),
          eq(courtBookingParticipants.personId, input.personId),
        ),
        columns: { id: true },
      }),
    ]);
    return Boolean(registration || pickup || court || courtParticipant);
  }

  if (input.kind === "event") {
    const event = await database.query.professionalEvents.findFirst({
      where: eq(professionalEvents.id, input.subjectId),
      columns: { id: true },
    });
    return Boolean(event);
  }

  if (input.kind === "player") {
    const preference = await database.query.playerFollowPreferences.findFirst({
      where: and(
        eq(playerFollowPreferences.followerPersonId, input.personId),
        eq(playerFollowPreferences.playerPersonId, input.subjectId),
      ),
      columns: { playerPersonId: true },
    });
    return Boolean(preference);
  }

  if (input.kind === "coach") return false;

  const publicProfessionalMatch = await database
    .select({ id: importedMatches.id })
    .from(importedMatches)
    .innerJoin(importSources, eq(importedMatches.sourceId, importSources.id))
    .where(
      and(
        eq(importedMatches.id, input.subjectId),
        eq(importSources.slug, "fivb-12ndr"),
      ),
    )
    .limit(1);
  if (publicProfessionalMatch[0]) return true;

  const match = await database.query.matches.findFirst({
    where: eq(matches.id, input.subjectId),
    columns: { teamAId: true, teamBId: true },
  });
  if (!match?.teamAId || !match.teamBId) return false;
  const membership = await database.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.personId, input.personId),
      or(
        eq(teamMembers.teamId, match.teamAId),
        eq(teamMembers.teamId, match.teamBId),
      ),
    ),
    columns: { personId: true },
  });
  return Boolean(membership);
}

export async function loadProfessionalEventFollowState(input: {
  readonly personId: string;
  readonly eventId: string;
}) {
  const database = getDatabase();
  const [event, follow] = await Promise.all([
    database.query.professionalEvents.findFirst({
      where: eq(professionalEvents.id, input.eventId),
      columns: { id: true },
    }),
    database.query.follows.findFirst({
      where: and(
        eq(follows.followerPersonId, input.personId),
        eq(follows.entityType, "professional-event"),
        eq(follows.entityId, input.eventId),
      ),
      columns: { entityId: true },
    }),
  ]);
  return {
    eventId: input.eventId,
    available: Boolean(event),
    following: Boolean(event && follow),
  };
}

export async function setProfessionalEventFollow(input: {
  readonly personId: string;
  readonly eventId: string;
  readonly following: boolean;
  readonly now: Date;
}) {
  const database = getDatabase();
  const state = await loadProfessionalEventFollowState(input);
  if (!state.available) return state;
  if (input.following) {
    await database
      .insert(follows)
      .values({
        followerPersonId: input.personId,
        entityType: "professional-event",
        entityId: input.eventId,
        createdAt: input.now,
      })
      .onConflictDoNothing();
  } else {
    await Promise.all([
      database
        .delete(follows)
        .where(
          and(
            eq(follows.followerPersonId, input.personId),
            eq(follows.entityType, "professional-event"),
            eq(follows.entityId, input.eventId),
          ),
        ),
      database
        .update(liveActivitySubscriptions)
        .set({ status: "revoked", revokedAt: input.now, updatedAt: input.now })
        .where(
          and(
            eq(liveActivitySubscriptions.personId, input.personId),
            eq(liveActivitySubscriptions.subjectType, "event"),
            eq(liveActivitySubscriptions.subjectId, input.eventId),
          ),
        ),
    ]);
  }
  return { ...state, following: input.following };
}

async function providerToken(
  configuration: ApnsConfiguration,
  now: Date,
): Promise<string> {
  const signature = `${configuration.teamId}:${configuration.keyId}:${configuration.privateKey.length}`;
  if (
    cachedProviderToken &&
    cachedProviderToken.signature === signature &&
    cachedProviderToken.expiresAt > now.getTime()
  ) {
    return cachedProviderToken.value;
  }
  const key = await importPKCS8(configuration.privateKey, "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: configuration.keyId })
    .setIssuer(configuration.teamId)
    .setIssuedAt(Math.floor(now.getTime() / 1_000))
    .sign(key);
  cachedProviderToken = {
    value,
    signature,
    expiresAt: now.getTime() + 50 * 60_000,
  };
  return value;
}

function responseReason(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { readonly reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    return body.trim() || undefined;
  }
}

function sendApnsRequest(input: {
  readonly configuration: ApnsConfiguration;
  readonly providerToken: string;
  readonly pushToken: string;
  readonly environment: LiveActivityEnvironment;
  readonly app: LiveActivityApp;
  readonly contentState: LiveActivityContentState;
  readonly now: Date;
  readonly end?: boolean;
}): Promise<ApnsResult> {
  const authority =
    input.environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";
  return new Promise((resolve) => {
    const client = connect(authority);
    let settled = false;
    function finish(result: ApnsResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!client.destroyed) client.close();
      resolve(result);
    }
    const timeout = setTimeout(() => {
      finish({
        delivered: false,
        status: 0,
        reason: "APNs request timed out",
        terminal: false,
      });
      if (!client.destroyed) client.destroy();
    }, 8_000);
    client.once("error", (error) => {
      finish({
        delivered: false,
        status: 0,
        reason: error.message,
        terminal: false,
      });
    });
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${input.pushToken}`,
      authorization: `bearer ${input.providerToken}`,
      "apns-topic": `${input.configuration.bundleIds[input.app]}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "apns-collapse-id":
        `${input.contentState.kind}-${input.contentState.subjectId}`.slice(
          0,
          64,
        ),
      "content-type": "application/json",
    });
    const chunks: Buffer[] = [];
    let status = 0;
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.once("error", (error) => {
      finish({
        delivered: false,
        status,
        reason: error.message,
        terminal: false,
      });
    });
    request.once("end", () => {
      const reason = responseReason(Buffer.concat(chunks).toString("utf8"));
      finish({
        delivered: status === 200,
        status,
        ...(reason ? { reason } : {}),
        terminal:
          status === 410 ||
          reason === "BadDeviceToken" ||
          reason === "DeviceTokenNotForTopic",
      });
    });
    request.end(
      JSON.stringify({
        aps: {
          timestamp: Math.floor(input.now.getTime() / 1_000),
          event: input.end ? "end" : "update",
          "content-state": input.contentState,
          ...(input.end
            ? {
                "dismissal-date": Math.floor(input.now.getTime() / 1_000) + 120,
              }
            : {
                "stale-date":
                  Math.floor(input.now.getTime() / 1_000) +
                  (input.contentState.kind === "upcoming" ||
                  input.contentState.kind === "coach"
                    ? 10 * 60
                    : 3 * 60),
              }),
        },
      }),
    );
  });
}

export async function registerLiveActivitySubscription(input: {
  readonly personId: string;
  readonly kind: LiveActivityKind;
  readonly subjectId: string;
  readonly activityId: string;
  readonly pushToken: string;
  readonly environment: LiveActivityEnvironment;
  readonly app?: LiveActivityApp;
  readonly now: Date;
}) {
  const database = getDatabase();
  await database
    .insert(liveActivitySubscriptions)
    .values({
      personId: input.personId,
      subjectType: input.kind,
      subjectId: input.subjectId,
      activityId: input.activityId,
      app: input.app ?? "player",
      pushToken: input.pushToken,
      environment: input.environment,
      status: "active",
      lastError: null,
      revokedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: liveActivitySubscriptions.pushToken,
      set: {
        personId: input.personId,
        subjectType: input.kind,
        subjectId: input.subjectId,
        activityId: input.activityId,
        app: input.app ?? "player",
        environment: input.environment,
        status: "active",
        lastError: null,
        revokedAt: null,
        updatedAt: input.now,
      },
    });
  if (input.kind === "match" || input.kind === "event") {
    await database
      .insert(follows)
      .values({
        followerPersonId: input.personId,
        entityType: input.kind === "match" ? "match" : "professional-event",
        entityId: input.subjectId,
        createdAt: input.now,
      })
      .onConflictDoNothing();
  }
  return {
    registered: true as const,
    deliveryConfigured: liveActivityDeliveryConfigured(),
  };
}

export async function revokeLiveActivitySubscription(input: {
  readonly personId: string;
  readonly pushToken: string;
  readonly now: Date;
}) {
  const updated = await getDatabase()
    .update(liveActivitySubscriptions)
    .set({
      status: "revoked",
      revokedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(liveActivitySubscriptions.personId, input.personId),
        eq(liveActivitySubscriptions.pushToken, input.pushToken),
      ),
    )
    .returning({ id: liveActivitySubscriptions.id });
  return { revoked: updated.length > 0 };
}

export async function publishLiveActivity(input: {
  readonly kind: LiveActivityKind;
  readonly subjectId: string;
  readonly contentState: Omit<
    LiveActivityContentState,
    "kind" | "subjectId" | "updatedAt"
  >;
  readonly now?: Date;
  readonly end?: boolean;
}) {
  const configuration = apnsConfiguration();
  if (!configuration || !process.env.DATABASE_URL) {
    return { attempted: 0, delivered: 0, configured: false as const };
  }
  const now = input.now ?? new Date();
  const subscriptions = await getDatabase()
    .select()
    .from(liveActivitySubscriptions)
    .where(
      and(
        eq(liveActivitySubscriptions.subjectType, input.kind),
        eq(liveActivitySubscriptions.subjectId, input.subjectId),
        eq(liveActivitySubscriptions.status, "active"),
      ),
    );
  if (subscriptions.length === 0) {
    return { attempted: 0, delivered: 0, configured: true as const };
  }
  const token = await providerToken(configuration, now);
  const contentState: LiveActivityContentState = {
    ...input.contentState,
    subjectId: input.subjectId,
    kind: input.kind,
    updatedAt: now.toISOString(),
  };
  const outcomes = await Promise.all(
    subscriptions.map(async (subscription) => {
      let outcome = await sendApnsRequest({
        configuration,
        providerToken: token,
        pushToken: subscription.pushToken,
        environment:
          subscription.environment === "sandbox" ? "sandbox" : "production",
        app: subscription.app === "pro" ? "pro" : "player",
        contentState,
        now,
        end: input.end,
      });
      if (outcome.reason === "ExpiredProviderToken") {
        cachedProviderToken = undefined;
        outcome = await sendApnsRequest({
          configuration,
          providerToken: await providerToken(configuration, now),
          pushToken: subscription.pushToken,
          environment:
            subscription.environment === "sandbox" ? "sandbox" : "production",
          app: subscription.app === "pro" ? "pro" : "player",
          contentState,
          now,
          end: input.end,
        });
      }
      await getDatabase()
        .update(liveActivitySubscriptions)
        .set({
          ...(outcome.delivered ? { lastDeliveredAt: now } : {}),
          lastError: outcome.delivered
            ? null
            : `${outcome.status || "network"}: ${outcome.reason ?? "APNs rejected the update"}`,
          ...(outcome.terminal ? { status: "expired", revokedAt: now } : {}),
          ...(input.end && outcome.delivered
            ? { status: "expired", revokedAt: now }
            : {}),
          updatedAt: now,
        })
        .where(eq(liveActivitySubscriptions.id, subscription.id));
      return outcome;
    }),
  );
  return {
    attempted: outcomes.length,
    delivered: outcomes.filter((outcome) => outcome.delivered).length,
    configured: true as const,
  };
}

export function matchLiveActivityState(
  scoring: MatchScoringState,
): LiveActivityContentState {
  const currentSet =
    scoring.score.sets[scoring.score.setIndex] ?? scoring.score.sets.at(-1);
  return {
    subjectId: scoring.matchId,
    kind: "match",
    title: `${scoring.teamA.name} vs ${scoring.teamB.name}`,
    subtitle: scoring.venueName,
    status:
      scoring.score.status === "complete" ||
      scoring.score.status === "forfeit" ||
      scoring.status !== "live"
        ? "Final"
        : "Live",
    teamA: scoring.teamA.name,
    teamB: scoring.teamB.name,
    scoreA: currentSet?.a ?? 0,
    scoreB: currentSet?.b ?? 0,
    setLabel: `Set ${Math.min(
      scoring.score.setIndex + 1,
      Math.max(scoring.score.sets.length, 1),
    )}`,
    updatedAt: new Date().toISOString(),
  };
}

export async function publishMatchLiveActivity(
  scoring: MatchScoringState,
  now = new Date(),
) {
  const state = matchLiveActivityState(scoring);
  return publishLiveActivity({
    kind: "match",
    subjectId: scoring.matchId,
    contentState: state,
    now,
    end: state.status === "Final",
  });
}

export async function publishPlayerArrivalLiveActivity(input: {
  readonly registrationId: string;
  readonly title: string;
  readonly venueName?: string;
  readonly startsAt: Date;
  readonly status: "on-time" | "leave-now" | "running-late" | "arrived";
  readonly distanceMeters: number;
  readonly travelDurationSeconds: number;
  readonly leaveBy: Date;
  readonly timezone: string;
  readonly now: Date;
}) {
  const phase =
    input.status === "arrived"
      ? "arrived"
      : input.status === "leave-now" || input.status === "running-late"
        ? "leave"
        : "prepare";
  const clock = (value: Date) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: input.timezone,
    }).format(value);
  const leaveByLabel = clock(input.leaveBy);
  return publishLiveActivity({
    kind: "upcoming",
    subjectId: input.registrationId,
    contentState: {
      title: input.title,
      subtitle: input.venueName ?? "Venue location",
      status:
        input.status === "running-late"
          ? "Running late"
          : input.status === "leave-now"
            ? "Leave now"
            : input.status === "arrived"
              ? "Arrived"
              : `Leave by ${leaveByLabel}`,
      startsAt: input.startsAt.toISOString(),
      phase,
      distanceMeters: input.distanceMeters,
      travelDurationSeconds: input.travelDurationSeconds,
      leaveBy: input.leaveBy.toISOString(),
      leaveByLabel,
      startsAtLabel: clock(input.startsAt),
      venueName: input.venueName,
    },
    now: input.now,
  });
}

export async function publishCoachArrivalLiveActivity(input: {
  readonly sessionId: string;
  readonly title: string;
  readonly venueName?: string;
  readonly startsAt: Date;
  readonly signals: readonly {
    readonly displayName: string;
    readonly role: "player" | "coach";
    readonly status: string;
    readonly travelDurationSeconds: number;
  }[];
  readonly expectedPlayers: number;
  readonly now: Date;
}) {
  const players = input.signals
    .filter((signal) => signal.role === "player")
    .sort((left, right) => {
      const priority = (status: string) =>
        status === "running-late" ? 0 : status === "leave-now" ? 1 : 2;
      return (
        priority(left.status) - priority(right.status) ||
        right.travelDurationSeconds - left.travelDurationSeconds
      );
    });
  const arrived = players.filter(
    (player) => player.status === "arrived",
  ).length;
  const late = players.filter(
    (player) => player.status === "running-late",
  ).length;
  const rosterSummary = `${arrived} arrived · ${players.length}/${input.expectedPlayers} sharing${late ? ` · ${late} late` : ""}`;
  const [first, second] = players;
  return publishLiveActivity({
    kind: "coach",
    subjectId: input.sessionId,
    contentState: {
      title: input.title,
      subtitle: input.venueName ?? "Venue location",
      status: late ? `${late} running late` : rosterSummary,
      startsAt: input.startsAt.toISOString(),
      phase: "prepare",
      venueName: input.venueName,
      rosterSummary,
      playerOneName: first?.displayName,
      playerOneEtaMinutes: first
        ? Math.ceil(first.travelDurationSeconds / 60)
        : undefined,
      playerOneStatus: first?.status,
      playerTwoName: second?.displayName,
      playerTwoEtaMinutes: second
        ? Math.ceil(second.travelDurationSeconds / 60)
        : undefined,
      playerTwoStatus: second?.status,
    },
    now: input.now,
  });
}

export async function publishImportedProfessionalActivities(input: {
  readonly sourceId: string;
  readonly externalEventIds: readonly string[];
  readonly now: Date;
}) {
  if (
    !liveActivityDeliveryConfigured() ||
    input.externalEventIds.length === 0
  ) {
    return { attempted: 0, delivered: 0 };
  }
  const database = getDatabase();
  const [matches, events] = await Promise.all([
    database
      .select()
      .from(importedMatches)
      .where(
        and(
          eq(importedMatches.sourceId, input.sourceId),
          inArray(importedMatches.externalEventId, input.externalEventIds),
        ),
      ),
    database
      .select()
      .from(professionalEvents)
      .where(
        and(
          eq(professionalEvents.sourceId, input.sourceId),
          inArray(professionalEvents.externalEventId, input.externalEventIds),
        ),
      ),
  ]);
  const eventByExternalId = new Map(
    events.map((event) => [event.externalEventId, event] as const),
  );
  const matchState = (match: (typeof matches)[number]) => {
    const event = match.externalEventId
      ? eventByExternalId.get(match.externalEventId)
      : undefined;
    const teamLabel = (side: "A" | "B") =>
      match.participants
        .filter((participant) => participant.side === side)
        .map((participant) => participant.name)
        .join(" / ") || "TBD";
    const latestSet = match.sets.at(-1);
    return {
      title: event?.name ?? match.title,
      subtitle: event?.location ?? match.location ?? "Beach Pro Tour",
      status: match.winnerSide ? "Final" : event?.live ? "Live" : "Upcoming",
      teamA: teamLabel("A"),
      teamB: teamLabel("B"),
      scoreA: latestSet?.a ?? 0,
      scoreB: latestSet?.b ?? 0,
      setLabel: `Set ${Math.max(match.sets.length, 1)}`,
      phase: match.winnerSide ? ("final" as const) : ("live" as const),
    };
  };
  const matchResults = await Promise.all(
    matches.map((match) =>
      publishLiveActivity({
        kind: "match",
        subjectId: match.id,
        contentState: matchState(match),
        now: input.now,
        end: Boolean(match.winnerSide),
      }),
    ),
  );
  const eventResults = await Promise.all(
    events.map((event) => {
      const eventMatches = matches.filter(
        (match) => match.externalEventId === event.externalEventId,
      );
      const featured =
        eventMatches.find((match) => !match.winnerSide) ?? eventMatches.at(-1);
      const state = featured ? matchState(featured) : undefined;
      return publishLiveActivity({
        kind: "event",
        subjectId: event.id,
        contentState: {
          title: event.name,
          subtitle: event.location ?? "Beach Pro Tour",
          status:
            event.status === "completed"
              ? "Final"
              : event.live
                ? "Live"
                : "Upcoming",
          teamA: state?.teamA,
          teamB: state?.teamB,
          scoreA: state?.scoreA,
          scoreB: state?.scoreB,
          setLabel: state?.setLabel,
          phase:
            event.status === "completed"
              ? "final"
              : event.live
                ? "live"
                : "prepare",
          liveMatchCount: eventMatches.filter((match) => !match.winnerSide)
            .length,
        },
        now: input.now,
        end: event.status === "completed",
      });
    }),
  );
  const playerMatch = new Map<
    string,
    {
      readonly match: (typeof matches)[number];
      readonly state: ReturnType<typeof matchState>;
    }
  >();
  for (const match of matches) {
    const state = matchState(match);
    for (const participant of match.participants) {
      if (!participant.personId) continue;
      const current = playerMatch.get(participant.personId);
      if (!current || (!match.winnerSide && current.match.winnerSide)) {
        playerMatch.set(participant.personId, { match, state });
      }
    }
  }
  const playerResults = await Promise.all(
    [...playerMatch.entries()].map(([personId, value]) =>
      publishLiveActivity({
        kind: "player",
        subjectId: personId,
        contentState: value.state,
        now: input.now,
        end:
          (value.match.externalEventId
            ? eventByExternalId.get(value.match.externalEventId)?.status
            : undefined) === "completed",
      }),
    ),
  );
  const results = [...matchResults, ...eventResults, ...playerResults];
  return {
    attempted: results.reduce((sum, result) => sum + result.attempted, 0),
    delivered: results.reduce((sum, result) => sum + result.delivered, 0),
  };
}
