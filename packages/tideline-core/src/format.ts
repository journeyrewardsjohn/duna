/**
 * Formatting helpers that take an explicit locale and time zone. Nothing here
 * reads the clock: "now" is always an argument.
 */

export interface TimeParts {
  /** "3" in "3:45 PM". */
  readonly hour: string;
  /** "45". */
  readonly minute: string;
  /** "PM", or `null` for 24-hour locales. */
  readonly dayPeriod: string | null;
  /** "3:45 PM", with ordinary spaces (never U+202F). */
  readonly text: string;
}

export interface TimeFormatOptions {
  readonly locale: string;
  readonly timeZone: string;
}

const NARROW_SPACES = /[\u202f\u00a0]/g;

export function timePartsOf(
  instantMs: number,
  options: TimeFormatOptions,
): TimeParts {
  const parts = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(instantMs);
  const pick = (type: string): string | undefined =>
    parts.find((part) => part.type === type)?.value;
  const dayPeriod = pick("dayPeriod")?.replace(NARROW_SPACES, " ") ?? null;
  return {
    hour: pick("hour") ?? "",
    minute: pick("minute") ?? "",
    dayPeriod,
    text: parts
      .map((part) => part.value)
      .join("")
      .replace(NARROW_SPACES, " "),
  };
}

/** "3:45 PM" in en-US. */
export function formatTime(
  instantMs: number,
  options: TimeFormatOptions,
): string {
  return timePartsOf(instantMs, options).text;
}

/**
 * Wall-clock time from minutes after midnight, for availability that is
 * already expressed in the venue's local day. "10:30 PM" is 1350.
 */
export function timePartsFromMinutes(
  minutes: number,
  locale: string,
): TimeParts {
  return timePartsOf(Date.UTC(2000, 0, 1) + minutes * 60_000, {
    locale,
    timeZone: "UTC",
  });
}

export interface TimeRangeParts {
  readonly start: TimeParts;
  readonly end: TimeParts;
  /** "3:45 – 5:15 PM" when both share a day period, else "3:45 PM – 5:15 AM". */
  readonly text: string;
}

/** A range such as "3:45 – 5:15 PM"; the period is shown once when shared. */
export function formatTimeRange(
  startMs: number,
  endMs: number,
  options: TimeFormatOptions,
): TimeRangeParts {
  const start = timePartsOf(startMs, options);
  const end = timePartsOf(endMs, options);
  const shared = start.dayPeriod !== null && start.dayPeriod === end.dayPeriod;
  const startText = shared ? `${start.hour}:${start.minute}` : start.text;
  return { start, end, text: `${startText} – ${end.text}` };
}

export interface CountdownParts {
  /** `now` inside one minute either side of the target. */
  readonly direction: "in" | "ago" | "now";
  readonly days: number;
  /** 0 to 23. */
  readonly hours: number;
  /** 0 to 59. */
  readonly minutes: number;
}

/** Whole days, hours and minutes between two instants (minutes floored). */
export function countdownParts(
  targetMs: number,
  nowMs: number,
): CountdownParts {
  const diff = targetMs - nowMs;
  const total = Math.floor(Math.abs(diff) / 60_000);
  if (Math.abs(diff) < 60_000)
    return { direction: "now", days: 0, hours: 0, minutes: 0 };
  return {
    direction: diff > 0 ? "in" : "ago",
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
  };
}

/** English countdown: "in 2h 05m", "in 12m", "in 1d 3h", "now", "5m ago". */
export function formatCountdown(parts: CountdownParts): string {
  if (parts.direction === "now") return "now";
  let body: string;
  if (parts.days > 0) body = `${parts.days}d ${parts.hours}h`;
  else if (parts.hours > 0)
    body = `${parts.hours}h ${String(parts.minutes).padStart(2, "0")}m`;
  else body = `${parts.minutes}m`;
  return parts.direction === "in" ? `in ${body}` : `${body} ago`;
}

export interface MoneyFormat {
  readonly currency: string;
  readonly locale: string;
}

export interface MoneyParts {
  readonly currency: string;
  /** Integer minor units, as given. */
  readonly minorUnits: number;
  /** Minor-unit digits of the currency: 2 for USD, 0 for JPY, 3 for KWD. */
  readonly fractionDigits: number;
  readonly parts: ReadonlyArray<{
    readonly type: string;
    readonly value: string;
  }>;
  readonly text: string;
}

/**
 * Money from integer minor units ("cents"). Rejects non-integers so a float
 * never reaches a price. The division uses the currency's own digit count.
 */
export function moneyParts(
  minorUnits: number,
  format: MoneyFormat,
): MoneyParts {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError("Money must be an integer count of minor units.");
  }
  const formatter = new Intl.NumberFormat(format.locale, {
    style: "currency",
    currency: format.currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const factor = 10 ** fractionDigits;
  const parts = formatter.formatToParts(minorUnits / factor);
  return {
    currency: format.currency,
    minorUnits,
    fractionDigits,
    parts,
    text: parts
      .map((part) => part.value)
      .join("")
      .replace(NARROW_SPACES, " "),
  };
}

/** "$45.00" for 4500 USD in en-US. */
export function formatMoney(minorUnits: number, format: MoneyFormat): string {
  return moneyParts(minorUnits, format).text;
}
