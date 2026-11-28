/**
 * Server-only: per-request log context through AsyncLocalStorage. Importing
 * this module registers the resolver, so every `log.*` and `report` call made
 * while handling a request carries its request id, actor id and organisation
 * id without passing them around.
 *
 * Never import this from client or React Native code (it needs
 * `node:async_hooks`); the root entry is safe everywhere.
 */
/* eslint-disable no-console -- the console guard replaces console methods */
import { AsyncLocalStorage } from "node:async_hooks";
import { inspect } from "node:util";
import {
  redact,
  scrubString,
  serializeError,
  type SerializedError,
} from "./redact";
import {
  configureObservability,
  observabilityState,
  setContextResolver,
  type LogContext,
  type ObservabilityOptions,
} from "./runtime";

const storageKey = Symbol.for("duna.observability.als");

function storage(): AsyncLocalStorage<LogContext> {
  const scope = globalThis as { [storageKey]?: AsyncLocalStorage<LogContext> };
  scope[storageKey] ??= new AsyncLocalStorage<LogContext>();
  return scope[storageKey];
}

/** Run `fn` with `context` merged over the current request context. */
export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  const merged = { ...storage().getStore(), ...context };
  return storage().run(merged, fn);
}

export function getLogContext(): LogContext | undefined {
  return storage().getStore();
}

/**
 * Install the AsyncLocalStorage resolver and set the runtime identity. With
 * `guardConsole`, also redact everything other code writes to the console
 * (the Next.js apps turn this on in instrumentation.ts).
 */
export function installServerObservability(
  options: ObservabilityOptions & { readonly guardConsole?: boolean } = {},
): void {
  const { guardConsole, ...runtime } = options;
  configureObservability(runtime);
  setContextResolver(() => storage().getStore());
  if (guardConsole) installConsoleGuard();
}

installServerObservability();

function formatError(error: SerializedError, indent = ""): string {
  const lines = [`${indent}${error.name}: ${error.message}`];
  const frames = error.stack?.split("\n").slice(1) ?? [];
  for (const frame of frames) lines.push(`${indent}${frame}`);
  if (error.code !== undefined) lines.push(`${indent}  code: ${error.code}`);
  if (error.cause)
    lines.push(
      `${indent}  [cause]: ${formatError(error.cause, `${indent}  `).trimStart()}`,
    );
  return lines.join("\n");
}

function guardArgument(value: unknown): unknown {
  if (typeof value === "string") return scrubString(value, 4_000);
  if (value instanceof Error) return formatError(serializeError(value));
  if (value && typeof value === "object")
    return inspect(redact(value), { depth: 6 });
  return value;
}

/**
 * Server console guard: frameworks and SDKs (Next.js prints server render
 * errors with their full message and attached properties) write to the
 * console directly. This routes every console argument through the same
 * redaction, so nothing on stdout/stderr bypasses it. Duna's own log lines
 * use the original methods (they are already redacted).
 */
export function installConsoleGuard(): void {
  const state = observabilityState();
  if (state.console) return;
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  state.console = original;
  for (const method of ["log", "info", "debug", "warn", "error"] as const) {
    console[method] = (...args: unknown[]) => {
      try {
        original[method](...args.map(guardArgument));
      } catch {
        original[method](
          ...args.map((arg) =>
            typeof arg === "string" ? scrubString(arg) : "[unloggable]",
          ),
        );
      }
    };
  }
}
