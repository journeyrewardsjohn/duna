"use client";

import type { ReactNode } from "react";
import { cx } from "../base/cx";
import type { DelayedLoadingOptions } from "../interactions/interaction-core";
import { useDelayedLoading } from "../interactions/interactions";

export interface TopProgressProps extends DelayedLoadingOptions {
  /** Whether work is running. */
  loading: boolean;
  /** Read by screen readers while the line shows. */
  label?: string;
  className?: string;
}

/**
 * A thin line across the top of its container (give the container
 * `position: relative`) while something loads in the background: a page
 * change, a table refetch. It waits 250ms before it appears and then stays
 * 400ms, so fast work shows nothing.
 */
export function TopProgress({
  loading,
  label = "Loading",
  className,
  ...timing
}: TopProgressProps) {
  const visible = useDelayedLoading(loading, timing);
  return (
    <span
      className={cx("td-topprogress", className)}
      data-visible={visible ? "" : undefined}
      role="status"
    >
      {visible ? (
        <span className="td-sweep">
          <span className="td-sr">{label}</span>
        </span>
      ) : null}
    </span>
  );
}

export interface LoadingBoundaryProps extends DelayedLoadingOptions {
  loading: boolean;
  /** What to show for a wait worth showing, usually a `Skeleton`. */
  fallback: ReactNode;
  /** The content, shown when loaded and during a wait too short to show. */
  children: ReactNode;
}

/**
 * Swaps content for a placeholder only when the wait deserves one: nothing
 * changes for the first 250ms, and a placeholder that appears stays 400ms.
 */
export function LoadingBoundary({
  loading,
  fallback,
  children,
  ...timing
}: LoadingBoundaryProps) {
  const visible = useDelayedLoading(loading, timing);
  return <>{visible ? fallback : children}</>;
}
