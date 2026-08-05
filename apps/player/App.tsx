import { defaultEventMedia, formatMoney, formatVenueTime } from "@duna/core";
import {
  demoBookings,
  demoEvents,
  demoMatches,
  demoPeople,
  demoPlayer,
  demoWalletEntries,
} from "@duna/core/demo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  startDunaLiveActivity,
  updateDunaLiveActivity,
  type LiveActivityPushToken,
} from "./live-activities";
import { dunaWebUrl, type DunaApiClient } from "./mobile-api";
import {
  PlayerRuntimeProvider,
  usePlayerRuntime,
  type PlayerRuntime,
} from "./runtime";
import {
  clearPendingWatchScoreDraft,
  getPendingWatchScoreDraft,
  subscribeToWatchScoreDraft,
  type WatchScoreDraft,
} from "./watch-scoring";
import { VideoStudioScreen } from "./video-studio";
import { HealthScreen } from "./health-screen";

// Metro requires a static module reference so the campaign image ships in the native bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaCampaignRally = require("./assets/duna-campaign-rally.jpg");

type MobileCoach = NonNullable<PlayerRuntime["coaches"]>[number];
type OrganizationWallet = NonNullable<
  PlayerRuntime["organizationWallets"]
>[number];

const lightColors = {
  canvas: "#f8f7f3",
  ink: "#101828",
  depth: "#ffffff",
  navy: "#f1ece2",
  navyLift: "#e8eef7",
  bone: "#101828",
  muted: "#667085",
  aqua: "#235a96",
  aquaDeep: "#173a67",
  sand: "#d7bd91",
  flare: "#de6842",
  positive: "#2f7d57",
  warning: "#a86f18",
  danger: "#b84444",
  onAccent: "#ffffff",
  overlayRgb: "23,58,103",
  accentRgb: "35,90,150",
  warningRgb: "168,111,24",
  positiveRgb: "47,125,87",
  dangerRgb: "184,68,68",
  flareRgb: "222,104,66",
  inkRgb: "16,24,40",
  depthRgb: "255,255,255",
} as const;

type Palette = {
  readonly [Key in keyof typeof lightColors]: string;
};

const darkColors: Palette = {
  canvas: "#070b0d",
  ink: "#070b0d",
  depth: "#0c1418",
  navy: "#10242b",
  navyLift: "#17343d",
  bone: "#f3efe5",
  muted: "#aaa79e",
  aqua: "#63e3db",
  aquaDeep: "#1b9f9a",
  sand: "#c9a96c",
  flare: "#ff6a3d",
  positive: "#85d49b",
  warning: "#f7c86b",
  danger: "#f27878",
  onAccent: "#070b0d",
  overlayRgb: "255,255,255",
  accentRgb: "99,227,219",
  warningRgb: "247,200,107",
  positiveRgb: "133,212,155",
  dangerRgb: "242,120,120",
  flareRgb: "255,106,61",
  inkRgb: "7,11,13",
  depthRgb: "12,20,24",
};

type ThemeName = "light" | "dark";

let activePalette: Palette = lightColors;
const colors = new Proxy(lightColors, {
  get(_target, property: keyof Palette) {
    return activePalette[property];
  },
}) as Palette;

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

const ThemeContext = createContext<{
  readonly theme: ThemeName;
  readonly toggle: () => void;
}>({ theme: "light", toggle: () => undefined });

function ThemeButton() {
  const { theme, toggle } = useContext(ThemeContext);
  return (
    <Pressable
      accessibilityLabel={`Use ${theme === "light" ? "dark" : "light"} mode`}
      onPress={() => {
        selectionHaptic();
        toggle();
      }}
      style={styles.themeButton}
    >
      <Text style={styles.themeButtonText}>
        {theme === "light" ? "☾" : "☀"}
      </Text>
    </Pressable>
  );
}

type Tab = "home" | "discover" | "play" | "video" | "wallet" | "you" | "health";

type CourtInventory = Awaited<
  ReturnType<DunaApiClient["public"]["courtBookingInventory"]["query"]>
>;
type CourtAvailability = Awaited<
  ReturnType<DunaApiClient["public"]["courtAvailability"]["query"]>
>;
type ProEventDetail = Awaited<
  ReturnType<DunaApiClient["public"]["proEvent"]["query"]>
>;
type BookingParticipant = {
  readonly personId?: string;
  readonly name?: string;
  readonly email?: string;
  readonly phoneE164?: string;
};

const tabs: readonly {
  key: Tab;
  label: string;
  icon: string;
}[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "discover", label: "Discover", icon: "⌖" },
  { key: "play", label: "Play", icon: "◫" },
  { key: "video", label: "Video", icon: "◉" },
  { key: "wallet", label: "Wallet", icon: "$" },
  { key: "you", label: "You", icon: "◎" },
];

function displayError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : "Duna could not complete that request.";
}

function selectionHaptic() {
  if (Platform.OS !== "web")
    void Haptics.selectionAsync().catch(() => undefined);
}

function successHaptic() {
  if (Platform.OS !== "web") {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
  }
}

async function rememberLiveActivityToken(
  token: LiveActivityPushToken,
  client?: DunaApiClient,
) {
  await AsyncStorage.setItem(
    `duna.live-activity.${token.kind}.${token.subjectId}`,
    JSON.stringify({ ...token, recordedAt: new Date().toISOString() }),
  );
  if (!client) return;
  await client.player.registerLiveActivity.mutate({
    kind: token.kind,
    subjectId: token.subjectId,
    activityId: token.activityId,
    pushToken: token.pushToken,
    environment: __DEV__ ? "sandbox" : "production",
  });
}

function weatherSymbol(icon: string | undefined): string {
  if (icon === "clear" || icon === "mostly-clear") return "☀";
  if (icon === "partly-cloudy") return "🌤";
  if (icon === "rain" || icon === "drizzle") return "🌦";
  if (icon === "storm") return "⛈";
  if (icon === "snow") return "❄";
  if (icon === "fog") return "≋";
  return "☁";
}

function fahrenheit(celsius: number | undefined): string {
  return celsius === undefined ? "" : `${Math.round((celsius * 9) / 5 + 32)}°`;
}

function closestWeather<
  Point extends { readonly startsAt: string; readonly temperatureC?: number },
>(points: readonly Point[] | undefined, startsAt: string): Point | undefined {
  const timestamp = Date.parse(startsAt);
  return points
    ?.slice()
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - timestamp) -
        Math.abs(Date.parse(right.startsAt) - timestamp),
    )[0];
}

function PreviewBanner() {
  const { mode } = usePlayerRuntime();
  if (mode !== "preview") return null;
  return (
    <View style={styles.previewBanner}>
      <Text style={styles.previewBannerText}>
        PREVIEW DATA · SIGN-IN, BOOKINGS, AND PAYMENTS ARE DISABLED
      </Text>
    </View>
  );
}

function DunaWordmark({ pro = false }: { readonly pro?: boolean }) {
  return (
    <View style={styles.wordmark}>
      <View style={[styles.mark, pro && { borderColor: colors.warning }]}>
        <View style={styles.markArc} />
        <View
          style={[styles.markDot, pro && { backgroundColor: colors.aqua }]}
        />
      </View>
      <Text style={styles.wordmarkText}>DUNA</Text>
      {pro && <Text style={styles.proPill}>PRO</Text>}
    </View>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: string;
  readonly tone?: "neutral" | "positive" | "live" | "warning";
}) {
  const palette: Record<typeof tone, ViewStyle> = {
    neutral: {
      backgroundColor: rgba(colors.overlayRgb, 0.06),
      borderColor: rgba(colors.overlayRgb, 0.1),
    },
    positive: {
      backgroundColor: rgba(colors.positiveRgb, 0.1),
      borderColor: rgba(colors.positiveRgb, 0.25),
    },
    live: {
      backgroundColor: rgba(colors.flareRgb, 0.1),
      borderColor: rgba(colors.flareRgb, 0.3),
    },
    warning: {
      backgroundColor: rgba(colors.warningRgb, 0.1),
      borderColor: rgba(colors.warningRgb, 0.25),
    },
  };
  return (
    <View style={[styles.pill, palette[tone]]}>
      <Text
        style={[
          styles.pillText,
          tone === "positive" && { color: colors.positive },
          tone === "live" && { color: "#ff9a7a" },
          tone === "warning" && { color: colors.warning },
        ]}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}

function RatingOrbit({ compact = false }: { readonly compact?: boolean }) {
  const { dashboard } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  return (
    <View style={[styles.ratingOrbit, compact && styles.ratingOrbitCompact]}>
      <View
        style={[
          styles.ratingOrbitInner,
          compact && styles.ratingOrbitInnerCompact,
        ]}
      >
        <Text style={styles.ratingLabel}>SAND RATING</Text>
        <Text
          style={[styles.ratingValue, compact && styles.ratingValueCompact]}
        >
          {player.rating.display.toFixed(2)}
        </Text>
        <Text style={styles.ratingDelta}>
          {player.rating.delta && player.rating.delta > 0 ? "↗ +" : ""}
          {(player.rating.delta ?? 0).toFixed(2)}
        </Text>
      </View>
      <View style={styles.lockedLabel}>
        <Text style={styles.lockedText}>LOCKED</Text>
      </View>
    </View>
  );
}

function AppHeader({ eyebrow }: { readonly eyebrow?: string }) {
  const { dashboard, mode } = usePlayerRuntime();
  const initials = dashboard?.player.initials ?? demoPlayer.initials;
  return (
    <View style={styles.appHeader}>
      <View>
        <DunaWordmark />
        {eyebrow && <Text style={styles.headerEyebrow}>{eyebrow}</Text>}
      </View>
      <View style={styles.headerActions}>
        <ThemeButton />
        <Pressable accessibilityLabel="Ask Duna" style={styles.askButton}>
          <Text style={styles.askButtonText}>✦</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Notifications"
          style={styles.avatarButton}
        >
          <Text style={styles.avatarText}>{initials}</Text>
          {mode === "live" && <View style={styles.notificationDot} />}
        </Pressable>
      </View>
    </View>
  );
}

function coachInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function CoachCard({
  coach,
  preferred = false,
  onPress,
}: {
  readonly coach: MobileCoach;
  readonly preferred?: boolean;
  readonly onPress: (coach: MobileCoach) => void;
}) {
  return (
    <Pressable
      accessibilityHint={`Open ${coach.displayName}'s schedule and services`}
      accessibilityLabel={coach.displayName}
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic();
        onPress(coach);
      }}
      style={({ pressed }) => [
        styles.coachCard,
        preferred && styles.coachCardPreferred,
        pressed && styles.coachCardPressed,
      ]}
    >
      {coach.avatarUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: coach.avatarUrl }}
          style={styles.coachAvatar}
        />
      ) : (
        <View style={styles.coachAvatarFallback}>
          <Text style={styles.coachAvatarFallbackText}>
            {coachInitials(coach.displayName)}
          </Text>
        </View>
      )}
      <View style={styles.flex}>
        <View style={styles.coachCardTop}>
          <Text numberOfLines={1} style={styles.coachCardName}>
            {coach.displayName}
          </Text>
          {preferred && <Pill tone="positive">Your club</Pill>}
        </View>
        <Text numberOfLines={1} style={styles.coachCardOrganization}>
          {coach.organizationName}
        </Text>
        <Text numberOfLines={2} style={styles.coachCardMeta}>
          {coach.services.length > 0
            ? `${coach.services.length} way${coach.services.length === 1 ? "" : "s"} to train`
            : "New sessions coming soon"}
          {coach.upcomingSessions.length > 0
            ? ` · ${coach.upcomingSessions.length} upcoming`
            : ""}
        </Text>
      </View>
      <Text style={styles.coachCardArrow}>›</Text>
    </Pressable>
  );
}

function CoachProfileModal({
  coach,
  onClose,
}: {
  readonly coach?: MobileCoach;
  readonly onClose: () => void;
}) {
  if (!coach) return null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.coachModalHeader}>
          <View>
            <Text style={styles.eyebrow}>DUNA COACH</Text>
            <Text style={styles.coachModalHandle}>@{coach.handle}</Text>
          </View>
          <Pressable
            accessibilityLabel="Close coach profile"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.coachModalClose}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.coachModalContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.coachModalHero}>
            {coach.avatarUrl ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: coach.avatarUrl }}
                style={styles.coachModalAvatar}
              />
            ) : (
              <View style={styles.coachModalAvatarFallback}>
                <Text style={styles.coachModalAvatarText}>
                  {coachInitials(coach.displayName)}
                </Text>
              </View>
            )}
            <Text style={styles.coachModalName}>{coach.displayName}</Text>
            <Text style={styles.coachModalOrganization}>
              {coach.organizationName}
              {coach.homeMarket ? ` · ${coach.homeMarket}` : ""}
            </Text>
            <Text style={styles.coachModalBio}>
              {coach.bio ??
                `Book training and upcoming sessions with ${coach.displayName}.`}
            </Text>
          </View>

          <SectionHeader
            eyebrow="WAYS TO TRAIN"
            title="Choose what fits."
            action={`${coach.services.length} services`}
          />
          <View style={styles.coachServiceList}>
            {coach.services.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => {
                  selectionHaptic();
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/clubs/${coach.organizationSlug}/products/${service.slug}`,
                  );
                }}
                style={styles.coachServiceCard}
              >
                <Text style={styles.coachServiceType}>
                  {service.subtype.replaceAll("-", " ").toUpperCase()}
                </Text>
                <Text style={styles.coachServiceTitle}>{service.title}</Text>
                <Text numberOfLines={3} style={styles.coachServiceBody}>
                  {service.shortSummary ??
                    service.description ??
                    "See live availability and booking options."}
                </Text>
                <Text style={styles.coachServiceAction}>
                  View availability →
                </Text>
              </Pressable>
            ))}
            {coach.services.length === 0 && (
              <View style={styles.coachEmptyCard}>
                <Text style={styles.coachServiceTitle}>
                  New availability is coming.
                </Text>
                <Text style={styles.coachServiceBody}>
                  Follow {coach.organizationName} for the next published
                  session.
                </Text>
              </View>
            )}
          </View>

          {coach.upcomingSessions.length > 0 && (
            <>
              <SectionHeader
                eyebrow="ON THE CALENDAR"
                title={`Upcoming with ${coach.displayName}.`}
              />
              <View style={styles.listCard}>
                {coach.upcomingSessions.map((session) => (
                  <Pressable
                    key={session.id}
                    onPress={() => {
                      selectionHaptic();
                      void WebBrowser.openBrowserAsync(
                        `${dunaWebUrl}/events/${session.slug}`,
                      );
                    }}
                    style={styles.coachSessionRow}
                  >
                    <View style={styles.coachSessionDate}>
                      <Text style={styles.coachSessionMonth}>
                        {new Date(session.startsAt)
                          .toLocaleDateString("en-US", { month: "short" })
                          .toUpperCase()}
                      </Text>
                      <Text style={styles.coachSessionDay}>
                        {new Date(session.startsAt).getDate()}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>{session.title}</Text>
                      <Text style={styles.rowMeta}>
                        {new Date(session.startsAt).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "numeric",
                            minute: "2-digit",
                          },
                        )}
                        {session.venueName ? ` · ${session.venueName}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function MemberOrganizationCard({
  organization,
}: {
  readonly organization: OrganizationWallet;
}) {
  return (
    <View style={styles.memberOrganizationCard}>
      <View style={styles.memberOrganizationMark}>
        <Text style={styles.memberOrganizationMarkText}>
          {organization.organizationName.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.memberOrganizationEyebrow}>YOUR CLUB</Text>
        <Text style={styles.memberOrganizationName}>
          {organization.organizationName}
        </Text>
        <Text style={styles.memberOrganizationMeta}>
          {organization.membershipName
            ? `${organization.membershipName} · `
            : ""}
          {organization.credits.toLocaleString()} credits
        </Text>
      </View>
      <Text style={styles.memberOrganizationArrow}>›</Text>
    </View>
  );
}

function HomeScreen({
  onBook,
}: {
  readonly onBook: (eventIndex: number) => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  const {
    client,
    coaches,
    dashboard,
    organizationWallets,
    people: livePeople,
  } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const bookings = dashboard?.bookings ?? demoBookings;
  const events = dashboard?.events ?? demoEvents;
  const matches = dashboard?.recentMatches ?? demoMatches;
  const people = livePeople ?? demoPeople;
  const homeOrganization =
    organizationWallets?.find(
      (organization) =>
        organization.membershipStatus === "active" &&
        organization.status === "active",
    ) ??
    organizationWallets?.find(
      (organization) => organization.status === "active",
    ) ??
    organizationWallets?.[0];
  const isHomeOrganizationEvent = (event: (typeof events)[number]) =>
    Boolean(
      homeOrganization &&
      (event.organizationId === homeOrganization.organizationId ||
        event.organizationSlug === homeOrganization.organizationSlug),
    );
  const homeEvents = events.filter(isHomeOrganizationEvent);
  const exploreEvents = homeOrganization
    ? events.filter((event) => !isHomeOrganizationEvent(event))
    : events;
  const homeCoaches =
    coaches?.filter(
      (coach) => coach.organizationId === homeOrganization?.organizationId,
    ) ?? [];
  const nextBooking = bookings[0];
  const [liveActivityNotice, setLiveActivityNotice] = useState<string>();
  const [selectedCoach, setSelectedCoach] = useState<MobileCoach>();
  const metrics = dashboard?.metrics.slice(0, 4) ?? [
    { label: "Win rate", value: "61%" },
    { label: "Last 10", value: "8–2" },
    { label: "Rating change", value: "+0.14" },
    { label: "This week", value: "3" },
  ];
  const insight = dashboard?.feed[0];
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(new Date())
    .toUpperCase();
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader eyebrow={today.replace(", ", " · ")} />
        <ImageBackground
          imageStyle={styles.homeCampaignImage}
          source={dunaCampaignRally}
          style={[styles.homeCampaign, compact && styles.homeCampaignCompact]}
        >
          <View style={styles.homeCampaignWash} />
          <View style={styles.homeCampaignContent}>
            <Text style={styles.homeCampaignEyebrow}>YOUR GAME · TODAY</Text>
            <Text
              style={[
                styles.homeCampaignTitle,
                compact && styles.homeCampaignTitleCompact,
              ]}
            >
              Good morning,{`\n`}
              {player.displayName.split(" ")[0]}.
            </Text>
            <Text style={styles.homeCampaignSubtitle}>
              Your next game, latest movement, and everything happening around
              you.
            </Text>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/score`)
              }
              style={styles.homeCampaignAction}
            >
              <Text style={styles.homeCampaignActionText}>
                ＋ Record a match
              </Text>
            </Pressable>
          </View>
        </ImageBackground>
        {homeOrganization && (
          <MemberOrganizationCard organization={homeOrganization} />
        )}
        {homeEvents.length > 0 && (
          <>
            <SectionHeader
              eyebrow="FROM YOUR CLUB"
              title="Made for your membership."
              action="See club"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              {homeEvents.slice(0, 6).map((event) => (
                <EventCard
                  eventIndex={events.findIndex(
                    (candidate) => candidate.id === event.id,
                  )}
                  key={event.id}
                  onPress={onBook}
                />
              ))}
            </ScrollView>
          </>
        )}
        {homeCoaches.length > 0 && (
          <>
            <SectionHeader
              eyebrow="YOUR COACHES"
              title="Train with people you know."
              action={`${homeCoaches.length} coaches`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.coachCardRow}>
                {homeCoaches.map((coach) => (
                  <CoachCard
                    coach={coach}
                    key={coach.personId}
                    onPress={setSelectedCoach}
                    preferred
                  />
                ))}
              </View>
            </ScrollView>
          </>
        )}
        <View style={styles.heroGrid}>
          <View style={styles.ratingCard}>
            <View style={styles.cardTitleRow}>
              <View>
                <Text style={styles.eyebrow}>YOUR LEVEL</Text>
                <Text style={styles.cardTitle}>Built by every rally.</Text>
              </View>
              <Pill tone="positive">{player.rating.confidence}</Pill>
            </View>
            <RatingOrbit />
            <View style={styles.ratingStats}>
              <View>
                <Text style={styles.statValue}>
                  {player.rating.percentile
                    ? `${player.rating.percentile}%`
                    : "—"}
                </Text>
                <Text style={styles.statLabel}>Percentile</Text>
              </View>
              <View>
                <Text style={styles.statValue}>{player.homeMarket || "—"}</Text>
                <Text style={styles.statLabel}>Home market</Text>
              </View>
              <View>
                <Text style={styles.statValue}>{matches.length}</Text>
                <Text style={styles.statLabel}>Matches</Text>
              </View>
            </View>
          </View>
          <View style={styles.nextCard}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.eyebrow}>NEXT UP</Text>
              <Pill>Confirmed</Pill>
            </View>
            <Text style={styles.nextDate}>
              {nextBooking
                ? new Date(nextBooking.startsAt)
                    .toLocaleDateString("en-US", { weekday: "short" })
                    .toUpperCase()
                : "OPEN"}
            </Text>
            <Text style={styles.nextDay}>
              {nextBooking ? new Date(nextBooking.startsAt).getDate() : "—"}
            </Text>
            <Text style={styles.nextTitle}>
              {nextBooking?.title ?? "Nothing booked yet"}
            </Text>
            <Text style={styles.nextMeta}>
              {nextBooking
                ? `${new Date(nextBooking.startsAt).toLocaleTimeString(
                    "en-US",
                    {
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )} · ${nextBooking.venueName}`
                : "Discover a session built for your level"}
            </Text>
            <View style={styles.avatarStack}>
              {people.slice(0, 4).map((person) => (
                <View style={styles.miniAvatar} key={person.id}>
                  <Text style={styles.miniAvatarText}>{person.initials}</Text>
                </View>
              ))}
            </View>
            <Pressable style={styles.cardLink}>
              <Text style={styles.cardLinkText}>Open game thread →</Text>
            </Pressable>
            {Platform.OS === "ios" && nextBooking && (
              <Pressable
                onPress={() => {
                  selectionHaptic();
                  void startDunaLiveActivity(
                    {
                      subjectId: nextBooking.id,
                      kind: "upcoming",
                      title: nextBooking.title,
                      subtitle: `${new Date(
                        nextBooking.startsAt,
                      ).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })} · ${nextBooking.venueName}`,
                      status: "Upcoming",
                      startsAt: nextBooking.startsAt,
                    },
                    {
                      onPushToken: (token) => {
                        void rememberLiveActivityToken(token, client).catch(
                          () => undefined,
                        );
                      },
                    },
                  )
                    .then(() => {
                      successHaptic();
                      setLiveActivityNotice("Added to your Lock Screen.");
                    })
                    .catch((reason) => {
                      setLiveActivityNotice(displayError(reason));
                    });
                }}
                style={styles.liveActivityButton}
              >
                <Text style={styles.liveActivityButtonText}>
                  ◉ Keep on Lock Screen
                </Text>
              </Pressable>
            )}
            {liveActivityNotice && (
              <Text style={styles.liveActivityNotice}>
                {liveActivityNotice}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.metricStrip}>
          {metrics.map((metric) => (
            <View key={metric.label}>
              <Text style={styles.metricNumber}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
        <SectionHeader
          eyebrow={
            homeOrganization
              ? "EXPLORE BEYOND YOUR CLUB"
              : "MADE FOR YOUR LEVEL"
          }
          title={homeOrganization ? "Travel. Try something new." : "Play next."}
          action="See all"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalBleed}
        >
          {(exploreEvents.length > 0 ? exploreEvents : events)
            .slice(0, 4)
            .map((event) => (
              <EventCard
                eventIndex={events.findIndex(
                  (candidate) => candidate.id === event.id,
                )}
                key={event.id}
                onPress={onBook}
              />
            ))}
        </ScrollView>
        <SectionHeader
          eyebrow="RECENT FORM"
          title="Every result tells a story."
          action="Matches"
        />
        <View style={styles.listCard}>
          {matches.slice(0, 2).map((match) => (
            <View style={styles.matchRow} key={match.id}>
              <View
                style={[
                  styles.resultBadge,
                  {
                    backgroundColor:
                      match.winner === "A" ? colors.aqua : colors.danger,
                  },
                ]}
              >
                <Text style={styles.resultText}>
                  {match.winner === "A" ? "W" : "L"}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>
                  {match.teamA[0]?.displayName.split(" ")[0]} /{" "}
                  {match.teamA[1]?.displayName.split(" ")[0]}
                </Text>
                <Text style={styles.rowMeta}>
                  vs {match.teamB[0]?.displayName.split(" ")[0]} /{" "}
                  {match.teamB[1]?.displayName.split(" ")[0]} ·{" "}
                  {match.venueName}
                </Text>
              </View>
              <View style={styles.matchScore}>
                <Text style={styles.rowTitle}>
                  {match.score.map((set) => `${set[0]}–${set[1]}`).join("  ")}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.positive }]}>
                  +{match.ratingDelta?.toFixed(2)}
                </Text>
              </View>
            </View>
          ))}
        </View>
        {(insight || !dashboard) && (
          <View style={styles.aiInsight}>
            <View style={styles.aiIcon}>
              <Text style={styles.aiIconText}>✦</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>
                {insight?.eyebrow ?? "DUNA INSIGHT"}
              </Text>
              <Text style={styles.aiTitle}>
                {insight?.title ?? "Your sideout game is becoming an edge."}
              </Text>
              <Text style={styles.aiBody}>
                {insight?.body ??
                  "You are winning 8.4% more often than expected in sideout-scored matches. Preview insight only."}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
      <CoachProfileModal
        coach={selectedCoach}
        onClose={() => setSelectedCoach(undefined)}
      />
    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly action?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <Pressable>
          <Text style={styles.sectionAction}>{action} →</Text>
        </Pressable>
      )}
    </View>
  );
}

function EventCard({
  eventIndex,
  onPress,
}: {
  readonly eventIndex: number;
  readonly onPress: (eventIndex: number) => void;
}) {
  const { dashboard } = usePlayerRuntime();
  const event = (dashboard?.events ?? demoEvents)[eventIndex]!;
  const weather = closestWeather(event.weather?.hourly, event.startsAt);
  const imageUrl =
    event.imageUrl ??
    `${dunaWebUrl}${defaultEventMedia(event.kind, event.id).path}`;
  return (
    <Pressable
      onPress={() => {
        selectionHaptic();
        onPress(eventIndex);
      }}
      style={styles.eventCard}
    >
      <ImageBackground
        imageStyle={styles.eventArtImage}
        source={{ uri: imageUrl }}
        style={styles.eventArt}
      >
        <View style={styles.eventArtWash} />
        <View style={styles.eventBadges}>
          <Pill tone={event.live ? "live" : "neutral"}>
            {event.live ? "Live" : event.kind}
          </Pill>
        </View>
        <Text style={styles.eventArrow}>↗</Text>
      </ImageBackground>
      <View style={styles.eventBody}>
        <Text style={styles.eventTime}>
          {formatVenueTime(event.startsAt, event.timezone, "en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </Text>
        <Text numberOfLines={2} style={styles.eventTitle}>
          {event.title}
        </Text>
        <Text numberOfLines={1} style={styles.eventMeta}>
          {event.venueName}
        </Text>
        {weather && (
          <Text style={styles.eventWeather}>
            {weatherSymbol(weather.icon)} {fahrenheit(weather.temperatureC)}
            {weather.precipitationProbability !== undefined
              ? ` · ${Math.round(weather.precipitationProbability)}% rain`
              : ""}
          </Text>
        )}
        <View style={styles.eventFooter}>
          <Text style={styles.eventPrice}>
            {event.price.amountMinor
              ? formatMoney(event.price.amountMinor, "USD")
              : "FREE"}
          </Text>
          <Text style={styles.eventSpots}>{event.spotsRemaining} spots</Text>
        </View>
      </View>
    </Pressable>
  );
}

function localDateValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function localSlotTime(value: string): string {
  const [hourValue = "0", minuteValue = "00"] = value.slice(11, 16).split(":");
  const hour = Number(hourValue);
  return `${hour % 12 || 12}:${minuteValue} ${hour >= 12 ? "pm" : "am"}`;
}

function contactPhoneE164(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return undefined;
}

function VenueBookingModal({
  venueId,
  visible,
  onClose,
}: {
  readonly venueId?: string;
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { client, mode, people, refresh } = usePlayerRuntime();
  const [inventory, setInventory] = useState<CourtInventory>();
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [selectedDate, setSelectedDate] = useState(() =>
    localDateValue(new Date()),
  );
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [selectedSlot, setSelectedSlot] =
    useState<CourtAvailability["slots"][number]>();
  const [paymentMode, setPaymentMode] = useState<"full" | "split">("full");
  const [participants, setParticipants] = useState<BookingParticipant[]>([]);
  const [contactOptions, setContactOptions] = useState<BookingParticipant[]>(
    [],
  );
  const [manualName, setManualName] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyRead, setPolicyRead] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const selectedDateAnchor = new Date(`${selectedDate}T12:00:00`);
  const todayValue = localDateValue(new Date());
  const dates = Array.from({ length: 11 }, (_, index) => {
    const date = new Date(selectedDateAnchor);
    date.setDate(selectedDateAnchor.getDate() + index - 4);
    return date;
  });
  const durations = [
    ...new Set(
      inventory?.courts.flatMap((court) => court.durationOptionsMinutes) ?? [
        60, 90, 120,
      ],
    ),
  ].sort((left, right) => left - right);
  const selectedCourt = inventory?.courts.find(
    (court) => court.id === selectedSlot?.courtId,
  );
  const policy = selectedCourt?.cancellationPolicy;
  const policyReady =
    policyAccepted && (!policy?.requireFullScroll || policyRead);
  const totalMinor = selectedSlot?.price?.amountMinor ?? 0;
  const shareMinor =
    paymentMode === "split"
      ? Math.ceil(totalMinor / Math.max(1, participants.length + 1))
      : totalMinor;
  const selectedForecastDay = availability?.forecast?.days.find(
    (day) => day.date === selectedDate,
  );

  useEffect(() => {
    if (!visible || !venueId || !client) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void client.public.courtBookingInventory
      .query({ venueId })
      .then((nextInventory) => {
        if (cancelled) return;
        setInventory(nextInventory);
        const options = [
          ...new Set(
            nextInventory.courts.flatMap(
              (court) => court.durationOptionsMinutes,
            ),
          ),
        ];
        setDurationMinutes(options.includes(90) ? 90 : (options[0] ?? 60));
      })
      .catch((reason) => {
        if (!cancelled) setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, venueId, visible]);

  useEffect(() => {
    if (!visible || !venueId || !client || !inventory) return;
    let cancelled = false;
    setLoading(true);
    setSelectedSlot(undefined);
    setPolicyAccepted(false);
    setPolicyRead(false);
    void client.public.courtAvailability
      .query({
        venueId,
        date: selectedDate,
        durationMinutes,
      })
      .then((nextAvailability) => {
        if (!cancelled) setAvailability(nextAvailability);
      })
      .catch((reason) => {
        if (!cancelled) setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, durationMinutes, inventory, selectedDate, venueId, visible]);

  function addParticipant(participant: BookingParticipant) {
    const key =
      participant.personId ?? participant.email ?? participant.phoneE164;
    if (
      !key ||
      participants.some(
        (item) =>
          (item.personId ?? item.email ?? item.phoneE164)?.toLowerCase() ===
          key.toLowerCase(),
      )
    ) {
      return;
    }
    setParticipants((current) => [...current, participant]);
  }

  function addManualParticipant() {
    const value = manualTarget.trim();
    const email = value.includes("@") ? value.toLowerCase() : undefined;
    const phoneE164 = email ? undefined : contactPhoneE164(value);
    if (!email && !phoneE164) {
      setError("Enter an email address or a mobile number with country code.");
      return;
    }
    addParticipant({
      name: manualName.trim() || undefined,
      email,
      phoneE164,
    });
    setManualName("");
    setManualTarget("");
    setError(undefined);
  }

  async function importContacts() {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Contacts permission was not granted.");
        return;
      }
      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
        pageSize: 40,
        sort: Contacts.SortTypes.UserDefault,
      });
      const options = result.data
        .map((contact) => {
          const email = contact.emails?.[0]?.email?.trim().toLowerCase();
          const phoneE164 = contactPhoneE164(contact.phoneNumbers?.[0]?.number);
          return {
            name: contact.name || undefined,
            email: email || undefined,
            phoneE164,
          } satisfies BookingParticipant;
        })
        .filter((contact) => contact.email || contact.phoneE164)
        .slice(0, 20);
      setContactOptions(options);
      setNotice(
        "Contacts stay on this device. Duna receives only people you add.",
      );
    } catch (reason) {
      setError(displayError(reason));
    }
  }

  async function createAlert() {
    if (!client || !venueId || mode === "preview") return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.player.createAvailabilityAlert.mutate({
        venueId,
        targetDate: selectedDate,
        durationMinutes,
        earliestMinute: 0,
        latestMinute: 1_440,
        channel: "push",
      });
      setNotice(
        result.premiumRequired
          ? "Your free priority alert is active. Duna+ unlocks additional simultaneous alerts."
          : "Priority alert created. We’ll notify you when a matching court opens.",
      );
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!client || !selectedSlot || !policyReady || mode === "preview") {
      return;
    }
    if (paymentMode === "split" && participants.length === 0) {
      setError("Add at least one player before splitting the payment.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.player.startCourtCheckout.mutate({
        courtId: selectedSlot.courtId,
        localStartsAt: selectedSlot.localStartsAt.slice(0, 16),
        durationMinutes,
        paymentMode,
        participants,
        policyAccepted,
        policyFullScrollConfirmed: policyRead || !policy?.requireFullScroll,
        successUrl: `${dunaWebUrl}/app?court_checkout=success`,
        cancelUrl: `${dunaWebUrl}/app?court_checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.checkoutUrl) {
        await WebBrowser.openBrowserAsync(result.checkoutUrl);
      }
      if (result.mode === "free" || result.checkoutUrl) {
        successHaptic();
        await refresh();
        setNotice(
          paymentMode === "split"
            ? "Your share is ready. Duna sent each invited player their secure link."
            : "The court is reserved.",
        );
      } else {
        setError("That court is no longer available. Pick another time.");
      }
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <ScrollView
          contentContainerStyle={styles.modalContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.modalHeader}>
            <Pressable
              onPress={
                selectedSlot ? () => setSelectedSlot(undefined) : onClose
              }
            >
              <Text style={styles.closeText}>{selectedSlot ? "‹" : "×"}</Text>
            </Pressable>
            <Text style={styles.modalHeaderTitle}>
              {selectedSlot ? "Review" : "Book a court"}
            </Text>
            <ThemeButton />
          </View>
          {inventory && (
            <>
              <Text style={styles.bookingVenueName}>
                {inventory.venue.name}
              </Text>
              <Text style={styles.checkoutMeta}>
                {inventory.venue.city} · {inventory.venue.organizationName}
              </Text>
            </>
          )}
          {!selectedSlot ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalBleed}
              >
                <View style={styles.bookingDateRow}>
                  {dates.map((date) => {
                    const value = localDateValue(date);
                    const active = value === selectedDate;
                    const unavailable = value < todayValue;
                    return (
                      <Pressable
                        disabled={unavailable}
                        key={value}
                        onPress={() => {
                          selectionHaptic();
                          setSelectedDate(value);
                        }}
                        style={[
                          styles.bookingDate,
                          active && styles.bookingDateActive,
                          unavailable && styles.bookingDateUnavailable,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bookingDateDay,
                            active && styles.bookingDateTextActive,
                          ]}
                        >
                          {date
                            .toLocaleDateString("en-US", { weekday: "short" })
                            .toUpperCase()}
                        </Text>
                        <Text
                          style={[
                            styles.bookingDateNumber,
                            active && styles.bookingDateTextActive,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.bookingDurationRow}>
                {durations.map((duration) => (
                  <Pressable
                    key={duration}
                    onPress={() => {
                      selectionHaptic();
                      setDurationMinutes(duration);
                    }}
                    style={[
                      styles.bookingDuration,
                      duration === durationMinutes &&
                        styles.bookingDurationActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bookingDurationText,
                        duration === durationMinutes &&
                          styles.bookingDurationTextActive,
                      ]}
                    >
                      {duration} min
                    </Text>
                  </Pressable>
                ))}
              </View>
              {selectedForecastDay && (
                <View style={styles.bookingWeather}>
                  <Text style={styles.bookingWeatherIcon}>
                    {weatherSymbol(selectedForecastDay.icon)}
                  </Text>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>
                      {selectedForecastDay.condition} ·{" "}
                      {fahrenheit(selectedForecastDay.temperatureHighC)}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {selectedForecastDay.sunriseAt
                        ? `Sunrise ${formatVenueTime(
                            selectedForecastDay.sunriseAt,
                            availability?.timezone ?? "UTC",
                            "en-US",
                            { hour: "numeric", minute: "2-digit" },
                          )}`
                        : "Sunrise pending"}
                      {" · "}
                      {selectedForecastDay.sunsetAt
                        ? `Sunset ${formatVenueTime(
                            selectedForecastDay.sunsetAt,
                            availability?.timezone ?? "UTC",
                            "en-US",
                            { hour: "numeric", minute: "2-digit" },
                          )}`
                        : "Sunset pending"}
                    </Text>
                  </View>
                  <Text style={styles.bookingWeatherUpdated}>
                    Updated{" "}
                    {availability?.forecast
                      ? formatVenueTime(
                          availability.forecast.updatedAt,
                          availability.timezone,
                          "en-US",
                          { hour: "numeric", minute: "2-digit" },
                        )
                      : ""}
                  </Text>
                </View>
              )}
              {loading ? (
                <Text style={styles.bookingEmpty}>Finding open courts…</Text>
              ) : availability?.slots.length ? (
                <View style={styles.bookingSlotGrid}>
                  {availability.slots.map((slot) => (
                    <Pressable
                      key={`${slot.courtId}-${slot.startsAt}`}
                      onPress={() => {
                        selectionHaptic();
                        setSelectedSlot(slot);
                      }}
                      style={styles.bookingSlot}
                    >
                      <Text style={styles.bookingSlotTime}>
                        {localSlotTime(slot.localStartsAt)}
                      </Text>
                      <Text numberOfLines={1} style={styles.bookingSlotCourt}>
                        {slot.courtName}
                      </Text>
                      {slot.weather && (
                        <Text style={styles.bookingSlotWeather}>
                          {weatherSymbol(slot.weather.icon)}{" "}
                          {fahrenheit(slot.weather.temperatureC)}
                        </Text>
                      )}
                      <Text style={styles.bookingSlotPrice}>
                        {slot.price
                          ? formatMoney(
                              slot.price.amountMinor,
                              slot.price.currency,
                            )
                          : "Free"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.bookingEmptyCard}>
                  <Text style={styles.rowTitle}>
                    No matching court is open.
                  </Text>
                  <Text style={styles.bodyText}>
                    Create a priority alert and Duna will watch cancellations
                    and newly released inventory.
                  </Text>
                </View>
              )}
              {Boolean(availability?.excludedAfterDarkCount) && (
                <Text style={styles.bookingDaylightNote}>
                  ☾ {availability?.excludedAfterDarkCount} start
                  {availability?.excludedAfterDarkCount === 1 ? "" : "s"} hidden
                  because this court is not lit after dark.
                </Text>
              )}
              <Pressable
                disabled={busy || mode === "preview"}
                onPress={() => void createAlert()}
                style={styles.bookingAlertButton}
              >
                <Text style={styles.bookingAlertIcon}>♢</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>Priority alert</Text>
                  <Text style={styles.rowMeta}>
                    One active alert is included. Duna+ unlocks more.
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.bookingReviewCard}>
                <Text style={styles.bookingReviewDate}>
                  {new Date(selectedSlot.startsAt).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
                <Text style={styles.bookingReviewTime}>
                  {localSlotTime(selectedSlot.localStartsAt)} –{" "}
                  {localSlotTime(selectedSlot.localEndsAt)}
                </Text>
                <Text style={styles.checkoutMeta}>
                  {selectedSlot.courtName} · {durationMinutes} minutes
                </Text>
              </View>
              <View style={styles.purchaseKindRow}>
                {(["full", "split"] as const).map((modeOption) => (
                  <Pressable
                    key={modeOption}
                    onPress={() => setPaymentMode(modeOption)}
                    style={[
                      styles.purchaseKindButton,
                      paymentMode === modeOption &&
                        styles.purchaseKindButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.purchaseKindText,
                        paymentMode === modeOption &&
                          styles.purchaseKindTextActive,
                      ]}
                    >
                      {modeOption === "full"
                        ? `Pay everything · ${formatMoney(totalMinor, "USD")}`
                        : `Pay your part · ${formatMoney(shareMinor, "USD")}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.checkoutSection}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.rowTitle}>Add players</Text>
                    <Text style={styles.rowMeta}>
                      Frequent partners first. Invite any group size.
                    </Text>
                  </View>
                  <Pressable onPress={() => void importContacts()}>
                    <Text style={styles.linkText}>Contacts</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.bookingPartnerScroll}
                >
                  <View style={styles.bookingPartnerRow}>
                    {people?.slice(0, 6).map((person) => (
                      <Pressable
                        key={person.id}
                        onPress={() =>
                          addParticipant({
                            personId: person.id,
                            name: person.displayName,
                          })
                        }
                        style={styles.bookingPartner}
                      >
                        <Text style={styles.bookingPartnerAvatar}>
                          {person.initials}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={styles.bookingPartnerName}
                        >
                          {person.displayName.split(" ")[0]}
                        </Text>
                      </Pressable>
                    ))}
                    {contactOptions.map((contact) => (
                      <Pressable
                        key={contact.email ?? contact.phoneE164}
                        onPress={() => addParticipant(contact)}
                        style={styles.bookingPartner}
                      >
                        <Text style={styles.bookingPartnerAvatar}>
                          {(contact.name ?? "C").slice(0, 1).toUpperCase()}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={styles.bookingPartnerName}
                        >
                          {contact.name ?? "Contact"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <View style={styles.bookingManualInvite}>
                  <TextInput
                    onChangeText={setManualName}
                    placeholder="Name"
                    placeholderTextColor={colors.muted}
                    style={[styles.formInput, styles.formRowInput]}
                    value={manualName}
                  />
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setManualTarget}
                    placeholder="Email or mobile"
                    placeholderTextColor={colors.muted}
                    style={[styles.formInput, styles.formRowInput]}
                    value={manualTarget}
                  />
                  <Pressable
                    onPress={addManualParticipant}
                    style={styles.bookingAddButton}
                  >
                    <Text style={styles.payButtonText}>Add</Text>
                  </Pressable>
                </View>
                {participants.map((participant, index) => (
                  <View
                    key={
                      participant.personId ??
                      participant.email ??
                      participant.phoneE164
                    }
                    style={styles.bookingParticipant}
                  >
                    <Text style={styles.checkText}>✓</Text>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>
                        {participant.name ??
                          participant.email ??
                          participant.phoneE164}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {paymentMode === "split"
                          ? `Pays ${formatMoney(shareMinor, "USD")}`
                          : "Included in your reservation"}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setParticipants((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Text style={styles.closeText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              {policy && (
                <View style={styles.checkoutSection}>
                  <Text style={styles.rowTitle}>{policy.title}</Text>
                  <Text style={styles.rowMeta}>
                    Refund until {policy.refundBeforeHours ?? 0} hours before ·{" "}
                    {policy.lateCancellation}
                  </Text>
                  <ScrollView
                    nestedScrollEnabled
                    onScroll={({ nativeEvent }) => {
                      const atEnd =
                        nativeEvent.layoutMeasurement.height +
                          nativeEvent.contentOffset.y >=
                        nativeEvent.contentSize.height - 12;
                      if (atEnd) setPolicyRead(true);
                    }}
                    scrollEventThrottle={16}
                    style={styles.bookingPolicyScroll}
                  >
                    <Text style={styles.bodyText}>{policy.markdown}</Text>
                  </ScrollView>
                  <Pressable
                    onPress={() => setPolicyAccepted((current) => !current)}
                    style={styles.toggleRow}
                  >
                    <Text style={styles.rowTitle}>
                      I read and accept this policy
                    </Text>
                    <Pill tone={policyAccepted ? "positive" : "neutral"}>
                      {policyAccepted ? "Accepted" : "Required"}
                    </Pill>
                  </Pressable>
                  {policy.requireFullScroll && !policyRead && (
                    <Text style={styles.formError}>
                      Scroll to the end of the policy to continue.
                    </Text>
                  )}
                </View>
              )}
              <Pressable
                disabled={
                  busy ||
                  mode === "preview" ||
                  !policyReady ||
                  (paymentMode === "split" && participants.length === 0) ||
                  !inventory?.venue.paymentsReady
                }
                onPress={() => void checkout()}
                style={[
                  styles.payButton,
                  (busy ||
                    mode === "preview" ||
                    !policyReady ||
                    (paymentMode === "split" && participants.length === 0) ||
                    !inventory?.venue.paymentsReady) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.payButtonText}>
                  {busy
                    ? "Opening secure checkout…"
                    : `Continue · ${formatMoney(shareMinor, "USD")}`}
                </Text>
              </Pressable>
            </>
          )}
          {notice && <Text style={styles.bookingNotice}>{notice}</Text>}
          {error && <Text style={styles.formError}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ProTourModal({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { client, proCoverage } = usePlayerRuntime();
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [event, setEvent] = useState<ProEventDetail>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [followedMatchId, setFollowedMatchId] = useState<string>();
  const [followNotice, setFollowNotice] = useState<string>();
  const events = proCoverage?.events ?? [];

  useEffect(() => {
    if (!visible || selectedSlug || events.length === 0) return;
    setSelectedSlug(
      events.find((candidate) => candidate.live)?.slug ?? events[0]?.slug,
    );
  }, [events, selectedSlug, visible]);

  useEffect(() => {
    if (!visible || !selectedSlug || !client) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void client.public.proEvent
      .query({ slug: selectedSlug })
      .then((nextEvent) => {
        if (!cancelled) setEvent(nextEvent);
      })
      .catch((reason) => {
        if (!cancelled) setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, selectedSlug, visible]);

  useEffect(() => {
    if (!visible) return;
    void AsyncStorage.getItem("duna.followed-pro-match").then((value) => {
      setFollowedMatchId(value ?? undefined);
    });
  }, [visible]);

  useEffect(() => {
    if (!event || !followedMatchId) return;
    const followed = event.matches.find(
      (candidate) => candidate.id === followedMatchId,
    );
    if (!followed) return;
    const latestSet = followed.sets.at(-1);
    void updateDunaLiveActivity({
      subjectId: followed.id,
      kind: "match",
      title: event.name,
      subtitle: event.location ?? "Beach Pro Tour",
      status:
        followed.status === "live"
          ? "Live"
          : followed.status === "completed"
            ? "Final"
            : "Upcoming",
      teamA: followed.teamA.label,
      teamB: followed.teamB.label,
      scoreA: latestSet?.a ?? 0,
      scoreB: latestSet?.b ?? 0,
      setLabel: `Set ${Math.max(followed.sets.length, 1)}`,
    }).catch(() => undefined);
  }, [event, followedMatchId]);

  const followMatch = async (match: ProEventDetail["matches"][number]) => {
    const latestSet = match.sets.at(-1);
    await startDunaLiveActivity(
      {
        subjectId: match.id,
        kind: "match",
        title: event?.name ?? "Beach Pro Tour",
        subtitle: event?.location ?? "Live on Duna",
        status:
          match.status === "live"
            ? "Live"
            : match.status === "completed"
              ? "Final"
              : "Upcoming",
        teamA: match.teamA.label,
        teamB: match.teamB.label,
        scoreA: latestSet?.a ?? 0,
        scoreB: latestSet?.b ?? 0,
        setLabel: `Set ${Math.max(match.sets.length, 1)}`,
      },
      {
        onPushToken: (token) => {
          void rememberLiveActivityToken(token, client).catch(() => undefined);
        },
      },
    );
    await AsyncStorage.setItem("duna.followed-pro-match", match.id);
    setFollowedMatchId(match.id);
    setFollowNotice(
      match.status === "live"
        ? "Live updates are on your Lock Screen."
        : "You’ll have this match ready on your Lock Screen.",
    );
    successHaptic();
  };

  if (!visible) return null;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.proTourHeader}>
          <View>
            <Text style={styles.eyebrow}>FIVB + BEACH PRO TOUR</Text>
            <Text style={styles.proTourTitle}>Pro Tour</Text>
          </View>
          <Pressable
            accessibilityLabel="Close Pro Tour"
            onPress={onClose}
            style={styles.proTourClose}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.proTourContent}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalBleed}
          >
            <View style={styles.proEventPicker}>
              {events.map((candidate) => (
                <Pressable
                  key={candidate.id}
                  onPress={() => {
                    selectionHaptic();
                    setEvent(undefined);
                    setSelectedSlug(candidate.slug);
                  }}
                  style={[
                    styles.proEventPickerCard,
                    candidate.slug === selectedSlug &&
                      styles.proEventPickerCardActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.proEventPickerStatus,
                      candidate.live && styles.proLiveText,
                    ]}
                  >
                    {candidate.live ? "● LIVE" : candidate.status.toUpperCase()}
                  </Text>
                  <Text numberOfLines={2} style={styles.proEventPickerName}>
                    {candidate.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {candidate.location ?? "Location pending"} ·{" "}
                    {candidate.genderCategory}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {loading && !event && (
            <Text style={styles.bookingEmpty}>
              Loading live tournament desk…
            </Text>
          )}
          {error && <Text style={styles.formError}>{error}</Text>}
          {event && (
            <>
              <View style={styles.proEventHero}>
                <View style={styles.eventBadges}>
                  <Pill tone={event.live ? "live" : "neutral"}>
                    {event.live ? "Live now" : event.status}
                  </Pill>
                  <Pill>{event.category ?? "FIVB"}</Pill>
                </View>
                <Text style={styles.proEventHeroTitle}>{event.name}</Text>
                <Text style={styles.proEventHeroMeta}>
                  {event.location ?? "Location pending"} · {event.teamCount}{" "}
                  teams · {event.matches.length}/{event.matchCount} matches
                </Text>
                <Text style={styles.proEventUpdated}>
                  Updated{" "}
                  {new Date(event.lastSyncedAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                {followNotice && (
                  <Text style={styles.liveActivityNotice}>{followNotice}</Text>
                )}
              </View>

              <SectionHeader
                eyebrow={`${event.bracket.length} ROUNDS`}
                title="Championship bracket."
              />
              {event.bracket.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.horizontalBleed}
                >
                  <View style={styles.proBracket}>
                    {event.bracket.map((round) => (
                      <View key={round.key} style={styles.proBracketRound}>
                        <Text style={styles.proBracketRoundTitle}>
                          {round.label.toUpperCase()}
                        </Text>
                        <View style={styles.proBracketRoundMatches}>
                          {round.matches.map((match) => (
                            <View key={match.id} style={styles.proBracketMatch}>
                              <View style={styles.proBracketTeam}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.proBracketTeamName,
                                    match.winnerSide === "A" &&
                                      styles.proBracketWinner,
                                  ]}
                                >
                                  {match.teamA.label}
                                </Text>
                                <Text style={styles.proBracketScore}>
                                  {match.sets.map((set) => set.a).join(" · ") ||
                                    "—"}
                                </Text>
                              </View>
                              <View style={styles.proBracketTeam}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.proBracketTeamName,
                                    match.winnerSide === "B" &&
                                      styles.proBracketWinner,
                                  ]}
                                >
                                  {match.teamB.label}
                                </Text>
                                <Text style={styles.proBracketScore}>
                                  {match.sets.map((set) => set.b).join(" · ") ||
                                    "—"}
                                </Text>
                              </View>
                              <Text style={styles.proBracketPrediction}>
                                {match.status === "live"
                                  ? "● LIVE"
                                  : `${match.prediction.teamA.toFixed(0)}% · ${
                                      match.prediction.basis
                                    }`}
                              </Text>
                              {Platform.OS === "ios" &&
                                match.status !== "completed" && (
                                  <Pressable
                                    onPress={() => {
                                      selectionHaptic();
                                      void followMatch(match).catch((reason) =>
                                        setFollowNotice(displayError(reason)),
                                      );
                                    }}
                                    style={[
                                      styles.proFollowButton,
                                      followedMatchId === match.id &&
                                        styles.proFollowButtonActive,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.proFollowButtonText,
                                        followedMatchId === match.id &&
                                          styles.proFollowButtonTextActive,
                                      ]}
                                    >
                                      {followedMatchId === match.id
                                        ? "Following on Lock Screen"
                                        : match.status === "live"
                                          ? "Follow live"
                                          : "Notify + follow"}
                                    </Text>
                                  </Pressable>
                                )}
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <View style={styles.bookingEmptyCard}>
                  <Text style={styles.rowTitle}>
                    Bracket seeds are still taking shape.
                  </Text>
                  <Text style={styles.bodyText}>
                    Pool standings and completed matches update here as the
                    official feed reports them.
                  </Text>
                </View>
              )}

              {event.pools.length > 0 && (
                <>
                  <SectionHeader
                    eyebrow={`${event.pools.length} POOLS`}
                    title="Pool standings."
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.horizontalBleed}
                  >
                    <View style={styles.proPoolRow}>
                      {event.pools.map((pool) => (
                        <View key={pool.name} style={styles.proPoolCard}>
                          <Text style={styles.proPoolTitle}>{pool.name}</Text>
                          {pool.standings.slice(0, 5).map((standing, index) => (
                            <View
                              key={standing.team.key}
                              style={styles.proPoolStanding}
                            >
                              <Text style={styles.proPoolPlace}>
                                {index + 1}
                              </Text>
                              <Text
                                numberOfLines={1}
                                style={styles.proPoolTeam}
                              >
                                {standing.team.label}
                              </Text>
                              <Text style={styles.proPoolRecord}>
                                {standing.wins}–{standing.losses}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function DiscoverScreen({
  onBook,
}: {
  readonly onBook: (eventIndex: number) => void;
}) {
  const [filter, setFilter] = useState("For you");
  const [search, setSearch] = useState("");
  const [bookingVenueId, setBookingVenueId] = useState<string>();
  const [selectedCoach, setSelectedCoach] = useState<MobileCoach>();
  const [showProTour, setShowProTour] = useState(false);
  const { coaches, dashboard, organizationWallets, proCoverage, venues } =
    usePlayerRuntime();
  const events = dashboard?.events ?? demoEvents;
  const query = search.trim().toLowerCase();
  const homeOrganization =
    organizationWallets?.find(
      (organization) =>
        organization.membershipStatus === "active" &&
        organization.status === "active",
    ) ??
    organizationWallets?.find(
      (organization) => organization.status === "active",
    ) ??
    organizationWallets?.[0];
  const isHomeOrganizationEvent = (event: (typeof events)[number]) =>
    Boolean(
      homeOrganization &&
      (event.organizationId === homeOrganization.organizationId ||
        event.organizationSlug === homeOrganization.organizationSlug),
    );
  const filteredEvents = events
    .filter((event) => {
      if (
        query &&
        ![
          event.title,
          event.venueName,
          event.organizationName,
          event.kind,
          ...event.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      if (filter === "Today") {
        return (
          new Date(event.startsAt).toDateString() === new Date().toDateString()
        );
      }
      if (filter === "Tournaments") return event.kind === "tournament";
      if (filter === "Training") {
        return ["clinic", "private-lesson"].includes(event.kind);
      }
      if (filter === "Open play") {
        return ["open-play", "pickup"].includes(event.kind);
      }
      if (filter === "Free") return event.price.amountMinor === 0;
      return true;
    })
    .sort(
      (left, right) =>
        Number(isHomeOrganizationEvent(right)) -
        Number(isHomeOrganizationEvent(left)),
    );
  const homeEvents = filteredEvents.filter(isHomeOrganizationEvent);
  const networkEvents = homeOrganization
    ? filteredEvents.filter((event) => !isHomeOrganizationEvent(event))
    : filteredEvents;
  const matchingCoaches = (coaches ?? [])
    .filter((coach) => {
      if (!query) return true;
      return [
        coach.displayName,
        coach.handle,
        coach.organizationName,
        coach.homeMarket ?? "",
        ...coach.services.map((service) => service.title),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort(
      (left, right) =>
        Number(right.organizationId === homeOrganization?.organizationId) -
        Number(left.organizationId === homeOrganization?.organizationId),
    );
  const homeCoaches = matchingCoaches.filter(
    (coach) => coach.organizationId === homeOrganization?.organizationId,
  );
  const networkCoaches = homeOrganization
    ? matchingCoaches.filter(
        (coach) => coach.organizationId !== homeOrganization.organizationId,
      )
    : matchingCoaches;
  const resultCount = filteredEvents.length;
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          eyebrow={
            venues?.[0]
              ? `${venues[0].city.toUpperCase()} · ${venues[0].region.toUpperCase()}`
              : "SOUTH BAY · LOS ANGELES"
          }
        />
        <Text style={styles.displayTitle}>Find your game.</Text>
        {homeOrganization && (
          <MemberOrganizationCard organization={homeOrganization} />
        )}
        <Pressable
          onPress={() => {
            selectionHaptic();
            setShowProTour(true);
          }}
          style={styles.proTourEntry}
        >
          <View style={styles.flex}>
            <Text style={styles.proTourEntryEyebrow}>
              {proCoverage?.events.some((event) => event.live)
                ? "● LIVE PRO TOUR"
                : "PRO TOUR"}
            </Text>
            <Text style={styles.proTourEntryTitle}>
              Pools, real brackets, predictions.
            </Text>
            <Text style={styles.proTourEntryMeta}>
              {proCoverage?.events[0]?.name ??
                "Follow the world’s best beach volleyball."}
            </Text>
          </View>
          <Text style={styles.proTourEntryArrow}>↗</Text>
        </Pressable>
        <View style={styles.searchField}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            onChangeText={setSearch}
            placeholder="Events, programs, clubs, coaches…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={search}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalBleed}
        >
          <View style={styles.filterRow}>
            {[
              "For you",
              "Today",
              "Tournaments",
              "Training",
              "Open play",
              "Free",
            ].map((item) => (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[
                  styles.filterChip,
                  filter === item && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === item && styles.filterTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        {homeCoaches.length > 0 && (
          <>
            <SectionHeader
              eyebrow="YOUR CLUB · COACHES"
              title="Start with people you know."
              action={`${homeCoaches.length} coaches`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.coachCardRow}>
                {homeCoaches.map((coach) => (
                  <CoachCard
                    coach={coach}
                    key={coach.personId}
                    onPress={setSelectedCoach}
                    preferred
                  />
                ))}
              </View>
            </ScrollView>
          </>
        )}
        {homeEvents.length > 0 && (
          <>
            <SectionHeader
              eyebrow="YOUR CLUB · INCLUDED + PREFERRED"
              title="Your membership, first."
              action={`${homeEvents.length} events`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              {homeEvents.map((event) => (
                <EventCard
                  eventIndex={events.findIndex(
                    (candidate) => candidate.id === event.id,
                  )}
                  key={event.id}
                  onPress={onBook}
                />
              ))}
            </ScrollView>
          </>
        )}
        {venues && venues.length > 0 && (
          <>
            <SectionHeader
              eyebrow="LIVE COURT INVENTORY"
              title="Book a court."
              action={`${venues.length} venues`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.bookingVenueRow}>
                {venues.map((venue) => (
                  <Pressable
                    key={venue.id}
                    onPress={() => setBookingVenueId(venue.id)}
                    style={styles.bookingVenueCard}
                  >
                    <Text style={styles.bookingVenueEyebrow}>
                      {venue.city.toUpperCase()} · {venue.region.toUpperCase()}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={styles.bookingVenueCardTitle}
                    >
                      {venue.name}
                    </Text>
                    <Text style={styles.bookingVenueAction}>
                      See times <Text>→</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}
        <View style={styles.mapCard}>
          <View style={styles.mapWater} />
          <View style={styles.mapShore} />
          {[
            ["14%", "28%", "5"],
            ["52%", "46%", "3"],
            ["72%", "64%", "14"],
            ["40%", "73%", "8"],
          ].map((pin) => (
            <View
              key={pin[0]}
              style={[
                styles.mapPin,
                { left: pin[0] as `${number}%`, top: pin[1] as `${number}%` },
              ]}
            >
              <Text style={styles.mapPinText}>{pin[2]}</Text>
            </View>
          ))}
          <View style={styles.mapLabel}>
            <Text style={styles.mapLabelTitle}>
              {resultCount} {resultCount === 1 ? "thing" : "things"} to do
            </Text>
            <Text style={styles.mapLabelText}>
              across {venues?.length ?? 0} published venues
            </Text>
          </View>
        </View>
        <SectionHeader
          eyebrow={`${filter.toUpperCase()} · ${networkEvents.length} RESULTS`}
          title={homeOrganization ? "Explore beyond your club." : "Around you."}
          action="Map"
        />
        <View style={styles.eventGrid}>
          {networkEvents.map((event) => {
            const eventIndex = events.findIndex(
              (candidate) => candidate.id === event.id,
            );
            return (
              <EventCard
                eventIndex={eventIndex}
                key={event.id}
                onPress={onBook}
              />
            );
          })}
          {networkEvents.length === 0 && (
            <View style={styles.coachEmptyCard}>
              <Text style={styles.coachServiceTitle}>
                Nothing else matches yet.
              </Text>
              <Text style={styles.coachServiceBody}>
                Your club results stay above. Try a broader search to explore
                the wider Duna network.
              </Text>
            </View>
          )}
        </View>
        {networkCoaches.length > 0 && (
          <>
            <SectionHeader
              eyebrow="COACHES ACROSS DUNA"
              title="Find a different perspective."
              action={`${networkCoaches.length} coaches`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.coachCardRow}>
                {networkCoaches.map((coach) => (
                  <CoachCard
                    coach={coach}
                    key={coach.personId}
                    onPress={setSelectedCoach}
                  />
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </ScrollView>
      <VenueBookingModal
        onClose={() => setBookingVenueId(undefined)}
        venueId={bookingVenueId}
        visible={Boolean(bookingVenueId)}
      />
      <ProTourModal
        onClose={() => setShowProTour(false)}
        visible={showProTour}
      />
      <CoachProfileModal
        coach={selectedCoach}
        onClose={() => setSelectedCoach(undefined)}
      />
    </>
  );
}

function PlayScreen() {
  const { dashboard } = usePlayerRuntime();
  const bookings = dashboard?.bookings ?? demoBookings;
  const events = dashboard?.events ?? demoEvents;
  const [showHost, setShowHost] = useState(false);
  const [hostedTitle, setHostedTitle] = useState<string>();
  const today = new Date();
  const monday = new Date(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - mondayOffset);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
  const weekLabel = `${weekDays[0]!.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${weekDays[6]!.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`.toUpperCase();
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader eyebrow="YOUR CALENDAR + COMMUNITY" />
        <View style={styles.homeGreeting}>
          <Text style={styles.displayTitle}>Play.</Text>
          <Pressable
            onPress={() => setShowHost(true)}
            style={styles.scoreAction}
          >
            <Text style={styles.scoreActionText}>＋ Host pickup</Text>
          </Pressable>
        </View>
        {hostedTitle && (
          <View style={styles.successBanner}>
            <Text style={styles.successIcon}>✓</Text>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{hostedTitle} is live.</Text>
              <Text style={styles.rowMeta}>
                Eligible nearby players can now discover it.
              </Text>
            </View>
            <Pressable onPress={() => setHostedTitle(undefined)}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.weekCard}>
          <View style={styles.cardTitleRow}>
            <View>
              <Text style={styles.eyebrow}>{weekLabel}</Text>
              <Text style={styles.cardTitle}>Your week</Text>
            </View>
            <Text style={styles.sectionAction}>Calendar →</Text>
          </View>
          <View style={styles.weekDays}>
            {weekDays.map((date) => {
              const isToday = date.toDateString() === today.toDateString();
              const hasBooking = bookings.some(
                (booking) =>
                  new Date(booking.startsAt).toDateString() ===
                  date.toDateString(),
              );
              return (
                <View
                  key={date.toISOString()}
                  style={[styles.weekDay, isToday && styles.weekDayActive]}
                >
                  <Text
                    style={[
                      styles.weekDayLabel,
                      isToday && styles.weekDayTextActive,
                    ]}
                  >
                    {date
                      .toLocaleDateString("en-US", { weekday: "narrow" })
                      .toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.weekDayNumber,
                      isToday && styles.weekDayTextActive,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {hasBooking && (
                    <View
                      style={[
                        styles.weekDot,
                        isToday && { backgroundColor: colors.ink },
                      ]}
                    />
                  )}
                </View>
              );
            })}
          </View>
          {bookings.map((booking, index) => (
            <View style={styles.bookingRow} key={booking.id}>
              <View style={styles.bookingTime}>
                <Text style={styles.bookingTimeMain}>
                  {new Date(booking.startsAt)
                    .toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                    .replace(/\s[AP]M$/, "")}
                </Text>
                <Text style={styles.bookingTimeSuffix}>
                  {new Date(booking.startsAt)
                    .toLocaleTimeString("en-US", { hour: "numeric" })
                    .slice(-2)}
                </Text>
              </View>
              <View
                style={[
                  styles.bookingAccent,
                  {
                    backgroundColor:
                      index % 2 === 1 ? colors.flare : colors.aqua,
                  },
                ]}
              />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{booking.title}</Text>
                <Text style={styles.rowMeta}>{booking.venueName}</Text>
              </View>
              <Pill
                tone={
                  booking.status === "needs-action" ? "warning" : "positive"
                }
              >
                {booking.status}
              </Pill>
            </View>
          ))}
        </View>
        <SectionHeader
          eyebrow="PICKUP NEARBY"
          title="Jump into something."
          action="See all"
        />
        <View style={styles.listCard}>
          {events
            .filter(
              (event) => event.kind === "pickup" || event.kind === "open-play",
            )
            .map((event) => (
              <View key={event.id} style={styles.pickupRow}>
                <View style={styles.pickupDate}>
                  <Text style={styles.pickupDay}>
                    {new Date(event.startsAt)
                      .toLocaleDateString("en-US", { weekday: "short" })
                      .toUpperCase()}
                  </Text>
                  <Text style={styles.pickupNumber}>
                    {new Date(event.startsAt).getDate()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{event.title}</Text>
                  <Text style={styles.rowMeta}>
                    {event.venueName} ·{" "}
                    {(event.ratingRange?.[0] ?? 1).toFixed(1)}–
                    {(event.ratingRange?.[1] ?? 7).toFixed(1)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.pickupSpots}>{event.spotsRemaining}</Text>
                  <Text style={styles.rowMeta}>spots</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            ))}
        </View>
        <View style={styles.hostCard}>
          <View style={styles.hostMark}>
            <Text style={styles.hostMarkText}>＋</Text>
          </View>
          <Text style={styles.sectionTitle}>Your court. Your people.</Text>
          <Text style={styles.bodyText}>
            Publish a pickup with a clear time, format, level, and price.
            Eligible nearby players can discover it immediately.
          </Text>
          <Pressable
            onPress={() => setShowHost(true)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Host pickup</Text>
          </Pressable>
        </View>
      </ScrollView>
      <PickupModal
        onClose={() => setShowHost(false)}
        onCreated={(title) => {
          setHostedTitle(title);
          setShowHost(false);
        }}
        visible={showHost}
      />
    </>
  );
}

function WalletScreen() {
  const { mode, settings, wallet } = usePlayerRuntime();
  const entries = wallet?.entries ?? demoWalletEntries;
  const balance =
    wallet?.availableMinor ??
    entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0);
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="STRIPE-MANAGED BALANCE" />
      <Text style={styles.displayTitle}>Wallet.</Text>
      <View style={styles.walletCard}>
        <View style={styles.walletTop}>
          <DunaWordmark />
          <Pill tone={wallet?.pendingMinor ? "warning" : "positive"}>
            {wallet?.pendingMinor ? "Pending" : "Ready"}
          </Pill>
        </View>
        <Text style={styles.walletLabel}>AVAILABLE BALANCE</Text>
        <Text style={styles.walletBalance}>
          {formatMoney(balance, wallet?.currency ?? "USD")}
        </Text>
        <Text style={styles.walletMeta}>
          Held and moved by Stripe · Duna is not a bank
        </Text>
        <View style={styles.walletActions}>
          <Pressable
            disabled={mode === "preview"}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/wallet`)
            }
          >
            <Text style={styles.walletActionText}>Add money</Text>
          </Pressable>
          <Pressable
            disabled={mode === "preview"}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/wallet`)
            }
          >
            <Text style={styles.walletActionText}>Withdraw</Text>
          </Pressable>
        </View>
        <View style={styles.walletWave} />
      </View>
      <View style={styles.walletInfoGrid}>
        <View>
          <Text style={styles.eyebrow}>MEMBERSHIP</Text>
          <Text style={styles.cardTitle}>
            {settings?.membership?.tierName ?? "Duna+"}
          </Text>
          <Text style={styles.bodyText}>
            {settings?.membership
              ? `${settings.membership.status} · ${settings.membership.interval}`
              : "No active membership"}
          </Text>
        </View>
        <View>
          <Text style={styles.eyebrow}>PENDING</Text>
          <Text style={styles.cardTitle}>
            {formatMoney(wallet?.pendingMinor ?? 0, wallet?.currency ?? "USD")}
          </Text>
          <Text style={styles.bodyText}>Payment is still processing</Text>
        </View>
      </View>
      <SectionHeader
        eyebrow="YOUR MONEY ON SAND"
        title="Activity."
        action="Statements"
      />
      <View style={styles.listCard}>
        {entries.map((entry) => (
          <View style={styles.walletRow} key={entry.id}>
            <View
              style={[
                styles.moneyDirection,
                {
                  backgroundColor:
                    entry.amount.amountMinor > 0
                      ? rgba(colors.positiveRgb, 0.1)
                      : rgba(colors.overlayRgb, 0.06),
                },
              ]}
            >
              <Text
                style={{
                  color:
                    entry.amount.amountMinor > 0
                      ? colors.positive
                      : colors.muted,
                }}
              >
                {entry.amount.amountMinor > 0 ? "↓" : "↑"}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{entry.description}</Text>
              <Text style={styles.rowMeta}>
                {new Date(entry.occurredAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {entry.status}
              </Text>
            </View>
            <Text
              style={[
                styles.moneyAmount,
                entry.amount.amountMinor > 0 && { color: colors.positive },
              ]}
            >
              {entry.amount.amountMinor > 0 ? "+" : ""}
              {formatMoney(entry.amount.amountMinor, entry.amount.currency)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.trustNote}>
        <Text style={styles.trustIcon}>◇</Text>
        <Text style={styles.bodyText}>
          Your wallet is a Stripe-managed financial account. Duna shows the
          ledger and gives you clear controls; funds never sit on Duna’s balance
          sheet.
        </Text>
      </View>
    </ScrollView>
  );
}

function ProfileScreen({ onHealth }: { readonly onHealth: () => void }) {
  const { dashboard, mode, settings, signOut } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const matches = dashboard?.recentMatches ?? demoMatches;
  const profileMetrics = dashboard?.metrics.slice(0, 4) ?? [
    { label: "Current band", value: "A" },
    { label: "Home market", value: player.homeMarket },
    { label: "Matches", value: String(matches.length) },
    { label: "Confidence", value: player.rating.confidence },
  ];
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="YOUR PUBLIC PLAYER IDENTITY" />
      <View style={styles.profileHero}>
        <View style={styles.profileIdentity}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{player.initials}</Text>
          </View>
          <View>
            <Pill tone={settings?.membership ? "positive" : "neutral"}>
              {settings?.membership?.tierName ?? "Player"}
            </Pill>
            {settings?.dunaPlus.kind === "complimentary" && (
              <Pill tone="positive">Complimentary Duna+</Pill>
            )}
            <Text style={styles.profileName}>{player.displayName}</Text>
            <Text style={styles.profileHandle}>
              @{player.handle} · {player.homeMarket}
            </Text>
          </View>
        </View>
        <RatingOrbit compact />
      </View>
      <View style={styles.profileSetupCard}>
        <View style={styles.profileSetupTop}>
          <View style={styles.profileSetupMark}>
            <Text style={styles.profileSetupMarkText}>✦</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>PRIVATE PLAYER SETUP</Text>
            <Text style={styles.cardTitle}>
              {settings?.profile.onboardingStatus === "complete"
                ? "Your playing profile is ready."
                : "Tell Duna how you play."}
            </Text>
          </View>
          <Pill
            tone={
              settings?.profile.onboardingStatus === "complete"
                ? "positive"
                : "warning"
            }
          >
            {settings?.profile.onboardingStatus.replaceAll("-", " ") ??
              "not started"}
          </Pill>
        </View>
        <Text style={styles.bodyText}>
          Use guided voice or the editable form for legal identity, playing
          experience, height, and VolleyballLife or BVBInfo history.
        </Text>
        <View style={styles.profileSetupStatus}>
          <Text style={styles.rowMeta}>
            Stripe Identity:{" "}
            {settings?.identityVerification.status.replaceAll("-", " ") ??
              "not started"}
          </Text>
          <Text style={styles.rowMeta}>
            Match sources: {settings?.sourceConnections.length ?? 0}
          </Text>
        </View>
        <Pressable
          disabled={mode === "preview"}
          onPress={() =>
            void WebBrowser.openBrowserAsync(
              settings?.profile.onboardingStatus === "complete"
                ? `${dunaWebUrl}/app/settings#playing-profile`
                : `${dunaWebUrl}/app/onboarding`,
            )
          }
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {settings?.profile.onboardingStatus === "complete"
              ? "Review player details"
              : "Start guided setup"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.metricStrip}>
        {profileMetrics.map((metric) => (
          <View key={metric.label}>
            <Text style={styles.metricNumber}>{metric.value}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.progressCard}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.eyebrow}>LAST 12 MONTHS</Text>
            <Text style={styles.cardTitle}>Rating progression</Text>
          </View>
          <Pill tone="positive">
            {player.rating.delta
              ? `${player.rating.delta > 0 ? "+" : ""}${player.rating.delta.toFixed(2)}`
              : player.rating.confidence}
          </Pill>
        </View>
        {mode === "preview" ? (
          <>
            <View style={styles.mobileChart}>
              <View
                style={[styles.chartPoint, { left: "3%", bottom: "18%" }]}
              />
              <View
                style={[styles.chartPoint, { left: "26%", bottom: "31%" }]}
              />
              <View
                style={[styles.chartPoint, { left: "49%", bottom: "45%" }]}
              />
              <View
                style={[styles.chartPoint, { left: "72%", bottom: "61%" }]}
              />
              <View
                style={[styles.chartPoint, { left: "94%", bottom: "79%" }]}
              />
              <View style={styles.chartLine} />
            </View>
            <View style={styles.chartLabels}>
              <Text>Aug</Text>
              <Text>Nov</Text>
              <Text>Feb</Text>
              <Text>May</Text>
              <Text>Jul</Text>
            </View>
          </>
        ) : (
          <Text style={styles.bodyText}>
            Duna will chart your verified rating history here as connected match
            results accumulate.
          </Text>
        )}
      </View>
      {mode === "preview" && (
        <>
          <View style={styles.chemistryCard}>
            <Text style={styles.eyebrow}>PARTNER CHEMISTRY</Text>
            <Text style={styles.sectionTitle}>You make each other better.</Text>
            <View style={styles.chemistryPartner}>
              <View style={styles.miniAvatar}>
                <Text style={styles.miniAvatarText}>TP</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Theo Park</Text>
                <Text style={styles.rowMeta}>
                  27 shared matches · 68% win rate
                </Text>
              </View>
              <Text style={[styles.statValue, { color: colors.positive }]}>
                +0.14
              </Text>
            </View>
          </View>
          <SectionHeader eyebrow="EARNED ON SAND" title="Moments." />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalBleed}
          >
            <View style={styles.achievementRow}>
              {[
                ["◇", "Summer Open winner", "Jul 2026"],
                ["✦", "Reliable → Locked", "Rating milestone"],
                ["◎", "Pickup regular", "25 runs"],
              ].map((item) => (
                <View style={styles.achievementCard} key={item[1]}>
                  <Text style={styles.achievementIcon}>{item[0]}</Text>
                  <Text style={styles.rowTitle}>{item[1]}</Text>
                  <Text style={styles.rowMeta}>{item[2]}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      )}
      <Pressable
        accessibilityHint="Opens your private Apple Health performance timeline"
        accessibilityLabel="Open Duna Health"
        onPress={() => {
          selectionHaptic();
          onHealth();
        }}
        style={styles.healthProfileCard}
      >
        <View style={styles.healthProfileTop}>
          <View style={styles.healthProfileMark}>
            <Text style={styles.healthProfileMarkText}>♥</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>PRIVATE PERFORMANCE CONTEXT</Text>
            <Text style={styles.healthProfileTitle}>Health</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
        <Text style={styles.bodyText}>
          Connect selected Apple Health signals, compare recovery with your
          matches, and align heart rate with Duna Vision.
        </Text>
        <View style={styles.healthProfileSignals}>
          <Text style={styles.healthProfileSignal}>☾ SLEEP</Text>
          <Text style={styles.healthProfileSignal}>♥ HEART</Text>
          <Text style={styles.healthProfileSignal}>↗ LOAD</Text>
          <Text style={styles.healthProfileSignal}>◇ PRIVATE</Text>
        </View>
      </Pressable>
      <View style={styles.profileMenu}>
        {[
          ["Player details + identity", "#playing-profile"],
          ["Household + guardians", "#household"],
          ["Family wallets", "#family-wallets"],
          ["Notifications", "#notifications"],
          ["Privacy + safety", "#privacy"],
          ["Language + units", "#profile"],
          ["Manage Duna+", "#membership"],
          ["Delete my account", "#privacy"],
        ].map(([item, anchor]) => (
          <Pressable
            disabled={mode === "preview"}
            key={item}
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `${dunaWebUrl}/app/settings${anchor}`,
              )
            }
            style={styles.profileMenuRow}
          >
            <Text
              style={[
                styles.rowTitle,
                item === "Delete my account" && { color: colors.danger },
              ]}
            >
              {item}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
        {signOut && (
          <Pressable
            onPress={() => void signOut()}
            style={styles.profileMenuRow}
          >
            <Text style={[styles.rowTitle, { color: colors.danger }]}>
              Sign out
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function BookingModal({
  eventIndex,
  onClose,
}: {
  readonly eventIndex: number | null;
  readonly onClose: () => void;
}) {
  const { client, dashboard, mode, refresh, settings } = usePlayerRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState<{
    readonly title: string;
    readonly body: string;
    readonly label: string;
  }>();
  const [purchaseKind, setPurchaseKind] = useState<"entry" | "ticket">("entry");
  const [divisionId, setDivisionId] = useState<string>();
  const [ticketTypeId, setTicketTypeId] = useState<string>();
  const events = dashboard?.events ?? demoEvents;
  const player = dashboard?.player ?? demoPlayer;
  const event = eventIndex === null ? null : events[eventIndex];
  if (!event) return null;
  const selectedEvent = event;
  const division =
    event.divisions?.find((candidate) => candidate.id === divisionId) ??
    event.divisions?.[0];
  const ticket =
    event.tickets?.find((candidate) => candidate.id === ticketTypeId) ??
    event.tickets?.[0];
  const listedPrice =
    purchaseKind === "ticket"
      ? (ticket?.price ?? event.price)
      : (division?.price ?? event.price);
  const selectedTeamSize =
    division?.teamSize ??
    {
      solo: 1,
      doubles: 2,
      "three-person": 3,
      "four-person": 4,
      "six-person": 6,
    }[division?.teamFormat ?? "solo"];
  const requiresGuidedCheckout =
    purchaseKind === "ticket" ||
    selectedTeamSize > 1 ||
    Boolean(event.policies?.length);

  function close() {
    setError(undefined);
    setComplete(undefined);
    setPurchaseKind("entry");
    setDivisionId(undefined);
    setTicketTypeId(undefined);
    setBusy(false);
    onClose();
  }

  async function checkout() {
    if (!client || mode === "preview") return;
    setBusy(true);
    setError(undefined);
    try {
      if (requiresGuidedCheckout) {
        const selection =
          purchaseKind === "ticket" && ticket
            ? `?ticket=${encodeURIComponent(ticket.id)}`
            : division
              ? `?division=${encodeURIComponent(division.id)}`
              : "";
        await WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/app/checkout/${selectedEvent.slug}${selection}`,
        );
        await refresh();
        return;
      }
      const result = await client.player.startEventCheckout.mutate({
        sessionId: selectedEvent.id,
        divisionId: division?.id,
        isDunaPlus: Boolean(settings?.membership),
        successUrl: `${dunaWebUrl}/app?checkout=success`,
        cancelUrl: `${dunaWebUrl}/events/${selectedEvent.slug}?checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.checkoutUrl) {
        await WebBrowser.openBrowserAsync(result.checkoutUrl);
        const status = result.checkoutSessionId
          ? await client.player.checkoutStatus.query({
              checkoutSessionId: result.checkoutSessionId,
            })
          : undefined;
        setComplete(
          status?.complete
            ? {
                label: "Confirmed",
                title: "You’re in.",
                body: `${selectedEvent.title} is confirmed and now appears with your bookings.`,
              }
            : {
                label: "Pending",
                title: "Checkout is still processing.",
                body: "Duna will confirm the booking after the payment succeeds.",
              },
        );
      } else {
        const waitlisted = result.mode === "waitlist";
        const alreadyRegistered = result.mode === "already-registered";
        setComplete({
          label: waitlisted
            ? "Waitlisted"
            : alreadyRegistered
              ? "Already registered"
              : "Confirmed",
          title: waitlisted
            ? "You’re on the list."
            : alreadyRegistered
              ? "You already have this booking."
              : "You’re in.",
          body: waitlisted
            ? `${selectedEvent.title} will notify you if a place opens.`
            : `${selectedEvent.title} now appears with your bookings.`,
        });
      }
      await refresh();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={close}
      presentationStyle="pageSheet"
      visible={eventIndex !== null}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        {complete ? (
          <View style={styles.completeState}>
            <View style={styles.completeIcon}>
              <Text style={styles.completeIconText}>✓</Text>
            </View>
            <Pill tone={complete.label === "Pending" ? "warning" : "positive"}>
              {complete.label}
            </Pill>
            <Text style={styles.completeTitle}>{complete.title}</Text>
            <Text style={styles.completeBody}>{complete.body}</Text>
            <Pressable onPress={close} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Pressable onPress={close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
              <Text style={styles.modalHeaderTitle}>Secure checkout</Text>
              <Text style={styles.rowMeta}>Secure payment</Text>
            </View>
            <ImageBackground
              imageStyle={styles.checkoutArtImage}
              source={{
                uri:
                  event.imageUrl ??
                  `${dunaWebUrl}${
                    defaultEventMedia(event.kind, event.id).path
                  }`,
              }}
              style={styles.checkoutArt}
            >
              <View style={styles.eventArtWash} />
              <Pill>{event.kind}</Pill>
            </ImageBackground>
            <Text style={styles.checkoutTitle}>{event.title}</Text>
            <Text style={styles.checkoutMeta}>
              {event.venueName} ·{" "}
              {formatVenueTime(event.startsAt, event.timezone)}
            </Text>
            {event.shortSummary && (
              <Text style={styles.checkoutSummaryText}>
                {event.shortSummary}
              </Text>
            )}
            {event.divisions?.length && event.tickets?.length ? (
              <View style={styles.purchaseKindRow}>
                <Pressable
                  onPress={() => setPurchaseKind("entry")}
                  style={[
                    styles.purchaseKindButton,
                    purchaseKind === "entry" && styles.purchaseKindButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.purchaseKindText,
                      purchaseKind === "entry" && styles.purchaseKindTextActive,
                    ]}
                  >
                    PLAY
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPurchaseKind("ticket")}
                  style={[
                    styles.purchaseKindButton,
                    purchaseKind === "ticket" &&
                      styles.purchaseKindButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.purchaseKindText,
                      purchaseKind === "ticket" &&
                        styles.purchaseKindTextActive,
                    ]}
                  >
                    ATTEND
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {purchaseKind === "entry" &&
              event.divisions &&
              event.divisions.length > 0 && (
                <View style={styles.checkoutSection}>
                  <Text style={styles.eyebrow}>DIVISION</Text>
                  <View style={styles.filterRow}>
                    {event.divisions.map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => setDivisionId(option.id)}
                        style={[
                          styles.filterChip,
                          division?.id === option.id && styles.filterChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterText,
                            division?.id === option.id &&
                              styles.filterTextActive,
                          ]}
                        >
                          {option.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {division && (
                    <View style={styles.mobileDivisionDetail}>
                      <View>
                        <Text style={styles.rowMeta}>TEAM</Text>
                        <Text style={styles.rowTitle}>
                          {division.teamFormat?.replace("-", " ") ??
                            division.discipline.replace("-", " ")}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.rowMeta}>FORMAT</Text>
                        <Text style={styles.rowTitle}>
                          {division.tournamentFormat?.replaceAll("-", " ") ??
                            "Configured play"}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.rowMeta}>SEEDING</Text>
                        <Text style={styles.rowTitle}>
                          {division.seeding?.replaceAll("-", " ") ??
                            division.ratingBasis.replaceAll("-", " ")}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            {purchaseKind === "ticket" && event.tickets?.length ? (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>TICKET</Text>
                <View style={styles.mobileTicketList}>
                  {event.tickets
                    .filter((option) => option.availableOnline)
                    .map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => setTicketTypeId(option.id)}
                        style={[
                          styles.mobileTicketRow,
                          ticket?.id === option.id &&
                            styles.mobileTicketRowActive,
                        ]}
                      >
                        <View style={styles.flex}>
                          <Text style={styles.rowTitle}>{option.name}</Text>
                          <Text numberOfLines={2} style={styles.rowMeta}>
                            {option.description ??
                              `${option.remaining ?? "Unlimited"} available`}
                          </Text>
                        </View>
                        <Text style={styles.moneyAmount}>
                          {option.price.amountMinor
                            ? formatMoney(
                                option.price.amountMinor,
                                option.price.currency,
                              )
                            : "FREE"}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            ) : null}
            {purchaseKind === "entry" && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>WHO’S PLAYING</Text>
                <View style={styles.checkoutPlayer}>
                  <View style={styles.miniAvatar}>
                    <Text style={styles.miniAvatarText}>{player.initials}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{player.displayName}</Text>
                    <Text style={styles.rowMeta}>
                      {player.rating.display.toFixed(2)} sand rating ·{" "}
                      {player.rating.confidence}
                    </Text>
                  </View>
                </View>
              </View>
            )}
            {purchaseKind === "entry" && selectedTeamSize > 1 && (
              <View style={styles.mobileTeamNotice}>
                <Text style={styles.mobileTeamIcon}>◎</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    Build a {selectedTeamSize}-player team
                  </Text>
                  <Text style={styles.rowMeta}>
                    Search Duna, invite by phone or email, and choose who pays
                    in the guided checkout.
                  </Text>
                </View>
              </View>
            )}
            {event.features && event.features.length > 0 && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>EVENT FEATURES</Text>
                {event.features.map((feature) => (
                  <View key={feature.id} style={styles.mobileFeatureRow}>
                    <Text style={styles.mobileFeatureIcon}>
                      {feature.kind === "guest"
                        ? "★"
                        : feature.kind === "activity"
                          ? "✦"
                          : "◇"}
                    </Text>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>{feature.title}</Text>
                      {feature.description && (
                        <Text style={styles.rowMeta}>
                          {feature.description}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {event.policies && event.policies.length > 0 && (
              <View style={styles.mobilePolicyNotice}>
                <Text style={styles.mobilePolicyIcon}>✓</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    {event.policies.length} policies + waivers
                  </Text>
                  <Text style={styles.rowMeta}>
                    Required waivers unlock only after you read them in full.
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.checkoutSection}>
              <Text style={styles.eyebrow}>PAYMENT</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentIcon}>◇</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    {listedPrice.amountMinor
                      ? "Secure checkout"
                      : "Free registration"}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {listedPrice.amountMinor
                      ? "Card details go directly to the payment processor. Duna never stores them."
                      : "No payment method is required."}
                  </Text>
                </View>
                <Text style={styles.moneyAmount}>
                  {listedPrice.amountMinor
                    ? formatMoney(listedPrice.amountMinor, listedPrice.currency)
                    : "FREE"}
                </Text>
              </View>
            </View>
            <View style={styles.orderMath}>
              <View>
                <Text style={styles.bodyText}>Entry</Text>
                <Text style={styles.moneyAmount}>
                  {formatMoney(listedPrice.amountMinor, listedPrice.currency)}
                </Text>
              </View>
              <View>
                <Text style={styles.bodyText}>Taxes and service fees</Text>
                <Text style={styles.moneyAmount}>Calculated securely</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.rowTitle}>Listed price</Text>
                <Text style={styles.totalAmount}>
                  {formatMoney(listedPrice.amountMinor, listedPrice.currency)}
                </Text>
              </View>
            </View>
            {error && <Text style={styles.formError}>{error}</Text>}
            <Pressable
              disabled={mode === "preview" || busy}
              onPress={() => void checkout()}
              style={[
                styles.payButton,
                (mode === "preview" || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.payButtonText}>
                {mode === "preview"
                  ? "Preview only · checkout disabled"
                  : busy
                    ? "Opening secure checkout…"
                    : requiresGuidedCheckout
                      ? purchaseKind === "ticket"
                        ? "Choose tickets securely"
                        : "Complete team + agreements"
                      : listedPrice.amountMinor
                        ? "Continue to payment"
                        : "Confirm free registration"}
              </Text>
            </Pressable>
            <Text style={styles.paymentTrust}>
              Eligibility, capacity, pricing, and guardian requirements are
              rechecked by Duna before registration.
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function defaultPickupStart(): string {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function PickupModal({
  visible,
  onClose,
  onCreated,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onCreated: (title: string) => void;
}) {
  const { client, dashboard, mode, refresh, venues } = usePlayerRuntime();
  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueId, setVenueId] = useState<string>();
  const [courtBookingId, setCourtBookingId] = useState<string>();
  const [startsAt, setStartsAt] = useState(defaultPickupStart);
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [capacity, setCapacity] = useState("8");
  const [format, setFormat] = useState<
    "2s" | "3s" | "4s" | "6s" | "king-queen"
  >("4s");
  const [matchType, setMatchType] = useState<"competitive" | "casual">(
    "competitive",
  );
  const [genderPreference, setGenderPreference] = useState<
    "open" | "mens" | "womens" | "mixed"
  >("open");
  const [ratingEnabled, setRatingEnabled] = useState(true);
  const [ratingMinimum, setRatingMinimum] = useState("1.00");
  const [ratingMaximum, setRatingMaximum] = useState("8.00");
  const [cost, setCost] = useState("0");
  const [note, setNote] = useState("");
  const [recordMatches, setRecordMatches] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const courtReservations = (dashboard?.bookings ?? []).filter(
    (booking) =>
      booking.kind === "court-rental" && new Date(booking.endsAt) > new Date(),
  );

  async function publish() {
    if (!client || mode === "preview") return;
    const start = new Date(startsAt);
    const duration = Number(durationMinutes);
    const playerCapacity = Number(capacity);
    const dollars = Number(cost);
    const ratingMin = Number(ratingMinimum);
    const ratingMax = Number(ratingMaximum);
    if (!Number.isFinite(start.getTime())) {
      setError("Enter the start as YYYY-MM-DDTHH:MM.");
      return;
    }
    if (!Number.isInteger(duration) || duration < 30 || duration > 480) {
      setError("Duration must be between 30 and 480 minutes.");
      return;
    }
    if (!Number.isInteger(playerCapacity) || playerCapacity < 2) {
      setError("Capacity must be at least two players.");
      return;
    }
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000) {
      setError("Enter a valid price from $0 to $1,000.");
      return;
    }
    if (
      ratingEnabled &&
      matchType === "competitive" &&
      (!Number.isFinite(ratingMin) ||
        !Number.isFinite(ratingMax) ||
        ratingMin < 1 ||
        ratingMax > 8 ||
        ratingMax < ratingMin)
    ) {
      setError("Choose a Sand Rating range from 1.00 to 8.00.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const event = await client.player.createPickup.mutate({
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + duration * 60 * 1_000).toISOString(),
        venueName: venueName.trim(),
        venueId,
        courtBookingId,
        capacity: playerCapacity,
        format,
        matchType,
        genderPreference,
        note: note.trim() || undefined,
        visibility: "public",
        costMinor: Math.round(dollars * 100),
        currency: "USD",
        recordMatches,
        ratingMinimum:
          ratingEnabled && matchType === "competitive" ? ratingMin : undefined,
        ratingMaximum:
          ratingEnabled && matchType === "competitive" ? ratingMax : undefined,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      onCreated(event.title);
      setTitle("");
      setVenueName("");
      setNote("");
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            <Text style={styles.modalHeaderTitle}>Host pickup</Text>
            <Text style={styles.rowMeta}>Public</Text>
          </View>
          <Text style={styles.checkoutTitle}>Make the next game happen.</Text>
          <Text style={styles.checkoutMeta}>
            Choose the game, who it is for, and optionally attach a confirmed
            court reservation. It appears in Discover immediately.
          </Text>
          <View style={styles.formStack}>
            <TextInput
              onChangeText={setTitle}
              placeholder="Pickup title"
              placeholderTextColor={colors.muted}
              style={styles.formInput}
              value={title}
            />
            <Text style={styles.formSectionLabel}>MATCH TYPE</Text>
            <View style={styles.pickupChoiceGrid}>
              {(["competitive", "casual"] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setMatchType(option);
                    if (option === "casual") setRatingEnabled(false);
                  }}
                  style={[
                    styles.pickupChoiceCard,
                    matchType === option && styles.pickupChoiceCardActive,
                  ]}
                >
                  <Text style={styles.rowTitle}>
                    {option === "competitive" ? "Competitive" : "Casual"}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {option === "competitive"
                      ? "Rated play with a clear range"
                      : "Social play without rating impact"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {courtReservations.length > 0 && (
              <>
                <Text style={styles.formSectionLabel}>
                  USE A COURT YOU BOOKED
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.horizontalBleed}
                >
                  <View style={styles.pickupReservationRow}>
                    <Pressable
                      onPress={() => setCourtBookingId(undefined)}
                      style={[
                        styles.pickupReservation,
                        !courtBookingId && styles.pickupReservationActive,
                      ]}
                    >
                      <Text style={styles.rowTitle}>No linked court</Text>
                      <Text style={styles.rowMeta}>Use a custom location</Text>
                    </Pressable>
                    {courtReservations.map((booking) => (
                      <Pressable
                        key={booking.id}
                        onPress={() => {
                          const start = new Date(booking.startsAt);
                          const end = new Date(booking.endsAt);
                          const local = new Date(
                            start.getTime() -
                              start.getTimezoneOffset() * 60_000,
                          );
                          setCourtBookingId(booking.id);
                          setVenueName(booking.venueName);
                          setStartsAt(local.toISOString().slice(0, 16));
                          setDurationMinutes(
                            String(
                              Math.round(
                                (end.getTime() - start.getTime()) / 60_000,
                              ),
                            ),
                          );
                        }}
                        style={[
                          styles.pickupReservation,
                          courtBookingId === booking.id &&
                            styles.pickupReservationActive,
                        ]}
                      >
                        <Text style={styles.rowTitle}>{booking.venueName}</Text>
                        <Text style={styles.rowMeta}>
                          {new Date(booking.startsAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
            <TextInput
              editable={!courtBookingId}
              onChangeText={(value) => {
                setVenueName(value);
                setVenueId(undefined);
              }}
              placeholder="Venue or court"
              placeholderTextColor={colors.muted}
              style={styles.formInput}
              value={venueName}
            />
            {!courtBookingId && venues && venues.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.filterRow}>
                  {venues.map((venue) => (
                    <Pressable
                      key={venue.id}
                      onPress={() => {
                        setVenueId(venue.id);
                        setVenueName(venue.name);
                      }}
                      style={[
                        styles.filterChip,
                        venueId === venue.id && styles.filterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          venueId === venue.id && styles.filterTextActive,
                        ]}
                      >
                        {venue.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
            <TextInput
              autoCapitalize="none"
              onChangeText={setStartsAt}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={colors.muted}
              style={styles.formInput}
              value={startsAt}
            />
            <View style={styles.formRow}>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setDurationMinutes}
                placeholder="Minutes"
                placeholderTextColor={colors.muted}
                style={[styles.formInput, styles.formRowInput]}
                value={durationMinutes}
              />
              <TextInput
                keyboardType="number-pad"
                onChangeText={setCapacity}
                placeholder="Players"
                placeholderTextColor={colors.muted}
                style={[styles.formInput, styles.formRowInput]}
                value={capacity}
              />
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={setCost}
                placeholder="$"
                placeholderTextColor={colors.muted}
                style={[styles.formInput, styles.formRowInput]}
                value={cost}
              />
            </View>
            <View style={styles.filterRow}>
              {(["2s", "3s", "4s", "6s", "king-queen"] as const).map(
                (option) => (
                  <Pressable
                    key={option}
                    onPress={() => setFormat(option)}
                    style={[
                      styles.filterChip,
                      format === option && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        format === option && styles.filterTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <Text style={styles.formSectionLabel}>WHO CAN JOIN</Text>
            <View style={styles.filterRow}>
              {(["open", "mixed", "womens", "mens"] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setGenderPreference(option)}
                  style={[
                    styles.filterChip,
                    genderPreference === option && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      genderPreference === option && styles.filterTextActive,
                    ]}
                  >
                    {option === "open"
                      ? "All"
                      : option === "mixed"
                        ? "Mixed"
                        : option === "womens"
                          ? "Women"
                          : "Men"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {matchType === "competitive" && (
              <>
                <Pressable
                  onPress={() => setRatingEnabled((current) => !current)}
                  style={styles.toggleRow}
                >
                  <View>
                    <Text style={styles.rowTitle}>Sand Rating range</Text>
                    <Text style={styles.rowMeta}>
                      Out-of-range players can request access.
                    </Text>
                  </View>
                  <Pill tone={ratingEnabled ? "positive" : "neutral"}>
                    {ratingEnabled ? "On" : "Open"}
                  </Pill>
                </Pressable>
                {ratingEnabled && (
                  <View style={styles.formRow}>
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={setRatingMinimum}
                      placeholder="Min rating"
                      placeholderTextColor={colors.muted}
                      style={[styles.formInput, styles.formRowInput]}
                      value={ratingMinimum}
                    />
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={setRatingMaximum}
                      placeholder="Max rating"
                      placeholderTextColor={colors.muted}
                      style={[styles.formInput, styles.formRowInput]}
                      value={ratingMaximum}
                    />
                  </View>
                )}
              </>
            )}
            <TextInput
              multiline
              onChangeText={setNote}
              placeholder="Optional note for players"
              placeholderTextColor={colors.muted}
              style={[styles.formInput, styles.formTextarea]}
              value={note}
            />
            <Pressable
              onPress={() => setRecordMatches((current) => !current)}
              style={styles.toggleRow}
            >
              <Text style={styles.rowTitle}>Record match results</Text>
              <Pill tone={recordMatches ? "positive" : "neutral"}>
                {recordMatches ? "On" : "Off"}
              </Pill>
            </Pressable>
          </View>
          {error && <Text style={styles.formError}>{error}</Text>}
          <Pressable
            disabled={
              mode === "preview" ||
              busy ||
              title.trim().length < 3 ||
              venueName.trim().length < 2
            }
            onPress={() => void publish()}
            style={[
              styles.payButton,
              (mode === "preview" ||
                busy ||
                title.trim().length < 3 ||
                venueName.trim().length < 2) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.payButtonText}>
              {mode === "preview"
                ? "Preview only · publishing disabled"
                : busy
                  ? "Publishing…"
                  : "Publish pickup"}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function TabBar({
  active,
  onChange,
}: {
  readonly active: Tab;
  readonly onChange: (tab: Tab) => void;
}) {
  const selectedTab = active === "health" ? "you" : active;
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === tab.key }}
          key={tab.key}
          onPress={() => {
            selectionHaptic();
            onChange(tab.key);
          }}
          style={styles.tabItem}
        >
          <Text
            style={[
              styles.tabIcon,
              selectedTab === tab.key && styles.tabActive,
            ]}
          >
            {tab.icon}
          </Text>
          <Text
            style={[
              styles.tabLabel,
              selectedTab === tab.key && styles.tabActive,
            ]}
          >
            {tab.label}
          </Text>
          {selectedTab === tab.key && <View style={styles.tabIndicator} />}
        </Pressable>
      ))}
    </View>
  );
}

function WatchScoreInbox() {
  const [draft, setDraft] = useState<WatchScoreDraft | null>(null);

  useEffect(() => {
    setDraft(getPendingWatchScoreDraft());
    return subscribeToWatchScoreDraft(setDraft);
  }, []);

  if (!draft) return null;

  const review = async () => {
    selectionHaptic();
    const watchPayload = encodeURIComponent(
      JSON.stringify({
        source: draft.source,
        draftId: draft.draftId,
        sets: draft.sets,
        capturedAt: draft.capturedAt,
      }),
    );
    const query = draft.matchId
      ? `match=${encodeURIComponent(draft.matchId)}&watch=${watchPayload}`
      : `watch=${watchPayload}`;
    await WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/score?${query}`);
    clearPendingWatchScoreDraft();
    setDraft(null);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => setDraft(null)}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <ScrollView contentContainerStyle={styles.watchDraftContent}>
          <View style={styles.watchDraftMark}>
            <Text style={styles.watchDraftMarkText}>⌚</Text>
          </View>
          <Text style={styles.eyebrow}>CAPTURED ON APPLE WATCH</Text>
          <Text style={styles.watchDraftTitle}>Your score is ready.</Text>
          <Text style={styles.watchDraftBody}>
            Add the players, confirm everyone agreed to record it, then submit
            from your signed-in Duna account.
          </Text>
          <View style={styles.watchDraftScore}>
            <View>
              <Text style={styles.rowTitle}>{draft.teamA}</Text>
              <Text style={styles.rowMeta}>Team A</Text>
            </View>
            <Text style={styles.watchDraftSets}>
              {draft.sets.map((set) => `${set.a}–${set.b}`).join("  ")}
            </Text>
            <View>
              <Text style={[styles.rowTitle, styles.watchDraftTeamB]}>
                {draft.teamB}
              </Text>
              <Text style={[styles.rowMeta, styles.watchDraftTeamB]}>
                Team B
              </Text>
            </View>
          </View>
          <View style={styles.watchDraftTrust}>
            <Text style={styles.mobilePolicyIcon}>✓</Text>
            <Text style={[styles.rowMeta, styles.flex]}>
              Duna records who submits the result. Only event participants,
              assigned scorers, match players, and organization staff can report
              an existing event match.
            </Text>
          </View>
          <Pressable onPress={() => void review()} style={styles.payButton}>
            <Text style={styles.payButtonText}>Review and submit</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              clearPendingWatchScoreDraft();
              setDraft(null);
            }}
            style={styles.watchDraftDiscard}
          >
            <Text style={styles.watchDraftDiscardText}>Discard draft</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function DunaApp() {
  const runtime = usePlayerRuntime();
  const [tab, setTab] = useState<Tab>("home");
  const [eventIndex, setEventIndex] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeName>("light");
  const screenTransition = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void AsyncStorage.getItem("duna-theme").then((stored) => {
      if (stored === "dark") setTheme("dark");
    });
  }, []);

  useEffect(() => {
    screenTransition.setValue(0);
    Animated.timing(screenTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenTransition, tab]);

  activePalette = theme === "dark" ? darkColors : lightColors;
  activeStyles = theme === "dark" ? darkStyles : lightStyles;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggle: () => {
          const next = theme === "light" ? "dark" : "light";
          setTheme(next);
          void AsyncStorage.setItem("duna-theme", next);
        },
      }}
    >
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <View style={styles.app}>
          <PreviewBanner />
          <Animated.View
            style={[
              styles.animatedScreen,
              {
                opacity: screenTransition,
                transform: [
                  {
                    translateY: screenTransition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {tab === "home" && <HomeScreen onBook={setEventIndex} />}
            {tab === "discover" && <DiscoverScreen onBook={setEventIndex} />}
            {tab === "play" && <PlayScreen />}
            {tab === "video" && <VideoStudioScreen runtime={runtime} />}
            {tab === "wallet" && <WalletScreen />}
            {tab === "you" && (
              <ProfileScreen onHealth={() => setTab("health")} />
            )}
            {tab === "health" && (
              <HealthScreen onBack={() => setTab("you")} theme={theme} />
            )}
          </Animated.View>
          <TabBar active={tab} onChange={setTab} />
          <BookingModal
            eventIndex={eventIndex}
            onClose={() => setEventIndex(null)}
          />
          <WatchScoreInbox />
        </View>
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PlayerRuntimeProvider>
        <DunaApp />
      </PlayerRuntimeProvider>
    </SafeAreaProvider>
  );
}

function createStyles(palette: Palette) {
  activePalette = palette;
  return StyleSheet.create({
    safe: { backgroundColor: colors.canvas, flex: 1 },
    app: { backgroundColor: colors.canvas, flex: 1 },
    animatedScreen: { flex: 1 },
    buttonDisabled: { opacity: 0.45 },
    flex: { flex: 1, minWidth: 0 },
    formError: {
      color: colors.danger,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 12,
    },
    formInput: {
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 12,
      borderWidth: 1,
      color: colors.bone,
      fontSize: 12,
      minHeight: 46,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    formRow: { flexDirection: "row", gap: 8 },
    formRowInput: { flex: 1, minWidth: 0 },
    formStack: { gap: 10, marginTop: 20 },
    formTextarea: { minHeight: 88, textAlignVertical: "top" },
    rowBetween: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    linkText: { color: colors.aqua, fontSize: 10, fontWeight: "800" },
    bookingVenueRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 18,
      paddingRight: 36,
    },
    bookingVenueCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: "space-between",
      minHeight: 155,
      padding: 15,
      width: 230,
    },
    bookingVenueEyebrow: {
      color: colors.aqua,
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.7,
    },
    bookingVenueCardTitle: {
      color: colors.bone,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -1,
      lineHeight: 24,
      marginVertical: 15,
    },
    bookingVenueAction: {
      color: colors.bone,
      fontSize: 9,
      fontWeight: "800",
    },
    bookingVenueName: {
      color: colors.bone,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -1.6,
      lineHeight: 35,
    },
    bookingDateRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 18,
      paddingRight: 36,
      paddingVertical: 18,
    },
    bookingDate: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 25,
      borderWidth: 1,
      height: 64,
      justifyContent: "center",
      width: 52,
    },
    bookingDateActive: {
      backgroundColor: colors.aquaDeep,
      borderColor: colors.aquaDeep,
    },
    bookingDateUnavailable: { opacity: 0.32 },
    bookingDateDay: {
      color: colors.muted,
      fontSize: 6,
      fontWeight: "800",
    },
    bookingDateNumber: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 3,
    },
    bookingDateTextActive: { color: "#ffffff" },
    bookingDurationRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    bookingDuration: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      minHeight: 45,
      justifyContent: "center",
    },
    bookingDurationActive: {
      backgroundColor: colors.aquaDeep,
      borderColor: colors.aquaDeep,
    },
    bookingDurationText: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
    },
    bookingDurationTextActive: { color: "#ffffff" },
    bookingWeather: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
      padding: 12,
    },
    bookingWeatherIcon: { fontSize: 24 },
    bookingWeatherUpdated: {
      color: colors.muted,
      fontSize: 6,
      textAlign: "right",
    },
    bookingSlotGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    bookingSlot: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 13,
      borderWidth: 1,
      minHeight: 86,
      padding: 11,
      width: "31.5%",
    },
    bookingSlotTime: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    bookingSlotCourt: {
      color: colors.muted,
      fontSize: 7,
      marginTop: 5,
    },
    bookingSlotWeather: {
      color: colors.muted,
      fontSize: 7,
      marginTop: 4,
    },
    bookingSlotPrice: {
      color: colors.aqua,
      fontSize: 8,
      fontWeight: "800",
      marginTop: 5,
    },
    bookingEmpty: {
      color: colors.muted,
      fontSize: 10,
      paddingVertical: 28,
      textAlign: "center",
    },
    bookingEmptyCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
    },
    bookingDaylightNote: {
      color: colors.muted,
      fontSize: 8,
      lineHeight: 13,
      marginTop: 10,
    },
    bookingAlertButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 15,
      padding: 14,
    },
    bookingAlertIcon: {
      color: colors.aqua,
      fontSize: 22,
    },
    bookingReviewCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 18,
      padding: 16,
    },
    bookingReviewDate: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    bookingReviewTime: {
      color: colors.aqua,
      fontSize: 28,
      fontWeight: "900",
      letterSpacing: -1.2,
      marginTop: 5,
    },
    bookingPartnerScroll: { marginHorizontal: -13, marginTop: 12 },
    bookingPartnerRow: {
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 13,
      paddingRight: 26,
    },
    bookingPartner: { alignItems: "center", gap: 5, width: 60 },
    bookingPartnerAvatar: {
      backgroundColor: colors.navyLift,
      borderRadius: 22,
      color: colors.aquaDeep,
      fontSize: 11,
      fontWeight: "900",
      height: 44,
      lineHeight: 44,
      overflow: "hidden",
      textAlign: "center",
      width: 44,
    },
    bookingPartnerName: {
      color: colors.bone,
      fontSize: 7,
      textAlign: "center",
      width: 58,
    },
    bookingManualInvite: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      marginTop: 13,
    },
    bookingAddButton: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: 13,
    },
    bookingParticipant: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginTop: 10,
      paddingTop: 10,
    },
    bookingPolicyScroll: {
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderRadius: 10,
      marginVertical: 10,
      maxHeight: 150,
      paddingHorizontal: 10,
    },
    bookingNotice: {
      backgroundColor: rgba(colors.positiveRgb, 0.09),
      borderColor: rgba(colors.positiveRgb, 0.2),
      borderRadius: 12,
      borderWidth: 1,
      color: colors.positive,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 12,
      padding: 11,
    },
    formSectionLabel: {
      color: colors.muted,
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 1,
      marginTop: 8,
    },
    pickupChoiceGrid: { flexDirection: "row", gap: 8 },
    pickupChoiceCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      minHeight: 90,
      padding: 13,
    },
    pickupChoiceCardActive: {
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.4),
    },
    pickupReservationRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 18,
      paddingRight: 36,
    },
    pickupReservation: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 13,
      borderWidth: 1,
      minHeight: 74,
      padding: 12,
      width: 185,
    },
    pickupReservationActive: {
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.4),
    },
    previewBanner: {
      alignItems: "center",
      backgroundColor: rgba(colors.warningRgb, 0.12),
      borderBottomColor: rgba(colors.warningRgb, 0.24),
      borderBottomWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    previewBannerText: {
      color: colors.warning,
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.8,
      textAlign: "center",
    },
    screenContent: { paddingBottom: 118, paddingHorizontal: 18 },
    toggleRow: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.03),
      borderRadius: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 12,
    },
    appHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 22,
      paddingTop: 10,
    },
    headerActions: { flexDirection: "row", gap: 8 },
    themeButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    themeButtonText: {
      color: colors.bone,
      fontSize: 17,
      lineHeight: 20,
    },
    wordmark: { alignItems: "center", flexDirection: "row", gap: 8 },
    mark: {
      alignItems: "center",
      borderColor: colors.aqua,
      borderRadius: 15,
      borderWidth: 2,
      height: 30,
      justifyContent: "center",
      position: "relative",
      width: 30,
    },
    markArc: {
      borderColor: colors.bone,
      borderRadius: 15,
      borderTopWidth: 2,
      height: 13,
      position: "absolute",
      top: 8,
      transform: [{ rotate: "180deg" }],
      width: 18,
    },
    markDot: {
      backgroundColor: colors.flare,
      borderRadius: 2,
      bottom: 5,
      height: 4,
      position: "absolute",
      width: 4,
    },
    wordmarkText: {
      color: colors.bone,
      fontSize: 17,
      fontWeight: "900",
      letterSpacing: 3,
    },
    proPill: {
      backgroundColor: rgba(colors.warningRgb, 0.12),
      borderRadius: 6,
      color: colors.warning,
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 1,
      overflow: "hidden",
      paddingHorizontal: 5,
      paddingVertical: 3,
    },
    headerEyebrow: {
      color: colors.muted,
      fontSize: 8,
      letterSpacing: 1.2,
      marginTop: 5,
    },
    askButton: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.09),
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 19,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    askButtonText: { color: colors.aqua, fontSize: 17 },
    avatarButton: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      position: "relative",
      width: 38,
    },
    avatarText: { color: colors.bone, fontSize: 10, fontWeight: "800" },
    notificationDot: {
      backgroundColor: colors.flare,
      borderColor: colors.ink,
      borderRadius: 5,
      borderWidth: 2,
      height: 9,
      position: "absolute",
      right: 0,
      top: 0,
      width: 9,
    },
    homeCampaign: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 24,
      justifyContent: "flex-end",
      marginBottom: 14,
      minHeight: 340,
      overflow: "hidden",
      position: "relative",
    },
    homeCampaignCompact: {
      minHeight: 390,
    },
    homeCampaignImage: {
      borderRadius: 24,
      resizeMode: "cover",
    },
    homeCampaignWash: {
      backgroundColor: "rgba(4,20,38,0.52)",
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    homeCampaignContent: {
      backgroundColor: "rgba(4,20,38,0.22)",
      gap: 10,
      padding: 20,
    },
    homeCampaignEyebrow: {
      color: "#e7c68f",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    homeCampaignTitle: {
      color: "#ffffff",
      fontSize: 42,
      fontWeight: "900",
      letterSpacing: -2.2,
      lineHeight: 42,
    },
    homeCampaignTitleCompact: {
      fontSize: 39,
      letterSpacing: -2,
      lineHeight: 40,
    },
    homeCampaignSubtitle: {
      color: "rgba(255,255,255,0.72)",
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 310,
    },
    homeCampaignAction: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: "#ffffff",
      borderRadius: 999,
      justifyContent: "center",
      marginTop: 4,
      minHeight: 44,
      paddingHorizontal: 16,
    },
    homeCampaignActionText: {
      color: "#0e1828",
      fontSize: 11,
      fontWeight: "900",
    },
    memberOrganizationCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginBottom: 4,
      padding: 14,
    },
    memberOrganizationMark: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 15,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    memberOrganizationMarkText: {
      color: colors.onAccent,
      fontSize: 18,
      fontWeight: "900",
    },
    memberOrganizationEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    memberOrganizationName: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 3,
    },
    memberOrganizationMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 3,
    },
    memberOrganizationArrow: {
      color: colors.aqua,
      fontSize: 24,
      fontWeight: "500",
    },
    coachCardRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 18,
      paddingRight: 36,
    },
    coachCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 116,
      padding: 13,
      width: 304,
    },
    coachCardPreferred: {
      backgroundColor: rgba(colors.accentRgb, 0.06),
      borderColor: rgba(colors.accentRgb, 0.35),
    },
    coachCardPressed: { opacity: 0.78 },
    coachAvatar: {
      borderRadius: 19,
      height: 66,
      width: 66,
    },
    coachAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 19,
      height: 66,
      justifyContent: "center",
      width: 66,
    },
    coachAvatarFallbackText: {
      color: colors.aqua,
      fontSize: 18,
      fontWeight: "900",
    },
    coachCardTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    coachCardName: {
      color: colors.bone,
      flexShrink: 1,
      fontSize: 15,
      fontWeight: "900",
    },
    coachCardOrganization: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 4,
    },
    coachCardMeta: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 5,
    },
    coachCardArrow: {
      color: colors.aqua,
      fontSize: 24,
      fontWeight: "500",
    },
    coachModalHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    coachModalHandle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 3,
    },
    coachModalClose: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    coachModalContent: {
      paddingBottom: 90,
      paddingHorizontal: 18,
    },
    coachModalHero: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 24,
      borderWidth: 1,
      marginTop: 18,
      padding: 22,
    },
    coachModalAvatar: {
      borderRadius: 42,
      height: 84,
      width: 84,
    },
    coachModalAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 42,
      height: 84,
      justifyContent: "center",
      width: 84,
    },
    coachModalAvatarText: {
      color: colors.aqua,
      fontSize: 24,
      fontWeight: "900",
    },
    coachModalName: {
      color: colors.bone,
      fontSize: 28,
      fontWeight: "900",
      letterSpacing: -1.1,
      marginTop: 14,
    },
    coachModalOrganization: {
      color: colors.aqua,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 5,
      textAlign: "center",
    },
    coachModalBio: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 14,
      textAlign: "center",
    },
    coachServiceList: { gap: 10 },
    coachServiceCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      padding: 15,
    },
    coachServiceType: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    coachServiceTitle: {
      color: colors.bone,
      fontSize: 17,
      fontWeight: "900",
      marginTop: 6,
    },
    coachServiceBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 6,
    },
    coachServiceAction: {
      color: colors.aqua,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 12,
    },
    coachEmptyCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      padding: 16,
    },
    coachSessionRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 74,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    coachSessionDate: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 12,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    coachSessionMonth: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
    },
    coachSessionDay: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
    },
    homeGreeting: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    homeGreetingCompact: {
      alignItems: "flex-start",
      flexDirection: "column",
      gap: 14,
    },
    displayTitle: {
      color: colors.bone,
      fontSize: 42,
      fontWeight: "900",
      letterSpacing: -2.2,
      lineHeight: 42,
    },
    displayTitleCompact: {
      fontSize: 39,
      letterSpacing: -2,
      lineHeight: 40,
    },
    scoreAction: {
      backgroundColor: colors.aqua,
      borderRadius: 22,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    scoreActionText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: "800",
    },
    heroGrid: { gap: 10 },
    ratingCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 22,
      borderWidth: 1,
      overflow: "hidden",
      padding: 16,
    },
    nextCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 22,
      borderWidth: 1,
      minHeight: 260,
      overflow: "hidden",
      padding: 16,
    },
    cardTitleRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    eyebrow: {
      color: colors.aqua,
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 1.15,
    },
    cardTitle: {
      color: colors.bone,
      fontSize: 19,
      fontWeight: "800",
      letterSpacing: -0.7,
      marginTop: 5,
    },
    pill: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderRadius: 20,
      borderWidth: 1,
      minHeight: 22,
      justifyContent: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    pillText: {
      color: colors.muted,
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.7,
    },
    ratingOrbit: {
      alignItems: "center",
      alignSelf: "center",
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 92,
      borderWidth: 1,
      height: 184,
      justifyContent: "center",
      marginVertical: 20,
      position: "relative",
      width: 184,
    },
    ratingOrbitCompact: { height: 145, marginVertical: 0, width: 145 },
    ratingOrbitInner: {
      alignItems: "center",
      borderColor: colors.aqua,
      borderRadius: 72,
      borderTopWidth: 5,
      borderRightWidth: 2,
      borderBottomWidth: 1,
      borderLeftWidth: 2,
      height: 144,
      justifyContent: "center",
      transform: [{ rotate: "-12deg" }],
      width: 144,
    },
    ratingOrbitInnerCompact: { borderRadius: 55, height: 110, width: 110 },
    ratingLabel: {
      color: colors.muted,
      fontSize: 6,
      letterSpacing: 0.9,
      transform: [{ rotate: "12deg" }],
    },
    ratingValue: {
      color: colors.bone,
      fontSize: 45,
      fontWeight: "900",
      letterSpacing: -3,
      lineHeight: 48,
      transform: [{ rotate: "12deg" }],
    },
    ratingValueCompact: { fontSize: 34, lineHeight: 36 },
    ratingDelta: {
      color: colors.positive,
      fontSize: 8,
      fontWeight: "700",
      transform: [{ rotate: "12deg" }],
    },
    lockedLabel: {
      backgroundColor: colors.aqua,
      borderRadius: 9,
      bottom: 7,
      paddingHorizontal: 7,
      paddingVertical: 3,
      position: "absolute",
    },
    lockedText: {
      color: colors.onAccent,
      fontSize: 6,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    ratingStats: {
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 14,
    },
    statValue: { color: colors.bone, fontSize: 15, fontWeight: "800" },
    statLabel: { color: colors.muted, fontSize: 8, marginTop: 3 },
    nextDate: {
      color: colors.aqua,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.2,
      marginTop: 26,
    },
    nextDay: {
      color: colors.bone,
      fontSize: 64,
      fontWeight: "900",
      letterSpacing: -4,
      lineHeight: 67,
    },
    nextTitle: {
      color: colors.bone,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.7,
    },
    nextMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
    avatarStack: { flexDirection: "row", marginTop: 15 },
    miniAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderColor: colors.depth,
      borderRadius: 18,
      borderWidth: 2,
      height: 34,
      justifyContent: "center",
      marginLeft: -5,
      width: 34,
    },
    miniAvatarText: { color: colors.bone, fontSize: 8, fontWeight: "800" },
    cardLink: {
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      marginTop: 14,
      paddingTop: 12,
    },
    cardLinkText: { color: colors.aqua, fontSize: 10, fontWeight: "700" },
    liveActivityButton: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 999,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    liveActivityButtonText: {
      color: colors.onAccent,
      fontSize: 9,
      fontWeight: "900",
    },
    liveActivityNotice: {
      color: colors.positive,
      fontSize: 8,
      fontWeight: "700",
      marginTop: 8,
    },
    metricStrip: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 10,
      paddingVertical: 13,
    },
    metricNumber: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "800",
      textAlign: "center",
    },
    metricLabel: {
      color: colors.muted,
      fontSize: 7,
      marginTop: 4,
      textAlign: "center",
    },
    sectionHeader: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
      marginTop: 32,
    },
    sectionTitle: {
      color: colors.bone,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -1.2,
      lineHeight: 28,
      marginTop: 4,
    },
    sectionAction: { color: colors.aqua, fontSize: 9, fontWeight: "700" },
    horizontalBleed: { marginHorizontal: -18, paddingHorizontal: 18 },
    eventCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 17,
      borderWidth: 1,
      marginRight: 10,
      overflow: "hidden",
      width: 220,
    },
    eventArt: {
      height: 125,
      overflow: "hidden",
      padding: 10,
      position: "relative",
    },
    eventArtImage: { borderRadius: 16 },
    eventArtWash: {
      backgroundColor: "rgba(7,17,29,0.28)",
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    courtLine: {
      borderColor: rgba(colors.overlayRgb, 0.28),
      borderWidth: 1,
      bottom: -18,
      left: 32,
      position: "absolute",
      right: 32,
      top: 58,
      transform: [{ perspective: 250 }, { rotateX: "48deg" }],
    },
    eventBadges: { flexDirection: "row" },
    eventArrow: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "900",
      position: "absolute",
      right: 10,
      top: 10,
    },
    eventBody: { padding: 12 },
    eventTime: {
      color: colors.aqua,
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    eventTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: -0.5,
      marginTop: 6,
      minHeight: 39,
    },
    eventMeta: { color: colors.muted, fontSize: 8, marginTop: 5 },
    eventWeather: {
      color: colors.aqua,
      fontSize: 8,
      fontWeight: "700",
      marginTop: 5,
    },
    eventFooter: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.06),
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 11,
      paddingTop: 9,
    },
    eventPrice: { color: colors.bone, fontSize: 10, fontWeight: "800" },
    eventSpots: { color: colors.muted, fontSize: 8 },
    proTourEntry: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 20,
      flexDirection: "row",
      gap: 12,
      marginBottom: 18,
      marginTop: 12,
      minHeight: 128,
      overflow: "hidden",
      padding: 18,
    },
    proTourEntryEyebrow: {
      color: "#9de9ff",
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    proTourEntryTitle: {
      color: "#ffffff",
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.9,
      lineHeight: 24,
      marginTop: 9,
    },
    proTourEntryMeta: {
      color: "rgba(255,255,255,.7)",
      fontSize: 8,
      marginTop: 7,
    },
    proTourEntryArrow: {
      color: "#ffffff",
      fontSize: 22,
      marginLeft: 4,
    },
    proTourHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 18,
    },
    proTourTitle: {
      color: colors.bone,
      fontSize: 38,
      fontWeight: "900",
      letterSpacing: -1.9,
    },
    proTourClose: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    proTourContent: { padding: 18, paddingBottom: 60 },
    proEventPicker: {
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 18,
      paddingRight: 36,
      paddingVertical: 6,
    },
    proEventPickerCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      minHeight: 110,
      padding: 13,
      width: 210,
    },
    proEventPickerCardActive: {
      borderColor: colors.aqua,
      borderWidth: 2,
    },
    proEventPickerStatus: {
      color: colors.muted,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    proLiveText: { color: colors.danger },
    proEventPickerName: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 18,
      marginTop: 10,
    },
    proEventHero: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 22,
      marginTop: 18,
      padding: 18,
    },
    proEventHeroTitle: {
      color: "#ffffff",
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -1.3,
      lineHeight: 32,
      marginTop: 15,
    },
    proEventHeroMeta: {
      color: "rgba(255,255,255,.74)",
      fontSize: 9,
      lineHeight: 14,
      marginTop: 10,
    },
    proEventUpdated: {
      color: "rgba(255,255,255,.56)",
      fontSize: 7,
      marginTop: 12,
    },
    proBracket: {
      alignItems: "stretch",
      flexDirection: "row",
      gap: 14,
      paddingHorizontal: 18,
      paddingRight: 36,
    },
    proBracketRound: { minWidth: 240, width: 240 },
    proBracketRoundTitle: {
      color: colors.muted,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.7,
      marginBottom: 9,
    },
    proBracketRoundMatches: {
      flex: 1,
      justifyContent: "space-around",
      gap: 10,
    },
    proBracketMatch: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 14,
      borderWidth: 1,
      overflow: "hidden",
      padding: 10,
    },
    proBracketTeam: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 30,
    },
    proBracketTeamName: {
      color: colors.muted,
      flex: 1,
      fontSize: 9,
      fontWeight: "700",
    },
    proBracketWinner: { color: colors.bone, fontWeight: "900" },
    proBracketScore: {
      color: colors.aqua,
      fontSize: 8,
      fontWeight: "900",
    },
    proBracketPrediction: {
      color: colors.muted,
      fontSize: 6,
      marginTop: 7,
      textTransform: "uppercase",
    },
    proFollowButton: {
      alignItems: "center",
      borderColor: colors.aqua,
      borderRadius: 999,
      borderWidth: 1,
      marginTop: 9,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    proFollowButtonActive: { backgroundColor: colors.aqua },
    proFollowButtonText: {
      color: colors.aqua,
      fontSize: 7,
      fontWeight: "900",
    },
    proFollowButtonTextActive: { color: colors.onAccent },
    proPoolRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 18,
      paddingRight: 36,
    },
    proPoolCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 15,
      borderWidth: 1,
      padding: 12,
      width: 250,
    },
    proPoolTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
      marginBottom: 8,
    },
    proPoolStanding: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.06),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 32,
    },
    proPoolPlace: { color: colors.aqua, fontSize: 8, width: 15 },
    proPoolTeam: { color: colors.bone, flex: 1, fontSize: 8 },
    proPoolRecord: { color: colors.muted, fontSize: 8 },
    listCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 17,
      borderWidth: 1,
      overflow: "hidden",
    },
    matchRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 74,
      padding: 12,
    },
    resultBadge: {
      alignItems: "center",
      borderRadius: 9,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    resultText: { color: colors.onAccent, fontSize: 12, fontWeight: "900" },
    rowTitle: { color: colors.bone, fontSize: 11, fontWeight: "700" },
    rowMeta: { color: colors.muted, fontSize: 8, marginTop: 3 },
    matchScore: { alignItems: "flex-end" },
    aiInsight: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.13),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 28,
      padding: 15,
    },
    aiIcon: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 10,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    aiIconText: { color: colors.onAccent, fontSize: 17 },
    aiTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: -0.4,
      marginTop: 6,
    },
    aiBody: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
    searchField: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 20,
      paddingHorizontal: 14,
    },
    searchIcon: { color: colors.muted, fontSize: 20 },
    searchInput: { color: colors.bone, flex: 1, fontSize: 11, height: 46 },
    filterRow: {
      flexDirection: "row",
      gap: 7,
      marginTop: 14,
      paddingRight: 36,
    },
    filterChip: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    filterText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
    filterTextActive: { color: colors.onAccent, fontWeight: "800" },
    mapCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 20,
      borderWidth: 1,
      height: 260,
      marginTop: 16,
      overflow: "hidden",
      position: "relative",
    },
    mapWater: {
      backgroundColor: colors.aquaDeep,
      bottom: 0,
      left: 0,
      position: "absolute",
      top: 0,
      width: "34%",
    },
    mapShore: {
      backgroundColor: "#735f3e",
      bottom: -50,
      left: "28%",
      position: "absolute",
      top: -60,
      transform: [{ rotate: "-10deg" }],
      width: "28%",
    },
    mapPin: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderColor: colors.ink,
      borderRadius: 16,
      borderWidth: 3,
      height: 32,
      justifyContent: "center",
      position: "absolute",
      width: 32,
    },
    mapPinText: { color: colors.onAccent, fontSize: 8, fontWeight: "900" },
    mapLabel: {
      backgroundColor: rgba(colors.inkRgb, 0.82),
      borderRadius: 10,
      bottom: 12,
      left: 12,
      padding: 10,
      position: "absolute",
    },
    mapLabelTitle: { color: colors.bone, fontSize: 11, fontWeight: "800" },
    mapLabelText: { color: colors.muted, fontSize: 8, marginTop: 2 },
    eventGrid: { gap: 10 },
    successBanner: {
      alignItems: "center",
      backgroundColor: rgba(colors.positiveRgb, 0.08),
      borderColor: rgba(colors.positiveRgb, 0.2),
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginBottom: 12,
      padding: 11,
    },
    successIcon: { color: colors.positive, fontSize: 16 },
    closeText: { color: colors.bone, fontSize: 28, fontWeight: "300" },
    weekCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 20,
      borderWidth: 1,
      padding: 15,
    },
    weekDays: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginVertical: 18,
    },
    weekDay: {
      alignItems: "center",
      borderRadius: 20,
      height: 54,
      justifyContent: "center",
      position: "relative",
      width: 38,
    },
    weekDayActive: { backgroundColor: colors.aqua },
    weekDayLabel: { color: colors.muted, fontSize: 7 },
    weekDayNumber: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 4,
    },
    weekDayTextActive: { color: colors.onAccent },
    weekDot: {
      backgroundColor: colors.aqua,
      borderRadius: 2,
      bottom: 5,
      height: 3,
      position: "absolute",
      width: 3,
    },
    bookingRow: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.06),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 69,
      paddingVertical: 9,
    },
    bookingTime: { width: 35 },
    bookingTimeMain: { color: colors.bone, fontSize: 10, fontWeight: "700" },
    bookingTimeSuffix: { color: colors.muted, fontSize: 6 },
    bookingAccent: { borderRadius: 2, height: 35, width: 3 },
    pickupRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 76,
      padding: 11,
    },
    pickupDate: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.05),
      borderRadius: 9,
      padding: 6,
      width: 38,
    },
    pickupDay: { color: colors.aqua, fontSize: 6, fontWeight: "800" },
    pickupNumber: { color: colors.bone, fontSize: 15, fontWeight: "900" },
    pickupSpots: {
      color: colors.aqua,
      fontSize: 13,
      fontWeight: "800",
      textAlign: "right",
    },
    chevron: { color: colors.muted, fontSize: 22 },
    hostCard: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.14),
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 28,
      padding: 22,
      textAlign: "center",
    },
    hostMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      marginBottom: 12,
      width: 44,
    },
    hostMarkText: { color: colors.aqua, fontSize: 22 },
    bodyText: {
      color: colors.muted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 5,
    },
    primaryButton: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: colors.aqua,
      borderRadius: 22,
      marginTop: 16,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
    walletCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 20,
      overflow: "hidden",
      padding: 18,
      position: "relative",
    },
    walletTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    walletLabel: {
      color: colors.muted,
      fontSize: 7,
      letterSpacing: 1.2,
      marginTop: 40,
    },
    walletBalance: {
      color: colors.bone,
      fontSize: 48,
      fontWeight: "900",
      letterSpacing: -3,
      marginTop: 5,
    },
    walletMeta: { color: colors.muted, fontSize: 8, marginTop: 4 },
    walletActions: { flexDirection: "row", gap: 8, marginTop: 25 },
    walletActionText: {
      backgroundColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      color: colors.bone,
      fontSize: 9,
      fontWeight: "700",
      overflow: "hidden",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    walletWave: {
      borderColor: rgba(colors.accentRgb, 0.12),
      borderRadius: 130,
      borderWidth: 1,
      height: 240,
      position: "absolute",
      right: -130,
      top: -120,
      width: 240,
    },
    walletInfoGrid: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      marginTop: 10,
    },
    walletRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 12,
    },
    moneyDirection: {
      alignItems: "center",
      borderRadius: 10,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    moneyAmount: { color: colors.bone, fontSize: 10, fontWeight: "800" },
    trustNote: {
      alignItems: "flex-start",
      backgroundColor: rgba(colors.accentRgb, 0.05),
      borderColor: rgba(colors.accentRgb, 0.13),
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginTop: 16,
      padding: 12,
    },
    trustIcon: { color: colors.aqua, fontSize: 17 },
    profileHero: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 22,
      borderWidth: 1,
      gap: 20,
      marginTop: 4,
      overflow: "hidden",
      padding: 16,
    },
    profileIdentity: { alignItems: "center", flexDirection: "row", gap: 12 },
    profileAvatar: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 17,
      height: 66,
      justifyContent: "center",
      width: 66,
    },
    profileAvatarText: {
      color: colors.onAccent,
      fontSize: 20,
      fontWeight: "900",
    },
    profileName: {
      color: colors.bone,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 7,
    },
    profileHandle: { color: colors.muted, fontSize: 8, marginTop: 2 },
    profileSetupCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.14),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 10,
      padding: 14,
    },
    profileSetupTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    profileSetupMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 14,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    profileSetupMarkText: {
      color: colors.aqua,
      fontSize: 18,
      fontWeight: "900",
    },
    profileSetupStatus: {
      flexDirection: "row",
      gap: 14,
      marginTop: 10,
    },
    progressCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 10,
      padding: 14,
    },
    mobileChart: {
      backgroundColor: rgba(colors.overlayRgb, 0.02),
      height: 170,
      marginTop: 15,
      position: "relative",
    },
    chartPoint: {
      backgroundColor: colors.aqua,
      borderColor: colors.depth,
      borderRadius: 6,
      borderWidth: 2,
      height: 10,
      position: "absolute",
      width: 10,
      zIndex: 2,
    },
    chartLine: {
      backgroundColor: rgba(colors.accentRgb, 0.14),
      bottom: "20%",
      height: 2,
      left: "4%",
      position: "absolute",
      right: "4%",
      transform: [{ rotate: "-14deg" }],
    },
    chartLabels: { flexDirection: "row", justifyContent: "space-between" },
    chemistryCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 10,
      padding: 14,
    },
    chemistryPartner: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginTop: 14,
      paddingTop: 12,
    },
    achievementRow: { flexDirection: "row", gap: 9, paddingRight: 36 },
    achievementCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 15,
      borderWidth: 1,
      minHeight: 130,
      padding: 13,
      width: 155,
    },
    achievementIcon: { color: colors.aqua, fontSize: 22, marginBottom: 20 },
    healthProfileCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 20,
      borderWidth: 1,
      gap: 12,
      marginTop: 14,
      padding: 16,
    },
    healthProfileTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    healthProfileMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.dangerRgb, 0.1),
      borderRadius: 16,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    healthProfileMarkText: {
      color: colors.danger,
      fontSize: 22,
      fontWeight: "900",
    },
    healthProfileTitle: {
      color: colors.bone,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    healthProfileSignals: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    healthProfileSignal: {
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderRadius: 10,
      color: colors.aqua,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    profileMenu: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 17,
      borderWidth: 1,
      marginTop: 25,
      overflow: "hidden",
    },
    profileMenuRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 14,
    },
    tabBar: {
      backgroundColor: rgba(colors.depthRgb, 0.98),
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      bottom: 0,
      flexDirection: "row",
      left: 0,
      paddingBottom: Platform.OS === "ios" ? 22 : 9,
      paddingHorizontal: 8,
      paddingTop: 8,
      position: "absolute",
      right: 0,
    },
    tabItem: {
      alignItems: "center",
      flex: 1,
      gap: 3,
      paddingVertical: 4,
      position: "relative",
    },
    tabIcon: { color: colors.muted, fontSize: 19 },
    tabLabel: { color: colors.muted, fontSize: 7, fontWeight: "600" },
    tabActive: { color: colors.aqua },
    tabIndicator: {
      backgroundColor: colors.aqua,
      borderRadius: 2,
      height: 2,
      position: "absolute",
      top: -9,
      width: 20,
    },
    modalSafe: { backgroundColor: colors.canvas, flex: 1 },
    modalContent: { padding: 18, paddingBottom: 45 },
    watchDraftContent: {
      alignItems: "center",
      flexGrow: 1,
      justifyContent: "center",
      padding: 24,
    },
    watchDraftMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 35,
      borderWidth: 1,
      height: 70,
      justifyContent: "center",
      marginBottom: 18,
      width: 70,
    },
    watchDraftMarkText: { fontSize: 31 },
    watchDraftTitle: {
      color: colors.bone,
      fontSize: 35,
      fontWeight: "900",
      letterSpacing: -1.4,
      marginTop: 7,
      textAlign: "center",
    },
    watchDraftBody: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 9,
      maxWidth: 360,
      textAlign: "center",
    },
    watchDraftScore: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 24,
      padding: 17,
    },
    watchDraftSets: {
      color: colors.aqua,
      fontSize: 19,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    watchDraftTeamB: { textAlign: "right" },
    watchDraftTrust: {
      alignItems: "flex-start",
      alignSelf: "stretch",
      backgroundColor: rgba(colors.positiveRgb, 0.08),
      borderColor: rgba(colors.positiveRgb, 0.19),
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
      padding: 13,
    },
    watchDraftDiscard: { marginTop: 15, padding: 10 },
    watchDraftDiscardText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    modalHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 15,
    },
    modalHeaderTitle: { color: colors.bone, fontSize: 12, fontWeight: "800" },
    checkoutArt: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 18,
      height: 190,
      overflow: "hidden",
      padding: 12,
      position: "relative",
    },
    checkoutArtImage: { borderRadius: 18 },
    checkoutTitle: {
      color: colors.bone,
      fontSize: 29,
      fontWeight: "900",
      letterSpacing: -1.4,
      marginTop: 18,
    },
    checkoutMeta: { color: colors.muted, fontSize: 9, marginTop: 5 },
    checkoutSummaryText: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 8,
    },
    purchaseKindRow: {
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderRadius: 14,
      flexDirection: "row",
      gap: 4,
      marginTop: 16,
      padding: 4,
    },
    purchaseKindButton: {
      alignItems: "center",
      borderRadius: 11,
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    purchaseKindButtonActive: {
      backgroundColor: colors.depth,
      shadowColor: colors.ink,
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    purchaseKindText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    purchaseKindTextActive: { color: colors.aqua },
    checkoutSection: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 18,
      padding: 13,
    },
    mobileDivisionDetail: {
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      marginTop: 9,
      paddingTop: 9,
    },
    mobileTicketList: { gap: 8, marginTop: 10 },
    mobileTicketRow: {
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 12,
      borderWidth: 1,
      padding: 11,
    },
    mobileTicketRowActive: {
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.34),
    },
    mobileTeamNotice: {
      alignItems: "flex-start",
      backgroundColor: rgba(colors.accentRgb, 0.07),
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 13,
      padding: 12,
    },
    mobileTeamIcon: { color: colors.aqua, fontSize: 17, marginTop: 1 },
    mobileFeatureRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
      marginTop: 10,
    },
    mobileFeatureIcon: { color: colors.aqua, fontSize: 12, marginTop: 1 },
    mobilePolicyNotice: {
      alignItems: "flex-start",
      backgroundColor: rgba(colors.warningRgb, 0.08),
      borderColor: rgba(colors.warningRgb, 0.2),
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginTop: 14,
      padding: 11,
    },
    mobilePolicyIcon: { color: colors.warning, fontSize: 14, marginTop: 1 },
    checkoutPlayer: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.03),
      borderRadius: 11,
      flexDirection: "row",
      gap: 9,
      marginTop: 10,
      padding: 9,
    },
    checkText: { color: colors.positive, fontSize: 15 },
    paymentRow: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.05),
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 11,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginTop: 9,
      padding: 10,
    },
    paymentIcon: { color: colors.aqua, fontSize: 17 },
    orderMath: {
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      marginTop: 20,
      paddingVertical: 10,
    },
    totalRow: {
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      marginTop: 8,
      paddingTop: 10,
    },
    totalAmount: { color: colors.bone, fontSize: 15, fontWeight: "900" },
    payButton: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 24,
      marginTop: 18,
      padding: 14,
    },
    payButtonText: { color: colors.onAccent, fontSize: 12, fontWeight: "900" },
    paymentTrust: {
      color: colors.muted,
      fontSize: 7,
      marginTop: 9,
      textAlign: "center",
    },
    completeState: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 25,
    },
    completeIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.positiveRgb, 0.1),
      borderColor: rgba(colors.positiveRgb, 0.25),
      borderRadius: 38,
      borderWidth: 1,
      height: 76,
      justifyContent: "center",
      marginBottom: 15,
      width: 76,
    },
    completeIconText: { color: colors.positive, fontSize: 28 },
    completeTitle: {
      color: colors.bone,
      fontSize: 48,
      fontWeight: "900",
      letterSpacing: -2.5,
      marginTop: 17,
    },
    completeBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 8,
      maxWidth: 300,
      textAlign: "center",
    },
  });
}

const lightStyles = createStyles(lightColors);
const darkStyles = createStyles(darkColors);
activePalette = lightColors;
let activeStyles = lightStyles;
const styles = new Proxy(lightStyles, {
  get(_target, property: keyof typeof lightStyles) {
    return activeStyles[property];
  },
}) as typeof lightStyles;
