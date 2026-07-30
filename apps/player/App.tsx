import { formatMoney, formatVenueTime } from "@duna/core";
import {
  demoBookings,
  demoEvents,
  demoMatches,
  demoPeople,
  demoPlayer,
  demoWalletEntries,
} from "@duna/core/demo";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

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
          {demoPlayer.rating.display.toFixed(2)}
        </Text>
        <Text style={styles.ratingDelta}>
          ↗ +{(demoPlayer.rating.delta ?? 0).toFixed(2)}
        </Text>
      </View>
      <View style={styles.lockedLabel}>
        <Text style={styles.lockedText}>LOCKED</Text>
      </View>
    </View>
  );
}

function AppHeader({ eyebrow }: { readonly eyebrow?: string }) {
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
          <Text style={styles.avatarText}>ML</Text>
          <View style={styles.notificationDot} />
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
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="THURSDAY · JULY 30" />
      <View style={styles.homeGreeting}>
        <Text style={styles.displayTitle}>Good morning,{`\n`}Mara.</Text>
        <Pressable style={styles.scoreAction}>
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
            <Pill tone="positive">Reliable</Pill>
          </View>
          <RatingOrbit />
          <View style={styles.ratingStats}>
            <View>
              <Text style={styles.statValue}>#42</Text>
              <Text style={styles.statLabel}>South Bay</Text>
            </View>
            <View>
              <Text style={styles.statValue}>91%</Text>
              <Text style={styles.statLabel}>Percentile</Text>
            </View>
            <View>
              <Text style={styles.statValue}>84</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
          </View>
        </View>
        <View style={styles.nextCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.eyebrow}>NEXT UP</Text>
            <Pill>Confirmed</Pill>
          </View>
          <Text style={styles.nextDate}>FRI</Text>
          <Text style={styles.nextDay}>31</Text>
          <Text style={styles.nextTitle}>Golden Hour 4s</Text>
          <Text style={styles.nextMeta}>6:00 PM · Hermosa Pier</Text>
          <View style={styles.avatarStack}>
            {demoPeople.slice(0, 4).map((person) => (
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
        <View>
          <Text style={styles.metricNumber}>61%</Text>
          <Text style={styles.metricLabel}>Win rate</Text>
        </View>
        <View>
          <Text style={styles.metricNumber}>8–2</Text>
          <Text style={styles.metricLabel}>Last 10</Text>
        </View>
        <View>
          <Text style={styles.metricNumber}>+0.14</Text>
          <Text style={styles.metricLabel}>With Theo</Text>
        </View>
        <View>
          <Text style={styles.metricNumber}>3</Text>
          <Text style={styles.metricLabel}>This week</Text>
        </View>
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
        {demoEvents.slice(0, 4).map((event, index) => (
          <EventCard eventIndex={index} key={event.id} onPress={onBook} />
        ))}
      </ScrollView>
      <SectionHeader
        eyebrow="RECENT FORM"
        title="Every result tells a story."
        action="Matches"
      />
      <View style={styles.listCard}>
        {demoMatches.slice(0, 2).map((match) => (
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
      <View style={styles.aiInsight}>
        <View style={styles.aiIcon}>
          <Text style={styles.aiIconText}>✦</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DUNA INSIGHT</Text>
          <Text style={styles.aiTitle}>
            Your sideout game is becoming an edge.
          </Text>
          <Text style={styles.aiBody}>
            You are winning 8.4% more often than expected in sideout-scored
            matches. That signal is based on 17 verified results.
          </Text>
        </View>
      </View>
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
  const event = demoEvents[eventIndex]!;
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
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="SOUTH BAY · LOS ANGELES" />
      <Text style={styles.displayTitle}>Find your game.</Text>
      <View style={styles.searchField}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          placeholder="Events, programs, clubs, coaches…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
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
          <Text style={styles.mapLabelTitle}>47 things to do</Text>
          <Text style={styles.mapLabelText}>within 10 miles</Text>
        </View>
      </View>
      <SectionHeader
        eyebrow={`${filter.toUpperCase()} · 47 RESULTS`}
        title="Around you."
        action="Map"
      />
      <View style={styles.eventGrid}>
        {demoEvents.map((event, index) => (
          <EventCard eventIndex={index} key={event.id} onPress={onBook} />
        ))}
      </View>
    </ScrollView>
  );
}

function PlayScreen() {
  const [hosted, setHosted] = useState(false);
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="YOUR CALENDAR + COMMUNITY" />
      <View style={styles.homeGreeting}>
        <Text style={styles.displayTitle}>Play.</Text>
        <Pressable onPress={() => setHosted(true)} style={styles.scoreAction}>
          <Text style={styles.scoreActionText}>＋ Host pickup</Text>
        </Pressable>
      </View>
      {hosted && (
        <View style={styles.successBanner}>
          <Text style={styles.successIcon}>✓</Text>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>Golden Hour 4s is live.</Text>
            <Text style={styles.rowMeta}>
              312 matching nearby players can now find it.
            </Text>
          </View>
          <Pressable onPress={() => setHosted(false)}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.weekCard}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.eyebrow}>JUL 27 – AUG 2</Text>
            <Text style={styles.cardTitle}>Your week</Text>
          </View>
          <Text style={styles.sectionAction}>Calendar →</Text>
        </View>
        <View style={styles.weekDays}>
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <View
              key={day + index}
              style={[styles.weekDay, index === 3 && styles.weekDayActive]}
            >
              <Text
                style={[
                  styles.weekDayLabel,
                  index === 3 && styles.weekDayTextActive,
                ]}
              >
                {day}
              </Text>
              <Text
                style={[
                  styles.weekDayNumber,
                  index === 3 && styles.weekDayTextActive,
                ]}
              >
                {27 + index}
              </Text>
              {[1, 3, 4, 6].includes(index) && (
                <View
                  style={[
                    styles.weekDot,
                    index === 3 && { backgroundColor: colors.ink },
                  ]}
                />
              )}
            </View>
          ))}
        </View>
        {demoBookings.map((booking, index) => (
          <View style={styles.bookingRow} key={booking.id}>
            <View style={styles.bookingTime}>
              <Text style={styles.bookingTimeMain}>
                {index === 0 ? "9:00" : index === 1 ? "6:00" : "6:00"}
              </Text>
              <Text style={styles.bookingTimeSuffix}>
                {index === 0 ? "AM" : "PM"}
              </Text>
            </View>
            <View
              style={[
                styles.bookingAccent,
                { backgroundColor: index === 1 ? colors.flare : colors.aqua },
              ]}
            />
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{booking.title}</Text>
              <Text style={styles.rowMeta}>{booking.venueName}</Text>
            </View>
            <Pill tone="positive">Ready</Pill>
          </View>
        ))}
      </View>
      <SectionHeader
        eyebrow="PICKUP NEARBY"
        title="Jump into something."
        action="See all"
      />
      <View style={styles.listCard}>
        {demoEvents
          .filter(
            (event) => event.kind === "pickup" || event.kind === "open-play",
          )
          .map((event) => (
            <View key={event.id} style={styles.pickupRow}>
              <View style={styles.pickupDate}>
                <Text style={styles.pickupDay}>FRI</Text>
                <Text style={styles.pickupNumber}>31</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{event.title}</Text>
                <Text style={styles.rowMeta}>
                  {event.venueName} · {(event.ratingRange?.[0] ?? 1).toFixed(1)}
                  –{(event.ratingRange?.[1] ?? 7).toFixed(1)}
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
          Host a pickup in under 20 seconds. Duna finds nearby players in the
          right rating band and opens a group thread.
        </Text>
        <Pressable onPress={() => setHosted(true)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Host pickup</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function WalletScreen() {
  const balance = useMemo(
    () =>
      demoWalletEntries.reduce(
        (sum, entry) => sum + entry.amount.amountMinor,
        0,
      ),
    [],
  );
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
          <Pill tone="positive">Ready</Pill>
        </View>
        <Text style={styles.walletLabel}>AVAILABLE BALANCE</Text>
        <Text style={styles.walletBalance}>
          {formatMoney(Math.max(balance, 18400), "USD")}
        </Text>
        <Text style={styles.walletMeta}>
          Held and moved by Stripe · Duna is not a bank
        </Text>
        <View style={styles.walletActions}>
          <Pressable>
            <Text style={styles.walletActionText}>Add money</Text>
          </Pressable>
          <Pressable>
            <Text style={styles.walletActionText}>Withdraw</Text>
          </Pressable>
        </View>
        <View style={styles.walletWave} />
      </View>
      <View style={styles.walletInfoGrid}>
        <View>
          <Text style={styles.eyebrow}>MEMBERSHIP</Text>
          <Text style={styles.cardTitle}>Duna+</Text>
          <Text style={styles.bodyText}>No platform fees · 2 guest passes</Text>
        </View>
        <View>
          <Text style={styles.eyebrow}>THIS MONTH</Text>
          <Text style={styles.cardTitle}>$18.72</Text>
          <Text style={styles.bodyText}>Saved with Duna+</Text>
        </View>
      </View>
      <SectionHeader
        eyebrow="YOUR MONEY ON SAND"
        title="Activity."
        action="Statements"
      />
      <View style={styles.listCard}>
        {demoWalletEntries.map((entry) => (
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
              {formatMoney(entry.amount.amountMinor, "USD")}
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
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader eyebrow="YOUR PUBLIC PLAYER IDENTITY" />
      <View style={styles.profileHero}>
        <View style={styles.profileIdentity}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>ML</Text>
          </View>
          <View>
            <Pill tone="positive">Duna+</Pill>
            <Text style={styles.profileName}>{demoPlayer.displayName}</Text>
            <Text style={styles.profileHandle}>
              @{demoPlayer.handle} · {demoPlayer.homeMarket}
            </Text>
          </View>
        </View>
        <RatingOrbit compact />
      </View>
      <View style={styles.metricStrip}>
        <View>
          <Text style={styles.metricNumber}>A</Text>
          <Text style={styles.metricLabel}>Current band</Text>
        </View>
        <View>
          <Text style={styles.metricNumber}>#42</Text>
          <Text style={styles.metricLabel}>South Bay</Text>
        </View>
        <View>
          <Text style={styles.metricNumber}>84</Text>
          <Text style={styles.metricLabel}>Matches</Text>
        </View>
        <View>
          <Text style={styles.metricNumber}>61%</Text>
          <Text style={styles.metricLabel}>Win rate</Text>
        </View>
      </View>
      <View style={styles.progressCard}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.eyebrow}>LAST 12 MONTHS</Text>
            <Text style={styles.cardTitle}>Rating progression</Text>
          </View>
          <Pill tone="positive">+0.54</Pill>
        </View>
        <View style={styles.mobileChart}>
          <View style={[styles.chartPoint, { left: "3%", bottom: "18%" }]} />
          <View style={[styles.chartPoint, { left: "26%", bottom: "31%" }]} />
          <View style={[styles.chartPoint, { left: "49%", bottom: "45%" }]} />
          <View style={[styles.chartPoint, { left: "72%", bottom: "61%" }]} />
          <View style={[styles.chartPoint, { left: "94%", bottom: "79%" }]} />
          <View style={styles.chartLine} />
        </View>
        <View style={styles.chartLabels}>
          <Text>Aug</Text>
          <Text>Nov</Text>
          <Text>Feb</Text>
          <Text>May</Text>
          <Text>Jul</Text>
        </View>
      </View>
      <View style={styles.chemistryCard}>
        <Text style={styles.eyebrow}>PARTNER CHEMISTRY</Text>
        <Text style={styles.sectionTitle}>You make each other better.</Text>
        <View style={styles.chemistryPartner}>
          <View style={styles.miniAvatar}>
            <Text style={styles.miniAvatarText}>TP</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>Theo Park</Text>
            <Text style={styles.rowMeta}>27 shared matches · 68% win rate</Text>
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
      <View style={styles.profileMenu}>
        {[
          "Edit profile",
          "Household + guardians",
          "Notifications",
          "Privacy + safety",
          "Language + units",
          "Manage Duna+",
        ].map((item) => (
          <Pressable style={styles.profileMenuRow} key={item}>
            <Text style={styles.rowTitle}>{item}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
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
  const [complete, setComplete] = useState(false);
  const event = eventIndex === null ? null : demoEvents[eventIndex];
  if (!event) return null;
  const fee =
    event.kind === "tournament"
      ? 400
      : Math.min(499, Math.max(49, Math.round(event.price.amountMinor * 0.03)));
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={eventIndex !== null}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        {complete ? (
          <View style={styles.completeState}>
            <View style={styles.completeIcon}>
              <Text style={styles.completeIconText}>✓</Text>
            </View>
            <Pill tone="positive">Confirmed</Pill>
            <Text style={styles.completeTitle}>You’re in.</Text>
            <Text style={styles.completeBody}>
              {event.title} is on your calendar and the group thread is open.
            </Text>
            <Pressable onPress={onClose} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>View your booking</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Pressable onPress={onClose}>
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
            <View style={styles.checkoutSection}>
              <Text style={styles.eyebrow}>WHO’S PLAYING</Text>
              <View style={styles.checkoutPlayer}>
                <View style={styles.miniAvatar}>
                  <Text style={styles.miniAvatarText}>ML</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>Mara Lewis</Text>
                  <Text style={styles.rowMeta}>Rating requirement passed</Text>
                </View>
                <Text style={styles.checkText}>✓</Text>
              </View>
            </View>
            <View style={styles.checkoutSection}>
              <Text style={styles.eyebrow}>PAY YOUR WAY</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentIcon}>▣</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>Use Duna Wallet</Text>
                  <Text style={styles.rowMeta}>$184.00 available</Text>
                </View>
                <Text style={styles.moneyAmount}>
                  −
                  {formatMoney(
                    Math.min(18400, event.price.amountMinor + fee),
                    "USD",
                  )}
                </Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentIcon}>▤</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>Visa •••• 4242</Text>
                  <Text style={styles.rowMeta}>
                    Securely stored with Stripe
                  </Text>
                </View>
                <Text style={styles.moneyAmount}>$0.00</Text>
              </View>
            </View>
            <View style={styles.orderMath}>
              <View>
                <Text style={styles.bodyText}>Entry</Text>
                <Text style={styles.moneyAmount}>
                  {formatMoney(event.price.amountMinor, "USD")}
                </Text>
              </View>
              <View>
                <Text style={styles.bodyText}>
                  {event.kind === "tournament"
                    ? "Registration fee"
                    : "Duna platform fee"}
                </Text>
                <Text style={styles.moneyAmount}>
                  {formatMoney(fee, "USD")}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.rowTitle}>Total</Text>
                <Text style={styles.totalAmount}>
                  {formatMoney(event.price.amountMinor + fee, "USD")}
                </Text>
              </View>
              <View>
                <Text style={styles.bodyText}>From wallet</Text>
                <Text style={[styles.moneyAmount, { color: colors.positive }]}>
                  −{formatMoney(event.price.amountMinor + fee, "USD")}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setComplete(true)}
              style={styles.payButton}
            >
              <Text style={styles.payButtonText}>◇ Confirm with Wallet</Text>
            </Pressable>
            <Text style={styles.paymentTrust}>
              Payments are processed by Stripe. Card details never touch Duna.
            </Text>
          </ScrollView>
        )}
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
      <DunaApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.ink, flex: 1 },
  app: { backgroundColor: colors.ink, flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  screenContent: { paddingBottom: 118, paddingHorizontal: 18 },
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
  displayTitle: {
    color: colors.bone,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -2.2,
    lineHeight: 42,
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
