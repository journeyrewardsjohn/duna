import type { PersonSummary } from "@duna/core";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { SatoshiText as Text } from "../satoshi-text";

export interface PlayerIdentityPalette {
  readonly aqua: string;
  readonly bone: string;
  readonly depth: string;
  readonly muted: string;
  readonly navy: string;
  readonly onAccent: string;
  readonly overlayRgb: string;
  readonly positive: string;
  readonly positiveRgb: string;
}

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PlayerAvatar({
  avatarUrl,
  badge,
  displayName,
  palette,
  person,
  selected = false,
  size = 56,
}: {
  readonly avatarUrl?: string;
  readonly badge?: "add" | "selected";
  readonly displayName?: string;
  readonly palette: PlayerIdentityPalette;
  readonly person?: PersonSummary;
  readonly selected?: boolean;
  readonly size?: number;
}) {
  const name = person?.displayName ?? displayName ?? "Player";
  const source = person?.avatarUrl ?? avatarUrl;
  const markSize = Math.max(22, Math.round(size * 0.38));
  const circle: ViewStyle = {
    borderRadius: size / 2,
    height: size,
    width: size,
  };
  return (
    <View style={[styles.avatarShell, circle]}>
      <View
        style={[
          styles.avatarCircle,
          circle,
          {
            backgroundColor: selected
              ? `rgba(${palette.positiveRgb},0.16)`
              : palette.navy,
            borderColor: selected ? palette.positive : "transparent",
          },
        ]}
      >
        {source ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: source }}
            style={styles.avatarImage}
          />
        ) : (
          <Text
            style={{
              color: selected ? palette.positive : palette.aqua,
              fontSize: Math.max(13, size * 0.28),
              fontWeight: "800",
            }}
          >
            {person?.initials || initials(name)}
          </Text>
        )}
      </View>
      {badge && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                badge === "selected" ? palette.positive : palette.aqua,
              borderColor: palette.onAccent,
              borderRadius: markSize / 2,
              height: markSize,
              width: markSize,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: palette.onAccent }]}>
            {badge === "selected" ? "✓" : "+"}
          </Text>
        </View>
      )}
    </View>
  );
}

export function PlayerTouchRow({
  actionLabel,
  avatarUrl,
  detail,
  disabled = false,
  displayName,
  label,
  onPress,
  palette,
  person,
  selected = false,
}: {
  readonly actionLabel: string;
  readonly avatarUrl?: string;
  readonly detail?: string;
  readonly disabled?: boolean;
  readonly displayName?: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly palette: PlayerIdentityPalette;
  readonly person?: PersonSummary;
  readonly selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${actionLabel} ${person?.displayName ?? displayName ?? label}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.touchRow,
        {
          backgroundColor: palette.depth,
          borderColor: selected
            ? `rgba(${palette.positiveRgb},0.42)`
            : `rgba(${palette.overlayRgb},0.11)`,
          opacity: disabled ? 0.42 : 1,
        },
      ]}
    >
      <PlayerAvatar
        avatarUrl={avatarUrl}
        badge={
          person || displayName ? (selected ? "selected" : undefined) : "add"
        }
        displayName={displayName ?? label}
        palette={palette}
        person={person}
        selected={selected}
        size={54}
      />
      <View style={styles.touchCopy}>
        <Text
          numberOfLines={1}
          style={[styles.touchLabel, { color: palette.bone }]}
        >
          {person?.displayName ?? displayName ?? label}
        </Text>
        {!!detail && (
          <Text
            numberOfLines={2}
            style={[styles.touchDetail, { color: palette.muted }]}
          >
            {detail}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.actionPill,
          {
            backgroundColor: selected
              ? `rgba(${palette.positiveRgb},0.12)`
              : palette.navy,
          },
        ]}
      >
        <Text
          style={[
            styles.actionLabel,
            { color: selected ? palette.positive : palette.aqua },
          ]}
        >
          {actionLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionLabel: { fontSize: 13, fontWeight: "800" },
  actionPill: {
    alignItems: "center",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 70,
    paddingHorizontal: 13,
  },
  avatarCircle: {
    alignItems: "center",
    borderWidth: 3,
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { height: "100%", width: "100%" },
  avatarShell: { position: "relative" },
  badge: {
    alignItems: "center",
    borderWidth: 2,
    bottom: -2,
    justifyContent: "center",
    position: "absolute",
    right: -3,
  },
  badgeText: { fontSize: 14, fontWeight: "900", lineHeight: 17 },
  touchCopy: { flex: 1, minWidth: 0 },
  touchDetail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  touchLabel: { fontSize: 16, fontWeight: "800" },
  touchRow: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: 82,
    padding: 13,
  },
});
