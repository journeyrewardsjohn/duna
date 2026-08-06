/* eslint-disable @typescript-eslint/no-require-imports */
import { useFonts } from "expo-font";
import {
  Archivo_400Regular,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from "@expo-google-fonts/archivo";
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
  Archivo: Archivo_400Regular,
  "Archivo-Bold": Archivo_700Bold,
  "Archivo-ExtraBold": Archivo_800ExtraBold,
} as const;

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

export function FellixTextInput({ style, ...props }: TextInputProps) {
  return (
    <NativeTextInput
      {...props}
      style={[style, { fontFamily: fellixFamily(style), fontWeight: "normal" }]}
    />
  );
}
