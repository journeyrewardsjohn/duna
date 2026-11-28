"use client";

import { useErrorReference } from "@duna/observability/react";
import { ErrorState } from "@duna/ui/tideline";
import Link from "next/link";

/** A public page failed: the kit's ErrorState, reported once, with its reference. */
export default function SiteError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const reference = useErrorReference(error, "web.site");
  return (
    <main className="site-state" id="main" tabIndex={-1}>
      <h1 className="td-sr">This page didn’t load</h1>
      <ErrorState
        action={<Link href="/">Duna home</Link>}
        message="Something went wrong on our side, not yours. Try again. If it keeps happening, send Duna support the reference below."
        onRetry={unstable_retry ?? reset}
        reference={reference}
        title="This page didn’t load"
      />
    </main>
  );
}
