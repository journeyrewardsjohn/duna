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
  pickupParticipants,
  professionalEvents,
  registrations,
  teamMembers,
} from "@duna/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { importPKCS8, SignJWT } from "jose";
import type { MatchScoringState } from "./match-service";

export type LiveActivityKind = "upcoming" | "match";
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
  readonly updatedAt: string;
}

interface ApnsConfiguration {
  readonly teamId: string;
  readonly keyId: string;
  readonly privateKey: string;
  readonly bundleId: string;
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
    bundleId: environment.APNS_BUNDLE_ID?.trim() || "com.duna.player",
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
  readonly contentState: LiveActivityContentState;
  readonly now: Date;
}): Promise<ApnsResult> {
  const authority =
    input.environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";
  return new Promise((resolve) => {
    const client = connect(authority);
    let settled = false;
    const finish = (result: ApnsResult) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };
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
      "apns-topic": `${input.configuration.bundleId}.push-type.liveactivity`,
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
          event: "update",
          "content-state": input.contentState,
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
        environment: input.environment,
        status: "active",
        lastError: null,
        revokedAt: null,
        updatedAt: input.now,
      },
    });
  if (input.kind === "match") {
    await database
      .insert(follows)
      .values({
        followerPersonId: input.personId,
        entityType: "match",
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
        contentState,
        now,
      });
      if (outcome.reason === "ExpiredProviderToken") {
        cachedProviderToken = undefined;
        outcome = await sendApnsRequest({
          configuration,
          providerToken: await providerToken(configuration, now),
          pushToken: subscription.pushToken,
          environment:
            subscription.environment === "sandbox" ? "sandbox" : "production",
          contentState,
          now,
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
  const results = await Promise.all(
    matches.map((match) => {
      const event = match.externalEventId
        ? eventByExternalId.get(match.externalEventId)
        : undefined;
      const teamLabel = (side: "A" | "B") =>
        match.participants
          .filter((participant) => participant.side === side)
          .map((participant) => participant.name)
          .join(" / ") || "TBD";
      const latestSet = match.sets.at(-1);
      return publishLiveActivity({
        kind: "match",
        subjectId: match.id,
        contentState: {
          title: event?.name ?? match.title,
          subtitle: event?.location ?? match.location ?? "Beach Pro Tour",
          status: match.winnerSide
            ? "Final"
            : event?.live
              ? "Live"
              : "Upcoming",
          teamA: teamLabel("A"),
          teamB: teamLabel("B"),
          scoreA: latestSet?.a ?? 0,
          scoreB: latestSet?.b ?? 0,
          setLabel: `Set ${Math.max(match.sets.length, 1)}`,
        },
        now: input.now,
      });
    }),
  );
  return {
    attempted: results.reduce((sum, result) => sum + result.attempted, 0),
    delivered: results.reduce((sum, result) => sum + result.delivered, 0),
  };
}
