/* eslint-disable @typescript-eslint/no-require-imports */
import { useFonts } from "expo-font";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

const satoshiFonts = {
  "Satoshi-Light": require("./assets/fonts/Satoshi-Light.ttf"),
  Satoshi: require("./assets/fonts/Satoshi-Regular.ttf"),
  "Satoshi-Medium": require("./assets/fonts/Satoshi-Medium.ttf"),
  "Satoshi-Bold": require("./assets/fonts/Satoshi-Bold.ttf"),
  "Satoshi-Black": require("./assets/fonts/Satoshi-Black.ttf"),
} as const;

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

function satoshiFamily(style: TextProps["style"] | TextInputProps["style"]) {
  const weight = StyleSheet.flatten(style as TextStyle)?.fontWeight;
  const numericWeight =
    weight === "bold"
      ? 700
      : typeof weight === "number"
        ? weight
        : Number.parseInt(weight ?? "400", 10);

  if (numericWeight >= 800) return "Satoshi-Black";
  if (numericWeight >= 700) return "Satoshi-Bold";
  if (numericWeight >= 500) return "Satoshi-Medium";
  if (numericWeight <= 350) return "Satoshi-Light";
  return "Satoshi";
}

export function useSatoshiFonts() {
  return useFonts(satoshiFonts);
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
