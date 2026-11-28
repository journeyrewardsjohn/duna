import Svg, { Circle, Path, Rect } from "react-native-svg";
import {
  CRESTS,
  MARK_VIEWBOX,
  MICRO_BELOW_PX,
  MICRO_CREST,
  NET,
  WORDMARK_SHAPES,
  WORDMARK_STROKE,
  WORDMARK_VIEWBOX,
} from "../../brand/geometry";
import { useTheme } from "../theme/ThemeProvider";

export const MARK_RATIO = MARK_VIEWBOX.width / MARK_VIEWBOX.height;
const markBox = `${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`;

/** The brand colour of the mark on the current ground (brand book table). */
export function useMarkColor(): string {
  const { scheme, tokens } = useTheme();
  return scheme === "dark" ? tokens.brand.dune : tokens.brand["night-court"];
}

/**
 * The Crest mark (the micro mark under 20 pt). Brand geometry is shared with
 * the web `DunaMark` (`brand/geometry.ts`). Inside a control it is never
 * above 24 pt.
 */
export function DunaMark({
  size,
  color,
  micro,
  label = "Duna",
  decorative = false,
}: {
  /** Rendered height in points; the width follows 59:74. */
  readonly size: number;
  readonly color?: string;
  readonly micro?: boolean;
  readonly label?: string;
  readonly decorative?: boolean;
}) {
  const fallback = useMarkColor();
  const ink = color ?? fallback;
  const useMicro = micro ?? size < MICRO_BELOW_PX;
  return (
    <Svg
      accessibilityLabel={decorative ? undefined : label}
      accessibilityRole={decorative ? undefined : "image"}
      accessible={!decorative}
      height={size}
      viewBox={markBox}
      width={size * MARK_RATIO}
    >
      <Rect
        fill={ink}
        height={NET.height}
        width={NET.width}
        x={NET.x}
        y={NET.y}
      />
      {useMicro ? (
        <Path d={MICRO_CREST} fill={ink} />
      ) : (
        CRESTS.map((crest) => <Path d={crest} fill={ink} key={crest} />)
      )}
    </Svg>
  );
}

/** The drawn wordmark (never set in a font). Salt on dark, Night Court on light. */
export function DunaWordmark({
  width,
  color,
  label = "Duna",
}: {
  readonly width: number;
  readonly color?: string;
  readonly label?: string;
}) {
  const { scheme, tokens } = useTheme();
  const ink =
    color ??
    (scheme === "dark" ? tokens.brand.salt : tokens.brand["night-court"]);
  const height = (width * WORDMARK_VIEWBOX.height) / WORDMARK_VIEWBOX.width;
  return (
    <Svg
      accessibilityLabel={label}
      accessibilityRole="image"
      accessible
      height={height}
      viewBox={`0 0 ${WORDMARK_VIEWBOX.width} ${WORDMARK_VIEWBOX.height}`}
      width={width}
    >
      {WORDMARK_SHAPES.circles.map((circle) => (
        <Circle
          {...circle}
          fill="none"
          key={`${circle.cx}`}
          stroke={ink}
          strokeWidth={WORDMARK_STROKE}
        />
      ))}
      {WORDMARK_SHAPES.paths.map((d) => (
        <Path
          d={d}
          fill="none"
          key={d}
          stroke={ink}
          strokeLinecap="square"
          strokeWidth={WORDMARK_STROKE}
        />
      ))}
    </Svg>
  );
}
