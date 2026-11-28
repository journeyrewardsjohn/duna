import type { CSSProperties, SVGAttributes } from "react";
import {
  CLEAR_SPACE_UNITS,
  CRESTS,
  MARK_VIEWBOX,
  MICRO_BELOW_PX,
  MICRO_CREST,
  NET,
} from "./geometry";

export type DunaBrandSvgProps = Omit<
  SVGAttributes<SVGSVGElement>,
  "children" | "height" | "width" | "viewBox" | "role" | "title"
>;

export type DunaMarkProps = DunaBrandSvgProps & {
  /** Rendered height in px. The width follows the mark's 59:74 ratio. */
  readonly size?: number;
  /** Accessible name. Defaults to "Duna". */
  readonly title?: string;
  /** Hide the mark from assistive technology (it sits beside the word). */
  readonly decorative?: boolean;
  /**
   * Add the brand book's clear space (three line-widths on every side) inside
   * the SVG, so the mark can be placed flush against other content.
   */
  readonly clearSpace?: boolean;
  /** Force the micro mark (true) or the full mark (false). Default: by size. */
  readonly micro?: boolean;
};

/** The viewBox for the mark, optionally padded by the clear space. */
export function markViewBox(clearSpace: boolean): string {
  const pad = clearSpace ? CLEAR_SPACE_UNITS : 0;
  return [
    MARK_VIEWBOX.x - pad,
    MARK_VIEWBOX.y - pad,
    MARK_VIEWBOX.width + 2 * pad,
    MARK_VIEWBOX.height + 2 * pad,
  ].join(" ");
}

/** The full Crest drawn inside a parent `<g fill>`; the micro mark if asked. */
export function MarkShapes({ micro }: { readonly micro: boolean }) {
  return (
    <>
      <rect height={NET.height} width={NET.width} x={NET.x} y={NET.y} />
      {micro ? (
        <path d={MICRO_CREST} />
      ) : (
        CRESTS.map((crest) => <path d={crest} key={crest} />)
      )}
    </>
  );
}

/** Whether a mark of this height uses the micro mark. */
export function usesMicroMark(size: number, micro?: boolean): boolean {
  return micro ?? size < MICRO_BELOW_PX;
}

/**
 * The Duna Crest mark: one line (the net) and three crests. Below 20 px it
 * becomes the micro mark. Colour is `currentColor`: set `color` from a token
 * (Night Court on Salt or white, Dune on Night Court).
 */
export function DunaMark({
  size = 24,
  title = "Duna",
  decorative = false,
  clearSpace = false,
  micro,
  style,
  ...rest
}: DunaMarkProps) {
  const pad = clearSpace ? 2 * CLEAR_SPACE_UNITS : 0;
  const ratio = (MARK_VIEWBOX.width + pad) / (MARK_VIEWBOX.height + pad);
  const accessible = decorative
    ? { "aria-hidden": true as const, focusable: false as const }
    : { "aria-label": title, role: "img" as const };
  const sized: CSSProperties = { flex: "none", ...style };
  return (
    <svg
      data-duna-mark={usesMicroMark(size, micro) ? "micro" : "full"}
      fill="currentColor"
      height={size}
      style={sized}
      viewBox={markViewBox(clearSpace)}
      width={Math.round(size * ratio * 100) / 100}
      xmlns="http://www.w3.org/2000/svg"
      {...accessible}
      {...rest}
    >
      {decorative ? null : <title>{title}</title>}
      <MarkShapes micro={usesMicroMark(size, micro)} />
    </svg>
  );
}
