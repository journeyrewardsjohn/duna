/**
 * Sentry adapter, typed structurally so this package carries no vendor
 * dependency. The apps pass their `@sentry/nextjs` module in; React Native
 * will pass `@sentry/react-native` once the native SDK lands.
 *
 * Privacy posture (enforced here, not left to dashboard settings):
 * - `sendDefaultPii: false`; no session replay; no local variables; no
 *   screenshots or view hierarchy.
 * - `beforeSend` / `beforeSendSpan` / `beforeBreadcrumb` apply the
 *   same redaction as the logger; request bodies, cookies, query strings and
 *   non-allow-listed headers are removed; URLs lose query strings and any
 *   path segment that is not a plain route word (slugs and handles are
 *   derived from names).
 * - The user is the internal person id only.
 * - Console and UI-click breadcrumbs are dropped (they can carry text).
 */
import { redact, redactFields, scrubString, scrubUrl } from "./redact";
import type { ReportTransport, Surface } from "./runtime";
import type { ErrorReport } from "./types";

export interface SentryCaptureContext {
  level?: "warning" | "error" | "fatal";
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id: string };
  fingerprint?: string[];
}

export interface SentryLike {
  captureException(
    exception: unknown,
    captureContext?: SentryCaptureContext,
  ): string;
}

/** Rebuild the error so Sentry never sees the raw message or attached properties. */
function sanitizedError(report: ErrorReport): Error {
  const error = new Error(report.error.message);
  error.name = report.error.name;
  if (report.error.stack) error.stack = report.error.stack;
  return error;
}

export function createSentryTransport(sentry: SentryLike): ReportTransport {
  return {
    name: "sentry",
    send(report) {
      const actorId =
        typeof report.context.actorId === "string"
          ? report.context.actorId
          : undefined;
      const tags: Record<string, string> = {
        event: report.event,
        reference: report.reference,
        surface: String(report.context.surface ?? ""),
        ...report.tags,
      };
      if (typeof report.context.requestId === "string") {
        tags.requestId = report.context.requestId;
      }
      if (typeof report.context.organizationId === "string") {
        tags.organizationId = report.context.organizationId;
      }
      sentry.captureException(sanitizedError(report), {
        level: report.level,
        tags,
        extra: {
          fields: report.fields,
          cause: report.error.cause,
          code: report.error.code,
          status: report.error.status,
        },
        ...(actorId ? { user: { id: actorId } } : {}),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Event scrubbing
// ---------------------------------------------------------------------------

type Mutable = Record<string, unknown>;

const safeRequestHeaders = new Set(["accept", "content-type", "x-request-id"]);
const systemContexts = new Set([
  "os",
  "browser",
  "runtime",
  "device",
  "app",
  "trace",
  "culture",
  "cloud_resource",
  "nextjs",
  "otel",
]);

function scrubRequest(request: unknown): Mutable | undefined {
  if (!request || typeof request !== "object") return undefined;
  const source = request as Mutable;
  const output: Mutable = {};
  if (typeof source.method === "string") output.method = source.method;
  if (typeof source.url === "string") {
    output.url = scrubUrl(source.url, { paramPaths: true });
  }
  if (source.headers && typeof source.headers === "object") {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(source.headers as Mutable)) {
      if (
        safeRequestHeaders.has(name.toLowerCase()) &&
        typeof value === "string"
      ) {
        headers[name] = scrubString(value, 200);
      }
    }
    output.headers = headers;
  }
  // cookies, data (body), query_string, env and ip are never forwarded.
  return output;
}

function scrubExceptionValues(exception: unknown): unknown {
  if (!exception || typeof exception !== "object") return exception;
  const values = (exception as { values?: unknown }).values;
  if (!Array.isArray(values)) return exception;
  return {
    ...(exception as Mutable),
    values: values.map((value) => {
      if (!value || typeof value !== "object") return value;
      const item = { ...(value as Mutable) };
      if (typeof item.value === "string") item.value = scrubString(item.value);
      const stacktrace = item.stacktrace as { frames?: unknown } | undefined;
      if (stacktrace && Array.isArray(stacktrace.frames)) {
        item.stacktrace = {
          ...stacktrace,
          frames: stacktrace.frames.map((frame) => {
            if (!frame || typeof frame !== "object") return frame;
            const copy = { ...(frame as Mutable) };
            delete copy.vars;
            return copy;
          }),
        };
      }
      if (item.mechanism && typeof item.mechanism === "object") {
        const mechanism = { ...(item.mechanism as Mutable) };
        if (mechanism.data) mechanism.data = redact(mechanism.data);
        item.mechanism = mechanism;
      }
      return item;
    }),
  };
}

function scrubContexts(contexts: unknown): unknown {
  if (!contexts || typeof contexts !== "object") return contexts;
  const output: Mutable = {};
  for (const [key, value] of Object.entries(contexts as Mutable)) {
    if (systemContexts.has(key) && value && typeof value === "object") {
      const copy = { ...(value as Mutable) };
      delete copy.ip;
      delete copy.ip_address;
      output[key] = copy;
    } else {
      output[key] = redact(value);
    }
  }
  return output;
}

function scrubTags(tags: unknown): unknown {
  if (!tags || typeof tags !== "object") return tags;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags as Mutable)) {
    output[key] =
      key === "url" || key === "transaction"
        ? scrubUrl(String(value), { paramPaths: true })
        : scrubString(String(value), 200);
  }
  return output;
}

function scrubMessage(message: unknown): unknown {
  if (typeof message === "string") return scrubString(message);
  if (message && typeof message === "object") {
    const copy = { ...(message as Mutable) };
    if (typeof copy.message === "string")
      copy.message = scrubString(copy.message);
    if (typeof copy.formatted === "string") {
      copy.formatted = scrubString(copy.formatted);
    }
    delete copy.params;
    return copy;
  }
  return message;
}

/** "GET /players/jane-doe?x=1" -> "GET /players/:param". */
function scrubTransactionName(name: string): string {
  const match = /^([A-Z]{3,7}) (.*)$/.exec(name);
  return match
    ? `${match[1]} ${scrubUrl(match[2] ?? "", { paramPaths: true })}`
    : scrubUrl(name, { paramPaths: true });
}

/**
 * Scrub one streamed span (tracing is off unless the owner raises
 * NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE). Spans cannot be dropped, only
 * cleaned: names and descriptions lose query strings and slugs, attributes
 * go through redaction.
 */
export function scrubSentrySpan<S extends object>(span: S): S {
  try {
    const copy = { ...(span as Mutable) };
    for (const key of ["name", "description"]) {
      if (typeof copy[key] === "string") {
        copy[key] = scrubTransactionName(
          scrubString((copy[key] as string).split("?")[0] ?? "", 300),
        );
      }
    }
    for (const key of ["data", "attributes"]) {
      if (copy[key] && typeof copy[key] === "object") {
        copy[key] = redact(copy[key]);
      }
    }
    return copy as S;
  } catch {
    return span;
  }
}

/** Scrub one breadcrumb; `null` drops it. */
export function scrubSentryBreadcrumb<B extends object>(
  breadcrumb: B,
): B | null {
  try {
    const crumb = { ...(breadcrumb as Mutable) };
    const category = typeof crumb.category === "string" ? crumb.category : "";
    if (category === "console" || category.startsWith("ui.")) return null;
    if (typeof crumb.message === "string") {
      crumb.message = scrubString(crumb.message, 300);
    }
    const data = (crumb.data ?? undefined) as Mutable | undefined;
    if (data && typeof data === "object") {
      if (
        category === "fetch" ||
        category === "xhr" ||
        category === "http" ||
        category === "navigation"
      ) {
        const kept: Mutable = {};
        for (const key of ["url", "from", "to"]) {
          if (typeof data[key] === "string") {
            kept[key] = scrubUrl(data[key] as string, { paramPaths: true });
          }
        }
        if (typeof data.method === "string") kept.method = data.method;
        if (typeof data.status_code === "number")
          kept.status_code = data.status_code;
        crumb.data = kept;
      } else {
        crumb.data = redactFields(data);
      }
    }
    return crumb as B;
  } catch {
    return null;
  }
}

/** Scrub an error or transaction event; `null` drops it. */
export function scrubSentryEvent<E extends object>(event: E): E | null {
  try {
    const copy = { ...(event as Mutable) };
    const user = copy.user as { id?: unknown } | undefined;
    if (user && typeof user.id === "string" && user.id) {
      copy.user = { id: user.id };
    } else {
      delete copy.user;
    }
    if (copy.request) copy.request = scrubRequest(copy.request);
    if (copy.exception) copy.exception = scrubExceptionValues(copy.exception);
    if (copy.message) copy.message = scrubMessage(copy.message);
    if (copy.logentry) copy.logentry = scrubMessage(copy.logentry);
    if (copy.extra) copy.extra = redact(copy.extra);
    if (copy.contexts) copy.contexts = scrubContexts(copy.contexts);
    if (copy.tags) copy.tags = scrubTags(copy.tags);
    if (typeof copy.transaction === "string") {
      copy.transaction = scrubTransactionName(copy.transaction);
    }
    delete copy.server_name;
    if (Array.isArray(copy.breadcrumbs)) {
      copy.breadcrumbs = copy.breadcrumbs
        .map((crumb) =>
          crumb && typeof crumb === "object"
            ? scrubSentryBreadcrumb(crumb)
            : null,
        )
        .filter(Boolean);
    }
    if (Array.isArray(copy.spans)) {
      copy.spans = copy.spans.map((span) => {
        if (!span || typeof span !== "object") return span;
        const item = { ...(span as Mutable) };
        if (typeof item.description === "string") {
          item.description = scrubString(
            item.description.split("?")[0] ?? "",
            300,
          );
        }
        if (item.data) item.data = redact(item.data);
        return item;
      });
    }
    return copy as E;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export function sampleRate(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

/** Integrations removed from the SDK defaults: Duna reports these paths itself or they can carry text. */
export const REMOVED_SENTRY_INTEGRATIONS: readonly string[] = [
  "GlobalHandlers",
  "BrowserApiErrors",
  "Console",
  "Replay",
  "ReplayCanvas",
  "Feedback",
  "LocalVariables",
  "LocalVariablesAsync",
];

export interface SentryRuntimeInput {
  readonly dsn: string;
  readonly surface: Surface;
  readonly environment?: string;
  readonly release?: string;
  /** `NEXT_PUBLIC_SENTRY_SAMPLE_RATE` (errors, default 1). */
  readonly errorSampleRate?: string;
  /** `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (performance, default 0). */
  readonly tracesSampleRate?: string;
}

/**
 * Options for `Sentry.init` on every runtime. Spread vendor-specific extras
 * after it, never before (these privacy settings must win).
 */
export function sentryInitOptions(input: SentryRuntimeInput) {
  return {
    dsn: input.dsn,
    environment: input.environment,
    release: input.release,
    sendDefaultPii: false,
    sampleRate: sampleRate(input.errorSampleRate, 1),
    tracesSampleRate: sampleRate(input.tracesSampleRate, 0),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    includeLocalVariables: false,
    attachStacktrace: false,
    maxBreadcrumbs: 30,
    enableLogs: false,
    initialScope: { tags: { surface: input.surface } },
    integrations: <I extends { name: string }>(defaults: I[]): I[] =>
      defaults.filter(
        (integration) =>
          !REMOVED_SENTRY_INTEGRATIONS.includes(integration.name),
      ),
    beforeSend: <E extends object>(event: E): E | null =>
      scrubSentryEvent(event),
    beforeSendSpan: <S extends object>(span: S): S => scrubSentrySpan(span),
    beforeBreadcrumb: <B extends object>(breadcrumb: B): B | null =>
      scrubSentryBreadcrumb(breadcrumb),
  };
}
