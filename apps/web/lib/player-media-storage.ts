const acceptedPlayerMedia = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export const playerMediaMaximumBytes = 15 * 1024 * 1024;

export function validatePlayerMediaInput(input: {
  readonly contentType: string;
  readonly size: number;
}) {
  const extension =
    acceptedPlayerMedia[input.contentType as keyof typeof acceptedPlayerMedia];
  if (!extension) {
    throw new Error("Use a JPG, PNG, WebP, or AVIF player image.");
  }
  if (!Number.isFinite(input.size) || input.size < 1) {
    throw new Error("Choose a player image before uploading.");
  }
  if (input.size > playerMediaMaximumBytes) {
    throw new Error("Player reference images must be 15 MB or smaller.");
  }
  return { extension, contentType: input.contentType };
}

export function playerMediaPath(input: {
  readonly personId: string;
  readonly kind: "action" | "portrait";
  readonly extension: string;
}) {
  return `player-media/${input.personId}/${input.kind}/${crypto.randomUUID()}.${input.extension}`;
}

export function assertPlayerMediaPath(
  pathname: string,
  input: {
    readonly personId: string;
    readonly kind: "action" | "portrait";
    readonly extension: string;
  },
) {
  const escapedPersonId = input.personId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedExtension = input.extension.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const pattern = new RegExp(
    `^player-media/${escapedPersonId}/${input.kind}/[0-9a-f-]{36}\\.${escapedExtension}$`,
    "i",
  );
  if (!pattern.test(pathname)) {
    throw new Error("The player image path is invalid.");
  }
}
