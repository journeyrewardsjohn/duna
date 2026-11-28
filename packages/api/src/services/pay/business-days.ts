/**
 * Business days for the payout promise (payout-policy §2): Monday to Friday,
 * excluding US federal bank holidays (observed: a Saturday holiday moves to
 * Friday, a Sunday holiday to Monday). Dates are calendar days in UTC; the
 * payout cron runs on UTC days, so the same calendar is used throughout.
 * Pure.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** The nth (1-based) weekday of a month; n = -1 is the last. */
function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  if (n > 0) {
    const first = utcDate(year, month, 1);
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return utcDate(year, month, 1 + offset + (n - 1) * 7);
  }
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, month, last.getUTCDate() - offset);
}

function observed(date: Date): Date {
  const weekday = date.getUTCDay();
  if (weekday === 6) return new Date(date.getTime() - DAY_MS);
  if (weekday === 0) return new Date(date.getTime() + DAY_MS);
  return date;
}

const holidayCache = new Map<number, ReadonlySet<string>>();

/** ISO dates (YYYY-MM-DD) of the observed US federal holidays in a year. */
export function usFederalHolidays(year: number): ReadonlySet<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const dates = [
    observed(utcDate(year, 0, 1)), // New Year's Day
    nthWeekday(year, 0, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 1, 1, 3), // Washington's Birthday
    nthWeekday(year, 4, 1, -1), // Memorial Day
    observed(utcDate(year, 5, 19)), // Juneteenth
    observed(utcDate(year, 6, 4)), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 9, 1, 2), // Columbus Day
    observed(utcDate(year, 10, 11)), // Veterans Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observed(utcDate(year, 11, 25)), // Christmas Day
  ];
  // New Year's Day of the next year observed on 31 December.
  const nextNewYear = observed(utcDate(year + 1, 0, 1));
  if (nextNewYear.getUTCFullYear() === year) dates.push(nextNewYear);
  const set = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  holidayCache.set(year, set);
  return set;
}

export function isBusinessDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !usFederalHolidays(date.getUTCFullYear()).has(
    date.toISOString().slice(0, 10),
  );
}

/**
 * The instant `days` business days after `from`, keeping the time of day.
 * Zero days returns `from` unchanged.
 */
export function addBusinessDays(from: Date, days: number): Date {
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new Error("Business days must be a non-negative integer.");
  }
  let cursor = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isBusinessDay(cursor)) remaining -= 1;
  }
  return cursor;
}

/** Whole business days strictly after `from` up to and including `to`'s day. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  let cursor = utcDate(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const end = utcDate(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor < end) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}
