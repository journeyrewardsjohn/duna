/**
 * The brand's loaders (brand book section 6), drawn from the Crest: they
 * grow from the line, never fade in place of growing. Plain markup, no
 * client JavaScript. Under reduced motion each rests in a finished state.
 *
 * | Loader       | Use                              |
 * | ------------ | -------------------------------- |
 * | RallyLoader  | Any fetching screen (default)    |
 * | CrossingLoader | Searching and matching         |
 * | SetBySet     | Known steps                      |
 * | Serve        | Sign-in, long sync (full screen) |
 * | MicroRally   | Inside a pressed button          |
 *
 * Tide sweep is `HorizonSweep`, sand shimmer is `Skeleton`, pull to refresh
 * is `PullToRefresh`.
 */
import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { CrestMark, Wordmark } from "../motion/crest";

export type BrandLoaderSize = "sm" | "md" | "lg";

export interface RallyLoaderProps {
  /** What is loading. Leave it out inside a control that already says it. */
  label?: string;
  /** 16, 24 or 40 px tall. */
  size?: BrandLoaderSize;
  className?: string;
}

function announce(
  label: string | undefined,
  art: ReactNode,
  className: string,
) {
  if (!label) {
    return (
      <span aria-hidden="true" className={className}>
        {art}
      </span>
    );
  }
  return (
    <span className={className} role="status">
      {art}
      <span className="td-sr">{label}</span>
    </span>
  );
}

/** The default wait: three crests swell from the line in turn, 150 ms apart. */
export function RallyLoader({
  label,
  size = "md",
  className,
}: RallyLoaderProps) {
  return announce(
    label,
    <CrestMark
      className="td-rallyloader__mark"
      crestClassName="td-rallyloader__crest"
    />,
    cx("td-rallyloader", `td-rallyloader--${size}`, className)!,
  );
}

/** The micro mark with its crest swelling: the loader inside a pressed button. */
export function MicroRally({
  label,
  className,
}: Omit<RallyLoaderProps, "size">) {
  return announce(
    label,
    <CrestMark
      className="td-microrally__mark"
      crestClassName="td-microrally__crest"
      micro
    />,
    cx("td-microrally", className)!,
  );
}

export interface CrossingLoaderProps {
  label?: string;
  className?: string;
}

/** Searching and matching: a ball arcs over the net line, back and forth. */
export function CrossingLoader({
  label = "Searching",
  className,
}: CrossingLoaderProps) {
  return announce(
    label,
    <svg
      aria-hidden="true"
      className="td-crossing__art"
      focusable="false"
      viewBox="0 0 48 32"
    >
      <path className="td-crossing__ground" d="M4 30h40" />
      <rect className="td-crossing__net" height="18" width="2" x="23" y="12" />
      <g className="td-crossing__travel">
        <g className="td-crossing__arc">
          <circle className="td-crossing__ball" cx="8" cy="26" r="3" />
        </g>
      </g>
    </svg>,
    cx("td-crossing", className)!,
  );
}

export interface SetBySetProps {
  /** How many steps there are (1 to 5). */
  steps: number;
  /** How many are complete. */
  done: number;
  /** Names the work, like "Importing your members". */
  label: string;
  /** A line under it, like "Step 2 of 3: matching emails". */
  caption?: ReactNode;
  className?: string;
}

/**
 * Known steps: one crest fills per completed step. A crest Rises from its
 * line the moment its step completes. A progressbar for assistive
 * technology.
 */
export function SetBySet({
  steps,
  done,
  label,
  caption,
  className,
}: SetBySetProps) {
  const count = Math.max(1, Math.min(5, Math.round(steps)));
  const complete = Math.max(0, Math.min(count, Math.round(done)));
  return (
    <div className={cx("td-setbyset", className)}>
      <div
        aria-label={label}
        aria-valuemax={count}
        aria-valuemin={0}
        aria-valuenow={complete}
        aria-valuetext={`${complete} of ${count} steps done`}
        className="td-setbyset__crests"
        role="progressbar"
      >
        {Array.from({ length: count }, (_, index) => (
          <span
            className="td-setbyset__step"
            data-done={index < complete ? "" : undefined}
            key={index}
          >
            <CrestMark
              className="td-setbyset__mark"
              crestClassName="td-setbyset__crest"
              lineClassName="td-setbyset__line"
              micro
            />
          </span>
        ))}
      </div>
      <p className="td-setbyset__label">{label}</p>
      {caption ? <p className="td-setbyset__caption">{caption}</p> : null}
    </div>
  );
}

export interface ServeProps {
  /** What is happening, shown under the wordmark. */
  label?: string;
  /** Cover the viewport (sign-in, a long sync). */
  fixed?: boolean;
  className?: string;
}

/** Sign-in and long syncs: the wordmark draws on, rests, and draws off. */
export function Serve({
  label = "Signing you in",
  fixed = false,
  className,
}: ServeProps) {
  return (
    <div
      className={cx("td-serve", fixed && "td-serve--fixed", className)}
      role="status"
    >
      <Wordmark
        className="td-serve__wordmark"
        strokeClassName="td-serve__stroke"
      />
      <p className="td-serve__label">{label}</p>
    </div>
  );
}
