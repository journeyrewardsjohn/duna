/**
 * Capture errors nothing else caught: browser `error` and
 * `unhandledrejection` events, and React Native's global handler.
 */
import { createEventId } from "./ids";
import { report } from "./reporter";

interface EventTargetLike {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

/** Browser: returns a function that removes the listeners. */
export function installBrowserErrorHandlers(
  target: EventTargetLike | undefined = (
    globalThis as { window?: EventTargetLike }
  ).window,
): () => void {
  if (!target) return () => undefined;
  const onError = (event: unknown) => {
    const record = event as { error?: unknown; message?: unknown };
    // Cross-origin script errors arrive without an error object; skip them.
    if (!record.error && record.message === "Script error.") return;
    report(record.error ?? record.message, {
      event: "client.error.unhandled",
      reference: createEventId("err"),
      tags: { mechanism: "onerror" },
    });
  };
  const onRejection = (event: unknown) => {
    report((event as { reason?: unknown }).reason, {
      event: "client.promise.unhandled",
      reference: createEventId("err"),
      tags: { mechanism: "unhandledrejection" },
    });
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

/** React Native's `ErrorUtils` global, typed structurally. */
export interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/**
 * React Native: report, then hand the error to the previous handler (the
 * red box in development, the native crash in release).
 */
export function installReactNativeErrorHandler(
  errorUtils: ErrorUtilsLike | undefined = (
    globalThis as { ErrorUtils?: ErrorUtilsLike }
  ).ErrorUtils,
): () => void {
  if (!errorUtils) return () => undefined;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    report(error, {
      event: isFatal ? "client.crash.fatal" : "client.error.unhandled",
      level: isFatal ? "fatal" : "error",
      reference: createEventId("err"),
      tags: { mechanism: "ErrorUtils" },
    });
    previous(error, isFatal);
  });
  return () => errorUtils.setGlobalHandler(previous);
}
