/**
 * Reading errors without importing the API or the observability package:
 * these helpers duck-type the shapes Duna's clients receive, so the kit can
 * show a plain message, map a server error to its fields and show the
 * reference a developer needs to find the log line.
 *
 * Shapes understood:
 * - tRPC client errors: `error.data.requestId`, `error.data.zodError.fieldErrors`
 *   (zod's flattened errors), `error.data.fieldErrors`.
 * - Next.js error pages: `error.digest`.
 * - Plain objects: `{ requestId }`, `{ reference }`, `{ fieldErrors }`,
 *   `{ issues: [{ path, message }] }`.
 */

/** Field name to message. A dotted path (`address.city`) for nested fields. */
export type FieldErrors = Record<string, string>;

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
  typeof value === "object" && value !== null;

const firstString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value))
    return value.find((item) => typeof item === "string");
  return undefined;
};

/**
 * The reference a person can quote to support: the request id the API put
 * on the error, a Next.js digest, or an explicit `reference`. Undefined when
 * there is none; never invents one.
 */
export function errorReference(error: unknown): string | undefined {
  if (!isBag(error)) return undefined;
  const data = isBag(error.data) ? error.data : undefined;
  const candidates = [
    error.reference,
    data?.requestId,
    error.requestId,
    error.digest,
    isBag(error.cause) ? errorReference(error.cause) : undefined,
  ];
  return candidates.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

/** Server errors mapped to the form's field names, or null when none apply. */
export function fieldErrorsFrom(error: unknown): FieldErrors | null {
  if (!isBag(error)) return null;
  const data = isBag(error.data) ? error.data : undefined;
  const out: FieldErrors = {};

  const fromRecord = (record: unknown) => {
    if (!isBag(record)) return;
    for (const [name, value] of Object.entries(record)) {
      const message = firstString(value);
      if (message && !out[name]) out[name] = message;
    }
  };
  const fromIssues = (issues: unknown) => {
    if (!Array.isArray(issues)) return;
    for (const issue of issues) {
      if (!isBag(issue) || typeof issue.message !== "string") continue;
      const path = Array.isArray(issue.path)
        ? issue.path.join(".")
        : typeof issue.path === "string"
          ? issue.path
          : "";
      if (path && !out[path]) out[path] = issue.message;
    }
  };

  const zod = isBag(data?.zodError) ? data.zodError : undefined;
  fromRecord(zod?.fieldErrors);
  fromRecord(data?.fieldErrors);
  fromRecord(error.fieldErrors);
  fromIssues(error.issues);
  fromIssues(data?.issues);
  return Object.keys(out).length > 0 ? out : null;
}

const REFERENCE_SUFFIX = /\s*Reference:\s*\S+\s*$/i;

/**
 * What to tell the person. Errors from Duna's API carry a message written for
 * people (unexpected failures already say "Something went wrong on our
 * side."), so it is used, minus the "Reference: …" suffix the UI shows on
 * its own line. Anything else (a network failure, a thrown TypeError) gets
 * the fallback: a person never sees a stack, provider text or a vendor name.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (!isBag(error)) return fallback;
  const fromApi = isBag(error.data) || isBag(error.shape);
  const explicit = typeof error.userMessage === "string";
  const message = explicit ? error.userMessage : error.message;
  if (!(fromApi || explicit) || typeof message !== "string") return fallback;
  const plain = message.replace(REFERENCE_SUFFIX, "").trim();
  return plain || fallback;
}

/** True for the abort a cancelled request rejects with. */
export function isAbortError(error: unknown): boolean {
  return isBag(error) && error.name === "AbortError";
}

/**
 * A new idempotency key: a v4 UUID, the shape the API's
 * `idempotencyKey: z.string().uuid()` inputs expect.
 */
export function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function")
    return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < 16; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
