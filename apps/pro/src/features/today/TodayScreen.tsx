import { useProRuntime } from "../../../runtime";
import { demoOrganization } from "@duna/core/demo";
import { dunaApiBaseUrl } from "../../../mobile-api";
import { formatVenueTime } from "@duna/core";
import { ScrollView, View, Pressable, Linking } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import { SessionArrivalBoard } from "../../../session-arrival-board";
import { type ProCalendarEntry } from "../calendar/calendar-types";
import { calendarDateKey } from "../../shared/calendar-time";
import { schedule } from "../../shared/schedule";
import { colors } from "../../shared/palette";
import { styles } from "../../legacy/styles";
import { Header } from "../../shared/Header";
import { PageTitle } from "../../shared/PageTitle";
import { weatherSymbol, fahrenheit } from "../../shared/weather";
import { selectionHaptic, impactHaptic } from "../../shared/haptics";
import { VenueMatchesSection } from "../../shared/VenueMatchesSection";
import { SectionTitle } from "../../shared/SectionTitle";

export function TodayScreen({
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
