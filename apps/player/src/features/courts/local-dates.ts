export function localDateValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function localDateAnchor(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function addLocalDateDays(value: string, amount: number): string {
  const date = localDateAnchor(value);
  date.setDate(date.getDate() + amount);
  return localDateValue(date);
}

export function localDateDistance(start: string, end: string): number {
  return Math.max(
    0,
    Math.round(
      (localDateAnchor(end).getTime() - localDateAnchor(start).getTime()) /
        86_400_000,
    ),
  );
}

export function startOfLocalMonth(value: string): string {
  const date = localDateAnchor(value);
  date.setDate(1);
  return localDateValue(date);
}

export function addLocalMonths(value: string, amount: number): string {
  const date = localDateAnchor(startOfLocalMonth(value));
  date.setMonth(date.getMonth() + amount);
  return localDateValue(date);
}

export function localMonthCells(
  value: string,
): readonly (string | undefined)[] {
  const monthStart = localDateAnchor(startOfLocalMonth(value));
  const leading = monthStart.getDay();
  const lastDay = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  ).getDate();
  return [
    ...Array.from({ length: leading }, () => undefined),
    ...Array.from({ length: lastDay }, (_, index) =>
      addLocalDateDays(startOfLocalMonth(value), index),
    ),
  ];
}

export function shortLocalWeekday(value: string): string {
  const weekday = localDateAnchor(value).getDay();
  return ["Sun", "Mon", "Tues", "Wed", "Thu", "Fri", "Sat"][weekday] ?? "";
}

export function localMonthLabel(value: string): string {
  return localDateAnchor(value).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function instantLocalDateValue(
  instant: string,
  timezone?: string,
): string {
  if (!timezone) return localDateValue(new Date(instant));
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function localSlotTime(value: string): string {
  const [hourValue = "0", minuteValue = "00"] = value.slice(11, 16).split(":");
  const hour = Number(hourValue);
  return `${hour % 12 || 12}:${minuteValue} ${hour >= 12 ? "pm" : "am"}`;
}
