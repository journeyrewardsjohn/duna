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
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
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

type Tab = "today" | "people" | "score" | "money" | "more";

const tabs: readonly { key: Tab; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "⌂" },
  { key: "people", label: "People", icon: "◎" },
  { key: "score", label: "Score", icon: "＋" },
  { key: "money", label: "Money", icon: "$" },
  { key: "more", label: "More", icon: "•••" },
];

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
      backgroundColor: "rgba(255,255,255,.05)",
      borderColor: "rgba(255,255,255,.09)",
    },
    positive: {
      backgroundColor: "rgba(133,212,155,.08)",
      borderColor: "rgba(133,212,155,.22)",
    },
    warning: {
      backgroundColor: "rgba(247,200,107,.08)",
      borderColor: "rgba(247,200,107,.22)",
    },
    live: {
      backgroundColor: "rgba(255,106,61,.08)",
      borderColor: "rgba(255,106,61,.25)",
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
  return (
    <View style={styles.header}>
      <View>
        <Mark />
        <Text style={styles.headerContext}>{context}</Text>
      </View>
      <View style={styles.headerButtons}>
        <Pressable style={styles.aiButton}>
          <Text style={styles.aiButtonText}>✦</Text>
        </Pressable>
        <Pressable style={styles.profileButton}>
          <Text style={styles.profileText}>SR</Text>
          <View style={styles.dot} />
        </Pressable>
      </View>
    </View>
  );
}

function PageTitle({
  eyebrow,
  title,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly action?: string;
}) {
  return (
    <View style={styles.pageTitle}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.displayTitle}>{title}</Text>
      </View>
      {action && (
        <Pressable style={styles.primaryAction}>
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
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header context="SOUTH BAY VOLLEYBALL" />
      <PageTitle
        eyebrow="THURSDAY · JULY 30"
        title="Good morning, Sam."
        action="Create"
      />
      <Text style={styles.subhead}>
        {demoOrganization.name} has{" "}
        <Text style={styles.subheadStrong}>61 players</Text> on sand today.
      </Text>
      <View style={styles.metricGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>TODAY’S SALES</Text>
          <Text style={styles.metricValue}>$8,420</Text>
          <Text style={styles.positiveText}>↗ 18.4%</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>CHECK-INS</Text>
          <Text style={styles.metricValue}>146 / 168</Text>
          <Text style={styles.metaText}>87% arrived</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>COURT USE</Text>
          <Text style={styles.metricValue}>82%</Text>
          <View style={styles.meter}>
            <View style={[styles.meterFill, { width: "82%" }]} />
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>NEXT PAYOUT</Text>
          <Text style={styles.metricValue}>$61,884</Text>
          <Pill tone="positive">Friday</Pill>
        </View>
      </View>
      <SectionTitle
        eyebrow="LIVE OPERATIONS"
        title="Today on sand"
        action="Calendar"
      />
      <View style={styles.scheduleCard}>
        {schedule.map((item, index) => (
          <Pressable
            key={item[2]}
            onPress={index === 3 ? onScore : undefined}
            style={styles.scheduleRow}
          >
            <View style={styles.timeBlock}>
              <Text style={styles.timeMain}>{item[0]}</Text>
              <Text style={styles.timeSuffix}>{item[1]}</Text>
            </View>
            <View
              style={[
                styles.statusLine,
                { backgroundColor: index === 0 ? colors.flare : colors.aqua },
              ]}
            />
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{item[2]}</Text>
              <Text style={styles.metaText}>{item[3]}</Text>
            </View>
            <View style={styles.rosterCount}>
              <Text style={styles.rowTitle}>{item[4]}</Text>
              <Text style={styles.metaText}>roster</Text>
            </View>
            <Pill tone={index === 0 ? "live" : "neutral"}>{item[5]}</Pill>
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
        {[
          [
            "!",
            "2 waivers expire before Saturday",
            "U14 roster · guardians can renew in one tap",
            "Review",
          ],
          [
            "$",
            "3 failed membership renewals",
            "$474.00 at risk · recovery is running",
            "Open",
          ],
          [
            "✉",
            "4 conversations need a reply",
            "Oldest waiting 2h 18m",
            "Reply",
          ],
        ].map((item, index) => (
          <View key={item[1]} style={styles.attentionRow}>
            <View
              style={[
                styles.attentionIcon,
                index === 1 && { backgroundColor: "rgba(242,120,120,.1)" },
              ]}
            >
              <Text
                style={[
                  styles.attentionIconText,
                  index === 1 && { color: colors.danger },
                ]}
              >
                {item[0]}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{item[1]}</Text>
              <Text style={styles.metaText}>{item[2]}</Text>
            </View>
            <Pressable>
              <Text style={styles.linkText}>{item[3]}</Text>
            </Pressable>
          </View>
        ))}
      </View>
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
            Four waitlisted 4.0+ players fit the remaining spots. Want a draft
            invitation?
          </Text>
          <Pressable>
            <Text style={styles.linkText}>Explore insight →</Text>
          </Pressable>
        </View>
      </View>
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
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header context="PEOPLE + HOUSEHOLDS" />
      <PageTitle
        eyebrow="CRM + ELIGIBILITY"
        title="People."
        action="Add person"
      />
      <View style={styles.searchField}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          placeholder="Search 918 people…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBleed}
      >
        <View style={styles.filterRow}>
          {["All", "Members", "Coaches", "Minors", "Needs action"].map(
            (item) => (
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
            ),
          )}
        </View>
      </ScrollView>
      <View style={styles.peopleSummary}>
        <View>
          <Text style={styles.metricValue}>918</Text>
          <Text style={styles.metaText}>active people</Text>
        </View>
        <View>
          <Text style={styles.metricValue}>97.8%</Text>
          <Text style={styles.metaText}>eligibility ready</Text>
        </View>
        <View>
          <Text style={styles.metricValue}>184</Text>
          <Text style={styles.metaText}>households</Text>
        </View>
      </View>
      <View style={styles.peopleList}>
        {demoPeople
          .concat([
            {
              ...demoPeople[0]!,
              id: "guardian-priya",
              displayName: "Priya Lewis",
              initials: "PL",
              handle: "priyal",
              roles: ["guardian"],
            },
          ])
          .map((person, index) => (
            <Pressable key={person.id} style={styles.personRow}>
              <View style={styles.personAvatar}>
                <Text style={styles.personAvatarText}>{person.initials}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{person.displayName}</Text>
                <Text style={styles.metaText}>
                  {person.roles.join(" + ")} · {person.handle}@example.com
                </Text>
              </View>
              {index === 2 ? (
                <Pill tone="warning">Waiver</Pill>
              ) : (
                <Pill tone="positive">
                  {index === 5 ? "Guardian" : "Active"}
                </Pill>
              )}
              <View style={styles.personRating}>
                <Text style={styles.ratingNumber}>
                  {index === 5 ? "—" : person.rating.display.toFixed(2)}
                </Text>
                <Text style={styles.metaText}>
                  {index === 5 ? "" : person.rating.confidence}
                </Text>
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

function ScorerScreen() {
  const [system, setSystem] = useState<ScoringSystem>("rally");
  const [events, setEvents] = useState<readonly ScoreEvent[]>(initialEvents);
  const [offline, setOffline] = useState(false);
  const [ready, setReady] = useState(false);
  const state = useMemo(
    () => foldScore(events, { ...standardBeachFormat, scoringSystem: system }),
    [events, system],
  );
  const current = state.sets[state.setIndex] ?? { a: 0, b: 0 };

  useEffect(() => {
    AsyncStorage.getItem("duna-pro-score-events")
      .then((saved) => {
        if (saved) {
          try {
            setEvents(JSON.parse(saved) as readonly ScoreEvent[]);
          } catch {
            setEvents(initialEvents);
          }
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready)
      void AsyncStorage.setItem(
        "duna-pro-score-events",
        JSON.stringify(events),
      );
  }, [events, ready]);

  function point(winner: "A" | "B") {
    if (state.status === "complete") return;
    setEvents((currentEvents) => [
      ...currentEvents,
      {
        id: `rally-${Date.now()}-${currentEvents.length}`,
        type: "rally-won",
        winner,
        occurredAt: new Date().toISOString(),
      },
    ]);
  }

  function undo() {
    const event = createUndoEvent(events, {
      id: `undo-${Date.now()}`,
      occurredAt: new Date().toISOString(),
    });
    if (event) setEvents((currentEvents) => [...currentEvents, event]);
  }

  function reset() {
    setEvents([{ ...initialEvents[0]!, occurredAt: new Date().toISOString() }]);
  }

  return (
    <View style={styles.scorer}>
      <View style={styles.scorerTop}>
        <View>
          <Text style={styles.eyebrow}>SUNSET OPEN · QUARTERFINAL</Text>
          <Text style={styles.scorerVenue}>Manhattan Beach · Court 4</Text>
        </View>
        <Pill tone={state.status === "complete" ? "positive" : "live"}>
          {state.status === "complete" ? "Complete" : "Live scoring"}
        </Pill>
        <Pressable
          onPress={() => setOffline((value) => !value)}
          style={styles.syncButton}
        >
          <Text style={[styles.syncIcon, offline && { color: colors.warning }]}>
            {offline ? "◌" : "●"}
          </Text>
          <Text style={styles.syncText}>
            {offline ? "On device" : "Synced"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.scorerFormat}>
        <View style={styles.segmented}>
          <Pressable
            onPress={() => setSystem("rally")}
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
            onPress={() => setSystem("sideout")}
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
          disabled={state.status === "complete"}
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
              <Text style={styles.scoreAvatarText}>ML</Text>
            </View>
            <View style={styles.scoreAvatar}>
              <Text style={styles.scoreAvatarText}>TP</Text>
            </View>
            <Text style={styles.teamName}>Mara / Theo</Text>
          </View>
          <Text style={styles.bigScore}>{current.a}</Text>
          <Text style={styles.tapHint}>TAP ANYWHERE FOR POINT</Text>
        </Pressable>
        <View style={styles.versus}>
          <Text style={styles.versusText}>VS</Text>
        </View>
        <Pressable
          disabled={state.status === "complete"}
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
              <Text style={styles.scoreAvatarText}>NW</Text>
            </View>
            <View style={styles.scoreAvatar}>
              <Text style={styles.scoreAvatarText}>ET</Text>
            </View>
            <Text style={styles.teamName}>Noa / Elena</Text>
          </View>
          <Text style={styles.bigScore}>{current.b}</Text>
          <Text style={styles.tapHint}>TAP ANYWHERE FOR POINT</Text>
        </Pressable>
      </View>
      <View style={styles.scorerBottom}>
        <Pressable
          disabled={events.length <= 1}
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
              {offline ? "Saved on this device" : "Server and device agree"}
            </Text>
            <Text style={styles.metaText}>
              {offline
                ? `${Math.max(0, events.length - 1)} events pending upload`
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
    </View>
  );
}

function MoneyScreen() {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header context="STRIPE-CONNECTED MONEY" />
      <PageTitle
        eyebrow="SALES + PAYOUTS"
        title="Money."
        action="Take payment"
      />
      <View style={styles.balanceCard}>
        <View style={styles.cardTop}>
          <Pill tone="positive">Stripe connected</Pill>
          <Text style={styles.brandSmall}>DUNA PRO</Text>
        </View>
        <Text style={styles.balanceLabel}>AVAILABLE TO PAY OUT</Text>
        <Text style={styles.balanceValue}>$61,884.22</Text>
        <Text style={styles.metaText}>
          Estimated arrival Friday · •••• 8842
        </Text>
        <View style={styles.balanceActions}>
          <Pressable>
            <Text style={styles.balanceAction}>View in Stripe ↗</Text>
          </Pressable>
          <Pressable>
            <Text style={styles.balanceAction}>Reconcile July</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.moneyMetrics}>
        <View>
          <Text style={styles.metricLabel}>GROSS · JULY</Text>
          <Text style={styles.metricValue}>$84,260</Text>
          <Text style={styles.positiveText}>+18.4%</Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>REFUNDS</Text>
          <Text style={styles.metricValue}>$2,184</Text>
          <Text style={styles.metaText}>2.59% gross</Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>NET SALES</Text>
          <Text style={styles.metricValue}>$78,132</Text>
          <Text style={styles.positiveText}>92.7% retained</Text>
        </View>
      </View>
      <SectionTitle
        eyebrow="TODAY"
        title="Transactions"
        action="All activity"
      />
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
                  backgroundColor: "rgba(247,200,107,.08)",
                },
              ]}
            >
              <Text
                style={{
                  color:
                    (item[3] as number) < 0 ? colors.warning : colors.positive,
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
      <View style={styles.boundaryNote}>
        <Text style={styles.boundaryIcon}>◇</Text>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>
            Ledger and Stripe agree through 10:42 AM.
          </Text>
          <Text style={styles.metaText}>
            Funds remain in Stripe-managed accounts. Duna never custodies
            operator or player money.
          </Text>
        </View>
        <Pill tone="positive">Reconciled</Pill>
      </View>
    </ScrollView>
  );
}

function MoreScreen() {
  const sections = [
    [
      "OPERATIONS",
      ["Calendar", "Programs", "Events + leagues", "Messages", "Reports"],
    ],
    [
      "BUSINESS",
      [
        "Products + pricing",
        "Memberships + packages",
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
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header context="SOUTH BAY VOLLEYBALL" />
      <PageTitle eyebrow="EVERYTHING ELSE" title="More." />
      <View style={styles.organizationCard}>
        <View style={styles.orgAvatar}>
          <Text style={styles.orgAvatarText}>SB</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.orgName}>{demoOrganization.name}</Text>
          <Text style={styles.metaText}>
            {demoOrganization.plan} plan · {demoOrganization.memberCount} people
            · {demoOrganization.venueCount} venues
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
      {sections.map((section) => (
        <View key={section[0]}>
          <Text style={styles.menuEyebrow}>{section[0]}</Text>
          <View style={styles.menuCard}>
            {section[1].map((item) => (
              <Pressable style={styles.menuRow} key={item}>
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
  return (
    <SafeAreaView
      edges={tab === "score" ? ["top"] : ["top"]}
      style={styles.safe}
    >
      <StatusBar style="light" />
      <View style={styles.app}>
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
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.ink, flex: 1 },
  app: { backgroundColor: colors.ink, flex: 1 },
  flex: { flex: 1, minWidth: 0 },
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
    backgroundColor: "rgba(247,200,107,.12)",
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
  aiButton: {
    alignItems: "center",
    backgroundColor: "rgba(247,200,107,.08)",
    borderColor: "rgba(247,200,107,.18)",
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
  primaryAction: {
    backgroundColor: colors.warning,
    borderRadius: 21,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  primaryActionText: { color: colors.ink, fontSize: 9, fontWeight: "900" },
  subhead: { color: colors.muted, fontSize: 10, marginTop: 8 },
  subheadStrong: { color: colors.bone, fontWeight: "700" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  metricCard: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
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
    backgroundColor: "rgba(255,255,255,.08)",
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
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  scheduleRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.06)",
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
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  attentionRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.06)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 65,
    padding: 9,
  },
  attentionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(247,200,107,.08)",
    borderRadius: 9,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  attentionIconText: { color: colors.warning, fontSize: 12, fontWeight: "900" },
  aiBrief: {
    backgroundColor: colors.navy,
    borderColor: "rgba(247,200,107,.13)",
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
  aiMarkText: { color: colors.ink, fontSize: 15 },
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
    borderColor: "rgba(255,255,255,.08)",
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
  filterRow: { flexDirection: "row", gap: 6, marginTop: 12, paddingRight: 36 },
  filterChip: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.08)",
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
  filterTextActive: { color: colors.ink, fontWeight: "800" },
  peopleSummary: {
    backgroundColor: colors.navy,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 14,
    padding: 12,
  },
  peopleList: {
    backgroundColor: colors.depth,
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
  },
  personRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.06)",
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
  scorer: { backgroundColor: colors.ink, flex: 1 },
  scorerTop: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.07)",
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
    backgroundColor: "rgba(255,255,255,.04)",
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
    backgroundColor: "rgba(255,255,255,.05)",
    borderRadius: 18,
    flexDirection: "row",
    padding: 2,
  },
  segmentButton: {
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  segmentActive: { backgroundColor: colors.bone },
  segmentText: { color: colors.muted, fontSize: 7, fontWeight: "700" },
  segmentTextActive: { color: colors.ink },
  scoreNotice: {
    alignItems: "center",
    backgroundColor: colors.warning,
    flexDirection: "row",
    gap: 8,
    padding: 7,
  },
  scoreNoticeIcon: { color: colors.ink, fontSize: 14 },
  scoreNoticeTitle: { color: colors.ink, fontSize: 8, fontWeight: "900" },
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
    borderRightColor: "rgba(255,255,255,.06)",
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
    borderColor: "rgba(255,255,255,.08)",
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
    borderTopColor: "rgba(255,255,255,.07)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    padding: 8,
  },
  secondaryAction: {
    backgroundColor: "rgba(255,255,255,.05)",
    borderColor: "rgba(255,255,255,.08)",
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryActionText: { color: colors.bone, fontSize: 7, fontWeight: "700" },
  syncSummary: { alignItems: "center", flexDirection: "row", gap: 6 },
  sets: { flexDirection: "row", gap: 4 },
  setBox: {
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  setBoxActive: { backgroundColor: "rgba(99,227,219,.09)" },
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
    borderColor: "rgba(247,200,107,.16)",
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
    backgroundColor: "rgba(255,255,255,.06)",
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
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  transactionRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.06)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 64,
    padding: 9,
  },
  transactionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(133,212,155,.08)",
    borderRadius: 9,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  transactionAmount: { color: colors.bone, fontSize: 9, fontWeight: "800" },
  boundaryNote: {
    alignItems: "center",
    backgroundColor: "rgba(99,227,219,.05)",
    borderColor: "rgba(99,227,219,.13)",
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
    borderColor: "rgba(255,255,255,.07)",
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
  orgAvatarText: { color: colors.bone, fontSize: 11, fontWeight: "900" },
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
    borderColor: "rgba(255,255,255,.07)",
    borderRadius: 15,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.06)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 55,
    padding: 10,
  },
  menuIcon: {
    alignItems: "center",
    backgroundColor: "rgba(247,200,107,.08)",
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
    borderColor: "rgba(247,200,107,.12)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 11,
    marginTop: 22,
    padding: 15,
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
  scoreTabIcon: { color: colors.ink, fontSize: 22, lineHeight: 23 },
  scoreTabLabel: { color: colors.ink, fontWeight: "800" },
});
