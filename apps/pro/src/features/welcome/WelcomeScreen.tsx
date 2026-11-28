/**
 * The Pro welcome (M-R4, owner's point 8): the first screen a signed-out
 * coach or club owner sees, straight after the first-open sequence turns
 * its page. A Night Court ground carries on from the launch layer, the
 * Duna Pro lockup sits where the launch mark was, and the Crest swells
 * slowly behind it as a tide (drawn in code; no video, no old mark).
 *
 * Two actions in the thumb zone: "Start your club on Duna" (sign up, then
 * the club setup) and "Log in". Press states, a selection haptic, a busy
 * loader in the pressed button, and the sign-in error in words. Reduced
 * motion: the still mark; nothing waits on an animation.
 */
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ButtonLoader,
  Rally,
  Rise,
  Text,
  ThemeOverride,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useLayout } from "@duna/ui/native/layout";
import { CrestField } from "../../shared/CrestField";
import { ProLockup } from "../../shared/ProLockup";

const PRESSED: ViewStyle = { transform: [{ scale: 0.98 }], opacity: 0.9 };

export interface WelcomeScreenProps {
  readonly error?: string;
  readonly signIn: () => Promise<void>;
  readonly signUp: () => Promise<void>;
}

export function WelcomeScreen(props: WelcomeScreenProps) {
  // Night Court in both themes: this is a brand moment, not a reading surface.
  return (
    <ThemeOverride theme="dark">
      <WelcomeBody {...props} />
    </ThemeOverride>
  );
}

function WelcomeBody({ error, signIn, signUp }: WelcomeScreenProps) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const { width, height } = layout.window;
  const [busy, setBusy] = useState<"up" | "in" | null>(null);
  // Regular and expanded windows (open Duo, iPad): a centred column.
  const regular = layout.widthClass !== "compact";
  const column = regular ? Math.min(width - 48, 460) : undefined;
  const fieldHeight = Math.min(height * 0.9, regular ? 760 : 620);

  const run = async (which: "up" | "in") => {
    if (busy) return;
    haptics.confirmed(0);
    setBusy(which);
    try {
      await (which === "up" ? signUp() : signIn());
    } catch {
      haptics.refused();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      style={[styles.fill, { backgroundColor: tokens.brand["night-court"] }]}
      testID="pro-welcome"
    >
      <StatusBar barStyle="light-content" />
      <CrestField
        color={tokens.brand.dune}
        height={fieldHeight}
        style={{
          position: "absolute",
          opacity: 0.09,
          left: -fieldHeight * 0.16,
          bottom: -fieldHeight * 0.12,
        }}
        testID="pro-welcome-field"
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + tokens.space["8"],
            paddingBottom: insets.bottom + tokens.space["6"],
            paddingLeft: insets.left + tokens.space["6"],
            paddingRight: insets.right + tokens.space["6"],
          },
        ]}
      >
        <View
          style={[
            styles.column,
            column ? { width: column, alignSelf: "center" } : null,
          ]}
        >
          <View style={styles.brand}>
            <ProLockup markHeight={regular ? 120 : 96} />
          </View>
          <Rally>
            <View style={styles.copy}>
              <Title size={30} style={{ textAlign: "center" }}>
                Run your club from the court
              </Title>
              <Text
                style={{ textAlign: "center" }}
                tone="text-2"
                variant="phone-body"
              >
                Sessions, people, payments and Courtside scoring, in one app for
                coaches and club owners.
              </Text>
            </View>
            <View style={styles.actions}>
              {error ? (
                <Rise trigger={error}>
                  <View
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.error,
                      {
                        backgroundColor: colors["danger-wash"],
                        borderRadius: tokens.radius.lg,
                      },
                    ]}
                  >
                    <Text variant="phone-meta" weight={600}>
                      {error}
                    </Text>
                  </View>
                </Rise>
              ) : null}
              <Pressable
                accessibilityHint="Creates your Duna account, then sets up your club"
                accessibilityRole="button"
                accessibilityState={{ busy: busy === "up", disabled: !!busy }}
                disabled={!!busy}
                onPress={() => void run("up")}
                style={({ pressed }) => [
                  styles.button,
                  {
                    backgroundColor: tokens.brand.dune,
                    borderRadius: tokens.radius.pill,
                  },
                  pressed ? PRESSED : null,
                ]}
                testID="welcome-start"
              >
                {busy === "up" ? (
                  <ButtonLoader
                    color={tokens.brand["night-court"]}
                    label="Opening sign-up"
                  />
                ) : (
                  <Text
                    style={{ color: tokens.brand["night-court"] }}
                    variant="phone-body"
                    weight={600}
                  >
                    Start your club on Duna
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityHint="Signs in with your Duna email or phone"
                accessibilityRole="button"
                accessibilityState={{ busy: busy === "in", disabled: !!busy }}
                disabled={!!busy}
                onPress={() => void run("in")}
                style={({ pressed }) => [
                  styles.button,
                  {
                    borderColor: colors["line-strong"],
                    borderWidth: 1,
                    borderRadius: tokens.radius.pill,
                  },
                  pressed
                    ? [PRESSED, { backgroundColor: colors.surface }]
                    : null,
                ]}
                testID="welcome-login"
              >
                {busy === "in" ? (
                  <ButtonLoader
                    color={tokens.brand.salt}
                    label="Opening log in"
                  />
                ) : (
                  <Text variant="phone-body" weight={600}>
                    Log in
                  </Text>
                )}
              </Pressable>
              <Text
                style={{ textAlign: "center" }}
                tone="text-3"
                variant="phone-meta"
              >
                Already play on Duna? Log in with the same email or phone.
              </Text>
            </View>
          </Rally>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
  content: { flexGrow: 1 },
  column: {
    flex: 1,
    justifyContent: "space-between",
    gap: 32,
    width: "100%",
  },
  brand: { alignItems: "center", paddingTop: 24 },
  copy: { gap: 12, alignItems: "center" },
  actions: { gap: 12 },
  button: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  error: { padding: 12 },
});
