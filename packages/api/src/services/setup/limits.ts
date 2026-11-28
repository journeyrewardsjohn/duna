/**
 * Limits and defaults for AI setup from a website (B1). One place, so the
 * docs (docs/product/club-setup.md) and the tests read the same numbers.
 */
export const setupLimits = {
  /** Pages read per run, the home page included. */
  maxPages: 8,
  /** Readable text (Markdown characters) kept from one page. Larger: "too large". A run therefore reads at most maxPages × maxPageChars. */
  maxPageChars: 150_000,
  /** Text from one page handed to the model (the rest is cut). */
  maxModelChars: 24_000,
  /** Runs a club may start per rolling 24 hours. */
  runsPerClubPerDay: 6,
  /** One reader call (milliseconds). */
  readerTimeoutMs: 20_000,
  /** One model call (milliseconds). */
  modelTimeoutMs: 60_000,
  /** Work done in one step before handing the run back (serverless budget). */
  stepBudgetMs: 40_000,
  /** A step that stopped heartbeating for this long is taken over. */
  leaseMs: 90_000,
  /** A run still reading after this long finishes with what it has. */
  runDeadlineMs: 10 * 60_000,
  /** Short quoted source kept per fact (characters). */
  maxQuoteChars: 200,
  /** Quotes kept per proposal after merging. */
  maxQuotesPerProposal: 3,
  /** Fewer merged facts than this reads as "found very little". */
  foundVeryLittleBelow: 3,
  /** Proposed default: run pages and quotes are deleted this long after a run finishes. */
  retentionDays: 180,
} as const;
