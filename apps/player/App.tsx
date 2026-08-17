import {
  defaultEventMedia,
  evaluateDivisionCriteria,
  formatMoney,
  formatVenueTime,
  type EventDivisionSummary,
  type MatchSummary,
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
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
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
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import QRCode from "react-native-qrcode-svg";
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
import { PlayerLaunchExperience } from "./launch-experience";
import {
  clearPendingWatchScoreDraft,
  getPendingWatchScoreDraft,
  subscribeToWatchScoreDraft,
  type WatchScoreDraft,
} from "./watch-scoring";
import { VideoStudioScreen, type VideoTransferStatus } from "./video-studio";
import { HealthScreen } from "./health-screen";
import { HealthHistorySyncAgent } from "./health-history-sync-agent";
import { LiveActivitiesPrompt } from "./live-activities-prompt";
import { PlayerCalendarSettings } from "./calendar-settings";
import {
  TournamentPasses,
  TournamentWalletConfirmation,
} from "./tournament-passes";
import {
  BookingManagementModal,
  type ManagedBooking,
} from "./booking-management";
import {
  BookingConfirmationView,
  type ShareableBookingDetails,
} from "./booking-share";
import { PlayerCalendarModal } from "./player-calendar";
import { PlayerCalendarAutoSync } from "./player-calendar-sync";
import { ProfileHubScreen } from "./profile-hub";
import { PlayerArtworkModal, ProfileEditorModal } from "./profile-studio";
import { ScoreUploadScreen } from "./score-upload";
import { OrganizationExperienceModal } from "./organization-experience";
import { PlayerMessagingScreen } from "./messaging-screen";
import { listenForMessagingNotificationResponses } from "./messaging-notifications";
import {
  LivePlayerRail,
  PlayerPickerModal,
  PlayerProfileProvider,
  usePlayerProfileNavigation,
} from "./player-social";
import { DiscoveryMapModal, DiscoveryMapPreview } from "./discovery-map";
import {
  admissionPassReady,
  checkoutRosterComplete,
  initialPurchaseKind,
  presentThenPollCheckout,
} from "./event-checkout-state";
import { DiscoverySearchFlow } from "./discovery-search-flow";
import {
  discoveryResultSummary,
  discoveryWhatLabel,
  discoveryWhenLabel,
  type DiscoveryCoordinates,
  type DiscoverySearchResult,
} from "./discovery-search";
import {
  proEventFeaturedMedia,
  proEventMediaUrl,
  proEventSections,
  searchProEvents,
  sortProEvents,
  type ProTourSection,
} from "./pro-tour";
import {
  policyAcceptanceLabel,
  policyScrollReachedEnd,
  type PolicyScrollMetrics,
} from "./policy-review";
import { ResultPlayIcon } from "./result-play-icon";
import { NativeMarkdownContent } from "./markdown-content";
import {
  MobilePlacePicker,
  type MobilePlaceSelection,
} from "./components/mobile-place-picker";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
  useFellixFonts,
} from "./fellix-text";

// Metro requires static module references so the full Duna mark ships natively.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaPlayerWordmarkBlue = require("./assets/duna-horizontal-blue.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaPlayerWordmarkWhite = require("./assets/duna-horizontal-white.png");

type MobileCoach = NonNullable<PlayerRuntime["coaches"]>[number];
type PlayerCoachingNote = NonNullable<PlayerRuntime["coachingNotes"]>[number];
type MobilePredictionDiscoveryItem = NonNullable<
  PlayerRuntime["predictionDiscovery"]
>["items"][number];
type MobilePredictionPosition = NonNullable<
  PlayerRuntime["predictionWallet"]
>["positions"][number];
type TeammateSearchResult = Awaited<
  ReturnType<DunaApiClient["player"]["teammateSearch"]["query"]>
>[number];
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
  const result = evaluateDivisionCriteria({
    asOf: new Date(eligibilityDate),
    criteria: {
      ageMaximum: division?.ageMaximum,
      ageMinimum: division?.ageMinimum,
      gender: division?.gender,
      ratingMaximum: division?.ratingMaximum,
      ratingMinimum: division?.ratingMinimum,
    },
    participant: {
      birthDate: participant.birthDate,
      genderCategory: participant.genderCategory,
      rating: participant.person.rating.display,
    },
  });
  return {
    eligible: result.eligible,
    reason: result.eligible ? "Eligible" : result.reasons.join(" · "),
  };
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
type MobilePerformanceParticipantProfile =
  MobilePlayerPerformance["participantProfiles"][number];

const demoPerformanceSnapshots = [
  {
    beforeDisplay: 4.54,
    afterDisplay: 4.62,
    expectedWinProbability: 0.43,
    actualResult: 1,
    pointShare: 0.519,
    verificationWeightBps: 10_000,
  },
  {
    beforeDisplay: 4.58,
    afterDisplay: 4.54,
    expectedWinProbability: 0.61,
    actualResult: 0,
    pointShare: 0.455,
    verificationWeightBps: 9_600,
  },
  {
    beforeDisplay: 4.53,
    afterDisplay: 4.58,
    expectedWinProbability: 0.55,
    actualResult: 1,
    pointShare: 0.592,
    verificationWeightBps: 9_200,
  },
] as const;

const demoPerformanceHistory = demoMatches.map((match, index) => {
  const snapshot =
    demoPerformanceSnapshots[index] ??
    demoPerformanceSnapshots[demoPerformanceSnapshots.length - 1]!;
  return {
    id: `demo-rating-${match.id}`,
    matchId: match.id,
    beforeDisplay: snapshot.beforeDisplay,
    afterDisplay: snapshot.afterDisplay,
    delta: match.ratingDelta,
    expectedWinProbability: snapshot.expectedWinProbability,
    actualResult: snapshot.actualResult,
    pointShare: snapshot.pointShare,
    verificationWeightBps: snapshot.verificationWeightBps,
    occurredAt: match.playedAt,
    matchTitle: `${match.venueName} match`,
    sourceUrl: undefined,
    sets: match.score.map(([a, b]) => ({ a, b })),
    participants: [
      ...match.teamA.map((person) => ({
        externalPersonId: `demo:${person.id}`,
        personId: person.id,
        name: person.displayName,
        side: "A" as const,
      })),
      ...match.teamB.map((person) => ({
        externalPersonId: `demo:${person.id}`,
        personId: person.id,
        name: person.displayName,
        side: "B" as const,
      })),
    ],
    resultStory: {
      summary:
        snapshot.actualResult >= 0.5
          ? "Held the line when it tightened and carried the result home."
          : "Made the margins meaningful—clear evidence, reset, next serve ahead.",
      source: "computed" as const,
    },
  };
}) satisfies readonly MobilePerformanceMatch[];

const demoSandRatingByPersonId = new Map(
  demoPeople.map((person) => [person.id, person.rating.display] as const),
);

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
  resultWin: "#efe5ce",
  resultWinBorder: "#d7bd84",
  resultLoss: "#b5ccd3",
  resultLossBorder: "#87aab5",
  signal: "#c8f04a",
  signalInk: "#17200d",
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
  resultWin: "#4a402b",
  resultWinBorder: "#8d7748",
  resultLoss: "#294651",
  resultLossBorder: "#527782",
  signal: "#b9dc52",
  signalInk: "#17200d",
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

type ResultRosterDensity = "regular" | "compact" | "dense";

function resultRosterDensity(playerCount: number): ResultRosterDensity {
  if (playerCount <= 2) return "regular";
  if (playerCount <= 4) return "compact";
  return "dense";
}

function resultRosterWidth(playerCount: number): `${number}%` {
  return `${100 / Math.max(1, Math.min(playerCount, 6))}%` as `${number}%`;
}

function resultRosterName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

const ThemeContext = createContext<{
  readonly theme: ThemeName;
  readonly preference: ThemePreference;
  readonly toggle: () => void;
}>({ theme: "light", preference: "light", toggle: () => undefined });

const MessagingNavigationContext = createContext<{
  readonly open: (support: boolean) => void;
  readonly openProfile: () => void;
  readonly unreadCount: number;
}>({
  open: () => undefined,
  openProfile: () => undefined,
  unreadCount: 0,
});

function PaperPlaneIcon({ color }: { readonly color: string }) {
  return (
    <Svg accessibilityElementsHidden height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M21.3 2.8 3.2 9.6c-1.2.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.7.1 1 .8 1 .5 0 .8-.2 1-.5l2.6-2.5 5.3 3.9c1 .6 1.7.3 1.9-.9l3.1-14.8c.4-1.5-.6-2.2-1.9-1.6Z"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <Path
        d="m7.7 12.6 11-6.8-8.5 8.2"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

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

type Tab =
  | "home"
  | "discover"
  | "score"
  | "play"
  | "plans"
  | "video"
  | "wallet"
  | "predictions"
  | "you"
  | "health"
  | "performance"
  | "messages";

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

type HostedMatchSeed = {
  readonly courtBookingId: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly durationMinutes: number;
  readonly invitedPlayers?: readonly PersonSummary[];
  readonly courtPaymentMode?: "full" | "split";
};

type CourtBookingRequest = {
  readonly venueId: string;
  readonly date: string;
  readonly durationMinutes: number;
};

const tabs: readonly {
  key: Tab;
  label: string;
  icon: string;
}[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "discover", label: "Discover", icon: "⌖" },
  { key: "play", label: "Play", icon: "＋" },
  { key: "plans", label: "Plans", icon: "◫" },
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
  const { isOffline, lastSuccessfulSyncAt, mode } = usePlayerRuntime();
  if (mode === "preview") {
    return (
      <View style={styles.previewBanner}>
        <Text style={styles.previewBannerText}>
          PREVIEW DATA · SIGN-IN, BOOKINGS, AND PAYMENTS ARE DISABLED
        </Text>
      </View>
    );
  }
  if (!isOffline) return null;
  return (
    <View style={styles.offlineModeBanner}>
      <Text style={styles.offlineModeBannerText}>
        OFFLINE MODE · RECORD AND BROWSE SAVED DATA. BOOKINGS AND PAYMENTS
        RESUME WHEN YOU RECONNECT
      </Text>
      {lastSuccessfulSyncAt && (
        <Text style={styles.offlineModeBannerMeta}>
          Last synced{" "}
          {new Date(lastSuccessfulSyncAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      )}
    </View>
  );
}

function DunaWordmark({
  pro = false,
  tone = "default",
}: {
  readonly pro?: boolean;
  readonly tone?: "default" | "light";
}) {
  const { theme } = useContext(ThemeContext);
  return (
    <View style={styles.wordmark}>
      <Image
        accessibilityLabel="Duna"
        resizeMode="contain"
        source={
          tone === "light" || theme === "dark"
            ? dunaPlayerWordmarkWhite
            : dunaPlayerWordmarkBlue
        }
        style={styles.wordmarkImage}
      />
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

interface MobilePolicyReviewDocument {
  readonly id: string;
  readonly kind: "policy" | "waiver";
  readonly markdown: string;
  readonly required: boolean;
  readonly requireFullScroll: boolean;
  readonly title: string;
}

function MobilePolicyReviewCard({
  accepted,
  detail,
  onPress,
  policy,
}: {
  readonly accepted: boolean;
  readonly detail?: string;
  readonly onPress: () => void;
  readonly policy: MobilePolicyReviewDocument;
}) {
  return (
    <Pressable
      accessibilityHint="Opens the full document and its acceptance button"
      accessibilityLabel={`Review ${policy.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mobilePolicyCard,
        pressed && styles.mobilePolicyCardPressed,
      ]}
    >
      <View style={styles.mobilePolicyHeader}>
        <View style={styles.flex}>
          <Text style={styles.mobilePolicyTitle}>{policy.title}</Text>
          {detail && <Text style={styles.mobilePolicyDetail}>{detail}</Text>}
        </View>
        <Pill tone={accepted ? "positive" : "warning"}>
          {accepted ? "Accepted" : policy.required ? "Required" : "Optional"}
        </Pill>
      </View>
      <Text numberOfLines={3} style={styles.mobilePolicyDocumentText}>
        {policy.markdown}
      </Text>
      <View
        style={[
          styles.mobilePolicyAction,
          accepted && styles.mobilePolicyActionAccepted,
        ]}
      >
        <View style={styles.flex}>
          <Text
            style={[
              styles.mobilePolicyActionTitle,
              accepted && styles.mobilePolicyActionTitleAccepted,
            ]}
          >
            {accepted
              ? "Accepted for this checkout"
              : policy.requireFullScroll
                ? `Tap to read the full ${policy.kind}`
                : "Tap to review and accept"}
          </Text>
          <Text style={styles.mobilePolicyActionMeta}>
            {accepted
              ? "Tap to review the document again"
              : policy.requireFullScroll
                ? "Scroll to the bottom to unlock acceptance"
                : "The acceptance button is on the review screen"}
          </Text>
        </View>
        <Text
          style={[
            styles.mobilePolicyActionIcon,
            accepted && styles.mobilePolicyActionIconAccepted,
          ]}
        >
          {accepted ? "✓" : "›"}
        </Text>
      </View>
    </Pressable>
  );
}

function PolicyReviewModal({
  accepted,
  onAccept,
  onClose,
  policy,
  read,
  visible,
}: {
  readonly accepted: boolean;
  readonly onAccept: () => void;
  readonly onClose: () => void;
  readonly policy?: MobilePolicyReviewDocument;
  readonly read: boolean;
  readonly visible: boolean;
}) {
  const metrics = useRef<PolicyScrollMetrics>({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    metrics.current = {
      contentHeight: 0,
      offsetY: 0,
      viewportHeight: 0,
    };
    setReachedEnd(Boolean(policy && (!policy.requireFullScroll || read)));
  }, [policy?.id, policy?.requireFullScroll, read, visible]);

  if (!policy) return null;

  const updateMetrics = (next: Partial<PolicyScrollMetrics>) => {
    metrics.current = { ...metrics.current, ...next };
    if (policyScrollReachedEnd(metrics.current)) setReachedEnd(true);
  };
  const canAccept = !policy.requireFullScroll || read || reachedEnd;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.policyReviewSafe}>
        <View style={styles.policyReviewHeader}>
          <Pressable
            accessibilityLabel="Close policy review"
            hitSlop={12}
            onPress={onClose}
            style={styles.policyReviewClose}
          >
            <Text style={styles.policyReviewCloseText}>‹</Text>
          </Pressable>
          <View style={styles.policyReviewHeading}>
            <Text style={styles.policyReviewEyebrow}>
              {policy.kind === "waiver" ? "WAIVER REVIEW" : "POLICY REVIEW"}
            </Text>
            <Text numberOfLines={2} style={styles.policyReviewTitle}>
              {policy.title}
            </Text>
          </View>
          <Pill tone={accepted ? "positive" : "warning"}>
            {accepted ? "Accepted" : policy.required ? "Required" : "Optional"}
          </Pill>
        </View>

        {policy.requireFullScroll && (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.policyReviewInstruction,
              canAccept && styles.policyReviewInstructionComplete,
            ]}
          >
            <Text style={styles.policyReviewInstructionIcon}>
              {canAccept ? "✓" : "↓"}
            </Text>
            <Text style={styles.policyReviewInstructionText}>
              {canAccept
                ? "You reached the end. The acceptance button is ready."
                : "Read this document and scroll to the bottom to unlock acceptance."}
            </Text>
          </View>
        )}

        <ScrollView
          accessibilityLabel={`${policy.title} full text`}
          contentContainerStyle={styles.policyReviewContent}
          onContentSizeChange={(_width, height) =>
            updateMetrics({ contentHeight: height })
          }
          onLayout={({ nativeEvent }) =>
            updateMetrics({ viewportHeight: nativeEvent.layout.height })
          }
          onScroll={({ nativeEvent }) =>
            updateMetrics({
              contentHeight: nativeEvent.contentSize.height,
              offsetY: nativeEvent.contentOffset.y,
              viewportHeight: nativeEvent.layoutMeasurement.height,
            })
          }
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          style={styles.policyReviewScroll}
        >
          <NativeMarkdownContent
            color={colors.bone}
            linkColor={colors.lime}
            markdown={policy.markdown}
          />
          <View style={styles.policyReviewEnd}>
            <Text style={styles.policyReviewEndMark}>✓</Text>
            <Text style={styles.policyReviewEndText}>End of {policy.kind}</Text>
          </View>
        </ScrollView>

        <View style={styles.policyReviewFooter}>
          <Text style={styles.policyReviewConfirmation}>
            {policy.kind === "waiver"
              ? "By accepting, you confirm you read and agree to the waiver shown above."
              : "By accepting, you confirm you read and agree to the policy shown above."}
          </Text>
          <Pressable
            accessibilityHint={
              canAccept
                ? "Records your acceptance for this checkout"
                : "Scroll to the bottom of the document first"
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: accepted || !canAccept }}
            disabled={accepted || !canAccept}
            onPress={() => {
              successHaptic();
              onAccept();
            }}
            style={[
              styles.policyReviewAccept,
              (accepted || !canAccept) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.policyReviewAcceptText}>
              {accepted ? "✓ Accepted" : policyAcceptanceLabel(policy.kind)}
            </Text>
          </Pressable>
          {policy.requireFullScroll && !canAccept && (
            <Text style={styles.policyReviewLockedText}>
              Acceptance unlocks at the end of the document.
            </Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function AppHeader({ eyebrow }: { readonly eyebrow?: string }) {
  const { dashboard } = usePlayerRuntime();
  const messaging = useContext(MessagingNavigationContext);
  const initials = dashboard?.player.initials ?? demoPlayer.initials;
  return (
    <View style={styles.appHeader}>
      <View>
        <DunaWordmark />
        {eyebrow && <Text style={styles.headerEyebrow}>{eyebrow}</Text>}
      </View>
      <View style={styles.headerActions}>
        <ThemeButton />
        <Pressable
          accessibilityLabel="Messages"
          onPress={() => messaging.open(false)}
          style={styles.askButton}
        >
          <PaperPlaneIcon color={activePalette.aqua} />
          {messaging.unreadCount > 0 && <View style={styles.notificationDot} />}
        </Pressable>
        <Pressable
          accessibilityLabel="Your profile"
          onPress={messaging.openProfile}
          style={styles.avatarButton}
        >
          <Text style={styles.avatarText}>{initials}</Text>
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
  const [enrolledRole, setEnrolledRole] = useState<"coach" | "director">();
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
      setEnrolledRole(staffRole);
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

            {active?.canSelfEnroll && !enrolledRole && (
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

            {enrolledRole && active && (
              <View style={styles.organizationEnrollCard}>
                <Text style={styles.organizationEnrollEyebrow}>
                  WORKING ROLE ACTIVE
                </Text>
                <Text style={styles.organizationEnrollTitle}>
                  You are on {active.name}&apos;s team.
                </Text>
                <Text style={styles.organizationEnrollBody}>
                  Your {enrolledRole} profile is now visible in Duna HQ. Open
                  Duna Pro to see schedules, sessions, and coaching work for
                  this organization.
                </Text>
                <Pressable
                  accessibilityHint="Opens this organization in Duna Pro"
                  accessibilityRole="button"
                  onPress={() => {
                    const url = `duna-pro://organization/${encodeURIComponent(active.slug)}`;
                    void Linking.openURL(url).catch(() =>
                      WebBrowser.openBrowserAsync("https://hq.duna.coach"),
                    );
                  }}
                  style={styles.organizationEnrollPrimary}
                >
                  <Text style={styles.organizationEnrollPrimaryText}>
                    Open Duna Pro →
                  </Text>
                </Pressable>
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
  | "upload-score"
  | "find-match"
  | "book-court"
  | "join-event"
  | "record-video"
  | "watch-pros"
  | "search";

function HomeResultStoryCard({
  match,
  playerId,
}: {
  readonly match: MatchSummary;
  readonly playerId: string;
}) {
  const { openPlayerProfile } = usePlayerProfileNavigation();
  const reducedMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      reveal.setValue(1);
      return;
    }
    Animated.timing(reveal, {
      toValue: 1,
      duration: 540,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, reveal]);
  const playerSide = match.teamB.some((player) => player.id === playerId)
    ? "B"
    : "A";
  const won = match.winner === playerSide;
  const playerTeam = playerSide === "A" ? match.teamA : match.teamB;
  const opponentTeam = playerSide === "A" ? match.teamB : match.teamA;
  const score = match.score.map((set) =>
    playerSide === "A" ? set : ([set[1], set[0]] as const),
  );
  const subtitle = won
    ? match.ratingDelta >= 0.08
      ? "Beat the pre-match signal and earned every point of the rise."
      : score.length >= 3
        ? "Stayed composed through the decider and carried it home."
        : "Set the pace early and kept the result moving your way."
    : score.length >= 3
      ? "Took it to the decider—small margins, strong evidence for next time."
      : "Clear evidence, clean reset, and the next serve already ahead.";
  const renderTeam = (
    team: readonly PersonSummary[],
    side: "player" | "opponent",
  ) => {
    const density = resultRosterDensity(team.length);
    const rosterWidth = resultRosterWidth(team.length);
    return (
      <View
        style={[
          styles.resultStoryTeam,
          density === "compact" && styles.resultStoryTeamCompact,
          density === "dense" && styles.resultStoryTeamDense,
          team.length > 6 && styles.resultStoryTeamWrapped,
        ]}
      >
        <View style={styles.resultStoryPlayers}>
          {team.map((person) => (
            <Pressable
              accessibilityLabel={"Open " + person.displayName + "'s profile"}
              key={person.id}
              onPress={() => openPlayerProfile(person)}
              style={[
                styles.resultStoryPlayer,
                density === "compact" && styles.resultStoryPlayerCompact,
                density === "dense" && styles.resultStoryPlayerDense,
                { width: rosterWidth },
              ]}
            >
              {person.avatarUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: person.avatarUrl }}
                  style={[
                    styles.resultStoryAvatar,
                    density === "compact" && styles.resultStoryAvatarCompact,
                    density === "dense" && styles.resultStoryAvatarDense,
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.resultStoryAvatarFallback,
                    density === "compact" &&
                      styles.resultStoryAvatarFallbackCompact,
                    density === "dense" &&
                      styles.resultStoryAvatarFallbackDense,
                  ]}
                >
                  <Text
                    style={[
                      styles.resultStoryAvatarText,
                      density === "dense" && styles.resultStoryAvatarTextDense,
                    ]}
                  >
                    {person.initials}
                  </Text>
                </View>
              )}
              <Text
                accessibilityLabel={person.displayName}
                numberOfLines={1}
                style={[
                  styles.resultStoryPlayerName,
                  density === "compact" && styles.resultStoryPlayerNameCompact,
                  density === "dense" && styles.resultStoryPlayerNameDense,
                ]}
              >
                {resultRosterName(person.displayName)}
              </Text>
              <View
                style={[
                  styles.resultStoryPlayerRatingPill,
                  density === "dense" &&
                    styles.resultStoryPlayerRatingPillDense,
                ]}
              >
                <Text
                  style={[
                    styles.resultStoryPlayerRating,
                    density === "dense" && styles.resultStoryPlayerRatingDense,
                  ]}
                >
                  {person.rating.display.toFixed(2)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <View style={styles.resultStoryScores}>
          {score.map((set, index) => (
            <Text
              key={index}
              style={[
                styles.resultStoryScore,
                set[side === "player" ? 0 : 1] >
                  set[side === "player" ? 1 : 0] && styles.resultStoryScoreWon,
              ]}
            >
              {set[side === "player" ? 0 : 1]}
            </Text>
          ))}
        </View>
      </View>
    );
  };
  return (
    <View
      style={[
        styles.resultStoryCard,
        won ? styles.resultStoryCardWon : styles.resultStoryCardLost,
      ]}
    >
      <View style={styles.resultStoryHeader}>
        <Animated.View
          style={[
            styles.resultStoryHeaderCopy,
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
          <Text style={styles.resultStoryEyebrow}>
            {won ? "Match won" : "Match lost"}
          </Text>
          <Text style={styles.resultStorySubtitle}>{subtitle}</Text>
          <Text style={styles.resultStoryRecapLabel}>DUNA RESULT RECAP</Text>
        </Animated.View>
        <Text style={styles.resultStoryDate}>
          {new Date(match.playedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </Text>
        <View pointerEvents="none" style={styles.resultStoryPlayIcon}>
          <ResultPlayIcon
            outcome={won ? "won" : "lost"}
            playersPerSide={Math.max(playerTeam.length, opponentTeam.length)}
            size={138}
          />
        </View>
      </View>
      <View style={styles.resultStoryScorecard}>
        {renderTeam(playerTeam, "player")}
        <View style={styles.resultStoryDivider} />
        {renderTeam(opponentTeam, "opponent")}
      </View>
      <View style={styles.resultStoryFooter}>
        <Text style={styles.resultStoryVenue} numberOfLines={1}>
          {match.eventName ?? match.venueName}
        </Text>
        <Text
          style={[
            styles.resultStoryDelta,
            match.ratingDelta < 0 && styles.resultStoryDeltaNegative,
          ]}
        >
          {match.ratingDelta >= 0 ? "+" : ""}
          {match.ratingDelta.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

function HomeScreen({
  onAction,
  onBook,
  onOpenBooking,
  onPredictions,
}: {
  readonly onAction: (action: HomeQuickAction) => void;
  readonly onBook: (eventIndex: number) => void;
  readonly onOpenBooking: (bookingId: string) => void;
  readonly onPredictions: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const { openPlayerProfile } = usePlayerProfileNavigation();
  const chartDraw = useRef(new Animated.Value(0)).current;
  const {
    client,
    coaches,
    coachingNotes,
    dashboard,
    mode,
    organizationWallets,
    people,
    predictionDiscovery,
  } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const previewNextActivity = useMemo(() => {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 1);
    startsAt.setHours(10, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  }, []);
  const bookings =
    mode === "preview"
      ? demoBookings.map((booking) =>
          booking.id === "booking-pickup"
            ? {
                ...booking,
                ...previewNextActivity,
                sessionId: "event-pickup",
              }
            : booking,
        )
      : (dashboard?.bookings ?? demoBookings);
  const events =
    mode === "preview"
      ? demoEvents.map((event) =>
          event.id === "event-pickup"
            ? { ...event, ...previewNextActivity }
            : event,
        )
      : (dashboard?.events ?? demoEvents);
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
  const nextBookingEventIndex = nextBooking?.sessionId
    ? events.findIndex((event) => event.id === nextBooking.sessionId)
    : -1;
  const nextBookingEvent =
    nextBookingEventIndex >= 0 ? events[nextBookingEventIndex] : undefined;
  const nextBookingAttendees = nextBookingEvent?.attendees?.slice(0, 3) ?? [];
  const nextBookingOpenSpots = nextBookingEvent?.spotsRemaining ?? 0;
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
      key: "upload-score",
      icon: "↥",
      label: "Upload a Score",
      meta: "Report a match you played",
    },
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
        <AppHeader />
        <LivePlayerRail palette={colors} />
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
          <>
            <Pressable
              accessibilityHint={
                nextBookingEventIndex >= 0
                  ? "Opens your event registration"
                  : "Opens your booking details"
              }
              accessibilityRole="button"
              onPress={() => {
                selectionHaptic();
                onOpenBooking(nextBooking.id);
              }}
              style={({ pressed }) => [
                styles.homeNextActivity,
                pressed && styles.homeQuickActionPressed,
              ]}
            >
              <View style={styles.homeNextRoster}>
                {nextBookingAttendees.map((attendee) => {
                  const fullPlayer = people?.find(
                    (candidate) => candidate.id === attendee.id,
                  );
                  return (
                    <Pressable
                      accessibilityLabel={
                        "Open " + attendee.displayName + "'s profile"
                      }
                      disabled={!fullPlayer}
                      key={attendee.id}
                      onPress={(event) => {
                        event.stopPropagation();
                        if (fullPlayer) openPlayerProfile(fullPlayer);
                      }}
                      style={styles.homeNextPlayer}
                    >
                      {attendee.avatarUrl ? (
                        <Image
                          accessibilityIgnoresInvertColors
                          source={{ uri: attendee.avatarUrl }}
                          style={styles.homeNextAvatar}
                        />
                      ) : (
                        <View style={styles.homeNextAvatarFallback}>
                          <Text style={styles.homeNextAvatarText}>
                            {attendee.initials}
                          </Text>
                        </View>
                      )}
                      <Text numberOfLines={1} style={styles.homeNextPlayerName}>
                        {attendee.displayName.split(" ")[0]}
                      </Text>
                      {attendee.ratingDisplay !== undefined && (
                        <Text style={styles.homeNextRating}>
                          {attendee.ratingDisplay.toFixed(1)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
                {nextBookingOpenSpots > 0 && (
                  <View style={styles.homeNextPlayer}>
                    <View style={styles.homeNextAvailableAvatar}>
                      <Text style={styles.homeNextAvailablePlus}>＋</Text>
                    </View>
                    <Text style={styles.homeNextAvailableText}>Available</Text>
                    <Text style={styles.homeNextAvailableCount}>
                      {nextBookingOpenSpots}{" "}
                      {nextBookingOpenSpots === 1 ? "spot" : "spots"}
                    </Text>
                  </View>
                )}
                {!nextBookingAttendees.length && !nextBookingOpenSpots && (
                  <View style={styles.homeNextPlayer}>
                    <View style={styles.homeNextAvatarFallback}>
                      <Text style={styles.homeNextAvatarText}>
                        {nextBooking.participantNames?.[0]
                          ?.split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("") ?? "YOU"}
                      </Text>
                    </View>
                    <Text style={styles.homeNextPlayerName}>You</Text>
                  </View>
                )}
              </View>
              <View style={styles.homeNextActivityInfo}>
                <Text style={styles.homeNextEyebrow}>
                  NEXT UP · YOUR ACTIVITY
                </Text>
                <Text style={styles.homeNextActivityWhen}>
                  {new Date(nextBooking.startsAt).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {new Date(nextBooking.startsAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <Text style={styles.homeNextTitle}>{nextBooking.title}</Text>
                <Text style={styles.homeNextMeta}>{nextBooking.venueName}</Text>
                <View style={styles.homeNextStatusRow}>
                  <Pill
                    tone={nextBookingOpenSpots > 0 ? "warning" : "positive"}
                  >
                    {nextBookingOpenSpots > 0
                      ? nextBookingOpenSpots + " available"
                      : nextBooking.status.replace("-", " ")}
                  </Pill>
                  <Text style={styles.homeNextDetails}>Details →</Text>
                </View>
              </View>
            </Pressable>
            {!["pickup", "court-rental"].includes(nextBooking.kind) && (
              <LiveActivitiesPrompt booking={nextBooking} client={client} />
            )}
          </>
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
                index === 4 && styles.homeQuickActionWarm,
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
        <MobilePredictionDiscoveryRail
          items={predictionDiscovery?.items ?? []}
          onOpenPortfolio={onPredictions}
        />
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
            <View style={styles.resultStoryStack}>
              {matches.slice(0, 2).map((match) => (
                <HomeResultStoryCard
                  key={match.id}
                  match={match}
                  playerId={player.id}
                />
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
  availability,
  availabilityLoading,
  markers,
  maxDate,
  minDate,
  onClose,
  onExtendRange,
  onSelect,
  selectedDate,
  visible,
}: {
  readonly availability?: CourtAvailability;
  readonly availabilityLoading: boolean;
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
  const selectedAvailability =
    availability?.date === selectedDate ? availability : undefined;
  const openCourtCount = new Set(
    selectedAvailability?.slots.map((slot) => slot.courtId) ?? [],
  ).size;
  const openStartCount = new Set(
    selectedAvailability?.slots.map((slot) => slot.localStartsAt) ?? [],
  ).size;
  const openMatchCount = selectedAvailability?.openMatches.length ?? 0;
  const openOptionCount = openStartCount + openMatchCount;
  const firstOpenAt = [
    ...(selectedAvailability?.slots.map((slot) => slot.localStartsAt) ?? []),
    ...(selectedAvailability?.openMatches.map((match) => match.localStartsAt) ??
      []),
  ].sort()[0];
  const selectedDateLabel = localDateAnchor(selectedDate).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" },
  );

  useEffect(() => {
    if (!visible) return;
    setVisibleMonth((current) =>
      selectedDate >= current && selectedDate < addLocalMonths(current, 2)
        ? current
        : startOfLocalMonth(selectedDate),
    );
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
            <Text style={styles.bookingCalendarEyebrow}>
              COURT AVAILABILITY
            </Text>
            <Text style={styles.bookingCalendarTitle}>
              When do you want to play?
            </Text>
            <Text style={styles.bookingCalendarInstruction}>
              Tap a day to preview live court openings.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close full calendar"
            hitSlop={3}
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
            hitSlop={4}
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
            hitSlop={4}
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
          <View style={styles.bookingCalendarAvailability}>
            <Text style={styles.bookingCalendarAvailabilityEyebrow}>
              {selectedDateLabel.toUpperCase()}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={styles.bookingCalendarAvailabilityTitle}
            >
              {availabilityLoading
                ? "Checking live availability…"
                : openCourtCount > 0
                  ? `${openCourtCount} ${openCourtCount === 1 ? "court" : "courts"} with open times`
                  : openMatchCount > 0
                    ? `${openMatchCount} open ${openMatchCount === 1 ? "match" : "matches"}`
                    : "No open court times yet"}
            </Text>
            {!availabilityLoading && openOptionCount > 0 ? (
              <View style={styles.bookingCalendarAvailabilityFacts}>
                {openStartCount > 0 ? (
                  <Text style={styles.bookingCalendarAvailabilityFact}>
                    {openStartCount} {openStartCount === 1 ? "start" : "starts"}
                  </Text>
                ) : null}
                {openMatchCount > 0 ? (
                  <Text style={styles.bookingCalendarAvailabilityFact}>
                    {openMatchCount} open{" "}
                    {openMatchCount === 1 ? "match" : "matches"}
                  </Text>
                ) : null}
                {firstOpenAt ? (
                  <Text style={styles.bookingCalendarAvailabilityFact}>
                    From {localSlotTime(firstOpenAt)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={availabilityLoading || openOptionCount === 0}
              onPress={onClose}
              style={[
                styles.bookingCalendarAvailabilityButton,
                (availabilityLoading || openOptionCount === 0) &&
                  styles.bookingCalendarAvailabilityButtonDisabled,
              ]}
            >
              <Text style={styles.bookingCalendarAvailabilityButtonText}>
                {availabilityLoading
                  ? "Checking…"
                  : openOptionCount > 0
                    ? `See ${openOptionCount} open ${openOptionCount === 1 ? "option" : "options"}`
                    : "No times available"}
              </Text>
            </Pressable>
          </View>
          <View
            style={[
              styles.bookingCalendarMonths,
              width >= 720 && styles.bookingCalendarMonthsWide,
            ]}
          >
            {months.map((month) => (
              <View
                key={month}
                style={[
                  styles.bookingCalendarMonth,
                  width >= 720 && styles.bookingCalendarMonthWide,
                ]}
              >
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
                      <View key={date} style={styles.bookingCalendarCell}>
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
                          hitSlop={6}
                          onPress={() => {
                            selectionHaptic();
                            onSelect(date);
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
                      </View>
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

function VenueFinderModal({
  onClose,
  onSelect,
  visible,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelect: (request: CourtBookingRequest) => void;
}) {
  const { venues } = usePlayerRuntime();
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<DiscoveryCoordinates>();
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "finding" | "available" | "unavailable"
  >("idle");
  const [date, setDate] = useState(() => localDateValue(new Date()));
  const [durationMinutes, setDurationMinutes] = useState(90);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLocationStatus("finding");
    void Location.requestForegroundPermissionsAsync()
      .then(async (permission) => {
        if (!active) return;
        if (permission.status !== "granted") {
          setLocationStatus("unavailable");
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("available");
      })
      .catch(() => {
        if (active) setLocationStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addLocalDateDays(localDateValue(new Date()), index),
      ),
    [],
  );
  const options = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (venues ?? [])
      .filter((venue) => venue.courtCount > 0)
      .filter(
        (venue) =>
          !normalized ||
          [venue.name, venue.city, venue.region, ...venue.tags]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalized),
      )
      .map((venue) => ({
        venue,
        distanceMiles: origin ? discoveryDistance(origin, venue) : undefined,
      }))
      .sort((left, right) => {
        if (
          left.distanceMiles !== undefined &&
          right.distanceMiles !== undefined
        ) {
          return left.distanceMiles - right.distanceMiles;
        }
        if (left.distanceMiles !== undefined) return -1;
        if (right.distanceMiles !== undefined) return 1;
        return left.venue.name.localeCompare(right.venue.name);
      });
  }, [origin, query, venues]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.venueFinderSafe}>
        <View style={styles.venueFinderHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>LIVE COURT INVENTORY</Text>
            <Text style={styles.venueFinderTitle}>Find a court.</Text>
            <Text style={styles.venueFinderBody}>
              Choose a Duna venue first. We’ll show only courts and open matches
              available for the time you select.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close venue search"
            onPress={onClose}
            style={styles.venueFinderClose}
          >
            <Text style={styles.venueFinderCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.venueFinderContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.venueFinderLocationRow}>
            <Text style={styles.venueFinderLocationIcon}>⌖</Text>
            <View style={styles.flex}>
              <Text style={styles.venueFinderLocationTitle}>
                {locationStatus === "finding"
                  ? "Finding nearby venues…"
                  : locationStatus === "available"
                    ? "Nearby venues first"
                    : "Search Duna venues"}
              </Text>
              <Text style={styles.venueFinderLocationBody}>
                {locationStatus === "available"
                  ? "Your precise location stays on your device."
                  : "Location is optional—search by city, beach, or club."}
              </Text>
            </View>
          </View>
          <TextInput
            autoCapitalize="words"
            onChangeText={setQuery}
            placeholder="Search a venue, beach, or city"
            placeholderTextColor={colors.muted}
            style={styles.venueFinderSearch}
            value={query}
          />
          <Text style={styles.venueFinderLabel}>WHEN</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalBleed}
          >
            <View style={styles.venueFinderDayRow}>
              {days.map((value) => {
                const selected = value === date;
                const day = localDateAnchor(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => setDate(value)}
                    style={[
                      styles.venueFinderDay,
                      selected && styles.venueFinderDayActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.venueFinderDayName,
                        selected && styles.venueFinderDayTextActive,
                      ]}
                    >
                      {day
                        .toLocaleDateString("en-US", { weekday: "short" })
                        .toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.venueFinderDayNumber,
                        selected && styles.venueFinderDayTextActive,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.venueFinderDurationRow}>
            {[60, 90, 120].map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => setDurationMinutes(minutes)}
                style={[
                  styles.venueFinderDuration,
                  durationMinutes === minutes &&
                    styles.venueFinderDurationActive,
                ]}
              >
                <Text
                  style={[
                    styles.venueFinderDurationText,
                    durationMinutes === minutes &&
                      styles.venueFinderDurationTextActive,
                  ]}
                >
                  {minutes} min
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.venueFinderLabel}>
            {origin ? "NEARBY DUNA VENUES" : "DUNA VENUES"}
          </Text>
          <View style={styles.venueFinderResults}>
            {options.map(({ distanceMiles, venue }) => (
              <Pressable
                key={venue.id}
                onPress={() =>
                  onSelect({ venueId: venue.id, date, durationMinutes })
                }
                style={styles.venueFinderResult}
              >
                <View style={styles.venueFinderResultMark}>
                  <Text style={styles.venueFinderResultMarkText}>▦</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.venueFinderResultTitle}>
                    {venue.name}
                  </Text>
                  <Text style={styles.venueFinderResultMeta}>
                    {venue.city}, {venue.region} · {venue.courtCount}{" "}
                    {venue.courtCount === 1 ? "court" : "courts"}
                    {distanceMiles !== undefined
                      ? ` · ${distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)} mi`
                      : ""}
                  </Text>
                </View>
                <Text style={styles.venueFinderResultArrow}>›</Text>
              </Pressable>
            ))}
            {options.length === 0 && (
              <View style={styles.venueFinderEmpty}>
                <Text style={styles.venueFinderEmptyTitle}>
                  No Duna courts match that search.
                </Text>
                <Text style={styles.venueFinderEmptyBody}>
                  Creating a match at a beach or venue outside Duna is still
                  easy—use Create a Match from Play.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function VenueBookingModal({
  initialDate,
  initialDurationMinutes,
  venueId,
  visible,
  onClose,
  onHostReady,
  onOpenMatch,
}: {
  readonly initialDate?: string;
  readonly initialDurationMinutes?: number;
  readonly venueId?: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onHostReady?: (seed: HostedMatchSeed) => void;
  readonly onOpenMatch?: (matchId: string, matchSlug: string) => void;
}) {
  const { width } = useWindowDimensions();
  const { client, dashboard, mode, people, publicClient, refresh } =
    usePlayerRuntime();
  const courtClient = publicClient ?? client;
  const [todayValue] = useState(() => localDateValue(new Date()));
  const [inventory, setInventory] = useState<CourtInventory>();
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [dateRangeEnd, setDateRangeEnd] = useState(() =>
    addLocalDateDays(todayValue, 90),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [selectedLocalStart, setSelectedLocalStart] = useState<string>();
  const [selectedSlot, setSelectedSlot] =
    useState<CourtAvailability["slots"][number]>();
  const [bookingIntent, setBookingIntent] = useState<"private" | "host">(
    "private",
  );
  const [paymentMode, setPaymentMode] = useState<"full" | "split">("full");
  const [participants, setParticipants] = useState<BookingParticipant[]>([]);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [contactOptions, setContactOptions] = useState<BookingParticipant[]>(
    [],
  );
  const [manualName, setManualName] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyRead, setPolicyRead] = useState(false);
  const [policyReviewOpen, setPolicyReviewOpen] = useState(false);
  const [timeSelectionCommitted, setTimeSelectionCommitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [lookingPostId, setLookingPostId] = useState<string>();
  const [confirmation, setConfirmation] = useState<{
    readonly bookingId: string;
    readonly details: ShareableBookingDetails;
    readonly label: string;
    readonly title: string;
    readonly body: string;
  }>();
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
  const policyDocument: MobilePolicyReviewDocument | undefined = policy
    ? {
        id: `court-policy-${selectedCourt?.id ?? "selected"}`,
        kind: "policy",
        markdown: policy.markdown,
        required: true,
        requireFullScroll: policy.requireFullScroll,
        title: policy.title,
      }
    : undefined;
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
  const timeOptions = useMemo(
    () =>
      [
        ...new Set([
          ...(availability?.slots ?? []).map((slot) => slot.localStartsAt),
          ...(availability?.openMatches ?? []).map(
            (match) => match.localStartsAt,
          ),
        ]),
      ].sort(),
    [availability],
  );
  const selectedOpenMatches = (availability?.openMatches ?? []).filter(
    (match) => match.localStartsAt === selectedLocalStart,
  );
  const selectedStartSlots = (availability?.slots ?? []).filter(
    (slot) => slot.localStartsAt === selectedLocalStart,
  );
  const selectedPlayWindow = selectedOpenMatches[0] ?? selectedStartSlots[0];
  const selectedDunaPlayers = useMemo(() => {
    const byId = new Map(
      (people ?? demoPeople).map((person) => [person.id, person]),
    );
    return participants.flatMap((participant) => {
      const person = participant.personId
        ? byId.get(participant.personId)
        : undefined;
      return person ? [person] : [];
    });
  }, [participants, people]);

  useEffect(() => {
    if (
      !visible ||
      !client ||
      mode === "preview" ||
      !venueId ||
      !selectedPlayWindow
    ) {
      setLookingPostId(undefined);
      return;
    }
    let cancelled = false;
    void client.player.matchAvailability
      .query()
      .then((posts) => {
        if (cancelled) return;
        const matching = posts.find(
          (post) =>
            post.venueId === venueId &&
            post.startsAt === selectedPlayWindow.startsAt &&
            post.endsAt === selectedPlayWindow.endsAt,
        );
        setLookingPostId(matching?.id);
      })
      .catch(() => {
        if (!cancelled) setLookingPostId(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    mode,
    selectedPlayWindow?.endsAt,
    selectedPlayWindow?.startsAt,
    venueId,
    visible,
  ]);

  useEffect(() => {
    if (!visible) return;
    if (initialDate && initialDate >= todayValue) setSelectedDate(initialDate);
    if (initialDurationMinutes) setDurationMinutes(initialDurationMinutes);
  }, [initialDate, initialDurationMinutes, todayValue, visible]);

  useEffect(() => {
    if (!visible) {
      dateRailPositioned.current = false;
      setConfirmation(undefined);
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
    if (!visible || !venueId || !courtClient) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void courtClient.public.courtBookingInventory
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
        setDurationMinutes(
          initialDurationMinutes && options.includes(initialDurationMinutes)
            ? initialDurationMinutes
            : options.includes(90)
              ? 90
              : (options[0] ?? 60),
        );
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
  }, [courtClient, initialDurationMinutes, venueId, visible]);

  useEffect(() => {
    if (!visible || !venueId || !courtClient || !inventory) return;
    let cancelled = false;
    setLoading(true);
    setAvailabilityLoading(true);
    setAvailability(undefined);
    setSelectedSlot(undefined);
    setSelectedLocalStart(undefined);
    setTimeSelectionCommitted(false);
    setPolicyAccepted(false);
    setPolicyRead(false);
    setPolicyReviewOpen(false);
    void courtClient.public.courtAvailability
      .query({
        venueId,
        date: selectedDate,
        durationMinutes,
      })
      .then((nextAvailability) => {
        if (cancelled) return;
        setAvailability(nextAvailability);
        const firstStart = [
          ...nextAvailability.slots.map((slot) => slot.localStartsAt),
          ...nextAvailability.openMatches.map((match) => match.localStartsAt),
        ].sort()[0];
        setSelectedLocalStart(firstStart);
      })
      .catch((reason) => {
        if (!cancelled) setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setAvailabilityLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [courtClient, durationMinutes, inventory, selectedDate, venueId, visible]);

  function reviewSlot(
    slot: CourtAvailability["slots"][number],
    intent: "private" | "host",
  ) {
    selectionHaptic();
    setBookingIntent(intent);
    setPaymentMode("full");
    setParticipants([]);
    setPolicyAccepted(false);
    setPolicyRead(false);
    setPolicyReviewOpen(false);
    setSelectedSlot(slot);
  }

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

  async function toggleLookingToPlay() {
    if (!client || !venueId || mode === "preview") return;
    setBusy(true);
    setError(undefined);
    try {
      if (lookingPostId) {
        await client.player.cancelMatchAvailability.mutate({
          postId: lookingPostId,
          idempotencyKey: Crypto.randomUUID(),
        });
        setLookingPostId(undefined);
        setNotice("You are no longer shown as looking to play at this time.");
        return;
      }
      if (!selectedPlayWindow) {
        setError("Choose a time before saying you are looking to play.");
        return;
      }
      const post = await client.player.createMatchAvailability.mutate({
        venueId,
        startsAt: selectedPlayWindow.startsAt,
        endsAt: selectedPlayWindow.endsAt,
        matchType: "either",
        genderPreference: "open",
        formatPreferences: [],
        note: "Open to an invitation for this time.",
        idempotencyKey: Crypto.randomUUID(),
      });
      setLookingPostId(post.id);
      setNotice(
        "You’re now visible to match creators for this time. Any invitation still requires your acceptance.",
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
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        participants,
        policyAccepted,
        policyFullScrollConfirmed: policyRead || !policy?.requireFullScroll,
        successUrl: `${dunaWebUrl}/app?court_checkout=success`,
        cancelUrl: `${dunaWebUrl}/app?court_checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.mode === "free" || result.paymentSheet || result.checkoutUrl) {
        let confirmed = result.mode === "free";
        let sharePaid = result.mode === "free";
        let awaitingParticipants = false;
        if (result.paymentSheet) {
          const payment = await presentThenPollCheckout({
            present: () =>
              presentNativeEventPayment({
                paymentSheet: result.paymentSheet!,
                customerName: dashboard?.player.displayName,
              }),
            readStatus: () =>
              client.player.courtCheckoutStatus.query({
                paymentIntentId: result.paymentSheet!.paymentIntentId,
              }),
            isComplete: (status) => status.sharePaid,
            maxPolls: 8,
            delayMs: (attempt) => (attempt < 3 ? 450 : 900),
          });
          if (payment.cancelled) return;
          const { status } = payment;
          confirmed = status.complete;
          sharePaid = status.sharePaid;
          awaitingParticipants = status.awaitingParticipants;
        } else if (result.checkoutUrl) {
          if (Platform.OS !== "web") {
            throw new Error(
              "Duna could not prepare the in-app payment. Your court is not charged; please try again.",
            );
          }
          await WebBrowser.openBrowserAsync(result.checkoutUrl);
          if (result.checkoutSessionId) {
            for (let attempt = 0; attempt < 8; attempt += 1) {
              const status = await client.player.courtCheckoutStatus.query({
                checkoutSessionId: result.checkoutSessionId,
              });
              confirmed = status.complete;
              sharePaid = status.sharePaid;
              awaitingParticipants = status.awaitingParticipants;
              if (sharePaid) break;
              await new Promise<void>((resolve) =>
                setTimeout(resolve, attempt < 3 ? 500 : 1_000),
              );
            }
          }
        }
        successHaptic();
        await refresh();
        if (
          bookingIntent === "host" &&
          confirmed &&
          result.bookingId &&
          venueId &&
          inventory
        ) {
          const seed: HostedMatchSeed = {
            courtBookingId: result.bookingId,
            venueId,
            venueName: inventory.venue.name,
            startsAt: selectedSlot.startsAt,
            endsAt: selectedSlot.endsAt,
            localStartsAt: selectedSlot.localStartsAt,
            localEndsAt: selectedSlot.localEndsAt,
            durationMinutes,
            invitedPlayers: selectedDunaPlayers,
            courtPaymentMode: paymentMode,
          };
          onClose();
          onHostReady?.(seed);
          return;
        }
        if (result.bookingId && inventory) {
          const playerNames = result.participants?.map(
            (participant) => participant.displayName,
          ) ?? [
            dashboard?.player.displayName ?? "You",
            ...participants.flatMap((participant) =>
              participant.name ? [participant.name] : [],
            ),
          ];
          setConfirmation({
            bookingId: result.bookingId,
            details: {
              title: `Court rental · ${selectedSlot.courtName}`,
              startsAt: result.startsAt,
              endsAt: result.endsAt,
              timezone: inventory.venue.timezone,
              organizationName: inventory.venue.organizationName,
              locationName: inventory.venue.name,
              ...(inventory.venue.address
                ? { address: inventory.venue.address }
                : {}),
              courtName: selectedSlot.courtName,
              playerNames,
              detailsUrl: `${dunaWebUrl}/venues/${inventory.venue.id}`,
            },
            label: awaitingParticipants
              ? "Share paid"
              : confirmed
                ? "Confirmed"
                : sharePaid
                  ? "Payment received"
                  : "Processing",
            title: awaitingParticipants
              ? "Your court is held."
              : confirmed
                ? "Court reserved."
                : "Payment received.",
            body: awaitingParticipants
              ? "Your share is paid. Invited players have secure links for their shares; the booking confirms when everyone is paid."
              : confirmed
                ? "Everything you need is below and ready to share."
                : "Duna is finishing the confirmation and will keep this booking in your Plans.",
          });
        } else {
          setNotice(
            sharePaid
              ? "Payment received. Duna is finishing confirmation."
              : "The court payment is still processing.",
          );
        }
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
  if (showPlayerPicker) {
    return (
      <PlayerPickerModal
        excludedPersonIds={[dashboard?.player.id ?? demoPlayer.id]}
        maxSelected={11}
        onChange={(players) =>
          setParticipants((current) => [
            ...current.filter((participant) => !participant.personId),
            ...players.map((person) => ({
              personId: person.id,
              name: person.displayName,
            })),
          ])
        }
        onClose={() => setShowPlayerPicker(false)}
        palette={colors}
        presentationStyle="pageSheet"
        selected={selectedDunaPlayers}
        title="Add players"
        visible
      />
    );
  }
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        {confirmation ? (
          <BookingConfirmationView
            body={confirmation.body}
            details={confirmation.details}
            label={confirmation.label}
            onDone={onClose}
            title={confirmation.title}
          />
        ) : (
          <>
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
                  <Text style={styles.closeText}>
                    {selectedSlot ? "‹" : "×"}
                  </Text>
                </Pressable>
                <Text style={styles.modalHeaderTitle}>
                  {selectedSlot
                    ? bookingIntent === "host"
                      ? "Create a match"
                      : "Review"
                    : "Find a game"}
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
                        {localDateAnchor(selectedDate).toLocaleDateString(
                          "en-US",
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          },
                        )}
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
                        <Text style={styles.bookingDateCalendarText}>
                          Calendar
                        </Text>
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
                          accessibilityLabel={`${date.toLocaleDateString(
                            "en-US",
                            {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}${marker ? `, ${marker.count} scheduled` : ""}`}
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
                            {date.toLocaleDateString("en-US", {
                              month: "short",
                            })}
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
                    <Text style={styles.bookingEmpty}>
                      Finding open courts…
                    </Text>
                  ) : timeOptions.length ? (
                    <>
                      <Text style={styles.bookingTimeSectionLabel}>
                        OPEN COURTS + MATCHES
                      </Text>
                      {timeSelectionCommitted && selectedLocalStart ? (
                        <Pressable
                          accessibilityLabel="Change selected court time"
                          onPress={() => setTimeSelectionCommitted(false)}
                          style={styles.bookingSelectedTime}
                        >
                          <View style={styles.flex}>
                            <Text style={styles.bookingSelectedTimeLabel}>
                              SELECTED TIME
                            </Text>
                            <Text style={styles.bookingSelectedTimeValue}>
                              {localSlotTime(selectedLocalStart)} ·{" "}
                              {durationMinutes} min
                            </Text>
                          </View>
                          <Text style={styles.bookingSelectedTimeAction}>
                            Change
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={styles.bookingTimeGrid}>
                          {timeOptions.map((localStartsAt) => {
                            const openMatches = (
                              availability?.openMatches ?? []
                            ).filter(
                              (match) => match.localStartsAt === localStartsAt,
                            );
                            const slotCount = (
                              availability?.slots ?? []
                            ).filter(
                              (slot) => slot.localStartsAt === localStartsAt,
                            ).length;
                            const active = selectedLocalStart === localStartsAt;
                            const players = openMatches
                              .flatMap((match) => [
                                match.host,
                                ...match.attendees.filter(
                                  (player) => player.id !== match.host.id,
                                ),
                              ])
                              .slice(0, 2);
                            return (
                              <Pressable
                                accessibilityLabel={`${localSlotTime(localStartsAt)}, ${
                                  openMatches.length
                                    ? `${openMatches.length} open match${openMatches.length === 1 ? "" : "es"}`
                                    : `${slotCount} open court${slotCount === 1 ? "" : "s"}`
                                }`}
                                key={localStartsAt}
                                onPress={() => {
                                  selectionHaptic();
                                  setSelectedLocalStart(localStartsAt);
                                  setTimeSelectionCommitted(true);
                                }}
                                style={[
                                  styles.bookingTimeOption,
                                  openMatches.length > 0 &&
                                    styles.bookingTimeOptionMatch,
                                  active && styles.bookingTimeOptionActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.bookingTimeOptionTime,
                                    active &&
                                      styles.bookingTimeOptionTimeActive,
                                  ]}
                                >
                                  {localSlotTime(localStartsAt)}
                                </Text>
                                {players.length > 0 && (
                                  <View style={styles.bookingTimeRoster}>
                                    {players.map((player, index) =>
                                      player.avatarUrl ? (
                                        <Image
                                          key={`${player.id}-${index}`}
                                          source={{ uri: player.avatarUrl }}
                                          style={styles.bookingTimeAvatar}
                                        />
                                      ) : (
                                        <Text
                                          key={`${player.id}-${index}`}
                                          style={
                                            styles.bookingTimeAvatarFallback
                                          }
                                        >
                                          {player.initials}
                                        </Text>
                                      ),
                                    )}
                                  </View>
                                )}
                                <Text
                                  style={[
                                    styles.bookingTimeOptionMeta,
                                    active &&
                                      styles.bookingTimeOptionMetaActive,
                                  ]}
                                >
                                  {openMatches.length
                                    ? `${openMatches.length} open match${openMatches.length === 1 ? "" : "es"}`
                                    : `${slotCount} court${slotCount === 1 ? "" : "s"}`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {selectedOpenMatches.length > 0 && (
                        <View style={styles.bookingOpenMatchSection}>
                          <Text style={styles.bookingTimeSectionLabel}>
                            RESERVE A PLACE IN A MATCH
                          </Text>
                          {selectedOpenMatches.map((match) => {
                            const roster = [
                              match.host,
                              ...match.attendees.filter(
                                (player) => player.id !== match.host.id,
                              ),
                            ];
                            const alreadyJoined = Boolean(
                              dashboard?.player.id &&
                              roster.some(
                                (player) => player.id === dashboard.player.id,
                              ),
                            );
                            const matchMinutes = Math.round(
                              (Date.parse(match.endsAt) -
                                Date.parse(match.startsAt)) /
                                60_000,
                            );
                            return (
                              <View
                                key={match.id}
                                style={styles.bookingOpenMatch}
                              >
                                <View style={styles.rowBetween}>
                                  <View style={styles.flex}>
                                    <Text
                                      style={styles.bookingOpenMatchEyebrow}
                                    >
                                      {match.matchType.toUpperCase()} ·{" "}
                                      {match.format}
                                    </Text>
                                    <Text style={styles.bookingOpenMatchTitle}>
                                      {match.title}
                                    </Text>
                                    <Text style={styles.rowMeta}>
                                      Hosted by {match.host.displayName}
                                    </Text>
                                  </View>
                                  <View
                                    style={styles.bookingOpenMatchPriceBlock}
                                  >
                                    <Text style={styles.bookingOpenMatchPrice}>
                                      {match.price.amountMinor
                                        ? formatMoney(
                                            match.price.amountMinor,
                                            match.price.currency,
                                          )
                                        : "Free"}
                                    </Text>
                                    <Text style={styles.rowMeta}>
                                      {matchMinutes} min
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.bookingOpenMatchRoster}>
                                  {roster.slice(0, 4).map((player) => (
                                    <View
                                      key={player.id}
                                      style={styles.bookingOpenMatchPlayer}
                                    >
                                      {player.avatarUrl ? (
                                        <Image
                                          source={{ uri: player.avatarUrl }}
                                          style={styles.bookingOpenMatchAvatar}
                                        />
                                      ) : (
                                        <Text
                                          style={
                                            styles.bookingOpenMatchAvatarFallback
                                          }
                                        >
                                          {player.initials}
                                        </Text>
                                      )}
                                      <Text
                                        numberOfLines={1}
                                        style={
                                          styles.bookingOpenMatchPlayerName
                                        }
                                      >
                                        {player.displayName.split(" ")[0]}
                                      </Text>
                                    </View>
                                  ))}
                                  {Array.from(
                                    {
                                      length: Math.min(2, match.spotsRemaining),
                                    },
                                    (_, index) => (
                                      <View
                                        key={`${match.id}-open-${index}`}
                                        style={styles.bookingOpenMatchPlayer}
                                      >
                                        <Text
                                          style={
                                            styles.bookingOpenMatchAvailable
                                          }
                                        >
                                          ＋
                                        </Text>
                                        <Text
                                          style={
                                            styles.bookingOpenMatchPlayerName
                                          }
                                        >
                                          Available
                                        </Text>
                                      </View>
                                    ),
                                  )}
                                </View>
                                <View style={styles.bookingOpenMatchFooter}>
                                  <Text style={styles.bookingOpenMatchSpots}>
                                    {match.spotsRemaining} spot
                                    {match.spotsRemaining === 1 ? "" : "s"} open
                                  </Text>
                                  <Pressable
                                    disabled={alreadyJoined}
                                    onPress={() =>
                                      onOpenMatch?.(match.id, match.slug)
                                    }
                                    style={[
                                      styles.bookingOpenMatchJoin,
                                      alreadyJoined && styles.buttonDisabled,
                                    ]}
                                  >
                                    <Text style={styles.payButtonText}>
                                      {alreadyJoined
                                        ? "You’re already in"
                                        : "Reserve a spot →"}
                                    </Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {selectedStartSlots.length > 0 && (
                        <View style={styles.bookingCreateMatchSection}>
                          <Text style={styles.bookingTimeSectionLabel}>
                            {selectedOpenMatches.length
                              ? "OR RESERVE YOUR OWN COURT"
                              : "RESERVE YOUR OWN COURT"}
                          </Text>
                          {selectedStartSlots.map((slot) => (
                            <View
                              key={`${slot.courtId}-${slot.startsAt}`}
                              style={styles.bookingCourtChoice}
                            >
                              <View style={styles.flex}>
                                <Text style={styles.rowTitle}>
                                  {slot.courtName}
                                </Text>
                                <Text style={styles.rowMeta}>
                                  {slot.weather
                                    ? `${weatherSymbol(slot.weather.icon)} ${fahrenheit(slot.weather.temperatureC)} · `
                                    : ""}
                                  {durationMinutes} minutes
                                </Text>
                              </View>
                              <Text style={styles.bookingSlotPrice}>
                                {slot.price
                                  ? formatMoney(
                                      slot.price.amountMinor,
                                      slot.price.currency,
                                    )
                                  : "Free"}
                              </Text>
                              <View style={styles.bookingCourtActions}>
                                <Pressable
                                  onPress={() => reviewSlot(slot, "host")}
                                  style={styles.bookingHostButton}
                                >
                                  <Text style={styles.bookingHostButtonText}>
                                    Create a Match
                                  </Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => reviewSlot(slot, "private")}
                                  style={styles.bookingPrivateButton}
                                >
                                  <Text style={styles.bookingPrivateButtonText}>
                                    Reserve private
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  ) : (
                    <View style={styles.bookingEmptyCard}>
                      <Text style={styles.rowTitle}>
                        No matching court is open.
                      </Text>
                      <Text style={styles.bodyText}>
                        Create a priority alert and Duna will watch
                        cancellations and newly released inventory.
                      </Text>
                    </View>
                  )}
                  {Boolean(availability?.excludedAfterDarkCount) && (
                    <Text style={styles.bookingDaylightNote}>
                      ☾ {availability?.excludedAfterDarkCount} start
                      {availability?.excludedAfterDarkCount === 1
                        ? ""
                        : "s"}{" "}
                      hidden because this court is not lit after dark.
                    </Text>
                  )}
                  {selectedPlayWindow && (
                    <Pressable
                      disabled={busy || mode === "preview"}
                      onPress={() => void toggleLookingToPlay()}
                      style={[
                        styles.bookingLookingButton,
                        lookingPostId && styles.bookingLookingButtonActive,
                      ]}
                    >
                      <Text style={styles.bookingLookingIcon}>
                        {lookingPostId ? "✓" : "◎"}
                      </Text>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>
                          {lookingPostId
                            ? "You’re looking to play"
                            : "I’m looking to play"}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {lookingPostId
                            ? "Tap to withdraw your availability."
                            : "Let match creators invite you for this time. You choose whether to accept."}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
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
                      {new Date(selectedSlot.startsAt).toLocaleDateString(
                        "en-US",
                        {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </Text>
                    <Text style={styles.bookingReviewTime}>
                      {localSlotTime(selectedSlot.localStartsAt)} –{" "}
                      {localSlotTime(selectedSlot.localEndsAt)}
                    </Text>
                    <Text style={styles.checkoutMeta}>
                      {selectedSlot.courtName} · {durationMinutes} minutes
                    </Text>
                  </View>
                  {bookingIntent === "host" && (
                    <View style={styles.bookingHostIntent}>
                      <Text style={styles.bookingHostIntentIcon}>✦</Text>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>
                          Reserve first, then publish.
                        </Text>
                        <Text style={styles.rowMeta}>
                          Duna carries this confirmed court, time, and venue
                          into the match builder. You choose the format, level,
                          and open spots next.
                        </Text>
                      </View>
                    </View>
                  )}
                  {(bookingIntent === "private" ||
                    bookingIntent === "host") && (
                    <>
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
                            <Text style={styles.rowTitle}>
                              {bookingIntent === "host"
                                ? "Add players to this match"
                                : "Add players"}
                            </Text>
                            <Text style={styles.rowMeta}>
                              Frequent partners first, then everyone on Duna.
                            </Text>
                          </View>
                          <Pressable onPress={() => setShowPlayerPicker(true)}>
                            <Text style={styles.linkText}>Choose players</Text>
                          </Pressable>
                        </View>
                        <Pressable
                          accessibilityLabel="Open player picker"
                          onPress={() => setShowPlayerPicker(true)}
                          style={styles.bookingPlayerPickerLaunch}
                        >
                          <View style={styles.bookingPlayerPickerPlus}>
                            <Text style={styles.bookingPlayerPickerPlusText}>
                              ＋
                            </Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.bookingPlayerPickerTitle}>
                              {selectedDunaPlayers.length
                                ? `${selectedDunaPlayers.length} Duna player${selectedDunaPlayers.length === 1 ? "" : "s"} selected`
                                : "Choose Duna players"}
                            </Text>
                            <Text style={styles.bookingPlayerPickerBody}>
                              Search, review Sand Rating and reliability, then
                              add.
                            </Text>
                          </View>
                          <Text style={styles.chevron}>›</Text>
                        </Pressable>
                        {selectedDunaPlayers.length > 0 && (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.bookingPartnerScroll}
                          >
                            <View style={styles.bookingPartnerRow}>
                              {selectedDunaPlayers.map((person) => (
                                <Pressable
                                  key={person.id}
                                  onPress={() => setShowPlayerPicker(true)}
                                  style={styles.bookingPartner}
                                >
                                  {person.avatarUrl ? (
                                    <Image
                                      source={{ uri: person.avatarUrl }}
                                      style={styles.bookingPartnerImage}
                                    />
                                  ) : (
                                    <Text style={styles.bookingPartnerAvatar}>
                                      {person.initials}
                                    </Text>
                                  )}
                                  <Text
                                    numberOfLines={1}
                                    style={styles.bookingPartnerName}
                                  >
                                    {person.displayName.split(" ")[0]}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>
                        )}
                        <Pressable
                          onPress={() => void importContacts()}
                          style={styles.bookingImportContact}
                        >
                          <Text style={styles.linkText}>
                            Add someone outside Duna from Contacts
                          </Text>
                        </Pressable>
                        {contactOptions.length > 0 && (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.bookingPartnerScroll}
                          >
                            <View style={styles.bookingPartnerRow}>
                              {contactOptions.map((contact) => (
                                <Pressable
                                  key={contact.email ?? contact.phoneE164}
                                  onPress={() => addParticipant(contact)}
                                  style={styles.bookingPartner}
                                >
                                  <Text style={styles.bookingPartnerAvatar}>
                                    {(contact.name ?? "C")
                                      .slice(0, 1)
                                      .toUpperCase()}
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
                        )}
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
                                  current.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                            >
                              <Text style={styles.closeText}>×</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                  {policy && (
                    <View style={styles.checkoutSection}>
                      <Text style={styles.eyebrow}>CANCELLATION POLICY</Text>
                      {policyDocument && (
                        <MobilePolicyReviewCard
                          accepted={policyAccepted}
                          detail={`Refund until ${policy.refundBeforeHours ?? 0} hours before · ${policy.lateCancellation}`}
                          onPress={() => {
                            selectionHaptic();
                            setPolicyReviewOpen(true);
                          }}
                          policy={policyDocument}
                        />
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
                        (paymentMode === "split" &&
                          participants.length === 0) ||
                        !inventory?.venue.paymentsReady) &&
                        styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.payButtonText}>
                      {busy
                        ? "Opening secure checkout…"
                        : bookingIntent === "host"
                          ? paymentMode === "full"
                            ? `Reserve full court · ${formatMoney(totalMinor, "USD")}`
                            : `Reserve your share · ${formatMoney(shareMinor, "USD")}`
                          : `Continue · ${formatMoney(shareMinor, "USD")}`}
                    </Text>
                  </Pressable>
                </>
              )}
              {notice && <Text style={styles.bookingNotice}>{notice}</Text>}
              {error && <Text style={styles.formError}>{error}</Text>}
            </ScrollView>
            <BookingCalendarModal
              availability={availability}
              availabilityLoading={availabilityLoading}
              markers={calendarMarkers}
              maxDate={dateRangeEnd}
              minDate={todayValue}
              onClose={() => setCalendarOpen(false)}
              onExtendRange={extendDateRange}
              onSelect={(date) => {
                if (date === selectedDate) return;
                setAvailabilityLoading(true);
                setSelectedDate(date);
              }}
              selectedDate={selectedDate}
              visible={calendarOpen}
            />
            <PolicyReviewModal
              accepted={policyAccepted}
              onAccept={() => {
                setPolicyRead(true);
                setPolicyAccepted(true);
                setPolicyReviewOpen(false);
              }}
              onClose={() => setPolicyReviewOpen(false)}
              policy={policyDocument}
              read={policyRead}
              visible={policyReviewOpen}
            />
          </>
        )}
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
          onPlaced={async () => {
            await refresh();
            const target = selectedMarket.target;
            if (
              target.kind === "pro-match" &&
              Platform.OS === "ios" &&
              followedMatchId !== target.matchId
            ) {
              const match = event?.matches.find(
                (candidate) => candidate.id === target.matchId,
              );
              if (match && match.status !== "completed") {
                await followMatch(match);
              }
            }
          }}
          target={selectedMarket.target}
          wallet={predictionWallet}
        />
      )}
    </>
  );
}

function FollowPlayerCard({ player }: { readonly player: PersonSummary }) {
  const { client, mode } = usePlayerRuntime();
  const { openPlayerProfile } = usePlayerProfileNavigation();
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

  const toggleFollow = async () => {
    if (busy) return;
    selectionHaptic();
    setBusy(true);
    setError(undefined);
    try {
      if (client && mode === "live") {
        await client.player.setPlayerFollow.mutate({
          playerPersonId: player.id,
          following: !following,
          notifyRegistrations: !following,
          notifyWatch: !following,
          notifyResults: !following,
          idempotencyKey: Crypto.randomUUID(),
        });
      }
      if (!following) {
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
      }
      setFollowing((current) => !current);
      successHaptic();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.playerFollowCard}>
      <Pressable
        accessibilityLabel={`Open ${player.displayName}'s profile`}
        onPress={() => openPlayerProfile(player)}
      >
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
          {player.isProfessional ? "PRO · " : ""}
          {player.homeMarket} · {player.rating.display.toFixed(2)}
        </Text>
        <Text style={styles.playerFollowProfileLink}>View profile</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={
          following
            ? `Following ${player.displayName}`
            : `Follow ${player.displayName}`
        }
        disabled={busy}
        onPress={() => void toggleFollow()}
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
          {busy ? "Updating…" : following ? "Following" : "+ Follow"}
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
  onOrganization,
}: {
  readonly intent?: {
    readonly key: number;
    readonly kind: Exclude<HomeQuickAction, "record-video" | "upload-score">;
  };
  readonly onBook: (eventIndex: number) => void;
  readonly onOrganization: (slug: string) => void;
}) {
  const { theme } = useContext(ThemeContext);
  const [filter, setFilter] = useState("For you");
  const [bookingVenueId, setBookingVenueId] = useState<string>();
  const [hostSeed, setHostSeed] = useState<HostedMatchSeed>();
  const [selectedCoach, setSelectedCoach] = useState<MobileCoach>();
  const [showProTour, setShowProTour] = useState(false);
  const [showDiscoveryMap, setShowDiscoveryMap] = useState(false);
  const [showDiscoverySearch, setShowDiscoverySearch] = useState(false);
  const [showSearchedMap, setShowSearchedMap] = useState(false);
  const [discoverySearchResult, setDiscoverySearchResult] =
    useState<DiscoverySearchResult>();
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
    settings,
    venues,
  } = usePlayerRuntime();
  const events = dashboard?.events ?? demoEvents;
  useEffect(() => {
    if (!intent) return;
    setShowDiscoverySearch(false);
    if (intent.kind === "search") {
      setShowDiscoverySearch(true);
      return;
    }
    if (intent.kind === "watch-pros") {
      setShowProTour(true);
      return;
    }
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
  const matchingCoaches = [...(coaches ?? [])].sort(
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
      const cover = event.media?.[0];
      const fallbackImageUrl = `${dunaWebUrl}${
        defaultEventMedia(event.kind, event.id).path
      }`;
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
        imageUrl:
          cover?.kind === "video"
            ? (cover.posterUrl ?? event.imageUrl ?? fallbackImageUrl)
            : (cover?.url ?? event.imageUrl ?? fallbackImageUrl),
        videoUrl: cover?.kind === "video" ? cover.url : undefined,
        live: event.live,
        spotsRemaining: event.spotsRemaining,
        level: event.ratingRange
          ? `${event.ratingRange[0]}–${event.ratingRange[1]}`
          : undefined,
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
    const organizationItems = [
      ...new Map(
        (coaches ?? []).map((coach) => {
          const venue = (venues ?? []).find(
            (candidate) => candidate.organizationId === coach.organizationId,
          );
          return [
            coach.organizationId,
            {
              id: `organization:${coach.organizationId}:${coach.organizationSlug}`,
              entityType: "organization" as const,
              kind: "club",
              title: coach.organizationName,
              subtitle: coach.homeMarket ?? "Club, coaching, and events",
              href: `/clubs/${coach.organizationSlug}`,
              latitude: venue?.latitude,
              longitude: venue?.longitude,
              organizationId: coach.organizationId,
              imageUrl: coach.avatarUrl,
              tags: [
                "organization",
                "club",
                coach.organizationName,
                coach.organizationSlug,
                coach.homeMarket ?? "",
              ],
            } satisfies DiscoveryMapItem,
          ] as const;
        }),
      ).values(),
    ];
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
        imageUrl: event.poster?.url,
        imageFit: event.poster?.kind === "poster" ? "contain" : undefined,
        live: event.live,
        tags: ["pro tour", event.tour, event.source, event.location ?? ""],
      }))
      .filter((event) => {
        if (!event.endsAt) return true;
        const timestamp = Date.parse(event.endsAt);
        return Number.isNaN(timestamp) || timestamp >= Date.now();
      });
    const matchItems = (proCoverage?.matches ?? [])
      .filter(
        (match) => match.status === "live" || match.status === "scheduled",
      )
      .slice(0, 100)
      .map<DiscoveryMapItem>((match) => {
        const event = proCoverage?.events.find(
          (candidate) => candidate.externalEventId === match.externalEventId,
        );
        return {
          id: `match:${match.id}`,
          entityType: "match",
          kind: "match",
          title: `${match.teamA.label} vs ${match.teamB.label}`,
          subtitle: `${match.roundLabel ?? "Match"} · ${event?.name ?? match.tour ?? "Pro tour"}`,
          href:
            match.canonicalPath ??
            (event ? `/events/${event.slug}` : "/discover"),
          latitude: event?.venue?.latitude,
          longitude: event?.venue?.longitude,
          startsAt: match.scheduledAt ?? match.playedAt,
          imageUrl: event?.poster?.url,
          live: match.status === "live",
          tags: [
            "match",
            match.teamA.label,
            match.teamB.label,
            event?.name ?? "",
          ],
        };
      });
    return [
      ...organizationItems,
      ...venueItems,
      ...eventItems,
      ...coachItems,
      ...matchItems,
      ...proItems,
    ];
  }, [
    coaches,
    discoveryMap?.items,
    discoverableEvents,
    proCoverage?.events,
    proCoverage?.matches,
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
    if (item.entityType === "organization") {
      const slug =
        item.href.match(/^\/clubs\/([^/?#]+)/)?.[1] ??
        item.id.split(":").at(-1);
      if (slug) {
        onOrganization(decodeURIComponent(slug));
        return;
      }
    }
    if (item.entityType === "match") {
      const slug = item.href.match(/^\/events\/([^/?#]+)/)?.[1];
      if (slug) {
        setSelectedProTourSlug(decodeURIComponent(slug));
        setShowProTour(true);
        return;
      }
    }
    if (item.entityType === "pro-tour") {
      const slug = item.href.match(/^\/events\/([^/?#]+)/)?.[1];
      if (slug) setSelectedProTourSlug(decodeURIComponent(slug));
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
        <Pressable
          accessibilityLabel="Search by place, date, and type of play"
          accessibilityRole="button"
          onPress={() => {
            selectionHaptic();
            setShowDiscoverySearch(true);
          }}
          style={({ pressed }) => [
            styles.discoverSearchPrimary,
            pressed && styles.proMobilePressed,
          ]}
        >
          <View style={styles.discoverSearchIconWrap}>
            <Text style={styles.discoverSearchIcon}>⌕</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.discoverSearchEyebrow}>SEARCH</Text>
            <Text style={styles.discoverSearchTitle}>Where, when, what?</Text>
            <Text numberOfLines={1} style={styles.discoverSearchMeta}>
              {discoverySearchResult
                ? `${discoverySearchResult.criteria.location.label} · ${discoveryWhenLabel(
                    discoverySearchResult.criteria.when,
                  )} · ${discoveryWhatLabel(
                    discoverySearchResult.criteria.what,
                  )}`
                : `${discoverLocation ? "Near you" : "Anywhere"} · Flexible · For You`}
            </Text>
          </View>
          <Text style={styles.discoverSearchArrow}>→</Text>
        </Pressable>
        <MemberOrganizationCard />
        <Pressable
          onPress={() => {
            selectionHaptic();
            setShowProTour(true);
          }}
          style={styles.proTourEntry}
        >
          <View style={styles.flex}>
            <Text style={styles.proTourEntryEyebrow}>WATCH + FOLLOW</Text>
            <Text style={styles.proTourEntryTitle}>Pro Tour</Text>
            <Text style={styles.proTourEntryMeta}>
              Pools, real brackets, and predictions.
            </Text>
            <View style={styles.proTourEntryBrands}>
              <ProTourBrandMark compact source="fivb" />
              <ProTourBrandMark compact source="avp" />
              {proCoverage?.events.some((event) => event.live) ? (
                <Text style={styles.proTourEntryLive}>● LIVE</Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.proTourEntryArrow}>›</Text>
        </Pressable>
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
          onOpen={() => {
            setShowSearchedMap(false);
            setShowDiscoveryMap(true);
          }}
          theme={theme}
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
        items={
          showSearchedMap && discoverySearchResult
            ? discoverySearchResult.items
            : locationSortedDiscoveryItems
        }
        onClose={() => setShowDiscoveryMap(false)}
        onSearch={() => {
          setShowDiscoveryMap(false);
          setShowDiscoverySearch(true);
        }}
        onSelect={openDiscoveryItem}
        origin={
          showSearchedMap ? discoverySearchResult?.origin : discoverLocation
        }
        radiusMiles={
          showSearchedMap ? discoverySearchResult?.radiusMiles : undefined
        }
        resultSummary={
          showSearchedMap && discoverySearchResult
            ? discoveryResultSummary(discoverySearchResult)
            : undefined
        }
        searchLabel={
          showSearchedMap && discoverySearchResult
            ? `${discoverySearchResult.criteria.location.label} · ${discoveryWhenLabel(
                discoverySearchResult.criteria.when,
              )}`
            : "Search Duna"
        }
        measurementSystem={settings?.profile.measurementSystem ?? "imperial"}
        theme={theme}
        visible={showDiscoveryMap}
      />
      <DiscoverySearchFlow
        currentLocation={discoverLocation}
        initialCriteria={discoverySearchResult?.criteria}
        items={locationSortedDiscoveryItems}
        onClose={() => setShowDiscoverySearch(false)}
        onSubmit={(result) => {
          setDiscoverySearchResult(result);
          setShowDiscoverySearch(false);
          setShowSearchedMap(true);
          setShowDiscoveryMap(true);
        }}
        theme={theme}
        visible={showDiscoverySearch}
      />
      <VenueBookingModal
        onClose={() => setBookingVenueId(undefined)}
        onHostReady={(seed) => {
          setBookingVenueId(undefined);
          setTimeout(() => setHostSeed(seed), 280);
        }}
        onOpenMatch={(matchId, matchSlug) => {
          const eventIndex = events.findIndex((event) => event.id === matchId);
          setBookingVenueId(undefined);
          setTimeout(() => {
            if (eventIndex >= 0) {
              onBook(eventIndex);
              return;
            }
            void WebBrowser.openBrowserAsync(
              `${dunaWebUrl}/events/${encodeURIComponent(matchSlug)}`,
            );
          }, 280);
        }}
        venueId={bookingVenueId}
        visible={Boolean(bookingVenueId)}
      />
      <PickupModal
        initialCourtBooking={hostSeed}
        onClose={() => setHostSeed(undefined)}
        onCreated={() => setHostSeed(undefined)}
        visible={Boolean(hostSeed)}
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

function PlayLauncherScreen({
  onAction,
}: {
  readonly onAction: (action: HomeQuickAction) => void;
}) {
  const actions: readonly {
    readonly key: HomeQuickAction;
    readonly icon: string;
    readonly title: string;
    readonly detail: string;
  }[] = [
    {
      key: "upload-score",
      icon: "↥",
      title: "Upload a Score",
      detail: "Add a result and update your record",
    },
    {
      key: "find-match",
      icon: "⌖",
      title: "Find a Match / Session",
      detail: "See open play and training near you",
    },
    {
      key: "book-court",
      icon: "▦",
      title: "Book a Court",
      detail: "Find live court availability",
    },
    {
      key: "join-event",
      icon: "✦",
      title: "Join an Event",
      detail: "Tournaments, clinics, and community play",
    },
    {
      key: "record-video",
      icon: "●",
      title: "Record a Video",
      detail: "Open Duna Vision",
    },
    {
      key: "watch-pros",
      icon: "▶",
      title: "Watch the Pros",
      detail: "Live coverage, events, and matches",
    },
    {
      key: "search",
      icon: "⌕",
      title: "Search",
      detail: "Choose where, when, and what",
    },
  ];
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="QUICK ACTIONS" />
      <Text style={styles.displayTitle}>What do you want to play?</Text>
      <Text style={styles.playLauncherIntro}>
        Start a score, find something nearby, book a court, or jump into Duna
        Vision and Pro coverage.
      </Text>
      <View style={styles.playLauncherGrid}>
        {actions.map((action) => (
          <Pressable
            accessibilityHint={action.detail}
            accessibilityRole="button"
            key={action.key}
            onPress={() => {
              selectionHaptic();
              onAction(action.key);
            }}
            style={({ pressed }) => [
              styles.playLauncherAction,
              pressed && styles.homeQuickActionPressed,
            ]}
          >
            <View style={styles.playLauncherIcon}>
              <Text style={styles.playLauncherIconText}>{action.icon}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.playLauncherTitle}>{action.title}</Text>
              <Text style={styles.playLauncherDetail}>{action.detail}</Text>
            </View>
            <Text style={styles.playLauncherArrow}>›</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function PlansScreen({
  onBook,
  onOpenBooking,
  onReserveCourtVenue,
}: {
  readonly onBook: (eventIndex: number) => void;
  readonly onOpenBooking: (bookingId: string) => void;
  readonly onReserveCourtVenue: (request: CourtBookingRequest) => void;
}) {
  const { dashboard } = usePlayerRuntime();
  const bookings = dashboard?.bookings ?? demoBookings;
  const events = dashboard?.events ?? demoEvents;
  const [showHost, setShowHost] = useState(false);
  const [hostedTitle, setHostedTitle] = useState<string>();
  const [calendarDate, setCalendarDate] = useState<Date>();
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader eyebrow="YOUR CALENDAR + COMMUNITY" />
        <View style={styles.homeGreeting}>
          <Text style={styles.displayTitle}>Plans.</Text>
          <Pressable
            onPress={() => setShowHost(true)}
            style={styles.scoreAction}
          >
            <Text style={styles.scoreActionText}>＋ Create a Match</Text>
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
              <Text style={styles.eyebrow}>ALL UPCOMING ACTIVITY</Text>
              <Text style={styles.cardTitle}>Your plans</Text>
            </View>
            <Pressable
              accessibilityLabel="Open full calendar"
              onPress={() => {
                setCalendarDate(today);
                setShowCalendar(true);
              }}
              style={styles.calendarOpenAction}
            >
              <Text style={styles.sectionAction}>See calendar →</Text>
            </Pressable>
          </View>
          {bookings.map((booking, index) => (
            <Pressable
              accessibilityLabel={"Open " + booking.title}
              key={booking.id}
              onPress={() => onOpenBooking(booking.id)}
              style={styles.bookingRow}
            >
              <View style={styles.bookingTime}>
                <Text style={styles.bookingDateLabel}>
                  {new Date(booking.startsAt)
                    .toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })
                    .toUpperCase()}
                </Text>
                <Text style={styles.bookingTimeMain}>
                  {new Date(booking.startsAt)
                    .toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })
                    .replace(/\s[AP]M$/, "")}
                </Text>
                <Text style={styles.bookingTimeSuffix}>
                  {new Date(booking.startsAt)
                    .toLocaleTimeString("en-US", {
                      hour: "numeric",
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })
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
            </Pressable>
          ))}
        </View>
        <SectionHeader
          eyebrow="HOSTED MATCHES NEARBY"
          title="Jump into something."
          action="See all"
        />
        <View style={styles.listCard}>
          {events
            .filter(
              (event) => event.kind === "pickup" || event.kind === "open-play",
            )
            .map((event) => (
              <Pressable
                key={event.id}
                onPress={() => onBook(events.indexOf(event))}
                style={styles.pickupRow}
              >
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
              </Pressable>
            ))}
        </View>
        <View style={styles.hostCard}>
          <View style={styles.hostMark}>
            <Text style={styles.hostMarkText}>＋</Text>
          </View>
          <Text style={styles.sectionTitle}>Your court. Your people.</Text>
          <Text style={styles.bodyText}>
            Create a match with a clear time, format, level, and cost to join.
            Add your partner now or leave spots open for nearby players.
          </Text>
          <Pressable
            onPress={() => setShowHost(true)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Create a Match</Text>
          </Pressable>
        </View>
      </ScrollView>
      <PickupModal
        onClose={() => setShowHost(false)}
        onCreated={(title) => {
          setHostedTitle(title);
          setShowHost(false);
        }}
        onReserveCourtVenue={(request) => {
          setShowHost(false);
          onReserveCourtVenue(request);
        }}
        visible={showHost}
      />
      <PlayerCalendarModal
        bookings={bookings}
        initialDate={calendarDate}
        onClose={() => setShowCalendar(false)}
        onOpenBooking={(bookingId) => {
          setShowCalendar(false);
          onOpenBooking(bookingId);
        }}
        visible={showCalendar}
      />
    </>
  );
}

function formatPredictionCredits(value: number, signed = false) {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}`;
}

function openPredictionMarket(marketPath: string) {
  selectionHaptic();
  void WebBrowser.openBrowserAsync(`${dunaWebUrl}${marketPath}`);
}

function MobilePredictionDiscoveryRail({
  items,
  onOpenPortfolio,
}: {
  readonly items: readonly MobilePredictionDiscoveryItem[];
  readonly onOpenPortfolio: () => void;
}) {
  if (!items.length) return null;
  return (
    <>
      <SectionHeader
        action="Your portfolio"
        eyebrow="PREDICTIONS"
        onAction={onOpenPortfolio}
        title="What happens next?"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalBleed}
      >
        <View style={styles.predictionDiscoveryRail}>
          {items.slice(0, 6).map((item) => {
            const market = item.market;
            const determined = market.status === "settled";
            return (
              <Pressable
                accessibilityHint="Opens the prediction market"
                accessibilityLabel={`${item.competition}: ${market.title}`}
                accessibilityRole="button"
                key={`${market.subjectType}-${market.subjectId}`}
                onPress={() => openPredictionMarket(item.marketPath)}
                style={({ pressed }) => [
                  styles.predictionDiscoveryCard,
                  pressed && styles.predictionDiscoveryCardPressed,
                ]}
              >
                <View style={styles.predictionDiscoveryTopline}>
                  <Text
                    numberOfLines={1}
                    style={styles.predictionDiscoveryCompetition}
                  >
                    {item.competition.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.predictionDiscoveryState,
                      determined && styles.predictionDiscoveryStateDetermined,
                    ]}
                  >
                    {determined
                      ? "DETERMINED"
                      : item.relevance === "live-pro"
                        ? "LIVE"
                        : "OPEN"}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.predictionDiscoveryTitle}>
                  {market.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={styles.predictionDiscoveryReason}
                >
                  {item.reason}
                </Text>
                <View style={styles.predictionDiscoveryOdds}>
                  <View style={styles.predictionDiscoveryOutcome}>
                    <Text
                      numberOfLines={1}
                      style={styles.predictionDiscoveryOutcomeLabel}
                    >
                      {market.yesLabel}
                    </Text>
                    <Text style={styles.predictionDiscoveryOutcomeValue}>
                      {(market.yesPriceBps / 100).toFixed(0)}%
                    </Text>
                  </View>
                  <View style={styles.predictionDiscoveryOutcome}>
                    <Text
                      numberOfLines={1}
                      style={styles.predictionDiscoveryOutcomeLabel}
                    >
                      {market.noLabel}
                    </Text>
                    <Text style={styles.predictionDiscoveryOutcomeValueMuted}>
                      {(market.noPriceBps / 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
                <View style={styles.predictionDiscoveryFooter}>
                  <Text
                    numberOfLines={1}
                    style={styles.predictionDiscoveryHandles}
                  >
                    {market.predictors.length
                      ? market.predictors
                          .slice(0, 3)
                          .map((predictor) => `@${predictor.handle}`)
                          .join("  ")
                      : "Be first to predict"}
                  </Text>
                  <Text style={styles.predictionDiscoveryArrow}>→</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

function PredictionWalletSummaryCard({
  onPress,
}: {
  readonly onPress: () => void;
}) {
  const { predictionWallet } = usePlayerRuntime();
  const portfolio = predictionWallet?.portfolio;
  return (
    <Pressable
      accessibilityHint="Opens your prediction portfolio and history"
      accessibilityLabel="Open prediction credits"
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.predictionWalletCard,
        pressed && styles.predictionDiscoveryCardPressed,
      ]}
    >
      <View style={styles.predictionWalletHeader}>
        <View>
          <Text style={styles.eyebrow}>WALLET · PREDICTIONS</Text>
          <Text style={styles.predictionWalletBalance}>
            {Math.floor(
              predictionWallet?.availableCredits ?? 1_000,
            ).toLocaleString("en-US")}
          </Text>
          <Text style={styles.predictionWalletCreditLabel}>
            FREE CREDITS AVAILABLE
          </Text>
        </View>
        <View style={styles.predictionWalletCoin}>
          <Text style={styles.predictionWalletCoinText}>◇</Text>
        </View>
      </View>
      <Text style={styles.predictionWalletBody}>
        Build a portfolio around matches and teams you care about. Credits are
        free, non-cash, and never redeemable.
      </Text>
      <View style={styles.predictionWalletFacts}>
        <View>
          <Text style={styles.predictionWalletFactValue}>
            {portfolio?.openPositions ?? 0}
          </Text>
          <Text style={styles.predictionWalletFactLabel}>OPEN</Text>
        </View>
        <View>
          <Text style={styles.predictionWalletFactValue}>
            {portfolio?.wins ?? 0}–{portfolio?.losses ?? 0}
          </Text>
          <Text style={styles.predictionWalletFactLabel}>RECORD</Text>
        </View>
        <View>
          <Text
            style={[
              styles.predictionWalletFactValue,
              (portfolio?.netSettledCredits ?? 0) >= 0
                ? styles.positiveText
                : styles.negativeText,
            ]}
          >
            {formatPredictionCredits(portfolio?.netSettledCredits ?? 0, true)}
          </Text>
          <Text style={styles.predictionWalletFactLabel}>SETTLED</Text>
        </View>
        <Text style={styles.predictionWalletOpen}>OPEN →</Text>
      </View>
    </Pressable>
  );
}

function WalletScreen({ onClose }: { readonly onClose: () => void }) {
  const { client, memberCard, mode, organizationWallets, settings, wallet } =
    usePlayerRuntime();
  const entries = wallet?.entries ?? demoWalletEntries;
  const balance =
    wallet?.availableMinor ??
    entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0);
  const appleWalletReady =
    Platform.OS === "ios" &&
    mode === "live" &&
    Boolean(client) &&
    memberCard?.walletStatus === "available";
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.walletCloseRow}>
        <Pressable
          accessibilityLabel="Close wallet and return to profile"
          onPress={onClose}
          style={styles.walletCloseButton}
        >
          <Text style={styles.walletCloseText}>×</Text>
        </Pressable>
      </View>
      <AppHeader eyebrow="MEMBERSHIP + STRIPE-MANAGED BALANCE" />
      <Text style={styles.displayTitle}>Wallet.</Text>
      {memberCard && (
        <View style={styles.memberCard}>
          <View pointerEvents="none" style={styles.memberCardGlowOne} />
          <View pointerEvents="none" style={styles.memberCardGlowTwo} />
          <View pointerEvents="none" style={styles.memberCardTexture} />
          <View style={styles.walletTop}>
            <DunaWordmark tone="light" />
            <Pill tone="positive">Member</Pill>
          </View>
          <Text style={styles.memberCardLabel}>DUNA MEMBERSHIP</Text>
          <Text style={styles.memberCardName}>{memberCard.holderName}</Text>
          <View style={styles.memberCardBody}>
            <View style={styles.memberCardQr}>
              <QRCode
                backgroundColor="#ffffff"
                color="#123640"
                quietZone={5}
                size={118}
                value={memberCard.credentialPayload}
              />
            </View>
            <View style={styles.memberCardDetails}>
              <Text style={styles.memberCardDetailLabel}>MEMBER ID</Text>
              <Text selectable style={styles.memberCardId}>
                {memberCard.memberId}
              </Text>
              <Text style={styles.memberCardDetailLabel}>
                UNIVERSAL CHECK-IN
              </Text>
              <Text style={styles.memberCardMeta}>
                Use this QR for any event, match, or court reservation where you
                are confirmed.
              </Text>
            </View>
          </View>
          {memberCard.upcoming[0] && (
            <View style={styles.memberCardUpcoming}>
              <View style={styles.flex}>
                <Text style={styles.memberCardDetailLabel}>UP NEXT</Text>
                <Text style={styles.memberCardUpcomingTitle}>
                  {memberCard.upcoming[0].title}
                </Text>
                <Text style={styles.memberCardMeta}>
                  {new Date(memberCard.upcoming[0].startsAt).toLocaleString(
                    "en-US",
                    {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}{" "}
                  · {memberCard.upcoming[0].venueName}
                </Text>
              </View>
              <Text style={styles.memberCardUpcomingArrow}>›</Text>
            </View>
          )}
          <Pressable
            disabled={!appleWalletReady}
            onPress={() => {
              if (!client) return;
              void client.player.memberCard
                .query()
                .then((fresh) =>
                  fresh.walletPassPath
                    ? Linking.openURL(`${dunaWebUrl}${fresh.walletPassPath}`)
                    : undefined,
                );
            }}
            style={[
              styles.memberCardWalletButton,
              !appleWalletReady && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.memberCardWalletButtonText}>
              {Platform.OS !== "ios"
                ? "Open Duna on iPhone to add to Apple Wallet"
                : memberCard.walletStatus === "available"
                  ? "Add Duna Membership to Apple Wallet"
                  : "Apple Wallet setup is being completed"}
            </Text>
          </Pressable>
          <View style={styles.walletWave} />
        </View>
      )}
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
      {organizationWallets && organizationWallets.length > 0 && (
        <>
          <SectionHeader
            action={`${organizationWallets.length} relationships`}
            eyebrow="CLUBS + COACHES"
            title="Memberships + credits."
          />
          <View style={styles.listCard}>
            {organizationWallets.map((organization) => (
              <View key={organization.organizationId} style={styles.walletRow}>
                <View style={styles.moneyDirection}>
                  <Text style={{ color: colors.aqua }}>
                    {organization.organizationName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    {organization.organizationName}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {organization.membershipName ??
                      organization.membershipStatus ??
                      "Player relationship"}
                  </Text>
                </View>
                <Text style={styles.moneyAmount}>
                  {organization.credits.toLocaleString("en-US")} credits
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      <SectionHeader
        eyebrow="YOUR MONEY ON SAND"
        title="Activity."
        action="View full"
        onAction={() =>
          void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/wallet`)
        }
      />
      <View style={styles.listCard}>
        {entries.slice(0, 10).map((entry) => (
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

function PredictionPositionRow({
  position,
}: {
  readonly position: MobilePredictionPosition;
}) {
  const determined = position.status !== "open";
  const statusLabel =
    position.status === "open"
      ? position.marketStatus === "locked"
        ? "Locked"
        : "Open"
      : position.status === "won"
        ? "Won"
        : position.status === "lost"
          ? "Lost"
          : "Void";
  return (
    <Pressable
      accessibilityHint="Opens the market detail"
      accessibilityLabel={`${position.title}, ${statusLabel}`}
      accessibilityRole="button"
      onPress={() => openPredictionMarket(position.marketPath)}
      style={({ pressed }) => [
        styles.predictionPortfolioRow,
        pressed && styles.predictionDiscoveryCardPressed,
      ]}
    >
      <View style={styles.flex}>
        <View style={styles.predictionPortfolioRowTopline}>
          <Text numberOfLines={1} style={styles.predictionPortfolioRowTitle}>
            {position.title}
          </Text>
          <Text
            style={[
              styles.predictionPortfolioStatus,
              position.status === "won" && styles.predictionPortfolioStatusWon,
              position.status === "lost" &&
                styles.predictionPortfolioStatusLost,
            ]}
          >
            {determined
              ? `DETERMINED · ${statusLabel.toUpperCase()}`
              : statusLabel.toUpperCase()}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.predictionPortfolioSelection}>
          {position.selectedLabel} · {formatPredictionCredits(position.shares)}{" "}
          shares
        </Text>
        <View style={styles.predictionPortfolioNumbers}>
          <View>
            <Text style={styles.predictionPortfolioNumberLabel}>COMMITTED</Text>
            <Text style={styles.predictionPortfolioNumberValue}>
              {formatPredictionCredits(position.costCredits)}
            </Text>
          </View>
          <View>
            <Text style={styles.predictionPortfolioNumberLabel}>
              {determined ? "PAYOUT" : "VALUE"}
            </Text>
            <Text style={styles.predictionPortfolioNumberValue}>
              {formatPredictionCredits(
                determined
                  ? position.payoutCredits
                  : position.currentValueCredits,
              )}
            </Text>
          </View>
          <View>
            <Text style={styles.predictionPortfolioNumberLabel}>NET</Text>
            <Text
              style={[
                styles.predictionPortfolioNumberValue,
                position.netCredits >= 0
                  ? styles.positiveText
                  : styles.negativeText,
              ]}
            >
              {formatPredictionCredits(position.netCredits, true)}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function PredictionPortfolioScreen({
  onBack,
}: {
  readonly onBack: () => void;
}) {
  const { predictionDiscovery, predictionWallet } = usePlayerRuntime();
  const positions = predictionWallet?.positions ?? [];
  const openPositions = positions.filter(
    (position) => position.status === "open",
  );
  const determinedPositions = positions.filter(
    (position) => position.status !== "open",
  );
  const portfolio = predictionWallet?.portfolio;
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="WALLET · PREDICTIONS" />
      <Pressable
        accessibilityLabel="Back to wallet"
        accessibilityRole="button"
        onPress={() => {
          selectionHaptic();
          onBack();
        }}
        style={styles.predictionPortfolioBack}
      >
        <Text style={styles.predictionPortfolioBackText}>← Wallet</Text>
      </Pressable>
      <Text style={styles.displayTitle}>Your calls.</Text>
      <Text style={styles.predictionPortfolioIntro}>
        Follow every open position, closed order, win, and loss. Your handle is
        visible in each market because prediction credits have no cash value.
      </Text>

      <View style={styles.predictionPortfolioHero}>
        <View style={styles.predictionPortfolioHeroTop}>
          <View>
            <Text style={styles.predictionPortfolioHeroLabel}>AVAILABLE</Text>
            <Text style={styles.predictionPortfolioHeroValue}>
              {Math.floor(
                predictionWallet?.availableCredits ?? 1_000,
              ).toLocaleString("en-US")}
            </Text>
            <Text style={styles.predictionPortfolioHeroUnit}>
              prediction credits
            </Text>
          </View>
          <View style={styles.predictionWalletCoin}>
            <Text style={styles.predictionWalletCoinText}>◇</Text>
          </View>
        </View>
        <View style={styles.predictionPortfolioMetrics}>
          <View style={styles.predictionPortfolioMetric}>
            <Text style={styles.predictionPortfolioMetricValue}>
              {formatPredictionCredits(portfolio?.currentValueCredits ?? 0)}
            </Text>
            <Text style={styles.predictionPortfolioMetricLabel}>
              OPEN VALUE
            </Text>
          </View>
          <View style={styles.predictionPortfolioMetric}>
            <Text
              style={[
                styles.predictionPortfolioMetricValue,
                (portfolio?.unrealizedCredits ?? 0) >= 0
                  ? styles.positiveText
                  : styles.negativeText,
              ]}
            >
              {formatPredictionCredits(portfolio?.unrealizedCredits ?? 0, true)}
            </Text>
            <Text style={styles.predictionPortfolioMetricLabel}>OPEN NET</Text>
          </View>
          <View style={styles.predictionPortfolioMetric}>
            <Text
              style={[
                styles.predictionPortfolioMetricValue,
                (portfolio?.netSettledCredits ?? 0) >= 0
                  ? styles.positiveText
                  : styles.negativeText,
              ]}
            >
              {formatPredictionCredits(portfolio?.netSettledCredits ?? 0, true)}
            </Text>
            <Text style={styles.predictionPortfolioMetricLabel}>
              SETTLED NET
            </Text>
          </View>
        </View>
        <Text style={styles.predictionPortfolioGrant}>
          +{predictionWallet?.nextMonthlyGrantCredits ?? 100} monthly grant ·
          free play only
        </Text>
      </View>

      <MobilePredictionDiscoveryRail
        items={predictionDiscovery?.items ?? []}
        onOpenPortfolio={() => undefined}
      />

      <SectionHeader
        action={`${openPositions.length} positions`}
        eyebrow="PORTFOLIO"
        title="Still in play."
      />
      <View style={styles.predictionPortfolioList}>
        {openPositions.length ? (
          openPositions.map((position) => (
            <PredictionPositionRow key={position.id} position={position} />
          ))
        ) : (
          <View style={styles.predictionPortfolioEmpty}>
            <Text style={styles.predictionPortfolioEmptyMark}>◇</Text>
            <Text style={styles.predictionPortfolioEmptyTitle}>
              No open positions yet.
            </Text>
            <Text style={styles.predictionPortfolioEmptyBody}>
              Choose an open market above and make a call with free credits.
            </Text>
          </View>
        )}
      </View>

      <SectionHeader
        action={`${portfolio?.wins ?? 0}W · ${portfolio?.losses ?? 0}L`}
        eyebrow="DETERMINED"
        title="Wins + losses."
      />
      <View style={styles.predictionPortfolioList}>
        {determinedPositions.length ? (
          determinedPositions.map((position) => (
            <PredictionPositionRow key={position.id} position={position} />
          ))
        ) : (
          <View style={styles.predictionPortfolioEmptyCompact}>
            <Text style={styles.predictionPortfolioEmptyBody}>
              Completed markets will land here with their final payout and net
              credit result.
            </Text>
          </View>
        )}
      </View>

      {(predictionWallet?.openOrders.length ?? 0) > 0 && (
        <>
          <SectionHeader
            eyebrow="ORDER BOOK"
            title="Waiting to fill."
            action={`${predictionWallet?.openOrders.length ?? 0} open`}
          />
          <View style={styles.predictionPortfolioList}>
            {predictionWallet?.openOrders.map((order) => (
              <Pressable
                key={order.id}
                onPress={() => openPredictionMarket(order.marketPath)}
                style={styles.predictionPortfolioLedgerRow}
              >
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {order.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    {order.intent.toUpperCase()} {order.selectedLabel} ·{" "}
                    {formatPredictionCredits(order.openShares)} shares open
                  </Text>
                </View>
                <Text style={styles.predictionPortfolioLedgerValue}>
                  {(order.limitPriceBps / 100).toFixed(0)}%
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <SectionHeader eyebrow="CREDIT LEDGER" title="Every movement." />
      <View style={styles.predictionPortfolioList}>
        {(predictionWallet?.activity.length ?? 0) ? (
          predictionWallet?.activity.slice(0, 30).map((entry) => (
            <Pressable
              disabled={!entry.marketPath}
              key={entry.id}
              onPress={() =>
                entry.marketPath && openPredictionMarket(entry.marketPath)
              }
              style={styles.predictionPortfolioLedgerRow}
            >
              <View style={styles.flex}>
                <Text numberOfLines={2} style={styles.rowTitle}>
                  {entry.note}
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(entry.occurredAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {entry.kind.replaceAll("-", " ")}
                </Text>
              </View>
              <Text
                style={[
                  styles.predictionPortfolioLedgerValue,
                  entry.deltaCredits >= 0
                    ? styles.positiveText
                    : styles.negativeText,
                ]}
              >
                {formatPredictionCredits(entry.deltaCredits, true)}
              </Text>
            </Pressable>
          ))
        ) : (
          <View style={styles.predictionPortfolioEmptyCompact}>
            <Text style={styles.predictionPortfolioEmptyBody}>
              Your immutable credit ledger will appear here.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.predictionPortfolioTrust}>
        <Text style={styles.predictionPortfolioTrustMark}>✓</Text>
        <View style={styles.flex}>
          <Text style={styles.predictionPortfolioTrustTitle}>
            Free play, transparent by design.
          </Text>
          <Text style={styles.predictionPortfolioTrustBody}>
            Credits cannot be bought, transferred, redeemed, or exchanged for
            cash or prizes. Determined markets close all remaining orders before
            payouts are posted to the ledger.
          </Text>
        </View>
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
  participantProfiles,
}: {
  readonly match: MobilePerformanceMatch;
  readonly personId: string;
  readonly participantProfiles: readonly MobilePerformanceParticipantProfile[];
}) {
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      reveal.setValue(1);
      return;
    }
    Animated.timing(reveal, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, reveal]);
  const result = match.actualResult >= 0.5 ? "W" : "L";
  const sides = matchSides(match, personId);
  const expected = Math.round(match.expectedWinProbability * 100);
  const ownSide = match.participants.find(
    (participant) => participant.personId === personId,
  )?.side;
  const profileById = new Map(
    participantProfiles.map((profile) => [profile.id, profile]),
  );
  const sidePlayers = (side: "A" | "B") =>
    match.participants.filter((participant) => participant.side === side);
  const winningSide = ownSide
    ? result === "W"
      ? ownSide
      : ownSide === "A"
        ? "B"
        : "A"
    : undefined;
  return (
    <Pressable
      accessibilityHint="Expands the native match breakdown"
      accessibilityLabel={`${result === "W" ? "Win" : "Loss"} versus ${sides.opponent}`}
      onPress={() => setExpanded((value) => !value)}
      style={[
        styles.athleteResultCard,
        result === "W"
          ? styles.athleteResultCardWin
          : styles.athleteResultCardLoss,
      ]}
    >
      <View style={styles.athleteResultHero}>
        <Animated.View
          style={[
            styles.athleteResultHeroCopy,
            {
              opacity: reveal,
              transform: [
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.athleteResultOutcome}>
            {result === "W" ? "Match won" : "Match lost"}
          </Text>
          <Text style={styles.athleteResultStory}>
            {match.resultStory.summary}
          </Text>
          <Text style={styles.athleteResultStorySource}>
            {match.resultStory.source === "ai" ? "DUNA AI RECAP" : "DUNA RECAP"}
          </Text>
        </Animated.View>
        <View pointerEvents="none" style={styles.athleteResultPlayIcon}>
          <ResultPlayIcon
            outcome={result === "W" ? "won" : "lost"}
            playersPerSide={Math.max(
              sidePlayers("A").length,
              sidePlayers("B").length,
            )}
            size={138}
          />
        </View>
      </View>

      <View style={styles.athleteResultScoreCard}>
        <View style={styles.athleteResultScoreMeta}>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={styles.athleteResultOpponent}>
              {match.matchTitle}
            </Text>
            <Text numberOfLines={1} style={styles.athleteResultMeta}>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(match.occurredAt))}
              {` · ${expected}% pre-match`}
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
            <Text style={styles.athleteResultExpected}>SAND RATING</Text>
          </View>
        </View>

        {(["A", "B"] as const).map((side, sideIndex) => {
          const team = sidePlayers(side);
          const density = resultRosterDensity(team.length);
          const rosterWidth = resultRosterWidth(team.length);
          return (
            <View
              key={side}
              style={[
                styles.athleteResultTeamRow,
                density === "compact" && styles.athleteResultTeamRowCompact,
                density === "dense" && styles.athleteResultTeamRowDense,
                team.length > 6 && styles.athleteResultTeamRowWrapped,
                sideIndex > 0 && styles.athleteResultTeamRowDivider,
              ]}
            >
              <View style={styles.athleteResultPeople}>
                {team.map((participant) => {
                  const profile = participant.personId
                    ? profileById.get(participant.personId)
                    : undefined;
                  const sandRating =
                    participant.personId === personId
                      ? match.beforeDisplay
                      : (profile?.sandRating ??
                        (participant.personId
                          ? demoSandRatingByPersonId.get(participant.personId)
                          : undefined));
                  return (
                    <View
                      key={participant.personId ?? participant.externalPersonId}
                      style={[
                        styles.athleteResultPerson,
                        density === "compact" &&
                          styles.athleteResultPersonCompact,
                        density === "dense" && styles.athleteResultPersonDense,
                        { width: rosterWidth },
                      ]}
                    >
                      {profile?.avatarUrl ? (
                        <Image
                          accessibilityLabel=""
                          source={{ uri: profile.avatarUrl }}
                          style={[
                            styles.athleteResultAvatar,
                            density === "compact" &&
                              styles.athleteResultAvatarCompact,
                            density === "dense" &&
                              styles.athleteResultAvatarDense,
                          ]}
                        />
                      ) : (
                        <View
                          style={[
                            styles.athleteResultAvatarFallback,
                            density === "compact" &&
                              styles.athleteResultAvatarFallbackCompact,
                            density === "dense" &&
                              styles.athleteResultAvatarFallbackDense,
                          ]}
                        >
                          <Text
                            style={[
                              styles.athleteResultAvatarText,
                              density === "dense" &&
                                styles.athleteResultAvatarTextDense,
                            ]}
                          >
                            {participant.name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")}
                          </Text>
                        </View>
                      )}
                      <Text
                        accessibilityLabel={participant.name}
                        numberOfLines={1}
                        style={[
                          styles.athleteResultPersonName,
                          density === "compact" &&
                            styles.athleteResultPersonNameCompact,
                          density === "dense" &&
                            styles.athleteResultPersonNameDense,
                        ]}
                      >
                        {resultRosterName(participant.name)}
                      </Text>
                      <View
                        style={[
                          styles.athleteResultRatingPill,
                          density === "dense" &&
                            styles.athleteResultRatingPillDense,
                        ]}
                      >
                        <Text
                          style={[
                            styles.athleteResultRatingText,
                            density === "dense" &&
                              styles.athleteResultRatingTextDense,
                          ]}
                        >
                          {sandRating?.toFixed(2) ?? "—"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.athleteResultSetScores}>
                {match.sets.map((set, index) => {
                  const score = side === "A" ? set.a : set.b;
                  const wonSet =
                    (side === "A" && set.a > set.b) ||
                    (side === "B" && set.b > set.a);
                  return (
                    <Text
                      key={`${side}:${index}`}
                      style={[
                        styles.athleteResultSetScore,
                        wonSet && styles.athleteResultSetScoreWon,
                      ]}
                    >
                      {score}
                    </Text>
                  );
                })}
                {winningSide === side && (
                  <Text
                    accessibilityLabel="Winning side"
                    style={styles.athleteResultWinnerMark}
                  >
                    ✦
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
      {expanded && (
        <View style={styles.athleteResultBreakdown}>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>SAND RATING</Text>
            <Text style={styles.athleteResultBreakdownValue}>
              {match.beforeDisplay.toFixed(2)} → {match.afterDisplay.toFixed(2)}
            </Text>
          </View>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>VERIFIED</Text>
            <Text style={styles.athleteResultBreakdownValue}>
              {Math.round(match.verificationWeightBps / 100)}%
            </Text>
          </View>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>POINT SHARE</Text>
            <Text style={styles.athleteResultBreakdownValue}>
              {Math.round(match.pointShare * 100)}%
            </Text>
          </View>
          <View>
            <Text style={styles.athleteResultBreakdownLabel}>OPPONENT</Text>
            <Text numberOfLines={1} style={styles.athleteResultBreakdownValue}>
              {sides.opponent || "Opponent"}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function PerformanceScreen({
  onArtwork,
  onBack,
  onEditProfile,
  onHealth,
  onPredictions,
  onWallet,
}: {
  readonly onArtwork: () => void;
  readonly onBack: () => void;
  readonly onEditProfile: () => void;
  readonly onHealth: () => void;
  readonly onPredictions: () => void;
  readonly onWallet: () => void;
}) {
  const { client, dashboard, mode, settings, signOut } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const fallbackMatches = dashboard?.recentMatches ?? demoMatches;
  const [intelligence, setIntelligence] = useState<MobilePlayerIntelligence>();
  const [performance, setPerformance] = useState<MobilePlayerPerformance>();
  const [resultRange, setResultRange] = useState<12 | 30 | "all">(12);
  const reducedMotion = useReducedMotion();
  const performanceScrollY = useRef(new Animated.Value(0)).current;
  const { width: viewportWidth } = useWindowDimensions();

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
  const history =
    performance?.history ?? (mode === "preview" ? demoPerformanceHistory : []);
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
  const chartWidth = Math.max(248, viewportWidth - 72);
  const chartHeight = 132;
  const pulseMatches = history.slice(0, 12).reverse();
  const positiveDeltas = history
    .filter((match) => match.delta > 0)
    .map((match) => match.delta);
  const negativeDeltas = history
    .filter((match) => match.delta < 0)
    .map((match) => Math.abs(match.delta));
  const averagePositiveDelta = positiveDeltas.length
    ? positiveDeltas.reduce((total, value) => total + value, 0) /
      positiveDeltas.length
    : 0;
  const averageNegativeDelta = negativeDeltas.length
    ? negativeDeltas.reduce((total, value) => total + value, 0) /
      negativeDeltas.length
    : 0;
  const upsetWins = history.filter(
    (match) => match.actualResult >= 0.5 && match.expectedWinProbability < 0.5,
  ).length;
  const favoriteWins = history.filter(
    (match) => match.actualResult >= 0.5 && match.expectedWinProbability >= 0.5,
  ).length;
  const favoriteLosses = history.filter(
    (match) => match.actualResult < 0.5 && match.expectedWinProbability >= 0.5,
  ).length;
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
  const chartRange = Math.max(0.01, maximumRating - minimumRating);
  const chartPoints = chartMatches.map((match, index) => ({
    match,
    x:
      chartMatches.length <= 1
        ? chartWidth / 2
        : (index / (chartMatches.length - 1)) * chartWidth,
    y:
      chartHeight -
      10 -
      ((match.afterDisplay - minimumRating) / chartRange) * (chartHeight - 20),
  }));
  const chartPath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const participantProfileById = new Map(
    (performance?.participantProfiles ?? []).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  let setsWon = 0;
  let setsLost = 0;
  let decidingSetWins = 0;
  let decidingSetMatches = 0;
  const opponentRatings: number[] = [];
  const partnerRecords = new Map<
    string,
    { name: string; wins: number; matches: number }
  >();
  for (const match of history) {
    const ownSide = match.participants.find(
      (participant) => participant.personId === player.id,
    )?.side;
    if (!ownSide) continue;
    for (const set of match.sets) {
      const ownScore = ownSide === "A" ? set.a : set.b;
      const opponentScore = ownSide === "A" ? set.b : set.a;
      if (ownScore > opponentScore) setsWon += 1;
      if (ownScore < opponentScore) setsLost += 1;
    }
    if (match.sets.length >= 3) {
      decidingSetMatches += 1;
      if (match.actualResult >= 0.5) decidingSetWins += 1;
    }
    for (const participant of match.participants) {
      if (!participant.personId || participant.personId === player.id) continue;
      if (participant.side === ownSide) {
        const record = partnerRecords.get(participant.personId) ?? {
          name: participant.name,
          wins: 0,
          matches: 0,
        };
        record.matches += 1;
        if (match.actualResult >= 0.5) record.wins += 1;
        partnerRecords.set(participant.personId, record);
      } else {
        const rating = participantProfileById.get(
          participant.personId,
        )?.sandRating;
        if (rating !== undefined) opponentRatings.push(rating);
      }
    }
  }
  const averagePointShare = history.length
    ? history.reduce((total, match) => total + match.pointShare, 0) /
      history.length
    : 0;
  const averageOpponentRating = opponentRatings.length
    ? opponentRatings.reduce((total, rating) => total + rating, 0) /
      opponentRatings.length
    : undefined;
  const bestPartners = [...partnerRecords.values()]
    .sort(
      (left, right) =>
        right.matches - left.matches ||
        right.wins / right.matches - left.wins / left.matches,
    )
    .slice(0, 3);
  const visibleResults =
    resultRange === "all" ? history : history.slice(0, resultRange);
  const worldRank = performance?.worldRanking;
  const professionalStatistics = performance?.professionalStatistics;
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

  const heroGhostMotion = reducedMotion
    ? undefined
    : {
        opacity: performanceScrollY.interpolate({
          inputRange: [0, 260],
          outputRange: [0.12, 0.025],
          extrapolate: "clamp",
        }),
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 260],
              outputRange: [0, 62],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const heroContentMotion = reducedMotion
    ? undefined
    : {
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 220],
              outputRange: [0, 22],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const heroRatingMotion = reducedMotion
    ? undefined
    : {
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 220],
              outputRange: [0, 38],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const heroCutoutMotion = reducedMotion
    ? undefined
    : {
        transform: [
          {
            translateY: performanceScrollY.interpolate({
              inputRange: [0, 260],
              outputRange: [0, 28],
              extrapolate: "clamp",
            }),
          },
        ],
      };
  const ghostName =
    player.displayName.trim().split(/\s+/).at(-1)?.toUpperCase() ?? "PLAYER";

  return (
    <Animated.ScrollView
      contentContainerStyle={styles.screenContent}
      onScroll={
        reducedMotion
          ? undefined
          : Animated.event(
              [
                {
                  nativeEvent: {
                    contentOffset: { y: performanceScrollY },
                  },
                },
              ],
              { useNativeDriver: true },
            )
      }
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={onBack} style={styles.profileBack}>
        <Text style={styles.profileBackText}>‹ You</Text>
      </Pressable>
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
        <View style={styles.athleteHeroAtmosphere} />
        <Animated.View
          pointerEvents="none"
          style={[styles.athleteHeroGhost, heroGhostMotion]}
        >
          <Text numberOfLines={1} style={styles.athleteHeroGhostText}>
            {ghostName}
          </Text>
        </Animated.View>
        <View style={styles.athleteHeroHorizon} />
        <View style={styles.athleteHeroGeometry} />
        <Animated.View
          style={[
            styles.athleteHeroContent,
            !hasPersonalHero && styles.athleteHeroContentCompact,
            heroContentMotion,
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
              onPress={onArtwork}
              style={styles.athleteHeroSecondaryAction}
            >
              <Text style={styles.athleteHeroSecondaryActionText}>
                Create artwork
              </Text>
            </Pressable>
          </View>
        </Animated.View>
        {profile?.cutoutImageUrl && (
          <Animated.View style={[styles.athleteHeroCutout, heroCutoutMotion]}>
            <Image
              accessibilityLabel={profile.imageAlt ?? player.displayName}
              resizeMode="contain"
              source={{ uri: profile.cutoutImageUrl }}
              style={styles.athleteHeroCutoutImage}
            />
          </Animated.View>
        )}
        <Animated.View style={[styles.athleteHeroRating, heroRatingMotion]}>
          <Text style={styles.athleteHeroRatingLabel}>SAND RATING</Text>
          <Text style={styles.athleteHeroRatingValue}>
            {currentRating.toFixed(2)}
          </Text>
          <View style={styles.athleteHeroRatingMetaRow}>
            <Text
              style={[
                styles.athleteHeroRatingDelta,
                netMovement >= 0 ? styles.positiveText : styles.negativeText,
              ]}
            >
              {netMovement >= 0 ? "▲" : "▼"} {Math.abs(netMovement).toFixed(2)}
            </Text>
            <Text style={styles.athleteHeroRatingMeta}>
              {player.rating.confidence}
            </Text>
          </View>
        </Animated.View>
      </ImageBackground>

      <ScrollView
        contentContainerStyle={styles.athleteMetricShelfContent}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.athleteMetricShelf}
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

      <MemberOrganizationCard />

      <PredictionWalletSummaryCard onPress={onPredictions} />

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
          <View style={styles.athleteLineChart}>
            <Svg
              accessibilityLabel={`Sand Rating changed from ${startRating?.toFixed(2) ?? currentRating.toFixed(2)} to ${currentRating.toFixed(2)} across ${chartMatches.length} recent results.`}
              height={chartHeight}
              width={chartWidth}
            >
              {[0.25, 0.5, 0.75].map((ratio) => (
                <Line
                  key={ratio}
                  stroke={rgba(colors.overlayRgb, 0.1)}
                  strokeDasharray="4 5"
                  x1={0}
                  x2={chartWidth}
                  y1={chartHeight * ratio}
                  y2={chartHeight * ratio}
                />
              ))}
              <Path
                d={chartPath}
                fill="none"
                stroke={colors.aqua}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
              />
              {chartPoints.map(({ match, x, y }) => (
                <Circle
                  cx={x}
                  cy={y}
                  fill={
                    match.actualResult >= 0.5
                      ? colors.positive
                      : colors.resultLossBorder
                  }
                  key={match.id}
                  r={4.5}
                  stroke={colors.depth}
                  strokeWidth={2}
                />
              ))}
            </Svg>
            <View style={styles.athleteLineChartAxis}>
              <Text>{minimumRating.toFixed(2)}</Text>
              <Text>{maximumRating.toFixed(2)}</Text>
            </View>
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

      {history.length ? (
        <View style={styles.performanceEvidenceCard}>
          <Text style={styles.eyebrow}>COMPETITIVE PROFILE</Text>
          <Text style={styles.performancePulseTitle}>
            More than wins and losses.
          </Text>
          <View style={styles.performanceEvidenceGrid}>
            {[
              ["Set record", `${setsWon}–${setsLost}`],
              ["Point share", `${Math.round(averagePointShare * 100)}%`],
              ["Opp. rating", averageOpponentRating?.toFixed(2) ?? "Building"],
              [
                "Deciders",
                decidingSetMatches
                  ? `${decidingSetWins}–${decidingSetMatches - decidingSetWins}`
                  : "—",
              ],
            ].map(([label, value]) => (
              <View key={label} style={styles.performanceEvidenceMetric}>
                <Text style={styles.performanceEvidenceValue}>{value}</Text>
                <Text style={styles.performanceEvidenceLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {bestPartners.length > 0 && (
            <View style={styles.performancePartnerList}>
              <Text style={styles.performancePartnerHeading}>
                PARTNER CHEMISTRY
              </Text>
              {bestPartners.map((partner) => (
                <View key={partner.name} style={styles.performancePartnerRow}>
                  <Text numberOfLines={1} style={styles.performancePartnerName}>
                    {partner.name}
                  </Text>
                  <View style={styles.performancePartnerTrack}>
                    <View
                      style={[
                        styles.performancePartnerFill,
                        {
                          width: `${Math.round((partner.wins / partner.matches) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.performancePartnerRecord}>
                    {partner.wins}–{partner.matches - partner.wins}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {pulseMatches.length ? (
        <View
          accessibilityLabel={`Recent form: ${pulseMatches.map((match) => (match.actualResult >= 0.5 ? "win" : "loss")).join(", ")}`}
          style={styles.performancePulseCard}
        >
          <View style={styles.cardTitleRow}>
            <View>
              <Text style={styles.eyebrow}>MATCH PULSE</Text>
              <Text style={styles.performancePulseTitle}>Your last 12.</Text>
            </View>
            <Text style={styles.performancePulseRecord}>
              {lastTenWins}–{recentForm.length - lastTenWins}
            </Text>
          </View>
          <View style={styles.performancePulseTrack}>
            {pulseMatches.map((match) => (
              <View
                key={match.id}
                style={[
                  styles.performancePulsePoint,
                  match.actualResult >= 0.5
                    ? styles.performancePulsePointWin
                    : styles.performancePulsePointLoss,
                ]}
              >
                <Text style={styles.performancePulsePointText}>
                  {match.actualResult >= 0.5 ? "W" : "L"}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.performancePulseSummary}>
            {upsetWins} upset {upsetWins === 1 ? "win" : "wins"} ·{" "}
            {favoriteWins} wins as favorite · {favoriteLosses} favored{" "}
            {favoriteLosses === 1 ? "loss" : "losses"}
          </Text>
        </View>
      ) : null}

      {history.length ? (
        <View
          accessibilityLabel={`Average rating gain ${averagePositiveDelta.toFixed(2)}. Average rating loss ${averageNegativeDelta.toFixed(2)}.`}
          style={styles.performanceImpactCard}
        >
          <Text style={styles.eyebrow}>RATING IMPACT</Text>
          <Text style={styles.performancePulseTitle}>What results move.</Text>
          <View style={styles.performanceImpactRows}>
            <View style={styles.performanceImpactRow}>
              <Text style={styles.performanceImpactLabel}>Average win</Text>
              <View style={styles.performanceImpactTrack}>
                <View
                  style={[
                    styles.performanceImpactFill,
                    styles.performanceImpactFillWin,
                    {
                      width: `${Math.max(8, Math.min(100, averagePositiveDelta * 1_000))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.performanceImpactValue}>
                +{averagePositiveDelta.toFixed(2)}
              </Text>
            </View>
            <View style={styles.performanceImpactRow}>
              <Text style={styles.performanceImpactLabel}>Average loss</Text>
              <View style={styles.performanceImpactTrack}>
                <View
                  style={[
                    styles.performanceImpactFill,
                    styles.performanceImpactFillLoss,
                    {
                      width: `${Math.max(8, Math.min(100, averageNegativeDelta * 1_000))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.performanceImpactValue}>
                −{averageNegativeDelta.toFixed(2)}
              </Text>
            </View>
          </View>
          <Text style={styles.performancePulseSummary}>
            Rating movement blends opponent strength, score shape,
            responsibility, and verification confidence.
          </Text>
        </View>
      ) : null}

      {professionalStatistics ? (
        <View style={styles.performanceStatsCard}>
          <Text style={styles.eyebrow}>PRO MATCH SIGNALS</Text>
          <Text style={styles.performancePulseTitle}>Tracked per set.</Text>
          <View style={styles.performanceStatsGrid}>
            {[
              ["Aces", professionalStatistics.acesPerSet],
              ["Blocks", professionalStatistics.blocksPerSet],
              ["Digs", professionalStatistics.digsPerSet],
              ["Hit eff.", professionalStatistics.hittingEfficiency],
            ].map(([label, value]) => (
              <View key={String(label)} style={styles.performanceStat}>
                <Text style={styles.performanceStatValue}>
                  {typeof value === "number" ? value.toFixed(2) : "—"}
                </Text>
                <Text style={styles.performanceStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.performancePulseSummary}>
            Based on {professionalStatistics.matches} tracked professional{" "}
            {professionalStatistics.matches === 1 ? "match" : "matches"}.
          </Text>
        </View>
      ) : null}

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
          <View style={styles.performanceResultFilters}>
            {([12, 30, "all"] as const).map((range) => (
              <Pressable
                accessibilityState={{ selected: resultRange === range }}
                key={range}
                onPress={() => setResultRange(range)}
                style={[
                  styles.performanceResultFilter,
                  resultRange === range && styles.performanceResultFilterActive,
                ]}
              >
                <Text
                  style={[
                    styles.performanceResultFilterText,
                    resultRange === range &&
                      styles.performanceResultFilterTextActive,
                  ]}
                >
                  {range === "all" ? `All ${history.length}` : `Last ${range}`}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.athleteResultsList}>
            {visibleResults.map((match) => (
              <MobileResultCard
                key={match.id}
                match={match}
                participantProfiles={performance?.participantProfiles ?? []}
                personId={player.id}
              />
            ))}
          </View>
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
          Add playing details, connect match sources, and submit two to five
          high-resolution playing photos for your reviewable Duna artwork
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
            onPress={onEditProfile}
            style={[styles.primaryButton, styles.flex]}
          >
            <Text style={styles.primaryButtonText}>Edit player details</Text>
          </Pressable>
          <Pressable onPress={onArtwork} style={styles.athleteStudioSecondary}>
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
        <Pressable onPress={onPredictions} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Prediction portfolio</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable onPress={onEditProfile} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Player details + identity</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable onPress={onArtwork} style={styles.profileMenuRow}>
          <Text style={styles.rowTitle}>Player artwork</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        {[
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
    </Animated.ScrollView>
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
  const { openPlayerProfile } = usePlayerProfileNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState<{
    readonly title: string;
    readonly body: string;
    readonly label: string;
    readonly admissionReady: boolean;
    readonly admissionKind: "player-registration" | "fan-ticket";
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
  const [pickupPartner, setPickupPartner] = useState<readonly PersonSummary[]>(
    [],
  );
  const [showPickupPartnerPicker, setShowPickupPartnerPicker] = useState(false);
  const [acceptedPolicyIds, setAcceptedPolicyIds] = useState<readonly string[]>(
    [],
  );
  const [readPolicyIds, setReadPolicyIds] = useState<readonly string[]>([]);
  const [reviewingPolicyId, setReviewingPolicyId] = useState<string>();
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>();
  const teammateSearchTimeout = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const events = dashboard?.events ?? demoEvents;
  const player = dashboard?.player ?? demoPlayer;
  const event = eventIndex === null ? null : events[eventIndex];
  const eventId = event?.id;
  const defaultDivisionId = event?.divisions?.[0]?.id;
  const defaultTicketTypeId = event?.tickets?.[0]?.id;
  const activeDivisionId = divisionId ?? defaultDivisionId;

  useEffect(() => {
    if (!eventId) return;
    setPurchaseKind(
      initialPurchaseKind({
        hasDivisions: Boolean(defaultDivisionId),
        hasTickets: Boolean(defaultTicketTypeId),
      }),
    );
    setDivisionId(defaultDivisionId);
    setTicketTypeId(defaultTicketTypeId);
    setTeamRoster([]);
    setTeammateQuery("");
    setTeammateResults([]);
    setError(undefined);
  }, [defaultDivisionId, defaultTicketTypeId, eventId]);

  useEffect(() => {
    if (
      !client ||
      mode === "preview" ||
      !eventId ||
      purchaseKind !== "entry" ||
      !activeDivisionId
    ) {
      return;
    }
    let cancelled = false;
    void client.player.teammateSearch
      .query({ divisionId: activeDivisionId, limit: 12 })
      .then((results) => {
        if (!cancelled) setTeammateResults(results);
      })
      .catch(() => {
        if (!cancelled) setTeammateResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDivisionId, client, eventId, mode, purchaseKind]);

  useEffect(
    () => () => {
      if (teammateSearchTimeout.current) {
        clearTimeout(teammateSearchTimeout.current);
      }
    },
    [],
  );

  if (!event) return null;
  const selectedEvent = event;
  const reviewingPolicy = selectedEvent.policies?.find(
    (policy) => policy.id === reviewingPolicyId,
  );
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
    event.kind === "pickup"
      ? {
          ...event.price,
          amountMinor:
            event.price.amountMinor * (pickupPartner.length > 0 ? 2 : 1),
        }
      : purchaseKind === "ticket"
        ? (ticket?.price ?? event.price)
        : teamPaymentMode === "team"
          ? (division?.teamPrice ?? division?.price ?? event.price)
          : (division?.playerPrice ?? division?.price ?? event.price);
  const selectedTeamSize =
    event.kind === "pickup"
      ? 2
      : (division?.teamSize ??
        {
          solo: 1,
          doubles: 2,
          "three-person": 3,
          "four-person": 4,
          "six-person": 6,
        }[division?.teamFormat ?? "solo"]);
  const requiredPolicies =
    event.policies?.filter(
      (policy) =>
        policy.required &&
        (purchaseKind === "entry" || policy.kind !== "waiver"),
    ) ?? [];
  const rosterComplete = checkoutRosterComplete({
    eventKind: event.kind,
    purchaseKind,
    selectedTeamSize,
    teammateCount: teamRoster.length,
  });
  const policiesComplete = requiredPolicies.every((policy) =>
    acceptedPolicyIds.includes(policy.id),
  );
  const listedSubtotalMinor =
    listedPrice.amountMinor * (purchaseKind === "ticket" ? ticketQuantity : 1);
  const teammateCandidates =
    mode !== "preview"
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
            following: false,
            followsYou: false,
            reliability: {
              label: "new" as const,
              tracked: 0,
              attended: 0,
              noShows: 0,
            },
            gender: "Not listed",
            eligible: true,
            eligibilityReasons: [],
          }));
  const confirmationPlayerNames = [
    selectedParticipant?.person.displayName,
    ...(selectedEvent.kind === "pickup"
      ? pickupPartner.map((partner) => partner.displayName)
      : teamRoster.flatMap((member) =>
          member.displayName ? [member.displayName] : [],
        )),
  ].filter((name): name is string => Boolean(name));
  const completionDetails = {
    title: selectedEvent.title,
    startsAt: selectedEvent.startsAt,
    endsAt: selectedEvent.endsAt,
    timezone: selectedEvent.timezone,
    organizationName: selectedEvent.organizationName,
    locationName: selectedEvent.location?.venueName ?? selectedEvent.venueName,
    ...(selectedEvent.location?.address
      ? { address: selectedEvent.location.address }
      : {}),
    ...(selectedEvent.location?.courtNames?.length
      ? { courtName: selectedEvent.location.courtNames.join(", ") }
      : {}),
    ...(confirmationPlayerNames.length
      ? { playerNames: confirmationPlayerNames }
      : {}),
    detailsUrl: `${dunaWebUrl}/events/${encodeURIComponent(selectedEvent.slug)}`,
  } satisfies ShareableBookingDetails;

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
    setPickupPartner([]);
    setShowPickupPartnerPicker(false);
    setAcceptedPolicyIds([]);
    setReadPolicyIds([]);
    setReviewingPolicyId(undefined);
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
          selectedEvent.kind === "pickup"
            ? pickupPartner.length
              ? "team"
              : "self"
            : purchaseKind === "entry" && selectedTeamSize > 1
              ? teamPaymentMode
              : undefined,
        teamRoster:
          selectedEvent.kind === "pickup"
            ? pickupPartner.map((partner) => ({
                personId: partner.id,
                displayName: partner.displayName,
              }))
            : purchaseKind === "entry" && selectedTeamSize > 1
              ? [...teamRoster]
              : undefined,
        subjectPersonId:
          purchaseKind === "entry" ? selectedParticipant?.person.id : undefined,
        acceptedPolicyIds: [...acceptedPolicyIds],
        readPolicyIds: [...readPolicyIds],
        isDunaPlus: Boolean(settings?.membership),
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        successUrl: `${dunaWebUrl}/app/checkout/${selectedEvent.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${dunaWebUrl}/events/${selectedEvent.slug}?checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.paymentSheet) {
        const paymentIntentId = result.paymentSheet.paymentIntentId;
        const payment = await presentThenPollCheckout({
          present: () =>
            presentNativeEventPayment({
              paymentSheet: result.paymentSheet!,
              customerName: player.displayName,
            }),
          readStatus: () =>
            client.player.checkoutStatus.query({ paymentIntentId }),
          isComplete: (status) => status.complete,
          maxPolls: 5,
          delayMs: (attempt) => 450 + attempt * 250,
        });
        if (payment.cancelled) return;
        const { status } = payment;
        const pendingApproval = status.fulfillmentStatus === "pending-approval";
        setComplete(
          status.complete
            ? {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: admissionPassReady({
                  checkoutComplete: status.complete,
                  eventKind: selectedEvent.kind,
                  fulfillmentStatus: status.fulfillmentStatus,
                  purchaseKind,
                  registrationStatus: status.registrationStatus,
                }),
                label: pendingApproval ? "Pending approval" : "Confirmed",
                title: pendingApproval ? "Request received." : "You’re in.",
                body: pendingApproval
                  ? `${selectedEvent.title} is paid and waiting for organizer approval. Your admission pass will appear as soon as the ticket is issued.`
                  : `${selectedEvent.title} is confirmed and now appears with your bookings.`,
              }
            : {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: false,
                label: "Pending",
                title: "Payment received.",
                body: "Duna is finishing the registration and will add it to your bookings shortly.",
              },
        );
      } else if (result.checkoutUrl) {
        if (Platform.OS !== "web") {
          throw new Error(
            "Duna could not prepare the in-app payment. You were not charged; please try again.",
          );
        }
        await WebBrowser.openBrowserAsync(result.checkoutUrl);
        const status = result.checkoutSessionId
          ? await client.player.checkoutStatus.query({
              checkoutSessionId: result.checkoutSessionId,
            })
          : undefined;
        const pendingApproval =
          status?.fulfillmentStatus === "pending-approval";
        setComplete(
          status?.complete
            ? {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: admissionPassReady({
                  checkoutComplete: true,
                  eventKind: selectedEvent.kind,
                  fulfillmentStatus: status.fulfillmentStatus,
                  purchaseKind,
                  registrationStatus: status.registrationStatus,
                }),
                label: pendingApproval ? "Pending approval" : "Confirmed",
                title: pendingApproval ? "Request received." : "You’re in.",
                body: pendingApproval
                  ? `${selectedEvent.title} is paid and waiting for organizer approval. Your admission pass will appear as soon as the ticket is issued.`
                  : `${selectedEvent.title} is confirmed and now appears with your bookings.`,
              }
            : {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: false,
                label: "Pending",
                title: "Checkout is still processing.",
                body: "Duna will confirm the booking after the payment succeeds.",
              },
        );
      } else {
        const waitlisted = result.mode === "waitlist";
        const alreadyRegistered = result.mode === "already-registered";
        const pendingApproval = result.fulfillmentStatus === "pending-approval";
        setComplete({
          admissionKind:
            purchaseKind === "ticket" ? "fan-ticket" : "player-registration",
          admissionReady: admissionPassReady({
            checkoutComplete: !waitlisted,
            eventKind: selectedEvent.kind,
            fulfillmentStatus: result.fulfillmentStatus,
            purchaseKind,
            registrationStatus: result.registrationStatus,
          }),
          label: waitlisted
            ? "Waitlisted"
            : pendingApproval
              ? "Pending approval"
              : alreadyRegistered
                ? "Already registered"
                : "Confirmed",
          title: waitlisted
            ? "You’re on the list."
            : pendingApproval
              ? "Request received."
              : alreadyRegistered
                ? "You already have this booking."
                : "You’re in.",
          body: waitlisted
            ? `${selectedEvent.title} will notify you if a place opens.`
            : pendingApproval
              ? `${selectedEvent.title} is waiting for organizer approval. Your admission pass will appear as soon as the ticket is issued.`
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

  const existingBooking = (dashboard?.bookings ?? []).find(
    (booking) =>
      booking.sessionId === selectedEvent.id ||
      (booking.title === selectedEvent.title &&
        Math.abs(
          Date.parse(booking.startsAt) - Date.parse(selectedEvent.startsAt),
        ) <
          15 * 60_000),
  );
  if (existingBooking && !complete) {
    return (
      <BookingManagementModal
        booking={existingBooking as ManagedBooking}
        client={client}
        onClose={close}
        onUpdated={refresh}
      />
    );
  }

  if (selectedEvent.kind === "pickup") {
    const startsAt = new Date(selectedEvent.startsAt);
    const endsAt = new Date(selectedEvent.endsAt);
    const durationMinutes = Math.max(
      1,
      Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
    );
    const partner = pickupPartner[0];
    const canAddPartner = selectedEvent.spotsRemaining >= 2;
    return (
      <>
        <Modal
          animationType="slide"
          onRequestClose={close}
          presentationStyle="pageSheet"
          visible={eventIndex !== null}
        >
          {showPickupPartnerPicker ? (
            <PlayerPickerModal
              embedded
              excludedPersonIds={[player.id]}
              maxSelected={1}
              onChange={setPickupPartner}
              onClose={() => setShowPickupPartnerPicker(false)}
              palette={colors}
              selected={pickupPartner}
              title="Choose your partner"
              visible
            />
          ) : (
            <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
              {complete ? (
                <BookingConfirmationView
                  body={complete.body}
                  details={completionDetails}
                  label={complete.label}
                  onDone={close}
                  title={complete.title}
                >
                  {complete.admissionReady ? (
                    <TournamentWalletConfirmation
                      kind={complete.admissionKind}
                      sessionId={selectedEvent.id}
                    />
                  ) : null}
                </BookingConfirmationView>
              ) : (
                <>
                  <View style={styles.hostedReviewHeader}>
                    <View style={styles.flex}>
                      <Text style={styles.eyebrow}>HOSTED MATCH</Text>
                      <Text style={styles.hostedReviewTitle}>Review</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Close match review"
                      onPress={close}
                      style={styles.hostedReviewClose}
                    >
                      <Text style={styles.closeText}>×</Text>
                    </Pressable>
                  </View>
                  <ScrollView
                    contentContainerStyle={styles.hostedReviewContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.hostedReviewSummary}>
                      <View style={styles.flex}>
                        <Text style={styles.hostedReviewDate}>
                          {startsAt.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </Text>
                        <Text style={styles.hostedReviewTime}>
                          {startsAt.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {endsAt.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                        <Text style={styles.hostedReviewMeta}>
                          {selectedEvent.tags.includes("Competitive")
                            ? "Competitive"
                            : "Casual"}{" "}
                          · {selectedEvent.format?.replace("-", " ") ?? "Beach"}{" "}
                          · {selectedEvent.venueName}
                        </Text>
                        {selectedEvent.ratingRange && (
                          <Text style={styles.hostedReviewMeta}>
                            Sand Rating{" "}
                            {selectedEvent.ratingRange[0].toFixed(2)}–
                            {selectedEvent.ratingRange[1].toFixed(2)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.hostedReviewDuration}>
                        <Text style={styles.hostedReviewDurationMark}>◷</Text>
                        <Text style={styles.hostedReviewDurationValue}>
                          {durationMinutes}
                        </Text>
                        <Text style={styles.hostedReviewDurationLabel}>
                          MIN
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.hostedPartnerCard,
                        !canAddPartner && styles.hostedPartnerCardDisabled,
                      ]}
                    >
                      <View style={styles.hostedPartnerTop}>
                        <View style={styles.flex}>
                          <Text style={styles.hostedPartnerTitle}>
                            Join with a partner
                          </Text>
                          <Text style={styles.hostedPartnerMeta}>
                            Reserve and pay for two places together.
                          </Text>
                        </View>
                        <View style={styles.hostedPartnerIllustration}>
                          <View style={styles.hostedPartnerSilhouette} />
                          <View
                            style={[
                              styles.hostedPartnerSilhouette,
                              styles.hostedPartnerSilhouetteBack,
                            ]}
                          />
                        </View>
                      </View>
                      {partner ? (
                        <View style={styles.hostedSelectedPartner}>
                          <Pressable
                            accessibilityLabel={
                              "Open " + partner.displayName + "'s profile"
                            }
                            onPress={() => openPlayerProfile(partner)}
                          >
                            {partner.avatarUrl ? (
                              <Image
                                accessibilityIgnoresInvertColors
                                source={{ uri: partner.avatarUrl }}
                                style={styles.hostedPartnerAvatar}
                              />
                            ) : (
                              <View style={styles.hostedPartnerAvatarFallback}>
                                <Text style={styles.hostedPartnerAvatarText}>
                                  {partner.initials}
                                </Text>
                              </View>
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => openPlayerProfile(partner)}
                            style={styles.flex}
                          >
                            <Text style={styles.hostedSelectedPartnerName}>
                              {partner.displayName}
                            </Text>
                            <Text style={styles.hostedSelectedPartnerMeta}>
                              {partner.homeMarket} ·{" "}
                              {partner.rating.display.toFixed(2)} Sand
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Remove partner"
                            onPress={() => setPickupPartner([])}
                            style={styles.hostedRemovePartner}
                          >
                            <Text style={styles.hostedRemovePartnerText}>
                              ×
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          disabled={!canAddPartner}
                          onPress={() => setShowPickupPartnerPicker(true)}
                          style={styles.hostedAddPartner}
                        >
                          <Text style={styles.hostedAddPartnerText}>
                            {canAddPartner
                              ? "Add partner (0/1)"
                              : "Two places are not available"}
                          </Text>
                          <Text style={styles.hostedAddPartnerArrow}>＋</Text>
                        </Pressable>
                      )}
                      {partner && (
                        <Text style={styles.hostedPartnerPolicy}>
                          Both places are managed as one paid booking.
                          Cancelling releases both places together.
                        </Text>
                      )}
                    </View>

                    <View style={styles.hostedTotalCard}>
                      <View style={styles.flex}>
                        <Text style={styles.hostedTotalLabel}>Total</Text>
                        <Text style={styles.hostedTotalMeta}>
                          {partner ? "2 places" : "1 place"} · Service fees
                          shown before payment
                        </Text>
                      </View>
                      <Text style={styles.hostedTotalValue}>
                        {listedPrice.amountMinor
                          ? formatMoney(
                              listedPrice.amountMinor,
                              listedPrice.currency,
                            )
                          : "FREE"}
                      </Text>
                    </View>

                    <View style={styles.hostedPolicyCard}>
                      <Text style={styles.hostedPolicyMark}>i</Text>
                      <View style={styles.flex}>
                        <Text style={styles.hostedPolicyTitle}>
                          Cancellation policy
                        </Text>
                        <Text style={styles.hostedPolicyBody}>
                          Registration closes when the match begins. Any
                          eligible refund follows the host and venue policy
                          shown at checkout.
                        </Text>
                      </View>
                    </View>

                    {error && (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}
                  </ScrollView>
                  <View style={styles.hostedReviewFooter}>
                    <Pressable
                      disabled={busy || mode === "preview"}
                      onPress={() => void checkout()}
                      style={[
                        styles.hostedReviewContinue,
                        (busy || mode === "preview") && styles.buttonDisabled,
                      ]}
                    >
                      <Text style={styles.hostedReviewContinueText}>
                        {mode === "preview"
                          ? "Sign in to reserve"
                          : busy
                            ? "Securing places…"
                            : listedPrice.amountMinor
                              ? "Continue payment"
                              : partner
                                ? "Confirm both places"
                                : "Confirm place"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </SafeAreaView>
          )}
        </Modal>
      </>
    );
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
          <BookingConfirmationView
            body={complete.body}
            details={completionDetails}
            label={complete.label}
            onDone={close}
            title={complete.title}
          >
            {complete.admissionReady ? (
              <TournamentWalletConfirmation
                kind={complete.admissionKind}
                sessionId={selectedEvent.id}
              />
            ) : null}
          </BookingConfirmationView>
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
                  onPress={() => {
                    setPurchaseKind("entry");
                    setError(undefined);
                  }}
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
                  onPress={() => {
                    setPurchaseKind("ticket");
                    setTeamRoster([]);
                    setError(undefined);
                  }}
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
                          setTeammateQuery("");
                          setTeammateResults([]);
                          setError(undefined);
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
                            <Text
                              numberOfLines={3}
                              style={[
                                styles.mobileSuggestionEligibility,
                                candidate.eligible
                                  ? styles.mobileSuggestionEligible
                                  : styles.mobileSuggestionIneligible,
                              ]}
                            >
                              {candidate.eligible
                                ? `Eligible${division ? ` for ${division.name}` : ""}`
                                : candidate.eligibilityReasons.join(" · ") ||
                                  "This player does not meet the division criteria"}
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
                              style={[
                                styles.mobileSuggestionAdd,
                                !candidate.eligible &&
                                  styles.mobileSuggestionAddDisabled,
                              ]}
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
                      const document: MobilePolicyReviewDocument = policy;
                      return (
                        <MobilePolicyReviewCard
                          accepted={accepted}
                          key={policy.id}
                          onPress={() => {
                            selectionHaptic();
                            setReviewingPolicyId(policy.id);
                          }}
                          policy={document}
                        />
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
        <PolicyReviewModal
          accepted={Boolean(
            reviewingPolicy && acceptedPolicyIds.includes(reviewingPolicy.id),
          )}
          onAccept={() => {
            if (!reviewingPolicy) return;
            setReadPolicyIds((current) =>
              current.includes(reviewingPolicy.id)
                ? current
                : [...current, reviewingPolicy.id],
            );
            setAcceptedPolicyIds((current) =>
              current.includes(reviewingPolicy.id)
                ? current
                : [...current, reviewingPolicy.id],
            );
            setReviewingPolicyId(undefined);
          }}
          onClose={() => setReviewingPolicyId(undefined)}
          policy={reviewingPolicy}
          read={Boolean(
            reviewingPolicy && readPolicyIds.includes(reviewingPolicy.id),
          )}
          visible={Boolean(reviewingPolicy)}
        />
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

type LookingToPlayCandidate = Awaited<
  ReturnType<DunaApiClient["player"]["matchAvailabilityCandidates"]["query"]>
>[number];

function PickupModal({
  visible,
  onClose,
  onCreated,
  initialCourtBooking,
  onReserveCourtVenue,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onCreated: (title: string) => void;
  readonly initialCourtBooking?: HostedMatchSeed;
  readonly onReserveCourtVenue?: (request: CourtBookingRequest) => void;
}) {
  const { client, dashboard, mode, refresh } = usePlayerRuntime();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueId, setVenueId] = useState<string>();
  const [placeSelection, setPlaceSelection] = useState<MobilePlaceSelection>();
  const [courtBookingId, setCourtBookingId] = useState<string>();
  const [startsAt, setStartsAt] = useState(defaultPickupStart);
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [capacity, setCapacity] = useState(4);
  const [format, setFormat] = useState<
    "2s" | "3s" | "4s" | "6s" | "king-queen"
  >("2s");
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
  const [costMode, setCostMode] = useState<"free" | "paid">("free");
  const [note, setNote] = useState("");
  const [recordMatches, setRecordMatches] = useState(true);
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [selectedPlayers, setSelectedPlayers] = useState<
    readonly PersonSummary[]
  >([]);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [lookingCandidates, setLookingCandidates] = useState<
    readonly LookingToPlayCandidate[]
  >([]);
  const [lookingCandidatesLoading, setLookingCandidatesLoading] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const linkedCourtLocked = Boolean(initialCourtBooking && courtBookingId);
  const courtReservations = (dashboard?.bookings ?? []).filter(
    (booking) =>
      booking.kind === "court-rental" && new Date(booking.endsAt) > new Date(),
  );
  const host = dashboard?.player ?? demoPlayer;
  const start = new Date(startsAt);
  const dayChoices = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(start.getHours(), start.getMinutes(), 0, 0);
    day.setDate(day.getDate() + index);
    return day;
  });
  const timeChoices = [
    { label: "9:00 AM", hour: 9 },
    { label: "12:00 PM", hour: 12 },
    { label: "5:00 PM", hour: 17 },
    { label: "7:00 PM", hour: 19 },
  ] as const;
  const steps = ["Match", "When + where", "Players", "Access", "Review"];

  function localInputValue(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  useEffect(() => {
    if (!visible || !initialCourtBooking) return;
    setStep(0);
    setVenueName(initialCourtBooking.venueName);
    setVenueId(initialCourtBooking.venueId);
    setCourtBookingId(initialCourtBooking.courtBookingId);
    setStartsAt(initialCourtBooking.localStartsAt.slice(0, 16));
    setDurationMinutes(initialCourtBooking.durationMinutes);
    setSelectedPlayers(initialCourtBooking.invitedPlayers ?? []);
    setCapacity((current) =>
      Math.max(current, (initialCourtBooking.invitedPlayers?.length ?? 0) + 1),
    );
    setError(undefined);
  }, [initialCourtBooking, visible]);

  useEffect(() => {
    if (!visible || step !== 2 || !client || mode === "preview") {
      setLookingCandidates([]);
      return;
    }
    const windowStart = new Date(startsAt);
    if (!Number.isFinite(windowStart.getTime()) || windowStart <= new Date()) {
      setLookingCandidates([]);
      return;
    }
    let cancelled = false;
    setLookingCandidatesLoading(true);
    void client.player.matchAvailabilityCandidates
      .query({
        venueId,
        startsAt: windowStart.toISOString(),
        endsAt: new Date(
          windowStart.getTime() + durationMinutes * 60_000,
        ).toISOString(),
        matchType,
        genderPreference,
        format,
      })
      .then((candidates) => {
        if (!cancelled) setLookingCandidates(candidates);
      })
      .catch(() => {
        if (!cancelled) setLookingCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLookingCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    durationMinutes,
    format,
    genderPreference,
    matchType,
    mode,
    startsAt,
    step,
    venueId,
    visible,
  ]);

  function chooseDay(day: Date) {
    const next = new Date(start);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function chooseTime(hour: number) {
    const next = new Date(start);
    next.setHours(hour, 0, 0, 0);
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function chooseDate(date: Date) {
    const next = new Date(start);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function chooseStartTime(date: Date) {
    const next = new Date(start);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function choosePlace(value: MobilePlaceSelection | undefined) {
    setPlaceSelection(value);
    setVenueName(value?.name ?? "");
    setVenueId(value?.venueId);
    setCourtBookingId(undefined);
  }

  function close() {
    setError(undefined);
    setShowPlayerPicker(false);
    setPlaceSelection(undefined);
    setCostMode("free");
    setCost("0");
    onClose();
  }

  function nextStep() {
    setError(undefined);
    if (step === 0 && title.trim().length < 3) {
      setError("Give the match a short, recognizable name.");
      return;
    }
    if (
      step === 1 &&
      (venueName.trim().length < 2 || !Number.isFinite(start.getTime()))
    ) {
      setError("Choose a valid place, day, and time.");
      return;
    }
    if (step === 1 && venueId && !courtBookingId) {
      setError(
        "This is a Duna venue. Reserve a court first so every player sees a confirmed time and court.",
      );
      return;
    }
    if (step === 1 && start.getTime() <= Date.now()) {
      setError("Choose a future start time.");
      return;
    }
    if (step === 2 && selectedPlayers.length + 1 > capacity) {
      setError("Remove a player or increase the match capacity.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  async function publish() {
    if (!client || mode === "preview") return;
    const dollars = Number(cost);
    const ratingMin = Number(ratingMinimum);
    const ratingMax = Number(ratingMaximum);
    if (!Number.isFinite(start.getTime())) {
      setError("Enter the start as YYYY-MM-DDTHH:MM.");
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
        endsAt: new Date(
          start.getTime() + durationMinutes * 60 * 1_000,
        ).toISOString(),
        venueName: venueName.trim(),
        venueId,
        courtBookingId,
        capacity,
        format,
        matchType,
        genderPreference,
        note: note.trim() || undefined,
        visibility,
        costMinor: Math.round(dollars * 100),
        currency: "USD",
        recordMatches,
        participantPersonIds: selectedPlayers.map((player) => player.id),
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
      setStep(0);
      setSelectedPlayers([]);
      setCourtBookingId(undefined);
      setVenueId(undefined);
      setPlaceSelection(undefined);
      setCostMode("free");
      setCost("0");
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="pageSheet"
        visible={visible}
      >
        {showPlayerPicker ? (
          <PlayerPickerModal
            embedded
            excludedPersonIds={[host.id]}
            maxSelected={Math.max(1, capacity - 1)}
            onChange={setSelectedPlayers}
            onClose={() => setShowPlayerPicker(false)}
            palette={colors}
            selected={selectedPlayers}
            title="Add players"
            visible
          />
        ) : (
          <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
            <View style={styles.hostFlowHeader}>
              <Pressable
                accessibilityLabel="Close create match"
                onPress={close}
                style={styles.hostFlowClose}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
              <View style={styles.flex}>
                <Text style={styles.hostFlowEyebrow}>
                  STEP {step + 1} OF {steps.length}
                </Text>
                <Text style={styles.hostFlowHeaderTitle}>{steps[step]}</Text>
              </View>
              <Text style={styles.hostFlowProgressValue}>
                {Math.round(((step + 1) / steps.length) * 100)}%
              </Text>
            </View>
            <View style={styles.hostFlowProgressTrack}>
              <View
                style={[
                  styles.hostFlowProgressFill,
                  { width: `${((step + 1) / steps.length) * 100}%` },
                ]}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.hostFlowContent}
              showsVerticalScrollIndicator={false}
            >
              {step === 0 && (
                <>
                  <Text style={styles.hostFlowTitle}>
                    What are you hosting?
                  </Text>
                  <Text style={styles.hostFlowBody}>
                    Start with the game. You can add the place, players, and
                    access rules next.
                  </Text>
                  <TextInput
                    autoFocus
                    onChangeText={setTitle}
                    placeholder="e.g. Saturday doubles at Hermosa"
                    placeholderTextColor={colors.muted}
                    style={styles.hostFlowInput}
                    value={title}
                  />
                  <Text style={styles.hostFlowLabel}>MATCH FEEL</Text>
                  <View style={styles.hostFlowChoiceGrid}>
                    {(["competitive", "casual"] as const).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setMatchType(option);
                          setRatingEnabled(option === "competitive");
                        }}
                        style={[
                          styles.hostFlowChoice,
                          matchType === option && styles.hostFlowChoiceActive,
                        ]}
                      >
                        <Text style={styles.hostFlowChoiceTitle}>
                          {option === "competitive" ? "Competitive" : "Casual"}
                        </Text>
                        <Text style={styles.hostFlowChoiceBody}>
                          {option === "competitive"
                            ? "Verified results can affect Sand Rating."
                            : "Social play without rating impact."}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.hostFlowLabel}>FORMAT</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {(["2s", "3s", "4s", "6s", "king-queen"] as const).map(
                      (option) => (
                        <Pressable
                          key={option}
                          onPress={() => {
                            setFormat(option);
                            const nextCapacity =
                              option === "2s"
                                ? 4
                                : option === "3s"
                                  ? 6
                                  : option === "4s"
                                    ? 8
                                    : option === "6s"
                                      ? 12
                                      : 8;
                            setCapacity(nextCapacity);
                            setSelectedPlayers((current) =>
                              current.slice(0, nextCapacity - 1),
                            );
                          }}
                          style={[
                            styles.hostFlowChip,
                            format === option && styles.hostFlowChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.hostFlowChipText,
                              format === option &&
                                styles.hostFlowChipTextActive,
                            ]}
                          >
                            {option === "king-queen"
                              ? "King / Queen"
                              : option.toUpperCase()}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </>
              )}

              {step === 1 && (
                <>
                  <Text style={styles.hostFlowTitle}>When and where?</Text>
                  <Text style={styles.hostFlowBody}>
                    Choose a court you already booked or set a clear place and
                    start time.
                  </Text>
                  {linkedCourtLocked && (
                    <View style={styles.hostFlowLinkedCourt}>
                      <Text style={styles.hostFlowLinkedCourtMark}>✓</Text>
                      <View style={styles.flex}>
                        <Text style={styles.hostFlowCourtTitle}>
                          Court reserved
                        </Text>
                        <Text style={styles.hostFlowCourtMeta}>
                          {venueName} ·{" "}
                          {start.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          at{" "}
                          {start.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                        <Text style={styles.hostFlowCourtMeta}>
                          This match stays attached to the court you just
                          confirmed.
                        </Text>
                      </View>
                    </View>
                  )}
                  {courtReservations.length > 0 && (
                    <>
                      <Text style={styles.hostFlowLabel}>YOUR COURTS</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.hostFlowHorizontal}
                      >
                        {courtReservations.map((booking) => (
                          <Pressable
                            disabled={linkedCourtLocked}
                            key={booking.id}
                            onPress={() => {
                              const bookingStart = new Date(booking.startsAt);
                              const bookingEnd = new Date(booking.endsAt);
                              setCourtBookingId(booking.id);
                              setVenueName(booking.venueName);
                              setStartsAt(localInputValue(bookingStart));
                              setDurationMinutes(
                                Math.round(
                                  (bookingEnd.getTime() -
                                    bookingStart.getTime()) /
                                    60_000,
                                ),
                              );
                            }}
                            style={[
                              styles.hostFlowCourt,
                              courtBookingId === booking.id &&
                                styles.hostFlowCourtActive,
                            ]}
                          >
                            <Text style={styles.hostFlowCourtTitle}>
                              {booking.venueName}
                            </Text>
                            <Text style={styles.hostFlowCourtMeta}>
                              {new Date(booking.startsAt).toLocaleString(
                                "en-US",
                                {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </>
                  )}
                  <Text style={styles.hostFlowLabel}>PLACE</Text>
                  {linkedCourtLocked ? (
                    <View style={styles.hostFlowLockedPlace}>
                      <Text style={styles.hostFlowLockedPlaceMark}>✓</Text>
                      <View style={styles.flex}>
                        <Text style={styles.hostFlowLockedPlaceTitle}>
                          {venueName}
                        </Text>
                        <Text style={styles.hostFlowLockedPlaceBody}>
                          Confirmed court reservation · time stays locked
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <MobilePlacePicker
                        baseUrl={dunaWebUrl}
                        description="Search Duna venues first, or choose any beach, club, or address with Google Places."
                        label="Venue, beach, or court"
                        lockedLabel={
                          placeSelection?.venueId
                            ? "DUNA VENUE · RESERVATION REQUIRED"
                            : "LOCATION LOCKED · GOOGLE"
                        }
                        onChange={choosePlace}
                        palette={colors}
                        value={placeSelection}
                      />
                      {placeSelection?.latitude !== undefined &&
                        placeSelection.longitude !== undefined && (
                          <View style={styles.hostFlowPlaceMapPreview}>
                            <View style={styles.hostFlowPlaceMapGrid} />
                            <View style={styles.hostFlowPlaceMapPin}>
                              <Text style={styles.hostFlowPlaceMapPinText}>
                                ⌖
                              </Text>
                            </View>
                            <View style={styles.hostFlowPlaceMapLabel}>
                              <Text style={styles.hostFlowPlaceMapLabelText}>
                                MAP READY ·{" "}
                                {placeSelection.address ?? placeSelection.name}
                              </Text>
                            </View>
                          </View>
                        )}
                      {venueId && (
                        <Pressable
                          accessibilityLabel={`Reserve a court at ${venueName}`}
                          onPress={() => {
                            if (!onReserveCourtVenue) return;
                            close();
                            onReserveCourtVenue({
                              venueId,
                              date: startsAt.slice(0, 10),
                              durationMinutes,
                            });
                          }}
                          style={styles.hostFlowReserveVenue}
                        >
                          <View style={styles.flex}>
                            <Text style={styles.hostFlowReserveVenueTitle}>
                              Reserve a court at {venueName}
                            </Text>
                            <Text style={styles.hostFlowReserveVenueBody}>
                              Duna venues use live availability, court
                              selection, and secure payment before the match is
                              published.
                            </Text>
                          </View>
                          <Text style={styles.hostFlowReserveVenueArrow}>
                            ›
                          </Text>
                        </Pressable>
                      )}
                    </>
                  )}
                  <Text style={styles.hostFlowLabel}>DAY</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.hostFlowHorizontal}
                  >
                    {dayChoices.map((day) => {
                      const selected =
                        day.toDateString() === start.toDateString();
                      return (
                        <Pressable
                          disabled={linkedCourtLocked}
                          key={day.toISOString()}
                          onPress={() => chooseDay(day)}
                          style={[
                            styles.hostFlowDay,
                            selected && styles.hostFlowDayActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.hostFlowDayName,
                              selected && styles.hostFlowDayTextActive,
                            ]}
                          >
                            {day
                              .toLocaleDateString("en-US", {
                                weekday: "short",
                              })
                              .toUpperCase()}
                          </Text>
                          <Text
                            style={[
                              styles.hostFlowDayNumber,
                              selected && styles.hostFlowDayTextActive,
                            ]}
                          >
                            {day.getDate()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.hostFlowLabel}>START</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {timeChoices.map((time) => (
                      <Pressable
                        disabled={linkedCourtLocked}
                        key={time.hour}
                        onPress={() => chooseTime(time.hour)}
                        style={[
                          styles.hostFlowChip,
                          start.getHours() === time.hour &&
                            start.getMinutes() === 0 &&
                            styles.hostFlowChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.hostFlowChipText,
                            start.getHours() === time.hour &&
                              start.getMinutes() === 0 &&
                              styles.hostFlowChipTextActive,
                          ]}
                        >
                          {time.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {!linkedCourtLocked && !venueId && (
                    <View style={styles.hostFlowDatePickerCard}>
                      <Text style={styles.hostFlowDatePickerLabel}>
                        ANY DATE + START TIME
                      </Text>
                      <Text style={styles.hostFlowDatePickerBody}>
                        This is a non-Duna location, so you can choose any
                        future date, time, and duration.
                      </Text>
                      <DateTimePicker
                        accentColor={colors.aqua}
                        display={Platform.OS === "ios" ? "inline" : "default"}
                        minimumDate={new Date()}
                        mode="date"
                        onValueChange={(_event, date) => chooseDate(date)}
                        presentation="inline"
                        themeVariant="light"
                        value={start}
                      />
                      <DateTimePicker
                        accentColor={colors.aqua}
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        mode="time"
                        onValueChange={(_event, date) => chooseStartTime(date)}
                        presentation="inline"
                        themeVariant="light"
                        value={start}
                      />
                    </View>
                  )}
                  <Text style={styles.hostFlowLabel}>DURATION</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {[60, 90, 120].map((minutes) => (
                      <Pressable
                        disabled={linkedCourtLocked}
                        key={minutes}
                        onPress={() => setDurationMinutes(minutes)}
                        style={[
                          styles.hostFlowChip,
                          durationMinutes === minutes &&
                            styles.hostFlowChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.hostFlowChipText,
                            durationMinutes === minutes &&
                              styles.hostFlowChipTextActive,
                          ]}
                        >
                          {minutes} min
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {step === 2 && (
                <>
                  <Text style={styles.hostFlowTitle}>Who is playing?</Text>
                  <Text style={styles.hostFlowBody}>
                    You are already in. Add known players now or leave places
                    available for discovery.
                  </Text>
                  <View style={styles.hostFlowRosterSummary}>
                    <View>
                      <Text style={styles.hostFlowRosterCount}>
                        {selectedPlayers.length + 1} / {capacity}
                      </Text>
                      <Text style={styles.hostFlowRosterMeta}>
                        {capacity - selectedPlayers.length - 1} places available
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Add players"
                      accessibilityRole="button"
                      disabled={selectedPlayers.length >= capacity - 1}
                      onPress={() => setShowPlayerPicker(true)}
                      style={styles.hostFlowAddPlayers}
                    >
                      <Text style={styles.hostFlowAddPlayersText}>
                        ＋ Add players
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.hostFlowLookingSection}>
                    <View style={styles.hostFlowLookingHeader}>
                      <View style={styles.flex}>
                        <Text style={styles.hostFlowLabelInline}>
                          LOOKING TO PLAY
                        </Text>
                        <Text style={styles.hostFlowLookingTitle}>
                          Players available for this match
                        </Text>
                      </View>
                      <Text style={styles.hostFlowLookingCount}>
                        {lookingCandidatesLoading
                          ? "…"
                          : lookingCandidates.length}
                      </Text>
                    </View>
                    <Text style={styles.hostFlowLookingBody}>
                      These players explicitly opted in for an overlapping time
                      and match. Adding one sends an invitation—they still have
                      to accept or decline.
                    </Text>
                    {lookingCandidates.map((candidate) => {
                      const selected = selectedPlayers.some(
                        (player) => player.id === candidate.person.id,
                      );
                      const full = selectedPlayers.length >= capacity - 1;
                      return (
                        <View
                          key={candidate.postId}
                          style={styles.hostFlowLookingPlayer}
                        >
                          {candidate.person.avatarUrl ? (
                            <Image
                              source={{ uri: candidate.person.avatarUrl }}
                              style={styles.hostFlowPlayerAvatar}
                            />
                          ) : (
                            <View style={styles.hostFlowPlayerAvatarFallback}>
                              <Text style={styles.hostFlowPlayerAvatarText}>
                                {candidate.person.initials}
                              </Text>
                            </View>
                          )}
                          <View style={styles.flex}>
                            <Text style={styles.hostFlowPlayerName}>
                              {candidate.person.displayName}
                            </Text>
                            <Text style={styles.hostFlowPlayerMeta}>
                              {candidate.person.rating.display.toFixed(2)} Sand
                              {candidate.reliability.score !== undefined
                                ? ` · ${candidate.reliability.score}% reliability`
                                : ` · ${candidate.reliability.label.replaceAll("-", " ")}`}
                            </Text>
                            {candidate.note && (
                              <Text
                                numberOfLines={2}
                                style={styles.hostFlowLookingNote}
                              >
                                {candidate.note}
                              </Text>
                            )}
                          </View>
                          <Pressable
                            disabled={selected || full}
                            onPress={() =>
                              setSelectedPlayers((current) => [
                                ...current,
                                candidate.person,
                              ])
                            }
                            style={[
                              styles.hostFlowLookingInvite,
                              selected && styles.hostFlowLookingInviteSelected,
                            ]}
                          >
                            <Text style={styles.hostFlowLookingInviteText}>
                              {selected ? "Added" : "Invite"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                    {!lookingCandidatesLoading &&
                      lookingCandidates.length === 0 && (
                        <Text style={styles.hostFlowLookingEmpty}>
                          No opted-in players match this exact place and time
                          yet. You can still add someone you know.
                        </Text>
                      )}
                  </View>
                  <View style={styles.hostFlowRoster}>
                    {[host, ...selectedPlayers].map((player, index) => (
                      <View key={player.id} style={styles.hostFlowPlayerRow}>
                        {player.avatarUrl ? (
                          <Image
                            accessibilityIgnoresInvertColors
                            source={{ uri: player.avatarUrl }}
                            style={styles.hostFlowPlayerAvatar}
                          />
                        ) : (
                          <View style={styles.hostFlowPlayerAvatarFallback}>
                            <Text style={styles.hostFlowPlayerAvatarText}>
                              {player.initials}
                            </Text>
                          </View>
                        )}
                        <View style={styles.flex}>
                          <Text style={styles.hostFlowPlayerName}>
                            {player.displayName}
                          </Text>
                          <Text style={styles.hostFlowPlayerMeta}>
                            {index === 0
                              ? "Host"
                              : `${player.homeMarket} · ${player.rating.display.toFixed(2)} Sand`}
                          </Text>
                        </View>
                        {index > 0 && (
                          <Pressable
                            accessibilityLabel={"Remove " + player.displayName}
                            onPress={() =>
                              setSelectedPlayers((current) =>
                                current.filter(
                                  (candidate) => candidate.id !== player.id,
                                ),
                              )
                            }
                            style={styles.hostFlowRemovePlayer}
                          >
                            <Text style={styles.hostFlowRemovePlayerText}>
                              ×
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                    {Array.from({
                      length: Math.min(
                        4,
                        Math.max(0, capacity - selectedPlayers.length - 1),
                      ),
                    }).map((_, index) => (
                      <Pressable
                        accessibilityLabel={`Add player to place ${index + selectedPlayers.length + 2}`}
                        accessibilityRole="button"
                        key={index}
                        onPress={() => setShowPlayerPicker(true)}
                        style={styles.hostFlowOpenPlayer}
                      >
                        <View style={styles.hostFlowOpenPlayerMark}>
                          <Text style={styles.hostFlowOpenPlayerPlus}>＋</Text>
                        </View>
                        <Text style={styles.hostFlowOpenPlayerText}>
                          Available place
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.hostFlowLabel}>WHO CAN JOIN</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {(["open", "mixed", "womens", "mens"] as const).map(
                      (option) => (
                        <Pressable
                          key={option}
                          onPress={() => setGenderPreference(option)}
                          style={[
                            styles.hostFlowChip,
                            genderPreference === option &&
                              styles.hostFlowChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.hostFlowChipText,
                              genderPreference === option &&
                                styles.hostFlowChipTextActive,
                            ]}
                          >
                            {option === "open"
                              ? "All players"
                              : option === "mixed"
                                ? "Mixed"
                                : option === "womens"
                                  ? "Women"
                                  : "Men"}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </>
              )}

              {step === 3 && (
                <>
                  <Text style={styles.hostFlowTitle}>Access and details</Text>
                  <Text style={styles.hostFlowBody}>
                    Set the level, cost to join, and whether the match is
                    discoverable.
                  </Text>
                  <Text style={styles.hostFlowLabel}>VISIBILITY</Text>
                  <View style={styles.hostFlowChoiceGrid}>
                    {(["public", "unlisted"] as const).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => setVisibility(option)}
                        style={[
                          styles.hostFlowChoice,
                          visibility === option && styles.hostFlowChoiceActive,
                        ]}
                      >
                        <Text style={styles.hostFlowChoiceTitle}>
                          {option === "public" ? "Public" : "Link only"}
                        </Text>
                        <Text style={styles.hostFlowChoiceBody}>
                          {option === "public"
                            ? "Eligible players can discover open places."
                            : "Only people with the match link can join."}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {matchType === "competitive" && (
                    <>
                      <View style={styles.hostFlowToggle}>
                        <View style={styles.flex}>
                          <Text style={styles.hostFlowToggleTitle}>
                            Sand Rating range
                          </Text>
                          <Text style={styles.hostFlowToggleBody}>
                            Keep the level clear for everyone.
                          </Text>
                        </View>
                        <Switch
                          accessibilityLabel="Toggle Sand Rating range"
                          onValueChange={setRatingEnabled}
                          thumbColor="#ffffff"
                          trackColor={{
                            false: rgba(colors.overlayRgb, 0.16),
                            true: colors.aqua,
                          }}
                          value={ratingEnabled}
                        />
                      </View>
                      {ratingEnabled && (
                        <View style={styles.hostFlowInputRow}>
                          <TextInput
                            keyboardType="decimal-pad"
                            onChangeText={setRatingMinimum}
                            placeholder="Minimum"
                            placeholderTextColor={colors.muted}
                            style={[styles.hostFlowInput, styles.flex]}
                            value={ratingMinimum}
                          />
                          <TextInput
                            keyboardType="decimal-pad"
                            onChangeText={setRatingMaximum}
                            placeholder="Maximum"
                            placeholderTextColor={colors.muted}
                            style={[styles.hostFlowInput, styles.flex]}
                            value={ratingMaximum}
                          />
                        </View>
                      )}
                    </>
                  )}
                  <Text style={styles.hostFlowLabel}>COST TO JOIN</Text>
                  <View style={styles.hostFlowCostChoiceRow}>
                    {(["free", "paid"] as const).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setCostMode(option);
                          setCost(
                            option === "free"
                              ? "0"
                              : cost === "0"
                                ? "10"
                                : cost,
                          );
                        }}
                        style={[
                          styles.hostFlowCostChoice,
                          costMode === option &&
                            styles.hostFlowCostChoiceActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.hostFlowCostChoiceTitle,
                            costMode === option &&
                              styles.hostFlowCostChoiceTitleActive,
                          ]}
                        >
                          {option === "free" ? "Free" : "Paid"}
                        </Text>
                        <Text
                          style={[
                            styles.hostFlowCostChoiceBody,
                            costMode === option &&
                              styles.hostFlowCostChoiceBodyActive,
                          ]}
                        >
                          {option === "free"
                            ? "No payment needed"
                            : "Each player pays to join"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {costMode === "paid" && (
                    <View style={styles.hostFlowPriceInput}>
                      <Text style={styles.hostFlowPricePrefix}>$</Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        onChangeText={(value) => {
                          setCost(value);
                          if (value !== "0") setCostMode("paid");
                        }}
                        placeholder="10.00"
                        placeholderTextColor={colors.muted}
                        style={styles.hostFlowPriceField}
                        value={cost}
                      />
                      <Text style={styles.hostFlowPriceSuffix}>per player</Text>
                    </View>
                  )}
                  <Text style={styles.hostFlowLabel}>NOTE</Text>
                  <TextInput
                    multiline
                    onChangeText={setNote}
                    placeholder="Parking, court number, what to bring…"
                    placeholderTextColor={colors.muted}
                    style={[styles.hostFlowInput, styles.hostFlowTextarea]}
                    value={note}
                  />
                  <View style={styles.hostFlowToggle}>
                    <View style={styles.flex}>
                      <Text style={styles.hostFlowToggleTitle}>
                        Record results
                      </Text>
                      <Text style={styles.hostFlowToggleBody}>
                        Let confirmed players submit the final score.
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Toggle Record results"
                      onValueChange={setRecordMatches}
                      thumbColor="#ffffff"
                      trackColor={{
                        false: rgba(colors.overlayRgb, 0.16),
                        true: colors.aqua,
                      }}
                      value={recordMatches}
                    />
                  </View>
                </>
              )}

              {step === 4 && (
                <>
                  <Text style={styles.hostFlowTitle}>Ready to create?</Text>
                  <Text style={styles.hostFlowBody}>
                    Review the match exactly as players will see it.
                  </Text>
                  <View style={styles.hostFlowReviewCard}>
                    <Text style={styles.hostFlowReviewTitle}>{title}</Text>
                    <Text style={styles.hostFlowReviewWhen}>
                      {start.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      ·{" "}
                      {start.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                    <Text style={styles.hostFlowReviewVenue}>{venueName}</Text>
                    <View style={styles.hostFlowReviewRule} />
                    <View style={styles.hostFlowReviewGrid}>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>MATCH</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          {matchType === "competitive"
                            ? "Competitive"
                            : "Casual"}{" "}
                          · {format}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>PLAYERS</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          {selectedPlayers.length + 1} in ·{" "}
                          {capacity - selectedPlayers.length - 1} available
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>ACCESS</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          {visibility === "public" ? "Public" : "Link only"} ·{" "}
                          {genderPreference}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>PRICE</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          {costMode === "paid" && Number(cost) > 0
                            ? `$${Number(cost).toFixed(2)} / place`
                            : "Free"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.hostFlowTrust}>
                    <Text style={styles.hostFlowTrustMark}>✓</Text>
                    <Text style={styles.hostFlowTrustText}>
                      Added players are locked into the initial roster. They
                      will see that you added them when they open the match.
                    </Text>
                  </View>
                </>
              )}

              {error && <Text style={styles.formError}>{error}</Text>}
            </ScrollView>
            <View style={styles.hostFlowFooter}>
              {step > 0 && (
                <Pressable
                  disabled={busy}
                  onPress={() => {
                    setError(undefined);
                    setStep((current) => Math.max(0, current - 1));
                  }}
                  style={styles.hostFlowBack}
                >
                  <Text style={styles.hostFlowBackText}>Back</Text>
                </Pressable>
              )}
              <Pressable
                disabled={busy || (step === 4 && mode === "preview")}
                onPress={() => (step === 4 ? void publish() : nextStep())}
                style={[
                  styles.hostFlowContinue,
                  (busy || (step === 4 && mode === "preview")) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.hostFlowContinueText}>
                  {step < 4
                    ? "Continue"
                    : mode === "preview"
                      ? "Sign in to publish"
                      : busy
                        ? "Publishing…"
                        : "Create match"}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </>
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
    active === "health" ||
    active === "wallet" ||
    active === "predictions" ||
    active === "performance" ||
    active === "messages"
      ? "you"
      : active === "score" || active === "video"
        ? "play"
        : active;
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
            tab.key === "play" && styles.tabItemCenter,
            selectedTab === tab.key && styles.tabItemActive,
          ]}
        >
          <Text
            style={[
              styles.tabIcon,
              selectedTab === tab.key && styles.tabActive,
              tab.key === "play" && styles.tabCenterIcon,
            ]}
          >
            {tab.icon}
          </Text>
          <Text
            style={[
              styles.tabLabel,
              selectedTab === tab.key && styles.tabActive,
              tab.key === "play" && styles.tabCenterLabel,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function VideoTransferBanner({
  onPress,
  status,
}: {
  readonly onPress: () => void;
  readonly status: VideoTransferStatus;
}) {
  const progress = Math.max(0, Math.min(1, status.progress ?? 0));
  const active =
    status.stage === "importing" ||
    status.stage === "uploading" ||
    status.stage === "processing";
  return (
    <Pressable
      accessibilityLabel={`${status.title}. ${status.detail}. Open video uploads.`}
      onPress={onPress}
      style={styles.videoTransferBanner}
    >
      <View style={styles.videoTransferMark}>
        {active ? (
          <ActivityIndicator color={colors.aqua} size="small" />
        ) : (
          <Text style={styles.videoTransferMarkText}>
            {status.stage === "complete" ? "✓" : "⇅"}
          </Text>
        )}
      </View>
      <View style={styles.videoTransferCopy}>
        <View style={styles.videoTransferHeading}>
          <Text style={styles.videoTransferTitle}>{status.title}</Text>
          {status.progress !== undefined && (
            <Text style={styles.videoTransferPercent}>
              {Math.round(progress * 100)}%
            </Text>
          )}
        </View>
        <Text numberOfLines={2} style={styles.videoTransferDetail}>
          {status.detail}
        </Text>
        {status.progress !== undefined && (
          <View style={styles.videoTransferTrack}>
            <View
              style={[
                styles.videoTransferFill,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>
        )}
      </View>
      <Text style={styles.videoTransferOpen}>View ›</Text>
    </Pressable>
  );
}

function WatchScoreInbox({
  onReview,
}: {
  readonly onReview: (draft: WatchScoreDraft) => void;
}) {
  const [draft, setDraft] = useState<WatchScoreDraft | null>(null);

  useEffect(() => {
    setDraft(getPendingWatchScoreDraft());
    return subscribeToWatchScoreDraft(setDraft);
  }, []);

  if (!draft) return null;

  const review = () => {
    selectionHaptic();
    onReview(draft);
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
  const [messagesOpenToSupport, setMessagesOpenToSupport] = useState(false);
  const [messagesConversationId, setMessagesConversationId] =
    useState<string>();
  const [messagingUnreadCount, setMessagingUnreadCount] = useState(0);
  const [eventIndex, setEventIndex] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string>();
  const [courtFinderOpen, setCourtFinderOpen] = useState(false);
  const [courtBookingRequest, setCourtBookingRequest] =
    useState<CourtBookingRequest>();
  const [organizationSlug, setOrganizationSlug] = useState<string>();
  const [organizationVenueId, setOrganizationVenueId] = useState<string>();
  const [organizationHostSeed, setOrganizationHostSeed] =
    useState<HostedMatchSeed>();
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [organizationCoach, setOrganizationCoach] = useState<MobileCoach>();
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [artworkStudioOpen, setArtworkStudioOpen] = useState(false);
  const [watchScoreDraft, setWatchScoreDraft] = useState<WatchScoreDraft>();
  const [videoTransfer, setVideoTransfer] = useState<VideoTransferStatus>();
  const [discoverIntent, setDiscoverIntent] = useState<{
    readonly key: number;
    readonly kind: Exclude<HomeQuickAction, "record-video" | "upload-score">;
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
    if (!videoTransfer) return;
    if (
      videoTransfer.stage !== "complete" &&
      videoTransfer.stage !== "processing"
    ) {
      return;
    }
    const timeout = setTimeout(
      () => setVideoTransfer(undefined),
      videoTransfer.stage === "complete" ? 7_500 : 11_000,
    );
    return () => clearTimeout(timeout);
  }, [videoTransfer]);

  useEffect(() => {
    const openLiveActivity = (url: string | null) => {
      if (url?.startsWith("duna://messages")) {
        setEventIndex(null);
        const conversationId = url.match(/^duna:\/\/messages\/([^/?#]+)/)?.[1];
        const decoded = conversationId
          ? decodeURIComponent(conversationId)
          : undefined;
        setMessagesOpenToSupport(decoded === "support");
        setMessagesConversationId(
          decoded && decoded !== "support" ? decoded : undefined,
        );
        setTab("messages");
        return;
      }
      const bookingMatch = url?.match(/^duna:\/\/booking\/([^/?#]+)/);
      if (bookingMatch?.[1]) {
        setEventIndex(null);
        setBookingId(decodeURIComponent(bookingMatch[1]));
        setTab("plans");
        return;
      }
      const match = url?.match(/^duna:\/\/live\/([^/]+)\//);
      if (!match) return;
      setEventIndex(null);
      setTab(
        match[1] === "upload"
          ? "video"
          : match[1] === "upcoming"
            ? "home"
            : "discover",
      );
    };
    void Linking.getInitialURL().then(openLiveActivity);
    const subscription = Linking.addEventListener("url", ({ url }) =>
      openLiveActivity(url),
    );
    return () => subscription.remove();
  }, []);

  useEffect(
    () =>
      listenForMessagingNotificationResponses(() => {
        void runtime.messagingDelivery?.syncAll().catch(() => undefined);
        void runtime.client?.messaging.inbox
          .query({ asPrincipal: "user" })
          .then((inbox) => setMessagingUnreadCount(inbox.totalUnread))
          .catch(() => undefined);
      }),
    [runtime.client, runtime.messagingDelivery],
  );

  useEffect(() => {
    if (runtime.mode !== "live" || !runtime.client) return;
    const refreshUnread = () =>
      runtime
        .client!.messaging.inbox.query({ asPrincipal: "user" })
        .then((inbox) => setMessagingUnreadCount(inbox.totalUnread))
        .catch(() => undefined);
    void refreshUnread();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshUnread();
    });
    const interval = setInterval(() => void refreshUnread(), 30_000);
    return () => {
      appState.remove();
      clearInterval(interval);
    };
  }, [runtime.client, runtime.mode]);

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

  useEffect(() => {
    if (tab !== "score" && watchScoreDraft) setWatchScoreDraft(undefined);
  }, [tab, watchScoreDraft]);

  activePalette = theme === "dark" ? darkColors : lightColors;
  activeStyles = theme === "dark" ? darkStyles : lightStyles;

  const openHomeAction = (action: HomeQuickAction) => {
    if (action === "upload-score") {
      setWatchScoreDraft(undefined);
      setTab("score");
      return;
    }
    if (action === "record-video") {
      setTab("video");
      return;
    }
    if (action === "book-court") {
      setCourtFinderOpen(true);
      return;
    }
    setDiscoverIntent({ key: Date.now(), kind: action });
    setTab("discover");
  };
  const selectedBooking = runtime.dashboard?.bookings.find(
    (booking) => booking.id === bookingId,
  );

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
      <MessagingNavigationContext.Provider
        value={{
          open: (support) => {
            setMessagesConversationId(undefined);
            setMessagesOpenToSupport(support);
            setTab("messages");
          },
          openProfile: () => setTab("you"),
          unreadCount: messagingUnreadCount,
        }}
      >
        <PlayerProfileProvider palette={colors}>
          <HealthHistorySyncAgent paused={tab === "health"} runtime={runtime} />
          {runtime.dashboard ? (
            <PlayerCalendarAutoSync bookings={runtime.dashboard.bookings} />
          ) : null}
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
                  <HomeScreen
                    onAction={openHomeAction}
                    onBook={setEventIndex}
                    onOpenBooking={setBookingId}
                    onPredictions={() => setTab("predictions")}
                  />
                )}
                {tab === "discover" && (
                  <DiscoverScreen
                    intent={discoverIntent}
                    onBook={setEventIndex}
                    onOrganization={setOrganizationSlug}
                  />
                )}
                {tab === "score" && (
                  <ScoreUploadScreen
                    initialPlayedAt={watchScoreDraft?.capturedAt}
                    initialSets={watchScoreDraft?.sets}
                    key={watchScoreDraft?.draftId ?? "score-upload"}
                    onComplete={() => setTab("performance")}
                    palette={colors}
                  />
                )}
                {tab === "play" && (
                  <PlayLauncherScreen onAction={openHomeAction} />
                )}
                {tab === "plans" && (
                  <PlansScreen
                    onBook={setEventIndex}
                    onOpenBooking={setBookingId}
                    onReserveCourtVenue={setCourtBookingRequest}
                  />
                )}
                <VideoStudioScreen
                  active={tab === "video"}
                  onCreateMatch={() => setCreateMatchOpen(true)}
                  onTransferStatus={setVideoTransfer}
                  runtime={runtime}
                />
                {tab === "wallet" && (
                  <WalletScreen onClose={() => setTab("you")} />
                )}
                {tab === "predictions" && (
                  <PredictionPortfolioScreen onBack={() => setTab("wallet")} />
                )}
                {tab === "you" && (
                  <ProfileHubScreen
                    onArtwork={() => setArtworkStudioOpen(true)}
                    onDestination={(destination) => setTab(destination)}
                    onEditProfile={() => setProfileEditorOpen(true)}
                    onOrganization={setOrganizationSlug}
                  />
                )}
                {tab === "health" && (
                  <HealthScreen onBack={() => setTab("you")} theme={theme} />
                )}
                {tab === "performance" && (
                  <PerformanceScreen
                    onArtwork={() => setArtworkStudioOpen(true)}
                    onBack={() => setTab("you")}
                    onEditProfile={() => setProfileEditorOpen(true)}
                    onHealth={() => setTab("health")}
                    onPredictions={() => setTab("predictions")}
                    onWallet={() => setTab("wallet")}
                  />
                )}
                {tab === "messages" && (
                  <PlayerMessagingScreen
                    initialConversationId={messagesConversationId}
                    initialSupport={messagesOpenToSupport}
                    onUnreadCountChange={setMessagingUnreadCount}
                    onClose={() => {
                      setMessagesConversationId(undefined);
                      setMessagesOpenToSupport(false);
                      setTab("home");
                    }}
                    palette={{
                      canvas: colors.canvas,
                      surface: colors.depth,
                      surfaceAlt: colors.navyLift,
                      border: rgba(colors.overlayRgb, 0.12),
                      text: colors.bone,
                      muted: colors.muted,
                      accent: colors.aqua,
                      onAccent: colors.onAccent,
                      positive: colors.positive,
                      warning: colors.warning,
                      danger: colors.danger,
                    }}
                  />
                )}
              </Animated.View>
              {videoTransfer && (
                <VideoTransferBanner
                  onPress={() => setTab("video")}
                  status={videoTransfer}
                />
              )}
              {tab !== "messages" && <TabBar active={tab} onChange={setTab} />}
              <BookingModal
                eventIndex={eventIndex}
                onClose={() => setEventIndex(null)}
              />
              <ProfileEditorModal
                onClose={() => setProfileEditorOpen(false)}
                visible={profileEditorOpen}
              />
              <PlayerArtworkModal
                onClose={() => setArtworkStudioOpen(false)}
                visible={artworkStudioOpen}
              />
              <BookingManagementModal
                booking={selectedBooking as ManagedBooking | undefined}
                client={runtime.client}
                onClose={() => setBookingId(undefined)}
                onUpdated={runtime.refresh}
                visible={Boolean(selectedBooking)}
              />
              <VenueFinderModal
                onClose={() => setCourtFinderOpen(false)}
                onSelect={(request) => {
                  setCourtFinderOpen(false);
                  setCourtBookingRequest(request);
                }}
                visible={courtFinderOpen}
              />
              <VenueBookingModal
                initialDate={courtBookingRequest?.date}
                initialDurationMinutes={courtBookingRequest?.durationMinutes}
                onClose={() => setCourtBookingRequest(undefined)}
                onHostReady={(seed) => {
                  setCourtBookingRequest(undefined);
                  setTimeout(() => setOrganizationHostSeed(seed), 280);
                }}
                onOpenMatch={(matchId, matchSlug) => {
                  const index = (runtime.dashboard?.events ?? []).findIndex(
                    (event) => event.id === matchId,
                  );
                  setCourtBookingRequest(undefined);
                  setTimeout(() => {
                    if (index >= 0) {
                      setEventIndex(index);
                      return;
                    }
                    void WebBrowser.openBrowserAsync(
                      `${dunaWebUrl}/events/${encodeURIComponent(matchSlug)}`,
                    );
                  }, 280);
                }}
                venueId={courtBookingRequest?.venueId}
                visible={Boolean(courtBookingRequest)}
              />
              <OrganizationExperienceModal
                onClose={() => setOrganizationSlug(undefined)}
                onOpenCoach={(coach) => {
                  setOrganizationCoach(coach);
                  setOrganizationSlug(undefined);
                }}
                onOpenEvent={(eventId) => {
                  const index = (runtime.dashboard?.events ?? []).findIndex(
                    (event) => event.id === eventId,
                  );
                  setOrganizationSlug(undefined);
                  if (index >= 0) setEventIndex(index);
                }}
                onOpenVenue={(venueId) => {
                  setOrganizationSlug(undefined);
                  setOrganizationVenueId(venueId);
                }}
                slug={organizationSlug}
                theme={theme}
              />
              <VenueBookingModal
                onClose={() => setOrganizationVenueId(undefined)}
                onHostReady={(seed) => {
                  setOrganizationVenueId(undefined);
                  setTimeout(() => setOrganizationHostSeed(seed), 280);
                }}
                onOpenMatch={(matchId, matchSlug) => {
                  const index = (runtime.dashboard?.events ?? []).findIndex(
                    (event) => event.id === matchId,
                  );
                  setOrganizationVenueId(undefined);
                  setTimeout(() => {
                    if (index >= 0) {
                      setEventIndex(index);
                      return;
                    }
                    void WebBrowser.openBrowserAsync(
                      `${dunaWebUrl}/events/${encodeURIComponent(matchSlug)}`,
                    );
                  }, 280);
                }}
                venueId={organizationVenueId}
                visible={Boolean(organizationVenueId)}
              />
              <PickupModal
                initialCourtBooking={organizationHostSeed}
                onClose={() => {
                  setCreateMatchOpen(false);
                  setOrganizationHostSeed(undefined);
                }}
                onCreated={() => {
                  setCreateMatchOpen(false);
                  setOrganizationHostSeed(undefined);
                }}
                visible={Boolean(organizationHostSeed) || createMatchOpen}
              />
              <CoachProfileModal
                coach={organizationCoach}
                onClose={() => setOrganizationCoach(undefined)}
              />
              <WatchScoreInbox
                onReview={(draft) => {
                  setWatchScoreDraft(draft);
                  setTab("score");
                }}
              />
            </View>
          </SafeAreaView>
        </PlayerProfileProvider>
      </MessagingNavigationContext.Provider>
    </ThemeContext.Provider>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFellixFonts();
  const [showLaunchExperience, setShowLaunchExperience] = useState(true);

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <PlayerRuntimeProvider>
          <DunaApp />
        </PlayerRuntimeProvider>
        {showLaunchExperience && (
          <PlayerLaunchExperience
            onComplete={() => setShowLaunchExperience(false)}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

function createStyles(palette: Palette) {
  activePalette = palette;
  return StyleSheet.create({
    safe: { backgroundColor: colors.canvas, flex: 1 },
    app: { backgroundColor: colors.canvas, flex: 1 },
    animatedScreen: { flex: 1 },
    videoTransferBanner: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.14),
      borderRadius: 18,
      borderWidth: 1,
      bottom: 94,
      elevation: 12,
      flexDirection: "row",
      gap: 10,
      left: 16,
      padding: 12,
      position: "absolute",
      right: 16,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      zIndex: 80,
    },
    videoTransferMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.12),
      borderRadius: 17,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    videoTransferMarkText: {
      color: colors.aqua,
      fontSize: 16,
      fontWeight: "900",
    },
    videoTransferCopy: { flex: 1, gap: 2, minWidth: 0 },
    videoTransferHeading: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    videoTransferTitle: {
      color: colors.bone,
      flex: 1,
      fontSize: 12,
      fontWeight: "900",
    },
    videoTransferPercent: {
      color: colors.aqua,
      fontSize: 11,
      fontWeight: "900",
    },
    videoTransferDetail: { color: colors.muted, fontSize: 10, lineHeight: 14 },
    videoTransferTrack: {
      backgroundColor: rgba(colors.accentRgb, 0.14),
      borderRadius: 2,
      height: 4,
      marginTop: 4,
      overflow: "hidden",
    },
    videoTransferFill: { backgroundColor: colors.aqua, height: 4 },
    videoTransferOpen: { color: colors.aqua, fontSize: 10, fontWeight: "900" },
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
    venueFinderSafe: { backgroundColor: colors.canvas, flex: 1 },
    venueFinderHeader: {
      alignItems: "flex-start",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 14,
      padding: 20,
      paddingTop: 12,
    },
    venueFinderTitle: {
      color: colors.bone,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -1.1,
      marginTop: 5,
    },
    venueFinderBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
      maxWidth: 300,
    },
    venueFinderClose: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.14),
      borderRadius: 22,
      borderWidth: 1,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    venueFinderCloseText: { color: colors.bone, fontSize: 29, lineHeight: 32 },
    venueFinderContent: { gap: 13, padding: 20, paddingBottom: 46 },
    venueFinderLocationRow: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      padding: 13,
    },
    venueFinderLocationIcon: {
      color: colors.aqua,
      fontSize: 22,
      fontWeight: "900",
    },
    venueFinderLocationTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
    },
    venueFinderLocationBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 3,
    },
    venueFinderSearch: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 16,
      borderWidth: 1,
      color: colors.bone,
      fontSize: 15,
      minHeight: 54,
      paddingHorizontal: 15,
    },
    venueFinderLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.15,
      marginTop: 6,
    },
    venueFinderDayRow: { flexDirection: "row", gap: 8, paddingRight: 20 },
    venueFinderDay: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 16,
      borderWidth: 1,
      height: 66,
      justifyContent: "center",
      width: 56,
    },
    venueFinderDayActive: {
      backgroundColor: colors.aquaDeep,
      borderColor: colors.aqua,
    },
    venueFinderDayName: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
    },
    venueFinderDayNumber: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 20,
      marginTop: 2,
    },
    venueFinderDayTextActive: { color: "#ffffff" },
    venueFinderDurationRow: { flexDirection: "row", gap: 8 },
    venueFinderDuration: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 48,
    },
    venueFinderDurationActive: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    venueFinderDurationText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    venueFinderDurationTextActive: { color: colors.onAccent },
    venueFinderResults: { gap: 9 },
    venueFinderResult: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 78,
      padding: 13,
    },
    venueFinderResultMark: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 14,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    venueFinderResultMarkText: { color: colors.aqua, fontSize: 20 },
    venueFinderResultTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
    },
    venueFinderResultMeta: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 4,
    },
    venueFinderResultArrow: { color: colors.aqua, fontSize: 25, marginLeft: 6 },
    venueFinderEmpty: {
      backgroundColor: rgba(colors.warningRgb, 0.07),
      borderColor: rgba(colors.warningRgb, 0.2),
      borderRadius: 17,
      borderWidth: 1,
      padding: 16,
    },
    venueFinderEmptyTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    venueFinderEmptyBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 5,
    },
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
    bookingCalendarInstruction: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 5,
    },
    bookingCalendarClose: {
      alignItems: "center",
      borderColor: colors.sand,
      borderRadius: 22,
      borderWidth: 1.5,
      height: 48,
      justifyContent: "center",
      width: 48,
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
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
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
      alignSelf: "stretch",
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 20,
      borderWidth: 1,
      flexGrow: 0,
      flexShrink: 0,
      padding: 10,
      width: "100%",
    },
    bookingCalendarMonthWide: { flex: 1 },
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
      height: 40,
      width: "14.285714%",
    },
    bookingCalendarCell: {
      alignItems: "center",
      height: 40,
      justifyContent: "center",
      width: "14.285714%",
    },
    bookingCalendarDay: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: "center",
      padding: 3,
      height: 36,
      width: 36,
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
      fontFamily: "Archivo-Table",
      fontSize: 13,
      fontWeight: "900",
    },
    bookingCalendarDayTextSelected: { color: "#ffffff" },
    bookingCalendarMarkers: {
      bottom: 4,
      flexDirection: "row",
      gap: 3,
      position: "absolute",
    },
    bookingCalendarMarker: {
      borderRadius: 3,
      height: 5,
      width: 5,
    },
    bookingCalendarMarkerBooking: { backgroundColor: "#4b8fc9" },
    bookingCalendarMarkerEvent: { backgroundColor: colors.flare },
    bookingCalendarAvailability: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 14,
      padding: 16,
    },
    bookingCalendarAvailabilityButton: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 14,
      justifyContent: "center",
      marginTop: 14,
      minHeight: 56,
      paddingHorizontal: 16,
    },
    bookingCalendarAvailabilityButtonDisabled: { opacity: 0.42 },
    bookingCalendarAvailabilityButtonText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "900",
    },
    bookingCalendarAvailabilityEyebrow: {
      color: colors.sand,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    bookingCalendarAvailabilityFact: {
      backgroundColor: colors.navy,
      borderRadius: 999,
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    bookingCalendarAvailabilityFacts: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 10,
    },
    bookingCalendarAvailabilityTitle: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 5,
    },
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
    bookingTimeSectionLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.15,
      marginBottom: 9,
      marginTop: 16,
    },
    bookingTimeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    bookingTimeOption: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "space-between",
      minHeight: 82,
      padding: 11,
      width: "31.5%",
    },
    bookingTimeOptionMatch: {
      borderColor: rgba(colors.accentRgb, 0.55),
    },
    bookingTimeOptionActive: {
      backgroundColor: colors.aquaDeep,
      borderColor: colors.aqua,
    },
    bookingTimeOptionTime: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
    },
    bookingTimeOptionTimeActive: { color: "#ffffff" },
    bookingTimeRoster: {
      alignItems: "center",
      flexDirection: "row",
      marginTop: 8,
    },
    bookingTimeAvatar: {
      borderColor: colors.depth,
      borderRadius: 11,
      borderWidth: 2,
      height: 22,
      marginRight: -4,
      width: 22,
    },
    bookingTimeAvatarFallback: {
      backgroundColor: colors.aqua,
      borderColor: colors.depth,
      borderRadius: 11,
      borderWidth: 2,
      color: colors.ink,
      fontSize: 10,
      fontWeight: "900",
      height: 22,
      lineHeight: 18,
      marginRight: -4,
      overflow: "hidden",
      textAlign: "center",
      width: 22,
    },
    bookingTimeOptionMeta: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 7,
    },
    bookingTimeOptionMetaActive: { color: rgba("255,255,255", 0.72) },
    bookingOpenMatchSection: { marginTop: 4 },
    bookingOpenMatch: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.22),
      borderRadius: 18,
      borderWidth: 1,
      marginBottom: 10,
      padding: 15,
    },
    bookingOpenMatchEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    bookingOpenMatchTitle: {
      color: colors.bone,
      fontSize: 17,
      fontWeight: "900",
      marginTop: 4,
    },
    bookingOpenMatchPriceBlock: {
      alignItems: "flex-end",
      marginLeft: 12,
    },
    bookingOpenMatchPrice: {
      color: colors.aqua,
      fontSize: 16,
      fontWeight: "900",
    },
    bookingOpenMatchRoster: {
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 15,
      paddingBottom: 14,
    },
    bookingOpenMatchPlayer: {
      alignItems: "center",
      gap: 5,
      width: 60,
    },
    bookingOpenMatchAvatar: {
      borderRadius: 21,
      height: 42,
      width: 42,
    },
    bookingOpenMatchAvatarFallback: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 21,
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "900",
      height: 42,
      lineHeight: 42,
      overflow: "hidden",
      textAlign: "center",
      width: 42,
    },
    bookingOpenMatchAvailable: {
      borderColor: rgba(colors.accentRgb, 0.45),
      borderRadius: 21,
      borderWidth: 1,
      color: colors.aqua,
      fontSize: 22,
      height: 42,
      lineHeight: 38,
      overflow: "hidden",
      textAlign: "center",
      width: 42,
    },
    bookingOpenMatchPlayerName: {
      color: colors.muted,
      fontSize: 10,
      maxWidth: 60,
      textAlign: "center",
    },
    bookingOpenMatchFooter: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 13,
    },
    bookingOpenMatchSpots: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
    },
    bookingOpenMatchJoin: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 14,
    },
    bookingCreateMatchSection: { marginTop: 3 },
    bookingCourtChoice: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 9,
      padding: 14,
    },
    bookingCourtActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
      width: "100%",
    },
    bookingHostButton: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 12,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
    },
    bookingHostButtonText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "900",
    },
    bookingPrivateButton: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.16),
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
    },
    bookingPrivateButtonText: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "900",
    },
    bookingHostIntent: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginTop: 13,
      padding: 14,
    },
    bookingHostIntentIcon: {
      color: colors.aqua,
      fontSize: 22,
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
    bookingLookingButton: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.07),
      borderColor: rgba(colors.accentRgb, 0.26),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 15,
      padding: 14,
    },
    bookingLookingButtonActive: {
      backgroundColor: rgba(colors.positiveRgb, 0.1),
      borderColor: colors.positive,
    },
    bookingLookingIcon: {
      color: colors.aqua,
      fontSize: 22,
      fontWeight: "900",
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
    bookingPartnerImage: {
      borderRadius: 22,
      height: 44,
      width: 44,
    },
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
    bookingSelectedTime: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.09),
      borderColor: rgba(colors.accentRgb, 0.28),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginBottom: 4,
      padding: 14,
    },
    bookingSelectedTimeLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    bookingSelectedTimeValue: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 4,
    },
    bookingSelectedTimeAction: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    bookingPlayerPickerLaunch: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderColor: rgba(colors.accentRgb, 0.25),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginTop: 14,
      minHeight: 76,
      padding: 13,
    },
    bookingPlayerPickerPlus: {
      alignItems: "center",
      borderColor: colors.aqua,
      borderRadius: 23,
      borderWidth: 1.5,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    bookingPlayerPickerPlusText: {
      color: colors.aqua,
      fontSize: 26,
      lineHeight: 30,
    },
    bookingPlayerPickerTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    bookingPlayerPickerBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 3,
    },
    bookingImportContact: {
      alignSelf: "flex-start",
      marginTop: 12,
      minHeight: 34,
      justifyContent: "center",
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
    hostFlowHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    hostFlowClose: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    hostFlowEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
    },
    hostFlowHeaderTitle: {
      color: colors.bone,
      fontSize: 19,
      fontWeight: "900",
      marginTop: 2,
    },
    hostFlowProgressValue: {
      color: colors.muted,
      fontFamily: "Archivo-Block",
      fontSize: 10,
      paddingRight: 6,
    },
    hostFlowProgressTrack: {
      backgroundColor: rgba(colors.overlayRgb, 0.07),
      height: 3,
    },
    hostFlowProgressFill: {
      backgroundColor: colors.aqua,
      height: 3,
    },
    hostFlowContent: { padding: 20, paddingBottom: 130 },
    hostFlowTitle: {
      color: colors.bone,
      fontSize: 31,
      fontWeight: "900",
      letterSpacing: -1.1,
      lineHeight: 36,
    },
    hostFlowBody: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    hostFlowLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      marginBottom: 9,
      marginTop: 24,
    },
    hostFlowInput: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 16,
      borderWidth: 1,
      color: colors.bone,
      fontSize: 16,
      marginTop: 20,
      minHeight: 56,
      paddingHorizontal: 15,
    },
    hostFlowInputRow: { flexDirection: "row", gap: 10, marginTop: -10 },
    hostFlowChoiceGrid: { flexDirection: "row", gap: 10 },
    hostFlowChoice: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      minHeight: 116,
      padding: 15,
    },
    hostFlowChoiceActive: {
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderColor: colors.aqua,
      borderWidth: 2,
    },
    hostFlowChoiceTitle: {
      color: colors.bone,
      fontSize: 17,
      fontWeight: "900",
    },
    hostFlowChoiceBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 7,
    },
    hostFlowChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    hostFlowChip: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 15,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 15,
    },
    hostFlowChipActive: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    hostFlowChipText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
    },
    hostFlowChipTextActive: { color: colors.onAccent },
    hostFlowHorizontal: { marginHorizontal: -20, paddingHorizontal: 20 },
    hostFlowCourt: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 18,
      borderWidth: 1,
      marginRight: 10,
      minHeight: 96,
      padding: 15,
      width: 220,
    },
    hostFlowCourtActive: {
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderColor: colors.aqua,
      borderWidth: 2,
    },
    hostFlowLinkedCourt: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.24),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginBottom: 8,
      padding: 14,
    },
    hostFlowLinkedCourtMark: {
      alignSelf: "flex-start",
      color: colors.aqua,
      fontSize: 19,
      fontWeight: "900",
    },
    hostFlowLockedPlace: {
      alignItems: "center",
      backgroundColor: rgba(colors.positiveRgb, 0.08),
      borderColor: rgba(colors.positiveRgb, 0.25),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 76,
      padding: 14,
    },
    hostFlowLockedPlaceMark: {
      color: colors.positive,
      fontSize: 20,
      fontWeight: "900",
    },
    hostFlowLockedPlaceTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    hostFlowLockedPlaceBody: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 4,
    },
    hostFlowPlaceMapPreview: {
      backgroundColor: colors.navyLift,
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 17,
      borderWidth: 1,
      height: 120,
      marginTop: 10,
      overflow: "hidden",
      position: "relative",
    },
    hostFlowPlaceMapGrid: {
      backgroundColor: rgba(colors.accentRgb, 0.06),
      borderColor: rgba(colors.accentRgb, 0.16),
      borderWidth: 1,
      height: 188,
      left: -28,
      position: "absolute",
      top: -35,
      transform: [{ rotate: "-21deg" }],
      width: 260,
    },
    hostFlowPlaceMapPin: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderColor: "#ffffff",
      borderRadius: 22,
      borderWidth: 3,
      height: 44,
      justifyContent: "center",
      left: "47%",
      position: "absolute",
      top: 27,
      width: 44,
    },
    hostFlowPlaceMapPinText: {
      color: colors.onAccent,
      fontSize: 22,
      fontWeight: "900",
    },
    hostFlowPlaceMapLabel: {
      backgroundColor: rgba(colors.inkRgb, 0.8),
      bottom: 10,
      left: 10,
      maxWidth: "90%",
      paddingHorizontal: 9,
      paddingVertical: 6,
      position: "absolute",
    },
    hostFlowPlaceMapLabelText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.55,
    },
    hostFlowReserveVenue: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.09),
      borderColor: colors.aqua,
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginTop: 10,
      minHeight: 80,
      padding: 14,
    },
    hostFlowReserveVenueTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    hostFlowReserveVenueBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },
    hostFlowReserveVenueArrow: { color: colors.aqua, fontSize: 25 },
    hostFlowDatePickerCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 17,
      overflow: "hidden",
      paddingHorizontal: 12,
      paddingTop: 14,
    },
    hostFlowDatePickerLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    hostFlowDatePickerBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 5,
    },
    hostFlowCourtTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    hostFlowCourtMeta: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 7,
    },
    hostFlowVenueChip: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 14,
      borderWidth: 1,
      marginRight: 8,
      minHeight: 46,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    hostFlowVenueChipActive: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    hostFlowVenueChipText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
    },
    hostFlowVenueChipTextActive: { color: colors.onAccent },
    hostFlowDay: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 16,
      borderWidth: 1,
      height: 70,
      justifyContent: "center",
      marginRight: 8,
      width: 58,
    },
    hostFlowDayActive: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    hostFlowDayName: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    hostFlowDayNumber: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 19,
      marginTop: 3,
    },
    hostFlowDayTextActive: { color: colors.onAccent },
    hostFlowRosterSummary: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 20,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 22,
      padding: 16,
    },
    hostFlowRosterCount: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 25,
    },
    hostFlowRosterMeta: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 3,
    },
    hostFlowAddPlayers: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 15,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 15,
    },
    hostFlowAddPlayersText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    hostFlowLookingSection: {
      backgroundColor: rgba(colors.accentRgb, 0.06),
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 20,
      borderWidth: 1,
      gap: 9,
      marginTop: 16,
      padding: 14,
    },
    hostFlowLookingHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    hostFlowLabelInline: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    hostFlowLookingTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
      marginTop: 3,
    },
    hostFlowLookingCount: {
      color: colors.aqua,
      fontFamily: "Archivo-Block",
      fontSize: 20,
    },
    hostFlowLookingBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
    },
    hostFlowLookingPlayer: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 72,
      padding: 10,
    },
    hostFlowLookingNote: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 4,
    },
    hostFlowLookingInvite: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 42,
      minWidth: 66,
      paddingHorizontal: 10,
    },
    hostFlowLookingInviteSelected: {
      backgroundColor: colors.positive,
    },
    hostFlowLookingInviteText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
    hostFlowLookingEmpty: {
      color: colors.muted,
      fontSize: 11,
      fontStyle: "italic",
      lineHeight: 16,
      paddingVertical: 8,
    },
    hostFlowRoster: { gap: 8, marginTop: 16 },
    hostFlowPlayerRow: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 76,
      padding: 12,
    },
    hostFlowPlayerAvatar: { borderRadius: 24, height: 48, width: 48 },
    hostFlowPlayerAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    hostFlowPlayerAvatarText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    hostFlowPlayerName: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    hostFlowPlayerMeta: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 4,
    },
    hostFlowRemovePlayer: {
      alignItems: "center",
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    hostFlowRemovePlayerText: { color: colors.danger, fontSize: 24 },
    hostFlowOpenPlayer: {
      alignItems: "center",
      borderColor: rgba(colors.accentRgb, 0.22),
      borderRadius: 18,
      borderStyle: "dashed",
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 66,
      padding: 11,
    },
    hostFlowOpenPlayerMark: {
      alignItems: "center",
      borderColor: colors.aqua,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    hostFlowOpenPlayerPlus: { color: colors.aqua, fontSize: 20 },
    hostFlowOpenPlayerText: {
      color: colors.aqua,
      fontSize: 13,
      fontWeight: "800",
    },
    hostFlowToggle: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 18,
      minHeight: 76,
      padding: 14,
    },
    hostFlowToggleTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    hostFlowToggleBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
    },
    hostFlowPriceInput: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      minHeight: 58,
      paddingHorizontal: 15,
    },
    hostFlowPricePrefix: {
      color: colors.aqua,
      fontFamily: "Archivo-Block",
      fontSize: 22,
    },
    hostFlowPriceField: {
      color: colors.bone,
      flex: 1,
      fontFamily: "Archivo-Block",
      fontSize: 22,
      minHeight: 56,
      paddingHorizontal: 10,
    },
    hostFlowPriceSuffix: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    hostFlowCostChoiceRow: { flexDirection: "row", gap: 10 },
    hostFlowCostChoice: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 17,
      borderWidth: 1,
      flex: 1,
      minHeight: 84,
      padding: 13,
    },
    hostFlowCostChoiceActive: {
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderColor: colors.aqua,
      borderWidth: 2,
    },
    hostFlowCostChoiceTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
    },
    hostFlowCostChoiceTitleActive: { color: colors.aqua },
    hostFlowCostChoiceBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 5,
    },
    hostFlowCostChoiceBodyActive: { color: colors.bone },
    hostFlowTextarea: {
      minHeight: 112,
      paddingTop: 15,
      textAlignVertical: "top",
    },
    hostFlowReviewCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 24,
      borderWidth: 1,
      marginTop: 22,
      padding: 18,
    },
    hostFlowReviewTitle: {
      color: colors.bone,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    hostFlowReviewWhen: {
      color: colors.aqua,
      fontSize: 14,
      fontWeight: "800",
      marginTop: 8,
    },
    hostFlowReviewVenue: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 5,
    },
    hostFlowReviewRule: {
      backgroundColor: rgba(colors.overlayRgb, 0.08),
      height: 1,
      marginVertical: 18,
    },
    hostFlowReviewGrid: { gap: 18 },
    hostFlowReviewLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    hostFlowReviewValue: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "800",
      marginTop: 5,
      textTransform: "capitalize",
    },
    hostFlowTrust: {
      alignItems: "flex-start",
      backgroundColor: rgba(colors.positiveRgb, 0.08),
      borderColor: rgba(colors.positiveRgb, 0.18),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginTop: 14,
      padding: 14,
    },
    hostFlowTrustMark: {
      color: colors.positive,
      fontSize: 16,
      fontWeight: "900",
    },
    hostFlowTrustText: {
      color: colors.muted,
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
    },
    hostFlowFooter: {
      alignItems: "center",
      backgroundColor: colors.canvas,
      borderTopColor: rgba(colors.overlayRgb, 0.09),
      borderTopWidth: 1,
      bottom: 0,
      flexDirection: "row",
      gap: 10,
      left: 0,
      padding: 18,
      position: "absolute",
      right: 0,
    },
    hostFlowBack: {
      alignItems: "center",
      borderColor: colors.aqua,
      borderRadius: 17,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 56,
      minWidth: 86,
    },
    hostFlowBackText: {
      color: colors.aqua,
      fontSize: 14,
      fontWeight: "900",
    },
    hostFlowContinue: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 17,
      flex: 1,
      justifyContent: "center",
      minHeight: 56,
    },
    hostFlowContinueText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: "900",
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
    offlineModeBanner: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderBottomColor: rgba(colors.accentRgb, 0.22),
      borderBottomWidth: 1,
      gap: 2,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    offlineModeBannerText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.55,
      textAlign: "center",
    },
    offlineModeBannerMeta: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
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
    wordmarkImage: { height: 35, width: 104 },
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
      backgroundColor: colors.danger,
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
    playLauncherIntro: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      marginBottom: 20,
      marginTop: 8,
      maxWidth: 420,
    },
    playLauncherGrid: { gap: 10 },
    playLauncherAction: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      minHeight: 82,
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
    playLauncherIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 15,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    playLauncherIconText: {
      color: colors.aqua,
      fontSize: 21,
      fontWeight: "900",
    },
    playLauncherTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: -0.35,
    },
    playLauncherDetail: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
    },
    playLauncherArrow: {
      color: colors.aqua,
      fontSize: 28,
      lineHeight: 30,
      marginLeft: 4,
    },
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
    homeNextActivity: {
      alignItems: "stretch",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      marginBottom: 14,
      minHeight: 228,
      overflow: "hidden",
    },
    homeNextRoster: {
      alignContent: "center",
      borderRightColor: rgba(colors.overlayRgb, 0.08),
      borderRightWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
      paddingHorizontal: 9,
      paddingVertical: 18,
      width: "44%",
    },
    homeNextPlayer: {
      alignItems: "center",
      minHeight: 82,
      width: "46%",
    },
    homeNextAvatar: {
      borderRadius: 25,
      height: 50,
      width: 50,
    },
    homeNextAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 25,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    homeNextAvatarText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    homeNextAvailableAvatar: {
      alignItems: "center",
      borderColor: rgba(colors.accentRgb, 0.3),
      borderRadius: 25,
      borderWidth: 2,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    homeNextAvailablePlus: { color: colors.aqua, fontSize: 22 },
    homeNextAvailableText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 5,
    },
    homeNextAvailableCount: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 1,
    },
    homeNextPlayerName: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 5,
      maxWidth: "100%",
    },
    homeNextRating: {
      backgroundColor: rgba(colors.warningRgb, 0.16),
      borderRadius: 8,
      color: colors.warning,
      fontFamily: "Archivo-Block",
      fontSize: 10,
      marginTop: 2,
      overflow: "hidden",
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    homeNextActivityInfo: {
      flex: 1,
      justifyContent: "center",
      padding: 16,
    },
    homeNextActivityWhen: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 17,
      marginTop: 8,
    },
    homeNextStatusRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14,
    },
    homeNextDetails: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
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
      minHeight: 246,
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
    playerFollowProfileLink: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 7,
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
    discoverSearchPrimary: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      marginBottom: 16,
      marginTop: 18,
      minHeight: 94,
      padding: 16,
    },
    discoverSearchIconWrap: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    discoverSearchIcon: { color: colors.bone, fontSize: 25 },
    discoverSearchEyebrow: {
      color: colors.flare,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    discoverSearchTitle: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.7,
      marginTop: 4,
    },
    discoverSearchMeta: { color: colors.muted, fontSize: 10, marginTop: 5 },
    discoverSearchArrow: {
      color: colors.flare,
      fontSize: 20,
      fontWeight: "900",
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
      backgroundColor: colors.navyLift,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginBottom: 18,
      marginTop: 12,
      minHeight: 142,
      overflow: "hidden",
      padding: 18,
    },
    proTourEntryEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    proTourEntryTitle: {
      color: colors.bone,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.9,
      lineHeight: 24,
      marginTop: 7,
    },
    proTourEntryMeta: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 5,
    },
    proTourEntryBrands: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 11,
    },
    proTourEntryLive: {
      color: colors.flare,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    proTourEntryArrow: {
      color: colors.bone,
      fontSize: 26,
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
    resultStoryStack: { gap: 14 },
    resultStoryCard: {
      borderRadius: 22,
      borderWidth: 1,
      overflow: "hidden",
    },
    resultStoryCardWon: {
      backgroundColor: colors.resultWin,
      borderColor: colors.resultWinBorder,
    },
    resultStoryCardLost: {
      backgroundColor: colors.resultLoss,
      borderColor: colors.resultLossBorder,
    },
    resultStoryHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      minHeight: 168,
      overflow: "hidden",
      padding: 18,
      position: "relative",
    },
    resultStoryHeaderCopy: {
      maxWidth: "64%",
      minHeight: 132,
      zIndex: 2,
    },
    resultStoryEyebrow: {
      color: colors.ink,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.6,
      lineHeight: 29,
    },
    resultStorySubtitle: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 20,
      marginTop: 8,
    },
    resultStoryRecapLabel: {
      color: rgba(colors.inkRgb, 0.62),
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
      marginTop: "auto",
      paddingTop: 10,
    },
    resultStoryDate: {
      color: rgba(colors.inkRgb, 0.68),
      fontFamily: "Archivo-Block",
      fontSize: 10,
      paddingTop: 4,
      zIndex: 3,
    },
    resultStoryPlayIcon: {
      bottom: -2,
      position: "absolute",
      right: -1,
      zIndex: 1,
    },
    resultStoryScorecard: {
      backgroundColor: colors.depth,
      borderRadius: 17,
      marginHorizontal: 12,
      marginTop: -11,
      overflow: "hidden",
      padding: 12,
    },
    resultStoryTeam: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minHeight: 92,
    },
    resultStoryTeamCompact: { minHeight: 78 },
    resultStoryTeamDense: { minHeight: 68 },
    resultStoryTeamWrapped: { minHeight: 116 },
    resultStoryPlayers: {
      flex: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      minWidth: 0,
    },
    resultStoryPlayer: {
      alignItems: "center",
      justifyContent: "flex-start",
      minHeight: 74,
      minWidth: 0,
      paddingHorizontal: 2,
    },
    resultStoryPlayerCompact: { minHeight: 64, paddingHorizontal: 1 },
    resultStoryPlayerDense: { minHeight: 54, paddingHorizontal: 0 },
    resultStoryAvatar: {
      borderRadius: 20,
      height: 40,
      width: 40,
    },
    resultStoryAvatarCompact: { borderRadius: 15, height: 30, width: 30 },
    resultStoryAvatarDense: { borderRadius: 11, height: 22, width: 22 },
    resultStoryAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    resultStoryAvatarFallbackCompact: {
      borderRadius: 15,
      height: 30,
      width: 30,
    },
    resultStoryAvatarFallbackDense: {
      borderRadius: 11,
      height: 22,
      width: 22,
    },
    resultStoryAvatarText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
    },
    resultStoryAvatarTextDense: { fontSize: 10 },
    resultStoryPlayerName: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 5,
      textAlign: "center",
      width: "100%",
    },
    resultStoryPlayerNameCompact: { fontSize: 10, marginTop: 3 },
    resultStoryPlayerNameDense: { fontSize: 10, marginTop: 2 },
    resultStoryPlayerRating: {
      color: colors.signalInk,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "700",
    },
    resultStoryPlayerRatingDense: { fontSize: 10 },
    resultStoryPlayerRatingPill: {
      alignSelf: "center",
      backgroundColor: colors.signal,
      borderRadius: 999,
      marginTop: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    resultStoryPlayerRatingPillDense: {
      marginTop: 2,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    resultStoryScores: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
      minWidth: 96,
    },
    resultStoryScore: {
      color: colors.muted,
      fontFamily: "Archivo-Block",
      fontSize: 18,
      minWidth: 20,
      textAlign: "center",
    },
    resultStoryScoreWon: { color: colors.bone },
    resultStoryDivider: {
      backgroundColor: rgba(colors.overlayRgb, 0.08),
      height: 1,
    },
    resultStoryFooter: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      paddingBottom: 14,
      paddingHorizontal: 16,
      paddingTop: 11,
    },
    resultStoryVenue: {
      color: colors.muted,
      flex: 1,
      fontSize: 10,
    },
    resultStoryDelta: {
      color: colors.positive,
      fontFamily: "Archivo-Block",
      fontSize: 11,
    },
    resultStoryDeltaNegative: { color: colors.danger },
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
    calendarOpenAction: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
      paddingLeft: 12,
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
    bookingDateLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    bookingTime: { width: 48 },
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
    memberCard: {
      backgroundColor: "#123b45",
      borderColor: "rgba(196, 225, 225, 0.38)",
      borderRadius: 24,
      borderWidth: 1,
      marginTop: 20,
      overflow: "hidden",
      padding: 18,
      position: "relative",
    },
    memberCardLabel: {
      color: "#f4c47f",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.25,
      marginTop: 30,
    },
    memberCardName: {
      color: "#fffdf6",
      fontSize: 29,
      fontWeight: "900",
      letterSpacing: -1.1,
      marginTop: 4,
    },
    memberCardBody: {
      alignItems: "center",
      flexDirection: "row",
      gap: 15,
      marginTop: 18,
    },
    memberCardQr: {
      backgroundColor: "#ffffff",
      borderRadius: 15,
      overflow: "hidden",
      padding: 4,
    },
    memberCardDetails: { flex: 1, gap: 5 },
    memberCardDetailLabel: {
      color: "#f4c47f",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
      marginTop: 4,
    },
    memberCardId: {
      color: "#fffdf6",
      fontSize: 23,
      fontWeight: "900",
      letterSpacing: 2.5,
    },
    memberCardMeta: {
      color: "rgba(255, 253, 246, 0.8)",
      fontSize: 10,
      lineHeight: 15,
    },
    memberCardUpcoming: {
      alignItems: "center",
      backgroundColor: "rgba(255, 253, 246, 0.12)",
      borderColor: "rgba(255, 253, 246, 0.14)",
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 15,
      padding: 11,
    },
    memberCardUpcomingTitle: {
      color: "#fffdf6",
      fontSize: 13,
      fontWeight: "900",
      marginTop: 3,
    },
    memberCardUpcomingArrow: {
      color: "#f4c47f",
      fontSize: 25,
      fontWeight: "900",
    },
    memberCardWalletButton: {
      alignItems: "center",
      backgroundColor: "#000000",
      borderColor: rgba(colors.overlayRgb, 0.2),
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 14,
      minHeight: 46,
      paddingHorizontal: 12,
    },
    memberCardWalletButtonText: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "900",
      textAlign: "center",
    },
    memberCardGlowOne: {
      backgroundColor: "rgba(73, 178, 185, 0.5)",
      borderRadius: 190,
      height: 380,
      position: "absolute",
      right: -230,
      top: -240,
      transform: [{ rotate: "-24deg" }],
      width: 380,
    },
    memberCardGlowTwo: {
      backgroundColor: "rgba(241, 181, 109, 0.26)",
      borderRadius: 180,
      bottom: -275,
      height: 360,
      left: -175,
      position: "absolute",
      transform: [{ rotate: "20deg" }],
      width: 360,
    },
    memberCardTexture: {
      borderColor: "rgba(255, 253, 246, 0.17)",
      borderRadius: 170,
      borderWidth: 1,
      height: 330,
      position: "absolute",
      right: -85,
      top: 84,
      transform: [{ rotate: "-34deg" }],
      width: 330,
    },
    walletCloseRow: {
      alignItems: "flex-end",
      marginBottom: -42,
      position: "relative",
      zIndex: 4,
    },
    walletCloseButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    walletCloseText: {
      color: colors.bone,
      fontSize: 29,
      lineHeight: 32,
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
    predictionDiscoveryRail: {
      flexDirection: "row",
      gap: 12,
      paddingRight: 18,
    },
    predictionDiscoveryCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 20,
      borderWidth: 1,
      minHeight: 244,
      padding: 16,
      width: 286,
    },
    predictionDiscoveryCardPressed: {
      opacity: 0.78,
      transform: [{ scale: 0.99 }],
    },
    predictionDiscoveryTopline: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    predictionDiscoveryCompetition: {
      color: colors.muted,
      flex: 1,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    predictionDiscoveryState: {
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 999,
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    predictionDiscoveryStateDetermined: {
      backgroundColor: rgba(colors.positiveRgb, 0.13),
      color: colors.positive,
    },
    predictionDiscoveryTitle: {
      color: colors.bone,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: -0.7,
      lineHeight: 25,
      marginTop: 13,
      minHeight: 50,
    },
    predictionDiscoveryReason: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 6,
    },
    predictionDiscoveryOdds: {
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
    },
    predictionDiscoveryOutcome: {
      backgroundColor: rgba(colors.overlayRgb, 0.045),
      borderRadius: 12,
      flex: 1,
      padding: 10,
    },
    predictionDiscoveryOutcomeLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
    },
    predictionDiscoveryOutcomeValue: {
      color: colors.positive,
      fontFamily: "Archivo-Chip",
      fontSize: 18,
      fontWeight: "900",
      marginTop: 3,
    },
    predictionDiscoveryOutcomeValueMuted: {
      color: colors.danger,
      fontFamily: "Archivo-Chip",
      fontSize: 18,
      fontWeight: "900",
      marginTop: 3,
    },
    predictionDiscoveryFooter: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      marginTop: 14,
      paddingTop: 12,
    },
    predictionDiscoveryHandles: {
      color: colors.aqua,
      flex: 1,
      fontSize: 10,
      fontWeight: "800",
    },
    predictionDiscoveryArrow: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
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
    predictionWalletCreditLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.8,
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
    predictionWalletOpen: {
      alignSelf: "flex-end",
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
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
    predictionPortfolioBack: {
      alignItems: "center",
      alignSelf: "flex-start",
      minHeight: 48,
      justifyContent: "center",
      marginBottom: 2,
    },
    predictionPortfolioBackText: {
      color: colors.aqua,
      fontSize: 14,
      fontWeight: "800",
    },
    predictionPortfolioIntro: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 16,
      maxWidth: 560,
    },
    predictionPortfolioHero: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 24,
      borderWidth: 1,
      overflow: "hidden",
      padding: 20,
    },
    predictionPortfolioHeroTop: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    predictionPortfolioHeroLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    predictionPortfolioHeroValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 54,
      fontWeight: "900",
      letterSpacing: -3,
      marginTop: 3,
    },
    predictionPortfolioHeroUnit: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 1,
    },
    predictionPortfolioMetrics: {
      borderTopColor: rgba(colors.overlayRgb, 0.1),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 18,
      paddingTop: 15,
    },
    predictionPortfolioMetric: {
      flex: 1,
    },
    predictionPortfolioMetricValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 16,
      fontWeight: "900",
    },
    predictionPortfolioMetricLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.6,
      marginTop: 3,
    },
    predictionPortfolioGrant: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 16,
    },
    predictionPortfolioList: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      overflow: "hidden",
    },
    predictionPortfolioRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 116,
      padding: 15,
    },
    predictionPortfolioRowTopline: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    predictionPortfolioRowTitle: {
      color: colors.bone,
      flex: 1,
      fontSize: 14,
      fontWeight: "800",
    },
    predictionPortfolioStatus: {
      backgroundColor: rgba(colors.warningRgb, 0.12),
      borderRadius: 999,
      color: colors.warning,
      fontSize: 10,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    predictionPortfolioStatusWon: {
      backgroundColor: rgba(colors.positiveRgb, 0.13),
      color: colors.positive,
    },
    predictionPortfolioStatusLost: {
      backgroundColor: rgba(colors.dangerRgb, 0.12),
      color: colors.danger,
    },
    predictionPortfolioSelection: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 5,
    },
    predictionPortfolioNumbers: {
      flexDirection: "row",
      gap: 26,
      marginTop: 13,
    },
    predictionPortfolioNumberLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    predictionPortfolioNumberValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 13,
      fontWeight: "900",
      marginTop: 2,
    },
    predictionPortfolioEmpty: {
      alignItems: "center",
      minHeight: 190,
      justifyContent: "center",
      padding: 24,
    },
    predictionPortfolioEmptyCompact: {
      minHeight: 84,
      justifyContent: "center",
      padding: 18,
    },
    predictionPortfolioEmptyMark: {
      color: colors.aqua,
      fontSize: 30,
      fontWeight: "900",
    },
    predictionPortfolioEmptyTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 8,
    },
    predictionPortfolioEmptyBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
      textAlign: "center",
    },
    predictionPortfolioLedgerRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    predictionPortfolioLedgerValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 13,
      fontWeight: "900",
    },
    predictionPortfolioTrust: {
      alignItems: "flex-start",
      backgroundColor: rgba(colors.accentRgb, 0.07),
      borderColor: rgba(colors.accentRgb, 0.15),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 18,
      padding: 16,
    },
    predictionPortfolioTrustMark: {
      color: colors.positive,
      fontSize: 18,
      fontWeight: "900",
    },
    predictionPortfolioTrustTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
    },
    predictionPortfolioTrustBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 4,
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
      minHeight: 500,
      marginHorizontal: -18,
      marginTop: 2,
      overflow: "hidden",
      position: "relative",
    },
    athleteHeroCompact: { minHeight: 390 },
    athleteHeroImage: { opacity: 0.66 },
    athleteHeroWash: {
      backgroundColor: rgba(colors.navyRgb, 0.42),
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    athleteHeroWashCompact: {
      backgroundColor: rgba(colors.depthRgb, 0.15),
    },
    athleteHeroAtmosphere: {
      backgroundColor: rgba(colors.accentRgb, 0.11),
      borderRadius: 260,
      height: 520,
      position: "absolute",
      right: -250,
      top: -250,
      width: 520,
    },
    athleteHeroGhost: {
      bottom: 74,
      left: -28,
      opacity: 0.12,
      position: "absolute",
      right: -220,
    },
    athleteHeroGhostText: {
      color: colors.bone,
      fontFamily: "Archivo-Monument",
      fontSize: 118,
      fontWeight: "900",
      letterSpacing: -3.5,
      lineHeight: 120,
    },
    athleteHeroHorizon: {
      backgroundColor: rgba(colors.accentRgb, 0.3),
      height: 1,
      left: 24,
      position: "absolute",
      right: 24,
      top: 212,
    },
    athleteHeroGeometry: {
      borderColor: rgba(colors.accentRgb, 0.24),
      borderRadius: 220,
      borderWidth: 1,
      height: 430,
      position: "absolute",
      right: -196,
      top: -118,
      width: 430,
    },
    athleteHeroContent: {
      bottom: 50,
      left: 24,
      maxWidth: "68%",
      position: "absolute",
      zIndex: 4,
    },
    athleteHeroContentCompact: { maxWidth: "76%" },
    athleteHeroPills: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginBottom: 10,
    },
    athleteHeroName: {
      color: colors.bone,
      fontSize: 46,
      fontWeight: "800",
      letterSpacing: -1.38,
      lineHeight: 48,
    },
    athleteHeroMeta: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "500",
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
      alignItems: "center",
      backgroundColor: colors.ink,
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 15,
    },
    athleteHeroPrimaryActionText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: "600",
    },
    athleteHeroSecondaryAction: {
      alignItems: "center",
      backgroundColor: rgba(colors.depthRgb, 0.72),
      borderColor: rgba(colors.overlayRgb, 0.18),
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 15,
    },
    athleteHeroSecondaryActionText: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "600",
    },
    athleteHeroCutout: {
      height: "90%",
      position: "absolute",
      right: -46,
      top: 14,
      width: "78%",
      zIndex: 2,
    },
    athleteHeroCutoutImage: { height: "100%", width: "100%" },
    athleteHeroRating: {
      alignItems: "flex-end",
      backgroundColor: rgba(colors.depthRgb, 0.86),
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderLeftColor: colors.sand,
      borderRadius: 18,
      borderWidth: 1,
      borderLeftWidth: 4,
      minWidth: 154,
      paddingHorizontal: 15,
      paddingVertical: 14,
      position: "absolute",
      right: 20,
      top: 28,
      zIndex: 5,
    },
    athleteHeroRatingLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 1.1,
    },
    athleteHeroRatingValue: {
      color: colors.bone,
      fontFamily: "Archivo-Hero",
      fontSize: 58,
      fontWeight: "800",
      letterSpacing: -1.16,
      lineHeight: 60,
      marginTop: 2,
    },
    athleteHeroRatingMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "flex-end",
      marginTop: 4,
    },
    athleteHeroRatingDelta: {
      fontFamily: "Archivo-Chip",
      fontSize: 11,
      fontWeight: "700",
    },
    athleteHeroRatingMeta: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "500",
      textTransform: "uppercase",
    },
    athleteMetricShelf: {
      marginHorizontal: -18,
      marginBottom: 18,
      marginTop: -30,
      zIndex: 6,
    },
    athleteMetricShelfContent: {
      paddingLeft: 18,
      paddingRight: 38,
    },
    athleteMetricRow: {
      flexDirection: "row",
      gap: 9,
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
    athleteLineChart: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderRadius: 15,
      marginTop: 14,
      overflow: "hidden",
      paddingHorizontal: 6,
      paddingTop: 8,
    },
    athleteLineChartAxis: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 8,
      width: "100%",
    },
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
    performanceEvidenceCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    performanceEvidenceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 16,
    },
    performanceEvidenceMetric: {
      backgroundColor: rgba(colors.overlayRgb, 0.035),
      borderRadius: 14,
      minWidth: "47%",
      padding: 12,
    },
    performanceEvidenceValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 20,
      fontWeight: "900",
    },
    performanceEvidenceLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 4,
      textTransform: "uppercase",
    },
    performancePartnerList: {
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      gap: 10,
      marginTop: 16,
      paddingTop: 14,
    },
    performancePartnerHeading: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    performancePartnerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
    },
    performancePartnerName: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "700",
      width: 92,
    },
    performancePartnerTrack: {
      backgroundColor: rgba(colors.overlayRgb, 0.06),
      borderRadius: 999,
      flex: 1,
      height: 8,
      overflow: "hidden",
    },
    performancePartnerFill: {
      backgroundColor: colors.aqua,
      borderRadius: 999,
      height: "100%",
    },
    performancePartnerRecord: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "900",
      textAlign: "right",
      width: 34,
    },
    performancePulseCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    performancePulseTitle: {
      color: colors.bone,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.8,
      marginTop: 3,
    },
    performancePulseRecord: {
      color: colors.aqua,
      fontFamily: "Archivo-Block",
      fontSize: 23,
      fontWeight: "900",
    },
    performancePulseTrack: {
      flexDirection: "row",
      gap: 5,
      marginTop: 17,
    },
    performancePulsePoint: {
      alignItems: "center",
      borderRadius: 8,
      flex: 1,
      height: 34,
      justifyContent: "center",
      minWidth: 18,
    },
    performancePulsePointWin: {
      backgroundColor: rgba(colors.positiveRgb, 0.22),
    },
    performancePulsePointLoss: {
      backgroundColor: rgba(colors.dangerRgb, 0.18),
    },
    performancePulsePointText: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "900",
    },
    performancePulseSummary: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 12,
    },
    performanceImpactCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    performanceImpactRows: { gap: 13, marginTop: 18 },
    performanceImpactRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    performanceImpactLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
      width: 76,
    },
    performanceImpactTrack: {
      backgroundColor: rgba(colors.overlayRgb, 0.06),
      borderRadius: 999,
      flex: 1,
      height: 12,
      overflow: "hidden",
    },
    performanceImpactFill: { borderRadius: 999, height: "100%" },
    performanceImpactFillWin: { backgroundColor: colors.positive },
    performanceImpactFillLoss: { backgroundColor: colors.danger },
    performanceImpactValue: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 11,
      fontWeight: "900",
      textAlign: "right",
      width: 42,
    },
    performanceStatsCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    performanceStatsGrid: {
      flexDirection: "row",
      gap: 7,
      marginTop: 16,
    },
    performanceStat: {
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderRadius: 14,
      flex: 1,
      paddingHorizontal: 8,
      paddingVertical: 13,
    },
    performanceStatValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 16,
      fontWeight: "900",
    },
    performanceStatLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 4,
    },
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
      gap: 16,
    },
    performanceResultFilters: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      marginBottom: 12,
      padding: 4,
    },
    performanceResultFilter: {
      alignItems: "center",
      borderRadius: 999,
      flex: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 8,
    },
    performanceResultFilterActive: { backgroundColor: colors.aqua },
    performanceResultFilterText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    performanceResultFilterTextActive: { color: colors.onAccent },
    athleteResultCard: {
      borderRadius: 24,
      borderWidth: 1,
      minHeight: 330,
      overflow: "hidden",
    },
    athleteResultCardWin: {
      backgroundColor: colors.resultWin,
      borderColor: colors.resultWinBorder,
    },
    athleteResultCardLoss: {
      backgroundColor: colors.resultLoss,
      borderColor: colors.resultLossBorder,
    },
    athleteResultHero: {
      minHeight: 168,
      overflow: "hidden",
      padding: 18,
      position: "relative",
    },
    athleteResultHeroCopy: {
      maxWidth: "64%",
      minHeight: 132,
      zIndex: 2,
    },
    athleteResultPlayIcon: {
      bottom: -2,
      position: "absolute",
      right: -1,
      zIndex: 1,
    },
    athleteResultOutcome: {
      color: colors.ink,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.6,
      lineHeight: 29,
    },
    athleteResultStory: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 21,
      marginTop: 8,
    },
    athleteResultStorySource: {
      color: rgba(colors.inkRgb, 0.62),
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
      marginTop: "auto",
      paddingTop: 10,
    },
    athleteResultScoreCard: {
      backgroundColor: colors.depth,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      marginTop: -11,
      padding: 14,
    },
    athleteResultScoreMeta: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginBottom: 8,
    },
    athleteResultTopline: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
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
      fontSize: 13,
      fontWeight: "800",
    },
    athleteResultMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
    athleteResultDelta: { alignItems: "flex-end" },
    athleteResultDeltaValue: {
      fontFamily: "Archivo-Chip",
      fontSize: 16,
      fontWeight: "900",
    },
    athleteResultExpected: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.5,
      marginTop: 3,
    },
    athleteResultTeamRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minHeight: 98,
      paddingVertical: 8,
    },
    athleteResultTeamRowCompact: { minHeight: 82 },
    athleteResultTeamRowDense: { minHeight: 70 },
    athleteResultTeamRowWrapped: { minHeight: 124 },
    athleteResultTeamRowDivider: {
      borderTopColor: rgba(colors.overlayRgb, 0.09),
      borderTopWidth: 1,
    },
    athleteResultPeople: {
      flex: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      minWidth: 0,
    },
    athleteResultPerson: {
      alignItems: "center",
      justifyContent: "flex-start",
      minHeight: 80,
      minWidth: 0,
      paddingHorizontal: 2,
    },
    athleteResultPersonCompact: { minHeight: 68, paddingHorizontal: 1 },
    athleteResultPersonDense: { minHeight: 56, paddingHorizontal: 0 },
    athleteResultAvatar: {
      borderRadius: 22,
      height: 44,
      width: 44,
    },
    athleteResultAvatarCompact: { borderRadius: 16, height: 32, width: 32 },
    athleteResultAvatarDense: { borderRadius: 12, height: 24, width: 24 },
    athleteResultAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    athleteResultAvatarFallbackCompact: {
      borderRadius: 16,
      height: 32,
      width: 32,
    },
    athleteResultAvatarFallbackDense: {
      borderRadius: 12,
      height: 24,
      width: 24,
    },
    athleteResultAvatarText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: "800",
    },
    athleteResultAvatarTextDense: { fontSize: 10 },
    athleteResultPersonName: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 5,
      textAlign: "center",
      width: "100%",
    },
    athleteResultPersonNameCompact: { fontSize: 10, marginTop: 3 },
    athleteResultPersonNameDense: { fontSize: 10, marginTop: 2 },
    athleteResultRatingPill: {
      alignSelf: "center",
      backgroundColor: colors.signal,
      borderRadius: 999,
      marginTop: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    athleteResultRatingPillDense: {
      marginTop: 2,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    athleteResultRatingText: {
      color: colors.signalInk,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "700",
    },
    athleteResultRatingTextDense: { fontSize: 10 },
    athleteResultSetScores: {
      alignItems: "center",
      flexDirection: "row",
      gap: 11,
      justifyContent: "flex-end",
      minWidth: 92,
    },
    athleteResultSetScore: {
      color: rgba(colors.overlayRgb, 0.38),
      fontFamily: "Archivo-Table",
      fontSize: 20,
      fontWeight: "800",
    },
    athleteResultSetScoreWon: { color: colors.bone },
    athleteResultWinnerMark: {
      color: colors.warning,
      fontSize: 18,
      fontWeight: "900",
    },
    athleteResultBreakdown: {
      backgroundColor: colors.depth,
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 16,
      justifyContent: "space-between",
      padding: 14,
      paddingTop: 12,
    },
    athleteResultBreakdownLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    athleteResultBreakdownValue: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 11,
      fontWeight: "800",
      marginTop: 3,
    },
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
    profileBack: {
      alignItems: "center",
      alignSelf: "flex-start",
      justifyContent: "center",
      minHeight: 48,
      paddingRight: 16,
    },
    profileBackText: {
      color: colors.aqua,
      fontSize: 13,
      fontWeight: "800",
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
    tabItemCenter: {
      backgroundColor: colors.aqua,
      borderColor: colors.canvas,
      borderRadius: 24,
      borderWidth: 4,
      marginTop: -18,
      minHeight: 60,
    },
    tabIcon: { color: colors.muted, fontSize: 18 },
    tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
    tabActive: { color: colors.aqua },
    tabCenterIcon: { color: colors.onAccent, fontSize: 22 },
    tabCenterLabel: { color: colors.onAccent, fontWeight: "900" },
    modalSafe: { backgroundColor: colors.canvas, flex: 1 },
    modalContent: { padding: 18, paddingBottom: 45 },
    hostedReviewHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.09),
      borderBottomWidth: 1,
      flexDirection: "row",
      paddingHorizontal: 20,
      paddingVertical: 13,
    },
    hostedReviewTitle: {
      color: colors.bone,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -0.8,
      marginTop: 3,
    },
    hostedReviewClose: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    hostedReviewContent: { padding: 18, paddingBottom: 130 },
    hostedReviewSummary: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 18,
    },
    hostedReviewDate: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    hostedReviewTime: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 4,
    },
    hostedReviewMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8,
      textTransform: "capitalize",
    },
    hostedReviewDuration: {
      alignItems: "center",
      borderLeftColor: rgba(colors.overlayRgb, 0.09),
      borderLeftWidth: 1,
      justifyContent: "center",
      minWidth: 68,
      paddingLeft: 14,
    },
    hostedReviewDurationMark: { color: colors.aqua, fontSize: 25 },
    hostedReviewDurationValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 19,
      marginTop: 5,
    },
    hostedReviewDurationLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    hostedPartnerCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 14,
      overflow: "hidden",
    },
    hostedPartnerCardDisabled: { opacity: 0.58 },
    hostedPartnerTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      minHeight: 104,
      padding: 18,
    },
    hostedPartnerTitle: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    hostedPartnerMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 5,
    },
    hostedPartnerIllustration: {
      height: 68,
      position: "relative",
      width: 78,
    },
    hostedPartnerSilhouette: {
      backgroundColor: colors.aqua,
      borderRadius: 28,
      bottom: 0,
      height: 56,
      position: "absolute",
      right: 0,
      transform: [{ rotate: "7deg" }],
      width: 34,
    },
    hostedPartnerSilhouetteBack: {
      backgroundColor: colors.sand,
      left: 4,
      right: undefined,
      transform: [{ rotate: "-7deg" }],
    },
    hostedAddPartner: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.09),
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 60,
      paddingHorizontal: 18,
    },
    hostedAddPartnerText: {
      color: colors.aqua,
      fontSize: 15,
      fontWeight: "900",
    },
    hostedAddPartnerArrow: { color: colors.aqua, fontSize: 22 },
    hostedSelectedPartner: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.09),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 78,
      padding: 14,
    },
    hostedPartnerAvatar: { borderRadius: 25, height: 50, width: 50 },
    hostedPartnerAvatarFallback: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 25,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    hostedPartnerAvatarText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    hostedSelectedPartnerName: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    hostedSelectedPartnerMeta: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 4,
    },
    hostedRemovePartner: {
      alignItems: "center",
      borderColor: rgba(colors.dangerRgb, 0.22),
      borderRadius: 18,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    hostedRemovePartnerText: { color: colors.danger, fontSize: 21 },
    hostedPartnerPolicy: {
      backgroundColor: rgba(colors.accentRgb, 0.06),
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      padding: 15,
    },
    hostedTotalCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 14,
      padding: 18,
    },
    hostedTotalLabel: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
    },
    hostedTotalMeta: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },
    hostedTotalValue: {
      color: colors.aqua,
      fontFamily: "Archivo-Block",
      fontSize: 25,
    },
    hostedPolicyCard: {
      alignItems: "flex-start",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 14,
      padding: 16,
    },
    hostedPolicyMark: {
      borderColor: colors.aqua,
      borderRadius: 13,
      borderWidth: 1,
      color: colors.aqua,
      fontSize: 13,
      fontWeight: "900",
      height: 26,
      lineHeight: 24,
      textAlign: "center",
      width: 26,
    },
    hostedPolicyTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    hostedPolicyBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    errorBanner: {
      backgroundColor: rgba(colors.dangerRgb, 0.08),
      borderColor: rgba(colors.dangerRgb, 0.2),
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 19,
    },
    hostedReviewFooter: {
      backgroundColor: colors.canvas,
      borderTopColor: rgba(colors.overlayRgb, 0.09),
      borderTopWidth: 1,
      bottom: 0,
      left: 0,
      padding: 18,
      position: "absolute",
      right: 0,
    },
    hostedReviewContinue: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 18,
      justifyContent: "center",
      minHeight: 58,
    },
    hostedReviewContinueText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: "900",
    },
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
    mobileParticipantCardDisabled: {
      backgroundColor: rgba(colors.warningRgb, 0.045),
      borderColor: rgba(colors.warningRgb, 0.28),
    },
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
      minHeight: 250,
      padding: 11,
      width: 166,
    },
    mobileSuggestionCardDisabled: {
      backgroundColor: rgba(colors.warningRgb, 0.045),
      borderColor: rgba(colors.warningRgb, 0.28),
    },
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
    mobileSuggestionEligibility: {
      fontSize: 10,
      fontWeight: "800",
      lineHeight: 14,
      marginTop: 7,
      textAlign: "center",
    },
    mobileSuggestionEligible: { color: colors.positive },
    mobileSuggestionIneligible: { color: colors.warning },
    mobileSuggestionAdd: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 999,
      justifyContent: "center",
      marginTop: "auto",
      minHeight: 38,
      width: "100%",
    },
    mobileSuggestionAddDisabled: {
      backgroundColor: rgba(colors.warningRgb, 0.12),
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
    mobilePolicyList: { gap: 10, marginTop: 2 },
    mobilePolicyCard: {
      backgroundColor: colors.canvas,
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 9,
      padding: 14,
    },
    mobilePolicyCardPressed: { opacity: 0.78 },
    mobilePolicyHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    mobilePolicyTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 20,
    },
    mobilePolicyDetail: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    mobilePolicyDocumentText: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 12,
    },
    mobilePolicyAction: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.2),
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
      minHeight: 64,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    mobilePolicyActionAccepted: {
      backgroundColor: rgba(colors.positiveRgb, 0.09),
      borderColor: rgba(colors.positiveRgb, 0.24),
    },
    mobilePolicyActionTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
      lineHeight: 18,
    },
    mobilePolicyActionTitleAccepted: { color: colors.positive },
    mobilePolicyActionMeta: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 2,
    },
    mobilePolicyActionIcon: {
      color: colors.aqua,
      fontSize: 28,
      fontWeight: "600",
    },
    mobilePolicyActionIconAccepted: {
      color: colors.positive,
      fontSize: 19,
      fontWeight: "900",
    },
    policyReviewSafe: { backgroundColor: colors.canvas, flex: 1 },
    policyReviewHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.1),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 76,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    policyReviewClose: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 22,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    policyReviewCloseText: {
      color: colors.bone,
      fontSize: 30,
      fontWeight: "500",
      lineHeight: 32,
      marginTop: -2,
    },
    policyReviewHeading: { flex: 1, minWidth: 0 },
    policyReviewEyebrow: {
      color: colors.warning,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    policyReviewTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      lineHeight: 20,
      marginTop: 3,
    },
    policyReviewInstruction: {
      alignItems: "center",
      backgroundColor: rgba(colors.warningRgb, 0.1),
      borderColor: rgba(colors.warningRgb, 0.25),
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginHorizontal: 18,
      marginTop: 14,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    policyReviewInstructionComplete: {
      backgroundColor: rgba(colors.positiveRgb, 0.09),
      borderColor: rgba(colors.positiveRgb, 0.24),
    },
    policyReviewInstructionIcon: {
      color: colors.warning,
      fontSize: 18,
      fontWeight: "900",
    },
    policyReviewInstructionText: {
      color: colors.bone,
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 18,
    },
    policyReviewScroll: { flex: 1 },
    policyReviewContent: {
      paddingBottom: 42,
      paddingHorizontal: 22,
      paddingTop: 22,
    },
    policyReviewDocument: {
      color: colors.bone,
      fontSize: 15,
      lineHeight: 25,
    },
    policyReviewEnd: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.12),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginTop: 32,
      paddingTop: 18,
    },
    policyReviewEndMark: {
      color: colors.positive,
      fontSize: 16,
      fontWeight: "900",
    },
    policyReviewEndText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    policyReviewFooter: {
      backgroundColor: colors.depth,
      borderTopColor: rgba(colors.overlayRgb, 0.12),
      borderTopWidth: 1,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 12,
    },
    policyReviewConfirmation: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 10,
      textAlign: "center",
    },
    policyReviewAccept: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 15,
      justifyContent: "center",
      minHeight: 56,
      paddingHorizontal: 18,
    },
    policyReviewAcceptText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: "900",
      textAlign: "center",
    },
    policyReviewLockedText: {
      color: colors.warning,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 8,
      textAlign: "center",
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
