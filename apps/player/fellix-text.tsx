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

const fellixFonts = {
  Fellix: require("./assets/fonts/Fellix-Regular.ttf"),
  "Fellix-Medium": require("./assets/fonts/Fellix-Medium.ttf"),
  "Fellix-SemiBold": require("./assets/fonts/Fellix-SemiBold.ttf"),
  "Fellix-Bold": require("./assets/fonts/Fellix-Bold.ttf"),
  "Fellix-ExtraBold": require("./assets/fonts/Fellix-ExtraBold.ttf"),
  "Archivo-Score": require("./assets/fonts/Archivo-Score.ttf"),
  "Archivo-Monument": require("./assets/fonts/Archivo-Monument.ttf"),
  "Archivo-Hero": require("./assets/fonts/Archivo-Hero.ttf"),
  "Archivo-Block": require("./assets/fonts/Archivo-Block.ttf"),
  "Archivo-Table": require("./assets/fonts/Archivo-Table.ttf"),
  "Archivo-Chip": require("./assets/fonts/Archivo-Chip.ttf"),
  "Archivo-Wordmark": require("./assets/fonts/Archivo-Wordmark.ttf"),
} as const;

export type DunaNumericTier =
  "score" | "monument" | "hero" | "block" | "table" | "chip";

const numericFamily: Record<DunaNumericTier, string> = {
  score: "Archivo-Score",
  monument: "Archivo-Monument",
  hero: "Archivo-Hero",
  block: "Archivo-Block",
  table: "Archivo-Table",
  chip: "Archivo-Chip",
};

const numericDefaultSize: Record<DunaNumericTier, number> = {
  score: 64,
  monument: 140,
  hero: 44,
  block: 36,
  table: 15,
  chip: 12.5,
};

const numericTracking: Record<DunaNumericTier, number> = {
  score: -0.03,
  monument: -0.03,
  hero: -0.02,
  block: -0.02,
  table: 0,
  chip: 0,
};

function fellixFamily(style: TextProps["style"] | TextInputProps["style"]) {
  const flattened = StyleSheet.flatten(style as TextStyle);
  if (flattened?.fontFamily?.startsWith("Archivo")) {
    return flattened.fontFamily;
  }
  const weight = flattened?.fontWeight;
  const numericWeight =
    weight === "bold"
      ? 700
      : typeof weight === "number"
        ? weight
        : Number.parseInt(weight ?? "400", 10);

  if (numericWeight >= 800) return "Fellix-ExtraBold";
  if (numericWeight >= 700) return "Fellix-Bold";
  if (numericWeight >= 600) return "Fellix-SemiBold";
  if (numericWeight >= 500) return "Fellix-Medium";
  return "Fellix";
}

export function useFellixFonts() {
  return useFonts(fellixFonts);
}

export function FellixText({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[style, { fontFamily: fellixFamily(style), fontWeight: "normal" }]}
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
  return (
    <NativeText
      {...props}
      style={[
        style,
        {
          fontFamily: numericFamily[tier],
          fontVariant:
            tier === "monument" ? ["proportional-nums"] : ["tabular-nums"],
          fontWeight: "normal",
          letterSpacing: fontSize * numericTracking[tier],
        },
      ]}
    />
  );
}

export function FellixTextInput({ style, ...props }: TextInputProps) {
  return (
    <NativeTextInput
      {...props}
      style={[style, { fontFamily: fellixFamily(style), fontWeight: "normal" }]}
    />
  );
}
