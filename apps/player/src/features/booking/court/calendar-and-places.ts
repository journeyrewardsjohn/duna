/**
 * Add to calendar and Directions for a confirmed court (M-P3). The calendar
 * opens the system's own "new event" form, pre-filled, so the person sees
 * and saves it themselves; Directions opens the phone's maps app.
 */
import { Linking, Platform } from "react-native";
import * as Calendar from "expo-calendar";

export type CalendarOutcome = "saved" | "cancelled" | "denied" | "unavailable";

export async function addToCalendar(input: {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly location?: string;
  readonly notes?: string;
  readonly url?: string;
}): Promise<CalendarOutcome> {
  const permission = await Calendar.requestCalendarPermissions(false);
  if (permission.status !== "granted") return "denied";
  const calendar =
    Platform.OS === "ios"
      ? Calendar.getDefaultCalendarSync()
      : (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).find(
          (entry) => entry.isPrimary && entry.allowsModifications,
        );
  if (!calendar) return "unavailable";
  const result = await calendar.addEventWithForm({
    title: input.title,
    startDate: new Date(input.startsAt),
    endDate: new Date(input.endsAt),
    ...(input.location ? { location: input.location } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.url ? { url: input.url } : {}),
  });
  return result.action === "saved" ? "saved" : "cancelled";
}

/** The maps link for a venue: coordinates when known, else its address. Pure. */
export function directionsUrl(
  input: {
    readonly name: string;
    readonly latitude?: number;
    readonly longitude?: number;
    readonly address?: string;
  },
  platform: string = Platform.OS,
): string | undefined {
  const query =
    input.latitude !== undefined && input.longitude !== undefined
      ? `${input.latitude},${input.longitude}`
      : input.address
        ? `${input.name}, ${input.address}`
        : undefined;
  if (!query) return undefined;
  const encoded = encodeURIComponent(query);
  return platform === "ios"
    ? `https://maps.apple.com/?daddr=${encoded}&q=${encodeURIComponent(input.name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

export async function openDirections(url: string): Promise<void> {
  await Linking.openURL(url);
}
