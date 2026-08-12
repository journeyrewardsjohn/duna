import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

const connectionKey = "duna-player-calendar-connection-v3";
const eventMapKey = "duna-player-calendar-events-v3";
const legacyConnectionKeys = [
  "duna-player-calendar-connection-v2",
  "duna-player-calendar-connection-v1",
] as const;
const legacyEventMapKeys = [
  "duna-player-calendar-events-v2",
  "duna-player-calendar-events-v1",
] as const;

export type PlayerCalendarSyncBooking = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly venueTimezone?: string;
  readonly status: "confirmed" | "waitlisted" | "needs-action";
  readonly location?: { readonly address?: string };
};

export type PlayerCalendarConnection = {
  readonly id: string;
  readonly title: string;
};

export type PlayerCalendarConflict = {
  readonly bookingId: string;
  readonly bookingTitle: string;
  readonly calendarTitle: string;
  readonly startsAt: string;
};

function dunaMarker(bookingId: string): string {
  return `[Duna booking: ${bookingId}]`;
}

export async function writablePlayerCalendars() {
  return (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter(
    (calendar) => calendar.allowsModifications,
  );
}

async function storedConnectionId(): Promise<string | undefined> {
  const current = await AsyncStorage.getItem(connectionKey);
  if (current) return current;
  for (const key of legacyConnectionKeys) {
    const legacy = await AsyncStorage.getItem(key);
    if (!legacy) continue;
    await AsyncStorage.setItem(connectionKey, legacy);
    return legacy;
  }
  return undefined;
}

async function readEventMap(): Promise<Record<string, string>> {
  for (const key of [eventMapKey, ...legacyEventMapKeys]) {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) continue;
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (parsed && typeof parsed === "object") {
        const value = parsed as Record<string, string>;
        if (key !== eventMapKey) {
          await AsyncStorage.setItem(eventMapKey, JSON.stringify(value));
        }
        return value;
      }
    } catch {
      // Ignore a damaged local map and create a clean one.
    }
  }
  return {};
}

export async function readPlayerCalendarConnection(): Promise<
  PlayerCalendarConnection | undefined
> {
  if (Platform.OS === "web") return undefined;
  const permission = await Calendar.getCalendarPermissions();
  if (!permission.granted) return undefined;
  const stored = await storedConnectionId();
  if (!stored) return undefined;
  const calendar = (await writablePlayerCalendars()).find(
    (candidate) => candidate.id === stored,
  );
  if (!calendar) return undefined;
  return { id: calendar.id, title: calendar.title };
}

export async function connectPlayerCalendar(): Promise<PlayerCalendarConnection> {
  if (Platform.OS === "web") {
    throw new Error("Open Duna on iPhone or Android to connect a calendar.");
  }
  const permission = await Calendar.requestCalendarPermissions(false);
  if (!permission.granted) {
    throw new Error(
      "Calendar access was not granted. Nothing was read or added.",
    );
  }
  const calendars = await writablePlayerCalendars();
  const preferred =
    calendars.find((calendar) => calendar.isPrimary) ?? calendars[0];
  if (!preferred) {
    throw new Error(
      "No writable Apple, Google, or Outlook calendar is on this device.",
    );
  }
  await AsyncStorage.setItem(connectionKey, preferred.id);
  return { id: preferred.id, title: preferred.title };
}

let syncInFlight: Promise<number> | undefined;

export async function syncPlayerBookings(
  bookings: readonly PlayerCalendarSyncBooking[],
): Promise<number> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const connection = await readPlayerCalendarConnection();
    if (!connection) return 0;
    const calendar = (await writablePlayerCalendars()).find(
      (candidate) => candidate.id === connection.id,
    );
    if (!calendar) return 0;
    const eventMap = await readEventMap();
    const upcoming = bookings.filter(
      (booking) =>
        booking.status === "confirmed" &&
        Date.parse(booking.endsAt) > Date.now(),
    );
    const upcomingIds = new Set(upcoming.map((booking) => booking.id));
    for (const [bookingId, eventId] of Object.entries(eventMap)) {
      if (upcomingIds.has(bookingId)) continue;
      try {
        const event = await Calendar.ExpoCalendarEvent.get(eventId);
        if (Date.parse(String(event.endDate)) > Date.now()) {
          await event.delete();
        }
      } catch {
        // The event may already have been removed from the device calendar.
      }
      delete eventMap[bookingId];
    }
    for (const booking of upcoming) {
      const details = {
        title: booking.title,
        startDate: new Date(booking.startsAt),
        endDate: new Date(booking.endsAt),
        location: booking.location?.address ?? booking.venueName,
        notes: `${dunaMarker(booking.id)}\nManaged from Duna Player.`,
        alarms: [{ relativeOffset: -60 }, { relativeOffset: -1_440 }],
        timeZone:
          booking.venueTimezone ??
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        url: `duna://booking/${encodeURIComponent(booking.id)}`,
      };
      const existingId = eventMap[booking.id];
      if (existingId) {
        try {
          const event = await Calendar.ExpoCalendarEvent.get(existingId);
          await event.update(details);
          continue;
        } catch {
          delete eventMap[booking.id];
        }
      }
      const event = await calendar.createEvent(details);
      eventMap[booking.id] = event.id;
    }
    await AsyncStorage.setItem(eventMapKey, JSON.stringify(eventMap));
    return upcoming.length;
  })().finally(() => {
    syncInFlight = undefined;
  });
  return syncInFlight;
}

export async function findPlayerCalendarConflicts(
  bookings: readonly PlayerCalendarSyncBooking[],
): Promise<readonly PlayerCalendarConflict[]> {
  const upcoming = bookings.filter(
    (booking) =>
      booking.status === "confirmed" && Date.parse(booking.endsAt) > Date.now(),
  );
  if (!upcoming.length) return [];
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  if (!calendars.length) return [];
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

export function PlayerCalendarAutoSync({
  bookings,
}: {
  readonly bookings: readonly PlayerCalendarSyncBooking[];
}) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sync = () => void syncPlayerBookings(bookings).catch(() => undefined);
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => subscription.remove();
  }, [bookings]);
  return null;
}
