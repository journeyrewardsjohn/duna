"use client";

import { useErrorReference } from "@duna/observability/react";
import { ErrorState } from "@duna/ui/tideline";
import Link from "next/link";
import { SignedOutRedirect } from "@/components/app-shell/signed-out";

function signedOut(error: Error & { digest?: string }): boolean {
  return /UNAUTHORIZED|sign in/i.test(`${error.name} ${error.message}`);
}

/**
 * A Player web page failed: the kit's ErrorState inside the shell, reported
 * once through @duna/observability, with the reference to quote. A session
 * that ended becomes the signed-out state instead.
 */
export default function PlayerAppError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const reference = useErrorReference(error, "web.player");
  if (signedOut(error)) return <SignedOutRedirect />;
  return (
    <section className="aps-state">
      <h1 className="td-sr">This page didn’t load</h1>
      <ErrorState
        action={<Link href="/app">Back to Home</Link>}
        message="Something went wrong on our side, not yours. Try again. If it keeps happening, send Duna support the reference below."
        onRetry={unstable_retry ?? reset}
        reference={reference}
        title="This page didn’t load"
      />
    </section>
  );
}
