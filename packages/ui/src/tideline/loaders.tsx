import { type ReactNode, useId } from "react";
import { cx } from "./cx";

export type LoaderSize = "sm" | "md" | "lg";

/** The wave of the Duna mark, on its 64 by 48 grid. */
const TIDELINE_CURVE =
  "M6 36.5C17.5 36.5 22.4 31.7 29.2 26.3C36.3 20.7 45 18.4 58 11.5";

export interface SunspotProps {
  /** Names the wait. Leave it out inside a control that already says it. */
  label?: string;
  className?: string;
}

/**
 * Sunspot: a sun dot orbiting a ring. The inline loader, for inside a
 * loading Button, a searching SearchField or a saving Toast.
 */
export function Sunspot({ label, className }: SunspotProps) {
  const spot = (
    <span aria-hidden="true" className={cx("td-sunspot", className)}>
      <i />
    </span>
  );
  if (!label) return spot;
  return (
    <span className="td-loader td-loader--inline" role="status">
      {spot}
      <span className="td-sr">{label}</span>
    </span>
  );
}

export interface SunriseProps {
  /** What is loading, like "Loading courts". `false` shows no text. */
  label?: string | false;
  /** Read by screen readers when `label` is `false`. */
  accessibleLabel?: string;
  size?: LoaderSize;
  className?: string;
}

/**
 * Sunrise: the sun rising over the tideline, the curve from the Duna mark.
 * The section loader, for a list or panel whose layout is not known yet, and
 * the core of the page loader. With reduced motion the sun rests risen.
 */
export function Sunrise({
  label = "Loading",
  accessibleLabel = "Loading",
  size = "md",
  className,
}: SunriseProps) {
  const clipId = useId();
  return (
    <span
      className={cx("td-loader td-sunrise", `td-sunrise--${size}`, className)}
      role="status"
    >
      <svg
        aria-hidden="true"
        className="td-sunrise__art"
        focusable="false"
        viewBox="0 0 64 48"
      >
        <defs>
          <clipPath id={clipId}>
            {/* Everything above the wave, so the sun appears from behind it. */}
            <path d={`${TIDELINE_CURVE}L64 8V-24H0V36.5Z`} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <circle className="td-sunrise__sun" cx="34" cy="19" r="8" />
        </g>
        <path className="td-sunrise__line" d="M5 41H59" />
        <path
          className="td-sunrise__tide"
          d={TIDELINE_CURVE}
          pathLength={100}
        />
      </svg>
      {label === false ? (
        <span className="td-sr">{accessibleLabel}</span>
      ) : (
        <span className="td-sunrise__label">{label}</span>
      )}
    </span>
  );
}

export interface RippleProps {
  label?: string | false;
  accessibleLabel?: string;
  className?: string;
}

/**
 * Sand ripple: three raked lines of sand, shifting. A placeholder inside a
 * card that cannot show a skeleton, like a chart or a map.
 */
export function Ripple({
  label = "Loading",
  accessibleLabel = "Loading",
  className,
}: RippleProps) {
  return (
    <span className={cx("td-loader td-ripple", className)} role="status">
      <svg
        aria-hidden="true"
        className="td-ripple__art"
        focusable="false"
        viewBox="0 0 96 40"
      >
        <path d="M6 10C22 4 34 16 50 10S78 4 90 10" />
        <path d="M6 20C22 14 34 26 50 20S78 14 90 20" />
        <path d="M6 30C22 24 34 36 50 30S78 24 90 30" />
      </svg>
      {label === false ? (
        <span className="td-sr">{accessibleLabel}</span>
      ) : (
        <span className="td-sunrise__label">{label}</span>
      )}
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
 * Tide shimmer: a placeholder in the shape of the content that is coming
 * (text lines, an avatar, a list row or a card). Use it whenever the layout
 * is known. With reduced motion it is a still block.
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
  /** What is loading, shown under the sunrise. */
  label?: string;
  /** A second line, like what happens next. */
  description?: ReactNode;
  /** Covers the viewport instead of filling its container. */
  fixed?: boolean;
  className?: string;
}

/** The full-page first load: Sunrise on the First Light ground. */
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
      data-surface="first-light"
    >
      <Sunrise label={label} size="lg" />
      {description ? (
        <p className="td-pageloader__description">{description}</p>
      ) : null}
    </div>
  );
}
