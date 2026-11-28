/**
 * React pieces, renderer-agnostic (web and React Native): no DOM elements
 * here. Apps supply the fallback UI, so restyling never touches this logic.
 */
import { Component, useEffect, useState, type ReactNode } from "react";
import { createEventId } from "./ids";
import { report } from "./reporter";

export interface ErrorFallbackProps {
  readonly error: unknown;
  /** The id to show as "Reference: …". */
  readonly reference: string;
  /** Clear the error and render the children again. */
  readonly reset: () => void;
}

export interface ErrorBoundaryProps {
  /** Low-cardinality name for grouping (`"player.home.nextUp"`, `"hq.money.payouts"`). */
  readonly name: string;
  readonly fallback: (props: ErrorFallbackProps) => ReactNode;
  readonly children?: ReactNode;
  /** Reset when any of these values change (route, selected id). */
  readonly resetKeys?: readonly unknown[];
}

interface ErrorBoundaryState {
  readonly error: unknown;
  readonly reference?: string;
  readonly resetKeys?: readonly unknown[];
}

function keysChanged(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
): boolean {
  if (previous === next) return false;
  if (!previous || !next || previous.length !== next.length) return true;
  return previous.some((value, index) => !Object.is(value, next[index]));
}

/**
 * Contain a failure to one pane: the rest of the page keeps working, the
 * error is reported once with the boundary's name, and the fallback gets a
 * reference and a reset.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    error: undefined,
    resetKeys: this.props.resetKeys,
  };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error ?? new Error("Unknown render error") };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (
      state.error !== undefined &&
      keysChanged(state.resetKeys, props.resetKeys)
    ) {
      return {
        error: undefined,
        reference: undefined,
        resetKeys: props.resetKeys,
      };
    }
    return keysChanged(state.resetKeys, props.resetKeys)
      ? { resetKeys: props.resetKeys }
      : null;
  }

  override componentDidCatch(error: unknown): void {
    const reference = report(error, {
      event: "ui.boundary.caught",
      reference: createEventId("err"),
      tags: { boundary: this.props.name },
    });
    this.setState({ reference });
  }

  reset = (): void => {
    this.setState({ error: undefined, reference: undefined });
  };

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return this.props.fallback({
      error: this.state.error,
      reference: this.state.reference ?? "",
      reset: this.reset,
    });
  }
}

/**
 * For Next.js `error.tsx` / `global-error.tsx`: report the error once and
 * return the reference to show. A server-rendered error carries Next's
 * `digest`, which is also written to the server log line, so the digest is
 * the reference; a client-only error gets a fresh event id.
 */
export function useErrorReference(
  error: (Error & { digest?: string }) | undefined,
  boundary: string,
): string {
  const [reference, setReference] = useState(() => error?.digest ?? "");
  useEffect(() => {
    if (!error) return;
    const id = report(error, {
      event: "ui.route.failed",
      reference: error.digest ?? createEventId("err"),
      tags: { boundary, digest: error.digest },
    });
    setReference(id);
  }, [error, boundary]);
  return reference;
}
