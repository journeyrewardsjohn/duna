"use client";

import { ErrorState } from "@duna/ui/tideline";
import { useErrorReference } from "@duna/observability/react";
import Link from "next/link";

export default function LegalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const reference = useErrorReference(error, "web.legal");
  return (
    <main className="lc-main lc-hub" id="legal-content" tabIndex={-1}>
      <h1 className="td-sr">This document didn’t load</h1>
      <ErrorState
        action={<Link href="/legal">All legal documents</Link>}
        message="Something went wrong on our side. Try again; if it keeps happening, send Duna support the reference below."
        onRetry={unstable_retry ?? reset}
        reference={reference}
        title="This document didn’t load"
      />
    </main>
  );
}
