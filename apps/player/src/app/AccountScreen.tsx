/**
 * The account (identity chrome every shell keeps, contract "Identity
 * chrome"): who is signed in, the organisation switcher with "Create new
 * organisation", appearance (Light, Dark, Match device), the full profile and
 * settings, and sign out (confirmed). Lives under Connect on every size.
 */
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { demoPlayer } from "@duna/core/demo";
import {
  ErrorState,
  Icon,
  Spinner,
  Text,
  THEME_PREFERENCES,
  themePreferenceLabels,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { report } from "@duna/observability";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { dunaWebUrl } from "../../mobile-api";
import { usePlayerRuntime } from "../../runtime";
import { useShell } from "./ShellContext";
import { Card, Row, SectionHead, StatusChip, usePaneEdges } from "./ui";

const hqUrl = (
  process.env.EXPO_PUBLIC_DUNA_HQ_URL?.trim() || dunaWebUrl
).replace(/\/+$/, "");

export function AccountScreen() {
  const runtime = usePlayerRuntime();
  const shell = useShell();
  const haptics = useHaptics();
  const edges = usePaneEdges();
  const { colors, tokens, preference, setPreference } = useTheme();
  const [switching, setSwitching] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const player = runtime.dashboard?.player ?? demoPlayer;
  const organizations = runtime.authOrganizations ?? [];
  const preview = runtime.mode === "preview";

  const switchTo = async (organizationId: string) => {
    if (
      !runtime.switchOrganization ||
      organizationId === runtime.activeAuthOrganizationId
    )
      return;
    setSwitching(organizationId);
    setFailure(null);
    try {
      await runtime.switchOrganization(organizationId);
      haptics.confirmed(2);
    } catch (error) {
      haptics.refused();
      setFailure(
        report(error, { event: "player.account.switch_organization_failed" }),
      );
    } finally {
      setSwitching(null);
    }
  };

  const confirmSignOut = () => {
    if (!runtime.signOut) return;
    Alert.alert(
      "Sign out of Duna?",
      "Your saved data on this device is removed. You can sign back in at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            haptics.confirmed(1);
            void runtime.signOut?.().catch((error: unknown) => {
              setFailure(
                report(error, { event: "player.account.sign_out_failed" }),
              );
            });
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + tokens.space["4"],
        paddingRight: edges.right + tokens.space["4"],
        gap: tokens.space["6"],
      }}
      style={{ backgroundColor: colors.ground }}
      testID="account-screen"
    >
      <Card>
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.action }]}>
            <Text
              maxFontSizeMultiplier={1.2}

              style={{ color: colors["on-action"] }}
              variant="phone-heading"
            >
              {player.initials}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="phone-heading">{player.displayName}</Text>
            <Text tone="text-2" variant="phone-meta">
              {preview ? "Preview: sign-in is off in this build" : "Signed in"}
            </Text>
          </View>
        </View>
        <Row
          icon="player"
          onPress={() => shell.open("you")}
          summary="Details, artwork, notifications and privacy"
          title="Profile and settings"
        />
      </Card>

      {failure ? (
        <ErrorState compact reference={failure} title="That didn't work" />
      ) : null}

      <View style={styles.block}>
        <SectionHead title="Organisations" />
        <Card>
          {organizations.length ? (
            organizations.map((organization) => {
              const active =
                organization.id === runtime.activeAuthOrganizationId;
              return (
                <Row
                  icon="member-card"
                  key={organization.id}
                  onPress={
                    active ? undefined : () => void switchTo(organization.id)
                  }
                  summary={
                    active
                      ? "Current organisation"
                      : "Switch to this organisation"
                  }
                  title={organization.name}
                  trailing={
                    switching === organization.id ? (
                      <Spinner label={`Switching to ${organization.name}`} />
                    ) : active ? (
                      <StatusChip
                        icon="check"
                        label="Current"
                        tone="positive"
                        wash="positive-wash"
                      />
                    ) : undefined
                  }
                />
              );
            })
          ) : (
            <Text tone="text-2" variant="phone-meta">
              You are not a member of an organisation yet.
            </Text>
          )}
          <Row
            icon="plus"
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `${hqUrl}/onboarding?mode=create`,
              )
            }
            summary="Set up a club or coaching business in Duna HQ"
            title="Create new organisation"
          />
        </Card>
      </View>

      <View style={styles.block}>
        <SectionHead title="Appearance" />
        <View
          accessibilityLabel="Appearance"
          accessibilityRole="radiogroup"
          style={[
            styles.segments,
            {
              backgroundColor: colors["surface-sunken"],
              borderRadius: tokens.radius.lg,
            },
          ]}
        >
          {THEME_PREFERENCES.map((option) => {
            const selected = preference === option;
            return (
              <Pressable
                accessibilityLabel={themePreferenceLabels[option]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option}
                onPress={() => {
                  haptics.confirmed(0);
                  setPreference(option);
                }}
                style={[
                  styles.segment,
                  {
                    borderRadius: tokens.radius.md,
                    backgroundColor: selected ? colors.surface : "transparent",
                  },
                ]}
              >
                <Text variant="phone-meta" weight={selected ? 600 : 500}>
                  {themePreferenceLabels[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {runtime.signOut ? (
        <Pressable
          accessibilityHint="Asks before signing out"
          accessibilityRole="button"
          onPress={confirmSignOut}
          style={[
            styles.signOut,
            { borderColor: colors.line, borderRadius: tokens.radius.xl },
          ]}
        >
          <Icon name="key" tone="danger" />
          <Text tone="danger" variant="phone-body" weight={600}>
            Sign out
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: 8 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  segments: { flexDirection: "row", padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
