import {
  staleStarts,
  type SlotChipState,
  type SunTimes,
} from "@duna/tideline-core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { Icon } from "../icons/Icon";
import { Skeleton } from "../loaders/loaders";
import { useHaptics } from "../motion/haptics";
import { useTheme } from "../theme/ThemeProvider";
import type { NativeColorRole } from "../tokens";
import { Text } from "../type/Text";
import { MIN_HIT, minuteLabel, slotGridColumns } from "./layout";
import {
  longestChipChars,
  slotChipLabel,
  timeSlotGroups,
  type SlotChipModel,
  type TimeSlotItem,
} from "./slot-chips";

export interface TimeSlotsProps {
  /** Names the group of chips for screen readers ("Court 3 start times"). */
  readonly label: string;
  readonly slots: ReadonlyArray<TimeSlotItem>;
  /** The chosen start minute. */
  readonly value: number | null;
  readonly onValueChange: (startMinute: number | null) => void;
  /** Called once with starts that were taken while the person was looking. */
  readonly onStale?: (startMinutes: ReadonlyArray<number>) => void;
  /** The venue's date (ISO) and IANA zone: times are on its clock. */
  readonly date: string;
  readonly timeZone: string;
  /** The viewer's zone; reserved for the zone note (as on the web). */
  readonly viewerTimeZone?: string;
  readonly locale?: string;
  /** Sun times for the venue's date; without them slots are not grouped by light. */
  readonly sun?: SunTimes | null;
  /** The court has lights. An unlit court is too dark after sunset. Default true. */
  readonly courtIsLit?: boolean;
  /** Group by daypart. Default on with `sun`. */
  readonly groupByDaypart?: boolean;
  /** Places at or below this read "few left". */
  readonly fewLeftAt?: number;
  /** Start times are loading. */
  readonly loading?: boolean;
  /** Shown when the day has no start times. */
  readonly empty?: ReactNode;
  readonly testID?: string;
}

const GAP = 8;

interface ChipLook {
  readonly fill: NativeColorRole | null;
  readonly edge: NativeColorRole;
  readonly ink: NativeColorRole;
  readonly struck: boolean;
  readonly dashed: boolean;
}

/** The colour roles for a chip state. Pure. */
export function slotChipLook(state: SlotChipState): ChipLook {
  switch (state) {
    case "selected":
      return {
        fill: "action",
        edge: "action",
        ink: "on-action",
        struck: false,
        dashed: false,
      };
    case "few-left":
      return {
        fill: "surface",
        edge: "warning",
        ink: "text",
        struck: false,
        dashed: false,
      };
    case "taken":
      return {
        fill: "surface-sunken",
        edge: "line",
        ink: "text-3",
        struck: true,
        dashed: false,
      };
    case "outside-hours":
      return {
        fill: null,
        edge: "line",
        ink: "text-3",
        struck: false,
        dashed: true,
      };
    case "too-dark":
      return {
        fill: "surface-sunken",
        edge: "line",
        ink: "text-3",
        struck: false,
        dashed: false,
      };
    case "stale":
      return {
        fill: "warning-wash",
        edge: "warning",
        ink: "text-2",
        struck: true,
        dashed: false,
      };
    default:
      return {
        fill: "surface",
        edge: "line-strong",
        ink: "text",
        struck: false,
        dashed: false,
      };
  }
}

/** Remembers starts taken while the person was looking, for this day. */
function useJustTaken(slots: ReadonlyArray<TimeSlotItem>, dayKey: string) {
  const previous = useRef({ key: dayKey, slots });
  const [taken, setTaken] = useState<{ key: string; starts: Set<number> }>({
    key: dayKey,
    starts: new Set(),
  });
  useEffect(() => {
    const before = previous.current;
    previous.current = { key: dayKey, slots };
    if (before.key !== dayKey) {
      setTaken({ key: dayKey, starts: new Set() });
      return;
    }
    const lost = staleStarts(before.slots, slots);
    if (lost.length === 0) return;
    setTaken((current) => ({
      key: dayKey,
      starts: new Set([
        ...(current.key === dayKey ? current.starts : []),
        ...lost,
      ]),
    }));
  }, [slots, dayKey]);
  const add = (minute: number) =>
    setTaken((current) => ({
      key: dayKey,
      starts: new Set([
        ...(current.key === dayKey ? current.starts : []),
        minute,
      ]),
    }));
  return {
    starts: taken.key === dayKey ? taken.starts : new Set<number>(),
    add,
  };
}

/**
 * Bookable start times as chips (the web `TimeSlots`' twin), grouped by
 * daypart under the daypart's light mark and name. Every chip is sized to
 * hold the LONGEST label at the current text size (`slotGridColumns`):
 * columns fall back, down to one, at the largest accessibility sizes, so
 * nothing clips or wraps. Full slots stay visible, struck and not
 * choosable; outside-hours and too-dark starts say why. When the chosen
 * start is taken while the person is looking (it arrives `stale` or no
 * longer available), the selection is dropped once (`onValueChange(null)`,
 * `onStale`), the chip stays as "Just taken", VoiceOver hears it, and a
 * warning haptic plays.
 */
export function TimeSlots({
  label,
  slots,
  value,
  onValueChange,
  onStale,
  date,
  timeZone,
  locale = "en-US",
  sun,
  courtIsLit = true,
  groupByDaypart,
  fewLeftAt,
  loading = false,
  empty,
  testID,
}: TimeSlotsProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const dayKey = `${date}|${timeZone}`;
  const justTaken = useJustTaken(slots, dayKey);

  // The chosen start arriving stale or unavailable counts as just taken.
  const chosen =
    value === null ? undefined : slots.find((s) => s.startMinute === value);
  const lost =
    value !== null &&
    (justTaken.starts.has(value) ||
      (chosen !== undefined && (Boolean(chosen.stale) || !chosen.available)));
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (!lost || value === null) return;
    const key = `${dayKey}|${value}`;
    if (reported.current.has(key)) return;
    reported.current.add(key);
    justTaken.add(value);
    onStale?.([value]);
    onValueChange(null);
    haptics.refused();
    AccessibilityInfo.announceForAccessibility(
      `${minuteLabel(value, locale)} was just taken. Choose another time.`,
    );
  }, [lost, value, dayKey]);

  const groups = useMemo(
    () =>
      timeSlotGroups({
        slots,
        selected: lost ? null : value,
        justTaken: justTaken.starts,
        date,
        timeZone,
        locale,
        sun,
        courtIsLit,
        groupByDaypart,
        fewLeftAt,
      }),
    [
      slots,
      value,
      lost,
      justTaken.starts,
      date,
      timeZone,
      locale,
      sun,
      courtIsLit,
      groupByDaypart,
      fewLeftAt,
    ],
  );
  const chipCount = groups.reduce((n, group) => n + group.chips.length, 0);
  const withMark = groups.some((group) =>
    group.chips.some((chip) => chip.glyph !== null || chip.state === "stale"),
  );
  const grid = slotGridColumns({
    containerWidth: width,
    longestLabelChars: longestChipChars(groups),
    fontScale,
    gap: GAP,
    withMark,
  });
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(Math.floor(event.nativeEvent.layout.width));

  if (loading) {
    return (
      <View accessibilityLabel={label} onLayout={onLayout} testID={testID}>
        <Skeleton count={2} kind="lines" label="Loading start times" />
      </View>
    );
  }
  if (chipCount === 0) {
    return (
      <View
        accessibilityRole="text"
        onLayout={onLayout}
        style={styles.empty}
        testID={testID}
      >
        {empty ?? (
          <>
            <Icon name="clock" size="inline" tone="text-2" />
            <Text tone="text-2" variant="phone-meta">
              No start times on this day.
            </Text>
          </>
        )}
      </View>
    );
  }

  const chipView = (
    chip: SlotChipModel,
    daypart: (typeof groups)[number]["daypart"],
  ) => {
    const look = slotChipLook(chip.state);
    return (
      <Pressable
        accessibilityLabel={slotChipLabel(chip, daypart)}
        accessibilityRole="radio"
        accessibilityState={{
          selected: chip.state === "selected",
          checked: chip.state === "selected",
          disabled: !chip.selectable,
        }}
        disabled={!chip.selectable}
        key={chip.startMinute}
        onPress={() => {
          if (!chip.selectable) return;
          haptics.selection();
          onValueChange(chip.state === "selected" ? null : chip.startMinute);
        }}
        style={({ pressed }) => [
          styles.chip,
          {
            width: grid.columns === 1 ? undefined : grid.chipWidth,
            minWidth: grid.minWidth,
            minHeight: MIN_HIT,
            borderRadius: tokens.radius.md,
            paddingHorizontal: 12,
            paddingVertical: tokens.space["1"],
            backgroundColor: look.fill ? colors[look.fill] : "transparent",
            borderColor: colors[look.edge],
            borderStyle: look.dashed ? "dashed" : "solid",
            opacity: pressed && chip.selectable ? 0.75 : 1,
          },
        ]}
        testID={testID ? `${testID}-${chip.startMinute}` : undefined}
      >
        <View style={styles.chipLine}>
          <Text
            accessible={false}
            style={look.struck ? styles.struck : undefined}
            tabular
            tone={look.ink}
            variant="label"
            weight={600}
          >
            {chip.text}
          </Text>
          {chip.state === "stale" ? (
            <Icon name="close" size="chip" tone="warning" />
          ) : chip.glyph ? (
            <Icon
              name={chip.glyph}
              size="chip"
              tone={chip.state === "selected" ? "on-action" : "text-2"}
            />
          ) : null}
        </View>
        {chip.note ? (
          <Text
            accessible={false}
            tone={
              chip.state === "stale" || chip.state === "few-left"
                ? "warning"
                : "text-2"
            }
            variant="phone-meta"
          >
            {chip.note}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      onLayout={onLayout}
      style={{ gap: tokens.space["4"] }}
      testID={testID}
    >
      {groups.map((group) => (
        <View key={group.daypart ?? "all"} style={{ gap: tokens.space["2"] }}>
          {group.daypart && group.glyph ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.daypart}
            >
              <Icon name={group.glyph} size="chip" tone="text-2" />
              <Text tone="text-2" variant="phone-meta" weight={600}>
                {group.label}
              </Text>
            </View>
          ) : null}
          <View
            style={[
              styles.grid,
              {
                gap: GAP,
                flexDirection: grid.columns === 1 ? "column" : "row",
              },
            ]}
          >
            {group.chips.map((chip) => chipView(chip, group.daypart))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  daypart: { flexDirection: "row", alignItems: "center", gap: 6 },
  grid: { flexWrap: "wrap" },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  chipLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  struck: { textDecorationLine: "line-through" },
});
