import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminVideoOverviewSchema,
  adminVisionOverviewSchema,
  courtCalibrationSchema,
  dunaPlusEntitlementSchema,
  videoPlaybackSchema,
  videoAnalysisMarkerInputSchema,
  videoAnalysisWorkerResultSchema,
  videoPerformanceReviewSchema,
  visionImprovementProposalSchema,
  videoAssociationOptionSchema,
  videoUsageSchema,
  visionSessionSettingsSchema,
  visionLearningConsentInputSchema,
  visionTimelineEventSchema,
} from "./contracts";
import {
  buildMuxLiveStreamInput,
  isMuxLivePlanUnavailable,
  isMuxSignedPlaybackConfigured,
  isMuxVideoConfigured,
  isR2MultipartUploadAlreadyAbsent,
  isR2VideoConfigured,
  muxDataEnvironmentKey,
  R2_VIDEO_PART_SIZE_BYTES,
} from "./video-providers";
import {
  normalizeStoredCourtCalibration,
  videoIdFromBeginUploadIdempotencyResult,
  validateAuthoritativeResumableVideoUploadParts,
  validateAuthoritativeVideoUploadParts,
} from "./video-service";
import {
  assertAdultOwnerPerformanceReviewRequest,
  buildVisionImprovementEvidence,
  isAdultLearningConsentedVisionRun,
  isVideoPerformanceReviewGatewayConfigured,
  resolveVideoPerformanceReviewModel,
} from "./video-analysis-service";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Duna Video contracts", () => {
  it("requires an explicit opt-in before a video can contribute to Vision learning", () => {
    expect(visionLearningConsentInputSchema.parse(undefined)).toBe(false);
    expect(visionLearningConsentInputSchema.parse(false)).toBe(false);
    expect(visionLearningConsentInputSchema.parse(true)).toBe(true);
  });

  it("reconciles a lost begin-upload response only from its stored video result", () => {
    const videoId = crypto.randomUUID();
    expect(videoIdFromBeginUploadIdempotencyResult({ videoId })).toBe(videoId);
    expect(videoIdFromBeginUploadIdempotencyResult({ uploadId: "other" })).toBe(
      undefined,
    );
    expect(videoIdFromBeginUploadIdempotencyResult(undefined)).toBeUndefined();
  });

  it("normalizes persisted database timestamps before returning video summaries", () => {
    const calibration = normalizeStoredCourtCalibration({
      courtWidthMeters: 8,
      courtLengthMeters: 16,
      netHeightMeters: 2.43,
      qualityGrade: "good",
      qualityScore: 84,
      confidence: 0.82,
      warnings: [],
      calibratedAt: "2026-08-18 02:28:50.443084+00",
    });

    expect(calibration?.calibratedAt).toBe("2026-08-18T02:28:50.443Z");
    expect(
      normalizeStoredCourtCalibration({
        ...calibration,
        calibratedAt: "not-a-date",
      }),
    ).toBeUndefined();
  });

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

  it("queues governed improvement evidence only for adult learning-consented completed analyses", () => {
    expect(
      isAdultLearningConsentedVisionRun({
        analysisStatus: "ready",
        visionLearningConsent: true,
        ageBand: "adult",
      }),
    ).toBe(true);
    expect(
      isAdultLearningConsentedVisionRun({
        analysisStatus: "ready",
        visionLearningConsent: false,
        ageBand: "adult",
      }),
    ).toBe(false);
    expect(
      isAdultLearningConsentedVisionRun({
        analysisStatus: "needs-review",
        visionLearningConsent: true,
        ageBand: "teen",
      }),
    ).toBe(false);
    expect(
      isAdultLearningConsentedVisionRun({
        analysisStatus: "failed",
        visionLearningConsent: true,
        ageBand: "adult",
      }),
    ).toBe(false);

    const evidence = buildVisionImprovementEvidence({
      run: {
        pipelineVersion: "duna-vision-event-graph-v1",
        modelVersion: "duna-ball-v1",
        coverage: {
          sampledDurationUs: 12_000_000,
          usableDurationUs: 7_000_000,
          sourceVideoAvailable: true,
          scoreTimelineAvailable: false,
        },
        qualityGate: null,
        failureCode: null,
      },
      result: videoAnalysisWorkerResultSchema.parse({
        runId: crypto.randomUUID(),
        status: "needs-review",
        modelVersion: "duna-ball-v1",
        coverage: {
          sampledDurationUs: 12_000_000,
          usableDurationUs: 7_000_000,
          sourceVideoAvailable: true,
          scoreTimelineAvailable: false,
        },
        events: [
          {
            id: crypto.randomUUID(),
            eventType: "ball-contact",
            sessionTimeUs: 1_000_000,
            confidence: 0.42,
            payload: {
              contactKind: "attack",
              contactUncertaintyMeters: 2.2,
              rallySequenceComplete: false,
              contactQuality: {
                evidenceVersion: "duna-contact-evidence-v1",
                evidence: "unavailable",
              },
              trajectory: {
                evidenceVersion: "duna-trajectory-2d-v1",
                coordinateFrame: "canonical-court-2d",
                observedPoints: 0,
                evidence: "unavailable",
              },
              ruleFindings: [
                {
                  ruleVersion: "beach-volleyball-2s-v1",
                  ruleId: "three-team-contacts",
                  verdict: "unavailable",
                  evidence: "Rally sequence is not complete.",
                },
              ],
            },
          },
        ],
      }),
    });
    expect(evidence).toMatchObject({
      allowedUse: "questions-and-evaluation-design-only",
      derivedMetrics: {
        unavailableContactEvidenceCount: 1,
        uncertainContactCount: 1,
        incompleteRallySequenceCount: 1,
        unavailableTrajectoryCount: 1,
        unavailableRuleFindingCount: 1,
      },
    });
    expect(evidence.prohibitedActions).toContain("automatic-promotion");
    expect(evidence).not.toHaveProperty("videoId");
    expect(evidence).not.toHaveProperty("videoUrl");
  });

  it("keeps Vision improvement proposal output bounded to research drafts", () => {
    expect(
      visionImprovementProposalSchema.parse({
        id: crypto.randomUUID(),
        videoId: crypto.randomUUID(),
        analysisRunId: crypto.randomUUID(),
        status: "succeeded",
        provider: "vercel-ai-gateway",
        model: "openai/gpt-5.6-sol",
        reasoningEffort: "xhigh",
        promptVersion: "duna-vision-improvement-proposal-v1",
        schemaVersion: "duna-vision-improvement-proposal-schema-v1",
        evidenceSha256: "a".repeat(64),
        proposals: [
          {
            question: "Which occlusion slice most affects contact timing?",
            hypothesis:
              "Partial two-dimensional evidence increases timing uncertainty.",
            requiredLabels: ["contact frame", "occlusion state"],
            evaluationSlices: ["partial-2d contacts"],
            physicsOrRulesGap: "No single-camera 3D height is available.",
            evidence: ["1 unavailable contact-quality observation"],
          },
        ],
        reviews: [
          {
            id: crypto.randomUUID(),
            reviewerPersonId: crypto.randomUUID(),
            reviewerName: "Vision Steward",
            decision: "approved",
            notes: "Approved as an evaluation-design question only.",
            reviewedAt: "2026-08-21T00:05:00.000Z",
          },
          {
            id: crypto.randomUUID(),
            reviewerPersonId: crypto.randomUUID(),
            reviewerName: "Second Vision Steward",
            decision: "rejected",
            notes:
              "Rejected for this slice; no training or promotion occurred.",
            reviewedAt: "2026-08-21T00:06:00.000Z",
          },
        ],
        createdAt: "2026-08-21T00:00:00.000Z",
      }),
    ).toMatchObject({
      status: "succeeded",
      reviews: [
        { decision: "approved", reviewerName: "Vision Steward" },
        { decision: "rejected", reviewerName: "Second Vision Steward" },
      ],
    });
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
        overageSeconds: 0,
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
      cloudflareConfigured: true,
      muxConfigured: false,
      r2Configured: true,
    });
    expect(overview).toMatchObject({
      canManage: true,
      totals: { complimentarySubscribers: 1 },
    });
  });

  it("accepts the native 0-100 calibration score in the Vision Model Lab", () => {
    const overview = adminVisionOverviewSchema.parse({
      canManage: true,
      runtime: { configured: false, provider: "modal", gpuType: "L4" },
      eligibility: {
        approvedCalibrationSamples: 1,
        consentedVideos: 1,
        pendingCalibrationReviews: 0,
      },
      models: [],
      trainingRuns: [],
      benchmarkRuns: [],
      uploadedVideos: [
        {
          id: crypto.randomUUID(),
          title: "Shared court recording",
          ownerName: "Duna Player",
          ownerId: crypto.randomUUID(),
          status: "ready",
          recordingVisibility: "private",
          learningConsent: true,
          createdAt: "2026-08-19T10:00:00.000Z",
          playerViewPath: `/app/video/${crypto.randomUUID()}`,
          analysis: {
            id: crypto.randomUUID(),
            status: "ready",
            pipelineVersion: "duna-vision-event-graph-v1",
            calibrationQualityScore: 82,
            eventCount: 14,
          },
        },
      ],
    });

    expect(overview.uploadedVideos[0]?.analysis?.calibrationQualityScore).toBe(
      82,
    );
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
    expect(R2_VIDEO_PART_SIZE_BYTES).toBe(64 * 1024 * 1024);
  });

  it("requires an exact ordered R2 part list before a video can complete", () => {
    const bytes = 64 * 1024 * 1024 + 13;
    const partSizeBytes = 64 * 1024 * 1024;
    expect(
      validateAuthoritativeVideoUploadParts({
        videoBytes: bytes,
        partSizeBytes,
        parts: [
          { partNumber: 1, etag: '"one"', sizeBytes: partSizeBytes },
          { partNumber: 2, etag: '"two"', sizeBytes: 13 },
        ],
      }),
    ).toHaveLength(2);
    expect(() =>
      validateAuthoritativeVideoUploadParts({
        videoBytes: bytes,
        partSizeBytes,
        parts: [{ partNumber: 1, etag: '"one"', sizeBytes: partSizeBytes }],
      }),
    ).toThrow("Every video part must finish");
  });

  it("only treats a provider-confirmed missing multipart upload as an idempotent abort", () => {
    expect(
      isR2MultipartUploadAlreadyAbsent({
        name: "NoSuchUpload",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(true);
    expect(
      isR2MultipartUploadAlreadyAbsent({
        name: "TimeoutError",
        $metadata: { httpStatusCode: 504 },
      }),
    ).toBe(false);
  });

  it("resumes from R2 ListParts when a client acknowledgement was lost", () => {
    const partSizeBytes = 64 * 1024 * 1024;
    // There is intentionally no client/DB record for part 1 here. R2's
    // ListParts response is sufficient to skip it on foreground resume.
    const resumed = validateAuthoritativeResumableVideoUploadParts({
      videoBytes: partSizeBytes * 2,
      partSizeBytes,
      parts: [
        { partNumber: 1, etag: '"r2-confirmed"', sizeBytes: partSizeBytes },
      ],
    });
    expect(resumed.map((part) => part.partNumber)).toEqual([1]);
    expect(() =>
      validateAuthoritativeVideoUploadParts({
        videoBytes: partSizeBytes * 2,
        partSizeBytes,
        parts: resumed,
      }),
    ).toThrow("Every video part must finish");
  });

  it("keeps governed Sol review model selection and evidence-only result schema explicit", () => {
    expect(resolveVideoPerformanceReviewModel()).toBe("openai/gpt-5.6-sol");
    vi.stubEnv("DUNA_VIDEO_REVIEW_MODEL", "openai/test-review-model");
    expect(resolveVideoPerformanceReviewModel()).toBe(
      "openai/test-review-model",
    );
    expect(
      videoPerformanceReviewSchema.parse({
        id: crypto.randomUUID(),
        videoId: crypto.randomUUID(),
        analysisRunId: crypto.randomUUID(),
        status: "unavailable",
        provider: "vercel-ai-gateway",
        model: "openai/gpt-5.6-sol",
        reasoningEffort: "xhigh",
        promptVersion: "duna-video-performance-review-v1",
        schemaVersion: "duna-video-performance-review-schema-v1",
        evidenceSha256: "a".repeat(64),
        recommendations: [],
        fallbackReason: "Vercel AI Gateway is not configured.",
        createdAt: "2026-08-21T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "unavailable", recommendations: [] });
  });

  it("fails closed for a non-owner, a minor, or a missing review gateway", () => {
    const adult = { personId: crypto.randomUUID(), ageBand: "adult" as const };
    expect(() =>
      assertAdultOwnerPerformanceReviewRequest({
        actor: adult,
        ownerPersonId: crypto.randomUUID(),
      }),
    ).toThrow("Only the video owner");
    expect(() =>
      assertAdultOwnerPerformanceReviewRequest({
        actor: { ...adult, ageBand: "teen" },
        ownerPersonId: adult.personId,
      }),
    ).toThrow("An adult video owner");
    vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    expect(isVideoPerformanceReviewGatewayConfigured()).toBe(false);
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
        video_quality: "plus",
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
