import { createContext, useContext } from "react";
import { Moon, Sun } from "lucide-react-native";
import { Pressable } from "react-native";
import { colors, type ThemeName, type ThemePreference } from "./palette";
import { selectionHaptic } from "./haptics";
import { styles } from "../legacy/styles";

export const ThemeContext = createContext<{
  readonly theme: ThemeName;
  readonly preference: ThemePreference;
  readonly toggle: () => void;
}>({ theme: "light", preference: "light", toggle: () => undefined });

export const OpenDunaAiContext = createContext<() => void>(() => undefined);

export function ThemeButton() {
  const { preference, theme, toggle } = useContext(ThemeContext);
  const ThemeIcon = theme === "light" ? Moon : Sun;
  return (
    <Pressable
      accessibilityLabel={`Theme: ${preference === "system" ? "match device" : preference}. Change theme`}
      onPress={() => {
        selectionHaptic();
        toggle();
      }}
      style={styles.themeButton}
    >
      <ThemeIcon color={colors.bone} size={20} strokeWidth={1.75} />
    </Pressable>
  );
}
