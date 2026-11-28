"use client";

import "@duna/ui/styles.css";

import { RouteError } from "@/components/observability/route-error";

/**
 * Replaces the root layout when it fails, so it renders its own document.
 * Shares the error state and reporting with every other route error.
 */
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return (
    <html data-theme="light" lang="en">
      <body>
        <RouteError
          boundary="hq.global"
          error={error}
          homeHref="/"
          homeLabel="Back to HQ"
          retry={unstable_retry ?? reset}
          zone="hq"
        />
      </body>
    </html>
  );
}
