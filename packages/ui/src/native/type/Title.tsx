import type { TextProps as NativeTextProps } from "react-native";
import { Text as NativeText } from "react-native";
import { devWarn } from "../dev";
import { useTheme } from "../theme/ThemeProvider";
import { nativeTokens, type NativeColorRole } from "../tokens";
import { fontFace } from "./fonts";
import { fontScaleCap } from "./scale";
import { useTitleRegistration } from "./title-region";

/** The brand title rule: Jost Medium 500, tracking -0.015em, never below 22 pt. */
export const TITLE_MIN_SIZE = nativeTokens.brandType.minFontSize;
/** The root-screen size (the phone large-title slot). */
export const TITLE_DEFAULT_SIZE = nativeTokens.type["phone-title"].fontSize;

export interface TitleProps extends Omit<NativeTextProps, "children"> {
  /** Words only: never a numeral (contract R2). */
  readonly children: string;
  /** Point size; raised to 22 if smaller. Default 28. */
  readonly size?: number;
  readonly tone?: NativeColorRole;
}

/** True when a title string breaks the "never on a numeral" rule. */
export function titleHasDigit(text: string): boolean {
  return /\p{Nd}/u.test(text);
}

/** The size a title renders at: at least 22 pt. Pure. */
export function titleSize(size: number | undefined): number {
  return Math.max(TITLE_MIN_SIZE, size ?? TITLE_DEFAULT_SIZE);
}

/**
 * The one Jost title on a screen. Enforces 22 pt; in development it warns
 * when the text contains a digit or a second Title mounts in the same
 * `TitleRegion`.
 */
export function Title({
  children,
  size: requested,
  tone = "text",
  style,
  maxFontSizeMultiplier,
  ...props
}: TitleProps) {
  const { colors } = useTheme();
  useTitleRegistration(children);
  if (requested !== undefined && requested < TITLE_MIN_SIZE) {
    devWarn(
      `Title asked for ${requested} pt; Jost titles are never below ${TITLE_MIN_SIZE} pt.`,
    );
  }
  if (titleHasDigit(children)) {
    devWarn(
      `Title "${children}" contains a numeral; numbers are never set in Jost. Put them in Text or Numerals.`,
    );
  }
  const size = titleSize(requested);
  const ratio =
    nativeTokens.type["phone-title"].lineHeight /
    nativeTokens.type["phone-title"].fontSize;
  return (
    <NativeText
      accessibilityRole="header"
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontScaleCap(size)}
      {...props}
      style={[
        style,
        {
          color: colors[tone],
          fontFamily: fontFace("brand", nativeTokens.brandType.fontWeight),
          fontWeight: "normal",
          fontSize: size,
          lineHeight: Math.round(size * ratio),
          letterSpacing:
            Math.round(size * nativeTokens.brandType.letterSpacingEm * 1000) /
            1000,
        },
      ]}
    >
      {children}
    </NativeText>
  );
}
