"use client";

import { RouteError } from "@/components/observability/route-error";

/** Player web: keeps the player shell; only the failed page is replaced. */
export default function PlayerError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return (
    <RouteError
      boundary="web.player"
      error={error}
      homeHref="/app"
      homeLabel="Back to Home"
      retry={unstable_retry ?? reset}
      zone="athletic"
    />
  );
}
