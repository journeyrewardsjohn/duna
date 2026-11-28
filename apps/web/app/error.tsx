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
      boundary="web.root"
      error={error}
      homeHref="/"
      homeLabel="Duna home"
      retry={unstable_retry ?? reset}
    />
  );
}
