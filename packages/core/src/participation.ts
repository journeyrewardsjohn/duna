/**
 * Participant minimums, maximums, and headcount-based credit pricing for any
 * bookable activity with a headcount. This module is deliberately pure: the
 * API layer supplies the stored configuration, the capacity, the clock, and the
 * ledger. Nothing here reads a database or decides who is allowed to act.
 */

export type ParticipationMinimumPolicy = "cancel" | "run";
export type ParticipationSettlementBasis = "cutoff" | "attendance";
export type ParticipationMinimumOutcome =
  "minimum-met" | "cancel-under-minimum" | "run-under-minimum";

export interface ParticipationCreditTier {
  /** Smallest final headcount this tier applies to (inclusive). */
  readonly minParticipants: number;
  /** Largest final headcount this tier applies to (inclusive). */
  readonly maxParticipants: number;
  /** Credits each player pays when the final headcount lands in this tier. */
  readonly creditsPerPlayer: number;
}

export interface ParticipationRules {
  readonly minParticipants: number;
  /** The capacity. It is never stored twice; callers pass the real capacity. */
  readonly maxParticipants: number;
  /** What happens when the minimum is not met at the cutoff. */
  readonly minimumPolicy: ParticipationMinimumPolicy;
  /** Minutes before the start when the minimum is checked and headcount locks. */
  readonly cutoffMinutesBeforeStart: number;
  /** Which headcount prices the session: bookings at cutoff, or attendance. */
  readonly settlementBasis: ParticipationSettlementBasis;
  /** Empty means the fixed catalog credit price applies, exactly as before. */
  readonly creditTiers: readonly ParticipationCreditTier[];
}

/** 24 hours matches Duna's default cancellation window. */
export const DEFAULT_PARTICIPATION_CUTOFF_MINUTES = 1_440;
export const MAX_PARTICIPATION_CUTOFF_MINUTES = 10_080;
export const MAX_PARTICIPATION_CREDIT_TIERS = 12;
export const MAX_PARTICIPATION_CREDITS_PER_PLAYER = 10_000;

export interface ParticipationValidationContext {
  /** The activity's capacity (maximum participants). */
  readonly capacity: number;
  /** Whether the offer can be paid with organization credits. */
  readonly allowCredits: boolean;
  /** The fixed catalog credit price, when credits are accepted. */
  readonly creditCost?: number;
}

export interface ParticipationValidationResult {
  /** Undefined when no participation rules were supplied. */
  readonly rules?: ParticipationRules;
  readonly issues: readonly string[];
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function wholeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Strictly validates operator-supplied participation rules against the real
 * capacity. Tiers must start at the minimum, be contiguous and non-overlapping,
 * and end at the capacity. The final tier may omit `maxParticipants`, which
 * means "and up" and resolves to the capacity.
 */
export function validateParticipationRules(
  value: unknown,
  context: ParticipationValidationContext,
): ParticipationValidationResult {
  if (value === undefined || value === null) return { issues: [] };
  const input = record(value);
  if (!input) {
    return { issues: ["Participation rules must be an object."] };
  }
  const issues: string[] = [];
  const capacity = context.capacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    return { issues: ["Set a maximum number of players first."] };
  }

  const minParticipants =
    input.minParticipants === undefined
      ? 1
      : wholeNumber(input.minParticipants);
  if (minParticipants === undefined || minParticipants < 1) {
    issues.push(
      "The minimum number of players must be a whole number of 1 or more.",
    );
  } else if (minParticipants > capacity) {
    issues.push(
      `The minimum (${minParticipants}) cannot exceed the maximum of ${plural(capacity, "player")}.`,
    );
  }

  const minimumPolicy =
    input.minimumPolicy === undefined ? "run" : input.minimumPolicy;
  if (minimumPolicy !== "cancel" && minimumPolicy !== "run") {
    issues.push(
      "Choose whether an under-filled session is cancelled or runs anyway.",
    );
  }

  const cutoffMinutesBeforeStart =
    input.cutoffMinutesBeforeStart === undefined
      ? DEFAULT_PARTICIPATION_CUTOFF_MINUTES
      : wholeNumber(input.cutoffMinutesBeforeStart);
  if (
    cutoffMinutesBeforeStart === undefined ||
    cutoffMinutesBeforeStart < 0 ||
    cutoffMinutesBeforeStart > MAX_PARTICIPATION_CUTOFF_MINUTES
  ) {
    issues.push(
      "The decision cutoff must be between 0 minutes and 7 days before the start.",
    );
  }

  const settlementBasis =
    input.settlementBasis === undefined ? "cutoff" : input.settlementBasis;
  if (settlementBasis !== "cutoff" && settlementBasis !== "attendance") {
    issues.push(
      "Choose whether pricing settles on the booked headcount or on recorded attendance.",
    );
  }

  const rawTiers = input.creditTiers === undefined ? [] : input.creditTiers;
  const creditTiers: ParticipationCreditTier[] = [];
  if (!Array.isArray(rawTiers)) {
    issues.push("Group-size pricing must be a list of tiers.");
  } else if (rawTiers.length > MAX_PARTICIPATION_CREDIT_TIERS) {
    issues.push(
      `Group-size pricing supports at most ${MAX_PARTICIPATION_CREDIT_TIERS} tiers.`,
    );
  } else if (rawTiers.length > 0) {
    if (!context.allowCredits) {
      issues.push(
        "Group-size pricing is charged in credits. Turn on credit payment first.",
      );
    }
    const floor = minParticipants ?? 1;
    let expectedMin = floor;
    rawTiers.forEach((rawTier, index) => {
      const tier = record(rawTier);
      const position = `Tier ${index + 1}`;
      const isLast = index === rawTiers.length - 1;
      const tierMin = wholeNumber(tier?.minParticipants);
      const tierMax =
        tier?.maxParticipants === undefined || tier.maxParticipants === null
          ? isLast
            ? capacity
            : undefined
          : wholeNumber(tier.maxParticipants);
      const credits = wholeNumber(tier?.creditsPerPlayer);
      if (!tier || tierMin === undefined || tierMin < 1) {
        issues.push(`${position} needs a starting group size of 1 or more.`);
        return;
      }
      if (tierMax === undefined) {
        issues.push(
          `${position} needs an ending group size. Only the last tier may be open-ended.`,
        );
        return;
      }
      if (
        credits === undefined ||
        credits < 1 ||
        credits > MAX_PARTICIPATION_CREDITS_PER_PLAYER
      ) {
        issues.push(
          `${position} needs a credit price per player of 1 or more.`,
        );
        return;
      }
      if (tierMax < tierMin) {
        issues.push(
          `${position} ends (${tierMax}) before it starts (${tierMin}).`,
        );
        return;
      }
      if (tierMin !== expectedMin) {
        issues.push(
          index === 0
            ? `${position} must start at the minimum of ${plural(floor, "player")}.`
            : tierMin < expectedMin
              ? `${position} overlaps the tier before it. It must start at ${plural(expectedMin, "player")}.`
              : `${position} leaves a gap. It must start at ${plural(expectedMin, "player")}.`,
        );
      }
      if (tierMax > capacity) {
        issues.push(
          `${position} goes past the maximum of ${plural(capacity, "player")}.`,
        );
      }
      expectedMin = tierMax + 1;
      creditTiers.push({
        minParticipants: tierMin,
        maxParticipants: tierMax,
        creditsPerPlayer: credits,
      });
    });
    const lastTier = creditTiers.at(-1);
    if (
      issues.length === 0 &&
      lastTier &&
      lastTier.maxParticipants !== capacity
    ) {
      issues.push(
        `The last tier must reach the maximum of ${plural(capacity, "player")}.`,
      );
    }
    const highest = creditTiers.reduce(
      (maximum, tier) => Math.max(maximum, tier.creditsPerPlayer),
      0,
    );
    if (
      issues.length === 0 &&
      context.allowCredits &&
      context.creditCost !== highest
    ) {
      issues.push(
        `Set the credit price to ${plural(highest, "credit")}, the highest tier. Players reserve that amount and get the difference back.`,
      );
    }
  }

  if (issues.length > 0) return { issues };
  return {
    issues,
    rules: {
      minParticipants: minParticipants!,
      maxParticipants: capacity,
      minimumPolicy: minimumPolicy as ParticipationMinimumPolicy,
      cutoffMinutesBeforeStart: cutoffMinutesBeforeStart!,
      settlementBasis: settlementBasis as ParticipationSettlementBasis,
      creditTiers,
    },
  };
}

/**
 * Leniently reads rules that were validated when they were saved. Returns
 * undefined when the activity has no participation rules, so legacy offers
 * with only a capacity keep their existing behavior untouched. The capacity
 * passed here is the real one for the bookable occurrence, which may be
 * smaller than the capacity the rules were saved against.
 */
export function readParticipationRules(
  value: unknown,
  capacity: number,
): ParticipationRules | undefined {
  const input = record(value);
  if (!input || !Number.isSafeInteger(capacity) || capacity < 1) {
    return undefined;
  }
  const storedMinimum = wholeNumber(input.minParticipants) ?? 1;
  const cutoff = wholeNumber(input.cutoffMinutesBeforeStart);
  const creditTiers: ParticipationCreditTier[] = [];
  if (Array.isArray(input.creditTiers)) {
    for (const rawTier of input.creditTiers) {
      const tier = record(rawTier);
      const tierMin = wholeNumber(tier?.minParticipants);
      const credits = wholeNumber(tier?.creditsPerPlayer);
      if (tierMin === undefined || tierMin < 1 || !credits || credits < 1) {
        // A malformed stored tier table is never partially applied.
        creditTiers.length = 0;
        break;
      }
      creditTiers.push({
        minParticipants: tierMin,
        maxParticipants: Math.max(
          tierMin,
          wholeNumber(tier?.maxParticipants) ?? Number.MAX_SAFE_INTEGER,
        ),
        creditsPerPlayer: credits,
      });
    }
    creditTiers.sort(
      (left, right) => left.minParticipants - right.minParticipants,
    );
  }
  return {
    minParticipants: Math.min(capacity, Math.max(1, storedMinimum)),
    maxParticipants: capacity,
    minimumPolicy: input.minimumPolicy === "cancel" ? "cancel" : "run",
    cutoffMinutesBeforeStart:
      cutoff === undefined
        ? DEFAULT_PARTICIPATION_CUTOFF_MINUTES
        : Math.min(MAX_PARTICIPATION_CUTOFF_MINUTES, Math.max(0, cutoff)),
    settlementBasis:
      input.settlementBasis === "attendance" ? "attendance" : "cutoff",
    creditTiers,
  };
}

/** True when the rules change nothing compared with a capacity-only offer. */
export function participationRulesAreInert(rules: ParticipationRules): boolean {
  return (
    rules.creditTiers.length === 0 &&
    (rules.minParticipants <= 1 || rules.minimumPolicy === "run")
  );
}

/**
 * The tier for a final headcount. A headcount below the first tier (a session
 * that runs under its minimum, or attendance that fell short) uses the first
 * tier; a headcount above the last tier uses the last tier.
 */
export function creditTierForHeadcount(
  tiers: readonly ParticipationCreditTier[],
  headcount: number,
): ParticipationCreditTier | undefined {
  if (tiers.length === 0) return undefined;
  const first = tiers[0]!;
  if (headcount <= first.maxParticipants) return first;
  return (
    tiers.find(
      (tier) =>
        headcount >= tier.minParticipants && headcount <= tier.maxParticipants,
    ) ?? tiers.at(-1)
  );
}

/**
 * Credits each player reserves at booking: the highest tier that could still
 * apply. Headcount can fall through cancellations and no-shows right up to
 * the moment it is final, so every tier remains possible until then.
 */
export function reservedCreditsPerPlayer(
  tiers: readonly ParticipationCreditTier[],
): number | undefined {
  if (tiers.length === 0) return undefined;
  return tiers.reduce(
    (maximum, tier) => Math.max(maximum, tier.creditsPerPlayer),
    0,
  );
}

export function participationCutoffAt(
  startsAt: Date,
  rules: Pick<ParticipationRules, "cutoffMinutesBeforeStart">,
): Date {
  return new Date(startsAt.getTime() - rules.cutoffMinutesBeforeStart * 60_000);
}

export function decideParticipationMinimum(
  rules: Pick<ParticipationRules, "minParticipants" | "minimumPolicy">,
  headcount: number,
): ParticipationMinimumOutcome {
  if (headcount >= rules.minParticipants) return "minimum-met";
  return rules.minimumPolicy === "cancel"
    ? "cancel-under-minimum"
    : "run-under-minimum";
}

export interface ParticipationSettlementBooking {
  readonly id: string;
  /** Places covered by this booking. */
  readonly quantity: number;
  /** Credits taken from the wallet when the booking was made. */
  readonly reservedCredits: number;
}

export interface ParticipationSettlementLine {
  readonly id: string;
  readonly creditsPerPlayer: number;
  readonly settledCredits: number;
  readonly returnedCredits: number;
}

/**
 * Prices every booking at the tier for the final headcount. A player is never
 * charged more than they reserved: the settled amount is capped at the
 * reservation, so the returned amount is never negative.
 */
export function planParticipationSettlement(input: {
  readonly creditTiers: readonly ParticipationCreditTier[];
  readonly headcount: number;
  readonly bookings: readonly ParticipationSettlementBooking[];
}): readonly ParticipationSettlementLine[] {
  const tier = creditTierForHeadcount(input.creditTiers, input.headcount);
  return input.bookings.map((booking) => {
    if (
      !Number.isSafeInteger(booking.quantity) ||
      booking.quantity < 1 ||
      !Number.isSafeInteger(booking.reservedCredits) ||
      booking.reservedCredits < 0
    ) {
      throw new Error(`Booking ${booking.id} has an invalid reservation.`);
    }
    const creditsPerPlayer = tier
      ? tier.creditsPerPlayer
      : Math.floor(booking.reservedCredits / booking.quantity);
    const settledCredits = tier
      ? Math.min(booking.reservedCredits, creditsPerPlayer * booking.quantity)
      : booking.reservedCredits;
    return {
      id: booking.id,
      creditsPerPlayer,
      settledCredits,
      returnedCredits: booking.reservedCredits - settledCredits,
    };
  });
}

/** "1 player", "2 to 6 players", "7 or more players". */
export function participationTierLabel(
  tier: ParticipationCreditTier,
  capacity?: number,
): string {
  if (tier.minParticipants === tier.maxParticipants) {
    return plural(tier.minParticipants, "player");
  }
  if (capacity !== undefined && tier.maxParticipants >= capacity) {
    return `${tier.minParticipants} or more players`;
  }
  return `${tier.minParticipants} to ${tier.maxParticipants} players`;
}

/** "2 to 6 players, 2 credits each". */
export function describeParticipationTier(
  tier: ParticipationCreditTier,
  capacity?: number,
): string {
  return `${participationTierLabel(tier, capacity)}, ${plural(tier.creditsPerPlayer, "credit")} each`;
}
