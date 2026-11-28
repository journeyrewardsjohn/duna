"use client";

import { useErrorReference } from "@duna/observability/react";
import Link from "next/link";
import { ErrorState, errorStateActionClass } from "./error-state";

export interface RouteErrorProps {
  readonly error: Error & { digest?: string };
  /** Next's `unstable_retry` when present (refetches server data), else `reset`. */
  readonly retry: () => void;
  /** Low-cardinality boundary name for grouping (`web.root`, `web.player`). */
  readonly boundary: string;
  readonly homeHref: string;
  readonly homeLabel: string;
  readonly zone?: "editorial" | "athletic" | "hq";
}

/**
 * The behaviour of a route-level error state: report once, show the
 * reference, offer Try again and a way home. The look is ErrorState's.
 */
export function RouteError({
  error,
  retry,
  boundary,
  homeHref,
  homeLabel,
  zone,
}: RouteErrorProps) {
  const reference = useErrorReference(error, boundary);
  return (
    <ErrorState
      actions={
        <>
          <button
            className={errorStateActionClass.primary}
            onClick={retry}
            type="button"
          >
            Try again
          </button>
          <Link className={errorStateActionClass.secondary} href={homeHref}>
            {homeLabel}
          </Link>
        </>
      }
      description="Something went wrong on our side, not yours. Try again. If it keeps happening, send Duna support the reference below and we can find exactly what happened."
      eyebrow="Something went wrong"
      reference={reference}
      title="This page didn’t load"
      zone={zone}
    />
  );
}
