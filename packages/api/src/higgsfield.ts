import { randomUUID } from "node:crypto";

const DEFAULT_API_URL = "https://fnf-api-gw.higgsfield.ai/fnf";
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

export class HiggsfieldError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "SOURCE_IMAGE_INVALID"
      | "SOURCE_IMAGE_TOO_LARGE"
      | "PROVIDER_REQUEST_FAILED"
      | "PROVIDER_RESPONSE_INVALID",
    message: string,
  ) {
    super(message);
  }
}

type HiggsfieldConfig = {
  readonly apiUrl: string;
  readonly token: string;
  readonly workspaceId: string;
};

export type HiggsfieldJob = {
  readonly id: string;
  readonly status: string;
  readonly jobType: string;
  readonly resultUrl?: string;
  readonly minResultUrl?: string;
  readonly failureReason?: string;
};

function configured(): HiggsfieldConfig | undefined {
  const token = process.env.HIGGSFIELD_API_TOKEN?.trim();
  const workspaceId = process.env.HIGGSFIELD_WORKSPACE_ID?.trim();
  if (!token || !workspaceId) return undefined;
  return {
    apiUrl: (process.env.HIGGSFIELD_API_URL ?? DEFAULT_API_URL).replace(
      /\/+$/,
      "",
    ),
    token,
    workspaceId,
  };
}

export function isHiggsfieldConfigured(): boolean {
  return Boolean(configured());
}

function requireConfig(): HiggsfieldConfig {
  const value = configured();
  if (!value) {
    throw new HiggsfieldError(
      "NOT_CONFIGURED",
      "Higgsfield generation is not configured for this environment.",
    );
  }
  return value;
}

function camelizeJob(
  value: Record<string, unknown>,
  fallbackStatus?: string,
): HiggsfieldJob {
  const id = typeof value.id === "string" ? value.id : undefined;
  const status =
    typeof value.status === "string" ? value.status : fallbackStatus;
  const jobType =
    typeof value.job_type === "string" ? value.job_type : undefined;
  if (!id || !status || !jobType) {
    throw new HiggsfieldError(
      "PROVIDER_RESPONSE_INVALID",
      "Higgsfield returned an incomplete generation job.",
    );
  }
  return {
    id,
    status,
    jobType,
    resultUrl:
      typeof value.result_url === "string" ? value.result_url : undefined,
    minResultUrl:
      typeof value.min_result_url === "string"
        ? value.min_result_url
        : undefined,
    failureReason:
      typeof value.failure_reason === "string"
        ? value.failure_reason
        : typeof value.error === "string"
          ? value.error
          : undefined,
  };
}

async function providerRequest<T>(input: {
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}): Promise<T> {
  const config = requireConfig();
  const response = await fetch(`${config.apiUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "hf-workspace-id": config.workspaceId,
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  const text = await response.text();
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : undefined;
  } catch {
    value = undefined;
  }
  if (!response.ok) {
    const providerMessage =
      value && typeof value === "object" && "detail" in value
        ? String(value.detail)
        : undefined;
    throw new HiggsfieldError(
      "PROVIDER_REQUEST_FAILED",
      providerMessage
        ? `Higgsfield could not complete this request: ${providerMessage}`
        : `Higgsfield could not complete this request (HTTP ${response.status}).`,
    );
  }
  if (!value || typeof value !== "object") {
    throw new HiggsfieldError(
      "PROVIDER_RESPONSE_INVALID",
      "Higgsfield returned an unreadable response.",
    );
  }
  return value as T;
}

function imageContentType(value: string | null): string {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "image/avif"
  ) {
    return type;
  }
  throw new HiggsfieldError(
    "SOURCE_IMAGE_INVALID",
    "A supplied artwork reference was not a supported image.",
  );
}

export async function uploadHiggsfieldReference(
  sourceUrl: string,
): Promise<string> {
  const source = await fetch(sourceUrl, { redirect: "follow" });
  if (!source.ok) {
    throw new HiggsfieldError(
      "SOURCE_IMAGE_INVALID",
      "Duna could not retrieve one of the supplied artwork references.",
    );
  }
  const contentType = imageContentType(source.headers.get("content-type"));
  const declaredLength = Number(source.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REFERENCE_BYTES) {
    throw new HiggsfieldError(
      "SOURCE_IMAGE_TOO_LARGE",
      "Each artwork reference must be smaller than 20 MB.",
    );
  }
  const bytes = new Uint8Array(await source.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new HiggsfieldError(
      "SOURCE_IMAGE_INVALID",
      "One of the artwork references was empty.",
    );
  }
  if (bytes.byteLength > MAX_REFERENCE_BYTES) {
    throw new HiggsfieldError(
      "SOURCE_IMAGE_TOO_LARGE",
      "Each artwork reference must be smaller than 20 MB.",
    );
  }
  const slot = await providerRequest<{
    readonly id?: string;
    readonly upload_url?: string;
  }>({
    path: "/developer/v2alpha/media?type=image",
    method: "POST",
    idempotencyKey: randomUUID(),
  });
  if (!slot.id || !slot.upload_url) {
    throw new HiggsfieldError(
      "PROVIDER_RESPONSE_INVALID",
      "Higgsfield did not return an image-upload slot.",
    );
  }
  const upload = await fetch(slot.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  if (!upload.ok) {
    throw new HiggsfieldError(
      "PROVIDER_REQUEST_FAILED",
      "Higgsfield could not receive an artwork reference.",
    );
  }
  await providerRequest<Record<string, unknown>>({
    path: `/developer/v2alpha/media/${encodeURIComponent(slot.id)}/confirm?type=image`,
    method: "POST",
    idempotencyKey: randomUUID(),
  });
  return slot.id;
}

export async function createHiggsfieldImage(input: {
  readonly jobType: "gpt_image_2" | "nano_banana_pro";
  readonly prompt: string;
  readonly imageReferenceIds: readonly string[];
  readonly aspectRatio: "1:1" | "4:3" | "16:9";
  readonly resolution: "1k" | "2k";
  readonly quality?: "low" | "medium" | "high";
  readonly idempotencyKey?: string;
}): Promise<HiggsfieldJob> {
  const job = await providerRequest<Record<string, unknown>>({
    path: `/developer/v2alpha/images/${input.jobType}/generations`,
    method: "POST",
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    body: {
      params: {
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        ...(input.quality ? { quality: input.quality } : {}),
        image_references: input.imageReferenceIds.map((id) => ({
          id,
          type: "media_input",
        })),
      },
    },
  });
  // The generation endpoint acknowledges accepted work with an id and job type;
  // detailed lifecycle state is returned by the jobs endpoint.
  return camelizeJob(job, "queued");
}

export async function getHiggsfieldJob(id: string): Promise<HiggsfieldJob> {
  const job = await providerRequest<Record<string, unknown>>({
    path: `/developer/v2alpha/jobs/${encodeURIComponent(id)}`,
    method: "GET",
  });
  return camelizeJob(job);
}

export function isHiggsfieldTerminal(status: string): boolean {
  return ["completed", "failed", "cancelled", "canceled"].includes(
    status.toLowerCase(),
  );
}
