import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SatoshiText as Text } from "./satoshi-text";
import {
  connectPlayerCalendar,
  findPlayerCalendarConflicts,
  readPlayerCalendarConnection,
  syncPlayerBookings,
  type PlayerCalendarConflict,
  type PlayerCalendarSyncBooking,
} from "./player-calendar-sync";

export type PlayerCalendarBooking = PlayerCalendarSyncBooking;

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

export function PlayerCalendarSettings({
  bookings,
  palette,
}: {
  readonly bookings: readonly PlayerCalendarBooking[];
  readonly palette: PlayerCalendarPalette;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [calendarTitle, setCalendarTitle] = useState<string>();
  const [conflicts, setConflicts] = useState<readonly PlayerCalendarConflict[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;
    void readPlayerCalendarConnection()
      .then(async (connection) => {
        if (!active || !connection) return;
        setCalendarTitle(connection.title);
        await syncPlayerBookings(bookings);
        if (active) setConflicts(await findPlayerCalendarConflicts(bookings));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [bookings]);

  async function connect() {
    setBusy(true);
    setNotice(undefined);
    try {
      const connection = await connectPlayerCalendar();
      setCalendarTitle(connection.title);
      const synced = await syncPlayerBookings(bookings);
      const nextConflicts = await findPlayerCalendarConflicts(bookings);
      setConflicts(nextConflicts);
      setNotice(
        `${connection.title} is linked. ${synced} upcoming booking${synced === 1 ? "" : "s"} will stay updated automatically.`,
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
        <Text style={calendarTitle ? styles.connected : styles.disconnected}>
          {calendarTitle ? "CONNECTED" : "PRIVATE"}
        </Text>
      </View>
      <Text style={styles.body}>
        Duna checks for potential conflicts on this device and keeps confirmed
        sessions, locations, and reminders current automatically.
      </Text>
      {calendarTitle ? (
        <View style={styles.autoSyncRow}>
          <Text style={styles.autoSyncMark}>✓</Text>
          <View style={styles.flex}>
            <Text style={styles.calendarName}>Using {calendarTitle}</Text>
            <Text style={styles.privacy}>New plans sync automatically.</Text>
          </View>
        </View>
      ) : null}
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
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Pressable
        disabled={busy}
        onPress={() => void connect()}
        style={calendarTitle ? styles.secondary : styles.primary}
      >
        <Text style={calendarTitle ? styles.secondaryText : styles.primaryText}>
          {busy
            ? "Connecting…"
            : calendarTitle
              ? "Change calendar"
              : "Link calendar"}
        </Text>
      </Pressable>
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
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  title: { fontSize: 20, fontWeight: "900", letterSpacing: -0.4, marginTop: 3 },
  connected: { fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  disconnected: { fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  body: { fontSize: 14, lineHeight: 21 },
  calendarName: { fontSize: 12, fontWeight: "800" },
  autoSyncRow: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 9,
    padding: 11,
  },
  autoSyncMark: { fontSize: 16, fontWeight: "900" },
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
  primary: {
    alignItems: "center",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 10,
  },
  primaryText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  secondary: {
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 10,
  },
  secondaryText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  privacy: { fontSize: 12, lineHeight: 15 },
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
    autoSyncRow: {
      ...base.autoSyncRow,
      backgroundColor: palette.accentSurface,
    },
    autoSyncMark: { ...base.autoSyncMark, color: palette.positive },
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
