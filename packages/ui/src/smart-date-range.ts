export type SmartDateRangeValue = {
  readonly start: string;
  readonly end: string;
};

export type SmartDatePreset =
  | "today"
  | "tomorrow"
  | "this-weekend"
  | "next-7-days"
  | "next-30-days"
  | "this-month"
  | "next-month"
  | "this-quarter";

export type CalendarDay = {
  readonly date: string;
  readonly day: number;
  readonly inMonth: boolean;
};

function dateAtNoon(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!, 12, 0, 0, 0);
}

export function formatLocalDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalDays(value: string, days: number): string {
  const next = dateAtNoon(value);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
}

export function splitLocalDateTime(value: string): {
  readonly date: string;
  readonly time: string;
} {
  const [date = "", rawTime = ""] = value.split("T");
  return {
    date,
    time: /^\d{2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5) : "",
  };
}

export function combineLocalDateTime(
  date: string,
  time: string,
  timeEnabled: boolean,
): string {
  return timeEnabled ? `${date}T${time || "00:00"}` : date;
}

export function normalizeDateRange(
  start: string,
  end: string,
): { readonly start: string; readonly end: string } {
  return start <= end ? { start, end } : { start: end, end: start };
}

export function calendarMonthDays(
  year: number,
  monthIndex: number,
): readonly CalendarDay[] {
  const first = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date: formatLocalDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
    };
  });
}

export function quickDateRange(
  preset: SmartDatePreset,
  today: string,
): { readonly start: string; readonly end: string } {
  const current = dateAtNoon(today);
  if (preset === "today") return { start: today, end: today };
  if (preset === "tomorrow") {
    const tomorrow = addLocalDays(today, 1);
    return { start: tomorrow, end: tomorrow };
  }
  if (preset === "next-7-days") {
    return { start: today, end: addLocalDays(today, 6) };
  }
  if (preset === "next-30-days") {
    return { start: today, end: addLocalDays(today, 29) };
  }
  if (preset === "this-weekend") {
    const daysUntilSaturday = (6 - current.getDay() + 7) % 7;
    const saturday = addLocalDays(today, daysUntilSaturday);
    return { start: saturday, end: addLocalDays(saturday, 1) };
  }
  if (preset === "this-month") {
    const start = new Date(current.getFullYear(), current.getMonth(), 1, 12);
    const end = new Date(current.getFullYear(), current.getMonth() + 1, 0, 12);
    return { start: formatLocalDate(start), end: formatLocalDate(end) };
  }
  if (preset === "next-month") {
    const start = new Date(
      current.getFullYear(),
      current.getMonth() + 1,
      1,
      12,
    );
    const end = new Date(current.getFullYear(), current.getMonth() + 2, 0, 12);
    return { start: formatLocalDate(start), end: formatLocalDate(end) };
  }
  const quarterStartMonth = Math.floor(current.getMonth() / 3) * 3;
  const start = new Date(current.getFullYear(), quarterStartMonth, 1, 12);
  const end = new Date(current.getFullYear(), quarterStartMonth + 3, 0, 12);
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}
