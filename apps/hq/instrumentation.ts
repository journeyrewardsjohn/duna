import type { Instrumentation } from "next";

/**
 * Server start-up for Duna HQ: structured logging with per-request context,
 * and Sentry when its DSN is set (see docs/OBSERVABILITY.md).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installServerObservability } =
      await import("@duna/observability/server");
    installServerObservability({ surface: "hq", guardConsole: true });
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    const { configureObservability } = await import("@duna/observability");
    configureObservability({ surface: "hq" });
    await import("./sentry.edge.config");
  }
}

/** Server components, route handlers, server actions and the proxy. */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { reportRequestError } = await import("@duna/api/observability");
  reportRequestError(error, request, context);
};
