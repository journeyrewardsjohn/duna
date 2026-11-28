import { useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from "react-native";
import { useHaptics } from "../motion/haptics";
import { useReducedMotion } from "../motion/reduced-motion";
import { useTheme } from "../theme/ThemeProvider";
import { Numerals } from "../type/Numerals";
import { Text } from "../type/Text";
import {
  MIN_HIT,
  dateNames,
  dayCells,
  inRange,
  type DayCell,
  type DayStripDay,
} from "./layout";

export interface DayStripProps {
  /** Names the strip for screen readers ("Day"). */
  readonly label: string;
  /** The chosen day (ISO date), or none. */
  readonly value: string | null;
  readonly onValueChange: (date: string) => void;
  /** The days, usually `dayStrip({ ... }).days` from `@duna/tideline-core`. */
  readonly days?: ReadonlyArray<DayStripDay>;
  /** Without `days`: the first day shown (default `today`). */
  readonly start?: string;
  /** Without `days`: how many days from `start`. Default 14. */
  readonly count?: number;
  /** Marks today when `days` do not say. */
  readonly today?: string;
  /** Days with nothing open (faded, not choosable). */
  readonly unavailable?: ReadonlyArray<string>;
  readonly locale?: string;
  /** The count in words for screen readers: default "3 games", "no games". */
  readonly countLabel?: (n: number) => string;
  /** With `value`, the days between show the in-range state and this day the end. */
  readonly rangeEnd?: string | null;
  /** Added to the name of a faded day. Default "nothing open". */
  readonly unavailableLabel?: string;
  /** Added to the name of today. Default "today". */
  readonly todayLabel?: string;
  readonly testID?: string;
}

const defaultCountLabel = (n: number): string =>
  n === 0 ? "no games" : n === 1 ? "1 game" : `${n} games`;

/** The spoken name of one day. Pure; the component and tests share it. */
export function dayCellLabel(
  cell: DayCell,
  options: {
    readonly locale: string;
    readonly countLabel?: (n: number) => string;
    readonly todayLabel?: string;
    readonly unavailableLabel?: string;
  },
): string {
  const names = dateNames(cell.date, options.locale);
  return [
    names.long,
    cell.today ? (options.todayLabel ?? "today") : "",
    cell.count !== null
      ? (options.countLabel ?? defaultCountLabel)(cell.count)
      : "",
    cell.faded ? (options.unavailableLabel ?? "nothing open") : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Pick a day from a row that scrolls sideways (the web `DayStrip`'s twin).
 * Each day shows its weekday ("Today" for today), its date and, when counts
 * are given, the count or an em dash. The month is named above the first day
 * and wherever a month starts. The chosen day is the action fill and is
 * scrolled into view; with `rangeEnd`, the days between show the in-range
 * state. A faded day is announced but cannot be chosen; a disabled day is
 * not offered. Every day is at least 44 pt and grows with Dynamic Type.
 */
export function DayStrip({
  label,
  value,
  onValueChange,
  days,
  start,
  count,
  today,
  unavailable,
  locale = "en-US",
  countLabel,
  rangeEnd = null,
  unavailableLabel,
  todayLabel,
  testID,
}: DayStripProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const reduceMotion = useReducedMotion();
  const cells = dayCells({ days, start, count, today, unavailable, value });
  const showCounts = cells.some((cell) => cell.count !== null);
  const scroller = useRef<ScrollViewInstance | null>(null);
  const offsets = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);

  // Keep the chosen day in view.
  const scrollTo = (date: string | null, animated: boolean) => {
    if (!date) return;
    const at = offsets.current.get(date);
    if (!at) return;
    const x = Math.max(0, at.x - (viewport.current - at.width) / 2);
    // The test stand-in has no instance methods.
    scroller.current?.scrollTo?.({ x, animated });
  };
  useEffect(() => {
    scrollTo(value, !reduceMotion);
    // Only when the chosen day changes.
  }, [value]);

  return (
    <ScrollView
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      contentContainerStyle={[styles.row, { gap: tokens.space["1"] }]}
      horizontal
      onLayout={(event: LayoutChangeEvent) => {
        viewport.current = event.nativeEvent.layout.width;
      }}
      ref={scroller}
      showsHorizontalScrollIndicator={false}
      testID={testID}
    >
      {cells.map((cell) => {
        const names = dateNames(cell.date, locale);
        const isStart = value === cell.date;
        const isEnd = rangeEnd !== null && rangeEnd === cell.date;
        const between = inRange(cell.date, value, rangeEnd);
        const selected = isStart || isEnd;
        const blocked = cell.faded || cell.disabled;
        const fill = selected
          ? colors.action
          : between
            ? colors.selected
            : "transparent";
        const ink = selected
          ? "on-action"
          : between
            ? "on-selected"
            : blocked
              ? "text-3"
              : "text";
        return (
          <Pressable
            accessibilityLabel={dayCellLabel(cell, {
              locale,
              countLabel,
              todayLabel,
              unavailableLabel,
            })}
            accessibilityRole="radio"
            accessibilityState={{
              selected,
              checked: selected,
              disabled: blocked,
            }}
            disabled={cell.disabled}
            key={cell.date}
            onLayout={(event: LayoutChangeEvent) => {
              const { x, width } = event.nativeEvent.layout;
              offsets.current.set(cell.date, { x, width });
              if (cell.date === value) scrollTo(value, false);
            }}
            onPress={() => {
              if (blocked) return;
              haptics.selection();
              onValueChange(cell.date);
            }}
            style={({ pressed }) => [
              styles.cell,
              {
                minWidth: MIN_HIT + 4,
                minHeight: MIN_HIT,
                borderRadius: tokens.radius.lg,
                paddingHorizontal: tokens.space["2"],
                paddingVertical: tokens.space["1"],
                backgroundColor: fill,
                borderColor:
                  cell.today && !selected
                    ? colors["line-strong"]
                    : "transparent",
                opacity: cell.faded ? 0.5 : pressed && !blocked ? 0.75 : 1,
              },
            ]}
            testID={testID ? `${testID}-${cell.date}` : undefined}
          >
            <Text
              accessible={false}
              tone={selected ? "on-action" : "text-3"}
              variant="micro"
            >
              {cell.startsMonth ? names.monthShort : " "}
            </Text>
            <Text
              accessible={false}
              tone={ink}
              variant="phone-meta"
              weight={600}
            >
              {cell.today ? "Today" : names.weekdayShort}
            </Text>
            <Numerals
              accessible={false}
              family="ui"
              tone={ink}
              variant="figure-sm"
              weight={600}
            >
              {cell.day}
            </Numerals>
            {showCounts ? (
              <Text
                accessible={false}
                tabular
                tone={selected ? "on-action" : "text-2"}
                variant="phone-meta"
              >
                {cell.count === null || cell.count === 0 || cell.faded
                  ? "—"
                  : String(cell.count)}
              </Text>
            ) : null}
            {cell.today ? (
              <View
                style={[
                  styles.todayDot,
                  {
                    backgroundColor: selected
                      ? colors["on-action"]
                      : colors.text,
                  },
                ]}
              />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch", paddingHorizontal: 0 },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    gap: 2,
  },
  todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
