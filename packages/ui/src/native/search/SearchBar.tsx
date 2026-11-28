import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "../icons/Icon";
import { tokenEasing } from "../motion/easing";
import { useHaptics } from "../motion/haptics";
import { useReducedMotion } from "../motion/reduced-motion";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "../type/Text";
import {
  EDIT_SEARCH_LABEL,
  SEARCH_STEP_LABELS,
  searchBarSummary,
  type SearchStep,
} from "./logic";

export interface SearchBarProps {
  readonly where: string | null;
  readonly when: string | null;
  readonly what: string | null;
  /** Scrolled on a phone: one line. */
  readonly collapsed: boolean;
  readonly onOpen: (step: SearchStep) => void;
  /** Clears a step from its chip's ×. */
  readonly onClear?: (step: SearchStep) => void;
  /** `large` shows tiny Where / When / What labels over the values. */
  readonly size?: "compact" | "large";
  readonly testID?: string;
}

/** The collapse cross-fade: 200 ms, Cross easing; a plain fade under reduced motion. */
export const SEARCH_BAR_FADE_MS = 200;

/**
 * The Find search bar. Expanded: three chips (Where, When, What) that open
 * their step, each with a × to clear it when set, and a find button. Collapsed
 * (scrolled): one line, the place in bold over "{when} · {what}", that opens
 * the search. The two cross-fade in 200 ms (a plain fade under reduced
 * motion). Empty values read "Anywhere", "Any time" and "For you".
 */
export function SearchBar({
  where,
  when,
  what,
  collapsed,
  onOpen,
  onClear,
  size = "compact",
  testID,
}: SearchBarProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const reduceMotion = useReducedMotion();
  const summary = searchBarSummary({ where, when, what });
  const opacity = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: SEARCH_BAR_FADE_MS,
      easing: reduceMotion ? Easing.linear : tokenEasing("cross"),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [collapsed, opacity, reduceMotion]);

  const shell = {
    backgroundColor: colors.surface,
    borderColor: colors["line-strong"],
    borderRadius: tokens.radius.pill,
  };

  if (collapsed) {
    return (
      <Animated.View style={{ opacity }} testID={testID}>
        <Pressable
          accessibilityHint={`${summary.lead}, ${summary.detail}`}
          accessibilityLabel={EDIT_SEARCH_LABEL}
          accessibilityRole="button"
          onPress={() => {
            haptics.selection();
            onOpen("where");
          }}
          style={({ pressed }) => [
            styles.collapsed,
            shell,
            {
              minHeight: 52,
              paddingHorizontal: tokens.space["4"],
              paddingVertical: tokens.space["2"],
              gap: tokens.space["3"],
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Icon name="find" size="control" />
          <View style={styles.collapsedText}>
            <Text accessible={false} variant="phone-body" weight={600}>
              {summary.lead}
            </Text>
            <Text accessible={false} tone="text-2" variant="phone-meta">
              {summary.detail}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[styles.expanded, { opacity, gap: tokens.space["2"] }]}
      testID={testID}
    >
      <View style={[styles.chips, { gap: tokens.space["2"] }]}>
        {summary.chips.map((chip) => (
          <View
            key={chip.step}
            style={[
              styles.chip,
              shell,
              {
                borderRadius: tokens.radius.xl,
                backgroundColor: chip.set ? colors.selected : colors.surface,
                borderColor: chip.set
                  ? colors["selected-ring"]
                  : colors["line-strong"],
              },
            ]}
          >
            <Pressable
              accessibilityLabel={chip.label}
              accessibilityRole="button"
              onPress={() => {
                haptics.selection();
                onOpen(chip.step);
              }}
              style={({ pressed }) => [
                styles.chipBody,
                {
                  minHeight: 44,
                  paddingLeft: tokens.space["3"],
                  paddingRight:
                    chip.set && onClear ? tokens.space["1"] : tokens.space["3"],
                  paddingVertical: tokens.space["1"],
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              testID={testID ? `${testID}-${chip.step}` : undefined}
            >
              {size === "large" ? (
                <Text accessible={false} tone="text-2" variant="micro">
                  {SEARCH_STEP_LABELS[chip.step]}
                </Text>
              ) : null}
              <Text
                accessible={false}
                tone={chip.set ? "on-selected" : "text"}
                variant="label"
                weight={600}
              >
                {chip.value}
              </Text>
            </Pressable>
            {chip.set && onClear ? (
              <Pressable
                accessibilityLabel={chip.clearLabel}
                accessibilityRole="button"
                hitSlop={4}
                onPress={() => {
                  haptics.selection();
                  onClear(chip.step);
                }}
                style={({ pressed }) => [
                  styles.clear,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                testID={testID ? `${testID}-${chip.step}-clear` : undefined}
              >
                <Icon name="close" size="inline" tone="on-selected" />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      <Pressable
        accessibilityLabel={EDIT_SEARCH_LABEL}
        accessibilityRole="button"
        onPress={() => {
          haptics.selection();
          onOpen("where");
        }}
        style={({ pressed }) => [
          styles.find,
          {
            backgroundColor: colors.action,
            borderRadius: tokens.radius.pill,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        testID={testID ? `${testID}-find` : undefined}
      >
        <Icon name="find" size="control" tone="on-action" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  collapsed: { flexDirection: "row", alignItems: "center", borderWidth: 1 },
  collapsedText: { flexShrink: 1, flexGrow: 1 },
  expanded: { flexDirection: "row", alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1, flexGrow: 1 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    maxWidth: "100%",
  },
  chipBody: { justifyContent: "center", flexShrink: 1 },
  clear: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  find: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
