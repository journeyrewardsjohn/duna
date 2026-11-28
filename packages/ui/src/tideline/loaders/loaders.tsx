import type { ReactNode } from "react";
import { cx } from "../base/cx";

export type LoaderSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  /** Names the wait. Leave it out inside a control that already says it. */
  label?: string;
  size?: LoaderSize;
  className?: string;
}

/**
 * The everyday loader: a neutral ring. Use it inside controls and beside
 * text. Pair it with `useDelayedLoading` so quick work shows no loader.
 */
export function Spinner({ label, size = "md", className }: SpinnerProps) {
  const ring = (
    <span
      aria-hidden="true"
      className={cx(
        "td-spinner",
        size !== "md" && `td-spinner--${size}`,
        className,
      )}
    />
  );
  if (!label) return ring;
  return (
    <span className="td-loader td-loader--inline" role="status">
      {ring}
      <span className="td-sr">{label}</span>
    </span>
  );
}

export interface SunriseProps {
  /** What is loading, like "Loading your club". */
  label?: string;
  size?: "md" | "lg";
  className?: string;
}

/**
 * A thin arc rising over a horizon line: the quiet Duna mark for full-page
 * loading and pull to refresh, not for everyday waits. With reduced motion
 * the arc rests drawn.
 */
export function Sunrise({
  label = "Loading",
  size = "md",
  className,
}: SunriseProps) {
  return (
    <span
      className={cx(
        "td-loader td-sunrise",
        size === "lg" && "td-sunrise--lg",
        className,
      )}
      role="status"
    >
      <svg
        aria-hidden="true"
        className="td-sunrise__art"
        focusable="false"
        viewBox="0 0 64 40"
      >
        <path
          className="td-sunrise__arc"
          d="M16 30a16 16 0 0 1 32 0"
          pathLength={100}
        />
        <path className="td-sunrise__line" d="M4 30h56" />
      </svg>
      <span className="td-sr">{label}</span>
    </span>
  );
}

export interface HorizonSweepProps {
  label?: string;
  className?: string;
}

/** A thin horizon line with a light passing along it, for a quiet wait. */
export function HorizonSweep({
  label = "Loading",
  className,
}: HorizonSweepProps) {
  return (
    <span className={cx("td-sweep", className)} role="status">
      <span className="td-sr">{label}</span>
    </span>
  );
}

export interface SkeletonProps {
  /** The shape of what is loading. */
  kind?: "lines" | "avatar" | "row" | "card";
  /** How many lines of text. */
  lines?: number;
  /**
   * Announces the wait once, for the first placeholder of a region. Leave it
   * out on the rest so a list of skeletons is not read out row by row.
   */
  label?: string;
  className?: string;
}

function SkeletonLines({ lines }: { lines: number }) {
  return (
    <span className="td-skeleton__lines">
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span className="td-skel td-skeleton__line" key={index} />
      ))}
    </span>
  );
}

/**
 * A placeholder in the shape of the content that is coming: text lines, an
 * avatar, a list row or a card. Use it whenever the layout is known, inside
 * `LoadingBoundary` so it only appears for waits worth showing.
 */
export function Skeleton({
  kind = "lines",
  lines = kind === "lines" ? 3 : 2,
  label,
  className,
}: SkeletonProps) {
  let shape: ReactNode;
  if (kind === "avatar") {
    shape = <span className="td-skel td-skeleton__avatar" />;
  } else if (kind === "row") {
    shape = (
      <>
        <span className="td-skel td-skeleton__avatar" />
        <SkeletonLines lines={lines} />
      </>
    );
  } else if (kind === "card") {
    shape = (
      <>
        <span className="td-skel td-skeleton__media" />
        <SkeletonLines lines={lines} />
      </>
    );
  } else {
    shape = <SkeletonLines lines={lines} />;
  }
  return (
    <span
      aria-hidden={label ? undefined : true}
      className={cx("td-skeleton", `td-skeleton--${kind}`, className)}
      role={label ? "status" : undefined}
    >
      {shape}
      {label ? <span className="td-sr">{label}</span> : null}
    </span>
  );
}

export interface PageLoaderProps {
  /** What is loading, shown under the mark. */
  label?: string;
  /** A second line, like what happens next. */
  description?: ReactNode;
  /** Covers the viewport instead of filling its container. */
  fixed?: boolean;
  className?: string;
}

/** The full-page first load: the Sunrise mark, a label and one line. */
export function PageLoader({
  label = "Loading",
  description,
  fixed = false,
  className,
}: PageLoaderProps) {
  return (
    <div
      className={cx(
        "td-pageloader",
        fixed && "td-pageloader--fixed",
        className,
      )}
    >
      <Sunrise label={label} size="lg" />
      <p aria-hidden="true" className="td-pageloader__label">
        {label}
      </p>
      {description ? (
        <p className="td-pageloader__description">{description}</p>
      ) : null}
    </div>
  );
}
