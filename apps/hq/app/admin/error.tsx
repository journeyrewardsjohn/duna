"use client";

import { RouteError } from "@/components/observability/route-error";

/** Super Admin: a failed admin page offers the way back to the admin home. */
export default function AdminError({
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
      boundary="hq.admin"
      error={error}
      homeHref="/admin"
      homeLabel="Back to Admin"
      retry={unstable_retry ?? reset}
      zone="hq"
    />
  );
}
