/**
 * Group rules, version 2 (docs/plan/participation.md §2–§4): one shape for
 * every session-like thing a group books (catalog sessions, event sessions,
 * divisions, pickups). Pure: callers pass the capacity, the clock and the
 * stored JSON; nothing here reads a database.
 */
import {
  MAX_PARTICIPATION_AMOUNT_MINOR_PER_PLAYER,
  MAX_PARTICIPATION_CAPACITY,
  MAX_PARTICIPATION_CREDITS_PER_PLAYER,
  MAX_PARTICIPATION_LOCK_MINUTES,
  MAX_PARTICIPATION_PRICE_TIERS,
  PARTICIPATION_POLICY,
} from "./policy";

export type ParticipationUnit = "player" | "team";
export type ParticipationPolicy = "cancel" | "run";

/** One rung of the price ladder: what each player pays at a group size. */
export interface ParticipationPriceTier {
  /** Smallest group this price applies to (inclusive). */
  readonly minParticipants: number;
  /** Largest group this price applies to (inclusive). */
  readonly maxParticipants: number;
  readonly creditsPerPlayer?: number;
  readonly amountMinorPerPlayer?: number;
}

/** The stored rule (JSON on the host object, the club default, the snapshot). */
export interface ParticipationRuleV2 {
  readonly version: 2;
  readonly unit: ParticipationUnit;
  /** Smallest group that runs. 1 means "no minimum". */
  readonly minParticipants: number;
  /** Optional: presets and club defaults carry one; the host's capacity always wins. */
  readonly maxParticipants?: number;
  readonly minimumPolicy: ParticipationPolicy;
  /** Absent: the club default, then the refund window, then 24 hours. */
  readonly lockMinutesBeforeStart?: number;
  readonly waitlist: boolean;
  /** Non-increasing per player. Empty: the fixed price applies. */
  readonly tiers: readonly ParticipationPriceTier[];
  /** "Split the court": a fixed cost shared by the group. Never with tiers. */
  readonly splitCostMinor?: number;
  /** When these exact rules took effect (ISO instant). */
  readonly effectiveFrom?: string;
  /**
   * Read-only: a 289 rule that settled on attendance. Never accepted on a new
   * save (decision 2); kept so existing bookings settle as they agreed.
   */
  readonly legacySettlementBasis?: "attendance";
}

/** A rule with every default filled in and the real capacity attached. */
export interface ResolvedParticipationRule extends ParticipationRuleV2 {
  readonly capacity: number;
  readonly lockMinutesBeforeStart: number;
}

export type ParticipationRuleSource = "own" | "club-default" | "none";

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function whole(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function participationUnitNoun(
  unit: ParticipationUnit,
  count: number,
): string {
  return unit === "team"
    ? count === 1
      ? "team"
      : "teams"
    : count === 1
      ? "player"
      : "players";
}

/** "1st", "2nd", "7th", "11th", "22nd". */
export function participationOrdinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function readTiers(value: unknown): ParticipationPriceTier[] {
  if (!Array.isArray(value)) return [];
  const tiers: ParticipationPriceTier[] = [];
  for (const raw of value) {
    const tier = record(raw);
    const min = whole(tier?.minParticipants);
    const credits = whole(tier?.creditsPerPlayer);
    const amount = whole(tier?.amountMinorPerPlayer);
    const hasCredits = credits !== undefined && credits >= 1;
    const hasAmount = amount !== undefined && amount >= 0;
    // A malformed stored ladder is never partially applied.
    if (min === undefined || min < 1 || (!hasCredits && !hasAmount)) {
      return [];
    }
    tiers.push({
      minParticipants: min,
      maxParticipants: Math.max(
        min,
        whole(tier?.maxParticipants) ?? Number.MAX_SAFE_INTEGER,
      ),
      ...(hasCredits ? { creditsPerPlayer: credits } : {}),
      ...(hasAmount ? { amountMinorPerPlayer: amount } : {}),
    });
  }
  return tiers.sort((left, right) => left.minParticipants - right.minParticipants);
}

/**
 * Leniently reads a stored rule, version 2 or the 289 shape (version 1:
 * `cutoffMinutesBeforeStart`, `settlementBasis`, `creditTiers`). Returns
 * undefined when the value is not a rule. Never trust stored JSON without it.
 */
export function readParticipationRuleV2(
  value: unknown,
): ParticipationRuleV2 | undefined {
  const input = record(value);
  if (!input) return undefined;
  const min = whole(input.minParticipants) ?? 1;
  const max = whole(input.maxParticipants);
  const lock =
    whole(input.lockMinutesBeforeStart) ?? whole(input.cutoffMinutesBeforeStart);
  const tiers = readTiers(
    Array.isArray(input.tiers) ? input.tiers : input.creditTiers,
  );
  const split = whole(input.splitCostMinor);
  return {
    version: 2,
    unit: input.unit === "team" ? "team" : "player",
    minParticipants: Math.max(1, min),
    ...(max !== undefined && max >= 1 ? { maxParticipants: max } : {}),
    minimumPolicy: input.minimumPolicy === "cancel" ? "cancel" : "run",
    ...(lock !== undefined
      ? {
          lockMinutesBeforeStart: Math.min(
            MAX_PARTICIPATION_LOCK_MINUTES,
            Math.max(0, lock),
          ),
        }
      : {}),
    // Version 1 never queued anyone; version 2 stores the choice.
    waitlist: input.waitlist === true,
    tiers,
    ...(split !== undefined && split > 0 && tiers.length === 0
      ? { splitCostMinor: split }
      : {}),
    ...(typeof input.effectiveFrom === "string"
      ? { effectiveFrom: input.effectiveFrom }
      : {}),
    ...(input.settlementBasis === "attendance" ||
    input.legacySettlementBasis === "attendance"
      ? { legacySettlementBasis: "attendance" as const }
      : {}),
  };
}

/**
 * Fills in the defaults for one bookable session. `capacity` is the host's
 * real capacity; the lock falls back to the club default, then the club's
 * free-cancellation (refund) window, then 24 hours (decision 1).
 */
export function resolveParticipationRuleV2(
  rule: ParticipationRuleV2,
  context: {
    readonly capacity: number;
    readonly defaultLockMinutes?: number;
    readonly refundWindowMinutes?: number;
  },
): ResolvedParticipationRule {
  const capacity = Math.max(1, Math.trunc(context.capacity));
  const lock =
    rule.lockMinutesBeforeStart ??
    context.defaultLockMinutes ??
    context.refundWindowMinutes ??
    PARTICIPATION_POLICY.defaultLockMinutesBeforeStart;
  return {
    ...rule,
    capacity,
    minParticipants: Math.min(capacity, Math.max(1, rule.minParticipants)),
    lockMinutesBeforeStart: Math.min(
      MAX_PARTICIPATION_LOCK_MINUTES,
      Math.max(0, Math.trunc(lock)),
    ),
    tiers: rule.tiers.map((tier, index) => ({
      ...tier,
      maxParticipants:
        index === rule.tiers.length - 1
          ? Math.max(tier.minParticipants, capacity)
          : Math.min(tier.maxParticipants, capacity),
    })),
  };
}

/** True when the rule changes nothing compared with a capacity-only session. */
export function participationRuleIsInert(
  rule: Pick<ParticipationRuleV2, "minParticipants" | "minimumPolicy" | "tiers" | "splitCostMinor">,
): boolean {
  return (
    rule.tiers.length === 0 &&
    rule.splitCostMinor === undefined &&
    (rule.minParticipants <= 1 || rule.minimumPolicy === "run")
  );
}

/** True when the session has a minimum anyone should be told about. */
export function participationRuleHasMinimum(
  rule: Pick<ParticipationRuleV2, "minParticipants">,
): boolean {
  return rule.minParticipants > 1;
}

// ---------------------------------------------------------------------------
// Price ladder
// ---------------------------------------------------------------------------

/**
 * The tier for a group size. A group below the first tier (a session that
 * runs under its minimum) uses the first tier; above the last, the last.
 */
export function priceTierForGroupSize(
  tiers: readonly ParticipationPriceTier[],
  groupSize: number,
): ParticipationPriceTier | undefined {
  if (tiers.length === 0) return undefined;
  const first = tiers[0]!;
  if (groupSize <= first.maxParticipants) return first;
  return (
    tiers.find(
      (tier) =>
        groupSize >= tier.minParticipants && groupSize <= tier.maxParticipants,
    ) ?? tiers.at(-1)
  );
}

export type ParticipationPriceUnit = "credits" | "minor";

function tierPrice(
  tier: ParticipationPriceTier | undefined,
  unit: ParticipationPriceUnit,
): number | undefined {
  return unit === "credits" ? tier?.creditsPerPlayer : tier?.amountMinorPerPlayer;
}

/** The per-player price at a group size, in credits or minor units. */
export function perPlayerPrice(
  tiers: readonly ParticipationPriceTier[],
  groupSize: number,
  unit: ParticipationPriceUnit = "credits",
): number | undefined {
  return tierPrice(priceTierForGroupSize(tiers, groupSize), unit);
}

/**
 * What a player reserves at booking: the most any group size can cost.
 * Headcount can fall right up to the lock, so every tier is possible.
 */
export function participationReservePerPlayer(
  tiers: readonly ParticipationPriceTier[],
  unit: ParticipationPriceUnit = "credits",
): number | undefined {
  const prices = tiers
    .map((tier) => tierPrice(tier, unit))
    .filter((price): price is number => price !== undefined);
  return prices.length === 0 ? undefined : Math.max(...prices);
}

/**
 * Decision 4: a late canceller pays the final price for the decided group,
 * never more than they reserved. With no ladder the final price is the
 * reserve itself.
 */
export function lateCancellationCharge(input: {
  readonly tiers: readonly ParticipationPriceTier[];
  readonly finalGroupSize: number;
  readonly quantity: number;
  readonly reserved: number;
  readonly unit?: ParticipationPriceUnit;
}): number {
  const price = perPlayerPrice(
    input.tiers,
    Math.max(1, input.finalGroupSize),
    input.unit ?? "credits",
  );
  if (price === undefined) return Math.max(0, input.reserved);
  return Math.max(0, Math.min(input.reserved, price * input.quantity));
}

export interface ParticipationRevenueCliff {
  /** The group size whose extra player lowers the total. */
  readonly groupSize: number;
  readonly fromTotal: number;
  readonly toTotal: number;
  readonly unit: ParticipationPriceUnit;
  /** "A 7th player lowers your total from 12 to 7 credits." */
  readonly message: string;
}

/** "$12.00" (en-US). Minor units in, never floating point stored. */
export function formatParticipationMoney(
  amountMinor: number,
  currency: string,
  locale = "en-US",
): string {
  const digits =
    new Intl.NumberFormat(locale, { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMinor / 10 ** digits);
}

function ladderTotals(
  tiers: readonly ParticipationPriceTier[],
  capacity: number,
  unit: ParticipationPriceUnit,
): Map<number, number> {
  const totals = new Map<number, number>();
  const start = tiers[0]?.minParticipants ?? 1;
  for (let size = start; size <= capacity; size += 1) {
    const price = perPlayerPrice(tiers, size, unit);
    if (price !== undefined) totals.set(size, price * size);
  }
  return totals;
}

/**
 * Soft warnings where one more player lowers the club's total (decision 3).
 * 289's own tiers (1 · 3, 2–6 · 2, 7+ · 1) flag the 7th player: 12 → 7.
 */
export function participationRevenueCliffs(
  rule: Pick<ParticipationRuleV2, "tiers" | "unit">,
  capacity: number,
  currency = "USD",
): readonly ParticipationRevenueCliff[] {
  const cliffs: ParticipationRevenueCliff[] = [];
  for (const unit of ["credits", "minor"] as const) {
    const totals = ladderTotals(rule.tiers, capacity, unit);
    for (const [size, total] of totals) {
      const next = totals.get(size + 1);
      if (next !== undefined && next < total) {
        const noun = rule.unit === "team" ? "team" : "player";
        cliffs.push({
          groupSize: size + 1,
          fromTotal: total,
          toTotal: next,
          unit,
          message:
            unit === "credits"
              ? `A ${participationOrdinal(size + 1)} ${noun} lowers your total from ${total} to ${plural(next, "credit")}.`
              : `A ${participationOrdinal(size + 1)} ${noun} lowers your total from ${formatParticipationMoney(total, currency)} to ${formatParticipationMoney(next, currency)}.`,
        });
      }
    }
  }
  return cliffs;
}

/**
 * "Show a fix": the nearest ladder with no cliff. Each tier is raised only as
 * far as needed so its first group size earns at least what the size before
 * it did, never above the tier before it (prices still never rise).
 */
export function suggestParticipationCliffFix(
  rule: Pick<ParticipationRuleV2, "tiers">,
): readonly ParticipationPriceTier[] {
  const fixed: ParticipationPriceTier[] = [];
  for (const [index, tier] of rule.tiers.entries()) {
    const previous = fixed[index - 1];
    if (!previous) {
      fixed.push(tier);
      continue;
    }
    const boundary = tier.minParticipants;
    const raise = (
      current: number | undefined,
      before: number | undefined,
    ): number | undefined => {
      if (current === undefined || before === undefined) return current;
      const needed = Math.ceil(((boundary - 1) * before) / boundary);
      return Math.min(before, Math.max(current, needed));
    };
    fixed.push({
      ...tier,
      ...(tier.creditsPerPlayer !== undefined
        ? {
            creditsPerPlayer: raise(
              tier.creditsPerPlayer,
              previous.creditsPerPlayer,
            ),
          }
        : {}),
      ...(tier.amountMinorPerPlayer !== undefined
        ? {
            amountMinorPerPlayer: raise(
              tier.amountMinorPerPlayer,
              previous.amountMinorPerPlayer,
            ),
          }
        : {}),
    });
  }
  return fixed;
}

/**
 * "Split the court": each player pays the total divided by the group,
 * rounded UP to the minor unit; the cents over go to the host's share.
 */
export function splitCostTiers(
  totalMinor: number,
  minimum: number,
  capacity: number,
): {
  readonly tiers: readonly ParticipationPriceTier[];
  readonly remainders: readonly { readonly groupSize: number; readonly remainderMinor: number }[];
} {
  const start = Math.max(1, Math.trunc(minimum));
  const end = Math.max(start, Math.trunc(capacity));
  const total = Math.max(0, Math.trunc(totalMinor));
  const tiers: ParticipationPriceTier[] = [];
  const remainders: { groupSize: number; remainderMinor: number }[] = [];
  for (let size = start; size <= end; size += 1) {
    const share = Math.ceil(total / size);
    remainders.push({ groupSize: size, remainderMinor: share * size - total });
    const last = tiers.at(-1);
    if (last && last.amountMinorPerPlayer === share) {
      tiers[tiers.length - 1] = { ...last, maxParticipants: size };
    } else {
      tiers.push({
        minParticipants: size,
        maxParticipants: size,
        amountMinorPerPlayer: share,
      });
    }
  }
  return { tiers, remainders };
}

// ---------------------------------------------------------------------------
// Validation (blocking issues in plain words, cliffs as warnings)
// ---------------------------------------------------------------------------

export interface ParticipationRuleValidationContext {
  /** The host's capacity. Falls back to the rule's own `maxParticipants`. */
  readonly capacity?: number;
  /** Whether the offer can be paid with credits (a credit ladder needs it). */
  readonly allowCredits?: boolean;
  /** The fixed credit price; a credit ladder's highest rung must equal it. */
  readonly creditCost?: number;
  /** A club default carries no ladder (ladders are per offering). */
  readonly forClubDefault?: boolean;
  /** For money in warnings; defaults to USD. */
  readonly currency?: string;
}

export interface ParticipationRuleValidation {
  /** Present only when there are no issues. */
  readonly rule?: ParticipationRuleV2;
  readonly issues: readonly string[];
  readonly warnings: readonly ParticipationRevenueCliff[];
}

function describeMissing(sizes: readonly number[]): string {
  if (sizes.length === 1) return `${sizes[0]} is missing.`;
  const shown = sizes.slice(0, 3);
  const rest = sizes.length - shown.length;
  const list =
    rest > 0
      ? `${shown.join(", ")} and ${rest} more`
      : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  return `${list} are missing.`;
}

/**
 * Strictly validates a rule an operator (or Ask Duna) wants to save. Accepts
 * the 289 keys too, so the existing HQ form keeps working, but refuses the
 * attendance basis on a new save (decision 2).
 */
export function validateParticipationRuleV2(
  value: unknown,
  context: ParticipationRuleValidationContext = {},
): ParticipationRuleValidation {
  const input = record(value);
  if (!input) {
    return { issues: ["Group rules must be an object."], warnings: [] };
  }
  const issues: string[] = [];
  const unit: ParticipationUnit = input.unit === "team" ? "team" : "player";
  if (input.unit !== undefined && input.unit !== "player" && input.unit !== "team") {
    issues.push("Choose whether the group counts players or teams.");
  }
  const ownMax =
    input.maxParticipants === undefined || input.maxParticipants === null
      ? undefined
      : whole(input.maxParticipants);
  if (
    input.maxParticipants !== undefined &&
    input.maxParticipants !== null &&
    (ownMax === undefined || ownMax < 1 || ownMax > MAX_PARTICIPATION_CAPACITY)
  ) {
    issues.push(
      `The largest group must be a whole number from 1 to ${MAX_PARTICIPATION_CAPACITY}.`,
    );
  }
  const capacity = context.capacity ?? ownMax;
  if (
    capacity !== undefined &&
    (!Number.isSafeInteger(capacity) || capacity < 1)
  ) {
    return {
      issues: ["Set how many players a session holds first."],
      warnings: [],
    };
  }

  const min =
    input.minParticipants === undefined ? 1 : whole(input.minParticipants);
  if (min === undefined || min < 1) {
    issues.push("The minimum must be a whole number of 1 or more.");
  } else if (capacity !== undefined && min > capacity) {
    issues.push(
      `The minimum (${min}) can't be more than the ${plural(capacity, unit === "team" ? "team" : "player")} a session holds.`,
    );
  }

  const policy =
    input.minimumPolicy === undefined ? "run" : input.minimumPolicy;
  if (policy !== "cancel" && policy !== "run") {
    issues.push("Choose whether a session that is too small is cancelled or runs anyway.");
  }

  const rawLock =
    input.lockMinutesBeforeStart !== undefined
      ? input.lockMinutesBeforeStart
      : input.cutoffMinutesBeforeStart;
  let lock: number | undefined;
  if (rawLock !== undefined && rawLock !== null) {
    lock = whole(rawLock);
    if (lock === undefined) {
      issues.push("Choose when we decide, in whole minutes before the start.");
    } else if (lock < 0) {
      issues.push("We need to decide before the session starts.");
    } else if (lock > MAX_PARTICIPATION_LOCK_MINUTES) {
      issues.push("We can decide at most 7 days before the session starts.");
    }
  }

  if (input.settlementBasis === "attendance") {
    issues.push(
      "Prices are now fixed when the group is decided. Attendance no longer changes the price.",
    );
  } else if (
    input.settlementBasis !== undefined &&
    input.settlementBasis !== "cutoff"
  ) {
    issues.push("Prices are fixed when the group is decided.");
  }

  if (input.waitlist !== undefined && typeof input.waitlist !== "boolean") {
    issues.push("Choose whether a full session keeps a waitlist.");
  }

  const rawTiers = Array.isArray(input.tiers)
    ? input.tiers
    : input.tiers === undefined
      ? (input.creditTiers ?? [])
      : input.tiers;
  const tiers: ParticipationPriceTier[] = [];
  if (!Array.isArray(rawTiers)) {
    issues.push("Prices by group size must be a list.");
  } else if (rawTiers.length > MAX_PARTICIPATION_PRICE_TIERS) {
    issues.push(
      `Prices by group size can have at most ${MAX_PARTICIPATION_PRICE_TIERS} rows.`,
    );
  } else if (rawTiers.length > 0 && context.forClubDefault) {
    issues.push("Prices by group size are set on each offering, not the club default.");
  } else if (rawTiers.length > 0) {
    let usesCredits: boolean | undefined;
    let usesAmount: boolean | undefined;
    rawTiers.forEach((raw, index) => {
      const tier = record(raw);
      const tierMin = whole(tier?.minParticipants);
      const isLast = index === rawTiers.length - 1;
      const rawMax = tier?.maxParticipants;
      const tierMax =
        rawMax === undefined || rawMax === null
          ? isLast
            ? (capacity ?? tierMin)
            : undefined
          : whole(rawMax);
      const credits =
        tier?.creditsPerPlayer === undefined
          ? undefined
          : whole(tier.creditsPerPlayer);
      const amount =
        tier?.amountMinorPerPlayer === undefined
          ? undefined
          : whole(tier.amountMinorPerPlayer);
      const row = `Row ${index + 1}`;
      if (!tier || tierMin === undefined || tierMin < 1) {
        issues.push(`${row} needs a group size of 1 or more.`);
        return;
      }
      if (tierMax === undefined) {
        issues.push(
          `${row} needs a largest group size. Only the last row can be "or more".`,
        );
        return;
      }
      if (tierMax < tierMin) {
        issues.push(`${row} ends (${tierMax}) before it starts (${tierMin}).`);
        return;
      }
      const creditsValid =
        credits !== undefined &&
        credits >= 1 &&
        credits <= MAX_PARTICIPATION_CREDITS_PER_PLAYER;
      const amountValid =
        amount !== undefined &&
        amount >= 0 &&
        amount <= MAX_PARTICIPATION_AMOUNT_MINOR_PER_PLAYER;
      if (tier.creditsPerPlayer !== undefined && !creditsValid) {
        issues.push(`${row} needs a whole number of credits, 1 or more.`);
        return;
      }
      if (tier.amountMinorPerPlayer !== undefined && !amountValid) {
        issues.push(`${row} needs a price per player of 0 or more.`);
        return;
      }
      if (!creditsValid && !amountValid) {
        issues.push(`${row} needs a price per player.`);
        return;
      }
      if (usesCredits !== undefined && usesCredits !== creditsValid) {
        issues.push("Give every row a credit price, or none of them.");
      }
      if (usesAmount !== undefined && usesAmount !== amountValid) {
        issues.push("Give every row a card price, or none of them.");
      }
      usesCredits = creditsValid;
      usesAmount = amountValid;
      if (capacity !== undefined && tierMin > capacity) {
        issues.push(
          `${row} starts at ${plural(tierMin, unit === "team" ? "team" : "player")}, more than a session holds.`,
        );
        return;
      }
      tiers.push({
        minParticipants: tierMin,
        maxParticipants:
          capacity === undefined ? tierMax : Math.min(tierMax, capacity),
        ...(creditsValid ? { creditsPerPlayer: credits } : {}),
        ...(amountValid ? { amountMinorPerPlayer: amount } : {}),
      });
    });

    if (issues.length === 0 && tiers.length > 0) {
      const sorted = [...tiers].sort(
        (left, right) => left.minParticipants - right.minParticipants,
      );
      // Coverage: every group size from the smaller of the minimum and the
      // first row up to the capacity, exactly once.
      const end = capacity ?? sorted.at(-1)!.maxParticipants;
      const start = Math.min(min ?? 1, sorted[0]!.minParticipants);
      const counts = new Map<number, number>();
      for (const tier of sorted) {
        for (let size = tier.minParticipants; size <= tier.maxParticipants; size += 1) {
          counts.set(size, (counts.get(size) ?? 0) + 1);
        }
      }
      const overlapping = [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([size]) => size);
      for (const size of overlapping.slice(0, 1)) {
        issues.push(`Two prices cover ${plural(size, unit === "team" ? "team" : "player")}.`);
      }
      const missing: number[] = [];
      for (let size = start; size <= end; size += 1) {
        if (!counts.has(size)) missing.push(size);
      }
      if (missing.length > 0) {
        issues.push(
          `Prices must cover every group size from ${start} to ${end}. ${describeMissing(missing)}`,
        );
      }
      // Decision 3: never more per player as the group grows.
      if (!PARTICIPATION_POLICY.perPlayerPriceMayRise) {
        for (let index = 1; index < sorted.length; index += 1) {
          const before = sorted[index - 1]!;
          const after = sorted[index]!;
          const rises =
            (after.creditsPerPlayer ?? 0) > (before.creditsPerPlayer ?? Infinity) ||
            (after.amountMinorPerPlayer ?? 0) >
              (before.amountMinorPerPlayer ?? Infinity);
          if (rises) {
            issues.push(
              `The ${after.minParticipants}-player price can't be higher than the ${before.minParticipants}-player price.`,
            );
          }
        }
      }
      tiers.splice(0, tiers.length, ...sorted);
      const highestCredits = participationReservePerPlayer(tiers, "credits");
      if (highestCredits !== undefined) {
        if (context.allowCredits === false) {
          issues.push(
            "Credit prices by group size need credit payment. Turn on credits first.",
          );
        } else if (
          issues.length === 0 &&
          context.creditCost !== undefined &&
          context.creditCost !== highestCredits
        ) {
          issues.push(
            `Set the credit price to ${plural(highestCredits, "credit")}, the highest price. Players reserve that amount and get the difference back.`,
          );
        }
      }
    }
  }

  const split =
    input.splitCostMinor === undefined || input.splitCostMinor === null
      ? undefined
      : whole(input.splitCostMinor);
  if (input.splitCostMinor !== undefined && input.splitCostMinor !== null) {
    if (split === undefined || split < 1) {
      issues.push("The cost to split must be more than zero.");
    } else if (tiers.length > 0) {
      issues.push("Choose a price ladder or a cost to split, not both.");
    }
  }

  if (issues.length > 0) return { issues, warnings: [] };
  const rule: ParticipationRuleV2 = {
    version: 2,
    unit,
    minParticipants: min!,
    ...(ownMax !== undefined ? { maxParticipants: ownMax } : {}),
    minimumPolicy: policy as ParticipationPolicy,
    ...(lock !== undefined ? { lockMinutesBeforeStart: lock } : {}),
    waitlist: input.waitlist === true,
    tiers,
    ...(split !== undefined ? { splitCostMinor: split } : {}),
    ...(typeof input.effectiveFrom === "string"
      ? { effectiveFrom: input.effectiveFrom }
      : {}),
  };
  const warnings =
    capacity !== undefined && PARTICIPATION_POLICY.revenueCliffIsWarning
      ? participationRevenueCliffs(rule, capacity, context.currency)
      : [];
  return { rule, issues: [], warnings };
}

// ---------------------------------------------------------------------------
// Presets and inheritance
// ---------------------------------------------------------------------------

export type ParticipationPresetId =
  "private" | "semi-private" | "small-group" | "clinic";

export interface ParticipationPreset {
  readonly id: ParticipationPresetId;
  readonly label: string;
  /** True when the preset turns on "Price by group size" (ladder left empty for the owner). */
  readonly priceBySize: boolean;
  readonly rule: ParticipationRuleV2 & { readonly maxParticipants: number };
}

/** Proposed defaults, not prices (participation.md §7.1). */
export const PARTICIPATION_PRESETS: readonly ParticipationPreset[] = [
  {
    id: "private",
    label: "Private",
    priceBySize: false,
    rule: {
      version: 2,
      unit: "player",
      minParticipants: 1,
      maxParticipants: 1,
      minimumPolicy: "run",
      waitlist: false,
      tiers: [],
    },
  },
  {
    id: "semi-private",
    label: "Semi-private",
    priceBySize: false,
    rule: {
      version: 2,
      unit: "player",
      minParticipants: 2,
      maxParticipants: 2,
      minimumPolicy: "cancel",
      waitlist: false,
      tiers: [],
    },
  },
  {
    id: "small-group",
    label: "Small group",
    priceBySize: false,
    rule: {
      version: 2,
      unit: "player",
      minParticipants: 3,
      maxParticipants: 6,
      minimumPolicy: "cancel",
      waitlist: true,
      tiers: [],
    },
  },
  {
    id: "clinic",
    label: "Clinic",
    priceBySize: true,
    rule: {
      version: 2,
      unit: "player",
      minParticipants: 4,
      maxParticipants: 12,
      minimumPolicy: "cancel",
      waitlist: true,
      tiers: [],
    },
  },
];

export function participationPreset(
  id: ParticipationPresetId,
): ParticipationPreset {
  return PARTICIPATION_PRESETS.find((preset) => preset.id === id)!;
}

/** Which preset a rule matches exactly (ignoring the lock), if any. */
export function matchParticipationPreset(
  rule: Pick<ParticipationRuleV2, "minParticipants" | "minimumPolicy" | "waitlist">,
  capacity: number,
): ParticipationPresetId | undefined {
  return PARTICIPATION_PRESETS.find(
    (preset) =>
      preset.rule.minParticipants === rule.minParticipants &&
      preset.rule.maxParticipants === capacity &&
      (preset.rule.minParticipants === 1 ||
        preset.rule.minimumPolicy === rule.minimumPolicy) &&
      preset.rule.waitlist === rule.waitlist,
  )?.id;
}

/**
 * Inheritance (§4.3): an offering with a rule of its own uses it (an explicit
 * "No minimum" is a rule of its own); otherwise the club default, when the
 * club applies it to this kind. A session that holds one never inherits a
 * group rule; a default minimum above a smaller session's capacity becomes
 * "must be full".
 */
export function resolveParticipationRules(input: {
  readonly own?: unknown;
  readonly clubDefault?: unknown;
  readonly clubDefaultAppliesTo?: readonly string[];
  readonly kind: string;
  readonly capacity: number;
  readonly refundWindowMinutes?: number;
}): {
  readonly rule?: ResolvedParticipationRule;
  readonly source: ParticipationRuleSource;
} {
  const clubDefault = readParticipationRuleV2(input.clubDefault);
  const own = readParticipationRuleV2(input.own);
  const context = {
    capacity: input.capacity,
    defaultLockMinutes: clubDefault?.lockMinutesBeforeStart,
    refundWindowMinutes: input.refundWindowMinutes,
  };
  if (own) {
    return { rule: resolveParticipationRuleV2(own, context), source: "own" };
  }
  if (
    clubDefault &&
    input.capacity > 1 &&
    (input.clubDefaultAppliesTo ?? ["service"]).includes(input.kind)
  ) {
    return {
      rule: resolveParticipationRuleV2(
        { ...clubDefault, tiers: [], splitCostMinor: undefined },
        context,
      ),
      source: "club-default",
    };
  }
  return { source: "none" };
}

// ---------------------------------------------------------------------------
// Rule changes after people booked (§8)
// ---------------------------------------------------------------------------

export type ParticipationChangeClass = "loosens" | "tightens" | "neutral";

export interface ParticipationRuleChange {
  readonly overall: ParticipationChangeClass;
  readonly fields: {
    readonly minimum: ParticipationChangeClass;
    readonly policy: ParticipationChangeClass;
    readonly lock: ParticipationChangeClass;
    readonly prices: ParticipationChangeClass;
    readonly capacity: ParticipationChangeClass;
    readonly waitlist: ParticipationChangeClass;
  };
}

function compare(
  before: number,
  after: number,
  loosensWhen: "lower" | "higher",
): ParticipationChangeClass {
  if (before === after) return "neutral";
  return (after < before) === (loosensWhen === "lower") ? "loosens" : "tightens";
}

/**
 * Classifies a rule change for people who already booked. Loosening: lower
 * minimum, cancel → run, cheaper (never dearer) prices at every size, a
 * later lock, more places. Anything that tightens one field tightens overall.
 */
export function classifyRuleChange(
  before: ResolvedParticipationRule,
  after: ResolvedParticipationRule,
): ParticipationRuleChange {
  let cheaper = false;
  let dearer = false;
  const sizes = Math.max(before.capacity, after.capacity);
  for (const unit of ["credits", "minor"] as const) {
    for (let size = 1; size <= sizes; size += 1) {
      const was = perPlayerPrice(before.tiers, size, unit);
      const now = perPlayerPrice(after.tiers, size, unit);
      if (was === undefined && now === undefined) continue;
      if (was === undefined || now === undefined) {
        // A ladder added or removed: the reserve is what people agreed to.
        const wasMax = participationReservePerPlayer(before.tiers, unit);
        const nowMax = participationReservePerPlayer(after.tiers, unit);
        if (wasMax !== undefined && now !== undefined && now > wasMax) dearer = true;
        else if (nowMax !== undefined && was !== undefined && was > nowMax) cheaper = true;
        else if (was === undefined) dearer = true;
        else cheaper = true;
        continue;
      }
      if (now < was) cheaper = true;
      if (now > was) dearer = true;
    }
  }
  const fields = {
    minimum: compare(before.minParticipants, after.minParticipants, "lower"),
    policy:
      before.minimumPolicy === after.minimumPolicy
        ? ("neutral" as const)
        : after.minimumPolicy === "run"
          ? ("loosens" as const)
          : ("tightens" as const),
    // Fewer minutes before the start is a later lock: more time to cancel free.
    lock: compare(
      before.lockMinutesBeforeStart,
      after.lockMinutesBeforeStart,
      "lower",
    ),
    prices: dearer
      ? ("tightens" as const)
      : cheaper
        ? ("loosens" as const)
        : ("neutral" as const),
    capacity: compare(before.capacity, after.capacity, "higher"),
    waitlist: "neutral" as const,
  };
  const values = Object.values(fields);
  return {
    overall: values.includes("tightens")
      ? "tightens"
      : values.includes("loosens")
        ? "loosens"
        : "neutral",
    fields,
  };
}

/** The JSON stored for a rule (the snapshot, the club default, the host column). */
export function serializeParticipationRule(
  rule: ParticipationRuleV2,
): Record<string, unknown> {
  return {
    version: 2,
    unit: rule.unit,
    minParticipants: rule.minParticipants,
    ...(rule.maxParticipants !== undefined
      ? { maxParticipants: rule.maxParticipants }
      : {}),
    minimumPolicy: rule.minimumPolicy,
    ...(rule.lockMinutesBeforeStart !== undefined
      ? { lockMinutesBeforeStart: rule.lockMinutesBeforeStart }
      : {}),
    waitlist: rule.waitlist,
    tiers: rule.tiers.map((tier) => ({ ...tier })),
    ...(rule.splitCostMinor !== undefined
      ? { splitCostMinor: rule.splitCostMinor }
      : {}),
    ...(rule.effectiveFrom ? { effectiveFrom: rule.effectiveFrom } : {}),
    ...(rule.legacySettlementBasis
      ? { legacySettlementBasis: rule.legacySettlementBasis }
      : {}),
  };
}
