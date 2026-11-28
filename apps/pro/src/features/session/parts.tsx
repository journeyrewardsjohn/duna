/**
 * The session's parts (M-R2) on the Duna Design System. `GroupStatus`,
 * `Countdown` and `PersonRow` are named in participation.md §7.4 and are not
 * in `@duna/ui/native` yet: candidates to move there with M-C6.
 *
 * Group status always pairs an icon with words (colour is never the only
 * signal) and never uses Solar: nothing here is live.
 */
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  ButtonLoader,
  Icon,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
  type NativeColorRole,
} from "@duna/ui/native";
import type { ParticipationTone } from "@duna/core";
import { countdownParts, formatCountdown } from "@duna/tideline-core";
import { useEffect, useRef, useState, type ReactNode } from "react";

const PRESSED: ViewStyle = { transform: [{ scale: 0.98 }], opacity: 0.86 };

/** Tone → icon and colour roles (never Solar). */
export function toneStyle(tone: ParticipationTone): {
  readonly icon: GlyphName;
  readonly ink: NativeColorRole;
  readonly wash: NativeColorRole;
} {
  switch (tone) {
    case "caution":
      return { icon: "users", ink: "warning", wash: "warning-wash" };
    case "critical":
      return { icon: "close", ink: "danger", wash: "danger-wash" };
    case "positive":
      return { icon: "check", ink: "positive", wash: "positive-wash" };
    default:
      return { icon: "users", ink: "text-2", wash: "surface-sunken" };
  }
}

/** The compact chip: "Needs 2 more", with its icon. */
export function GroupStatusChip({
  tone,
  label,
  testID,
}: {
  readonly tone: ParticipationTone;
  readonly label: string;
  readonly testID?: string;
}) {
  const { colors } = useTheme();
  const look = toneStyle(tone);
  return (
    <View
      style={[styles.chip, { backgroundColor: colors[look.wash] }]}
      testID={testID}
    >
      <Icon name={look.icon} size="chip" tone={look.ink} />
      <Text
        style={styles.shrink}
        tone={look.ink}
        variant="phone-meta"
        weight={600}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The large group status: the shared status words, the staff line, the
 * numbers, and the countdown to the decision when there is one.
 */
export function GroupStatus({
  tone,
  status,
  staff,
  line,
  booked,
  minimum,
  capacity,
  lockAt,
  now,
  accessibilityLabel,
  large = false,
}: {
  readonly tone: ParticipationTone;
  readonly status: string;
  readonly staff: string;
  readonly line?: string;
  readonly booked: number;
  readonly minimum: number | null;
  readonly capacity: number;
  readonly lockAt?: number;
  readonly now: number;
  readonly accessibilityLabel: string;
  /** The half-open Duo's top pane: read at a distance. */
  readonly large?: boolean;
}) {
  const { colors, tokens } = useTheme();
  const look = toneStyle(tone);
  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: colors[look.wash],
          borderRadius: tokens.radius.xl,
          borderColor: colors.line,
        },
      ]}
      testID="session-group-status"
    >
      <View
        accessibilityLabel={accessibilityLabel}
        accessible
        style={styles.groupTop}
      >
        <Icon name={look.icon} size="nav" tone={look.ink} />
        <View style={styles.flex}>
          <Text
            tone={look.ink}
            variant={large ? "phone-title" : "phone-heading"}
          >
            {status}
          </Text>
          <Text tone="text" variant="phone-body">
            {staff}
          </Text>
          {line ? (
            <Text tone="text-2" variant="phone-meta">
              {line}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.numbers}>
        <Figure label="booked" value={booked} large={large} />
        {minimum !== null ? (
          <Figure label="minimum" value={minimum} large={large} />
        ) : null}
        <Figure label="places" value={capacity} large={large} />
      </View>
      {lockAt !== undefined ? <Countdown lockAt={lockAt} now={now} /> : null}
    </View>
  );
}

function Figure({
  label,
  value,
  large,
}: {
  readonly label: string;
  readonly value: number;
  readonly large: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${value} ${label}`}
      accessible
      style={styles.figure}
    >
      <Text tabular variant={large ? "display-sm" : "figure-sm"} weight={600}>
        {String(value)}
      </Text>
      <Text tone="text-2" variant="phone-meta">
        {label}
      </Text>
    </View>
  );
}

/**
 * "Decision in 3h 05m". Updates with the screen's clock; announces to
 * screen readers at most when it crosses an hour (participation.md §10),
 * never every minute.
 */
export function Countdown({
  lockAt,
  now,
  label = "Decision",
}: {
  readonly lockAt: number;
  readonly now: number;
  readonly label?: string;
}) {
  const parts = countdownParts(lockAt, now);
  const text =
    parts.direction === "in"
      ? `${label} ${formatCountdown(parts)}`
      : parts.direction === "now"
        ? `${label} now`
        : `${label} time has passed`;
  const hours = Math.floor((lockAt - now) / 3_600_000);
  const lastHours = useRef(hours);
  useEffect(() => {
    if (hours !== lastHours.current && parts.direction === "in") {
      AccessibilityInfo.announceForAccessibility(text);
    }
    lastHours.current = hours;
  }, [hours, parts.direction, text]);
  return (
    <View style={styles.countdown} testID="session-countdown">
      <Icon name="timer" size="inline" tone="text-2" />
      <Text tabular tone="text-2" variant="phone-meta" weight={600}>
        {text}
      </Text>
    </View>
  );
}

/** A minute clock for screens with countdowns and phases. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * One person on a roster: initials, name, the guardian note for juniors,
 * how they paid (amounts only for money roles), and a trailing part.
 * Names wrap at large text sizes; they are never truncated.
 */
export function PersonRow({
  name,
  note,
  payment,
  junior,
  trailing,
  dim,
  testID,
}: {
  readonly name: string;
  readonly note?: string | null;
  readonly payment?: string | null;
  readonly junior?: boolean;
  readonly trailing?: ReactNode;
  readonly dim?: boolean;
  readonly testID?: string;
}) {
  const { colors } = useTheme();
  const meta = [note, payment].filter(Boolean).join(" · ");
  return (
    <View
      accessibilityLabel={[name, note, payment].filter(Boolean).join(". ")}
      accessible={!trailing}
      style={[styles.person, dim ? styles.dim : null]}
      testID={testID}
    >
      <View
        style={[styles.avatar, { backgroundColor: colors["surface-sunken"] }]}
      >
        {junior ? (
          <Icon name="junior-guardian" size="control" tone="text-2" />
        ) : (
          <Text
            maxFontSizeMultiplier={1.4}
            tone="text-2"
            variant="phone-meta"
            weight={600}
          >
            {initials(name)}
          </Text>
        )}
      </View>
      <View style={styles.flex}>
        <Text variant="phone-body" weight={600}>
          {name}
        </Text>
        {meta ? (
          <Text tone="text-2" variant="phone-meta">
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/** A full-width action: 52 pt, the verb as its label, one haptic. */
export function ActionButton({
  label,
  hint,
  icon,
  onPress,
  kind = "secondary",
  busy = false,
  disabled = false,
  testID,
  style,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly icon?: GlyphName;
  readonly onPress: () => void;
  readonly kind?: "primary" | "secondary" | "danger";
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const background =
    kind === "primary"
      ? colors.action
      : kind === "danger"
        ? colors["danger-wash"]
        : colors.surface;
  const ink: NativeColorRole =
    kind === "primary" ? "on-action" : kind === "danger" ? "danger" : "text";
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={() => {
        haptics.confirmed(kind === "primary" ? 1 : 0);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor:
            inactive && kind === "primary"
              ? colors["action-disabled"]
              : background,
          borderColor:
            kind === "secondary" ? colors["line-strong"] : "transparent",
          borderRadius: tokens.radius.lg,
        },
        pressed ? PRESSED : null,
        style,
      ]}
      testID={testID}
    >
      {busy ? (
        <ButtonLoader />
      ) : icon ? (
        <Icon name={icon} size="control" tone={ink} />
      ) : null}
      <Text style={styles.shrink} tone={ink} variant="phone-body" weight={600}>
        {label}
      </Text>
    </Pressable>
  );
}

/** An inline notice: what happened, in a tone, with an optional action. */
export function Notice({
  tone,
  title,
  text,
  action,
  onAction,
  testID,
}: {
  readonly tone: "info" | "positive" | "warning" | "danger";
  readonly title: string;
  readonly text?: string;
  readonly action?: string;
  readonly onAction?: () => void;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const icon: GlyphName =
    tone === "positive" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        {
          backgroundColor: colors[`${tone}-wash`],
          borderRadius: tokens.radius.lg,
        },
      ]}
      testID={testID}
    >
      <Icon name={icon} size="control" tone={tone} />
      <View style={styles.flex}>
        <Text variant="phone-body" weight={600}>
          {title}
        </Text>
        {text ? (
          <Text tone="text-2" variant="phone-meta">
            {text}
          </Text>
        ) : null}
      </View>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onAction}
          style={styles.noticeAction}
        >
          <Text tone="link" variant="phone-meta" weight={600}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  group: { padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  groupTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  numbers: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  figure: { minWidth: 64 },
  countdown: { flexDirection: "row", alignItems: "center", gap: 6 },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
  },
  dim: { opacity: 0.6 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  notice: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  noticeAction: { minHeight: 44, justifyContent: "center" },
});
