import { registerTransport, runtimeInfo } from "@duna/observability";
import {
  createSentryTransport,
  sentryInitOptions,
} from "@duna/observability/sentry";
import * as Sentry from "@sentry/nextjs";

// Sentry stays off until the owner sets a DSN; errors are still logged.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (dsn) {
  const runtime = runtimeInfo();
  Sentry.init(
    sentryInitOptions({
      dsn,
      surface: "hq",
      environment: runtime.environment,
      release: runtime.release,
      errorSampleRate: process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE,
      tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    }),
  );
  registerTransport(createSentryTransport(Sentry));
}
