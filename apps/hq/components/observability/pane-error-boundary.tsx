"use client";

import { ErrorBoundary } from "@duna/observability/react";
import type { ReactNode } from "react";
import { ErrorState, errorStateActionClass } from "./error-state";

export interface PaneErrorBoundaryProps {
  /** Low-cardinality name for grouping, for example `player.home.nextUp`. */
  readonly name: string;
  /** What the pane shows, in plain words ("Your next game"). */
  readonly label?: string;
  /** Reset the boundary when these change (route, selected id). */
  readonly resetKeys?: readonly unknown[];
  readonly children: ReactNode;
}

/**
 * Wrap one panel so a failure inside it shows a small, honest state with a
 * reference and Try again, while the rest of the page keeps working.
 */
export function PaneErrorBoundary({
  name,
  label,
  resetKeys,
  children,
}: PaneErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={({ reference, reset }) => (
        <ErrorState
          actions={
            <button
              className={errorStateActionClass.secondary}
              onClick={reset}
              type="button"
            >
              Try again
            </button>
          }
          description="This part of the page hit a problem. Everything else still works."
          reference={reference}
          title={label ? `${label} didn’t load` : "This section didn’t load"}
          variant="pane"
        />
      )}
      name={name}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
