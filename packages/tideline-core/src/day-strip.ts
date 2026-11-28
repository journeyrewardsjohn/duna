/**
 * Day strip: the days to show, with counts, a "today" marker and empty days.
 * Dates are the venue's local calendar days in an explicit IANA time zone, so
 * a late-evening game never lands on the wrong day and a daylight-saving day
 * is a normal day with a different length.
 */
import {
  addDays,
  dayLengthMinutes,
  localDateOf,
  parseIsoDate,
  toIsoDate,
  weekdayOf,
  type CivilDate,
  type IsoDate,
} from "./zoned-time";

export interface DatedItem {
  /** Epoch milliseconds of the item's start. */
  readonly startsAt: number;
}

export interface DayStripInput {
  readonly items: ReadonlyArray<DatedItem>;
  readonly timeZone: string;
  /** Epoch milliseconds of "now", from the caller. */
  readonly now: number;
  /** Number of days to show. Default 7. */
  readonly days?: number;
  /**
   * `rolling` starts the strip on `startDate` (default today); `week` starts
   * it on the first day of the week containing `startDate`.
   */
  readonly mode?: "rolling" | "week";
  /** First local day of the strip (`YYYY-MM-DD`); default today. */
  readonly startDate?: IsoDate;
  /** 0 is Sunday. Default 0 (US convention); pass 1 for Monday weeks. */
  readonly weekStartsOn?: number;
}

export interface StripDay {
  readonly date: IsoDate;
  /** 0 is Sunday. */
  readonly weekday: number;
  readonly dayOfMonth: number;
  readonly count: number;
  readonly isToday: boolean;
  readonly isPast: boolean;
  /** True when there is nothing on this day: render an em dash, not "0". */
  readonly isEmpty: boolean;
  /** True on the first day of a week, so a renderer can draw a boundary. */
  readonly startsWeek: boolean;
  /** 1440 normally; 1380 or 1500 on a daylight-saving change (1410 / 1470 in Lord Howe). */
  readonly lengthMinutes: number;
  readonly dst: "none" | "spring-forward" | "fall-back";
}

export interface DayStripModel {
  readonly days: ReadonlyArray<StripDay>;
  /** Index of today in `days`, or -1 if today is outside the strip. */
  readonly todayIndex: number;
  readonly total: number;
}

export function dayStrip(input: DayStripInput): DayStripModel {
  const count = Math.max(1, Math.floor(input.days ?? 7));
  const weekStartsOn = (((input.weekStartsOn ?? 0) % 7) + 7) % 7;
  const todayKey = localDateOf(input.now, input.timeZone);
  const startKey = input.startDate ?? todayKey;
  const parsedStart: CivilDate =
    parseIsoDate(startKey) ?? (parseIsoDate(todayKey) as CivilDate);

  let first = parsedStart;
  if (input.mode === "week") {
    const back = (weekdayOf(parsedStart) - weekStartsOn + 7) % 7;
    first = addDays(parsedStart, -back);
  }

  const perDay = new Map<IsoDate, number>();
  for (const item of input.items) {
    const key = localDateOf(item.startsAt, input.timeZone);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const days: StripDay[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const date = addDays(first, i);
    const key = toIsoDate(date);
    const n = perDay.get(key) ?? 0;
    total += n;
    const length = dayLengthMinutes(date, input.timeZone);
    days.push({
      date: key,
      weekday: weekdayOf(date),
      dayOfMonth: date.day,
      count: n,
      isToday: key === todayKey,
      isPast: key < todayKey,
      isEmpty: n === 0,
      startsWeek: weekdayOf(date) === weekStartsOn,
      lengthMinutes: length,
      dst:
        length < 1440 ? "spring-forward" : length > 1440 ? "fall-back" : "none",
    });
  }

  return { days, todayIndex: days.findIndex((d) => d.isToday), total };
}
