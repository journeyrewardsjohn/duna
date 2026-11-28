/**
 * Pure sizing and naming for the native time parts. Rules (slot states,
 * dayparts, light) come from `@duna/tideline-core`; this file only decides
 * how wide a chip must be to hold its longest label at the current text size,
 * and the words a day cell says.
 */
import {
  addDays,
  parseIsoDate,
  timePartsFromMinutes,
  toIsoDate,
  weekdayOf,
} from "@duna/tideline-core";
import { fontScaleCap } from "../type/scale";

/** Chip time text: Geist 600 at 14 pt (`label`), tabular. */
export const SLOT_CHIP_FONT_SIZE = 14;
/** A conservative advance for Geist 600 tabular figures and capitals, in em. */
export const SLOT_CHAR_EM = 0.6;
/** 12 pt padding each side (the web chip's padding). */
export const SLOT_CHIP_PADDING = 12;
/** The 1.5 pt hairline, both sides. */
export const SLOT_CHIP_BORDER = 1.5;
/** The 14 pt light mark and the 6 pt gap before it. */
export const SLOT_CHIP_MARK = 14 + 6;
/** At most this many chips side by side, however wide the row. */
export const SLOT_MAX_COLUMNS = 4;
/** Never shorter than the 44 pt hit target. */
export const MIN_HIT = 44;

/** The system scale a 14 pt chip label actually renders at (its Dynamic Type cap). */
export function chipFontScale(fontScale: number): number {
  return Math.min(Math.max(fontScale, 1), fontScaleCap(SLOT_CHIP_FONT_SIZE));
}

/**
 * The narrowest chip that holds a label of `longestLabelChars` characters,
 * its light mark and its padding at `fontScale`. Rounded up to a whole point;
 * never under the 44 pt target.
 */
export function chipMinWidth(
  longestLabelChars: number,
  fontScale: number,
  options: { readonly withMark?: boolean } = {},
): number {
  const size = SLOT_CHIP_FONT_SIZE * chipFontScale(fontScale);
  const text = Math.max(1, longestLabelChars) * SLOT_CHAR_EM * size;
  const mark = options.withMark === false ? 0 : SLOT_CHIP_MARK;
  return Math.max(
    MIN_HIT,
    Math.ceil(text + mark + SLOT_CHIP_PADDING * 2 + SLOT_CHIP_BORDER * 2),
  );
}

export interface SlotGrid {
  readonly columns: number;
  /** Each chip's width: the row shared out, never below `minWidth`. */
  readonly chipWidth: number;
  readonly minWidth: number;
}

/**
 * How many chips fit side by side so that every chip holds the LONGEST label
 * at the current text size. Falls back to fewer columns, down to one, at the
 * largest accessibility sizes; a single column may be wider than the row only
 * when even one chip cannot fit (the chip then sets the width).
 */
export function slotGridColumns(input: {
  readonly containerWidth: number;
  readonly longestLabelChars: number;
  readonly fontScale: number;
  readonly gap: number;
  readonly withMark?: boolean;
  readonly maxColumns?: number;
}): SlotGrid {
  const minWidth = chipMinWidth(input.longestLabelChars, input.fontScale, {
    withMark: input.withMark,
  });
  const gap = Math.max(0, input.gap);
  const width = Math.max(0, input.containerWidth);
  const fit = Math.floor((width + gap) / (minWidth + gap));
  const columns = Math.max(
    1,
    Math.min(input.maxColumns ?? SLOT_MAX_COLUMNS, fit),
  );
  const shared = (width - gap * (columns - 1)) / columns;
  return {
    columns,
    chipWidth: Math.max(minWidth, Math.floor(shared * 100) / 100),
    minWidth,
  };
}

/** "10:30 PM" for a wall-clock minute; minutes past 1440 read on the next day's clock. */
export function minuteLabel(minute: number, locale: string): string {
  return timePartsFromMinutes(((minute % 1440) + 1440) % 1440, locale).text;
}

/** A calendar date's names in a locale, without a time zone shifting the day. */
export function dateNames(
  date: string,
  locale: string,
): {
  readonly weekdayShort: string;
  readonly monthShort: string;
  readonly long: string;
  readonly day: number;
} {
  const civil = parseIsoDate(date);
  if (!civil) return { weekdayShort: "", monthShort: "", long: date, day: 0 };
  const at = new Date(Date.UTC(civil.year, civil.month - 1, civil.day, 12));
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(at);
  return {
    weekdayShort: format({ weekday: "short" }),
    monthShort: format({ month: "short" }),
    long: format({ weekday: "long", month: "long", day: "numeric" }),
    day: civil.day,
  };
}

/** A day the strip can show. `StripDay` from `dayStrip()` fits. */
export interface DayStripDay {
  readonly date: string;
  /** Games, sessions or open slots that day; `0` shows an em dash. Omit for no count. */
  readonly count?: number | null;
  readonly isToday?: boolean;
  /** Nothing open: faded, still announced, cannot be chosen. */
  readonly faded?: boolean;
  /** Not offered at all (outside the booking window). */
  readonly disabled?: boolean;
}

export interface DayCell {
  readonly date: string;
  readonly weekday: number;
  readonly day: number;
  readonly startsMonth: boolean;
  readonly count: number | null;
  readonly today: boolean;
  readonly faded: boolean;
  readonly disabled: boolean;
}

/**
 * The cells a strip draws: `days` as given, or `count` days from `start`
 * (default today, then the selected day). Pure; mirrors the web strip.
 */
export function dayCells(input: {
  readonly days?: ReadonlyArray<DayStripDay>;
  readonly start?: string;
  readonly count?: number;
  readonly today?: string;
  readonly unavailable?: ReadonlyArray<string>;
  readonly value?: string | null;
}): DayCell[] {
  const faded = new Set(input.unavailable ?? []);
  const first = input.start ?? input.today ?? input.value ?? undefined;
  const list: ReadonlyArray<DayStripDay> =
    input.days ??
    (first && parseIsoDate(first)
      ? Array.from(
          { length: Math.max(0, Math.trunc(input.count ?? 14)) },
          (_, index) => ({
            date: toIsoDate(addDays(parseIsoDate(first)!, index)),
          }),
        )
      : []);
  return list.map((day, index) => {
    const civil = parseIsoDate(day.date);
    const previous =
      index > 0 ? parseIsoDate(list[index - 1]?.date ?? "") : null;
    return {
      date: day.date,
      weekday: civil ? weekdayOf(civil) : 0,
      day: civil?.day ?? 0,
      startsMonth:
        index === 0 ||
        (civil !== null && previous !== null && civil.month !== previous.month),
      count: day.count ?? null,
      today:
        day.isToday ?? (input.today !== undefined && day.date === input.today),
      faded: faded.has(day.date) || Boolean(day.faded),
      disabled: Boolean(day.disabled),
    };
  });
}

/** Whether `date` sits strictly between `start` and `end` (ISO dates compare as text). */
export function inRange(
  date: string,
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  if (!start || !end) return false;
  return date > start && date < end;
}
