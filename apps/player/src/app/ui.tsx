/**
 * The shell's small parts on the Duna Design System (M-P0): list rows,
 * icon buttons, section heads, cards and status chips. Screen packages may
 * use them until the component families (M-C6) ship their own.
 */
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { usePane } from "@duna/ui/native/layout";
import {
  Icon,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
  type NativeColorRole,
} from "@duna/ui/native";
import { createContext, useContext, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Whether the tab root currently shows panes side by side. */
export const SideBySideContext = createContext(false);

/**
 * Padding for a pane's content: the tab's safe area (which already includes
 * the system tab bar, the Duo's trailing column and the iPad's top bar) on
 * the edges this pane touches.
 */
export function usePaneEdges(): {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
} {
  const insets = useSafeAreaInsets();
  const pane = usePane();
  const sideBySide = useContext(SideBySideContext);
  const left = !sideBySide || pane.id === "primary" || pane.id === "top";
  const right = !sideBySide || pane.id !== "primary";
  return {
    top: insets.top,
    bottom: insets.bottom,
    left: left ? insets.left : 0,
    right: right ? insets.right : 0,
  };
}

const PRESSED: ViewStyle = { transform: [{ scale: 0.98 }], opacity: 0.86 };

export interface RowProps {
  readonly title: string;
  readonly summary?: string;
  readonly icon?: GlyphName;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
  readonly selected?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

/** A 56 pt list row: icon, title, one line, chevron. Light haptic on press. */
export function Row({
  title,
  summary,
  icon,
  leading,
  trailing,
  onPress,
  selected,
  accessibilityHint,
  testID,
}: RowProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const body = (
    <>
      {leading ??
        (icon ? (
          <View
            style={[
              styles.rowIcon,
              { backgroundColor: colors["surface-sunken"] },
            ]}
          >
            <Icon name={icon} size="control" />
          </View>
        ) : null)}
      <View style={styles.rowText}>
        <Text variant="phone-body" weight={600}>
          {title}
        </Text>
        {summary ? (
          <Text tone="text-2" variant="phone-meta">
            {summary}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? (
          <Icon name="chevron-right" size="inline" tone="text-3" />
        ) : null)}
    </>
  );
  const frame: ViewStyle = {
    minHeight: 56,
    paddingHorizontal: tokens.space["4"],
    paddingVertical: tokens.space["3"],
    borderRadius: tokens.radius.lg,
    backgroundColor: selected ? colors.selected : "transparent",
  };
  if (!onPress) {
    return (
      <View style={[styles.row, frame]} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={summary ? `${title}. ${summary}` : title}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={() => {
        haptics.confirmed(0);
        onPress();
      }}
      style={({ pressed }) => [styles.row, frame, pressed ? PRESSED : null]}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

/** A 44 pt round icon button with a name; optional badge count. */
export function IconButton({
  icon,
  label,
  onPress,
  badge,
  children,
  testID,
}: {
  readonly icon?: GlyphName;
  readonly label: string;
  readonly onPress: () => void;
  readonly badge?: number;
  /** Custom content (the Crest mark for Ask Duna). */
  readonly children?: ReactNode;
  readonly testID?: string;
}) {
  const { colors } = useTheme();
  const haptics = useHaptics();
  const name = badge && badge > 0 ? `${label}, ${badge} unread` : label;
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="button"
      hitSlop={4}
      onPress={() => {
        haptics.confirmed(0);
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
        pressed ? PRESSED : null,
      ]}
      testID={testID}
    >
      {children ?? (icon ? <Icon name={icon} size="control" /> : null)}
      {badge && badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.attention }]}>
          <Text
            style={{ color: colors["on-attention"] }}
            tabular
            variant="micro"
            weight={600}
          >
            {badge > 99 ? "99+" : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A section heading with an optional trailing link. */
export function SectionHead({
  title,
  action,
  onAction,
}: {
  readonly title: string;
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text accessibilityRole="header" variant="phone-heading">
        {title}
      </Text>
      {action && onAction ? (
        <Pressable
          accessibilityRole="link"
          hitSlop={12}
          onPress={onAction}
          style={styles.sectionLink}
        >
          <Text tone="link" variant="phone-meta" weight={600}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A white card on the Salt ground (cards stay white; dark uses surface). */
export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const frame: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.xl,
    padding: tokens.space["4"],
    gap: tokens.space["3"],
  };
  if (!onPress) {
    return (
      <View style={[frame, style]} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={() => {
        haptics.confirmed(0);
        onPress();
      }}
      style={({ pressed }) => [frame, style, pressed ? PRESSED : null]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

/** A status chip: a small icon with a word, padded to contain its label. */
export function StatusChip({
  label,
  icon,
  tone = "text-2",
  wash = "surface-sunken",
}: {
  readonly label: string;
  readonly icon?: GlyphName;
  readonly tone?: NativeColorRole;
  readonly wash?: NativeColorRole;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: colors[wash] }]}>
      {icon ? <Icon name={icon} size="chip" tone={tone} /> : null}
      <Text numberOfLines={1} tone={tone} variant="phone-meta" weight={600}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
  },
  sectionLink: { minHeight: 44, justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
});
