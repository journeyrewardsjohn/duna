/**
 * Redaction: the one gate every log line, error report and outbound error
 * event passes through. It is enforced, not advisory: the logger, the
 * reporter, the HTTP transport, the client-error endpoint and the Sentry
 * `beforeSend` / `beforeBreadcrumb` hooks all call it, and nothing in this
 * package writes a value that has not been through it.
 *
 * Three layers, applied in order:
 *
 * 1. Field names. A deny list of names (credentials, contact details, names,
 *    addresses, dates of birth, message bodies, free text, health values,
 *    precise location, raw input) replaces the value with `[redacted]`
 *    whatever it holds, including nested objects.
 * 2. Known-safe names (ids, codes, durations, counts, paths, provider and
 *    operation names) keep their value, still pattern-scanned.
 * 3. Every other string is pattern-scanned (tokens, keys, emails, phone
 *    numbers, card numbers, IBANs, credentials in URLs), truncated, and
 *    replaced entirely when it reads like free text.
 *
 * Ids are allowed: a person or organisation id is how a report is linked to
 * an account without copying personal data into logs.
 */

export const REDACTED = "[redacted]";

const MAX_DEPTH = 6;
const MAX_ARRAY = 20;
const MAX_KEYS = 50;
const MAX_STRING = 1_000;
const MAX_UNKNOWN_STRING = 256;
const MAX_STACK = 4_000;
const MAX_STACK_LINES = 25;

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/** Names whose value is never written, matched against the normalised key. */
const deniedExact = new Set([
  "name",
  "names",
  "email",
  "emails",
  "phone",
  "mobile",
  "address",
  "addresses",
  "dob",
  "ip",
  "body",
  "text",
  "content",
  "contents",
  "message",
  "messages",
  "note",
  "notes",
  "comment",
  "comments",
  "description",
  "bio",
  "about",
  "summary",
  "title",
  "subject",
  "caption",
  "reply",
  "query",
  "search",
  "q",
  "location",
  "lat",
  "lng",
  "lon",
  "coords",
  "coordinates",
  "geo",
  "position",
  "input",
  "rawinput",
  "payload",
  "data",
  "params",
  "args",
  "arguments",
  "variables",
  "form",
  "formdata",
  "request",
  "req",
  "response",
  "res",
  "config",
  "headers",
  "cookies",
  "pin",
  "otp",
  "weight",
  "height",
  "age",
  "gender",
  "sex",
  "city",
  "zip",
  "card",
  "pan",
  "cvc",
  "cvv",
  "user",
  "person",
  "profile",
  "guardian",
  "contact",
  "contacts",
]);

const deniedFragments = [
  "authorization",
  "cookie",
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "apikey",
  "accesskey",
  "privatekey",
  "signingkey",
  "signature",
  "credential",
  "verificationcode",
  "authcode",
  "cardnumber",
  "cardholder",
  "cvc",
  "cvv",
  "iban",
  "accountnumber",
  "routingnumber",
  "sortcode",
  "bankaccount",
  "ssn",
  "socialsecurity",
  "taxid",
  "nationalid",
  "passport",
  "license",
  "email",
  "phone",
  "mobilenumber",
  "firstname",
  "lastname",
  "givenname",
  "familyname",
  "fullname",
  "displayname",
  "legalname",
  "nickname",
  "username",
  "contactname",
  "guardianname",
  "parentname",
  "filename",
  "address",
  "street",
  "postcode",
  "postalcode",
  "zipcode",
  "dateofbirth",
  "birthdate",
  "birthday",
  "messagebody",
  "transcript",
  "prompt",
  "freetext",
  "health",
  "heartrate",
  "hrv",
  "vo2",
  "bloodpressure",
  "glucose",
  "bodyweight",
  "bodyfat",
  "bmi",
  "sleep",
  "calorie",
  "stepcount",
  "menstrual",
  "injury",
  "diagnosis",
  "medication",
  "medical",
  "latitude",
  "longitude",
  "geolocation",
  "gps",
  "ipaddress",
  "useragent",
];

/**
 * Names that are safe by construction: identifiers, codes and measurements
 * the code itself produces. Values are kept (strings are still scanned).
 */
const safeExact = new Set([
  "event",
  "level",
  "ts",
  "time",
  "timestamp",
  "occurredat",
  "path",
  "procedure",
  "type",
  "code",
  "kind",
  "status",
  "statuscode",
  "httpstatus",
  "outcome",
  "classification",
  "reason",
  "provider",
  "operation",
  "surface",
  "release",
  "environment",
  "env",
  "demo",
  "method",
  "route",
  "digest",
  "reference",
  "attempt",
  "attempts",
  "count",
  "total",
  "durationms",
  "elapsedms",
  "retryafterseconds",
  "errorname",
  "errorcode",
  "errortype",
  "boundary",
  "component",
  "runtime",
  "source",
  "mode",
  "plan",
  "currency",
  "amountminor",
  "issues",
  "handled",
  "reported",
  "scope",
  "role",
  "roles",
  "flag",
  "feature",
  "channel",
  "action",
  "domain",
  "host",
]);

export type KeyVerdict = "deny" | "safe" | "unknown";

export function classifyKey(key: string): KeyVerdict {
  const normalized = normalizeKey(key);
  if (!normalized) return "unknown";
  if (deniedExact.has(normalized)) return "deny";
  if (deniedFragments.some((fragment) => normalized.includes(fragment))) {
    return "deny";
  }
  if (safeExact.has(normalized)) return "safe";
  // Identifiers: personId, organizationId, requestId, ids, stripeSessionId ...
  if (normalized.endsWith("id") || normalized.endsWith("ids")) return "safe";
  if (/(count|ms|seconds|bytes|size|length|index|version)$/.test(normalized)) {
    return "safe";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// String patterns
// ---------------------------------------------------------------------------

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids Duna's providers issue; long but not secret (secrets are caught first). */
const providerIdPrefix =
  /^(?:cs|pi|cus|sub|in|ch|re|acct|price|prod|evt|pm|seti|txn|po|tr|py|si|ii|il|cn|dp|ba|card|src|tok_test|plan|coupon|promo|bpc|ibt|tmr|tml|vs|vr)_/;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

interface PatternRule {
  readonly pattern: RegExp;
  readonly replace: (match: string, ...groups: string[]) => string;
}

const patternRules: readonly PatternRule[] = [
  // Bound query parameters in database driver errors ("Failed query: ...
  // params: <values>") carry whatever was being written.
  {
    pattern: /\bparams: [\s\S]*?(?=\n\s+at |$)/g,
    replace: () => `params: ${REDACTED}`,
  },
  // Credentials embedded in URLs: scheme://user:password@host
  {
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
    replace: (_match, scheme) => `${scheme}${REDACTED}@`,
  },
  // JSON Web Tokens.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g,
    replace: () => "[redacted:token]",
  },
  // Authorization schemes.
  {
    pattern:
      /\b(Bearer|Basic|Token|Digest|bearer|basic)\s+(?=[A-Za-z0-9._~+/=:-]*[\d=_.~+/:-])[A-Za-z0-9._~+/=:-]{6,}/g,
    replace: (_match, scheme) => `${scheme} ${REDACTED}`,
  },
  // Stripe client secrets (pi_..._secret_..., seti_..., cs_...).
  {
    pattern: /\b[a-z]{2,5}_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g,
    replace: () => "[redacted:secret]",
  },
  // Provider key formats: Stripe, webhook secrets, OpenAI, Slack, GitHub,
  // AWS, Resend, Firecrawl, Sentry auth tokens, Mapbox secret tokens.
  {
    pattern:
      /\b(?:(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{6,}|whsec_[A-Za-z0-9+/=]{6,}|sk-[A-Za-z0-9_-]{16,}|xox[abposr]-[A-Za-z0-9-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|re_[A-Za-z0-9_]{16,}|fc-[A-Fa-f0-9]{16,}|sntry[su]_[A-Za-z0-9_=+/-]{16,}|sk\.eyJ[A-Za-z0-9._-]+)/g,
    replace: () => "[redacted:key]",
  },
  // Sensitive query-string parameters.
  {
    pattern:
      /([?&#](?:access_token|refresh_token|id_token|token|code|state|key|api_key|apikey|secret|client_secret|signature|sig|password|email|phone|auth|session|jwt)=)[^&#\s]*/gi,
    replace: (_match, prefix) => `${prefix}${REDACTED}`,
  },
  // Email addresses.
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replace: () => "[redacted:email]",
  },
  // IBAN.
  {
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g,
    replace: () => "[redacted:iban]",
  },
  // Card numbers: 15 or 16 digits, optionally grouped, Luhn-valid.
  {
    pattern: /(?<![\w-])(?:\d[ -]?){14,15}\d(?![\w-])/g,
    replace: (match) => {
      const digits = match.replaceAll(/[ -]/g, "");
      return (digits.length === 15 || digits.length === 16) && luhnValid(digits)
        ? "[redacted:card]"
        : match;
    },
  },
  // International phone numbers.
  {
    pattern: /(?<![\w])\+\d[\d\s().-]{6,18}\d(?![\w])/g,
    replace: () => "[redacted:phone]",
  },
  // North American phone numbers: (555) 123-4567, 555-123-4567, 555.123.4567.
  {
    pattern: /(?<![\w-])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w-])/g,
    replace: () => "[redacted:phone]",
  },
  // Long high-entropy tokens (API keys, session secrets, base64 blobs). A
  // 40-character hex string is a commit SHA and stays; longer hex is a key.
  {
    pattern: /(?<![\w-])[A-Za-z0-9+_]{32,}={0,2}(?![\w-])/g,
    replace: (match) => {
      if (providerIdPrefix.test(match)) return match;
      if (/^[0-9a-f]+$/i.test(match)) {
        return match.length <= 40 ? match : "[redacted:token]";
      }
      const hasUpper = /[A-Z]/.test(match);
      const hasLower = /[a-z]/.test(match);
      const digits = match.replaceAll(/\D/g, "").length;
      if (hasUpper && hasLower && digits > 0) return "[redacted:token]";
      if (!match.includes("_") && digits / match.length >= 0.2) {
        return "[redacted:token]";
      }
      return match;
    },
  },
];

/** Scan one string for secrets and contact details; never throws. */
export function scrubString(value: string, maxLength = MAX_STRING): string {
  if (uuidPattern.test(value)) return value;
  let output =
    value.length > maxLength * 4 ? value.slice(0, maxLength * 4) : value;
  for (const rule of patternRules) {
    output = output.replace(rule.pattern, rule.replace as never);
  }
  return output.length > maxLength
    ? `${output.slice(0, maxLength)}…[truncated]`
    : output;
}

/** Free text: several words of prose in a field we do not know to be safe. */
function looksLikeFreeText(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length >= 5 && /[a-z]{2,}/i.test(value);
}

/**
 * Strip query strings and fragments from a URL-ish string and, with
 * `paramPaths`, replace path segments that are not plain route words with
 * `:param` (player handles and slugs are derived from names).
 */
export function scrubUrl(
  value: string,
  options: { readonly paramPaths?: boolean } = {},
): string {
  try {
    const hasOrigin = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    const url = new URL(value, "https://duna.invalid");
    const segments = url.pathname.split("/").map((segment) => {
      if (!options.paramPaths || !segment) return segment;
      if (/^[a-z][a-z0-9._]*$/.test(segment)) return segment;
      if (uuidPattern.test(segment) || /^\d+$/.test(segment)) return segment;
      if (/^(?:\(|\[)/.test(segment)) return segment;
      return ":param";
    });
    const path = scrubString(segments.join("/"));
    return hasOrigin ? `${url.protocol}//${url.host}${path}` : path;
  } catch {
    return scrubString(value.split(/[?#]/)[0] ?? "");
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string | number;
  readonly status?: number;
  readonly issues?: number;
  readonly cause?: SerializedError;
  readonly errors?: readonly SerializedError[];
}

const safeErrorCodePattern = /^[A-Za-z0-9_.:-]{1,64}$/;

function scrubStack(stack: string): string {
  const lines = stack.split("\n").slice(0, MAX_STACK_LINES);
  return scrubString(lines.join("\n"), MAX_STACK);
}

function isErrorLike(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as { message?: unknown }).message === "string" &&
      typeof (value as { name?: unknown }).name === "string" &&
      ("stack" in value || "cause" in value))
  );
}

/**
 * Serialise an error to a safe shape: name, scanned message and stack, a
 * short code and HTTP status when present, the cause chain. Every other
 * property (request objects, configs, responses, inputs an SDK attached) is
 * dropped.
 */
export function serializeError(error: unknown, depth = 0): SerializedError {
  if (!isErrorLike(error)) {
    if (typeof error === "string") {
      return { name: "NonError", message: scrubString(error) };
    }
    return {
      name: "NonError",
      message:
        error === null || error === undefined
          ? String(error)
          : `Non-error value thrown (${typeof error})`,
    };
  }
  const record = error as Error & {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    issues?: unknown;
    errors?: unknown;
    cause?: unknown;
  };
  let code: string | number | undefined;
  if (
    typeof record.code === "string" &&
    safeErrorCodePattern.test(record.code)
  ) {
    code = record.code;
  } else if (typeof record.code === "number" && Number.isFinite(record.code)) {
    code = record.code;
  }
  const statusCandidate =
    typeof record.status === "number" ? record.status : record.statusCode;
  const status =
    typeof statusCandidate === "number" &&
    Number.isInteger(statusCandidate) &&
    statusCandidate >= 100 &&
    statusCandidate < 600
      ? statusCandidate
      : undefined;
  const name =
    typeof record.name === "string" &&
    /^[A-Za-z0-9_$.]{1,80}$/.test(record.name)
      ? record.name
      : "Error";
  const serialized: {
    -readonly [K in keyof SerializedError]: SerializedError[K];
  } = {
    name,
    message: scrubString(String(record.message ?? "")),
  };
  if (typeof record.stack === "string")
    serialized.stack = scrubStack(record.stack);
  if (code !== undefined) serialized.code = code;
  if (status !== undefined) serialized.status = status;
  if (Array.isArray(record.issues)) serialized.issues = record.issues.length;
  if (depth < 3 && record.cause !== undefined && record.cause !== error) {
    serialized.cause = serializeError(record.cause, depth + 1);
  }
  if (depth < 2 && Array.isArray(record.errors)) {
    serialized.errors = record.errors
      .slice(0, 5)
      .map((inner) => serializeError(inner, depth + 1));
  }
  return serialized;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const safeHeaderNames = new Set([
  "accept",
  "content-length",
  "content-type",
  "x-request-id",
  "x-vercel-id",
  "x-vercel-cache",
  "retry-after",
]);

function isHeadersLike(value: object): value is Headers {
  return (
    !(value instanceof Map) &&
    typeof (value as Headers).append === "function" &&
    typeof (value as Headers).get === "function" &&
    typeof (value as Headers).forEach === "function" &&
    typeof (value as Headers).has === "function"
  );
}

function isRequestLike(value: object): boolean {
  return (
    "headers" in value &&
    ("method" in value || "url" in value || "status" in value) &&
    typeof (value as { headers: unknown }).headers === "object"
  );
}

function redactHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, name) => {
    output[name] = safeHeaderNames.has(name.toLowerCase())
      ? scrubString(value, MAX_UNKNOWN_STRING)
      : REDACTED;
  });
  return output;
}

function redactValue(
  value: unknown,
  verdict: KeyVerdict,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (verdict === "deny") {
    return value === undefined || value === null || value === ""
      ? value
      : REDACTED;
  }
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case "string":
      if (verdict === "safe") return scrubString(value);
      if (looksLikeFreeText(value)) return "[redacted:text]";
      return scrubString(value, MAX_UNKNOWN_STRING);
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "function":
    case "symbol":
      return undefined;
    default:
      break;
  }
  const object = value as object;
  if (object instanceof Date) {
    return Number.isNaN(object.getTime())
      ? "Invalid Date"
      : object.toISOString();
  }
  if (isErrorLike(object)) return serializeError(object);
  if (seen.has(object)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (
    ArrayBuffer.isView(object) ||
    object instanceof ArrayBuffer ||
    (typeof Blob !== "undefined" && object instanceof Blob)
  ) {
    return "[binary]";
  }
  if (isHeadersLike(object)) return redactHeaders(object);
  if (isRequestLike(object)) return "[redacted:request]";
  seen.add(object);
  try {
    if (Array.isArray(object) || object instanceof Set) {
      const items = [...(object as Iterable<unknown>)];
      const output = items
        .slice(0, MAX_ARRAY)
        .map((item) => redactValue(item, verdict, depth + 1, seen));
      if (items.length > MAX_ARRAY)
        output.push(`[+${items.length - MAX_ARRAY} more]`);
      return output;
    }
    const entries =
      object instanceof Map
        ? [...object.entries()].map(
            ([key, item]) => [String(key), item] as const,
          )
        : Object.entries(object);
    const output: Record<string, unknown> = {};
    for (const [key, item] of entries.slice(0, MAX_KEYS)) {
      const redacted = redactValue(item, classifyKey(key), depth + 1, seen);
      if (redacted !== undefined) output[key] = redacted;
    }
    if (entries.length > MAX_KEYS)
      output["[keys]"] = `+${entries.length - MAX_KEYS} more`;
    return output;
  } finally {
    seen.delete(object);
  }
}

/** Redact any value to a JSON-safe copy. Never throws, never mutates. */
export function redact(value: unknown): unknown {
  try {
    return redactValue(value, "unknown", 0, new WeakSet());
  } catch {
    return "[unserializable]";
  }
}

/** Redact a field bag (the second argument of every log call). */
export function redactFields(
  fields: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!fields) return {};
  const output = redact(fields);
  return output && typeof output === "object" && !Array.isArray(output)
    ? (output as Record<string, unknown>)
    : {};
}
