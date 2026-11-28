/**
 * The interaction kit's confirmation tiers on native (docs/design/
 * interaction-kit.md): `confirm` (1) asks the question, says what happens
 * and who is affected, and the button is the verb; `strong` (2) also
 * restates the people, the money and the consequence. Cancel comes first
 * when the action is destructive. The verb is single-flight and keeps one
 * idempotency key across retries; a failure stays in the sheet with its
 * reference. A person always presses the verb: nothing here confirms itself.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveSheet, Text, useHaptics, useTheme } from "@duna/ui/native";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "../../app/ui";
import { classifyFailure, type Failure } from "./failure";
import { ActionButton, Notice } from "./parts";

export interface ConfirmRow {
  readonly label: string;
  readonly value: string;
}

export interface ConfirmSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly tier: 1 | 2;
  readonly title: string;
  readonly description: string;
  /** Strong tier: who, how much, the consequence, the reference. */
  readonly rows?: readonly ConfirmRow[];
  readonly verb: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  /** The verb stays disabled until this is true (a required reason). */
  readonly ready?: boolean;
  /** Why the verb is disabled, said beside it. */
  readonly notReadyHint?: string;
  /** Runs the action with the key reused on retry. Throw to show the failure. */
  readonly perform: (idempotencyKey: string) => Promise<void>;
  /** Called after `perform` succeeded (the sheet closes itself). */
  readonly onDone?: () => void;
  readonly event: string;
  readonly children?: ReactNode;
  readonly testID?: string;
}

function failureText(failure: Failure): { title: string; text?: string } {
  switch (failure.kind) {
    case "offline":
      return {
        title: "No connection",
        text: "Nothing was changed. Try again when you have signal.",
      };
    case "denied":
      return {
        title: "You don't have permission for this",
        text: failure.message ?? "Ask a director at your club to do it.",
      };
    case "not-configured":
      return {
        title: "Not set up yet",
        text: "This needs Duna Database connected for your club. Nothing was changed.",
      };
    default:
      return {
        title: "That didn't work",
        text: [
          failure.message ?? "Nothing was changed.",
          failure.reference ? `Reference ${failure.reference}` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      };
  }
}

export function ConfirmSheet({
  visible,
  onClose,
  tier,
  title,
  description,
  rows = [],
  verb,
  cancelLabel = "Not now",
  destructive = false,
  ready = true,
  notReadyHint,
  perform,
  onDone,
  event,
  children,
  testID,
}: ConfirmSheetProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      key.current = null;
      setFailure(null);
      setBusy(false);
    }
  }, [visible]);

  const run = async () => {
    if (busy || !ready) return;
    key.current ??= Crypto.randomUUID();
    setBusy(true);
    setFailure(null);
    try {
      await perform(key.current);
      haptics.confirmed(tier);
      key.current = null;
      onClose();
      onDone?.();
    } catch (error) {
      haptics.refused();
      setFailure(classifyFailure(error, event));
    } finally {
      setBusy(false);
    }
  };

  const cancel = (
    <ActionButton
      disabled={busy}
      key="cancel"
      label={cancelLabel}
      onPress={onClose}
      style={styles.grow}
      testID="confirm-cancel"
    />
  );
  const confirm = (
    <ActionButton
      busy={busy}
      disabled={!ready}
      hint={!ready ? notReadyHint : undefined}
      key="verb"
      kind={destructive ? "danger" : "primary"}
      label={verb}
      onPress={() => void run()}
      style={styles.grow}
      testID="confirm-verb"
    />
  );

  return (
    <AdaptiveSheet
      accessibilityLabel={title}
      kind="dialog"
      onClose={busy ? () => undefined : onClose}
      testID={testID}
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <Text
          accessibilityRole="header"
          style={styles.grow}
          variant="phone-heading"
        >
          {title}
        </Text>
        <IconButton
          icon="close"
          label="Close"
          onPress={busy ? () => undefined : onClose}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.space["4"],
          paddingBottom: tokens.space["6"],
          gap: tokens.space["4"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text tone="text-2" variant="phone-body">
          {description}
        </Text>
        {rows.length ? (
          <View
            style={[
              styles.rows,
              {
                backgroundColor: colors["surface-sunken"],
                borderRadius: tokens.radius.lg,
              },
            ]}
          >
            {rows.map((row) => (
              <View
                accessibilityLabel={`${row.label}: ${row.value}`}
                accessible
                key={row.label}
                style={styles.row}
              >
                <Text tone="text-2" variant="phone-meta" weight={600}>
                  {row.label}
                </Text>
                <Text variant="phone-body">{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {children}
        {failure ? (
          <Notice
            testID="confirm-failure"
            tone={failure.kind === "offline" ? "warning" : "danger"}
            {...failureText(failure)}
          />
        ) : null}
        {!ready && notReadyHint ? (
          <Text tone="text-2" variant="phone-meta">
            {notReadyHint}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          {destructive ? [cancel, confirm] : [confirm, cancel]}
        </View>
      </ScrollView>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  rows: { padding: 14, gap: 10 },
  row: { gap: 2 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
