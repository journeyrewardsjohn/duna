import { formatMoney } from "@duna/core";
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
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
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
import { dunaHqUrl } from "./mobile-api";
import {
  ProRuntimeProvider,
  useProRuntime,
  type OperatorMatchScoringState,
  type OperatorMatches,
} from "./runtime";

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
      onPress={toggle}
      style={styles.themeButton}
    >
      <Text style={styles.themeButtonText}>
        {theme === "light" ? "☾" : "☀"}
      </Text>
    </Pressable>
  );
}

type Tab = "today" | "people" | "score" | "money" | "more";

const tabs: readonly { key: Tab; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "⌂" },
  { key: "people", label: "People", icon: "◎" },
  { key: "score", label: "Score", icon: "＋" },
  { key: "money", label: "Money", icon: "$" },
  { key: "more", label: "More", icon: "•••" },
];

function displayError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : "Duna Pro could not complete that request.";
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

function TodayScreen({ onScore }: { readonly onScore: () => void }) {
  const { dashboard, mode } = useProRuntime();
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
      />
      <View style={styles.scheduleCard}>
        {scheduleItems.map((item, index) => (
          <Pressable
            key={`${item.time}-${item.title}`}
            onPress={onScore}
            style={styles.scheduleRow}
          >
            <View style={styles.timeBlock}>
              <Text style={styles.timeMain}>{item.time}</Text>
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
        ))}
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
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly action?: string;
}) {
  return (
    <View style={styles.sectionTitle}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionHeading}>{title}</Text>
      </View>
      {action && (
        <Pressable>
          <Text style={styles.linkText}>{action} →</Text>
        </Pressable>
      )}
    </View>
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
  onOpen,
}: {
  readonly matches: OperatorMatches;
  readonly deviceId?: string;
  readonly busy: boolean;
  readonly error?: string;
  readonly onOpen: (match: OperatorMatch) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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

function ScorerScreen() {
  const { client, matches = [], mode } = useProRuntime();
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
    loadDeviceId()
      .then(setDeviceId)
      .catch((reason) => {
        setError(displayError(reason));
      });
  }, []);

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
    void submitEvent({
      id: Crypto.randomUUID(),
      type: "rally-won",
      winner,
      occurredAt: new Date().toISOString(),
    });
  }

  function undo() {
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
        onOpen={(match) => void openMatch(match)}
      />
    );
  }

  return (
    <View style={styles.scorer}>
      <View style={styles.scorerTop}>
        <View>
          <Text style={styles.eyebrow}>
            {selectedMatch
              ? `${selectedMatch.teamA.name} · ${selectedMatch.teamB.name}`
              : "PREVIEW MATCH · EXHIBITION"}
          </Text>
          <Text style={styles.scorerVenue}>
            {serverState?.venueName ?? "Manhattan Beach · Court 4"}
          </Text>
        </View>
        <Pill tone={scoreComplete ? "positive" : "live"}>
          {scoreComplete
            ? "Complete"
            : mode === "preview"
              ? "Preview"
              : "Live scoring"}
        </Pill>
        <Pressable
          disabled={busy}
          onPress={() => void synchronize()}
          style={styles.syncButton}
        >
          <Text style={[styles.syncIcon, offline && { color: colors.warning }]}>
            {offline ? "◌" : "●"}
          </Text>
          <Text style={styles.syncText}>
            {mode === "preview"
              ? "Preview"
              : offline
                ? "On device"
                : busy
                  ? "Syncing"
                  : "Synced"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.scorerFormat}>
        <View style={styles.segmented}>
          <Pressable
            disabled={mode === "live"}
            onPress={() => setPreviewSystem("rally")}
            style={[
              styles.segmentButton,
              system === "rally" && styles.segmentActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                system === "rally" && styles.segmentTextActive,
              ]}
            >
              Rally
            </Text>
          </Pressable>
          <Pressable
            disabled={mode === "live"}
            onPress={() => setPreviewSystem("sideout")}
            style={[
              styles.segmentButton,
              system === "sideout" && styles.segmentActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                system === "sideout" && styles.segmentTextActive,
              ]}
            >
              Sideout
            </Text>
          </Pressable>
        </View>
        <Text style={styles.metaText}>
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
          <Text style={styles.metaText}>
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
            <Text style={styles.serveText}>
              {state.serving === "A" ? "SERVING" : "RECEIVING"}
            </Text>
          </View>
          <View style={styles.teamPeople}>
            <View style={styles.scoreAvatar}>
              <Text style={styles.scoreAvatarText}>
                {teamA?.people[0]?.initials ?? "ML"}
              </Text>
            </View>
            <View style={styles.scoreAvatar}>
              <Text style={styles.scoreAvatarText}>
                {teamA?.people[1]?.initials ?? "TP"}
              </Text>
            </View>
            <Text style={styles.teamName}>{teamA?.name ?? "Mara / Theo"}</Text>
          </View>
          <Text style={styles.bigScore}>{current.a}</Text>
          <Text style={styles.tapHint}>TAP ANYWHERE FOR POINT</Text>
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
            <Text style={styles.serveText}>
              {state.serving === "B" ? "SERVING" : "RECEIVING"}
            </Text>
          </View>
          <View style={styles.teamPeople}>
            <View style={styles.scoreAvatar}>
              <Text style={styles.scoreAvatarText}>
                {teamB?.people[0]?.initials ?? "NW"}
              </Text>
            </View>
            <View style={styles.scoreAvatar}>
              <Text style={styles.scoreAvatarText}>
                {teamB?.people[1]?.initials ?? "ET"}
              </Text>
            </View>
            <Text style={styles.teamName}>{teamB?.name ?? "Noa / Elena"}</Text>
          </View>
          <Text style={styles.bigScore}>{current.b}</Text>
          <Text style={styles.tapHint}>TAP ANYWHERE FOR POINT</Text>
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
          <View>
            <Text style={styles.rowTitle}>
              {mode === "preview"
                ? "Preview score only"
                : offline
                  ? "Saved on this device"
                  : busy
                    ? "Sending score event"
                    : "Server and device agree"}
            </Text>
            <Text style={styles.metaText}>
              {mode === "preview"
                ? "No live match or server record is changed"
                : offline
                  ? `${pending.length} events pending upload`
                  : `${Math.max(0, events.length - 1)} score events synced`}
            </Text>
          </View>
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

function MoneyScreen() {
  const { dashboard, mode, workspace } = useProRuntime();
  const stripeReady = Boolean(workspace?.organization.stripeChargesEnabled);
  const metrics = dashboard?.metrics.slice(0, 3) ?? [
    { label: "Gross · July", value: "$84,260", change: "+18.4%" },
    { label: "Refunds", value: "$2,184", change: "2.59% gross" },
    { label: "Net sales", value: "$78,132", change: "92.7% retained" },
  ];
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header context="STRIPE-CONNECTED MONEY" />
      <PageTitle
        action="Open HQ"
        eyebrow="SALES + PAYOUTS"
        onAction={() => void WebBrowser.openBrowserAsync(`${dunaHqUrl}/money`)}
        title="Money."
      />
      <View style={styles.balanceCard}>
        <View style={styles.cardTop}>
          <Pill tone={stripeReady ? "positive" : "warning"}>
            {stripeReady ? "Charges enabled" : "Stripe restricted"}
          </Pill>
          <Text style={styles.brandSmall}>DUNA PRO</Text>
        </View>
        <Text style={styles.balanceLabel}>PAYMENTS STATUS</Text>
        <Text style={styles.balanceValue}>
          {stripeReady ? "Ready" : "Action needed"}
        </Text>
        <Text style={styles.metaText}>
          {stripeReady
            ? "Connected charges are routed directly through the club’s Stripe account."
            : "Finish Stripe onboarding in HQ before publishing paid products."}
        </Text>
        <View style={styles.balanceActions}>
          <Pressable
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${dunaHqUrl}/money`)
            }
          >
            <Text style={styles.balanceAction}>Open money workspace ↗</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.moneyMetrics}>
        {metrics.map((metric) => (
          <View key={metric.label}>
            <Text style={styles.metricLabel}>{metric.label.toUpperCase()}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
            {metric.change && (
              <Text style={styles.metaText}>{metric.change}</Text>
            )}
          </View>
        ))}
      </View>
      <SectionTitle
        eyebrow="TODAY"
        title="Transactions"
        action="All activity"
      />
      {mode === "preview" ? (
        <View style={styles.transactions}>
          {[
            ["↓", "Mara Lewis", "Tournament registration", 9600, "Succeeded"],
            ["↓", "Theo Park", "Private coaching", 12000, "Succeeded"],
            ["↑", "Priya Lewis", "Weather refund", -4800, "Wallet credit"],
            ["↓", "Elena Torres", "Membership renewal", 15900, "Recovered"],
          ].map((item) => (
            <View
              style={styles.transactionRow}
              key={String(item[1]) + String(item[2])}
            >
              <View
                style={[
                  styles.transactionIcon,
                  (item[3] as number) < 0 && {
                    backgroundColor: rgba(colors.warningRgb, 0.08),
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      (item[3] as number) < 0
                        ? colors.warning
                        : colors.positive,
                  }}
                >
                  {item[0]}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{item[2]}</Text>
                <Text style={styles.metaText}>
                  {item[1]} · {item[4]}
                </Text>
              </View>
              <Text style={styles.transactionAmount}>
                {formatMoney(item[3] as number, "USD")}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.rowTitle}>Open the verified ledger in HQ.</Text>
          <Text style={styles.metaText}>
            Duna Pro does not infer balances or recent transactions when the
            connected ledger projection is unavailable on mobile.
          </Text>
        </View>
      )}
      <View style={styles.boundaryNote}>
        <Text style={styles.boundaryIcon}>◇</Text>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>
            {mode === "preview"
              ? "Preview reconciliation only."
              : "Stripe status is connected; balances remain source-owned."}
          </Text>
          <Text style={styles.metaText}>
            Funds remain in Stripe-managed accounts. Duna never custodies
            operator or player money.
          </Text>
        </View>
        <Pill tone={stripeReady ? "positive" : "warning"}>
          {stripeReady ? "Connected" : "Action needed"}
        </Pill>
      </View>
    </ScrollView>
  );
}

function MoreScreen() {
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
                disabled={mode === "preview"}
                key={item}
                onPress={() =>
                  void WebBrowser.openBrowserAsync(
                    `${dunaHqUrl}/${routes[item] ?? "dashboard"}`,
                  )
                }
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
          onPress={() => onChange(tab.key)}
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
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    void AsyncStorage.getItem("duna-theme").then((stored) => {
      if (stored === "dark") setTheme("dark");
    });
  }, []);

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
          {tab === "today" && <TodayScreen onScore={() => setTab("score")} />}
          {tab === "people" && <PeopleScreen />}
          {tab === "score" && <ScorerScreen />}
          {tab === "money" && <MoneyScreen />}
          {tab === "more" && <MoreScreen />}
          {tab !== "score" && <TabBar active={tab} onChange={setTab} />}
          {tab === "score" && (
            <Pressable onPress={() => setTab("today")} style={styles.exitScore}>
              <Text style={styles.exitScoreText}>‹ Exit</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

export default function App() {
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
      fontSize: 9,
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
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.8,
      textAlign: "center",
    },
    scorerError: {
      backgroundColor: rgba(colors.dangerRgb, 0.12),
      color: colors.danger,
      fontSize: 7,
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
    signOutText: { color: colors.danger, fontSize: 9, fontWeight: "800" },
    content: { paddingBottom: 116, paddingHorizontal: 18 },
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
      fontSize: 7,
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
      fontSize: 7,
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
    profileText: { color: colors.bone, fontSize: 9, fontWeight: "900" },
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
      fontSize: 7,
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
      fontSize: 9,
      fontWeight: "900",
    },
    subhead: { color: colors.muted, fontSize: 10, marginTop: 8 },
    subheadStrong: { color: colors.bone, fontWeight: "700" },
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
      fontSize: 9,
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
      fontSize: 9,
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
    metricLabel: { color: colors.muted, fontSize: 7, letterSpacing: 0.8 },
    metricValue: {
      color: colors.bone,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 12,
    },
    positiveText: {
      color: colors.positive,
      fontSize: 8,
      fontWeight: "700",
      marginTop: 5,
    },
    metaText: { color: colors.muted, fontSize: 7.5, marginTop: 3 },
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
      fontSize: 6,
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
    linkText: { color: colors.warning, fontSize: 8, fontWeight: "700" },
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
    timeMain: { color: colors.bone, fontSize: 9, fontWeight: "700" },
    timeSuffix: { color: colors.muted, fontSize: 6 },
    statusLine: { borderRadius: 2, height: 35, width: 3 },
    rowTitle: { color: colors.bone, fontSize: 9.5, fontWeight: "700" },
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
      fontSize: 8,
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
    filterText: { color: colors.muted, fontSize: 8 },
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
    personAvatarText: { color: colors.bone, fontSize: 8, fontWeight: "900" },
    personRating: { alignItems: "flex-end", minWidth: 30 },
    ratingNumber: { color: colors.bone, fontSize: 9, fontWeight: "800" },
    scorer: { backgroundColor: colors.canvas, flex: 1 },
    scorerTop: {
      alignItems: "center",
      borderBottomColor: rgba(colors.overlayRgb, 0.07),
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      padding: 10,
    },
    scorerVenue: {
      color: colors.bone,
      fontSize: 9,
      fontWeight: "700",
      marginTop: 3,
    },
    syncButton: {
      alignItems: "center",
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderRadius: 16,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    syncIcon: { color: colors.positive, fontSize: 8 },
    syncText: { color: colors.muted, fontSize: 6 },
    scorerFormat: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 8,
    },
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
    segmentActive: { backgroundColor: colors.aqua },
    segmentText: { color: colors.muted, fontSize: 7, fontWeight: "700" },
    segmentTextActive: { color: colors.onAccent },
    scoreNotice: {
      alignItems: "center",
      backgroundColor: colors.warning,
      flexDirection: "row",
      gap: 8,
      padding: 7,
    },
    scoreNoticeIcon: { color: colors.onAccent, fontSize: 14 },
    scoreNoticeTitle: {
      color: colors.onAccent,
      fontSize: 8,
      fontWeight: "900",
    },
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
      top: 12,
    },
    serveDot: {
      backgroundColor: colors.aqua,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    serveText: { color: colors.muted, fontSize: 6, letterSpacing: 0.7 },
    teamPeople: { alignItems: "center", flexDirection: "row" },
    scoreAvatar: {
      alignItems: "center",
      backgroundColor: colors.navyLift,
      borderColor: colors.depth,
      borderRadius: 13,
      borderWidth: 2,
      height: 26,
      justifyContent: "center",
      marginLeft: -4,
      width: 26,
    },
    scoreAvatarText: { color: colors.bone, fontSize: 6, fontWeight: "900" },
    teamName: {
      color: colors.bone,
      fontSize: 10,
      fontWeight: "800",
      marginLeft: 6,
    },
    bigScore: {
      color: colors.bone,
      fontSize: 124,
      fontWeight: "900",
      letterSpacing: -10,
      lineHeight: 130,
      marginVertical: 4,
    },
    tapHint: { color: colors.muted, fontSize: 5.5, letterSpacing: 0.6 },
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
    versusText: { color: colors.muted, fontSize: 6, fontWeight: "800" },
    scorerBottom: {
      alignItems: "center",
      borderTopColor: rgba(colors.overlayRgb, 0.07),
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      padding: 8,
    },
    secondaryAction: {
      backgroundColor: rgba(colors.overlayRgb, 0.05),
      borderColor: rgba(colors.overlayRgb, 0.08),
      borderRadius: 17,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    secondaryActionText: { color: colors.bone, fontSize: 7, fontWeight: "700" },
    syncSummary: { alignItems: "center", flexDirection: "row", gap: 6 },
    sets: { flexDirection: "row", gap: 4 },
    setBox: {
      backgroundColor: rgba(colors.overlayRgb, 0.04),
      borderRadius: 7,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    setBoxActive: { backgroundColor: rgba(colors.accentRgb, 0.09) },
    setLabel: { color: colors.muted, fontSize: 5 },
    setScore: {
      color: colors.bone,
      fontSize: 8,
      fontWeight: "800",
      marginTop: 2,
    },
    moreScore: { padding: 6 },
    moreScoreText: { color: colors.muted },
    exitScore: { left: 9, position: "absolute", top: 12, zIndex: 8 },
    exitScoreText: { color: colors.aqua, fontSize: 8, fontWeight: "700" },
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
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 1.3,
    },
    balanceLabel: {
      color: colors.muted,
      fontSize: 7,
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
      fontSize: 7.5,
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
    transactionAmount: { color: colors.bone, fontSize: 9, fontWeight: "800" },
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
      fontSize: 7,
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
      fontSize: 8,
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
    tabLabel: { color: colors.muted, fontSize: 7, fontWeight: "600" },
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
