import Svg, { Path } from "react-native-svg";
import {
  iconSizes,
  iconStroke,
  resolveGlyph,
  type GlyphName,
  type IconSize,
} from "../../icons/glyph-index";
import { useTheme } from "../theme/ThemeProvider";
import { nativeTokens, type NativeColorRole } from "../tokens";

export { iconSizes, iconStroke, type GlyphName, type IconSize };

export interface IconProps {
  readonly name: GlyphName;
  /** chip 14, inline 16, control 20 (default), nav 24. Nothing else. */
  readonly size?: IconSize;
  /** A colour role (default `text`). */
  readonly tone?: NativeColorRole;
  /** An explicit colour, for an icon on a fixed fill (wins over `tone`). */
  readonly color?: string;
  /**
   * Decorative by default (the control around it carries the name). Give a
   * label only when the icon stands alone; it becomes an image with that name.
   */
  readonly label?: string;
  readonly testID?: string;
}

/**
 * A Duna glyph: the same path data as the web `Icon` (`icons/glyphs.ts`),
 * on the 24 grid with a 1.75 stroke, square ends, mitred joins, no fill.
 * Light marks are solid shapes with a Hardwood accent.
 */
export function Icon({
  name,
  size = "control",
  tone = "text",
  color,
  label,
  testID,
}: IconProps) {
  const { colors } = useTheme();
  const glyph = resolveGlyph(name);
  if (!glyph) return null;
  const ink = color ?? colors[tone];
  const px = iconSizes[size];
  const access = label
    ? {
        accessible: true,
        accessibilityLabel: label,
        accessibilityRole: "image" as const,
      }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      };

  if (glyph.kind === "mark") {
    return (
      <Svg
        height={px}
        testID={testID}
        viewBox="0 0 24 24"
        width={px}
        {...access}
      >
        {glyph.shapes.map((shape) =>
          shape.fill === "outline" ? (
            <Path
              d={shape.d}
              fill="none"
              key={shape.d}
              stroke={ink}
              strokeLinecap={iconStroke.linecap}
              strokeLinejoin={iconStroke.linejoin}
              strokeWidth={iconStroke.width}
            />
          ) : (
            <Path
              d={shape.d}
              fill={shape.fill === "accent" ? nativeTokens.brand.hardwood : ink}
              key={shape.d}
            />
          ),
        )}
      </Svg>
    );
  }

  return (
    <Svg
      fill="none"
      height={px}
      testID={testID}
      viewBox="0 0 24 24"
      width={px}
      {...access}
    >
      {glyph.paths.map((d) => (
        <Path
          d={d}
          fill="none"
          key={d}
          stroke={ink}
          strokeLinecap={iconStroke.linecap}
          strokeLinejoin={iconStroke.linejoin}
          strokeWidth={iconStroke.width}
        />
      ))}
    </Svg>
  );
}
