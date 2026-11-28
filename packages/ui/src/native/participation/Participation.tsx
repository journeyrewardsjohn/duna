import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { NativeColorRole } from "../tokens";
import { Text } from "../type/Text";
import {
  participationCompactText,
  participationToneRoles,
  type ParticipationTone,
} from "./view";

/**
 * Solar roles, reached only for a session happening NOW (the one place a
 * participation part may use the live colour).
 */
const LIVE_FILL: NativeColorRole = "live-wash";
const LIVE_INK: NativeColorRole = "live-ink";

export interface ParticipationChipProps {
  /** The backend's status words (`copy.status`). */
  readonly label: string;
  readonly tone: ParticipationTone;
  /** The session is happening now: the only case that may use Solar. */
  readonly live?: boolean;
  readonly testID?: string;
}

/**
 * The status chip ("Needs 2 more", "Cancelled · not enough players"). It
 * holds its label with padding at any text size: it wraps inside its own
 * edge rather than clipping. Tone colours: neutral, positive, caution,
 * critical; Solar only when `live`.
 */
export function ParticipationChip({
  label,
  tone,
  live = false,
  testID,
}: ParticipationChipProps) {
  const { colors, tokens } = useTheme();
  const roles = live
    ? { fill: LIVE_FILL, ink: LIVE_INK }
    : participationToneRoles(tone);
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      accessible
      style={[
        styles.chip,
        {
          backgroundColor: colors[roles.fill],
          borderRadius: tokens.radius.pill,
          paddingHorizontal: tokens.space["3"],
          paddingVertical: tokens.space["1"],
          gap: 6,
        },
      ]}
      testID={testID}
    >
      {live ? (
        <View style={[styles.dot, { backgroundColor: colors["live"] }]} />
      ) : null}
      <Text
        style={styles.label}
        tone={roles.ink}
        variant="phone-meta"
        weight={600}
      >
        {label}
      </Text>
    </View>
  );
}

export interface ParticipationLineProps {
  /** `copy.status`. */
  readonly status: string;
  /** `copy.line`. */
  readonly line?: string;
  readonly tone: ParticipationTone;
  /** One line in a result row, no chip; otherwise the chip over the line. */
  readonly compact?: boolean;
  readonly testID?: string;
}

/**
 * The participation status in a result row (compact: "Needs 2 more ·
 * Confirms Thu 6:00 PM if 2 more join", two lines at most) or as a block
 * (the chip, then the line).
 */
export function ParticipationLine({
  status,
  line,
  tone,
  compact = false,
  testID,
}: ParticipationLineProps) {
  const { tokens } = useTheme();
  if (compact) {
    const ink = participationToneRoles(tone).ink;
    return (
      <Text
        accessibilityLabel={participationCompactText(status, line)}
        numberOfLines={2}
        testID={testID}
        tone="text-2"
        variant="phone-meta"
      >
        <Text
          tone={tone === "neutral" ? "text-2" : ink}
          variant="phone-meta"
          weight={600}
        >
          {status}
        </Text>
        {line ? ` · ${line}` : null}
      </Text>
    );
  }
  return (
    <View style={{ gap: tokens.space["1"] }} testID={testID}>
      <ParticipationChip label={status} tone={tone} />
      {line ? (
        <Text tone="text-2" variant="phone-meta">
          {line}
        </Text>
      ) : null}
    </View>
  );
}

export interface PriceLadderProps {
  readonly title?: string;
  /** `participationView(...).ladder`: the backend's row words and which is now. */
  readonly rows: ReadonlyArray<{
    readonly label: string;
    readonly current: boolean;
  }>;
  /** The backend's words for the current row ("Now (3 booked)"). */
  readonly currentLabel?: string;
  /** The backend's price line. */
  readonly maxLine?: string;
  readonly testID?: string;
}

export const PRICE_LADDER_TITLE = "What you pay at each group size";

/**
 * What each player pays at each group size, as a list; the current row is
 * highlighted with the backend's "Now (n booked)" beside it, and the price
 * line under the list.
 */
export function PriceLadder({
  title = PRICE_LADDER_TITLE,
  rows,
  currentLabel,
  maxLine,
  testID,
}: PriceLadderProps) {
  const { colors, tokens } = useTheme();
  return (
    <View style={{ gap: tokens.space["2"] }} testID={testID}>
      <Text accessibilityRole="header" variant="phone-body" weight={600}>
        {title}
      </Text>
      <View accessibilityRole="list" style={{ gap: 2 }}>
        {rows.map((row, index) => (
          <View
            accessibilityLabel={
              row.current && currentLabel
                ? `${row.label}, ${currentLabel}`
                : row.label
            }
            accessibilityState={{ selected: row.current }}
            accessible
            key={`${index}-${row.label}`}
            style={[
              styles.row,
              {
                minHeight: tokens.size.row,
                borderRadius: tokens.radius.md,
                paddingHorizontal: tokens.space["3"],
                paddingVertical: tokens.space["2"],
                gap: tokens.space["2"],
                backgroundColor: row.current ? colors.selected : "transparent",
                borderColor: row.current
                  ? colors["selected-ring"]
                  : "transparent",
              },
            ]}
          >
            <Text
              style={styles.grow}
              tone={row.current ? "on-selected" : "text"}
              variant="phone-body"
              weight={row.current ? 600 : undefined}
            >
              {row.label}
            </Text>
            {row.current && currentLabel ? (
              <Text tone="on-selected" variant="phone-meta" weight={600}>
                {currentLabel}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {maxLine ? (
        <Text tone="text-2" variant="phone-meta">
          {maxLine}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  label: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    borderWidth: 1.5,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
});
