/**
 * Small parts of the court booking flow (M-P3) on the Duna Design System:
 * a card, a section label, a two-way segmented choice, a pressable row, the
 * roster seats (avatars, inviting empty seats) and a quiet text action.
 * Every press has a pressed state and a haptic.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import {
  Icon,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import type { ReactNode } from "react";
import { PersonAvatar } from "../../../shared/PersonAvatar";
import type { RosterSeat } from "./roster";

export function Card({
  children,
  style,
  testID,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.xl,
          borderColor: colors.line,
          borderWidth: StyleSheet.hairlineWidth,
          padding: tokens.space["4"],
          gap: tokens.space["3"],
        },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** A small uppercase label over a group (Geist Mono, the contract's labels). */
export function SectionLabel({ children }: { readonly children: string }) {
  return (
    <Text
      accessibilityRole="header"
      family="mono"
      tone="text-2"
      variant="micro"
    >
      {children.toUpperCase()}
    </Text>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly {
    readonly value: T;
    readonly title: string;
    readonly detail?: string;
    readonly disabled?: boolean;
  }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      style={[
        styles.segmented,
        {
          backgroundColor: colors["surface-sunken"],
          borderRadius: tokens.radius.xl,
          padding: 4,
        },
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityHint={option.detail}
            accessibilityLabel={option.title}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: option.disabled }}
            disabled={option.disabled}
            key={option.value}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              {
                borderRadius: tokens.radius.lg,
                backgroundColor: selected ? colors.surface : "transparent",
                opacity: option.disabled ? 0.5 : pressed ? 0.8 : 1,
                padding: tokens.space["3"],
                borderWidth: selected ? StyleSheet.hairlineWidth : 0,
                borderColor: colors["line-strong"],
              },
            ]}
          >
            <Text
              style={styles.centerText}
              tone={selected ? "text" : "text-2"}
              variant="phone-body"
              weight={600}
            >
              {option.title}
            </Text>
            {option.detail ? (
              <Text
                style={styles.centerText}
                tone="text-2"
                variant="phone-meta"
              >
                {option.detail}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A full-width row that opens something: icon, words, chevron. */
export function ActionRow({
  icon,
  title,
  detail,
  onPress,
  disabled = false,
  selected = false,
  testID,
}: {
  readonly icon: GlyphName;
  readonly title: string;
  readonly detail?: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityHint={detail}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: 56,
          gap: tokens.space["3"],
          paddingVertical: tokens.space["2"],
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: selected
              ? colors.selected
              : colors["surface-sunken"],
            borderRadius: tokens.radius.lg,
          },
        ]}
      >
        <Icon
          color={selected ? colors["on-selected"] : colors.text}
          name={icon}
          size="control"
        />
      </View>
      <View style={styles.fill}>
        <Text variant="phone-body" weight={600}>
          {title}
        </Text>
        {detail ? (
          <Text tone="text-2" variant="phone-meta">
            {detail}
          </Text>
        ) : null}
      </View>
      <Icon color={colors["text-3"]} name="chevron-right" size="control" />
    </Pressable>
  );
}

/** A label above its value (never a fixed-width label column that wraps). */
export function Fact({
  label,
  value,
  icon,
}: {
  readonly label: string;
  readonly value: string;
  readonly icon?: GlyphName;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View
      style={[styles.row, { gap: tokens.space["3"], alignItems: "flex-start" }]}
    >
      {icon ? (
        <View style={styles.factIcon}>
          <Icon color={colors["text-2"]} name={icon} size="control" />
        </View>
      ) : null}
      <View style={styles.fill}>
        <Text tone="text-2" variant="phone-meta">
          {label}
        </Text>
        <Text variant="phone-body" weight={600}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** One seat in the roster: an avatar with a name, or an inviting empty seat. */
export function Seat({
  seat,
  status,
  onPress,
  onRemove,
  size = 60,
}: {
  readonly seat: RosterSeat;
  /** A short line under the name ("You", "Invited", "Paid"). */
  readonly status?: string;
  readonly onPress?: () => void;
  readonly onRemove?: () => void;
  readonly size?: number;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  if (seat.kind === "open") {
    return (
      <Pressable
        accessibilityHint="Choose a Duna player or invite someone"
        accessibilityLabel="Open spot"
        accessibilityRole="button"
        disabled={!onPress}
        onPress={() => {
          haptics.selection();
          onPress?.();
        }}
        style={({ pressed }) => [
          styles.seat,
          { width: size + 16, opacity: pressed ? 0.6 : 1 },
        ]}
        testID="roster-open-seat"
      >
        <View
          style={[
            styles.openSeat,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: colors["line-strong"],
              backgroundColor: colors["surface-sunken"],
            },
          ]}
        >
          <Icon color={colors["text-2"]} name="plus" size="control" />
        </View>
        <Text numberOfLines={1} tone="text-2" variant="phone-meta">
          Open
        </Text>
      </Pressable>
    );
  }
  const first = seat.name.split(/\s+/)[0] ?? seat.name;
  const label = `${seat.name}${status ? `, ${status}` : ""}`;
  return (
    <View style={[styles.seat, { width: size + 16 }]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole={onPress ? "button" : "text"}
        disabled={!onPress}
        onPress={onPress}
      >
        <PersonAvatar
          badge={
            seat.kind === "booker"
              ? undefined
              : seat.onDuna
                ? { icon: "check", tone: "positive" }
                : {
                    icon: seat.channel === "text" ? "phone-bubble" : "mail",
                    tone: "action",
                  }
          }
          name={seat.name}
          photoUrl={seat.photoUrl}
          ring={seat.kind === "booker"}
          size={size}
        />
      </Pressable>
      <Text numberOfLines={1} variant="phone-meta" weight={600}>
        {seat.kind === "booker"
          ? first === "You"
            ? "You"
            : `${first} (you)`
          : first}
      </Text>
      {status ? (
        <Text numberOfLines={1} tone="text-2" variant="phone-meta">
          {status}
        </Text>
      ) : null}
      {onRemove ? (
        <Pressable
          accessibilityLabel={`Remove ${seat.name}`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            haptics.selection();
            onRemove();
          }}
          style={({ pressed }) => [
            styles.remove,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderRadius: tokens.radius.pill,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Icon color={colors["text-2"]} name="close" size="chip" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  segmented: { flexDirection: "row", gap: 4 },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  centerText: { textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  rowIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  factIcon: { width: 24, paddingTop: 2, alignItems: "center" },
  seat: { alignItems: "center", gap: 4 },
  openSeat: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  remove: {
    position: "absolute",
    top: -4,
    right: 4,
    width: 24,
    height: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
