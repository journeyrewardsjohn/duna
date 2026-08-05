import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminVideoOverviewSchema,
  courtCalibrationSchema,
  dunaPlusEntitlementSchema,
  videoPlaybackSchema,
  videoUsageSchema,
} from "./contracts";
import {
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
    vi.stubEnv("CF_ACCESS_KEY_ID", "r2-access-key");
    vi.stubEnv("CE_SECRET_ACCESS_KEY", "r2-secret-key");
    expect(isR2VideoConfigured()).toBe(true);
    expect(R2_VIDEO_PART_SIZE_BYTES).toBe(64 * 1024 * 1024);
  });
});
