import {
  DEFAULT_PARTICIPATION_CUTOFF_MINUTES,
  MAX_PARTICIPATION_CREDIT_TIERS,
} from "@duna/core";

export interface ParticipationTierRow {
  /** Largest group size this tier covers. Ignored on the last tier. */
  readonly upTo: number;
  readonly credits: number;
}

export interface ParticipationDraft {
  readonly minPlayers: number;
  readonly minimumPolicy: "cancel" | "run";
  readonly cutoffMinutes: number;
  readonly settlementBasis: "cutoff" | "attendance";
  readonly tiersEnabled: boolean;
  readonly tierRows: readonly ParticipationTierRow[];
}

export interface ResolvedParticipationTier {
  readonly minParticipants: number;
  readonly maxParticipants: number;
  readonly creditsPerPlayer: number;
}

function whole(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : fallback;
}

export function initialParticipationDraft(
  configuration: Readonly<Record<string, unknown>>,
): ParticipationDraft {
  const stored =
    configuration.participation &&
    typeof configuration.participation === "object" &&
    !Array.isArray(configuration.participation)
      ? (configuration.participation as Readonly<Record<string, unknown>>)
      : {};
  const storedTiers = Array.isArray(stored.creditTiers)
    ? stored.creditTiers.flatMap((tier) => {
        const entry = tier as Readonly<Record<string, unknown>> | null;
        const credits = whole(entry?.creditsPerPlayer, 0);
        return credits > 0
          ? [
              {
                upTo: whole(
                  entry?.maxParticipants,
                  whole(entry?.minParticipants, 1),
                ),
                credits,
              },
            ]
          : [];
      })
    : [];
  return {
    minPlayers: Math.max(1, whole(stored.minParticipants, 1)),
    minimumPolicy: stored.minimumPolicy === "cancel" ? "cancel" : "run",
    cutoffMinutes: Math.max(
      0,
      whole(
        stored.cutoffMinutesBeforeStart,
        DEFAULT_PARTICIPATION_CUTOFF_MINUTES,
      ),
    ),
    settlementBasis:
      stored.settlementBasis === "attendance" ? "attendance" : "cutoff",
    tiersEnabled: storedTiers.length > 0,
    tierRows: storedTiers,
  };
}

/**
 * Turns the editable rows into contiguous tiers that start at the minimum and
 * end at the capacity, so the operator can never save a gap or an overlap.
 */
export function resolveParticipationTiers(
  draft: ParticipationDraft,
  capacity: number,
): readonly ResolvedParticipationTier[] {
  if (!draft.tiersEnabled) return [];
  const floor = Math.min(capacity, Math.max(1, draft.minPlayers));
  const rows = draft.tierRows.slice(
    0,
    Math.min(MAX_PARTICIPATION_CREDIT_TIERS, capacity - floor + 1),
  );
  let start = floor;
  return rows.map((row, index) => {
    const remainingRows = rows.length - 1 - index;
    const maxParticipants =
      remainingRows === 0
        ? capacity
        : Math.min(capacity - remainingRows, Math.max(start, row.upTo));
    const tier = {
      minParticipants: start,
      maxParticipants,
      creditsPerPlayer: Math.max(1, Math.trunc(row.credits) || 1),
    };
    start = maxParticipants + 1;
    return tier;
  });
}

export function highestParticipationTierCredits(
  draft: ParticipationDraft,
  capacity: number,
): number | undefined {
  const tiers = resolveParticipationTiers(draft, capacity);
  return tiers.length === 0
    ? undefined
    : Math.max(...tiers.map((tier) => tier.creditsPerPlayer));
}

/** Undefined when nothing was configured, so capacity-only offers stay as they are. */
export function participationConfiguration(
  draft: ParticipationDraft,
  capacity: number,
): Readonly<Record<string, unknown>> | undefined {
  const creditTiers = resolveParticipationTiers(draft, capacity);
  const minParticipants = Math.min(capacity, Math.max(1, draft.minPlayers));
  if (creditTiers.length === 0 && minParticipants <= 1) return undefined;
  return {
    minParticipants,
    minimumPolicy: minParticipants > 1 ? draft.minimumPolicy : "run",
    cutoffMinutesBeforeStart: draft.cutoffMinutes,
    settlementBasis: creditTiers.length > 0 ? draft.settlementBasis : "cutoff",
    creditTiers,
  };
}
