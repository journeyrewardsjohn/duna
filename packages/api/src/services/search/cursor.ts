/**
 * Search cursors (B10): the sort key of the last result on a page, the
 * radius the first page chose, and a fingerprint of the query. The next
 * page is every result whose key sorts after it, so paging never repeats a
 * result and never skips one that stayed put while the data changed (a
 * keyset cursor, not an offset). Opaque to clients; at most 256 characters.
 */
import type { DiscoverySortKey } from "../../discovery-ranking";

const VERSION = 1;
export const CURSOR_MAX_LENGTH = 256;
/** Titles are cut in the cursor so it stays short; ties fall back to the id. */
const TITLE_CHARS = [64, 32, 8, 0] as const;

export class SearchCursorError extends Error {
  constructor() {
    super("These results changed. Search again to see the latest.");
    this.name = "SearchCursorError";
  }
}

interface CursorPayload {
  readonly v: number;
  /** Query fingerprint. */
  readonly f: string;
  /** Radius chosen on the first page (miles); null: expanded worldwide. */
  readonly r?: number | null;
  /** How many title characters the key keeps. */
  readonly t: number;
  readonly k: DiscoverySortKey;
}

/** FNV-1a, 32 bits, hex: a fingerprint, not a secret. */
export function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function truncateKeyTitle(
  key: DiscoverySortKey,
  chars: number,
): DiscoverySortKey {
  return [key[0], key[1], key[2], key[3], key[4].slice(0, chars), key[5]];
}

export function encodeCursor(input: {
  readonly fingerprint: string;
  readonly radiusMiles?: number | null;
  readonly key: DiscoverySortKey;
}): { readonly cursor: string; readonly titleChars: number } {
  for (const chars of TITLE_CHARS) {
    const payload: CursorPayload = {
      v: VERSION,
      f: input.fingerprint,
      ...(input.radiusMiles !== undefined ? { r: input.radiusMiles } : {}),
      t: chars,
      k: truncateKeyTitle(input.key, chars),
    };
    const cursor = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url",
    );
    if (cursor.length <= CURSOR_MAX_LENGTH) {
      return { cursor, titleChars: chars };
    }
  }
  throw new Error("Search cursor is too long");
}

function isSortKey(value: unknown): value is DiscoverySortKey {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    typeof value[0] === "number" &&
    (value[1] === 0 || value[1] === 1) &&
    (value[2] === null || typeof value[2] === "number") &&
    (value[3] === null || typeof value[3] === "number") &&
    typeof value[4] === "string" &&
    typeof value[5] === "string"
  );
}

export function decodeCursor(
  cursor: string,
  expectedFingerprint: string,
): {
  readonly radiusMiles?: number | null;
  readonly titleChars: number;
  readonly key: DiscoverySortKey;
} {
  if (cursor.length > CURSOR_MAX_LENGTH) throw new SearchCursorError();
  let payload: Partial<CursorPayload>;
  try {
    payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;
  } catch {
    throw new SearchCursorError();
  }
  if (
    payload.v !== VERSION ||
    payload.f !== expectedFingerprint ||
    !isSortKey(payload.k) ||
    typeof payload.t !== "number" ||
    !(TITLE_CHARS as readonly number[]).includes(payload.t) ||
    (payload.r !== undefined &&
      payload.r !== null &&
      typeof payload.r !== "number")
  ) {
    throw new SearchCursorError();
  }
  return {
    ...(payload.r !== undefined ? { radiusMiles: payload.r } : {}),
    titleChars: payload.t,
    key: payload.k,
  };
}
