/**
 * Small parts Find and booking share: the action button (single flight,
 * loader after 250 ms, width held) and the result row.
 */
import { Pressable, StyleSheet, View } from "react-native";
import {
  ButtonLoader,
  Icon,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import { ParticipationLine } from "@duna/ui/native/participation";
import { useEffect, useState, type ReactNode } from "react";
import type { FindResult } from "./find-search";

export function ActionButton({
  label,
  onPress,
  kind = "primary",
  busy = false,
  disabled = false,
  icon,
  accessibilityHint,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly kind?: "primary" | "secondary" | "quiet";
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly icon?: GlyphName;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  // The loader appears only after 250 ms, so a quick answer never flashes.
  const [showLoader, setShowLoader] = useState(false);
  useEffect(() => {
    if (!busy) {
      setShowLoader(false);
      return;
    }
    const timer = setTimeout(() => setShowLoader(true), 250);
    return () => clearTimeout(timer);
  }, [busy]);
  const primary = kind === "primary";
  const ink = primary ? colors["on-action"] : colors.text;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: tokens.radius.lg,
          paddingHorizontal: tokens.space["4"],
          backgroundColor: primary
            ? disabled
              ? colors["action-disabled"]
              : colors.action
            : kind === "secondary"
              ? colors.surface
              : "transparent",
          borderColor:
            kind === "secondary" ? colors["line-strong"] : "transparent",
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      testID={testID}
    >
      <View style={[styles.buttonInner, { opacity: showLoader ? 0 : 1 }]}>
        {icon ? <Icon color={ink} name={icon} size="control" /> : null}
        <Text
          style={{ color: primary && disabled ? colors["text-disabled"] : ink }}
          variant="phone-body"
          weight={600}
        >
          {label}
        </Text>
      </View>
      {showLoader ? (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.loader}>
            <ButtonLoader color={ink} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A group header in the results: "Training · 12". */
export function GroupHeader({
  label,
  count,
  action,
  onAction,
}: {
  readonly label: string;
  readonly count: number;
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  return (
    <View style={styles.groupHeader}>
      <View style={styles.groupTitle}>
        <Text accessibilityRole="header" variant="phone-heading">
          {`${label} · ${count}`}
        </Text>
      </View>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={onAction}
          style={styles.seeAll}
        >
          <Text tone="link" variant="phone-meta" weight={600}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const ROW_ICON: Readonly<Record<FindResult["pin"], GlyphName>> = {
  club: "venue",
  public: "court",
  court: "court",
  tournament: "tournament",
  league: "league",
  match: "ball",
  pickup: "ball",
  lesson: "lesson",
};

/**
 * One result: what it is, then when · where · level, the price on the
 * right, and for a group session the participation line from the backend's
 * words. Selected rows (and their pin) carry the selected ring.
 */
export function ResultRow({
  result,
  selected,
  onPress,
  trailing,
}: {
  readonly result: FindResult;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly trailing?: ReactNode;
}) {
  const { colors, tokens } = useTheme();
  const participation = result.session?.participation;
  const label = [
    result.title,
    result.meta,
    result.price,
    participation?.copy.a11y,
    result.yours ? "Your club" : null,
    result.live ? "Live now" : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Pressable
      accessibilityHint="Opens the details"
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors["surface-sunken"] : colors.surface,
          borderRadius: tokens.radius.lg,
          borderColor: selected ? colors["selected-ring"] : colors.line,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          padding: tokens.space["3"],
          gap: tokens.space["3"],
        },
      ]}
      testID={`find-result-${result.id}`}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: result.yours
              ? colors.action
              : colors["surface-sunken"],
            borderRadius: tokens.radius.md,
          },
        ]}
      >
        <Icon
          color={result.yours ? colors["on-action"] : colors["text-2"]}
          name={ROW_ICON[result.pin]}
          size="control"
        />
      </View>
      <View style={styles.rowText}>
        <Text variant="phone-body" weight={600}>
          {result.title}
        </Text>
        {result.meta ? (
          <Text tone="text-2" variant="phone-meta">
            {result.meta}
          </Text>
        ) : null}
        {participation ? (
          <ParticipationLine
            compact
            line={participation.copy.line}
            status={participation.copy.status}
            tone={participation.display.tone}
          />
        ) : null}
      </View>
      <View style={styles.rowEnd}>
        {result.price ? (
          <Text tabular variant="phone-body" weight={600}>
            {result.price}
          </Text>
        ) : null}
        {trailing}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    flexWrap: "wrap",
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  groupHeader: {
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    columnGap: 8,
  },
  // Keeps its natural width so a long name wraps by word, and "See all"
  // moves to the next line at large text sizes instead of squeezing it.
  groupTitle: { flexGrow: 1, flexShrink: 0, maxWidth: "100%" },
  fill: { flex: 1 },
  seeAll: { minHeight: 44, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "flex-start", minHeight: 64 },
  avatar: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowEnd: { alignItems: "flex-end", gap: 4, maxWidth: "35%" },
});
