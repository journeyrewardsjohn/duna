import { formatVenueTime } from "@duna/core";
import { demoOrganization, demoPeople } from "@duna/core/demo";
import {
  createUndoEvent,
  foldScore,
  standardBeachFormat,
  type ScoreEvent,
  type ScoringSystem,
} from "@duna/league-engine";
import {
  parseNaturalLanguageSchedule,
  type NaturalLanguageScheduleDraft,
} from "@duna/scheduling";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import {
  CalendarDays,
  ChevronDown,
  Ellipsis,
  House,
  Moon,
  Plus,
  Sun,
  type LucideIcon,
} from "lucide-react-native";
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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GetPaidScreen } from "./get-paid";
import { MoneyScreen } from "./money-screen";
import { DunaAiScreen } from "./duna-ai-screen";
import {
  connectProCalendar,
  loadProPersonalEvents,
  readProCalendarConnection,
  type ProCalendarConnection,
  type ProPersonalCalendarEvent,
} from "./pro-calendar-integration";
import { dunaApiBaseUrl } from "./mobile-api";
import { OperatorCreateScreen } from "./operator-create";
import { SessionArrivalBoard } from "./session-arrival-board";
import { SessionNotesScreen } from "./session-notes";
import { TicketScannerScreen } from "./ticket-scanner";
import { ProMessagingScreen } from "./messaging-screen";
import { CoachVideoScreen } from "./coach-video";
import { TournamentControl } from "./tournament-control";
import { listenForMessagingNotificationResponses } from "./messaging-notifications";
import {
  ProRuntimeProvider,
  useProRuntime,
  type OperatorMatchScoringState,
  type OperatorMatches,
  type ProRuntime,
} from "./runtime";
import { ProLaunchExperience } from "./launch-experience";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
  useSatoshiFonts,
} from "./satoshi-text";

// Metro requires static module references so the full Duna mark ships natively.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaProWordmarkBlue = require("./assets/duna-horizontal-blue.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaProWordmarkWhite = require("./assets/duna-horizontal-white.png");

const lightColors = {
  canvas: "#eef4f8",
  ink: "#173b65",
  depth: "#ffffff",
  navy: "#d8e8f2",
  navyLift: "#f4f8fb",
  bone: "#173b65",
  muted: "#687b8e",
  aqua: "#214b7a",
  aquaDeep: "#173b65",
  sand: "#d6a874",
  flare: "#f0a06d",
  positive: "#3c7a5b",
  warning: "#d9955f",
  danger: "#a64b43",
  onAccent: "#ffffff",
  overlayRgb: "23,59,101",
  accentRgb: "33,75,122",
  warningRgb: "217,149,95",
  positiveRgb: "60,122,91",
  dangerRgb: "166,75,67",
  flareRgb: "240,160,109",
  inkRgb: "23,59,101",
  depthRgb: "255,255,255",
} as const;

type Palette = {
  readonly [Key in keyof typeof lightColors]: string;
};

const darkColors: Palette = {
  canvas: "#0d1114",
  ink: "#0d1114",
  depth: "#141a1e",
  navy: "#101a20",
  navyLift: "#1b2429",
  bone: "#edf1f2",
  muted: "#a9b4b8",
  aqua: "#b5ccd3",
  aquaDeep: "#8fb0bc",
  sand: "#d4b77c",
  flare: "#f4794c",
  positive: "#6bae78",
  warning: "#d4b77c",
  danger: "#c4785c",
  onAccent: "#0d1114",
  overlayRgb: "237,241,242",
  accentRgb: "181,204,211",
  warningRgb: "212,183,124",
  positiveRgb: "107,174,120",
  dangerRgb: "196,120,92",
  flareRgb: "244,121,76",
  inkRgb: "13,17,20",
  depthRgb: "20,26,30",
};

type ThemeName = "light" | "dark";
type ThemePreference = ThemeName | "system";

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

const OpenDunaAiContext = createContext<() => void>(() => undefined);

function ThemeButton() {
  const { preference, theme, toggle } = useContext(ThemeContext);
  const ThemeIcon = theme === "light" ? Moon : Sun;
  return (
    <Pressable
      accessibilityLabel={`Theme: ${preference === "system" ? "match device" : preference}. Change theme`}
      onPress={() => {
        selectionHaptic();
        toggle();
      }}
      style={styles.themeButton}
    >
      <ThemeIcon color={colors.bone} size={20} strokeWidth={1.75} />
    </Pressable>
  );
}

type Tab = "today" | "calendar" | "people" | "more";
type NavDestination = Tab | "ai" | "create";

const tabs: readonly {
  key: NavDestination;
  label: string;
  icon?: LucideIcon;
}[] = [
  { key: "today", label: "Today", icon: House },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "ai", label: "Duna AI" },
  { key: "create", label: "Create", icon: Plus },
  { key: "more", label: "More", icon: Ellipsis },
];

type ProCalendarEntry = NonNullable<
  ProRuntime["workspace"]
>["calendar"]["entries"][number];
type CalendarResourceFilter = "all" | "courts" | "coaches";
type CalendarSheetMode = "session" | "block";

function displayError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : "Duna Pro could not complete that request.";
}

function selectionHaptic() {
  if (Platform.OS !== "web")
    void Haptics.selectionAsync().catch(() => undefined);
}

function impactHaptic() {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  }
}

function successHaptic() {
  if (Platform.OS !== "web") {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
  }
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

function calendarDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function calendarDayAtNoon(date: Date, offset: number): Date {
  const value = new Date(date);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value;
}

function formatCalendarDay(date: Date): {
  readonly weekday: string;
  readonly day: string;
  readonly month: string;
} {
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
      date,
    ),
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
  };
}

function formatCalendarTime(iso: string, timezone: string): string {
  return formatVenueTime(iso, timezone, "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function zonedLocalToIso(
  dateKey: string,
  hour: number,
  minute: number,
  timezone: string,
): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredUtc = Date.UTC(year!, month! - 1, day!, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(desiredUtc));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const representedUtc = Date.UTC(
    values.year!,
    values.month! - 1,
    values.day!,
    values.hour!,
    values.minute!,
    values.second!,
  );
  const firstPass = desiredUtc - (representedUtc - desiredUtc);
  const firstParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(firstPass));
  const firstValues = Object.fromEntries(
    firstParts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const remaining =
    Date.UTC(year!, month! - 1, day!, hour, minute) -
    Date.UTC(
      firstValues.year!,
      firstValues.month! - 1,
      firstValues.day!,
      firstValues.hour!,
      firstValues.minute!,
    );
  return new Date(firstPass + remaining).toISOString();
}

function entryLabel(entry: ProCalendarEntry): string {
  if (entry.sourceType === "operator-block")
    return entry.status === "maintenance" ? "Maintenance" : "Blocked time";
  if (entry.sourceType === "busy-block") return "External busy time";
  return (entry.kind ?? "session").replaceAll("-", " ");
}

function personInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function loadDeviceId(): Promise<string> {
  const key = "duna-pro-authoritative-device-id";
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return existing;
  const value = `duna-pro-${Crypto.randomUUID()}`;
  await SecureStore.setItemAsync(key, value);
  return value;
}

function PreviewBanner() {
  const { mode } = useProRuntime();
  if (mode !== "preview") return null;
  return (
    <View style={styles.previewBanner}>
      <Text style={styles.previewBannerText}>
        PREVIEW DATA · LIVE OPERATIONS AND MONEY ACTIONS ARE DISABLED
      </Text>
    </View>
  );
}

function BrandMark() {
  const { theme } = useContext(ThemeContext);
  return (
    <Image
      accessibilityLabel="Duna"
      resizeMode="contain"
      source={theme === "dark" ? dunaProWordmarkWhite : dunaProWordmarkBlue}
      style={styles.wordmarkImage}
    />
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: string;
  readonly tone?: "neutral" | "positive" | "warning" | "live";
}) {
  const style: Record<typeof tone, ViewStyle> = {
    neutral: {
      backgroundColor: rgba(colors.overlayRgb, 0.05),
      borderColor: rgba(colors.overlayRgb, 0.09),
    },
    positive: {
      backgroundColor: rgba(colors.positiveRgb, 0.08),
      borderColor: rgba(colors.positiveRgb, 0.22),
    },
    warning: {
      backgroundColor: rgba(colors.warningRgb, 0.08),
      borderColor: rgba(colors.warningRgb, 0.22),
    },
    live: {
      backgroundColor: rgba(colors.flareRgb, 0.08),
      borderColor: rgba(colors.flareRgb, 0.25),
    },
  };
  return (
    <View style={[styles.pill, style[tone]]}>
      <Text
        style={[
          styles.pillText,
          tone === "positive" && { color: colors.positive },
          tone === "warning" && { color: colors.warning },
          tone === "live" && { color: "#ff9a7a" },
        ]}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}

function Header({
  showOperations = false,
}: {
  readonly showOperations?: boolean;
}) {
  const {
    activeAuthOrganizationId,
    authOrganizations,
    dashboard,
    matches = [],
    mode,
    signOut,
    switchOrganization,
    workspace,
  } = useProRuntime();
  const [organizationSheetOpen, setOrganizationSheetOpen] = useState(false);
  const [switching, setSwitching] = useState<string>();
  const initials = (dashboard?.organization.name ?? demoOrganization.name)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const timezone =
    workspace?.organization.timezone ??
    dashboard?.organization.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayKey = calendarDateKey(new Date(), timezone);
  const watchMatches = mode === "preview" ? previewOperatorMatches() : matches;
  const todayMatches = watchMatches.filter(
    (match) =>
      !match.scheduledAt ||
      calendarDateKey(new Date(match.scheduledAt), timezone) === todayKey,
  );
  const liveCount = watchMatches.filter(
    (match) => match.status === "live",
  ).length;
  const exceptionCount =
    (dashboard?.alerts.filter((alert) => alert.tone !== "positive").length ??
      0) +
    (workspace?.eventRegistrations.filter((registration) =>
      ["cancelled", "refunded", "waitlisted"].includes(registration.status),
    ).length ?? 0);
  const organizationName =
    dashboard?.organization.name ?? demoOrganization.name;
  return (
    <>
      <View style={styles.headerShell}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={`Current organization: ${organizationName}. Change organization`}
            onPress={() => setOrganizationSheetOpen(true)}
            style={styles.headerOrganization}
          >
            <Text numberOfLines={1} style={styles.headerOrganizationName}>
              {organizationName}
            </Text>
            <ChevronDown color={colors.muted} size={18} strokeWidth={1.75} />
          </Pressable>
          <View style={styles.headerButtons}>
            <ThemeButton />
            <Pressable
              accessibilityLabel="Open organization switcher"
              onPress={() => setOrganizationSheetOpen(true)}
              style={styles.profileButton}
            >
              <Text style={styles.profileText}>{initials}</Text>
              {mode === "live" && <View style={styles.dot} />}
            </Pressable>
          </View>
        </View>
        {showOperations && (
          <View
            accessibilityLabel={`Today: ${todayMatches.length} matches, ${liveCount} live now, ${exceptionCount} needing review`}
            style={styles.watchStrip}
          >
            <View style={styles.watchBrand}>
              <View style={styles.watchPulse} />
              <Text style={styles.watchBrandText}>TODAY</Text>
            </View>
            <View style={styles.watchMetric}>
              <Text style={styles.watchMetricValue}>{todayMatches.length}</Text>
              <Text numberOfLines={1} style={styles.watchMetricLabel}>
                MATCHES
              </Text>
            </View>
            <View style={styles.watchMetric}>
              <Text style={styles.watchMetricValue}>{liveCount}</Text>
              <Text numberOfLines={1} style={styles.watchMetricLabel}>
                LIVE NOW
              </Text>
            </View>
            <View style={styles.watchMetric}>
              <Text style={styles.watchMetricValue}>{exceptionCount}</Text>
              <Text numberOfLines={1} style={styles.watchMetricLabel}>
                TO DO
              </Text>
            </View>
          </View>
        )}
      </View>
      <Modal
        animationType="slide"
        onRequestClose={() => setOrganizationSheetOpen(false)}
        presentationStyle="pageSheet"
        visible={organizationSheetOpen}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>DUNA PRO WORKSPACE</Text>
              <Text style={styles.sheetTitle}>Choose an organization.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close organization switcher"
              onPress={() => setOrganizationSheetOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.organizationSheetContent}>
            <Text style={styles.organizationSheetLead}>
              Every schedule, match, court, person, and payment below is scoped
              to the selected organization.
            </Text>
            <View style={styles.organizationSheetList}>
              {(authOrganizations ?? []).map((organization) => {
                const active = organization.id === activeAuthOrganizationId;
                return (
                  <Pressable
                    accessibilityState={{ selected: active }}
                    disabled={active || Boolean(switching)}
                    key={organization.id}
                    onPress={() => {
                      if (!switchOrganization) return;
                      setSwitching(organization.id);
                      void switchOrganization(organization.id)
                        .then(() => setOrganizationSheetOpen(false))
                        .finally(() => setSwitching(undefined));
                    }}
                    style={[
                      styles.organizationSheetRow,
                      active && styles.organizationSheetRowActive,
                    ]}
                  >
                    <View style={styles.organizationSheetMark}>
                      <Text style={styles.organizationSheetMarkText}>
                        {organization.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.organizationSheetName}>
                        {organization.name}
                      </Text>
                      <Text style={styles.organizationSheetRole}>
                        {(organization.role ?? "member").replaceAll("_", " ")}
                      </Text>
                    </View>
                    <Text style={styles.organizationSheetState}>
                      {switching === organization.id
                        ? "OPENING…"
                        : active
                          ? "ACTIVE"
                          : "OPEN"}
                    </Text>
                  </Pressable>
                );
              })}
              {!authOrganizations?.length && (
                <View style={styles.organizationSheetEmpty}>
                  <Text style={styles.organizationSheetName}>
                    {demoOrganization.name}
                  </Text>
                  <Text style={styles.organizationSheetRole}>
                    Preview workspace
                  </Text>
                </View>
              )}
            </View>
            {signOut && (
              <Pressable
                onPress={() => void signOut()}
                style={styles.organizationSignOutButton}
              >
                <Text style={styles.organizationSignOutText}>
                  Sign out of Duna Pro
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function PageTitle({
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
  const { width } = useWindowDimensions();
  const compact = width < 480;
  return (
    <View style={[styles.pageTitle, compact && styles.pageTitleCompact]}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text
          style={[styles.displayTitle, compact && styles.displayTitleCompact]}
        >
          {title}
        </Text>
      </View>
      {action && (
        <Pressable
          disabled={!onAction}
          onPress={onAction}
          style={[styles.primaryAction, !onAction && styles.buttonDisabled]}
        >
          <Text style={styles.primaryActionText}>＋ {action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const schedule = [
  [
    "8:00",
    "AM",
    "U14 Summer Training",
    "Manhattan · Courts 1–3",
    "18 / 20",
    "Live",
  ],
  [
    "10:00",
    "AM",
    "Serve + Receive Lab",
    "Manhattan · Court 4",
    "8 / 8",
    "Ready",
  ],
  [
    "4:30",
    "PM",
    "High Performance 2s",
    "Hermosa · Courts 5–6",
    "11 / 12",
    "Ready",
  ],
  [
    "6:00",
    "PM",
    "South Bay Summer Series",
    "Hermosa · Courts 1–8",
    "24 / 24",
    "Week 5",
  ],
] as const;

function previewOperatorMatches(): OperatorMatches {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  const person = (index: number) => {
    const source = demoPeople[index % demoPeople.length]!;
    return {
      id: source.id,
      displayName: source.displayName,
      initials: source.initials,
      ratingDisplay: source.rating.display,
    };
  };
  return [
    {
      id: "20000000-0000-4000-8000-000000000001",
      status: "live",
      scheduledAt: base.toISOString(),
      venueId: "30000000-0000-4000-8000-000000000001",
      venueName: "Manhattan Beach Club",
      courtId: "40000000-0000-4000-8000-000000000001",
      courtName: "Stadium Court",
      sessionId: "50000000-0000-4000-8000-000000000001",
      sessionTitle: "South Bay Open Match",
      divisionName: "Open Doubles",
      authoritativeDeviceId: "duna-pro-preview",
      teamA: {
        id: "60000000-0000-4000-8000-000000000001",
        name: "Maya / Zoe",
        people: [person(0), person(1)],
      },
      teamB: {
        id: "60000000-0000-4000-8000-000000000002",
        name: "Ari / Liv",
        people: [person(2), person(3)],
      },
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      status: "scheduled",
      scheduledAt: new Date(base.getTime() + 2 * 60 * 60_000).toISOString(),
      venueId: "30000000-0000-4000-8000-000000000001",
      venueName: "Manhattan Beach Club",
      courtId: "40000000-0000-4000-8000-000000000002",
      courtName: "Court 2",
      sessionId: "50000000-0000-4000-8000-000000000002",
      sessionTitle: "Members Match Window",
      divisionName: "Competitive Doubles",
      teamA: {
        id: "60000000-0000-4000-8000-000000000003",
        name: "Nina / Jo",
        people: [person(4), person(5)],
      },
      teamB: {
        id: "60000000-0000-4000-8000-000000000004",
        name: "Cam / Riley",
        people: [person(6), person(7)],
      },
    },
  ] as OperatorMatches;
}

function VenueMatchesSection({
  dateKey,
  onScore,
  timezone,
}: {
  readonly dateKey?: string;
  readonly onScore: (matchId?: string) => void;
  readonly timezone: string;
}) {
  const { matches, mode } = useProRuntime();
  const availableMatches =
    mode === "preview" ? previewOperatorMatches() : (matches ?? []);
  const visibleMatches = availableMatches
    .filter(
      (match) =>
        !dateKey ||
        !match.scheduledAt ||
        calendarDateKey(new Date(match.scheduledAt), timezone) === dateKey,
    )
    .slice()
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "live" ? -1 : 1;
      return (
        Date.parse(left.scheduledAt ?? "") - Date.parse(right.scheduledAt ?? "")
      );
    });
  return (
    <View style={styles.venueMatchesSection}>
      <View style={styles.venueMatchesHeading}>
        <View>
          <Text style={styles.eyebrow}>VENUE MATCHES</Text>
          <Text style={styles.venueMatchesTitle}>On your courts.</Text>
        </View>
        <Pill
          tone={
            visibleMatches.some((match) => match.status === "live")
              ? "live"
              : "neutral"
          }
        >
          {`${visibleMatches.length} ${visibleMatches.length === 1 ? "match" : "matches"}`}
        </Pill>
      </View>
      <View style={styles.venueMatchesList}>
        {visibleMatches.map((match) => (
          <View key={match.id} style={styles.venueMatchCard}>
            <View style={styles.venueMatchTopline}>
              <View style={styles.venueMatchCourtLane}>
                <View
                  style={[
                    styles.venueMatchCourtDot,
                    match.status === "live" && styles.venueMatchCourtDotLive,
                  ]}
                />
                <Text style={styles.venueMatchCourtName}>
                  {match.courtName ?? "Court pending"}
                </Text>
              </View>
              <Text style={styles.venueMatchTime}>
                {match.status === "live"
                  ? "LIVE NOW"
                  : match.scheduledAt
                    ? formatCalendarTime(match.scheduledAt, timezone)
                    : "TIME PENDING"}
              </Text>
            </View>
            <Text style={styles.venueMatchContext}>
              {[match.venueName, match.sessionTitle, match.divisionName]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View style={styles.venueMatchTeams}>
              {[match.teamA, match.teamB].map((team, index) => (
                <View key={team.id} style={styles.venueMatchTeam}>
                  <View style={styles.venueMatchAvatars}>
                    {team.people.slice(0, 2).map((player, playerIndex) => (
                      <View
                        key={player.id}
                        style={[
                          styles.venueMatchAvatar,
                          playerIndex > 0 && styles.venueMatchAvatarOverlap,
                        ]}
                      >
                        <Text style={styles.venueMatchAvatarText}>
                          {player.initials}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.venueMatchTeamName}>
                      {team.name}
                    </Text>
                    <Text style={styles.venueMatchTeamMeta}>
                      {team.people
                        .map((player) => player.ratingDisplay.toFixed(2))
                        .join(" · ") || "Ratings pending"}
                    </Text>
                  </View>
                  {index === 0 && (
                    <Text style={styles.venueMatchVersus}>VS</Text>
                  )}
                </View>
              ))}
            </View>
            <Pressable
              accessibilityLabel={`${match.status === "live" ? "Resume" : "Begin"} scoring ${match.teamA.name} versus ${match.teamB.name}`}
              onPress={() => onScore(match.id)}
              style={[
                styles.venueMatchAction,
                match.status === "live" && styles.venueMatchActionLive,
              ]}
            >
              <Text style={styles.venueMatchActionText}>
                {match.status === "live"
                  ? "Resume courtside scoring"
                  : "Open match + score"}
              </Text>
              <Text style={styles.venueMatchActionText}>→</Text>
            </Pressable>
          </View>
        ))}
        {visibleMatches.length === 0 && (
          <View style={styles.venueMatchesEmpty}>
            <Text style={styles.venueMatchesEmptyTitle}>
              No matches on this day.
            </Text>
            <Text style={styles.venueMatchesEmptyBody}>
              Hosted and event matches appear automatically when their venue,
              program, or event belongs to this organization.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TodayScreen({
  onCalendar,
  onCreate,
  onGetPaid,
  onMessageGroup,
  onPeople,
  onRecordNotes,
  onScore,
}: {
  readonly onCalendar: (entryId?: string) => void;
  readonly onCreate: () => void;
  readonly onGetPaid: () => void;
  readonly onMessageGroup: (entry: ProCalendarEntry) => void;
  readonly onPeople: () => void;
  readonly onRecordNotes: (sessionId: string) => void;
  readonly onScore: (matchId?: string) => void;
}) {
  const { dashboard, mode, workspace } = useProRuntime();
  const organization = dashboard?.organization ?? demoOrganization;
  const timezone =
    workspace?.organization.timezone ??
    organization.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const nowMs = now.getTime();
  const todayKey = calendarDateKey(now, timezone);
  const previewEntries = schedule
    .slice(0, 3)
    .map((item, index): ProCalendarEntry => {
      const startsAt = new Date(now);
      startsAt.setHours(9 + index * 2, 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 75 * 60_000);
      return {
        id: `preview-today-${index}`,
        sourceType: "session",
        title: item[2],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone,
        status: index === 0 ? "live" : "scheduled",
        kind: index === 1 ? "clinic" : "open-play",
        venueName: index === 0 ? "Manhattan Beach" : "Hermosa Beach",
        courtName: item[3],
        participantCount: Number(item[4].split(" / ")[0]),
        capacity: Number(item[4].split(" / ")[1]),
        color: index === 0 ? colors.flare : colors.aqua,
        draggable: true,
        attendees: [],
        equipment: [],
      };
    });
  const todayEntries = (workspace?.calendar.entries ?? previewEntries)
    .filter(
      (entry) =>
        entry.sourceType === "session" &&
        calendarDateKey(new Date(entry.startsAt), timezone) === todayKey,
    )
    .slice()
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
  const currentEntry = todayEntries.find(
    (entry) =>
      Date.parse(entry.startsAt) <= nowMs && Date.parse(entry.endsAt) > nowMs,
  );
  const justEndedEntry = [...todayEntries]
    .reverse()
    .find(
      (entry) =>
        Date.parse(entry.endsAt) <= nowMs &&
        nowMs - Date.parse(entry.endsAt) < 2 * 60 * 60_000,
    );
  const nextEntry = todayEntries.find(
    (entry) => Date.parse(entry.startsAt) > nowMs,
  );
  const focusEntry = justEndedEntry ?? currentEntry ?? nextEntry;
  const focusRegistrations = focusEntry
    ? (workspace?.eventRegistrations.filter(
        (registration) => registration.sessionId === focusEntry.id,
      ) ?? [])
    : [];
  const todaySessionIds = new Set(todayEntries.map((entry) => entry.id));
  const todayRegistrations =
    workspace?.eventRegistrations.filter((registration) =>
      todaySessionIds.has(registration.sessionId),
    ) ?? [];
  const cancellationCount = todayRegistrations.filter((registration) =>
    ["cancelled", "refunded"].includes(registration.status),
  ).length;
  const checkedInCount = todayRegistrations.filter(
    (registration) => registration.status === "checked-in",
  ).length;
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(now)
    .replace(", ", " · ")
    .toUpperCase();
  const primaryVenue = workspace?.venues.find((venue) => venue.weather);
  const todayForecast = primaryVenue?.weather?.days[0];
  const businessMetrics = dashboard?.metrics.slice(0, 3) ?? [];
  const productPerformance = workspace?.productPerformance ?? [];
  const topProduct = productPerformance
    .slice()
    .sort((left, right) => right.netSalesMinor - left.netSalesMinor)[0];
  const topProductName = topProduct
    ? (workspace?.catalog.find((item) => item.id === topProduct.catalogItemId)
        ?.title ?? "Top product")
    : undefined;
  const visionStudioUrl = `${dunaApiBaseUrl}/app/video`;

  const nextAction = justEndedEntry
    ? {
        eyebrow: "SESSION JUST ENDED",
        title: "Capture the coaching while it’s fresh.",
        body: `${justEndedEntry.title} ended ${formatVenueTime(
          justEndedEntry.endsAt,
          timezone,
          "en-US",
          { hour: "numeric", minute: "2-digit" },
        )}. Record one note for yourself or prepare feedback for individual players.`,
        action: "Record session notes",
        secondary: "Message roster",
        tone: "notes" as const,
      }
    : currentEntry
      ? {
          eyebrow: "HAPPENING NOW",
          title: currentEntry.title,
          body: `${currentEntry.participantCount} of ${currentEntry.capacity} expected · ${currentEntry.venueName ?? "Location pending"}${currentEntry.courtName ? ` · ${currentEntry.courtName}` : ""}.`,
          action: "Open live session",
          secondary: "Message roster",
          tone: "live" as const,
        }
      : nextEntry
        ? {
            eyebrow: "UP NEXT",
            title: nextEntry.title,
            body: `${formatVenueTime(nextEntry.startsAt, timezone, "en-US", {
              hour: "numeric",
              minute: "2-digit",
            })} · ${nextEntry.participantCount} of ${nextEntry.capacity} expected · ${nextEntry.venueName ?? "Location pending"}.`,
            action: "Prepare the session",
            secondary: "Message roster",
            tone: "next" as const,
          }
        : {
            eyebrow: "DAY COMPLETE",
            title: "Your sessions are wrapped.",
            body: `${todayEntries.length} sessions · ${checkedInCount} check-ins · ${cancellationCount} player cancellations today.`,
            action: "Review today",
            secondary: "Open People",
            tone: "done" as const,
          };

  return (
    <ScrollView
      contentContainerStyle={styles.todayContent}
      showsVerticalScrollIndicator={false}
    >
      <Header showOperations />
      <PageTitle
        action="Calendar"
        eyebrow={today}
        onAction={() => onCalendar()}
        title={mode === "preview" ? "Good morning, Sam." : "Your day."}
      />
      <View
        style={[
          styles.nowCard,
          nextAction.tone === "live" && styles.nowCardLive,
          nextAction.tone === "notes" && styles.nowCardNotes,
        ]}
      >
        <View style={styles.nowCardTopline}>
          <Text style={styles.nowCardEyebrow}>{nextAction.eyebrow}</Text>
          {primaryVenue?.weather && todayForecast && (
            <Text style={styles.nowCardWeather}>
              {weatherSymbol(todayForecast.icon)}{" "}
              {fahrenheit(todayForecast.temperatureHighC)} · {primaryVenue.name}
            </Text>
          )}
        </View>
        <Text style={styles.nowCardTitle}>{nextAction.title}</Text>
        <Text style={styles.nowCardBody}>{nextAction.body}</Text>
        <View style={styles.nowCardActions}>
          <Pressable
            onPress={() => {
              selectionHaptic();
              if (justEndedEntry) {
                onRecordNotes(justEndedEntry.id);
              } else if (focusEntry) {
                onCalendar(focusEntry.id);
              } else {
                onCalendar();
              }
            }}
            style={styles.nowCardPrimary}
          >
            <Text style={styles.nowCardPrimaryIcon}>
              {justEndedEntry ? "●" : currentEntry ? "▶" : "→"}
            </Text>
            <Text style={styles.nowCardPrimaryText}>{nextAction.action}</Text>
          </Pressable>
          <Pressable
            disabled={Boolean(focusEntry) && focusRegistrations.length === 0}
            onPress={() => {
              if (focusEntry) {
                onMessageGroup(focusEntry);
              } else {
                onPeople();
              }
            }}
            style={styles.nowCardSecondary}
          >
            <Text style={styles.nowCardSecondaryText}>
              {nextAction.secondary}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.nowCardTrust}>
          {justEndedEntry
            ? "Voice notes stay private until you review and choose who can see them."
            : `${focusRegistrations.length} roster contacts available on this device.`}
        </Text>
      </View>

      <VenueMatchesSection
        dateKey={todayKey}
        onScore={onScore}
        timezone={timezone}
      />

      <View style={styles.visionCoachCard}>
        <View style={styles.visionCoachMark}>
          <Text style={styles.visionCoachMarkText}>◉</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.visionCoachEyebrow}>DUNA VISION</Text>
          <Text style={styles.visionCoachTitle}>
            Bring the last rally into the coaching conversation.
          </Text>
          <Text style={styles.visionCoachBody}>
            Apple Watch and Duna Player review cues open beside source video in
            Player Studio. Court observations remain confidence-labeled and
            reviewable—never silently turned into a score.
          </Text>
          <Pressable
            accessibilityHint="Opens the paired Duna Player Studio in your browser"
            accessibilityRole="link"
            accessibilityLabel="Open Duna Vision Player Studio"
            onPress={() => {
              impactHaptic();
              void Linking.openURL(visionStudioUrl).catch(() => undefined);
            }}
            style={styles.visionCoachAction}
          >
            <Text style={styles.visionCoachActionText}>Open Player Studio</Text>
            <Text style={styles.visionCoachActionArrow}>→</Text>
          </Pressable>
        </View>
      </View>

      {focusEntry && (
        <SessionArrivalBoard
          expectedPlayers={focusEntry.participantCount}
          sessionId={focusEntry.id}
          startsAt={focusEntry.startsAt}
          title={focusEntry.title}
          venueName={focusEntry.venueName}
        />
      )}

      <View style={styles.todayJobs}>
        <Pressable onPress={() => onCalendar()} style={styles.todayJob}>
          <Text style={styles.todayJobIcon}>▦</Text>
          <Text style={styles.todayJobTitle}>Schedule</Text>
          <Text style={styles.todayJobMeta}>{todayEntries.length} today</Text>
        </Pressable>
        <Pressable onPress={onPeople} style={styles.todayJob}>
          <Text style={styles.todayJobIcon}>◎</Text>
          <Text style={styles.todayJobTitle}>People</Text>
          <Text style={styles.todayJobMeta}>
            {organization.memberCount} connected
          </Text>
        </Pressable>
        <Pressable onPress={onCreate} style={styles.todayJob}>
          <Text style={styles.todayJobIcon}>＋</Text>
          <Text style={styles.todayJobTitle}>Create</Text>
          <Text style={styles.todayJobMeta}>Session, service, good, plan</Text>
        </Pressable>
        <Pressable onPress={onGetPaid} style={styles.todayJob}>
          <Text style={styles.todayJobIcon}>)))</Text>
          <Text style={styles.todayJobTitle}>Get Paid</Text>
          <Text style={styles.todayJobMeta}>Tap to Pay or wallet</Text>
        </Pressable>
      </View>

      <SectionTitle
        action="Money"
        eyebrow="BUSINESS PULSE"
        onAction={onGetPaid}
        title="How the club is moving"
      />
      <View style={styles.businessPulse}>
        <View style={styles.businessMetricRow}>
          {businessMetrics.map((metric) => (
            <View key={metric.label} style={styles.businessMetric}>
              <Text style={styles.businessMetricValue}>{metric.value}</Text>
              <Text style={styles.businessMetricLabel}>{metric.label}</Text>
              {metric.change && (
                <Text style={styles.businessMetricChange}>{metric.change}</Text>
              )}
            </View>
          ))}
          {businessMetrics.length === 0 && (
            <View style={styles.businessMetricEmpty}>
              <Text style={styles.businessMetricEmptyTitle}>
                Business data is connecting.
              </Text>
              <Text style={styles.businessMetricEmptyBody}>
                Sales, people, and upcoming activity appear here from the live
                organization workspace.
              </Text>
            </View>
          )}
        </View>
        <View style={styles.businessInsight}>
          <Text style={styles.businessInsightIcon}>↗</Text>
          <View style={styles.flex}>
            <Text style={styles.businessInsightTitle}>
              {topProduct && topProductName
                ? `${topProductName} leads product revenue`
                : "Performance stays tied to real activity"}
            </Text>
            <Text style={styles.businessInsightBody}>
              {topProduct
                ? `${topProduct.paidPurchases} paid purchase${topProduct.paidPurchases === 1 ? "" : "s"} · ${topProduct.uniqueCustomers} customer${topProduct.uniqueCustomers === 1 ? "" : "s"} · ${topProduct.grossMarginBps === undefined ? "margin pending" : `${(topProduct.grossMarginBps / 100).toFixed(1)}% gross margin`}`
                : `${checkedInCount} check-ins and ${cancellationCount} cancellations are reflected from today’s live roster.`}
            </Text>
          </View>
        </View>
      </View>

      <SectionTitle
        action="Full calendar"
        eyebrow="TODAY"
        onAction={() => onCalendar()}
        title="Your schedule"
      />
      <View style={styles.todaySchedule}>
        {todayEntries.map((entry) => {
          const startsAt = Date.parse(entry.startsAt);
          const endsAt = Date.parse(entry.endsAt);
          const state =
            startsAt <= nowMs && endsAt > nowMs
              ? "NOW"
              : endsAt <= nowMs
                ? "DONE"
                : "NEXT";
          return (
            <Pressable
              key={entry.id}
              onPress={() => onCalendar(entry.id)}
              style={styles.todayScheduleRow}
            >
              <View style={styles.todayScheduleTime}>
                <Text style={styles.todayScheduleTimeMain}>
                  {formatVenueTime(entry.startsAt, timezone, "en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <Text style={styles.todayScheduleDuration}>
                  {Math.round((endsAt - startsAt) / 60_000)} min
                </Text>
              </View>
              <View
                style={[
                  styles.todayScheduleLine,
                  state === "NOW" && styles.todayScheduleLineLive,
                ]}
              />
              <View style={styles.flex}>
                <Text style={styles.todayScheduleTitle}>{entry.title}</Text>
                <Text style={styles.todayScheduleMeta}>
                  {entry.venueName ?? "Location pending"}
                  {entry.courtName ? ` · ${entry.courtName}` : ""} ·{" "}
                  {entry.participantCount}/{entry.capacity}
                </Text>
              </View>
              <Text
                style={[
                  styles.todayScheduleState,
                  state === "NOW" && styles.todayScheduleStateLive,
                ]}
              >
                {state}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
        {todayEntries.length === 0 && (
          <View style={styles.todayEmpty}>
            <Text style={styles.todayEmptyTitle}>Nothing scheduled today.</Text>
            <Text style={styles.todayEmptyBody}>
              Use the time for follow-ups or create the next session.
            </Text>
          </View>
        )}
      </View>

      <SectionTitle eyebrow="CARE SIGNALS" title="What changed" />
      <View style={styles.todaySignals}>
        <Pressable
          onPress={() => onCalendar(focusEntry?.id)}
          style={styles.todaySignalRow}
        >
          <View
            style={[
              styles.todaySignalIcon,
              cancellationCount > 0 && styles.todaySignalIconWarning,
            ]}
          >
            <Text style={styles.todaySignalIconText}>↘</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.todaySignalTitle}>
              {cancellationCount === 0
                ? "No player cancellations today"
                : `${cancellationCount} player cancellation${cancellationCount === 1 ? "" : "s"}`}
            </Text>
            <Text style={styles.todaySignalBody}>
              {cancellationCount === 0
                ? "Your active rosters have held steady."
                : "Open session history to review refunds and fill available spots."}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable onPress={onPeople} style={styles.todaySignalRow}>
          <View style={styles.todaySignalIcon}>
            <Text style={styles.todaySignalIconText}>◎</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.todaySignalTitle}>People are one tap away</Text>
            <Text style={styles.todaySignalBody}>
              Search balances, plans, history, notes, videos, and player
              profiles.
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      {(now.getHours() >= 17 || !nextEntry) && todayEntries.length > 0 && (
        <View style={styles.dayRecap}>
          <Text style={styles.dayRecapEyebrow}>DAY RECAP</Text>
          <Text style={styles.dayRecapTitle}>
            You ran {todayEntries.length} sessions.
          </Text>
          <Text style={styles.dayRecapBody}>
            {checkedInCount} check-ins · {cancellationCount} cancellations ·{" "}
            {
              todayEntries.filter((entry) => Date.parse(entry.endsAt) <= nowMs)
                .length
            }{" "}
            completed.
          </Text>
          <Pressable onPress={() => onCalendar()} style={styles.dayRecapButton}>
            <Text style={styles.dayRecapButtonText}>
              Review session history →
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function SectionTitle({
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
    <View style={styles.sectionTitle}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionHeading}>{title}</Text>
      </View>
      {action && (
        <Pressable disabled={!onAction} onPress={onAction}>
          <Text style={styles.linkText}>{action} →</Text>
        </Pressable>
      )}
    </View>
  );
}

function CalendarScreen({
  focusEntryId,
  onCreate,
  onMessageGroup,
  onRecordNotes,
  onScan,
  onScore,
}: {
  readonly focusEntryId?: string;
  readonly onCreate: () => void;
  readonly onMessageGroup: (entry: ProCalendarEntry) => void;
  readonly onRecordNotes: (sessionId: string) => void;
  readonly onScan: () => void;
  readonly onScore: (matchId?: string) => void;
}) {
  const { client, dashboard, mode, refresh, workspace } = useProRuntime();
  const timezone =
    workspace?.organization.timezone ??
    dashboard?.organization.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selectedDate, setSelectedDate] = useState(() =>
    calendarDayAtNoon(new Date(), 0),
  );
  const [resourceFilter, setResourceFilter] =
    useState<CalendarResourceFilter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [sheetMode, setSheetMode] = useState<CalendarSheetMode>("session");
  const [busyAction, setBusyAction] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [cancelReason, setCancelReason] = useState("");
  const [blockResourceType, setBlockResourceType] = useState<"court" | "coach">(
    "court",
  );
  const [blockResourceId, setBlockResourceId] = useState("");
  const [blockMode, setBlockMode] = useState<"blocked" | "maintenance">(
    "blocked",
  );
  const [blockStartHour, setBlockStartHour] = useState(9);
  const [blockDuration, setBlockDuration] = useState(60);
  const [blockReason, setBlockReason] = useState("");
  const [blockCreationMode, setBlockCreationMode] = useState<"one-time" | "ai">(
    "one-time",
  );
  const [aiSchedulePrompt, setAiSchedulePrompt] = useState("");
  const [aiScheduleDraft, setAiScheduleDraft] =
    useState<NaturalLanguageScheduleDraft>();
  const [aiScheduleConfirmed, setAiScheduleConfirmed] = useState(false);
  const [personalCalendar, setPersonalCalendar] =
    useState<ProCalendarConnection>();
  const [personalEvents, setPersonalEvents] = useState<
    readonly ProPersonalCalendarEvent[]
  >([]);
  const [personalCalendarBusy, setPersonalCalendarBusy] = useState(false);
  const [personalCalendarNotice, setPersonalCalendarNotice] =
    useState<string>();

  const previewEntries = useMemo<readonly ProCalendarEntry[]>(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    return schedule.slice(0, 3).map((item, index) => {
      const startsAt = new Date(start.getTime() + (index + 1) * 90 * 60_000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
      return {
        id: `preview-calendar-${index}`,
        sourceType: "session",
        title: item[2],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone,
        status: index === 0 ? "live" : "scheduled",
        kind: index === 1 ? "clinic" : "open-play",
        venueName: index === 0 ? "Manhattan Beach" : "Hermosa Beach",
        courtName: `Court ${index + 1}`,
        coachName: index === 0 ? "Coach Sam" : "Coach Alex",
        participantCount: Number(item[4].split(" / ")[0]),
        capacity: Number(item[4].split(" / ")[1]),
        color: index === 0 ? colors.flare : colors.aqua,
        draggable: true,
        attendees: [],
        equipment: [],
      };
    });
  }, [timezone]);
  const entries = workspace?.calendar.entries ?? previewEntries;
  const dayKey = calendarDateKey(selectedDate, timezone);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        calendarDayAtNoon(selectedDate, index - 3),
      ),
    [selectedDate],
  );
  const visibleEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            calendarDateKey(new Date(entry.startsAt), timezone) === dayKey,
        )
        .filter((entry) => {
          if (resourceFilter === "courts") return Boolean(entry.courtId);
          if (resourceFilter === "coaches") return Boolean(entry.coachPersonId);
          return true;
        })
        .slice()
        .sort(
          (left, right) =>
            Date.parse(left.startsAt) - Date.parse(right.startsAt),
        ),
    [dayKey, entries, resourceFilter, timezone],
  );
  const selectedEntry = entries.find((entry) => entry.id === selectedId);
  const connectedPeople = new Set(
    selectedEntry?.attendees.map((attendee) => attendee.personId) ?? [],
  );
  const participantCandidates =
    workspace?.people.filter(
      (person) =>
        person.status === "active" &&
        person.roles.includes("player") &&
        !connectedPeople.has(person.personId),
    ) ?? [];
  const reservedEquipment = new Set(
    selectedEntry?.equipment.map((item) => item.inventoryStockItemId) ?? [],
  );
  const equipmentCandidates =
    workspace?.inventory.filter(
      (item) =>
        item.purpose !== "sale" &&
        item.quantityOnHand > item.quantityReserved &&
        !reservedEquipment.has(item.id),
    ) ?? [];
  const blockResources =
    blockResourceType === "court"
      ? (workspace?.venues.flatMap((venue) =>
          venue.courts.map((court) => ({
            id: court.id,
            label: `${venue.name} · ${court.name}`,
          })),
        ) ?? [])
      : (workspace?.staff
          .filter((person) => person.active)
          .map((person) => ({
            id: person.personId,
            label: person.displayName,
          })) ?? []);
  const selectedVenue = selectedEntry?.venueId
    ? workspace?.venues.find((venue) => venue.id === selectedEntry.venueId)
    : workspace?.venues.find(
        (venue) => venue.name === selectedEntry?.venueName,
      );
  const selectedWeather = selectedEntry
    ? selectedVenue?.weather?.hourly
        .slice()
        .sort(
          (left, right) =>
            Math.abs(
              Date.parse(left.startsAt) - Date.parse(selectedEntry.startsAt),
            ) -
            Math.abs(
              Date.parse(right.startsAt) - Date.parse(selectedEntry.startsAt),
            ),
        )[0]
    : undefined;

  useEffect(() => {
    if (!focusEntryId) return;
    const entry = entries.find((candidate) => candidate.id === focusEntryId);
    if (!entry) return;
    setSelectedDate(calendarDayAtNoon(new Date(entry.startsAt), 0));
    setSelectedId(entry.id);
    setSheetMode("session");
  }, [entries, focusEntryId]);

  useEffect(() => {
    if (!blockResourceId && blockResources[0])
      setBlockResourceId(blockResources[0].id);
  }, [blockResourceId, blockResources]);

  useEffect(() => {
    let active = true;
    if (Platform.OS === "web") return () => undefined;
    setPersonalCalendarBusy(true);
    setPersonalCalendarNotice(undefined);
    void (async () => {
      try {
        const connection = await readProCalendarConnection();
        if (!active) return;
        setPersonalCalendar(connection);
        if (!connection) {
          setPersonalEvents([]);
          return;
        }
        const nextDayKey = calendarDateKey(
          calendarDayAtNoon(selectedDate, 1),
          timezone,
        );
        const events = await loadProPersonalEvents(
          new Date(zonedLocalToIso(dayKey, 0, 0, timezone)),
          new Date(zonedLocalToIso(nextDayKey, 0, 0, timezone)),
        );
        if (active) {
          setPersonalEvents(
            events
              .slice()
              .sort(
                (left, right) =>
                  Date.parse(String(left.startDate)) -
                  Date.parse(String(right.startDate)),
              ),
          );
        }
      } catch (reason) {
        if (active) setPersonalCalendarNotice(displayError(reason));
      } finally {
        if (active) setPersonalCalendarBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [dayKey, selectedDate, timezone]);

  const connectPersonalCalendar = async () => {
    setPersonalCalendarBusy(true);
    setPersonalCalendarNotice(undefined);
    try {
      const connection = await connectProCalendar();
      const nextDayKey = calendarDateKey(
        calendarDayAtNoon(selectedDate, 1),
        timezone,
      );
      const events = await loadProPersonalEvents(
        new Date(zonedLocalToIso(dayKey, 0, 0, timezone)),
        new Date(zonedLocalToIso(nextDayKey, 0, 0, timezone)),
      );
      setPersonalCalendar(connection);
      setPersonalEvents(
        events
          .slice()
          .sort(
            (left, right) =>
              Date.parse(String(left.startDate)) -
              Date.parse(String(right.startDate)),
          ),
      );
      setPersonalCalendarNotice(
        `${connection.title} is linked. Personal events stay on this device.`,
      );
      successHaptic();
    } catch (reason) {
      setPersonalCalendarNotice(displayError(reason));
    } finally {
      setPersonalCalendarBusy(false);
    }
  };

  const closeSheet = () => {
    setSelectedId(undefined);
    setSheetMode("session");
    setFeedback(undefined);
    setCancelReason("");
  };

  const perform = async (key: string, action: () => Promise<unknown>) => {
    if (!client || mode !== "live") {
      setFeedback("Live calendar changes are disabled in preview.");
      return false;
    }
    setBusyAction(key);
    setFeedback(undefined);
    try {
      await action();
      await refresh();
      successHaptic();
      setFeedback("Saved. Connected people will receive the relevant update.");
      return true;
    } catch (reason) {
      setFeedback(displayError(reason));
      return false;
    } finally {
      setBusyAction(undefined);
    }
  };

  const openEntry = (entry: ProCalendarEntry) => {
    selectionHaptic();
    setSelectedId(entry.id);
    setSheetMode("session");
    setFeedback(undefined);
  };

  const openBlock = () => {
    selectionHaptic();
    setSelectedId(undefined);
    setSheetMode("block");
    setBlockCreationMode("one-time");
    setAiSchedulePrompt("");
    setAiScheduleDraft(undefined);
    setAiScheduleConfirmed(false);
    setFeedback(undefined);
  };

  const createBlock = async () => {
    if (!blockResourceId) {
      setFeedback("Choose a court or coach before blocking time.");
      return;
    }
    const startsAt = zonedLocalToIso(dayKey, blockStartHour, 0, timezone);
    const endsAt = new Date(
      Date.parse(startsAt) + blockDuration * 60_000,
    ).toISOString();
    const saved = await perform("block", () =>
      client!.operator.createCalendarBlock.mutate({
        resourceType: blockResourceType,
        resourceId: blockResourceId,
        startsAt,
        endsAt,
        mode: blockMode,
        reason:
          blockReason.trim() ||
          (blockMode === "maintenance"
            ? "Facility maintenance window."
            : "Blocked by the organization."),
        idempotencyKey: Crypto.randomUUID(),
      }),
    );
    if (saved) closeSheet();
  };

  const createRecurringBlocks = async () => {
    if (!blockResourceId || aiScheduleDraft?.status !== "ready") {
      setFeedback("Choose a resource and build a complete schedule draft.");
      return;
    }
    if (!aiScheduleConfirmed) {
      setFeedback("Review and confirm the recurring schedule first.");
      return;
    }
    const effectiveEnd = calendarDayAtNoon(selectedDate, 90);
    const saved = await perform("recurring-block", () =>
      client!.operator.createRecurringCalendarBlocks.mutate({
        resourceType: blockResourceType,
        resourceId: blockResourceId,
        blocks: aiScheduleDraft.blocks.map((block) => ({
          weekday: block.weekday,
          startsAtMinute: block.startsAtMinute,
          endsAtMinute: block.endsAtMinute,
        })),
        effectiveFrom: dayKey,
        effectiveTo: calendarDateKey(effectiveEnd, timezone),
        mode: "blocked",
        reason: aiScheduleDraft.reason,
        confirmed: true,
        idempotencyKey: Crypto.randomUUID(),
      }),
    );
    if (saved) closeSheet();
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.calendarContent}
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <PageTitle
          action="New"
          eyebrow="THE OPERATING HUB"
          onAction={onCreate}
          title="Court schedule."
        />
        <Text style={styles.calendarIntro}>
          Sessions, clinics, events, court time, coaches, players, equipment,
          and changes in one live schedule.
        </Text>

        <View style={styles.calendarToolbar}>
          <View style={styles.calendarToolbarActions}>
            <Pressable onPress={openBlock} style={styles.calendarBlockButton}>
              <Text style={styles.calendarBlockButtonText}>▧ Block time</Text>
            </Pressable>
            <Pressable onPress={onCreate} style={styles.calendarNewButton}>
              <Text style={styles.calendarNewButtonText}>＋ Add session</Text>
            </Pressable>
            <Pressable onPress={onScan} style={styles.calendarScanButton}>
              <Text style={styles.calendarScanButtonText}>⌗ Scan passes</Text>
            </Pressable>
          </View>
          <Text style={styles.calendarTimezone}>{timezone}</Text>
        </View>

        <View style={styles.calendarConnectionCard}>
          <View style={styles.calendarConnectionIcon}>
            <Text style={styles.calendarConnectionIconText}>▦</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.calendarConnectionEyebrow}>
              {personalCalendar ? "PERSONAL CALENDAR LINKED" : "YOUR TIME"}
            </Text>
            <Text style={styles.calendarConnectionTitle}>
              {personalCalendar
                ? `${personalCalendar.title} is included`
                : "See work and personal commitments together"}
            </Text>
            <Text style={styles.calendarConnectionBody}>
              {personalCalendar
                ? "Duna Pro reads this calendar on your device. Events are not copied to the organization."
                : "Link Apple, Google, or Outlook from this device for a clearer coaching schedule."}
            </Text>
            {personalCalendarNotice && (
              <Text style={styles.calendarConnectionNotice}>
                {personalCalendarNotice}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityLabel={
              personalCalendar
                ? "Refresh personal calendar"
                : "Link personal calendar"
            }
            disabled={personalCalendarBusy}
            onPress={() => void connectPersonalCalendar()}
            style={styles.calendarConnectionButton}
          >
            <Text style={styles.calendarConnectionButtonText}>
              {personalCalendarBusy
                ? "Checking"
                : personalCalendar
                  ? "Refresh"
                  : "Link"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.calendarDayBleed}
        >
          <View style={styles.calendarDayStrip}>
            {days.map((day) => {
              const label = formatCalendarDay(day);
              const active =
                calendarDateKey(day, timezone) ===
                calendarDateKey(selectedDate, timezone);
              return (
                <Pressable
                  accessibilityState={{ selected: active }}
                  key={day.toISOString()}
                  onPress={() => {
                    selectionHaptic();
                    setSelectedDate(day);
                  }}
                  style={[
                    styles.calendarDayButton,
                    active && styles.calendarDayButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarDayWeekday,
                      active && styles.calendarDayTextActive,
                    ]}
                  >
                    {label.weekday}
                  </Text>
                  <Text
                    style={[
                      styles.calendarDayNumber,
                      active && styles.calendarDayTextActive,
                    ]}
                  >
                    {label.day}
                  </Text>
                  <Text
                    style={[
                      styles.calendarDayMonth,
                      active && styles.calendarDayTextActive,
                    ]}
                  >
                    {label.month}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <VenueMatchesSection
          dateKey={dayKey}
          onScore={onScore}
          timezone={timezone}
        />

        <View style={styles.calendarFilterRow}>
          {(
            [
              ["all", "Everything"],
              ["courts", "By court"],
              ["coaches", "By coach"],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setResourceFilter(key)}
              style={[
                styles.calendarFilter,
                resourceFilter === key && styles.calendarFilterActive,
              ]}
            >
              <Text
                style={[
                  styles.calendarFilterText,
                  resourceFilter === key && styles.calendarFilterTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {personalCalendar && (
          <>
            <View style={styles.calendarPersonalHeading}>
              <View>
                <Text style={styles.eyebrow}>PERSONAL CALENDAR</Text>
                <Text style={styles.calendarPersonalTitle}>
                  Private commitments
                </Text>
              </View>
              <Pill tone="neutral">{`${personalEvents.length} private`}</Pill>
            </View>
            <View style={styles.calendarPersonalAgenda}>
              {personalEvents.map((event) => (
                <View key={event.id} style={styles.calendarPersonalCard}>
                  <View style={styles.calendarPersonalTime}>
                    <Text style={styles.calendarPersonalTimeMain}>
                      {event.allDay
                        ? "ALL DAY"
                        : formatCalendarTime(
                            new Date(String(event.startDate)).toISOString(),
                            timezone,
                          )}
                    </Text>
                    {!event.allDay && (
                      <Text style={styles.calendarPersonalTimeEnd}>
                        {formatCalendarTime(
                          new Date(String(event.endDate)).toISOString(),
                          timezone,
                        )}
                      </Text>
                    )}
                  </View>
                  <View style={styles.calendarPersonalAccent} />
                  <View style={styles.flex}>
                    <Text style={styles.calendarPersonalName}>
                      {event.title || "Busy"}
                    </Text>
                    <Text style={styles.calendarPersonalMeta}>
                      {[event.location, personalCalendar.title]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Pill tone="neutral">Private</Pill>
                </View>
              ))}
              {personalEvents.length === 0 && (
                <View style={styles.calendarPersonalEmpty}>
                  <Text style={styles.calendarPersonalEmptyText}>
                    No personal conflicts on this day.
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        <View style={styles.calendarAgendaHeading}>
          <View>
            <Text style={styles.eyebrow}>ORGANIZATION SCHEDULE</Text>
            <Text style={styles.calendarAgendaTitle}>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(selectedDate)}
            </Text>
          </View>
          <Pill
            tone={
              visibleEntries.length + personalEvents.length > 0
                ? "positive"
                : "neutral"
            }
          >
            {`${visibleEntries.length + personalEvents.length} total`}
          </Pill>
        </View>

        <View style={styles.calendarAgenda}>
          {visibleEntries.length === 0 ? (
            <View style={styles.calendarEmpty}>
              <Text style={styles.calendarEmptyIcon}>☀</Text>
              <Text style={styles.calendarEmptyTitle}>The day is open.</Text>
              <Text style={styles.calendarEmptyBody}>
                Add a clinic, lesson, event, or protect time for a coach or
                court.
              </Text>
              <View style={styles.calendarEmptyActions}>
                <Pressable
                  onPress={openBlock}
                  style={styles.calendarEmptySecondary}
                >
                  <Text style={styles.calendarEmptySecondaryText}>
                    Block time
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onCreate}
                  style={styles.calendarEmptyPrimary}
                >
                  <Text style={styles.calendarEmptyPrimaryText}>
                    Add something
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            visibleEntries.map((entry) => {
              const venue = entry.venueId
                ? workspace?.venues.find(
                    (candidate) => candidate.id === entry.venueId,
                  )
                : workspace?.venues.find(
                    (candidate) => candidate.name === entry.venueName,
                  );
              const weather = venue?.weather?.hourly
                .slice()
                .sort(
                  (left, right) =>
                    Math.abs(
                      Date.parse(left.startsAt) - Date.parse(entry.startsAt),
                    ) -
                    Math.abs(
                      Date.parse(right.startsAt) - Date.parse(entry.startsAt),
                    ),
                )[0];
              const blocked =
                entry.sourceType === "operator-block" ||
                entry.sourceType === "busy-block";
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => openEntry(entry)}
                  style={[
                    styles.calendarAgendaCard,
                    blocked && styles.calendarAgendaCardBlocked,
                  ]}
                >
                  <View style={styles.calendarAgendaTime}>
                    <Text style={styles.calendarAgendaTimeMain}>
                      {formatCalendarTime(entry.startsAt, timezone)}
                    </Text>
                    <Text style={styles.calendarAgendaTimeEnd}>
                      {formatCalendarTime(entry.endsAt, timezone)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.calendarAgendaAccent,
                      { backgroundColor: entry.color },
                    ]}
                  />
                  <View style={styles.flex}>
                    <View style={styles.calendarAgendaTopline}>
                      <Text style={styles.calendarAgendaKind}>
                        {entryLabel(entry).toUpperCase()}
                      </Text>
                      {weather && !blocked && (
                        <Text style={styles.calendarAgendaWeather}>
                          {weatherSymbol(weather.icon)}{" "}
                          {fahrenheit(weather.temperatureC)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.calendarAgendaName}>{entry.title}</Text>
                    <Text style={styles.calendarAgendaMeta}>
                      {[
                        entry.courtName ?? entry.venueName,
                        entry.coachName,
                        blocked
                          ? entry.status
                          : `${entry.participantCount}/${entry.capacity || "open"} coming`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {!blocked && entry.attendees.length > 0 && (
                      <View style={styles.calendarAvatarRow}>
                        {entry.attendees.slice(0, 5).map((attendee, index) => (
                          <View
                            key={attendee.registrationId}
                            style={[
                              styles.calendarAvatar,
                              index > 0 && styles.calendarAvatarOverlap,
                            ]}
                          >
                            <Text style={styles.calendarAvatarText}>
                              {personInitials(attendee.displayName)}
                            </Text>
                          </View>
                        ))}
                        {entry.attendees.length > 5 && (
                          <Text style={styles.calendarAvatarMore}>
                            +{entry.attendees.length - 5}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.calendarNotificationNote}>
          <Text style={styles.calendarNotificationIcon}>◈</Text>
          <View style={styles.flex}>
            <Text style={styles.calendarNotificationTitle}>
              Every connected change is communicated.
            </Text>
            <Text style={styles.calendarNotificationBody}>
              Roster, time, equipment, and cancellation updates queue in-app and
              push notifications. Verified guardians receive copies for minors.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={closeSheet}
        transparent
        visible={Boolean(selectedEntry) || sheetMode === "block"}
      >
        <Pressable onPress={closeSheet} style={styles.calendarSheetBackdrop}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.calendarSheet}
          >
            <View style={styles.calendarSheetHandle} />
            <View style={styles.calendarSheetHeader}>
              <Pressable
                accessibilityLabel="Close calendar details"
                onPress={closeSheet}
                style={styles.calendarSheetClose}
              >
                <Text style={styles.calendarSheetCloseText}>×</Text>
              </Pressable>
              <View style={styles.flex}>
                <Text style={styles.calendarSheetEyebrow}>
                  {sheetMode === "block"
                    ? "PROTECT THE SCHEDULE"
                    : selectedEntry
                      ? entryLabel(selectedEntry).toUpperCase()
                      : "CALENDAR"}
                </Text>
                <Text style={styles.calendarSheetTitle}>
                  {sheetMode === "block" ? "Block time" : selectedEntry?.title}
                </Text>
              </View>
              {selectedEntry && <Pill>{selectedEntry.status}</Pill>}
            </View>

            <ScrollView
              contentContainerStyle={styles.calendarSheetScroll}
              showsVerticalScrollIndicator={false}
            >
              {feedback && (
                <View style={styles.calendarFeedback}>
                  <Text style={styles.calendarFeedbackText}>{feedback}</Text>
                </View>
              )}

              {sheetMode === "block" ? (
                <>
                  <Text style={styles.calendarFieldLabel}>CREATE</Text>
                  <View style={styles.calendarChoiceRow}>
                    <Pressable
                      onPress={() => setBlockCreationMode("one-time")}
                      style={[
                        styles.calendarChoice,
                        blockCreationMode === "one-time" &&
                          styles.calendarChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarChoiceText,
                          blockCreationMode === "one-time" &&
                            styles.calendarChoiceTextActive,
                        ]}
                      >
                        One-time block
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setBlockCreationMode("ai")}
                      style={[
                        styles.calendarChoice,
                        blockCreationMode === "ai" &&
                          styles.calendarChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarChoiceText,
                          blockCreationMode === "ai" &&
                            styles.calendarChoiceTextActive,
                        ]}
                      >
                        ✦ Duna AI schedule
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.calendarFieldLabel}>RESOURCE TYPE</Text>
                  <View style={styles.calendarChoiceRow}>
                    {(["court", "coach"] as const).map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => {
                          setBlockResourceType(type);
                          setBlockResourceId("");
                        }}
                        style={[
                          styles.calendarChoice,
                          blockResourceType === type &&
                            styles.calendarChoiceActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarChoiceText,
                            blockResourceType === type &&
                              styles.calendarChoiceTextActive,
                          ]}
                        >
                          {type === "court" ? "Court" : "Coach"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.calendarFieldLabel}>
                    {blockResourceType === "court" ? "COURT" : "COACH"}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.calendarOptionRow}>
                      {blockResources.map((resource) => (
                        <Pressable
                          key={resource.id}
                          onPress={() => setBlockResourceId(resource.id)}
                          style={[
                            styles.calendarOption,
                            blockResourceId === resource.id &&
                              styles.calendarOptionActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calendarOptionText,
                              blockResourceId === resource.id &&
                                styles.calendarOptionTextActive,
                            ]}
                          >
                            {resource.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  {blockCreationMode === "one-time" ? (
                    <>
                      <Text style={styles.calendarFieldLabel}>START TIME</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        <View style={styles.calendarOptionRow}>
                          {[6, 8, 10, 12, 14, 16, 18, 20].map((hour) => (
                            <Pressable
                              key={hour}
                              onPress={() => setBlockStartHour(hour)}
                              style={[
                                styles.calendarTimeOption,
                                blockStartHour === hour &&
                                  styles.calendarOptionActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.calendarOptionText,
                                  blockStartHour === hour &&
                                    styles.calendarOptionTextActive,
                                ]}
                              >
                                {new Intl.DateTimeFormat("en-US", {
                                  hour: "numeric",
                                }).format(new Date(2026, 0, 1, hour, 0, 0, 0))}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                      <Text style={styles.calendarFieldLabel}>DURATION</Text>
                      <View style={styles.calendarChoiceRow}>
                        {[30, 60, 90, 120].map((duration) => (
                          <Pressable
                            key={duration}
                            onPress={() => setBlockDuration(duration)}
                            style={[
                              styles.calendarChoice,
                              blockDuration === duration &&
                                styles.calendarChoiceActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.calendarChoiceText,
                                blockDuration === duration &&
                                  styles.calendarChoiceTextActive,
                              ]}
                            >
                              {duration} min
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.calendarFieldLabel}>BLOCK TYPE</Text>
                      <View style={styles.calendarChoiceRow}>
                        {(["blocked", "maintenance"] as const).map((value) => (
                          <Pressable
                            key={value}
                            onPress={() => setBlockMode(value)}
                            style={[
                              styles.calendarChoice,
                              blockMode === value &&
                                styles.calendarChoiceActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.calendarChoiceText,
                                blockMode === value &&
                                  styles.calendarChoiceTextActive,
                              ]}
                            >
                              {value === "blocked"
                                ? "Unavailable"
                                : "Maintenance"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.calendarFieldLabel}>
                        NOTE FOR THE TEAM
                      </Text>
                      <TextInput
                        multiline
                        onChangeText={setBlockReason}
                        placeholder="Lunch, private hold, facility repair…"
                        placeholderTextColor={colors.muted}
                        style={styles.calendarTextArea}
                        value={blockReason}
                      />
                      <Text style={styles.calendarTimezoneNote}>
                        {new Intl.DateTimeFormat("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        }).format(selectedDate)}{" "}
                        · {timezone}
                      </Text>
                      <Pressable
                        disabled={busyAction === "block"}
                        onPress={() => void createBlock()}
                        style={styles.calendarSheetPrimary}
                      >
                        <Text style={styles.calendarSheetPrimaryText}>
                          {busyAction === "block"
                            ? "Blocking…"
                            : "Block this time"}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View style={styles.calendarAiIntro}>
                        <Text style={styles.calendarAiIcon}>✦</Text>
                        <View style={styles.flex}>
                          <Text style={styles.calendarAiTitle}>
                            Describe the real constraint.
                          </Text>
                          <Text style={styles.calendarAiBody}>
                            Duna drafts weekly blocks. You review every detail
                            before anything changes.
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.calendarFieldLabel}>
                        WHAT IS UNAVAILABLE?
                      </Text>
                      <TextInput
                        multiline
                        onChangeText={(value) => {
                          setAiSchedulePrompt(value);
                          setAiScheduleDraft(undefined);
                          setAiScheduleConfirmed(false);
                        }}
                        placeholder="I can’t work on Mon, Weds, Fri from noon–3 PM for school."
                        placeholderTextColor={colors.muted}
                        style={styles.calendarTextArea}
                        value={aiSchedulePrompt}
                      />
                      <Pressable
                        disabled={aiSchedulePrompt.trim().length < 8}
                        onPress={() =>
                          setAiScheduleDraft(
                            parseNaturalLanguageSchedule(aiSchedulePrompt),
                          )
                        }
                        style={[
                          styles.calendarSheetSecondary,
                          styles.calendarAiBuildButton,
                        ]}
                      >
                        <Text style={styles.calendarSheetSecondaryText}>
                          ✦ Build review draft
                        </Text>
                      </Pressable>
                      {aiScheduleDraft && (
                        <View style={styles.calendarAiDraft}>
                          <Text style={styles.calendarFieldLabel}>
                            PROPOSED WEEKLY BLOCKS
                          </Text>
                          <Text style={styles.calendarAiDraftTitle}>
                            {aiScheduleDraft.summary}
                          </Text>
                          {aiScheduleDraft.warnings.map((warning) => (
                            <Text
                              key={warning}
                              style={styles.calendarAiWarning}
                            >
                              ! {warning}
                            </Text>
                          ))}
                          {aiScheduleDraft.blocks.map((block) => (
                            <View
                              key={block.weekday}
                              style={styles.calendarAiBlock}
                            >
                              <Text style={styles.calendarAiBlockDay}>
                                {block.day}
                              </Text>
                              <Text style={styles.calendarAiBlockTime}>
                                {String(
                                  Math.floor(block.startsAtMinute / 60),
                                ).padStart(2, "0")}
                                :
                                {String(block.startsAtMinute % 60).padStart(
                                  2,
                                  "0",
                                )}
                                {" – "}
                                {String(
                                  Math.floor(block.endsAtMinute / 60),
                                ).padStart(2, "0")}
                                :
                                {String(block.endsAtMinute % 60).padStart(
                                  2,
                                  "0",
                                )}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <Text style={styles.calendarTimezoneNote}>
                        Applies for 90 days from{" "}
                        {new Intl.DateTimeFormat("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        }).format(selectedDate)}{" "}
                        · {timezone}
                      </Text>
                      {aiScheduleDraft?.status === "ready" && (
                        <Pressable
                          onPress={() =>
                            setAiScheduleConfirmed((current) => !current)
                          }
                          style={styles.calendarAiConfirm}
                        >
                          <Text style={styles.calendarAiConfirmMark}>
                            {aiScheduleConfirmed ? "✓" : ""}
                          </Text>
                          <View style={styles.flex}>
                            <Text style={styles.calendarAiConfirmTitle}>
                              Confirm this recurring schedule
                            </Text>
                            <Text style={styles.calendarAiConfirmBody}>
                              Existing bookings stay intact. Future availability
                              honors these blocks.
                            </Text>
                          </View>
                        </Pressable>
                      )}
                      <Pressable
                        disabled={
                          busyAction === "recurring-block" ||
                          !aiScheduleConfirmed ||
                          aiScheduleDraft?.status !== "ready"
                        }
                        onPress={() => void createRecurringBlocks()}
                        style={styles.calendarSheetPrimary}
                      >
                        <Text style={styles.calendarSheetPrimaryText}>
                          {busyAction === "recurring-block"
                            ? "Saving reviewed schedule…"
                            : "Confirm recurring blocks"}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </>
              ) : (
                selectedEntry && (
                  <>
                    <View style={styles.calendarSheetSummary}>
                      <View style={styles.calendarSheetSummaryItem}>
                        <Text style={styles.calendarSheetSummaryLabel}>
                          WHEN
                        </Text>
                        <Text style={styles.calendarSheetSummaryValue}>
                          {formatCalendarTime(selectedEntry.startsAt, timezone)}{" "}
                          – {formatCalendarTime(selectedEntry.endsAt, timezone)}
                        </Text>
                      </View>
                      <View style={styles.calendarSheetSummaryItem}>
                        <Text style={styles.calendarSheetSummaryLabel}>
                          WHERE
                        </Text>
                        <Text style={styles.calendarSheetSummaryValue}>
                          {selectedEntry.courtName ??
                            selectedEntry.venueName ??
                            "Not assigned"}
                        </Text>
                      </View>
                      <View style={styles.calendarSheetSummaryItem}>
                        <Text style={styles.calendarSheetSummaryLabel}>
                          COACH
                        </Text>
                        <Text style={styles.calendarSheetSummaryValue}>
                          {selectedEntry.coachName ?? "Not assigned"}
                        </Text>
                      </View>
                      {selectedWeather && (
                        <View style={styles.calendarSheetSummaryItem}>
                          <Text style={styles.calendarSheetSummaryLabel}>
                            FORECAST
                          </Text>
                          <Text style={styles.calendarSheetSummaryValue}>
                            {weatherSymbol(selectedWeather.icon)}{" "}
                            {fahrenheit(selectedWeather.temperatureC)}
                          </Text>
                        </View>
                      )}
                    </View>

                    {selectedEntry.sourceType === "session" ? (
                      <>
                        <SessionArrivalBoard
                          expectedPlayers={selectedEntry.participantCount}
                          sessionId={selectedEntry.id}
                          startsAt={selectedEntry.startsAt}
                          title={selectedEntry.title}
                          venueName={selectedEntry.venueName}
                        />
                        <View style={styles.calendarSheetSectionHeader}>
                          <View>
                            <Text style={styles.calendarSheetEyebrow}>
                              ROSTER
                            </Text>
                            <Text style={styles.calendarSheetSectionTitle}>
                              {selectedEntry.attendees.length} people coming
                            </Text>
                          </View>
                          <Pill tone="positive">
                            {`${Math.max(
                              0,
                              selectedEntry.capacity -
                                selectedEntry.participantCount,
                            )} spots`}
                          </Pill>
                        </View>
                        <View style={styles.calendarRoster}>
                          {selectedEntry.attendees.length === 0 ? (
                            <Text style={styles.calendarRosterEmpty}>
                              No confirmed players yet.
                            </Text>
                          ) : (
                            selectedEntry.attendees
                              .filter(
                                (
                                  attendee,
                                ): attendee is typeof attendee & {
                                  readonly registrationId: string;
                                } => Boolean(attendee.registrationId),
                              )
                              .map((attendee) => (
                                <View
                                  key={attendee.registrationId}
                                  style={styles.calendarRosterRow}
                                >
                                  <View style={styles.calendarRosterAvatar}>
                                    <Text
                                      style={styles.calendarRosterAvatarText}
                                    >
                                      {personInitials(attendee.displayName)}
                                    </Text>
                                  </View>
                                  <View style={styles.flex}>
                                    <Text style={styles.calendarRosterName}>
                                      {attendee.displayName}
                                    </Text>
                                    <Text style={styles.calendarRosterMeta}>
                                      {attendee.status}
                                      {attendee.isMinor
                                        ? " · guardian receives updates"
                                        : ""}
                                    </Text>
                                  </View>
                                  <View style={styles.calendarRosterActions}>
                                    {attendee.status === "checked-in" ? (
                                      <Pill tone="positive">Here</Pill>
                                    ) : ![
                                        "cancelled",
                                        "refunded",
                                        "waitlisted",
                                      ].includes(attendee.status) ? (
                                      <Pressable
                                        disabled={
                                          busyAction ===
                                          `check-in:${attendee.registrationId}`
                                        }
                                        onPress={() =>
                                          void perform(
                                            `check-in:${attendee.registrationId}`,
                                            () =>
                                              client!.operator.recordSessionAttendance.mutate(
                                                {
                                                  registrationId:
                                                    attendee.registrationId,
                                                  status: "attended",
                                                  note: "Checked in by a coach in Duna Pro.",
                                                  idempotencyKey:
                                                    Crypto.randomUUID(),
                                                },
                                              ),
                                          )
                                        }
                                        style={styles.calendarCheckInButton}
                                      >
                                        <Text
                                          style={
                                            styles.calendarCheckInButtonText
                                          }
                                        >
                                          Check in
                                        </Text>
                                      </Pressable>
                                    ) : null}
                                    <Pressable
                                      disabled={
                                        busyAction === attendee.registrationId
                                      }
                                      onPress={() =>
                                        void perform(
                                          attendee.registrationId,
                                          () =>
                                            client!.operator.removeCalendarParticipant.mutate(
                                              {
                                                registrationId:
                                                  attendee.registrationId,
                                                reason:
                                                  "Removed from the session by an organization operator in Duna Pro.",
                                                idempotencyKey:
                                                  Crypto.randomUUID(),
                                              },
                                            ),
                                        )
                                      }
                                      style={styles.calendarRemoveButton}
                                    >
                                      <Text
                                        style={styles.calendarRemoveButtonText}
                                      >
                                        Remove
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>
                              ))
                          )}
                        </View>
                        {participantCandidates.length > 0 && (
                          <>
                            <Text style={styles.calendarFieldLabel}>
                              ADD A CONNECTED PLAYER
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                            >
                              <View style={styles.calendarPeopleOptions}>
                                {participantCandidates
                                  .slice(0, 12)
                                  .map((person) => (
                                    <Pressable
                                      disabled={busyAction === person.personId}
                                      key={person.personId}
                                      onPress={() =>
                                        void perform(person.personId, () =>
                                          client!.operator.addCalendarParticipant.mutate(
                                            {
                                              sessionId: selectedEntry.id,
                                              personId: person.personId,
                                              reason:
                                                "Added to the session by an organization operator in Duna Pro.",
                                              idempotencyKey:
                                                Crypto.randomUUID(),
                                            },
                                          ),
                                        )
                                      }
                                      style={styles.calendarPersonOption}
                                    >
                                      <View
                                        style={
                                          styles.calendarPersonOptionAvatar
                                        }
                                      >
                                        <Text
                                          style={
                                            styles.calendarPersonOptionAvatarText
                                          }
                                        >
                                          {personInitials(person.displayName)}
                                        </Text>
                                      </View>
                                      <Text
                                        numberOfLines={1}
                                        style={styles.calendarPersonOptionName}
                                      >
                                        {person.displayName}
                                      </Text>
                                      <Text
                                        style={styles.calendarPersonOptionAdd}
                                      >
                                        ＋ Add
                                      </Text>
                                    </Pressable>
                                  ))}
                              </View>
                            </ScrollView>
                          </>
                        )}

                        <View style={styles.calendarSheetSectionHeader}>
                          <View>
                            <Text style={styles.calendarSheetEyebrow}>
                              EQUIPMENT
                            </Text>
                            <Text style={styles.calendarSheetSectionTitle}>
                              Reserved for this session
                            </Text>
                          </View>
                        </View>
                        <View style={styles.calendarRoster}>
                          {selectedEntry.equipment.length === 0 ? (
                            <Text style={styles.calendarRosterEmpty}>
                              No equipment reserved.
                            </Text>
                          ) : (
                            selectedEntry.equipment.map((item) => (
                              <View
                                key={item.reservationId}
                                style={styles.calendarRosterRow}
                              >
                                <View style={styles.calendarEquipmentIcon}>
                                  <Text
                                    style={styles.calendarEquipmentIconText}
                                  >
                                    ◇
                                  </Text>
                                </View>
                                <View style={styles.flex}>
                                  <Text style={styles.calendarRosterName}>
                                    {item.label}
                                  </Text>
                                  <Text style={styles.calendarRosterMeta}>
                                    {item.quantity} reserved
                                  </Text>
                                </View>
                                <Pressable
                                  disabled={busyAction === item.reservationId}
                                  onPress={() =>
                                    void perform(item.reservationId, () =>
                                      client!.operator.removeCalendarEquipment.mutate(
                                        {
                                          reservationId: item.reservationId,
                                          reason:
                                            "Equipment reservation removed in Duna Pro.",
                                          idempotencyKey: Crypto.randomUUID(),
                                        },
                                      ),
                                    )
                                  }
                                  style={styles.calendarRemoveButton}
                                >
                                  <Text style={styles.calendarRemoveButtonText}>
                                    Remove
                                  </Text>
                                </Pressable>
                              </View>
                            ))
                          )}
                        </View>
                        {equipmentCandidates.length > 0 && (
                          <>
                            <Text style={styles.calendarFieldLabel}>
                              AVAILABLE EQUIPMENT
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                            >
                              <View style={styles.calendarOptionRow}>
                                {equipmentCandidates
                                  .slice(0, 12)
                                  .map((item) => (
                                    <Pressable
                                      disabled={busyAction === item.id}
                                      key={item.id}
                                      onPress={() =>
                                        void perform(item.id, () =>
                                          client!.operator.addCalendarEquipment.mutate(
                                            {
                                              sessionId: selectedEntry.id,
                                              inventoryStockItemId: item.id,
                                              quantity: 1,
                                              reason:
                                                "Reserved for the session in Duna Pro.",
                                              idempotencyKey:
                                                Crypto.randomUUID(),
                                            },
                                          ),
                                        )
                                      }
                                      style={styles.calendarEquipmentOption}
                                    >
                                      <Text
                                        style={
                                          styles.calendarEquipmentOptionTitle
                                        }
                                      >
                                        {item.itemTitle}
                                      </Text>
                                      <Text
                                        style={
                                          styles.calendarEquipmentOptionMeta
                                        }
                                      >
                                        {item.quantityOnHand -
                                          item.quantityReserved}{" "}
                                        available
                                      </Text>
                                      <Text
                                        style={
                                          styles.calendarEquipmentOptionAction
                                        }
                                      >
                                        ＋ Reserve one
                                      </Text>
                                    </Pressable>
                                  ))}
                              </View>
                            </ScrollView>
                          </>
                        )}

                        <View style={styles.calendarConnectedUpdate}>
                          <Text style={styles.calendarConnectedUpdateIcon}>
                            ◈
                          </Text>
                          <View style={styles.flex}>
                            <Text style={styles.calendarConnectedUpdateTitle}>
                              Updates are automatic
                            </Text>
                            <Text style={styles.calendarConnectedUpdateBody}>
                              Players and verified guardians receive connected
                              changes through their allowed notification
                              channels.
                            </Text>
                          </View>
                        </View>

                        <View style={styles.calendarDangerZone}>
                          <Text style={styles.calendarSheetEyebrow}>
                            CANCEL SESSION
                          </Text>
                          <Text style={styles.calendarDangerTitle}>
                            Release resources and notify everyone
                          </Text>
                          <TextInput
                            multiline
                            onChangeText={setCancelReason}
                            placeholder="Weather, coach unavailable, venue closure…"
                            placeholderTextColor={colors.muted}
                            style={styles.calendarTextArea}
                            value={cancelReason}
                          />
                          <Pressable
                            disabled={
                              busyAction === "cancel" ||
                              cancelReason.trim().length < 3
                            }
                            onPress={() => {
                              void perform("cancel", () =>
                                client!.operator.cancelCalendarSession.mutate({
                                  sessionId: selectedEntry.id,
                                  reason: cancelReason.trim(),
                                  confirmed: true,
                                  idempotencyKey: Crypto.randomUUID(),
                                }),
                              ).then((saved) => {
                                if (saved) closeSheet();
                              });
                            }}
                            style={[
                              styles.calendarDangerButton,
                              cancelReason.trim().length < 3 &&
                                styles.buttonDisabled,
                            ]}
                          >
                            <Text style={styles.calendarDangerButtonText}>
                              {busyAction === "cancel"
                                ? "Cancelling…"
                                : "Cancel and notify"}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <View style={styles.calendarConnectedUpdate}>
                        <Text style={styles.calendarConnectedUpdateIcon}>
                          ▧
                        </Text>
                        <View style={styles.flex}>
                          <Text style={styles.calendarConnectedUpdateTitle}>
                            {entryLabel(selectedEntry)}
                          </Text>
                          <Text style={styles.calendarConnectedUpdateBody}>
                            This protected time remains visible beside sessions
                            so the organization avoids conflicts.
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                )
              )}
            </ScrollView>

            {sheetMode === "session" && selectedEntry && (
              <View style={styles.calendarSheetFooter}>
                {selectedEntry.sourceType === "session" &&
                  ["tournament", "league", "pickup"].includes(
                    selectedEntry.kind ?? "",
                  ) && (
                    <Pressable
                      onPress={() => {
                        closeSheet();
                        onScore();
                      }}
                      style={styles.calendarSheetSecondary}
                    >
                      <Text style={styles.calendarSheetSecondaryText}>
                        Live score
                      </Text>
                    </Pressable>
                  )}
                {selectedEntry.attendees.length > 0 && (
                  <Pressable
                    onPress={() => {
                      closeSheet();
                      onMessageGroup(selectedEntry);
                    }}
                    style={styles.calendarSheetSecondary}
                  >
                    <Text style={styles.calendarSheetSecondaryText}>
                      Message roster
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    closeSheet();
                    onRecordNotes(selectedEntry.id);
                  }}
                  style={styles.calendarSheetPrimary}
                >
                  <Text style={styles.calendarSheetPrimaryText}>
                    Record notes
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PeopleScreen({
  onMessage,
  onRecordNotes,
}: {
  readonly onMessage: (personId: string) => void;
  readonly onRecordNotes: (sessionId: string, personId: string) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteMinor, setInviteMinor] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string>();
  const { client, members, mode, refresh, workspace } = useProRuntime();
  const people = members ?? demoPeople;
  const filteredPeople = people.filter((person) => {
    const query = search.trim().toLowerCase();
    if (
      query &&
      ![person.displayName, person.handle, ...person.roles]
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    const relationship = workspace?.people.find(
      (candidate) => candidate.personId === person.id,
    );
    if (filter === "Players") return person.roles.includes("player");
    if (filter === "Upcoming") return (relationship?.upcomingCount ?? 0) > 0;
    if (filter === "Credits") return (relationship?.creditBalance ?? 0) > 0;
    if (filter === "Attention")
      return Boolean(relationship && relationship.churnRisk.level !== "low");
    if (filter === "Minors") return Boolean(person.isMinor);
    return true;
  });
  const guardianCount = people.filter((person) =>
    person.roles.includes("guardian"),
  ).length;
  const minorCount = people.filter((person) => person.isMinor).length;
  const selectedPerson = people.find(
    (person) => person.id === selectedPersonId,
  );
  const selectedRelationship = workspace?.people.find(
    (person) => person.personId === selectedPersonId,
  );
  const selectedNoteSession = workspace?.calendar.entries
    .filter(
      (entry) =>
        entry.sourceType === "session" &&
        entry.attendees.some(
          (attendee) => attendee.personId === selectedPersonId,
        ),
    )
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - Date.now()) -
        Math.abs(Date.parse(right.startsAt) - Date.now()),
    )[0];

  const sendInvitation = async () => {
    if (!client || mode !== "live") {
      setInviteFeedback("Invitations are disabled in preview.");
      return;
    }
    setInviteBusy(true);
    setInviteFeedback(undefined);
    try {
      const normalizedPhone = invitePhone.trim()
        ? `+${invitePhone.replace(/\D/g, "")}`
        : undefined;
      const result = await client.operator.createPlayerInvitation.mutate({
        invitedName: inviteName.trim(),
        ...(inviteEmail.trim() ? { invitedEmail: inviteEmail.trim() } : {}),
        ...(normalizedPhone ? { invitedPhoneE164: normalizedPhone } : {}),
        relationship: "player",
        isMinor: inviteMinor,
        ...(inviteMinor && guardianName.trim()
          ? { guardianName: guardianName.trim() }
          : {}),
        ...(inviteMinor && guardianEmail.trim()
          ? { guardianEmail: guardianEmail.trim() }
          : {}),
        confirmed: true,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      setInviteFeedback(
        result.status === "sent"
          ? "Invitation sent."
          : "Invitation created and queued for delivery.",
      );
      setInviteName("");
      setInviteEmail("");
      setInvitePhone("");
      setGuardianName("");
      setGuardianEmail("");
      successHaptic();
    } catch (reason) {
      setInviteFeedback(displayError(reason));
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <PageTitle
          action="Add person"
          eyebrow="CRM + ELIGIBILITY"
          onAction={() => setInviteOpen(true)}
          title="People."
        />
        <View style={styles.searchField}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            onChangeText={setSearch}
            placeholder={`Search ${people.length} people…`}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={search}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBleed}
        >
          <View style={styles.filterRow}>
            {[
              "All",
              "Players",
              "Upcoming",
              "Credits",
              "Attention",
              "Minors",
            ].map((item) => (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[
                  styles.filterChip,
                  filter === item && styles.filterActive,
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
        <View style={styles.peopleSummary}>
          <View>
            <Text style={styles.metricValue}>{people.length}</Text>
            <Text style={styles.metaText}>active people</Text>
          </View>
          <View>
            <Text style={styles.metricValue}>{guardianCount}</Text>
            <Text style={styles.metaText}>guardians</Text>
          </View>
          <View>
            <Text style={styles.metricValue}>{minorCount}</Text>
            <Text style={styles.metaText}>minor profiles</Text>
          </View>
        </View>
        <View style={styles.peopleList}>
          {filteredPeople.map((person) => {
            const relationship = workspace?.people.find(
              (candidate) => candidate.personId === person.id,
            );
            return (
              <Pressable
                key={person.id}
                onPress={() => setSelectedPersonId(person.id)}
                style={styles.personRow}
              >
                <View style={styles.personAvatar}>
                  <Text style={styles.personAvatarText}>{person.initials}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{person.displayName}</Text>
                  <Text style={styles.metaText}>
                    @{person.handle} · {person.roles.join(" + ")}
                  </Text>
                  {relationship && (
                    <Text style={styles.personRelationshipMeta}>
                      {relationship.membershipName ?? "No active plan"} ·{" "}
                      {relationship.creditBalance} credits ·{" "}
                      {relationship.upcomingCount} upcoming
                    </Text>
                  )}
                </View>
                <Pill
                  tone={
                    relationship?.churnRisk.level === "high"
                      ? "warning"
                      : person.isMinor
                        ? "warning"
                        : "positive"
                  }
                >
                  {person.isMinor
                    ? "Minor"
                    : relationship?.churnRisk.level === "high"
                      ? "Follow up"
                      : person.roles.includes("guardian")
                        ? "Guardian"
                        : "Active"}
                </Pill>
                <View style={styles.personRating}>
                  <Text style={styles.ratingNumber}>
                    {person.rating.display.toFixed(2)}
                  </Text>
                  <Text style={styles.metaText}>
                    {person.rating.confidence}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedPersonId(undefined)}
        presentationStyle="pageSheet"
        visible={Boolean(selectedPerson)}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.peopleModalSafe}>
          <View style={styles.peopleModalHeader}>
            <View>
              <Text style={styles.eyebrow}>CONNECTED PERSON</Text>
              <Text style={styles.peopleModalTitle}>
                {selectedPerson?.displayName ?? "Player"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close person profile"
              onPress={() => setSelectedPersonId(undefined)}
              style={styles.peopleModalClose}
            >
              <Text style={styles.peopleModalCloseText}>×</Text>
            </Pressable>
          </View>
          {selectedPerson && (
            <ScrollView contentContainerStyle={styles.peopleModalContent}>
              <View style={styles.peopleProfileHero}>
                <View style={styles.peopleProfileAvatar}>
                  <Text style={styles.peopleProfileAvatarText}>
                    {selectedPerson.initials}
                  </Text>
                </View>
                <Text style={styles.peopleProfileName}>
                  {selectedPerson.displayName}
                </Text>
                <Text style={styles.peopleProfileMeta}>
                  @{selectedPerson.handle} · {selectedPerson.homeMarket}
                </Text>
                <View style={styles.peopleProfilePills}>
                  {selectedPerson.roles.map((role) => (
                    <Pill key={role} tone="neutral">
                      {role}
                    </Pill>
                  ))}
                  {selectedPerson.isMinor && <Pill tone="warning">Minor</Pill>}
                </View>
              </View>
              <View style={styles.peopleProfileMetrics}>
                <View>
                  <Text style={styles.metricValue}>
                    {selectedPerson.rating.display.toFixed(2)}
                  </Text>
                  <Text style={styles.metaText}>rating</Text>
                </View>
                <View>
                  <Text style={styles.metricValue}>
                    {selectedRelationship?.creditBalance ?? 0}
                  </Text>
                  <Text style={styles.metaText}>credits</Text>
                </View>
                <View>
                  <Text style={styles.metricValue}>
                    {selectedRelationship?.upcomingCount ?? 0}
                  </Text>
                  <Text style={styles.metaText}>upcoming</Text>
                </View>
              </View>
              {selectedRelationship && (
                <View style={styles.peopleProfileCard}>
                  <Text style={styles.eyebrow}>RELATIONSHIP</Text>
                  <Text style={styles.peopleProfileCardTitle}>
                    {selectedRelationship.membershipName ?? "No active plan"}
                  </Text>
                  <Text style={styles.peopleProfileCardBody}>
                    {selectedRelationship.purchaseCount} purchases ·{" "}
                    {selectedRelationship.churnRisk.level} care signal
                  </Text>
                  {selectedRelationship.churnRisk.reasons.map((reason) => (
                    <Text key={reason} style={styles.peopleProfileReason}>
                      • {reason}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.peopleProfileActions}>
                <Pressable
                  onPress={() => {
                    setSelectedPersonId(undefined);
                    onMessage(selectedPerson.id);
                  }}
                  style={styles.peopleProfilePrimary}
                >
                  <Text style={styles.peopleProfilePrimaryText}>
                    Duna message
                  </Text>
                </Pressable>
                <Pressable
                  disabled={!selectedNoteSession}
                  onPress={() => {
                    if (!selectedNoteSession) return;
                    setSelectedPersonId(undefined);
                    onRecordNotes(selectedNoteSession.id, selectedPerson.id);
                  }}
                  style={[
                    styles.peopleProfileSecondary,
                    !selectedNoteSession && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.peopleProfileSecondaryText}>
                    Add note
                  </Text>
                </Pressable>
              </View>
              {selectedRelationship?.email && (
                <Pressable
                  onPress={() =>
                    void Linking.openURL(`mailto:${selectedRelationship.email}`)
                  }
                  style={styles.peopleProfileEmail}
                >
                  <Text style={styles.peopleProfileEmailText}>
                    Email {selectedRelationship.email}
                  </Text>
                </Pressable>
              )}
              {!selectedNoteSession && (
                <Text style={styles.peopleProfileActionHint}>
                  Player notes become available from a shared session.
                </Text>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setInviteOpen(false)}
        presentationStyle="pageSheet"
        visible={inviteOpen}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.peopleModalSafe}>
          <View style={styles.peopleModalHeader}>
            <View>
              <Text style={styles.eyebrow}>NATIVE INVITATION</Text>
              <Text style={styles.peopleModalTitle}>Add a player.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close invitation"
              onPress={() => setInviteOpen(false)}
              style={styles.peopleModalClose}
            >
              <Text style={styles.peopleModalCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.peopleInviteContent}>
            <Text style={styles.peopleInviteLead}>
              Duna creates a connected identity invitation. Nothing is sent
              until you confirm below.
            </Text>
            <Text style={styles.calendarFieldLabel}>PLAYER NAME</Text>
            <TextInput
              onChangeText={setInviteName}
              placeholder="Full name"
              placeholderTextColor={colors.muted}
              style={styles.peopleInviteInput}
              value={inviteName}
            />
            <Text style={styles.calendarFieldLabel}>EMAIL</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setInviteEmail}
              placeholder="player@example.com"
              placeholderTextColor={colors.muted}
              style={styles.peopleInviteInput}
              value={inviteEmail}
            />
            <Text style={styles.calendarFieldLabel}>PHONE · OPTIONAL</Text>
            <TextInput
              keyboardType="phone-pad"
              onChangeText={setInvitePhone}
              placeholder="+1 310 555 0100"
              placeholderTextColor={colors.muted}
              style={styles.peopleInviteInput}
              value={invitePhone}
            />
            <Pressable
              onPress={() => setInviteMinor((value) => !value)}
              style={styles.peopleInviteToggle}
            >
              <View
                style={[
                  styles.peopleInviteToggleMark,
                  inviteMinor && styles.peopleInviteToggleMarkActive,
                ]}
              >
                <Text style={styles.peopleInviteToggleMarkText}>
                  {inviteMinor ? "✓" : ""}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>This player is a minor</Text>
                <Text style={styles.metaText}>
                  The invitation goes to a verified guardian.
                </Text>
              </View>
            </Pressable>
            {inviteMinor && (
              <>
                <Text style={styles.calendarFieldLabel}>GUARDIAN NAME</Text>
                <TextInput
                  onChangeText={setGuardianName}
                  placeholder="Guardian name"
                  placeholderTextColor={colors.muted}
                  style={styles.peopleInviteInput}
                  value={guardianName}
                />
                <Text style={styles.calendarFieldLabel}>GUARDIAN EMAIL</Text>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setGuardianEmail}
                  placeholder="guardian@example.com"
                  placeholderTextColor={colors.muted}
                  style={styles.peopleInviteInput}
                  value={guardianEmail}
                />
              </>
            )}
            {inviteFeedback && (
              <Text style={styles.peopleInviteFeedback}>{inviteFeedback}</Text>
            )}
            <Pressable
              disabled={
                inviteBusy ||
                inviteName.trim().length < 2 ||
                (inviteMinor
                  ? guardianEmail.trim().length < 3
                  : inviteEmail.trim().length < 3 &&
                    invitePhone.trim().length < 8)
              }
              onPress={() => void sendInvitation()}
              style={[
                styles.peopleInviteSubmit,
                (inviteBusy || inviteName.trim().length < 2) &&
                  styles.buttonDisabled,
              ]}
            >
              <Text style={styles.peopleInviteSubmitText}>
                {inviteBusy ? "Creating invitation…" : "Confirm invitation"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const initialEvents: readonly ScoreEvent[] = [
  {
    id: "start",
    type: "match-started",
    initialServer: "A",
    occurredAt: "2026-07-30T20:00:00.000Z",
  },
];

interface PendingScoreEvent {
  readonly sequence: number;
  readonly monotonicCounter: number;
  readonly event: ScoreEvent;
}

type OperatorMatch = OperatorMatches[number];

function MatchPicker({
  matches,
  deviceId,
  busy,
  error,
  onExit,
  onOpen,
}: {
  readonly matches: OperatorMatches;
  readonly deviceId?: string;
  readonly busy: boolean;
  readonly error?: string;
  readonly onExit: () => void;
  readonly onOpen: (match: OperatorMatch) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityLabel="Exit live scoring"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onExit}
        style={[styles.scorerExitButton, styles.matchPickerExit]}
      >
        <Text style={styles.scorerExitIcon}>‹</Text>
        <View>
          <Text style={styles.scorerExitText}>Exit scoring</Text>
          <Text style={styles.scorerExitMeta}>Back to schedule</Text>
        </View>
      </Pressable>
      <Header />
      <PageTitle eyebrow="SELECT A MATCH" title="Score." />
      <Text style={styles.subhead}>
        Scheduled matches can be claimed by one device. Live matches remain
        locked to the device that started them.
      </Text>
      {error && <Text style={styles.formError}>{error}</Text>}
      <View style={styles.matchPickerList}>
        {matches.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.sectionHeading}>No scorable matches.</Text>
            <Text style={styles.metaText}>
              Create the event and teams from the native schedule, then return
              here to begin live scoring.
            </Text>
            <Pressable onPress={onExit}>
              <Text style={styles.linkText}>Back to schedule →</Text>
            </Pressable>
          </View>
        )}
        {matches.map((match) => {
          const controlledElsewhere =
            match.status === "live" &&
            Boolean(match.authoritativeDeviceId) &&
            match.authoritativeDeviceId !== deviceId;
          return (
            <View key={match.id} style={styles.matchPickerCard}>
              <View style={styles.cardTop}>
                <Pill tone={match.status === "live" ? "live" : "neutral"}>
                  {match.status}
                </Pill>
                <Text style={styles.metaText}>
                  {match.scheduledAt
                    ? new Date(match.scheduledAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Time not assigned"}
                </Text>
              </View>
              <Text style={styles.matchPickerTeams}>
                {match.teamA.name} vs {match.teamB.name}
              </Text>
              <Text style={styles.metaText}>
                {match.venueName}
                {match.courtName ? ` · ${match.courtName}` : ""}
              </Text>
              <Pressable
                disabled={busy || controlledElsewhere || !deviceId}
                onPress={() => onOpen(match)}
                style={[
                  styles.primaryAction,
                  (busy || controlledElsewhere || !deviceId) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.primaryActionText}>
                  {controlledElsewhere
                    ? "Controlled on another device"
                    : match.status === "live"
                      ? "Resume scoring"
                      : "Begin scoring"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function ScorerScreen({
  initialMatchId,
  onExit,
}: {
  readonly initialMatchId?: string;
  readonly onExit: () => void;
}) {
  const { client, matches = [], mode } = useProRuntime();
  const { width: scorerWidth } = useWindowDimensions();
  const expandedScorer = scorerWidth >= 700;
  const [previewSystem, setPreviewSystem] = useState<ScoringSystem>("rally");
  const [events, setEvents] = useState<readonly ScoreEvent[]>(initialEvents);
  const [pending, setPending] = useState<readonly PendingScoreEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const [deviceId, setDeviceId] = useState<string>();
  const [selectedMatchId, setSelectedMatchId] = useState<string>();
  const [serverState, setServerState] = useState<OperatorMatchScoringState>();
  const [nextSequence, setNextSequence] = useState(2);
  const [nextCounter, setNextCounter] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const openedInitialMatch = useRef(false);
  const system = serverState?.format.scoringSystem ?? previewSystem;
  const state = useMemo(
    () =>
      foldScore(
        events,
        serverState?.format ?? {
          ...standardBeachFormat,
          scoringSystem: system,
        },
      ),
    [events, serverState?.format, system],
  );
  const current = state.sets[state.setIndex] ?? { a: 0, b: 0 };
  const scoreComplete =
    state.status === "complete" || state.status === "forfeit";
  const selectedMatch = matches.find((match) => match.id === selectedMatchId);
  const teamA = serverState?.teamA;
  const teamB = serverState?.teamB;

  useEffect(() => {
    if (scoreComplete) successHaptic();
  }, [scoreComplete]);

  useEffect(() => {
    if (mode === "preview") {
      setDeviceId("duna-pro-preview");
      return;
    }
    loadDeviceId()
      .then(setDeviceId)
      .catch((reason) => {
        setError(displayError(reason));
      });
  }, [mode]);

  useEffect(() => {
    const key =
      mode === "preview"
        ? "duna-pro-score-preview"
        : selectedMatchId
          ? `duna-pro-score-${selectedMatchId}`
          : undefined;
    if (!key) return;
    void AsyncStorage.setItem(
      key,
      JSON.stringify({ events, pending, nextSequence, nextCounter }),
    );
  }, [events, mode, nextCounter, nextSequence, pending, selectedMatchId]);

  function applyServerState(next: OperatorMatchScoringState) {
    setServerState(next);
    setEvents(next.events);
    setPending([]);
    setNextSequence(next.nextSequence);
    setNextCounter(next.nextMonotonicCounter);
  }

  async function hydrateOfflineQueue(next: OperatorMatchScoringState) {
    const saved = await AsyncStorage.getItem(`duna-pro-score-${next.matchId}`);
    if (!saved) {
      applyServerState(next);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as {
        readonly pending?: readonly PendingScoreEvent[];
      };
      const savedPending = parsed.pending ?? [];
      if (
        savedPending.length > 0 &&
        savedPending[0]?.sequence === next.nextSequence
      ) {
        setServerState(next);
        setPending(savedPending);
        setEvents([
          ...next.events,
          ...savedPending.map((envelope) => envelope.event),
        ]);
        setNextSequence(
          (savedPending.at(-1)?.sequence ?? next.nextSequence - 1) + 1,
        );
        setNextCounter(
          (savedPending.at(-1)?.monotonicCounter ??
            next.nextMonotonicCounter - 1) + 1,
        );
        setOffline(true);
        return;
      }
      if (savedPending.length > 0) {
        setError(
          "Saved offline score events no longer match the server sequence. They were preserved on this device for review.",
        );
      }
    } catch {
      setError("A saved offline score queue could not be read.");
    }
    applyServerState(next);
  }

  async function openMatch(match: OperatorMatch) {
    if (!client || !deviceId) return;
    setBusy(true);
    setError(undefined);
    try {
      const next =
        match.status === "scheduled"
          ? await client.operator.startMatchScoring.mutate({
              matchId: match.id,
              deviceId,
              initialServer: "A",
              confirmed: true,
              idempotencyKey: Crypto.randomUUID(),
            })
          : await client.operator.matchScoringState.query({
              matchId: match.id,
            });
      if (next.deviceId !== deviceId) {
        throw new Error(
          "This live match is controlled by another scoring device.",
        );
      }
      await hydrateOfflineQueue(next);
      setSelectedMatchId(match.id);
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (
      mode !== "live" ||
      !initialMatchId ||
      !deviceId ||
      openedInitialMatch.current
    ) {
      return;
    }
    const initialMatch = matches.find((match) => match.id === initialMatchId);
    if (!initialMatch) return;
    openedInitialMatch.current = true;
    void openMatch(initialMatch);
  }, [deviceId, initialMatchId, matches, mode]);

  async function submitEvent(event: ScoreEvent) {
    if (scoreComplete || busy) return;
    const envelope: PendingScoreEvent = {
      sequence: nextSequence,
      monotonicCounter: nextCounter,
      event,
    };
    setEvents((currentEvents) => [...currentEvents, event]);
    setNextSequence((value) => value + 1);
    setNextCounter((value) => value + 1);
    if (mode === "preview" || offline || !client || !serverState || !deviceId) {
      setPending((currentPending) => [...currentPending, envelope]);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.operator.appendMatchEvents.mutate({
        matchId: serverState.matchId,
        deviceId,
        events: [envelope],
        idempotencyKey: Crypto.randomUUID(),
      });
      applyServerState(result.scoring);
    } catch (reason) {
      setPending((currentPending) => [...currentPending, envelope]);
      setOffline(true);
      setError(
        `${displayError(reason)} The point remains encrypted on this device.`,
      );
    } finally {
      setBusy(false);
    }
  }

  function point(winner: "A" | "B") {
    impactHaptic();
    void submitEvent({
      id: Crypto.randomUUID(),
      type: "rally-won",
      winner,
      occurredAt: new Date().toISOString(),
    });
  }

  function undo() {
    selectionHaptic();
    const event = createUndoEvent(events, {
      id: Crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    });
    if (event) void submitEvent(event);
  }

  function reset() {
    if (mode !== "preview") return;
    setEvents([{ ...initialEvents[0]!, occurredAt: new Date().toISOString() }]);
    setPending([]);
    setNextSequence(2);
    setNextCounter(2);
  }

  async function synchronize() {
    if (
      mode === "preview" ||
      !client ||
      !serverState ||
      !deviceId ||
      pending.length === 0
    ) {
      setOffline((value) => !value);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.operator.appendMatchEvents.mutate({
        matchId: serverState.matchId,
        deviceId,
        events: [...pending],
        idempotencyKey: Crypto.randomUUID(),
      });
      applyServerState(result.scoring);
      setOffline(false);
    } catch (reason) {
      setOffline(true);
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "live" && !serverState) {
    return (
      <MatchPicker
        busy={busy}
        deviceId={deviceId}
        error={error}
        matches={matches}
        onExit={onExit}
        onOpen={(match) => void openMatch(match)}
      />
    );
  }

  return (
    <View style={styles.scorer}>
      <View style={styles.scorerTop}>
        <Pressable
          accessibilityLabel="Exit live scoring"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onExit}
          style={[
            styles.scorerExitButton,
            expandedScorer && styles.scorerExitButtonExpanded,
          ]}
        >
          <Text
            style={[
              styles.scorerExitIcon,
              expandedScorer && styles.scorerExitIconExpanded,
            ]}
          >
            ‹
          </Text>
          <View>
            <Text
              style={[
                styles.scorerExitText,
                expandedScorer && styles.scorerExitTextExpanded,
              ]}
            >
              Exit scoring
            </Text>
            <Text
              style={[
                styles.scorerExitMeta,
                expandedScorer && styles.scorerExitMetaExpanded,
              ]}
            >
              Progress is saved
            </Text>
          </View>
        </Pressable>
        <View style={styles.scorerIdentity}>
          <Text
            numberOfLines={1}
            style={[
              styles.scorerMatch,
              expandedScorer && styles.scorerMatchExpanded,
            ]}
          >
            {selectedMatch
              ? `${selectedMatch.teamA.name} · ${selectedMatch.teamB.name}`
              : "PREVIEW MATCH · EXHIBITION"}
          </Text>
          <Text
            style={[
              styles.scorerVenue,
              expandedScorer && styles.scorerVenueExpanded,
            ]}
          >
            {serverState?.venueName ?? "Manhattan Beach · Court 4"}
          </Text>
        </View>
        <View style={styles.scorerStatusGroup}>
          <Pill tone={scoreComplete ? "positive" : "live"}>
            {scoreComplete
              ? "Complete"
              : mode === "preview"
                ? "Preview"
                : "Live"}
          </Pill>
          <Pressable
            disabled={busy}
            onPress={() => void synchronize()}
            style={styles.syncButton}
          >
            <Text
              style={[styles.syncIcon, offline && { color: colors.warning }]}
            >
              {offline ? "◌" : "●"}
            </Text>
            <Text style={styles.syncText}>
              {offline
                ? `${pending.length} saved`
                : busy
                  ? "Syncing"
                  : "Synced"}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.scorerFormat}>
        {mode === "preview" && (
          <View style={styles.segmented}>
            <Pressable
              onPress={() => setPreviewSystem("rally")}
              style={[
                styles.segmentButton,
                expandedScorer && styles.segmentButtonExpanded,
                system === "rally" && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  expandedScorer && styles.segmentTextExpanded,
                  system === "rally" && styles.segmentTextActive,
                ]}
              >
                Rally
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPreviewSystem("sideout")}
              style={[
                styles.segmentButton,
                expandedScorer && styles.segmentButtonExpanded,
                system === "sideout" && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  expandedScorer && styles.segmentTextExpanded,
                  system === "sideout" && styles.segmentTextActive,
                ]}
              >
                Sideout
              </Text>
            </Pressable>
          </View>
        )}
        <Text
          style={[
            styles.scorerFormatText,
            expandedScorer && styles.scorerFormatTextExpanded,
          ]}
        >
          Set {state.setIndex + 1} · best of 3 · to{" "}
          {standardBeachFormat.pointTargets[state.setIndex] ?? 21}
        </Text>
      </View>
      {(state.sideSwitchDue || state.technicalTimeoutDue) && (
        <View style={styles.scoreNotice}>
          <Text style={styles.scoreNoticeIcon}>⇄</Text>
          <Text style={styles.scoreNoticeTitle}>
            {state.technicalTimeoutDue ? "Technical timeout" : "Switch sides"}
          </Text>
          <Text style={styles.scoreNoticeBody}>
            Confirm when both teams are ready.
          </Text>
        </View>
      )}
      <View style={styles.court}>
        <Pressable
          disabled={scoreComplete || busy}
          onPress={() => point("A")}
          style={[styles.teamButton, styles.teamA]}
        >
          <View style={styles.serveRow}>
            <View
              style={[styles.serveDot, state.serving !== "A" && { opacity: 0 }]}
            />
            <Text
              style={[
                styles.serveText,
                expandedScorer && styles.serveTextExpanded,
              ]}
            >
              {state.serving === "A" ? "SERVING" : "RECEIVING"}
            </Text>
          </View>
          <View style={styles.teamPeople}>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamA?.people[0]?.initials ?? "ML"}
              </Text>
            </View>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamA?.people[1]?.initials ?? "TP"}
              </Text>
            </View>
            <Text
              style={[
                styles.teamName,
                expandedScorer && styles.teamNameExpanded,
              ]}
            >
              {teamA?.name ?? "Mara / Theo"}
            </Text>
          </View>
          <Text
            style={[styles.bigScore, expandedScorer && styles.bigScoreExpanded]}
          >
            {current.a}
          </Text>
          <Text
            style={[styles.tapHint, expandedScorer && styles.tapHintExpanded]}
          >
            TAP ANYWHERE FOR POINT
          </Text>
        </Pressable>
        <View style={styles.versus}>
          <Text style={styles.versusText}>VS</Text>
        </View>
        <Pressable
          disabled={scoreComplete || busy}
          onPress={() => point("B")}
          style={[styles.teamButton, styles.teamB]}
        >
          <View style={styles.serveRow}>
            <View
              style={[styles.serveDot, state.serving !== "B" && { opacity: 0 }]}
            />
            <Text
              style={[
                styles.serveText,
                expandedScorer && styles.serveTextExpanded,
              ]}
            >
              {state.serving === "B" ? "SERVING" : "RECEIVING"}
            </Text>
          </View>
          <View style={styles.teamPeople}>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamB?.people[0]?.initials ?? "NW"}
              </Text>
            </View>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamB?.people[1]?.initials ?? "ET"}
              </Text>
            </View>
            <Text
              style={[
                styles.teamName,
                expandedScorer && styles.teamNameExpanded,
              ]}
            >
              {teamB?.name ?? "Noa / Elena"}
            </Text>
          </View>
          <Text
            style={[styles.bigScore, expandedScorer && styles.bigScoreExpanded]}
          >
            {current.b}
          </Text>
          <Text
            style={[styles.tapHint, expandedScorer && styles.tapHintExpanded]}
          >
            TAP ANYWHERE FOR POINT
          </Text>
        </Pressable>
      </View>
      <View style={styles.scorerBottom}>
        <Pressable
          disabled={events.length <= 1 || busy}
          onPress={undo}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionText}>↶ Undo</Text>
        </Pressable>
        <View style={styles.syncSummary}>
          <Text
            style={[
              styles.syncIcon,
              { color: offline ? colors.warning : colors.positive },
            ]}
          >
            {offline ? "◌" : "●"}
          </Text>
          <Text style={styles.syncSummaryText}>
            {mode === "preview"
              ? "Preview only"
              : offline
                ? `${pending.length} waiting`
                : "Score saved"}
          </Text>
        </View>
        <View style={styles.sets}>
          {state.sets.map((set, index) => (
            <View
              key={index}
              style={[
                styles.setBox,
                index === state.setIndex && styles.setBoxActive,
              ]}
            >
              <Text style={styles.setLabel}>S{index + 1}</Text>
              <Text style={styles.setScore}>
                {set.a}–{set.b}
              </Text>
            </View>
          ))}
        </View>
        <Pressable onLongPress={reset} style={styles.moreScore}>
          <Text style={styles.moreScoreText}>•••</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.scorerError}>{error}</Text>}
    </View>
  );
}

function MoreScreen({
  onCalendar,
  onCreate,
  onGetPaid,
  onMoney,
  onMessages,
  onPeople,
  onTournament,
  onVideo,
}: {
  readonly onCalendar: () => void;
  readonly onCreate: () => void;
  readonly onGetPaid: () => void;
  readonly onMoney: () => void;
  readonly onMessages: () => void;
  readonly onPeople: () => void;
  readonly onTournament: () => void;
  readonly onVideo: () => void;
}) {
  const { dashboard, signOut, workspace } = useProRuntime();
  const [selectedMenu, setSelectedMenu] = useState<string>();
  const organization = dashboard?.organization ?? demoOrganization;
  const organizationInitials = organization.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const sections = [
    [
      "OPERATIONS",
      [
        "Calendar",
        "Products + services",
        "Events + leagues",
        "Coach video",
        "Messages",
        "Reports",
      ],
    ],
    [
      "BUSINESS",
      [
        "Money + tax",
        "Memberships + credits",
        "Retail + inventory",
        "Coach payroll support",
      ],
    ],
    [
      "ORGANIZATION",
      [
        "Venues + courts",
        "Team + roles",
        "Policies + waivers",
        "Integrations",
        "Billing + plan",
        "Account + privacy",
        "Delete my account",
      ],
    ],
  ] as const;
  const detailRows: readonly {
    readonly title: string;
    readonly meta: string;
  }[] =
    selectedMenu === "Products + services"
      ? (workspace?.catalog.map((item) => ({
          title: item.title,
          meta: `${item.type} · ${item.status} · ${item.variants.length} option${item.variants.length === 1 ? "" : "s"}`,
        })) ?? [])
      : selectedMenu === "Events + leagues"
        ? (workspace?.sessions
            .filter((session) =>
              ["tournament", "league", "pickup"].includes(session.kind),
            )
            .map((session) => ({
              title: session.title,
              meta: `${session.kind} · ${session.status}`,
            })) ?? [])
        : selectedMenu === "Messages"
          ? [
              {
                title: `${workspace?.people.filter((person) => person.email || person.phoneE164).length ?? 0} reachable people`,
                meta: "Open People to choose a player, guardian, or staff member and use the device messenger.",
              },
            ]
          : selectedMenu === "Reports"
            ? (workspace?.productPerformance.map((item) => ({
                title:
                  workspace.catalog.find(
                    (product) => product.id === item.catalogItemId,
                  )?.title ?? "Product performance",
                meta: `${item.paidPurchases} sales · ${item.uniqueCustomers} customers · ${item.grossMarginBps === undefined ? "margin pending" : `${(item.grossMarginBps / 100).toFixed(1)}% margin`}`,
              })) ?? [])
            : selectedMenu === "Memberships + credits"
              ? (workspace?.ratePlans.map((plan) => ({
                  title: plan.name,
                  meta: `${plan.currency} ${(plan.baseAmountMinor / 100).toFixed(2)} · ${plan.rateUnitMinutes} min`,
                })) ?? [])
              : selectedMenu === "Retail + inventory"
                ? (workspace?.inventory.map((item) => ({
                    title: `${item.itemTitle} · ${item.variantTitle}`,
                    meta: `${item.quantityOnHand - item.quantityReserved} available · ${item.locationName}`,
                  })) ?? [])
                : selectedMenu === "Coach payroll support" ||
                    selectedMenu === "Team + roles"
                  ? (workspace?.staff.map((person) => ({
                      title: person.displayName,
                      meta: `${person.role} · ${person.compensationModel.replaceAll("-", " ")} · ${person.active ? "active" : "inactive"}`,
                    })) ?? [])
                  : selectedMenu === "Venues + courts"
                    ? (workspace?.venues.map((venue) => ({
                        title: venue.name,
                        meta: `${venue.courts.length} court${venue.courts.length === 1 ? "" : "s"} · ${venue.status}`,
                      })) ?? [])
                    : selectedMenu === "Money + tax"
                      ? [
                          {
                            title: `Reconciliation · ${workspace?.ledger.reconciliationStatus.replaceAll("-", " ") ?? "not started"}`,
                            meta: `${workspace?.ledger.postedJournalCount ?? 0} posted journals · ${workspace?.ledger.draftJournalCount ?? 0} drafts`,
                          },
                          {
                            title: `Stripe Tax · ${workspace?.organization.taxRegistrationStatus.replaceAll("-", " ") ?? "not configured"}`,
                            meta: workspace?.organization.stripeChargesEnabled
                              ? "Card payments are enabled."
                              : "Card payments need organization setup.",
                          },
                        ]
                      : selectedMenu
                        ? [
                            {
                              title: selectedMenu,
                              meta:
                                selectedMenu === "Delete my account"
                                  ? "Account deletion is a protected, reviewable request. Duna will never trigger it from a menu tap."
                                  : "This organization setting is available here without leaving Duna Pro. Changes that affect members require explicit confirmation.",
                            },
                          ]
                        : [];

  const detailAction = () => {
    const item = selectedMenu;
    setSelectedMenu(undefined);
    if (!item) return;
    if (
      [
        "Products + services",
        "Memberships + credits",
        "Retail + inventory",
      ].includes(item)
    ) {
      onCreate();
    } else if (item === "Events + leagues") {
      onTournament();
    } else if (item === "Coach video") {
      onVideo();
    } else if (item === "Venues + courts") {
      onCalendar();
    } else if (item === "Money + tax") {
      onMoney();
    } else if (item === "Coach payroll support") {
      onGetPaid();
    } else if (
      ["Messages", "Team + roles", "Policies + waivers"].includes(item)
    ) {
      onPeople();
    }
  };
  const detailActionLabel = selectedMenu
    ? [
        "Products + services",
        "Memberships + credits",
        "Retail + inventory",
      ].includes(selectedMenu)
      ? "Create natively"
      : selectedMenu === "Events + leagues"
        ? "Open tournament desk"
        : selectedMenu === "Coach video"
          ? "Open video"
          : selectedMenu === "Venues + courts"
            ? "Open schedule"
            : selectedMenu === "Money + tax"
              ? "Open Money"
              : selectedMenu === "Coach payroll support"
                ? "Open Get Paid"
                : ["Messages", "Team + roles", "Policies + waivers"].includes(
                      selectedMenu,
                    )
                  ? "Open People"
                  : undefined
    : undefined;
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <PageTitle eyebrow="EVERYTHING ELSE" title="More." />
        <View style={styles.moreQuickActions}>
          <Pressable onPress={onGetPaid} style={styles.moreQuickPrimary}>
            <Text style={styles.moreQuickIcon}>)))</Text>
            <Text style={styles.moreQuickPrimaryText}>Get Paid</Text>
          </Pressable>
          <Pressable onPress={onCreate} style={styles.moreQuickSecondary}>
            <Text style={styles.moreQuickIconAlt}>＋</Text>
            <Text style={styles.moreQuickSecondaryText}>Create</Text>
          </Pressable>
        </View>
        <View style={styles.organizationCard}>
          <View style={styles.orgAvatar}>
            <Text style={styles.orgAvatarText}>{organizationInitials}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.orgName}>{organization.name}</Text>
            <Text style={styles.metaText}>
              {organization.plan} plan · {organization.memberCount} people ·{" "}
              {workspace?.venues.length ?? organization.venueCount} venues
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
        {sections.map((section) => (
          <View key={section[0]}>
            <Text style={styles.menuEyebrow}>{section[0]}</Text>
            <View style={styles.menuCard}>
              {section[1].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    if (item === "Calendar") {
                      onCalendar();
                      return;
                    }
                    if (item === "Messages") {
                      onMessages();
                      return;
                    }
                    setSelectedMenu(item);
                  }}
                  style={styles.menuRow}
                >
                  <Text style={styles.menuIcon}>{item.charAt(0)}</Text>
                  <Text style={styles.rowTitle}>{item}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <View style={styles.proNote}>
          <BrandMark />
          <Text style={styles.metaText}>
            Duna Pro keeps core workflows available in the field. Drafts and
            score events persist on-device, then sync when a connection returns.
          </Text>
          <Pill tone="positive">Offline ready</Pill>
        </View>
        {signOut && (
          <Pressable
            onPress={() => void signOut()}
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>Sign out of Duna Pro</Text>
          </Pressable>
        )}
      </ScrollView>
      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedMenu(undefined)}
        presentationStyle="pageSheet"
        visible={Boolean(selectedMenu)}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.peopleModalSafe}>
          <View style={styles.peopleModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>NATIVE OPERATIONS</Text>
              <Text numberOfLines={2} style={styles.peopleModalTitle}>
                {selectedMenu}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close operations"
              onPress={() => setSelectedMenu(undefined)}
              style={styles.peopleModalClose}
            >
              <Text style={styles.peopleModalCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.moreDetailContent}>
            <Text style={styles.moreDetailLead}>
              Built for quick decisions in the field. Deeper records stay
              structured and reviewable inside the same Duna data model.
            </Text>
            <View style={styles.moreDetailList}>
              {detailRows.map((row, index) => (
                <View
                  key={`${row.title}:${index}`}
                  style={styles.moreDetailRow}
                >
                  <View style={styles.moreDetailMark}>
                    <Text style={styles.moreDetailMarkText}>
                      {row.title.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.moreDetailMeta}>{row.meta}</Text>
                  </View>
                </View>
              ))}
              {detailRows.length === 0 && (
                <View style={styles.moreDetailEmpty}>
                  <Text style={styles.rowTitle}>Nothing here yet.</Text>
                  <Text style={styles.metaText}>
                    Use the native action below to create the first record.
                  </Text>
                </View>
              )}
            </View>
            {detailActionLabel && (
              <Pressable
                onPress={detailAction}
                style={styles.peopleInviteSubmit}
              >
                <Text style={styles.peopleInviteSubmitText}>
                  {detailActionLabel}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function TabBar({
  active,
  onChange,
}: {
  readonly active: Tab;
  readonly onChange: (tab: NavDestination) => void;
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityLabel={tab.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.key }}
          key={tab.key}
          onPress={() => {
            selectionHaptic();
            onChange(tab.key);
          }}
          style={[styles.tabItem, tab.key === "ai" && styles.aiTab]}
        >
          {tab.key === "ai" ? (
            <View style={styles.aiTabMarkCrop}>
              <Image
                accessibilityLabel="Duna AI"
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={dunaProWordmarkBlue}
                style={styles.aiTabMarkImage}
              />
            </View>
          ) : (
            <View
              style={[
                styles.tabIconShell,
                active === tab.key && styles.tabIconShellActive,
              ]}
            >
              {tab.icon ? (
                <tab.icon
                  color={active === tab.key ? colors.warning : colors.muted}
                  size={24}
                  strokeWidth={active === tab.key ? 2.25 : 1.75}
                />
              ) : null}
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function ProApp() {
  const {
    activeAuthOrganizationId,
    authOrganizations,
    messagingDelivery,
    refresh,
    switchOrganization,
  } = useProRuntime();
  const deviceTheme: ThemeName = useColorScheme() === "dark" ? "dark" : "light";
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("today");
  const [surface, setSurface] = useState<
    | "ai"
    | "create"
    | "get-paid"
    | "money"
    | "messages"
    | "scan"
    | "score"
    | "tournament"
    | "video"
  >();
  const [messagesConversationId, setMessagesConversationId] =
    useState<string>();
  const [messagesPersonId, setMessagesPersonId] = useState<string>();
  const [messagesAudienceKey, setMessagesAudienceKey] = useState<string>();
  const [sessionNotesId, setSessionNotesId] = useState<string>();
  const [sessionNotePersonId, setSessionNotePersonId] = useState<string>();
  const [scoreMatchId, setScoreMatchId] = useState<string>();
  const [calendarEntryId, setCalendarEntryId] = useState<string>();
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("light");
  const theme = themePreference === "system" ? deviceTheme : themePreference;
  // v3 ground inversion: operational browsing follows the chosen appearance,
  // while courtside scoring is always the rare, high-focus live ground.
  const surfaceTheme: ThemeName =
    surface === "score" || surface === "scan" ? "dark" : theme;
  const screenTransition = useRef(new Animated.Value(1)).current;

  const openCalendar = (entryId?: string) => {
    setCalendarEntryId(entryId);
    setTab("calendar");
  };

  const openScore = (matchId?: string) => {
    setScoreMatchId(matchId);
    setSurface("score");
  };

  const openGroupMessaging = (entry: ProCalendarEntry) => {
    setMessagesConversationId(undefined);
    setMessagesPersonId(undefined);
    setMessagesAudienceKey(
      entry.sourceType === "booking"
        ? `rental:${entry.id}`
        : `event:${entry.id}`,
    );
    setSurface("messages");
  };

  const changeTab = (nextTab: NavDestination) => {
    if (nextTab === "ai" || nextTab === "create") {
      setSurface(nextTab);
      return;
    }
    if (nextTab === "calendar") setCalendarEntryId(undefined);
    setTab(nextTab);
  };

  useEffect(() => {
    void AsyncStorage.getItem("duna-theme").then((stored) => {
      if (stored === "dark" || stored === "light" || stored === "system") {
        setThemePreference(stored);
      }
    });
  }, []);

  useEffect(() => {
    const openActivity = (url: string | null) => {
      if (url?.startsWith("duna-pro://messages")) {
        const conversationId = url.match(
          /^duna-pro:\/\/messages\/([^/?#]+)/,
        )?.[1];
        setMessagesConversationId(
          conversationId ? decodeURIComponent(conversationId) : undefined,
        );
        setSurface("messages");
        return;
      }
      const matchScore = url?.match(/^duna-pro:\/\/match\/([^/?#]+)/);
      if (matchScore?.[1]) {
        setScoreMatchId(decodeURIComponent(matchScore[1]));
        setSurface("score");
        return;
      }
      const sessionMatch = url?.match(/^duna-pro:\/\/session\/([^/?#]+)/);
      if (sessionMatch?.[1]) {
        setSurface(undefined);
        setCalendarEntryId(decodeURIComponent(sessionMatch[1]));
        setTab("calendar");
        return;
      }
      const organizationMatch = url?.match(
        /^duna-pro:\/\/organization\/([^/?#]+)/,
      );
      if (!organizationMatch?.[1]) return;
      const slug = decodeURIComponent(organizationMatch[1]);
      const normalized = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      const target = authOrganizations?.find(
        (organization) => normalized(organization.name) === slug,
      );
      setSurface(undefined);
      setCalendarEntryId(undefined);
      setTab("today");
      if (
        target &&
        target.id !== activeAuthOrganizationId &&
        switchOrganization
      ) {
        void switchOrganization(target.id);
      } else {
        void refresh();
      }
    };
    void Linking.getInitialURL().then(openActivity);
    const subscription = Linking.addEventListener("url", ({ url }) =>
      openActivity(url),
    );
    return () => subscription.remove();
  }, [
    activeAuthOrganizationId,
    authOrganizations,
    refresh,
    switchOrganization,
  ]);

  useEffect(
    () =>
      listenForMessagingNotificationResponses(() => {
        void messagingDelivery?.syncAll().catch(() => undefined);
      }),
    [messagingDelivery],
  );

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

  activePalette = surfaceTheme === "dark" ? darkColors : lightColors;
  activeStyles = surfaceTheme === "dark" ? darkStyles : lightStyles;

  return (
    <OpenDunaAiContext.Provider value={() => setSurface("ai")}>
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
        {sessionNotesId ? (
          <SessionNotesScreen
            initialPersonId={sessionNotePersonId}
            onClose={() => {
              setSessionNotesId(undefined);
              setSessionNotePersonId(undefined);
            }}
            onSaved={refresh}
            sessionId={sessionNotesId}
          />
        ) : surface === "ai" ? (
          <DunaAiScreen
            onClose={() => setSurface(undefined)}
            palette={{
              canvas: colors.canvas,
              surface: colors.depth,
              surfaceAlt: colors.navyLift,
              ink: colors.bone,
              muted: colors.muted,
              accent: colors.aqua,
              onAccent: colors.onAccent,
              warning: colors.warning,
              positive: colors.positive,
              danger: colors.danger,
              border: rgba(colors.overlayRgb, 0.12),
            }}
            pathname={`/${tab}`}
          />
        ) : surface === "create" ? (
          <OperatorCreateScreen
            onClose={() => setSurface(undefined)}
            onCreated={refresh}
            onGetPaid={() => setSurface("get-paid")}
          />
        ) : surface === "get-paid" ? (
          <GetPaidScreen
            onClose={() => setSurface(undefined)}
            onCreate={() => setSurface("create")}
          />
        ) : surface === "money" ? (
          <MoneyScreen
            onClose={() => setSurface(undefined)}
            onCollect={() => setSurface("get-paid")}
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
              navy: colors.navy,
            }}
          />
        ) : surface === "messages" ? (
          <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
            <StatusBar style={theme === "dark" ? "light" : "dark"} />
            <ProMessagingScreen
              initialAudienceKey={messagesAudienceKey}
              initialConversationId={messagesConversationId}
              initialPersonId={messagesPersonId}
              onClose={() => {
                setMessagesConversationId(undefined);
                setMessagesPersonId(undefined);
                setMessagesAudienceKey(undefined);
                setSurface(undefined);
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
          </SafeAreaView>
        ) : surface === "scan" ? (
          <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
            <StatusBar style="light" />
            <TicketScannerScreen
              onClose={() => setSurface(undefined)}
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
                overlay: rgba(colors.inkRgb, 0.35),
              }}
            />
          </SafeAreaView>
        ) : surface === "score" ? (
          <SafeAreaView edges={["top"]} style={styles.safe}>
            <StatusBar style="light" />
            <View style={styles.app}>
              <ScorerScreen
                initialMatchId={scoreMatchId}
                onExit={() => {
                  setScoreMatchId(undefined);
                  setSurface(undefined);
                }}
              />
            </View>
          </SafeAreaView>
        ) : surface === "tournament" ? (
          <TournamentControl
            onClose={() => setSurface(undefined)}
            onScore={openScore}
            palette={{
              canvas: colors.canvas,
              surface: colors.depth,
              surfaceAlt: colors.navyLift,
              ink: colors.bone,
              muted: colors.muted,
              accent: colors.aqua,
              onAccent: colors.onAccent,
              positive: colors.positive,
              warning: colors.warning,
              danger: colors.danger,
              border: rgba(colors.overlayRgb, 0.12),
            }}
          />
        ) : surface === "video" ? (
          <CoachVideoScreen
            onClose={() => setSurface(undefined)}
            palette={{
              canvas: colors.canvas,
              surface: colors.depth,
              surfaceAlt: colors.navyLift,
              ink: colors.bone,
              muted: colors.muted,
              accent: colors.aqua,
              onAccent: colors.onAccent,
              positive: colors.positive,
              warning: colors.warning,
              danger: colors.danger,
              border: rgba(colors.overlayRgb, 0.12),
            }}
          />
        ) : (
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
                {tab === "today" && (
                  <TodayScreen
                    onCalendar={openCalendar}
                    onCreate={() => setSurface("create")}
                    onGetPaid={() => setSurface("get-paid")}
                    onMessageGroup={openGroupMessaging}
                    onPeople={() => setTab("people")}
                    onRecordNotes={(sessionId) => {
                      setSessionNotePersonId(undefined);
                      setSessionNotesId(sessionId);
                    }}
                    onScore={openScore}
                  />
                )}
                {tab === "calendar" && (
                  <CalendarScreen
                    focusEntryId={calendarEntryId}
                    onCreate={() => setSurface("create")}
                    onMessageGroup={openGroupMessaging}
                    onRecordNotes={(sessionId) => {
                      setSessionNotePersonId(undefined);
                      setSessionNotesId(sessionId);
                    }}
                    onScan={() => setSurface("scan")}
                    onScore={openScore}
                  />
                )}
                {tab === "people" && (
                  <PeopleScreen
                    onMessage={(personId) => {
                      setMessagesPersonId(personId);
                      setMessagesAudienceKey(undefined);
                      setMessagesConversationId(undefined);
                      setSurface("messages");
                    }}
                    onRecordNotes={(sessionId, personId) => {
                      setSessionNotePersonId(personId);
                      setSessionNotesId(sessionId);
                    }}
                  />
                )}
                {tab === "more" && (
                  <MoreScreen
                    onCalendar={() => openCalendar()}
                    onCreate={() => setSurface("create")}
                    onGetPaid={() => setSurface("get-paid")}
                    onMoney={() => setSurface("money")}
                    onMessages={() => {
                      setMessagesConversationId(undefined);
                      setMessagesPersonId(undefined);
                      setMessagesAudienceKey(undefined);
                      setSurface("messages");
                    }}
                    onPeople={() => setTab("people")}
                    onTournament={() => setSurface("tournament")}
                    onVideo={() => setSurface("video")}
                  />
                )}
              </Animated.View>
              <TabBar active={tab} onChange={changeTab} />
            </View>
          </SafeAreaView>
        )}
      </ThemeContext.Provider>
    </OpenDunaAiContext.Provider>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useSatoshiFonts();
  const [showLaunchExperience, setShowLaunchExperience] = useState(true);

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <ProRuntimeProvider>
          <ProApp />
        </ProRuntimeProvider>
        {showLaunchExperience && (
          <ProLaunchExperience
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
    buttonDisabled: { opacity: 0.45 },
    emptyState: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      gap: 10,
      marginTop: 12,
      padding: 16,
    },
    flex: { flex: 1, minWidth: 0 },
    formError: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 14,
      marginTop: 12,
    },
    matchPickerCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      gap: 9,
      padding: 14,
    },
    matchPickerList: { gap: 10, marginTop: 20 },
    matchPickerTeams: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.5,
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
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.8,
      textAlign: "center",
    },
    scorerError: {
      backgroundColor: rgba(colors.dangerRgb, 0.12),
      color: colors.danger,
      fontSize: 12,
      lineHeight: 11,
      paddingHorizontal: 10,
      paddingVertical: 6,
      textAlign: "center",
    },
    organizationSignOutButton: {
      alignItems: "center",
      borderColor: rgba(colors.dangerRgb, 0.2),
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 18,
      padding: 13,
    },
    signOutText: { color: colors.danger, fontSize: 12, fontWeight: "800" },
    content: { paddingBottom: 116, paddingHorizontal: 18 },
    todayContent: { paddingBottom: 132, paddingHorizontal: 18 },
    venueMatchesSection: { marginTop: 24 },
    venueMatchesHeading: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 11,
    },
    venueMatchesTitle: {
      color: colors.bone,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.9,
      marginTop: 4,
    },
    venueMatchesList: { gap: 9 },
    venueMatchCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 20,
      borderWidth: 1,
      overflow: "hidden",
      padding: 14,
    },
    venueMatchTopline: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    venueMatchCourtLane: { alignItems: "center", flexDirection: "row", gap: 7 },
    venueMatchCourtDot: {
      backgroundColor: colors.warning,
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    venueMatchCourtDotLive: { backgroundColor: colors.flare },
    venueMatchCourtName: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    venueMatchTime: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    venueMatchContext: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 6,
    },
    venueMatchTeams: {
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      marginTop: 12,
      paddingVertical: 8,
    },
    venueMatchTeam: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
      minHeight: 49,
      position: "relative",
    },
    venueMatchAvatars: { flexDirection: "row", width: 54 },
    venueMatchAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderColor: colors.depth,
      borderRadius: 17,
      borderWidth: 2,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    venueMatchAvatarOverlap: { marginLeft: -13 },
    venueMatchAvatarText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    venueMatchTeamName: { color: colors.bone, fontSize: 12, fontWeight: "900" },
    venueMatchTeamMeta: {
      color: colors.muted,
      fontFamily: "Archivo-Chip",
      fontSize: 12,
      marginTop: 3,
    },
    venueMatchVersus: {
      color: colors.muted,
      fontFamily: "Archivo-Chip",
      fontSize: 12,
      fontWeight: "900",
      position: "absolute",
      right: 2,
      top: 41,
      zIndex: 2,
    },
    venueMatchAction: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 12,
      minHeight: 50,
      paddingHorizontal: 14,
    },
    venueMatchActionLive: { backgroundColor: colors.flare },
    venueMatchActionText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    venueMatchesEmpty: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 19,
      borderWidth: 1,
      padding: 18,
    },
    venueMatchesEmptyTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    venueMatchesEmptyBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 5,
    },
    visionCoachCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.positiveRgb, 0.3),
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 12,
      padding: 14,
    },
    visionCoachMark: {
      alignItems: "center",
      backgroundColor: rgba(colors.positiveRgb, 0.13),
      borderColor: rgba(colors.positiveRgb, 0.32),
      borderRadius: 16,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    visionCoachMarkText: {
      color: colors.positive,
      fontSize: 19,
      fontWeight: "900",
    },
    visionCoachEyebrow: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.05,
    },
    visionCoachTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
      letterSpacing: -0.25,
      lineHeight: 20,
      marginTop: 4,
    },
    visionCoachBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 5,
    },
    visionCoachAction: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 12,
      minHeight: 50,
      paddingHorizontal: 14,
    },
    visionCoachActionText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    visionCoachActionArrow: {
      color: colors.onAccent,
      fontSize: 17,
      fontWeight: "700",
    },
    nowCard: {
      backgroundColor: colors.aquaDeep,
      borderRadius: 24,
      marginTop: 18,
      overflow: "hidden",
      padding: 18,
    },
    nowCardLive: {
      backgroundColor: colors.aquaDeep,
      borderColor: rgba(colors.flareRgb, 0.5),
      borderWidth: 1,
    },
    nowCardNotes: {
      backgroundColor: colors.aquaDeep,
      borderColor: rgba(colors.warningRgb, 0.42),
      borderWidth: 1,
    },
    nowCardTopline: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    nowCardEyebrow: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    nowCardWeather: {
      color: rgba("255,255,255", 0.68),
      fontSize: 12,
      fontWeight: "700",
    },
    nowCardTitle: {
      color: colors.onAccent,
      fontSize: 28,
      fontWeight: "900",
      letterSpacing: -1.2,
      lineHeight: 31,
      marginTop: 20,
      maxWidth: 540,
    },
    nowCardBody: {
      color: rgba("255,255,255", 0.7),
      fontSize: 12,
      lineHeight: 19,
      marginTop: 9,
      maxWidth: 560,
    },
    nowCardActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 22,
    },
    nowCardPrimary: {
      alignItems: "center",
      backgroundColor: colors.onAccent,
      borderRadius: 15,
      flex: 1.25,
      flexDirection: "row",
      gap: 7,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: 12,
    },
    nowCardPrimaryIcon: {
      color: colors.aquaDeep,
      fontSize: 12,
      fontWeight: "900",
    },
    nowCardPrimaryText: {
      color: colors.aquaDeep,
      fontSize: 12,
      fontWeight: "900",
    },
    nowCardSecondary: {
      alignItems: "center",
      borderColor: rgba("255,255,255", 0.24),
      borderRadius: 15,
      borderWidth: 1,
      flex: 0.75,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: 10,
    },
    nowCardSecondaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    nowCardTrust: {
      color: rgba("255,255,255", 0.5),
      fontSize: 12,
      lineHeight: 12,
      marginTop: 11,
    },
    todayJobs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    todayJob: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      flex: 1,
      flexBasis: "46%",
      minHeight: 112,
      padding: 12,
    },
    moreQuickActions: {
      flexDirection: "row",
      gap: 9,
      marginBottom: 14,
    },
    moreQuickPrimary: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 17,
      flex: 1,
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      minHeight: 58,
    },
    moreQuickSecondary: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 17,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      minHeight: 58,
    },
    moreQuickIcon: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "900",
    },
    moreQuickIconAlt: {
      color: colors.aqua,
      fontSize: 20,
      fontWeight: "900",
    },
    moreQuickPrimaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    moreQuickSecondaryText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    todayJobIcon: {
      color: colors.aqua,
      fontSize: 21,
      fontWeight: "700",
    },
    todayJobTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
      marginTop: "auto",
    },
    todayJobMeta: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
    },
    businessPulse: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 20,
      borderWidth: 1,
      overflow: "hidden",
    },
    businessMetricRow: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    businessMetric: {
      borderRightColor: rgba(colors.overlayRgb, 0.07),
      borderRightWidth: 1,
      flex: 1,
      minHeight: 112,
      minWidth: 100,
      padding: 14,
    },
    businessMetricValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.6,
    },
    businessMetricLabel: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
      marginTop: 7,
    },
    businessMetricChange: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 14,
      marginTop: 3,
    },
    businessMetricEmpty: { padding: 18 },
    businessMetricEmptyTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    businessMetricEmptyBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 4,
    },
    businessInsight: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 76,
      padding: 14,
    },
    businessInsightIcon: {
      color: colors.positive,
      fontSize: 22,
      fontWeight: "900",
    },
    businessInsightTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    businessInsightBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
    todaySchedule: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      overflow: "hidden",
    },
    todayScheduleRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 78,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    todayScheduleTime: { width: 60 },
    todayScheduleTimeMain: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    todayScheduleDuration: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
    },
    todayScheduleLine: {
      alignSelf: "stretch",
      backgroundColor: colors.aqua,
      borderRadius: 4,
      width: 4,
    },
    todayScheduleLineLive: { backgroundColor: colors.flare },
    todayScheduleTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    todayScheduleMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 12,
      marginTop: 3,
    },
    todayScheduleState: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    todayScheduleStateLive: { color: colors.flare },
    todayEmpty: { alignItems: "center", padding: 28 },
    todayEmptyTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    todayEmptyBody: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 5,
      textAlign: "center",
    },
    todaySignals: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      overflow: "hidden",
    },
    todaySignalRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 76,
      padding: 11,
    },
    todaySignalIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.09),
      borderRadius: 12,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    todaySignalIconWarning: {
      backgroundColor: rgba(colors.warningRgb, 0.12),
    },
    todaySignalIconText: {
      color: colors.aqua,
      fontSize: 18,
      fontWeight: "900",
    },
    todaySignalTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    todaySignalBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 12,
      marginTop: 4,
    },
    dayRecap: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.warningRgb, 0.18),
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 24,
      padding: 17,
    },
    dayRecapEyebrow: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    dayRecapTitle: {
      color: colors.bone,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: -0.7,
      marginTop: 8,
    },
    dayRecapBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 5,
    },
    dayRecapButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.warning,
      borderRadius: 13,
      marginTop: 14,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    dayRecapButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarContent: { paddingBottom: 138, paddingHorizontal: 18 },
    calendarIntro: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8,
      maxWidth: 520,
    },
    calendarToolbar: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      marginTop: 18,
    },
    calendarToolbarActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    calendarBlockButton: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 13,
    },
    calendarBlockButtonText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarNewButton: {
      alignItems: "center",
      backgroundColor: colors.warning,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 13,
    },
    calendarNewButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarScanButton: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 13,
    },
    calendarScanButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarTimezone: {
      color: colors.muted,
      fontSize: 12,
      maxWidth: 130,
      textAlign: "right",
    },
    calendarConnectionCard: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 16,
      padding: 14,
    },
    calendarConnectionIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.09),
      borderRadius: 14,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    calendarConnectionIconText: {
      color: colors.aqua,
      fontSize: 20,
      fontWeight: "900",
    },
    calendarConnectionEyebrow: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    calendarConnectionTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
      marginTop: 3,
    },
    calendarConnectionBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 14,
      marginTop: 3,
    },
    calendarConnectionNotice: {
      color: colors.aqua,
      fontSize: 12,
      lineHeight: 14,
      marginTop: 5,
    },
    calendarConnectionButton: {
      alignItems: "center",
      borderColor: colors.aqua,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      minWidth: 72,
      paddingHorizontal: 12,
    },
    calendarConnectionButtonText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarDayBleed: {
      marginHorizontal: -18,
      marginTop: 18,
      paddingHorizontal: 18,
    },
    calendarDayStrip: {
      flexDirection: "row",
      gap: 8,
      paddingRight: 36,
    },
    calendarDayButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 88,
      paddingHorizontal: 13,
      paddingVertical: 10,
      width: 68,
    },
    calendarDayButtonActive: {
      backgroundColor: colors.warning,
      borderColor: colors.warning,
    },
    calendarDayWeekday: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    calendarDayNumber: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 27,
      marginTop: 2,
    },
    calendarDayMonth: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    calendarDayTextActive: { color: colors.onAccent },
    calendarFilterRow: {
      flexDirection: "row",
      gap: 7,
      marginTop: 14,
    },
    calendarFilter: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    calendarFilterActive: {
      backgroundColor: rgba(colors.accentRgb, 0.12),
      borderColor: colors.aqua,
    },
    calendarFilterText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    calendarFilterTextActive: { color: colors.aqua },
    calendarPersonalHeading: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 11,
      marginTop: 24,
    },
    calendarPersonalTitle: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginTop: 3,
    },
    calendarPersonalAgenda: { gap: 8 },
    calendarPersonalCard: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 16,
      borderStyle: "dashed",
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 82,
      padding: 12,
    },
    calendarPersonalTime: { width: 58 },
    calendarPersonalTimeMain: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarPersonalTimeEnd: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
    },
    calendarPersonalAccent: {
      alignSelf: "stretch",
      backgroundColor: colors.sand,
      borderRadius: 3,
      width: 4,
    },
    calendarPersonalName: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "900",
    },
    calendarPersonalMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 14,
      marginTop: 3,
    },
    calendarPersonalEmpty: {
      alignItems: "center",
      backgroundColor: rgba(colors.positiveRgb, 0.06),
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 56,
      padding: 12,
    },
    calendarPersonalEmptyText: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarAgendaHeading: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 11,
      marginTop: 26,
    },
    calendarAgendaTitle: {
      color: colors.bone,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.7,
      marginTop: 4,
    },
    calendarAgenda: { gap: 9 },
    calendarEmpty: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: 28,
    },
    calendarEmptyIcon: { color: colors.warning, fontSize: 30 },
    calendarEmptyTitle: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 8,
    },
    calendarEmptyBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 6,
      maxWidth: 310,
      textAlign: "center",
    },
    calendarEmptyActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
      width: "100%",
    },
    calendarEmptySecondary: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
    },
    calendarEmptySecondaryText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarEmptyPrimary: {
      alignItems: "center",
      backgroundColor: colors.warning,
      borderRadius: 14,
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
    },
    calendarEmptyPrimaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarAgendaCard: {
      alignItems: "stretch",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 112,
      padding: 12,
    },
    calendarAgendaCardBlocked: {
      backgroundColor: rgba(colors.overlayRgb, 0.025),
      borderStyle: "dashed",
    },
    calendarAgendaTime: {
      alignItems: "flex-start",
      justifyContent: "center",
      width: 58,
    },
    calendarAgendaTimeMain: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarAgendaTimeEnd: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
    },
    calendarAgendaAccent: {
      alignSelf: "stretch",
      borderRadius: 3,
      width: 4,
    },
    calendarAgendaTopline: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    calendarAgendaKind: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    calendarAgendaWeather: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarAgendaName: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginTop: 5,
    },
    calendarAgendaMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
    calendarAvatarRow: {
      alignItems: "center",
      flexDirection: "row",
      marginTop: 9,
      minHeight: 25,
    },
    calendarAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderColor: colors.depth,
      borderRadius: 13,
      borderWidth: 2,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    calendarAvatarOverlap: { marginLeft: -7 },
    calendarAvatarText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarAvatarMore: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      marginLeft: 5,
    },
    calendarNotificationNote: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.07),
      borderColor: rgba(colors.accentRgb, 0.15),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginTop: 18,
      padding: 14,
    },
    calendarNotificationIcon: { color: colors.aqua, fontSize: 20 },
    calendarNotificationTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarNotificationBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
    calendarSheetBackdrop: {
      backgroundColor: rgba(colors.inkRgb, 0.72),
      flex: 1,
      justifyContent: "flex-end",
    },
    calendarSheet: {
      backgroundColor: colors.canvas,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      maxHeight: "92%",
      minHeight: "55%",
      overflow: "hidden",
    },
    calendarSheetHandle: {
      alignSelf: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.18),
      borderRadius: 3,
      height: 5,
      marginTop: 9,
      width: 46,
    },
    calendarSheetHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 16,
    },
    calendarSheetClose: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 16,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    calendarSheetCloseText: {
      color: colors.bone,
      fontSize: 23,
      lineHeight: 26,
    },
    calendarSheetEyebrow: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    calendarSheetTitle: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginTop: 3,
    },
    calendarSheetScroll: { padding: 16, paddingBottom: 30 },
    calendarFeedback: {
      backgroundColor: rgba(colors.accentRgb, 0.09),
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 14,
      padding: 11,
    },
    calendarFeedbackText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 15,
    },
    calendarFieldLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 18,
    },
    calendarChoiceRow: { flexDirection: "row", gap: 8 },
    calendarChoice: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
    },
    calendarChoiceActive: {
      backgroundColor: rgba(colors.accentRgb, 0.12),
      borderColor: colors.aqua,
    },
    calendarChoiceText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarChoiceTextActive: { color: colors.aqua },
    calendarOptionRow: {
      flexDirection: "row",
      gap: 8,
      paddingRight: 24,
    },
    calendarOption: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 13,
    },
    calendarOptionActive: {
      backgroundColor: colors.warning,
      borderColor: colors.warning,
    },
    calendarOptionText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarOptionTextActive: { color: colors.onAccent },
    calendarTimeOption: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.09),
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 76,
      paddingHorizontal: 12,
    },
    calendarTextArea: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 14,
      borderWidth: 1,
      color: colors.bone,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 10,
      minHeight: 86,
      padding: 12,
      textAlignVertical: "top",
    },
    calendarTimezoneNote: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 12,
    },
    calendarAiIntro: {
      alignItems: "flex-start",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.18),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
      padding: 13,
    },
    calendarAiIcon: {
      color: colors.warning,
      fontSize: 20,
    },
    calendarAiTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    calendarAiBody: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 3,
    },
    calendarAiBuildButton: {
      flex: 0,
      marginTop: 10,
      width: "100%",
    },
    calendarAiDraft: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.positiveRgb, 0.3),
      borderRadius: 16,
      borderWidth: 1,
      gap: 7,
      marginTop: 12,
      padding: 13,
    },
    calendarAiDraftTitle: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 20,
    },
    calendarAiWarning: {
      color: colors.warning,
      fontSize: 13,
      lineHeight: 18,
    },
    calendarAiBlock: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 11,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 46,
      paddingHorizontal: 11,
    },
    calendarAiBlockDay: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "800",
    },
    calendarAiBlockTime: {
      color: colors.muted,
      fontFamily: "Archivo-Chip",
      fontSize: 13,
      fontWeight: "800",
    },
    calendarAiConfirm: {
      alignItems: "flex-start",
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginVertical: 14,
      minHeight: 64,
      padding: 12,
    },
    calendarAiConfirmMark: {
      borderColor: colors.aqua,
      borderRadius: 6,
      borderWidth: 1,
      color: colors.aqua,
      fontSize: 15,
      height: 24,
      lineHeight: 21,
      textAlign: "center",
      width: 24,
    },
    calendarAiConfirmTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
    },
    calendarAiConfirmBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    calendarSheetSummary: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      marginBottom: 18,
      padding: 13,
    },
    calendarSheetSummaryItem: {
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      paddingVertical: 9,
    },
    calendarSheetSummaryLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    calendarSheetSummaryValue: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 17,
      marginTop: 3,
    },
    calendarSheetSectionHeader: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 9,
      marginTop: 18,
    },
    calendarSheetSectionTitle: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 3,
    },
    calendarRoster: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 15,
      borderWidth: 1,
      overflow: "hidden",
    },
    calendarRosterEmpty: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      padding: 14,
    },
    calendarRosterRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 58,
      padding: 10,
    },
    calendarRosterAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 10,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    calendarRosterAvatarText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarRosterName: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarRosterMeta: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 2,
    },
    calendarRosterActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    calendarCheckInButton: {
      backgroundColor: rgba(colors.positiveRgb, 0.12),
      borderColor: rgba(colors.positiveRgb, 0.22),
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    calendarCheckInButtonText: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarRemoveButton: {
      borderColor: rgba(colors.dangerRgb, 0.22),
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    calendarRemoveButtonText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarPeopleOptions: {
      flexDirection: "row",
      gap: 8,
      paddingRight: 24,
    },
    calendarPersonOption: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 15,
      borderWidth: 1,
      padding: 10,
      width: 116,
    },
    calendarPersonOptionAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    calendarPersonOptionAvatarText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarPersonOptionName: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 7,
      maxWidth: 94,
    },
    calendarPersonOptionAdd: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
      marginTop: 7,
    },
    calendarEquipmentIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.1),
      borderRadius: 10,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    calendarEquipmentIconText: { color: colors.aqua, fontSize: 17 },
    calendarEquipmentOption: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 15,
      borderWidth: 1,
      minHeight: 104,
      padding: 12,
      width: 148,
    },
    calendarEquipmentOptionTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarEquipmentOptionMeta: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 5,
    },
    calendarEquipmentOptionAction: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
      marginTop: 15,
    },
    calendarConnectedUpdate: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.07),
      borderColor: rgba(colors.accentRgb, 0.15),
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
      padding: 12,
    },
    calendarConnectedUpdateIcon: { color: colors.aqua, fontSize: 19 },
    calendarConnectedUpdateTitle: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarConnectedUpdateBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
    calendarDangerZone: {
      backgroundColor: rgba(colors.dangerRgb, 0.06),
      borderColor: rgba(colors.dangerRgb, 0.15),
      borderRadius: 15,
      borderWidth: 1,
      marginTop: 18,
      padding: 13,
    },
    calendarDangerTitle: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 4,
    },
    calendarDangerButton: {
      alignItems: "center",
      backgroundColor: colors.danger,
      borderRadius: 13,
      justifyContent: "center",
      marginTop: 10,
      minHeight: 44,
    },
    calendarDangerButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarSheetFooter: {
      backgroundColor: colors.canvas,
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 12,
      paddingBottom: Platform.OS === "ios" ? 26 : 12,
    },
    calendarSheetSecondary: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.12),
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
    },
    calendarSheetSecondaryText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    calendarSheetPrimary: {
      alignItems: "center",
      backgroundColor: colors.warning,
      borderRadius: 14,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
    },
    calendarSheetPrimaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    wordmarkImage: { height: 30, width: 96 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 44,
      paddingBottom: 8,
      paddingTop: 4,
    },
    headerShell: { marginBottom: 14 },
    headerOrganization: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 6,
      marginRight: 12,
      minHeight: 38,
    },
    headerOrganizationName: {
      color: colors.bone,
      flexShrink: 1,
      fontSize: 14,
      fontWeight: "800",
    },
    headerButtons: { flexDirection: "row", gap: 8 },
    themeButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 19,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    profileButton: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      position: "relative",
      width: 38,
    },
    profileText: { color: colors.bone, fontSize: 12, fontWeight: "900" },
    dot: {
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
    watchStrip: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      minHeight: 50,
      overflow: "hidden",
      paddingHorizontal: 10,
    },
    watchBrand: {
      alignItems: "center",
      borderRightColor: rgba(colors.overlayRgb, 0.08),
      borderRightWidth: 1,
      flexDirection: "row",
      gap: 6,
      marginRight: 4,
      paddingRight: 8,
    },
    watchPulse: {
      backgroundColor: colors.flare,
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    watchBrandText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    watchMetric: {
      alignItems: "baseline",
      flex: 1,
      flexDirection: "row",
      gap: 4,
      justifyContent: "center",
      minWidth: 0,
      paddingHorizontal: 3,
    },
    watchMetricValue: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 15,
      fontWeight: "900",
    },
    watchMetricLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      flexShrink: 1,
      letterSpacing: 0.25,
    },
    modalSafe: { backgroundColor: colors.canvas, flex: 1 },
    sheetHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    sheetTitle: {
      color: colors.bone,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.8,
      marginTop: 3,
    },
    closeButton: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    closeText: { color: colors.bone, fontSize: 28, lineHeight: 31 },
    organizationSheetContent: { padding: 18, paddingBottom: 48 },
    organizationSheetLead: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      marginBottom: 16,
    },
    organizationSheetList: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 19,
      borderWidth: 1,
      overflow: "hidden",
    },
    organizationSheetRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 76,
      paddingHorizontal: 13,
    },
    organizationSheetRowActive: {
      backgroundColor: rgba(colors.accentRgb, 0.08),
    },
    organizationSheetMark: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 18,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    organizationSheetMarkText: {
      color: colors.aqua,
      fontSize: 13,
      fontWeight: "900",
    },
    organizationSheetName: {
      color: colors.bone,
      fontSize: 15,
      fontWeight: "900",
    },
    organizationSheetRole: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
      textTransform: "capitalize",
    },
    organizationSheetState: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
    },
    organizationSheetEmpty: { padding: 16 },
    signOutButton: {
      alignItems: "center",
      borderColor: rgba(colors.dangerRgb, 0.24),
      borderRadius: 15,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 18,
      minHeight: 52,
    },
    organizationSignOutText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: "900",
    },
    pageTitle: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    pageTitleCompact: {
      alignItems: "flex-start",
      flexDirection: "column",
      gap: 12,
    },
    eyebrow: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    displayTitle: {
      color: colors.bone,
      fontSize: 40,
      fontWeight: "900",
      letterSpacing: -2.1,
      lineHeight: 42,
      marginTop: 6,
    },
    displayTitleCompact: {
      fontSize: 36,
      letterSpacing: -1.8,
      lineHeight: 38,
    },
    primaryAction: {
      backgroundColor: colors.warning,
      borderRadius: 21,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    primaryActionText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    subhead: { color: colors.muted, fontSize: 12, marginTop: 8 },
    subheadStrong: { color: colors.bone, fontWeight: "700" },
    weatherOperationsCard: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.08),
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
      padding: 13,
    },
    weatherOperationsIcon: { fontSize: 26 },
    weatherOperationsUpdated: {
      color: colors.muted,
      fontSize: 12,
      textAlign: "right",
    },
    createEventCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.accentRgb, 0.16),
      borderRadius: 17,
      borderWidth: 1,
      gap: 13,
      marginTop: 18,
      padding: 13,
    },
    createEventHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    createEventMark: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 12,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    createEventMarkText: {
      color: colors.onAccent,
      fontSize: 22,
      fontWeight: "700",
      lineHeight: 24,
    },
    createEventActions: { flexDirection: "row", gap: 8 },
    createEventPrimary: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 12,
      flex: 1,
      paddingVertical: 11,
    },
    createEventPrimaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    createEventSecondary: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 11,
    },
    createEventSecondaryText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 18,
    },
    metricCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 15,
      borderWidth: 1,
      minHeight: 112,
      padding: 12,
      width: "48.7%",
    },
    metricLabel: { color: colors.muted, fontSize: 12, letterSpacing: 0.8 },
    metricValue: {
      color: colors.bone,
      fontFamily: "Archivo-Block",
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 12,
    },
    positiveText: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 5,
    },
    metaText: { color: colors.muted, fontSize: 12, marginTop: 3 },
    meter: {
      backgroundColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 3,
      height: 4,
      marginTop: 12,
      overflow: "hidden",
    },
    meterFill: { backgroundColor: colors.aqua, height: "100%" },
    pill: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    pillText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    sectionTitle: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
      marginTop: 28,
    },
    sectionHeading: {
      color: colors.bone,
      fontSize: 23,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 4,
    },
    linkText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
    scheduleCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    scheduleRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 68,
      padding: 9,
    },
    timeBlock: { width: 32 },
    timeMain: { color: colors.bone, fontSize: 12, fontWeight: "700" },
    timeSuffix: { color: colors.muted, fontSize: 12 },
    scheduleWeather: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 4,
    },
    statusLine: { borderRadius: 2, height: 35, width: 3 },
    rowTitle: { color: colors.bone, fontSize: 12, fontWeight: "700" },
    rosterCount: { alignItems: "flex-end" },
    chevron: { color: colors.muted, fontSize: 19 },
    attentionCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    attentionRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 65,
      padding: 9,
    },
    attentionIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.warningRgb, 0.08),
      borderRadius: 9,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    attentionIconText: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
    },
    aiBrief: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.warningRgb, 0.13),
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 24,
      padding: 13,
    },
    aiMark: {
      alignItems: "center",
      backgroundColor: colors.warning,
      borderRadius: 9,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    aiMarkText: { color: colors.onAccent, fontSize: 15 },
    aiTitle: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: -0.4,
      lineHeight: 16,
      marginTop: 9,
    },
    aiBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 12,
      marginBottom: 9,
      marginTop: 4,
    },
    searchField: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      marginTop: 18,
      paddingHorizontal: 12,
    },
    searchIcon: { color: colors.muted, fontSize: 18 },
    searchInput: { color: colors.bone, flex: 1, fontSize: 12, height: 44 },
    filterBleed: { marginHorizontal: -18, paddingHorizontal: 18 },
    filterRow: {
      flexDirection: "row",
      gap: 6,
      marginTop: 12,
      paddingRight: 36,
    },
    filterChip: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    filterActive: {
      backgroundColor: colors.warning,
      borderColor: colors.warning,
    },
    filterText: { color: colors.muted, fontSize: 12 },
    filterTextActive: { color: colors.onAccent, fontWeight: "800" },
    peopleSummary: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 14,
      padding: 12,
    },
    peopleList: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 12,
      overflow: "hidden",
    },
    personRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 66,
      padding: 9,
    },
    personAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 9,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    personAvatarText: { color: colors.bone, fontSize: 12, fontWeight: "900" },
    personRelationshipMeta: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 5,
    },
    personRating: { alignItems: "flex-end", minWidth: 30 },
    ratingNumber: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 12,
      fontWeight: "800",
    },
    peopleModalSafe: { backgroundColor: colors.canvas, flex: 1 },
    peopleModalHeader: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.08),
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 18,
    },
    peopleModalTitle: {
      color: colors.bone,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.8,
      marginTop: 3,
    },
    peopleModalClose: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderRadius: 18,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    peopleModalCloseText: {
      color: colors.bone,
      fontSize: 24,
      lineHeight: 25,
    },
    peopleModalContent: { padding: 18, paddingBottom: 42 },
    peopleProfileHero: { alignItems: "center", paddingVertical: 14 },
    peopleProfileAvatar: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 30,
      height: 90,
      justifyContent: "center",
      width: 90,
    },
    peopleProfileAvatarText: {
      color: colors.onAccent,
      fontSize: 24,
      fontWeight: "900",
    },
    peopleProfileName: {
      color: colors.bone,
      fontSize: 26,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 13,
    },
    peopleProfileMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
    peopleProfilePills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      justifyContent: "center",
      marginTop: 10,
    },
    peopleProfileMetrics: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-around",
      padding: 16,
    },
    peopleProfileCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    peopleProfileCardTitle: {
      color: colors.bone,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 5,
    },
    peopleProfileCardBody: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 5,
    },
    peopleProfileReason: {
      color: colors.warning,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 6,
    },
    peopleProfileActions: { flexDirection: "row", gap: 8, marginTop: 12 },
    peopleProfileActionHint: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 8,
      textAlign: "center",
    },
    peopleProfileEmail: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
    },
    peopleProfileEmailText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "800",
    },
    peopleProfilePrimary: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 15,
      flex: 1,
      justifyContent: "center",
      minHeight: 50,
    },
    peopleProfilePrimaryText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    peopleProfileSecondary: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.14),
      borderRadius: 15,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 50,
    },
    peopleProfileSecondaryText: {
      color: colors.bone,
      fontSize: 12,
      fontWeight: "900",
    },
    peopleInviteContent: { padding: 18, paddingBottom: 42 },
    peopleInviteLead: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 18,
    },
    peopleInviteInput: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 14,
      borderWidth: 1,
      color: colors.bone,
      fontSize: 13,
      marginBottom: 13,
      minHeight: 50,
      paddingHorizontal: 13,
    },
    peopleInviteToggle: {
      alignItems: "center",
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
      padding: 12,
    },
    peopleInviteToggleMark: {
      alignItems: "center",
      borderColor: rgba(colors.overlayRgb, 0.22),
      borderRadius: 8,
      borderWidth: 1,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    peopleInviteToggleMarkActive: {
      backgroundColor: colors.positive,
      borderColor: colors.positive,
    },
    peopleInviteToggleMarkText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    peopleInviteFeedback: {
      color: colors.aqua,
      fontSize: 12,
      lineHeight: 16,
      marginBottom: 10,
    },
    peopleInviteSubmit: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 16,
      justifyContent: "center",
      minHeight: 54,
    },
    peopleInviteSubmitText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    scorer: { backgroundColor: colors.canvas, flex: 1 },
    scorerTop: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 14,
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    scorerExitButton: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.06),
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    scorerExitButtonExpanded: { minHeight: 56, paddingHorizontal: 16 },
    scorerExitIcon: {
      color: colors.aqua,
      fontSize: 27,
      fontWeight: "500",
      lineHeight: 28,
    },
    scorerExitIconExpanded: { fontSize: 32, lineHeight: 33 },
    scorerExitText: { color: colors.bone, fontSize: 13, fontWeight: "800" },
    scorerExitTextExpanded: { fontSize: 16 },
    scorerExitMeta: { color: colors.muted, fontSize: 12, marginTop: 1 },
    scorerExitMetaExpanded: { fontSize: 12 },
    matchPickerExit: { alignSelf: "flex-start", marginBottom: 12 },
    scorerIdentity: { flex: 1, minWidth: 0 },
    scorerMatch: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.4,
    },
    scorerMatchExpanded: { fontSize: 15 },
    scorerVenue: {
      color: colors.bone,
      fontSize: 14,
      fontWeight: "700",
      marginTop: 4,
    },
    scorerVenueExpanded: { fontSize: 18 },
    scorerStatusGroup: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 8,
    },
    syncButton: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderRadius: 18,
      flexDirection: "row",
      gap: 6,
      minHeight: 38,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    syncIcon: { color: colors.positive, fontSize: 12 },
    syncText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
    scorerFormat: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    scorerFormatText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
    scorerFormatTextExpanded: { fontSize: 16 },
    segmented: {
      backgroundColor: rgba(colors.overlayRgb, 0.05),
      borderRadius: 18,
      flexDirection: "row",
      padding: 2,
    },
    segmentButton: {
      borderRadius: 16,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    segmentButtonExpanded: { paddingHorizontal: 16, paddingVertical: 8 },
    segmentActive: { backgroundColor: colors.aqua },
    segmentText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
    segmentTextExpanded: { fontSize: 14 },
    segmentTextActive: { color: colors.onAccent },
    scoreNotice: {
      alignItems: "center",
      backgroundColor: colors.warning,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    scoreNoticeIcon: { color: colors.onAccent, fontSize: 18 },
    scoreNoticeTitle: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: "900",
    },
    scoreNoticeBody: { color: colors.onAccent, fontSize: 12 },
    court: { flex: 1, flexDirection: "row", minHeight: 0 },
    teamButton: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 8,
      position: "relative",
    },
    teamA: {
      backgroundColor: colors.depth,
      borderRightColor: rgba(colors.overlayRgb, 0.06),
      borderRightWidth: 1,
    },
    teamB: { backgroundColor: colors.navy },
    serveRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      position: "absolute",
      top: 15,
    },
    serveDot: {
      backgroundColor: colors.aqua,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    serveText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.7,
    },
    serveTextExpanded: { fontSize: 14 },
    teamPeople: { alignItems: "center", flexDirection: "row" },
    scoreAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderColor: colors.depth,
      borderRadius: 18,
      borderWidth: 2,
      height: 36,
      justifyContent: "center",
      marginLeft: -4,
      width: 36,
    },
    scoreAvatarExpanded: {
      borderRadius: 24,
      height: 48,
      width: 48,
    },
    scoreAvatarText: { color: colors.bone, fontSize: 12, fontWeight: "900" },
    scoreAvatarTextExpanded: { fontSize: 13 },
    teamName: {
      color: colors.bone,
      fontSize: 16,
      fontWeight: "800",
      marginLeft: 9,
    },
    teamNameExpanded: { fontSize: 22, marginLeft: 12 },
    bigScore: {
      color: colors.bone,
      fontFamily: "Archivo-Score",
      fontSize: 124,
      fontWeight: "900",
      letterSpacing: -10,
      lineHeight: 130,
      marginVertical: 4,
    },
    bigScoreExpanded: {
      fontSize: 184,
      letterSpacing: -14,
      lineHeight: 192,
      marginVertical: 12,
    },
    tapHint: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    tapHintExpanded: { fontSize: 14, letterSpacing: 0.7 },
    versus: {
      alignItems: "center",
      backgroundColor: colors.ink,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 18,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      left: "50%",
      marginLeft: -17,
      marginTop: -17,
      position: "absolute",
      top: "50%",
      width: 34,
      zIndex: 3,
    },
    versusText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
    scorerBottom: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 62,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    secondaryAction: {
      backgroundColor: rgba(colors.overlayRgb, 0.05),
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      minHeight: 42,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    secondaryActionText: {
      color: colors.bone,
      fontSize: 13,
      fontWeight: "800",
    },
    syncSummary: { alignItems: "center", flexDirection: "row", gap: 6 },
    syncSummaryText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
    sets: { flexDirection: "row", gap: 4 },
    setBox: {
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderRadius: 9,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    setBoxActive: { backgroundColor: rgba(colors.accentRgb, 0.09) },
    setLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
    setScore: {
      color: colors.bone,
      fontFamily: "Archivo-Table",
      fontSize: 13,
      fontWeight: "800",
      marginTop: 2,
    },
    moreScore: { padding: 6 },
    moreScoreText: { color: colors.muted },
    balanceCard: {
      backgroundColor: colors.navy,
      borderColor: rgba(colors.warningRgb, 0.16),
      borderRadius: 19,
      borderWidth: 1,
      marginTop: 18,
      padding: 16,
    },
    cardTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    brandSmall: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.3,
    },
    balanceLabel: {
      color: colors.muted,
      fontSize: 12,
      letterSpacing: 1,
      marginTop: 34,
    },
    balanceValue: {
      color: colors.bone,
      fontFamily: "Archivo-Hero",
      fontSize: 39,
      fontWeight: "900",
      letterSpacing: -2.4,
      marginTop: 4,
    },
    balanceActions: { flexDirection: "row", gap: 7, marginTop: 19 },
    balanceAction: {
      backgroundColor: rgba(colors.overlayRgb, 0.06),
      borderRadius: 16,
      color: colors.bone,
      fontSize: 12,
      fontWeight: "700",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    moneyMetrics: { flexDirection: "row", gap: 7, marginTop: 9 },
    transactions: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    transactionRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 64,
      padding: 9,
    },
    transactionIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.positiveRgb, 0.08),
      borderRadius: 9,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    transactionAmount: {
      color: colors.bone,
      fontFamily: "Archivo-Chip",
      fontSize: 12,
      fontWeight: "800",
    },
    boundaryNote: {
      alignItems: "center",
      backgroundColor: rgba(colors.accentRgb, 0.05),
      borderColor: rgba(colors.accentRgb, 0.13),
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 13,
      padding: 10,
    },
    boundaryIcon: { color: colors.aqua, fontSize: 16 },
    organizationCard: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      marginTop: 17,
      padding: 12,
    },
    orgAvatar: {
      alignItems: "center",
      backgroundColor: colors.aquaDeep,
      borderRadius: 11,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    orgAvatarText: { color: colors.onAccent, fontSize: 12, fontWeight: "900" },
    orgName: { color: colors.bone, fontSize: 12, fontWeight: "800" },
    menuEyebrow: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1,
      marginBottom: 7,
      marginTop: 22,
    },
    menuCard: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.07),
      borderRadius: 15,
      borderWidth: 1,
      overflow: "hidden",
    },
    menuRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.06),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 55,
      padding: 10,
    },
    menuIcon: {
      alignItems: "center",
      backgroundColor: rgba(colors.warningRgb, 0.08),
      borderRadius: 8,
      color: colors.warning,
      fontSize: 12,
      fontWeight: "900",
      height: 30,
      lineHeight: 30,
      textAlign: "center",
      width: 30,
    },
    moreDetailContent: { padding: 18, paddingBottom: 42 },
    moreDetailLead: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 14,
    },
    moreDetailList: {
      backgroundColor: colors.depth,
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      marginBottom: 12,
      overflow: "hidden",
    },
    moreDetailRow: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 66,
      padding: 11,
    },
    moreDetailMark: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 10,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    moreDetailMarkText: {
      color: colors.aqua,
      fontSize: 12,
      fontWeight: "900",
    },
    moreDetailMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
    moreDetailEmpty: { gap: 4, padding: 16 },
    proNote: {
      alignItems: "center",
      backgroundColor: colors.navy,
      borderColor: rgba(colors.warningRgb, 0.12),
      borderRadius: 16,
      borderWidth: 1,
      gap: 11,
      marginTop: 22,
      padding: 15,
    },
    tabBar: {
      backgroundColor: rgba(colors.depthRgb, 0.99),
      borderColor: rgba(colors.overlayRgb, 0.1),
      borderRadius: 32,
      borderWidth: 1,
      bottom: Platform.OS === "ios" ? 14 : 10,
      flexDirection: "row",
      left: 12,
      minHeight: 62,
      paddingBottom: 6,
      paddingHorizontal: 8,
      paddingTop: 6,
      position: "absolute",
      right: 12,
      shadowColor: "#173b65",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
    },
    tabItem: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 50,
      position: "relative",
    },
    tabIconShell: {
      alignItems: "center",
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    tabIconShellActive: {
      backgroundColor: rgba(colors.warningRgb, 0.1),
    },
    aiTab: { marginTop: -15 },
    aiTabMarkCrop: {
      backgroundColor: colors.aqua,
      borderColor: colors.depth,
      borderRadius: 30,
      borderWidth: 4,
      height: 60,
      overflow: "hidden",
      position: "relative",
      width: 60,
    },
    aiTabMarkImage: {
      height: 60,
      left: -3,
      position: "absolute",
      top: -2,
      width: 137,
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
