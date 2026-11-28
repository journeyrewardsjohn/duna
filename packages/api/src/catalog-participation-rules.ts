import type { catalogSessionOccurrences } from "@duna/db";
import {
  creditTierForHeadcount,
  describeParticipationTier,
  participationCutoffAt,
  participationTierLabel,
  creditTiersFromPriceTiers,
  participationRuleIsInert,
  readParticipationRules,
  reservedCreditsPerPlayer,
  serializeParticipationRule,
  validateParticipationRuleV2,
  type ParticipationCreditTier,
  type ParticipationRules,
} from "@duna/core";
import { deriveParticipationState, type ParticipationState } from "@duna/core";
import { stableHash } from "./canonical";

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Validates and normalizes `configuration.participation` when an operator
 * saves a catalog item. Offers without the key are returned untouched, so a
 * capacity-only offer keeps behaving exactly as it did before.
 */
export function normalizeParticipationConfiguration(input: {
  readonly type: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly allowCredits: boolean;
  readonly creditCost?: number;
  /** The configuration being replaced, when the item already exists. */
  readonly previousConfiguration?: Readonly<Record<string, unknown>>;
  readonly now: Date;
}): Readonly<Record<string, unknown>> {
  if (
    input.configuration.participation === undefined ||
    input.configuration.participation === null
  ) {
    return input.configuration;
  }
  if (input.type !== "service") {
    throw new Error(
      "Player minimums and group-size pricing are available on scheduled services.",
    );
  }
  const capacity = positiveInteger(input.configuration.capacity, 1);
  // Version 2 validation: plain-language messages, prices that never rise
  // as the group grows, no attendance pricing on a new save (decisions 2, 3).
  const result = validateParticipationRuleV2(
    input.configuration.participation,
    {
      capacity,
      allowCredits: input.allowCredits,
      creditCost: input.creditCost,
    },
  );
  if (!result.rule) throw new Error(result.issues.join(" "));
  const schedule = record(input.configuration.sessionSchedule);
  if (
    !participationRuleIsInert(result.rule) &&
    schedule?.mode !== "one-off" &&
    schedule?.mode !== "recurring"
  ) {
    throw new Error(
      "Player minimums and group-size pricing need preset session dates. Choose one-off or recurring sessions.",
    );
  }
  const {
    effectiveFrom: _ignored,
    maxParticipants: _capacity,
    ...rule
  } = result.rule;
  void _ignored;
  void _capacity;
  const rest: Record<string, unknown> = {
    ...serializeParticipationRule({ ...rule }),
    // Read by the 289 HQ form until PART-6 replaces it. Deprecated mirrors:
    // drop them once no reader uses `cutoffMinutesBeforeStart`/`creditTiers`.
    ...(rule.lockMinutesBeforeStart !== undefined
      ? { cutoffMinutesBeforeStart: rule.lockMinutesBeforeStart }
      : {}),
    settlementBasis: "cutoff",
    creditTiers: creditTiersFromPriceTiers(rule.tiers),
  };
  // `effectiveFrom` records when these exact rules took effect. Sessions
  // already inside their cutoff window when rules are added or changed are
  // decided later rather than the moment the rules are saved.
  const previous = record(input.previousConfiguration?.participation);
  const previousRules = previous ? { ...previous } : undefined;
  if (previousRules) delete previousRules.effectiveFrom;
  const unchanged =
    previousRules !== undefined &&
    typeof previous?.effectiveFrom === "string" &&
    stableHash(previousRules) === stableHash(rest);
  return {
    ...input.configuration,
    participation: {
      ...rest,
      effectiveFrom: unchanged
        ? previous.effectiveFrom
        : input.now.toISOString(),
    },
  };
}

/**
 * When a session could first be booked under its current rules: the latest of
 * the session's creation, the offer's first publication, and the rules being
 * saved. See `participationCutoffAt`.
 */
export function participationOpenedAt(input: {
  readonly occurrenceCreatedAt: Date;
  readonly itemPublishedAt?: Date | null;
  readonly configuration: Readonly<Record<string, unknown>>;
}): Date {
  const effectiveFrom = record(
    input.configuration.participation,
  )?.effectiveFrom;
  const saved =
    typeof effectiveFrom === "string" ? new Date(effectiveFrom) : undefined;
  return new Date(
    Math.max(
      input.occurrenceCreatedAt.getTime(),
      input.itemPublishedAt?.getTime() ?? 0,
      saved && !Number.isNaN(saved.getTime()) ? saved.getTime() : 0,
    ),
  );
}

export function catalogItemParticipationRules(
  configuration: Readonly<Record<string, unknown>>,
  capacity: number,
): ParticipationRules | undefined {
  return readParticipationRules(configuration.participation, capacity);
}

export interface PublicParticipationSummary {
  readonly minParticipants: number;
  readonly maxParticipants: number;
  readonly minimumPolicy: "cancel" | "run";
  readonly cutoffMinutesBeforeStart: number;
  readonly settlementBasis: "cutoff" | "attendance";
  readonly reservedCreditsPerPlayer?: number;
  readonly creditTiers: readonly {
    readonly minParticipants: number;
    readonly maxParticipants: number;
    readonly creditsPerPlayer: number;
    readonly label: string;
    readonly description: string;
  }[];
}

/** The item-level summary a partner site renders ("2 to 6 players, 2 credits each"). */
export function publicParticipationSummary(
  rules: ParticipationRules,
): PublicParticipationSummary {
  return {
    minParticipants: rules.minParticipants,
    maxParticipants: rules.maxParticipants,
    minimumPolicy: rules.minimumPolicy,
    cutoffMinutesBeforeStart: rules.cutoffMinutesBeforeStart,
    settlementBasis: rules.settlementBasis,
    reservedCreditsPerPlayer: reservedCreditsPerPlayer(rules.creditTiers),
    creditTiers: rules.creditTiers.map((tier) => {
      const bounded = {
        ...tier,
        maxParticipants: Math.min(tier.maxParticipants, rules.maxParticipants),
      };
      return {
        ...bounded,
        label: participationTierLabel(bounded, rules.maxParticipants),
        description: describeParticipationTier(bounded, rules.maxParticipants),
      };
    }),
  };
}

export interface OccurrenceParticipationState {
  readonly capacity: number;
  readonly bookedCount: number;
  readonly spotsRemaining: number;
  readonly minParticipants: number;
  readonly minimumMet: boolean;
  readonly playersNeeded: number;
  readonly decisionAt: string;
  readonly status:
    "open" | "confirmed" | "running-under-minimum" | "cancelled-under-minimum";
  /** Per-player credits if the session ran with the players booked now. */
  readonly currentCreditsPerPlayer?: number;
  /** Per-player credits once one more player joins. */
  readonly nextCreditsPerPlayer?: number;
  /** Credits taken from the wallet for one place booked right now. */
  readonly bookingCreditsPerPlayer?: number;
  readonly settledHeadcount?: number;
  /** PART: the state every surface shows (participation.md §3.2). */
  readonly displayState?: ParticipationState;
  /** PART: alias of `decisionAt` (the lock, with any extension). */
  readonly lockAt?: string;
  readonly waitlistCount?: number;
  /** PART: decision 1, the lock is the free-cancellation deadline. */
  readonly freeCancelUntil?: string;
  /** PART: unpaid checkouts holding a place (count for capacity only). */
  readonly heldCount?: number;
}

export function occurrenceParticipationState(input: {
  readonly rules: ParticipationRules;
  readonly occurrence: Pick<
    typeof catalogSessionOccurrences.$inferSelect,
    | "capacity"
    | "startsAt"
    | "participationOutcome"
    | "settledHeadcount"
    | "participationSettledAt"
  > &
    Partial<
      Pick<typeof catalogSessionOccurrences.$inferSelect, "endsAt" | "status">
    >;
  /** Confirmed places (paid, or an unexpired pay-in-person reservation). */
  readonly bookedCount: number;
  /** See `participationOpenedAt`. Omit to use the configured cutoff as is. */
  readonly openedAt?: Date;
  /** The engine's lock (snapshot, extension); wins over the computed one. */
  readonly lockAt?: Date;
  readonly heldCount?: number;
  readonly waitlistCount?: number;
  /** "cancelled-by-club" when a person at the club cancelled. */
  readonly decisionOutcome?: string | null;
  readonly now?: Date;
}): OccurrenceParticipationState {
  const { rules, occurrence, bookedCount } = input;
  const lockAt =
    input.lockAt ??
    participationCutoffAt(occurrence.startsAt, rules, input.openedAt);
  const outcome =
    input.decisionOutcome === "cancelled-by-club" ||
    (occurrence.status === "cancelled" && !occurrence.participationOutcome)
      ? ("cancelled-by-club" as const)
      : occurrence.participationOutcome === "minimum-met" ||
          occurrence.participationOutcome === "run-under-minimum" ||
          occurrence.participationOutcome === "cancel-under-minimum"
        ? occurrence.participationOutcome
        : undefined;
  const displayState =
    input.now && occurrence.endsAt
      ? deriveParticipationState({
          booked: bookedCount,
          minParticipants: rules.minParticipants,
          capacity: occurrence.capacity,
          outcome,
          now: input.now,
          endsAt: occurrence.endsAt,
        })
      : undefined;
  const settledHeadcount = occurrence.participationSettledAt
    ? (occurrence.settledHeadcount ?? undefined)
    : undefined;
  const reserved = reservedCreditsPerPlayer(rules.creditTiers);
  return {
    capacity: occurrence.capacity,
    bookedCount,
    spotsRemaining: Math.max(
      0,
      occurrence.capacity - bookedCount - (input.heldCount ?? 0),
    ),
    minParticipants: rules.minParticipants,
    minimumMet: bookedCount >= rules.minParticipants,
    playersNeeded: Math.max(0, rules.minParticipants - bookedCount),
    decisionAt: lockAt.toISOString(),
    lockAt: lockAt.toISOString(),
    freeCancelUntil: lockAt.toISOString(),
    ...(displayState ? { displayState } : {}),
    ...(input.waitlistCount !== undefined
      ? { waitlistCount: input.waitlistCount }
      : {}),
    ...(input.heldCount !== undefined ? { heldCount: input.heldCount } : {}),
    status:
      occurrence.participationOutcome === "cancel-under-minimum"
        ? "cancelled-under-minimum"
        : occurrence.participationOutcome === "run-under-minimum"
          ? "running-under-minimum"
          : occurrence.participationOutcome === "minimum-met"
            ? "confirmed"
            : "open",
    currentCreditsPerPlayer: creditTierForHeadcount(
      rules.creditTiers,
      settledHeadcount ?? Math.max(1, bookedCount),
    )?.creditsPerPlayer,
    nextCreditsPerPlayer: creditTierForHeadcount(
      rules.creditTiers,
      settledHeadcount ?? bookedCount + 1,
    )?.creditsPerPlayer,
    bookingCreditsPerPlayer:
      settledHeadcount === undefined
        ? reserved
        : creditTierForHeadcount(rules.creditTiers, settledHeadcount)
            ?.creditsPerPlayer,
    settledHeadcount,
  };
}

/** The rules a booking agreed to, stored on the fulfillment at checkout. */
export interface BookingParticipationSnapshot {
  readonly version: 1;
  readonly minParticipants: number;
  readonly maxParticipants: number;
  readonly minimumPolicy: "cancel" | "run";
  readonly cutoffMinutesBeforeStart: number;
  readonly settlementBasis: "cutoff" | "attendance";
  readonly creditTiers: readonly ParticipationCreditTier[];
  readonly reservedCreditsPerPlayer?: number;
  /** Set when the headcount was already final at booking; nothing to settle. */
  readonly pricedAtSettledHeadcount?: number;
}

export function bookingParticipationSnapshot(input: {
  readonly rules: ParticipationRules;
  readonly creditsPerPlayer?: number;
  readonly settledHeadcount?: number;
}): BookingParticipationSnapshot {
  return {
    version: 1,
    minParticipants: input.rules.minParticipants,
    maxParticipants: input.rules.maxParticipants,
    minimumPolicy: input.rules.minimumPolicy,
    cutoffMinutesBeforeStart: input.rules.cutoffMinutesBeforeStart,
    settlementBasis: input.rules.settlementBasis,
    creditTiers: input.rules.creditTiers,
    reservedCreditsPerPlayer: input.creditsPerPlayer,
    pricedAtSettledHeadcount: input.settledHeadcount,
  };
}

export function readBookingSnapshot(
  details: Readonly<Record<string, unknown>>,
): BookingParticipationSnapshot | undefined {
  const snapshot = record(details.participation);
  if (!snapshot || snapshot.version !== 1) return undefined;
  const rules = readParticipationRules(
    snapshot,
    positiveInteger(snapshot.maxParticipants, 1),
  );
  if (!rules) return undefined;
  return {
    ...bookingParticipationSnapshot({ rules }),
    reservedCreditsPerPlayer:
      typeof snapshot.reservedCreditsPerPlayer === "number"
        ? snapshot.reservedCreditsPerPlayer
        : undefined,
    pricedAtSettledHeadcount:
      typeof snapshot.pricedAtSettledHeadcount === "number"
        ? snapshot.pricedAtSettledHeadcount
        : undefined,
  };
}
