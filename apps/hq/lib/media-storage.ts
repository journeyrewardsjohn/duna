const mediaTypes = {
  "image/avif": { extension: "avif", kind: "image", maxBytes: 15_000_000 },
  "image/jpeg": { extension: "jpg", kind: "image", maxBytes: 15_000_000 },
  "image/png": { extension: "png", kind: "image", maxBytes: 15_000_000 },
  "image/webp": { extension: "webp", kind: "image", maxBytes: 15_000_000 },
  "video/mp4": { extension: "mp4", kind: "video", maxBytes: 250_000_000 },
  "video/quicktime": {
    extension: "mov",
    kind: "video",
    maxBytes: 250_000_000,
  },
  "video/webm": {
    extension: "webm",
    kind: "video",
    maxBytes: 250_000_000,
  },
} as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EventMediaKind = "image" | "video";

export interface EventMediaInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
}

export interface ValidatedEventMedia {
  readonly contentType: keyof typeof mediaTypes;
  readonly extension: string;
  readonly kind: EventMediaKind;
  readonly maxBytes: number;
}

function mediaType(contentType: string): ValidatedEventMedia | undefined {
  const configuration =
    mediaTypes[contentType as keyof typeof mediaTypes] ?? undefined;
  if (!configuration) return undefined;
  return {
    contentType: contentType as keyof typeof mediaTypes,
    extension: configuration.extension,
    kind: configuration.kind,
    maxBytes: configuration.maxBytes,
  };
}

export function validateEventMediaInput(
  input: EventMediaInput,
): ValidatedEventMedia {
  const configuration = mediaType(input.contentType);
  if (!configuration) {
    throw new Error("Use a JPEG, PNG, WebP, AVIF, MP4, MOV, or WebM file.");
  }
  if (!input.fileName.trim() || input.fileName.length > 180) {
    throw new Error("Choose a media file with a valid filename.");
  }
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > configuration.maxBytes
  ) {
    throw new Error(
      configuration.kind === "image"
        ? "Images must be smaller than 15 MB."
        : "Videos must be smaller than 250 MB.",
    );
  }
  return configuration;
}

export function createEventMediaPath(
  organizationId: string,
  contentType: string,
  identifier = crypto.randomUUID(),
): string {
  const configuration = mediaType(contentType);
  if (
    !configuration ||
    !uuidPattern.test(organizationId) ||
    !uuidPattern.test(identifier)
  ) {
    throw new Error("Duna could not create a safe event media path.");
  }
  return `events/${organizationId}/${identifier}.${configuration.extension}`;
}

export function assertEventMediaPath(
  pathname: string,
  organizationId: string,
  extension: string,
): void {
  const prefix = `events/${organizationId}/`;
  const identifier = pathname.slice(prefix.length, -(extension.length + 1));
  if (
    !uuidPattern.test(organizationId) ||
    !pathname.startsWith(prefix) ||
    !pathname.endsWith(`.${extension}`) ||
    !uuidPattern.test(identifier) ||
    pathname !== `${prefix}${identifier}.${extension}`
  ) {
    throw new Error("The event media destination is invalid.");
  }
}
