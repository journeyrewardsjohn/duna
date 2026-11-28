/**
 * A person's avatar (M-R4): their photo, or a designed initials mark on
 * one of four brand grounds (Night Court, Dune, Hardwood, Salt), stable per
 * person so a roster reads as people at a glance. Decorative to VoiceOver:
 * the row says the name.
 */
import { useState } from "react";
import { Image, View } from "react-native";
import { Text, useTheme } from "@duna/ui/native";
import { avatarGround } from "../features/people/people-model";

export function Avatar({
  id,
  initials,
  url,
  size = 44,
  ring = false,
}: {
  readonly id: string;
  readonly initials: string;
  readonly url?: string;
  readonly size?: number;
  /** A hairline ring (on photos over a busy ground). */
  readonly ring?: boolean;
}) {
  const { tokens, colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const { brand } = tokens;
  const grounds = [
    { fill: brand["night-court"], ink: brand.salt },
    { fill: brand.dune, ink: brand["night-court"] },
    { fill: brand.hardwood, ink: brand.salt },
    { fill: colors["surface-sunken"], ink: colors.text },
  ] as const;
  const ground = grounds[avatarGround(id)];
  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: "hidden" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...(ring ? { borderWidth: 1, borderColor: colors.line } : {}),
  };
  if (url && !failed) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[frame, { backgroundColor: ground.fill }]}
      >
        <Image
          onError={() => setFailed(true)}
          source={{ uri: url }}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[frame, { backgroundColor: ground.fill }]}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          color: ground.ink,
          fontSize: Math.max(12, size * 0.36),
          lineHeight: size * 0.5,
        }}
        weight={600}
      >
        {initials.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}
