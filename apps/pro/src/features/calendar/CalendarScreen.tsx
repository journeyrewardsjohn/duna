import { useProRuntime } from "../../../runtime";
import { useState, useMemo, useEffect } from "react";
import {
  type NaturalLanguageScheduleDraft,
  parseNaturalLanguageSchedule,
} from "@duna/scheduling";
import {
  type ProCalendarConnection,
  type ProPersonalCalendarEvent,
  readProCalendarConnection,
  loadProPersonalEvents,
  connectProCalendar,
} from "../../../pro-calendar-integration";
import { Platform, ScrollView, View, Pressable, Modal } from "react-native";
import * as Crypto from "expo-crypto";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import { SessionArrivalBoard } from "../../../session-arrival-board";
import {
  type ProCalendarEntry,
  type CalendarResourceFilter,
  type CalendarSheetMode,
} from "./calendar-types";
import {
  calendarDayAtNoon,
  calendarDateKey,
  zonedLocalToIso,
  formatCalendarDay,
  formatCalendarTime,
} from "../../shared/calendar-time";
import { schedule } from "../../shared/schedule";
import { colors } from "../../shared/palette";
import { displayError } from "../../shared/display-error";
import { successHaptic, selectionHaptic } from "../../shared/haptics";
import { styles } from "../../legacy/styles";
import { Header } from "../../shared/Header";
import { PageTitle } from "../../shared/PageTitle";
import { VenueMatchesSection } from "../../shared/VenueMatchesSection";
import { Pill } from "../../shared/Pill";
import { entryLabel, personInitials } from "./calendar-format";
import { weatherSymbol, fahrenheit } from "../../shared/weather";

export function CalendarScreen({
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
