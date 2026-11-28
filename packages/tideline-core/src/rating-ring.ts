/**
 * Rating ring geometry (brand book section 4): a progress arc through the
 * current half point and a three-segment reliability band. The returned values
 * are the END state; animation (Rise, 900 ms) is the renderer's concern.
 *
 * All angles are degrees clockwise from 12 o'clock.
 */

/** Geometry on the 220-unit square the brand book specifies. */
export const RATING_RING_GEOMETRY = {
  viewBox: 220,
  track: { radius: 96, stroke: 10 },
  band: { radius: 84, stroke: 3, segments: 3, gapUnits: 8 },
  tick: { y1: 2, y2: 20, stroke: 2.5 },
} as const;

/** The rating moves through one arc per half point. */
export const RATING_HALF_POINT = 0.5;

export type RatingRingState =
  "up" | "down" | "provisional" | "reached" | "steady";

export interface RatingRingInput {
  /** The Sand Rating, or `null` while provisional / unknown. */
  readonly value: number | null;
  /** Change from the previous rating (positive is up). */
  readonly delta?: number | null;
  /** The rating to reach next; defaults to the next half point at or above `value`. */
  readonly goal?: number;
  /** Reliability band: 0 to 3 filled segments. */
  readonly reliability: number;
  /** Matches still needed before the rating is shown; > 0 means provisional. */
  readonly matchesLeft?: number;
  readonly locale: string;
}

export interface ArcSpec {
  readonly startDeg: number;
  readonly endDeg: number;
  /** endDeg - startDeg. */
  readonly sweepDeg: number;
  /** 0 to 1 of the full circle. */
  readonly fraction: number;
}

export interface BandSegment extends ArcSpec {
  readonly filled: boolean;
}

export interface RatingRingModel {
  readonly state: RatingRingState;
  /** The progress arc on the track ring. */
  readonly progress: ArcSpec;
  /** Where the arc started before this change; the renderer may animate from it. */
  readonly progressFrom: ArcSpec;
  /** Progress through the current half point, 0 to 1. */
  readonly progressFraction: number;
  readonly goal: number | null;
  /** Dotted at 45% opacity while provisional. */
  readonly dotted: boolean;
  readonly opacity: number;
  readonly band: ReadonlyArray<BandSegment>;
  readonly label: {
    /** "3.42", or `null` (render an em dash). */
    readonly number: string | null;
    readonly chip: RatingChip | null;
  };
}

export type RatingChip =
  | {
      readonly kind: "delta";
      readonly direction: "up" | "down";
      /** "+0.08" / "−0.04". */
      readonly text: string;
      /** "0.08". */
      readonly amount: string;
    }
  | { readonly kind: "reached"; readonly goalText: string }
  | { readonly kind: "matches-left"; readonly count: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function arc(fraction: number): ArcSpec {
  const f = clamp(fraction, 0, 1);
  return { startDeg: 0, endDeg: f * 360, sweepDeg: f * 360, fraction: f };
}

/** Progress through the half point that ends at `goal`. */
function progressTo(value: number, goal: number): number {
  const start = goal - RATING_HALF_POINT;
  // Round to the hundredth to avoid float noise such as 0.9999999.
  return clamp(
    Math.round(((value - start) / RATING_HALF_POINT) * 1e4) / 1e4,
    0,
    1,
  );
}

/** The next half point at or above a rating: 3.42 gives 3.5, 3.5 gives 3.5. */
export function nextHalfPoint(value: number): number {
  return (
    Math.ceil(Math.round(value * 1e6) / 1e6 / RATING_HALF_POINT) *
    RATING_HALF_POINT
  );
}

/** The three band segments, each 120 degrees less a gap of 8 units on r 84. */
export function reliabilityBand(filledCount: number): BandSegment[] {
  const { radius, segments, gapUnits } = RATING_RING_GEOMETRY.band;
  const filledSegments = clamp(Math.round(filledCount), 0, segments);
  const gapDeg = (gapUnits / radius) * (180 / Math.PI);
  const slot = 360 / segments;
  return Array.from({ length: segments }, (_, index) => {
    // Centre the gap on the 12 o'clock boundary between segments.
    const startDeg = index * slot + gapDeg / 2;
    const endDeg = (index + 1) * slot - gapDeg / 2;
    return {
      startDeg,
      endDeg,
      sweepDeg: endDeg - startDeg,
      fraction: (endDeg - startDeg) / 360,
      filled: index < filledSegments,
    };
  });
}

export function ratingRingModel(input: RatingRingInput): RatingRingModel {
  const provisional = (input.matchesLeft ?? 0) > 0 || input.value === null;
  const number = new Intl.NumberFormat(input.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (provisional || input.value === null) {
    return {
      state: "provisional",
      progress: arc(0),
      progressFrom: arc(0),
      progressFraction: 0,
      goal: null,
      dotted: true,
      opacity: 0.45,
      band: reliabilityBand(1),
      label: {
        number: null,
        chip:
          input.matchesLeft && input.matchesLeft > 0
            ? { kind: "matches-left", count: input.matchesLeft }
            : null,
      },
    };
  }

  const value = input.value;
  const goal = input.goal ?? nextHalfPoint(value);
  const delta = input.delta ?? 0;
  const progressFraction = progressTo(value, goal);
  const reached = value >= goal;
  // If the change crossed a half point the old arc began a ring ago: restart at 0.
  const previous = value - delta;
  const crossed = previous < goal - RATING_HALF_POINT;
  const progressFrom = arc(crossed ? 0 : progressTo(previous, goal));

  let state: RatingRingState = "steady";
  let chip: RatingChip | null = null;
  if (reached) {
    state = "reached";
    chip = { kind: "reached", goalText: number.format(goal) };
  } else if (delta !== 0) {
    state = delta > 0 ? "up" : "down";
    const amount = number.format(Math.abs(delta));
    chip = {
      kind: "delta",
      direction: delta > 0 ? "up" : "down",
      text: `${delta > 0 ? "+" : "−"}${amount}`,
      amount,
    };
  }

  return {
    state,
    progress: arc(progressFraction),
    progressFrom,
    progressFraction,
    goal,
    dotted: false,
    opacity: 1,
    band: reliabilityBand(input.reliability),
    label: { number: number.format(value), chip },
  };
}

export type RatingRingSizeBand = "full" | "medium" | "compact" | "arc-only";

export interface RatingRingLayout {
  readonly band: RatingRingSizeBand;
  readonly showLabel: boolean;
  readonly showNumber: boolean;
  readonly showChip: boolean;
  readonly showBand: boolean;
  readonly showTick: boolean;
  /** Number size as a fraction of the ring size; `null` when not shown inside. */
  readonly numberScale: number | null;
  /** Arc stroke override in units of the 220 box; `null` keeps the default. */
  readonly arcStroke: number | null;
}

/** What shows at each size: >= 240, 120-239, 60-119, < 60 (brand book). */
export function ratingRingLayout(size: number): RatingRingLayout {
  if (size >= 240) {
    return {
      band: "full",
      showLabel: true,
      showNumber: true,
      showChip: true,
      showBand: true,
      showTick: true,
      numberScale: 0.235,
      arcStroke: null,
    };
  }
  if (size >= 120) {
    return {
      band: "medium",
      showLabel: false,
      showNumber: true,
      showChip: true,
      showBand: true,
      showTick: true,
      numberScale: 0.25,
      arcStroke: null,
    };
  }
  if (size >= 60) {
    return {
      band: "compact",
      showLabel: false,
      showNumber: true,
      showChip: false,
      showBand: false,
      showTick: false,
      numberScale: 0.3,
      arcStroke: 14,
    };
  }
  return {
    band: "arc-only",
    showLabel: false,
    showNumber: false,
    showChip: false,
    showBand: false,
    showTick: false,
    numberScale: null,
    arcStroke: 14,
  };
}
