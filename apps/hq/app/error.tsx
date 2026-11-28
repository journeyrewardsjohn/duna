"use client";

import { RouteError } from "@/components/observability/route-error";

export default function RootError({
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
      boundary="hq.root"
      error={error}
      homeHref="/"
      homeLabel="Back to HQ"
      retry={unstable_retry ?? reset}
      zone="hq"
    />
  );
}
