import { randomUUID } from "node:crypto";
import {
  getDatabase,
  videoAnalysisEvents,
  videoAnalysisReviews,
  videoAnalysisRuns,
  videos,
  visionSessions,
  visionTimelineEvents,
  auditLog,
} from "@duna/db";
import {
  STANDARD_BEACH_COURT,
  buildCourtHeatmap,
  buildVolleyballPerformance,
  confidenceBand,
  type CourtDimensions,
} from "@duna/core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { ApiActor } from "./context";
import type {
  VideoAnalysisEvent,
  VideoAnalysisMarkerInput,
  VideoAnalysisReport,
  VideoAnalysisRun,
  VideoAnalysisWorkerResult,
  VisionScoreSnapshot,
} from "./contracts";

const ANALYSIS_PIPELINE_VERSION = "duna-vision-event-graph-v1";
const ACTIVE_RUN_STATUSES = ["queued", "processing"] as const;

export class VideoAnalysisError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "VIDEO_NOT_FOUND"
      | "ANALYSIS_EVENT_NOT_FOUND"
      | "ANALYSIS_EVENT_WRONG_VIDEO"
      | "ANALYSIS_NOT_ALLOWED"
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
  if (active[0]) return serializeRun(active[0]);

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
  return serializeRun(updated);
}
