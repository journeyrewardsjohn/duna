import { createHash, randomUUID } from "node:crypto";
import {
  auditLog,
  getDatabase,
  matches,
  videos,
  visionCalibrationSamples,
  visionSessions,
  visionTimelineEvents,
} from "@duna/db";
import { and, asc, eq } from "drizzle-orm";
import type { ApiActor } from "./context";
import type {
  VisionSession,
  VisionSessionSettings,
  VisionTimelineEvent,
} from "./contracts";
import { requestVideoAnalysis } from "./video-analysis-service";

const REMOTE_SESSION_SECONDS = 12 * 60 * 60;

export class VisionServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "SESSION_NOT_FOUND"
      | "REMOTE_EXPIRED"
      | "VIDEO_NOT_FOUND"
      | "MATCH_NOT_FOUND"
      | "INVALID_EVENT"
      | "VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "VisionServiceError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new VisionServiceError(
      "DATABASE_REQUIRED",
      "Duna Vision requires a connected database.",
    );
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function remoteToken(): string {
  return `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
}

function publicWebOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_DUNA_WEB_URL ??
    process.env.DUNA_WEB_URL ??
    "https://duna-web.vercel.app"
  ).replace(/\/+$/, "");
}

type VisionSessionRow = typeof visionSessions.$inferSelect;

function serializeSession(row: VisionSessionRow, now: Date): VisionSession {
  const expired = row.remoteExpiresAt <= now || Boolean(row.revokedAt);
  return {
    id: row.id,
    videoId: row.videoId ?? undefined,
    matchId: row.matchId ?? undefined,
    title: row.title,
    status: expired ? "expired" : (row.status as VisionSession["status"]),
    settings: row.settings,
    controlVersion: row.controlVersion,
    previewDataUrl: row.previewJpegBase64
      ? `data:image/jpeg;base64,${row.previewJpegBase64}`
      : undefined,
    previewCapturedAt: row.previewCapturedAt?.toISOString(),
    recordingStartedAt: row.recordingStartedAt?.toISOString(),
    recordingEndedAt: row.recordingEndedAt?.toISOString(),
    remoteExpiresAt: row.remoteExpiresAt.toISOString(),
    remoteConnected: Boolean(
      row.lastRemoteSeenAt &&
      now.getTime() - row.lastRemoteSeenAt.getTime() <= 30_000,
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeEvent(
  row: typeof visionTimelineEvents.$inferSelect,
): VisionTimelineEvent {
  return {
    id: row.id,
    sessionId: row.sessionId,
    source: row.source as VisionTimelineEvent["source"],
    type: row.type as VisionTimelineEvent["type"],
    winnerSide: (row.winnerSide as "A" | "B" | null) ?? undefined,
    targetEventId: row.targetEventId ?? undefined,
    elapsedMs: row.elapsedMs,
    occurredAt: row.occurredAt.toISOString(),
    score: row.scoreState ?? undefined,
    label: row.label ?? undefined,
    payload: row.payload ?? undefined,
  };
}

async function recordAudit(input: {
  readonly actorPersonId?: string;
  readonly action: string;
  readonly entityId: string;
  readonly reason: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  await getDatabase()
    .insert(auditLog)
    .values({
      actorPersonId: input.actorPersonId,
      actorType: input.actorPersonId ? "person" : "provider",
      action: input.action,
      entityType: "vision-session",
      entityId: input.entityId,
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
}

async function ownedSession(
  personId: string,
  sessionId: string,
): Promise<VisionSessionRow> {
  const row = await getDatabase().query.visionSessions.findFirst({
    where: and(
      eq(visionSessions.id, sessionId),
      eq(visionSessions.ownerPersonId, personId),
    ),
  });
  if (!row) {
    throw new VisionServiceError(
      "SESSION_NOT_FOUND",
      "That Duna Vision session could not be found.",
    );
  }
  return row;
}

async function remoteSession(
  token: string,
  now: Date,
): Promise<VisionSessionRow> {
  const row = await getDatabase().query.visionSessions.findFirst({
    where: eq(visionSessions.remoteTokenHash, tokenHash(token)),
  });
  if (!row) {
    throw new VisionServiceError(
      "SESSION_NOT_FOUND",
      "That Duna Vision remote is not available.",
    );
  }
  if (row.revokedAt || row.remoteExpiresAt <= now) {
    throw new VisionServiceError(
      "REMOTE_EXPIRED",
      "This Duna Vision remote has expired.",
    );
  }
  return row;
}

export async function createVisionSession(input: {
  readonly actor: ApiActor;
  readonly title: string;
  readonly matchId?: string;
  readonly settings: VisionSessionSettings;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly session: VisionSession;
  readonly remoteUrl: string;
}> {
  requireDatabase();
  const database = getDatabase();
  if (input.matchId) {
    const match = await database.query.matches.findFirst({
      columns: { id: true },
      where: eq(matches.id, input.matchId),
    });
    if (!match) {
      throw new VisionServiceError("MATCH_NOT_FOUND", "Match not found.");
    }
  }
  const token = remoteToken();
  const id = randomUUID();
  const remoteExpiresAt = new Date(
    input.now.getTime() + REMOTE_SESSION_SECONDS * 1_000,
  );
  await database.insert(visionSessions).values({
    id,
    ownerPersonId: input.actor.personId,
    matchId: input.matchId,
    title: input.title,
    status: "setup",
    remoteTokenHash: tokenHash(token),
    remoteExpiresAt,
    settings: input.settings,
    createdAt: input.now,
    updatedAt: input.now,
  });
  await recordAudit({
    actorPersonId: input.actor.personId,
    action: "vision.remote-created",
    entityId: id,
    reason: "Created a time-limited Duna Vision remote control.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  const row = await ownedSession(input.actor.personId, id);
  return {
    session: serializeSession(row, input.now),
    remoteUrl: `${publicWebOrigin()}/vision/remote/${encodeURIComponent(token)}`,
  };
}

export async function loadOwnedVisionSession(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly now: Date;
}): Promise<VisionSession> {
  requireDatabase();
  return serializeSession(
    await ownedSession(input.actor.personId, input.sessionId),
    input.now,
  );
}

export async function loadRemoteVisionSession(input: {
  readonly token: string;
  readonly now: Date;
}): Promise<VisionSession> {
  requireDatabase();
  const row = await remoteSession(input.token, input.now);
  await getDatabase()
    .update(visionSessions)
    .set({ lastRemoteSeenAt: input.now, updatedAt: input.now })
    .where(eq(visionSessions.id, row.id));
  return serializeSession({ ...row, lastRemoteSeenAt: input.now }, input.now);
}

async function updateSession(input: {
  readonly row: VisionSessionRow;
  readonly settings?: VisionSessionSettings;
  readonly status?: "setup" | "ready" | "recording" | "ended";
  readonly expectedVersion?: number;
  readonly now: Date;
}): Promise<VisionSession> {
  if (
    input.expectedVersion !== undefined &&
    input.expectedVersion !== input.row.controlVersion
  ) {
    throw new VisionServiceError(
      "VERSION_CONFLICT",
      "The camera settings changed on another device. Refresh and try again.",
    );
  }
  const nextVersion = input.row.controlVersion + 1;
  const [updated] = await getDatabase()
    .update(visionSessions)
    .set({
      settings: input.settings ?? input.row.settings,
      status: input.status ?? input.row.status,
      controlVersion: nextVersion,
      recordingStartedAt:
        input.status === "recording"
          ? (input.row.recordingStartedAt ?? input.now)
          : input.row.recordingStartedAt,
      recordingEndedAt:
        input.status === "ended" ? input.now : input.row.recordingEndedAt,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(visionSessions.id, input.row.id),
        eq(visionSessions.controlVersion, input.row.controlVersion),
      ),
    )
    .returning();
  if (!updated) {
    throw new VisionServiceError(
      "VERSION_CONFLICT",
      "The camera settings changed on another device. Refresh and try again.",
    );
  }
  return serializeSession(updated, input.now);
}

export async function updateOwnedVisionSession(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly settings?: VisionSessionSettings;
  readonly status?: "setup" | "ready" | "recording" | "ended";
  readonly expectedVersion?: number;
  readonly now: Date;
}): Promise<VisionSession> {
  requireDatabase();
  const row = await ownedSession(input.actor.personId, input.sessionId);
  return updateSession({ ...input, row });
}

export async function updateRemoteVisionSession(input: {
  readonly token: string;
  readonly settings?: VisionSessionSettings;
  readonly status?: "setup" | "ready" | "recording" | "ended";
  readonly expectedVersion?: number;
  readonly now: Date;
}): Promise<VisionSession> {
  requireDatabase();
  const row = await remoteSession(input.token, input.now);
  const session = await updateSession({ ...input, row });
  await getDatabase()
    .update(visionSessions)
    .set({ lastRemoteSeenAt: input.now })
    .where(eq(visionSessions.id, row.id));
  return { ...session, remoteConnected: true };
}

export async function updateVisionPreview(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly jpegBase64: string;
  readonly capturedAt: Date;
  readonly now: Date;
}): Promise<{ readonly accepted: true }> {
  requireDatabase();
  const row = await ownedSession(input.actor.personId, input.sessionId);
  await getDatabase()
    .update(visionSessions)
    .set({
      previewJpegBase64: input.jpegBase64,
      previewCapturedAt: input.capturedAt,
      updatedAt: input.now,
    })
    .where(eq(visionSessions.id, row.id));
  return { accepted: true };
}

export async function appendVisionTimelineEvents(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly events: readonly VisionTimelineEvent[];
}): Promise<{ readonly accepted: number }> {
  requireDatabase();
  await ownedSession(input.actor.personId, input.sessionId);
  if (
    input.events.some(
      (event) => event.source !== "apple-watch" && event.source !== "iphone",
    )
  ) {
    throw new VisionServiceError(
      "INVALID_EVENT",
      "Player devices can append only iPhone or Apple Watch timeline events.",
    );
  }
  const events = input.events.filter(
    (event) => event.sessionId === input.sessionId,
  );
  if (events.length !== input.events.length) {
    throw new VisionServiceError(
      "SESSION_NOT_FOUND",
      "A timeline event belongs to a different Duna Vision session.",
    );
  }
  const result = await getDatabase()
    .insert(visionTimelineEvents)
    .values(
      events.map((event) => ({
        id: event.id,
        sessionId: event.sessionId,
        source: event.source,
        type: event.type,
        winnerSide: event.winnerSide,
        targetEventId: event.targetEventId,
        elapsedMs: event.elapsedMs,
        occurredAt: new Date(event.occurredAt),
        scoreState: event.score,
        label: event.label,
        payload: event.payload,
      })),
    )
    .onConflictDoNothing({ target: visionTimelineEvents.id })
    .returning({ id: visionTimelineEvents.id });
  return { accepted: result.length };
}

export async function attachVisionSessionToVideo(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly videoId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<VisionSession> {
  requireDatabase();
  const database = getDatabase();
  const [session, video] = await Promise.all([
    ownedSession(input.actor.personId, input.sessionId),
    database.query.videos.findFirst({
      columns: {
        id: true,
        matchId: true,
        ownerPersonId: true,
        status: true,
        courtCalibration: true,
        visionLearningConsent: true,
      },
      where: and(
        eq(videos.id, input.videoId),
        eq(videos.ownerPersonId, input.actor.personId),
      ),
    }),
  ]);
  if (!video) {
    throw new VisionServiceError("VIDEO_NOT_FOUND", "Video not found.");
  }
  await database
    .update(visionSessions)
    .set({
      videoId: video.id,
      matchId: session.matchId ?? video.matchId,
      updatedAt: input.now,
    })
    .where(eq(visionSessions.id, session.id));
  if (video.visionLearningConsent) {
    const calibration = video.courtCalibration;
    await database
      .insert(visionCalibrationSamples)
      .values({
        videoId: video.id,
        sessionId: session.id,
        ownerPersonId: video.ownerPersonId,
        sourceModelVersion: calibration?.modelVersion,
        qualityScore: calibration?.qualityScore,
        geometry: calibration ? { ...calibration } : { ...session.settings },
        previewCapturedAt: session.previewCapturedAt,
        status: "pending",
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing({ target: visionCalibrationSamples.videoId });
    await recordAudit({
      actorPersonId: input.actor.personId,
      action: "vision.calibration-sample-queued",
      entityId: session.id,
      reason:
        "Player consented to a human-reviewed court calibration example; no automatic model training was started.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
  }
  await recordAudit({
    actorPersonId: input.actor.personId,
    action: "vision.video-attached",
    entityId: session.id,
    reason: `Attached Duna Vision timeline to video ${video.id}.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  // Attaching a session is the durable hand-off to Duna Vision. It provides
  // the uploaded source plus player-confirmed court/player context without
  // making someone find a second "Analyze" action after every upload.
  if (
    video.status === "ready" ||
    video.status === "ended" ||
    video.status === "processing"
  ) {
    await requestVideoAnalysis({
      actor: input.actor,
      videoId: video.id,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    }).catch(() => undefined);
  }
  return serializeSession(
    {
      ...session,
      videoId: video.id,
      matchId: session.matchId ?? video.matchId,
      updatedAt: input.now,
    },
    input.now,
  );
}

export async function revokeVisionRemote(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly revoked: true }> {
  requireDatabase();
  const row = await ownedSession(input.actor.personId, input.sessionId);
  await getDatabase()
    .update(visionSessions)
    .set({ revokedAt: input.now, updatedAt: input.now })
    .where(eq(visionSessions.id, row.id));
  await recordAudit({
    actorPersonId: input.actor.personId,
    action: "vision.remote-revoked",
    entityId: row.id,
    reason: "Revoked the Duna Vision remote control.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return { revoked: true };
}

export async function loadVisionPlayback(videoId: string): Promise<
  | {
      readonly sessionId: string;
      readonly settings: VisionSessionSettings;
      readonly recordingStartedAt?: string;
      readonly events: readonly VisionTimelineEvent[];
    }
  | undefined
> {
  requireDatabase();
  const database = getDatabase();
  const session = await database.query.visionSessions.findFirst({
    where: eq(visionSessions.videoId, videoId),
  });
  if (!session) return undefined;
  const rows = await database
    .select()
    .from(visionTimelineEvents)
    .where(eq(visionTimelineEvents.sessionId, session.id))
    .orderBy(asc(visionTimelineEvents.elapsedMs));
  return {
    sessionId: session.id,
    settings: session.settings,
    recordingStartedAt: session.recordingStartedAt?.toISOString(),
    events: rows.map(serializeEvent),
  };
}
