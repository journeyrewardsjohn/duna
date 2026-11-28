/**
 * Process-wide observability state: who is logging (surface, release,
 * environment, demo), the per-request context resolver and the error
 * transports. Kept on `globalThis` under a registered symbol so every copy of
 * this module that a bundler emits (instrumentation, route chunks, server
 * actions) shares one registry.
 */
import type { ErrorReport } from "./types";

export type Surface = "web" | "hq" | "api" | "player" | "pro" | "worker";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "json" | "pretty" | "console";

export interface LogContext {
  readonly requestId?: string;
  readonly actorId?: string;
  readonly organizationId?: string;
  readonly [key: string]: string | number | boolean | undefined;
}

export interface RuntimeInfo {
  readonly surface: Surface;
  readonly release?: string;
  readonly environment: string;
  readonly demo: boolean;
}

export interface ReportTransport {
  readonly name: string;
  send(report: ErrorReport, original: unknown): void | Promise<void>;
}

export type LogSink = (
  level: LogLevel,
  line: Readonly<Record<string, unknown>>,
) => void;

interface ObservabilityState {
  runtime: RuntimeInfo;
  level: LogLevel;
  format: LogFormat;
  contextResolver?: () => LogContext | undefined;
  transports: ReportTransport[];
  sink?: LogSink;
  reported: WeakMap<object, string>;
  /** The original console methods once the server console guard is installed. */
  console?: Pick<Console, "log" | "warn" | "error" | "info" | "debug">;
}

const stateKey = Symbol.for("duna.observability.state");

function readEnv(name: string): string | undefined {
  try {
    const env = (
      globalThis as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    const value = env?.[name];
    return value?.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function detectRuntime(): "browser" | "native" | "server" {
  const scope = globalThis as {
    window?: unknown;
    document?: unknown;
    navigator?: { product?: string };
  };
  if (scope.navigator?.product === "ReactNative") return "native";
  if (scope.window !== undefined && scope.document !== undefined) {
    return "browser";
  }
  return "server";
}

function defaultRuntime(): RuntimeInfo {
  const environment =
    readEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT") ??
    readEnv("VERCEL_ENV") ??
    readEnv("NEXT_PUBLIC_VERCEL_ENV") ??
    readEnv("NODE_ENV") ??
    "development";
  return {
    surface: "api",
    release:
      readEnv("VERCEL_GIT_COMMIT_SHA") ??
      readEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA") ??
      readEnv("DUNA_RELEASE"),
    environment,
    demo: readEnv("NEXT_PUBLIC_DEMO_MODE") !== "false",
  };
}

function parseLevel(value: string | undefined): LogLevel | undefined {
  return value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
    ? value
    : undefined;
}

function defaultFormat(): LogFormat {
  const explicit = readEnv("DUNA_LOG_FORMAT");
  if (explicit === "json" || explicit === "pretty") return explicit;
  if (detectRuntime() !== "server") return "console";
  return readEnv("NODE_ENV") === "development" ? "pretty" : "json";
}

export function observabilityState(): ObservabilityState {
  const scope = globalThis as { [stateKey]?: ObservabilityState };
  scope[stateKey] ??= {
    runtime: defaultRuntime(),
    level:
      parseLevel(readEnv("DUNA_LOG_LEVEL")) ??
      (readEnv("NODE_ENV") === "test" ? "warn" : "info"),
    format: defaultFormat(),
    transports: [],
    reported: new WeakMap(),
  };
  return scope[stateKey];
}

export interface ObservabilityOptions {
  readonly surface?: Surface;
  readonly release?: string;
  readonly environment?: string;
  readonly demo?: boolean;
  readonly level?: LogLevel;
  readonly format?: LogFormat;
}

/** Set who is logging. Call once per runtime (instrumentation, app root). */
export function configureObservability(options: ObservabilityOptions): void {
  const state = observabilityState();
  state.runtime = {
    surface: options.surface ?? state.runtime.surface,
    release: options.release ?? state.runtime.release,
    environment: options.environment ?? state.runtime.environment,
    demo: options.demo ?? state.runtime.demo,
  };
  if (options.level) state.level = options.level;
  if (options.format) state.format = options.format;
}

export function runtimeInfo(): RuntimeInfo {
  return observabilityState().runtime;
}

/** Register how the current request's context is found (server: AsyncLocalStorage). */
export function setContextResolver(
  resolver: (() => LogContext | undefined) | undefined,
): void {
  observabilityState().contextResolver = resolver;
}

export function currentContext(): LogContext {
  try {
    return observabilityState().contextResolver?.() ?? {};
  } catch {
    return {};
  }
}

/** Add an error transport; returns a function that removes it. */
export function registerTransport(transport: ReportTransport): () => void {
  const state = observabilityState();
  state.transports = [
    ...state.transports.filter((existing) => existing.name !== transport.name),
    transport,
  ];
  return () => {
    state.transports = state.transports.filter(
      (existing) => existing !== transport,
    );
  };
}

export function registeredTransports(): readonly string[] {
  return observabilityState().transports.map((transport) => transport.name);
}

/** Replace where log lines go (tests). `undefined` restores the default. */
export function setLogSink(sink: LogSink | undefined): void {
  observabilityState().sink = sink;
}

/** Forget transports, sink and context (tests). */
export function resetObservability(): void {
  const scope = globalThis as { [stateKey]?: ObservabilityState };
  delete scope[stateKey];
}
