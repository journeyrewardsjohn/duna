/**
 * Crest 1.1 A geometry from the Duna Brand Book 2.0
 * (`docs/design/tideline-4.1.1/brand-book.md`, section 1). The viewBox units
 * are the brand book's: the net is 10 units wide, so one line-width is 10
 * units and the mark is 59 x 74.
 */
export const MARK_VIEWBOX = { x: 16, y: 13, width: 59, height: 74 } as const;

/** The wordmark is drawn on a 306 x 100 grid with a 9-unit stroke. */
export const WORDMARK_VIEWBOX = { width: 306, height: 100 } as const;
export const WORDMARK_STROKE = 9;

/** The net: one line. */
export const NET = { x: 16, y: 13, width: 10, height: 74 } as const;

/** The three crests, outer to inner. */
export const CRESTS = [
  "M48.96 13A42 40 0 0 1 48.96 87L44.78 87A31 40 0 0 0 44.78 13Z",
  "M42.12 13A24 40 0 0 1 42.12 87L38.7 87A15 40 0 0 0 38.7 13Z",
  "M36.04 13A8 40 0 0 1 36.04 87L33 87L33 13Z",
] as const;

/** The micro mark: the net and one solid crest. */
export const MICRO_CREST = "M48.96 13A42 40 0 0 1 48.96 87L33 87L33 13Z";

/** Below this rendered height (px) the micro mark replaces the full mark. */
export const MICRO_BELOW_PX = 20;

/** Clear space is three line-widths on every side. */
export const CLEAR_SPACE_UNITS = 3 * NET.width;

/** Wordmark paths (stroke only, no fill, square ends). */
export const WORDMARK_SHAPES = {
  circles: [
    { cx: 30, cy: 70, r: 25.5 },
    { cx: 276, cy: 70, r: 25.5 },
  ],
  paths: [
    "M55.5 0V100",
    "M86.5 40V70A25.5 25.5 0 0 0 137.5 70M137.5 40V100",
    "M168.5 40V100M168.5 70A25.5 25.5 0 0 1 219.5 70V100",
    "M301.5 40V100",
  ],
} as const;

/** Horizontal lockup: mark and wordmark the same height, gap 0.36 of it. */
export const HORIZONTAL = {
  width: 312.08,
  height: 74,
  wordmarkX: 85.64,
  wordmarkScale: 0.74,
} as const;

/** Stacked lockup: the wordmark is exactly as wide as the mark. */
export const STACKED = {
  width: 59,
  height: 105.86,
  wordmarkY: 86.58,
  wordmarkScale: 0.19281,
} as const;
