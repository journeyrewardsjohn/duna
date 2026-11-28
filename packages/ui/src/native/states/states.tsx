import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  createDelayedLoading,
  LOADING_DELAY_MS,
  LOADING_MIN_MS,
} from "../../tideline/interactions/interaction-core";
import { Icon, type GlyphName } from "../icons/Icon";
import { RallyLoader, Skeleton, type SkeletonKind } from "../loaders/loaders";
import { useTheme } from "../theme/ThemeProvider";
import type { NativeColorRole } from "../tokens";
import { Text } from "../type/Text";
import { StateAction, type StateActionProps } from "./StateAction";

type Action = Pick<StateActionProps, "label" | "onPress" | "accessibilityHint">;

interface PanelProps {
  readonly icon?: GlyphName;
  readonly iconTone?: NativeColorRole;
  readonly title: string;
  readonly text?: string;
  readonly action?: Action;
  readonly secondary?: Action;
  readonly children?: ReactNode;
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** The shared frame: a small icon with a word, a title, one line, one action. */
function StatePanel({
  icon,
  iconTone = "text-2",
  title,
  text,
  action,
  secondary,
  children,
  compact,
  style,
  testID,
}: PanelProps) {
  const { tokens } = useTheme();
  return (
    <View
      style={[
        {
          gap: tokens.space["3"],
          padding: compact ? tokens.space["4"] : tokens.space["6"],
        },
        style,
      ]}
      testID={testID}
    >
      {icon ? <Icon name={icon} size="nav" tone={iconTone} /> : null}
      <Text accessibilityRole="header" variant="phone-heading">
        {title}
      </Text>
      {text ? (
        <Text tone="text-2" variant="phone-body">
          {text}
        </Text>
      ) : null}
      {children}
      {action || secondary ? (
        <View style={styles.actions}>
          {action ? <StateAction {...action} /> : null}
          {secondary ? <StateAction {...secondary} kind="quiet" /> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Loading: nothing for the first 250 ms, then a Rally loader (or a skeleton in
 * the final layout's geometry) that stays at least 400 ms, so it never
 * flickers. Never a blank area once shown.
 */
export function LoadingState({
  loading,
  label = "Loading",
  skeleton,
  count,
  children,
}: {
  readonly loading: boolean;
  readonly label?: string;
  /** Show a skeleton of this kind instead of the Rally loader. */
  readonly skeleton?: SkeletonKind;
  readonly count?: number;
  /** What to show when loading is over. */
  readonly children?: ReactNode;
}) {
  const visible = useDelayedVisible(loading);
  if (visible) {
    return skeleton ? (
      <Skeleton count={count} kind={skeleton} label={label} />
    ) : (
      <View style={styles.loading}>
        <RallyLoader label={label} />
      </View>
    );
  }
  return loading ? null : <>{children}</>;
}

/** The delayed-loading rule (250 ms delay, 400 ms minimum) as a hook. */
export function useDelayedVisible(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const controller = useRef<ReturnType<typeof createDelayedLoading> | null>(
    null,
  );
  controller.current ??= createDelayedLoading(setVisible, {
    delayMs: LOADING_DELAY_MS,
    minDurationMs: LOADING_MIN_MS,
  });
  useEffect(() => {
    controller.current?.set(loading);
  }, [loading]);
  useEffect(() => () => controller.current?.dispose(), []);
  return visible;
}

/** Empty: a title, one line and one next action. Never 0/0 or an empty table. */
export function EmptyState({
  title,
  text,
  action,
  compact,
  style,
}: {
  readonly title: string;
  readonly text?: string;
  readonly action?: Action;
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <StatePanel
      action={action}
      compact={compact}
      style={style}
      text={text}
      title={title}
    />
  );
}

/**
 * Error: what happened, what to do, Try again, and the reference id behind a
 * Details disclosure so a developer can find the logged event.
 */
export function ErrorState({
  title = "Something went wrong",
  text = "Try again. If it keeps happening, send us the reference below.",
  reference,
  onRetry,
  retryLabel = "Try again",
  secondary,
  compact,
  style,
}: {
  readonly title?: string;
  readonly text?: string;
  /** The request id or error reference (`req_…`, `err_…`). */
  readonly reference?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly secondary?: Action;
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <StatePanel
      action={onRetry ? { label: retryLabel, onPress: onRetry } : undefined}
      compact={compact}
      icon="alert"
      iconTone="danger"
      secondary={secondary}
      style={style}
      testID="duna-error-state"
      text={text}
      title={title}
    >
      {reference ? (
        <View>
          <Pressable
            accessibilityHint="Shows the error reference"
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            hitSlop={12}
            onPress={() => setOpen((value) => !value)}
            style={styles.details}
          >
            <Icon
              name={open ? "chevron-down" : "chevron-right"}
              size="inline"
              tone="text-2"
            />
            <Text tone="text-2" variant="label">
              Details
            </Text>
          </Pressable>
          {open ? (
            <Text selectable tone="text-2" variant="code">
              {`Reference: ${reference}`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </StatePanel>
  );
}

/** Formats "Last updated" for the offline state; pure. */
export function lastFreshText(
  lastFreshAt: Date | null | undefined,
  now: Date,
): string {
  if (!lastFreshAt) return "This may be out of date.";
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - lastFreshAt.getTime()) / 60_000),
  );
  if (minutes < 1) return "This may be out of date. Updated just now.";
  if (minutes < 60)
    return `This may be out of date. Updated ${minutes} min ago.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `This may be out of date. Updated ${hours} h ago.`;
  return `This may be out of date. Updated ${lastFreshAt.toLocaleDateString()}.`;
}

/**
 * Offline or degraded: says the data may be out of date and when it was last
 * fresh, and whether changes are queued. Never Solar.
 */
export function OfflineState({
  lastFreshAt,
  queued = 0,
  onRetry,
  now = new Date(),
  compact,
  style,
}: {
  readonly lastFreshAt?: Date | null;
  /** Changes waiting to send; they send when the connection returns. */
  readonly queued?: number;
  readonly onRetry?: () => void;
  readonly now?: Date;
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const queue =
    queued > 0
      ? ` ${queued === 1 ? "1 change is" : `${queued} changes are`} saved and will send when you reconnect.`
      : "";
  return (
    <StatePanel
      action={onRetry ? { label: "Try again", onPress: onRetry } : undefined}
      compact={compact}
      icon="clock"
      style={style}
      text={`${lastFreshText(lastFreshAt, now)}${queue}`}
      title="You're offline"
    />
  );
}

/**
 * Provider not configured yet: an honest state, no outbound call, no
 * invented data. Never names an infrastructure vendor.
 */
export function NotConfiguredState({
  feature,
  text,
  action,
  compact,
  style,
}: {
  /** What isn't set up, in plain words ("Payments", "Text messages"). */
  readonly feature: string;
  readonly text?: string;
  readonly action?: Action;
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <StatePanel
      action={action}
      compact={compact}
      icon="info"
      style={style}
      text={
        text ?? "This isn't set up yet. Nothing is sent or charged until it is."
      }
      title={`${feature} isn't configured yet`}
    />
  );
}

/** Permission denied: why, and who can grant it. Never a crash or an empty page. */
export function PermissionDeniedState({
  what,
  who,
  action,
  compact,
  style,
}: {
  /** What the person can't do ("see payouts"). */
  readonly what: string;
  /** Who can grant it ("an owner of South Bay Volleyball Club"). */
  readonly who: string;
  readonly action?: Action;
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <StatePanel
      action={action}
      compact={compact}
      icon="key"
      style={style}
      text={`Ask ${who} to give you access.`}
      title={`You don't have access to ${what}`}
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  details: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 32,
  },
  loading: { alignItems: "center", justifyContent: "center", padding: 32 },
});
