import {
  StyleSheet,
  Text as NativeText,
  type TextProps as NativeTextProps,
  type TextStyle,
} from "react-native";
import { devWarn } from "../dev";
import { useTheme } from "../theme/ThemeProvider";
import {
  nativeTokens,
  type NativeColorRole,
  type NativeTypeStyle,
} from "../tokens";
import { fontFace, type FontWeight } from "./fonts";
import { fontScaleCap, READABLE_FLOOR, readableFontSize } from "./scale";

export interface TextProps extends NativeTextProps {
  /** A Tideline type style. Default `phone-body` (16 / 22). */
  readonly variant?: NativeTypeStyle;
  /** A colour role. Default `text`. */
  readonly tone?: NativeColorRole;
  /** Tabular figures, for numbers that line up or change in place. */
  readonly tabular?: boolean;
  /** Overrides the style's weight; resolved to a shipped face. */
  readonly weight?: FontWeight;
  /** `mono` sets Geist Mono (codes, small uppercase labels). */
  readonly family?: "ui" | "mono";
}

function weightOf(value: TextStyle["fontWeight"]): number | undefined {
  if (value === undefined || value === "normal") return undefined;
  if (value === "bold") return 700;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** The style a variant resolves to, before the caller's style. Pure. */
export function textStyleFor(
  variant: NativeTypeStyle,
  options: {
    readonly color: string;
    readonly weight?: number;
    readonly family?: "ui" | "mono";
    readonly fontSize?: number;
    readonly lineHeight?: number;
    readonly tabular?: boolean;
  },
): TextStyle {
  const role = nativeTokens.type[variant];
  const fontSize = readableFontSize(options.fontSize ?? role.fontSize);
  const lineHeight =
    options.lineHeight ??
    (fontSize === role.fontSize
      ? role.lineHeight
      : Math.round((fontSize * role.lineHeight) / role.fontSize));
  const tracking = role.letterSpacing / role.fontSize;
  return {
    color: options.color,
    fontFamily: fontFace(
      options.family ?? role.family,
      options.weight ?? role.fontWeight,
    ),
    // The face carries the weight; asking iOS for one too can synthesize.
    fontWeight: "normal",
    fontSize,
    lineHeight,
    letterSpacing: Math.round(fontSize * tracking * 1000) / 1000,
    ...(options.tabular || role.family === "numeric"
      ? { fontVariant: ["tabular-nums"] as TextStyle["fontVariant"] }
      : {}),
  };
}

/**
 * Text in Geist (or Geist Mono), on the Tideline type scale, coloured by role.
 * It scales with Dynamic Type up to the role's cap and never renders below
 * the 12 pt floor.
 */
export function Text({
  variant = "phone-body",
  tone = "text",
  tabular,
  weight,
  family,
  style,
  maxFontSizeMultiplier,
  ...props
}: TextProps) {
  const { colors } = useTheme();
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const requested =
    typeof flat.fontSize === "number" ? flat.fontSize : undefined;
  if (requested !== undefined && requested < READABLE_FLOOR) {
    devWarn(
      `Text asked for ${requested} pt; the readability floor is ${READABLE_FLOOR} pt (contract R3).`,
    );
  }
  const resolved = textStyleFor(variant, {
    color: colors[tone],
    weight: weight ?? weightOf(flat.fontWeight),
    family,
    fontSize: requested,
    lineHeight:
      typeof flat.lineHeight === "number" ? flat.lineHeight : undefined,
    tabular,
  });
  return (
    <NativeText
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ?? fontScaleCap(resolved.fontSize as number)
      }
      {...props}
      style={[
        resolved,
        style,
        {
          fontFamily: resolved.fontFamily,
          fontWeight: "normal",
          fontSize: resolved.fontSize,
          lineHeight: resolved.lineHeight,
        },
      ]}
    />
  );
}
