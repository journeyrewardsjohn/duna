/**
 * First open (brand book section 6), as a pure timeline in milliseconds from
 * the first frame. Unit-tested; `LaunchSequence` plays it.
 */
export const LAUNCH = {
  /** The line stands up from its centre. */
  net: { at: 300, duration: 450 },
  /** Crests rise inner to outer, 600 ms each, 120 ms apart. */
  crests: { at: 700, duration: 600, stagger: 120 },
  /** The wordmark draws on beneath, as wide as the mark. */
  wordmark: { at: 1400, duration: 1100 },
  /** The launch layer turns from its left edge like a page. */
  flip: { at: 3500, duration: 1400, toDegrees: -108, perspective: 1500 },
  /** If Home is ready early, the flip may start once the crests have landed. */
  earliestFlip: 700 + 600 + 2 * 120,
  /** Reduced motion: the finished lockup, then a 200 ms cross-fade. */
  reduced: { hold: 1000, fade: 200 },
} as const;

/**
 * When the page turns. With no readiness signal the full sequence plays; with
 * one, the flip waits for Home (holding on the finished mark) and may start
 * early once the crests have landed. A skip turns the page at once.
 */
export function flipStartsAt({
  readyAt,
  skippedAt,
}: {
  /** Ms when Home became ready; `undefined` = no signal; `null` = not yet. */
  readonly readyAt?: number | null;
  readonly skippedAt?: number | null;
}): number | null {
  if (skippedAt !== null && skippedAt !== undefined) return skippedAt;
  if (readyAt === undefined) return LAUNCH.flip.at;
  if (readyAt === null) return null;
  return Math.max(LAUNCH.earliestFlip, readyAt);
}
