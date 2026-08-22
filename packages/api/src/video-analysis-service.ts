import { createHash, randomUUID } from "node:crypto";
import {
  getDatabase,
  videoAnalysisEvents,
  videoAnalysisReviews,
  videoAnalysisRuns,
  videoInsights,
  videoPerformanceReviews,
  visionImprovementProposals,
  visionImprovementProposalReviews,
  videos,
  visionSessions,
  visionTimelineEvents,
  auditLog,
  people,
} from "@duna/db";
import {
  STANDARD_BEACH_COURT,
  buildCourtHeatmap,
  buildVolleyballPerformance,
  confidenceBand,
  evaluateBeachVolleyballRules,
  type CourtDimensions,
} from "@duna/core";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { ApiActor } from "./context";
import type {
  VideoAnalysisEvent,
  VideoAnalysisMarkerInput,
  VideoAnalysisReport,
  VideoAnalysisRun,
  VideoAnalysisWorkerResult,
  VideoPerformanceReview,
  VisionImprovementProposal,
  VisionScoreSnapshot,
} from "./contracts";
import {
  videoPerformanceRecommendationSchema,
  visionImprovementProposalItemSchema,
} from "./contracts";

const ANALYSIS_PIPELINE_VERSION = "duna-vision-event-graph-v1";
const ACTIVE_RUN_STATUSES = ["queued", "processing"] as const;
const VIDEO_REVIEW_PROMPT_VERSION = "duna-video-performance-review-v1";
const VIDEO_REVIEW_SCHEMA_VERSION = "duna-video-performance-review-schema-v1";
const VISION_IMPROVEMENT_PROMPT_VERSION = "duna-vision-improvement-proposal-v1";
const VISION_IMPROVEMENT_SCHEMA_VERSION =
  "duna-vision-improvement-proposal-schema-v1";
const DEFAULT_VIDEO_REVIEW_MODEL = "openai/gpt-5.6-sol";

export class VideoAnalysisError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "VIDEO_NOT_FOUND"
      | "ANALYSIS_EVENT_NOT_FOUND"
      | "ANALYSIS_EVENT_WRONG_VIDEO"
      | "ANALYSIS_NOT_ALLOWED"
      | "OWNER_REQUIRED"
      | "ADULT_REQUIRED"
      | "ANALYSIS_NOT_READY"
      | "INVALID_REVIEW",
    message: string,
  ) {
    super(message);
    this.name = "VideoAnalysisError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new VideoAnalysisError(
      "DATABASE_REQUIRED",
      "Duna Vision analysis requires a connected database.",
    );
  }
}

function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

function canReadOrganizationVideo(
  actor: ApiActor,
  organizationId: string | null,
): boolean {
  return Boolean(
    organizationId &&
    actor.organizationId === organizationId &&
    (hasScope(actor, "reports:read") || hasScope(actor, "matches:read")),
  );
}

function canWriteOrganizationVideo(
  actor: ApiActor,
  organizationId: string | null,
): boolean {
  return Boolean(
    canReadOrganizationVideo(actor, organizationId) &&
    (actor.roles.includes("owner") ||
      actor.roles.includes("manager") ||
      actor.roles.includes("coach") ||
      actor.roles.includes("super-admin")),
  );
}

async function authorizedVideo(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly write?: boolean;
}) {
  const video = await getDatabase().query.videos.findFirst({
    where: eq(videos.id, input.videoId),
  });
  if (!video) {
    throw new VideoAnalysisError("VIDEO_NOT_FOUND", "Video not found.");
  }
  const owner = video.ownerPersonId === input.actor.personId;
  const organizationAllowed = input.write
    ? canWriteOrganizationVideo(input.actor, video.organizationId)
    : canReadOrganizationVideo(input.actor, video.organizationId);
  if (!owner && !organizationAllowed) {
    throw new VideoAnalysisError(
      "ANALYSIS_NOT_ALLOWED",
      "You do not have access to this Duna Vision report.",
    );
  }
  return video;
}

function asCourtDimensions(input: {
  readonly video: typeof videos.$inferSelect;
  readonly session?: typeof visionSessions.$inferSelect;
}): {
  readonly court: VideoAnalysisReport["court"];
  readonly dimensions: CourtDimensions;
} {
  const settings = input.session?.settings;
  const calibration = input.video.courtCalibration;
  const widthMeters =
    settings?.courtWidthMeters ??
    calibration?.courtWidthMeters ??
    STANDARD_BEACH_COURT.widthMeters;
  const lengthMeters =
    settings?.courtLengthMeters ??
    calibration?.courtLengthMeters ??
    STANDARD_BEACH_COURT.lengthMeters;
  const calibrationSource = input.session
    ? "vision"
    : calibration
      ? "manual"
      : "unknown";
  return {
    dimensions: { widthMeters, lengthMeters },
    court: {
      widthMeters,
      lengthMeters,
      coordinateFrame: "canonical-court",
      calibrationSource,
      calibrationQualityScore: calibration?.qualityScore,
      imageCorners: settings?.corners ?? calibration?.corners,
    },
  };
}

function sourceVideoAvailable(video: typeof videos.$inferSelect): boolean {
  return Boolean(
    video.r2ObjectKey || video.muxAssetPlaybackId || video.muxLivePlaybackId,
  );
}

function serializeRun(
  row: typeof videoAnalysisRuns.$inferSelect,
): VideoAnalysisRun {
  return {
    id: row.id,
    videoId: row.videoId,
    visionSessionId: row.visionSessionId ?? undefined,
    status: row.status as VideoAnalysisRun["status"],
    pipelineVersion: row.pipelineVersion,
    modelVersion: row.modelVersion ?? undefined,
    courtMap: row.courtMap ?? undefined,
    coverage: row.coverage ?? undefined,
    qualityGate: row.qualityGate ?? undefined,
    artifactAvailable: Boolean(row.artifactR2Key),
    failureCode: row.failureCode ?? undefined,
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeEvent(
  row: typeof videoAnalysisEvents.$inferSelect,
): VideoAnalysisEvent {
  return {
    id: row.id,
    runId: row.runId ?? undefined,
    videoId: row.videoId,
    visionSessionId: row.visionSessionId ?? undefined,
    eventType: row.eventType as VideoAnalysisEvent["eventType"],
    source: row.source as VideoAnalysisEvent["source"],
    state: row.state as VideoAnalysisEvent["state"],
    sessionTimeUs: row.sessionTimeUs,
    durationUs: row.durationUs ?? undefined,
    confidence: row.confidence ?? undefined,
    courtPoint: row.courtPoint ?? undefined,
    payload: row.payload,
    modelVersion: row.modelVersion ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function analysisSource(value: string): VideoAnalysisEvent["source"] {
  return value === "human" || value === "model" || value === "watch"
    ? value
    : "system";
}

function latestScore(
  timeline: readonly (typeof visionTimelineEvents.$inferSelect)[],
): VisionScoreSnapshot | undefined {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const score = timeline[index]?.scoreState;
    if (score) return score;
  }
  return undefined;
}

function liveTimelineHighlights(
  timeline: readonly (typeof visionTimelineEvents.$inferSelect)[],
): VideoAnalysisReport["highlights"] {
  return timeline
    .filter((event) => event.type === "favorite")
    .map((event) => ({
      id: event.id,
      sessionTimeUs: event.elapsedMs * 1_000,
      durationUs: 12 * 1_000_000,
      label: event.label ?? "Saved rally",
      source: event.source === "apple-watch" ? "watch" : "system",
      confidence: "verified" as const,
    }));
}

function workerConfiguration():
  { readonly url: string; readonly token: string } | undefined {
  const candidate = process.env.DUNA_ANALYSIS_WORKER_URL?.trim();
  const token = process.env.DUNA_ANALYSIS_WORKER_TOKEN?.trim();
  if (!candidate || !token) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return undefined;
    return { url: url.toString(), token };
  } catch {
    return undefined;
  }
}

async function dispatchAnalysisRun(input: {
  readonly runId: string;
  readonly video: typeof videos.$inferSelect;
  readonly court: VideoAnalysisReport["court"];
  readonly visionSessionId?: string;
  /**
   * Player-confirmed imported-video setup. The worker receives this alongside
   * the source object so it need not invent a court, net, or roster hint.
   */
  readonly visionSetup?: {
    readonly settings: (typeof visionSessions.$inferSelect)["settings"];
    readonly previewJpegBase64?: string;
    readonly previewCapturedAt?: string;
    readonly timeline: readonly {
      readonly type: string;
      readonly elapsedMs: number;
      readonly label?: string;
      readonly payload?: Record<string, unknown>;
    }[];
  };
  readonly now: Date;
}): Promise<void> {
  const worker = workerConfiguration();
  if (!worker) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(worker.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${worker.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        runId: input.runId,
        videoId: input.video.id,
        r2ObjectKey: input.video.r2ObjectKey ?? undefined,
        muxAssetId: input.video.muxAssetId ?? undefined,
        visionSessionId: input.visionSessionId,
        court: input.court,
        visionSetup: input.visionSetup,
        callbackPath: "/api/video/analysis",
      }),
      signal: controller.signal,
    });
    if (response.ok || response.status === 202) {
      await getDatabase()
        .update(videoAnalysisRuns)
        .set({
          status: "processing",
          startedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(videoAnalysisRuns.id, input.runId));
    }
  } catch {
    // A queued run remains durable and retryable. The client never receives an
    // invented processing state merely because a network call was attempted.
  } finally {
    clearTimeout(timeout);
  }
}

async function audit(input: {
  readonly actor: ApiActor;
  readonly action: string;
  readonly entityId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  await getDatabase().insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: input.action,
    entityType: "video-analysis",
    entityId: input.entityId,
    reason: input.reason,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
}

function reviewGatewayCredential(): string | undefined {
  return (
    process.env.VERCEL_AI_GATEWAY_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim()
  );
}

export function isVideoPerformanceReviewGatewayConfigured(): boolean {
  return Boolean(reviewGatewayCredential());
}

export function resolveVideoPerformanceReviewModel(): string {
  return (
    process.env.DUNA_VIDEO_REVIEW_MODEL?.trim() || DEFAULT_VIDEO_REVIEW_MODEL
  );
}

/**
 * Keep the authorization gate explicit and independently testable. The
 * request endpoint deliberately fails before it can construct derived
 * evidence or contact the gateway for a non-owner or a minor.
 */
export function assertAdultOwnerPerformanceReviewRequest(input: {
  readonly actor: Pick<ApiActor, "personId" | "ageBand">;
  readonly ownerPersonId: string | null;
}): void {
  if (input.ownerPersonId !== input.actor.personId) {
    throw new VideoAnalysisError(
      "OWNER_REQUIRED",
      "Only the video owner can request this performance review.",
    );
  }
  if (input.actor.ageBand !== "adult") {
    throw new VideoAnalysisError(
      "ADULT_REQUIRED",
      "An adult video owner must request an AI performance review.",
    );
  }
}

function reviewGatewayOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as {
    output_text?: unknown;
    output?: readonly {
      content?: readonly { type?: unknown; text?: unknown }[];
    }[];
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

const videoPerformanceReviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "headline",
          "guidance",
          "evidence",
          "confidence",
        ],
        properties: {
          category: {
            type: "string",
            enum: [
              "hitting",
              "passing",
              "setting",
              "serving",
              "movement",
              "strategy",
            ],
          },
          headline: { type: "string", minLength: 1, maxLength: 180 },
          guidance: { type: "string", minLength: 1, maxLength: 1200 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 360 },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

function serializePerformanceReview(
  row: typeof videoPerformanceReviews.$inferSelect,
): VideoPerformanceReview {
  const metadata = row.providerResponseMetadata as {
    readonly fallbackReason?: unknown;
  };
  return {
    id: row.id,
    videoId: row.videoId,
    analysisRunId: row.analysisRunId,
    status: row.status as VideoPerformanceReview["status"],
    provider: "vercel-ai-gateway",
    model: row.model,
    reasoningEffort: "xhigh",
    promptVersion: row.promptVersion,
    schemaVersion: row.schemaVersion,
    evidenceSha256: row.evidenceSha256,
    recommendations: videoPerformanceRecommendationSchema
      .array()
      .parse(row.recommendations),
    fallbackReason:
      typeof metadata.fallbackReason === "string"
        ? metadata.fallbackReason
        : undefined,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

const visionImprovementProposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "question",
          "hypothesis",
          "requiredLabels",
          "evaluationSlices",
          "physicsOrRulesGap",
          "evidence",
        ],
        properties: {
          question: { type: "string", minLength: 1, maxLength: 360 },
          hypothesis: { type: "string", minLength: 1, maxLength: 720 },
          requiredLabels: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
          evaluationSlices: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
          physicsOrRulesGap: { type: "string", minLength: 1, maxLength: 720 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 360 },
          },
        },
      },
    },
  },
} as const;

function serializeVisionImprovementProposal(
  row: typeof visionImprovementProposals.$inferSelect,
  reviews: VisionImprovementProposal["reviews"] = [],
): VisionImprovementProposal {
  const metadata = row.providerResponseMetadata as {
    readonly fallbackReason?: unknown;
  };
  return {
    id: row.id,
    videoId: row.videoId,
    analysisRunId: row.analysisRunId,
    status: row.status as VisionImprovementProposal["status"],
    provider: "vercel-ai-gateway",
    model: row.model,
    reasoningEffort: "xhigh",
    promptVersion: row.promptVersion,
    schemaVersion: row.schemaVersion,
    evidenceSha256: row.evidenceSha256,
    proposals: visionImprovementProposalItemSchema.array().parse(row.proposals),
    reviews,
    fallbackReason:
      typeof metadata.fallbackReason === "string"
        ? metadata.fallbackReason
        : undefined,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

/**
 * A PII-free, derived-only record for governed model-improvement questions.
 * This deliberately excludes raw video, frames, URLs, identifiers, titles,
 * location, player identity, and any claim of single-camera 3D inference.
 */
export function buildVisionImprovementEvidence(input: {
  readonly run: Pick<
    typeof videoAnalysisRuns.$inferSelect,
    | "pipelineVersion"
    | "modelVersion"
    | "coverage"
    | "qualityGate"
    | "failureCode"
  >;
  readonly result: VideoAnalysisWorkerResult;
}) {
  const contacts = input.result.events.filter(
    (event) => event.eventType === "ball-contact",
  );
  const lowConfidence = input.result.events.filter(
    (event) => (event.confidence ?? 0) < 0.7,
  ).length;
  const unavailableContactEvidence = contacts.filter(
    (event) => event.payload.contactQuality?.evidence === "unavailable",
  ).length;
  const uncertainContacts = contacts.filter(
    (event) =>
      event.payload.contactUncertaintyMeters !== undefined &&
      event.payload.contactUncertaintyMeters > 1,
  ).length;
  const incompleteSequences = contacts.filter(
    (event) => event.payload.rallySequenceComplete !== true,
  ).length;
  const unavailableTrajectory = contacts.filter(
    (event) => event.payload.trajectory?.evidence === "unavailable",
  ).length;
  const ruleVerdicts = contacts.flatMap(
    (event) => event.payload.ruleFindings ?? [],
  );
  const ruleGaps = ruleVerdicts.filter(
    (finding) => finding.verdict === "unavailable",
  );
  return {
    evidenceVersion: "duna-vision-improvement-evidence-v1",
    allowedUse: "questions-and-evaluation-design-only",
    prohibitedActions: [
      "raw-video-ingest",
      "automatic-training",
      "automatic-calibration",
      "automatic-shadow",
      "automatic-promotion",
      "model-weight-generation",
    ],
    analysis: {
      status: input.result.status,
      pipelineVersion: input.run.pipelineVersion,
      modelVersion: input.result.modelVersion ?? input.run.modelVersion,
      coverage: input.result.coverage ?? input.run.coverage,
      qualityGate: input.result.qualityGate ?? input.run.qualityGate,
      failureCode: input.result.failureCode ?? input.run.failureCode,
    },
    derivedMetrics: {
      totalEvents: input.result.events.length,
      contactCount: contacts.length,
      lowConfidenceEventCount: lowConfidence,
      unavailableContactEvidenceCount: unavailableContactEvidence,
      uncertainContactCount: uncertainContacts,
      incompleteRallySequenceCount: incompleteSequences,
      unavailableTrajectoryCount: unavailableTrajectory,
      unavailableRuleFindingCount: ruleGaps.length,
      unavailableRuleIds: [
        ...new Set(ruleGaps.map((finding) => finding.ruleId)),
      ],
    },
    limitations: [
      "Only derived 2D calibrated-court observations are available.",
      "No raw video, image frame, identity, location, or player identifier is included.",
      "Do not infer 3D ball height or unseen actions from a single camera.",
    ],
  };
}

export function isAdultLearningConsentedVisionRun(input: {
  readonly analysisStatus: VideoAnalysisWorkerResult["status"];
  readonly visionLearningConsent: boolean;
  readonly ageBand: string;
}): boolean {
  return (
    input.visionLearningConsent &&
    input.ageBand === "adult" &&
    (input.analysisStatus === "ready" ||
      input.analysisStatus === "needs-review")
  );
}

async function enqueueVisionImprovementProposal(input: {
  readonly run: typeof videoAnalysisRuns.$inferSelect;
  readonly result: VideoAnalysisWorkerResult;
  readonly now: Date;
}): Promise<void> {
  const eligibility = await getDatabase()
    .select({
      visionLearningConsent: videos.visionLearningConsent,
      ageBand: people.ageBand,
    })
    .from(videos)
    .innerJoin(people, eq(videos.ownerPersonId, people.id))
    .where(eq(videos.id, input.run.videoId))
    .limit(1)
    .then((rows) => rows[0]);
  if (
    !eligibility ||
    !isAdultLearningConsentedVisionRun({
      analysisStatus: input.result.status,
      visionLearningConsent: eligibility.visionLearningConsent,
      ageBand: eligibility.ageBand,
    })
  ) {
    return;
  }
  const evidence = buildVisionImprovementEvidence({
    run: input.run,
    result: input.result,
  });
  const evidenceSha256 = createHash("sha256")
    .update(JSON.stringify(evidence))
    .digest("hex");
  await getDatabase()
    .insert(visionImprovementProposals)
    .values({
      id: randomUUID(),
      videoId: input.run.videoId,
      analysisRunId: input.run.id,
      status: "queued",
      provider: "vercel-ai-gateway",
      model: resolveVideoPerformanceReviewModel(),
      reasoningEffort: "xhigh",
      privacySafetyIdentifier: `duna-vision-improvement-${evidenceSha256.slice(0, 40)}`,
      promptVersion: VISION_IMPROVEMENT_PROMPT_VERSION,
      schemaVersion: VISION_IMPROVEMENT_SCHEMA_VERSION,
      evidenceSha256,
      evidence,
      providerResponseMetadata: {
        inputKind: "derived-metrics-errors-uncertainty-rule-gaps-only",
        rawVideoIncluded: false,
        automaticTrainingOrPromotionAllowed: false,
      },
      proposals: [],
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: visionImprovementProposals.analysisRunId });
}

/** Bounded processor for a cron or explicitly authorized admin invocation. */
export async function processQueuedVisionImprovementProposals(input: {
  readonly limit: number;
  readonly now: Date;
  readonly requestId: string;
  readonly ipAddress?: string;
}): Promise<{ readonly processed: number; readonly succeeded: number }> {
  requireDatabase();
  const database = getDatabase();
  // A function timeout or platform restart must not strand an otherwise safe
  // evidence-only proposal in processing forever.
  const staleBefore = new Date(input.now.getTime() - 20 * 60 * 1_000);
  await database
    .update(visionImprovementProposals)
    .set({ status: "queued", updatedAt: input.now })
    .where(
      and(
        eq(visionImprovementProposals.status, "processing"),
        lt(visionImprovementProposals.updatedAt, staleBefore),
      ),
    );
  const candidates = await database
    .select()
    .from(visionImprovementProposals)
    .where(eq(visionImprovementProposals.status, "queued"))
    .orderBy(asc(visionImprovementProposals.createdAt))
    .limit(Math.max(1, Math.min(input.limit, 20)));
  let processed = 0;
  let succeeded = 0;
  for (const candidate of candidates) {
    const claimed = await database
      .update(visionImprovementProposals)
      .set({
        status: "processing",
        attemptCount: sql`${visionImprovementProposals.attemptCount} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(visionImprovementProposals.id, candidate.id),
          eq(visionImprovementProposals.status, "queued"),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
    if (!claimed) continue;
    processed += 1;
    // Consent and age are checked again at send time. A queued record is not
    // permission to continue after an owner revokes learning consent.
    const currentEligibility = await database
      .select({
        visionLearningConsent: videos.visionLearningConsent,
        ageBand: people.ageBand,
      })
      .from(videos)
      .innerJoin(people, eq(videos.ownerPersonId, people.id))
      .where(eq(videos.id, claimed.videoId))
      .limit(1)
      .then((rows) => rows[0]);
    if (
      !currentEligibility ||
      !currentEligibility.visionLearningConsent ||
      currentEligibility.ageBand !== "adult"
    ) {
      await database
        .update(visionImprovementProposals)
        .set({
          status: "unavailable",
          failureCode: "LEARNING_CONSENT_REVOKED",
          providerResponseMetadata: {
            fallbackReason:
              "Adult learning consent is no longer active; no evidence was sent.",
            rawVideoIncluded: false,
          },
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(visionImprovementProposals.id, claimed.id));
      continue;
    }
    const credential = reviewGatewayCredential();
    if (!credential) {
      await database
        .update(visionImprovementProposals)
        .set({
          status: "unavailable",
          failureCode: "AI_GATEWAY_UNAVAILABLE",
          providerResponseMetadata: {
            fallbackReason: "Vercel AI Gateway is not configured.",
            rawVideoIncluded: false,
          },
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(visionImprovementProposals.id, claimed.id));
      continue;
    }
    try {
      const response = await fetch(
        "https://ai-gateway.vercel.sh/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: claimed.model,
            store: false,
            reasoning: { effort: "xhigh" },
            safety_identifier: claimed.privacySafetyIdentifier,
            input: [
              {
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text: "You produce governed Vision-improvement proposals from derived beach-volleyball evidence only. Return questions, falsifiable hypotheses, label requirements, evaluation slices, and explicit physics or rules gaps. Never request or use raw video, frames, identity, location, or player identifiers. Do not infer unseen actions or 3D height from a single camera. Never propose model weights, training execution, calibration, shadow deployment, promotion, or automatic activation. Every proposal remains a human-reviewed research draft.",
                  },
                ],
              },
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: JSON.stringify(claimed.evidence),
                  },
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "duna_vision_improvement_proposal",
                strict: true,
                schema: visionImprovementProposalJsonSchema,
              },
            },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) {
        throw new Error(`Vercel AI Gateway returned HTTP ${response.status}.`);
      }
      const providerPayload = (await response.json()) as {
        id?: unknown;
        model?: unknown;
        output_text?: unknown;
        output?: unknown;
      };
      const output = reviewGatewayOutputText(providerPayload);
      if (!output) {
        throw new Error("Vercel AI Gateway returned no structured proposal.");
      }
      const proposals = visionImprovementProposalItemSchema
        .array()
        .max(6)
        .parse((JSON.parse(output) as { proposals?: unknown }).proposals);
      await database
        .update(visionImprovementProposals)
        .set({
          status: "succeeded",
          providerResponseMetadata: {
            providerResponseId:
              typeof providerPayload.id === "string"
                ? providerPayload.id
                : undefined,
            providerModel:
              typeof providerPayload.model === "string"
                ? providerPayload.model
                : claimed.model,
            rawVideoIncluded: false,
            automaticTrainingOrPromotionAllowed: false,
          },
          proposals,
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(visionImprovementProposals.id, claimed.id));
      succeeded += 1;
      await database.insert(auditLog).values({
        actorType: "system",
        action: "vision-improvement-proposal.completed",
        entityType: "vision-improvement-proposal",
        entityId: claimed.id,
        reason:
          "Stored governed improvement questions only; no training, calibration, shadow, or promotion occurred.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
    } catch (error) {
      const fallbackReason =
        error instanceof Error
          ? error.message.slice(0, 240)
          : "AI Gateway proposal processing failed.";
      await database
        .update(visionImprovementProposals)
        .set({
          status: claimed.attemptCount >= 3 ? "unavailable" : "queued",
          failureCode:
            claimed.attemptCount >= 3 ? "AI_GATEWAY_UNAVAILABLE" : undefined,
          providerResponseMetadata: {
            fallbackReason,
            rawVideoIncluded: false,
            retryable: claimed.attemptCount < 3,
          },
          completedAt: claimed.attemptCount >= 3 ? input.now : undefined,
          updatedAt: input.now,
        })
        .where(eq(visionImprovementProposals.id, claimed.id));
      await database.insert(auditLog).values({
        actorType: "system",
        action: "vision-improvement-proposal.unavailable",
        entityType: "vision-improvement-proposal",
        entityId: claimed.id,
        reason: `Governed improvement proposal unavailable: ${fallbackReason}`,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
    }
  }
  return { processed, succeeded };
}

export async function loadVisionImprovementProposalQueue(): Promise<{
  readonly proposals: readonly VisionImprovementProposal[];
}> {
  requireDatabase();
  const database = getDatabase();
  const rows = await database
    .select()
    .from(visionImprovementProposals)
    .orderBy(desc(visionImprovementProposals.createdAt))
    .limit(100);
  const reviewRows = rows.length
    ? await database
        .select({
          review: visionImprovementProposalReviews,
          reviewerName: people.displayName,
        })
        .from(visionImprovementProposalReviews)
        .innerJoin(
          people,
          eq(visionImprovementProposalReviews.reviewerPersonId, people.id),
        )
        .where(
          inArray(
            visionImprovementProposalReviews.proposalId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(
          asc(visionImprovementProposalReviews.createdAt),
          asc(visionImprovementProposalReviews.id),
        )
    : [];
  const reviewsByProposal = new Map<
    string,
    Array<VisionImprovementProposal["reviews"][number]>
  >();
  for (const { review, reviewerName } of reviewRows) {
    const reviews = reviewsByProposal.get(review.proposalId) ?? [];
    reviews.push({
      id: review.id,
      reviewerPersonId: review.reviewerPersonId,
      reviewerName,
      decision: review.decision as "approved" | "rejected",
      notes: review.notes,
      reviewedAt: review.createdAt.toISOString(),
    });
    reviewsByProposal.set(review.proposalId, reviews);
  }
  return {
    proposals: rows.map((row) =>
      serializeVisionImprovementProposal(
        row,
        reviewsByProposal.get(row.id) ?? [],
      ),
    ),
  };
}

export async function reviewVisionImprovementProposal(input: {
  readonly actor: ApiActor;
  readonly proposalId: string;
  readonly decision: "approved" | "rejected";
  readonly notes: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly decision: "approved" | "rejected";
}> {
  requireDatabase();
  const proposal =
    await getDatabase().query.visionImprovementProposals.findFirst({
      where: eq(visionImprovementProposals.id, input.proposalId),
    });
  if (!proposal || proposal.status !== "succeeded") {
    throw new VideoAnalysisError(
      "ANALYSIS_NOT_READY",
      "Only completed Vision improvement proposals can be reviewed.",
    );
  }
  const [review] = await getDatabase()
    .insert(visionImprovementProposalReviews)
    .values({
      id: randomUUID(),
      proposalId: proposal.id,
      reviewerPersonId: input.actor.personId,
      decision: input.decision,
      notes: input.notes,
      createdAt: input.now,
    })
    .returning({ id: visionImprovementProposalReviews.id });
  await getDatabase()
    .insert(auditLog)
    .values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "vision-improvement-proposal.reviewed",
      entityType: "vision-improvement-proposal",
      entityId: proposal.id,
      reason: `Super Admin ${input.decision} a research proposal; no training or promotion occurred.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  return { id: review!.id, decision: input.decision };
}

function reviewEvidence(input: {
  readonly report: VideoAnalysisReport;
  readonly run: typeof videoAnalysisRuns.$inferSelect;
}) {
  // No raw video, URLs, owner identity, player IDs, title, location, or image
  // frames cross this boundary. The model receives only auditable derived
  // observations that Duna already renders to the owning adult.
  return {
    evidenceVersion: "duna-video-performance-evidence-v1",
    analysis: {
      status: input.run.status,
      pipelineVersion: input.run.pipelineVersion,
      modelVersion: input.run.modelVersion,
      coverage: input.run.coverage,
      qualityGate: input.run.qualityGate
        ? {
            decision: input.run.qualityGate.decision,
            productionEligible: input.run.qualityGate.productionEligible,
            failedChecks: input.run.qualityGate.failedChecks,
          }
        : undefined,
    },
    score: input.report.score,
    performance: input.report.performance,
    rules: input.report.ruleFindings,
    heatmap: {
      observedCount: input.report.heatmap.observedCount,
      summary: input.report.heatmap.summary,
    },
    evidenceLimitations: {
      sourceVideoAvailable: input.report.evidence.sourceVideoAvailable,
      scoreTimelineAvailable: input.report.evidence.scoreTimelineAvailable,
      disclaimer:
        "Only 2D calibrated-court observations are included. No single-camera 3D height or unobserved player action is available.",
    },
  };
}

export async function requestOwnerVideoPerformanceReview(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoPerformanceReview> {
  requireDatabase();
  const video = await getDatabase().query.videos.findFirst({
    where: eq(videos.id, input.videoId),
  });
  if (!video) {
    throw new VideoAnalysisError("VIDEO_NOT_FOUND", "Video not found.");
  }
  assertAdultOwnerPerformanceReviewRequest({
    actor: input.actor,
    ownerPersonId: video.ownerPersonId,
  });
  const run = await getDatabase()
    .select()
    .from(videoAnalysisRuns)
    .where(
      and(
        eq(videoAnalysisRuns.videoId, video.id),
        inArray(videoAnalysisRuns.status, ["ready", "needs-review"]),
      ),
    )
    .orderBy(desc(videoAnalysisRuns.completedAt))
    .limit(1)
    .then((rows) => rows[0]);
  if (!run) {
    throw new VideoAnalysisError(
      "ANALYSIS_NOT_READY",
      "Finish a ready or needs-review Vision analysis before requesting a performance review.",
    );
  }

  const report = await loadVideoAnalysisReport({
    actor: input.actor,
    videoId: video.id,
  });
  const evidence = reviewEvidence({ report, run });
  const evidenceSha256 = createHash("sha256")
    .update(JSON.stringify(evidence))
    .digest("hex");
  const model = resolveVideoPerformanceReviewModel();
  const privacySafetyIdentifier = `duna-video-review-${evidenceSha256.slice(0, 40)}`;
  const reviewId = randomUUID();
  const database = getDatabase();
  await database.insert(videoPerformanceReviews).values({
    id: reviewId,
    videoId: video.id,
    analysisRunId: run.id,
    requestedByPersonId: input.actor.personId,
    status: "processing",
    provider: "vercel-ai-gateway",
    model,
    reasoningEffort: "xhigh",
    privacySafetyIdentifier,
    promptVersion: VIDEO_REVIEW_PROMPT_VERSION,
    schemaVersion: VIDEO_REVIEW_SCHEMA_VERSION,
    evidenceSha256,
    providerResponseMetadata: {
      inputKind: "derived-analysis-evidence-only",
      rawVideoIncluded: false,
      trainingOrPromotionAllowed: false,
    },
    recommendations: [],
    createdAt: input.now,
    updatedAt: input.now,
  });
  await audit({
    actor: input.actor,
    action: "video-performance-review.requested",
    entityId: reviewId,
    reason:
      "Adult owner explicitly requested an evidence-only performance review; raw video and training/promotion are excluded.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });

  const credential = reviewGatewayCredential();
  if (!credential) {
    const row = await database
      .update(videoPerformanceReviews)
      .set({
        status: "unavailable",
        failureCode: "AI_GATEWAY_UNAVAILABLE",
        providerResponseMetadata: {
          fallbackReason: "Vercel AI Gateway is not configured.",
          rawVideoIncluded: false,
        },
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(videoPerformanceReviews.id, reviewId))
      .returning()
      .then((rows) => rows[0]);
    if (!row)
      throw new VideoAnalysisError("VIDEO_NOT_FOUND", "Review not found.");
    return serializePerformanceReview(row);
  }

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "xhigh" },
        safety_identifier: privacySafetyIdentifier,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You produce an adult owner's evidence-only beach-volleyball performance review. Use only the supplied derived evidence. Do not infer unseen actions, player identity, medical claims, biomechanics, 3D ball height, or facts from raw video. Treat unavailable evidence as unavailable. Recommendations are drafts for owner review only. Never propose or perform data training, model calibration, model promotion, or automatic publication.",
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify(evidence) }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "duna_video_performance_review",
            strict: true,
            schema: videoPerformanceReviewJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Vercel AI Gateway returned HTTP ${response.status}.`);
    const providerPayload = (await response.json()) as {
      id?: unknown;
      model?: unknown;
      output_text?: unknown;
      output?: unknown;
    };
    const output = reviewGatewayOutputText(providerPayload);
    if (!output)
      throw new Error("Vercel AI Gateway returned no structured review.");
    const parsed = videoPerformanceRecommendationSchema
      .array()
      .max(6)
      .parse(
        (JSON.parse(output) as { recommendations?: unknown }).recommendations,
      );
    const row = await database
      .update(videoPerformanceReviews)
      .set({
        status: "succeeded",
        providerResponseMetadata: {
          providerResponseId:
            typeof providerPayload.id === "string"
              ? providerPayload.id
              : undefined,
          providerModel:
            typeof providerPayload.model === "string"
              ? providerPayload.model
              : model,
          rawVideoIncluded: false,
        },
        recommendations: parsed,
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(videoPerformanceReviews.id, reviewId))
      .returning()
      .then((rows) => rows[0]);
    if (!row)
      throw new VideoAnalysisError("VIDEO_NOT_FOUND", "Review not found.");
    if (parsed.length > 0) {
      await database.insert(videoInsights).values(
        parsed.map((recommendation) => ({
          videoId: video.id,
          playerPersonId: input.actor.personId,
          category: recommendation.category,
          headline: recommendation.headline,
          guidance: recommendation.guidance,
          evidence: {
            reviewId,
            evidenceSha256,
            evidence: recommendation.evidence,
          },
          confidence: recommendation.confidence,
          modelVersion: model,
          createdByType: "model",
          status: "draft",
          createdAt: input.now,
          updatedAt: input.now,
        })),
      );
    }
    await audit({
      actor: input.actor,
      action: "video-performance-review.completed",
      entityId: reviewId,
      reason: `Created ${parsed.length} draft evidence-only performance insights.`,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    return serializePerformanceReview(row);
  } catch (error) {
    const fallbackReason =
      error instanceof Error
        ? error.message.slice(0, 240)
        : "AI Gateway review failed.";
    const row = await database
      .update(videoPerformanceReviews)
      .set({
        status: "unavailable",
        failureCode: "AI_GATEWAY_UNAVAILABLE",
        providerResponseMetadata: { fallbackReason, rawVideoIncluded: false },
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(videoPerformanceReviews.id, reviewId))
      .returning()
      .then((rows) => rows[0]);
    if (!row)
      throw new VideoAnalysisError("VIDEO_NOT_FOUND", "Review not found.");
    await audit({
      actor: input.actor,
      action: "video-performance-review.unavailable",
      entityId: reviewId,
      reason: `Evidence-only review unavailable: ${fallbackReason}`,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    return serializePerformanceReview(row);
  }
}

export async function loadVideoAnalysisReport(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
}): Promise<VideoAnalysisReport> {
  requireDatabase();
  const video = await authorizedVideo(input);
  const database = getDatabase();
  const session = await database.query.visionSessions.findFirst({
    where: eq(visionSessions.videoId, video.id),
  });
  const [runs, events, reviews, timeline] = await Promise.all([
    database
      .select()
      .from(videoAnalysisRuns)
      .where(eq(videoAnalysisRuns.videoId, video.id))
      .orderBy(desc(videoAnalysisRuns.createdAt))
      .limit(1),
    database
      .select()
      .from(videoAnalysisEvents)
      .where(eq(videoAnalysisEvents.videoId, video.id))
      .orderBy(asc(videoAnalysisEvents.sessionTimeUs)),
    database
      .select()
      .from(videoAnalysisReviews)
      .where(eq(videoAnalysisReviews.videoId, video.id))
      .orderBy(desc(videoAnalysisReviews.updatedAt)),
    session
      ? database
          .select()
          .from(visionTimelineEvents)
          .where(eq(visionTimelineEvents.sessionId, session.id))
          .orderBy(asc(visionTimelineEvents.elapsedMs))
      : Promise.resolve([]),
  ]);
  const { court, dimensions } = asCourtDimensions({ video, session });
  const reviewByEvent = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    if (!reviewByEvent.has(review.eventId)) {
      reviewByEvent.set(review.eventId, review);
    }
  }
  const latestRun = runs[0];
  const resolvedEvents = events
    .filter(
      (row) =>
        row.source !== "model" || !latestRun || row.runId === latestRun.id,
    )
    .map((row) => {
      const review = reviewByEvent.get(row.id);
      const correction = review?.correction as
        { readonly courtPoint?: typeof row.courtPoint } | undefined;
      return {
        event: serializeEvent(row),
        courtPoint: correction?.courtPoint ?? row.courtPoint,
        rejected: row.state === "rejected" || review?.decision === "rejected",
        reviewed: Boolean(review),
        source:
          review?.decision === "confirmed" || review?.decision === "corrected"
            ? "human"
            : analysisSource(row.source),
      } as const;
    });
  const heatmap = buildCourtHeatmap({
    court: dimensions,
    observations: resolvedEvents
      .filter(
        (entry) =>
          !entry.rejected &&
          entry.event.eventType === "ball-landing" &&
          entry.courtPoint,
      )
      .map((entry) => ({
        ...entry.courtPoint!,
        confidence: entry.event.confidence,
        source: entry.source as "human" | "model" | "watch" | "system",
      })),
  });
  const performance = buildVolleyballPerformance(
    resolvedEvents
      .filter((entry) => !entry.rejected)
      .map((entry) => ({
        eventType: entry.event.eventType,
        sessionTimeUs: entry.event.sessionTimeUs,
        durationUs: entry.event.durationUs,
        confidence: entry.event.confidence,
        source: entry.source,
        payload: entry.event.payload,
      })),
  );
  const ruleFindings = evaluateBeachVolleyballRules(
    resolvedEvents
      .filter((entry) => !entry.rejected)
      .map((entry) => ({
        eventType: entry.event.eventType,
        sessionTimeUs: entry.event.sessionTimeUs,
        durationUs: entry.event.durationUs,
        confidence: entry.event.confidence,
        source: entry.source,
        payload: entry.event.payload,
      })),
  );
  const undone = new Set(
    timeline
      .filter((event) => event.type === "undo" && event.targetEventId)
      .map((event) => event.targetEventId!),
  );
  const scoredRallies = timeline.filter(
    (event) => event.type === "rally-won" && !undone.has(event.id),
  ).length;
  const persistedHighlights = resolvedEvents
    .filter((entry) => !entry.rejected && entry.event.eventType === "highlight")
    .map((entry) => ({
      id: entry.event.id,
      sessionTimeUs: entry.event.sessionTimeUs,
      durationUs: entry.event.durationUs,
      label: String(entry.event.payload.label ?? "Marked highlight"),
      source: entry.source as "human" | "model" | "watch" | "system",
      confidence: confidenceBand(
        entry.event.confidence,
        entry.source as VideoAnalysisEvent["source"],
      ),
    }));
  const reviewQueue: VideoAnalysisReport["reviewQueue"][number][] = [
    ...timeline
      .filter((event) => event.type === "review-marker")
      .map((event) => ({
        id: event.id,
        sessionTimeUs: event.elapsedMs * 1_000,
        label: event.label ?? "Watch asked to review this rally",
        source:
          event.source === "apple-watch"
            ? ("watch" as const)
            : ("system" as const),
        reviewable: false,
      })),
    ...resolvedEvents
      .filter(
        (entry) => !entry.rejected && entry.event.eventType === "review-marker",
      )
      .map((entry) => ({
        id: entry.event.id,
        sessionTimeUs: entry.event.sessionTimeUs,
        label: String(entry.event.payload.label ?? "Review this rally"),
        source: entry.source as "human" | "model" | "watch" | "system",
        reviewable: entry.event.source === "model",
        eventType: entry.event.eventType,
        contactKind: entry.event.payload.contactKind,
        confidence: entry.event.confidence,
      })),
    ...resolvedEvents
      .filter(
        (entry) =>
          !entry.rejected &&
          !entry.reviewed &&
          entry.source === "model" &&
          (entry.event.confidence === undefined ||
            entry.event.confidence < 0.7) &&
          entry.event.eventType !== "review-marker",
      )
      .slice(0, 50)
      .map((entry) => ({
        id: entry.event.id,
        sessionTimeUs: entry.event.sessionTimeUs,
        label:
          entry.event.eventType === "ball-contact"
            ? `Review ${entry.event.payload.contactKind ?? "volleyball contact"}${entry.event.payload.outcome ? ` · ${entry.event.payload.outcome}` : ""}`
            : `Review ${entry.event.eventType.replaceAll("-", " ")}`,
        source: "model" as const,
        reviewable: true,
        eventType: entry.event.eventType,
        contactKind: entry.event.payload.contactKind,
        confidence: entry.event.confidence,
      })),
  ].sort((left, right) => left.sessionTimeUs - right.sessionTimeUs);

  return {
    videoId: video.id,
    run: runs[0] ? serializeRun(runs[0]) : undefined,
    court,
    heatmap,
    score: {
      scoredRallies,
      favoriteMoments: timeline.filter((event) => event.type === "favorite")
        .length,
      lastSnapshot: latestScore(timeline),
    },
    performance,
    ruleFindings,
    highlights: [
      ...liveTimelineHighlights(timeline),
      ...persistedHighlights,
    ].sort((left, right) => left.sessionTimeUs - right.sessionTimeUs),
    reviewQueue,
    evidence: {
      sourceVideoAvailable: sourceVideoAvailable(video),
      scoreTimelineAvailable: Boolean(session),
      trainingEligible: video.visionLearningConsent,
      disclaimer:
        "Court positions appear only when they are visible in the calibrated court. Human review outranks model output; empty areas are unknown, not zero activity.",
    },
  };
}

export async function requestVideoAnalysis(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoAnalysisRun> {
  requireDatabase();
  const video = await authorizedVideo({ ...input, write: true });
  const database = getDatabase();
  const active = await database
    .select()
    .from(videoAnalysisRuns)
    .where(
      and(
        eq(videoAnalysisRuns.videoId, video.id),
        inArray(videoAnalysisRuns.status, ACTIVE_RUN_STATUSES),
      ),
    )
    .orderBy(desc(videoAnalysisRuns.createdAt))
    .limit(1);

  const session = await database.query.visionSessions.findFirst({
    where: eq(visionSessions.videoId, video.id),
  });
  const setupTimeline = session
    ? await database
        .select({
          type: visionTimelineEvents.type,
          elapsedMs: visionTimelineEvents.elapsedMs,
          label: visionTimelineEvents.label,
          payload: visionTimelineEvents.payload,
        })
        .from(visionTimelineEvents)
        .where(eq(visionTimelineEvents.sessionId, session.id))
        .orderBy(asc(visionTimelineEvents.elapsedMs))
    : [];
  const { court } = asCourtDimensions({ video, session });
  const activeRun = active[0];
  if (activeRun) {
    const staleProcessing =
      activeRun.status === "processing" &&
      input.now.getTime() - activeRun.updatedAt.getTime() > 2 * 60 * 60 * 1_000;
    if (activeRun.status === "queued" || staleProcessing) {
      if (staleProcessing) {
        await database
          .update(videoAnalysisRuns)
          .set({ status: "queued", startedAt: null, updatedAt: input.now })
          .where(eq(videoAnalysisRuns.id, activeRun.id));
      }
      await dispatchAnalysisRun({
        runId: activeRun.id,
        video,
        court,
        visionSessionId: session?.id,
        visionSetup: session
          ? {
              settings: session.settings,
              previewJpegBase64: session.previewJpegBase64 ?? undefined,
              previewCapturedAt: session.previewCapturedAt?.toISOString(),
              timeline: setupTimeline.map((event) => ({
                type: event.type,
                elapsedMs: event.elapsedMs,
                label: event.label ?? undefined,
                payload: event.payload ?? undefined,
              })),
            }
          : undefined,
        now: input.now,
      });
    }
    const refreshed = await database.query.videoAnalysisRuns.findFirst({
      where: eq(videoAnalysisRuns.id, activeRun.id),
    });
    return serializeRun(refreshed ?? activeRun);
  }
  const id = randomUUID();
  const coverage = {
    sampledDurationUs: video.durationSeconds
      ? video.durationSeconds * 1_000_000
      : undefined,
    sourceVideoAvailable: sourceVideoAvailable(video),
    scoreTimelineAvailable: Boolean(session),
  };
  await database.insert(videoAnalysisRuns).values({
    id,
    videoId: video.id,
    visionSessionId: session?.id,
    requestedByPersonId: input.actor.personId,
    status: "queued",
    pipelineVersion: ANALYSIS_PIPELINE_VERSION,
    courtMap: court,
    coverage,
    createdAt: input.now,
    updatedAt: input.now,
  });
  await audit({
    actor: input.actor,
    action: "video-analysis.requested",
    entityId: id,
    reason: "Requested an evidence-backed Duna Vision analysis run.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  await dispatchAnalysisRun({
    runId: id,
    video,
    court,
    visionSessionId: session?.id,
    visionSetup: session
      ? {
          settings: session.settings,
          previewJpegBase64: session.previewJpegBase64 ?? undefined,
          previewCapturedAt: session.previewCapturedAt?.toISOString(),
          timeline: setupTimeline.map((event) => ({
            type: event.type,
            elapsedMs: event.elapsedMs,
            label: event.label ?? undefined,
            payload: event.payload ?? undefined,
          })),
        }
      : undefined,
    now: input.now,
  });
  const created = await database.query.videoAnalysisRuns.findFirst({
    where: eq(videoAnalysisRuns.id, id),
  });
  if (!created) {
    throw new VideoAnalysisError(
      "VIDEO_NOT_FOUND",
      "The analysis run could not be loaded.",
    );
  }
  return serializeRun(created);
}

export async function createVideoAnalysisMarker(input: {
  readonly actor: ApiActor;
  readonly marker: VideoAnalysisMarkerInput;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoAnalysisReport> {
  requireDatabase();
  const video = await authorizedVideo({
    actor: input.actor,
    videoId: input.marker.videoId,
    write: true,
  });
  const database = getDatabase();
  const [session, latestRun] = await Promise.all([
    database.query.visionSessions.findFirst({
      where: eq(visionSessions.videoId, video.id),
    }),
    database
      .select()
      .from(videoAnalysisRuns)
      .where(eq(videoAnalysisRuns.videoId, video.id))
      .orderBy(desc(videoAnalysisRuns.createdAt))
      .limit(1),
  ]);
  const id = randomUUID();
  await database.insert(videoAnalysisEvents).values({
    id,
    runId: latestRun[0]?.id,
    videoId: video.id,
    visionSessionId: session?.id,
    eventType: input.marker.eventType,
    source: "human",
    state: "confirmed",
    sessionTimeUs: input.marker.sessionTimeUs,
    courtPoint: input.marker.courtPoint,
    payload: {
      label: input.marker.label,
      captureMethod: "player-manual-marker",
      idempotencyKey: input.marker.idempotencyKey,
    },
    createdByPersonId: input.actor.personId,
    createdAt: input.now,
  });
  await audit({
    actor: input.actor,
    action: "video-analysis.marker-created",
    entityId: id,
    reason: `Recorded a human ${input.marker.eventType} marker.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return loadVideoAnalysisReport({ actor: input.actor, videoId: video.id });
}

export async function reviewVideoAnalysisEvent(input: {
  readonly actor: ApiActor;
  readonly videoId: string;
  readonly eventId: string;
  readonly decision: "confirmed" | "corrected" | "rejected";
  readonly correction?: Record<string, unknown>;
  readonly note?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoAnalysisReport> {
  requireDatabase();
  const video = await authorizedVideo({
    actor: input.actor,
    videoId: input.videoId,
    write: true,
  });
  const event = await getDatabase().query.videoAnalysisEvents.findFirst({
    where: eq(videoAnalysisEvents.id, input.eventId),
  });
  if (!event) {
    throw new VideoAnalysisError(
      "ANALYSIS_EVENT_NOT_FOUND",
      "Analysis event not found.",
    );
  }
  if (event.videoId !== video.id) {
    throw new VideoAnalysisError(
      "ANALYSIS_EVENT_WRONG_VIDEO",
      "That analysis event belongs to another video.",
    );
  }
  if (input.decision === "corrected" && !input.correction) {
    throw new VideoAnalysisError(
      "INVALID_REVIEW",
      "A corrected result needs a correction payload.",
    );
  }
  await getDatabase()
    .insert(videoAnalysisReviews)
    .values({
      videoId: video.id,
      eventId: event.id,
      reviewerPersonId: input.actor.personId,
      decision: input.decision,
      correction: input.correction,
      note: input.note,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [
        videoAnalysisReviews.eventId,
        videoAnalysisReviews.reviewerPersonId,
      ],
      set: {
        decision: input.decision,
        correction: input.correction,
        note: input.note,
        updatedAt: input.now,
      },
    });
  await audit({
    actor: input.actor,
    action: "video-analysis.reviewed",
    entityId: event.id,
    reason: `Human review marked the event ${input.decision}.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return loadVideoAnalysisReport({ actor: input.actor, videoId: video.id });
}

export async function ingestVideoAnalysisWorkerResult(input: {
  readonly result: VideoAnalysisWorkerResult;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VideoAnalysisRun> {
  requireDatabase();
  const database = getDatabase();
  const run = await database.query.videoAnalysisRuns.findFirst({
    where: eq(videoAnalysisRuns.id, input.result.runId),
  });
  if (!run) {
    throw new VideoAnalysisError("VIDEO_NOT_FOUND", "Analysis run not found.");
  }
  if (["ready", "needs-review", "failed", "cancelled"].includes(run.status)) {
    if (run.status === "ready" || run.status === "needs-review") {
      // A worker retry also repairs a rare post-completion queue write loss.
      // The unique run constraint keeps this exactly once.
      await enqueueVisionImprovementProposal({
        run,
        result: input.result,
        now: input.now,
      });
    }
    return serializeRun(run);
  }
  if (
    input.result.artifactR2Key &&
    !input.result.artifactR2Key.startsWith(`video-analysis/${run.videoId}/`)
  ) {
    throw new VideoAnalysisError(
      "INVALID_REVIEW",
      "Analysis artifacts must remain inside the video analysis prefix.",
    );
  }
  if (input.result.status === "failed" && !input.result.failureCode) {
    throw new VideoAnalysisError(
      "INVALID_REVIEW",
      "A failed analysis result needs a failure code.",
    );
  }
  const court = run.courtMap;
  for (const event of input.result.events) {
    const point = event.courtPoint;
    if (
      point?.observed === "visible" &&
      court &&
      (point.xMeters > court.widthMeters || point.yMeters > court.lengthMeters)
    ) {
      throw new VideoAnalysisError(
        "INVALID_REVIEW",
        "Visible model coordinates must remain inside the calibrated court.",
      );
    }
  }
  const rows = input.result.events.map((event) => ({
    id: event.id,
    runId: run.id,
    videoId: run.videoId,
    visionSessionId: run.visionSessionId,
    eventType: event.eventType,
    source: "model" as const,
    state: "proposed" as const,
    sessionTimeUs: event.sessionTimeUs,
    durationUs: event.durationUs,
    confidence: event.confidence,
    courtPoint: event.courtPoint,
    payload: event.payload,
    modelVersion: input.result.modelVersion,
    createdAt: input.now,
  }));
  for (let offset = 0; offset < rows.length; offset += 1_000) {
    const batch = rows.slice(offset, offset + 1_000);
    if (batch.length === 0) continue;
    await database
      .insert(videoAnalysisEvents)
      .values(batch)
      .onConflictDoNothing({ target: videoAnalysisEvents.id });
  }
  await database
    .update(videoAnalysisRuns)
    .set({
      status: input.result.status,
      modelVersion: input.result.modelVersion,
      artifactR2Key: input.result.artifactR2Key,
      failureCode: input.result.failureCode,
      coverage: input.result.coverage,
      qualityGate: input.result.qualityGate,
      startedAt: run.startedAt ?? input.now,
      completedAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(videoAnalysisRuns.id, run.id));
  await database.insert(auditLog).values({
    actorType: "provider",
    action: "video-analysis.worker-result",
    entityType: "video-analysis",
    entityId: run.id,
    reason: `Accepted ${input.result.events.length} model observations with status ${input.result.status}.`,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  const updated = await database.query.videoAnalysisRuns.findFirst({
    where: eq(videoAnalysisRuns.id, run.id),
  });
  if (!updated) {
    throw new VideoAnalysisError(
      "VIDEO_NOT_FOUND",
      "Analysis result could not be loaded.",
    );
  }
  if (updated.status === "ready" || updated.status === "needs-review") {
    await enqueueVisionImprovementProposal({
      run: updated,
      result: input.result,
      now: input.now,
    });
  }
  return serializeRun(updated);
}
