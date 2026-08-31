import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Mux from "@mux/mux-node";

// The native uploader streams a file-backed 64 MiB range directly to
// URLSession; it never materializes a multipart segment as `Data`. The larger
// segment size materially reduces signed-request churn on longer recordings
// while remaining comfortably inside R2's 10,000-part limit.
export const R2_VIDEO_PART_SIZE_BYTES = 64 * 1024 * 1024;
// Attachment uploads retain their existing smaller segment size. Video
// durability must not unexpectedly change messaging's transport behavior.
export const R2_MESSAGE_ATTACHMENT_PART_SIZE_BYTES = 16 * 1024 * 1024;
const R2_URL_EXPIRATION_SECONDS = 24 * 60 * 60;
const VIDEO_PLAYBACK_TOKEN_MINIMUM_SECONDS = 2 * 60 * 60;

interface R2Configuration {
  readonly accountId: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly endpoint: string;
}

function normalizedR2Endpoint(accountId: string): string {
  const configured = (
    process.env.CF_R2_S3_ENDPOINT ??
    // `cf_rs_s3_endpoint` is the name presently configured in the Duna
    // deployment. Keep this server-only alias while the canonical name rolls
    // out; it is intentionally not exposed as a public client variable.
    process.env.cf_rs_s3_endpoint
  )?.trim();
  const fallback = `https://${accountId}.r2.cloudflarestorage.com`;
  if (!configured) return fallback;
  try {
    const endpoint = new URL(configured);
    const allowedHost = endpoint.hostname.endsWith(".r2.cloudflarestorage.com");
    return endpoint.protocol === "https:" && allowedHost
      ? endpoint.origin
      : fallback;
  } catch {
    return fallback;
  }
}

function r2Configuration(): R2Configuration | undefined {
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID ??
    process.env.cloudflare_account_id ??
    ""
  ).trim();
  const bucket = (process.env.R2_BUCKET_NAME ?? "duna").trim();
  const accessKeyId = (
    process.env.CF_ACCESS_KEY_ID ??
    process.env.cf_r2_access_key_id ??
    ""
  ).trim();
  const secretAccessKey = (
    process.env.CE_SECRET_ACCESS_KEY ??
    process.env.CF_SECRET_ACCESS_KEY ??
    process.env.cf_r2_secret_access_key ??
    ""
  ).trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    return undefined;
  }
  // Cloudflare account API tokens (including `cf_r2_account_token`) cannot
  // replace S3 credentials here. Multipart uploads are signed strictly with a
  // scoped R2 access key and secret.
  return {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint: normalizedR2Endpoint(accountId),
  };
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
  const identity = `${configuration.endpoint}:${configuration.bucket}:${configuration.accessKeyId}`;
  if (!r2Client || r2ClientIdentity !== identity) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: configuration.endpoint,
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

export async function readPrivateR2JsonObject(
  objectKey: string,
  maximumBytes = 1_048_576,
): Promise<unknown> {
  if (
    !objectKey ||
    objectKey.startsWith("/") ||
    objectKey.includes("..") ||
    !objectKey.endsWith(".json")
  ) {
    throw new Error("The private R2 object key is invalid.");
  }
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: configuration.bucket, Key: objectKey }),
  );
  if (
    typeof response.ContentLength === "number" &&
    response.ContentLength > maximumBytes
  ) {
    throw new Error("The private R2 JSON object is too large.");
  }
  const body = await response.Body?.transformToString("utf-8");
  if (!body || Buffer.byteLength(body, "utf-8") > maximumBytes) {
    throw new Error("The private R2 JSON object is unavailable or too large.");
  }
  return JSON.parse(body) as unknown;
}

export async function storePrivateR2Response(input: {
  readonly objectKey: string;
  readonly response: Response;
  readonly contentType: string;
  readonly metadata: Readonly<Record<string, string>>;
}): Promise<void> {
  if (
    !input.objectKey ||
    input.objectKey.startsWith("/") ||
    input.objectKey.includes("..") ||
    !input.response.body
  ) {
    throw new Error("The private R2 source or object key is invalid.");
  }
  const { client, configuration } = getR2Client();
  const contentLength = Number(input.response.headers.get("content-length"));
  await client.send(
    new PutObjectCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      Body: Readable.fromWeb(input.response.body as never),
      ContentType: input.contentType,
      ...(Number.isSafeInteger(contentLength) && contentLength >= 0
        ? { ContentLength: contentLength }
        : {}),
      CacheControl: "private, max-age=0, no-store",
      Metadata: { ...input.metadata },
    }),
  );
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

export async function createR2MessageAttachmentUpload(input: {
  readonly objectKey: string;
  readonly contentType: string;
  readonly attachmentId: string;
  readonly ownerPersonId: string;
  readonly conversationId: string;
}): Promise<{ readonly uploadId: string }> {
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      CacheControl: "private, max-age=0, no-store",
      Metadata: {
        "duna-attachment-id": input.attachmentId,
        "duna-owner-id": input.ownerPersonId,
        "duna-conversation-id": input.conversationId,
      },
    }),
  );
  if (!response.UploadId) {
    throw new Error("R2 did not return an attachment upload identifier.");
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

export interface R2MultipartPart {
  readonly partNumber: number;
  readonly etag: string;
  readonly sizeBytes: number;
}

/**
 * ListParts is the source of truth for an in-progress multipart upload. The
 * mobile database and a client's upload response are useful resume hints, but
 * neither can safely decide which bytes R2 will complete.
 */
export async function listR2VideoUploadParts(input: {
  readonly objectKey: string;
  readonly uploadId: string;
}): Promise<readonly R2MultipartPart[]> {
  const { client, configuration } = getR2Client();
  const parts: R2MultipartPart[] = [];
  let marker: string | undefined;

  do {
    const response = await client.send(
      new ListPartsCommand({
        Bucket: configuration.bucket,
        Key: input.objectKey,
        UploadId: input.uploadId,
        ...(marker ? { PartNumberMarker: marker } : {}),
        MaxParts: 1_000,
      }),
    );
    for (const part of response.Parts ?? []) {
      if (
        typeof part.PartNumber !== "number" ||
        !Number.isInteger(part.PartNumber) ||
        !part.ETag ||
        typeof part.Size !== "number" ||
        !Number.isSafeInteger(part.Size) ||
        part.Size < 0
      ) {
        throw new Error("R2 returned invalid multipart upload metadata.");
      }
      const partNumber = part.PartNumber;
      const sizeBytes = part.Size;
      parts.push({ partNumber, etag: part.ETag, sizeBytes });
    }
    marker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
    if (response.IsTruncated && !marker) {
      throw new Error("R2 returned an incomplete multipart upload page.");
    }
  } while (marker);

  return parts.sort((left, right) => left.partNumber - right.partNumber);
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

/** Only this narrow provider response proves an abort was already accepted. */
export function isR2MultipartUploadAlreadyAbsent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    readonly name?: unknown;
    readonly Code?: unknown;
    readonly code?: unknown;
    readonly $metadata?: { readonly httpStatusCode?: unknown };
  };
  const code =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.Code === "string"
        ? candidate.Code
        : typeof candidate.code === "string"
          ? candidate.code
          : undefined;
  return (
    code === "NoSuchUpload" ||
    code === "NoSuchKey" ||
    (code === "NotFound" && candidate.$metadata?.httpStatusCode === 404)
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

export async function verifyR2ObjectSize(input: {
  readonly objectKey: string;
  readonly expectedBytes: number;
}): Promise<void> {
  const object = await headR2VideoObject(input.objectKey);
  if (object.sizeBytes !== input.expectedBytes) {
    throw new Error("The completed attachment size did not match the upload.");
  }
}

export async function headR2VideoObject(objectKey: string): Promise<{
  readonly sizeBytes: number;
  readonly etag?: string;
}> {
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new HeadObjectCommand({
      Bucket: configuration.bucket,
      Key: objectKey,
    }),
  );
  if (
    typeof response.ContentLength !== "number" ||
    !Number.isSafeInteger(response.ContentLength) ||
    response.ContentLength < 0
  ) {
    throw new Error("R2 did not return a valid completed object size.");
  }
  return { sizeBytes: response.ContentLength, etag: response.ETag };
}

export async function presignR2AttachmentDownload(input: {
  readonly objectKey: string;
  readonly contentType: string;
  readonly fileName: string;
  readonly inline: boolean;
  readonly expiresInSeconds?: number;
}): Promise<{ readonly url: string; readonly expiresAt: Date }> {
  const { client, configuration } = getR2Client();
  const expiresInSeconds = Math.min(
    24 * 60 * 60,
    Math.max(60, input.expiresInSeconds ?? 60 * 60),
  );
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1_000);
  const safeFileName = input.fileName
    .replaceAll(/[\r\n"\\]/g, "")
    .trim()
    .slice(0, 180);
  const disposition = input.inline ? "inline" : "attachment";
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: configuration.bucket,
      Key: input.objectKey,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `${disposition}; filename="${safeFileName || "duna-attachment"}"`,
    }),
    { expiresIn: expiresInSeconds },
  );
  return { url, expiresAt };
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

interface CloudflareStreamConfiguration {
  readonly accountId: string;
  readonly apiToken: string;
}

interface CloudflareApiEnvelope<Result> {
  readonly success?: boolean;
  readonly result?: Result;
  readonly errors?: readonly {
    readonly code?: number;
    readonly message?: string;
  }[];
}

interface CloudflareLiveInputResponse {
  readonly uid?: string;
  readonly rtmps?: {
    readonly url?: string;
    readonly streamKey?: string;
  };
  readonly srt?: {
    readonly url?: string;
    readonly streamId?: string;
    readonly passphrase?: string;
  };
  readonly playback?: {
    readonly hls?: string;
    readonly dash?: string;
  };
  readonly recording?: {
    readonly requireSignedURLs?: boolean;
  };
}

function cloudflareStreamConfiguration():
  CloudflareStreamConfiguration | undefined {
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID ??
    process.env.cloudflare_account_id ??
    ""
  ).trim();
  const apiToken = (process.env.CLOUDFLARE_STREAM_API_TOKEN ?? "").trim();
  return accountId && apiToken ? { accountId, apiToken } : undefined;
}

export function isCloudflareStreamConfigured(): boolean {
  return Boolean(cloudflareStreamConfiguration());
}

export function isCloudflareSrtIngestEnabled(): boolean {
  return process.env.CLOUDFLARE_STREAM_SRT_ENABLED?.trim() !== "false";
}

function cloudflareStreamRecordingRetentionDays(): number | undefined {
  const value = process.env.CLOUDFLARE_STREAM_RECORDING_RETENTION_DAYS?.trim();
  if (!value) return undefined;
  const configured = Number(value);
  if (!Number.isFinite(configured)) {
    throw new Error(
      "CLOUDFLARE_STREAM_RECORDING_RETENTION_DAYS must be a number.",
    );
  }
  return Math.max(30, Math.floor(configured));
}

function cloudflareStreamAllowedOrigins(): readonly string[] {
  const configured = String(
    process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS ?? "",
  );
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function cloudflareResult<Result>(
  payload: CloudflareApiEnvelope<Result> | Result,
): Result {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as CloudflareApiEnvelope<Result>).success === false
  ) {
    const message = (payload as CloudflareApiEnvelope<Result>).errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || "Cloudflare Stream rejected the request.");
  }
  if (
    payload &&
    typeof payload === "object" &&
    "result" in payload &&
    (payload as CloudflareApiEnvelope<Result>).result !== undefined
  ) {
    return (payload as CloudflareApiEnvelope<Result>).result as Result;
  }
  return payload as Result;
}

async function cloudflareStreamRequest<Result>(
  path: string,
  init?: RequestInit,
): Promise<Result> {
  const configuration = cloudflareStreamConfiguration();
  if (!configuration) {
    throw new Error("Cloudflare Stream credentials are not configured.");
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(configuration.accountId)}/stream${path}`,
    {
      ...init,
      headers: {
        authorization: `Bearer ${configuration.apiToken}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    },
  );
  const payload = (await response.json().catch(() => ({}))) as
    CloudflareApiEnvelope<Result> | Result;
  if (!response.ok) {
    const envelope = payload as CloudflareApiEnvelope<Result>;
    const message = envelope.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(
      message || `Cloudflare Stream request failed (${response.status}).`,
    );
  }
  return cloudflareResult(payload);
}

export interface CloudflareLiveVideoSession {
  readonly liveInputId: string;
  readonly playbackId: string;
  readonly playbackPolicy: "public" | "signed";
  readonly playbackHlsUrl: string;
  readonly rtmps: {
    readonly url: string;
    readonly streamKey: string;
  };
  readonly srt?: {
    readonly url: string;
    readonly streamId: string;
    readonly passphrase: string;
  };
}

export async function createCloudflareLiveVideo(input: {
  readonly videoId: string;
  readonly title: string;
  readonly liveVisibility: "public" | "link-only";
  readonly recordingVisibility: "public" | "private";
}): Promise<CloudflareLiveVideoSession> {
  const playbackPolicy =
    input.liveVisibility === "link-only" ||
    input.recordingVisibility === "private"
      ? ("signed" as const)
      : ("public" as const);
  const deleteRecordingAfterDays = cloudflareStreamRecordingRetentionDays();
  const liveInput = await cloudflareStreamRequest<CloudflareLiveInputResponse>(
    "/live_inputs",
    {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        meta: { name: input.title, dunaVideoId: input.videoId },
        preferLowLatency: true,
        ...(deleteRecordingAfterDays ? { deleteRecordingAfterDays } : {}),
        recording: {
          mode: "automatic",
          requireSignedURLs: playbackPolicy === "signed",
          allowedOrigins: [...cloudflareStreamAllowedOrigins()],
          hideLiveViewerCount: false,
        },
      }),
    },
  );
  const liveInputId = liveInput.uid?.trim();
  const rtmpsUrl = liveInput.rtmps?.url?.trim();
  const rtmpsStreamKey = liveInput.rtmps?.streamKey?.trim();
  const playbackHlsUrl = liveInput.playback?.hls?.trim();
  if (!liveInputId || !rtmpsUrl || !rtmpsStreamKey || !playbackHlsUrl) {
    throw new Error(
      "Cloudflare Stream did not return complete live-ingest credentials.",
    );
  }
  const srtUrl = liveInput.srt?.url?.trim();
  const srtStreamId = liveInput.srt?.streamId?.trim();
  const srtPassphrase = liveInput.srt?.passphrase?.trim();
  return {
    liveInputId,
    playbackId: liveInputId,
    playbackPolicy,
    playbackHlsUrl,
    rtmps: { url: rtmpsUrl, streamKey: rtmpsStreamKey },
    ...(isCloudflareSrtIngestEnabled() && srtUrl && srtStreamId && srtPassphrase
      ? {
          srt: {
            url: srtUrl,
            streamId: srtStreamId,
            passphrase: srtPassphrase,
          },
        }
      : {}),
  };
}

export async function loadCloudflareLiveVideo(
  liveInputId: string,
): Promise<CloudflareLiveVideoSession> {
  const liveInput = await cloudflareStreamRequest<CloudflareLiveInputResponse>(
    `/live_inputs/${encodeURIComponent(liveInputId)}`,
  );
  const returnedId = liveInput.uid?.trim();
  const rtmpsUrl = liveInput.rtmps?.url?.trim();
  const rtmpsStreamKey = liveInput.rtmps?.streamKey?.trim();
  const playbackHlsUrl = liveInput.playback?.hls?.trim();
  if (!returnedId || !rtmpsUrl || !rtmpsStreamKey || !playbackHlsUrl) {
    throw new Error(
      "Cloudflare Stream did not return complete live-ingest credentials.",
    );
  }
  const srtUrl = liveInput.srt?.url?.trim();
  const srtStreamId = liveInput.srt?.streamId?.trim();
  const srtPassphrase = liveInput.srt?.passphrase?.trim();
  return {
    liveInputId: returnedId,
    playbackId: returnedId,
    playbackPolicy:
      liveInput.recording?.requireSignedURLs === true ? "signed" : "public",
    playbackHlsUrl,
    rtmps: { url: rtmpsUrl, streamKey: rtmpsStreamKey },
    ...(isCloudflareSrtIngestEnabled() && srtUrl && srtStreamId && srtPassphrase
      ? {
          srt: {
            url: srtUrl,
            streamId: srtStreamId,
            passphrase: srtPassphrase,
          },
        }
      : {}),
  };
}

export async function disableCloudflareLiveInput(
  liveInputId: string,
): Promise<void> {
  await cloudflareStreamRequest(
    `/live_inputs/${encodeURIComponent(liveInputId)}`,
    { method: "PUT", body: JSON.stringify({ enabled: false }) },
  );
}

export async function updateCloudflareLiveInputAccess(input: {
  readonly liveInputId: string;
  readonly requireSignedUrls: boolean;
}): Promise<void> {
  await cloudflareStreamRequest(
    `/live_inputs/${encodeURIComponent(input.liveInputId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        recording: { requireSignedURLs: input.requireSignedUrls },
      }),
    },
  );
}

export async function updateCloudflareVideoAccess(input: {
  readonly videoId: string;
  readonly requireSignedUrls: boolean;
}): Promise<void> {
  await cloudflareStreamRequest(`/${encodeURIComponent(input.videoId)}`, {
    method: "POST",
    body: JSON.stringify({ requireSignedURLs: input.requireSignedUrls }),
  });
}

export async function createCloudflareLiveOutput(input: {
  readonly liveInputId: string;
  readonly url: string;
  readonly streamKey: string;
}): Promise<{ readonly outputId: string }> {
  const output = await cloudflareStreamRequest<{ readonly uid?: string }>(
    `/live_inputs/${encodeURIComponent(input.liveInputId)}/outputs`,
    {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        url: input.url,
        streamKey: input.streamKey,
      }),
    },
  );
  const outputId = output.uid?.trim();
  if (!outputId) {
    throw new Error("Cloudflare Stream did not return a simulcast output ID.");
  }
  return { outputId };
}

export async function listCloudflareLiveRecordings(
  liveInputId: string,
): Promise<
  readonly {
    readonly videoId: string;
    readonly ready: boolean;
    readonly createdAt?: string;
    readonly durationSeconds?: number;
    readonly playbackHlsUrl?: string;
    readonly thumbnailUrl?: string;
  }[]
> {
  const videos = await cloudflareStreamRequest<
    readonly {
      readonly uid?: string;
      readonly created?: string;
      readonly readyToStream?: boolean;
      readonly duration?: number;
      readonly playback?: { readonly hls?: string };
      readonly thumbnail?: string;
      readonly status?: { readonly state?: string };
    }[]
  >(`/live_inputs/${encodeURIComponent(liveInputId)}/videos`);
  return videos.flatMap((video) => {
    const videoId = video.uid?.trim();
    if (!videoId) return [];
    return [
      {
        videoId,
        ready: video.readyToStream === true || video.status?.state === "ready",
        createdAt: video.created?.trim() || undefined,
        durationSeconds:
          typeof video.duration === "number" && video.duration >= 0
            ? Math.floor(video.duration)
            : undefined,
        playbackHlsUrl: video.playback?.hls?.trim() || undefined,
        thumbnailUrl: video.thumbnail?.trim() || undefined,
      },
    ];
  });
}

export async function signCloudflarePlayback(input: {
  readonly playbackId: string;
  readonly durationSeconds?: number;
}): Promise<string> {
  const lifetimeSeconds = Math.min(
    24 * 60 * 60,
    Math.max(
      VIDEO_PLAYBACK_TOKEN_MINIMUM_SECONDS,
      (input.durationSeconds ?? 0) + 30 * 60,
    ),
  );
  const signed = await cloudflareStreamRequest<{ readonly token?: string }>(
    `/${encodeURIComponent(input.playbackId)}/token`,
    {
      method: "POST",
      body: JSON.stringify({
        exp: Math.floor(Date.now() / 1_000) + lifetimeSeconds,
      }),
    },
  );
  const token = signed.token?.trim();
  if (!token) {
    throw new Error("Cloudflare Stream did not return a playback token.");
  }
  return token;
}

export function cloudflareSignedPlaybackUrl(
  url: string,
  playbackId: string,
  token: string,
): string {
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname
    .split("/")
    .map((segment) => (segment === playbackId ? token : segment))
    .join("/");
  return parsed.toString();
}

export function cloudflareEmbedUrl(
  playbackUrl: string,
  playbackId: string,
  playbackToken?: string,
): string {
  const origin = new URL(playbackUrl).origin;
  return `${origin}/${playbackToken ?? playbackId}/iframe`;
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

export function isMuxLivePlanUnavailable(error: unknown): boolean {
  const candidate = error as
    | {
        readonly message?: unknown;
        readonly error?: unknown;
        readonly body?: unknown;
      }
    | undefined;
  let serialized = "";
  try {
    serialized = JSON.stringify(error);
  } catch {
    // A circular provider object can still expose a useful message.
  }
  const text = [
    error instanceof Error ? error.message : "",
    typeof candidate?.message === "string" ? candidate.message : "",
    serialized,
  ]
    .join(" ")
    .toLowerCase();
  return (
    text.includes("live streams are unavailable on the free plan") ||
    (text.includes("live stream") &&
      text.includes("free plan") &&
      text.includes("unavailable"))
  );
}

export function muxDataEnvironmentKey(): string | undefined {
  return process.env.MUX_DATA_ENV_KEY?.trim() || undefined;
}

export function muxLiveVideoQuality(): "plus" | "premium" {
  return process.env.MUX_LIVE_VIDEO_QUALITY?.trim().toLowerCase() === "premium"
    ? "premium"
    : "plus";
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
        // Duna customer tier and Mux encoder quality are separate decisions.
        // Premium Duna routes default to cost-equivalent Mux Plus; Premium
        // encoding remains an explicit operational choice for marquee events.
        video_quality: muxLiveVideoQuality(),
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
  readonly srtPassphrase: string;
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
  if (
    !liveStream.id ||
    !liveStream.stream_key ||
    !liveStream.srt_passphrase ||
    !playback?.id
  ) {
    throw new Error("Mux did not return a complete live-stream session.");
  }
  return {
    liveStreamId: liveStream.id,
    streamKey: liveStream.stream_key,
    srtPassphrase: liveStream.srt_passphrase,
    playbackId: playback.id,
    playbackPolicy,
  };
}

export async function completeMuxLiveVideo(
  liveStreamId: string,
): Promise<void> {
  await getMuxClient().video.liveStreams.complete(liveStreamId);
}

export async function loadMuxLiveIngest(
  liveStreamId: string,
): Promise<{ readonly streamKey: string; readonly srtPassphrase: string }> {
  const liveStream =
    await getMuxClient().video.liveStreams.retrieve(liveStreamId);
  const streamKey = liveStream.stream_key?.trim();
  const srtPassphrase = liveStream.srt_passphrase?.trim();
  if (!streamKey || !srtPassphrase) {
    throw new Error("Mux did not return complete live-stream ingest keys.");
  }
  return { streamKey, srtPassphrase };
}

export async function createMuxLiveOutput(input: {
  readonly liveInputId: string;
  readonly url: string;
  readonly streamKey: string;
  readonly passthrough: string;
}): Promise<{ readonly outputId: string }> {
  const target = await getMuxClient().video.liveStreams.createSimulcastTarget(
    input.liveInputId,
    {
      url: input.url,
      stream_key: input.streamKey,
      passthrough: input.passthrough,
    },
  );
  if (!target.id?.trim()) {
    throw new Error("Mux did not return a simulcast target ID.");
  }
  return { outputId: target.id };
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
