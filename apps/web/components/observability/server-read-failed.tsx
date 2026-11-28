import Link from "next/link";
import { ErrorState, errorStateActionClass } from "./error-state";

/**
 * What a Player web page shows when its server read failed
 * (lib/server-read.ts `settleServerRead`): "busy, try again" when the API
 * asked us to slow down, otherwise the usual error with its reference.
 */
export function ServerReadFailed({
  busy,
  reference,
  retryHref,
  variant = "page",
}: {
  readonly busy: boolean;
  readonly reference: string;
  /** This page's own address: "Try again" loads it once more. */
  readonly retryHref?: string;
  readonly variant?: "page" | "pane";
}) {
  return (
    <ErrorState
      actions={
        <>
          {retryHref ? (
            <Link className={errorStateActionClass.primary} href={retryHref}>
              Try again
            </Link>
          ) : null}
          <Link className={errorStateActionClass.secondary} href="/app">
            Back to Home
          </Link>
        </>
      }
      description={
        busy
          ? "Duna is busy for a moment. Wait a few seconds and try again. If it keeps happening, send Duna support the reference below."
          : "Something went wrong on our side, not yours. Try again. If it keeps happening, send Duna support the reference below and we can find exactly what happened."
      }
      eyebrow={busy ? "Busy just now" : "Something went wrong"}
      reference={reference}
      title={busy ? "Duna is busy" : "This page didn’t load"}
      variant={variant}
      zone="athletic"
    />
  );
}
