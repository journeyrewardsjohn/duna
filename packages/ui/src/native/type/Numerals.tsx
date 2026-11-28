import type { TextProps as NativeTextProps } from "react-native";
import type { NativeColorRole, NativeTypeStyle } from "../tokens";
import { Text } from "./Text";
import type { FontWeight } from "./fonts";

export interface NumeralsProps extends Omit<NativeTextProps, "children"> {
  readonly children: string | number;
  /** A figure style. Default `figure` (32 / 36). */
  readonly variant?: NativeTypeStyle;
  /** Geist Mono (scores, data; default) or Geist 600 (prices, times in rows). */
  readonly family?: "mono" | "ui";
  readonly weight?: FontWeight;
  readonly tone?: NativeColorRole;
}

/**
 * Numbers: tabular figures, never Jost. Geist Mono by default for scores and
 * data; `family="ui"` for Geist 600 figures in rows and prices.
 */
export function Numerals({
  children,
  variant = "figure",
  family = "mono",
  ...props
}: NumeralsProps) {
  return (
    <Text family={family} tabular variant={variant} {...props}>
      {children}
    </Text>
  );
}
