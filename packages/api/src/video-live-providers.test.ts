import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cloudflareEmbedUrl,
  cloudflareSignedPlaybackUrl,
  createCloudflareLiveOutput,
  createCloudflareLiveVideo,
  createMuxLiveOutput,
  isCloudflareStreamConfigured,
  muxLiveVideoQuality,
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

describe("live provider routing", () => {
  it("does not mistake a generic Cloudflare or R2 token for Stream access", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-123");
    vi.stubEnv("CF_TOKEN_VALUE", "generic-account-token");
    expect(isCloudflareStreamConfigured()).toBe(false);
  });

  it("routes everyday streams to Cloudflare and top Duna tiers to Mux", () => {
    configureCloudflare();
    vi.stubEnv("MUX_TOKEN_ID", "mux-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "mux-secret");

    expect(preferredLiveVideoProvider({ membershipPlan: "premium" })).toBe(
      "cloudflare",
    );
    expect(preferredLiveVideoProvider({ membershipPlan: "premium-plus" })).toBe(
      "mux",
    );
    expect(preferredLiveVideoProvider({ organizationPlan: "small-club" })).toBe(
      "cloudflare",
    );
    expect(preferredLiveVideoProvider({ organizationPlan: "club" })).toBe(
      "mux",
    );
    vi.stubEnv("DUNA_LIVE_PROVIDER", "cloudflare");
    expect(preferredLiveVideoProvider({ membershipPlan: "premium-plus" })).toBe(
      "cloudflare",
    );
    vi.stubEnv("DUNA_LIVE_PROVIDER", "mux");
    expect(preferredLiveVideoProvider({ membershipPlan: "premium" })).toBe(
      "mux",
    );
    expect(muxLiveVideoQuality()).toBe("plus");
    vi.stubEnv("MUX_LIVE_VIDEO_QUALITY", "premium");
    expect(muxLiveVideoQuality()).toBe("premium");
  });

  it("returns both RTMPS and SRT without persisting credentials", async () => {
    configureCloudflare();
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

  it("creates a Mux simulcast target without retaining the YouTube key", async () => {
    vi.stubEnv("MUX_TOKEN_ID", "mux-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "mux-secret");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          id: "mux-target-123",
          status: "idle",
          url: "rtmps://a.rtmp.youtube.com/live2",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createMuxLiveOutput({
        liveInputId: "mux-live-123",
        url: "rtmps://a.rtmp.youtube.com/live2",
        streamKey: "youtube-secret-key",
        passthrough: "destination-123",
      }),
    ).resolves.toEqual({ outputId: "mux-target-123" });
    const request = fetchMock.mock.calls[0];
    expect(String(request?.[0])).toContain(
      "/video/v1/live-streams/mux-live-123/simulcast-targets",
    );
    expect(JSON.parse(String((request?.[1] as RequestInit)?.body))).toEqual({
      passthrough: "destination-123",
      stream_key: "youtube-secret-key",
      url: "rtmps://a.rtmp.youtube.com/live2",
    });
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

  it("creates and binds a non-reusable YouTube stream for simulcast", async () => {
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
