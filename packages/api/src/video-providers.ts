import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Mux from "@mux/mux-node";

// Keep each in-app upload comfortably below iOS memory pressure while still
// clearing S3's 5 MiB minimum for every non-final multipart segment.
export const R2_VIDEO_PART_SIZE_BYTES = 16 * 1024 * 1024;
const R2_URL_EXPIRATION_SECONDS = 60 * 30;
const VIDEO_PLAYBACK_TOKEN_MINIMUM_SECONDS = 2 * 60 * 60;

interface R2Configuration {
  readonly accountId: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

function r2Configuration(): R2Configuration | undefined {
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID ??
    "c5005deb8c0826c72b6c2cd459dce623"
  ).trim();
  const bucket = (process.env.R2_BUCKET_NAME ?? "duna").trim();
  const accessKeyId = (process.env.CF_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (
    process.env.CE_SECRET_ACCESS_KEY ??
    process.env.CF_SECRET_ACCESS_KEY ??
    ""
  ).trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

let r2Client: S3Client | undefined;
let r2ClientIdentity: string | undefined;

function getR2Client(): {
  readonly client: S3Client;
  readonly configuration: R2Configuration;
} {
  const configuration = r2Configuration();
  if (!configuration) {
    throw new Error(
      "R2 video storage requires CLOUDFLARE_ACCOUNT_ID, CF_ACCESS_KEY_ID, and CE_SECRET_ACCESS_KEY.",
    );
  }
  const identity = `${configuration.accountId}:${configuration.accessKeyId}`;
  if (!r2Client || r2ClientIdentity !== identity) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
    r2ClientIdentity = identity;
  }
  return { client: r2Client, configuration };
}

export function isR2VideoConfigured(): boolean {
  return Boolean(r2Configuration());
}

export async function createR2VideoUpload(input: {
  readonly objectKey: string;
  readonly contentType: string;
  readonly videoId: string;
  readonly ownerPersonId: string;
}): Promise<{ readonly uploadId: string }> {
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      CacheControl: "private, max-age=0, no-store",
      Metadata: {
        "duna-video-id": input.videoId,
        "duna-owner-id": input.ownerPersonId,
      },
    }),
  );
  if (!response.UploadId) {
    throw new Error("R2 did not return a multipart upload identifier.");
  }
  return { uploadId: response.UploadId };
}

export async function presignR2VideoPart(input: {
  readonly objectKey: string;
  readonly uploadId: string;
  readonly partNumber: number;
}): Promise<{ readonly url: string; readonly expiresAt: Date }> {
  const { client, configuration } = getR2Client();
  const expiresAt = new Date(Date.now() + R2_URL_EXPIRATION_SECONDS * 1_000);
  const url = await getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
    }),
    { expiresIn: R2_URL_EXPIRATION_SECONDS },
  );
  return { url, expiresAt };
}

export async function completeR2VideoUpload(input: {
  readonly objectKey: string;
  readonly uploadId: string;
  readonly parts: readonly {
    readonly partNumber: number;
    readonly etag: string;
  }[];
}): Promise<{ readonly etag?: string }> {
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: [...input.parts]
          .sort((left, right) => left.partNumber - right.partNumber)
          .map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
      },
    }),
  );
  return { etag: response.ETag };
}

export async function abortR2VideoUpload(input: {
  readonly objectKey: string;
  readonly uploadId: string;
}): Promise<void> {
  const { client, configuration } = getR2Client();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
    }),
  );
}

export async function deleteR2VideoObject(objectKey: string): Promise<void> {
  const { client, configuration } = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: configuration.bucket,
      Key: objectKey,
    }),
  );
}

export async function presignR2VideoPlayback(input: {
  readonly objectKey: string;
  readonly contentType?: string;
  readonly title: string;
  readonly expiresInSeconds?: number;
}): Promise<{ readonly url: string; readonly expiresAt: Date }> {
  const { client, configuration } = getR2Client();
  const expiresInSeconds = Math.min(
    7 * 24 * 60 * 60,
    Math.max(60, input.expiresInSeconds ?? 60 * 60),
  );
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1_000);
  const safeTitle = input.title
    .replaceAll(/[\r\n"]/g, "")
    .trim()
    .slice(0, 160);
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      ResponseContentType: input.contentType ?? "video/mp4",
      ResponseContentDisposition: `inline; filename="${safeTitle || "duna-video"}.mp4"`,
    }),
    { expiresIn: expiresInSeconds },
  );
  return { url, expiresAt };
}

function muxTokenSecret(): string | undefined {
  return (process.env.MUX_TOKEN_SECRET ?? process.env.MUX_SECRET_KEY)?.trim();
}

function normalizedMuxPrivateKey(): string | undefined {
  const value = (
    process.env.MUX_PRIVATE_KEY ?? process.env.MUX_SIGNING_SECRET
  )?.trim();
  if (!value) return undefined;
  const normalized = value.replaceAll("\\n", "\n");
  if (normalized.includes("PRIVATE KEY")) return normalized;
  const decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
  return decoded.includes("PRIVATE KEY") ? decoded : normalized;
}

let muxClient: Mux | undefined;
let muxClientIdentity: string | undefined;

export function getMuxClient(): Mux {
  const tokenId = process.env.MUX_TOKEN_ID?.trim();
  const tokenSecret = muxTokenSecret();
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET?.trim();
  const jwtSigningKey = (
    process.env.MUX_SIGNING_KEY ?? process.env.MUX_SIGNING_KEY_ID
  )?.trim();
  const jwtPrivateKey = normalizedMuxPrivateKey();
  const identity = [
    tokenId,
    tokenSecret,
    webhookSecret,
    jwtSigningKey,
    jwtPrivateKey,
  ].join(":");
  if (!muxClient || muxClientIdentity !== identity) {
    muxClient = new Mux({
      tokenId,
      tokenSecret,
      webhookSecret,
      jwtSigningKey,
      jwtPrivateKey,
    });
    muxClientIdentity = identity;
  }
  return muxClient;
}

export function isMuxVideoConfigured(): boolean {
  return Boolean(process.env.MUX_TOKEN_ID?.trim() && muxTokenSecret());
}

export function isMuxSignedPlaybackConfigured(): boolean {
  return Boolean(
    (process.env.MUX_SIGNING_KEY ?? process.env.MUX_SIGNING_KEY_ID)?.trim() &&
    normalizedMuxPrivateKey(),
  );
}

export function muxDataEnvironmentKey(): string | undefined {
  return process.env.MUX_DATA_ENV_KEY?.trim() || undefined;
}

export function buildMuxLiveStreamInput(input: {
  readonly videoId: string;
  readonly title: string;
  readonly liveVisibility: "public" | "link-only";
  readonly recordingVisibility: "public" | "private";
  readonly maximumDurationSeconds: number;
}) {
  const playbackPolicy =
    input.liveVisibility === "public"
      ? ("public" as const)
      : ("signed" as const);
  const recordingPolicy =
    input.recordingVisibility === "public"
      ? ("public" as const)
      : ("signed" as const);

  return {
    playbackPolicy,
    recordingPolicy,
    request: {
      playback_policies: [playbackPolicy],
      latency_mode: "low" as const,
      reconnect_window: 60,
      max_continuous_duration: Math.min(
        12 * 60 * 60,
        Math.max(60, input.maximumDurationSeconds),
      ),
      // Mux now carries the live-stream passthrough value to every asset it
      // creates. Sending it inside new_asset_settings is rejected by the API.
      passthrough: input.videoId,
      meta: {
        title: input.title,
      },
      new_asset_settings: {
        playback_policies: [recordingPolicy],
        meta: {
          title: input.title,
          external_id: input.videoId,
        },
      },
    },
  };
}

export async function createMuxLiveVideo(input: {
  readonly videoId: string;
  readonly title: string;
  readonly liveVisibility: "public" | "link-only";
  readonly recordingVisibility: "public" | "private";
  readonly maximumDurationSeconds: number;
  readonly idempotencyKey: string;
}): Promise<{
  readonly liveStreamId: string;
  readonly streamKey: string;
  readonly playbackId: string;
  readonly playbackPolicy: "public" | "signed";
}> {
  if (!isMuxVideoConfigured()) {
    throw new Error("Mux Video credentials are not configured.");
  }
  const { playbackPolicy, recordingPolicy, request } =
    buildMuxLiveStreamInput(input);
  if (
    (playbackPolicy === "signed" || recordingPolicy === "signed") &&
    !isMuxSignedPlaybackConfigured()
  ) {
    throw new Error("Mux signed-playback credentials are not configured.");
  }
  const liveStream = await getMuxClient().video.liveStreams.create(request, {
    headers: { "Idempotency-Key": input.idempotencyKey },
  });
  const playback = liveStream.playback_ids?.find(
    (candidate) => candidate.policy === playbackPolicy,
  );
  if (!liveStream.id || !liveStream.stream_key || !playback?.id) {
    throw new Error("Mux did not return a complete live-stream session.");
  }
  return {
    liveStreamId: liveStream.id,
    streamKey: liveStream.stream_key,
    playbackId: playback.id,
    playbackPolicy,
  };
}

export async function completeMuxLiveVideo(
  liveStreamId: string,
): Promise<void> {
  await getMuxClient().video.liveStreams.complete(liveStreamId);
}

function providerResourceMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    readonly status?: number;
    readonly statusCode?: number;
    readonly response?: { readonly status?: number };
  };
  return (
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    candidate.response?.status === 404
  );
}

export async function deleteMuxLiveVideo(liveStreamId: string): Promise<void> {
  try {
    await getMuxClient().video.liveStreams.delete(liveStreamId);
  } catch (error) {
    if (!providerResourceMissing(error)) throw error;
  }
}

export async function deleteMuxVideoAsset(assetId: string): Promise<void> {
  try {
    await getMuxClient().video.assets.delete(assetId);
  } catch (error) {
    if (!providerResourceMissing(error)) throw error;
  }
}

export async function replaceMuxLivePlaybackPolicy(input: {
  readonly liveStreamId: string;
  readonly previousPlaybackId: string;
  readonly policy: "public" | "signed";
}): Promise<string> {
  if (input.policy === "signed" && !isMuxSignedPlaybackConfigured()) {
    throw new Error("Mux signed-playback credentials are not configured.");
  }
  const playback = await getMuxClient().video.liveStreams.createPlaybackId(
    input.liveStreamId,
    { policy: input.policy },
  );
  if (!playback.id) {
    throw new Error("Mux did not return a replacement live playback ID.");
  }
  await getMuxClient().video.liveStreams.deletePlaybackId(
    input.liveStreamId,
    input.previousPlaybackId,
  );
  return playback.id;
}

export async function replaceMuxAssetPlaybackPolicy(input: {
  readonly assetId: string;
  readonly previousPlaybackId: string;
  readonly policy: "public" | "signed";
}): Promise<string> {
  if (input.policy === "signed" && !isMuxSignedPlaybackConfigured()) {
    throw new Error("Mux signed-playback credentials are not configured.");
  }
  const playback = await getMuxClient().video.assets.createPlaybackId(
    input.assetId,
    { policy: input.policy },
  );
  if (!playback.id) {
    throw new Error("Mux did not return a replacement asset playback ID.");
  }
  await getMuxClient().video.assets.deletePlaybackId(
    input.assetId,
    input.previousPlaybackId,
  );
  return playback.id;
}

export async function signMuxPlayback(input: {
  readonly playbackId: string;
  readonly durationSeconds?: number;
}): Promise<string> {
  if (!isMuxSignedPlaybackConfigured()) {
    throw new Error("Mux signed-playback credentials are not configured.");
  }
  const expirationSeconds = Math.max(
    VIDEO_PLAYBACK_TOKEN_MINIMUM_SECONDS,
    (input.durationSeconds ?? 0) + 30 * 60,
  );
  return getMuxClient().jwt.signPlaybackId(input.playbackId, {
    expiration: `${expirationSeconds}s`,
    type: "video",
  });
}

export async function loadMuxVideoMetrics(videoId: string): Promise<
  | {
      readonly views?: number;
      readonly uniqueViewers?: number;
      readonly playingTimeSeconds?: number;
      readonly videoStartupTimeMs?: number;
      readonly rebufferPercentage?: number;
      readonly playbackFailurePercentage?: number;
    }
  | undefined
> {
  if (!isMuxVideoConfigured() || !muxDataEnvironmentKey()) return undefined;
  const response = await getMuxClient().data.metrics.list({
    dimension: "video_id",
    value: videoId,
    timeframe: ["30:days"],
  });
  const totals = response.data.find((row) => row.name === "totals");
  const metricRows = response.data
    .filter((row) => row.metric)
    .flatMap((row) => [row, ...(row.items ?? [])]);
  const metricValue = (metric: string): number | undefined => {
    const value = metricRows.find((row) => row.metric === metric)?.value;
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  };
  const playingTimeMs =
    totals?.total_playing_time ?? metricValue("playing_time");
  return {
    views: totals?.started_views ?? metricValue("views"),
    uniqueViewers: totals?.unique_viewers ?? metricValue("unique_viewers"),
    playingTimeSeconds:
      playingTimeMs === null || playingTimeMs === undefined
        ? undefined
        : playingTimeMs / 1_000,
    videoStartupTimeMs: metricValue("video_startup_time"),
    rebufferPercentage: metricValue("rebuffer_percentage"),
    playbackFailurePercentage: metricValue("playback_failure_percentage"),
  };
}

export async function unwrapMuxWebhook(
  rawBody: string,
  headers: Headers,
): Promise<unknown> {
  if (!process.env.MUX_WEBHOOK_SECRET?.trim()) {
    throw new Error("MUX_WEBHOOK_SECRET is not configured.");
  }
  return getMuxClient().webhooks.unwrap(rawBody, headers);
}
