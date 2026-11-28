/**
 * A group rule in words (participation.md §1 principle 1, §7.1): the one
 * sentence an owner reads ("Runs with at least 3 players, up to 6. If fewer
 * are booked 24 hours before, cancel and return credits. Keeps a waitlist.")
 * and the short phrase a preset chip shows ("3 to 6 players · cancel if
 * fewer · waitlist"). Every surface uses these; none builds its own.
 *
 * The parsers read the same words back. They exist so the round trip is
 * provable (tests) and so Ask Duna can check a sentence it is about to show
 * says what the rule says; they are not a natural-language input.
 */
import { PARTICIPATION_POLICY } from "./policy";
import {
  participationUnitNoun,
  type ParticipationPolicy,
  type ParticipationRuleV2,
  type ParticipationUnit,
} from "./rules";

export interface ParticipationRuleSentenceOptions {
  /** English only today; another locale adds a table, not a branch. */
  readonly locale?: string;
  /** The host's capacity; wins over the rule's own `maxParticipants`. */
  readonly capacity?: number;
}

export type ParticipationRuleWords = Pick<
  ParticipationRuleV2,
  | "unit"
  | "minParticipants"
  | "maxParticipants"
  | "minimumPolicy"
  | "lockMinutesBeforeStart"
  | "waitlist"
  | "tiers"
>;

function nouns(unit: ParticipationUnit, count: number): string {
  return `${count} ${participationUnitNoun(unit, count)}`;
}

/** 1,440 → "24 hours"; 2,880 → "2 days"; 90 → "1 hour 30 minutes"; 0 → "" (at the start). */
export function participationLockDuration(minutes: number): string {
  const total = Math.max(0, Math.trunc(minutes));
  if (total === 0) return "";
  const unit = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;
  if (total >= 2_880 && total % 1_440 === 0) return unit(total / 1_440, "day");
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return unit(rest, "minute");
  return rest === 0
    ? unit(hours, "hour")
    : `${unit(hours, "hour")} ${unit(rest, "minute")}`;
}

function parseLockDuration(text: string): number | undefined {
  const days = /^(\d+) days?$/.exec(text);
  if (days) return Number(days[1]) * 1_440;
  const hm = /^(?:(\d+) hours?)?(?: ?(\d+) minutes?)?$/.exec(text);
  if (!hm || (hm[1] === undefined && hm[2] === undefined)) return undefined;
  return Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0);
}

function largest(
  rule: ParticipationRuleWords,
  options: ParticipationRuleSentenceOptions,
): number | undefined {
  return options.capacity ?? rule.maxParticipants;
}

/**
 * The one-sentence form of a rule:
 * "Runs with at least 3 players, up to 6. If fewer are booked 24 hours
 * before, cancel and return credits. Keeps a waitlist."
 */
export function participationRuleSentence(
  rule: ParticipationRuleWords,
  options: ParticipationRuleSentenceOptions = {},
): string {
  const max = largest(rule, options);
  const min = Math.max(1, rule.minParticipants);
  const parts: string[] = [];
  if (min <= 1) {
    parts.push(
      max === undefined
        ? "No minimum."
        : max === 1
          ? `Runs with ${nouns(rule.unit, 1)}.`
          : `No minimum, up to ${nouns(rule.unit, max)}.`,
    );
  } else {
    parts.push(
      max === min
        ? `Runs with ${nouns(rule.unit, min)}.`
        : `Runs with at least ${nouns(rule.unit, min)}${max === undefined ? "" : `, up to ${max}`}.`,
    );
    const lock = participationLockDuration(
      rule.lockMinutesBeforeStart ??
        PARTICIPATION_POLICY.defaultLockMinutesBeforeStart,
    );
    const when = lock ? `${lock} before` : "when it starts";
    parts.push(
      rule.minimumPolicy === "cancel"
        ? `If fewer are booked ${when}, cancel and return credits.`
        : `If fewer are booked ${when}, it runs anyway.`,
    );
  }
  if (rule.waitlist) parts.push("Keeps a waitlist.");
  if (rule.tiers.length > 0) parts.push("Price by group size.");
  return parts.join(" ");
}

/** The short phrase: "3 to 6 players · cancel if fewer · waitlist". */
export function participationRulePhrase(
  rule: ParticipationRuleWords,
  options: ParticipationRuleSentenceOptions = {},
): string {
  const max = largest(rule, options);
  const min = Math.max(1, rule.minParticipants);
  const unitPlural = participationUnitNoun(rule.unit, 2);
  const parts: string[] = [
    min <= 1
      ? max === undefined
        ? "no minimum"
        : max === 1
          ? nouns(rule.unit, 1)
          : `up to ${nouns(rule.unit, max)}`
      : max === undefined
        ? `at least ${nouns(rule.unit, min)}`
        : max === min
          ? nouns(rule.unit, min)
          : `${min} to ${max} ${unitPlural}`,
  ];
  if (min > 1) {
    parts.push(
      rule.minimumPolicy === "cancel" ? "cancel if fewer" : "runs if fewer",
    );
  }
  if (rule.waitlist) parts.push("waitlist");
  if (rule.tiers.length > 0) parts.push("price by group size");
  return parts.join(" · ");
}

/** What the words say; the facts a sentence or phrase carries. */
export interface ParticipationRuleReading {
  readonly unit: ParticipationUnit;
  readonly minParticipants: number;
  readonly maxParticipants?: number;
  readonly minimumPolicy: ParticipationPolicy;
  readonly lockMinutesBeforeStart?: number;
  readonly waitlist: boolean;
  readonly priceBySize: boolean;
}

const unitOf = (noun: string): ParticipationUnit =>
  noun.startsWith("team") ? "team" : "player";

/** Reads a sentence written by `participationRuleSentence` back. */
export function parseParticipationRuleSentence(
  sentence: string,
): ParticipationRuleReading | undefined {
  const waitlist =
    sentence.includes(" Keeps a waitlist.") ||
    sentence.startsWith("Keeps a waitlist.");
  const priceBySize = sentence.includes("Price by group size.");
  const head =
    /^(?:Runs with at least (\d+) (players?|teams?)(?:, up to (\d+))?\.|Runs with (\d+) (players?|teams?)\.|No minimum(?:, up to (\d+) (players?|teams?))?\.)/.exec(
      sentence,
    );
  if (!head) return undefined;
  let unit: ParticipationUnit = "player";
  let min = 1;
  let max: number | undefined;
  if (head[1] !== undefined) {
    min = Number(head[1]);
    unit = unitOf(head[2]!);
    max = head[3] === undefined ? undefined : Number(head[3]);
  } else if (head[4] !== undefined) {
    min = Number(head[4]);
    unit = unitOf(head[5]!);
    max = min;
  } else if (head[6] !== undefined) {
    max = Number(head[6]);
    unit = unitOf(head[7]!);
  }
  let policy: ParticipationPolicy = "run";
  let lock: number | undefined;
  const clause =
    /If fewer are booked (?:(.+?) before|when it starts), (cancel and return credits|it runs anyway)\./.exec(
      sentence,
    );
  if (min > 1) {
    if (!clause) return undefined;
    policy = clause[2] === "it runs anyway" ? "run" : "cancel";
    lock = clause[1] === undefined ? 0 : parseLockDuration(clause[1]);
    if (lock === undefined) return undefined;
  }
  return {
    unit,
    minParticipants: min,
    ...(max !== undefined ? { maxParticipants: max } : {}),
    minimumPolicy: policy,
    ...(lock !== undefined ? { lockMinutesBeforeStart: lock } : {}),
    waitlist,
    priceBySize,
  };
}

/** Reads a phrase written by `participationRulePhrase` back (no lock in a phrase). */
export function parseParticipationRulePhrase(
  phrase: string,
): Omit<ParticipationRuleReading, "lockMinutesBeforeStart"> | undefined {
  const [size, ...rest] = phrase.split(" · ");
  if (!size) return undefined;
  let unit: ParticipationUnit = "player";
  let min = 1;
  let max: number | undefined;
  let match: RegExpExecArray | null;
  if (size === "no minimum") {
    // min 1, no max
  } else if ((match = /^up to (\d+) (players?|teams?)$/.exec(size))) {
    max = Number(match[1]);
    unit = unitOf(match[2]!);
  } else if ((match = /^at least (\d+) (players?|teams?)$/.exec(size))) {
    min = Number(match[1]);
    unit = unitOf(match[2]!);
  } else if ((match = /^(\d+) to (\d+) (players|teams)$/.exec(size))) {
    min = Number(match[1]);
    max = Number(match[2]);
    unit = unitOf(match[3]!);
  } else if ((match = /^(\d+) (players?|teams?)$/.exec(size))) {
    min = Number(match[1]);
    max = min;
    unit = unitOf(match[2]!);
  } else {
    return undefined;
  }
  return {
    unit,
    minParticipants: min,
    ...(max !== undefined ? { maxParticipants: max } : {}),
    minimumPolicy: rest.includes("cancel if fewer") ? "cancel" : "run",
    waitlist: rest.includes("waitlist"),
    priceBySize: rest.includes("price by group size"),
  };
}
