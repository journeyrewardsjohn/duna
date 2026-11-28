/**
 * Small controls for scoring and results (M-P4a): a segmented choice, a
 * thumb-sized stepper, an agreement box, a notice and a text field. Built
 * on the Duna Design System; candidates to move into `@duna/ui/native`
 * when the component families ship (none of them exists there yet).
 */
import { Pressable, StyleSheet, View } from "react-native";
import {
  Icon,
  Numerals,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
  type NativeColorRole,
} from "@duna/ui/native";
import { usePane } from "@duna/ui/native/layout";
import type { ReactNode } from "react";
import { DunaTextInput } from "./duna-text";

/** The widest a reading column grows in a wide pane (iPad, the open Duo). */
const READABLE_COLUMN = 680;

/**
 * Side padding that keeps forms and lists to a readable column inside the
 * pane they are in (never the screen), and 16 pt at least.
 */
export function useReadableInset(minimum = 16): number {
  const pane = usePane();
  return Math.max(minimum, Math.round((pane.width - READABLE_COLUMN) / 2));
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <View style={{ gap: tokens.space["2"] }} testID={testID}>
      <Text tone="text-2" variant="phone-meta" weight={600}>
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={[
          styles.segmented,
          {
            backgroundColor: colors["surface-sunken"],
            borderRadius: tokens.radius.lg,
          },
        ]}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={String(option.value)}
              onPress={() => {
                if (selected) return;
                haptics.selection();
                onChange(option.value);
              }}
              style={[
                styles.segment,
                {
                  borderRadius: tokens.radius.md,
                  backgroundColor: selected ? colors.surface : "transparent",
                  borderColor: selected ? colors.line : "transparent",
                },
              ]}
            >
              <Text variant="phone-body" weight={selected ? 600 : 500}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A 56 pt stepper for a set score: minus, the number, plus. */
export function Stepper({
  value,
  onChange,
  label,
  max = 99,
}: {
  readonly value: number;
  readonly onChange: (value: number) => void;
  /** "Set 2, Williams / Lewis". */
  readonly label: string;
  readonly max?: number;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const step = (by: number) => {
    const next = Math.max(0, Math.min(max, value + by));
    if (next === value) return;
    haptics.selection();
    onChange(next);
  };
  const button = (icon: GlyphName, by: number, name: string) => (
    <Pressable
      accessibilityLabel={`${name} ${label}`}
      accessibilityRole="button"
      hitSlop={4}
      onLongPress={() => step(by * 5)}
      onPress={() => step(by)}
      style={({ pressed }) => [
        styles.stepButton,
        {
          backgroundColor: colors.surface,
          borderColor: colors["line-strong"],
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Icon name={icon} size="control" />
    </Pressable>
  );
  return (
    <View
      accessibilityActions={[
        { name: "increment", label: "Add a point" },
        { name: "decrement", label: "Take a point off" },
      ]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityValue={{ now: value, min: 0, max }}
      onAccessibilityAction={(event) =>
        step(event.nativeEvent.actionName === "increment" ? 1 : -1)
      }
      style={[styles.stepper, { gap: tokens.space["2"] }]}
    >
      {button("minus", -1, "Take a point off")}
      <Numerals style={styles.stepValue} variant="figure" weight={600}>
        {value}
      </Numerals>
      {button("plus", 1, "Add a point to")}
    </View>
  );
}

/** The agreement box: a 48 pt row, the whole row toggles. */
export function CheckRow({
  label,
  checked,
  onChange,
  error,
  testID,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly error?: string;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <View style={{ gap: tokens.space["1"] }}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => {
          haptics.selection();
          onChange(!checked);
        }}
        style={styles.check}
        testID={testID}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: error ? colors.danger : colors["border-control"],
              backgroundColor: checked ? colors.action : colors.surface,
              borderRadius: tokens.radius.sm,
            },
          ]}
        >
          {checked ? (
            <Icon color={colors["on-action"]} name="check" size="inline" />
          ) : null}
        </View>
        <Text style={styles.flex} variant="phone-body">
          {label}
        </Text>
      </Pressable>
      {error ? (
        <Text tone="danger" variant="phone-meta">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A notice: a small icon with a word, never a coloured edge stripe. */
export function Notice({
  tone,
  title,
  children,
  icon,
}: {
  readonly tone: "info" | "warning" | "danger" | "positive";
  readonly title?: string;
  readonly children?: ReactNode;
  readonly icon?: GlyphName;
}) {
  const { colors, tokens } = useTheme();
  const wash = `${tone}-wash` as NativeColorRole;
  const glyph: GlyphName =
    icon ??
    (tone === "positive" ? "success" : tone === "info" ? "info" : "alert");
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : "text"}
      style={[
        styles.notice,
        {
          backgroundColor: colors[wash],
          borderRadius: tokens.radius.lg,
          padding: tokens.space["3"],
        },
      ]}
    >
      <Icon name={glyph} size="control" tone={tone} />
      <View style={[styles.flex, { gap: 2 }]}>
        {title ? (
          <Text variant="phone-body" weight={600}>
            {title}
          </Text>
        ) : null}
        {typeof children === "string" ? (
          <Text tone="text-2" variant="phone-meta">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  keyboardType,
  autoComplete,
  multiline,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly error?: string;
  readonly keyboardType?: "default" | "email-address" | "phone-pad";
  readonly autoComplete?:
    "given-name" | "family-name" | "email" | "tel" | "off";
  readonly multiline?: boolean;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View style={{ gap: tokens.space["1"] }}>
      <Text tone="text-2" variant="phone-meta" weight={600}>
        {label}
      </Text>
      <DunaTextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChange}
        placeholder={placeholder}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors["border-control"],
            borderRadius: tokens.radius.md,
            minHeight: multiline ? 96 : 48,
          },
        ]}
        testID={testID}
        value={value}
      />
      {error ? (
        <Text tone="danger" variant="phone-meta">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segmented: { flexDirection: "row", padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { minWidth: 56, textAlign: "center" },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  box: {
    width: 28,
    height: 28,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  notice: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
