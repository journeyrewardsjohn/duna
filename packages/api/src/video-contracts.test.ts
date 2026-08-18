import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminVideoOverviewSchema,
  courtCalibrationSchema,
  dunaPlusEntitlementSchema,
  videoPlaybackSchema,
  videoAnalysisMarkerInputSchema,
  videoAnalysisWorkerResultSchema,
  videoAssociationOptionSchema,
  videoUsageSchema,
  visionSessionSettingsSchema,
  visionTimelineEventSchema,
} from "./contracts";
import {
  buildMuxLiveStreamInput,
  isMuxLivePlanUnavailable,
  isMuxSignedPlaybackConfigured,
  isMuxVideoConfigured,
  isR2VideoConfigured,
  muxDataEnvironmentKey,
  R2_VIDEO_PART_SIZE_BYTES,
} from "./video-providers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Duna Video contracts", () => {
  it("accepts calibrated full-court geometry and rejects impossible grades", () => {
    const calibration = {
      courtWidthMeters: 8,
      courtLengthMeters: 16,
      netHeightMeters: 2.43,
      qualityGrade: "excellent",
      qualityScore: 92,
      confidence: 0.88,
      corners: [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.2 },
        { x: 0.85, y: 0.88 },
        { x: 0.15, y: 0.88 },
      ],
      warnings: [],
      calibratedAt: "2026-08-04T18:00:00.000Z",
    };
    expect(courtCalibrationSchema.parse(calibration)).toMatchObject({
      qualityGrade: "excellent",
      qualityScore: 92,
    });
    expect(() =>
      courtCalibrationSchema.parse({
        ...calibration,
        qualityScore: 101,
      }),
    ).toThrow();
  });

  it("keeps paid, complimentary, and free membership states explicit", () => {
    expect(
      dunaPlusEntitlementSchema.parse({
        active: true,
        kind: "complimentary",
        plan: "premium-plus",
        label: "Complimentary Premium+",
        startsAt: "2026-08-04T18:00:00.000Z",
      }),
    ).toMatchObject({
      active: true,
      kind: "complimentary",
      plan: "premium-plus",
      label: "Complimentary Premium+",
    });
  });

  it("accepts the deployed server-only R2 aliases without treating an account token as S3 credentials", () => {
    vi.stubEnv("cloudflare_account_id", "example-account");
    vi.stubEnv("cf_r2_access_key_id", "r2-access-key");
    vi.stubEnv("cf_r2_secret_access_key", "r2-secret-key");
    vi.stubEnv(
      "cf_rs_s3_endpoint",
      "https://example-account.r2.cloudflarestorage.com",
    );
    vi.stubEnv("cf_r2_account_token", "account-api-token-only");

    expect(isR2VideoConfigured()).toBe(true);
  });

  it("keeps model callbacks bounded and treats needs-review as a completed analysis state", () => {
    const videoId = crypto.randomUUID();
    expect(
      videoAnalysisWorkerResultSchema.parse({
        runId: crypto.randomUUID(),
        status: "needs-review",
        modelVersion: "duna-ball-v1",
        coverage: {
          sampledDurationUs: 900_000_000,
          usableDurationUs: 720_000_000,
          sourceVideoAvailable: true,
          scoreTimelineAvailable: true,
        },
        events: [
          {
            id: crypto.randomUUID(),
            eventType: "ball-contact",
            sessionTimeUs: 82_000_000,
            confidence: 0.91,
            payload: {
              rallyId: crypto.randomUUID(),
              contactKind: "attack",
              outcome: "kill",
              side: "a",
              speedKph: 73.2,
            },
          },
          {
            id: crypto.randomUUID(),
            eventType: "ball-landing",
            sessionTimeUs: 84_000_000,
            confidence: 0.82,
            courtPoint: { xMeters: 3.4, yMeters: 12.1, observed: "visible" },
          },
        ],
      }),
    ).toMatchObject({ status: "needs-review" });
    expect(() =>
      videoAnalysisMarkerInputSchema.parse({
        videoId,
        sessionTimeUs: 0,
        eventType: "ball-landing",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).toThrow();
    expect(() =>
      videoAnalysisWorkerResultSchema.parse({
        runId: crypto.randomUUID(),
        status: "needs-review",
        events: [
          {
            id: crypto.randomUUID(),
            eventType: "ball-contact",
            sessionTimeUs: 82_000_000,
            confidence: 0.9,
            payload: { outcome: "kill" },
          },
        ],
      }),
    ).toThrow();
  });

  it("requires benchmark provenance before a worker can declare production readiness", () => {
    const base = {
      runId: crypto.randomUUID(),
      status: "ready",
      modelVersion: "duna-volleyball-v1",
      artifactR2Key: `video-analysis/${crypto.randomUUID()}/runs/manifest`,
      coverage: {
        sampledDurationUs: 60_000_000,
        usableDurationUs: 54_000_000,
        sourceVideoAvailable: true,
        scoreTimelineAvailable: false,
      },
      events: [],
    } as const;
    expect(() => videoAnalysisWorkerResultSchema.parse(base)).toThrow();
    expect(
      videoAnalysisWorkerResultSchema.parse({
        ...base,
        qualityGate: {
          attestationVersion: 1,
          decision: "passed",
          productionEligible: true,
          benchmarkId: "held-out-beach-v1",
          modelBundleSha256: "a".repeat(64),
          datasetManifestSha256: "b".repeat(64),
          evaluatedAt: "2026-08-17T20:00:00.000Z",
          metrics: {
            contactF1: 0.91,
            rallyF1: 0.94,
            landingF1: 0.88,
            landingErrorP95Meters: 0.42,
            courtErrorP95Pixels: 7.2,
            falseEventsPerMinute: 0.4,
            usableCoverageRatio: 0.9,
          },
          failedChecks: [],
          evaluatedSlices: ["sunny", "backlit"],
        },
      }),
    ).toMatchObject({ status: "ready" });
  });

  it("carries match venue and camera defaults into the mobile setup", () => {
    const option = videoAssociationOptionSchema.parse({
      type: "match",
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      title: "Duna Blue vs Duna Gold",
      subtitle: "Championship · scheduled",
      associated: true,
      venue: {
        venueId: crypto.randomUUID(),
        name: "Manhattan Beach Pier",
        googlePlaceId: "google-place-id",
        latitude: 33.8847,
        longitude: -118.4109,
      },
      captureDefaults: {
        courtWidthMeters: 8,
        courtLengthMeters: 16,
        netHeightMeters: 2.24,
        orientation: "landscape",
      },
    });

    expect(option).toMatchObject({
      associated: true,
      venue: { name: "Manhattan Beach Pier" },
      captureDefaults: { netHeightMeters: 2.24, orientation: "landscape" },
    });
  });

  it("represents live and uploaded-video limits separately", () => {
    const usage = videoUsageSchema.parse({
      periodStartsAt: "2026-08-01T00:00:00.000Z",
      periodEndsAt: "2026-09-01T00:00:00.000Z",
      live: {
        usedSeconds: 3_600,
        limitSeconds: 28_800,
        remainingSeconds: 25_200,
        enforced: true,
      },
      uploads: {
        usedSeconds: 90_000,
        limitSeconds: 108_000,
        remainingSeconds: 18_000,
        overageSeconds: 0,
        enforced: true,
      },
    });
    expect(usage.live.enforced).toBe(true);
    expect(usage.uploads).toMatchObject({
      overageSeconds: 0,
      enforced: true,
    });
  });

  it("requires a provider source for every authorized playback response", () => {
    const base = {
      video: {
        id: crypto.randomUUID(),
        owner: {
          id: crypto.randomUUID(),
          displayName: "Duna Player",
          handle: "duna-player",
          initials: "DP",
          homeMarket: "South Bay",
          rating: {
            display: 1_500,
            mu: 1_500,
            phi: 350,
            sigma: 0.06,
            confidence: "Provisional",
            discipline: "beach-2s",
          },
          roles: ["player"],
        },
        source: "live",
        category: "match",
        title: "Final",
        status: "live",
        liveVisibility: "link-only",
        recordingVisibility: "private",
        publishedToProfile: false,
        hasAudio: true,
        musicRemovalRequested: false,
        musicRemovalStatus: "not-requested",
        createdAt: "2026-08-04T18:00:00.000Z",
      },
      provider: "mux",
      playbackId: "signed-playback-id",
      playbackToken: "signed-token",
      viewSessionId: crypto.randomUUID(),
      isOwner: false,
    };
    expect(videoPlaybackSchema.parse(base)).toMatchObject({
      provider: "mux",
      isOwner: false,
    });
    expect(() =>
      videoPlaybackSchema.parse({ ...base, provider: "unknown" }),
    ).toThrow();
  });

  it("keeps bounded off-screen calibration and explicitly controls score overlays", () => {
    const settings = visionSessionSettingsSchema.parse({
      courtWidthMeters: 8,
      courtLengthMeters: 16,
      netHeightMeters: 2.43,
      cameraHeightMeters: 2.1,
      overlayScoreboard: true,
      teamA: "Duna Blue",
      teamB: "Duna Sand",
      corners: [
        { x: 0.08, y: 0.89 },
        { x: 0.92, y: 0.89 },
        { x: 0.72, y: 0.22 },
        { x: 0.28, y: 0.22 },
      ],
    });
    expect(settings).toMatchObject({
      overlayScoreboard: true,
      cameraHeightMeters: 2.1,
    });
    expect(
      visionSessionSettingsSchema.parse({
        ...settings,
        captureMode: "upload",
      }).captureMode,
    ).toBe("upload");
    const partial = visionSessionSettingsSchema.parse({
      ...settings,
      nearLineVisible: false,
      calibrationMode: "assisted",
      corners: settings.corners?.map((corner, index) =>
        index >= 2 ? { x: corner.x, y: 1.14 } : corner,
      ),
    });
    expect(partial).toMatchObject({
      nearLineVisible: false,
      calibrationMode: "assisted",
    });
    expect(() =>
      visionSessionSettingsSchema.parse({
        ...partial,
        corners: partial.corners?.map((corner, index) =>
          index === 0 ? { x: -2, y: corner.y } : corner,
        ),
      }),
    ).toThrow();
  });

  it("accepts append-only Watch moments with an overlay-ready score snapshot", () => {
    const sessionId = crypto.randomUUID();
    const event = visionTimelineEventSchema.parse({
      id: crypto.randomUUID(),
      sessionId,
      source: "apple-watch",
      type: "rally-won",
      winnerSide: "A",
      elapsedMs: 84_000,
      occurredAt: "2026-08-04T18:01:24.000Z",
      score: {
        setIndex: 0,
        sets: [{ a: 8, b: 6 }],
        serving: "A",
        status: "live",
      },
    });
    expect(event).toMatchObject({
      sessionId,
      type: "rally-won",
      elapsedMs: 84_000,
      score: { sets: [{ a: 8, b: 6 }] },
    });
    expect(() =>
      visionTimelineEventSchema.parse({
        ...event,
        id: crypto.randomUUID(),
        type: "undo",
        targetEventId: undefined,
      }),
    ).toThrow();
    expect(() =>
      visionTimelineEventSchema.parse({
        ...event,
        id: crypto.randomUUID(),
        score: { ...event.score, setIndex: 4 },
      }),
    ).toThrow();
  });

  it("keeps the Super Admin video overview typed and management-scoped", () => {
    const overview = adminVideoOverviewSchema.parse({
      canManage: true,
      settings: {
        monthlyLiveSeconds: 28_800,
        monthlyUploadSeconds: 108_000,
        enforceLiveLimit: true,
        enforceUploadLimit: true,
      },
      totals: {
        videos: 0,
        liveNow: 0,
        storageBytes: 0,
        watchedSeconds: 0,
        complimentarySubscribers: 1,
      },
      activeStreams: [],
      topUsage: [],
      grants: [],
      visionLearning: {
        automaticTraining: false,
        reviewRequired: true,
        counts: {
          pending: 0,
          approved: 0,
          rejected: 0,
          training: 0,
          trained: 0,
        },
        insightFeedback: { helpful: 0, notHelpful: 0 },
        calibrationSamples: [],
      },
      muxConfigured: false,
      r2Configured: true,
    });
    expect(overview).toMatchObject({
      canManage: true,
      totals: { complimentarySubscribers: 1 },
    });
  });
});

describe("Duna Video provider readiness", () => {
  it("requires both Mux API values and both signed-playback values", () => {
    vi.stubEnv("MUX_TOKEN_ID", "token-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "token-secret");
    expect(isMuxVideoConfigured()).toBe(true);
    expect(isMuxSignedPlaybackConfigured()).toBe(false);

    vi.stubEnv("MUX_SIGNING_KEY_ID", "signing-key");
    vi.stubEnv("MUX_PRIVATE_KEY", "private-key");
    vi.stubEnv("MUX_DATA_ENV_KEY", "data-environment");
    expect(isMuxSignedPlaybackConfigured()).toBe(true);
    expect(muxDataEnvironmentKey()).toBe("data-environment");
  });

  it("accepts the Mux dashboard secret names and base64 signing key", () => {
    vi.stubEnv("MUX_TOKEN_ID", "token-id");
    vi.stubEnv("MUX_SECRET_KEY", "token-secret");
    vi.stubEnv("MUX_SIGNING_KEY_ID", "signing-key");
    vi.stubEnv(
      "MUX_SIGNING_SECRET",
      Buffer.from(
        "-----BEGIN RSA PRIVATE KEY-----\nprivate-key\n-----END RSA PRIVATE KEY-----",
      ).toString("base64"),
    );
    expect(isMuxVideoConfigured()).toBe(true);
    expect(isMuxSignedPlaybackConfigured()).toBe(true);
  });

  it("accepts the supplied R2 S3 credential names and fixed part size", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "example-account");
    vi.stubEnv("CF_ACCESS_KEY_ID", "r2-access-key");
    vi.stubEnv("CE_SECRET_ACCESS_KEY", "r2-secret-key");
    expect(isR2VideoConfigured()).toBe(true);
    expect(R2_VIDEO_PART_SIZE_BYTES).toBe(16 * 1024 * 1024);
  });

  it("places Duna passthrough on the live stream for inherited asset metadata", () => {
    const videoId = crypto.randomUUID();
    const built = buildMuxLiveStreamInput({
      videoId,
      title: "Championship match",
      liveVisibility: "public",
      recordingVisibility: "private",
      maximumDurationSeconds: 14_400,
    });

    expect(built.request).toMatchObject({
      passthrough: videoId,
      playback_policies: ["public"],
      new_asset_settings: {
        playback_policies: ["signed"],
        meta: { external_id: videoId },
      },
    });
    expect(built.request.new_asset_settings).not.toHaveProperty("passthrough");
  });

  it("recognizes the Mux free-plan live gate without treating other 400s as it", () => {
    expect(
      isMuxLivePlanUnavailable({
        status: 400,
        error: {
          type: "invalid_parameters",
          messages: ["Live streams are unavailable on the free plan"],
        },
      }),
    ).toBe(true);
    expect(
      isMuxLivePlanUnavailable(
        new Error("Mux rejected an invalid playback policy"),
      ),
    ).toBe(false);
  });
});
