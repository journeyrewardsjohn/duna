import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "../icons/Icon";
import { useHaptics } from "../motion/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "../type/Text";
import type { SearchStep } from "./logic";

export interface SearchSectionProps {
  readonly step: SearchStep;
  /** "Where", "When", "What". */
  readonly label: string;
  /** The current value, shown when closed. */
  readonly value: string;
  /** The heading when open ("Where to?"). */
  readonly question: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children?: ReactNode;
}

/**
 * One step of the search sheet, as an accordion card. Closed: the label and
 * the value on one row that opens it. Open: the question as the heading and
 * the step's picker under it.
 */
export function SearchSection({
  step,
  label,
  value,
  question,
  open,
  onToggle,
  children,
}: SearchSectionProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: open ? colors["line-strong"] : colors.line,
          borderRadius: tokens.radius["2xl"],
          padding: tokens.space["4"],
          gap: tokens.space["3"],
        },
      ]}
      testID={`search-section-${step}`}
    >
      <Pressable
        accessibilityLabel={open ? question : `${label}: ${value}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          onToggle();
        }}
        style={({ pressed }) => [
          styles.head,
          { minHeight: 44, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        {open ? (
          <Text
            accessibilityRole="header"
            accessible={false}
            style={styles.grow}
            variant="phone-heading"
          >
            {question}
          </Text>
        ) : (
          <>
            <Text accessible={false} tone="text-2" variant="phone-meta">
              {label}
            </Text>
            <Text
              accessible={false}
              style={[styles.grow, styles.value]}
              variant="phone-body"
              weight={600}
            >
              {value}
            </Text>
          </>
        )}
        <Icon
          name={open ? "chevron-down" : "chevron-right"}
          size="inline"
          tone="text-3"
        />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flexGrow: 1, flexShrink: 1 },
  value: { textAlign: "right" },
});
