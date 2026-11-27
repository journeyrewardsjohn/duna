/**
 * Calendar-date and wall-clock math for Tideline's date components. Dates are
 * ISO strings (`2026-11-25`) and times are 24-hour strings (`18:30`), the same
 * values the UI SDK date components use. Everything here is pure and works in
 * UTC, so a date never shifts with the device's time zone.
 */

export type IsoDate = string;
export type IsoTime = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME = /^(\d{2}):(\d{2})$/;
const DAY_MS = 86_400_000;

export interface DateParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

/** Days in a month; `month` is 1 to 12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The parts of a real calendar date, or `null` for anything else. */
export function parseIsoDate(value: string): DateParts | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

export function toIsoDate({ year, month, day }: DateParts): IsoDate {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function toUtc(value: IsoDate): number {
  const parts = parseIsoDate(value);
  if (!parts) throw new RangeError(`Not an ISO date: "${value}"`);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function fromUtc(time: number): IsoDate {
  const date = new Date(time);
  return toIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/** The date `amount` days later, or earlier when negative. */
export function addDays(value: IsoDate, amount: number): IsoDate {
  return fromUtc(toUtc(value) + Math.trunc(amount) * DAY_MS);
}

/** The same day `amount` months later, clamped to the month's last day. */
export function addMonths(value: IsoDate, amount: number): IsoDate {
  const parts = parseIsoDate(value);
  if (!parts) throw new RangeError(`Not an ISO date: "${value}"`);
  const index = parts.year * 12 + (parts.month - 1) + Math.trunc(amount);
  const year = Math.floor(index / 12);
  const month = (((index % 12) + 12) % 12) + 1;
  return toIsoDate({
    year,
    month,
    day: Math.min(parts.day, daysInMonth(year, month)),
  });
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Negative, zero or positive, for sorting. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return toUtc(a) - toUtc(b);
}

/** 0 for Sunday to 6 for Saturday. */
export function weekdayOf(value: IsoDate): number {
  return new Date(toUtc(value)).getUTCDay();
}

/** `count` consecutive dates starting at `start`. */
export function dayRange(start: IsoDate, count: number): IsoDate[] {
  const length = Math.max(0, Math.trunc(count));
  return Array.from({ length }, (_, index) => addDays(start, index));
}

/** The calendar date a `Date` falls on in a time zone (the device's by default). */
export function isoDateOf(date: Date, timeZone?: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return toIsoDate({
    year: read("year"),
    month: read("month"),
    day: read("day"),
  });
}

/** Formats a calendar date; the output never depends on the device's zone. */
export function formatIsoDate(
  value: IsoDate,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(toUtc(value)));
}

/** Minutes after midnight for a real `HH:MM` time, or `null`. */
export function parseTime(value: string): number | null {
  const match = ISO_TIME.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `HH:MM` for minutes after midnight, wrapped into one day. */
export function formatTime(minutesAfterMidnight: number): IsoTime {
  const total = ((Math.trunc(minutesAfterMidnight) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export interface TimeSlotRange {
  /** First slot, like `08:00`. */
  start: IsoTime;
  /** Slots start before this time, like `20:00`. */
  end: IsoTime;
  /** Minutes between slot starts. */
  stepMinutes: number;
}

/** Slot start times from `start` up to, but not including, `end`. */
export function timeSlots({
  start,
  end,
  stepMinutes,
}: TimeSlotRange): IsoTime[] {
  const from = parseTime(start);
  const to = parseTime(end);
  if (from === null || to === null) {
    throw new RangeError(`Not a time range: "${start}" to "${end}"`);
  }
  if (!Number.isFinite(stepMinutes) || stepMinutes <= 0) {
    throw new RangeError("stepMinutes must be greater than zero");
  }
  const slots: IsoTime[] = [];
  for (let minutes = from; minutes < to; minutes += stepMinutes) {
    slots.push(formatTime(minutes));
  }
  return slots;
}

/** A time in the locale's clock, like "6:30 PM" or "18:30". */
export function formatTimeLabel(
  value: IsoTime,
  locale: string | undefined,
  hourCycle?: 12 | 24,
): string {
  const minutes = parseTime(value);
  if (minutes === null) throw new RangeError(`Not a time: "${value}"`);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hourCycle === 12 ? "h12" : hourCycle === 24 ? "h23" : undefined,
    timeZone: "UTC",
  }).format(new Date(minutes * 60_000));
}
