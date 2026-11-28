/**
 * The owner decisions for group sessions (docs/plan/participation.md §12),
 * kept as ONE constant so a change of mind is one edit, never a hunt.
 *
 * These are the design's recommendations, used as build defaults on
 * 28 November 2026. The owner may change any of them; every reader goes
 * through this object.
 */
export const PARTICIPATION_POLICY = {
  /** Decision 1: the time the group is decided is also the last moment to cancel for free. */
  lockIsFreeCancellationDeadline: true,
  /** Decision 1: default lock, minutes before the start. */
  defaultLockMinutesBeforeStart: 1_440,
  /** Decision 2: the price fixes at the lock; no-shows pay like everyone. */
  attendanceBasedPricing: false,
  /** Decision 3: a per-player price may never rise as the group grows. */
  perPlayerPriceMayRise: false,
  /** Decision 3: one more player lowering the club's total is a warning, never an error. */
  revenueCliffIsWarning: true,
  /** Decision 4: late cancellation pays the final price, returned if the place is refilled. */
  lateCancellation: "final-price-refund-on-refill",
  /** Decision 5: the same person cannot book the same session twice ("add a player" brings guests). */
  duplicateBooking: "block",
  /** Decision 6: card payers reserve the most and get the difference back (PART-10 wires cards). */
  cardGroupPricing: "reserve-then-return",
  /** Decision 7: old "auto-cancel" settings only cancel sessions created from now on. */
  legacyAutoCancel: "new-sessions-only",
} as const;

/** Upper bound on how early the group can be decided (7 days). */
export const MAX_PARTICIPATION_LOCK_MINUTES = 10_080;
export const MAX_PARTICIPATION_PRICE_TIERS = 12;
export const MAX_PARTICIPATION_CREDITS_PER_PLAYER = 10_000;
export const MAX_PARTICIPATION_AMOUNT_MINOR_PER_PLAYER = 100_000_000;
export const MAX_PARTICIPATION_CAPACITY = 500;

/** How long a waitlist offer holds a place (open question 1: proposed 2 hours, never past the start). */
export const PARTICIPATION_WAITLIST_HOLD_MINUTES = 120;
/** Attendance stays open this long after the end ("done" → "settled"). */
export const PARTICIPATION_ATTENDANCE_WINDOW_MINUTES = 1_440;
/** The "still needs players" reminder goes this long before the lock (once per booking). */
export const PARTICIPATION_REMINDER_MINUTES_BEFORE_LOCK = 1_440;
/** Days the at-risk list looks ahead by default. */
export const PARTICIPATION_AT_RISK_DAYS = 7;
