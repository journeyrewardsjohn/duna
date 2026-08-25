import { dunaAppColors, dunaAppShape, mobileGrid } from "@duna/ui/mobile";
import * as Calendar from "expo-calendar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { DunaIcon } from "./duna-icon";
import { FellixText as Text } from "./satoshi-text";
import {
  connectPlayerCalendar,
  readPlayerCalendarConnection,
  syncPlayerBookings,
  type PlayerCalendarSyncBooking,
} from "./player-calendar-sync";

export type PlayerCalendarBooking = PlayerCalendarSyncBooking & {
  readonly kind: string;
};

type CalendarMode = "day" | "week" | "month" | "quarter";
type DeviceEvent = Awaited<ReturnType<typeof Calendar.listEvents>>[number];
type AgendaItem =
  | { readonly kind: "duna"; readonly booking: PlayerCalendarBooking }
  | { readonly kind: "device"; readonly event: DeviceEvent };

const c = dunaAppColors;

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(value: Date, months: number) {
  const date = new Date(value);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return date;
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function sameDay(left: Date | string, right: Date | string) {
  return (
    startOfDay(new Date(left)).getTime() ===
    startOfDay(new Date(right)).getTime()
  );
}

function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const starts = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => addDays(starts, index));
}

function viewRange(mode: CalendarMode, focus: Date) {
  if (mode === "day") {
    return { start: startOfDay(focus), end: addDays(startOfDay(focus), 1) };
  }
  if (mode === "week") {
    const start = startOfWeek(focus);
    return { start, end: addDays(start, 7) };
  }
  const start = new Date(focus.getFullYear(), focus.getMonth(), 1);
  return {
    start,
    end: addMonths(start, mode === "quarter" ? 3 : 1),
  };
}

function calendarTitle(mode: CalendarMode, focus: Date) {
  if (mode === "day") {
    return focus.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  if (mode === "week") {
    const start = startOfWeek(focus);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} – ${end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
  }
  if (mode === "quarter") {
    const end = addMonths(focus, 2);
    return `${focus.toLocaleDateString("en-US", { month: "short" })} – ${end.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  }
  return focus.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function modeStep(mode: CalendarMode) {
  if (mode === "day") return { days: 1, months: 0 };
  if (mode === "week") return { days: 7, months: 0 };
  return { days: 0, months: mode === "quarter" ? 3 : 1 };
}

function eventTime(item: AgendaItem) {
  const startsAt =
    item.kind === "duna" ? item.booking.startsAt : item.event.startDate;
  return new Date(startsAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function itemStart(item: AgendaItem) {
  return Date.parse(
    String(item.kind === "duna" ? item.booking.startsAt : item.event.startDate),
  );
}

function MiniMonth({
  bookings,
  deviceEvents,
  focus,
  month,
  onSelect,
}: {
  readonly bookings: readonly PlayerCalendarBooking[];
  readonly deviceEvents: readonly DeviceEvent[];
  readonly focus: Date;
  readonly month: Date;
  readonly onSelect: (date: Date) => void;
}) {
  return (
    <View style={styles.month}>
      <Text style={styles.monthTitle}>
        {month.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </Text>
      <View style={styles.weekdayRow}>
        {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
          <Text key={`${label}:${index}`} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {monthGrid(month).map((date) => {
          const selected = sameDay(date, focus);
          const currentMonth = date.getMonth() === month.getMonth();
          const hasDuna = bookings.some((booking) =>
            sameDay(booking.startsAt, date),
          );
          const hasDevice = deviceEvents.some((event) =>
            sameDay(String(event.startDate), date),
          );
          return (
            <Pressable
              accessibilityLabel={date.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
              key={date.toISOString()}
              onPress={() => onSelect(date)}
              style={[styles.monthDay, selected && styles.monthDaySelected]}
            >
              <Text
                style={[
                  styles.monthDayText,
                  !currentMonth && styles.monthDayMuted,
                  selected && styles.monthDayTextSelected,
                ]}
              >
                {date.getDate()}
              </Text>
              {(hasDuna || hasDevice) && (
                <View style={styles.dayDots}>
                  {hasDuna && <View style={styles.dunaDot} />}
                  {hasDevice && <View style={styles.deviceDot} />}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PlayerCalendarModal({
  bookings,
  initialDate,
  onClose,
  onOpenBooking,
  visible,
}: {
  readonly bookings: readonly PlayerCalendarBooking[];
  readonly initialDate?: Date;
  readonly onClose: () => void;
  readonly onOpenBooking: (bookingId: string) => void;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<CalendarMode>("week");
  const [focus, setFocus] = useState(startOfDay(initialDate ?? new Date()));
  const [connected, setConnected] = useState(false);
  const [calendarTitleText, setCalendarTitleText] = useState<string>();
  const [deviceEvents, setDeviceEvents] = useState<readonly DeviceEvent[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const range = useMemo(() => viewRange(mode, focus), [focus, mode]);
  // A native full-screen Modal can briefly report a zero top inset on iOS.
  // Keep the navigation row clear of the Dynamic Island in that state instead
  // of letting the title and back control jump underneath the status bar.
  const modalTopInset =
    Platform.OS === "ios" ? Math.max(insets.top, 54) : insets.top;

  async function loadDeviceEvents() {
    if (Platform.OS === "web") return;
    const permission = await Calendar.getCalendarPermissions();
    if (!permission.granted) return;
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const connection = await readPlayerCalendarConnection();
    setConnected(Boolean(connection));
    setCalendarTitleText(connection?.title);
    if (connection) await syncPlayerBookings(bookings);
    const events = await Calendar.listEvents(
      calendars,
      addMonths(range.start, -1),
      addMonths(range.end, 1),
    );
    setDeviceEvents(
      events.filter(
        (event) => !String(event.notes ?? "").includes("[Duna booking:"),
      ),
    );
  }

  useEffect(() => {
    if (!visible) return;
    void loadDeviceEvents().catch(() => undefined);
  }, [range.end.getTime(), range.start.getTime(), visible]);

  async function connect() {
    setBusy(true);
    setNotice(undefined);
    try {
      const connection = await connectPlayerCalendar();
      setCalendarTitleText(connection.title);
      setConnected(true);
      const synced = await syncPlayerBookings(bookings);
      await loadDeviceEvents();
      setNotice(
        `${connection.title} is connected. ${synced} upcoming booking${synced === 1 ? "" : "s"} will stay updated automatically.`,
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Duna could not connect this calendar.",
      );
    } finally {
      setBusy(false);
    }
  }

  const days =
    mode === "week"
      ? Array.from({ length: 7 }, (_, index) =>
          addDays(startOfWeek(focus), index),
        )
      : [focus];
  const agendaRange =
    mode === "week"
      ? { start: startOfWeek(focus), end: addDays(startOfWeek(focus), 7) }
      : { start: startOfDay(focus), end: addDays(startOfDay(focus), 1) };
  const agenda: AgendaItem[] = [
    ...bookings
      .filter((booking) => {
        const time = Date.parse(booking.startsAt);
        return (
          time >= agendaRange.start.getTime() &&
          time < agendaRange.end.getTime()
        );
      })
      .map((booking) => ({ kind: "duna" as const, booking })),
    ...deviceEvents
      .filter((event) => {
        const time = Date.parse(String(event.startDate));
        return (
          time >= agendaRange.start.getTime() &&
          time < agendaRange.end.getTime()
        );
      })
      .map((event) => ({ kind: "device" as const, event })),
  ].sort((left, right) => itemStart(left) - itemStart(right));

  const shift = useCallback(
    (direction: -1 | 1) => {
      const step = modeStep(mode);
      setFocus((current) =>
        step.months
          ? addMonths(current, step.months * direction)
          : addDays(current, step.days * direction),
      );
    },
    [mode],
  );
  const weekPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          mode === "week" &&
          Math.abs(gesture.dx) > 14 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) < 48) return;
          shift(gesture.dx < 0 ? 1 : -1);
        },
      }),
    [mode, shift],
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <SafeAreaView
        edges={["bottom"]}
        style={[styles.safe, { paddingTop: modalTopInset }]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back from calendar"
            onPress={onClose}
            style={styles.close}
          >
            <DunaIcon color={c.navy} name="arrow-left" size={22} />
          </Pressable>
          <Text style={styles.calendarNavTitle}>Calendar</Text>
          <View accessibilityElementsHidden style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rangeHeader}>
            <Text style={styles.eyebrow}>YOUR SCHEDULE</Text>
            <Text style={styles.title}>{calendarTitle(mode, focus)}</Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.modeRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {(
              [
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
                ["quarter", "3 months"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setMode(value)}
                style={[styles.mode, mode === value && styles.modeActive]}
              >
                <Text
                  style={[
                    styles.modeText,
                    mode === value && styles.modeTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.navigator}>
            <Pressable onPress={() => shift(-1)} style={styles.navButton}>
              <Text style={styles.navButtonText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => setFocus(startOfDay(new Date()))}
              style={styles.todayButton}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
            <Pressable onPress={() => shift(1)} style={styles.navButton}>
              <Text style={styles.navButtonText}>›</Text>
            </Pressable>
          </View>

          {!connected ? (
            <View style={styles.connection}>
              <View style={styles.connectionMark}>
                <Text style={styles.connectionMarkText}>▦</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.connectionTitle}>
                  Bring in your calendar
                </Text>
                <Text style={styles.connectionBody}>
                  See Apple, Google, or Outlook events beside Duna.
                </Text>
              </View>
              <Pressable
                disabled={busy}
                onPress={() => void connect()}
                style={styles.connectionAction}
              >
                <Text style={styles.connectionActionText}>
                  {busy ? "Working…" : "Connect"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.connectedSummary}>
              <Text style={styles.connectedSummaryMark}>✓</Text>
              <Text style={styles.connectedSummaryText}>
                {calendarTitleText} · new plans sync automatically
              </Text>
            </View>
          )}
          {notice && <Text style={styles.notice}>{notice}</Text>}

          {mode === "day" && (
            <View style={styles.dayHero}>
              <Text style={styles.dayHeroWeekday}>
                {focus.toLocaleDateString("en-US", { weekday: "long" })}
              </Text>
              <Text style={styles.dayHeroNumber}>{focus.getDate()}</Text>
              <Text style={styles.dayHeroMonth}>
                {focus.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>
          )}

          {mode === "week" && (
            <View {...weekPanResponder.panHandlers} style={styles.week}>
              {days.map((date) => {
                const selected = sameDay(date, focus);
                const count =
                  bookings.filter((booking) => sameDay(booking.startsAt, date))
                    .length +
                  deviceEvents.filter((event) =>
                    sameDay(String(event.startDate), date),
                  ).length;
                return (
                  <Pressable
                    key={date.toISOString()}
                    onPress={() => setFocus(date)}
                    style={[styles.weekDay, selected && styles.weekDayActive]}
                  >
                    <Text
                      style={[
                        styles.weekDayLabel,
                        selected && styles.weekDayTextActive,
                      ]}
                    >
                      {date
                        .toLocaleDateString("en-US", { weekday: "narrow" })
                        .toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.weekDayNumber,
                        selected && styles.weekDayTextActive,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {count > 0 && (
                      <View
                        style={[
                          styles.weekDayDot,
                          selected && styles.weekDayDotActive,
                        ]}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {mode === "month" && (
            <MiniMonth
              bookings={bookings}
              deviceEvents={deviceEvents}
              focus={focus}
              month={focus}
              onSelect={setFocus}
            />
          )}

          {mode === "quarter" && (
            <View style={styles.quarter}>
              {[0, 1, 2].map((offset) => (
                <MiniMonth
                  bookings={bookings}
                  deviceEvents={deviceEvents}
                  focus={focus}
                  key={offset}
                  month={addMonths(focus, offset)}
                  onSelect={setFocus}
                />
              ))}
            </View>
          )}

          <View style={styles.agendaHeader}>
            <Text style={styles.agendaEyebrow}>
              {mode === "week" ? "THIS WEEK" : "SELECTED DAY"}
            </Text>
            <Text style={styles.agendaCount}>{agenda.length}</Text>
          </View>
          <View style={styles.agenda}>
            {agenda.map((item) => {
              const id =
                item.kind === "duna" ? item.booking.id : String(item.event.id);
              const selected =
                item.kind === "device" && selectedDeviceId === item.event.id;
              const title =
                item.kind === "duna"
                  ? item.booking.title
                  : item.event.title || "Calendar event";
              const location =
                item.kind === "duna"
                  ? item.booking.venueName
                  : item.event.location;
              return (
                <Pressable
                  key={`${item.kind}:${id}`}
                  onPress={() => {
                    if (item.kind === "duna") {
                      onOpenBooking(item.booking.id);
                      return;
                    }
                    setSelectedDeviceId(selected ? undefined : item.event.id);
                  }}
                  style={styles.agendaItem}
                >
                  <View
                    style={[
                      styles.agendaAccent,
                      item.kind === "device" && styles.agendaAccentDevice,
                    ]}
                  />
                  <View style={styles.agendaTime}>
                    <Text style={styles.agendaTimeText}>{eventTime(item)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.agendaTitle}>{title}</Text>
                    <Text style={styles.agendaMeta}>
                      {location ||
                        (item.kind === "duna" ? "Duna" : "Personal calendar")}
                    </Text>
                    {selected && item.kind === "device" && (
                      <View style={styles.deviceDetail}>
                        <Text style={styles.deviceDetailText}>
                          {new Date(item.event.startDate).toLocaleString(
                            "en-US",
                            {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            },
                          )}{" "}
                          –{" "}
                          {new Date(item.event.endDate).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "2-digit" },
                          )}
                        </Text>
                        {item.event.notes ? (
                          <Text
                            numberOfLines={3}
                            style={styles.deviceDetailText}
                          >
                            {item.event.notes}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                  <Text style={styles.agendaArrow}>
                    {item.kind === "duna" ? "›" : selected ? "⌃" : "⌄"}
                  </Text>
                </Pressable>
              );
            })}
            {agenda.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing scheduled.</Text>
                <Text style={styles.emptyBody}>
                  This is a clean window for a match, lesson, or recovery.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  agenda: {
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.cardRadius,
    borderWidth: mobileGrid.hairline,
    overflow: "hidden",
  },
  agendaAccent: {
    alignSelf: "stretch",
    backgroundColor: c.navy,
    width: 4,
  },
  agendaAccentDevice: { backgroundColor: c.sand },
  agendaArrow: { color: c.textTertiary, fontSize: 25 },
  agendaCount: { color: c.textSecondary, fontSize: 14, fontWeight: "600" },
  agendaEyebrow: {
    color: c.navy,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  agendaHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: mobileGrid[2],
    marginTop: mobileGrid[5],
  },
  agendaItem: {
    alignItems: "center",
    borderBottomColor: c.hairline,
    borderBottomWidth: mobileGrid.hairline,
    flexDirection: "row",
    minHeight: 76,
    paddingRight: mobileGrid[3],
  },
  agendaMeta: { color: c.textSecondary, fontSize: 14, marginTop: 3 },
  agendaTime: { paddingHorizontal: 12, width: 76 },
  agendaTimeText: { color: c.navy, fontSize: 13, fontWeight: "700" },
  agendaTitle: { color: c.ink, fontSize: 16, fontWeight: "600" },
  calendarNavTitle: {
    color: c.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  close: {
    alignItems: "center",
    backgroundColor: c.subtle,
    borderRadius: dunaAppShape.pillRadius,
    height: mobileGrid[10],
    justifyContent: "center",
    width: mobileGrid[10],
  },
  connection: {
    alignItems: "center",
    backgroundColor: c.subtleStrong,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.actionTileRadius,
    borderWidth: mobileGrid.hairline,
    flexDirection: "row",
    gap: mobileGrid[2],
    marginTop: mobileGrid[4],
    padding: mobileGrid[3],
  },
  connectionAction: {
    alignItems: "center",
    backgroundColor: c.ink,
    borderRadius: dunaAppShape.compactRadius,
    justifyContent: "center",
    minHeight: mobileGrid[10],
    paddingHorizontal: mobileGrid[3],
  },
  connectionActionText: { color: c.card, fontSize: 13, fontWeight: "700" },
  connectionBody: { color: c.textSecondary, fontSize: 13, marginTop: 2 },
  connectionMark: {
    alignItems: "center",
    backgroundColor: c.card,
    borderRadius: dunaAppShape.compactRadius,
    height: mobileGrid[9],
    justifyContent: "center",
    width: mobileGrid[9],
  },
  connectionMarkText: { color: c.navy, fontSize: 19 },
  connectionTitle: { color: c.ink, fontSize: 15, fontWeight: "600" },
  connectedSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: mobileGrid[3],
  },
  connectedSummaryMark: { color: c.positive, fontSize: 14, fontWeight: "700" },
  connectedSummaryText: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  content: {
    paddingBottom: mobileGrid[12],
    paddingHorizontal: mobileGrid[4],
    paddingTop: mobileGrid[4],
  },
  dayDots: { flexDirection: "row", gap: 2, marginTop: 2 },
  dayHero: {
    alignItems: "center",
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.cardRadius,
    borderWidth: mobileGrid.hairline,
    marginTop: mobileGrid[4],
    padding: mobileGrid[4],
  },
  dayHeroMonth: { color: c.textSecondary, fontSize: 15 },
  dayHeroNumber: {
    color: c.ink,
    fontSize: 60,
    fontWeight: "800",
    lineHeight: 68,
  },
  dayHeroWeekday: {
    color: c.navy,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  deviceDetail: {
    backgroundColor: c.subtle,
    borderRadius: 12,
    marginTop: 8,
    padding: 10,
  },
  deviceDetailText: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
  deviceDot: {
    backgroundColor: c.sand,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  dunaDot: {
    backgroundColor: c.navy,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  empty: { alignItems: "center", padding: 30 },
  emptyBody: {
    color: c.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
    textAlign: "center",
  },
  emptyTitle: { color: c.ink, fontSize: 18, fontWeight: "700" },
  eyebrow: {
    color: c.navy,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
  flex: { flex: 1, minWidth: 0 },
  header: {
    alignItems: "center",
    backgroundColor: c.page,
    borderBottomColor: c.hairline,
    borderBottomWidth: mobileGrid.hairline,
    flexDirection: "row",
    paddingHorizontal: mobileGrid[4],
    paddingVertical: mobileGrid[2],
  },
  headerSpacer: { height: mobileGrid[10], width: mobileGrid[10] },
  mode: {
    alignItems: "center",
    borderRadius: dunaAppShape.compactRadius,
    justifyContent: "center",
    minHeight: mobileGrid[10],
    paddingHorizontal: mobileGrid[4],
  },
  modeActive: { backgroundColor: c.ink },
  modeRail: {
    backgroundColor: c.subtle,
    borderRadius: dunaAppShape.cardRadius,
    gap: mobileGrid[1],
    padding: mobileGrid[1],
  },
  modeText: { color: c.textSecondary, fontSize: 14, fontWeight: "600" },
  modeTextActive: { color: c.card },
  month: {
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.cardRadius,
    borderWidth: mobileGrid.hairline,
    marginTop: mobileGrid[4],
    padding: mobileGrid[3],
  },
  monthDay: {
    alignItems: "center",
    height: 43,
    justifyContent: "center",
    width: "14.285%",
  },
  monthDayMuted: { color: c.textFaint },
  monthDaySelected: { backgroundColor: c.navy, borderRadius: 13 },
  monthDayText: { color: c.ink, fontSize: 13, fontWeight: "600" },
  monthDayTextSelected: { color: c.card },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  monthTitle: { color: c.ink, fontSize: 18, fontWeight: "700" },
  navButton: {
    alignItems: "center",
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.pillRadius,
    borderWidth: mobileGrid.hairline,
    height: mobileGrid[10],
    justifyContent: "center",
    width: mobileGrid[10],
  },
  navButtonText: { color: c.navy, fontSize: 30, lineHeight: 33 },
  navigator: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: mobileGrid[3],
  },
  notice: {
    color: c.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: mobileGrid[2],
  },
  quarter: { gap: 2 },
  rangeHeader: { gap: mobileGrid[1] },
  safe: { backgroundColor: c.page, flex: 1 },
  title: { color: c.ink, fontSize: 30, fontWeight: "700", lineHeight: 35 },
  todayButton: {
    alignItems: "center",
    borderColor: c.navy,
    borderRadius: dunaAppShape.compactRadius,
    borderWidth: mobileGrid.hairline,
    justifyContent: "center",
    minHeight: mobileGrid[10],
    paddingHorizontal: mobileGrid[4],
  },
  todayButtonText: { color: c.navy, fontSize: 14, fontWeight: "700" },
  week: {
    backgroundColor: c.card,
    borderColor: c.hairline,
    borderRadius: dunaAppShape.cardRadius,
    borderWidth: mobileGrid.hairline,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: mobileGrid[4],
    padding: mobileGrid[2],
  },
  weekDay: {
    alignItems: "center",
    borderRadius: 18,
    minHeight: 70,
    paddingVertical: 10,
    width: "13.5%",
  },
  weekDayActive: { backgroundColor: c.navy },
  weekDayDot: {
    backgroundColor: c.navy,
    borderRadius: 3,
    height: 5,
    marginTop: 5,
    width: 5,
  },
  weekDayDotActive: { backgroundColor: c.sand },
  weekDayLabel: { color: c.textSecondary, fontSize: 12, fontWeight: "600" },
  weekDayNumber: {
    color: c.ink,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  weekDayTextActive: { color: c.card },
  weekdayLabel: {
    color: c.textTertiary,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    width: "14.285%",
  },
  weekdayRow: { flexDirection: "row", marginTop: 13 },
});
