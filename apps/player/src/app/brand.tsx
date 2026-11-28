import { View } from "react-native";
import {
  DunaMark as CrestMark,
  DunaWordmark as DrawnWordmark,
} from "@duna/ui/native";

/**
 * The Duna lockup for legacy screens (the Wallet header): the Crest mark and
 * the drawn wordmark from the design system, replacing the retired raster
 * wordmark and dune mark. `tone="light"` draws Salt on a dark ground.
 */
export function DunaWordmark({
  tone = "default",
}: {
  readonly pro?: boolean;
  readonly tone?: "default" | "light";
}) {
  const color = tone === "light" ? "#F4F2EC" : undefined;
  return (
    <View
      accessibilityLabel="Duna"
      accessibilityRole="image"
      accessible
      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <CrestMark color={color} decorative size={22} />
      <DrawnWordmark color={color} width={64} />
    </View>
  );
}

/** The Crest mark (the brand's mark; the old dune mark is retired). */
export function DunaMark({ size }: { readonly size: number }) {
  return <CrestMark decorative size={size} />;
}
