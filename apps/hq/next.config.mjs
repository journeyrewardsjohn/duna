import { withSentryConfig } from "@sentry/nextjs/config";
import { withEve } from "eve/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@duna/api",
    "@duna/core",
    "@duna/db",
    "@duna/league-engine",
    "@duna/pricing",
    "@duna/rating",
    "@duna/scheduling",
    "@duna/tideline-core",
    "@duna/ui",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

/**
 * Sentry build integration. Source maps are uploaded only when the owner has
 * set SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT; otherwise the build is
 * unchanged apart from the SDK. Sentry's build telemetry is off, and its
 * build-time auto-instrumentation is off because Duna reports through
 * instrumentation.ts (one path, one redaction layer).
 */
const sentryUpload = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT,
);

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: {
    disable: !sentryUpload,
    deleteSourcemapsAfterUpload: true,
  },
  release: { create: sentryUpload, finalize: sentryUpload },
  widenClientFileUpload: sentryUpload,
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
  },
};

export default withSentryConfig(withEve(nextConfig), sentryBuildOptions);
