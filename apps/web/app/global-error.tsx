"use client";

// Its own document, on the design system only: Next loads this file's CSS
// with every page, so it must not bring a legacy sheet into app/(next).
import "@duna/ui/tideline/styles.css";

import { useErrorReference } from "@duna/observability/react";
import { Button, ErrorState } from "@duna/ui/tideline";

/**
 * Replaces a root layout when it fails, so it renders its own document. The
 * kit's ErrorState, reported once through @duna/observability with the
 * reference a person can send to support.
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
  const reference = useErrorReference(error, "web.global");
  return (
    <html data-theme="light" lang="en">
      <body className="td td--ground" data-theme="light">
        <main
          style={{
            display: "grid",
            minHeight: "100dvh",
            placeItems: "center",
            padding: "var(--td-space-6)",
          }}
        >
          <ErrorState
            action={
              <Button href="/" variant="ghost">
                Duna home
              </Button>
            }
            message="Something went wrong on our side, not yours. Try again. If it keeps happening, send Duna support the reference below."
            onRetry={unstable_retry ?? reset}
            reference={reference}
            title="Duna didn’t load"
          />
        </main>
      </body>
    </html>
  );
}
