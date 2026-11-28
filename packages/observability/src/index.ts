/**
 * @duna/observability: structured logging, enforced redaction, error
 * reporting with pluggable transports, request ids and provider-call timing.
 *
 * The root entry has no dependencies and runs in Node, the browser and React
 * Native. Server-only context (`./server`), React pieces (`./react`) and the
 * Sentry adapter (`./sentry`) are separate entries. Feature code never calls
 * `console.*` or a vendor SDK directly; see docs/OBSERVABILITY.md.
 */
export { log, buildLogLine, type Logger, type LogFields } from "./logger";
export {
  report,
  buildErrorReport,
  wasReported,
  reportedReference,
  type ReportContext,
} from "./reporter";
export {
  redact,
  redactFields,
  scrubString,
  scrubUrl,
  serializeError,
  classifyKey,
  REDACTED,
  type SerializedError,
  type KeyVerdict,
} from "./redact";
export {
  EVENT_NAME_PATTERN,
  isValidEventName,
  ProviderNotConfiguredError,
  markExpected,
  expectedKind,
  type ExpectedErrorKind,
} from "./events";
export {
  REQUEST_ID_HEADER,
  VERCEL_ID_HEADER,
  isValidRequestId,
  createEventId,
  createRequestId,
  resolveEdgeRequestId,
  requestIdFromHeaders,
} from "./ids";
export {
  withProviderCall,
  classifyProviderFailure,
  type ProviderCallOutcome,
} from "./provider-call";
export {
  CLIENT_ERROR_ENDPOINT,
  CLIENT_ERROR_BODY_MAX_BYTES,
  CLIENT_ERROR_EVENT_MAX_BYTES,
  CLIENT_ERROR_MAX_EVENTS,
  createHttpTransport,
  toClientErrorEvent,
  type ClientErrorEvent,
  type HttpTransportOptions,
} from "./http-transport";
export {
  installBrowserErrorHandlers,
  installReactNativeErrorHandler,
  type ErrorUtilsLike,
} from "./global-handlers";
export {
  configureObservability,
  currentContext,
  detectRuntime,
  registerTransport,
  registeredTransports,
  resetObservability,
  runtimeInfo,
  setContextResolver,
  setLogSink,
  type LogContext,
  type LogFormat,
  type LogLevel,
  type LogSink,
  type ObservabilityOptions,
  type ReportTransport,
  type RuntimeInfo,
  type Surface,
} from "./runtime";
export type { ErrorReport, ReportLevel } from "./types";
