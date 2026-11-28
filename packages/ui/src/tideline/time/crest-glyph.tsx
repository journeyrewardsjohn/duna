import { CRESTS, MARK_VIEWBOX, NET } from "../../brand/geometry";
import { cx } from "../base/cx";

export interface CrestGlyphProps {
  /** Crests filled, inner first: 0 to 3. */
  filled: number;
  /** Rendered height in px; 14 in chips, 16 inline, 20 in controls, 24 at most. */
  size?: 14 | 16 | 20 | 24;
  className?: string;
}

/**
 * The Crest as a score: the net and three crests, `filled` of them inked and
 * the rest drawn as a ghost. Used by `DurationCrests` (one crest for the
 * first hour, one more per half hour) and the play call. Decorative: the
 * control around it carries the words.
 */
export function CrestGlyph({ filled, size = 16, className }: CrestGlyphProps) {
  const count = Math.max(0, Math.min(3, Math.round(filled)));
  // CRESTS lists outer to inner; crests fill from the inside out.
  const inner = [...CRESTS].reverse();
  return (
    <svg
      aria-hidden="true"
      className={cx("td-crestglyph", className)}
      data-filled={count}
      focusable="false"
      height={size}
      viewBox={`${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`}
      width={
        Math.round(((size * MARK_VIEWBOX.width) / MARK_VIEWBOX.height) * 100) /
        100
      }
    >
      <rect
        className="td-crestglyph__net"
        height={NET.height}
        width={NET.width}
        x={NET.x}
        y={NET.y}
      />
      {inner.map((d, index) => (
        <path
          className="td-crestglyph__crest"
          d={d}
          data-on={index < count ? "" : undefined}
          key={d}
        />
      ))}
    </svg>
  );
}
