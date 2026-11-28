/**
 * What a time chip shows and whether it can be chosen. One rule for web and
 * native: a slot that is taken, outside opening hours, too dark on an unlit
 * court, or was taken while the person was looking ("stale") is never
 * bookable, and each says why in words, not colour.
 */
import type { LightMark } from "./light";
import type { SlotReason } from "./time-slots";

export type SlotChipState =
  | "available"
  | "few-left"
  | "selected"
  | "taken"
  | "outside-hours"
  | "too-dark"
  | "stale";

/** A slot with this many places or fewer left is "few left". A default a club may change. */
export const FEW_LEFT_AT = 2;

export interface SlotChipInput {
  /** From `timeSlots`: free of blocks, inside opening hours, not past. */
  readonly available: boolean;
  readonly reason?: SlotReason | null;
  readonly selected?: boolean;
  /** It was available a moment ago and has just been taken. */
  readonly stale?: boolean;
  /** Places left (courts, spots); omit when the slot is a single booking. */
  readonly remaining?: number | null;
  readonly fewLeftAt?: number;
  /** The light at the slot's start, for unlit courts after dark. */
  readonly light?: LightMark | null;
}

export interface SlotChip {
  readonly state: SlotChipState;
  readonly selectable: boolean;
  /** English words for the state, added to the accessible name; `null` when plain. */
  readonly words: string | null;
}

const OUTSIDE: ReadonlyArray<SlotReason> = [
  "closed",
  "runs-past-closing",
  "in-the-past",
];

export function slotChip(input: SlotChipInput): SlotChip {
  if (input.stale) {
    return { state: "stale", selectable: false, words: "just taken" };
  }
  if (!input.available) {
    if (input.reason && OUTSIDE.includes(input.reason)) {
      return {
        state: "outside-hours",
        selectable: false,
        words:
          input.reason === "in-the-past"
            ? "already started"
            : input.reason === "runs-past-closing"
              ? "runs past closing"
              : "outside opening hours",
      };
    }
    return {
      state: "taken",
      selectable: false,
      words: input.reason === "maintenance" ? "closed for maintenance" : "full",
    };
  }
  if (input.light === "dark") {
    return {
      state: "too-dark",
      selectable: false,
      words: "too dark, this court has no lights",
    };
  }
  if (input.remaining === 0) {
    return { state: "taken", selectable: false, words: "full" };
  }
  if (input.selected)
    return { state: "selected", selectable: true, words: null };
  const few = input.fewLeftAt ?? FEW_LEFT_AT;
  if (input.remaining != null && input.remaining <= few) {
    return {
      state: "few-left",
      selectable: true,
      words: input.remaining === 1 ? "1 left" : `${input.remaining} left`,
    };
  }
  return { state: "available", selectable: true, words: null };
}

/**
 * Starts that were bookable in `previous` and are not in `next`: taken while
 * the person was looking. A renderer marks them as just taken and drops a
 * selection that pointed at one.
 */
export function staleStarts(
  previous: ReadonlyArray<{
    readonly startMinute: number;
    readonly available: boolean;
  }>,
  next: ReadonlyArray<{
    readonly startMinute: number;
    readonly available: boolean;
  }>,
): ReadonlyArray<number> {
  const nowAvailable = new Map(next.map((s) => [s.startMinute, s.available]));
  return previous
    .filter((s) => s.available && nowAvailable.get(s.startMinute) === false)
    .map((s) => s.startMinute);
}

/**
 * One crest for the first hour and one more per half hour after it, three
 * at most: 60 → 1, 90 → 2, 120 or more → 3.
 */
export function durationCrests(minutes: number): number {
  if (minutes <= 60) return 1;
  return Math.min(3, 1 + Math.ceil((minutes - 60) / 30));
}

/**
 * The crest options (at most three, shortest first, never longer than two
 * hours) and the club's longer lengths, which follow as plain options.
 */
export function durationOptions(enabled: ReadonlyArray<number>): {
  readonly crests: ReadonlyArray<number>;
  readonly extra: ReadonlyArray<number>;
} {
  const sorted = Array.from(
    new Set(enabled.filter((m) => Number.isInteger(m) && m > 0)),
  ).sort((a, b) => a - b);
  const crests = sorted.filter((m) => m <= 120).slice(0, 3);
  return { crests, extra: sorted.filter((m) => !crests.includes(m)) };
}
