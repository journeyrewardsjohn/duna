/**
 * A person's avatar on the Duna Design System (owner feedback 28 Nov: "show
 * people"): their photo, or a designed initials mark on one of the brand
 * grounds (Night Court, Tidewater, Hardwood, Dune), chosen from the name so a
 * person always gets the same colour. An optional ring (the signed-in person,
 * a selected player) and a small status badge (added, invited, paid).
 * Decorative to VoiceOver unless `label` is given: the row beside it names
 * the person.
 */
import { Image, StyleSheet, View } from "react-native";
import { Icon, Text, useTheme, type GlyphName } from "@duna/ui/native";

export type AvatarGround = "night-court" | "tidewater" | "hardwood" | "dune";

const GROUNDS: readonly AvatarGround[] = [
  "night-court",
  "tidewater",
  "hardwood",
  "dune",
];

/** The two letters of a name ("Taylor Crabb" → "TC", "kerri" → "K"). Pure. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

/** The same name always lands on the same ground. Pure. */
export function avatarGround(name: string): AvatarGround {
  let hash = 0;
  for (const character of name.trim().toLowerCase())
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return GROUNDS[hash % GROUNDS.length]!;
}

export function PersonAvatar({
  name,
  photoUrl,
  size = 48,
  ring = false,
  badge,
  label,
  testID,
}: {
  readonly name: string;
  readonly photoUrl?: string;
  readonly size?: number;
  /** A Dune ring: the signed-in person, a chosen player. */
  readonly ring?: boolean;
  readonly badge?: {
    readonly icon: GlyphName;
    readonly tone: "positive" | "action" | "warning";
  };
  readonly label?: string;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const ground = avatarGround(name);
  const fill =
    ground === "night-court"
      ? tokens.brand["night-court"]
      : ground === "tidewater"
        ? colors["mesh-tidewater-a"]
        : ground === "hardwood"
          ? tokens.brand.hardwood
          : tokens.brand.dune;
  const ink =
    ground === "dune" || ground === "hardwood"
      ? tokens.brand["night-court"]
      : tokens.brand.salt;
  const ringWidth = ring ? Math.max(2, Math.round(size / 24)) : 0;
  const inner = size - ringWidth * 2 - (ring ? 4 : 0);
  const badgeSize = Math.max(18, Math.round(size * 0.36));
  const badgeFill = badge
    ? badge.tone === "positive"
      ? colors.positive
      : badge.tone === "warning"
        ? colors.warning
        : colors.action
    : undefined;
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole={label ? "image" : undefined}
      accessible={Boolean(label)}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: ring ? tokens.brand.dune : "transparent",
        },
      ]}
      testID={testID}
    >
      {photoUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: photoUrl }}
          style={{ width: inner, height: inner, borderRadius: inner / 2 }}
        />
      ) : (
        <View
          style={[
            styles.initials,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              backgroundColor: fill,
            },
          ]}
        >
          <Text
            maxFontSizeMultiplier={1.2}
            style={{
              color: ink,
              fontSize: Math.max(12, Math.round(inner * 0.36)),
              lineHeight: Math.max(14, Math.round(inner * 0.44)),
            }}
            weight={600}
          >
            {initialsOf(name)}
          </Text>
        </View>
      )}
      {badge && badgeFill ? (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: badgeFill,
              borderColor: colors.surface,
            },
          ]}
        >
          <Icon color={tokens.brand.salt} name={badge.icon} size="chip" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
  initials: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
