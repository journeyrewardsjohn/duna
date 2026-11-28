/**
 * Small pure helpers the time components share. Rules (slot states, dayparts,
 * light) come from `@duna/tideline-core`; this file only adapts its outputs
 * for rendering. No "use client": server components may call it.
 */
import {
  parseIsoDate,
  timePartsFromMinutes,
  type CivilDate,
} from "@duna/tideline-core";

/** A venue date as `YYYY-MM-DD` or `{ year, month, day }`. */
export type VenueDate = string | CivilDate;

export function civilDate(date: VenueDate): CivilDate {
  if (typeof date !== "string") return date;
  const parsed = parseIsoDate(date);
  if (!parsed) throw new RangeError(`Not a calendar date: ${date}`);
  return parsed;
}

/** "10:30 PM" for a wall-clock minute (1350). Minutes past 1440 read on the next day's clock. */
export function minuteLabel(minute: number, locale: string): string {
  return timePartsFromMinutes(((minute % 1440) + 1440) % 1440, locale).text;
}

/** "3:45 – 4:45 PM": the period once when both ends share it. */
export function minuteRangeLabel(
  from: number,
  to: number,
  locale: string,
): string {
  const a = timePartsFromMinutes(((from % 1440) + 1440) % 1440, locale);
  const b = timePartsFromMinutes(((to % 1440) + 1440) % 1440, locale);
  const shared = a.dayPeriod !== null && a.dayPeriod === b.dayPeriod;
  return `${shared ? `${a.hour}:${a.minute}` : a.text} – ${b.text}`;
}

/**
 * The smallest chip width, in `ch` of the chip's own font, that holds the
 * longest label plus its 14 px mark and 12 px padding on both sides. Being in
 * `ch` and `em`, it grows with the text size, so "10:30 PM" fits at 200 %.
 * A measured width replaces it once the chips are on screen.
 */
export function slotMinWidth(
  labels: ReadonlyArray<string>,
  withMark: boolean,
): string {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 5);
  // Letters such as M are wider than a digit: 0.25 em of slack per label.
  return `calc(${longest}ch + 0.25em + ${withMark ? "20px" : "0px"} + 24px)`;
}
