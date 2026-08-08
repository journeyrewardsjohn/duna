import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { demoPlayer } from "@duna/core/demo";
import { FellixText as Text } from "./fellix-text";
import { dunaWebUrl } from "./mobile-api";
import { usePlayerRuntime } from "./runtime";

type HubDestination =
  "profile" | "wallet" | "predictions" | "health" | "performance";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}

function ProfileDetailsModal({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const { dashboard, mode, settings } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>PLAYER PROFILE</Text>
            <Text style={styles.modalTitle}>Your public story.</Text>
          </View>
          <Pressable
            accessibilityLabel="Close profile details"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.profileIdentity}>
            {player.avatarUrl ? (
              <Image
                source={{ uri: player.avatarUrl }}
                style={styles.profilePhoto}
              />
            ) : (
              <View style={styles.profilePhotoFallback}>
                <Text style={styles.profilePhotoText}>{player.initials}</Text>
              </View>
            )}
            <Text style={styles.profileDetailsName}>{player.displayName}</Text>
            <Text style={styles.profileDetailsHandle}>@{player.handle}</Text>
            <Text style={styles.profileDetailsMeta}>
              {player.homeMarket} · {player.rating.display.toFixed(2)} Sand
              Rating
            </Text>
          </View>
          <View style={styles.detailFacts}>
            <View style={styles.detailFact}>
              <Text style={styles.detailFactValue}>
                {player.rating.display.toFixed(2)}
              </Text>
              <Text style={styles.detailFactLabel}>CURRENT</Text>
            </View>
            <View style={styles.detailFact}>
              <Text style={styles.detailFactValue}>
                {player.rating.percentile
                  ? String(player.rating.percentile) + "%"
                  : "—"}
              </Text>
              <Text style={styles.detailFactLabel}>PERCENTILE</Text>
            </View>
            <View style={styles.detailFact}>
              <Text style={styles.detailFactValue}>
                {settings?.sourceConnections.length ?? 0}
              </Text>
              <Text style={styles.detailFactLabel}>SOURCES</Text>
            </View>
          </View>
          <View style={styles.artworkCard}>
            <Text style={styles.eyebrow}>PROFILE + ARTWORK</Text>
            <Text style={styles.artworkTitle}>
              Keep your details and visuals current.
            </Text>
            <Text style={styles.artworkBody}>
              Your playing profile, evidence sources, portraits, and reviewed
              artwork all live together here.
            </Text>
            <View style={styles.artworkActions}>
              <Pressable
                disabled={mode === "preview"}
                onPress={() =>
                  void WebBrowser.openBrowserAsync(
                    dunaWebUrl + "/app/settings#playing-profile",
                  )
                }
                style={styles.primary}
              >
                <Text style={styles.primaryText}>Edit profile</Text>
              </Pressable>
              <Pressable
                disabled={mode === "preview"}
                onPress={() =>
                  void WebBrowser.openBrowserAsync(
                    dunaWebUrl + "/app/settings#player-artwork",
                  )
                }
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Artwork</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function ProfileHubScreen({
  onDestination,
  onOrganization,
}: {
  readonly onDestination: (
    destination: Exclude<HubDestination, "profile">,
  ) => void;
  readonly onOrganization: (organizationSlug: string) => void;
}) {
  const {
    dashboard,
    mode,
    organizationWallets,
    predictionWallet,
    settings,
    signOut,
    wallet,
  } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const [profileOpen, setProfileOpen] = useState(false);
  const actions: readonly {
    readonly key: HubDestination;
    readonly icon: string;
    readonly title: string;
    readonly body: string;
    readonly featured?: boolean;
  }[] = [
    {
      key: "profile",
      icon: "◎",
      title: "Profile",
      body:
        settings?.profile.onboardingStatus === "complete"
          ? "Details + artwork"
          : "Finish your details",
    },
    {
      key: "wallet",
      icon: "◇",
      title: "Wallet",
      body: money(wallet?.availableMinor ?? 0) + " available",
    },
    {
      key: "predictions",
      icon: "✦",
      title: "Predictions",
      body:
        Math.floor(predictionWallet?.availableCredits ?? 0).toLocaleString(
          "en-US",
        ) + " credits",
    },
    {
      key: "health",
      icon: "♥",
      title: "Health",
      body: "Private recovery",
    },
    {
      key: "performance",
      icon: "↗",
      title: "Performance",
      body: player.rating.display.toFixed(2) + " Sand Rating",
      featured: true,
    },
  ];

  const open = (destination: HubDestination) => {
    if (destination === "profile") {
      setProfileOpen(true);
      return;
    }
    onDestination(destination);
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.topEyebrow}>YOU + YOUR DUNA</Text>
        <Text style={styles.topTitle}>Everything about your game.</Text>
        <View style={styles.identity}>
          {player.avatarUrl ? (
            <Image
              source={{ uri: player.avatarUrl }}
              style={styles.identityPhoto}
            />
          ) : (
            <View style={styles.identityPhotoFallback}>
              <Text style={styles.identityPhotoText}>{player.initials}</Text>
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.identityName}>{player.displayName}</Text>
            <Text style={styles.identityMeta}>
              @{player.handle} · {player.homeMarket}
            </Text>
          </View>
          <Text style={styles.identityRating}>
            {player.rating.display.toFixed(2)}
          </Text>
        </View>

        <View style={styles.quickGrid}>
          {actions.map((action) => (
            <Pressable
              accessibilityLabel={"Open " + action.title}
              key={action.key}
              onPress={() => open(action.key)}
              style={({ pressed }) => [
                styles.quickCard,
                action.featured && styles.quickCardFeatured,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.quickIcon,
                  action.featured && styles.quickIconFeatured,
                ]}
              >
                <Text
                  style={[
                    styles.quickIconText,
                    action.featured && styles.quickTextFeatured,
                  ]}
                >
                  {action.icon}
                </Text>
              </View>
              <Text
                style={[
                  styles.quickTitle,
                  action.featured && styles.quickTextFeatured,
                ]}
              >
                {action.title}
              </Text>
              <Text
                style={[
                  styles.quickBody,
                  action.featured && styles.quickBodyFeatured,
                ]}
              >
                {action.body}
              </Text>
              <Text
                style={[
                  styles.quickArrow,
                  action.featured && styles.quickTextFeatured,
                ]}
              >
                →
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.eyebrow}>CLUBS + COACHES</Text>
            <Text style={styles.sectionTitle}>Your organizations.</Text>
          </View>
          <Text style={styles.sectionCount}>
            {organizationWallets?.length ?? 0}
          </Text>
        </View>
        <View style={styles.organizations}>
          {(organizationWallets ?? []).map((organization) => (
            <Pressable
              key={organization.organizationId}
              onPress={() => onOrganization(organization.organizationSlug)}
              style={styles.organization}
            >
              <View style={styles.organizationMark}>
                <Text style={styles.organizationMarkText}>
                  {organization.organizationName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.organizationName}>
                  {organization.organizationName}
                </Text>
                <Text style={styles.organizationMeta}>
                  {organization.membershipName ??
                    organization.membershipStatus ??
                    "Player relationship"}
                  {" · "}
                  {organization.credits.toLocaleString("en-US")} credits
                </Text>
              </View>
              <Text style={styles.organizationArrow}>›</Text>
            </Pressable>
          ))}
          {!organizationWallets?.length && (
            <View style={styles.organizationEmpty}>
              <Text style={styles.organizationName}>Find your next club.</Text>
              <Text style={styles.organizationMeta}>
                Search organizations, coaches, courts, and events in Discover.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.eyebrow}>SETTINGS</Text>
            <Text style={styles.sectionTitle}>The simple stuff.</Text>
          </View>
        </View>
        <View style={styles.settings}>
          {[
            ["Notifications", "#notifications"],
            ["Privacy + safety", "#privacy"],
            ["Language + units", "#profile"],
            ["Manage Duna+", "#membership"],
            ["Account + security", "#account"],
          ].map(([title, anchor]) => (
            <Pressable
              disabled={mode === "preview"}
              key={title}
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  dunaWebUrl + "/app/settings" + anchor,
                )
              }
              style={styles.setting}
            >
              <Text style={styles.settingText}>{title}</Text>
              <Text style={styles.settingArrow}>›</Text>
            </Pressable>
          ))}
          {signOut && (
            <Pressable onPress={() => void signOut()} style={styles.setting}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      <ProfileDetailsModal
        onClose={() => setProfileOpen(false)}
        visible={profileOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  artworkActions: { flexDirection: "row", gap: 9, marginTop: 18 },
  artworkBody: { color: "#706a60", fontSize: 15, lineHeight: 22, marginTop: 8 },
  artworkCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dfdfdc",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 22,
    padding: 18,
  },
  artworkTitle: {
    color: "#111719",
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 27,
    marginTop: 5,
  },
  close: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  closeText: { color: "#111719", fontSize: 30, lineHeight: 34 },
  detailFact: { alignItems: "center", flex: 1 },
  detailFactLabel: {
    color: "#777166",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 3,
  },
  detailFactValue: { color: "#111719", fontSize: 22, fontWeight: "800" },
  detailFacts: {
    backgroundColor: "#ffffff",
    borderColor: "#dfdfdc",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 18,
    paddingVertical: 18,
  },
  eyebrow: {
    color: "#203740",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  flex: { flex: 1, minWidth: 0 },
  identity: {
    alignItems: "center",
    borderBottomColor: "#dfddd7",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    paddingBottom: 18,
  },
  identityMeta: { color: "#777166", fontSize: 14, marginTop: 3 },
  identityName: { color: "#111719", fontSize: 20, fontWeight: "800" },
  identityPhoto: { borderRadius: 28, height: 56, width: 56 },
  identityPhotoFallback: {
    alignItems: "center",
    backgroundColor: "#e7e8e5",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  identityPhotoText: { color: "#203740", fontSize: 16, fontWeight: "800" },
  identityRating: {
    color: "#203740",
    fontSize: 24,
    fontWeight: "800",
  },
  modalContent: { padding: 20, paddingBottom: 48 },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: "#e1dfda",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalSafe: { backgroundColor: "#f7f5ef", flex: 1 },
  modalTitle: {
    color: "#111719",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 3,
  },
  organization: {
    alignItems: "center",
    borderBottomColor: "#ebe9e4",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 76,
    paddingHorizontal: 14,
  },
  organizationArrow: { color: "#777166", fontSize: 25 },
  organizationEmpty: { padding: 18 },
  organizationMark: {
    alignItems: "center",
    backgroundColor: "#e8e9e6",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  organizationMarkText: { color: "#203740", fontSize: 14, fontWeight: "900" },
  organizationMeta: { color: "#777166", fontSize: 13, marginTop: 3 },
  organizationName: { color: "#111719", fontSize: 16, fontWeight: "800" },
  organizations: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e2df",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  primary: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 14,
    flex: 1.3,
    justifyContent: "center",
    minHeight: 50,
  },
  primaryText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  profileDetailsHandle: { color: "#203740", fontSize: 16, marginTop: 3 },
  profileDetailsMeta: { color: "#777166", fontSize: 15, marginTop: 6 },
  profileDetailsName: {
    color: "#111719",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 12,
  },
  profileIdentity: { alignItems: "center" },
  profilePhoto: { borderRadius: 54, height: 108, width: 108 },
  profilePhotoFallback: {
    alignItems: "center",
    backgroundColor: "#e7e8e5",
    borderRadius: 54,
    height: 108,
    justifyContent: "center",
    width: 108,
  },
  profilePhotoText: { color: "#203740", fontSize: 28, fontWeight: "900" },
  quickArrow: { color: "#203740", fontSize: 21, marginTop: 16 },
  quickBody: { color: "#777166", fontSize: 13, marginTop: 4 },
  quickBodyFeatured: { color: "rgba(255,255,255,0.7)" },
  quickCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e2df",
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 166,
    padding: 15,
    width: "48.5%",
  },
  quickCardFeatured: { backgroundColor: "#203740", borderColor: "#203740" },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  quickIcon: {
    alignItems: "center",
    backgroundColor: "#eceeea",
    borderRadius: 18,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  quickIconFeatured: { backgroundColor: "rgba(255,255,255,0.14)" },
  quickIconText: { color: "#203740", fontSize: 17 },
  quickTextFeatured: { color: "#ffffff" },
  quickTitle: {
    color: "#111719",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 14,
  },
  screen: {
    backgroundColor: "#f7f5ef",
    padding: 20,
    paddingBottom: 150,
  },
  secondary: {
    alignItems: "center",
    borderColor: "#203740",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  secondaryText: { color: "#203740", fontSize: 14, fontWeight: "800" },
  sectionCount: { color: "#777166", fontSize: 15, fontWeight: "800" },
  sectionHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 34,
  },
  sectionTitle: {
    color: "#111719",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 4,
  },
  setting: {
    alignItems: "center",
    borderBottomColor: "#ebe9e4",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 15,
  },
  settingArrow: { color: "#777166", fontSize: 23 },
  settingText: { color: "#111719", flex: 1, fontSize: 15, fontWeight: "700" },
  settings: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e2df",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
  },
  signOut: { color: "#a54032", fontSize: 15, fontWeight: "800" },
  topEyebrow: {
    color: "#203740",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  topTitle: {
    color: "#111719",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.2,
    lineHeight: 38,
    marginTop: 7,
  },
});
