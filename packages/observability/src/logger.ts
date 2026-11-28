/**
 * The structured logger. Feature code calls `log.info("domain.action.outcome",
 * { ...ids and measurements })` and never `console.*` directly.
 *
 * Every line carries: ts, level, event, surface, environment, release, demo,
 * and the current request's requestId / actorId / organizationId. Fields go
 * through `redactFields` first, always.
 *
 * Output: one JSON line per event on the server (Vercel collects stdout and
 * stderr), a readable line in local development, and the browser / React
 * Native console on clients (warnings and errors only outside development).
 */
import { isValidEventName } from "./events";
import { redactFields } from "./redact";
import { currentContext, observabilityState, type LogLevel } from "./runtime";

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** A logger that adds the given (redacted) fields to every line. */
  child(bindings: LogFields): Logger;
}

const levelRank: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function compact(
  record: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) output[key] = value;
  }
  return output;
}

export function buildLogLine(
  level: LogLevel,
  event: string,
  fields: LogFields | undefined,
): Record<string, unknown> {
  const state = observabilityState();
  const context = redactFields(currentContext());
  const safeFields = redactFields(fields);
  // Base keys win over fields so a caller cannot spoof them.
  return compact({
    ...safeFields,
    ...context,
    ts: new Date().toISOString(),
    level,
    event: isValidEventName(event) ? event : "log.event.invalid",
    invalidEvent: isValidEventName(event)
      ? undefined
      : event.slice(0, 80).replaceAll(/[^A-Za-z0-9._-]/g, "_"),
    surface: state.runtime.surface,
    environment: state.runtime.environment,
    release: state.runtime.release,
    demo: state.runtime.demo,
  });
}

function formatPretty(line: Readonly<Record<string, unknown>>): string {
  const { ts, level, event, surface, environment, release, demo, ...rest } =
    line;
  void environment;
  void release;
  void demo;
  const time = typeof ts === "string" ? ts.slice(11, 23) : "";
  const pairs = Object.entries(rest)
    .map(
      ([key, value]) =>
        `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
    )
    .join(" ");
  return `[${String(surface)}] ${time} ${String(level).toUpperCase().padEnd(5)} ${String(event)}${pairs ? ` ${pairs}` : ""}`;
}

function write(level: LogLevel, line: Readonly<Record<string, unknown>>): void {
  const state = observabilityState();
  if (state.sink) {
    state.sink(level, line);
    return;
  }
  // The unguarded console when the server console guard is installed: log
  // lines are already redacted and must not be scrubbed twice.
  const target = state.console ?? console;
  const method =
    level === "error"
      ? target.error
      : level === "warn"
        ? target.warn
        : target.log;
  if (state.format === "json") {
    method(JSON.stringify(line));
  } else if (state.format === "pretty") {
    method(formatPretty(line));
  } else {
    const development =
      state.runtime.environment === "development" ||
      state.runtime.environment === "test";
    if (!development && levelRank[level] < levelRank.warn) return;
    method(`[duna] ${String(line.event)}`, line);
  }
}

function emit(
  level: LogLevel,
  event: string,
  fields: LogFields | undefined,
  bindings: LogFields | undefined,
): void {
  try {
    const state = observabilityState();
    if (levelRank[level] < levelRank[state.level]) return;
    write(
      level,
      buildLogLine(
        level,
        event,
        bindings ? { ...bindings, ...fields } : fields,
      ),
    );
  } catch {
    // Logging never throws into product code.
  }
}

function createLogger(bindings?: LogFields): Logger {
  return {
    debug: (event, fields) => emit("debug", event, fields, bindings),
    info: (event, fields) => emit("info", event, fields, bindings),
    warn: (event, fields) => emit("warn", event, fields, bindings),
    error: (event, fields) => emit("error", event, fields, bindings),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

export const log: Logger = createLogger();
