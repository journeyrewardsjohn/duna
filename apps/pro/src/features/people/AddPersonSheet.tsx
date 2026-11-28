/**
 * Add a person (M-R4): invite a player, or a junior with their guardian,
 * through `operator.createPlayerInvitation` (the procedure the old roster
 * used). The guardian rule is said before anything is sent: a junior's
 * invitation goes to their guardian. Nothing is sent until the person
 * presses "Send invitation"; one idempotency key is kept across retries.
 */
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  AdaptiveSheet,
  Icon,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useProRuntime } from "../../../runtime";
import { IconButton } from "../../app/ui";
import { DunaTextInput } from "../session/duna-text";
import { classifyFailure, type Failure } from "../session/failure";
import { ActionButton, Notice } from "../session/parts";

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text tone="text-2" variant="phone-meta" weight={600}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function AddPersonSheet({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { client, mode, refresh } = useProRuntime();
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [junior, setJunior] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName("");
    setEmail("");
    setPhone("");
    setJunior(false);
    setGuardianName("");
    setGuardianEmail("");
    setFailure(null);
    setSent(null);
    key.current = null;
  }, [visible]);

  const digits = phone.replace(/\D/g, "");
  const ready =
    name.trim().length >= 2 &&
    (junior
      ? guardianName.trim().length >= 2 &&
        /.+@.+\..+/.test(guardianEmail.trim())
      : /.+@.+\..+/.test(email.trim()) || digits.length >= 8);
  const hint =
    name.trim().length < 2
      ? "Add their name."
      : junior
        ? "Add the guardian's name and email."
        : "Add an email or a phone number.";

  const send = async () => {
    if (busy || !ready) return;
    if (mode !== "live" || !client) {
      setSent("Preview: nothing was sent.");
      return;
    }
    key.current ??= Crypto.randomUUID();
    setBusy(true);
    setFailure(null);
    try {
      const result = await client.operator.createPlayerInvitation.mutate({
        invitedName: name.trim(),
        ...(!junior && email.trim() ? { invitedEmail: email.trim() } : {}),
        ...(!junior && digits.length >= 8
          ? { invitedPhoneE164: `+${digits}` }
          : {}),
        relationship: "player",
        isMinor: junior,
        ...(junior
          ? {
              guardianName: guardianName.trim(),
              guardianEmail: guardianEmail.trim(),
            }
          : {}),
        confirmed: true,
        idempotencyKey: key.current,
      });
      key.current = null;
      haptics.confirmed(1);
      setSent(
        result.status === "sent"
          ? `Invitation sent to ${junior ? guardianName.trim() : name.trim()}.`
          : "Invitation created; it sends shortly.",
      );
      void refresh();
    } catch (error) {
      haptics.refused();
      setFailure(classifyFailure(error, "pro.people.invite_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdaptiveSheet
      accessibilityLabel="Add a person"
      kind="dialog"
      onClose={busy ? () => undefined : onClose}
      testID="sheet-add-person"
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <Text
          accessibilityRole="header"
          style={styles.grow}
          variant="phone-heading"
        >
          Add a person
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
        {sent ? (
          <>
            <Notice
              testID="add-person-sent"
              text="They show up in People once they accept."
              title={sent}
              tone="positive"
            />
            <ActionButton
              kind="primary"
              label="Done"
              onPress={onClose}
              testID="add-person-done"
            />
          </>
        ) : (
          <>
            <Text tone="text-2" variant="phone-body">
              Duna sends them an invitation to join your club. Nothing is sent
              until you press Send invitation.
            </Text>
            <Field label="Name">
              <DunaTextInput
                accessibilityLabel="Name"
                autoCapitalize="words"
                onChangeText={setName}
                placeholder="Full name"
                testID="add-person-name"
                textContentType="name"
                value={name}
              />
            </Field>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: junior }}
              onPress={() => {
                haptics.selection();
                setJunior((value) => !value);
              }}
              style={[
                styles.toggle,
                {
                  borderColor: junior ? colors.action : colors.line,
                  backgroundColor: junior ? colors.selected : colors.surface,
                  borderRadius: tokens.radius.lg,
                },
              ]}
              testID="add-person-junior"
            >
              <Icon
                name="junior-guardian"
                size="control"
                tone={junior ? "text" : "text-2"}
              />
              <View style={styles.grow}>
                <Text variant="phone-body" weight={600}>
                  This player is a junior
                </Text>
                <Text tone="text-2" variant="phone-meta">
                  Their guardian gets the invitation, books, pays and receives
                  every message.
                </Text>
              </View>
              <Icon
                name={junior ? "check" : "minus"}
                size="inline"
                tone={junior ? "text" : "text-3"}
              />
            </Pressable>
            {junior ? (
              <>
                <Field label="Guardian's name">
                  <DunaTextInput
                    accessibilityLabel="Guardian's name"
                    autoCapitalize="words"
                    onChangeText={setGuardianName}
                    placeholder="Parent or guardian"
                    value={guardianName}
                  />
                </Field>
                <Field label="Guardian's email">
                  <DunaTextInput
                    accessibilityLabel="Guardian's email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={setGuardianEmail}
                    placeholder="name@example.com"
                    textContentType="emailAddress"
                    value={guardianEmail}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Email">
                  <DunaTextInput
                    accessibilityLabel="Email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="name@example.com"
                    textContentType="emailAddress"
                    value={email}
                  />
                </Field>
                <Field label="Phone (optional)">
                  <DunaTextInput
                    accessibilityLabel="Phone"
                    keyboardType="phone-pad"
                    onChangeText={setPhone}
                    placeholder="+1 310 555 0100"
                    textContentType="telephoneNumber"
                    value={phone}
                  />
                </Field>
              </>
            )}
            {failure ? (
              <Notice
                testID="add-person-failure"
                text={[
                  failure.kind === "denied"
                    ? "Ask an owner or manager to add people."
                    : (failure.message ?? "Nothing was sent."),
                  failure.reference
                    ? `Reference ${failure.reference}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={
                  failure.kind === "offline"
                    ? "No connection"
                    : "The invitation didn't send"
                }
                tone={failure.kind === "offline" ? "warning" : "danger"}
              />
            ) : null}
            <ActionButton
              busy={busy}
              disabled={!ready}
              hint={!ready ? hint : undefined}
              kind="primary"
              label="Send invitation"
              onPress={() => void send()}
              testID="add-person-send"
            />
            {!ready ? (
              <Text tone="text-2" variant="phone-meta">
                {hint}
              </Text>
            ) : null}
          </>
        )}
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
  grow: { flex: 1, minWidth: 0 },
  field: { gap: 6 },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
});
