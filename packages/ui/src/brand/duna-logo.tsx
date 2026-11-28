import type { CSSProperties } from "react";
import { type DunaBrandSvgProps, MarkShapes, usesMicroMark } from "./duna-mark";
import {
  CLEAR_SPACE_UNITS,
  HORIZONTAL,
  MARK_VIEWBOX,
  STACKED,
  WORDMARK_SHAPES,
  WORDMARK_STROKE,
} from "./geometry";

export type DunaLogoProps = DunaBrandSvgProps & {
  /** Rendered height in px; the width follows the lockup. Default 24. */
  readonly size?: number;
  /** `horizontal` puts the wordmark beside the mark; `stacked` beneath it. */
  readonly variant?: "horizontal" | "stacked";
  /** Accessible name. Defaults to "Duna". */
  readonly title?: string;
  /** Hide the logo from assistive technology (the name is written beside it). */
  readonly decorative?: boolean;
  /** Add three line-widths of clear space on every side. */
  readonly clearSpace?: boolean;
};

function Wordmark({ transform }: { readonly transform?: string }) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth={WORDMARK_STROKE}
      transform={transform}
    >
      {WORDMARK_SHAPES.circles.map((circle) => (
        <circle key={circle.cx} {...circle} />
      ))}
      {WORDMARK_SHAPES.paths.map((path) => (
        <path d={path} key={path} />
      ))}
    </g>
  );
}

/**
 * The Duna logo: the Crest and the drawn wordmark, horizontal or stacked. It
 * is never typeset. The mark inside it switches to the micro mark when the
 * mark is under 20 px tall. Colour is `currentColor`.
 */
export function DunaLogo({
  size = 24,
  variant = "horizontal",
  title = "Duna",
  decorative = false,
  clearSpace = false,
  style,
  ...rest
}: DunaLogoProps) {
  const lockup = variant === "stacked" ? STACKED : HORIZONTAL;
  const pad = clearSpace ? CLEAR_SPACE_UNITS : 0;
  const viewWidth = lockup.width + 2 * pad;
  const viewHeight = lockup.height + 2 * pad;
  // Horizontal: the mark is the lockup's height. Stacked: the mark is 74 of
  // the lockup's 105.86 units, so scale the micro threshold to the mark.
  const markHeight = size * (74 / viewHeight);
  const micro = usesMicroMark(markHeight);
  const accessible = decorative
    ? { "aria-hidden": true as const, focusable: false as const }
    : { "aria-label": title, role: "img" as const };
  const sized: CSSProperties = { flex: "none", ...style };
  const wordmarkTransform =
    variant === "stacked"
      ? `translate(0 ${STACKED.wordmarkY}) scale(${STACKED.wordmarkScale})`
      : `translate(${HORIZONTAL.wordmarkX} 0) scale(${HORIZONTAL.wordmarkScale})`;
  return (
    <svg
      data-duna-logo={variant}
      data-duna-mark={micro ? "micro" : "full"}
      fill="currentColor"
      height={size}
      style={sized}
      viewBox={`${-pad} ${-pad} ${viewWidth} ${viewHeight}`}
      width={Math.round(size * (viewWidth / viewHeight) * 100) / 100}
      xmlns="http://www.w3.org/2000/svg"
      {...accessible}
      {...rest}
    >
      {decorative ? null : <title>{title}</title>}
      <g transform={`translate(${-MARK_VIEWBOX.x} ${-MARK_VIEWBOX.y})`}>
        <MarkShapes micro={micro} />
      </g>
      <Wordmark transform={wordmarkTransform} />
    </svg>
  );
}
