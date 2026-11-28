/**
 * The session screens' text field on the Duna Design System: Geist at the
 * body size, theme colours, the control border, and Dynamic Type up to the
 * largest accessibility size. A candidate for `@duna/ui/native` (M-C6),
 * which has no text field yet. `duna-text.tsx` is a native text layer the
 * readable-type check allows to import React Native's TextInput.
 */
import {
  TextInput as NativeTextInput,
  type TextInputProps,
} from "react-native";
import { fontFace, useTheme } from "@duna/ui/native";

export function DunaTextInput({ style, multiline, ...props }: TextInputProps) {
  const { colors, tokens } = useTheme();
  return (
    <NativeTextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={colors["text-3"]}
      style={[
        {
          minHeight: multiline ? 88 : 48,
          borderWidth: 1,
          borderColor: colors["border-control"],
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.lg,
          color: colors.text,
          fontFamily: fontFace("ui", 400),
          fontSize: 16,
          lineHeight: 22,
          paddingHorizontal: 12,
          paddingVertical: 12,
          textAlignVertical: multiline ? "top" : "center",
        },
        style,
      ]}
    />
  );
}
