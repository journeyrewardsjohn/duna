import {
  CLIENT_ERROR_ENDPOINT,
  configureObservability,
  createHttpTransport,
  installBrowserErrorHandlers,
  registerTransport,
} from "@duna/observability";

/**
 * Browser start-up for Duna HQ: unhandled errors and promise rejections are
 * reported to Duna's own log (through the authenticated client-error
 * endpoint) and to Sentry when its DSN is set.
 */
configureObservability({
  surface: "hq",
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  demo: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
});
registerTransport(
  createHttpTransport({ endpoint: CLIENT_ERROR_ENDPOINT, surface: "hq" }),
);
installBrowserErrorHandlers();

type SentryModule = typeof import("@sentry/nextjs");
let sentry: SentryModule | undefined;

/** Navigation spans for Sentry tracing; a no-op until Sentry is loaded. */
export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  sentry?.captureRouterTransitionStart(...args);
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void Promise.all([
    import("@sentry/nextjs"),
    import("@duna/observability/sentry"),
  ]).then(([Sentry, adapter]) => {
    sentry = Sentry;
    Sentry.init(
      adapter.sentryInitOptions({
        dsn,
        surface: "hq",
        environment:
          process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
          process.env.NEXT_PUBLIC_VERCEL_ENV ??
          process.env.NODE_ENV,
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
        errorSampleRate: process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE,
        tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      }),
    );
    registerTransport(adapter.createSentryTransport(Sentry));
  });
}
