import { useContext } from "react";
import { Image } from "react-native";
import { ThemeContext } from "../shared/theme-context";
import { styles } from "../legacy/styles";

// Metro requires static module references so the full Duna mark ships natively.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const dunaProWordmarkBlue = require("../../assets/duna-horizontal-blue.png");

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const dunaProWordmarkWhite = require("../../assets/duna-horizontal-white.png");

export function BrandMark() {
  const { theme } = useContext(ThemeContext);
  return (
    <Image
      accessibilityLabel="Duna"
      resizeMode="contain"
      source={theme === "dark" ? dunaProWordmarkWhite : dunaProWordmarkBlue}
      style={styles.wordmarkImage}
    />
  );
}
