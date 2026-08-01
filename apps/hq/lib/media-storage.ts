import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const imageTypes = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const videoTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const extensionByType: Readonly<Record<string, string>> = {
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

function storageConfiguration() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    throw new Error(
      "Owned media storage is not connected yet. Add the R2 account, bucket, credentials, and public delivery URL in Settings.",
    );
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

export async function createEventMediaUpload(input: {
  readonly organizationId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
}) {
  const kind: "image" | "video" | undefined = imageTypes.has(input.contentType)
    ? "image"
    : videoTypes.has(input.contentType)
      ? "video"
      : undefined;
  if (!kind) {
    throw new Error("Use a JPEG, PNG, WebP, AVIF, MP4, MOV, or WebM file.");
  }
  const maxBytes = kind === "image" ? 15_000_000 : 250_000_000;
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > maxBytes
  ) {
    throw new Error(
      kind === "image"
        ? "Images must be smaller than 15 MB."
        : "Videos must be smaller than 250 MB.",
    );
  }
  const configuration = storageConfiguration();
  const extension = extensionByType[input.contentType] ?? "bin";
  const key = `events/${input.organizationId}/${crypto.randomUUID()}.${extension}`;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });
  const command = new PutObjectCommand({
    Bucket: configuration.bucket,
    Key: key,
    ContentType: input.contentType,
    CacheControl: "public, max-age=31536000, immutable",
    Metadata: {
      "duna-organization": input.organizationId,
      "original-name": input.fileName.slice(0, 180),
    },
  });
  return {
    kind,
    key,
    maxBytes,
    uploadUrl: await getSignedUrl(client, command, { expiresIn: 600 }),
    publicUrl: `${configuration.publicBaseUrl}/${key}`,
  };
}
