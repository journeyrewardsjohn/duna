import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cloudflareEmbedUrl,
  cloudflareSignedPlaybackUrl,
  createCloudflareLiveOutput,
  createCloudflareLiveVideo,
  isCloudflareStreamConfigured,
} from "./video-providers";
import { preferredLiveVideoProvider } from "./video-service";
import {
  buildYoutubeAuthorizationUrl,
  createYoutubeLiveDestination,
  decryptYoutubeRefreshToken,
  encryptYoutubeRefreshToken,
  isYoutubeChannelLinkingConfigured,
} from "./video-youtube-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function configureCloudflare() {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-123");
  vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "stream-token");
}

function configureYoutube() {
  vi.stubEnv("YOUTUBE_CLIENT_ID", "youtube-client");
  vi.stubEnv("YOUTUBE_CLIENT_SECRET", "youtube-secret");
  vi.stubEnv(
    "YOUTUBE_OAUTH_REDIRECT_URI",
    "https://duna.coach/api/video/youtube/callback",
  );
  vi.stubEnv(
    "VIDEO_PROVIDER_ENCRYPTION_KEY",
    Buffer.alloc(32, 7).toString("base64"),
  );
}

describe("Cloudflare Stream live provider", () => {
  it("does not mistake a generic Cloudflare or R2 token for Stream access", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-123");
    vi.stubEnv("CF_TOKEN_VALUE", "generic-account-token");
    expect(isCloudflareStreamConfigured()).toBe(false);
  });

  it("prefers Cloudflare and returns both RTMPS and SRT without persisting credentials", async () => {
    configureCloudflare();
    vi.stubEnv("MUX_TOKEN_ID", "mux-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "mux-secret");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        result: {
          uid: "input-123",
          rtmps: {
            url: "rtmps://live.cloudflare.com:443/live/",
            streamKey: "rtmps-secret-key",
          },
          srt: {
            url: "srt://live.cloudflare.com:778",
            streamId: "stream-id",
            passphrase: "srt-secret-passphrase",
          },
          playback: {
            hls: "https://customer.example.com/input-123/manifest/video.m3u8",
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(isCloudflareStreamConfigured()).toBe(true);
    expect(preferredLiveVideoProvider()).toBe("cloudflare");
    await expect(
      createCloudflareLiveVideo({
        videoId: crypto.randomUUID(),
        title: "Final · Court 1",
        liveVisibility: "public",
        recordingVisibility: "private",
      }),
    ).resolves.toMatchObject({
      liveInputId: "input-123",
      playbackPolicy: "signed",
      rtmps: { streamKey: "rtmps-secret-key" },
      srt: { streamId: "stream-id" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-123/stream/live_inputs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer stream-token",
        }),
      }),
    );
    const request = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as {
      deleteRecordingAfterDays?: number;
      recording: { requireSignedURLs: boolean; mode: string };
    };
    expect(request.recording).toMatchObject({
      mode: "automatic",
      requireSignedURLs: true,
    });
    expect(request.deleteRecordingAfterDays).toBeUndefined();
  });

  it("creates an independently addressable simulcast output", async () => {
    configureCloudflare();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: true, result: { uid: "output-123" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createCloudflareLiveOutput({
        liveInputId: "input-123",
        url: "rtmp://a.rtmp.youtube.com/live2",
        streamKey: "youtube-stream-key",
      }),
    ).resolves.toEqual({ outputId: "output-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/live_inputs/input-123/outputs"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("builds public and signed Cloudflare player URLs", () => {
    const hls = "https://customer.example.com/video-123/manifest/video.m3u8";
    expect(cloudflareSignedPlaybackUrl(hls, "video-123", "signed-token")).toBe(
      "https://customer.example.com/signed-token/manifest/video.m3u8",
    );
    expect(cloudflareEmbedUrl(hls, "video-123", "signed-token")).toBe(
      "https://customer.example.com/signed-token/iframe",
    );
  });
});

describe("YouTube live destinations", () => {
  it("uses one-time OAuth consent and encrypts refresh credentials", () => {
    configureYoutube();
    expect(isYoutubeChannelLinkingConfigured()).toBe(true);
    const authorization = new URL(
      buildYoutubeAuthorizationUrl({ state: "state-123" }),
    );
    expect(authorization.searchParams.get("access_type")).toBe("offline");
    expect(authorization.searchParams.get("prompt")).toBe("consent");
    expect(authorization.searchParams.get("state")).toBe("state-123");
    expect(authorization.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.force-ssl",
    );

    const encrypted = encryptYoutubeRefreshToken("refresh-secret");
    expect(encrypted.ciphertext).not.toContain("refresh-secret");
    expect(decryptYoutubeRefreshToken(encrypted)).toBe("refresh-secret");
  });

  it("creates and binds a non-reusable YouTube stream for Cloudflare", async () => {
    configureYoutube();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: "access-token", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(Response.json({ id: "broadcast-123" }))
      .mockResolvedValueOnce(
        Response.json({
          id: "stream-123",
          cdn: {
            ingestionInfo: {
              ingestionAddress: "rtmp://a.rtmp.youtube.com/live2",
              rtmpsIngestionAddress: "rtmps://a.rtmps.youtube.com/live2",
              streamName: "youtube-stream-key",
            },
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: "broadcast-123" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createYoutubeLiveDestination({
        refreshToken: "refresh-token",
        title: "Duna final",
        description: "Live from Duna",
        privacyStatus: "public",
        scheduledStartTime: new Date("2026-08-30T18:00:00.000Z"),
      }),
    ).resolves.toEqual({
      broadcastId: "broadcast-123",
      streamId: "stream-123",
      ingestionUrl: "rtmps://a.rtmps.youtube.com/live2",
      streamKey: "youtube-stream-key",
      watchUrl: "https://www.youtube.com/watch?v=broadcast-123",
    });
    expect(fetchMock.mock.calls[3]?.[0]).toContain(
      "/liveBroadcasts/bind?id=broadcast-123&streamId=stream-123",
    );
    const streamRequest = JSON.parse(
      (fetchMock.mock.calls[2]?.[1] as RequestInit).body as string,
    ) as { cdn: { frameRate: string; resolution: string } };
    expect(streamRequest.cdn).toMatchObject({
      frameRate: "variable",
      resolution: "variable",
    });
  });
});
