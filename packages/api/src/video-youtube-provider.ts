import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

// This is the narrower of the two scopes accepted by the YouTube live write
// APIs. Duna never needs broad account administration outside HTTPS requests.
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOCATION_URL = "https://oauth2.googleapis.com/revoke";
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

interface YoutubeOAuthConfiguration {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface EncryptedYoutubeCredential {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly keyVersion: 1;
}

export interface YoutubeChannelIdentity {
  readonly channelId: string;
  readonly channelTitle: string;
}

export interface YoutubeLiveDestination {
  readonly broadcastId: string;
  readonly streamId: string;
  readonly ingestionUrl: string;
  readonly streamKey: string;
  readonly watchUrl: string;
}

function youtubeOAuthConfiguration(): YoutubeOAuthConfiguration | undefined {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim();
  return clientId && clientSecret && redirectUri
    ? { clientId, clientSecret, redirectUri }
    : undefined;
}

function requireYoutubeOAuthConfiguration(): YoutubeOAuthConfiguration {
  const configuration = youtubeOAuthConfiguration();
  if (!configuration) {
    throw new Error("YouTube OAuth credentials are not configured.");
  }
  return configuration;
}

export function isYoutubeChannelLinkingConfigured(): boolean {
  return Boolean(youtubeOAuthConfiguration() && youtubeEncryptionKey(false));
}

export function dunaYoutubeChannel():
  (YoutubeChannelIdentity & { readonly refreshToken: string }) | undefined {
  const refreshToken = process.env.DUNA_YOUTUBE_REFRESH_TOKEN?.trim();
  const channelId = process.env.DUNA_YOUTUBE_CHANNEL_ID?.trim();
  if (!refreshToken || !channelId) return undefined;
  return {
    refreshToken,
    channelId,
    channelTitle: process.env.DUNA_YOUTUBE_CHANNEL_TITLE?.trim() || "Duna",
  };
}

export function buildYoutubeAuthorizationUrl(input: {
  readonly state: string;
  readonly loginHint?: string;
}): string {
  const configuration = requireYoutubeOAuthConfiguration();
  const url = new URL(GOOGLE_AUTHORIZATION_URL);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

async function googleTokenRequest(body: URLSearchParams): Promise<{
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly scope?: string;
  readonly error?: string;
  readonly error_description?: string;
}> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    readonly access_token?: string;
    readonly refresh_token?: string;
    readonly expires_in?: number;
    readonly scope?: string;
    readonly error?: string;
    readonly error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Google OAuth request failed (${response.status}).`,
    );
  }
  return payload;
}

export async function exchangeYoutubeAuthorizationCode(code: string): Promise<{
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly scopes: readonly string[];
}> {
  const configuration = requireYoutubeOAuthConfiguration();
  const payload = await googleTokenRequest(
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: configuration.redirectUri,
    }),
  );
  const refreshToken = payload.refresh_token?.trim();
  if (!refreshToken) {
    throw new Error(
      "Google did not return permission for offline YouTube access. Reconnect the channel and approve access.",
    );
  }
  return {
    accessToken: payload.access_token!,
    refreshToken,
    scopes: payload.scope?.split(/\s+/).filter(Boolean) ?? [YOUTUBE_SCOPE],
  };
}

export async function refreshYoutubeAccessToken(
  refreshToken: string,
): Promise<string> {
  const configuration = requireYoutubeOAuthConfiguration();
  const payload = await googleTokenRequest(
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );
  return payload.access_token!;
}

export async function revokeYoutubeRefreshToken(
  refreshToken: string,
): Promise<void> {
  const response = await fetch(GOOGLE_REVOCATION_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  });
  if (!response.ok && response.status !== 400) {
    throw new Error(`Google token revocation failed (${response.status}).`);
  }
}

async function youtubeApiRequest<Result>(input: {
  readonly accessToken: string;
  readonly path: string;
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
}): Promise<Result> {
  const response = await fetch(`${YOUTUBE_API_URL}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | Result
    | {
        readonly error?: {
          readonly message?: string;
          readonly errors?: readonly { readonly reason?: string }[];
        };
      };
  if (!response.ok) {
    const error = payload as {
      readonly error?: {
        readonly message?: string;
        readonly errors?: readonly { readonly reason?: string }[];
      };
    };
    const reason = error.error?.errors?.[0]?.reason;
    throw new Error(
      [error.error?.message, reason].filter(Boolean).join(" · ") ||
        `YouTube request failed (${response.status}).`,
    );
  }
  return payload as Result;
}

export async function loadYoutubeChannelIdentity(
  accessToken: string,
): Promise<YoutubeChannelIdentity> {
  const response = await youtubeApiRequest<{
    readonly items?: readonly {
      readonly id?: string;
      readonly snippet?: { readonly title?: string };
    }[];
  }>({
    accessToken,
    path: "/channels?part=id%2Csnippet&mine=true&maxResults=1",
  });
  const channel = response.items?.[0];
  const channelId = channel?.id?.trim();
  const channelTitle = channel?.snippet?.title?.trim();
  if (!channelId || !channelTitle) {
    throw new Error(
      "The selected Google account does not have a YouTube channel.",
    );
  }
  return { channelId, channelTitle };
}

export async function createYoutubeLiveDestination(input: {
  readonly refreshToken: string;
  readonly title: string;
  readonly description: string;
  readonly privacyStatus: "public" | "unlisted";
  readonly scheduledStartTime: Date;
}): Promise<YoutubeLiveDestination> {
  const accessToken = await refreshYoutubeAccessToken(input.refreshToken);
  const broadcastTitle = input.title.trim().slice(0, 100);
  const broadcast = await youtubeApiRequest<{ readonly id?: string }>({
    accessToken,
    method: "POST",
    path: "/liveBroadcasts?part=id%2Csnippet%2Cstatus%2CcontentDetails",
    body: {
      snippet: {
        title: broadcastTitle,
        description: input.description,
        scheduledStartTime: input.scheduledStartTime.toISOString(),
      },
      status: {
        privacyStatus: input.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableDvr: true,
        recordFromStart: true,
        latencyPreference: "low",
        monitorStream: { enableMonitorStream: false },
      },
    },
  });
  const broadcastId = broadcast.id?.trim();
  if (!broadcastId)
    throw new Error("YouTube did not create the live broadcast.");

  let createdStreamId: string | undefined;
  try {
    const stream = await youtubeApiRequest<{
      readonly id?: string;
      readonly cdn?: {
        readonly ingestionInfo?: {
          readonly ingestionAddress?: string;
          readonly rtmpsIngestionAddress?: string;
          readonly streamName?: string;
        };
      };
    }>({
      accessToken,
      method: "POST",
      path: "/liveStreams?part=id%2Csnippet%2Ccdn%2CcontentDetails",
      body: {
        snippet: { title: `${broadcastTitle} · Duna feed`.slice(0, 100) },
        cdn: {
          ingestionType: "rtmp",
          // Cloudflare forwards the source rendition. Let YouTube detect the
          // actual mobile capture profile instead of declaring a resolution
          // that may be reduced on a constrained connection.
          resolution: "variable",
          frameRate: "variable",
        },
        contentDetails: { isReusable: false },
      },
    });
    const streamId = stream.id?.trim();
    createdStreamId = streamId;
    const ingestionUrl =
      stream.cdn?.ingestionInfo?.rtmpsIngestionAddress?.trim() ||
      stream.cdn?.ingestionInfo?.ingestionAddress?.trim();
    const streamKey = stream.cdn?.ingestionInfo?.streamName?.trim();
    if (!streamId || !ingestionUrl || !streamKey) {
      throw new Error("YouTube did not return complete ingest credentials.");
    }
    await youtubeApiRequest({
      accessToken,
      method: "POST",
      path: `/liveBroadcasts/bind?id=${encodeURIComponent(broadcastId)}&streamId=${encodeURIComponent(streamId)}&part=id%2CcontentDetails`,
    });
    return {
      broadcastId,
      streamId,
      ingestionUrl,
      streamKey,
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(broadcastId)}`,
    };
  } catch (error) {
    await youtubeApiRequest({
      accessToken,
      method: "DELETE",
      path: `/liveBroadcasts?id=${encodeURIComponent(broadcastId)}`,
    }).catch(() => undefined);
    if (createdStreamId) {
      await youtubeApiRequest({
        accessToken,
        method: "DELETE",
        path: `/liveStreams?id=${encodeURIComponent(createdStreamId)}`,
      }).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Remove a one-use broadcast and stream when a downstream simulcast output
 * cannot be attached. Cleanup is intentionally best-effort at call sites: a
 * failed delete must never hide the original setup failure from the player.
 */
export async function deleteYoutubeLiveDestination(input: {
  readonly refreshToken: string;
  readonly broadcastId: string;
  readonly streamId: string;
}): Promise<void> {
  const accessToken = await refreshYoutubeAccessToken(input.refreshToken);
  await youtubeApiRequest({
    accessToken,
    method: "DELETE",
    path: `/liveBroadcasts?id=${encodeURIComponent(input.broadcastId)}`,
  }).catch(() => undefined);
  await youtubeApiRequest({
    accessToken,
    method: "DELETE",
    path: `/liveStreams?id=${encodeURIComponent(input.streamId)}`,
  }).catch(() => undefined);
}

function youtubeEncryptionKey(required = true): Buffer | undefined {
  const encoded = process.env.VIDEO_PROVIDER_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    if (!required) return undefined;
    throw new Error("VIDEO_PROVIDER_ENCRYPTION_KEY is not configured.");
  }
  const master = Buffer.from(encoded, "base64");
  if (master.length !== 32) {
    if (!required) return undefined;
    throw new Error(
      "VIDEO_PROVIDER_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return createHmac("sha256", master)
    .update("duna-youtube-refresh-token-v1")
    .digest();
}

export function encryptYoutubeRefreshToken(
  refreshToken: string,
): EncryptedYoutubeCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", youtubeEncryptionKey()!, iv);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

export function decryptYoutubeRefreshToken(
  credential: EncryptedYoutubeCredential,
): string {
  if (credential.keyVersion !== 1) {
    throw new Error("This YouTube connection uses an unavailable key version.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    youtubeEncryptionKey()!,
    Buffer.from(credential.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(credential.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(credential.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
