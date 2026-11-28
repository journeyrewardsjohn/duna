/**
 * Error reporting. `report(error, context)` writes one structured `error`
 * line (always) and hands a redacted `ErrorReport` to every registered
 * transport (Sentry when configured, the client-error endpoint on mobile).
 * It returns the reference a person can quote ("Reference: …").
 *
 * Report only unexpected failures. Expected outcomes (validation, not found,
 * refused by policy, provider not configured) are logged with `log.warn` or
 * `log.info`, never reported.
 */
import { createEventId } from "./ids";
import { log, type LogFields } from "./logger";
import { redactFields, scrubString, serializeError } from "./redact";
import { currentContext, observabilityState, runtimeInfo } from "./runtime";
import type { ErrorReport, ReportLevel } from "./types";
import { isValidEventName } from "./events";

export interface ReportContext {
  /** `domain.action.outcome`; defaults to `app.error.unexpected`. */
  readonly event?: string;
  readonly level?: ReportLevel;
  /** Ids and measurements only; redacted like every log field. */
  readonly fields?: LogFields;
  /** Low-cardinality labels for grouping (provider, operation, path). */
  readonly tags?: Readonly<
    Record<string, string | number | boolean | undefined>
  >;
  /** Quote this reference instead of the request id (Next.js digest, client event id). */
  readonly reference?: string;
}

function referenceFor(context: ReportContext | undefined): string {
  const fromContext = currentContext().requestId;
  return context?.reference ?? fromContext ?? createEventId("err");
}

function scalarContext(): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  const runtime = runtimeInfo();
  output.surface = runtime.surface;
  output.environment = runtime.environment;
  output.demo = runtime.demo;
  if (runtime.release) output.release = runtime.release;
  for (const [key, value] of Object.entries(redactFields(currentContext()))) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] = value;
    }
  }
  return output;
}

function safeTags(tags: ReportContext["tags"]): Record<string, string> {
  const output: Record<string, string> = {};
  if (!tags) return output;
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined) continue;
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,31}$/.test(key)) continue;
    output[key] = scrubString(String(value), 200);
  }
  return output;
}

/** The redacted report every transport receives (exported for tests and the endpoint). */
export function buildErrorReport(
  error: unknown,
  context?: ReportContext,
): ErrorReport {
  const event =
    context?.event && isValidEventName(context.event)
      ? context.event
      : "app.error.unexpected";
  return {
    event,
    level: context?.level ?? "error",
    reference: referenceFor(context),
    error: serializeError(error),
    context: scalarContext(),
    fields: redactFields(context?.fields),
    tags: safeTags(context?.tags),
    occurredAt: new Date().toISOString(),
  };
}

/** True when this error object was already reported (by withProviderCall, for example). */
export function wasReported(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    observabilityState().reported.has(error)
  );
}

export function reportedReference(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? observabilityState().reported.get(error)
    : undefined;
}

/**
 * Report an unexpected error. Never throws; returns the reference. The same
 * error object is reported once: a second call returns the first reference.
 */
export function report(error: unknown, context?: ReportContext): string {
  try {
    const state = observabilityState();
    if (typeof error === "object" && error !== null) {
      const previous = state.reported.get(error);
      if (previous) return previous;
    }
    const built = buildErrorReport(error, context);
    if (typeof error === "object" && error !== null) {
      state.reported.set(error, built.reference);
    }
    log.error(built.event, {
      ...built.fields,
      ...built.tags,
      reference: built.reference,
      error: built.error,
      reported: true,
    });
    for (const transport of state.transports) {
      try {
        const pending = transport.send(built, error);
        if (pending && typeof (pending as Promise<void>).catch === "function") {
          (pending as Promise<void>).catch(() => undefined);
        }
      } catch {
        // A failing transport never breaks the product or the other transports.
      }
    }
    return built.reference;
  } catch {
    return context?.reference ?? createEventId("err");
  }
}
