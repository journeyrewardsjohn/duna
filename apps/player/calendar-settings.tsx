import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { FellixText as Text } from "./fellix-text";

const connectionKey = "duna-player-calendar-connection-v1";
const eventMapKey = "duna-player-calendar-events-v1";

export type PlayerCalendarBooking = {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly status: "confirmed" | "waitlisted" | "needs-action";
};

export type PlayerCalendarPalette = {
  readonly surface: string;
  readonly border: string;
  readonly accentSurface: string;
  readonly accent: string;
  readonly text: string;
  readonly muted: string;
  readonly positive: string;
  readonly warningSurface: string;
  readonly warning: string;
  readonly onWarning: string;
  readonly primary: string;
  readonly onPrimary: string;
};

type Conflict = {
  readonly bookingId: string;
  readonly bookingTitle: string;
  readonly calendarTitle: string;
  readonly startsAt: string;
};

function dunaMarker(bookingId: string): string {
  return `[Duna booking: ${bookingId}]`;
}

async function writableCalendars() {
  return (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter(
    (calendar) => calendar.allowsModifications,
  );
}

async function readEventMap(): Promise<Record<string, string>> {
  const stored = await AsyncStorage.getItem(eventMapKey);
  if (!stored) return {};
  try {
    const value = JSON.parse(stored) as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

async function findConflicts(
  bookings: readonly PlayerCalendarBooking[],
): Promise<readonly Conflict[]> {
  const upcoming = bookings.filter(
    (booking) =>
      booking.status === "confirmed" && Date.parse(booking.endsAt) > Date.now(),
  );
  if (upcoming.length === 0) return [];
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];
  const startsAt = new Date(
    Math.min(...upcoming.map((booking) => Date.parse(booking.startsAt))) -
      24 * 60 * 60_000,
  );
  const endsAt = new Date(
    Math.max(...upcoming.map((booking) => Date.parse(booking.endsAt))) +
      24 * 60 * 60_000,
  );
  const events = await Calendar.listEvents(calendars, startsAt, endsAt);
  return upcoming.flatMap((booking) => {
    const bookingStart = Date.parse(booking.startsAt);
    const bookingEnd = Date.parse(booking.endsAt);
    const conflict = events.find(
      (event) =>
        !event.notes?.includes(dunaMarker(booking.id)) &&
        Date.parse(String(event.startDate)) < bookingEnd &&
        Date.parse(String(event.endDate)) > bookingStart,
    );
    return conflict
      ? [
          {
            bookingId: booking.id,
            bookingTitle: booking.title,
            calendarTitle: conflict.title || "Calendar event",
            startsAt: booking.startsAt,
          },
        ]
      : [];
  });
}

export function PlayerCalendarSettings({
  bookings,
  palette,
}: {
  readonly bookings: readonly PlayerCalendarBooking[];
  readonly palette: PlayerCalendarPalette;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [calendarId, setCalendarId] = useState<string>();
  const [calendarTitle, setCalendarTitle] = useState<string>();
  const [conflicts, setConflicts] = useState<readonly Conflict[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(connectionKey).then(async (stored) => {
      if (!active || !stored || Platform.OS === "web") return;
      try {
        const permission = await Calendar.getCalendarPermissions();
        if (!permission.granted) return;
        const calendars = await writableCalendars();
        const connected = calendars.find((calendar) => calendar.id === stored);
        if (!connected || !active) return;
        setCalendarId(connected.id);
        setCalendarTitle(connected.title);
        setConflicts(await findConflicts(bookings));
      } catch {
        // A revoked device permission returns the card to its reconnect state.
      }
    });
    return () => {
      active = false;
    };
  }, [bookings]);

  async function connect() {
    if (Platform.OS === "web") {
      setNotice(
        "Open Duna Player on iPhone or Android to link a device calendar.",
      );
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      const permission = await Calendar.requestCalendarPermissions(false);
      if (!permission.granted) {
        setNotice(
          "Calendar access was not granted. Nothing was read or added.",
        );
        return;
      }
      const calendars = await writableCalendars();
      const preferred =
        calendars.find((calendar) => calendar.isPrimary) ?? calendars[0];
      if (!preferred) {
        setNotice(
          "No writable Apple, Google, or Outlook calendar is on this device.",
        );
        return;
      }
      await AsyncStorage.setItem(connectionKey, preferred.id);
      setCalendarId(preferred.id);
      setCalendarTitle(preferred.title);
      const nextConflicts = await findConflicts(bookings);
      setConflicts(nextConflicts);
      setNotice(
        nextConflicts.length
          ? `${nextConflicts.length} potential conflict${nextConflicts.length === 1 ? "" : "s"} found. Duna will never block your booking.`
          : "Calendar linked. No potential conflicts were found.",
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

  async function addBookings() {
    if (!calendarId) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const calendars = await writableCalendars();
      const calendar = calendars.find(
        (candidate) => candidate.id === calendarId,
      );
      if (!calendar) throw new Error("Reconnect your calendar before syncing.");
      const eventMap = await readEventMap();
      const upcoming = bookings.filter(
        (booking) =>
          booking.status === "confirmed" &&
          Date.parse(booking.endsAt) > Date.now(),
      );
      let synced = 0;
      for (const booking of upcoming) {
        const details = {
          title: booking.title,
          startDate: new Date(booking.startsAt),
          endDate: new Date(booking.endsAt),
          location: booking.venueName,
          notes: `${dunaMarker(booking.id)}\nManaged from Duna Player.`,
          alarms: [{ relativeOffset: -60 }, { relativeOffset: -1_440 }],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          url: `duna://booking/${encodeURIComponent(booking.id)}`,
        };
        const existingId = eventMap[booking.id];
        if (existingId) {
          try {
            const event = await Calendar.ExpoCalendarEvent.get(existingId);
            await event.update(details);
            synced += 1;
            continue;
          } catch {
            delete eventMap[booking.id];
          }
        }
        const event = await calendar.createEvent(details);
        eventMap[booking.id] = event.id;
        synced += 1;
      }
      await AsyncStorage.setItem(eventMapKey, JSON.stringify(eventMap));
      setConflicts(await findConflicts(bookings));
      setNotice(
        synced
          ? `${synced} upcoming booking${synced === 1 ? "" : "s"} synced with one-day and one-hour reminders.`
          : "There are no confirmed upcoming bookings to add yet.",
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Duna could not add these bookings.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.mark}>
          <Text style={styles.markText}>▦</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>CLUB CALENDAR</Text>
          <Text style={styles.title}>Plans without surprises.</Text>
        </View>
        <Text style={calendarId ? styles.connected : styles.disconnected}>
          {calendarId ? "CONNECTED" : "PRIVATE"}
        </Text>
      </View>
      <Text style={styles.body}>
        Duna checks for potential conflicts on this device and can add confirmed
        sessions with location and reminders. Calendar events are never used to
        block a booking.
      </Text>
      {calendarTitle && (
        <Text style={styles.calendarName}>Using {calendarTitle}</Text>
      )}
      {conflicts.slice(0, 3).map((conflict) => (
        <View key={conflict.bookingId} style={styles.conflict}>
          <Text style={styles.conflictMark}>!</Text>
          <View style={styles.flex}>
            <Text style={styles.conflictTitle}>{conflict.bookingTitle}</Text>
            <Text style={styles.conflictBody}>
              May overlap “{conflict.calendarTitle}” ·{" "}
              {new Date(conflict.startsAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
      ))}
      {notice && <Text style={styles.notice}>{notice}</Text>}
      <View style={styles.actions}>
        <Pressable
          disabled={busy}
          onPress={() => void connect()}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>
            {calendarId
              ? "Change calendar"
              : busy
                ? "Connecting…"
                : "Link calendar"}
          </Text>
        </Pressable>
        <Pressable
          disabled={busy || !calendarId}
          onPress={() => void addBookings()}
          style={[styles.primary, (!calendarId || busy) && styles.disabled]}
        >
          <Text style={styles.primaryText}>
            {busy ? "Syncing…" : "Add bookings + reminders"}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.privacy}>
        Conflict matching stays on your device. Duna stores only your calendar
        preference and the events it creates.
      </Text>
    </View>
  );
}

const base = {
  card: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    marginTop: 18,
    padding: 16,
  },
  heading: { alignItems: "center", flexDirection: "row", gap: 10 },
  mark: {
    alignItems: "center",
    borderRadius: 13,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  markText: { fontSize: 20, fontWeight: "900" },
  flex: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  title: { fontSize: 20, fontWeight: "900", letterSpacing: -0.4, marginTop: 3 },
  connected: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  disconnected: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  body: { fontSize: 14, lineHeight: 21 },
  calendarName: { fontSize: 12, fontWeight: "800" },
  conflict: {
    alignItems: "flex-start",
    borderRadius: 14,
    flexDirection: "row",
    gap: 9,
    padding: 11,
  },
  conflictMark: {
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "900",
    height: 24,
    lineHeight: 23,
    textAlign: "center",
    width: 24,
  },
  conflictTitle: { fontSize: 13, fontWeight: "900" },
  conflictBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  notice: { fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8 },
  primary: {
    alignItems: "center",
    borderRadius: 13,
    flex: 1.35,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 10,
  },
  primaryText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  secondary: {
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 10,
  },
  secondaryText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  privacy: { fontSize: 10, lineHeight: 15 },
  disabled: { opacity: 0.45 },
} as const;

function createStyles(palette: PlayerCalendarPalette) {
  return StyleSheet.create({
    ...base,
    card: {
      ...base.card,
      backgroundColor: palette.surface,
      borderColor: palette.border,
    },
    mark: { ...base.mark, backgroundColor: palette.accentSurface },
    markText: { ...base.markText, color: palette.accent },
    eyebrow: { ...base.eyebrow, color: palette.muted },
    title: { ...base.title, color: palette.text },
    body: { ...base.body, color: palette.muted },
    connected: { ...base.connected, color: palette.positive },
    disconnected: { ...base.disconnected, color: palette.muted },
    calendarName: { ...base.calendarName, color: palette.accent },
    conflict: { ...base.conflict, backgroundColor: palette.warningSurface },
    conflictMark: {
      ...base.conflictMark,
      backgroundColor: palette.warning,
      color: palette.onWarning,
    },
    conflictTitle: { ...base.conflictTitle, color: palette.text },
    conflictBody: { ...base.conflictBody, color: palette.muted },
    notice: { ...base.notice, color: palette.accent },
    primary: { ...base.primary, backgroundColor: palette.primary },
    primaryText: { ...base.primaryText, color: palette.onPrimary },
    secondary: { ...base.secondary, borderColor: palette.border },
    secondaryText: { ...base.secondaryText, color: palette.text },
    privacy: { ...base.privacy, color: palette.muted },
  });
}
