/**
 * "At risk this week" at the top of Today and Schedule (participation.md
 * §7.4): present only when a session is under its minimum (never a "0 at
 * risk" card). Each row: the session, the shared compact state ("Needs 2
 * more") and the decision time with a countdown; one tap opens the session.
 * Its own loading and error states, so a failure never hides the day.
 */
import { Pressable, StyleSheet, View } from "react-native";
import {
  ErrorState,
  Icon,
  LoadingState,
  Rally,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useMemo } from "react";
import { useShell } from "../../app/ShellContext";
import { SectionHead } from "../../app/ui";
import { useDay } from "../today/use-day";
import { atRiskRows, type AtRiskRow } from "./at-risk";
import { GroupStatusChip } from "./parts";

export function AtRiskGroup({
  testID = "at-risk",
  showStates = true,
}: {
  readonly testID?: string;
  /** False where the screen shows the at-risk loading and error itself (Today). */
  readonly showStates?: boolean;
}) {
  const day = useDay();
  const shell = useShell();
  const rows = useMemo(
    () => atRiskRows(day.atRisk, day.now, day.timeZone),
    [day.atRisk, day.now, day.timeZone],
  );
  if (!showStates && day.atRiskStatus !== "ready") return null;
  if (day.atRiskStatus === "loading")
    return <LoadingState count={1} loading skeleton="row" />;
  if (day.atRiskStatus === "error")
    return (
      <ErrorState
        compact
        onRetry={() => void day.refresh()}
        text="Sessions under their minimum could not load."
        title="Couldn't load group minimums"
      />
    );
  if (!rows.length) return null;
  return (
    <View style={styles.block} testID={testID}>
      <SectionHead title="At risk this week" />
      <Rally>
        {rows.map((row) => (
          <AtRiskRowView
            key={row.id}
            onPress={() => shell.open("session", { entryId: row.id })}
            row={row}
          />
        ))}
      </Rally>
    </View>
  );
}

function AtRiskRowView({
  row,
  onPress,
}: {
  readonly row: AtRiskRow;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityHint="Opens the session"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityRole="button"
      onPress={() => {
        haptics.confirmed(0);
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderRadius: tokens.radius.lg,
        },
        pressed ? styles.pressed : null,
      ]}
      testID={`at-risk-${row.id}`}
    >
      <View style={styles.text}>
        <Text variant="phone-body" weight={600}>
          {row.title}
        </Text>
        <Text tone="text-2" variant="phone-meta">
          {row.when}
        </Text>
        <View style={styles.meta}>
          <GroupStatusChip label={row.status} tone="caution" />
          <View style={styles.decides}>
            <Icon name="timer" size="chip" tone="text-2" />
            <Text tabular tone="text-2" variant="phone-meta" weight={600}>
              {row.countdown
                ? `${row.decides} · ${row.countdown}`
                : row.decides}
            </Text>
          </View>
        </View>
      </View>
      <Icon name="chevron-right" size="inline" tone="text-3" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  text: { flex: 1, gap: 4 },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  decides: { flexDirection: "row", alignItems: "center", gap: 4 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
});
