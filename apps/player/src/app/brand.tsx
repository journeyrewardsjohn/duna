import { Image, View } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

// Metro requires static module references so the full Duna mark ships natively.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaPlayerWordmarkBlue = require("../../assets/duna-horizontal-blue.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaPlayerWordmarkWhite = require("../../assets/duna-horizontal-white.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaPlayerBrandIcon = require("../../assets/duna-mark.png");

export function DunaWordmark({
  pro = false,
  tone = "default",
}: {
  readonly pro?: boolean;
  readonly tone?: "default" | "light";
}) {
  return (
    <View style={styles.wordmark}>
      <Image
        accessibilityLabel="Duna"
        resizeMode="contain"
        source={
          tone === "light" ? dunaPlayerWordmarkWhite : dunaPlayerWordmarkBlue
        }
        style={styles.wordmarkImage}
      />
      {pro && <Text style={styles.proPill}>PRO</Text>}
    </View>
  );
}

export function DunaMark({ size }: { readonly size: number }) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={dunaPlayerBrandIcon}
      style={{ height: size, width: size }}
    />
  );
}
