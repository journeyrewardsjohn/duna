import { formatVenueTime } from "@duna/core";

export function calendarDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function calendarDayAtNoon(date: Date, offset: number): Date {
  const value = new Date(date);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value;
}

export function formatCalendarDay(date: Date): {
  readonly weekday: string;
  readonly day: string;
  readonly month: string;
} {
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
      date,
    ),
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
  };
}

export function formatCalendarTime(iso: string, timezone: string): string {
  return formatVenueTime(iso, timezone, "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function zonedLocalToIso(
  dateKey: string,
  hour: number,
  minute: number,
  timezone: string,
): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredUtc = Date.UTC(year!, month! - 1, day!, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(desiredUtc));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const representedUtc = Date.UTC(
    values.year!,
    values.month! - 1,
    values.day!,
    values.hour!,
    values.minute!,
    values.second!,
  );
  const firstPass = desiredUtc - (representedUtc - desiredUtc);
  const firstParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(firstPass));
  const firstValues = Object.fromEntries(
    firstParts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const remaining =
    Date.UTC(year!, month! - 1, day!, hour, minute) -
    Date.UTC(
      firstValues.year!,
      firstValues.month! - 1,
      firstValues.day!,
      firstValues.hour!,
      firstValues.minute!,
    );
  return new Date(firstPass + remaining).toISOString();
}
