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

export function createVenueMediaPath(
  organizationId: string,
  contentType: string,
  identifier = crypto.randomUUID(),
): string {
  const configuration = mediaType(contentType);
  if (
    !configuration ||
    configuration.kind !== "image" ||
    !uuidPattern.test(organizationId) ||
    !uuidPattern.test(identifier)
  ) {
    throw new Error("Duna could not create a safe venue image path.");
  }
  return `venues/${organizationId}/${identifier}.${configuration.extension}`;
}

export function createCourtMediaPath(
  organizationId: string,
  contentType: string,
  identifier = crypto.randomUUID(),
): string {
  const configuration = mediaType(contentType);
  if (
    !configuration ||
    configuration.kind !== "image" ||
    !uuidPattern.test(organizationId) ||
    !uuidPattern.test(identifier)
  ) {
    throw new Error("Duna could not create a safe court image path.");
  }
  return `courts/${organizationId}/${identifier}.${configuration.extension}`;
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

export function assertVenueMediaPath(
  pathname: string,
  organizationId: string,
  extension: string,
): void {
  const prefix = `venues/${organizationId}/`;
  const identifier = pathname.slice(prefix.length, -(extension.length + 1));
  if (
    !uuidPattern.test(organizationId) ||
    !pathname.startsWith(prefix) ||
    !pathname.endsWith(`.${extension}`) ||
    !uuidPattern.test(identifier) ||
    pathname !== `${prefix}${identifier}.${extension}`
  ) {
    throw new Error("The venue image destination is invalid.");
  }
}

export function assertCourtMediaPath(
  pathname: string,
  organizationId: string,
  extension: string,
): void {
  const prefix = `courts/${organizationId}/`;
  const identifier = pathname.slice(prefix.length, -(extension.length + 1));
  if (
    !uuidPattern.test(organizationId) ||
    !pathname.startsWith(prefix) ||
    !pathname.endsWith(`.${extension}`) ||
    !uuidPattern.test(identifier) ||
    pathname !== `${prefix}${identifier}.${extension}`
  ) {
    throw new Error("The court image destination is invalid.");
  }
}

export async function optimizeImageUpload(file: File): Promise<File> {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/avif" ||
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const maximumEdge = 2_400;
  const scale = Math.min(
    1,
    maximumEdge / Math.max(bitmap.width, bitmap.height),
  );
  if (scale === 1 && file.type === "image/webp" && file.size < 2_000_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86),
  );
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
    type: "image/webp",
    lastModified: file.lastModified,
  });
}
