/**
 * The group rule as the owner edits it: a sentence with editable words
 * (participation.md §7.1, "RuleSentence"). Pure: the editor's state, its
 * mapping to and from the stored rule, and validation. Every message comes
 * from `@duna/core` (`validateParticipationRuleV2`, the cliff warnings, the
 * presets); this file only arranges them. Shared by offerings and, later,
 * event sessions and divisions.
 */
import {
  matchParticipationPreset,
  MAX_PARTICIPATION_CAPACITY,
  PARTICIPATION_POLICY,
  PARTICIPATION_PRESETS,
  participationPreset,
  readParticipationRuleV2,
  serializeParticipationRule,
  suggestParticipationCliffFix,
  validateParticipationRuleV2,
  type ParticipationPolicy,
  type ParticipationPresetId,
  type ParticipationRevenueCliff,
  type ParticipationRuleV2,
  type ParticipationUnit,
} from "@duna/core";

/** One rung of the ladder as the editor shows it: "From 4 players · 3 credits each". */
export interface LadderRowDraft {
  /** The smallest group this price applies to. */
  readonly from: number | null;
  readonly credits: number | null;
}

/** The sentence's editable words. */
export interface RuleDraft {
  readonly unit: ParticipationUnit;
  /** "Runs with at least [3] players". 1 means no minimum. */
  readonly minParticipants: number | null;
  /** "up to [8]": the session's capacity (the offering's, not the rule's). */
  readonly capacity: number | null;
  /** "We decide [24 hours] before it starts". `null`: the club default. */
  readonly lockMinutes: number | null;
  /** "If fewer are booked, [cancel and return credits or payment]". */
  readonly policy: ParticipationPolicy;
  /** "When it's full, [keep a waitlist]". */
  readonly waitlist: boolean;
  /** "Price by group size" switched on. */
  readonly priceBySize: boolean;
  readonly ladder: readonly LadderRowDraft[];
}

/** Times the group can be decided, in minutes before the start. */
export const LOCK_CHOICES: readonly number[] = [
  60, 120, 180, 360, 720, 1_440, 2_880, 4_320, 10_080,
];

/** "24 hours", "2 days", "1 hour": how a lock reads inside the sentence. */
export function lockPhrase(minutes: number): string {
  if (minutes % 1_440 === 0 && minutes >= 2_880) {
    const days = minutes / 1_440;
    return `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

/** The lock the club falls back to (decision 1), in minutes. */
export const FALLBACK_LOCK_MINUTES =
  PARTICIPATION_POLICY.defaultLockMinutesBeforeStart;

function ladderFromTiers(rule: ParticipationRuleV2): LadderRowDraft[] {
  return rule.tiers.map((tier) => ({
    from: tier.minParticipants,
    credits: tier.creditsPerPlayer ?? null,
  }));
}

/**
 * The editor's state for a stored rule. No rule: a session with no minimum
 * (min 1, runs either way), so the sentence still reads true.
 */
export function draftFromRule(
  stored: unknown,
  capacity: number,
  unit: ParticipationUnit = "player",
): RuleDraft {
  const rule = readParticipationRuleV2(stored);
  return {
    unit: rule?.unit ?? unit,
    minParticipants: rule?.minParticipants ?? 1,
    capacity,
    lockMinutes: rule?.lockMinutesBeforeStart ?? null,
    policy: rule?.minimumPolicy ?? "run",
    waitlist: rule?.waitlist ?? false,
    priceBySize: (rule?.tiers.length ?? 0) > 0,
    ladder: rule ? ladderFromTiers(rule) : [],
  };
}

/** A preset as the editor's state (participation.md §7.1 table). */
export function draftFromPreset(
  id: ParticipationPresetId,
  current: RuleDraft,
): RuleDraft {
  const preset = participationPreset(id);
  const capacity = preset.rule.maxParticipants;
  return {
    unit: current.unit,
    minParticipants: preset.rule.minParticipants,
    capacity,
    lockMinutes: current.lockMinutes,
    policy:
      preset.rule.minParticipants === 1 ? "run" : preset.rule.minimumPolicy,
    waitlist: preset.rule.waitlist,
    priceBySize: preset.priceBySize,
    // "Ladder left empty for the owner": one row from the minimum, no price yet.
    ladder: preset.priceBySize
      ? [{ from: preset.rule.minParticipants, credits: null }]
      : [],
  };
}

/** The presets offered as choice cards, with the sentence each one means. */
export const RULE_PRESETS = PARTICIPATION_PRESETS;

/** Which preset the draft is exactly, if any (the lock is not part of it). */
export function draftPreset(
  draft: RuleDraft,
): ParticipationPresetId | undefined {
  if (draft.minParticipants === null || draft.capacity === null) {
    return undefined;
  }
  const id = matchParticipationPreset(
    {
      minParticipants: draft.minParticipants,
      minimumPolicy: draft.policy,
      waitlist: draft.waitlist,
    },
    draft.capacity,
  );
  if (!id) return undefined;
  return participationPreset(id).priceBySize === draft.priceBySize
    ? id
    : undefined;
}

/**
 * The ladder rows as tiers: each row runs until the next row starts; the
 * last runs to the session's capacity ("or more"). Rows are sorted by where
 * they start; a row without a start is passed through for the validator to
 * name.
 */
export function ladderTiers(
  ladder: readonly LadderRowDraft[],
  capacity: number | null,
): Record<string, unknown>[] {
  const rows = [...ladder].sort(
    (left, right) =>
      (left.from ?? Number.MAX_SAFE_INTEGER) -
      (right.from ?? Number.MAX_SAFE_INTEGER),
  );
  return rows.map((row, index) => {
    const next = rows[index + 1];
    const isLast = index === rows.length - 1;
    return {
      minParticipants: row.from ?? undefined,
      maxParticipants: isLast
        ? (capacity ?? row.from ?? undefined)
        : next?.from != null
          ? next.from - 1
          : undefined,
      ...(row.credits !== null ? { creditsPerPlayer: row.credits } : {}),
    };
  });
}

/** The value the validator and the server receive for this draft. */
export function ruleInputFromDraft(draft: RuleDraft): Record<string, unknown> {
  return {
    version: 2,
    unit: draft.unit,
    minParticipants: draft.minParticipants ?? undefined,
    minimumPolicy: (draft.minParticipants ?? 1) <= 1 ? "run" : draft.policy,
    ...(draft.lockMinutes !== null
      ? { lockMinutesBeforeStart: draft.lockMinutes }
      : {}),
    waitlist: draft.waitlist,
    tiers: draft.priceBySize ? ladderTiers(draft.ladder, draft.capacity) : [],
  };
}

export interface DraftCheck {
  /** The rule to store, present only when there are no issues. */
  readonly rule?: ParticipationRuleV2;
  /** Blocking, in the shared core's words. */
  readonly issues: readonly string[];
  /** "A 7th player lowers your total from 12 to 7 credits." */
  readonly warnings: readonly ParticipationRevenueCliff[];
}

/**
 * Validates the sentence with the shared core. Only the capacity is checked
 * here (it belongs to the offering, not the rule); everything else is the
 * core's validation, word for word.
 */
export function checkDraft(
  draft: RuleDraft,
  context: {
    readonly allowCredits?: boolean;
    readonly creditCost?: number;
    readonly currency?: string;
    readonly forClubDefault?: boolean;
  } = {},
): DraftCheck {
  const capacity = draft.capacity;
  if (
    !context.forClubDefault &&
    (capacity === null ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      capacity > MAX_PARTICIPATION_CAPACITY)
  ) {
    // The same words the core uses when a session has no capacity.
    return {
      issues: ["Set how many players a session holds first."],
      warnings: [],
    };
  }
  if (draft.priceBySize && draft.ladder.length === 0) {
    const result = validateParticipationRuleV2(
      { ...ruleInputFromDraft(draft), tiers: [{}] },
      { capacity: capacity ?? undefined, ...context },
    );
    return { issues: result.issues, warnings: [] };
  }
  const result = validateParticipationRuleV2(ruleInputFromDraft(draft), {
    ...(context.forClubDefault ? {} : { capacity: capacity ?? undefined }),
    allowCredits: context.allowCredits,
    creditCost: context.creditCost,
    currency: context.currency,
    forClubDefault: context.forClubDefault,
  });
  return {
    ...(result.rule ? { rule: result.rule } : {}),
    issues: result.issues,
    warnings: result.warnings,
  };
}

/** The stored JSON for a valid draft (what `configuration.participation` holds). */
export function storedRule(rule: ParticipationRuleV2): Record<string, unknown> {
  return serializeParticipationRule(rule);
}

/** "Show a fix": the core's nearest ladder without a cliff, as editor rows. */
export function cliffFixLadder(
  draft: RuleDraft,
): readonly LadderRowDraft[] | undefined {
  const check = validateParticipationRuleV2(ruleInputFromDraft(draft), {
    capacity: draft.capacity ?? undefined,
  });
  if (!check.rule || check.warnings.length === 0) return undefined;
  return suggestParticipationCliffFix(check.rule).map((tier) => ({
    from: tier.minParticipants,
    credits: tier.creditsPerPlayer ?? null,
  }));
}

/** The highest rung in credits: what players reserve, and the credit price it implies. */
export function ladderReserve(
  ladder: readonly LadderRowDraft[],
): number | undefined {
  const prices = ladder
    .map((row) => row.credits)
    .filter((value): value is number => value !== null && value > 0);
  return prices.length === 0 ? undefined : Math.max(...prices);
}

/** Adds a ladder row after the last one (one more player than it starts at). */
export function addLadderRow(
  ladder: readonly LadderRowDraft[],
  minimum: number,
): LadderRowDraft[] {
  const last = ladder.at(-1);
  const from = last?.from != null ? last.from + 1 : Math.max(1, minimum);
  return [...ladder, { from, credits: last?.credits ?? null }];
}

/**
 * The per-size totals the cliff warning talks about, for the worked numbers
 * ("with 7 players you earn less than with 6"): the club's total at each
 * group size from the minimum to the capacity.
 */
export function ladderTotals(
  draft: RuleDraft,
): readonly { readonly size: number; readonly total: number }[] {
  const check = validateParticipationRuleV2(ruleInputFromDraft(draft), {
    capacity: draft.capacity ?? undefined,
  });
  const tiers = check.rule?.tiers ?? [];
  if (tiers.length === 0 || draft.capacity === null) return [];
  const start = tiers[0]!.minParticipants;
  const rows: { size: number; total: number }[] = [];
  for (let size = start; size <= draft.capacity; size += 1) {
    const tier =
      tiers.find(
        (candidate) =>
          size >= candidate.minParticipants &&
          size <= candidate.maxParticipants,
      ) ?? tiers.at(-1)!;
    if (tier.creditsPerPlayer !== undefined) {
      rows.push({ size, total: tier.creditsPerPlayer * size });
    }
  }
  return rows;
}

/**
 * The sentence read aloud (for an inherited rule, a summary, Ask Duna's
 * context): the same words the editor shows around its controls.
 */
export function ruleSentenceText(
  stored: unknown,
  context: { readonly defaultLockMinutes?: number } = {},
): string {
  const rule = readParticipationRuleV2(stored);
  if (!rule || rule.minParticipants <= 1) {
    return "Runs whatever the number of players.";
  }
  const noun = rule.unit === "team" ? "teams" : "players";
  const lock =
    rule.lockMinutesBeforeStart ??
    context.defaultLockMinutes ??
    FALLBACK_LOCK_MINUTES;
  const outcome =
    rule.minimumPolicy === "cancel"
      ? "cancel and return credits or payment"
      : "run it anyway";
  return `Runs with at least ${rule.minParticipants} ${noun}. We decide ${lockPhrase(lock)} before it starts. If fewer are booked, ${outcome}.${rule.waitlist ? " When it's full, keep a waitlist." : ""}`;
}
