/**
 * Time-zone honesty: whether a venue's zone differs from the viewer's, the
 * short name to show when it does, wall-clock minutes of an instant on a
 * venue's day, and the daylight-saving change on a day (if any).
 *
 * Nothing reads the clock or the device's zone: both zones are arguments.
 */
import {
  addDays,
  dayLengthMinutes,
  toIsoDate,
  zonedParts,
  zonedTimeToInstant,
  zoneOffsetMs,
  type CivilDate,
} from "./zoned-time";

const MINUTE_MS = 60_000;
const NARROW_SPACES = /[\u202f\u00a0]/g;

/**
 * True when the two zones show different wall-clock times at `instantMs`.
 * Zones that agree at that instant (Los Angeles and Tijuana) do not
 * differ, even though their names do.
 */
export function timeZonesDiffer(
  instantMs: number,
  venueTimeZone: string,
  viewerTimeZone: string,
): boolean {
  if (venueTimeZone === viewerTimeZone) return false;
  return (
    zoneOffsetMs(instantMs, venueTimeZone) !==
    zoneOffsetMs(instantMs, viewerTimeZone)
  );
}

/** The zone's short name at an instant in a locale: "PST", "EDT", "GMT+1". */
export function timeZoneLabel(
  instantMs: number,
  options: { readonly timeZone: string; readonly locale: string },
): string {
  const part = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    timeZoneName: "short",
  })
    .formatToParts(instantMs)
    .find((p) => p.type === "timeZoneName");
  return (part?.value ?? options.timeZone).replace(NARROW_SPACES, " ");
}

export interface TimeZoneNote {
  /** Show the zone: the venue's clock differs from the viewer's. */
  readonly differs: boolean;
  /** The venue zone's short name at that instant ("PST"). */
  readonly label: string;
  /** Venue minus viewer, in whole minutes (-180 when the venue is 3 h behind). */
  readonly offsetMinutes: number;
}

/** Everything a renderer needs to say "Times in PST" only when it matters. */
export function timeZoneNote(input: {
  readonly at: number;
  readonly timeZone: string;
  readonly viewerTimeZone: string;
  readonly locale: string;
}): TimeZoneNote {
  const offset =
    (zoneOffsetMs(input.at, input.timeZone) -
      zoneOffsetMs(input.at, input.viewerTimeZone)) /
    MINUTE_MS;
  return {
    differs: timeZonesDiffer(input.at, input.timeZone, input.viewerTimeZone),
    label: timeZoneLabel(input.at, {
      timeZone: input.timeZone,
      locale: input.locale,
    }),
    offsetMinutes: Math.round(offset),
  };
}

/**
 * Wall-clock minutes after the venue's midnight for an instant, as printed on
 * the venue's clock on `date`. An instant on the next local day reads past
 * 1440 (1:00 AM the next day is 1500); one on the previous day reads below 0.
 * On a fall-back day the repeated hour reads the same minutes twice; that is
 * what the clock says.
 */
export function wallClockMinutes(
  instantMs: number,
  date: CivilDate,
  timeZone: string,
): number {
  const parts = zonedParts(instantMs, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  const key = toIsoDate(parts);
  if (key === toIsoDate(date)) return minutes;
  if (key === toIsoDate(addDays(date, 1))) return minutes + 1440;
  if (key === toIsoDate(addDays(date, -1))) return minutes - 1440;
  // Further away: count whole days from the venue's midnight.
  const midnight = zonedTimeToInstant(date, 0, timeZone);
  return Math.round((instantMs - midnight) / MINUTE_MS);
}

export interface DstTransition {
  readonly kind: "spring-forward" | "fall-back";
  /** Wall-clock minute at which the clocks change (120 for 2:00 AM). */
  readonly atMinute: number;
  /** Minutes the clocks move: 60 for the usual hour, 30 in Lord Howe. */
  readonly shiftMinutes: number;
  /** The real length of the local day: 1380 or 1500 for a one-hour change. */
  readonly lengthMinutes: number;
}

/**
 * The daylight-saving change on a local day, or `null` on an ordinary day.
 * The change is found by stepping through the day's instants, so it works
 * for any zone the runtime knows, including half-hour shifts.
 */
export function dstTransition(
  date: CivilDate,
  timeZone: string,
): DstTransition | null {
  const length = dayLengthMinutes(date, timeZone);
  if (length === 1440) return null;
  const start = zonedTimeToInstant(date, 0, timeZone);
  const startOffset = zoneOffsetMs(start, timeZone);
  // Find the first quarter hour whose offset differs, then the exact minute.
  const step = 15 * MINUTE_MS;
  let changed = start;
  for (let t = start; t < start + 26 * 60 * MINUTE_MS; t += step) {
    if (zoneOffsetMs(t, timeZone) !== startOffset) {
      changed = t;
      break;
    }
  }
  let low = changed - step;
  let high = changed;
  while (high - low > MINUTE_MS) {
    const mid = low + Math.floor((high - low) / 2 / MINUTE_MS) * MINUTE_MS;
    if (mid === low) break;
    if (zoneOffsetMs(mid, timeZone) === startOffset) low = mid;
    else high = mid;
  }
  // `high` is the first instant on the new offset; read the clock just before.
  const before = zonedParts(high - MINUTE_MS, timeZone);
  return {
    kind: length < 1440 ? "spring-forward" : "fall-back",
    atMinute: before.hour * 60 + before.minute + 1,
    shiftMinutes: Math.abs(length - 1440),
    lengthMinutes: length,
  };
}
