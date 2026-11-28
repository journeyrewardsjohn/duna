import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { Icon, type GlyphName } from "../icons/Icon";
import { useHaptics } from "../motion/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { Numerals } from "../type/Numerals";
import { Text } from "../type/Text";
import { WHAT_EXCLUSIVE, toggleWhat, whatColumns } from "./logic";

export interface WhatOption {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
  readonly icon?: GlyphName;
  readonly count?: number | null;
}

export interface WhatPickerProps {
  readonly options: ReadonlyArray<WhatOption>;
  readonly value: ReadonlyArray<string>;
  readonly onChange: (next: ReadonlyArray<string>) => void;
  /** The all-or-nothing choice. Default "for-you". */
  readonly exclusive?: string;
  readonly testID?: string;
}

/** A tile's spoken name. Pure. */
export function whatOptionLabel(option: WhatOption): string {
  return [
    option.label,
    option.detail,
    option.count != null ? String(option.count) : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * What step: multi-select tiles, two a row (one at large text sizes), each
 * with its icon, label, detail and count, and a check mark when chosen.
 * Choosing the exclusive tile ("For you") clears the others; choosing
 * another clears it; clearing them all returns to it.
 */
export function WhatPicker({
  options,
  value,
  onChange,
  exclusive = WHAT_EXCLUSIVE,
  testID,
}: WhatPickerProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const { fontScale } = useWindowDimensions();
  const columns = whatColumns(fontScale);
  const gap = tokens.space["2"];
  const [width, setWidth] = useState(0);
  const tileWidth =
    columns === 1 || width === 0 ? undefined : Math.floor((width - gap) / 2);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(Math.floor(event.nativeEvent.layout.width))
      }
      style={[
        styles.grid,
        { gap, flexDirection: columns === 1 ? "column" : "row" },
      ]}
      testID={testID}
    >
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <Pressable
            accessibilityLabel={whatOptionLabel(option)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, selected }}
            key={option.value}
            onPress={() => {
              haptics.selection();
              onChange(toggleWhat(value, option.value, exclusive));
            }}
            style={({ pressed }) => [
              styles.tile,
              {
                width: tileWidth,
                flexBasis:
                  columns === 2 && tileWidth === undefined ? "47%" : undefined,
                flexGrow: columns === 2 && tileWidth === undefined ? 1 : 0,
                minHeight: 72,
                borderRadius: tokens.radius.xl,
                padding: tokens.space["3"],
                gap: tokens.space["1"],
                backgroundColor: selected ? colors.selected : colors.surface,
                borderColor: selected ? colors["selected-ring"] : colors.line,
                borderWidth: selected ? 2 : 1,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <View style={styles.top}>
              {option.icon ? (
                <Icon
                  name={option.icon}
                  size="control"
                  tone={selected ? "on-selected" : "text"}
                />
              ) : null}
              <View style={styles.grow} />
              {selected ? (
                <View
                  style={[
                    styles.check,
                    { backgroundColor: colors["selected-ring"] },
                  ]}
                >
                  <Icon color={colors.surface} name="check" size="chip" />
                </View>
              ) : null}
            </View>
            <Text
              accessible={false}
              tone={selected ? "on-selected" : "text"}
              variant="phone-body"
              weight={600}
            >
              {option.label}
            </Text>
            {option.detail ? (
              <Text accessible={false} tone="text-2" variant="phone-meta">
                {option.detail}
              </Text>
            ) : null}
            {option.count != null ? (
              <Numerals
                accessible={false}
                family="ui"
                tone="text-2"
                variant="phone-meta"
                weight={600}
              >
                {option.count}
              </Numerals>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: "wrap" },
  tile: {},
  top: { flexDirection: "row", alignItems: "center", minHeight: 22 },
  grow: { flexGrow: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
});
