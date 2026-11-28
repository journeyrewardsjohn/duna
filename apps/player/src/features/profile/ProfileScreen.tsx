/**
 * The profile, rebuilt for discoverability (owner feedback 28 Nov, point 6:
 * "a ton of functionality, but it's not clear all the things that are in
 * there"). The person first, on a Night Court card: their photo or mark,
 * name, handle, home and Sand Rating, with Edit at the top right. Then four
 * named sections, each with its own brand-ground mark and one line saying
 * what is inside: Your game; Money and clubs; Settings and privacy; Get to
 * know Duna. Everything the old hub reached is still here: profile details
 * and artwork, wallet, predictions, health, Sand Rating and film, your
 * organisations, memberships and billing, notifications, data use, the web
 * settings (privacy, language, account) and sign out.
 */
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { demoPlayer } from "@duna/core/demo";
import {
  Icon,
  Numerals,
  Rally,
  Text,
  ThemeOverride,
  Title,
  useHaptics,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import { report } from "@duna/observability";
import * as WebBrowser from "expo-web-browser";
import { useState, type ReactNode } from "react";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { ProfileVideoSection } from "../../../video-studio";
import { useShell } from "../../app/ShellContext";
import { Card, Row, StatusChip, usePaneEdges } from "../../app/ui";
import { PersonAvatar } from "../../shared/PersonAvatar";
import { INTROS } from "../intro/intro-content";
import { useGroundColors } from "../intro/IntroArt";
import {
  DataUseSheet,
  NotificationsSheet,
  SubscriptionsSheet,
} from "./ProfileSheets";
import { PROFILE_SECTIONS, type ProfileSectionKey } from "./profile-sections";

function money(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(minor / 100);
}

/** A section's mark: its glyph on its brand ground. */
function SectionMark({ section }: { readonly section: ProfileSectionKey }) {
  const definition = PROFILE_SECTIONS[section];
  const ground = useGroundColors(definition.ground);
  const { tokens } = useTheme();
  return (
    <View
      style={[
        styles.mark,
        { backgroundColor: ground.fill, borderRadius: tokens.radius.lg },
      ]}
    >
      <Icon color={ground.ink} name={definition.icon} size="nav" />
    </View>
  );
}

function Section({
  section,
  children,
}: {
  readonly section: ProfileSectionKey;
  readonly children: ReactNode;
}) {
  const definition = PROFILE_SECTIONS[section];
  return (
    <View style={styles.section} testID={`profile-section-${section}`}>
      <View style={styles.sectionHead}>
        <SectionMark section={section} />
        <View style={styles.flex}>
          <Text accessibilityRole="header" variant="phone-heading">
            {definition.title}
          </Text>
          <Text tone="text-2" variant="phone-meta">
            {definition.summary}
          </Text>
        </View>
      </View>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

function HeroButton({
  label,
  icon,
  kind,
  onPress,
}: {
  readonly label: string;
  readonly icon?: GlyphName;
  readonly kind: "primary" | "quiet";
  readonly onPress: () => void;
}) {
  const { tokens } = useTheme();
  const haptics = useHaptics();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={4}
      onPress={() => {
        haptics.confirmed(0);
        onPress();
      }}
      style={({ pressed }) => [
        styles.heroButton,
        {
          borderRadius: tokens.radius.pill,
          backgroundColor: primary ? tokens.brand.dune : "transparent",
          borderColor: primary ? tokens.brand.dune : "rgba(244,242,236,0.4)",
          opacity: pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {icon ? (
        <Icon
          color={primary ? tokens.brand["night-court"] : tokens.brand.salt}
          name={icon}
          size="inline"
        />
      ) : null}
      <Text
        style={{
          color: primary ? tokens.brand["night-court"] : tokens.brand.salt,
        }}
        variant="phone-meta"
        weight={600}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfileScreen() {
  const runtime = usePlayerRuntime();
  const shell = useShell();
  const haptics = useHaptics();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const {
    dashboard,
    mode,
    organizationWallets,
    predictionWallet,
    settings,
    wallet,
  } = runtime;
  const player = dashboard?.player ?? demoPlayer;
  const preview = mode === "preview";
  const [sheet, setSheet] = useState<
    "notifications" | "data" | "subscriptions" | null
  >(null);
  const [failure, setFailure] = useState<string | null>(null);
  const detailsDone = settings?.profile.onboardingStatus === "complete";

  const openWeb = (anchor: string) =>
    void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/settings${anchor}`);

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
                report(error, { event: "player.profile.sign_out_failed" }),
              );
            });
          },
        },
      ],
    );
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.space["4"],
          paddingBottom: edges.bottom + tokens.space["12"],
          paddingLeft: edges.left + tokens.space["4"],
          paddingRight: edges.right + tokens.space["4"],
          gap: tokens.space["6"],
        }}
        style={{ backgroundColor: colors.ground }}
        testID="profile-screen"
      >
        {/* The person, on Night Court. */}
        <ThemeOverride theme="dark">
          <View
            style={[
              styles.hero,
              {
                backgroundColor: tokens.brand["night-court"],
                // A Dune edge keeps the card distinct on the dark ground.
                borderColor: "rgba(217,195,160,0.32)",
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: tokens.radius.xl,
                padding: tokens.space["5"],
              },
            ]}
            testID="profile-hero"
          >
            <View style={styles.heroTop}>
              <PersonAvatar
                label={`${player.displayName}'s photo`}
                name={player.displayName}
                photoUrl={player.avatarUrl}
                ring
                size={84}
              />
              <HeroButton
                icon="player"
                kind="primary"
                label="Edit"
                onPress={shell.editProfile}
              />
            </View>
            <View style={{ gap: tokens.space["1"] }}>
              <Title style={{ color: tokens.brand.salt }}>
                {player.displayName}
              </Title>
              <Text
                numberOfLines={1}
                style={{ color: tokens.brand.dune }}
                variant="phone-meta"
              >
                {`@${player.handle} · ${player.homeMarket}`}
              </Text>
            </View>
            <View style={styles.heroFacts}>
              <Pressable
                accessibilityLabel={`Sand Rating ${player.rating.display.toFixed(2)}. Opens your Sand Rating`}
                accessibilityRole="button"
                onPress={() => {
                  haptics.confirmed(0);
                  shell.open("performance");
                }}
                style={({ pressed }) => [
                  styles.fact,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Numerals style={{ color: tokens.brand.salt }} variant="figure">
                  {player.rating.display.toFixed(2)}
                </Numerals>
                <Text
                  style={{ color: tokens.brand.dune }}
                  variant="phone-meta"
                  weight={600}
                >
                  Sand Rating
                </Text>
              </Pressable>
              <View
                style={[
                  styles.factRule,
                  { backgroundColor: "rgba(244,242,236,0.18)" },
                ]}
              />
              <Pressable
                accessibilityLabel={`Wallet ${money(wallet?.availableMinor ?? 0)} available. Opens your wallet`}
                accessibilityRole="button"
                onPress={() => {
                  haptics.confirmed(0);
                  shell.open("wallet");
                }}
                style={({ pressed }) => [
                  styles.fact,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Numerals style={{ color: tokens.brand.salt }} variant="figure">
                  {money(wallet?.availableMinor ?? 0)}
                </Numerals>
                <Text
                  style={{ color: tokens.brand.dune }}
                  variant="phone-meta"
                  weight={600}
                >
                  Available
                </Text>
              </Pressable>
            </View>
            <View style={styles.heroActions}>
              <HeroButton
                icon="highlight"
                kind="quiet"
                label="Artwork"
                onPress={shell.openArtwork}
              />
              {!detailsDone ? (
                <HeroButton
                  icon="check"
                  kind="quiet"
                  label="Finish your details"
                  onPress={shell.editProfile}
                />
              ) : null}
            </View>
          </View>
        </ThemeOverride>

        {failure ? (
          <StatusChip
            icon="alert"
            label={`Sign out failed · ${failure}`}
            tone="danger"
            wash="danger-wash"
          />
        ) : null}

        <Rally>
          <Section section="game">
            <Row
              icon="rating"
              onPress={() => shell.open("performance")}
              summary={`${player.rating.display.toFixed(2)} now · what counts`}
              title="Sand Rating"
            />
            <Row
              icon="level"
              onPress={() => shell.open("insights")}
              summary="Form, partners and upsets"
              title="Performance in depth"
            />
            <Row
              icon="film"
              onPress={() => shell.open("video")}
              summary="Record, review and share your games"
              title="Film"
            />
            <Row
              icon="heart-rate"
              onPress={() => shell.open("health")}
              summary="Private readiness and recovery"
              title="Health"
            />
            <Row
              icon="whistle"
              onPress={() => shell.open("training")}
              summary="Programs and practice from your coach"
              title="Training"
            />
          </Section>

          <Section section="money">
            <Row
              icon="wallet"
              onPress={() => shell.open("wallet")}
              summary={`${money(wallet?.availableMinor ?? 0)} available · passes and credits`}
              title="Wallet"
            />
            <Row
              icon="member-card"
              onPress={preview ? undefined : () => setSheet("subscriptions")}
              summary={
                preview
                  ? "Off in this preview build"
                  : "Duna and club memberships, invoices"
              }
              title="Memberships and billing"
            />
            <Row
              icon="podium"
              onPress={() => shell.open("predictions")}
              summary={`${Math.floor(predictionWallet?.availableCredits ?? 0).toLocaleString("en-US")} credits on pro events`}
              title="Predictions"
            />
            {(organizationWallets ?? []).map((organization) => (
              <Row
                key={organization.organizationId}
                leading={
                  <PersonAvatar
                    name={organization.organizationName}
                    size={36}
                  />
                }
                onPress={() =>
                  shell.openOrganization(organization.organizationSlug)
                }
                summary={`${organization.membershipName ?? organization.membershipStatus ?? "Player"} · ${organization.credits.toLocaleString("en-US")} credits`}
                title={organization.organizationName}
              />
            ))}
            {!organizationWallets?.length ? (
              <Row
                icon="venue"
                onPress={() => shell.open("discover")}
                summary="Clubs, coaches and courts near you"
                title="Find your club"
              />
            ) : null}
          </Section>

          <Section section="settings">
            <Row
              icon="phone-bubble"
              onPress={preview ? undefined : () => setSheet("notifications")}
              summary={
                preview
                  ? "Off in this preview build"
                  : "Account notices and optional updates"
              }
              title="Notifications"
            />
            <Row
              icon="send"
              onPress={() => setSheet("data")}
              summary="Wi-Fi, cellular uploads and live video"
              title="Data use"
            />
            <Row
              icon="policy"
              onPress={preview ? undefined : () => openWeb("#privacy")}
              summary="Permissions and who sees what"
              title="Privacy and safety"
            />
            <Row
              icon="info"
              onPress={preview ? undefined : () => openWeb("#profile")}
              summary="Language and measurement"
              title="Language and units"
            />
            <Row
              icon="key"
              onPress={preview ? undefined : () => openWeb("#account")}
              summary="Sign-in and account access"
              title="Account and security"
            />
            <Row
              icon="you"
              onPress={() => shell.open("account")}
              summary="Organisations and appearance"
              title="Account"
            />
          </Section>

          <Section section="learn">
            <Row
              icon="highlight"
              onPress={() => shell.showIntro({ kind: "tour" })}
              summary="A short tour of every section"
              testID="profile-whats-in-duna"
              title="What's in Duna"
            />
            <ScrollView
              contentContainerStyle={{
                gap: tokens.space["2"],
                paddingHorizontal: tokens.space["2"],
              }}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {INTROS.map((intro) => (
                <IntroTile
                  key={intro.key}
                  onPress={() =>
                    shell.showIntro({ kind: "tour", start: intro.key })
                  }
                  title={intro.title}
                  ground={intro.ground}
                />
              ))}
            </ScrollView>
          </Section>
        </Rally>

        {/* The film you appear in, and your plan's recording use. */}
        <ThemeOverride theme="light">
          <ProfileVideoSection
            onOpenLibrary={() => shell.open("video")}
            runtime={runtime}
          />
        </ThemeOverride>

        {runtime.signOut ? (
          <Pressable
            accessibilityHint="Asks before signing out"
            accessibilityRole="button"
            onPress={confirmSignOut}
            style={({ pressed }) => [
              styles.signOut,
              {
                borderColor: colors.line,
                borderRadius: tokens.radius.xl,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Icon name="key" tone="danger" />
            <Text tone="danger" variant="phone-body" weight={600}>
              Sign out
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <SubscriptionsSheet
        onClose={() => setSheet(null)}
        visible={sheet === "subscriptions"}
      />
      <NotificationsSheet
        onClose={() => setSheet(null)}
        visible={sheet === "notifications"}
      />
      <DataUseSheet onClose={() => setSheet(null)} visible={sheet === "data"} />
    </>
  );
}

function IntroTile({
  title,
  ground,
  onPress,
}: {
  readonly title: string;
  readonly ground: (typeof INTROS)[number]["ground"];
  readonly onPress: () => void;
}) {
  const colors = useGroundColors(ground);
  const { tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityHint="Opens its intro"
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.introTile,
        {
          backgroundColor: colors.fill,
          borderRadius: tokens.radius.lg,
          opacity: pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={[styles.introDot, { backgroundColor: colors.accent }]} />
      <Text style={{ color: colors.ink }} variant="phone-meta" weight={600}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { gap: 16 },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  heroButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  heroFacts: { flexDirection: "row", alignItems: "stretch", gap: 16 },
  fact: { flex: 1, gap: 2, minHeight: 44 },
  factRule: { width: StyleSheet.hairlineWidth },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  section: { gap: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionCard: { paddingHorizontal: 0, paddingVertical: 4, gap: 0 },
  mark: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  introTile: {
    width: 132,
    minHeight: 88,
    padding: 12,
    justifyContent: "space-between",
    marginVertical: 8,
  },
  introDot: { width: 12, height: 12, borderRadius: 6 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
