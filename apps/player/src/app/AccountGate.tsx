/**
 * The sign-in, sign-up and returning-account screens in front of the shell
 * (identity chrome, restyled on the Duna Design System; behaviour is the
 * runtime's and unchanged). Night Court ground, the Crest mark and the drawn
 * wordmark; one Jost title; actions are 56 pt.
 */
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  DunaMark,
  DunaWordmark,
  Rally,
  RallyLoader,
  Rise,
  Text,
  ThemeOverride,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PersonAvatar } from "../shared/PersonAvatar";

function GateAction({
  label,
  onPress,
  kind = "primary",
  busy = false,
  disabled = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly kind?: "primary" | "quiet";
  readonly busy?: boolean;
  readonly disabled?: boolean;
}) {
  const { colors, tokens } = useTheme();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          borderRadius: tokens.radius.pill,
          backgroundColor: primary ? colors.action : "transparent",
          borderColor: primary ? colors.action : colors["line-strong"],
          opacity: pressed ? 0.86 : 1,
          transform: pressed ? [{ scale: 0.98 }] : undefined,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={primary ? colors["on-action"] : colors.text}
        />
      ) : (
        <Text
          style={primary ? { color: colors["on-action"] } : undefined}
          variant="phone-body"
          weight={600}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function GateFrame({
  children,
  footer,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors, tokens, statusBar } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.ground }]}>
      <StatusBar style={statusBar} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "space-between",
          paddingTop: insets.top + tokens.space["12"],
          paddingBottom: insets.bottom + tokens.space["6"],
          paddingLeft: insets.left + tokens.space["6"],
          paddingRight: insets.right + tokens.space["6"],
          gap: tokens.space["8"],
        }}
      >
        <View style={styles.brand}>
          <DunaMark decorative size={56} />
          <DunaWordmark width={112} />
        </View>
        <View style={[styles.body, { maxWidth: 440 }]}>{children}</View>
        {footer ? <View style={styles.body}>{footer}</View> : null}
      </ScrollView>
    </View>
  );
}

/** Signed out: create an account or log in. */
export function SignedOutGate({
  error,
  onSignIn,
  onSignUp,
}: {
  readonly error?: string;
  readonly onSignIn: () => void;
  readonly onSignUp: () => void;
}) {
  return (
    <ThemeOverride theme="dark">
      <GateFrame
        footer={
          <>
            <GateAction label="Create your free account" onPress={onSignUp} />
            <GateAction
              kind="quiet"
              label="Log in to Duna"
              onPress={onSignIn}
            />
            <Text style={styles.center} tone="text-2" variant="phone-meta">
              Already a Duna member? Use the same email or phone number to log
              in.
            </Text>
          </>
        }
      >
        <Title>Play more beach</Title>
        <Text tone="text-2" variant="phone-body">
          Find games near you, book courts and lessons, track your Sand Rating
          and study your film.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" tone="danger" variant="phone-meta">
            {error}
          </Text>
        ) : null}
      </GateFrame>
    </ThemeOverride>
  );
}

/** "Good evening" for the hour on this device. Pure. */
export function greetingFor(hour: number): string {
  if (hour < 5) return "Late one";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Returning on this device, after sign-in (owner feedback 28 Nov, image 36):
 * ONE person, centred and prominent on Night Court, the same Crest lockup the
 * launch sequence turns its page onto, a warm line, Continue as the one
 * action (Dune, 56 pt, a confirming haptic) and "Use a different account"
 * quiet underneath. The parts Rally in once; reduced motion shows them at
 * rest. Nothing here can be selected: it is not a list of accounts.
 */
export function ReturningAccountGate({
  busy,
  error,
  name,
  photoUrl,
  onContinue,
  onUseDifferentAccount,
}: {
  readonly busy: boolean;
  readonly error?: string;
  readonly name: string;
  /** Kept for callers; the avatar derives its own initials from the name. */
  readonly initials?: string;
  readonly photoUrl?: string;
  readonly onContinue: () => void;
  readonly onUseDifferentAccount: () => void;
}) {
  const haptics = useHaptics();
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  const greeting = greetingFor(new Date().getHours());
  return (
    <ThemeOverride theme="dark">
      <GateFrame
        footer={
          <Rise delay={420}>
            <View style={styles.actions}>
              {error ? (
                <Text
                  accessibilityRole="alert"
                  style={styles.center}
                  tone="danger"
                  variant="phone-meta"
                >
                  {error}
                </Text>
              ) : null}
              <GateAction
                busy={busy}
                label={`Continue as ${firstName}`}
                onPress={() => {
                  haptics.confirmed(1);
                  onContinue();
                }}
              />
              <GateLink
                disabled={busy}
                label="Use a different account"
                onPress={() => {
                  haptics.selection();
                  onUseDifferentAccount();
                }}
              />
            </View>
          </Rise>
        }
      >
        <View style={styles.identity} testID="returning-account">
          <Rise mode="grow">
            <PersonAvatar name={name} photoUrl={photoUrl} ring size={128} />
          </Rise>
          <Rally itemStyle={styles.centerItem}>
            <Text family="mono" tone="text-2" variant="micro">
              {`${greeting.toUpperCase()}`}
            </Text>
            <Title>{name}</Title>
            <Text style={styles.center} tone="text-2" variant="phone-body">
              Your games, plans and film are where you left them.
            </Text>
          </Rally>
        </View>
      </GateFrame>
    </ThemeOverride>
  );
}

/** A quiet text action under the primary one (44 pt target). */
function GateLink({
  label,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text tone="text-2" variant="phone-body" weight={500}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A full-screen message (identity not set up, sync failed) with one action. */
export function MessageGate({
  title,
  body,
  action,
  onAction,
  busy = false,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: string;
  readonly onAction?: () => void;
  readonly busy?: boolean;
}) {
  return (
    <GateFrame
      footer={
        action && onAction ? (
          <GateAction busy={busy} label={action} onPress={onAction} />
        ) : busy ? (
          <RallyLoader label="Working" />
        ) : null
      }
    >
      <Title>{title}</Title>
      <Text tone="text-2" variant="phone-body">
        {body}
      </Text>
    </GateFrame>
  );
}

/** Loading the saved session. */
export function LoadingGate() {
  const { colors, statusBar } = useTheme();
  return (
    <View
      accessibilityLabel="Loading Duna"
      accessibilityRole="progressbar"
      style={[styles.fill, styles.loading, { backgroundColor: colors.ground }]}
    >
      <StatusBar style={statusBar} />
      <RallyLoader label="Loading Duna" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  brand: { alignItems: "center", gap: 16 },
  body: { gap: 12, alignSelf: "center", width: "100%" },
  center: { textAlign: "center" },
  action: {
    minHeight: 56,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  identity: { alignItems: "center", gap: 20 },
  centerItem: { alignItems: "center", marginTop: 6 },
  actions: { gap: 8 },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  loading: { alignItems: "center", justifyContent: "center" },
});
