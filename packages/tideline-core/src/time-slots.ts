/**
 * Time slots and duration choices for booking a court or a lesson.
 *
 * Everything is in WALL-CLOCK minutes after the venue's local midnight, so the
 * module needs no time zone. Closing may be after midnight (1500 is 1:00 AM).
 * On a daylight-saving change day the caller supplies open, close and blocks
 * in wall-clock minutes as printed on the venue's clock; a slot is never
 * offered that would run past closing or across an unavailable block.
 */
import { timePartsFromMinutes, type TimeParts } from "./format";

/** Durations a club offers unless it configures its own. */
export const DEFAULT_DURATIONS: ReadonlyArray<number> = [60, 90, 120, 180];
/** Start times are offered every 30 minutes unless the club says otherwise. */
export const DEFAULT_SLOT_STEP = 30;

export type BlockReason = "booked" | "held" | "maintenance" | "closed";

export interface AvailabilityBlock {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly reason: BlockReason;
}

export interface DayAvailability {
  readonly openMinute: number;
  readonly closeMinute: number;
  readonly blocks: ReadonlyArray<AvailabilityBlock>;
  /**
   * Wall-clock minute "now" when this day is today; starts before it are
   * unavailable. `null` or omitted for any other day.
   */
  readonly nowMinute?: number | null;
}

export type SlotReason = BlockReason | "in-the-past" | "runs-past-closing";

export interface Slot {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly available: boolean;
  /** Why it cannot be chosen; `null` when available. */
  readonly reason: SlotReason | null;
  readonly start: TimeParts;
  readonly end: TimeParts;
}

export interface DurationLabel {
  readonly hours: number;
  readonly minutes: number;
  /** "60 min", "90 min", "2 h", "2 h 30 min". */
  readonly text: string;
}

export interface DurationChoice {
  readonly minutes: number;
  readonly label: DurationLabel;
  readonly selected: boolean;
  /** At least one start time is available for this length. */
  readonly selectable: boolean;
}

export interface TimeSlotsInput {
  readonly availability: DayAvailability;
  /** The club's enabled durations; default 60 / 90 / 120 / 180. */
  readonly enabledDurations?: ReadonlyArray<number>;
  /** The chosen duration; falls back to the nearest enabled one. */
  readonly duration: number;
  readonly step?: number;
  readonly locale: string;
}

export interface TimeSlotsModel {
  /** The duration actually used (the chosen one if enabled). */
  readonly duration: number;
  readonly durations: ReadonlyArray<DurationChoice>;
  /** Every candidate start, available or not, in time order. */
  readonly slots: ReadonlyArray<Slot>;
  /** Start minutes that can be selected. */
  readonly selectableStarts: ReadonlyArray<number>;
}

/** Positive whole minutes, de-duplicated and sorted; defaults when empty. */
export function normalizeDurations(enabled?: ReadonlyArray<number>): number[] {
  const clean = Array.from(
    new Set((enabled ?? []).filter((m) => Number.isInteger(m) && m > 0)),
  ).sort((a, b) => a - b);
  return clean.length > 0 ? clean : [...DEFAULT_DURATIONS];
}

/** The chosen duration if enabled, else the nearest enabled one (shorter wins a tie). */
export function resolveDuration(
  enabled: ReadonlyArray<number>,
  chosen: number,
): number {
  const list = normalizeDurations(enabled);
  if (list.includes(chosen)) return chosen;
  return list.reduce((best, m) =>
    Math.abs(m - chosen) < Math.abs(best - chosen) ? m : best,
  );
}

export function durationLabel(minutes: number): DurationLabel {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  let text: string;
  if (minutes < 120) text = `${minutes} min`;
  else if (rest === 0) text = `${hours} h`;
  else text = `${hours} h ${rest} min`;
  return { hours, minutes: rest, text };
}

function reasonFor(
  start: number,
  end: number,
  availability: DayAvailability,
): SlotReason | null {
  if (availability.nowMinute != null && start < availability.nowMinute) {
    return "in-the-past";
  }
  const block = availability.blocks.find(
    (b) => start < b.endMinute && end > b.startMinute,
  );
  if (block) return block.reason;
  if (end > availability.closeMinute) return "runs-past-closing";
  return null;
}

function slotsFor(
  availability: DayAvailability,
  duration: number,
  step: number,
  locale: string,
): Slot[] {
  const slots: Slot[] = [];
  for (
    let start = availability.openMinute;
    start < availability.closeMinute;
    start += step
  ) {
    const end = start + duration;
    const reason = reasonFor(start, end, availability);
    slots.push({
      startMinute: start,
      endMinute: end,
      available: reason === null,
      reason,
      start: timePartsFromMinutes(start, locale),
      end: timePartsFromMinutes(end, locale),
    });
  }
  return slots;
}

export function timeSlots(input: TimeSlotsInput): TimeSlotsModel {
  const step = input.step ?? DEFAULT_SLOT_STEP;
  if (!Number.isInteger(step) || step <= 0) {
    throw new RangeError(
      "Slot step must be a positive whole number of minutes.",
    );
  }
  const enabled = normalizeDurations(input.enabledDurations);
  const duration = resolveDuration(enabled, input.duration);
  const slots = slotsFor(input.availability, duration, step, input.locale);

  const durations: DurationChoice[] = enabled.map((minutes) => ({
    minutes,
    label: durationLabel(minutes),
    selected: minutes === duration,
    selectable: slotsFor(input.availability, minutes, step, input.locale).some(
      (slot) => slot.available,
    ),
  }));

  return {
    duration,
    durations,
    slots,
    selectableStarts: slots
      .filter((s) => s.available)
      .map((s) => s.startMinute),
  };
}
