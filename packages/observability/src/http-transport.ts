/**
 * Client error transport: posts redacted error events to Duna's
 * authenticated endpoint `POST /api/observability/client-errors` (web, HQ,
 * Player and Pro). Used where no vendor SDK runs (React Native today) and in
 * the browser so a person's error can be found in Duna's own logs.
 *
 * Limits are enforced on both sides: at most `maxPerMinute` events leave a
 * device per minute, each event is at most `CLIENT_ERROR_EVENT_MAX_BYTES`
 * (the stack is cut first, then fields), and the server re-redacts, rate
 * limits per person and rejects bodies over `CLIENT_ERROR_BODY_MAX_BYTES`.
 */
import type { ReportTransport } from "./runtime";
import type { ErrorReport } from "./types";

export const CLIENT_ERROR_ENDPOINT = "/api/observability/client-errors";
export const CLIENT_ERROR_EVENT_MAX_BYTES = 6_000;
export const CLIENT_ERROR_BODY_MAX_BYTES = 16_000;
export const CLIENT_ERROR_MAX_EVENTS = 5;

/** The wire shape the endpoint accepts (validated there with Zod). */
export interface ClientErrorEvent {
  readonly event: string;
  readonly level: "warning" | "error" | "fatal";
  readonly reference: string;
  readonly surface: "web" | "hq" | "player" | "pro";
  readonly release?: string;
  readonly environment?: string;
  readonly occurredAt: string;
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
  readonly fields?: Readonly<Record<string, string | number | boolean | null>>;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function scalarFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields).slice(0, 20)) {
    if (
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key.slice(0, 64)] = value;
    } else if (typeof value === "string") {
      output[key.slice(0, 64)] = value.slice(0, 256);
    }
  }
  return output;
}

/** Shrink a report to the wire shape, within the per-event byte limit. */
export function toClientErrorEvent(
  report: ErrorReport,
  surface: ClientErrorEvent["surface"],
): ClientErrorEvent | undefined {
  const base: ClientErrorEvent = {
    event: report.event,
    level: report.level,
    reference: report.reference,
    surface,
    release:
      typeof report.context.release === "string"
        ? report.context.release.slice(0, 64)
        : undefined,
    environment:
      typeof report.context.environment === "string"
        ? report.context.environment.slice(0, 32)
        : undefined,
    occurredAt: report.occurredAt,
    error: {
      name: report.error.name.slice(0, 80),
      message: report.error.message.slice(0, 1_000),
      stack: report.error.stack?.slice(0, 4_000),
    },
    fields: scalarFields({ ...report.fields, ...report.tags }),
  };
  const attempts: ClientErrorEvent[] = [
    base,
    {
      ...base,
      error: { ...base.error, stack: base.error.stack?.slice(0, 1_500) },
    },
    { ...base, fields: undefined, error: { ...base.error, stack: undefined } },
  ];
  return attempts.find(
    (attempt) =>
      byteLength(JSON.stringify(attempt)) <= CLIENT_ERROR_EVENT_MAX_BYTES,
  );
}

export interface HttpTransportOptions {
  /** Absolute URL on native; same-origin path in the browser. */
  readonly endpoint: string;
  readonly surface: ClientErrorEvent["surface"];
  /** Authorization and other headers (native: `Bearer <access token>`). */
  readonly headers?: () =>
    | Readonly<Record<string, string>>
    | Promise<Readonly<Record<string, string>>>;
  readonly fetch?: typeof fetch;
  readonly maxPerMinute?: number;
  readonly now?: () => number;
}

/**
 * A transport that never throws, never retries in a loop and never reports
 * its own failures.
 */
export function createHttpTransport(
  options: HttpTransportOptions,
): ReportTransport {
  const maxPerMinute = options.maxPerMinute ?? 10;
  const clock = options.now ?? (() => Date.now());
  let windowStart = clock();
  let sentInWindow = 0;
  return {
    name: "duna-http",
    async send(report) {
      const at = clock();
      if (at - windowStart >= 60_000) {
        windowStart = at;
        sentInWindow = 0;
      }
      if (sentInWindow >= maxPerMinute) return;
      const event = toClientErrorEvent(report, options.surface);
      if (!event) return;
      sentInWindow += 1;
      try {
        const extra = (await options.headers?.()) ?? {};
        const fetchImpl = options.fetch ?? globalThis.fetch;
        await fetchImpl(options.endpoint, {
          method: "POST",
          headers: { ...extra, "content-type": "application/json" },
          body: JSON.stringify({ events: [event] }),
          keepalive: true,
          credentials: "same-origin",
        });
      } catch {
        // Offline or blocked: the event is dropped, never retried in a loop.
      }
    },
  };
}
