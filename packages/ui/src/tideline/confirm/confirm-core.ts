/**
 * The confirmation tiers' rules, with no React in them (tested in
 * `confirm-core.test.ts`). The definition of done, section 4:
 *
 * - Tier `undo` (0): reversible and low stakes (archive, rename, reorder,
 *   toggle a preference, mark read). Act at once, offer Undo for a stated
 *   window. No dialog.
 * - Tier `confirm` (1): irreversible or outward-facing (sends, publishes,
 *   invites, cancels something that notifies people). One dialog that says
 *   what happens and who is affected; the button names the verb.
 * - Tier `strong` (2): money movement, deleting data, or anything affecting
 *   many people. The dialog restates the amount, the recipients or the
 *   scope, and the consequence, and shows the reference of what is acted
 *   on. A second step (type a phrase, or tick a box) only for destructive
 *   bulk actions.
 */

export type ConfirmTier = "undo" | "confirm" | "strong";

export interface BulkScope {
  /** How many things the action touches. */
  count: number;
  /** What they are, plural: "members". */
  noun: string;
  /**
   * The phrase to type before the button works, like "remove 12 members".
   * Only honoured for a destructive bulk action (more than one item).
   */
  typeToConfirm?: string;
  /** A sentence to tick instead of typing, under the same rule. */
  acknowledge?: string;
}

export interface ConfirmRules {
  tier: Exclude<ConfirmTier, "undo">;
  verb: string;
  destructive?: boolean;
  amount?: string;
  recipients?: unknown;
  scope?: unknown;
  bulk?: BulkScope;
}

export type SecondStep =
  | { kind: "type"; phrase: string }
  | { kind: "acknowledge"; sentence: string }
  | null;

/** Button labels that say nothing about what happens. */
const VAGUE_VERBS = new Set([
  "ok",
  "okay",
  "yes",
  "confirm",
  "continue",
  "submit",
  "done",
  "proceed",
  "accept",
]);

/** Whether a destructive bulk action earns the second step. */
export function isDestructiveBulk(rules: ConfirmRules): boolean {
  return (
    rules.tier === "strong" &&
    rules.destructive === true &&
    rules.bulk !== undefined &&
    rules.bulk.count > 1
  );
}

/**
 * The second step the dialog asks for, if any: typing wins over ticking.
 * Anything else gets none, whatever was asked, so a second step stays rare
 * enough to be read.
 */
export function secondStepFor(rules: ConfirmRules): SecondStep {
  if (!isDestructiveBulk(rules)) return null;
  const phrase = rules.bulk?.typeToConfirm?.trim();
  if (phrase) return { kind: "type", phrase };
  const sentence = rules.bulk?.acknowledge?.trim();
  if (sentence) return { kind: "acknowledge", sentence };
  return null;
}

/** Whether what the person typed matches: case, spaces and edges forgiven. */
export function typedMatches(typed: string, phrase: string): boolean {
  const normal = (text: string) =>
    text.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase();
  return normal(typed) !== "" && normal(typed) === normal(phrase);
}

/** Problems with a request, for a development warning. Empty when it is sound. */
export function confirmProblems(rules: ConfirmRules): string[] {
  const problems: string[] = [];
  const verb = rules.verb.trim();
  if (!verb) problems.push("The confirming button needs a verb.");
  else if (VAGUE_VERBS.has(verb.toLocaleLowerCase())) {
    problems.push(
      `"${verb}" says nothing: name what happens ("Send to 14 people", "Refund $48.00").`,
    );
  }
  if (
    rules.tier === "strong" &&
    !rules.amount &&
    !rules.recipients &&
    !rules.scope &&
    !rules.bulk
  ) {
    problems.push(
      "A strong confirmation restates the amount, the recipients or the scope.",
    );
  }
  const askedSecondStep = Boolean(
    rules.bulk?.typeToConfirm || rules.bulk?.acknowledge,
  );
  if (askedSecondStep && !isDestructiveBulk(rules)) {
    problems.push(
      "A typed or ticked second step is only for destructive bulk actions; it was left out.",
    );
  }
  return problems;
}

/** Which control gets focus first: the safe answer when the action destroys. */
export function initialFocusFor(
  rules: Pick<ConfirmRules, "destructive">,
  step: SecondStep,
): "cancel" | "confirm" | "second-step" {
  if (step) return "second-step";
  return rules.destructive ? "cancel" : "confirm";
}
