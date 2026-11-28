import {
  durationCrests,
  durationLabel,
  normalizeDurations,
} from "@duna/tideline-core";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useHaptics } from "../motion/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "../type/Text";
import { MIN_HIT } from "./layout";

export interface DurationCrestsProps {
  /** Names the choice for screen readers ("Booking length"). */
  readonly label: string;
  /** Lengths in minutes. Default 60, 90, 120. */
  readonly options?: ReadonlyArray<number>;
  /** Lengths with no start time left that day: shown, not choosable, and said. */
  readonly unavailable?: ReadonlyArray<number>;
  readonly value: number | null;
  readonly onValueChange: (minutes: number) => void;
  /** A line under an option ("Quick game"), by minutes. */
  readonly notes?: Readonly<Record<number, string>>;
  readonly testID?: string;
}

export const DEFAULT_CREST_OPTIONS: ReadonlyArray<number> = [60, 90, 120];

/** The spoken name of one length. Pure. */
export function durationOptionLabel(
  minutes: number,
  options: { readonly note?: string; readonly unavailable?: boolean } = {},
): string {
  return [
    durationLabel(minutes).text,
    options.note,
    options.unavailable ? "no times left this day" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Side by side normally; stacked at large accessibility sizes. Pure. */
export function durationStacks(fontScale: number): boolean {
  return fontScale >= 1.8;
}

/**
 * Choose a length (the web `DurationCrests`' twin): a segmented row labelled
 * with `durationLabel` ("60 min", "90 min", "2 h"), each with its crests (one
 * for the first hour, one more per half hour, three at most). A length with
 * no time left is shown, said and not choosable. Segments stack at the
 * largest text sizes so every label stays whole.
 */
export function DurationCrests({
  label,
  options = DEFAULT_CREST_OPTIONS,
  unavailable = [],
  value,
  onValueChange,
  notes,
  testID,
}: DurationCrestsProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const { fontScale } = useWindowDimensions();
  const blocked = new Set(unavailable);
  const stacked = durationStacks(fontScale);
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      style={[
        styles.row,
        {
          flexDirection: stacked ? "column" : "row",
          gap: tokens.space["2"],
        },
      ]}
      testID={testID}
    >
      {normalizeDurations(options).map((minutes) => {
        const selected = value === minutes;
        const off = blocked.has(minutes);
        const note = notes?.[minutes];
        const crests = durationCrests(minutes);
        const ink = selected ? "on-action" : off ? "text-3" : "text";
        return (
          <Pressable
            accessibilityLabel={durationOptionLabel(minutes, {
              note,
              unavailable: off,
            })}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled: off }}
            disabled={off}
            key={minutes}
            onPress={() => {
              if (off) return;
              haptics.selection();
              onValueChange(minutes);
            }}
            style={({ pressed }) => [
              styles.option,
              {
                flexGrow: 1,
                flexBasis: stacked ? "auto" : 0,
                minHeight: MIN_HIT + 4,
                borderRadius: tokens.radius.lg,
                paddingHorizontal: tokens.space["3"],
                paddingVertical: tokens.space["2"],
                backgroundColor: selected ? colors.action : colors.surface,
                borderColor: selected ? colors.action : colors["line-strong"],
                opacity: off ? 0.5 : pressed ? 0.75 : 1,
              },
            ]}
            testID={testID ? `${testID}-${minutes}` : undefined}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.crests}
            >
              {[0, 1, 2].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.crest,
                    {
                      backgroundColor:
                        index < crests
                          ? selected
                            ? colors["on-action"]
                            : colors.text
                          : selected
                            ? colors["action-hover"]
                            : colors.line,
                    },
                  ]}
                />
              ))}
            </View>
            <Text
              accessible={false}
              style={off ? styles.struck : undefined}
              tone={ink}
              variant="label"
              weight={600}
            >
              {durationLabel(minutes).text}
            </Text>
            {note ? (
              <Text
                accessible={false}
                tone={selected ? "on-action" : "text-2"}
                variant="phone-meta"
              >
                {note}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "stretch" },
  option: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    gap: 4,
  },
  crests: { flexDirection: "row", gap: 3 },
  crest: { width: 10, height: 4, borderRadius: 2 },
  struck: { textDecorationLine: "line-through" },
});
