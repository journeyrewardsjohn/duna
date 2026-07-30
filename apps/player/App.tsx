import { formatMoney, formatVenueTime } from "@duna/core";
import {
  demoBookings,
  demoEvents,
  demoMatches,
  demoPeople,
  demoPlayer,
  demoWalletEntries,
} from "@duna/core/demo";
import * as Crypto from "expo-crypto";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
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
import { dunaWebUrl } from "./mobile-api";
import { PlayerRuntimeProvider, usePlayerRuntime } from "./runtime";

const colors = {
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
} as const;

type Tab = "home" | "discover" | "play" | "wallet" | "you";

const tabs: readonly {
  key: Tab;
  label: string;
  icon: string;
}[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "discover", label: "Discover", icon: "⌖" },
  { key: "play", label: "Play", icon: "◫" },
  { key: "wallet", label: "Wallet", icon: "$" },
  { key: "you", label: "You", icon: "◎" },
];

function displayError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : "Duna could not complete that request.";
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
      backgroundColor: "rgba(255,255,255,.06)",
      borderColor: "rgba(255,255,255,.1)",
    },
    positive: {
      backgroundColor: "rgba(133,212,155,.1)",
      borderColor: "rgba(133,212,155,.25)",
    },
    live: {
      backgroundColor: "rgba(255,106,61,.1)",
      borderColor: "rgba(255,106,61,.3)",
    },
    warning: {
      backgroundColor: "rgba(247,200,107,.1)",
      borderColor: "rgba(247,200,107,.25)",
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

function HomeScreen({
  onBook,
}: {
  readonly onBook: (eventIndex: number) => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  const { dashboard, people: livePeople } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const bookings = dashboard?.bookings ?? demoBookings;
  const events = dashboard?.events ?? demoEvents;
  const matches = dashboard?.recentMatches ?? demoMatches;
  const people = livePeople ?? demoPeople;
  const nextBooking = bookings[0];
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
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow={today.replace(", ", " · ")} />
      <View
        style={[styles.homeGreeting, compact && styles.homeGreetingCompact]}
      >
        <Text
          style={[styles.displayTitle, compact && styles.displayTitleCompact]}
        >
          Good morning,{`\n`}
          {player.displayName.split(" ")[0]}.
        </Text>
        <Pressable
          onPress={() =>
            void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/score`)
          }
          style={styles.scoreAction}
        >
          <Text style={styles.scoreActionText}>＋ Score match</Text>
        </Pressable>
      </View>
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
              ? `${new Date(nextBooking.startsAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })} · ${nextBooking.venueName}`
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
        eyebrow="MADE FOR YOUR LEVEL"
        title="Play next."
        action="See all"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalBleed}
      >
        {events.slice(0, 4).map((event, index) => (
          <EventCard eventIndex={index} key={event.id} onPress={onBook} />
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
                {match.teamB[1]?.displayName.split(" ")[0]} · {match.venueName}
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
  const accents = [colors.aquaDeep, "#745f3a", colors.navyLift, "#6b392f"];
  return (
    <Pressable onPress={() => onPress(eventIndex)} style={styles.eventCard}>
      <View
        style={[
          styles.eventArt,
          { backgroundColor: accents[eventIndex % accents.length] },
        ]}
      >
        <View style={styles.courtLine} />
        <View style={styles.eventBadges}>
          <Pill tone={event.live ? "live" : "neutral"}>
            {event.live ? "Live" : event.kind}
          </Pill>
        </View>
        <Text style={styles.eventArrow}>↗</Text>
      </View>
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

function DiscoverScreen({
  onBook,
}: {
  readonly onBook: (eventIndex: number) => void;
}) {
  const [filter, setFilter] = useState("For you");
  const [search, setSearch] = useState("");
  const { dashboard, venues } = usePlayerRuntime();
  const events = dashboard?.events ?? demoEvents;
  const filteredEvents = events.filter((event) => {
    const query = search.trim().toLowerCase();
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
  });
  const resultCount = filteredEvents.length;
  return (
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
        eyebrow={`${filter.toUpperCase()} · ${resultCount} RESULTS`}
        title="Around you."
        action="Map"
      />
      <View style={styles.eventGrid}>
        {filteredEvents.map((event) => {
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
      </View>
    </ScrollView>
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
          <Text style={styles.bodyText}>Still processing in Stripe</Text>
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
                      ? "rgba(133,212,155,.1)"
                      : "rgba(255,255,255,.06)",
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

function ProfileScreen() {
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
            <Text style={styles.profileName}>{player.displayName}</Text>
            <Text style={styles.profileHandle}>
              @{player.handle} · {player.homeMarket}
            </Text>
          </View>
        </View>
        <RatingOrbit compact />
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
      <View style={styles.profileMenu}>
        {[
          "Edit profile",
          "Household + guardians",
          "Notifications",
          "Privacy + safety",
          "Language + units",
          "Manage Duna+",
        ].map((item) => (
          <Pressable
            disabled={mode === "preview"}
            key={item}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${dunaWebUrl}/app/settings`)
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
  const { client, dashboard, mode, refresh, settings } = usePlayerRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState<{
    readonly title: string;
    readonly body: string;
    readonly label: string;
  }>();
  const [divisionId, setDivisionId] = useState<string>();
  const events = dashboard?.events ?? demoEvents;
  const player = dashboard?.player ?? demoPlayer;
  const event = eventIndex === null ? null : events[eventIndex];
  if (!event) return null;
  const selectedEvent = event;
  const division =
    event.divisions?.find((candidate) => candidate.id === divisionId) ??
    event.divisions?.[0];
  const listedPrice = division?.price ?? event.price;

  function close() {
    setError(undefined);
    setComplete(undefined);
    setDivisionId(undefined);
    setBusy(false);
    onClose();
  }

  async function checkout() {
    if (!client || mode === "preview") return;
    setBusy(true);
    setError(undefined);
    try {
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
                body: "Duna will confirm the booking after Stripe reports a successful payment.",
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
              <Text style={styles.rowMeta}>Stripe</Text>
            </View>
            <View style={styles.checkoutArt}>
              <View style={styles.courtLine} />
              <Pill>{event.kind}</Pill>
            </View>
            <Text style={styles.checkoutTitle}>{event.title}</Text>
            <Text style={styles.checkoutMeta}>
              {event.venueName} ·{" "}
              {formatVenueTime(event.startsAt, event.timezone)}
            </Text>
            {event.divisions && event.divisions.length > 0 && (
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
                          division?.id === option.id && styles.filterTextActive,
                        ]}
                      >
                        {option.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
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
            <View style={styles.checkoutSection}>
              <Text style={styles.eyebrow}>PAYMENT</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentIcon}>◇</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    {listedPrice.amountMinor
                      ? "Stripe secure checkout"
                      : "Free registration"}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {listedPrice.amountMinor
                      ? "Card details go directly to Stripe. Duna never stores them."
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
                    ? "Preparing secure checkout…"
                    : listedPrice.amountMinor
                      ? "Continue to Stripe"
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
  const { client, mode, refresh } = usePlayerRuntime();
  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [startsAt, setStartsAt] = useState(defaultPickupStart);
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [capacity, setCapacity] = useState("8");
  const [format, setFormat] = useState<"2s" | "4s" | "6s" | "king-queen">("4s");
  const [cost, setCost] = useState("0");
  const [note, setNote] = useState("");
  const [recordMatches, setRecordMatches] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function publish() {
    if (!client || mode === "preview") return;
    const start = new Date(startsAt);
    const duration = Number(durationMinutes);
    const playerCapacity = Number(capacity);
    const dollars = Number(cost);
    if (!Number.isFinite(start.getTime())) {
      setError("Enter the start as YYYY-MM-DDTHH:MM.");
      return;
    }
    if (!Number.isInteger(duration) || duration < 30 || duration > 480) {
      setError("Duration must be between 30 and 480 minutes.");
      return;
    }
    if (!Number.isInteger(playerCapacity) || playerCapacity < 4) {
      setError("Capacity must be at least four players.");
      return;
    }
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000) {
      setError("Enter a valid price from $0 to $1,000.");
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
        capacity: playerCapacity,
        format,
        note: note.trim() || undefined,
        visibility: "public",
        costMinor: Math.round(dollars * 100),
        currency: "USD",
        recordMatches,
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
            Duna publishes exactly what you enter and checks your adult identity
            before the event goes live.
          </Text>
          <View style={styles.formStack}>
            <TextInput
              onChangeText={setTitle}
              placeholder="Pickup title"
              placeholderTextColor={colors.muted}
              style={styles.formInput}
              value={title}
            />
            <TextInput
              onChangeText={setVenueName}
              placeholder="Venue or court"
              placeholderTextColor={colors.muted}
              style={styles.formInput}
              value={venueName}
            />
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
              {(["2s", "4s", "6s", "king-queen"] as const).map((option) => (
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
              ))}
            </View>
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
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.key }}
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={styles.tabItem}
        >
          <Text
            style={[styles.tabIcon, active === tab.key && styles.tabActive]}
          >
            {tab.icon}
          </Text>
          <Text
            style={[styles.tabLabel, active === tab.key && styles.tabActive]}
          >
            {tab.label}
          </Text>
          {active === tab.key && <View style={styles.tabIndicator} />}
        </Pressable>
      ))}
    </View>
  );
}

function DunaApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [eventIndex, setEventIndex] = useState<number | null>(null);
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.app}>
        <PreviewBanner />
        {tab === "home" && <HomeScreen onBook={setEventIndex} />}
        {tab === "discover" && <DiscoverScreen onBook={setEventIndex} />}
        {tab === "play" && <PlayScreen />}
        {tab === "wallet" && <WalletScreen />}
        {tab === "you" && <ProfileScreen />}
        <TabBar active={tab} onChange={setTab} />
        <BookingModal
          eventIndex={eventIndex}
          onClose={() => setEventIndex(null)}
        />
      </View>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.ink, flex: 1 },
  app: { backgroundColor: colors.ink, flex: 1 },
  buttonDisabled: { opacity: 0.45 },
  flex: { flex: 1, minWidth: 0 },
  formError: {
    color: colors.danger,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  formInput: {
    backgroundColor: "rgba(255,255,255,.04)",
    borderColor: "rgba(255,255,255,.1)",
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
  previewBanner: {
    alignItems: "center",
    backgroundColor: "rgba(247,200,107,.12)",
    borderBottomColor: "rgba(247,200,107,.24)",
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
    backgroundColor: "rgba(255,255,255,.03)",
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
    backgroundColor: "rgba(247,200,107,.12)",
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
    backgroundColor: "rgba(99,227,219,.09)",
    borderColor: "rgba(99,227,219,.18)",
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
  scoreActionText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  heroGrid: { gap: 10 },
  ratingCard: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
  },
  nextCard: {
    backgroundColor: colors.navy,
    borderColor: "rgba(255,255,255,.07)",
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
    borderColor: "rgba(99,227,219,.18)",
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
    color: colors.ink,
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  ratingStats: {
    borderTopColor: "rgba(255,255,255,.07)",
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
    borderTopColor: "rgba(255,255,255,.07)",
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  cardLinkText: { color: colors.aqua, fontSize: 10, fontWeight: "700" },
  metricStrip: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
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
    borderColor: "rgba(255,255,255,.07)",
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
  courtLine: {
    borderColor: "rgba(255,255,255,.28)",
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
    color: colors.bone,
    fontSize: 16,
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
  eventFooter: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,.06)",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 11,
    paddingTop: 9,
  },
  eventPrice: { color: colors.bone, fontSize: 10, fontWeight: "800" },
  eventSpots: { color: colors.muted, fontSize: 8 },
  listCard: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 17,
    borderWidth: 1,
    overflow: "hidden",
  },
  matchRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.06)",
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
  resultText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  rowTitle: { color: colors.bone, fontSize: 11, fontWeight: "700" },
  rowMeta: { color: colors.muted, fontSize: 8, marginTop: 3 },
  matchScore: { alignItems: "flex-end" },
  aiInsight: {
    backgroundColor: colors.navy,
    borderColor: "rgba(99,227,219,.13)",
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
  aiIconText: { color: colors.ink, fontSize: 17 },
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
    borderColor: "rgba(255,255,255,.08)",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 14,
  },
  searchIcon: { color: colors.muted, fontSize: 20 },
  searchInput: { color: colors.bone, flex: 1, fontSize: 11, height: 46 },
  filterRow: { flexDirection: "row", gap: 7, marginTop: 14, paddingRight: 36 },
  filterChip: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.08)",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: { backgroundColor: colors.aqua, borderColor: colors.aqua },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  filterTextActive: { color: colors.ink, fontWeight: "800" },
  mapCard: {
    backgroundColor: colors.navy,
    borderColor: "rgba(255,255,255,.07)",
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
  mapPinText: { color: colors.ink, fontSize: 8, fontWeight: "900" },
  mapLabel: {
    backgroundColor: "rgba(7,11,13,.82)",
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
    backgroundColor: "rgba(133,212,155,.08)",
    borderColor: "rgba(133,212,155,.2)",
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
    borderColor: "rgba(255,255,255,.07)",
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
  weekDayTextActive: { color: colors.ink },
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
    borderTopColor: "rgba(255,255,255,.06)",
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
    borderBottomColor: "rgba(255,255,255,.06)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    padding: 11,
  },
  pickupDate: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,.05)",
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
    borderColor: "rgba(99,227,219,.14)",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 28,
    padding: 22,
    textAlign: "center",
  },
  hostMark: {
    alignItems: "center",
    backgroundColor: "rgba(99,227,219,.1)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginBottom: 12,
    width: 44,
  },
  hostMarkText: { color: colors.aqua, fontSize: 22 },
  bodyText: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
  primaryButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.aqua,
    borderRadius: 22,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  walletCard: {
    backgroundColor: colors.navy,
    borderColor: "rgba(99,227,219,.18)",
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
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 18,
    color: colors.bone,
    fontSize: 9,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  walletWave: {
    borderColor: "rgba(99,227,219,.12)",
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
    borderBottomColor: "rgba(255,255,255,.06)",
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
    backgroundColor: "rgba(99,227,219,.05)",
    borderColor: "rgba(99,227,219,.13)",
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
    borderColor: "rgba(255,255,255,.07)",
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
  profileAvatarText: { color: colors.bone, fontSize: 20, fontWeight: "900" },
  profileName: {
    color: colors.bone,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 7,
  },
  profileHandle: { color: colors.muted, fontSize: 8, marginTop: 2 },
  progressCard: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  mobileChart: {
    backgroundColor: "rgba(255,255,255,.02)",
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
    backgroundColor: "rgba(99,227,219,.14)",
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
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  chemistryPartner: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,.07)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
    paddingTop: 12,
  },
  achievementRow: { flexDirection: "row", gap: 9, paddingRight: 36 },
  achievementCard: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 15,
    borderWidth: 1,
    minHeight: 130,
    padding: 13,
    width: 155,
  },
  achievementIcon: { color: colors.aqua, fontSize: 22, marginBottom: 20 },
  profileMenu: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 25,
    overflow: "hidden",
  },
  profileMenuRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.06)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  tabBar: {
    backgroundColor: "rgba(12,20,24,.98)",
    borderTopColor: "rgba(255,255,255,.08)",
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
  modalSafe: { backgroundColor: colors.ink, flex: 1 },
  modalContent: { padding: 18, paddingBottom: 45 },
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
  checkoutTitle: {
    color: colors.bone,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -1.4,
    marginTop: 18,
  },
  checkoutMeta: { color: colors.muted, fontSize: 9, marginTop: 5 },
  checkoutSection: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 13,
  },
  checkoutPlayer: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: 11,
    flexDirection: "row",
    gap: 9,
    marginTop: 10,
    padding: 9,
  },
  checkText: { color: colors.positive, fontSize: 15 },
  paymentRow: {
    alignItems: "center",
    backgroundColor: "rgba(99,227,219,.05)",
    borderColor: "rgba(99,227,219,.16)",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    marginTop: 9,
    padding: 10,
  },
  paymentIcon: { color: colors.aqua, fontSize: 17 },
  orderMath: {
    borderBottomColor: "rgba(255,255,255,.08)",
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,.08)",
    borderTopWidth: 1,
    marginTop: 20,
    paddingVertical: 10,
  },
  totalRow: {
    borderTopColor: "rgba(255,255,255,.08)",
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
  payButtonText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
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
    backgroundColor: "rgba(133,212,155,.1)",
    borderColor: "rgba(133,212,155,.25)",
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
