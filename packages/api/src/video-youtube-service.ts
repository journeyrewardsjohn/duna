import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  auditLog,
  getDatabase,
  videoBroadcastDestinations,
  videoProviderOauthStates,
  youtubeChannelConnections,
} from "@duna/db";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { ApiActor } from "./context";
import { createCloudflareLiveOutput } from "./video-providers";
import {
  buildYoutubeAuthorizationUrl,
  createYoutubeLiveDestination,
  deleteYoutubeLiveDestination,
  decryptYoutubeRefreshToken,
  dunaYoutubeChannel,
  encryptYoutubeRefreshToken,
  exchangeYoutubeAuthorizationCode,
  isYoutubeChannelLinkingConfigured,
  loadYoutubeChannelIdentity,
  revokeYoutubeRefreshToken,
} from "./video-youtube-provider";

const YOUTUBE_OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1_000;

export class YoutubeConnectionError extends Error {
  constructor(
    readonly code:
      | "YOUTUBE_NOT_CONFIGURED"
      | "YOUTUBE_FORBIDDEN"
      | "YOUTUBE_STATE_INVALID"
      | "YOUTUBE_CONNECTION_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "YoutubeConnectionError";
  }
}

function stateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function canManageOrganizationYoutube(actor: ApiActor): boolean {
  return actor.roles.some(
    (role) =>
      role === "owner" ||
      role === "manager" ||
      role === "admin" ||
      role === "super-admin",
  );
}

function safeYoutubeReturnUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol === "duna:") return url.toString();
  const publicWebUrl = new URL(
    process.env.NEXT_PUBLIC_DUNA_WEB_URL?.trim() ||
      process.env.DUNA_WEB_URL?.trim() ||
      "https://duna.coach",
  );
  if (url.protocol === "https:" && url.origin === publicWebUrl.origin) {
    return url.toString();
  }
  throw new YoutubeConnectionError(
    "YOUTUBE_FORBIDDEN",
    "That YouTube connection return address is not allowed.",
  );
}

function connectionScopeWhere(actor: ApiActor) {
  return actor.organizationId
    ? or(
        and(
          eq(youtubeChannelConnections.ownerPersonId, actor.personId),
          isNull(youtubeChannelConnections.organizationId),
        ),
        eq(youtubeChannelConnections.organizationId, actor.organizationId),
      )
    : and(
        eq(youtubeChannelConnections.ownerPersonId, actor.personId),
        isNull(youtubeChannelConnections.organizationId),
      );
}

export interface YoutubeConnectionSummary {
  readonly id: string;
  readonly channelId: string;
  readonly channelTitle: string;
  readonly scope: "personal" | "organization";
  readonly status: "active" | "error";
  readonly lastError?: string;
}

export async function loadYoutubeBroadcastOptions(actor: ApiActor): Promise<{
  readonly linkingConfigured: boolean;
  readonly canManageOrganizationConnections: boolean;
  readonly dunaChannel?: {
    readonly channelId: string;
    readonly channelTitle: string;
  };
  readonly connections: readonly YoutubeConnectionSummary[];
}> {
  const linkingConfigured = isYoutubeChannelLinkingConfigured();
  const duna = dunaYoutubeChannel();
  const connections = linkingConfigured
    ? await getDatabase()
        .select({
          id: youtubeChannelConnections.id,
          channelId: youtubeChannelConnections.channelId,
          channelTitle: youtubeChannelConnections.channelTitle,
          organizationId: youtubeChannelConnections.organizationId,
          status: youtubeChannelConnections.status,
          lastError: youtubeChannelConnections.lastError,
        })
        .from(youtubeChannelConnections)
        .where(
          and(
            connectionScopeWhere(actor),
            inArray(youtubeChannelConnections.status, ["active", "error"]),
          ),
        )
    : [];
  return {
    linkingConfigured,
    canManageOrganizationConnections:
      Boolean(actor.organizationId) && canManageOrganizationYoutube(actor),
    dunaChannel: duna
      ? { channelId: duna.channelId, channelTitle: duna.channelTitle }
      : undefined,
    connections: connections.map((connection) => ({
      id: connection.id,
      channelId: connection.channelId,
      channelTitle: connection.channelTitle,
      scope: connection.organizationId ? "organization" : "personal",
      status: connection.status as "active" | "error",
      lastError: connection.lastError ?? undefined,
    })),
  };
}

export async function beginYoutubeChannelConnection(input: {
  readonly actor: ApiActor;
  readonly scope: "personal" | "organization";
  readonly returnUrl: string;
  readonly now: Date;
}): Promise<{ readonly authorizationUrl: string; readonly expiresAt: string }> {
  if (!isYoutubeChannelLinkingConfigured()) {
    throw new YoutubeConnectionError(
      "YOUTUBE_NOT_CONFIGURED",
      "YouTube channel linking is not configured for Duna yet.",
    );
  }
  if (
    input.scope === "organization" &&
    (!input.actor.organizationId || !canManageOrganizationYoutube(input.actor))
  ) {
    throw new YoutubeConnectionError(
      "YOUTUBE_FORBIDDEN",
      "Only an organization owner or manager can link its YouTube channel.",
    );
  }
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    input.now.getTime() + YOUTUBE_OAUTH_STATE_LIFETIME_MS,
  );
  await getDatabase()
    .insert(videoProviderOauthStates)
    .values({
      stateHash: stateHash(state),
      personId: input.actor.personId,
      organizationId:
        input.scope === "organization" ? input.actor.organizationId : undefined,
      provider: "youtube",
      returnUrl: safeYoutubeReturnUrl(input.returnUrl),
      expiresAt,
      createdAt: input.now,
    });
  return {
    authorizationUrl: buildYoutubeAuthorizationUrl({ state }),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function completeYoutubeChannelConnection(input: {
  readonly state: string;
  readonly code: string;
  readonly now: Date;
}): Promise<{
  readonly returnUrl: string;
  readonly channel: YoutubeConnectionSummary;
}> {
  const database = getDatabase();
  const oauthState = await database.query.videoProviderOauthStates.findFirst({
    where: and(
      eq(videoProviderOauthStates.stateHash, stateHash(input.state)),
      eq(videoProviderOauthStates.provider, "youtube"),
      isNull(videoProviderOauthStates.usedAt),
      gt(videoProviderOauthStates.expiresAt, input.now),
    ),
  });
  if (!oauthState) {
    throw new YoutubeConnectionError(
      "YOUTUBE_STATE_INVALID",
      "This YouTube connection request expired or was already used.",
    );
  }
  const tokens = await exchangeYoutubeAuthorizationCode(input.code);
  const identity = await loadYoutubeChannelIdentity(tokens.accessToken);
  const consumed = await database
    .update(videoProviderOauthStates)
    .set({ usedAt: input.now })
    .where(
      and(
        eq(videoProviderOauthStates.stateHash, oauthState.stateHash),
        isNull(videoProviderOauthStates.usedAt),
        gt(videoProviderOauthStates.expiresAt, input.now),
      ),
    )
    .returning({ stateHash: videoProviderOauthStates.stateHash });
  if (consumed.length !== 1) {
    throw new YoutubeConnectionError(
      "YOUTUBE_STATE_INVALID",
      "This YouTube connection request was already completed.",
    );
  }
  const encrypted = encryptYoutubeRefreshToken(tokens.refreshToken);
  const existing = await database.query.youtubeChannelConnections.findFirst({
    where: oauthState.organizationId
      ? and(
          eq(
            youtubeChannelConnections.organizationId,
            oauthState.organizationId,
          ),
          eq(youtubeChannelConnections.channelId, identity.channelId),
        )
      : and(
          eq(youtubeChannelConnections.ownerPersonId, oauthState.personId),
          isNull(youtubeChannelConnections.organizationId),
          eq(youtubeChannelConnections.channelId, identity.channelId),
        ),
  });
  const connectionId = existing?.id ?? randomUUID();
  const values = {
    ownerPersonId: oauthState.personId,
    organizationId: oauthState.organizationId ?? undefined,
    channelId: identity.channelId,
    channelTitle: identity.channelTitle,
    encryptedRefreshToken: encrypted.ciphertext,
    encryptionIv: encrypted.iv,
    encryptionAuthTag: encrypted.authTag,
    encryptionKeyVersion: encrypted.keyVersion,
    scopes: Array.from(tokens.scopes),
    status: "active" as const,
    lastValidatedAt: input.now,
    lastError: null,
    revokedAt: null,
    updatedAt: input.now,
  };
  if (existing) {
    await database
      .update(youtubeChannelConnections)
      .set(values)
      .where(eq(youtubeChannelConnections.id, connectionId));
  } else {
    await database.insert(youtubeChannelConnections).values({
      id: connectionId,
      ...values,
      createdAt: input.now,
    });
  }
  await database.insert(auditLog).values({
    actorPersonId: oauthState.personId,
    organizationId: oauthState.organizationId,
    actorType: "person",
    action: "video.youtube-channel-connected",
    entityType: "youtube-channel-connection",
    entityId: connectionId,
    reason: `Connected YouTube channel ${identity.channelTitle}.`,
    createdAt: input.now,
  });
  return {
    returnUrl: oauthState.returnUrl,
    channel: {
      id: connectionId,
      channelId: identity.channelId,
      channelTitle: identity.channelTitle,
      scope: oauthState.organizationId ? "organization" : "personal",
      status: "active",
    },
  };
}

export async function disconnectYoutubeChannel(input: {
  readonly actor: ApiActor;
  readonly connectionId: string;
  readonly now: Date;
}): Promise<{ readonly disconnected: true }> {
  const connection =
    await getDatabase().query.youtubeChannelConnections.findFirst({
      where: and(
        eq(youtubeChannelConnections.id, input.connectionId),
        connectionScopeWhere(input.actor),
      ),
    });
  if (!connection) {
    throw new YoutubeConnectionError(
      "YOUTUBE_CONNECTION_NOT_FOUND",
      "YouTube channel connection not found.",
    );
  }
  if (connection.organizationId && !canManageOrganizationYoutube(input.actor)) {
    throw new YoutubeConnectionError(
      "YOUTUBE_FORBIDDEN",
      "Only an organization owner or manager can disconnect its YouTube channel.",
    );
  }
  const refreshToken = decryptYoutubeRefreshToken({
    ciphertext: connection.encryptedRefreshToken,
    iv: connection.encryptionIv,
    authTag: connection.encryptionAuthTag,
    keyVersion: connection.encryptionKeyVersion as 1,
  });
  const scrubbed = encryptYoutubeRefreshToken("revoked");
  await revokeYoutubeRefreshToken(refreshToken).catch(() => undefined);
  await Promise.all([
    getDatabase()
      .update(youtubeChannelConnections)
      .set({
        encryptedRefreshToken: scrubbed.ciphertext,
        encryptionIv: scrubbed.iv,
        encryptionAuthTag: scrubbed.authTag,
        encryptionKeyVersion: scrubbed.keyVersion,
        status: "revoked",
        revokedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(youtubeChannelConnections.id, connection.id)),
    getDatabase()
      .insert(auditLog)
      .values({
        actorPersonId: input.actor.personId,
        organizationId: connection.organizationId,
        actorType: "person",
        action: "video.youtube-channel-disconnected",
        entityType: "youtube-channel-connection",
        entityId: connection.id,
        reason: `Disconnected YouTube channel ${connection.channelTitle}.`,
        createdAt: input.now,
      }),
  ]);
  return { disconnected: true };
}

export interface BroadcastDestinationSummary {
  readonly id: string;
  readonly kind: "duna-youtube" | "connected-youtube";
  readonly channelId: string;
  readonly channelTitle: string;
  readonly status: "ready" | "failed";
  readonly watchUrl?: string;
  readonly error?: string;
}

export async function provisionYoutubeBroadcastDestinations(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly liveInputId: string;
  readonly title: string;
  readonly liveVisibility: "public" | "link-only";
  readonly simulcastToDunaYoutube: boolean;
  readonly youtubeConnectionIds: readonly string[];
  readonly now: Date;
}): Promise<readonly BroadcastDestinationSummary[]> {
  const duna = input.simulcastToDunaYoutube ? dunaYoutubeChannel() : undefined;
  if (input.simulcastToDunaYoutube && !duna) {
    throw new YoutubeConnectionError(
      "YOUTUBE_NOT_CONFIGURED",
      "Duna's YouTube channel is not configured for simulcast yet.",
    );
  }
  const uniqueConnectionIds = [...new Set(input.youtubeConnectionIds)];
  const connections =
    uniqueConnectionIds.length > 0
      ? await getDatabase()
          .select()
          .from(youtubeChannelConnections)
          .where(
            and(
              inArray(youtubeChannelConnections.id, uniqueConnectionIds),
              eq(youtubeChannelConnections.status, "active"),
              connectionScopeWhere(input.actor),
            ),
          )
      : [];
  if (connections.length !== uniqueConnectionIds.length) {
    throw new YoutubeConnectionError(
      "YOUTUBE_CONNECTION_NOT_FOUND",
      "One of the selected YouTube channels is no longer connected.",
    );
  }
  const candidates = [
    ...(duna
      ? [
          {
            kind: "duna-youtube" as const,
            connectionId: undefined,
            channelId: duna.channelId,
            channelTitle: duna.channelTitle,
            refreshToken: duna.refreshToken,
          },
        ]
      : []),
    ...connections.map((connection) => ({
      kind: "connected-youtube" as const,
      connectionId: connection.id,
      channelId: connection.channelId,
      channelTitle: connection.channelTitle,
      refreshToken: decryptYoutubeRefreshToken({
        ciphertext: connection.encryptedRefreshToken,
        iv: connection.encryptionIv,
        authTag: connection.encryptionAuthTag,
        keyVersion: connection.encryptionKeyVersion as 1,
      }),
    })),
  ].filter(
    (candidate, index, all) =>
      all.findIndex((other) => other.channelId === candidate.channelId) ===
      index,
  );

  return Promise.all(
    candidates.map(async (candidate): Promise<BroadcastDestinationSummary> => {
      const id = randomUUID();
      const privacyStatus =
        input.liveVisibility === "public" ? "public" : "unlisted";
      await getDatabase().insert(videoBroadcastDestinations).values({
        id,
        videoId: input.videoId,
        youtubeConnectionId: candidate.connectionId,
        kind: candidate.kind,
        channelId: candidate.channelId,
        channelTitle: candidate.channelTitle,
        youtubePrivacyStatus: privacyStatus,
        status: "provisioning",
        createdAt: input.now,
        updatedAt: input.now,
      });
      let youtube: Awaited<
        ReturnType<typeof createYoutubeLiveDestination>
      > | null = null;
      try {
        youtube = await createYoutubeLiveDestination({
          refreshToken: candidate.refreshToken,
          title: input.title,
          description:
            "Live volleyball from Duna. Score, replay, and match details stay connected in Duna.",
          privacyStatus,
          // YouTube rejects start times that have slipped into the past while
          // provider setup is running. Thirty seconds leaves room for token
          // refresh and parallel destination creation without delaying play.
          scheduledStartTime: new Date(input.now.getTime() + 30_000),
        });
        const output = await createCloudflareLiveOutput({
          liveInputId: input.liveInputId,
          url: youtube.ingestionUrl,
          streamKey: youtube.streamKey,
        });
        await getDatabase()
          .update(videoBroadcastDestinations)
          .set({
            cloudflareOutputId: output.outputId,
            youtubeBroadcastId: youtube.broadcastId,
            youtubeStreamId: youtube.streamId,
            youtubeWatchUrl: youtube.watchUrl,
            status: "ready",
            updatedAt: input.now,
          })
          .where(eq(videoBroadcastDestinations.id, id));
        return {
          id,
          kind: candidate.kind,
          channelId: candidate.channelId,
          channelTitle: candidate.channelTitle,
          status: "ready",
          watchUrl: youtube.watchUrl,
        };
      } catch (error) {
        if (youtube) {
          await deleteYoutubeLiveDestination({
            refreshToken: candidate.refreshToken,
            broadcastId: youtube.broadcastId,
            streamId: youtube.streamId,
          }).catch(() => undefined);
        }
        const message =
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : "YouTube destination setup failed.";
        await Promise.all([
          getDatabase()
            .update(videoBroadcastDestinations)
            .set({
              status: "failed",
              failureReason: message,
              updatedAt: input.now,
            })
            .where(eq(videoBroadcastDestinations.id, id)),
          candidate.connectionId
            ? getDatabase()
                .update(youtubeChannelConnections)
                .set({
                  status: "error",
                  lastError: message,
                  updatedAt: input.now,
                })
                .where(eq(youtubeChannelConnections.id, candidate.connectionId))
            : Promise.resolve(),
        ]);
        return {
          id,
          kind: candidate.kind,
          channelId: candidate.channelId,
          channelTitle: candidate.channelTitle,
          status: "failed",
          error: message,
        };
      }
    }),
  );
}

export async function endYoutubeBroadcastDestinations(
  videoId: string,
  now: Date,
): Promise<void> {
  await getDatabase()
    .update(videoBroadcastDestinations)
    .set({ status: "ended", endedAt: now, updatedAt: now })
    .where(
      and(
        eq(videoBroadcastDestinations.videoId, videoId),
        eq(videoBroadcastDestinations.status, "ready"),
      ),
    );
}
