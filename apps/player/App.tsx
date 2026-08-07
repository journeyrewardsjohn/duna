import {
  defaultEventMedia,
  formatMoney,
  formatVenueTime,
  type EventDivisionSummary,
  type PersonSummary,
  googleMapsSearchUrl,
  nativeMapUrl,
} from "@duna/core";
import type { DiscoveryMapItem } from "@duna/api";
import {
  demoBookings,
  demoEvents,
  demoMatches,
  demoPeople,
  demoPlayer,
  demoWalletEntries,
} from "@duna/core/demo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, SvgUri } from "react-native-svg";
import {
  startDunaLiveActivity,
  type LiveActivityPushToken,
} from "./live-activities";
import { dunaWebUrl, type DunaApiClient } from "./mobile-api";
import { presentNativeEventPayment } from "./native-payments";
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
import { HealthHistorySyncAgent } from "./health-history-sync-agent";
import { SessionArrivalCard } from "./session-arrival-card";
import { PlayerCalendarSettings } from "./calendar-settings";
import { TournamentPasses } from "./tournament-passes";
import {
  DiscoveryMapModal,
  DiscoveryMapPreview,
  DiscoverySearchModal,
} from "./discovery-map";
import {
  proEventFeaturedMedia,
  proEventMediaUrl,
  proEventSections,
  searchProEvents,
  sortProEvents,
  type ProTourSection,
} from "./pro-tour";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
  useFellixFonts,
} from "./fellix-text";

type MobileCoach = NonNullable<PlayerRuntime["coaches"]>[number];
type PlayerCoachingNote = NonNullable<PlayerRuntime["coachingNotes"]>[number];
type TeammateSearchResult = Awaited<
  ReturnType<DunaApiClient["player"]["teammateSearch"]["query"]>
>[number];
type DiscoveryCoordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

function discoveryDistance(
  origin: DiscoveryCoordinates | undefined,
  item: Pick<DiscoveryMapItem, "latitude" | "longitude">,
) {
  if (!origin || item.latitude === undefined || item.longitude === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(item.latitude - origin.latitude);
  const longitudeDelta = radians(item.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(item.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface RegistrationParticipant {
  readonly person: PersonSummary;
  readonly label: string;
  readonly available: boolean;
  readonly birthDate?: string;
  readonly ageBand?: "unknown" | "under-13" | "teen" | "adult";
  readonly genderCategory?: string;
}

function registrationParticipantEligibility(
  participant: RegistrationParticipant | undefined,
  division: EventDivisionSummary | undefined,
  eligibilityDate: string,
) {
  if (!participant?.available) {
    return { eligible: false, reason: "Guardian verification required" };
  }
  const rating = participant.person.rating.display;
  if (
    division?.ratingMinimum !== undefined &&
    rating < division.ratingMinimum
  ) {
    return {
      eligible: false,
      reason: `Rating must be ${division.ratingMinimum.toFixed(2)}+`,
    };
  }
  if (
    division?.ratingMaximum !== undefined &&
    rating > division.ratingMaximum
  ) {
    return {
      eligible: false,
      reason: `Rating must be ${division.ratingMaximum.toFixed(2)} or below`,
    };
  }
  const age = participant.birthDate
    ? Math.floor(
        (new Date(eligibilityDate).getTime() -
          new Date(`${participant.birthDate}T00:00:00Z`).getTime()) /
          (365.2425 * 24 * 60 * 60_000),
      )
    : undefined;
  if (
    division?.ageMinimum !== undefined &&
    (age === undefined || age < division.ageMinimum)
  ) {
    return {
      eligible: false,
      reason:
        age === undefined
          ? "Age verification required"
          : `Must be ${division.ageMinimum}+`,
    };
  }
  if (
    division?.ageMaximum !== undefined &&
    (age === undefined || age > division.ageMaximum)
  ) {
    return {
      eligible: false,
      reason:
        age === undefined
          ? "Age verification required"
          : `Must be ${division.ageMaximum} or younger`,
    };
  }
  const requiredGender = division?.gender?.toLowerCase() ?? "";
  const participantGender = participant.genderCategory?.toLowerCase() ?? "";
  const womenOnly = /women|woman|female|girls?/.test(requiredGender);
  const menOnly =
    !womenOnly && /(^|\W)(men|man|male|boys?)(\W|$)/.test(requiredGender);
  if (womenOnly || menOnly) {
    const matches = womenOnly
      ? /women|woman|female|girls?/.test(participantGender)
      : /(^|\W)(men|man|male|boys?)(\W|$)/.test(participantGender);
    if (!matches) {
      return {
        eligible: false,
        reason: participantGender
          ? `Not eligible for ${division?.gender}`
          : "Gender eligibility not verified",
      };
    }
  }
  return { eligible: true, reason: "Eligible" };
}

function registrationParticipantAge(
  participant: RegistrationParticipant,
  eligibilityDate: string,
) {
  if (participant.birthDate) {
    return `Age ${Math.max(
      0,
      Math.floor(
        (new Date(eligibilityDate).getTime() -
          new Date(`${participant.birthDate}T00:00:00Z`).getTime()) /
          (365.2425 * 24 * 60 * 60_000),
      ),
    )}`;
  }
  return participant.ageBand && participant.ageBand !== "unknown"
    ? participant.ageBand.replace("under-13", "Under 13")
    : "Age not set";
}
type MobilePlayerIntelligence = Awaited<
  ReturnType<DunaApiClient["public"]["playerIntelligence"]["query"]>
>;
type MobilePlayerPerformance = Awaited<
  ReturnType<DunaApiClient["public"]["playerPerformance"]["query"]>
>;
type MobilePerformanceMatch = MobilePlayerPerformance["history"][number];

const lightColors = {
  canvas: "#f6f5f1",
  ink: "#1b1b19",
  depth: "#ffffff",
  navy: "#efe6d3",
  navyLift: "#edece6",
  bone: "#1b1b19",
  muted: "#766f61",
  aqua: "#22343b",
  aquaDeep: "#3a3a36",
  sand: "#c9a96a",
  flare: "#e8683a",
  positive: "#2f6b3a",
  warning: "#8a6a2f",
  danger: "#9a4a2e",
  onAccent: "#ffffff",
  white: "#ffffff",
  overlayRgb: "27,27,25",
  accentRgb: "34,52,59",
  warningRgb: "138,106,47",
  positiveRgb: "47,107,58",
  dangerRgb: "154,74,46",
  flareRgb: "232,104,58",
  inkRgb: "27,27,25",
  depthRgb: "255,255,255",
  navyRgb: "239,230,211",
  boneRgb: "27,27,25",
  whiteRgb: "255,255,255",
} as const;

type Palette = {
  readonly [Key in keyof typeof lightColors]: string;
};

const darkColors: Palette = {
  canvas: "#141310",
  ink: "#0d1114",
  depth: "#1c1a16",
  navy: "#16232a",
  navyLift: "#24211c",
  bone: "#f2f0ea",
  muted: "#b8b4a8",
  aqua: "#b5ccd3",
  aquaDeep: "#8fb0bc",
  sand: "#d4b77c",
  flare: "#f4794c",
  positive: "#6bae78",
  warning: "#d4b77c",
  danger: "#c4785c",
  onAccent: "#0d1114",
  white: "#ffffff",
  overlayRgb: "242,240,234",
  accentRgb: "181,204,211",
  warningRgb: "212,183,124",
  positiveRgb: "107,174,120",
  dangerRgb: "196,120,92",
  flareRgb: "244,121,76",
  inkRgb: "13,17,20",
  depthRgb: "28,26,22",
  navyRgb: "22,35,42",
  boneRgb: "242,240,234",
  whiteRgb: "255,255,255",
};

type ThemeName = "light" | "dark";
type ThemePreference = ThemeName | "system";
const AnimatedSvgPath = Animated.createAnimatedComponent(Path);

let activePalette: Palette = lightColors;
const colors = new Proxy(lightColors, {
  get(_target, property: keyof Palette) {
    return activePalette[property];
  },
}) as Palette;

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => subscription.remove();
  }, []);
  return reduced;
}

const ThemeContext = createContext<{
  readonly theme: ThemeName;
  readonly preference: ThemePreference;
  readonly toggle: () => void;
}>({ theme: "light", preference: "light", toggle: () => undefined });

function ThemeButton() {
  const { preference, theme, toggle } = useContext(ThemeContext);
  return (
    <Pressable
      accessibilityLabel={`Theme: ${preference === "system" ? "match device" : preference}. Change theme`}
      onPress={() => {
        selectionHaptic();
        toggle();
      }}
      style={styles.themeButton}
    >
      <Text style={styles.themeButtonText}>
        {preference === "system" ? "◐" : theme === "light" ? "☾" : "☀"}
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
type MobilePredictionMarket = Awaited<
  ReturnType<DunaApiClient["public"]["proMatchPredictionMarket"]["query"]>
>;
type MobilePredictionTarget =
  | {
      readonly kind: "pro-match";
      readonly eventSlug: string;
      readonly matchId: string;
    }
  | {
      readonly kind: "pro-event-team";
      readonly eventSlug: string;
      readonly externalTeamId: string;
    };
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
      <View style={styles.mark}>
        <Svg height="30" viewBox="0 0 64 48" width="40">
          <Line
            opacity={0.38}
            stroke={pro ? colors.warning : colors.bone}
            strokeLinecap="round"
            strokeWidth="1.5"
            x1="5"
            x2="59"
            y1="34"
            y2="34"
          />
          <Path
            d="M6 36.5C17.5 36.5 22.4 31.7 29.2 26.3C36.3 20.7 45 18.4 58 11.5"
            fill="none"
            stroke={pro ? colors.warning : colors.bone}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4.5"
          />
        </Svg>
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

function organizationRoleLabel(role: string): string {
  if (role === "owner" || role === "admin") return "Admin";
  if (role === "front-desk") return "Front desk";
  return `${role[0]?.toUpperCase() ?? ""}${role.slice(1)}`;
}

function MemberOrganizationCard() {
  const {
    activeAuthOrganizationId,
    authOrganizations = [],
    isSwitchingOrganization,
    organizationAccess,
    organizationWallets,
    selfEnrollOrganizationStaff,
    switchOrganization,
  } = usePlayerRuntime();
  const [open, setOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<"coach" | "director">();
  const [error, setError] = useState<string>();
  const fallback =
    organizationWallets?.find(
      (organization) =>
        organization.membershipStatus === "active" &&
        organization.status === "active",
    ) ?? organizationWallets?.[0];
  const active = organizationAccess?.organizations.find(
    (organization) => organization.isActive,
  );
  const activeAuthOrganization = authOrganizations.find(
    (organization) => organization.id === activeAuthOrganizationId,
  );
  const organizationName =
    active?.name ??
    activeAuthOrganization?.name ??
    fallback?.organizationName ??
    organizationAccess?.organizations[0]?.name ??
    authOrganizations[0]?.name;
  if (!organizationName) return null;

  const identity = active?.staff?.active
    ? `Player · ${organizationRoleLabel(active.staff.role)}`
    : active?.roles.includes("owner") || active?.roles.includes("manager")
      ? "Player · Admin"
      : "Player";
  const organizationCount = Math.max(
    authOrganizations.length,
    organizationAccess?.organizations.length ?? 0,
  );
  const runSwitch = async (organizationId: string) => {
    if (!switchOrganization || organizationId === activeAuthOrganizationId)
      return;
    setError(undefined);
    try {
      await switchOrganization(organizationId);
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not switch organizations.",
      );
    }
  };
  const selfEnroll = async (staffRole: "coach" | "director") => {
    if (!selfEnrollOrganizationStaff) return;
    setError(undefined);
    setPendingRole(staffRole);
    try {
      await selfEnrollOrganizationStaff(staffRole);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not add your working role.",
      );
    } finally {
      setPendingRole(undefined);
    }
  };

  return (
    <>
      <Pressable
        accessibilityHint="Review your role or switch organizations"
        accessibilityLabel={`${organizationName}, ${identity}`}
        accessibilityRole="button"
        onPress={() => {
          selectionHaptic();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.memberOrganizationCard,
          pressed && styles.homeQuickActionPressed,
        ]}
      >
        <View style={styles.memberOrganizationMark}>
          <Text style={styles.memberOrganizationMarkText}>
            {organizationName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.memberOrganizationEyebrow}>YOUR DUNA</Text>
          <Text numberOfLines={1} style={styles.memberOrganizationName}>
            {organizationName}
          </Text>
          <Text style={styles.memberOrganizationMeta}>
            {identity}
            {fallback ? ` · ${fallback.credits.toLocaleString()} credits` : ""}
          </Text>
        </View>
        {organizationCount > 1 && (
          <Text style={styles.memberOrganizationCount}>
            {organizationCount}
          </Text>
        )}
        <Text style={styles.memberOrganizationArrow}>›</Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        visible={open}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.organizationModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>PLAYER + TEAM IDENTITY</Text>
              <Text style={styles.organizationModalTitle}>Your Duna.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close organization switcher"
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.coachModalClose}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.organizationModalContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.organizationModalIntro}>
              Keep your player identity while choosing the club or coaching
              business you are working with right now.
            </Text>

            {authOrganizations.length > 0 && (
              <View style={styles.organizationList}>
                {authOrganizations.map((organization) => {
                  const current = organization.id === activeAuthOrganizationId;
                  const dunaOrganization =
                    organizationAccess?.organizations.find(
                      (candidate) =>
                        candidate.name.toLowerCase() ===
                        organization.name.toLowerCase(),
                    );
                  const role = dunaOrganization?.staff?.active
                    ? `Player · ${organizationRoleLabel(dunaOrganization.staff.role)}`
                    : `Player · ${organizationRoleLabel(organization.role ?? "member")}`;
                  return (
                    <Pressable
                      accessibilityLabel={`Switch to ${organization.name}`}
                      accessibilityRole="button"
                      disabled={
                        !switchOrganization ||
                        current ||
                        isSwitchingOrganization
                      }
                      key={organization.id}
                      onPress={() => void runSwitch(organization.id)}
                      style={[
                        styles.organizationListRow,
                        current && styles.organizationListRowActive,
                      ]}
                    >
                      <View style={styles.organizationListMark}>
                        <Text style={styles.organizationListMarkText}>
                          {organization.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.organizationListName}>
                          {organization.name}
                        </Text>
                        <Text style={styles.organizationListRole}>{role}</Text>
                      </View>
                      <Text style={styles.organizationListAction}>
                        {current
                          ? "CURRENT"
                          : isSwitchingOrganization
                            ? "WAIT"
                            : "SWITCH"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {active?.canSelfEnroll && (
              <View style={styles.organizationEnrollCard}>
                <Text style={styles.organizationEnrollEyebrow}>
                  PUT YOURSELF ON THE SCHEDULE
                </Text>
                <Text style={styles.organizationEnrollTitle}>
                  Add your working role.
                </Text>
                <Text style={styles.organizationEnrollBody}>
                  You will keep your admin access and also become assignable to
                  schedules, sessions, and coaching work.
                </Text>
                <View style={styles.organizationEnrollActions}>
                  <Pressable
                    disabled={Boolean(pendingRole)}
                    onPress={() => void selfEnroll("coach")}
                    style={styles.organizationEnrollPrimary}
                  >
                    <Text style={styles.organizationEnrollPrimaryText}>
                      {pendingRole === "coach" ? "Adding…" : "Add as coach"}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={Boolean(pendingRole)}
                    onPress={() => void selfEnroll("director")}
                    style={styles.organizationEnrollSecondary}
                  >
                    <Text style={styles.organizationEnrollSecondaryText}>
                      {pendingRole === "director"
                        ? "Adding…"
                        : "Add as director"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {active?.canManage && (
              <Pressable
                accessibilityHint="Opens organization management in Duna HQ"
                accessibilityRole="link"
                onPress={() =>
                  void WebBrowser.openBrowserAsync("https://hq.duna.coach")
                }
                style={styles.organizationHqLink}
              >
                <View>
                  <Text style={styles.organizationHqEyebrow}>DUNA HQ</Text>
                  <Text style={styles.organizationHqTitle}>
                    Manage {active.name}
                  </Text>
                </View>
                <Text style={styles.organizationHqArrow}>↗</Text>
              </Pressable>
            )}

            {error && (
              <Text accessibilityRole="alert" style={styles.formError}>
                {error}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function CoachingNoteCard({ note }: { readonly note: PlayerCoachingNote }) {
  return (
    <View style={styles.coachingNoteCard}>
      <View style={styles.coachingNoteAccent} />
      <View style={styles.coachingNoteTop}>
        <View style={styles.coachingNoteMark}>
          <Text style={styles.coachingNoteMarkText}>✦</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.coachingNoteEyebrow}>FROM YOUR COACH</Text>
          <Text style={styles.coachingNoteTitle}>
            {note.subject ?? note.sessionTitle}
          </Text>
          <Text style={styles.coachingNoteMeta}>
            {note.coachName} · {note.organizationName} ·{" "}
            {new Date(note.publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
      </View>
      <Text style={styles.coachingNoteSummary}>{note.summary}</Text>
      <Text style={styles.coachingNoteSession}>{note.sessionTitle}</Text>
    </View>
  );
}

type HomeQuickAction =
  "find-match" | "book-court" | "join-event" | "record-video";

function HomeScreen({
  onAction,
  onBook,
}: {
  readonly onAction: (action: HomeQuickAction) => void;
  readonly onBook: (eventIndex: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const chartDraw = useRef(new Animated.Value(0)).current;
  const {
    client,
    coaches,
    coachingNotes,
    dashboard,
    mode,
    organizationWallets,
  } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const bookings = dashboard?.bookings ?? demoBookings;
  const events = dashboard?.events ?? demoEvents;
  const matches = dashboard?.recentMatches ?? demoMatches;
  const [performance, setPerformance] = useState<MobilePlayerPerformance>();
  const [selectedCoach, setSelectedCoach] = useState<MobileCoach>();

  useEffect(() => {
    if (!client || mode === "preview") return;
    let active = true;
    void client.public.playerPerformance
      .query({ handle: player.handle })
      .then((nextPerformance) => {
        if (active) setPerformance(nextPerformance);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, mode, player.handle]);

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
  const homeNow = Date.now();
  const nextBooking = [...bookings]
    .filter((booking) => new Date(booking.startsAt).getTime() >= homeNow)
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    )[0];
  const nextBookingEventIndex = nextBooking
    ? events.findIndex(
        (event) =>
          event.kind === nextBooking.kind &&
          event.venueName === nextBooking.venueName &&
          Math.abs(
            new Date(event.startsAt).getTime() -
              new Date(nextBooking.startsAt).getTime(),
          ) <
            15 * 60 * 1000,
      )
    : -1;
  const insight = dashboard?.feed[0];
  const performanceHistory = performance?.history ?? [];
  const verifiedWindow = [...performanceHistory].reverse().slice(-14);
  const verifiedTrend = verifiedWindow.map((match) => ({
    id: match.id,
    rating: match.afterDisplay,
    won: match.actualResult >= 0.5,
  }));
  const ratedFallbackMatches = [...matches]
    .reverse()
    .filter((match) => typeof match.ratingDelta === "number")
    .slice(-14);
  const fallbackStartRating =
    player.rating.display -
    ratedFallbackMatches.reduce(
      (total, match) => total + (match.ratingDelta ?? 0),
      0,
    );
  let fallbackRating = fallbackStartRating;
  const fallbackTrend = ratedFallbackMatches.map((match) => {
    fallbackRating += match.ratingDelta ?? 0;
    return {
      id: match.id,
      rating: fallbackRating,
      won: match.winner === "A",
    };
  });
  const trend = verifiedTrend.length ? verifiedTrend : fallbackTrend;
  const trendRatings = trend.map((point) => point.rating);
  const minimumRating = trendRatings.length
    ? Math.min(...trendRatings)
    : player.rating.display - 0.1;
  const maximumRating = trendRatings.length
    ? Math.max(...trendRatings)
    : player.rating.display + 0.1;
  const chartRange = Math.max(0.08, maximumRating - minimumRating);
  const chartPoints = trend.map((point, index) => ({
    ...point,
    x: 14 + (index / Math.max(1, trend.length - 1)) * 292,
    y: 108 - ((point.rating - minimumRating) / chartRange) * 88,
  }));
  const chartPath = chartPoints
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
  const chartPathLength = Math.max(
    1,
    chartPoints.slice(1).reduce((total, point, index) => {
      const previous = chartPoints[index];
      return previous
        ? total + Math.hypot(point.x - previous.x, point.y - previous.y)
        : total;
    }, 0),
  );
  const chartArea = chartPoints.length
    ? `${chartPath} L ${chartPoints.at(-1)!.x.toFixed(1)} 116 L ${chartPoints[0]!.x.toFixed(1)} 116 Z`
    : "";
  useEffect(() => {
    chartDraw.stopAnimation();
    if (reduceMotion || !chartPath) {
      chartDraw.setValue(1);
      return;
    }
    chartDraw.setValue(0);
    Animated.timing(chartDraw, {
      duration: 760,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false,
    }).start();
  }, [chartDraw, chartPath, reduceMotion]);
  const chartStrokeOffset = chartDraw.interpolate({
    inputRange: [0, 1],
    outputRange: [chartPathLength, 0],
  });
  const currentRating =
    trend.at(-1)?.rating ??
    performanceHistory[0]?.afterDisplay ??
    player.rating.display;
  const trendStartRating = verifiedTrend.length
    ? verifiedWindow[0]!.beforeDisplay
    : fallbackTrend.length
      ? fallbackStartRating
      : undefined;
  const ratingMovement =
    trendStartRating !== undefined
      ? currentRating - trendStartRating
      : (player.rating.delta ?? 0);
  const recentPerformance = performanceHistory.slice(0, 10);
  const recentWins = recentPerformance.length
    ? recentPerformance.filter((match) => match.actualResult >= 0.5).length
    : matches.slice(0, 10).filter((match) => match.winner === "A").length;
  const recentCount = recentPerformance.length || Math.min(10, matches.length);
  const firstName = player.displayName.split(" ")[0] ?? player.displayName;
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(new Date())
    .toUpperCase();
  const quickActions: readonly {
    readonly key: HomeQuickAction;
    readonly icon: string;
    readonly label: string;
    readonly meta: string;
  }[] = [
    {
      key: "find-match",
      icon: "⌖",
      label: "Find a Match",
      meta: "Open play nearby",
    },
    {
      key: "book-court",
      icon: "▦",
      label: "Book a Court",
      meta: "Live availability",
    },
    {
      key: "join-event",
      icon: "✦",
      label: "Join an Event",
      meta: "Tournaments + clinics",
    },
    {
      key: "record-video",
      icon: "●",
      label: "Record Video",
      meta: "Open Duna Vision",
    },
  ];

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader eyebrow="YOUR DAY" />
        <View style={styles.homeWelcome}>
          <View style={styles.flex}>
            <Text style={styles.homeWelcomeDate}>
              {today.replace(", ", " · ")}
            </Text>
            <Text style={styles.homeWelcomeTitle}>
              Ready to play, {firstName}?
            </Text>
            <Text style={styles.homeWelcomeBody}>
              Your next game, nearby courts, events, and performance in one
              place.
            </Text>
          </View>
          <View style={styles.homeRatingBadge}>
            <Text style={styles.homeRatingBadgeValue}>
              {currentRating.toFixed(2)}
            </Text>
            <Text style={styles.homeRatingBadgeLabel}>SAND</Text>
          </View>
        </View>

        {nextBooking ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              selectionHaptic();
              if (nextBookingEventIndex >= 0) {
                onBook(nextBookingEventIndex);
              } else {
                onAction("join-event");
              }
            }}
            style={({ pressed }) => [
              styles.homeNextSession,
              pressed && styles.homeQuickActionPressed,
            ]}
          >
            <View style={styles.homeNextDate}>
              <Text style={styles.homeNextDateMonth}>
                {new Date(nextBooking.startsAt)
                  .toLocaleDateString("en-US", { month: "short" })
                  .toUpperCase()}
              </Text>
              <Text style={styles.homeNextDateDay}>
                {new Date(nextBooking.startsAt).getDate()}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.homeNextEyebrow}>
                NEXT UP · {nextBooking.status.replace("-", " ").toUpperCase()}
              </Text>
              <Text style={styles.homeNextTitle}>{nextBooking.title}</Text>
              <Text style={styles.homeNextMeta}>
                {new Date(nextBooking.startsAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                · {nextBooking.venueName}
              </Text>
              {!["pickup", "court-rental"].includes(nextBooking.kind) && (
                <SessionArrivalCard booking={nextBooking} client={client} />
              )}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onAction("find-match")}
            style={styles.homeNextSession}
          >
            <View style={styles.homeNextOpenMark}>
              <Text style={styles.homeNextOpenMarkText}>＋</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.homeNextEyebrow}>YOUR CALENDAR IS OPEN</Text>
              <Text style={styles.homeNextTitle}>
                Find something worth playing.
              </Text>
              <Text style={styles.homeNextMeta}>
                Matches, courts, and events are ready nearby.
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

        <View style={styles.homeQuickGrid}>
          {quickActions.map((action, index) => (
            <Pressable
              accessibilityRole="button"
              key={action.key}
              onPress={() => {
                selectionHaptic();
                onAction(action.key);
              }}
              style={({ pressed }) => [
                styles.homeQuickAction,
                index === 0 && styles.homeQuickActionPrimary,
                index === 3 && styles.homeQuickActionWarm,
                pressed && styles.homeQuickActionPressed,
              ]}
            >
              <View
                style={[
                  styles.homeQuickIcon,
                  index === 0 && styles.homeQuickIconPrimary,
                ]}
              >
                <Text
                  style={[
                    styles.homeQuickIconText,
                    index === 0 && styles.homeQuickIconTextPrimary,
                  ]}
                >
                  {action.icon}
                </Text>
              </View>
              <Text
                style={[
                  styles.homeQuickLabel,
                  index === 0 && styles.homeQuickLabelPrimary,
                ]}
              >
                {action.label}
              </Text>
              <Text
                style={[
                  styles.homeQuickMeta,
                  index === 0 && styles.homeQuickMetaPrimary,
                ]}
              >
                {action.meta}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.homePerformanceCard}>
          <View style={styles.cardTitleRow}>
            <View>
              <Text style={styles.eyebrow}>YOUR PERFORMANCE</Text>
              <Text style={styles.homePerformanceTitle}>Form over time.</Text>
            </View>
            <Pill tone={ratingMovement >= 0 ? "positive" : "warning"}>
              {`${ratingMovement >= 0 ? "+" : ""}${ratingMovement.toFixed(2)}`}
            </Pill>
          </View>
          <View style={styles.homePerformanceSummary}>
            <View>
              <Text style={styles.homePerformanceValue}>
                {currentRating.toFixed(2)}
              </Text>
              <Text style={styles.homePerformanceLabel}>Sand Rating</Text>
            </View>
            <View>
              <Text style={styles.homePerformanceValue}>
                {recentCount
                  ? `${recentWins}–${recentCount - recentWins}`
                  : "—"}
              </Text>
              <Text style={styles.homePerformanceLabel}>Recent form</Text>
            </View>
            <View>
              <Text style={styles.homePerformanceValue}>
                {player.rating.percentile
                  ? `${player.rating.percentile}%`
                  : "—"}
              </Text>
              <Text style={styles.homePerformanceLabel}>Percentile</Text>
            </View>
          </View>
          {chartPoints.length ? (
            <View
              accessibilityLabel={`Rating trend across ${chartPoints.length} verified matches`}
              style={styles.homePerformanceChart}
            >
              <Svg height={132} viewBox="0 0 320 124" width="100%">
                {[28, 68, 108].map((y) => (
                  <Line
                    key={y}
                    stroke={rgba(colors.overlayRgb, 0.08)}
                    strokeWidth="1"
                    x1="12"
                    x2="308"
                    y1={y}
                    y2={y}
                  />
                ))}
                <AnimatedSvgPath
                  d={chartArea}
                  fill={rgba(colors.accentRgb, 0.09)}
                  opacity={chartDraw}
                />
                <AnimatedSvgPath
                  d={chartPath}
                  fill="none"
                  stroke={colors.aqua}
                  strokeDasharray={`${chartPathLength} ${chartPathLength}`}
                  strokeDashoffset={chartStrokeOffset}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="4"
                />
                {chartPoints.map((point) => (
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    fill={point.won ? colors.aqua : colors.danger}
                    key={point.id}
                    r="4.5"
                    stroke={colors.depth}
                    strokeWidth="2"
                  />
                ))}
              </Svg>
            </View>
          ) : (
            <View style={styles.homePerformanceEmpty}>
              <Text style={styles.homePerformanceEmptyMark}>↗</Text>
              <View style={styles.flex}>
                <Text style={styles.homePerformanceEmptyTitle}>
                  Your chart starts with a verified result.
                </Text>
                <Text style={styles.homePerformanceEmptyBody}>
                  Connect a match source or record a result to build your real
                  rating history.
                </Text>
              </View>
            </View>
          )}
          <View style={styles.homePerformanceLegend}>
            <Text style={styles.homePerformanceLegendWin}>● Win</Text>
            <Text style={styles.homePerformanceLegendLoss}>● Loss</Text>
            <Text style={styles.homePerformanceLegendMeta}>
              {chartPoints.length} rated results
            </Text>
          </View>
        </View>

        <MemberOrganizationCard />
        {homeEvents.length > 0 && (
          <>
            <SectionHeader
              action="Browse events"
              eyebrow="FROM YOUR CLUB"
              onAction={() => onAction("join-event")}
              title="Made for your membership."
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
        {coachingNotes?.[0] && (
          <>
            <SectionHeader
              action={
                coachingNotes.length > 1
                  ? `${coachingNotes.length} notes`
                  : undefined
              }
              eyebrow="COACHING"
              title="Carry the session forward."
            />
            <CoachingNoteCard note={coachingNotes[0]} />
          </>
        )}
        {homeCoaches.length > 0 && (
          <>
            <SectionHeader
              action={`${homeCoaches.length} coaches`}
              eyebrow="YOUR COACHES"
              title="Train with people you know."
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
        <SectionHeader
          action="See all"
          eyebrow={homeOrganization ? "EXPLORE NEARBY" : "MADE FOR YOUR LEVEL"}
          onAction={() => onAction("join-event")}
          title={homeOrganization ? "More ways to play." : "Play next."}
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
        {matches.length > 0 && (
          <>
            <SectionHeader
              action="Matches"
              eyebrow="RECENT FORM"
              title="Every result tells a story."
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
                      {match.score
                        .map((set) => `${set[0]}–${set[1]}`)
                        .join("  ")}
                    </Text>
                    {typeof match.ratingDelta === "number" && (
                      <Text style={[styles.rowMeta, styles.positiveText]}>
                        {match.ratingDelta >= 0 ? "+" : ""}
                        {match.ratingDelta.toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
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
  onAction,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <Pressable onPress={onAction}>
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

function localDateAnchor(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function addLocalDateDays(value: string, amount: number): string {
  const date = localDateAnchor(value);
  date.setDate(date.getDate() + amount);
  return localDateValue(date);
}

function localDateDistance(start: string, end: string): number {
  return Math.max(
    0,
    Math.round(
      (localDateAnchor(end).getTime() - localDateAnchor(start).getTime()) /
        86_400_000,
    ),
  );
}

function startOfLocalMonth(value: string): string {
  const date = localDateAnchor(value);
  date.setDate(1);
  return localDateValue(date);
}

function addLocalMonths(value: string, amount: number): string {
  const date = localDateAnchor(startOfLocalMonth(value));
  date.setMonth(date.getMonth() + amount);
  return localDateValue(date);
}

function localMonthCells(value: string): readonly (string | undefined)[] {
  const monthStart = localDateAnchor(startOfLocalMonth(value));
  const leading = monthStart.getDay();
  const lastDay = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  ).getDate();
  return [
    ...Array.from({ length: leading }, () => undefined),
    ...Array.from({ length: lastDay }, (_, index) =>
      addLocalDateDays(startOfLocalMonth(value), index),
    ),
  ];
}

function shortLocalWeekday(value: string): string {
  const weekday = localDateAnchor(value).getDay();
  return ["Sun", "Mon", "Tues", "Wed", "Thu", "Fri", "Sat"][weekday] ?? "";
}

function localMonthLabel(value: string): string {
  return localDateAnchor(value).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function instantLocalDateValue(instant: string, timezone?: string): string {
  if (!timezone) return localDateValue(new Date(instant));
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

type MobileCalendarMarker = {
  readonly booking: boolean;
  readonly event: boolean;
  readonly count: number;
};

function BookingCalendarModal({
  markers,
  maxDate,
  minDate,
  onClose,
  onExtendRange,
  onSelect,
  selectedDate,
  visible,
}: {
  readonly markers: ReadonlyMap<string, MobileCalendarMarker>;
  readonly maxDate: string;
  readonly minDate: string;
  readonly onClose: () => void;
  readonly onExtendRange: (requiredEnd?: string) => void;
  readonly onSelect: (date: string) => void;
  readonly selectedDate: string;
  readonly visible: boolean;
}) {
  const { width } = useWindowDimensions();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfLocalMonth(selectedDate),
  );
  const today = localDateValue(new Date());
  const months = [visibleMonth, addLocalMonths(visibleMonth, 1)] as const;

  useEffect(() => {
    if (visible) setVisibleMonth(startOfLocalMonth(selectedDate));
  }, [selectedDate, visible]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={styles.bookingCalendarSafe}
      >
        <View style={styles.bookingCalendarHeader}>
          <View style={styles.flex}>
            <Text style={styles.bookingCalendarEyebrow}>TWO-MONTH VIEW</Text>
            <Text style={styles.bookingCalendarTitle}>
              When do you want to play?
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close full calendar"
            onPress={onClose}
            style={styles.bookingCalendarClose}
          >
            <Text style={styles.bookingCalendarCloseText}>×</Text>
          </Pressable>
        </View>
        <View style={styles.bookingCalendarToolbar}>
          <Pressable
            accessibilityLabel="Previous month"
            disabled={visibleMonth <= startOfLocalMonth(minDate)}
            onPress={() =>
              setVisibleMonth((current) => addLocalMonths(current, -1))
            }
            style={styles.bookingCalendarNav}
          >
            <Text style={styles.bookingCalendarNavText}>‹</Text>
          </Pressable>
          <Text style={styles.bookingCalendarRange}>
            {localMonthLabel(visibleMonth)} – {localMonthLabel(months[1])}
          </Text>
          <Pressable
            accessibilityLabel="Next month"
            onPress={() => {
              const nextMonth = addLocalMonths(visibleMonth, 1);
              const endOfSecondMonth = addLocalDateDays(
                addLocalMonths(nextMonth, 2),
                -1,
              );
              onExtendRange(endOfSecondMonth);
              setVisibleMonth(nextMonth);
            }}
            style={styles.bookingCalendarNav}
          >
            <Text style={styles.bookingCalendarNavText}>›</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.bookingCalendarScroll}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.bookingCalendarMonths,
              width >= 720 && styles.bookingCalendarMonthsWide,
            ]}
          >
            {months.map((month) => (
              <View key={month} style={styles.bookingCalendarMonth}>
                <Text style={styles.bookingCalendarMonthTitle}>
                  {localMonthLabel(month)}
                </Text>
                <View style={styles.bookingCalendarWeekdayRow}>
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                    (weekday) => (
                      <Text key={weekday} style={styles.bookingCalendarWeekday}>
                        {weekday}
                      </Text>
                    ),
                  )}
                </View>
                <View style={styles.bookingCalendarGrid}>
                  {localMonthCells(month).map((date, index) => {
                    if (!date) {
                      return (
                        <View
                          key={`blank-${month}-${index}`}
                          style={styles.bookingCalendarBlank}
                        />
                      );
                    }
                    const marker = markers.get(date);
                    const disabled = date < minDate || date > maxDate;
                    const selected = date === selectedDate;
                    return (
                      <Pressable
                        accessibilityLabel={`${localDateAnchor(
                          date,
                        ).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}${marker ? `, ${marker.count} scheduled` : ""}`}
                        disabled={disabled}
                        key={date}
                        onPress={() => {
                          selectionHaptic();
                          onSelect(date);
                          onClose();
                        }}
                        style={[
                          styles.bookingCalendarDay,
                          date === today && styles.bookingCalendarDayToday,
                          selected && styles.bookingCalendarDaySelected,
                          disabled && styles.bookingCalendarDayDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bookingCalendarDayText,
                            selected && styles.bookingCalendarDayTextSelected,
                          ]}
                        >
                          {localDateAnchor(date).getDate()}
                        </Text>
                        {marker && (
                          <View style={styles.bookingCalendarMarkers}>
                            {marker.booking && (
                              <View
                                style={[
                                  styles.bookingCalendarMarker,
                                  styles.bookingCalendarMarkerBooking,
                                ]}
                              />
                            )}
                            {marker.event && (
                              <View
                                style={[
                                  styles.bookingCalendarMarker,
                                  styles.bookingCalendarMarkerEvent,
                                ]}
                              />
                            )}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
          <View style={styles.bookingCalendarLegend}>
            <View style={styles.bookingCalendarLegendItem}>
              <View
                style={[
                  styles.bookingCalendarMarker,
                  styles.bookingCalendarMarkerBooking,
                ]}
              />
              <Text style={styles.bookingCalendarLegendText}>Your plans</Text>
            </View>
            <View style={styles.bookingCalendarLegendItem}>
              <View
                style={[
                  styles.bookingCalendarMarker,
                  styles.bookingCalendarMarkerEvent,
                ]}
              />
              <Text style={styles.bookingCalendarLegendText}>
                Events to explore
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
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
  const { width } = useWindowDimensions();
  const { client, dashboard, mode, people, refresh } = usePlayerRuntime();
  const [todayValue] = useState(() => localDateValue(new Date()));
  const [inventory, setInventory] = useState<CourtInventory>();
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [dateRangeEnd, setDateRangeEnd] = useState(() =>
    addLocalDateDays(todayValue, 90),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
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
  const bookingDateScrollRef = useRef<ScrollView>(null);
  const bookingDateScrollX = useRef(0);
  const dateRailPositioned = useRef(false);

  const dates = Array.from(
    { length: localDateDistance(todayValue, dateRangeEnd) + 1 },
    (_, index) => addLocalDateDays(todayValue, index),
  );

  const extendDateRange = (requiredEnd?: string) => {
    setDateRangeEnd((current) => {
      if (requiredEnd && requiredEnd <= current) return current;
      let next = addLocalDateDays(current, 90);
      while (requiredEnd && next < requiredEnd) {
        next = addLocalDateDays(next, 90);
      }
      return next;
    });
  };
  const calendarMarkers = useMemo(() => {
    const next = new Map<string, MobileCalendarMarker>();
    const addMarker = (date: string, tone: "booking" | "event") => {
      const current = next.get(date) ?? {
        booking: false,
        event: false,
        count: 0,
      };
      next.set(date, {
        booking: current.booking || tone === "booking",
        event: current.event || tone === "event",
        count: current.count + 1,
      });
    };
    for (const booking of dashboard?.bookings ?? []) {
      addMarker(
        instantLocalDateValue(booking.startsAt, "America/Los_Angeles"),
        "booking",
      );
    }
    for (const event of dashboard?.events ?? []) {
      if (event.lifecycleStatus === "cancelled") continue;
      if (
        dashboard?.bookings.some(
          (booking) =>
            booking.title === event.title &&
            booking.startsAt === event.startsAt,
        )
      ) {
        continue;
      }
      addMarker(instantLocalDateValue(event.startsAt, event.timezone), "event");
    }
    return next;
  }, [dashboard]);
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
    if (!visible) {
      dateRailPositioned.current = false;
      return;
    }
    if (dateRailPositioned.current) return;
    if (selectedDate < todayValue || selectedDate > dateRangeEnd) return;
    const index = localDateDistance(todayValue, selectedDate);
    const frame = requestAnimationFrame(() => {
      const target = Math.max(0, index * 72 - (width - 64) / 2);
      bookingDateScrollRef.current?.scrollTo({
        animated: false,
        x: target,
      });
      dateRailPositioned.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [dateRangeEnd, selectedDate, todayValue, visible, width]);

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
          ? "Your free priority alert is active. Premium unlocks additional simultaneous alerts."
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
              <View style={styles.bookingDateToolbar}>
                <View style={styles.flex}>
                  <Text style={styles.bookingDateToolbarLabel}>
                    WHEN DO YOU WANT TO PLAY?
                  </Text>
                  <Text style={styles.bookingDateToolbarTitle}>
                    {localDateAnchor(selectedDate).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                </View>
                <View style={styles.bookingDateToolbarActions}>
                  <Pressable
                    accessibilityLabel="Show earlier dates"
                    onPress={() =>
                      bookingDateScrollRef.current?.scrollTo({
                        animated: true,
                        x: Math.max(0, bookingDateScrollX.current - 252),
                      })
                    }
                    style={styles.bookingDateNavButton}
                  >
                    <Text style={styles.bookingDateNavText}>‹</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Open full calendar"
                    onPress={() => {
                      selectionHaptic();
                      setCalendarOpen(true);
                    }}
                    style={styles.bookingDateCalendarButton}
                  >
                    <Text style={styles.bookingDateCalendarIcon}>▦</Text>
                    <Text style={styles.bookingDateCalendarText}>Calendar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Show later dates"
                    onPress={() => {
                      const target = bookingDateScrollX.current + 252;
                      if (target + width >= dates.length * 72 - width) {
                        extendDateRange();
                      }
                      bookingDateScrollRef.current?.scrollTo({
                        animated: true,
                        x: target,
                      });
                    }}
                    style={styles.bookingDateNavButton}
                  >
                    <Text style={styles.bookingDateNavText}>›</Text>
                  </Pressable>
                </View>
              </View>
              <ScrollView
                contentContainerStyle={styles.bookingDateRow}
                horizontal
                onScroll={(event) => {
                  const { contentOffset, contentSize, layoutMeasurement } =
                    event.nativeEvent;
                  bookingDateScrollX.current = contentOffset.x;
                  if (
                    contentOffset.x + layoutMeasurement.width >=
                    contentSize.width - layoutMeasurement.width
                  ) {
                    extendDateRange();
                  }
                }}
                ref={bookingDateScrollRef}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalBleed}
              >
                {dates.map((value) => {
                  const date = localDateAnchor(value);
                  const active = value === selectedDate;
                  const marker = calendarMarkers.get(value);
                  return (
                    <Pressable
                      accessibilityLabel={`${date.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}${marker ? `, ${marker.count} scheduled` : ""}`}
                      key={value}
                      onPress={() => {
                        selectionHaptic();
                        setSelectedDate(value);
                      }}
                      style={[
                        styles.bookingDate,
                        active && styles.bookingDateActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bookingDateDay,
                          active && styles.bookingDateTextActive,
                        ]}
                      >
                        {shortLocalWeekday(value)}
                      </Text>
                      <Text
                        style={[
                          styles.bookingDateNumber,
                          active && styles.bookingDateTextActive,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      <Text
                        style={[
                          styles.bookingDateMonth,
                          active && styles.bookingDateTextActive,
                        ]}
                      >
                        {date.toLocaleDateString("en-US", { month: "short" })}
                      </Text>
                      <View style={styles.bookingDateDots}>
                        {marker?.booking && (
                          <View
                            style={[
                              styles.bookingDateDot,
                              styles.bookingDateDotBooking,
                            ]}
                          />
                        )}
                        {marker?.event && (
                          <View
                            style={[
                              styles.bookingDateDot,
                              styles.bookingDateDotEvent,
                            ]}
                          />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
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
                    One active alert is included. Premium unlocks more.
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
        <BookingCalendarModal
          markers={calendarMarkers}
          maxDate={dateRangeEnd}
          minDate={todayValue}
          onClose={() => setCalendarOpen(false)}
          onExtendRange={extendDateRange}
          onSelect={setSelectedDate}
          selectedDate={selectedDate}
          visible={calendarOpen}
        />
      </SafeAreaView>
    </Modal>
  );
}

type ProCoverageEvent = NonNullable<
  PlayerRuntime["proCoverage"]
>["events"][number];
type ResolvedProEvent = NonNullable<ProEventDetail>;
type ProMatch = ResolvedProEvent["matches"][number];

const proTourSectionLabels: Record<ProTourSection, string> = {
  overview: "Overview",
  live: "Live",
  schedule: "Schedule",
  draw: "Draw",
  teams: "Teams",
  watch: "Watch",
};

function formatProEventDay(value?: string | null): string {
  if (!value) return "Date pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatProEventDates(start?: string | null, end?: string | null) {
  if (!start && !end) return "Dates to be announced";
  if (!start || !end || start === end) return formatProEventDay(start ?? end);
  return `${formatProEventDay(start)} – ${formatProEventDay(end)}`;
}

function countryFlag(code?: string | null): string {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || normalized.length !== 2) return "";
  return String.fromCodePoint(
    ...[...normalized].map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

function ProTourBrandMark({
  source,
  compact = false,
}: {
  readonly source: "fivb" | "avp";
  readonly compact?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [source]);
  const label = source === "avp" ? "AVP" : "BEACH PRO TOUR";
  const asset = source === "avp" ? "avp.svg" : "beach-pro-tour.svg";
  return (
    <View
      accessibilityLabel={
        source === "avp" ? "AVP" : "Volleyball World Beach Pro Tour"
      }
      style={[
        styles.proMobileBrandMark,
        compact && styles.proMobileBrandMarkCompact,
      ]}
    >
      {logoFailed ? (
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileBrandFallback,
            source === "avp" && styles.proMobileBrandFallbackAvp,
          ]}
        >
          {label}
        </Text>
      ) : (
        <SvgUri
          height={compact ? 26 : 36}
          onError={() => setLogoFailed(true)}
          uri={`${dunaWebUrl}/media/tours/${asset}`}
          width={compact ? 58 : 84}
        />
      )}
    </View>
  );
}

function ProTourEventCard({
  event,
  onPress,
}: {
  readonly event: ProCoverageEvent;
  readonly onPress: () => void;
}) {
  const live = event.live;
  return (
    <Pressable
      accessibilityLabel={`Open ${event.name}${live ? ", live now" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.proMobileEventCard,
        live && styles.proMobileEventCardLive,
        pressed && styles.proMobilePressed,
      ]}
    >
      <ProTourBrandMark compact source={event.source} />
      <View style={styles.proMobileEventCardBody}>
        <View style={styles.proMobileEventKickerRow}>
          <Text
            style={[
              styles.proMobileEventStatus,
              live && styles.proMobileEventStatusLive,
            ]}
          >
            {live ? "● LIVE NOW" : event.status.toUpperCase()}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.proMobileEventDivision,
              live && styles.proMobileEventDivisionLive,
            ]}
          >
            {event.genderCategory}
          </Text>
        </View>
        <Text
          numberOfLines={2}
          style={[
            styles.proMobileEventName,
            live && styles.proMobileEventNameLive,
          ]}
        >
          {event.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileEventMeta,
            live && styles.proMobileEventMetaLive,
          ]}
        >
          {formatProEventDates(event.startsOn, event.endsOn)} ·{" "}
          {event.location ?? "Location pending"}
        </Text>
      </View>
      <Text
        aria-hidden
        style={[
          styles.proMobileEventArrow,
          live && styles.proMobileEventArrowLive,
        ]}
      >
        ›
      </Text>
    </Pressable>
  );
}

function mobilePredictionPercent(priceBps: number) {
  return `${Math.round(priceBps / 100)}%`;
}

function MobilePredictionChart({
  market,
}: {
  readonly market: MobilePredictionMarket;
}) {
  const { width } = useWindowDimensions();
  const reveal = useRef(new Animated.Value(0)).current;
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, market.history.length - 1),
  );
  const data = useMemo(() => {
    const points = market.history.length
      ? [...market.history]
      : [
          {
            recordedAt: new Date().toISOString(),
            yesPriceBps: market.yesPriceBps,
            volumeCredits: market.volumeCredits,
            source: "model" as const,
          },
        ];
    return points.length === 1 ? [points[0]!, points[0]!] : points;
  }, [market]);
  const chartWidth = Math.max(260, Math.min(700, width - 46));
  const chartHeight = 190;
  const padX = 9;
  const padY = 18;
  const xFor = (index: number) =>
    padX + (index / Math.max(1, data.length - 1)) * (chartWidth - padX * 2);
  const yFor = (priceBps: number) =>
    padY + ((10_000 - priceBps) / 10_000) * (chartHeight - padY * 2);
  const pathFor = (side: "yes" | "no") =>
    data
      .map((point, index) => {
        const price =
          side === "yes" ? point.yesPriceBps : 10_000 - point.yesPriceBps;
        return `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(price).toFixed(1)}`;
      })
      .join(" ");
  const selected = data[Math.min(selectedIndex, data.length - 1)] ?? data[0]!;
  const selectedX = xFor(Math.min(selectedIndex, data.length - 1));

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      duration: 460,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [market.id, reveal]);

  const selectFromTouch = (locationX: number) => {
    const ratio = Math.max(0, Math.min(1, locationX / chartWidth));
    setSelectedIndex(Math.round(ratio * (data.length - 1)));
  };

  return (
    <Animated.View
      accessibilityLabel={`Crowd prediction history for ${market.title}`}
      style={[
        styles.mobilePredictionChart,
        {
          opacity: reveal,
          transform: [
            {
              translateY: reveal.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.mobilePredictionChartLegend}>
        <View style={styles.mobilePredictionChartLegendItem}>
          <View style={styles.mobilePredictionChartDotYes} />
          <Text
            numberOfLines={1}
            style={styles.mobilePredictionChartLegendText}
          >
            {market.yesLabel}
          </Text>
          <Text style={styles.mobilePredictionChartLegendValue}>
            {mobilePredictionPercent(selected.yesPriceBps)}
          </Text>
        </View>
        <View style={styles.mobilePredictionChartLegendItem}>
          <View style={styles.mobilePredictionChartDotNo} />
          <Text
            numberOfLines={1}
            style={styles.mobilePredictionChartLegendText}
          >
            {market.noLabel}
          </Text>
          <Text style={styles.mobilePredictionChartLegendValue}>
            {mobilePredictionPercent(10_000 - selected.yesPriceBps)}
          </Text>
        </View>
      </View>
      <View
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) =>
          selectFromTouch(event.nativeEvent.locationX)
        }
        onResponderMove={(event) =>
          selectFromTouch(event.nativeEvent.locationX)
        }
        onStartShouldSetResponder={() => true}
      >
        <Svg
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width={chartWidth}
        >
          {[2_500, 5_000, 7_500].map((price) => (
            <Line
              key={price}
              stroke={rgba(colors.overlayRgb, 0.08)}
              strokeDasharray="3 5"
              x1={padX}
              x2={chartWidth - padX}
              y1={yFor(price)}
              y2={yFor(price)}
            />
          ))}
          <Path
            d={pathFor("yes")}
            fill="none"
            stroke={colors.aqua}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          <Path
            d={pathFor("no")}
            fill="none"
            stroke={colors.sand}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          <Line
            stroke={rgba(colors.overlayRgb, 0.22)}
            strokeWidth={1}
            x1={selectedX}
            x2={selectedX}
            y1={padY}
            y2={chartHeight - padY}
          />
          <Circle
            cx={selectedX}
            cy={yFor(selected.yesPriceBps)}
            fill={colors.aqua}
            r={5}
            stroke={colors.depth}
            strokeWidth={2}
          />
          <Circle
            cx={selectedX}
            cy={yFor(10_000 - selected.yesPriceBps)}
            fill={colors.sand}
            r={5}
            stroke={colors.depth}
            strokeWidth={2}
          />
        </Svg>
      </View>
      <View style={styles.mobilePredictionChartFooter}>
        <Text style={styles.mobilePredictionChartTime}>
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(selected.recordedAt))}
        </Text>
        <Text style={styles.mobilePredictionChartVolume}>
          {Math.round(market.volumeCredits).toLocaleString("en-US")} matched ·{" "}
          {market.participantCount} people
        </Text>
      </View>
    </Animated.View>
  );
}

function MobilePredictionMarketSheet({
  client,
  market: initialMarket,
  onClose,
  onPlaced,
  target,
  wallet,
}: {
  readonly client?: DunaApiClient;
  readonly market: MobilePredictionMarket;
  readonly onClose: () => void;
  readonly onPlaced: () => Promise<void>;
  readonly target: MobilePredictionTarget;
  readonly wallet?: PlayerRuntime["predictionWallet"];
}) {
  const [market, setMarket] = useState(initialMarket);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [credits, setCredits] = useState("1");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const available = Math.floor(wallet?.availableCredits ?? 0);
  const amount = Math.max(0, Number.parseInt(credits || "0", 10) || 0);
  const priceBps = side === "yes" ? market.yesPriceBps : market.noPriceBps;
  const selectedLabel = side === "yes" ? market.yesLabel : market.noLabel;
  const estimatedShares = amount / (priceBps / 10_000);
  const canSubmit =
    Boolean(client) &&
    market.status === "open" &&
    amount >= 1 &&
    amount <= available &&
    !busy;

  const reloadMarket = async () => {
    if (!client) return;
    const next =
      target.kind === "pro-match"
        ? await client.public.proMatchPredictionMarket.query({
            eventSlug: target.eventSlug,
            matchId: target.matchId,
          })
        : (
            await client.public.proEventPredictionMarkets.query({
              eventSlug: target.eventSlug,
            })
          ).find((candidate) => candidate.id === market.id);
    if (next) setMarket(next);
  };

  const placeOrder = async () => {
    if (!client || !canSubmit) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const shared = {
        credits: amount,
        idempotencyKey: Crypto.randomUUID(),
        limitPriceBps: priceBps,
      };
      const result =
        target.kind === "pro-match"
          ? await client.player.placeProMatchPredictionOrder.mutate({
              ...shared,
              eventSlug: target.eventSlug,
              matchId: target.matchId,
              side: side === "yes" ? "A" : "B",
            })
          : await client.player.placeProEventTeamPredictionOrder.mutate({
              ...shared,
              eventSlug: target.eventSlug,
              externalTeamId: target.externalTeamId,
              side,
            });
      await Promise.all([onPlaced(), reloadMarket()]);
      setReviewing(false);
      setMessage(
        result.status === "filled"
          ? "Matched. Your immutable position is in the ledger."
          : "Placed in the order book. Unmatched credits stay reserved.",
      );
      successHaptic();
    } catch (reason) {
      setMessage(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.mobilePredictionSheetHeader}>
          <View style={styles.flex}>
            <Text style={styles.mobilePredictionSheetEyebrow}>
              CROWD PREDICTION · NO CASH VALUE
            </Text>
            <Text numberOfLines={2} style={styles.mobilePredictionSheetTitle}>
              {market.title}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close prediction market"
            onPress={onClose}
            style={styles.proMobileHeaderButton}
          >
            <Text style={styles.proMobileHeaderCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.mobilePredictionSheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MobilePredictionChart market={market} />
          <View style={styles.mobilePredictionTradeCard}>
            <View style={styles.mobilePredictionTradeBalanceRow}>
              <View>
                <Text style={styles.mobilePredictionTradeEyebrow}>
                  AVAILABLE
                </Text>
                <Text style={styles.mobilePredictionTradeBalance}>
                  {available.toLocaleString("en-US")} credits
                </Text>
              </View>
              <View
                style={[
                  styles.mobilePredictionStatusPill,
                  market.status !== "open" &&
                    styles.mobilePredictionStatusPillClosed,
                ]}
              >
                <Text style={styles.mobilePredictionStatusPillText}>
                  {market.status === "open"
                    ? "OPEN"
                    : market.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.mobilePredictionTradeLabel}>
              What do you think happens?
            </Text>
            <View style={styles.mobilePredictionSideGrid}>
              {(["yes", "no"] as const).map((option) => {
                const selected = side === option;
                const optionPrice =
                  option === "yes" ? market.yesPriceBps : market.noPriceBps;
                return (
                  <Pressable
                    accessibilityState={{ selected }}
                    key={option}
                    onPress={() => {
                      selectionHaptic();
                      setSide(option);
                      setReviewing(false);
                    }}
                    style={[
                      styles.mobilePredictionSideButton,
                      selected && styles.mobilePredictionSideButtonSelected,
                      selected &&
                        option === "no" &&
                        styles.mobilePredictionSideButtonSelectedNo,
                    ]}
                  >
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.mobilePredictionSideLabel,
                        selected && styles.mobilePredictionSideLabelSelected,
                      ]}
                    >
                      {option === "yes" ? market.yesLabel : market.noLabel}
                    </Text>
                    <Text
                      style={[
                        styles.mobilePredictionSidePrice,
                        selected && styles.mobilePredictionSidePriceSelected,
                      ]}
                    >
                      {mobilePredictionPercent(optionPrice)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.mobilePredictionAmountHeader}>
              <Text style={styles.mobilePredictionTradeLabel}>Credits</Text>
              <Text style={styles.mobilePredictionAmountHint}>
                ≈{" "}
                {estimatedShares.toLocaleString("en-US", {
                  maximumFractionDigits: 1,
                })}{" "}
                shares if matched
              </Text>
            </View>
            <TextInput
              accessibilityLabel="Prediction credits to allocate"
              keyboardType="number-pad"
              onChangeText={(value) => {
                setCredits(value.replace(/[^0-9]/g, ""));
                setReviewing(false);
              }}
              style={styles.mobilePredictionAmountInput}
              value={credits}
            />
            <View style={styles.mobilePredictionQuickRow}>
              {[1, 5, 25].map((quickAmount) => (
                <Pressable
                  key={quickAmount}
                  onPress={() => {
                    selectionHaptic();
                    setCredits(String(Math.min(available, quickAmount)));
                    setReviewing(false);
                  }}
                  style={styles.mobilePredictionQuickButton}
                >
                  <Text style={styles.mobilePredictionQuickButtonText}>
                    +{quickAmount}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  selectionHaptic();
                  setCredits(String(available));
                  setReviewing(false);
                }}
                style={styles.mobilePredictionQuickButton}
              >
                <Text style={styles.mobilePredictionQuickButtonText}>ALL</Text>
              </Pressable>
            </View>
            {amount > available && (
              <Text style={styles.formError}>
                You only have {available.toLocaleString("en-US")} credits
                available.
              </Text>
            )}
            {reviewing && (
              <View style={styles.mobilePredictionReviewCard}>
                <Text style={styles.mobilePredictionReviewEyebrow}>
                  FINAL REVIEW
                </Text>
                <Text style={styles.mobilePredictionReviewTitle}>
                  Allocate {amount.toLocaleString("en-US")} credits to{" "}
                  {selectedLabel}?
                </Text>
                <Text style={styles.mobilePredictionReviewBody}>
                  This order cannot be edited or withdrawn after confirmation.
                  It may fill immediately, partially, or remain open in the
                  order book.
                </Text>
              </View>
            )}
            {message && (
              <Text style={styles.mobilePredictionMessage}>{message}</Text>
            )}
            {!client || !market.viewer.authenticated ? (
              <Pressable
                onPress={() =>
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/sign-in?returnTo=${encodeURIComponent(`/events/${target.eventSlug}`)}`,
                  )
                }
                style={styles.mobilePredictionTradeButton}
              >
                <Text style={styles.mobilePredictionTradeButtonText}>
                  Sign in to predict
                </Text>
              </Pressable>
            ) : reviewing ? (
              <Pressable
                disabled={!canSubmit}
                onPress={() => void placeOrder()}
                style={[
                  styles.mobilePredictionTradeButton,
                  !canSubmit && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.mobilePredictionTradeButtonText}>
                  {busy ? "Recording…" : "Confirm immutable position"}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={!canSubmit}
                onPress={() => {
                  selectionHaptic();
                  setReviewing(true);
                }}
                style={[
                  styles.mobilePredictionTradeButton,
                  !canSubmit && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.mobilePredictionTradeButtonText}>
                  Review position
                </Text>
              </Pressable>
            )}
            <Text style={styles.mobilePredictionTradeFootnote}>
              Prediction credits cannot be bought, transferred, redeemed, cashed
              out, or exchanged for prizes. Market prices are crowd signals, not
              odds.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function MobileTournamentMarkets({
  event,
  markets,
  onOpen,
}: {
  readonly event: ResolvedProEvent;
  readonly markets: readonly MobilePredictionMarket[];
  readonly onOpen: (
    market: MobilePredictionMarket,
    externalTeamId: string,
  ) => void;
}) {
  if (!markets.length) return null;
  return (
    <View style={styles.mobileTournamentMarkets}>
      <View style={styles.mobileTournamentMarketsHeader}>
        <View>
          <Text style={styles.proMobileSectionEyebrow}>TOURNAMENT MARKET</Text>
          <Text style={styles.mobileTournamentMarketsTitle}>
            Who wins it all?
          </Text>
        </View>
        <Text style={styles.mobileTournamentMarketsBadge}>FREE CREDITS</Text>
      </View>
      {markets.slice(0, 12).map((market, index) => {
        const entry = event.winnerPrediction.entries[index];
        if (!entry) return null;
        const first = market.history[0]?.yesPriceBps ?? market.yesPriceBps;
        const change = (market.yesPriceBps - first) / 100;
        return (
          <Pressable
            key={market.id}
            onPress={() => onOpen(market, entry.externalTeamId)}
            style={({ pressed }) => [
              styles.mobileTournamentMarketRow,
              pressed && styles.proMobilePressed,
            ]}
          >
            <View style={styles.mobileTournamentMarketCopy}>
              <Text numberOfLines={1} style={styles.mobileTournamentMarketName}>
                {countryFlag(entry.countryCode)} {entry.label}
              </Text>
              <View style={styles.mobileTournamentMarketTrack}>
                <View
                  style={[
                    styles.mobileTournamentMarketFill,
                    { width: `${market.yesPriceBps / 100}%` },
                  ]}
                />
              </View>
            </View>
            <View style={styles.mobileTournamentMarketPriceBlock}>
              <Text style={styles.mobileTournamentMarketPrice}>
                {mobilePredictionPercent(market.yesPriceBps)}
              </Text>
              <Text
                style={[
                  styles.mobileTournamentMarketChange,
                  change < 0 && styles.mobileTournamentMarketChangeDown,
                ]}
              >
                {change === 0
                  ? "—"
                  : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}
              </Text>
            </View>
            <Text style={styles.mobileTournamentMarketArrow}>›</Text>
          </Pressable>
        );
      })}
      <Text style={styles.mobileTournamentMarketsFootnote}>
        Buy a team to win or not win. One credit-funded order book per team.
      </Text>
    </View>
  );
}

function ProTourMatchCard({
  match,
  followed,
  onFollow,
  onOpen,
}: {
  readonly match: ProMatch;
  readonly followed: boolean;
  readonly onFollow?: () => void;
  readonly onOpen?: () => void;
}) {
  const live = match.status === "live";
  const time =
    match.time ??
    (match.playedAt
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(match.playedAt))
      : "Time pending");
  const scores = (side: "a" | "b") =>
    match.sets.map((set) => set[side]).join("  ") || "—";
  return (
    <Pressable
      accessibilityHint="Opens scores, history, and the crowd market"
      accessibilityLabel={`Open ${match.teamA.label} versus ${match.teamB.label}`}
      disabled={!onOpen}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.proMobileMatchCard,
        live && styles.proMobileMatchCardLive,
        pressed && styles.proMobilePressed,
      ]}
    >
      <View style={styles.proMobileMatchHeader}>
        <Text
          style={[
            styles.proMobileMatchStatus,
            live && styles.proMobileMatchStatusLive,
          ]}
        >
          {live
            ? "● LIVE"
            : match.status === "completed"
              ? "FINAL"
              : "UPCOMING"}
        </Text>
        <Text numberOfLines={1} style={styles.proMobileMatchMeta}>
          {match.roundLabel} · {time}
          {match.court ? ` · ${match.court}` : ""}
        </Text>
      </View>
      <View style={styles.proMobileMatchTeamRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileMatchTeam,
            match.winnerSide === "A" && styles.proMobileMatchWinner,
          ]}
        >
          {match.teamA.label}
        </Text>
        <Text style={styles.proMobileMatchScore}>{scores("a")}</Text>
      </View>
      <View style={styles.proMobileMatchTeamRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileMatchTeam,
            match.winnerSide === "B" && styles.proMobileMatchWinner,
          ]}
        >
          {match.teamB.label}
        </Text>
        <Text style={styles.proMobileMatchScore}>{scores("b")}</Text>
      </View>
      <View style={styles.proMobileMatchFooter}>
        <View style={styles.proMobileMatchPrediction}>
          <View style={styles.proMobileMatchPredictionLabels}>
            <Text style={styles.proMobileMatchPredictionValue}>
              {match.prediction.teamA.toFixed(0)}%
            </Text>
            <Text style={styles.proMobileMatchPredictionCaption}>
              DUNA FORECAST
            </Text>
            <Text style={styles.proMobileMatchPredictionValue}>
              {match.prediction.teamB.toFixed(0)}%
            </Text>
          </View>
          <View style={styles.proMobileMatchPredictionTrack}>
            <View
              style={[
                styles.proMobileMatchPredictionFill,
                { width: `${match.prediction.teamA}%` },
              ]}
            />
          </View>
        </View>
        {onFollow && (
          <Pressable
            accessibilityLabel={
              followed ? "Following match on Lock Screen" : "Follow match"
            }
            onPress={(event) => {
              event.stopPropagation();
              onFollow();
            }}
            style={[
              styles.proMobileFollowButton,
              followed && styles.proMobileFollowButtonActive,
            ]}
          >
            <Text
              style={[
                styles.proMobileFollowButtonText,
                followed && styles.proMobileFollowButtonTextActive,
              ]}
            >
              {followed ? "Following" : live ? "Follow live" : "Follow"}
            </Text>
          </Pressable>
        )}
        {onOpen && !onFollow && (
          <Text style={styles.proMobileMatchOpenArrow}>›</Text>
        )}
      </View>
    </Pressable>
  );
}

function ProTourSectionTitle({
  eyebrow,
  title,
  trailing,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly trailing?: string;
}) {
  return (
    <View style={styles.proMobileSectionTitleRow}>
      <View style={styles.proMobileSectionTitleCopy}>
        <Text style={styles.proMobileSectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.proMobileSectionTitle}>{title}</Text>
      </View>
      {trailing && <Text style={styles.proMobileSectionCount}>{trailing}</Text>}
    </View>
  );
}

function ProTourModal({
  visible,
  onClose,
  initialSlug,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly initialSlug?: string;
}) {
  const { width } = useWindowDimensions();
  const { client, predictionWallet, publicClient, proCoverage, refresh } =
    usePlayerRuntime();
  const coverageClient = publicClient ?? client;
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [event, setEvent] = useState<ProEventDetail>();
  const [tournamentMarkets, setTournamentMarkets] = useState<
    readonly MobilePredictionMarket[]
  >([]);
  const [selectedMarket, setSelectedMarket] = useState<{
    readonly market: MobilePredictionMarket;
    readonly target: MobilePredictionTarget;
  }>();
  const [marketLoadingId, setMarketLoadingId] = useState<string>();
  const [activeSection, setActiveSection] =
    useState<ProTourSection>("overview");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  const [followedMatchId, setFollowedMatchId] = useState<string>();
  const [followedEventIds, setFollowedEventIds] = useState<readonly string[]>(
    [],
  );
  const [followNotice, setFollowNotice] = useState<string>();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const events = proCoverage?.events ?? [];
  const orderedEvents = useMemo(() => sortProEvents(events), [events]);
  const filteredEvents = useMemo(
    () => searchProEvents(orderedEvents, search),
    [orderedEvents, search],
  );
  const liveEvents = orderedEvents.filter((candidate) => candidate.live);
  const otherEvents = orderedEvents.filter((candidate) => !candidate.live);

  useEffect(() => {
    if (!visible) {
      setSelectedSlug(undefined);
      setEvent(undefined);
      setTournamentMarkets([]);
      setSelectedMarket(undefined);
      setMarketLoadingId(undefined);
      setActiveSection("overview");
      setSearch("");
      setError(undefined);
      setFollowNotice(undefined);
      setCopiedAddress(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && initialSlug) setSelectedSlug(initialSlug);
  }, [initialSlug, visible]);

  useEffect(() => {
    if (!copiedAddress) return;
    const resetCopyState = setTimeout(() => setCopiedAddress(false), 2400);
    return () => clearTimeout(resetCopyState);
  }, [copiedAddress]);

  useEffect(() => {
    if (!visible || !selectedSlug) return;
    if (!coverageClient) {
      setLoading(false);
      setError("Live event data is unavailable. Please try again in a moment.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setPosterFailed(false);
    void Promise.all([
      coverageClient.public.proEvent.query({ slug: selectedSlug }),
      coverageClient.public.proEventPredictionMarkets
        .query({ eventSlug: selectedSlug })
        .catch(() => []),
    ])
      .then(([nextEvent, nextMarkets]) => {
        if (cancelled) return;
        if (!nextEvent) {
          setError("This event is not available yet.");
          return;
        }
        setEvent(nextEvent);
        setTournamentMarkets(nextMarkets);
        setActiveSection("overview");
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
  }, [coverageClient, reloadKey, selectedSlug, visible]);

  useEffect(() => {
    if (!visible) return;
    void Promise.all([
      AsyncStorage.getItem("duna.followed-pro-match"),
      AsyncStorage.getItem("duna.followed-pro-events"),
    ]).then(([matchId, eventIds]) => {
      setFollowedMatchId(matchId ?? undefined);
      try {
        const parsed = eventIds ? (JSON.parse(eventIds) as unknown) : [];
        setFollowedEventIds(
          Array.isArray(parsed)
            ? parsed.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
        );
      } catch {
        setFollowedEventIds([]);
      }
    });
  }, [visible]);

  useEffect(() => {
    if (!client || !event?.id) return;
    let active = true;
    void client.player.professionalEventFollowState
      .query({ eventId: event.id })
      .then((state) => {
        if (!active || !state.available) return;
        setFollowedEventIds((current) =>
          state.following
            ? [...new Set([...current, event.id])]
            : current.filter((eventId) => eventId !== event.id),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, event?.id]);

  const openEvent = (slug: string) => {
    selectionHaptic();
    setEvent(undefined);
    setTournamentMarkets([]);
    setSelectedMarket(undefined);
    setError(undefined);
    setFollowNotice(undefined);
    setCopiedAddress(false);
    setSelectedSlug(slug);
  };

  const backToEvents = () => {
    selectionHaptic();
    setSelectedSlug(undefined);
    setEvent(undefined);
    setTournamentMarkets([]);
    setSelectedMarket(undefined);
    setError(undefined);
    setActiveSection("overview");
    setCopiedAddress(false);
  };

  const handleClose = () => {
    setSelectedSlug(undefined);
    setEvent(undefined);
    setTournamentMarkets([]);
    setSelectedMarket(undefined);
    setSearch("");
    onClose();
  };

  const openMatchMarket = async (match: ProMatch) => {
    if (!coverageClient || !event || marketLoadingId) return;
    selectionHaptic();
    setMarketLoadingId(match.id);
    setFollowNotice("Opening the crowd market…");
    try {
      const market = await coverageClient.public.proMatchPredictionMarket.query(
        {
          eventSlug: event.slug,
          matchId: match.id,
        },
      );
      setSelectedMarket({
        market,
        target: {
          kind: "pro-match",
          eventSlug: event.slug,
          matchId: match.id,
        },
      });
      setFollowNotice(undefined);
    } catch (reason) {
      setFollowNotice(displayError(reason));
    } finally {
      setMarketLoadingId(undefined);
    }
  };

  const openTournamentMarket = (
    market: MobilePredictionMarket,
    externalTeamId: string,
  ) => {
    if (!event) return;
    selectionHaptic();
    setSelectedMarket({
      market,
      target: {
        kind: "pro-event-team",
        eventSlug: event.slug,
        externalTeamId,
      },
    });
  };

  const followMatch = async (match: ProMatch) => {
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

  const followEvent = async () => {
    if (!event) return;
    if (client) {
      await client.player.setProfessionalEventFollow.mutate({
        eventId: event.id,
        following: true,
      });
    }
    const featured =
      event.matches.find((match) => match.status === "live") ??
      event.matches.find((match) => match.status === "scheduled") ??
      event.matches.at(-1);
    const latestSet = featured?.sets.at(-1);
    await startDunaLiveActivity(
      {
        subjectId: event.id,
        kind: "event",
        title: event.name,
        subtitle: event.location ?? "Beach Pro Tour",
        status: event.live ? "Live" : "Following",
        teamA: featured?.teamA.label,
        teamB: featured?.teamB.label,
        scoreA: latestSet?.a ?? 0,
        scoreB: latestSet?.b ?? 0,
        setLabel: featured
          ? `Set ${Math.max(featured.sets.length, 1)}`
          : `${event.matches.length} matches`,
        liveMatchCount: event.matches.filter((match) => match.status === "live")
          .length,
      },
      {
        onPushToken: (token) => {
          void rememberLiveActivityToken(token, client).catch(() => undefined);
        },
      },
    );
    const next = [...new Set([...followedEventIds, event.id])];
    await AsyncStorage.setItem(
      "duna.followed-pro-events",
      JSON.stringify(next),
    );
    setFollowedEventIds(next);
    setFollowNotice(
      Platform.OS === "ios"
        ? "Event scores are now live on your Lock Screen."
        : "You’re following this event. Live scores will stay ready in Discover.",
    );
    successHaptic();
  };

  const followAction = (match: ProMatch) =>
    Platform.OS === "ios" && match.status !== "completed"
      ? () => {
          selectionHaptic();
          void followMatch(match).catch((reason) =>
            setFollowNotice(displayError(reason)),
          );
        }
      : undefined;

  if (!visible) return null;

  const selectedSummary = selectedSlug
    ? events.find((candidate) => candidate.slug === selectedSlug)
    : undefined;
  const sections = event ? proEventSections(event) : (["overview"] as const);
  const featuredMedia = event ? proEventFeaturedMedia(event) : undefined;
  const posterUrl = event ? proEventMediaUrl(event) : undefined;
  const posterIsPortrait = featuredMedia?.kind === "poster";
  const heroHeight = posterIsPortrait
    ? Math.min(390, Math.max(300, width * 0.96))
    : Math.min(310, Math.max(250, width * 0.72));
  const liveMatches =
    event?.matches.filter((match) => match.status === "live") ?? [];
  const completedMatches =
    event?.matches.filter((match) => match.status === "completed").length ?? 0;
  const venueAddress = event
    ? (event.editorial.venue?.formattedAddress ??
      event.editorial.venueAddress ??
      [
        event.editorial.venue?.addressLine1,
        event.editorial.venue?.addressLine2,
        event.editorial.venue?.locality,
        event.editorial.venue?.administrativeArea,
        event.editorial.venue?.postalCode,
        event.editorial.venue?.countryCode,
      ]
        .filter(Boolean)
        .join(", "))
    : undefined;
  const venueName = event
    ? (event.editorial.venueName ?? event.location ?? venueAddress)
    : undefined;
  const venueMapHref =
    event && venueAddress
      ? googleMapsSearchUrl({
          address: venueAddress,
          googlePlaceId: event.editorial.venue?.googlePlaceId,
        })
      : undefined;
  const venueMapImageUrl =
    event && venueAddress
      ? `${dunaWebUrl}/api/places/map?${
          event.editorial.venue?.latitude !== undefined &&
          event.editorial.venue.longitude !== undefined
            ? `latitude=${encodeURIComponent(String(event.editorial.venue.latitude))}&longitude=${encodeURIComponent(String(event.editorial.venue.longitude))}`
            : `address=${encodeURIComponent(venueAddress)}`
        }`
      : undefined;
  const watchOptions = event
    ? [
        ...event.watchOptions,
        ...event.matches.flatMap((match) => match.watchOptions),
      ].filter(
        (option, index, options) =>
          options.findIndex((candidate) => candidate.id === option.id) ===
          index,
      )
    : [];

  const renderEmpty = (title: string, body: string) => (
    <View style={styles.proMobileEmptyCard}>
      <Text style={styles.proMobileEmptyIcon}>◌</Text>
      <Text style={styles.proMobileEmptyTitle}>{title}</Text>
      <Text style={styles.proMobileEmptyBody}>{body}</Text>
    </View>
  );

  const openVenueMap = async () => {
    if (!event || !venueAddress || !venueMapHref) return;
    const platform =
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
          ? "android"
          : "web";
    const destination = nativeMapUrl({
      address: venueAddress,
      label: venueName,
      latitude: event.editorial.venue?.latitude,
      longitude: event.editorial.venue?.longitude,
      platform,
    });
    try {
      if (platform === "web") {
        await WebBrowser.openBrowserAsync(venueMapHref);
      } else {
        await Linking.openURL(destination);
      }
    } catch {
      await WebBrowser.openBrowserAsync(venueMapHref);
    }
  };

  const copyVenueAddress = async () => {
    if (!venueAddress) return;
    await Clipboard.setStringAsync(venueAddress);
    setCopiedAddress(true);
    successHaptic();
  };

  const renderOverview = () => {
    if (!event) return null;
    return (
      <>
        {liveMatches.length > 0 && (
          <>
            <ProTourSectionTitle
              eyebrow="UPDATING LIVE"
              title="On court now"
              trailing={`${liveMatches.length}`}
            />
            <View style={styles.proMobileCardStack}>
              {liveMatches.slice(0, 3).map((match) => (
                <ProTourMatchCard
                  followed={followedMatchId === match.id}
                  key={match.id}
                  match={match}
                  onFollow={followAction(match)}
                  onOpen={() => void openMatchMarket(match)}
                />
              ))}
            </View>
          </>
        )}

        <View style={styles.proMobileStatGrid}>
          <View style={styles.proMobileStatCard}>
            <Text style={styles.proMobileStatValue}>{event.teamCount}</Text>
            <Text style={styles.proMobileStatLabel}>Teams</Text>
          </View>
          <View style={styles.proMobileStatCard}>
            <Text style={styles.proMobileStatValue}>
              {completedMatches}/{event.matchCount}
            </Text>
            <Text style={styles.proMobileStatLabel}>Matches</Text>
          </View>
          <View style={styles.proMobileStatCard}>
            <Text style={styles.proMobileStatValue}>
              {event.bracket.length || event.pools.length || "—"}
            </Text>
            <Text style={styles.proMobileStatLabel}>
              {event.bracket.length ? "Rounds" : "Pools"}
            </Text>
          </View>
        </View>

        {event.editorial.summary && (
          <View style={styles.proMobileInfoCard}>
            <Text style={styles.proMobileInfoEyebrow}>EVENT OVERVIEW</Text>
            <Text style={styles.proMobileSummary}>
              {event.editorial.summary}
            </Text>
          </View>
        )}

        <MobileTournamentMarkets
          event={event}
          markets={tournamentMarkets}
          onOpen={openTournamentMarket}
        />

        {venueName && venueAddress && venueMapHref && (
          <View style={styles.proMobileLocationCard}>
            <Pressable
              accessibilityHint="Opens this location in your maps app"
              accessibilityLabel={`Open map for ${venueName}`}
              accessibilityRole="button"
              onPress={() => void openVenueMap()}
              style={({ pressed }) => [
                styles.proMobileLocationMap,
                pressed && styles.proMobileLocationMapPressed,
              ]}
            >
              {venueMapImageUrl && (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: venueMapImageUrl }}
                  style={styles.proMobileLocationMapImage}
                />
              )}
              <View style={styles.proMobileLocationMapLabel}>
                <Text style={styles.proMobileLocationMapLabelText}>
                  OPEN MAP ↗
                </Text>
              </View>
            </Pressable>
            <View style={styles.proMobileLocationDetails}>
              <Text style={styles.proMobileInfoEyebrow}>EVENT LOCATION</Text>
              <Text style={styles.proMobileInfoTitle}>{venueName}</Text>
              <Pressable
                accessibilityHint="Opens this address in your maps app"
                accessibilityLabel={`Open ${venueAddress} in maps`}
                accessibilityRole="link"
                onPress={() => void openVenueMap()}
              >
                <Text style={styles.proMobileLocationAddress}>
                  {venueAddress} ↗
                </Text>
              </Pressable>
              {event.editorial.timezone && (
                <Text style={styles.proMobileInfoFootnote}>
                  Schedule shown in {event.editorial.timezone}
                </Text>
              )}
              <View style={styles.proMobileLocationActions}>
                <Pressable
                  accessibilityLabel={`Copy address: ${venueAddress}`}
                  accessibilityRole="button"
                  onPress={() => void copyVenueAddress()}
                  style={styles.proMobileLocationCopy}
                >
                  <Text style={styles.proMobileLocationCopyText}>
                    {copiedAddress ? "✓ Copied" : "Copy address"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Open ${venueAddress} in maps`}
                  accessibilityRole="link"
                  onPress={() => void openVenueMap()}
                  style={styles.proMobileLocationOpen}
                >
                  <Text style={styles.proMobileLocationOpenText}>Maps ↗</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <View style={styles.proMobileActionRow}>
          {event.editorial.ticketUrl && (
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(event.editorial.ticketUrl!)
              }
              style={styles.proMobilePrimaryAction}
            >
              <Text style={styles.proMobilePrimaryActionText}>Tickets ↗</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(event.sourceUrl)}
            style={styles.proMobileSecondaryAction}
          >
            <Text style={styles.proMobileSecondaryActionText}>
              Official source ↗
            </Text>
          </Pressable>
        </View>

        {event.sibling && (
          <Pressable
            onPress={() => openEvent(event.sibling!.slug)}
            style={styles.proMobileSiblingCard}
          >
            <View>
              <Text style={styles.proMobileInfoEyebrow}>OTHER DIVISION</Text>
              <Text style={styles.proMobileSiblingTitle}>
                {event.sibling.name}
              </Text>
            </View>
            <Text style={styles.proMobileSiblingArrow}>›</Text>
          </Pressable>
        )}
      </>
    );
  };

  const renderLive = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="LIVE TOURNAMENT DESK"
          title="On court now"
          trailing={`${liveMatches.length} live`}
        />
        {liveMatches.length > 0 ? (
          <View style={styles.proMobileCardStack}>
            {liveMatches.map((match) => (
              <ProTourMatchCard
                followed={followedMatchId === match.id}
                key={match.id}
                match={match}
                onFollow={followAction(match)}
                onOpen={() => void openMatchMarket(match)}
              />
            ))}
          </View>
        ) : (
          renderEmpty(
            "No match is live right now",
            "The tournament desk will surface live scores here as soon as play begins.",
          )
        )}
      </>
    );
  };

  const renderSchedule = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="SCORES + SCHEDULE"
          title="Every match"
          trailing={`${event.matches.length}`}
        />
        {event.matches.length > 0 ? (
          <View style={styles.proMobileCardStack}>
            {event.matches.slice(0, 60).map((match) => (
              <ProTourMatchCard
                followed={followedMatchId === match.id}
                key={match.id}
                match={match}
                onFollow={followAction(match)}
                onOpen={() => void openMatchMarket(match)}
              />
            ))}
            {event.matches.length > 60 && (
              <Text style={styles.proMobileListNote}>
                Showing the latest 60 of {event.matches.length} matches.
              </Text>
            )}
          </View>
        ) : (
          renderEmpty(
            "Schedule coming soon",
            "Matches will appear here when the official event feed publishes them.",
          )
        )}
      </>
    );
  };

  const renderDraw = () => {
    if (!event) return null;
    return (
      <>
        {event.bracket.length > 0 && (
          <>
            <ProTourSectionTitle
              eyebrow="CHAMPIONSHIP DRAW"
              title="Bracket"
              trailing={`${event.bracket.length} rounds`}
            />
            <View style={styles.proMobileDrawStack}>
              {event.bracket.map((round) => (
                <View key={round.key} style={styles.proMobileDrawRound}>
                  <Text style={styles.proMobileDrawRoundTitle}>
                    {round.label}
                  </Text>
                  <View style={styles.proMobileCardStack}>
                    {round.matches.map((match) => (
                      <ProTourMatchCard
                        followed={followedMatchId === match.id}
                        key={match.id}
                        match={match}
                        onFollow={followAction(match)}
                        onOpen={() => void openMatchMarket(match)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
        {event.pools.length > 0 && (
          <>
            <ProTourSectionTitle
              eyebrow="POOL PLAY"
              title="Standings"
              trailing={`${event.pools.length} pools`}
            />
            <View style={styles.proMobileCardStack}>
              {event.pools.map((pool) => (
                <View key={pool.name} style={styles.proMobilePoolCard}>
                  <View style={styles.proMobilePoolHeader}>
                    <Text style={styles.proMobilePoolTitle}>{pool.name}</Text>
                    <Text style={styles.proMobilePoolProgress}>
                      {pool.completedMatches}/{pool.matchCount} played
                    </Text>
                  </View>
                  {pool.standings.map((standing, index) => (
                    <View
                      key={standing.team.key}
                      style={styles.proMobileStandingRow}
                    >
                      <Text style={styles.proMobileStandingRank}>
                        {index + 1}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.proMobileStandingTeam}
                      >
                        {standing.team.label}
                      </Text>
                      <Text style={styles.proMobileStandingRecord}>
                        {standing.wins}–{standing.losses}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
        {event.bracket.length === 0 &&
          event.pools.length === 0 &&
          renderEmpty(
            "Draw coming soon",
            "Pool standings and bracket rounds will appear as the official feed reports them.",
          )}
      </>
    );
  };

  const renderTeams = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="FIELD + STANDINGS"
          title="Teams"
          trailing={`${event.teamCount || event.teamEntries.length}`}
        />
        {event.liveStandings.length > 0 && (
          <View style={styles.proMobileStandingsCard}>
            {event.liveStandings.slice(0, 24).map((standing, index) => (
              <View key={standing.team.key} style={styles.proMobileStandingRow}>
                <Text style={styles.proMobileStandingRank}>{index + 1}</Text>
                <Text numberOfLines={1} style={styles.proMobileStandingTeam}>
                  {standing.team.label}
                </Text>
                <Text style={styles.proMobileStandingRecord}>
                  {standing.wins}–{standing.losses}
                </Text>
              </View>
            ))}
          </View>
        )}
        {event.teamEntries.length > 0 && (
          <View style={styles.proMobileTeamGrid}>
            {event.teamEntries.slice(0, 64).map((team) => (
              <View key={team.externalTeamId} style={styles.proMobileTeamCard}>
                <View style={styles.proMobileTeamCardTop}>
                  <Text style={styles.proMobileTeamSeed}>
                    {team.seed ? `#${team.seed}` : "TEAM"}
                  </Text>
                  <Text style={styles.proMobileTeamCountry}>
                    {countryFlag(team.countryCode)}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.proMobileTeamName}>
                  {team.label}
                </Text>
                <Text numberOfLines={2} style={styles.proMobileTeamPlayers}>
                  {team.players.map((player) => player.name).join(" / ")}
                </Text>
              </View>
            ))}
          </View>
        )}
        {event.liveStandings.length === 0 &&
          event.teamEntries.length === 0 &&
          renderEmpty(
            "Teams coming soon",
            "The entry list will appear here when it is confirmed by the tour.",
          )}
      </>
    );
  };

  const renderWatch = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="BROADCAST GUIDE"
          title="Where to watch"
          trailing={`${watchOptions.length}`}
        />
        {watchOptions.length > 0 ? (
          <View style={styles.proMobileCardStack}>
            {watchOptions.map((option) => (
              <Pressable
                disabled={!option.url}
                key={option.id}
                onPress={() =>
                  option.url
                    ? void WebBrowser.openBrowserAsync(option.url)
                    : undefined
                }
                style={({ pressed }) => [
                  styles.proMobileWatchCard,
                  pressed && styles.proMobilePressed,
                ]}
              >
                <View style={styles.proMobileWatchIcon}>
                  <Text style={styles.proMobileWatchIconText}>
                    {option.kind === "youtube" ? "▶" : "◉"}
                  </Text>
                </View>
                <View style={styles.proMobileWatchCopy}>
                  <Text style={styles.proMobileWatchTitle}>{option.label}</Text>
                  <Text style={styles.proMobileWatchMeta}>
                    {option.channelName ??
                      (option.url ? "Open stream" : "Broadcast confirmed")}
                  </Text>
                </View>
                {option.url && (
                  <Text style={styles.proMobileWatchArrow}>↗</Text>
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          renderEmpty(
            "Broadcast details pending",
            "Verified streaming and television options will appear here when announced.",
          )
        )}
      </>
    );
  };

  const renderActiveSection = () => {
    switch (activeSection) {
      case "live":
        return renderLive();
      case "schedule":
        return renderSchedule();
      case "draw":
        return renderDraw();
      case "teams":
        return renderTeams();
      case "watch":
        return renderWatch();
      default:
        return renderOverview();
    }
  };

  return (
    <>
      <Modal
        animationType="slide"
        onRequestClose={handleClose}
        presentationStyle="pageSheet"
        visible={visible}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          {selectedSlug ? (
            <>
              <View style={styles.proMobileDetailHeader}>
                <Pressable
                  accessibilityLabel="Back to Pro Tour events"
                  onPress={backToEvents}
                  style={styles.proMobileHeaderButton}
                >
                  <Text style={styles.proMobileHeaderButtonText}>‹</Text>
                </Pressable>
                <View style={styles.proMobileDetailHeaderCopy}>
                  <Text style={styles.proMobileDetailHeaderEyebrow}>
                    {event?.live || selectedSummary?.live
                      ? "● LIVE EVENT"
                      : "PRO EVENT"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={styles.proMobileDetailHeaderTitle}
                  >
                    {event?.name ?? selectedSummary?.name ?? "Event"}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close Pro Tour"
                  onPress={handleClose}
                  style={styles.proMobileHeaderButton}
                >
                  <Text style={styles.proMobileHeaderCloseText}>×</Text>
                </Pressable>
              </View>

              {event && (
                <ScrollView
                  contentContainerStyle={styles.proMobileSectionNavContent}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.proMobileSectionNav}
                >
                  {sections.map((section) => (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{
                        selected: activeSection === section,
                      }}
                      key={section}
                      onPress={() => {
                        selectionHaptic();
                        setActiveSection(section);
                      }}
                      style={[
                        styles.proMobileSectionTab,
                        activeSection === section &&
                          styles.proMobileSectionTabActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.proMobileSectionTabText,
                          activeSection === section &&
                            styles.proMobileSectionTabTextActive,
                        ]}
                      >
                        {proTourSectionLabels[section]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {loading && !event ? (
                <View style={styles.proMobileLoadingState}>
                  <View style={styles.proMobileLoadingMark}>
                    <Text style={styles.proMobileLoadingMarkText}>D</Text>
                  </View>
                  <Text style={styles.proMobileLoadingTitle}>
                    Opening the tournament desk
                  </Text>
                  <Text style={styles.proMobileLoadingBody}>
                    Bringing in live scores, teams, and event media…
                  </Text>
                </View>
              ) : error && !event ? (
                <View style={styles.proMobileLoadingState}>
                  <Text style={styles.proMobileEmptyIcon}>!</Text>
                  <Text style={styles.proMobileLoadingTitle}>
                    Event could not load
                  </Text>
                  <Text style={styles.proMobileLoadingBody}>{error}</Text>
                  <Pressable
                    onPress={() => setReloadKey((value) => value + 1)}
                    style={styles.proMobileRetryButton}
                  >
                    <Text style={styles.proMobileRetryButtonText}>
                      Try again
                    </Text>
                  </Pressable>
                </View>
              ) : event ? (
                <ScrollView
                  contentContainerStyle={styles.proMobileDetailContent}
                  key={activeSection}
                  showsVerticalScrollIndicator={false}
                >
                  {activeSection === "overview" && (
                    <View
                      style={[styles.proMobileHero, { height: heroHeight }]}
                    >
                      {posterUrl && !posterFailed ? (
                        <Image
                          accessibilityLabel={featuredMedia?.alt ?? event.name}
                          onError={() => setPosterFailed(true)}
                          resizeMode={posterIsPortrait ? "contain" : "cover"}
                          source={{ uri: posterUrl }}
                          style={styles.proMobileHeroImage}
                        />
                      ) : (
                        <View style={styles.proMobileHeroFallback}>
                          <View style={styles.proMobileCourtOutline} />
                          <View style={styles.proMobileCourtNet} />
                        </View>
                      )}
                      <View style={styles.proMobileHeroScrim} />
                      <View style={styles.proMobileHeroTop}>
                        <View style={styles.proMobileHeroBadges}>
                          <View
                            style={[
                              styles.proMobileHeroBadge,
                              event.live && styles.proMobileHeroBadgeLive,
                            ]}
                          >
                            <Text style={styles.proMobileHeroBadgeText}>
                              {event.live
                                ? "● LIVE NOW"
                                : event.status.toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.proMobileHeroBadge}>
                            <Text style={styles.proMobileHeroBadgeText}>
                              {event.genderCategory.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <ProTourBrandMark compact source={event.source} />
                      </View>
                      <View style={styles.proMobileHeroCopy}>
                        <Text style={styles.proMobileHeroCategory}>
                          {event.category ?? "Professional beach volleyball"}
                        </Text>
                        <Text style={styles.proMobileHeroTitle}>
                          {event.name}
                        </Text>
                        <Text style={styles.proMobileHeroMeta}>
                          {countryFlag(event.countryCode)}{" "}
                          {formatProEventDates(event.startsOn, event.endsOn)} ·{" "}
                          {event.editorial.venueName ??
                            event.location ??
                            "Location pending"}
                        </Text>
                      </View>
                    </View>
                  )}
                  <Pressable
                    accessibilityLabel={
                      followedEventIds.includes(event.id)
                        ? `Following ${event.name}`
                        : `Follow ${event.name}`
                    }
                    disabled={followedEventIds.includes(event.id)}
                    onPress={() => {
                      selectionHaptic();
                      void followEvent().catch((reason) =>
                        setFollowNotice(displayError(reason)),
                      );
                    }}
                    style={[
                      styles.proMobileFollowEvent,
                      followedEventIds.includes(event.id) &&
                        styles.proMobileFollowEventActive,
                    ]}
                  >
                    <View style={styles.proMobileFollowEventIcon}>
                      <Text style={styles.proMobileFollowEventIconText}>
                        {followedEventIds.includes(event.id) ? "✓" : "◉"}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.proMobileFollowEventTitle}>
                        {followedEventIds.includes(event.id)
                          ? "Following event"
                          : "Follow this event"}
                      </Text>
                      <Text style={styles.proMobileFollowEventBody}>
                        {Platform.OS === "ios"
                          ? "Live scores, round changes, and finals on your Lock Screen"
                          : "Keep live scores, round changes, and finals ready in Discover"}
                      </Text>
                    </View>
                    <Text style={styles.proMobileFollowEventArrow}>›</Text>
                  </Pressable>
                  {followNotice && (
                    <View style={styles.proMobileNotice}>
                      <Text style={styles.proMobileNoticeText}>
                        {followNotice}
                      </Text>
                    </View>
                  )}
                  {error && event && (
                    <Text style={styles.formError}>{error}</Text>
                  )}
                  {renderActiveSection()}
                </ScrollView>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.proMobileHubHeader}>
                <View>
                  <Text style={styles.proMobileHubEyebrow}>
                    PROFESSIONAL BEACH VOLLEYBALL
                  </Text>
                  <Text style={styles.proMobileHubTitle}>Pro Tour</Text>
                </View>
                <Pressable
                  accessibilityLabel="Close Pro Tour"
                  onPress={handleClose}
                  style={styles.proMobileHeaderButton}
                >
                  <Text style={styles.proMobileHeaderCloseText}>×</Text>
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={styles.proMobileHubContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.proMobileIntro}>
                  <View style={styles.proMobileIntroCopy}>
                    <Text style={styles.proMobileIntroKicker}>
                      {liveEvents.length > 0
                        ? `● ${liveEvents.length} LIVE NOW`
                        : "WORLD TOUR COVERAGE"}
                    </Text>
                    <Text style={styles.proMobileIntroTitle}>
                      The world’s game, live in Duna.
                    </Text>
                    <Text style={styles.proMobileIntroBody}>
                      Scores, draws, teams, schedules, and broadcasts in one
                      mobile tournament desk.
                    </Text>
                  </View>
                  <View style={styles.proMobileIntroBrands}>
                    <ProTourBrandMark source="fivb" />
                    <ProTourBrandMark source="avp" />
                  </View>
                </View>

                <View style={styles.proMobileSearchBar}>
                  <Text aria-hidden style={styles.proMobileSearchIcon}>
                    ⌕
                  </Text>
                  <TextInput
                    accessibilityLabel="Search Pro Tour events"
                    autoCapitalize="none"
                    onChangeText={setSearch}
                    placeholder="Search events, cities, or tours"
                    placeholderTextColor={colors.muted}
                    returnKeyType="search"
                    style={styles.proMobileSearchInput}
                    value={search}
                  />
                  {search.length > 0 && (
                    <Pressable
                      accessibilityLabel="Clear event search"
                      onPress={() => setSearch("")}
                      style={styles.proMobileSearchClear}
                    >
                      <Text style={styles.proMobileSearchClearText}>×</Text>
                    </Pressable>
                  )}
                </View>

                {search.trim() ? (
                  <>
                    <ProTourSectionTitle
                      eyebrow="SEARCH RESULTS"
                      title="Events"
                      trailing={`${filteredEvents.length}`}
                    />
                    {filteredEvents.length > 0 ? (
                      <View style={styles.proMobileCardStack}>
                        {filteredEvents.map((candidate) => (
                          <ProTourEventCard
                            event={candidate}
                            key={candidate.id}
                            onPress={() => openEvent(candidate.slug)}
                          />
                        ))}
                      </View>
                    ) : (
                      renderEmpty(
                        "No matching events",
                        "Try a city, event name, category, or tour.",
                      )
                    )}
                  </>
                ) : (
                  <>
                    {liveEvents.length > 0 && (
                      <>
                        <ProTourSectionTitle
                          eyebrow="UPDATING FREQUENTLY"
                          title="Live now"
                          trailing={`${liveEvents.length}`}
                        />
                        <View style={styles.proMobileCardStack}>
                          {liveEvents.slice(0, 6).map((candidate) => (
                            <ProTourEventCard
                              event={candidate}
                              key={candidate.id}
                              onPress={() => openEvent(candidate.slug)}
                            />
                          ))}
                        </View>
                      </>
                    )}

                    <ProTourSectionTitle
                      eyebrow={
                        liveEvents.length > 0 ? "EXPLORE MORE" : "NEXT UP"
                      }
                      title={
                        liveEvents.length > 0 ? "Other events" : "Tour calendar"
                      }
                      trailing={`${otherEvents.length}`}
                    />
                    {otherEvents.length > 0 ? (
                      <View style={styles.proMobileCardStack}>
                        {otherEvents.slice(0, 20).map((candidate) => (
                          <ProTourEventCard
                            event={candidate}
                            key={candidate.id}
                            onPress={() => openEvent(candidate.slug)}
                          />
                        ))}
                      </View>
                    ) : events.length === 0 ? (
                      renderEmpty(
                        "Tour calendar is syncing",
                        "Live and upcoming professional events will appear here shortly.",
                      )
                    ) : null}
                  </>
                )}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
      {selectedMarket && (
        <MobilePredictionMarketSheet
          client={client}
          market={selectedMarket.market}
          onClose={() => setSelectedMarket(undefined)}
          onPlaced={refresh}
          target={selectedMarket.target}
          wallet={predictionWallet}
        />
      )}
    </>
  );
}

function FollowPlayerCard({ player }: { readonly player: PersonSummary }) {
  const { client, mode } = usePlayerRuntime();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!client || mode !== "live") return;
    let active = true;
    void client.player.playerFollowState
      .query({ playerPersonId: player.id })
      .then((state) => {
        if (active) setFollowing(state.following);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, mode, player.id]);

  const follow = async () => {
    if (following || busy) return;
    selectionHaptic();
    setBusy(true);
    setError(undefined);
    try {
      if (client && mode === "live") {
        await client.player.setPlayerFollow.mutate({
          playerPersonId: player.id,
          following: true,
          notifyRegistrations: true,
          notifyWatch: true,
          notifyResults: true,
          idempotencyKey: Crypto.randomUUID(),
        });
      }
      await startDunaLiveActivity(
        {
          subjectId: player.id,
          kind: "player",
          title: player.displayName,
          subtitle: `${player.homeMarket} · ${player.rating.display.toFixed(2)}`,
          status: "Following",
          teamA: player.displayName,
          teamB: "Next opponent",
          scoreA: 0,
          scoreB: 0,
          setLabel: "Live match alerts ready",
        },
        {
          onPushToken: (token) => {
            void rememberLiveActivityToken(token, client).catch(
              () => undefined,
            );
          },
        },
      );
      setFollowing(true);
      successHaptic();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.playerFollowCard}>
      {player.avatarUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: player.avatarUrl }}
          style={styles.playerFollowAvatar}
        />
      ) : (
        <View style={styles.playerFollowAvatarFallback}>
          <Text style={styles.playerFollowAvatarText}>{player.initials}</Text>
        </View>
      )}
      <Text numberOfLines={1} style={styles.playerFollowName}>
        {player.displayName}
      </Text>
      <Text numberOfLines={1} style={styles.playerFollowMeta}>
        {player.homeMarket} · {player.rating.display.toFixed(2)}
      </Text>
      <Pressable
        accessibilityLabel={
          following
            ? `Following ${player.displayName}`
            : `Follow ${player.displayName}`
        }
        disabled={following || busy}
        onPress={() => void follow()}
        style={[
          styles.playerFollowButton,
          following && styles.playerFollowButtonActive,
        ]}
      >
        <Text
          style={[
            styles.playerFollowButtonText,
            following && styles.playerFollowButtonTextActive,
          ]}
        >
          {busy ? "Following…" : following ? "✓ Following" : "+ Follow"}
        </Text>
      </Pressable>
      {error && (
        <Text numberOfLines={2} style={styles.playerFollowError}>
          {error}
        </Text>
      )}
    </View>
  );
}

function DiscoverScreen({
  intent,
  onBook,
}: {
  readonly intent?: {
    readonly key: number;
    readonly kind: Exclude<HomeQuickAction, "record-video">;
  };
  readonly onBook: (eventIndex: number) => void;
}) {
  const [filter, setFilter] = useState("For you");
  const [search, setSearch] = useState("");
  const [bookingVenueId, setBookingVenueId] = useState<string>();
  const [selectedCoach, setSelectedCoach] = useState<MobileCoach>();
  const [showProTour, setShowProTour] = useState(false);
  const [showDiscoveryMap, setShowDiscoveryMap] = useState(false);
  const [showDiscoverySearch, setShowDiscoverySearch] = useState(false);
  const [discoverLocation, setDiscoverLocation] =
    useState<DiscoveryCoordinates>();
  const [selectedProTourSlug, setSelectedProTourSlug] = useState<string>();
  const {
    coaches,
    dashboard,
    discoveryMap,
    organizationWallets,
    people,
    proCoverage,
    venues,
  } = usePlayerRuntime();
  const events = dashboard?.events ?? demoEvents;
  const discoverProEvents = sortProEvents(proCoverage?.events ?? []).slice(
    0,
    3,
  );
  const query = search.trim().toLowerCase();
  useEffect(() => {
    if (!intent) return;
    setSearch("");
    setShowDiscoverySearch(false);
    if (intent.kind === "find-match") {
      setFilter("Open play");
      return;
    }
    if (intent.kind === "join-event") {
      setFilter("Events");
      return;
    }
    const firstVenue = venues?.[0];
    if (firstVenue) {
      setBookingVenueId(firstVenue.id);
    } else {
      setFilter("For you");
      setShowDiscoveryMap(true);
    }
  }, [intent, venues]);
  useEffect(() => {
    let mounted = true;
    const loadLocation = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (mounted) {
        setDiscoverLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      }
    };
    void loadLocation().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  const discoverPlayers = (people ?? demoPeople)
    .filter((player) => player.id !== dashboard?.player.id)
    .filter((player) =>
      query
        ? `${player.displayName} ${player.handle} ${player.homeMarket}`
            .toLowerCase()
            .includes(query)
        : true,
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.isProfessional)) -
        Number(Boolean(left.isProfessional)),
    )
    .slice(0, 8);
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
  const discoverableEvents = useMemo(
    () =>
      events.filter((event) => {
        const timestamp = Date.parse(event.endsAt);
        return Number.isNaN(timestamp) || timestamp >= Date.now();
      }),
    [events],
  );
  const filteredEvents = discoverableEvents
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
      if (filter === "Events") return true;
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
  const discoveryItems = useMemo<readonly DiscoveryMapItem[]>(() => {
    if (discoveryMap?.items.length) return discoveryMap.items;
    const venueItems: DiscoveryMapItem[] = (venues ?? []).map((venue) => ({
      id: `venue:${venue.id}`,
      entityType: "venue",
      kind: "court-booking",
      title: venue.name,
      subtitle: `${venue.city}, ${venue.region}`,
      href: `/app/venues/${venue.id}`,
      latitude: venue.latitude,
      longitude: venue.longitude,
      organizationId: venue.organizationId,
      imageUrl: venue.imageUrl,
      openNow: venue.openNow,
      courtCount: venue.courtCount,
      tags: ["venue", "courts", venue.city, venue.region, ...venue.tags],
    }));
    const eventItems: DiscoveryMapItem[] = discoverableEvents.map((event) => {
      const venue = (venues ?? []).find(
        (candidate) =>
          candidate.organizationId === event.organizationId ||
          candidate.name === event.venueName,
      );
      return {
        id: `event:${event.id}`,
        entityType: "event",
        kind: event.kind,
        title: event.title,
        subtitle: event.venueName,
        href: `/events/${event.slug}`,
        latitude: event.location?.latitude ?? venue?.latitude,
        longitude: event.location?.longitude ?? venue?.longitude,
        organizationId: event.organizationId,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        imageUrl: event.imageUrl,
        live: event.live,
        price: event.price,
        tags: [
          event.kind,
          event.organizationName,
          event.venueName,
          ...event.tags,
        ],
      };
    });
    const coachItems: DiscoveryMapItem[] = (coaches ?? []).map((coach) => {
      const venue = (venues ?? []).find(
        (candidate) => candidate.organizationId === coach.organizationId,
      );
      return {
        id: `coach:${coach.organizationId}:${coach.personId}`,
        entityType: "coach",
        kind: "coach",
        title: coach.displayName,
        subtitle: coach.homeMarket ?? coach.organizationName,
        href: `/coaches/${coach.handle}?organization=${coach.organizationSlug}`,
        latitude: venue?.latitude,
        longitude: venue?.longitude,
        organizationId: coach.organizationId,
        imageUrl: coach.avatarUrl,
        tags: ["coach", coach.handle, coach.organizationName],
      };
    });
    const proItems = (proCoverage?.events ?? [])
      .map<DiscoveryMapItem>((event) => ({
        id: `pro-tour:${event.id}`,
        entityType: "pro-tour",
        kind: event.tour,
        title: event.name,
        subtitle: event.venueName ?? event.location ?? event.tour,
        href: `/events/${event.slug}`,
        latitude: event.venue?.latitude,
        longitude: event.venue?.longitude,
        startsAt: event.startsOn
          ? `${event.startsOn}T12:00:00.000Z`
          : undefined,
        endsAt: event.endsOn ? `${event.endsOn}T23:59:59.999Z` : undefined,
        live: event.live,
        tags: ["pro tour", event.tour, event.source, event.location ?? ""],
      }))
      .filter((event) => {
        if (!event.endsAt) return true;
        const timestamp = Date.parse(event.endsAt);
        return Number.isNaN(timestamp) || timestamp >= Date.now();
      });
    return [...venueItems, ...eventItems, ...coachItems, ...proItems];
  }, [
    coaches,
    discoveryMap?.items,
    discoverableEvents,
    proCoverage?.events,
    venues,
  ]);
  const locationSortedDiscoveryItems = useMemo(
    () =>
      [...discoveryItems].sort(
        (left, right) =>
          discoveryDistance(discoverLocation, left) -
          discoveryDistance(discoverLocation, right),
      ),
    [discoverLocation, discoveryItems],
  );
  const visibleDiscoveryItems = locationSortedDiscoveryItems.filter((item) => {
    if (
      query &&
      ![item.title, item.subtitle, item.kind, item.entityType, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    if (filter === "Today") {
      return Boolean(
        item.startsAt &&
        new Date(item.startsAt).toDateString() === new Date().toDateString(),
      );
    }
    if (filter === "Events") return item.entityType === "event";
    if (filter === "Tournaments") {
      return item.kind === "tournament" || item.entityType === "pro-tour";
    }
    if (filter === "Training") {
      return (
        item.entityType === "coach" ||
        ["clinic", "private-lesson"].includes(item.kind)
      );
    }
    if (filter === "Open play") {
      return ["open-play", "pickup"].includes(item.kind);
    }
    if (filter === "Free") return item.price?.amountMinor === 0;
    return true;
  });
  const autocompleteItems = query ? visibleDiscoveryItems.slice(0, 5) : [];
  const tournamentEvents = filteredEvents
    .filter(
      (event) =>
        event.kind === "tournament" &&
        new Date(event.endsAt).getTime() >= new Date().setHours(0, 0, 0, 0),
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const nearbyVenues = [...(venues ?? [])].sort(
    (left, right) =>
      discoveryDistance(discoverLocation, left) -
      discoveryDistance(discoverLocation, right),
  );
  const nearbyEvents = [...filteredEvents].sort((left, right) => {
    const leftItem = discoveryItems.find(
      (item) => item.id === `event:${left.id}`,
    );
    const rightItem = discoveryItems.find(
      (item) => item.id === `event:${right.id}`,
    );
    return (
      discoveryDistance(discoverLocation, leftItem ?? {}) -
      discoveryDistance(discoverLocation, rightItem ?? {})
    );
  });

  const openDiscoveryItem = (item: DiscoveryMapItem) => {
    selectionHaptic();
    setShowDiscoveryMap(false);
    setShowDiscoverySearch(false);
    if (item.entityType === "venue") {
      setBookingVenueId(item.id.replace(/^venue:/, ""));
      return;
    }
    if (item.entityType === "coach") {
      const coach = (coaches ?? []).find(
        (candidate) =>
          item.id === `coach:${candidate.organizationId}:${candidate.personId}`,
      );
      if (coach) {
        setSelectedCoach(coach);
        return;
      }
    }
    if (item.entityType === "pro-tour") {
      setShowProTour(true);
      return;
    }
    if (item.entityType === "event") {
      const eventId = item.id.replace(/^event:/, "");
      const eventIndex = events.findIndex((event) => event.id === eventId);
      if (eventIndex >= 0) {
        onBook(eventIndex);
        return;
      }
    }
    void WebBrowser.openBrowserAsync(`${dunaWebUrl}${item.href}`);
  };
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
        <MemberOrganizationCard />
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
        {discoverProEvents.length > 0 && (
          <View style={styles.discoverProEvents}>
            <SectionHeader
              eyebrow="WATCH + FOLLOW"
              title="Pro events, live here."
              action={`${discoverProEvents.length} now`}
            />
            <View style={styles.proMobileCardStack}>
              {discoverProEvents.map((event) => (
                <ProTourEventCard
                  event={event}
                  key={event.id}
                  onPress={() => {
                    selectionHaptic();
                    setSelectedProTourSlug(event.slug);
                    setShowProTour(true);
                  }}
                />
              ))}
            </View>
          </View>
        )}
        <View style={styles.searchField}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            onChangeText={setSearch}
            onSubmitEditing={() => setShowDiscoverySearch(true)}
            placeholder="Events, programs, clubs, coaches…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={search}
          />
          <Pressable onPress={() => setShowDiscoverySearch(true)}>
            <Text style={styles.searchAllText}>All</Text>
          </Pressable>
        </View>
        {autocompleteItems.length > 0 && (
          <View style={styles.searchSuggestions}>
            {autocompleteItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => openDiscoveryItem(item)}
                style={styles.searchSuggestionRow}
              >
                <View
                  style={[
                    styles.searchSuggestionDot,
                    {
                      backgroundColor:
                        item.entityType === "venue"
                          ? colors.aqua
                          : item.entityType === "coach"
                            ? colors.flare
                            : item.entityType === "pro-tour"
                              ? "#d5a13d"
                              : colors.aqua,
                    },
                  ]}
                />
                <View style={styles.flex}>
                  <Text style={styles.searchSuggestionTitle}>{item.title}</Text>
                  <Text style={styles.searchSuggestionMeta}>
                    {item.subtitle} · {item.entityType.replace("-", " ")}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setShowDiscoverySearch(true)}
              style={styles.searchSuggestionAll}
            >
              <Text style={styles.searchSuggestionAllText}>
                View all {visibleDiscoveryItems.length} results →
              </Text>
            </Pressable>
          </View>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalBleed}
        >
          <View style={styles.filterRow}>
            {[
              "For you",
              "Events",
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
        {discoverPlayers.length > 0 && (
          <>
            <SectionHeader
              eyebrow="PLAYERS TO FOLLOW"
              title="Their next point, on your Lock Screen."
              action={`${discoverPlayers.length} players`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.playerFollowRow}>
                {discoverPlayers.map((player) => (
                  <FollowPlayerCard key={player.id} player={player} />
                ))}
              </View>
            </ScrollView>
          </>
        )}
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
              eyebrow="LIVE COURT INVENTORY · NEARBY"
              title="Book a court."
              action={`${venues.length} venues`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.bookingVenueRow}>
                {nearbyVenues.map((venue) => (
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
        {tournamentEvents.length > 0 && (
          <>
            <SectionHeader
              action="View all"
              eyebrow="NEXT ON THE SAND"
              onAction={() => setShowDiscoverySearch(true)}
              title="Tournaments coming up."
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              {tournamentEvents.map((event) => (
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
        <DiscoveryMapPreview
          items={visibleDiscoveryItems}
          onOpen={() => setShowDiscoveryMap(true)}
        />
        <SectionHeader
          action="View all"
          eyebrow={
            discoverLocation
              ? `${filter.toUpperCase()} · NEAREST TO YOU`
              : `${filter.toUpperCase()} · ${resultCount} RESULTS`
          }
          onAction={() => setShowDiscoverySearch(true)}
          title="Around you."
        />
        {nearbyEvents.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalBleed}
          >
            {nearbyEvents.map((event) => {
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
          </ScrollView>
        ) : (
          <View style={styles.coachEmptyCard}>
            <Text style={styles.coachServiceTitle}>
              Nothing nearby matches yet.
            </Text>
            <Text style={styles.coachServiceBody}>
              Try a broader search or move the globe to explore a different
              market.
            </Text>
          </View>
        )}
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
      <DiscoveryMapModal
        items={locationSortedDiscoveryItems}
        onClose={() => setShowDiscoveryMap(false)}
        onSearch={() => {
          setShowDiscoveryMap(false);
          setShowDiscoverySearch(true);
        }}
        onSelect={openDiscoveryItem}
        visible={showDiscoveryMap}
      />
      <DiscoverySearchModal
        items={locationSortedDiscoveryItems}
        onClose={() => setShowDiscoverySearch(false)}
        onSelect={openDiscoveryItem}
        visible={showDiscoverySearch}
      />
      <VenueBookingModal
        onClose={() => setBookingVenueId(undefined)}
        venueId={bookingVenueId}
        visible={Boolean(bookingVenueId)}
      />
      <ProTourModal
        initialSlug={selectedProTourSlug}
        onClose={() => {
          setShowProTour(false);
          setSelectedProTourSlug(undefined);
        }}
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
  const { mode, predictionWallet, settings, wallet } = usePlayerRuntime();
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
            {settings?.membership?.tierName ?? "Premium"}
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
      <View style={styles.predictionWalletCard}>
        <View style={styles.predictionWalletHeader}>
          <View>
            <Text style={styles.eyebrow}>PREDICTION CREDITS</Text>
            <Text style={styles.predictionWalletBalance}>
              {Math.floor(
                predictionWallet?.availableCredits ?? 1_000,
              ).toLocaleString("en-US")}
            </Text>
          </View>
          <View style={styles.predictionWalletCoin}>
            <Text style={styles.predictionWalletCoinText}>◇</Text>
          </View>
        </View>
        <Text style={styles.predictionWalletBody}>
          Free, non-cash credits for crowd predictions. They cannot be bought,
          transferred, redeemed, or exchanged for prizes.
        </Text>
        <View style={styles.predictionWalletFacts}>
          <View>
            <Text style={styles.predictionWalletFactValue}>
              +{predictionWallet?.nextMonthlyGrantCredits ?? 100}
            </Text>
            <Text style={styles.predictionWalletFactLabel}>NEXT MONTH</Text>
          </View>
          <View>
            <Text style={styles.predictionWalletFactValue}>
              {predictionWallet?.positions.length ?? 0}
            </Text>
            <Text style={styles.predictionWalletFactLabel}>POSITIONS</Text>
          </View>
          <View>
            <Text style={styles.predictionWalletFactValue}>
              {predictionWallet?.openOrders.length ?? 0}
            </Text>
            <Text style={styles.predictionWalletFactLabel}>OPEN ORDERS</Text>
          </View>
        </View>
      </View>
      {(predictionWallet?.positions.length ?? 0) > 0 && (
        <>
          <SectionHeader eyebrow="IMMUTABLE LEDGER" title="Predictions." />
          <View style={styles.listCard}>
            {predictionWallet?.positions.slice(0, 20).map((position) => (
              <View style={styles.predictionWalletRow} key={position.id}>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {position.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    {position.selectedLabel} ·{" "}
                    {position.costCredits.toLocaleString("en-US", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    credits
                  </Text>
                </View>
                <View
                  style={[
                    styles.predictionWalletStatus,
                    position.status === "won" &&
                      styles.predictionWalletStatusWon,
                  ]}
                >
                  <Text style={styles.predictionWalletStatusText}>
                    {position.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
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

function matchSides(match: MobilePerformanceMatch, personId: string) {
  const ownSide = match.participants.find(
    (participant) => participant.personId === personId,
  )?.side;
  const names = (side: "A" | "B") =>
    match.participants
      .filter((participant) => participant.side === side)
      .map((participant) => participant.name)
      .join(" / ");
  return {
    own: ownSide ? names(ownSide) : "Duna player",
    opponent: ownSide ? names(ownSide === "A" ? "B" : "A") : match.matchTitle,
  };
}

function MobileResultCard({
  match,
  personId,
}: {
  readonly match: MobilePerformanceMatch;
  readonly personId: string;
}) {
  const result = match.actualResult >= 0.5 ? "W" : "L";
  const sides = matchSides(match, personId);
  const expected = Math.round(match.expectedWinProbability * 100);
  return (
    <Pressable
      onPress={() =>
        void WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/app/matches/${match.matchId}`,
        )
      }
      style={styles.athleteResultCard}
    >
      <View
        style={[
          styles.athleteResultMark,
          result === "W"
            ? styles.athleteResultMarkWin
            : styles.athleteResultMarkLoss,
        ]}
      >
        <Text style={styles.athleteResultMarkText}>{result}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.athleteResultOpponent}>
          vs. {sides.opponent || "opponent pending"}
        </Text>
        <Text numberOfLines={1} style={styles.athleteResultMeta}>
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(new Date(match.occurredAt))}
          {match.sets.length
            ? ` · ${match.sets.map((set) => `${set.a}–${set.b}`).join(", ")}`
            : ""}
        </Text>
      </View>
      <View style={styles.athleteResultDelta}>
        <Text
          style={[
            styles.athleteResultDeltaValue,
            match.delta >= 0 ? styles.positiveText : styles.negativeText,
          ]}
        >
          {match.delta >= 0 ? "+" : ""}
          {match.delta.toFixed(2)}
        </Text>
        <Text style={styles.athleteResultExpected}>{expected}% expected</Text>
      </View>
    </Pressable>
  );
}

function ProfileScreen({
  onHealth,
  onWallet,
}: {
  readonly onHealth: () => void;
  readonly onWallet: () => void;
}) {
  const { client, dashboard, mode, settings, signOut } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const fallbackMatches = dashboard?.recentMatches ?? demoMatches;
  const [intelligence, setIntelligence] = useState<MobilePlayerIntelligence>();
  const [performance, setPerformance] = useState<MobilePlayerPerformance>();

  useEffect(() => {
    if (!client || mode === "preview") return;
    let active = true;
    void Promise.all([
      client.public.playerIntelligence
        .query({ handle: player.handle })
        .catch(() => undefined),
      client.public.playerPerformance
        .query({ handle: player.handle })
        .catch(() => undefined),
    ]).then(([nextIntelligence, nextPerformance]) => {
      if (!active) return;
      setIntelligence(nextIntelligence);
      setPerformance(nextPerformance);
    });
    return () => {
      active = false;
    };
  }, [client, mode, player.handle]);

  const profile = intelligence?.profile;
  const history = performance?.history ?? [];
  const chronological = [...history].reverse();
  const recentForm = history.slice(0, 10);
  const wins = history.filter((match) => match.actualResult >= 0.5).length;
  const losses = Math.max(0, history.length - wins);
  const winRate = history.length
    ? Math.round((wins / history.length) * 100)
    : 0;
  const lastTenWins = recentForm.filter(
    (match) => match.actualResult >= 0.5,
  ).length;
  const startRating = chronological[0]?.beforeDisplay;
  const currentRating =
    chronological.at(-1)?.afterDisplay ?? player.rating.display;
  const netMovement =
    startRating === undefined
      ? (player.rating.delta ?? 0)
      : currentRating - startRating;
  const biggestUpset = history
    .filter((match) => match.actualResult >= 0.5)
    .sort(
      (left, right) =>
        left.expectedWinProbability - right.expectedWinProbability,
    )[0];
  const toughestLoss = history
    .filter((match) => match.actualResult < 0.5)
    .sort(
      (left, right) =>
        right.expectedWinProbability - left.expectedWinProbability,
    )[0];
  const chartMatches = chronological.slice(-18);
  const ratingValues = chartMatches.flatMap((match) => [
    match.beforeDisplay,
    match.afterDisplay,
  ]);
  const minimumRating = ratingValues.length
    ? Math.min(...ratingValues)
    : currentRating - 0.12;
  const maximumRating = ratingValues.length
    ? Math.max(...ratingValues)
    : currentRating + 0.12;
  const worldRank = performance?.worldRanking;
  const worldMovement = worldRank?.previousRank
    ? worldRank.previousRank - worldRank.rank
    : undefined;
  const fallbackProfileMetrics = [
    {
      label: "Record",
      value: history.length ? `${wins}–${losses}` : `${fallbackMatches.length}`,
    },
    { label: "Win rate", value: history.length ? `${winRate}%` : "Pending" },
    {
      label: "Last 10",
      value: recentForm.length
        ? `${lastTenWins}–${recentForm.length - lastTenWins}`
        : "Pending",
    },
    {
      label: "World rank",
      value: worldRank ? `#${worldRank.rank}` : "—",
    },
  ];
  const heroSource = profile?.heroImageUrl
    ? { uri: profile.heroImageUrl }
    : undefined;
  const hasPersonalHero = Boolean(heroSource || profile?.cutoutImageUrl);

  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="YOUR PLAYER STORY" />
      <ImageBackground
        imageStyle={styles.athleteHeroImage}
        source={heroSource}
        style={[
          styles.athleteHero,
          !hasPersonalHero && styles.athleteHeroCompact,
        ]}
      >
        <View
          style={[
            styles.athleteHeroWash,
            !hasPersonalHero && styles.athleteHeroWashCompact,
          ]}
        />
        <View style={styles.athleteHeroGeometry} />
        <View
          style={[
            styles.athleteHeroContent,
            !hasPersonalHero && styles.athleteHeroContentCompact,
          ]}
        >
          <View style={styles.athleteHeroPills}>
            <Pill
              tone={player.roles.includes("player") ? "positive" : "neutral"}
            >
              {player.roles.includes("player") ? "Player" : "Member"}
            </Pill>
            {settings?.dunaPlus.kind === "complimentary" && (
              <Pill tone="positive">Complimentary Premium+</Pill>
            )}
            {worldRank && (
              <Pill tone="warning">{`World #${worldRank.rank}`}</Pill>
            )}
          </View>
          <Text style={styles.athleteHeroName}>{player.displayName}</Text>
          <Text style={styles.athleteHeroMeta}>
            {profile?.countryCode ? `${profile.countryCode} · ` : ""}
            {profile?.playingRole ? `${profile.playingRole} · ` : ""}@
            {player.handle}
          </Text>
          <View style={styles.athleteHeroActions}>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  `${dunaWebUrl}/players/${player.handle}`,
                )
              }
              style={styles.athleteHeroPrimaryAction}
            >
              <Text style={styles.athleteHeroPrimaryActionText}>
                View public page
              </Text>
            </Pressable>
            <Pressable
              disabled={mode === "preview"}
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  `${dunaWebUrl}/app/settings#player-artwork`,
                )
              }
              style={styles.athleteHeroSecondaryAction}
            >
              <Text style={styles.athleteHeroSecondaryActionText}>
                Create artwork
              </Text>
            </Pressable>
          </View>
        </View>
        {profile?.cutoutImageUrl && (
          <Image
            accessibilityLabel={profile.imageAlt ?? player.displayName}
            resizeMode="contain"
            source={{ uri: profile.cutoutImageUrl }}
            style={styles.athleteHeroCutout}
          />
        )}
        <View style={styles.athleteHeroRating}>
          <Text style={styles.athleteHeroRatingLabel}>SAND RATING</Text>
          <Text style={styles.athleteHeroRatingValue}>
            {currentRating.toFixed(2)}
          </Text>
          <Text style={styles.athleteHeroRatingMeta}>
            {player.rating.confidence}
          </Text>
        </View>
      </ImageBackground>

      <MemberOrganizationCard />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalBleed}
      >
        <View style={styles.athleteMetricRow}>
          {fallbackProfileMetrics.map((metric, index) => (
            <View
              key={metric.label}
              style={[
                styles.athleteMetricCard,
                index === 0 && styles.athleteMetricCardAccent,
              ]}
            >
              <Text style={styles.athleteMetricLabel}>{metric.label}</Text>
              <Text style={styles.athleteMetricValue}>{metric.value}</Text>
              {metric.label === "World rank" && worldMovement !== undefined ? (
                <Text
                  style={[
                    styles.athleteMetricChange,
                    worldMovement >= 0
                      ? styles.positiveText
                      : styles.negativeText,
                  ]}
                >
                  {worldMovement >= 0 ? "↑" : "↓"} {Math.abs(worldMovement)}{" "}
                  places
                </Text>
              ) : (
                <Text style={styles.athleteMetricChange}>
                  {metric.label === "Record"
                    ? `${history.length} rated matches`
                    : metric.label === "Last 10"
                      ? "Current form"
                      : metric.label === "Win rate"
                        ? "Verified results"
                        : "Official signal"}
                </Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.athleteNarrativeCard}>
        <View style={styles.athleteNarrativeHeading}>
          <View style={styles.athleteNarrativeMark}>
            <Text style={styles.athleteNarrativeMarkText}>✦</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>DUNA FORM REPORT</Text>
            <Text style={styles.athleteNarrativeTitle}>
              The story in the results.
            </Text>
          </View>
        </View>
        <Text style={styles.athleteNarrativeBody}>
          {profile?.shortBio ??
            (history.length
              ? `${player.displayName} is ${wins}–${losses} across ${history.length} verified matches, with a ${currentRating.toFixed(2)} Sand Rating and ${lastTenWins} wins in the last ${recentForm.length}.`
              : `${player.displayName}'s verified performance story will sharpen as connected results arrive.`)}
        </Text>
        {profile?.sourceLabel && (
          <Text style={styles.athleteNarrativeSource}>
            {profile.sourceLabel} · {profile.evidenceCount} evidence sources
          </Text>
        )}
      </View>

      <View style={styles.athleteChartCard}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.eyebrow}>RATING HISTORY</Text>
            <Text style={styles.athleteChartTitle}>Form over time.</Text>
          </View>
          <Pill tone={netMovement >= 0 ? "positive" : "warning"}>
            {`${netMovement >= 0 ? "+" : ""}${netMovement.toFixed(2)}`}
          </Pill>
        </View>
        <View style={styles.athleteChartSummary}>
          <View>
            <Text style={styles.athleteChartSummaryValue}>
              {startRating?.toFixed(2) ?? "—"}
            </Text>
            <Text style={styles.athleteChartSummaryLabel}>First connected</Text>
          </View>
          <Text style={styles.athleteChartArrow}>→</Text>
          <View>
            <Text style={styles.athleteChartSummaryValue}>
              {currentRating.toFixed(2)}
            </Text>
            <Text style={styles.athleteChartSummaryLabel}>Current</Text>
          </View>
          <View style={styles.athleteChartRange}>
            <Text style={styles.athleteChartSummaryValue}>
              {(maximumRating - minimumRating).toFixed(2)}
            </Text>
            <Text style={styles.athleteChartSummaryLabel}>Range</Text>
          </View>
        </View>
        {chartMatches.length ? (
          <View style={styles.athleteWaveChart}>
            {chartMatches.map((match) => {
              const range = Math.max(0.01, maximumRating - minimumRating);
              const height =
                28 + ((match.afterDisplay - minimumRating) / range) * 88;
              return (
                <View key={match.id} style={styles.athleteWaveColumn}>
                  <View
                    style={[
                      styles.athleteWaveBar,
                      {
                        height,
                        backgroundColor:
                          match.actualResult >= 0.5
                            ? colors.aqua
                            : rgba(colors.dangerRgb, 0.65),
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.athleteChartEmpty}>
            <Text style={styles.athleteChartEmptyMark}>↗</Text>
            <Text style={styles.athleteChartEmptyText}>
              Connect verified match sources to unlock the rating waveform.
            </Text>
          </View>
        )}
        <View style={styles.athleteChartLegend}>
          <Text>● Win</Text>
          <Text style={styles.athleteChartLegendLoss}>● Loss</Text>
          <Text>{chartMatches.length} recent rated results</Text>
        </View>
      </View>

      {(biggestUpset || toughestLoss) && (
        <>
          <SectionHeader
            eyebrow="MATCH INTELLIGENCE"
            title="Results that moved the story."
          />
          <View style={styles.athleteMomentGrid}>
            {biggestUpset && (
              <View style={styles.athleteMomentCard}>
                <Text style={styles.athleteMomentEyebrow}>BIGGEST UPSET</Text>
                <Text style={styles.athleteMomentValue}>
                  {Math.round(biggestUpset.expectedWinProbability * 100)}%
                </Text>
                <Text numberOfLines={2} style={styles.athleteMomentTitle}>
                  vs. {matchSides(biggestUpset, player.id).opponent}
                </Text>
                <Text style={styles.athleteMomentMeta}>
                  Won from the lower pre-match probability
                </Text>
              </View>
            )}
            {toughestLoss && (
              <View
                style={[
                  styles.athleteMomentCard,
                  styles.athleteMomentCardMuted,
                ]}
              >
                <Text style={styles.athleteMomentEyebrow}>TOUGHEST LOSS</Text>
                <Text style={styles.athleteMomentValue}>
                  {Math.round(toughestLoss.expectedWinProbability * 100)}%
                </Text>
                <Text numberOfLines={2} style={styles.athleteMomentTitle}>
                  vs. {matchSides(toughestLoss, player.id).opponent}
                </Text>
                <Text style={styles.athleteMomentMeta}>
                  Favored before the opening serve
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {intelligence?.upcomingEvents.length ? (
        <>
          <SectionHeader eyebrow="NEXT ON TOUR" title="Where to watch." />
          <View style={styles.athleteUpcomingList}>
            {intelligence.upcomingEvents.map((event) => (
              <Pressable
                key={event.id}
                onPress={() =>
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/events/${event.slug}`,
                  )
                }
                style={styles.athleteUpcomingCard}
              >
                <View style={styles.athleteUpcomingDate}>
                  <Text style={styles.athleteUpcomingMonth}>
                    {event.startsOn
                      ? new Intl.DateTimeFormat("en-US", { month: "short" })
                          .format(new Date(`${event.startsOn}T12:00:00`))
                          .toUpperCase()
                      : "TBD"}
                  </Text>
                  <Text style={styles.athleteUpcomingDay}>
                    {event.startsOn
                      ? new Intl.DateTimeFormat("en-US", {
                          day: "numeric",
                        }).format(new Date(`${event.startsOn}T12:00:00`))
                      : "—"}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.athleteUpcomingName}>{event.name}</Text>
                  <Text style={styles.athleteUpcomingMeta}>
                    {[event.location, event.countryCode]
                      .filter(Boolean)
                      .join(", ") || "Location pending"}
                  </Text>
                  <Text style={styles.athleteUpcomingWatch}>
                    {event.watchOptions.length
                      ? `Watch on ${event.watchOptions.map((option) => option.label).join(" + ")}`
                      : "Broadcast details coming soon"}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {history.length ? (
        <>
          <SectionHeader
            eyebrow="FULL BREAKDOWN"
            title="Recent rated matches."
          />
          <View style={styles.athleteResultsList}>
            {history.slice(0, 8).map((match) => (
              <MobileResultCard
                key={match.id}
                match={match}
                personId={player.id}
              />
            ))}
          </View>
          <Pressable
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `${dunaWebUrl}/players/${player.handle}#matches`,
              )
            }
            style={styles.athleteFullHistoryButton}
          >
            <Text style={styles.athleteFullHistoryButtonText}>
              Open full match history
            </Text>
            <Text style={styles.athleteFullHistoryButtonText}>↗</Text>
          </Pressable>
        </>
      ) : null}

      {(profile?.biography || profile?.collegeName || profile?.hometown) && (
        <View style={styles.athleteBioCard}>
          <Text style={styles.eyebrow}>PLAYER BIO</Text>
          <Text style={styles.athleteBioTitle}>Beyond the rating.</Text>
          {profile.biography && (
            <Text style={styles.athleteBioBody}>{profile.biography}</Text>
          )}
          <View style={styles.athleteBioFacts}>
            {profile.hometown && (
              <View>
                <Text style={styles.athleteBioFactLabel}>Hometown</Text>
                <Text style={styles.athleteBioFactValue}>
                  {profile.hometown}
                </Text>
              </View>
            )}
            {profile.collegeName && (
              <View>
                <Text style={styles.athleteBioFactLabel}>College</Text>
                <Text style={styles.athleteBioFactValue}>
                  {profile.collegeName}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.profileSetupCard}>
        <View style={styles.profileSetupTop}>
          <View style={styles.profileSetupMark}>
            <Text style={styles.profileSetupMarkText}>✦</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>YOUR PROFILE STUDIO</Text>
            <Text style={styles.cardTitle}>
              {settings?.profile.onboardingStatus === "complete"
                ? "Keep your story and artwork current."
                : "Tell Duna how you play."}
            </Text>
          </View>
        </View>
        <Text style={styles.bodyText}>
          Add playing details, connect match sources, and submit one action
          photo plus two or three portraits for your reviewable Duna artwork
          package.
        </Text>
        <View style={styles.profileSetupStatus}>
          <Text style={styles.rowMeta}>
            Profile:{" "}
            {settings?.profile.onboardingStatus.replaceAll("-", " ") ??
              "not started"}
          </Text>
          <Text style={styles.rowMeta}>
            Sources: {settings?.sourceConnections.length ?? 0}
          </Text>
        </View>
        <View style={styles.athleteStudioActions}>
          <Pressable
            disabled={mode === "preview"}
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                settings?.profile.onboardingStatus === "complete"
                  ? `${dunaWebUrl}/app/settings#playing-profile`
                  : `${dunaWebUrl}/app/onboarding`,
              )
            }
            style={[styles.primaryButton, styles.flex]}
          >
            <Text style={styles.primaryButtonText}>Edit player details</Text>
          </Pressable>
          <Pressable
            disabled={mode === "preview"}
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `${dunaWebUrl}/app/settings#player-artwork`,
              )
            }
            style={styles.athleteStudioSecondary}
          >
            <Text style={styles.athleteStudioSecondaryText}>Artwork</Text>
          </Pressable>
        </View>
      </View>

      <PlayerCalendarSettings
        bookings={dashboard?.bookings ?? []}
        palette={{
          surface: colors.depth,
          border: rgba(colors.overlayRgb, 0.1),
          accentSurface: colors.navyLift,
          accent: colors.aqua,
          text: colors.bone,
          muted: colors.muted,
          positive: colors.positive,
          warningSurface: rgba(colors.warningRgb, 0.12),
          warning: colors.warning,
          onWarning: colors.onAccent,
          primary: colors.aqua,
          onPrimary: colors.onAccent,
        }}
      />

      <TournamentPasses
        palette={{
          surface: colors.depth,
          surfaceAlt: colors.navyLift,
          border: rgba(colors.overlayRgb, 0.1),
          text: colors.bone,
          muted: colors.muted,
          playerAccent: colors.aqua,
          fanAccent: colors.warning,
          positive: colors.positive,
          warning: colors.warning,
          button: colors.bone,
          onButton: colors.depth,
          qrBackground: colors.bone,
          qrForeground: colors.depth,
        }}
      />

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
          Compare private recovery context with your matches and Duna Vision
          without exposing health data on your public profile.
        </Text>
      </Pressable>

      <View style={styles.profileMenu}>
        <Pressable onPress={onWallet} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Wallet + payments</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        {[
          ["Player details + identity", "#playing-profile"],
          ["Player artwork", "#player-artwork"],
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
            <Text style={styles.rowTitle}>{item}</Text>
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
  const { client, dashboard, mode, people, refresh, settings } =
    usePlayerRuntime();
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
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [teamPaymentMode, setTeamPaymentMode] = useState<"self" | "team">(
    "self",
  );
  const [teamRoster, setTeamRoster] = useState<
    readonly {
      readonly personId?: string;
      readonly inviteTarget?: string;
      readonly displayName?: string;
    }[]
  >([]);
  const [teammateQuery, setTeammateQuery] = useState("");
  const [teammateResults, setTeammateResults] = useState<
    readonly TeammateSearchResult[]
  >([]);
  const [inviteTarget, setInviteTarget] = useState("");
  const [acceptedPolicyIds, setAcceptedPolicyIds] = useState<readonly string[]>(
    [],
  );
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>();
  const teammateSearchTimeout = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
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
  const participantOptions: readonly RegistrationParticipant[] = settings
    ? [
        {
          person: settings.profile.person,
          label: "You",
          available: settings.profile.ageBand === "adult",
          birthDate: settings.profile.birthDate,
          ageBand: settings.profile.ageBand,
          genderCategory: settings.profile.genderCategory,
        },
        ...settings.household
          .filter((member) => member.role === "dependent")
          .map((member) => ({
            person: member.person,
            label: member.relationship,
            available: member.verified,
            birthDate: member.birthDate,
            ageBand: member.ageBand,
            genderCategory: member.genderCategory,
          })),
      ]
    : [{ person: player, label: "You", available: true }];
  const selectedParticipant =
    participantOptions.find(
      (participant) => participant.person.id === selectedParticipantId,
    ) ?? participantOptions.find((participant) => participant.available);
  const selectedParticipantEligibility = registrationParticipantEligibility(
    selectedParticipant,
    division,
    event.startsAt,
  );
  const listedPrice =
    purchaseKind === "ticket"
      ? (ticket?.price ?? event.price)
      : teamPaymentMode === "team"
        ? (division?.teamPrice ?? division?.price ?? event.price)
        : (division?.playerPrice ?? division?.price ?? event.price);
  const selectedTeamSize =
    division?.teamSize ??
    {
      solo: 1,
      doubles: 2,
      "three-person": 3,
      "four-person": 4,
      "six-person": 6,
    }[division?.teamFormat ?? "solo"];
  const requiredPolicies =
    event.policies?.filter(
      (policy) =>
        policy.required &&
        (purchaseKind === "entry" || policy.kind !== "waiver"),
    ) ?? [];
  const rosterComplete =
    selectedTeamSize <= 1 || teamRoster.length >= selectedTeamSize - 1;
  const policiesComplete = requiredPolicies.every((policy) =>
    acceptedPolicyIds.includes(policy.id),
  );
  const listedSubtotalMinor =
    listedPrice.amountMinor * (purchaseKind === "ticket" ? ticketQuantity : 1);
  const teammateCandidates =
    teammateResults.length > 0
      ? teammateResults
      : (people ?? demoPeople)
          .filter(
            (candidate) => candidate.id !== selectedParticipant?.person.id,
          )
          .slice(0, 8)
          .map((candidate) => ({
            person: candidate,
            relationship:
              candidate.homeMarket === selectedParticipant?.person.homeMarket
                ? ("nearby" as const)
                : ("search" as const),
            sharedTeams: 0,
            gender: "Not listed",
            eligible: true,
            eligibilityReasons: [],
          }));

  function searchTeammates(value: string) {
    setTeammateQuery(value);
    if (teammateSearchTimeout.current) {
      clearTimeout(teammateSearchTimeout.current);
    }
    teammateSearchTimeout.current = setTimeout(() => {
      if (!client || mode === "preview") return;
      void client.player.teammateSearch
        .query({
          query: value.trim() || undefined,
          divisionId: division?.id,
          limit: 12,
        })
        .then(setTeammateResults)
        .catch((reason) => setError(displayError(reason)));
    }, 220);
  }

  function close() {
    setError(undefined);
    setComplete(undefined);
    setPurchaseKind("entry");
    setDivisionId(undefined);
    setTicketTypeId(undefined);
    setTicketQuantity(1);
    setTeamPaymentMode("self");
    setTeamRoster([]);
    setTeammateQuery("");
    setTeammateResults([]);
    setInviteTarget("");
    setAcceptedPolicyIds([]);
    setSelectedParticipantId(undefined);
    setBusy(false);
    onClose();
  }

  async function checkout() {
    if (!client || mode === "preview") return;
    if (!selectedParticipantEligibility.eligible && purchaseKind === "entry") {
      setError(
        `${selectedParticipantEligibility.reason}. Choose a different player or division.`,
      );
      return;
    }
    if (!rosterComplete) {
      setError(`Add ${selectedTeamSize - 1} teammates before continuing.`);
      return;
    }
    if (!policiesComplete) {
      setError("Read and accept every required event agreement.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.player.startEventCheckout.mutate({
        sessionId: selectedEvent.id,
        divisionId: purchaseKind === "entry" ? division?.id : undefined,
        ticketTypeId: purchaseKind === "ticket" ? ticket?.id : undefined,
        ticketQuantity: purchaseKind === "ticket" ? ticketQuantity : undefined,
        teamPaymentMode:
          purchaseKind === "entry" && selectedTeamSize > 1
            ? teamPaymentMode
            : undefined,
        teamRoster:
          purchaseKind === "entry" && selectedTeamSize > 1
            ? [...teamRoster]
            : undefined,
        subjectPersonId:
          purchaseKind === "entry" ? selectedParticipant?.person.id : undefined,
        acceptedPolicyIds: [...acceptedPolicyIds],
        readPolicyIds: [...acceptedPolicyIds],
        isDunaPlus: Boolean(settings?.membership),
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        successUrl: `${dunaWebUrl}/app/checkout/${selectedEvent.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${dunaWebUrl}/events/${selectedEvent.slug}?checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.paymentSheet) {
        const paymentIntentId = result.paymentSheet.paymentIntentId;
        let status = await client.player.checkoutStatus.query({
          paymentIntentId,
        });
        if (!status.complete) {
          const paymentResult = await presentNativeEventPayment({
            paymentSheet: result.paymentSheet,
            customerName: player.displayName,
          });
          if (paymentResult === "cancelled") return;
          for (let attempt = 0; attempt < 5 && !status.complete; attempt += 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, 450 + attempt * 250),
            );
            status = await client.player.checkoutStatus.query({
              paymentIntentId,
            });
          }
        }
        setComplete(
          status.complete
            ? {
                label: "Confirmed",
                title: "You’re in.",
                body: `${selectedEvent.title} is confirmed and now appears with your bookings.`,
              }
            : {
                label: "Pending",
                title: "Payment received.",
                body: "Duna is finishing the registration and will add it to your bookings shortly.",
              },
        );
      } else if (result.checkoutUrl) {
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
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.mobileDivisionRail}
                  >
                    {event.divisions.map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          setDivisionId(option.id);
                          setTeamPaymentMode("self");
                          setTeamRoster([]);
                        }}
                        style={[
                          styles.mobileDivisionOption,
                          division?.id === option.id &&
                            styles.mobileDivisionOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.mobileDivisionOptionName,
                            division?.id === option.id &&
                              styles.mobileDivisionOptionNameActive,
                          ]}
                        >
                          {option.name}
                        </Text>
                        <Text style={styles.mobileDivisionOptionMeta}>
                          {option.ageMaximum
                            ? `${option.ageMaximum}U · `
                            : "All ages · "}
                          {option.spotsRemaining} spots
                        </Text>
                        <View style={styles.mobileDivisionPrices}>
                          <Text style={styles.mobileDivisionPrice}>
                            {formatMoney(
                              option.playerPrice.amountMinor,
                              option.playerPrice.currency,
                            )}{" "}
                            player
                          </Text>
                          <Text style={styles.mobileDivisionPrice}>
                            {formatMoney(
                              option.teamPrice.amountMinor,
                              option.teamPrice.currency,
                            )}{" "}
                            team
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.mobileTicketRail}
                >
                  {event.tickets
                    .filter((option) => option.availableOnline)
                    .map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          setTicketTypeId(option.id);
                          setTicketQuantity(1);
                        }}
                        style={[
                          styles.mobileTicketCard,
                          ticket?.id === option.id &&
                            styles.mobileTicketCardActive,
                        ]}
                      >
                        <Text style={styles.mobileTicketPrice}>
                          {option.price.amountMinor
                            ? formatMoney(
                                option.price.amountMinor,
                                option.price.currency,
                              )
                            : "FREE"}
                        </Text>
                        <View style={styles.mobileTicketCardBody}>
                          <Text style={styles.mobileTicketName}>
                            {option.name}
                          </Text>
                          <Text
                            numberOfLines={4}
                            style={styles.mobileTicketDescription}
                          >
                            {option.description ??
                              `${option.remaining ?? "Unlimited"} available`}
                          </Text>
                        </View>
                        {ticket?.id === option.id && (
                          <View style={styles.mobileTicketQuantity}>
                            <Pressable
                              disabled={ticketQuantity <= 1}
                              onPress={() =>
                                setTicketQuantity((current) =>
                                  Math.max(1, current - 1),
                                )
                              }
                              style={styles.mobileQuantityButton}
                            >
                              <Text style={styles.mobileQuantityButtonText}>
                                −
                              </Text>
                            </Pressable>
                            <Text style={styles.mobileQuantityValue}>
                              {ticketQuantity}
                            </Text>
                            <Pressable
                              disabled={
                                ticketQuantity >=
                                Math.min(10, option.remaining ?? 10)
                              }
                              onPress={() =>
                                setTicketQuantity((current) =>
                                  Math.min(10, current + 1),
                                )
                              }
                              style={styles.mobileQuantityButton}
                            >
                              <Text style={styles.mobileQuantityButtonText}>
                                +
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </Pressable>
                    ))}
                </ScrollView>
              </View>
            ) : null}
            {purchaseKind === "entry" && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>WHO’S PLAYING</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.mobileParticipantRail}
                >
                  {participantOptions.map((participant) => {
                    const rating = participant.person.rating.display;
                    const eligibility = registrationParticipantEligibility(
                      participant,
                      division,
                      event.startsAt,
                    );
                    const selected =
                      participant.person.id === selectedParticipant?.person.id;
                    return (
                      <Pressable
                        disabled={!eligibility.eligible}
                        key={participant.person.id}
                        onPress={() =>
                          setSelectedParticipantId(participant.person.id)
                        }
                        style={[
                          styles.mobileParticipantCard,
                          selected && styles.mobileParticipantCardActive,
                          !eligibility.eligible &&
                            styles.mobileParticipantCardDisabled,
                        ]}
                      >
                        {participant.person.avatarUrl ? (
                          <Image
                            source={{ uri: participant.person.avatarUrl }}
                            style={styles.mobileParticipantAvatar}
                          />
                        ) : (
                          <View style={styles.mobileParticipantAvatarFallback}>
                            <Text style={styles.miniAvatarText}>
                              {participant.person.initials}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.mobileParticipantName}>
                          {participant.person.displayName}
                        </Text>
                        <Text style={styles.mobileParticipantMeta}>
                          {participant.label} ·{" "}
                          {registrationParticipantAge(
                            participant,
                            event.startsAt,
                          )}{" "}
                          · {rating.toFixed(2)}
                        </Text>
                        <Text
                          style={[
                            styles.mobileParticipantEligibility,
                            eligibility.eligible
                              ? styles.mobileParticipantEligible
                              : styles.mobileParticipantIneligible,
                          ]}
                        >
                          {eligibility.reason}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {purchaseKind === "entry" && selectedTeamSize > 1 && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>COMPLETE YOUR TEAM</Text>
                <Text style={styles.mobileTeamHeading}>
                  {teamRoster.length + 1} of {selectedTeamSize} players added
                </Text>
                <Text style={styles.checkoutSummaryText}>
                  Registration completes when all {selectedTeamSize} players
                  claim their spot and the required entries are paid.
                </Text>
                <View style={styles.mobileRosterRow}>
                  <View style={styles.mobileRosterPlayer}>
                    <View style={styles.miniAvatar}>
                      <Text style={styles.miniAvatarText}>
                        {selectedParticipant?.person.initials ??
                          player.initials}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.mobileRosterName}>
                      {selectedParticipant?.person.displayName ??
                        player.displayName}
                    </Text>
                    <Text style={styles.mobileRosterStatus}>Captain</Text>
                  </View>
                  {teamRoster.map((member, index) => {
                    const person = (people ?? demoPeople).find(
                      (candidate) => candidate.id === member.personId,
                    );
                    return (
                      <View
                        key={`${member.personId ?? member.inviteTarget}:${index}`}
                        style={styles.mobileRosterPlayer}
                      >
                        <View style={styles.miniAvatar}>
                          <Text style={styles.miniAvatarText}>
                            {person?.initials ?? "✉"}
                          </Text>
                        </View>
                        <Text numberOfLines={1} style={styles.mobileRosterName}>
                          {person?.displayName ??
                            member.displayName ??
                            "Invite"}
                        </Text>
                        <Pressable
                          onPress={() =>
                            setTeamRoster((current) =>
                              current.filter(
                                (_, memberIndex) => memberIndex !== index,
                              ),
                            )
                          }
                        >
                          <Text style={styles.mobileRosterRemove}>Remove</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {Array.from({
                    length: Math.max(
                      0,
                      selectedTeamSize - 1 - teamRoster.length,
                    ),
                  }).map((_, index) => (
                    <View
                      key={`open:${index}`}
                      style={styles.mobileRosterPlayer}
                    >
                      <View style={styles.mobileRosterOpen}>
                        <Text style={styles.mobileRosterOpenText}>+</Text>
                      </View>
                      <Text style={styles.mobileRosterName}>Open</Text>
                      <Text style={styles.mobileRosterStatus}>Teammate</Text>
                    </View>
                  ))}
                </View>
                {teamRoster.length < selectedTeamSize - 1 && (
                  <>
                    <View style={styles.mobilePlayerSearch}>
                      <Text style={styles.mobilePlayerSearchIcon}>⌕</Text>
                      <TextInput
                        onChangeText={searchTeammates}
                        placeholder="Player, location, or rating"
                        placeholderTextColor={colors.muted}
                        style={styles.mobilePlayerSearchInput}
                        value={teammateQuery}
                      />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.mobileSuggestionRail}
                    >
                      {teammateCandidates
                        .filter(
                          (candidate) =>
                            !teamRoster.some(
                              (member) =>
                                member.personId === candidate.person.id,
                            ),
                        )
                        .map((candidate) => (
                          <View
                            key={candidate.person.id}
                            style={[
                              styles.mobileSuggestionCard,
                              !candidate.eligible &&
                                styles.mobileSuggestionCardDisabled,
                            ]}
                          >
                            {candidate.person.avatarUrl ? (
                              <Image
                                source={{ uri: candidate.person.avatarUrl }}
                                style={styles.mobileSuggestionAvatar}
                              />
                            ) : (
                              <View
                                style={styles.mobileSuggestionAvatarFallback}
                              >
                                <Text style={styles.miniAvatarText}>
                                  {candidate.person.initials}
                                </Text>
                              </View>
                            )}
                            <Text
                              numberOfLines={1}
                              style={styles.mobileSuggestionName}
                            >
                              {candidate.person.displayName}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={styles.mobileSuggestionMeta}
                            >
                              {candidate.person.homeMarket}
                            </Text>
                            <Text style={styles.mobileSuggestionMeta}>
                              {candidate.gender.replaceAll("-", " ")} ·{" "}
                              {candidate.person.rating.display.toFixed(2)}
                            </Text>
                            <Pressable
                              disabled={!candidate.eligible}
                              onPress={() =>
                                setTeamRoster((current) => [
                                  ...current,
                                  {
                                    personId: candidate.person.id,
                                    displayName: candidate.person.displayName,
                                  },
                                ])
                              }
                              style={styles.mobileSuggestionAdd}
                            >
                              <Text style={styles.mobileSuggestionAddText}>
                                {candidate.eligible ? "Add" : "Not eligible"}
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                    </ScrollView>
                    <View style={styles.mobileInviteRow}>
                      <TextInput
                        onChangeText={setInviteTarget}
                        placeholder="Email or mobile number"
                        placeholderTextColor={colors.muted}
                        style={styles.mobileInviteInput}
                        value={inviteTarget}
                      />
                      <Pressable
                        disabled={inviteTarget.trim().length < 3}
                        onPress={() => {
                          const value = inviteTarget.trim();
                          if (!value) return;
                          setTeamRoster((current) => [
                            ...current,
                            { inviteTarget: value, displayName: value },
                          ]);
                          setInviteTarget("");
                        }}
                        style={styles.mobileInviteButton}
                      >
                        <Text style={styles.mobileInviteButtonText}>
                          Invite
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
                <View style={styles.mobileTeamPaymentChoices}>
                  <Pressable
                    onPress={() => setTeamPaymentMode("self")}
                    style={[
                      styles.mobileTeamPaymentChoice,
                      teamPaymentMode === "self" &&
                        styles.mobileTeamPaymentChoiceActive,
                    ]}
                  >
                    <Text style={styles.rowTitle}>Pay my registration</Text>
                    <Text style={styles.rowMeta}>Teammates claim + pay</Text>
                    <Text style={styles.moneyAmount}>
                      {formatMoney(
                        division?.playerPrice.amountMinor ??
                          listedPrice.amountMinor,
                        division?.playerPrice.currency ?? listedPrice.currency,
                      )}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTeamPaymentMode("team")}
                    style={[
                      styles.mobileTeamPaymentChoice,
                      teamPaymentMode === "team" &&
                        styles.mobileTeamPaymentChoiceActive,
                    ]}
                  >
                    <Text style={styles.rowTitle}>Pay for the team</Text>
                    <Text style={styles.rowMeta}>You cover every player</Text>
                    <Text style={styles.moneyAmount}>
                      {formatMoney(
                        division?.teamPrice.amountMinor ??
                          listedPrice.amountMinor,
                        division?.teamPrice.currency ?? listedPrice.currency,
                      )}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            {event.features && event.features.length > 0 && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>EVENT FEATURES</Text>
                {event.features.map((feature) =>
                  feature.kind === "guest" ? (
                    <Pressable
                      disabled={!feature.personHandle}
                      key={feature.id}
                      onPress={() =>
                        feature.personHandle
                          ? void WebBrowser.openBrowserAsync(
                              `${dunaWebUrl}/players/${feature.personHandle}`,
                            )
                          : undefined
                      }
                      style={styles.mobileGuestCard}
                    >
                      {feature.imageUrl ? (
                        <Image
                          source={{ uri: feature.imageUrl }}
                          style={styles.mobileGuestImage}
                        />
                      ) : (
                        <View style={styles.mobileGuestImageFallback}>
                          <Text style={styles.mobileGuestInitials}>
                            {feature.personInitials ?? "★"}
                          </Text>
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text style={styles.mobileGuestLabel}>
                          FEATURED GUEST
                        </Text>
                        <Text style={styles.mobileGuestName}>
                          {feature.personName ?? feature.title}
                        </Text>
                        <Text style={styles.mobileGuestMeta}>
                          {[
                            feature.personHomeMarket,
                            feature.personRating !== undefined
                              ? `${feature.personRating.toFixed(2)} rating`
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        {feature.description && (
                          <Text numberOfLines={3} style={styles.rowMeta}>
                            {feature.description}
                          </Text>
                        )}
                        {feature.personHandle && (
                          <Text style={styles.mobileGuestLink}>
                            View profile →
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ) : (
                    <View key={feature.id} style={styles.mobileFeatureRow}>
                      <Text style={styles.mobileFeatureIcon}>
                        {feature.kind === "activity" ? "✦" : "◇"}
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
                  ),
                )}
              </View>
            )}
            {event.policies && event.policies.length > 0 && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>AGREEMENTS</Text>
                <Text style={styles.checkoutSummaryText}>
                  Read every required document here. Each acceptance is stored
                  with the exact version shown to you.
                </Text>
                <View style={styles.mobilePolicyList}>
                  {event.policies
                    .filter(
                      (policy) =>
                        purchaseKind === "entry" || policy.kind !== "waiver",
                    )
                    .map((policy) => {
                      const accepted = acceptedPolicyIds.includes(policy.id);
                      return (
                        <View key={policy.id} style={styles.mobilePolicyCard}>
                          <View style={styles.mobilePolicyHeader}>
                            <Text style={styles.rowTitle}>{policy.title}</Text>
                            <Text style={styles.mobilePolicyKind}>
                              {policy.kind.toUpperCase()}
                            </Text>
                          </View>
                          <ScrollView
                            nestedScrollEnabled
                            style={styles.mobilePolicyDocument}
                          >
                            <Text style={styles.mobilePolicyDocumentText}>
                              {policy.markdown}
                            </Text>
                          </ScrollView>
                          <Pressable
                            onPress={() =>
                              setAcceptedPolicyIds((current) =>
                                accepted
                                  ? current.filter((id) => id !== policy.id)
                                  : [...current, policy.id],
                              )
                            }
                            style={[
                              styles.mobilePolicyAccept,
                              accepted && styles.mobilePolicyAcceptActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.mobilePolicyAcceptText,
                                accepted && styles.mobilePolicyAcceptTextActive,
                              ]}
                            >
                              {accepted ? "✓ Accepted" : "I read and accept"}
                              {policy.required ? " · required" : " · optional"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
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
                      ? "Pay securely in Duna"
                      : "Free registration"}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {listedPrice.amountMinor
                      ? "Use a saved card, Link, or add a card without leaving the app. Payment details go directly to Stripe."
                      : "No payment method is required."}
                  </Text>
                </View>
                <Text style={styles.moneyAmount}>
                  {listedSubtotalMinor
                    ? formatMoney(listedSubtotalMinor, listedPrice.currency)
                    : "FREE"}
                </Text>
              </View>
            </View>
            <View style={styles.orderMath}>
              <View>
                <Text style={styles.bodyText}>
                  {purchaseKind === "ticket"
                    ? `${ticketQuantity} ticket${ticketQuantity === 1 ? "" : "s"}`
                    : teamPaymentMode === "team" && selectedTeamSize > 1
                      ? "Full team entry"
                      : "Player entry"}
                </Text>
                <Text style={styles.moneyAmount}>
                  {formatMoney(listedSubtotalMinor, listedPrice.currency)}
                </Text>
              </View>
              <View>
                <Text style={styles.bodyText}>Taxes and service fees</Text>
                <Text style={styles.moneyAmount}>Calculated securely</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.rowTitle}>Listed price</Text>
                <Text style={styles.totalAmount}>
                  {formatMoney(listedSubtotalMinor, listedPrice.currency)}
                </Text>
              </View>
            </View>
            {error && <Text style={styles.formError}>{error}</Text>}
            <Pressable
              disabled={
                mode === "preview" ||
                busy ||
                !rosterComplete ||
                !policiesComplete ||
                (purchaseKind === "entry" &&
                  !selectedParticipantEligibility.eligible)
              }
              onPress={() => void checkout()}
              style={[
                styles.payButton,
                (mode === "preview" ||
                  busy ||
                  !rosterComplete ||
                  !policiesComplete ||
                  (purchaseKind === "entry" &&
                    !selectedParticipantEligibility.eligible)) &&
                  styles.buttonDisabled,
              ]}
            >
              <Text style={styles.payButtonText}>
                {mode === "preview"
                  ? "Preview only · checkout disabled"
                  : busy
                    ? "Preparing in-app payment…"
                    : !rosterComplete
                      ? "Complete your team"
                      : !policiesComplete
                        ? "Accept required agreements"
                        : listedSubtotalMinor
                          ? "Choose payment method"
                          : purchaseKind === "ticket"
                            ? "Confirm free tickets"
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
  const insets = useSafeAreaInsets();
  const selectedTab =
    active === "health" || active === "wallet" ? "you" : active;
  return (
    <View style={[styles.tabBar, { bottom: Math.max(12, insets.bottom) }]}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === tab.key }}
          key={tab.key}
          onPress={() => {
            selectionHaptic();
            onChange(tab.key);
          }}
          style={[
            styles.tabItem,
            selectedTab === tab.key && styles.tabItemActive,
          ]}
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
  const deviceTheme: ThemeName = useColorScheme() === "dark" ? "dark" : "light";
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("home");
  const [eventIndex, setEventIndex] = useState<number | null>(null);
  const [discoverIntent, setDiscoverIntent] = useState<{
    readonly key: number;
    readonly kind: Exclude<HomeQuickAction, "record-video">;
  }>();
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("light");
  const theme = themePreference === "system" ? deviceTheme : themePreference;
  const screenTransition = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void AsyncStorage.getItem("duna-theme").then((stored) => {
      if (stored === "dark" || stored === "light" || stored === "system") {
        setThemePreference(stored);
      }
    });
  }, []);

  useEffect(() => {
    const openLiveActivity = (url: string | null) => {
      const match = url?.match(/^duna:\/\/live\/([^/]+)\//);
      if (!match) return;
      setEventIndex(null);
      setTab(match[1] === "upcoming" ? "home" : "discover");
    };
    void Linking.getInitialURL().then(openLiveActivity);
    const subscription = Linking.addEventListener("url", ({ url }) =>
      openLiveActivity(url),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      screenTransition.setValue(1);
      return;
    }
    screenTransition.setValue(0);
    Animated.timing(screenTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, screenTransition, tab]);

  activePalette = theme === "dark" ? darkColors : lightColors;
  activeStyles = theme === "dark" ? darkStyles : lightStyles;

  const openHomeAction = (action: HomeQuickAction) => {
    if (action === "record-video") {
      setTab("video");
      return;
    }
    setDiscoverIntent({ key: Date.now(), kind: action });
    setTab("discover");
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference: themePreference,
        toggle: () => {
          const next: ThemePreference =
            themePreference === "system"
              ? "light"
              : themePreference === "light"
                ? "dark"
                : "system";
          setThemePreference(next);
          void AsyncStorage.setItem("duna-theme", next);
        },
      }}
    >
      <HealthHistorySyncAgent paused={tab === "health"} runtime={runtime} />
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
            {tab === "home" && (
              <HomeScreen onAction={openHomeAction} onBook={setEventIndex} />
            )}
            {tab === "discover" && (
              <DiscoverScreen intent={discoverIntent} onBook={setEventIndex} />
            )}
            {tab === "play" && <PlayScreen />}
            {tab === "video" && <VideoStudioScreen runtime={runtime} />}
            {tab === "wallet" && <WalletScreen />}
            {tab === "you" && (
              <ProfileScreen
                onHealth={() => setTab("health")}
                onWallet={() => setTab("wallet")}
              />
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
  const [fontsLoaded, fontError] = useFellixFonts();

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "800",
    },
    bookingVenueName: {
      color: colors.bone,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -1.6,
      lineHeight: 35,
    },
    bookingDateToolbar: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      marginTop: 22,
    },
    bookingDateToolbarLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    bookingDateToolbarTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
      marginTop: 5,
    },
    bookingDateToolbarActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    bookingDateNavButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 18,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    bookingDateNavText: {
      color: colors.bone,
      fontSize: 22,
      lineHeight: 23,
    },
    bookingDateCalendarButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      height: 34,
      paddingHorizontal: 9,
    },
    bookingDateCalendarIcon: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    bookingDateCalendarText: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
    },
    bookingDateRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 18,
      paddingRight: 36,
      paddingVertical: 15,
    },
    bookingDate: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.14),
      borderRadius: 34,
      borderWidth: 1,
      height: 92,
      justifyContent: "center",
      width: 64,
    },
    bookingDateActive: {
      backgroundColor: colors.aquaDeep,
      borderColor: colors.aquaDeep,
    },
    bookingDateUnavailable: { opacity: 0.32 },
    bookingDateDay: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
    },
    bookingDateNumber: {
      color: colors.bone,
      fontSize: 21,
      fontWeight: "900",
      lineHeight: 24,
      marginTop: 4,
    },
    bookingDateMonth: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 1,
    },
    bookingDateDots: {
      flexDirection: "row",
      gap: 3,
      height: 4,
      marginTop: 5,
    },
    bookingDateDot: {
      borderRadius: 3,
      height: 4,
      width: 4,
    },
    bookingDateDotBooking: { backgroundColor: "#7eb9f0" },
    bookingDateDotEvent: { backgroundColor: colors.flare },
    bookingDateTextActive: { color: "#ffffff" },
    bookingCalendarSafe: {
      backgroundColor: colors.canvas,
      flex: 1,
    },
    bookingCalendarHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 8,
    },
    bookingCalendarEyebrow: {
      color: colors.sand,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    bookingCalendarTitle: {
      color: colors.bone,
      fontSize: 28,
      fontWeight: "900",
      letterSpacing: -1.5,
      lineHeight: 31,
      marginTop: 7,
    },
    bookingCalendarClose: {
      alignItems: "center",
      borderColor: colors.sand,
      borderRadius: 22,
      borderWidth: 1.5,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    bookingCalendarCloseText: {
      color: colors.bone,
      fontSize: 28,
      fontWeight: "300",
      lineHeight: 30,
    },
    bookingCalendarToolbar: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    bookingCalendarNav: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    bookingCalendarNavText: {
      color: colors.bone,
      fontSize: 24,
      lineHeight: 25,
    },
    bookingCalendarRange: {
      color: colors.bone,
      flex: 1,
      fontSize: 10,
      fontWeight: "900",
      paddingHorizontal: 8,
      textAlign: "center",
    },
    bookingCalendarScroll: {
      paddingBottom: 28,
      paddingHorizontal: 14,
    },
    bookingCalendarMonths: { gap: 14 },
    bookingCalendarMonthsWide: {
      alignItems: "flex-start",
      flexDirection: "row",
    },
    bookingCalendarMonth: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 20,
      borderWidth: 1,
      flex: 1,
      padding: 10,
    },
    bookingCalendarMonthTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginBottom: 10,
    },
    bookingCalendarWeekdayRow: { flexDirection: "row" },
    bookingCalendarWeekday: {
      color: colors.muted,
      flex: 1,
      fontSize: 10,
      fontWeight: "900",
      paddingBottom: 7,
      textAlign: "center",
    },
    bookingCalendarGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    bookingCalendarBlank: {
      aspectRatio: 0.95,
      width: "14.285714%",
    },
    bookingCalendarDay: {
      alignItems: "flex-start",
      aspectRatio: 0.95,
      backgroundColor: colors.depth,
      borderColor: "transparent",
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: "space-between",
      padding: 6,
      width: "14.285714%",
    },
    bookingCalendarDayToday: {
      borderColor: colors.aqua,
    },
    bookingCalendarDaySelected: {
      backgroundColor: colors.aquaDeep,
      borderColor: colors.aquaDeep,
    },
    bookingCalendarDayDisabled: { opacity: 0.28 },
    bookingCalendarDayText: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "900",
    },
    bookingCalendarDayTextSelected: { color: "#ffffff" },
    bookingCalendarMarkers: {
      flexDirection: "row",
      gap: 3,
    },
    bookingCalendarMarker: {
      borderRadius: 3,
      height: 5,
      width: 5,
    },
    bookingCalendarMarkerBooking: { backgroundColor: "#4b8fc9" },
    bookingCalendarMarkerEvent: { backgroundColor: colors.flare },
    bookingCalendarLegend: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      justifyContent: "flex-end",
      paddingHorizontal: 4,
      paddingTop: 12,
    },
    bookingCalendarLegendItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    bookingCalendarLegendText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
    },
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
      fontSize: 10,
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
      fontSize: 10,
      marginTop: 5,
    },
    bookingSlotWeather: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 4,
    },
    bookingSlotPrice: {
      color: colors.aqua,
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
      lineHeight: 14,
      marginTop: 12,
      padding: 11,
    },
    formSectionLabel: {
      color: colors.muted,
      fontSize: 10,
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
      fontSize: 10,
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
      height: 30,
      justifyContent: "center",
      width: 40,
    },
    wordmarkText: {
      color: colors.bone,
      fontFamily: "Archivo-Wordmark",
      fontSize: 17,
      fontWeight: "900",
      letterSpacing: 3,
    },
    proPill: {
      backgroundColor: rgba(colors.warningRgb, 0.12),
      borderRadius: 6,
      color: colors.warning,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
      overflow: "hidden",
      paddingHorizontal: 5,
      paddingVertical: 3,
    },
    headerEyebrow: {
      color: colors.muted,
      fontSize: 10,
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
    homeWelcome: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 14,
      marginBottom: 18,
    },
    homeWelcomeDate: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    homeWelcomeTitle: {
      color: colors.bone,
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1.5,
      lineHeight: 35,
      marginTop: 5,
    },
    homeWelcomeBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 7,
      maxWidth: 300,
    },
    homeRatingBadge: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 22,
      borderWidth: 1,
      height: 64,
      justifyContent: "center",
      width: 64,
    },
    homeRatingBadgeValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 17,
      letterSpacing: -0.7,
    },
    homeRatingBadgeLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
      marginTop: 2,
    },
    homeQuickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 14,
    },
    homeQuickAction: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      minHeight: 132,
      padding: 14,
      width: "48%",
    },
    homeQuickActionPrimary: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    homeQuickActionWarm: {
      backgroundColor: rgba(colors.flareRgb, 0.08),
      borderColor: rgba(colors.flareRgb, 0.16),
    },
    homeQuickActionPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
    homeQuickIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 14,
      height: 38,
      justifyContent: "center",
      marginBottom: 13,
      width: 38,
    },
    homeQuickIconPrimary: { backgroundColor: rgba(colors.whiteRgb, 0.18) },
    homeQuickIconText: {
      color: colors.aqua,
      fontSize: 20,
      fontWeight: "800",
      lineHeight: 23,
    },
    homeQuickIconTextPrimary: { color: colors.onAccent },
    homeQuickLabel: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    homeQuickLabelPrimary: { color: colors.onAccent },
    homeQuickMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
    homeQuickMetaPrimary: { color: rgba(colors.whiteRgb, 0.74) },
    homeNextSession: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      marginBottom: 14,
      padding: 14,
    },
    homeNextDate: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 15,
      height: 58,
      justifyContent: "center",
      width: 54,
    },
    homeNextDateMonth: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.9,
    },
    homeNextDateDay: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 22,
      lineHeight: 24,
    },
    homeNextOpenMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 18,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    homeNextOpenMarkText: { color: colors.aqua, fontSize: 22 },
    homeNextEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.9,
    },
    homeNextTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "800",
      marginTop: 3,
    },
    homeNextMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
    homePerformanceCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 24,
      borderWidth: 1,
      marginBottom: 14,
      overflow: "hidden",
      padding: 16,
    },
    homePerformanceTitle: {
      color: colors.bone,
      fontSize: 25,
      fontWeight: "800",
      letterSpacing: -1.1,
      marginTop: 4,
    },
    homePerformanceSummary: {
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 18,
      paddingBottom: 14,
    },
    homePerformanceValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 18,
      letterSpacing: -0.5,
    },
    homePerformanceLabel: { color: colors.muted, fontSize: 10, marginTop: 3 },
    homePerformanceChart: {
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderRadius: 18,
      marginTop: 14,
      overflow: "hidden",
      paddingHorizontal: 4,
      paddingTop: 4,
    },
    homePerformanceEmpty: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderRadius: 18,
      flexDirection: "row",
      gap: 12,
      marginTop: 14,
      minHeight: 118,
      padding: 16,
    },
    homePerformanceEmptyMark: {
      color: colors.aqua,
      fontSize: 29,
      fontWeight: "800",
    },
    homePerformanceEmptyTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "800",
    },
    homePerformanceEmptyBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },
    homePerformanceLegend: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      marginTop: 10,
    },
    homePerformanceLegendWin: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "700",
    },
    homePerformanceLegendLoss: {
      color: colors.danger,
      fontSize: 10,
      fontWeight: "700",
    },
    homePerformanceLegendMeta: {
      color: colors.muted,
      flex: 1,
      fontSize: 10,
      textAlign: "right",
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
    memberOrganizationCount: {
      backgroundColor: rgba(colors.accentRgb, 0.14),
      borderRadius: 12,
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      minWidth: 24,
      overflow: "hidden",
      paddingHorizontal: 7,
      paddingVertical: 5,
      textAlign: "center",
    },
    memberOrganizationArrow: {
      color: colors.aqua,
      fontSize: 24,
      fontWeight: "500",
    },
    organizationModalHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 16,
      padding: 20,
    },
    organizationModalTitle: {
      color: colors.bone,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 4,
    },
    organizationModalContent: {
      gap: 18,
      padding: 20,
      paddingBottom: 52,
    },
    organizationModalIntro: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 440,
    },
    organizationList: { gap: 9 },
    organizationListRow: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 72,
      padding: 12,
    },
    organizationListRowActive: {
      borderColor: rgba(colors.accentRgb, 0.44),
      shadowColor: colors.aqua,
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.09,
      shadowRadius: 18,
    },
    organizationListMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.14),
      borderRadius: 13,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    organizationListMarkText: {
      color: colors.aqua,
      fontSize: 16,
      fontWeight: "900",
    },
    organizationListName: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    organizationListRole: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 3,
    },
    organizationListAction: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    organizationEnrollCard: {
      backgroundColor: rgba(colors.accentRgb, 0.09),
      borderColor: rgba(colors.accentRgb, 0.25),
      borderRadius: 20,
      borderWidth: 1,
      padding: 18,
    },
    organizationEnrollEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    organizationEnrollTitle: {
      color: colors.bone,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: -0.4,
      marginTop: 8,
    },
    organizationEnrollBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 7,
    },
    organizationEnrollActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
    },
    organizationEnrollPrimary: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 12,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: 12,
    },
    organizationEnrollPrimaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    organizationEnrollSecondary: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: 12,
    },
    organizationEnrollSecondaryText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    organizationHqLink: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 16,
    },
    organizationHqEyebrow: {
      color: colors.warning,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    organizationHqTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
      marginTop: 4,
    },
    organizationHqArrow: {
      color: colors.warning,
      fontSize: 20,
      fontWeight: "800",
    },
    coachingNoteCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.24),
      borderRadius: 22,
      borderWidth: 1,
      gap: 14,
      marginBottom: 4,
      overflow: "hidden",
      padding: 18,
      position: "relative",
    },
    coachingNoteAccent: {
      backgroundColor: colors.aqua,
      bottom: 0,
      left: 0,
      position: "absolute",
      top: 0,
      width: 4,
    },
    coachingNoteTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    coachingNoteMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.12),
      borderRadius: 15,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    coachingNoteMarkText: {
      color: colors.aqua,
      fontSize: 18,
      fontWeight: "900",
    },
    coachingNoteEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    coachingNoteTitle: {
      color: colors.bone,
      fontSize: 17,
      fontWeight: "900",
      marginTop: 3,
    },
    coachingNoteMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 4,
    },
    coachingNoteSummary: {
      color: colors.bone,
      fontSize: 14,
      lineHeight: 21,
    },
    coachingNoteSession: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
    },
    coachCardRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 18,
      paddingRight: 36,
    },
    playerFollowRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 18,
      paddingRight: 36,
    },
    playerFollowCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 20,
      borderWidth: 1,
      minHeight: 220,
      padding: 14,
      width: 172,
    },
    playerFollowAvatar: {
      borderRadius: 29,
      height: 82,
      width: 82,
    },
    playerFollowAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 29,
      height: 82,
      justifyContent: "center",
      width: 82,
    },
    playerFollowAvatarText: {
      color: colors.aqua,
      fontSize: 21,
      fontWeight: "900",
    },
    playerFollowName: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 11,
      maxWidth: "100%",
    },
    playerFollowMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 4,
      maxWidth: "100%",
    },
    playerFollowButton: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 12,
      justifyContent: "center",
      marginTop: 12,
      minHeight: 38,
      paddingHorizontal: 14,
      width: "100%",
    },
    playerFollowButtonActive: {
      backgroundColor: rgba(colors.positiveRgb, 0.12),
      borderColor: rgba(colors.positiveRgb, 0.25),
      borderWidth: 1,
    },
    playerFollowButtonText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: "900",
    },
    playerFollowButtonTextActive: { color: colors.positive },
    playerFollowError: {
      color: colors.danger,
      fontSize: 10,
      lineHeight: 13,
      marginTop: 6,
      textAlign: "center",
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
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
      letterSpacing: 0.9,
      transform: [{ rotate: "12deg" }],
    },
    ratingValue: {
      color: colors.bone,
      fontFamily: "Archivo-Hero",
      fontSize: 45,
      fontWeight: "900",
      letterSpacing: -3,
      lineHeight: 48,
      transform: [{ rotate: "12deg" }],
    },
    ratingValueCompact: { fontSize: 34, lineHeight: 36 },
    ratingDelta: {
      color: colors.positive,
      fontSize: 10,
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
      fontSize: 10,
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
    statValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 15,
      fontWeight: "800",
    },
    statLabel: { color: colors.muted, fontSize: 10, marginTop: 3 },
    nextDate: {
      color: colors.aqua,
      fontSize: 10,
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
    miniAvatarText: { color: colors.bone, fontSize: 10, fontWeight: "800" },
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
      fontSize: 10,
      fontWeight: "900",
    },
    liveActivityNotice: {
      color: colors.positive,
      fontSize: 10,
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
      fontFamily: "Archivo-Table",
      fontSize: 14,
      fontWeight: "800",
      textAlign: "center",
    },
    metricLabel: {
      color: colors.muted,
      fontSize: 10,
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
    sectionAction: { color: colors.aqua, fontSize: 10, fontWeight: "700" },
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
      fontSize: 10,
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
    eventMeta: { color: colors.muted, fontSize: 10, marginTop: 5 },
    eventWeather: {
      color: colors.aqua,
      fontSize: 10,
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
    eventSpots: { color: colors.muted, fontSize: 10 },
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
    discoverProEvents: { marginTop: 4 },
    proTourEntryEyebrow: {
      color: "#9de9ff",
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
      lineHeight: 14,
      marginTop: 10,
    },
    proEventUpdated: {
      color: "rgba(255,255,255,.56)",
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "700",
    },
    proBracketWinner: { color: colors.bone, fontWeight: "900" },
    proBracketScore: {
      color: colors.aqua,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "900",
    },
    proBracketPrediction: {
      color: colors.muted,
      fontSize: 10,
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
      fontSize: 10,
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
    proPoolPlace: { color: colors.aqua, fontSize: 10, width: 15 },
    proPoolTeam: { color: colors.bone, flex: 1, fontSize: 10 },
    proPoolRecord: { color: colors.muted, fontSize: 10 },
    proMobilePressed: { opacity: 0.82 },
    proMobileBrandMark: {
      alignItems: "center",
      backgroundColor: "#ffffff",
      borderColor: rgba(colors.inkRgb, 0.08),
      borderRadius: 12,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      overflow: "hidden",
      paddingHorizontal: 7,
      width: 96,
    },
    proMobileBrandMarkCompact: {
      borderRadius: 10,
      height: 38,
      paddingHorizontal: 5,
      width: 70,
    },
    proMobileBrandFallback: {
      color: "#102340",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: -0.2,
      textAlign: "center",
    },
    proMobileBrandFallbackAvp: {
      color: "#df2d3a",
      fontSize: 18,
      fontStyle: "italic",
      letterSpacing: -1,
    },
    proMobileHubHeader: {
      alignItems: "center",
      backgroundColor: colors.canvas,
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 82,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    proMobileHubEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    proMobileHubTitle: {
      color: colors.bone,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -1.5,
      lineHeight: 34,
      marginTop: 2,
    },
    proMobileHeaderButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 21,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    proMobileHeaderButtonText: {
      color: colors.bone,
      fontSize: 32,
      fontWeight: "500",
      lineHeight: 34,
      marginTop: -2,
    },
    proMobileHeaderCloseText: {
      color: colors.bone,
      fontSize: 27,
      fontWeight: "500",
      lineHeight: 29,
    },
    proMobileHubContent: {
      paddingBottom: 58,
      paddingHorizontal: 18,
    },
    proMobileIntro: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 22,
      flexDirection: "row",
      gap: 12,
      marginTop: 18,
      minHeight: 180,
      overflow: "hidden",
      padding: 18,
    },
    proMobileIntroCopy: {
      flex: 1,
      justifyContent: "center",
      minWidth: 0,
    },
    proMobileIntroKicker: {
      color: "#ff9d81",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    proMobileIntroTitle: {
      color: "#ffffff",
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -1.1,
      lineHeight: 27,
      marginTop: 10,
    },
    proMobileIntroBody: {
      color: "rgba(255,255,255,.72)",
      fontSize: 11,
      lineHeight: 16,
      marginTop: 9,
    },
    proMobileIntroBrands: {
      gap: 8,
      justifyContent: "center",
    },
    proMobileSearchBar: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      height: 48,
      marginTop: 14,
      paddingHorizontal: 12,
    },
    proMobileSearchIcon: {
      color: colors.aqua,
      fontSize: 22,
      fontWeight: "700",
      marginRight: 7,
    },
    proMobileSearchInput: {
      color: colors.bone,
      flex: 1,
      fontSize: 12,
      fontWeight: "600",
      height: 46,
      paddingVertical: 0,
    },
    proMobileSearchClear: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 12,
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    proMobileSearchClearText: {
      color: colors.muted,
      fontSize: 18,
      lineHeight: 20,
    },
    proMobileSectionTitleRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 11,
      marginTop: 28,
    },
    proMobileSectionTitleCopy: { flex: 1, minWidth: 0 },
    proMobileSectionEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    proMobileSectionTitle: {
      color: colors.bone,
      fontSize: 23,
      fontWeight: "900",
      letterSpacing: -0.9,
      lineHeight: 27,
      marginTop: 3,
    },
    proMobileSectionCount: {
      backgroundColor: colors.navyLift,
      borderRadius: 999,
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      marginLeft: 10,
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    proMobileCardStack: { gap: 9 },
    proMobileEventCard: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 104,
      padding: 12,
    },
    proMobileEventCardLive: {
      backgroundColor: colors.aquaDeep,
      borderColor: rgba(colors.flareRgb, 0.5),
    },
    proMobileEventCardBody: { flex: 1, minWidth: 0 },
    proMobileEventKickerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    proMobileEventStatus: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.55,
    },
    proMobileEventStatusLive: { color: "#ff9d81" },
    proMobileEventDivision: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "capitalize",
    },
    proMobileEventDivisionLive: { color: "rgba(255,255,255,.62)" },
    proMobileEventName: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: -0.45,
      lineHeight: 19,
      marginTop: 6,
    },
    proMobileEventNameLive: { color: "#ffffff" },
    proMobileEventMeta: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 6,
    },
    proMobileEventMetaLive: { color: "rgba(255,255,255,.68)" },
    proMobileEventArrow: {
      color: colors.aqua,
      fontSize: 25,
      fontWeight: "600",
      marginLeft: 1,
    },
    proMobileEventArrowLive: { color: "#ffffff" },
    proMobileDetailHeader: {
      alignItems: "center",
      backgroundColor: colors.canvas,
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 66,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    proMobileDetailHeaderCopy: { flex: 1, minWidth: 0 },
    proMobileDetailHeaderEyebrow: {
      color: colors.danger,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    proMobileDetailHeaderTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: -0.4,
      marginTop: 2,
    },
    proMobileSectionNav: {
      backgroundColor: colors.canvas,
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexGrow: 0,
      maxHeight: 55,
    },
    proMobileSectionNavContent: {
      alignItems: "center",
      gap: 7,
      minHeight: 54,
      paddingHorizontal: 12,
    },
    proMobileSectionTab: {
      alignItems: "center",
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 34,
      paddingHorizontal: 13,
    },
    proMobileSectionTabActive: { backgroundColor: colors.aquaDeep },
    proMobileSectionTabText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    proMobileSectionTabTextActive: { color: "#ffffff" },
    proMobileDetailContent: {
      paddingBottom: 60,
      paddingHorizontal: 18,
    },
    proMobileHero: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 22,
      marginTop: 16,
      overflow: "hidden",
      position: "relative",
    },
    proMobileHeroImage: {
      backgroundColor: colors.aquaDeep,
      bottom: 0,
      height: "100%",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      width: "100%",
    },
    proMobileHeroFallback: {
      backgroundColor: colors.aquaDeep,
      bottom: 0,
      left: 0,
      overflow: "hidden",
      position: "absolute",
      right: 0,
      top: 0,
    },
    proMobileCourtOutline: {
      borderColor: "rgba(255,255,255,.32)",
      borderWidth: 2,
      bottom: -35,
      left: 50,
      position: "absolute",
      right: 50,
      top: 95,
      transform: [{ perspective: 300 }, { rotateX: "52deg" }],
    },
    proMobileCourtNet: {
      backgroundColor: "rgba(255,255,255,.36)",
      height: 2,
      left: 24,
      position: "absolute",
      right: 24,
      top: "50%",
    },
    proMobileHeroScrim: {
      backgroundColor: "rgba(5,16,30,.34)",
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    proMobileHeroTop: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      left: 14,
      position: "absolute",
      right: 14,
      top: 14,
    },
    proMobileHeroBadges: { flexDirection: "row", gap: 6 },
    proMobileHeroBadge: {
      backgroundColor: "rgba(5,16,30,.72)",
      borderColor: "rgba(255,255,255,.18)",
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    proMobileHeroBadgeLive: { backgroundColor: "rgba(184,68,68,.9)" },
    proMobileHeroBadgeText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.45,
    },
    proMobileHeroCopy: {
      backgroundColor: "rgba(5,16,30,.76)",
      bottom: 0,
      left: 0,
      padding: 18,
      position: "absolute",
      right: 0,
    },
    proMobileHeroCategory: {
      color: "#a7d7ff",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    proMobileHeroTitle: {
      color: "#ffffff",
      fontSize: 29,
      fontWeight: "900",
      letterSpacing: -1.3,
      lineHeight: 31,
      marginTop: 7,
    },
    proMobileHeroMeta: {
      color: "rgba(255,255,255,.74)",
      fontSize: 10,
      lineHeight: 15,
      marginTop: 9,
    },
    proMobileNotice: {
      backgroundColor: rgba(colors.positiveRgb, 0.12),
      borderColor: rgba(colors.positiveRgb, 0.24),
      borderRadius: 13,
      borderWidth: 1,
      marginTop: 12,
      padding: 11,
    },
    proMobileFollowEvent: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.22),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginHorizontal: 18,
      marginTop: 14,
      padding: 14,
    },
    proMobileFollowEventActive: {
      backgroundColor: rgba(colors.positiveRgb, 0.1),
      borderColor: rgba(colors.positiveRgb, 0.28),
    },
    proMobileFollowEventIcon: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 15,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    proMobileFollowEventIconText: {
      color: colors.onAccent,
      fontSize: 17,
      fontWeight: "900",
    },
    proMobileFollowEventTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    proMobileFollowEventBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 3,
    },
    proMobileFollowEventArrow: {
      color: colors.aqua,
      fontSize: 22,
      fontWeight: "700",
    },
    proMobileNoticeText: {
      color: colors.positive,
      fontSize: 11,
      fontWeight: "700",
      lineHeight: 15,
    },
    proMobileStatGrid: {
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
    },
    proMobileStatCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 15,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 78,
      padding: 9,
    },
    proMobileStatValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    proMobileStatLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 3,
    },
    proMobileInfoCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    proMobileLocationCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      marginTop: 12,
      minHeight: 178,
      overflow: "hidden",
    },
    proMobileLocationMap: {
      backgroundColor: colors.navyLift,
      justifyContent: "flex-end",
      minHeight: 178,
      overflow: "hidden",
      width: 116,
    },
    proMobileLocationMapPressed: { opacity: 0.82 },
    proMobileLocationMapImage: {
      bottom: 0,
      height: "100%",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      width: "100%",
    },
    proMobileLocationMapLabel: {
      alignSelf: "flex-start",
      backgroundColor: rgba(colors.inkRgb, 0.82),
      borderRadius: 999,
      margin: 9,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    proMobileLocationMapLabelText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.3,
    },
    proMobileLocationDetails: {
      flex: 1,
      justifyContent: "center",
      minWidth: 0,
      padding: 14,
    },
    proMobileLocationAddress: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 17,
      marginTop: 6,
    },
    proMobileLocationActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 11,
    },
    proMobileLocationCopy: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.14),
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 34,
      paddingHorizontal: 10,
    },
    proMobileLocationCopyText: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
    },
    proMobileLocationOpen: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 34,
      paddingHorizontal: 10,
    },
    proMobileLocationOpenText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: "900",
    },
    proMobileInfoEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    proMobileSummary: {
      color: colors.bone,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
    },
    proMobileInfoTitle: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginTop: 7,
    },
    proMobileInfoBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 5,
    },
    proMobileInfoFootnote: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 9,
    },
    proMobileActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    proMobilePrimaryAction: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 15,
    },
    proMobilePrimaryActionText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
    proMobileSecondaryAction: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 15,
    },
    proMobileSecondaryActionText: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "800",
    },
    proMobileSiblingCard: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 17,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 12,
      padding: 15,
    },
    proMobileSiblingTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 4,
    },
    proMobileSiblingArrow: { color: colors.aqua, fontSize: 26 },
    mobilePredictionChart: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      overflow: "hidden",
      paddingHorizontal: 12,
      paddingTop: 15,
    },
    mobilePredictionChartLegend: { gap: 8, marginBottom: 4 },
    mobilePredictionChartLegendItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    mobilePredictionChartDotYes: {
      backgroundColor: colors.aqua,
      borderRadius: 999,
      height: 7,
      width: 7,
    },
    mobilePredictionChartDotNo: {
      backgroundColor: colors.sand,
      borderRadius: 999,
      height: 7,
      width: 7,
    },
    mobilePredictionChartLegendText: {
      color: colors.muted,
      flex: 1,
      fontSize: 11,
      fontWeight: "700",
    },
    mobilePredictionChartLegendValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 18,
      fontWeight: "900",
    },
    mobilePredictionChartFooter: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 42,
    },
    mobilePredictionChartTime: { color: colors.muted, fontSize: 10 },
    mobilePredictionChartVolume: {
      color: colors.aquaDeep,
      fontSize: 10,
      fontWeight: "800",
    },
    mobilePredictionSheetHeader: {
      alignItems: "flex-start",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 17,
    },
    mobilePredictionSheetEyebrow: {
      color: colors.aquaDeep,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    mobilePredictionSheetTitle: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.5,
      lineHeight: 24,
      marginTop: 5,
    },
    mobilePredictionSheetContent: {
      gap: 12,
      padding: 14,
      paddingBottom: 44,
    },
    mobilePredictionTradeCard: {
      backgroundColor: colors.navyLift,
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 22,
      borderWidth: 1,
      padding: 16,
    },
    mobilePredictionTradeBalanceRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    mobilePredictionTradeEyebrow: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    mobilePredictionTradeBalance: {
      color: colors.bone,
      fontSize: 17,
      fontWeight: "900",
      marginTop: 3,
    },
    mobilePredictionStatusPill: {
      backgroundColor: rgba(colors.positiveRgb, 0.13),
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    mobilePredictionStatusPillClosed: {
      backgroundColor: rgba(colors.overlayRgb, 0.08),
    },
    mobilePredictionStatusPillText: {
      color: colors.positive,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    mobilePredictionTradeLabel: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
      marginTop: 18,
    },
    mobilePredictionSideGrid: {
      flexDirection: "row",
      gap: 8,
      marginTop: 9,
    },
    mobilePredictionSideButton: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 15,
      borderWidth: 1,
      flex: 1,
      minHeight: 88,
      padding: 12,
    },
    mobilePredictionSideButtonSelected: {
      backgroundColor: rgba(colors.accentRgb, 0.12),
      borderColor: colors.aqua,
    },
    mobilePredictionSideButtonSelectedNo: {
      backgroundColor: rgba(colors.warningRgb, 0.11),
      borderColor: colors.sand,
    },
    mobilePredictionSideLabel: {
      color: colors.muted,
      flex: 1,
      fontSize: 10,
      fontWeight: "700",
      lineHeight: 14,
    },
    mobilePredictionSideLabelSelected: { color: colors.bone },
    mobilePredictionSidePrice: {
      color: colors.muted,
      fontSize: 23,
      fontWeight: "900",
      letterSpacing: -0.8,
    },
    mobilePredictionSidePriceSelected: { color: colors.bone },
    mobilePredictionAmountHeader: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    mobilePredictionAmountHint: { color: colors.muted, fontSize: 10 },
    mobilePredictionAmountInput: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 15,
      borderWidth: 1,
      color: colors.bone,
      fontSize: 30,
      fontWeight: "900",
      marginTop: 8,
      minHeight: 62,
      paddingHorizontal: 14,
    },
    mobilePredictionQuickRow: {
      flexDirection: "row",
      gap: 7,
      marginTop: 8,
    },
    mobilePredictionQuickButton: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.13),
      borderRadius: 999,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 36,
    },
    mobilePredictionQuickButtonText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
    },
    mobilePredictionReviewCard: {
      backgroundColor: rgba(colors.warningRgb, 0.09),
      borderColor: rgba(colors.warningRgb, 0.3),
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 14,
      padding: 13,
    },
    mobilePredictionReviewEyebrow: {
      color: colors.warning,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    mobilePredictionReviewTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
      lineHeight: 18,
      marginTop: 5,
    },
    mobilePredictionReviewBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },
    mobilePredictionMessage: {
      color: colors.aqua,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 12,
    },
    mobilePredictionTradeButton: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 999,
      justifyContent: "center",
      marginTop: 15,
      minHeight: 52,
      paddingHorizontal: 16,
    },
    mobilePredictionTradeButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    mobilePredictionTradeFootnote: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 13,
      marginTop: 11,
      textAlign: "center",
    },
    mobileTournamentMarkets: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 16,
      overflow: "hidden",
      padding: 14,
    },
    mobileTournamentMarketsHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    mobileTournamentMarketsTitle: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.4,
      marginTop: 3,
    },
    mobileTournamentMarketsBadge: {
      backgroundColor: rgba(colors.accentRgb, 0.11),
      borderRadius: 999,
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    mobileTournamentMarketRow: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 58,
    },
    mobileTournamentMarketCopy: { flex: 1 },
    mobileTournamentMarketName: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "800",
    },
    mobileTournamentMarketTrack: {
      backgroundColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 999,
      height: 3,
      marginTop: 7,
      overflow: "hidden",
    },
    mobileTournamentMarketFill: {
      backgroundColor: colors.aqua,
      borderRadius: 999,
      height: 3,
    },
    mobileTournamentMarketPriceBlock: {
      alignItems: "flex-end",
      minWidth: 48,
    },
    mobileTournamentMarketPrice: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
    },
    mobileTournamentMarketChange: {
      color: colors.positive,
      fontSize: 10,
      fontWeight: "800",
    },
    mobileTournamentMarketChangeDown: { color: colors.danger },
    mobileTournamentMarketArrow: { color: colors.muted, fontSize: 22 },
    mobileTournamentMarketsFootnote: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 13,
      marginTop: 10,
    },
    proMobileMatchCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
      padding: 13,
    },
    proMobileMatchCardLive: {
      borderColor: rgba(colors.dangerRgb, 0.45),
      borderLeftColor: colors.danger,
      borderLeftWidth: 3,
    },
    proMobileMatchHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      marginBottom: 8,
    },
    proMobileMatchStatus: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    proMobileMatchStatusLive: { color: colors.danger },
    proMobileMatchMeta: {
      color: colors.muted,
      flex: 1,
      fontSize: 10,
      textAlign: "right",
    },
    proMobileMatchTeamRow: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.06),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 34,
    },
    proMobileMatchTeam: {
      color: colors.muted,
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
    },
    proMobileMatchWinner: { color: colors.bone, fontWeight: "900" },
    proMobileMatchScore: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    proMobileMatchFooter: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      marginTop: 9,
    },
    proMobileMatchPrediction: {
      flex: 1,
      gap: 4,
    },
    proMobileMatchPredictionLabels: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    proMobileMatchPredictionValue: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "900",
    },
    proMobileMatchPredictionCaption: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    proMobileMatchPredictionTrack: {
      backgroundColor: rgba(colors.warningRgb, 0.24),
      borderRadius: 999,
      height: 4,
      overflow: "hidden",
    },
    proMobileMatchPredictionFill: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 999,
      height: 4,
    },
    proMobileMatchOpenArrow: { color: colors.aqua, fontSize: 22 },
    proMobileFollowButton: {
      borderColor: colors.aqua,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    proMobileFollowButtonActive: { backgroundColor: colors.aqua },
    proMobileFollowButtonText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
    },
    proMobileFollowButtonTextActive: { color: colors.onAccent },
    proMobileEmptyCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      marginTop: 8,
      padding: 24,
    },
    proMobileEmptyIcon: {
      color: colors.aqua,
      fontSize: 25,
      fontWeight: "900",
    },
    proMobileEmptyTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 7,
      textAlign: "center",
    },
    proMobileEmptyBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 6,
      textAlign: "center",
    },
    proMobileListNote: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 6,
      textAlign: "center",
    },
    proMobileDrawStack: { gap: 18 },
    proMobileDrawRound: { gap: 8 },
    proMobileDrawRoundTitle: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    proMobilePoolCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
      padding: 13,
    },
    proMobilePoolHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 8,
    },
    proMobilePoolTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    proMobilePoolProgress: { color: colors.muted, fontSize: 10 },
    proMobileStandingRow: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 42,
    },
    proMobileStandingRank: {
      color: colors.aqua,
      fontSize: 11,
      fontWeight: "900",
      textAlign: "center",
      width: 22,
    },
    proMobileStandingTeam: {
      color: colors.bone,
      flex: 1,
      fontSize: 11,
      fontWeight: "700",
    },
    proMobileStandingRecord: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    proMobileStandingsCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
      paddingHorizontal: 13,
    },
    proMobileTeamGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },
    proMobileTeamCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 15,
      borderWidth: 1,
      minHeight: 112,
      padding: 12,
      width: "48.5%",
    },
    proMobileTeamCardTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    proMobileTeamSeed: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    proMobileTeamCountry: { fontSize: 16 },
    proMobileTeamName: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
      lineHeight: 16,
      marginTop: 9,
    },
    proMobileTeamPlayers: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 6,
    },
    proMobileWatchCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 76,
      padding: 13,
    },
    proMobileWatchIcon: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 14,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    proMobileWatchIconText: {
      color: colors.aqua,
      fontSize: 18,
      fontWeight: "900",
    },
    proMobileWatchCopy: { flex: 1, minWidth: 0 },
    proMobileWatchTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    proMobileWatchMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
    proMobileWatchArrow: { color: colors.aqua, fontSize: 19 },
    proMobileLoadingState: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 34,
      paddingVertical: 48,
    },
    proMobileLoadingMark: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 28,
      height: 56,
      justifyContent: "center",
      width: 56,
    },
    proMobileLoadingMarkText: {
      color: "#ffffff",
      fontSize: 24,
      fontWeight: "900",
    },
    proMobileLoadingTitle: {
      color: colors.bone,
      fontSize: 19,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginTop: 15,
      textAlign: "center",
    },
    proMobileLoadingBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 7,
      textAlign: "center",
    },
    proMobileRetryButton: {
      backgroundColor: colors.aqua,
      borderRadius: 999,
      marginTop: 16,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    proMobileRetryButtonText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
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
    rowMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
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
    aiBody: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 5 },
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
    searchAllText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      paddingHorizontal: 4,
      paddingVertical: 10,
    },
    searchSuggestions: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 8,
      overflow: "hidden",
    },
    searchSuggestionRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 56,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    searchSuggestionDot: {
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    searchSuggestionTitle: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "900",
    },
    searchSuggestionMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 3,
      textTransform: "capitalize",
    },
    searchSuggestionAll: {
      alignItems: "center",
      paddingHorizontal: 13,
      paddingVertical: 13,
    },
    searchSuggestionAllText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
    },
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
    filterText: { color: colors.muted, fontSize: 10, fontWeight: "600" },
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
    mapPinText: { color: colors.onAccent, fontSize: 10, fontWeight: "900" },
    mapLabel: {
      backgroundColor: rgba(colors.inkRgb, 0.82),
      borderRadius: 10,
      bottom: 12,
      left: 12,
      padding: 10,
      position: "absolute",
    },
    mapLabelTitle: { color: colors.bone, fontSize: 11, fontWeight: "800" },
    mapLabelText: { color: colors.muted, fontSize: 10, marginTop: 2 },
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
    weekDayLabel: { color: colors.muted, fontSize: 10 },
    weekDayNumber: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
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
    bookingTimeSuffix: { color: colors.muted, fontSize: 10 },
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
    pickupDay: { color: colors.aqua, fontSize: 10, fontWeight: "800" },
    pickupNumber: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 15,
      fontWeight: "900",
    },
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
      fontSize: 10,
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
      fontSize: 10,
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
    walletMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
    walletActions: { flexDirection: "row", gap: 8, marginTop: 25 },
    walletActionText: {
      backgroundColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      color: colors.bone,
      fontSize: 10,
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
    predictionWalletCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 12,
      overflow: "hidden",
      padding: 18,
    },
    predictionWalletHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    predictionWalletBalance: {
      color: colors.bone,
      fontSize: 46,
      fontWeight: "900",
      letterSpacing: -2.5,
      marginTop: 5,
    },
    predictionWalletCoin: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 18,
      height: 52,
      justifyContent: "center",
      width: 52,
    },
    predictionWalletCoinText: {
      color: colors.aqua,
      fontSize: 26,
      fontWeight: "900",
    },
    predictionWalletBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 8,
    },
    predictionWalletFacts: {
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      marginTop: 16,
      paddingTop: 14,
    },
    predictionWalletFactValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 16,
      fontWeight: "900",
    },
    predictionWalletFactLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.7,
      marginTop: 2,
    },
    predictionWalletRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 12,
    },
    predictionWalletStatus: {
      backgroundColor: rgba(colors.warningRgb, 0.12),
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    predictionWalletStatusWon: {
      backgroundColor: rgba(colors.positiveRgb, 0.14),
    },
    predictionWalletStatusText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
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
    moneyAmount: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "800",
    },
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
    athleteHero: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 28,
      borderWidth: 1,
      minHeight: 470,
      marginTop: 4,
      overflow: "hidden",
      position: "relative",
    },
    athleteHeroCompact: { backgroundColor: colors.aquaDeep, minHeight: 330 },
    athleteHeroImage: { opacity: 0.74 },
    athleteHeroWash: {
      backgroundColor: rgba(colors.navyRgb, 0.48),
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    athleteHeroWashCompact: {
      backgroundColor: rgba(colors.inkRgb, 0.18),
    },
    athleteHeroGeometry: {
      borderColor: rgba(colors.accentRgb, 0.24),
      borderRadius: 220,
      borderWidth: 1,
      height: 400,
      position: "absolute",
      right: -178,
      top: -82,
      width: 400,
    },
    athleteHeroContent: {
      bottom: 28,
      left: 20,
      maxWidth: "72%",
      position: "absolute",
      zIndex: 4,
    },
    athleteHeroContentCompact: { maxWidth: "86%" },
    athleteHeroPills: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginBottom: 10,
    },
    athleteHeroName: {
      color: colors.white,
      fontSize: 43,
      fontWeight: "900",
      letterSpacing: -2.6,
      lineHeight: 43,
      textShadowColor: rgba(colors.inkRgb, 0.45),
      textShadowOffset: { height: 2, width: 0 },
      textShadowRadius: 12,
    },
    athleteHeroMeta: {
      color: rgba(colors.whiteRgb, 0.78),
      fontSize: 12,
      fontWeight: "700",
      marginTop: 8,
      textTransform: "capitalize",
    },
    athleteHeroActions: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 18,
    },
    athleteHeroPrimaryAction: {
      backgroundColor: colors.aqua,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 11,
    },
    athleteHeroPrimaryActionText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
    athleteHeroSecondaryAction: {
      backgroundColor: rgba(colors.whiteRgb, 0.08),
      borderColor: rgba(colors.whiteRgb, 0.2),
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    athleteHeroSecondaryActionText: {
      color: colors.white,
      fontSize: 11,
      fontWeight: "800",
    },
    athleteHeroCutout: {
      height: "90%",
      position: "absolute",
      right: -46,
      top: 14,
      width: "78%",
      zIndex: 2,
    },
    athleteHeroRating: {
      alignItems: "center",
      backgroundColor: rgba(colors.navyRgb, 0.68),
      borderColor: rgba(colors.accentRgb, 0.38),
      borderRadius: 52,
      borderWidth: 2,
      height: 94,
      justifyContent: "center",
      position: "absolute",
      right: 18,
      top: 18,
      width: 94,
      zIndex: 5,
    },
    athleteHeroRatingLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    athleteHeroRatingValue: {
      color: colors.white,
      fontFamily: "Archivo-Hero",
      fontSize: 40,
      fontWeight: "900",
      letterSpacing: -1.4,
      lineHeight: 30,
    },
    athleteHeroRatingMeta: {
      color: rgba(colors.whiteRgb, 0.65),
      fontSize: 10,
      fontWeight: "700",
    },
    athleteMetricRow: {
      flexDirection: "row",
      gap: 9,
      paddingRight: 38,
    },
    athleteMetricCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      minHeight: 132,
      padding: 14,
      width: 148,
    },
    athleteMetricCardAccent: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.2),
    },
    athleteMetricLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    athleteMetricValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -1.4,
      marginTop: 14,
    },
    athleteMetricChange: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "600",
      marginTop: 5,
    },
    positiveText: { color: colors.positive },
    negativeText: { color: colors.danger },
    athleteNarrativeCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.13),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 12,
      padding: 17,
    },
    athleteNarrativeHeading: {
      alignItems: "center",
      flexDirection: "row",
      gap: 11,
    },
    athleteNarrativeMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 15,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    athleteNarrativeMarkText: {
      color: colors.aqua,
      fontSize: 19,
      fontWeight: "900",
    },
    athleteNarrativeTitle: {
      color: colors.bone,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    athleteNarrativeBody: {
      color: colors.bone,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 15,
    },
    athleteNarrativeSource: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "600",
      marginTop: 11,
    },
    athleteChartCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    athleteChartTitle: {
      color: colors.bone,
      fontSize: 27,
      fontWeight: "900",
      letterSpacing: -1.1,
    },
    athleteChartSummary: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 16,
      paddingBottom: 14,
    },
    athleteChartSummaryValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    athleteChartSummaryLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "600",
      marginTop: 2,
    },
    athleteChartArrow: { color: colors.aqua, fontSize: 19, fontWeight: "800" },
    athleteChartRange: {
      borderLeftColor: rgba(colors.overlayRgb, 0.1),
      borderLeftWidth: 1,
      marginLeft: "auto",
      paddingLeft: 14,
    },
    athleteWaveChart: {
      alignItems: "flex-end",
      backgroundColor: rgba(colors.overlayRgb, 0.02),
      borderRadius: 15,
      flexDirection: "row",
      gap: 5,
      height: 165,
      marginTop: 14,
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingTop: 12,
    },
    athleteWaveColumn: {
      alignItems: "center",
      flex: 1,
      height: "100%",
      justifyContent: "flex-end",
      minWidth: 5,
    },
    athleteWaveBar: { borderRadius: 999, minHeight: 12, width: "72%" },
    athleteChartEmpty: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderRadius: 15,
      gap: 8,
      height: 155,
      justifyContent: "center",
      marginTop: 14,
      padding: 18,
    },
    athleteChartEmptyMark: {
      color: colors.aqua,
      fontSize: 28,
      fontWeight: "900",
    },
    athleteChartEmptyText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    athleteChartLegend: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      marginTop: 10,
    },
    athleteChartLegendLoss: { color: colors.danger },
    athleteMomentGrid: { flexDirection: "row", gap: 9 },
    athleteMomentCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 19,
      borderWidth: 1,
      flex: 1,
      minHeight: 190,
      padding: 14,
    },
    athleteMomentCardMuted: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
    },
    athleteMomentEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    athleteMomentValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 34,
      fontWeight: "900",
      letterSpacing: -1.4,
      marginTop: 15,
    },
    athleteMomentTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "800",
      lineHeight: 18,
      marginTop: 8,
    },
    athleteMomentMeta: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: "auto",
    },
    athleteUpcomingList: { gap: 8 },
    athleteUpcomingCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      padding: 12,
    },
    athleteUpcomingDate: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 14,
      height: 58,
      justifyContent: "center",
      width: 58,
    },
    athleteUpcomingMonth: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
    },
    athleteUpcomingDay: {
      color: colors.white,
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 24,
    },
    athleteUpcomingName: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "800",
    },
    athleteUpcomingMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
    athleteUpcomingWatch: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 5,
    },
    athleteResultsList: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 19,
      borderWidth: 1,
      overflow: "hidden",
    },
    athleteResultCard: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 78,
      padding: 11,
    },
    athleteResultMark: {
      alignItems: "center",
      borderRadius: 13,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    athleteResultMarkWin: { backgroundColor: rgba(colors.positiveRgb, 0.14) },
    athleteResultMarkLoss: { backgroundColor: rgba(colors.dangerRgb, 0.12) },
    athleteResultMarkText: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    athleteResultOpponent: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
    },
    athleteResultMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
    athleteResultDelta: { alignItems: "flex-end" },
    athleteResultDeltaValue: {
      fontFamily: "Archivo-Chip",
      fontSize: 13,
      fontWeight: "900",
    },
    athleteResultExpected: { color: colors.muted, fontSize: 10, marginTop: 3 },
    athleteFullHistoryButton: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.11),
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 9,
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    athleteFullHistoryButtonText: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "800",
    },
    athleteBioCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.14),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 14,
      padding: 17,
    },
    athleteBioTitle: {
      color: colors.bone,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.9,
      marginTop: 4,
    },
    athleteBioBody: {
      color: rgba(colors.boneRgb, 0.84),
      fontSize: 13,
      lineHeight: 20,
      marginTop: 12,
    },
    athleteBioFacts: {
      borderTopColor: rgba(colors.overlayRgb, 0.09),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 24,
      marginTop: 16,
      paddingTop: 14,
    },
    athleteBioFactLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
    },
    athleteBioFactValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 12,
      fontWeight: "800",
      marginTop: 4,
    },
    athleteStudioActions: { flexDirection: "row", gap: 8, marginTop: 14 },
    athleteStudioSecondary: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.11),
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    athleteStudioSecondaryText: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "800",
    },
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
    profileHandle: { color: colors.muted, fontSize: 10, marginTop: 2 },
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
      fontSize: 10,
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
      backgroundColor: rgba(colors.depthRgb, 0.96),
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 28,
      borderWidth: 1,
      flexDirection: "row",
      left: 18,
      paddingBottom: 7,
      paddingHorizontal: 6,
      paddingTop: 7,
      position: "absolute",
      right: 18,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
      elevation: 12,
    },
    tabItem: {
      alignItems: "center",
      borderRadius: 18,
      flex: 1,
      gap: 3,
      minHeight: 47,
      justifyContent: "center",
      paddingVertical: 5,
      position: "relative",
    },
    tabItemActive: { backgroundColor: rgba(colors.accentRgb, 0.1) },
    tabIcon: { color: colors.muted, fontSize: 18 },
    tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
    tabActive: { color: colors.aqua },
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
    checkoutMeta: { color: colors.muted, fontSize: 10, marginTop: 5 },
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
    mobileDivisionRail: { marginHorizontal: -13, marginTop: 10 },
    mobileDivisionOption: {
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 15,
      borderWidth: 1,
      marginLeft: 10,
      minHeight: 132,
      padding: 12,
      width: 188,
    },
    mobileDivisionOptionActive: {
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderColor: colors.aqua,
    },
    mobileDivisionOptionName: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.6,
    },
    mobileDivisionOptionNameActive: { color: colors.aqua },
    mobileDivisionOptionMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 5,
    },
    mobileDivisionPrices: { gap: 3, marginTop: "auto" },
    mobileDivisionPrice: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
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
    mobileTicketRail: { marginHorizontal: -13, marginTop: 10 },
    mobileTicketCard: {
      backgroundColor: colors.aquaDeep,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 20,
      borderWidth: 1,
      marginLeft: 10,
      minHeight: 285,
      padding: 15,
      width: 260,
    },
    mobileTicketCardActive: { borderColor: colors.aqua, borderWidth: 2 },
    mobileTicketPrice: {
      alignSelf: "flex-start",
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 999,
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    mobileTicketCardBody: { marginTop: "auto" },
    mobileTicketName: {
      color: "#ffffff",
      fontSize: 27,
      fontWeight: "900",
      letterSpacing: -1,
    },
    mobileTicketDescription: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 7,
    },
    mobileTicketQuantity: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: 13,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 13,
      padding: 5,
    },
    mobileQuantityButton: {
      alignItems: "center",
      borderColor: "rgba(255,255,255,0.26)",
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    mobileQuantityButtonText: { color: "#ffffff", fontSize: 19 },
    mobileQuantityValue: {
      color: "#ffffff",
      fontFamily: "Archivo-Table",
      fontSize: 15,
      fontWeight: "900",
    },
    mobileParticipantRail: { marginHorizontal: -13, marginTop: 10 },
    mobileParticipantCard: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 16,
      borderWidth: 1,
      marginLeft: 10,
      minHeight: 178,
      padding: 12,
      width: 146,
    },
    mobileParticipantCardActive: {
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: colors.aqua,
    },
    mobileParticipantCardDisabled: { opacity: 0.38 },
    mobileParticipantAvatar: { borderRadius: 31, height: 62, width: 62 },
    mobileParticipantAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 31,
      height: 62,
      justifyContent: "center",
      width: 62,
    },
    mobileParticipantName: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 9,
      textAlign: "center",
    },
    mobileParticipantMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
    mobileParticipantEligibility: {
      fontSize: 10,
      fontWeight: "800",
      marginTop: 7,
    },
    mobileParticipantEligible: { color: colors.positive },
    mobileParticipantIneligible: { color: colors.warning },
    mobileTeamHeading: {
      color: colors.bone,
      fontSize: 19,
      fontWeight: "900",
      marginTop: 8,
    },
    mobileRosterRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 14,
    },
    mobileRosterPlayer: { alignItems: "center", flex: 1, minWidth: 0 },
    mobileRosterName: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 5,
      maxWidth: 72,
    },
    mobileRosterStatus: { color: colors.muted, fontSize: 10, marginTop: 2 },
    mobileRosterRemove: { color: colors.danger, fontSize: 10, marginTop: 2 },
    mobileRosterOpen: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.03),
      borderColor: rgba(colors.overlayRgb, 0.14),
      borderRadius: 25,
      borderStyle: "dashed",
      borderWidth: 1,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    mobileRosterOpenText: { color: colors.muted, fontSize: 20 },
    mobilePlayerSearch: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 15,
      paddingHorizontal: 11,
    },
    mobilePlayerSearchIcon: { color: colors.aqua, fontSize: 20 },
    mobilePlayerSearchInput: {
      color: colors.bone,
      flex: 1,
      fontSize: 12,
      minHeight: 48,
    },
    mobileSuggestionRail: { marginHorizontal: -13, marginTop: 10 },
    mobileSuggestionCard: {
      alignItems: "center",
      backgroundColor: colors.canvas,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      marginLeft: 10,
      minHeight: 220,
      padding: 11,
      width: 166,
    },
    mobileSuggestionCardDisabled: { opacity: 0.4 },
    mobileSuggestionAvatar: { borderRadius: 30, height: 60, width: 60 },
    mobileSuggestionAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 30,
      height: 60,
      justifyContent: "center",
      width: 60,
    },
    mobileSuggestionName: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 8,
      maxWidth: 140,
    },
    mobileSuggestionMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
    mobileSuggestionAdd: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 999,
      justifyContent: "center",
      marginTop: "auto",
      minHeight: 38,
      width: "100%",
    },
    mobileSuggestionAddText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: "900",
    },
    mobileInviteRow: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 10,
      paddingTop: 10,
    },
    mobileInviteInput: {
      backgroundColor: rgba(colors.overlayRgb, 0.03),
      borderRadius: 12,
      color: colors.bone,
      flex: 1,
      fontSize: 11,
      minHeight: 44,
      paddingHorizontal: 10,
    },
    mobileInviteButton: {
      backgroundColor: colors.aqua,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 13,
    },
    mobileInviteButtonText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: "900",
    },
    mobileTeamPaymentChoices: { flexDirection: "row", gap: 8, marginTop: 14 },
    mobileTeamPaymentChoice: {
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      padding: 10,
    },
    mobileTeamPaymentChoiceActive: {
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: colors.aqua,
    },
    mobileGuestCard: {
      backgroundColor: rgba(colors.accentRgb, 0.06),
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginTop: 10,
      overflow: "hidden",
      padding: 9,
    },
    mobileGuestImage: { borderRadius: 12, height: 118, width: 96 },
    mobileGuestImageFallback: {
      alignItems: "center",
      backgroundColor: colors.sand,
      borderRadius: 12,
      height: 118,
      justifyContent: "center",
      width: 96,
    },
    mobileGuestInitials: { color: colors.ink, fontSize: 25, fontWeight: "900" },
    mobileGuestLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    mobileGuestName: {
      color: colors.bone,
      fontSize: 17,
      fontWeight: "900",
      marginTop: 4,
    },
    mobileGuestMeta: {
      color: colors.muted,
      fontSize: 10,
      marginBottom: 5,
      marginTop: 3,
    },
    mobileGuestLink: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 5,
    },
    mobilePolicyList: { gap: 9, marginTop: 11 },
    mobilePolicyCard: {
      backgroundColor: colors.canvas,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 14,
      borderWidth: 1,
      overflow: "hidden",
      padding: 10,
    },
    mobilePolicyHeader: {
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    mobilePolicyKind: {
      color: colors.warning,
      fontSize: 10,
      fontWeight: "900",
    },
    mobilePolicyDocument: { marginTop: 9, maxHeight: 145 },
    mobilePolicyDocumentText: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 16,
    },
    mobilePolicyAccept: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 11,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 10,
      minHeight: 42,
    },
    mobilePolicyAcceptActive: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    mobilePolicyAcceptText: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
    },
    mobilePolicyAcceptTextActive: { color: colors.onAccent },
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
    totalAmount: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 15,
      fontWeight: "900",
    },
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
      fontSize: 10,
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
