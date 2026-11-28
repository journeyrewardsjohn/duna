"use client";

import { useErrorReference } from "@duna/observability/react";
import { Button, ErrorState } from "@duna/ui/tideline";

/**
 * A page inside the shell failed: the kit's ErrorState with the reference,
 * reported once through @duna/observability. The shell stays usable.
 */
export default function HqError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const reference = useErrorReference(error, "hq.next");
  return (
    <div className="hqs-state">
      <ErrorState
        action={
          <Button href="/" variant="ghost">
            Back to Today
          </Button>
        }
        message="Something went wrong on our side, not yours. Try again. If it keeps happening, send Duna support the reference below."
        onRetry={unstable_retry ?? reset}
        reference={reference}
        title="This page didn't load"
      />
    </div>
  );
}
