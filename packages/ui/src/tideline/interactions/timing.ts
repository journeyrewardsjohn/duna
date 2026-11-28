/**
 * The interaction kit's timing constants, in one place. Where a token exists
 * the value equals it (`tokens.css`); the others are local constants marked
 * PROMOTE until the token package (F2a) publishes them. Never write a literal
 * delay in a screen: import one of these, or the existing
 * `LOADING_DELAY_MS` (250), `LOADING_MIN_MS` (400) and `SEARCH_DEBOUNCE_MS`
 * (220) from `interaction-core.ts`.
 */

/** Default quiet time for a debounced value or callback. Equals `--td-debounce-search`. */
export const DEBOUNCE_MS = 220;

/**
 * Interval for continuous signals that must keep flowing (map bounds while
 * panning, scroll, resize, typing indicators): one call per interval, plus
 * one when it settles. PROMOTE: `--td-throttle-continuous`.
 */
export const THROTTLE_MS = 300;

/**
 * A draft saves this long after typing stops, and at once on blur.
 * PROMOTE: `--td-debounce-autosave`.
 */
export const AUTOSAVE_DELAY_MS = 2000;

/**
 * How long an Undo stays on offer (the definition of done asks for at least
 * 5 s; the toast timer also pauses while it is hovered or focused).
 * PROMOTE: `--td-duration-undo-window`.
 */
export const UNDO_WINDOW_MS = 6000;

/**
 * How long a "Saved" or "Sent" success state holds before the control
 * returns to rest. PROMOTE: `--td-duration-success-hold`.
 */
export const SUCCESS_HOLD_MS = 1600;

/**
 * After a success, a second activation this soon is ignored: a double tap
 * whose second half lands after a fast save must not start a new attempt.
 * Longer than any double click. PROMOTE: `--td-duration-repeat-guard`.
 */
export const REPEAT_GUARD_MS = 500;
