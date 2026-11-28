import { fontFace } from "@duna/ui/native/type";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

/**
 * The legacy text layer (M-F0/M-F1): the names stay so unmigrated screens
 * keep working, but every face is now Geist, embedded in the app by the
 * `expo-font` config plugin (app.json). Weights resolve to a shipped face,
 * never a synthesized one. New screens use `@duna/ui/native` (`Text`,
 * `Title`, `Numerals`).
 */

export type DunaNumericTier =
  "score" | "monument" | "hero" | "block" | "table" | "chip";

const numericDefaultSize: Record<DunaNumericTier, number> = {
  score: 64,
  monument: 140,
  hero: 44,
  block: 36,
  table: 15,
  chip: 12.5,
};

const numericWeight: Record<DunaNumericTier, TextStyle["fontWeight"]> = {
  score: "900",
  monument: "900",
  hero: "700",
  block: "700",
  table: "700",
  chip: "700",
};

function weightOf(style: TextProps["style"] | TextInputProps["style"]) {
  return StyleSheet.flatten(style as TextStyle)?.fontWeight;
}

/** Was Satoshi: now the Geist face for the style's weight. */
function satoshiFamily(style: TextProps["style"] | TextInputProps["style"]) {
  return fontFace("ui", weightOf(style));
}

export function SatoshiText({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[
        style,
        { fontFamily: satoshiFamily(style), fontWeight: "normal" },
      ]}
    />
  );
}

export function DunaNumericText({
  style,
  tier = "table",
  ...props
}: TextProps & { readonly tier?: DunaNumericTier }) {
  const flattened = StyleSheet.flatten(style as TextStyle);
  const fontSize = flattened?.fontSize ?? numericDefaultSize[tier];
  const fontWeight = numericWeight[tier];
  return (
    <NativeText
      {...props}
      style={[
        style,
        {
          fontFamily: satoshiFamily([{ fontWeight }, style]),
          fontVariant:
            tier === "monument" ? ["proportional-nums"] : ["tabular-nums"],
          fontWeight: "normal",
          letterSpacing:
            tier === "score" || tier === "monument"
              ? fontSize * -0.03
              : tier === "hero" || tier === "block"
                ? fontSize * -0.02
                : 0,
        },
      ]}
    />
  );
}

export function SatoshiTextInput({ style, ...props }: TextInputProps) {
  return (
    <NativeTextInput
      {...props}
      style={[
        style,
        { fontFamily: satoshiFamily(style), fontWeight: "normal" },
      ]}
    />
  );
}
