/**
 * The text input on the Duna Design System (M-P4a): Geist on the Tideline
 * type scale, coloured by role, scaling with Dynamic Type like `Text`.
 * `@duna/ui/native` has no input yet; this is the candidate to move there
 * (the readable-type check allows native text layers named `duna-text`).
 */
import { TextInput, type TextInputProps } from "react-native";
import { textStyleFor, useTheme } from "@duna/ui/native";

export function DunaTextInput({ style, ...props }: TextInputProps) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors["text-3"]}
      {...props}
      style={[textStyleFor("phone-body", { color: colors.text }), style]}
    />
  );
}
