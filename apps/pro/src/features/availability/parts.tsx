/**
 * Small parts the availability, cover and earnings screens share (M-R5).
 * `UndoToast`, `Stepper` and `ChoiceChip` are not in `@duna/ui/native` yet:
 * candidates to move there with the component families (M-C6).
 */
import { useEffect, useRef, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ErrorState,
  Icon,
  NotConfiguredState,
  OfflineState,
  PermissionDeniedState,
  Rise,
  Text,
  lastFreshText,
  useHaptics,
  useTheme,
  type GlyphName,
  type NativeColorRole,
} from "@duna/ui/native";
import { StatusChip, usePaneEdges } from "../../app/ui";
import type { Failure } from "../session/failure";
import type { StateCopy, Tone } from "./team-words";

const TONES: Readonly<
  Record<
    Tone,
    {
      readonly ink: NativeColorRole;
      readonly wash: NativeColorRole;
      readonly icon: GlyphName;
    }
  >
> = {
  positive: { ink: "positive", wash: "positive-wash", icon: "check" },
  attention: { ink: "attention", wash: "attention-wash", icon: "alert" },
  info: { ink: "info", wash: "info-wash", icon: "info" },
  danger: { ink: "danger", wash: "danger-wash", icon: "alert" },
  neutral: { ink: "text-2", wash: "surface-sunken", icon: "info" },
};

/** A state as a chip: an icon and the words (colour is never the only signal). */
export function ToneChip({ copy }: { readonly copy: StateCopy }) {
  const look = TONES[copy.tone];
  return (
    <StatusChip
      icon={look.icon}
      label={copy.label}
      tone={look.ink}
      wash={look.wash}
    />
  );
}

/** A scrolling pane with the pane's safe edges. */
export function PaneScroll({
  children,
  testID,
  gap = 16,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
  readonly gap?: number;
}) {
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingHorizontal: tokens.space["4"],
        gap,
      }}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.ground }}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

/** A failed first load as its shared state. */
export function FailureView({
  failure,
  onRetry,
  what,
}: {
  readonly failure: Failure;
  readonly onRetry: () => void;
  /** "your availability". */
  readonly what: string;
}) {
  switch (failure.kind) {
    case "offline":
      return <OfflineState onRetry={onRetry} />;
    case "denied":
      return <PermissionDeniedState what={what} who="a manager at your club" />;
    case "not-configured":
      return (
        <NotConfiguredState
          feature="Team availability"
          text="Your club's team records aren't set up in Duna Database yet. Nothing was changed."
        />
      );
    default:
      return (
        <ErrorState
          onRetry={onRetry}
          reference={failure.reference}
          text={failure.message ?? `We couldn't load ${what}.`}
          title="That didn't load"
        />
      );
  }
}

/**
 * The "last updated" line over data kept on the device. Writes need a
 * connection, and it says so.
 */
export function FreshLine({
  lastFreshAt,
  stale,
  failure,
  onRetry,
}: {
  readonly lastFreshAt: Date | null;
  readonly stale: boolean;
  readonly failure?: Failure;
  readonly onRetry: () => void;
}) {
  const { colors, tokens } = useTheme();
  if (!stale) return null;
  const offline = failure?.kind === "offline";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.fresh,
        {
          backgroundColor: colors["surface-sunken"],
          borderRadius: tokens.radius.lg,
        },
      ]}
      testID="team-fresh-line"
    >
      <Icon name="clock" size="inline" tone="text-2" />
      <View style={styles.flex}>
        <Text variant="phone-meta" weight={600}>
          {offline ? "You're offline" : "Showing your last copy"}
        </Text>
        <Text tone="text-2" variant="phone-meta">
          {`${lastFreshText(lastFreshAt, new Date())} Changes need a connection.`}
          {failure?.reference ? ` Reference ${failure.reference}.` : ""}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={onRetry}
        style={styles.link}
      >
        <Text tone="link" variant="phone-meta" weight={600}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

/** A choice that toggles: 44 pt, its label always inside its padding. */
export function ChoiceChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => {
        haptics.confirmed(0);
        onPress();
      }}
      style={({ pressed }) => [
        styles.choice,
        {
          borderRadius: tokens.radius.lg,
          backgroundColor: selected ? colors.action : colors.surface,
          borderColor: selected ? colors.action : colors["line-strong"],
          opacity: pressed ? 0.86 : 1,
        },
      ]}
      testID={testID}
    >
      {selected ? <Icon name="check" size="inline" tone="on-action" /> : null}
      <Text
        style={styles.shrink}
        tone={selected ? "on-action" : "text"}
        variant="phone-body"
        weight={600}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A value moved with − and + (half hours on the phone). Adjustable for
 * VoiceOver: swipe up or down changes it and the new value is read.
 */
export function Stepper({
  label,
  value,
  spokenValue,
  onChange,
  canDecrease = true,
  canIncrease = true,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly spokenValue?: string;
  readonly onChange: (steps: number) => void;
  readonly canDecrease?: boolean;
  readonly canIncrease?: boolean;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const step = (steps: number) => {
    haptics.confirmed(0);
    onChange(steps);
  };
  const button = (
    icon: GlyphName,
    name: string,
    steps: number,
    on: boolean,
  ) => (
    <Pressable
      accessibilityElementsHidden
      accessibilityLabel={name}
      disabled={!on}
      hitSlop={4}
      importantForAccessibility="no"
      onPress={() => step(steps)}
      style={({ pressed }) => [
        styles.stepButton,
        {
          borderColor: colors["line-strong"],
          backgroundColor: colors.surface,
          opacity: !on ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}
      testID={testID ? `${testID}-${steps > 0 ? "plus" : "minus"}` : undefined}
    >
      <Icon name={icon} size="control" />
    </Pressable>
  );
  return (
    <View
      accessibilityActions={[
        { name: "increment", label: "Later" },
        { name: "decrement", label: "Earlier" },
      ]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: spokenValue ?? value }}
      accessible
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment" && canIncrease)
          step(1);
        if (event.nativeEvent.actionName === "decrement" && canDecrease)
          step(-1);
      }}
      style={[
        styles.stepper,
        {
          backgroundColor: colors["surface-sunken"],
          borderRadius: tokens.radius.lg,
        },
      ]}
      testID={testID}
    >
      <Text
        style={styles.stepLabel}
        tone="text-2"
        variant="phone-meta"
        weight={600}
      >
        {label}
      </Text>
      <View style={styles.stepRow}>
        {button("minus", `${label} earlier`, -1, canDecrease)}
        <Text style={styles.stepValue} tabular variant="phone-heading">
          {value}
        </Text>
        {button("plus", `${label} later`, 1, canIncrease)}
      </View>
    </View>
  );
}

/**
 * What just happened, at the bottom of the pane, with Undo where the API
 * can take the change back. Leaves on its own after 8 seconds (long enough
 * to reach for); announced to VoiceOver.
 */
export function UndoToast({
  text,
  onUndo,
  onDismiss,
  undoLabel = "Undo",
}: {
  readonly text: string | null;
  readonly onUndo?: () => void;
  readonly onDismiss: () => void;
  readonly undoLabel?: string;
}) {
  const { colors, tokens } = useTheme();
  const edges = usePaneEdges();
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!text) return;
    AccessibilityInfo.announceForAccessibility(text);
    const timer = setTimeout(() => dismiss.current(), 8_000);
    return () => clearTimeout(timer);
  }, [text]);
  if (!text) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.toastWrap, { bottom: edges.bottom + tokens.space["4"] }]}
    >
      <Rise trigger={text}>
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              backgroundColor: colors.text,
              borderRadius: tokens.radius.lg,
            },
          ]}
          testID="team-toast"
        >
          <Icon name="check" size="inline" tone="ground" />
          <Text style={styles.flex} tone="ground" variant="phone-body">
            {text}
          </Text>
          {onUndo ? (
            <Pressable
              accessibilityHint="Takes the change back"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                onUndo();
                onDismiss();
              }}
              style={styles.link}
              testID="team-toast-undo"
            >
              <Text tone="ground" variant="phone-body" weight={700}>
                {undoLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  fresh: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
  },
  link: { minHeight: 44, justifyContent: "center" },
  choice: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    maxWidth: "100%",
  },
  stepper: { padding: 12, gap: 6, flexGrow: 1, flexBasis: 140 },
  stepLabel: { textAlign: "center" },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stepValue: { flexShrink: 1, textAlign: "center" },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toastWrap: { position: "absolute", left: 16, right: 16 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 52,
  },
});
