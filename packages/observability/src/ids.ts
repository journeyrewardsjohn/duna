/** Request ids: created once at the edge of each request and carried through. */

export const REQUEST_ID_HEADER = "x-request-id";
export const VERCEL_ID_HEADER = "x-vercel-id";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/;

export function isValidRequestId(value: string | null | undefined): boolean {
  return typeof value === "string" && requestIdPattern.test(value);
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < bytes; index += 1) {
      values[index] = Math.floor(Math.random() * 256);
    }
  }
  return [...values]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

/** A short, quotable id for events that have no request (client errors). */
export function createEventId(prefix = "evt"): string {
  return `${prefix}_${randomHex(8)}`;
}

/** A request id when Duna Hosting supplied none. */
export function createRequestId(): string {
  return `req_${randomHex(12)}`;
}

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The request id for an incoming request at the edge (proxy): the hosting
 * platform's own id when present (so Duna's logs and the platform's request
 * log share one id), otherwise a fresh one. A client-sent `x-request-id` is
 * ignored here so a caller cannot choose or collide ids.
 */
export function resolveEdgeRequestId(headers: HeaderReader): string {
  const vercelId = headers.get(VERCEL_ID_HEADER);
  return isValidRequestId(vercelId) ? (vercelId as string) : createRequestId();
}

/**
 * The request id inside a handler: the one the edge set, else the platform's,
 * else a fresh one (scripts, tests, routes the proxy does not match).
 */
export function requestIdFromHeaders(headers: HeaderReader): string {
  const forwarded = headers.get(REQUEST_ID_HEADER);
  if (isValidRequestId(forwarded)) return forwarded as string;
  return resolveEdgeRequestId(headers);
}
