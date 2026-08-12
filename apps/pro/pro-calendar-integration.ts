import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

const connectionKey = "duna-pro-calendar-connection-v1";

export type ProPersonalCalendarEvent = Awaited<
  ReturnType<typeof Calendar.listEvents>
>[number];

export type ProCalendarConnection = {
  readonly id: string;
  readonly title: string;
};

async function deviceCalendars() {
  return Calendar.getCalendars(Calendar.EntityTypes.EVENT);
}

export async function readProCalendarConnection(): Promise<
  ProCalendarConnection | undefined
> {
  if (Platform.OS === "web") return undefined;
  const permission = await Calendar.getCalendarPermissions();
  if (!permission.granted) return undefined;
  const stored = await AsyncStorage.getItem(connectionKey);
  if (!stored) return undefined;
  const calendar = (await deviceCalendars()).find(
    (candidate) => candidate.id === stored,
  );
  return calendar ? { id: calendar.id, title: calendar.title } : undefined;
}

export async function connectProCalendar(): Promise<ProCalendarConnection> {
  if (Platform.OS === "web") {
    throw new Error("Open Duna Pro on iPhone or Android to link a calendar.");
  }
  const permission = await Calendar.requestCalendarPermissions(false);
  if (!permission.granted) {
    throw new Error("Calendar access was not granted. Nothing was imported.");
  }
  const calendars = await deviceCalendars();
  const preferred =
    calendars.find(
      (calendar) => calendar.isPrimary && calendar.allowsModifications,
    ) ??
    calendars.find((calendar) => calendar.isPrimary) ??
    calendars[0];
  if (!preferred) {
    throw new Error("No Apple, Google, or Outlook calendar is on this device.");
  }
  await AsyncStorage.setItem(connectionKey, preferred.id);
  return { id: preferred.id, title: preferred.title };
}

export async function loadProPersonalEvents(
  startsAt: Date,
  endsAt: Date,
): Promise<readonly ProPersonalCalendarEvent[]> {
  const connection = await readProCalendarConnection();
  if (!connection) return [];
  const calendars = await deviceCalendars();
  const linkedCalendar = calendars.find(
    (calendar) => calendar.id === connection.id,
  );
  if (!linkedCalendar) return [];
  return Calendar.listEvents([linkedCalendar], startsAt, endsAt);
}
