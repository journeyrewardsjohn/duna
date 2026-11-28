/**
 * The sign-in, sign-up and returning-account screens in front of the shell
 * (identity chrome, restyled on the Duna Design System; behaviour is the
 * runtime's and unchanged). Night Court ground, the Crest mark and the drawn
 * wordmark; one Jost title; actions are 56 pt.
 */
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  DunaMark,
  DunaWordmark,
  RallyLoader,
  Text,
  ThemeOverride,
  Title,
  useTheme,
} from "@duna/ui/native";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

/** Returning on this device: continue as the saved account, or switch. */
export function ReturningAccountGate({
  busy,
  error,
  name,
  initials,
  photoUrl,
  onContinue,
  onUseDifferentAccount,
}: {
  readonly busy: boolean;
  readonly error?: string;
  readonly name: string;
  readonly initials: string;
  readonly photoUrl?: string;
  readonly onContinue: () => void;
  readonly onUseDifferentAccount: () => void;
}) {
  const { colors } = useTheme();
  return (
    <GateFrame
      footer={
        <>
          {error ? (
            <Text accessibilityRole="alert" tone="danger" variant="phone-meta">
              {error}
            </Text>
          ) : null}
          <GateAction busy={busy} label="Continue" onPress={onContinue} />
          <GateAction
            disabled={busy}
            kind="quiet"
            label="Use a different account"
            onPress={onUseDifferentAccount}
          />
        </>
      }
    >
      <Text family="mono" tone="text-2" variant="micro">
        LOG IN AS
      </Text>
      <View style={styles.identity}>
        {photoUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: photoUrl }}
            style={styles.photo}
          />
        ) : (
          <View
            style={[
              styles.photo,
              styles.initials,
              { backgroundColor: colors.action },
            ]}
          >
            <Text
              style={{ color: colors["on-action"] }}
              variant="phone-heading"
            >
              {initials}
            </Text>
          </View>
        )}
        <Title>{name}</Title>
      </View>
    </GateFrame>
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
  identity: { alignItems: "flex-start", gap: 12 },
  photo: { width: 72, height: 72, borderRadius: 36 },
  initials: { alignItems: "center", justifyContent: "center" },
  loading: { alignItems: "center", justifyContent: "center" },
});
