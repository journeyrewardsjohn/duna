import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useHaptics } from "../motion/haptics";
import { StateAction } from "../states/StateAction";
import { useTheme } from "../theme/ThemeProvider";
import { DayStrip } from "../time/DayStrip";
import { Text } from "../type/Text";
import { nextRange, type DateRange } from "./logic";

export interface WhenValue {
  readonly preset: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export interface WhenPickerProps {
  readonly value: WhenValue;
  readonly presets: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
  }>;
  readonly onPreset: (key: string) => void;
  /** A range from the strip: the first tap sends (start, start), the second (start, end). */
  readonly onRange: (start: string, end: string) => void;
  /** Today on the player's calendar (ISO): the strip starts here. */
  readonly today: string;
  /** The live label in the footer ("Sat 28 Nov – Tue 1 Dec"). */
  readonly label: string;
  readonly onClear?: () => void;
  readonly onDone?: () => void;
  /** Names the date strip for screen readers. Default "Dates". */
  readonly stripLabel?: string;
  readonly locale?: string;
  readonly testID?: string;
}

/** Days the When strip offers from today. */
export const WHEN_STRIP_DAYS = 42;

const rangeOf = (value: WhenValue): DateRange => ({
  start: value.startsAt ?? null,
  end: value.endsAt && value.endsAt !== value.startsAt ? value.endsAt : null,
});

/**
 * When step: preset pills that wrap (each holds its label at any size),
 * then a 42-day strip where the first tap sets the start and the second the
 * end (the days between show as in range), and a footer with the live label,
 * Clear and Done.
 */
export function WhenPicker({
  value,
  presets,
  onPreset,
  onRange,
  today,
  label,
  onClear,
  onDone,
  stripLabel = "Dates",
  locale,
  testID,
}: WhenPickerProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const [range, setRange] = useState<DateRange>(() => rangeOf(value));
  const sent = useRef<string | null>(null);

  // Follow the parent unless it is echoing the range this strip just sent.
  useEffect(() => {
    const key = `${value.startsAt ?? ""}|${value.endsAt ?? ""}`;
    if (sent.current === key) return;
    sent.current = null;
    setRange(rangeOf(value));
  }, [value.startsAt, value.endsAt, value.preset]);

  return (
    <View style={{ gap: tokens.space["4"] }} testID={testID}>
      <View
        accessibilityRole="radiogroup"
        style={[styles.pills, { gap: tokens.space["2"] }]}
      >
        {presets.map((preset) => {
          const selected = value.preset === preset.key;
          return (
            <Pressable
              accessibilityLabel={preset.label}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              key={preset.key}
              onPress={() => {
                haptics.selection();
                onPreset(preset.key);
              }}
              style={({ pressed }) => [
                styles.pill,
                {
                  minHeight: 44,
                  borderRadius: tokens.radius.pill,
                  paddingHorizontal: tokens.space["4"],
                  backgroundColor: selected ? colors.action : colors.surface,
                  borderColor: selected ? colors.action : colors["line-strong"],
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              testID={testID ? `${testID}-preset-${preset.key}` : undefined}
            >
              <Text
                accessible={false}
                tone={selected ? "on-action" : "text"}
                variant="label"
                weight={600}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <DayStrip
        count={WHEN_STRIP_DAYS}
        label={stripLabel}
        locale={locale}
        onValueChange={(date) => {
          const next = nextRange(range, date);
          setRange(next);
          const start = next.start ?? date;
          const end = next.end ?? start;
          sent.current = `${start}|${end}`;
          onRange(start, end);
        }}
        rangeEnd={range.end}
        start={today}
        testID={testID ? `${testID}-strip` : undefined}
        today={today}
        value={range.start}
      />

      <View
        style={[
          styles.footer,
          {
            gap: tokens.space["2"],
            borderTopColor: colors.line,
            paddingTop: tokens.space["3"],
          },
        ]}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={styles.grow}
          variant="phone-body"
          weight={600}
        >
          {label}
        </Text>
        <View style={[styles.actions, { gap: tokens.space["2"] }]}>
          {onClear ? (
            <StateAction kind="quiet" label="Clear" onPress={onClear} />
          ) : null}
          {onDone ? <StateAction label="Done" onPress={onDone} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap" },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    maxWidth: "100%",
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderTopWidth: 1,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  actions: { flexDirection: "row" },
});
