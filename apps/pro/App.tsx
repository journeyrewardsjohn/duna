import { formatVenueTime } from "@duna/core";
import { demoOrganization, demoPeople } from "@duna/core/demo";
import {
  createUndoEvent,
  foldScore,
  standardBeachFormat,
  type ScoreEvent,
  type ScoringSystem,
} from "@duna/league-engine";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
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
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { dunaHqUrl } from "./mobile-api";
import {
  ProRuntimeProvider,
  useProRuntime,
  type OperatorMatchScoringState,
  type OperatorMatches,
  type ProRuntime,
} from "./runtime";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
  useFellixFonts,
} from "./fellix-text";

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

type Tab = "today" | "calendar" | "score" | "people" | "more";

const tabs: readonly { key: Tab; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "⌂" },
  { key: "calendar", label: "Calendar", icon: "▦" },
  { key: "score", label: "Score", icon: "＋" },
  { key: "people", label: "People", icon: "◎" },
  { key: "more", label: "More", icon: "•••" },
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

function Mark() {
  return (
    <View style={styles.wordmark}>
      <View style={styles.mark}>
        <View style={styles.markArc} />
        <View style={styles.markDot} />
      </View>
      <Text style={styles.wordmarkText}>DUNA</Text>
      <Text style={styles.proPill}>PRO</Text>
    </View>
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

function Header({ context }: { readonly context: string }) {
  const { dashboard, mode } = useProRuntime();
  const initials = (dashboard?.organization.name ?? demoOrganization.name)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View style={styles.header}>
      <View>
        <Mark />
        <Text style={styles.headerContext}>{context}</Text>
      </View>
      <View style={styles.headerButtons}>
        <ThemeButton />
        <Pressable style={styles.aiButton}>
          <Text style={styles.aiButtonText}>✦</Text>
        </Pressable>
        <Pressable style={styles.profileButton}>
          <Text style={styles.profileText}>{initials}</Text>
          {mode === "live" && <View style={styles.dot} />}
        </Pressable>
      </View>
    </View>
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

function TodayScreen({
  onCalendar,
}: {
  readonly onCalendar: (entryId?: string) => void;
}) {
  const { dashboard, mode, workspace } = useProRuntime();
  const organization = dashboard?.organization ?? demoOrganization;
  const metrics = dashboard?.metrics.slice(0, 4) ?? [
    { label: "Today’s sales", value: "$8,420", change: "↗ 18.4%" },
    { label: "Check-ins", value: "146 / 168", change: "87% arrived" },
    { label: "Court use", value: "82%" },
    { label: "Next payout", value: "$61,884", change: "Friday" },
  ];
  const scheduleItems =
    dashboard?.schedule ??
    schedule.map((item) => ({
      time: `${item[0]} ${item[1]}`,
      title: item[2],
      court: item[3],
      detail: `${item[4]} roster`,
      state: item[5],
    }));
  const alerts = dashboard?.alerts ?? [
    {
      id: "preview-waivers",
      title: "2 waivers expire before Saturday",
      detail: "U14 roster · guardians can renew in one tap",
      action: "Review",
      tone: "warning",
    },
    {
      id: "preview-renewals",
      title: "3 failed membership renewals",
      detail: "$474.00 at risk · recovery is running",
      action: "Open",
      tone: "danger",
    },
    {
      id: "preview-replies",
      title: "4 conversations need a reply",
      detail: "Oldest waiting 2h 18m",
      action: "Reply",
      tone: "default",
    },
  ];
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(new Date())
    .replace(", ", " · ")
    .toUpperCase();
  const primaryVenue = workspace?.venues.find((venue) => venue.weather);
  const todayForecast = primaryVenue?.weather?.days[0];
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header context={organization.name.toUpperCase()} />
      <PageTitle
        action="Create"
        eyebrow={today}
        onAction={() =>
          void WebBrowser.openBrowserAsync(`${dunaHqUrl}/events/create`)
        }
        title={mode === "preview" ? "Good morning, Sam." : "Good morning."}
      />
      <Text style={styles.subhead}>
        {organization.name} has{" "}
        <Text style={styles.subheadStrong}>
          {organization.memberCount} active people
        </Text>{" "}
        and {scheduleItems.length} scheduled items in this workspace.
      </Text>
      {primaryVenue?.weather && todayForecast && (
        <View style={styles.weatherOperationsCard}>
          <Text style={styles.weatherOperationsIcon}>
            {weatherSymbol(todayForecast.icon)}
          </Text>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>
              {todayForecast.condition} ·{" "}
              {fahrenheit(todayForecast.temperatureHighC)} high
            </Text>
            <Text style={styles.metaText}>
              {primaryVenue.name} · sunrise{" "}
              {todayForecast.sunriseAt
                ? formatVenueTime(
                    todayForecast.sunriseAt,
                    primaryVenue.timezone,
                    "en-US",
                    { hour: "numeric", minute: "2-digit" },
                  )
                : "pending"}{" "}
              · sunset{" "}
              {todayForecast.sunsetAt
                ? formatVenueTime(
                    todayForecast.sunsetAt,
                    primaryVenue.timezone,
                    "en-US",
                    { hour: "numeric", minute: "2-digit" },
                  )
                : "pending"}
            </Text>
          </View>
          <Text style={styles.weatherOperationsUpdated}>
            Updated{" "}
            {formatVenueTime(
              primaryVenue.weather.updatedAt,
              primaryVenue.timezone,
              "en-US",
              { hour: "numeric", minute: "2-digit" },
            )}
          </Text>
        </View>
      )}
      <View style={styles.createEventCard}>
        <View style={styles.createEventHeader}>
          <View style={styles.createEventMark}>
            <Text style={styles.createEventMarkText}>＋</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>Create from the field</Text>
            <Text style={styles.metaText}>
              Start a private draft now. Publishing stays locked until Money is
              connected in HQ.
            </Text>
          </View>
        </View>
        <View style={styles.createEventActions}>
          <Pressable
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `${dunaHqUrl}/events/create?type=tournament`,
              )
            }
            style={styles.createEventPrimary}
          >
            <Text style={styles.createEventPrimaryText}>Tournament</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `${dunaHqUrl}/events/create?type=league`,
              )
            }
            style={styles.createEventSecondary}
          >
            <Text style={styles.createEventSecondaryText}>League</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.metricGrid}>
        {metrics.map((metric) => (
          <View key={metric.label} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{metric.label.toUpperCase()}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
            {metric.change && (
              <Text
                style={
                  metric.trend === "down"
                    ? styles.metaText
                    : styles.positiveText
                }
              >
                {metric.change}
              </Text>
            )}
          </View>
        ))}
      </View>
      <SectionTitle
        eyebrow="LIVE OPERATIONS"
        title="Today on sand"
        action="Calendar"
        onAction={() => onCalendar()}
      />
      <View style={styles.scheduleCard}>
        {scheduleItems.map((item, index) => {
          const calendarEntry = workspace?.calendar.entries.find(
            (entry) => entry.title === item.title,
          );
          const venue = workspace?.venues.find(
            (candidate) => candidate.name === calendarEntry?.venueName,
          );
          const point = calendarEntry
            ? venue?.weather?.hourly
                .slice()
                .sort(
                  (left, right) =>
                    Math.abs(
                      Date.parse(left.startsAt) -
                        Date.parse(calendarEntry.startsAt),
                    ) -
                    Math.abs(
                      Date.parse(right.startsAt) -
                        Date.parse(calendarEntry.startsAt),
                    ),
                )[0]
            : undefined;
          return (
            <Pressable
              key={`${item.time}-${item.title}`}
              onPress={() => {
                selectionHaptic();
                onCalendar(calendarEntry?.id);
              }}
              style={styles.scheduleRow}
            >
              <View style={styles.timeBlock}>
                <Text style={styles.timeMain}>{item.time}</Text>
                {point && (
                  <Text style={styles.scheduleWeather}>
                    {weatherSymbol(point.icon)} {fahrenheit(point.temperatureC)}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.statusLine,
                  { backgroundColor: index === 0 ? colors.flare : colors.aqua },
                ]}
              />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.metaText}>{item.court}</Text>
              </View>
              <View style={styles.rosterCount}>
                <Text style={styles.rowTitle}>{item.detail}</Text>
              </View>
              <Pill
                tone={item.state.toLowerCase() === "live" ? "live" : "neutral"}
              >
                {item.state}
              </Pill>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </View>
      <SectionTitle
        eyebrow="ACTION QUEUE"
        title="Needs attention"
        action="View all"
      />
      <View style={styles.attentionCard}>
        {alerts.map((item, index) => (
          <View key={item.id} style={styles.attentionRow}>
            <View
              style={[
                styles.attentionIcon,
                index === 1 && { backgroundColor: rgba(colors.dangerRgb, 0.1) },
              ]}
            >
              <Text
                style={[
                  styles.attentionIconText,
                  index === 1 && { color: colors.danger },
                ]}
              >
                {item.tone === "danger"
                  ? "$"
                  : item.tone === "warning"
                    ? "!"
                    : "•"}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.metaText}>{item.detail}</Text>
            </View>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(`${dunaHqUrl}/dashboard`)
              }
            >
              <Text style={styles.linkText}>{item.action}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {mode === "preview" && (
        <View style={styles.aiBrief}>
          <View style={styles.aiMark}>
            <Text style={styles.aiMarkText}>✦</Text>
          </View>
          <View style={styles.flex}>
            <Pill>Duna AI · read only</Pill>
            <Text style={styles.aiTitle}>
              Friday Lights will likely sell out by 2 PM tomorrow.
            </Text>
            <Text style={styles.aiBody}>
              Preview insight only. Connected recommendations remain read-only
              until an operator asks Duna to prepare a draft.
            </Text>
          </View>
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
  onScore,
}: {
  readonly focusEntryId?: string;
  readonly onScore: () => void;
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

  const fullWorkspaceHref = selectedEntry
    ? selectedEntry.kind === "league"
      ? `${dunaHqUrl}/leagues`
      : selectedEntry.kind === "court-rental"
        ? `${dunaHqUrl}/facilities`
        : selectedEntry.kind === "private-lesson"
          ? `${dunaHqUrl}/products`
          : `${dunaHqUrl}/events`
    : `${dunaHqUrl}/calendar`;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.calendarContent}
        showsVerticalScrollIndicator={false}
      >
        <Header
          context={`${dashboard?.organization.name ?? "DUNA PRO"} · CALENDAR`}
        />
        <PageTitle
          action="New"
          eyebrow="THE OPERATING HUB"
          onAction={() =>
            void WebBrowser.openBrowserAsync(`${dunaHqUrl}/events/create`)
          }
          title="Calendar."
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
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(`${dunaHqUrl}/events/create`)
              }
              style={styles.calendarNewButton}
            >
              <Text style={styles.calendarNewButtonText}>＋ Add event</Text>
            </Pressable>
          </View>
          <Text style={styles.calendarTimezone}>{timezone}</Text>
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

        <View style={styles.calendarAgendaHeading}>
          <View>
            <Text style={styles.eyebrow}>DAY AGENDA</Text>
            <Text style={styles.calendarAgendaTitle}>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(selectedDate)}
            </Text>
          </View>
          <Pill tone={visibleEntries.length > 0 ? "positive" : "neutral"}>
            {`${visibleEntries.length} items`}
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
                  onPress={() =>
                    void WebBrowser.openBrowserAsync(
                      `${dunaHqUrl}/events/create`,
                    )
                  }
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
                  <Text style={styles.calendarFieldLabel}>START TIME</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                          blockMode === value && styles.calendarChoiceActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarChoiceText,
                            blockMode === value &&
                              styles.calendarChoiceTextActive,
                          ]}
                        >
                          {value === "blocked" ? "Unavailable" : "Maintenance"}
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
                      {busyAction === "block" ? "Blocking…" : "Block this time"}
                    </Text>
                  </Pressable>
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
                            selectedEntry.attendees.map((attendee) => (
                              <View
                                key={attendee.registrationId}
                                style={styles.calendarRosterRow}
                              >
                                <View style={styles.calendarRosterAvatar}>
                                  <Text style={styles.calendarRosterAvatarText}>
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
                                <Pressable
                                  disabled={
                                    busyAction === attendee.registrationId
                                  }
                                  onPress={() =>
                                    void perform(attendee.registrationId, () =>
                                      client!.operator.removeCalendarParticipant.mutate(
                                        {
                                          registrationId:
                                            attendee.registrationId,
                                          reason:
                                            "Removed from the session by an organization operator in Duna Pro.",
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
                      onPress={onScore}
                      style={styles.calendarSheetSecondary}
                    >
                      <Text style={styles.calendarSheetSecondaryText}>
                        Live score
                      </Text>
                    </Pressable>
                  )}
                <Pressable
                  onPress={() =>
                    void WebBrowser.openBrowserAsync(fullWorkspaceHref)
                  }
                  style={styles.calendarSheetPrimary}
                >
                  <Text style={styles.calendarSheetPrimaryText}>
                    Open full details
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

function PeopleScreen() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const { dashboard, members } = useProRuntime();
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
    if (filter === "Players") return person.roles.includes("player");
    if (filter === "Coaches") return person.roles.includes("coach");
    if (filter === "Guardians") return person.roles.includes("guardian");
    if (filter === "Minors") return Boolean(person.isMinor);
    return true;
  });
  const guardianCount = people.filter((person) =>
    person.roles.includes("guardian"),
  ).length;
  const minorCount = people.filter((person) => person.isMinor).length;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header
        context={`${dashboard?.organization.name ?? "PEOPLE"} · PEOPLE + HOUSEHOLDS`}
      />
      <PageTitle
        action="Add person"
        eyebrow="CRM + ELIGIBILITY"
        onAction={() =>
          void WebBrowser.openBrowserAsync(`${dunaHqUrl}/members`)
        }
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
          {["All", "Players", "Coaches", "Guardians", "Minors"].map((item) => (
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
        {filteredPeople.map((person) => (
          <Pressable key={person.id} style={styles.personRow}>
            <View style={styles.personAvatar}>
              <Text style={styles.personAvatarText}>{person.initials}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{person.displayName}</Text>
              <Text style={styles.metaText}>
                @{person.handle} · {person.roles.join(" + ")}
              </Text>
            </View>
            <Pill tone={person.isMinor ? "warning" : "positive"}>
              {person.isMinor
                ? "Minor"
                : person.roles.includes("guardian")
                  ? "Guardian"
                  : "Active"}
            </Pill>
            <View style={styles.personRating}>
              <Text style={styles.ratingNumber}>
                {person.rating.display.toFixed(2)}
              </Text>
              <Text style={styles.metaText}>{person.rating.confidence}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
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
          <Text style={styles.scorerExitMeta}>Back to Today</Text>
        </View>
      </Pressable>
      <Header context="AUTHORIZED MATCH SCORING" />
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
              Schedule teams into a match in Duna HQ, then return here to begin
              live scoring.
            </Text>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(`${dunaHqUrl}/leagues`)
              }
            >
              <Text style={styles.linkText}>Open matches in HQ →</Text>
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

function ScorerScreen({ onExit }: { readonly onExit: () => void }) {
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

function MoreScreen({ onCalendar }: { readonly onCalendar: () => void }) {
  const { dashboard, mode, signOut, workspace } = useProRuntime();
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
  const routes: Readonly<Record<string, string>> = {
    Calendar: "calendar",
    "Products + services": "products",
    "Events + leagues": "leagues",
    Messages: "messages",
    Reports: "reports",
    "Money + tax": "money",
    "Memberships + credits": "products",
    "Retail + inventory": "inventory",
    "Coach payroll support": "money",
    "Venues + courts": "facilities",
    "Team + roles": "members",
    "Policies + waivers": "members",
    Integrations: "settings",
    "Billing + plan": "settings",
    "Account + privacy": "account",
    "Delete my account": "account",
  };
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header context={organization.name.toUpperCase()} />
      <PageTitle eyebrow="EVERYTHING ELSE" title="More." />
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
                disabled={mode === "preview" && item !== "Calendar"}
                key={item}
                onPress={() => {
                  if (item === "Calendar") {
                    onCalendar();
                    return;
                  }
                  void WebBrowser.openBrowserAsync(
                    `${dunaHqUrl}/${routes[item] ?? "dashboard"}`,
                  );
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
        <Mark />
        <Text style={styles.metaText}>
          Duna Pro keeps core workflows available in the field. Drafts and score
          events persist on-device, then sync when a connection returns.
        </Text>
        <Pill tone="positive">Offline ready</Pill>
      </View>
      {signOut && (
        <Pressable onPress={() => void signOut()} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out of Duna Pro</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function TabBar({
  active,
  onChange,
}: {
  readonly active: Tab;
  readonly onChange: (tab: Tab) => void;
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.key }}
          key={tab.key}
          onPress={() => {
            selectionHaptic();
            onChange(tab.key);
          }}
          style={[styles.tabItem, tab.key === "score" && styles.scoreTab]}
        >
          <Text
            style={[
              styles.tabIcon,
              active === tab.key && styles.tabActive,
              tab.key === "score" && styles.scoreTabIcon,
            ]}
          >
            {tab.icon}
          </Text>
          <Text
            style={[
              styles.tabLabel,
              active === tab.key && styles.tabActive,
              tab.key === "score" && styles.scoreTabLabel,
            ]}
          >
            {tab.label}
          </Text>
          {active === tab.key && tab.key !== "score" && (
            <View style={styles.tabIndicator} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

function ProApp() {
  const [tab, setTab] = useState<Tab>("today");
  const [calendarEntryId, setCalendarEntryId] = useState<string>();
  const [theme, setTheme] = useState<ThemeName>("light");
  const screenTransition = useRef(new Animated.Value(1)).current;

  const openCalendar = (entryId?: string) => {
    setCalendarEntryId(entryId);
    setTab("calendar");
  };

  const changeTab = (nextTab: Tab) => {
    if (nextTab === "calendar") setCalendarEntryId(undefined);
    setTab(nextTab);
  };

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
          {tab !== "score" && <PreviewBanner />}
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
            {tab === "today" && <TodayScreen onCalendar={openCalendar} />}
            {tab === "calendar" && (
              <CalendarScreen
                focusEntryId={calendarEntryId}
                onScore={() => setTab("score")}
              />
            )}
            {tab === "people" && <PeopleScreen />}
            {tab === "score" && <ScorerScreen onExit={() => setTab("today")} />}
            {tab === "more" && <MoreScreen onCalendar={() => openCalendar()} />}
          </Animated.View>
          {tab !== "score" && <TabBar active={tab} onChange={changeTab} />}
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
      <ProRuntimeProvider>
        <ProApp />
      </ProRuntimeProvider>
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.8,
      textAlign: "center",
    },
    scorerError: {
      backgroundColor: rgba(colors.dangerRgb, 0.12),
      color: colors.danger,
      fontSize: 10,
      lineHeight: 11,
      paddingHorizontal: 10,
      paddingVertical: 6,
      textAlign: "center",
    },
    signOutButton: {
      alignItems: "center",
      borderColor: rgba(colors.dangerRgb, 0.2),
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 18,
      padding: 13,
    },
    signOutText: { color: colors.danger, fontSize: 10, fontWeight: "800" },
    content: { paddingBottom: 116, paddingHorizontal: 18 },
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
    calendarToolbarActions: { flexDirection: "row", gap: 8 },
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
      fontSize: 11,
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
      fontSize: 11,
      fontWeight: "900",
    },
    calendarTimezone: {
      color: colors.muted,
      fontSize: 10,
      maxWidth: 130,
      textAlign: "right",
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
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    calendarDayNumber: {
      color: colors.bone,
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 27,
      marginTop: 2,
    },
    calendarDayMonth: {
      color: colors.muted,
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "700",
    },
    calendarFilterTextActive: { color: colors.aqua },
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
      fontSize: 11,
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
      fontSize: 11,
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
      fontSize: 11,
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    calendarAgendaWeather: {
      color: colors.aqua,
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "900",
    },
    calendarAvatarMore: {
      color: colors.muted,
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "700",
      lineHeight: 15,
    },
    calendarFieldLabel: {
      color: colors.muted,
      fontSize: 10,
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
      fontSize: 11,
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
      fontSize: 10,
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
      fontSize: 11,
      lineHeight: 17,
      marginTop: 10,
      minHeight: 86,
      padding: 12,
      textAlignVertical: "top",
    },
    calendarTimezoneNote: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 12,
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
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    calendarSheetSummaryValue: {
      color: colors.bone,
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "900",
    },
    calendarRosterName: {
      color: colors.bone,
      fontSize: 11,
      fontWeight: "800",
    },
    calendarRosterMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 2,
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "900",
    },
    calendarPersonOptionName: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 7,
      maxWidth: 94,
    },
    calendarPersonOptionAdd: {
      color: colors.aqua,
      fontSize: 10,
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
      fontSize: 11,
      fontWeight: "900",
    },
    calendarEquipmentOptionMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 5,
    },
    calendarEquipmentOptionAction: {
      color: colors.aqua,
      fontSize: 10,
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
      fontSize: 11,
      fontWeight: "900",
    },
    calendarConnectedUpdateBody: {
      color: colors.muted,
      fontSize: 10,
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
      fontSize: 11,
      fontWeight: "900",
    },
    calendarSheetFooter: {
      backgroundColor: colors.canvas,
      borderTopColor: rgba(colors.overlayRgb, 0.08),
      borderTopWidth: 1,
      flexDirection: "row",
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
      fontSize: 11,
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
      fontSize: 11,
      fontWeight: "900",
    },
    wordmark: { alignItems: "center", flexDirection: "row", gap: 7 },
    mark: {
      alignItems: "center",
      borderColor: colors.warning,
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
      backgroundColor: colors.aqua,
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
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
      overflow: "hidden",
      paddingHorizontal: 5,
      paddingVertical: 3,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 22,
      paddingTop: 10,
    },
    headerContext: {
      color: colors.muted,
      fontSize: 10,
      letterSpacing: 1,
      marginTop: 5,
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
    themeButtonText: {
      color: colors.bone,
      fontSize: 17,
      lineHeight: 20,
    },
    aiButton: {
      alignItems: "center",
      backgroundColor: rgba(colors.warningRgb, 0.08),
      borderColor: rgba(colors.warningRgb, 0.18),
      borderRadius: 19,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    aiButtonText: { color: colors.warning, fontSize: 16 },
    profileButton: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      position: "relative",
      width: 38,
    },
    profileText: { color: colors.bone, fontSize: 10, fontWeight: "900" },
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
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "900",
    },
    subhead: { color: colors.muted, fontSize: 10, marginTop: 8 },
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
      fontSize: 10,
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
      fontSize: 10,
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
      fontSize: 10,
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
    metricLabel: { color: colors.muted, fontSize: 10, letterSpacing: 0.8 },
    metricValue: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 12,
    },
    positiveText: {
      color: colors.positive,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 5,
    },
    metaText: { color: colors.muted, fontSize: 10, marginTop: 3 },
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
      fontSize: 10,
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
    linkText: { color: colors.warning, fontSize: 10, fontWeight: "700" },
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
    timeMain: { color: colors.bone, fontSize: 10, fontWeight: "700" },
    timeSuffix: { color: colors.muted, fontSize: 10 },
    scheduleWeather: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 4,
    },
    statusLine: { borderRadius: 2, height: 35, width: 3 },
    rowTitle: { color: colors.bone, fontSize: 10, fontWeight: "700" },
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
      fontSize: 10,
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
    searchInput: { color: colors.bone, flex: 1, fontSize: 10, height: 44 },
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
    filterText: { color: colors.muted, fontSize: 10 },
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
    personAvatarText: { color: colors.bone, fontSize: 10, fontWeight: "900" },
    personRating: { alignItems: "flex-end", minWidth: 30 },
    ratingNumber: { color: colors.bone, fontSize: 10, fontWeight: "800" },
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
    scorerExitMeta: { color: colors.muted, fontSize: 10, marginTop: 1 },
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
    syncIcon: { color: colors.positive, fontSize: 11 },
    syncText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
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
    segmentText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
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
      fontSize: 11,
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
    scoreAvatarText: { color: colors.bone, fontSize: 10, fontWeight: "900" },
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
      fontSize: 11,
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
    versusText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
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
    syncSummaryText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
    sets: { flexDirection: "row", gap: 4 },
    setBox: {
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderRadius: 9,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    setBoxActive: { backgroundColor: rgba(colors.accentRgb, 0.09) },
    setLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
    setScore: {
      color: colors.bone,
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
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
    },
    balanceLabel: {
      color: colors.muted,
      fontSize: 10,
      letterSpacing: 1,
      marginTop: 34,
    },
    balanceValue: {
      color: colors.bone,
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
      fontSize: 10,
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
    transactionAmount: { color: colors.bone, fontSize: 10, fontWeight: "800" },
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
    orgAvatarText: { color: colors.onAccent, fontSize: 11, fontWeight: "900" },
    orgName: { color: colors.bone, fontSize: 12, fontWeight: "800" },
    menuEyebrow: {
      color: colors.warning,
      fontSize: 10,
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
      fontSize: 10,
      fontWeight: "900",
      height: 30,
      lineHeight: 30,
      textAlign: "center",
      width: 30,
    },
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
    tabIcon: { color: colors.muted, fontSize: 17 },
    tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
    tabActive: { color: colors.warning },
    tabIndicator: {
      backgroundColor: colors.warning,
      borderRadius: 2,
      height: 2,
      position: "absolute",
      top: -9,
      width: 20,
    },
    scoreTab: {
      backgroundColor: colors.warning,
      borderRadius: 25,
      height: 50,
      marginTop: -18,
      maxWidth: 50,
      paddingTop: 5,
    },
    scoreTabIcon: { color: colors.onAccent, fontSize: 22, lineHeight: 23 },
    scoreTabLabel: { color: colors.onAccent, fontWeight: "800" },
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
