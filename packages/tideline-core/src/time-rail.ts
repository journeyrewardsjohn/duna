/**
 * Time rail: the venue's day as a vertical rail of events and free windows,
 * with a "now" line and sunrise / sunset marks. Wall-clock minutes after the
 * venue's midnight, like `timeSlots`; positions are fractions of the rail
 * (0 at the top, 1 at the bottom) so any renderer can scale them.
 */
import type { DayLight } from "./dayparts";

export interface RailEventInput {
  readonly id: string;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface RailPlaced {
  readonly startMinute: number;
  readonly endMinute: number;
  /** Fraction of the rail from the top. */
  readonly top: number;
  /** Fraction of the rail. */
  readonly height: number;
}

export interface RailEvent<Event extends RailEventInput> extends RailPlaced {
  readonly event: Event;
  /** 0 for the first column; overlapping events take the next free column. */
  readonly lane: number;
  /** How many columns the event's overlap group needs. */
  readonly lanes: number;
}

export interface RailMark {
  readonly minute: number;
  readonly at: number;
}

export interface RailModel<Event extends RailEventInput> {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly events: ReadonlyArray<RailEvent<Event>>;
  /** Gaps between events at least `minFreeMinutes` long. */
  readonly free: ReadonlyArray<RailPlaced>;
  /** `null` when now is outside the rail (or another day). */
  readonly now: RailMark | null;
  readonly sunrise: RailMark | null;
  readonly sunset: RailMark | null;
  readonly goldenHour: RailMark | null;
  /** Whole hours to label, inside the rail. */
  readonly hours: ReadonlyArray<RailMark>;
}

export interface RailInput<Event extends RailEventInput> {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly events: ReadonlyArray<Event>;
  /** Wall-clock minute now, when the rail shows today. */
  readonly nowMinute?: number | null;
  readonly light?: DayLight | null;
  /** Shorter gaps are not called free. Default 30. */
  readonly minFreeMinutes?: number;
  /** Label every this many minutes. Default 60. */
  readonly hourStep?: number;
}

export function railModel<Event extends RailEventInput>(
  input: RailInput<Event>,
): RailModel<Event> {
  const start = input.startMinute;
  const end = Math.max(input.endMinute, start + 1);
  const span = end - start;
  const at = (minute: number): number =>
    Math.min(1, Math.max(0, (minute - start) / span));
  const mark = (minute: number | null | undefined): RailMark | null =>
    minute == null || minute < start || minute > end
      ? null
      : { minute, at: at(minute) };

  const clipped = input.events
    .map((event) => ({
      event,
      s: Math.max(start, event.startMinute),
      e: Math.min(end, event.endMinute),
    }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s || b.e - a.e);

  // Lanes: greedy, per overlap group.
  const events: RailEvent<Event>[] = [];
  let group: { lane: number; index: number; e: number }[] = [];
  let groupEnd = -Infinity;
  const closeGroup = () => {
    const lanes = group.reduce((m, g) => Math.max(m, g.lane + 1), 1);
    for (const g of group) {
      const placed = events[g.index] as RailEvent<Event>;
      events[g.index] = { ...placed, lanes };
    }
    group = [];
  };
  for (const x of clipped) {
    if (x.s >= groupEnd) {
      closeGroup();
      groupEnd = -Infinity;
    }
    const busy = new Set(group.filter((g) => g.e > x.s).map((g) => g.lane));
    let lane = 0;
    while (busy.has(lane)) lane += 1;
    events.push({
      event: x.event,
      startMinute: x.s,
      endMinute: x.e,
      top: at(x.s),
      height: at(x.e) - at(x.s),
      lane,
      lanes: 1,
    });
    group.push({ lane, index: events.length - 1, e: x.e });
    groupEnd = Math.max(groupEnd, x.e);
  }
  closeGroup();

  const minFree = input.minFreeMinutes ?? 30;
  const free: RailPlaced[] = [];
  let cursor = start;
  for (const x of clipped) {
    if (x.s - cursor >= minFree) {
      free.push({
        startMinute: cursor,
        endMinute: x.s,
        top: at(cursor),
        height: at(x.s) - at(cursor),
      });
    }
    cursor = Math.max(cursor, x.e);
  }
  if (end - cursor >= minFree) {
    free.push({
      startMinute: cursor,
      endMinute: end,
      top: at(cursor),
      height: at(end) - at(cursor),
    });
  }

  const step = input.hourStep ?? 60;
  const hours: RailMark[] = [];
  for (let m = Math.ceil(start / step) * step; m <= end; m += step) {
    hours.push({ minute: m, at: at(m) });
  }

  return {
    startMinute: start,
    endMinute: end,
    events,
    free,
    now: mark(input.nowMinute),
    sunrise: mark(input.light?.sunriseMinute),
    sunset: mark(input.light?.sunsetMinute),
    goldenHour: mark(input.light?.goldenHourMinute),
    hours,
  };
}
