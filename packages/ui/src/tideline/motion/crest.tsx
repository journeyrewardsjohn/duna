import type { CSSProperties } from "react";

/**
 * The Crest geometry for motion, from the brand book (section 1). The crests
 * start at x = 0 inside `translate(33 0)` so `scaleX` grows them from the
 * line. Used by the loaders and the first-open sequence; the static logo is
 * `DunaMark` / `DunaLogo` in `packages/ui/src/brand`.
 */
export const CREST_VIEWBOX = "16 13 59 74";
/** Width over height of the mark. */
export const CREST_ASPECT = 59 / 74;

export const CREST_LINE = { x: 16, y: 13, width: 10, height: 74 } as const;

/** Inner, middle, outer: the order they rise in. */
export const CREST_PATHS = [
  "M3.04 13A8 40 0 0 1 3.04 87L0 87L0 13Z",
  "M9.12 13A24 40 0 0 1 9.12 87L5.7 87A15 40 0 0 0 5.7 13Z",
  "M15.96 13A42 40 0 0 1 15.96 87L11.78 87A31 40 0 0 0 11.78 13Z",
] as const;

/** The micro mark's one solid crest, for sizes under 20 px. */
export const CREST_MICRO_PATH = "M15.96 13A42 40 0 0 1 15.96 87L0 87L0 13Z";

/** The drawn wordmark, viewBox 0 0 306 100, stroke 9, square ends. */
export const WORDMARK_VIEWBOX = "0 0 306 100";
export const WORDMARK_PATHS = [
  "M55.5 70A25.5 25.5 0 1 1 55.5 69.99",
  "M55.5 0V100",
  "M86.5 40V70A25.5 25.5 0 0 0 137.5 70M137.5 40V100",
  "M168.5 40V100M168.5 70A25.5 25.5 0 0 1 219.5 70V100",
  "M301.5 70A25.5 25.5 0 1 1 301.5 69.99",
  "M301.5 40V100",
] as const;

export interface CrestMarkProps {
  /** Classes on each crest, inner first, so CSS can time them. */
  crestClassName?: string;
  lineClassName?: string;
  micro?: boolean;
  className?: string;
}

/** The mark as animatable parts: the line and the crests growing from it. */
export function CrestMark({
  crestClassName,
  lineClassName,
  micro = false,
  className,
}: CrestMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox={CREST_VIEWBOX}
    >
      <rect className={lineClassName} {...CREST_LINE} />
      <g transform="translate(33 0)">
        {micro ? (
          <path className={crestClassName} d={CREST_MICRO_PATH} />
        ) : (
          CREST_PATHS.map((d, index) => (
            <path
              className={crestClassName}
              d={d}
              key={d}
              style={{ "--td-crest-i": index } as CSSProperties}
            />
          ))
        )}
      </g>
    </svg>
  );
}

/** The wordmark as strokes that can draw on (`pathLength` 1). */
export function Wordmark({
  className,
  strokeClassName,
}: {
  className?: string;
  strokeClassName?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox={WORDMARK_VIEWBOX}
    >
      {WORDMARK_PATHS.map((d, index) => (
        <path
          className={strokeClassName}
          d={d}
          key={d}
          pathLength={1}
          style={{ "--td-stroke-i": index } as CSSProperties}
        />
      ))}
    </svg>
  );
}
