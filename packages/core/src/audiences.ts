/**
 * The portable, database-free audience rule contract.  Database adapters must
 * resolve the facts below before evaluation; rules never contain SQL, columns,
 * or executable expressions.
 */
export const AUDIENCE_RULE_VERSION = 1 as const;
export const MAX_AUDIENCE_RULE_DEPTH = 4;
export const MAX_AUDIENCE_RULE_NODES = 32;

export type AudienceMode = "static" | "dynamic" | "hybrid";
export type AudiencePersonType = "player" | "adult-guardian" | "minor";
export type AudiencePaymentState = "failed" | "pending" | "overdue";

export type AudienceFactKey =
  | "person-type"
  | "verified-dependent-count"
  | "registration"
  | "session-count"
  | "lifetime-value-minor"
  | "payment-state"
  | "membership-status"
  | "last-activity-at";

export type AudienceComparison =
  | "is"
  | "is-not"
  | "any-of"
  | "none-of"
  | "greater-than"
  | "greater-than-or-equal"
  | "less-than"
  | "less-than-or-equal"
  | "before"
  | "after";

export interface AudienceCondition {
  readonly kind: "condition";
  readonly fact: AudienceFactKey;
  readonly operator: AudienceComparison;
  readonly value: unknown;
}

export interface AudienceGroup {
  readonly kind: "group";
  readonly operator: "all" | "any";
  readonly rules: readonly AudienceRule[];
}

export type AudienceRule = AudienceCondition | AudienceGroup;

export interface AudienceRuleAst {
  readonly version: typeof AUDIENCE_RULE_VERSION;
  readonly root: AudienceGroup;
}

export interface AudienceFacts {
  readonly personType?: AudiencePersonType;
  readonly verifiedDependentCount?: number;
  readonly registrations?: readonly {
    readonly referenceId: string;
    readonly kind: "event" | "product";
    readonly status: string;
  }[];
  readonly sessionCount?: number;
  /** Net settled value in minor units. Never infer this from an incomplete source. */
  readonly lifetimeValueMinor?: number;
  readonly paymentStates?: readonly AudiencePaymentState[];
  readonly membershipStatus?: string;
  readonly lastActivityAt?: string;
}

export interface AudienceEvaluation {
  readonly matches: boolean;
  readonly unavailable: readonly AudienceFactKey[];
  readonly reasons: readonly string[];
}

const factOperators: Readonly<
  Record<AudienceFactKey, readonly AudienceComparison[]>
> = {
  "person-type": ["is", "is-not", "any-of", "none-of"],
  "verified-dependent-count": [
    "is",
    "greater-than",
    "greater-than-or-equal",
    "less-than",
    "less-than-or-equal",
  ],
  registration: ["is", "is-not"],
  "session-count": [
    "is",
    "greater-than",
    "greater-than-or-equal",
    "less-than",
    "less-than-or-equal",
  ],
  "lifetime-value-minor": [
    "is",
    "greater-than",
    "greater-than-or-equal",
    "less-than",
    "less-than-or-equal",
  ],
  "payment-state": ["is", "is-not", "any-of", "none-of"],
  "membership-status": ["is", "is-not", "any-of", "none-of"],
  "last-activity-at": ["before", "after"],
};

export const audienceFactScopes: Readonly<
  Record<AudienceFactKey, readonly string[]>
> = {
  "person-type": ["members:read"],
  "verified-dependent-count": ["members:read"],
  registration: ["members:read", "sessions:read"],
  "session-count": ["members:read", "sessions:read"],
  "lifetime-value-minor": ["payments:read"],
  "payment-state": ["payments:read"],
  "membership-status": ["members:read"],
  "last-activity-at": ["members:read"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validationError(message: string): never {
  throw new Error(`Invalid audience rule: ${message}`);
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) validationError("values must be finite");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value))
    return value
      .map(canonicalValue)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  validationError("values must be JSON data");
}

function validateCondition(condition: AudienceCondition): AudienceCondition {
  if (!factOperators[condition.fact])
    validationError(`unknown fact ${String(condition.fact)}`);
  if (!factOperators[condition.fact].includes(condition.operator)) {
    validationError(
      `${condition.operator} is not allowed for ${condition.fact}`,
    );
  }
  const value = canonicalValue(condition.value);
  const numeric = [
    "verified-dependent-count",
    "session-count",
    "lifetime-value-minor",
  ].includes(condition.fact);
  if (numeric && typeof value !== "number")
    validationError(`${condition.fact} requires a number`);
  if (
    condition.fact === "last-activity-at" &&
    (typeof value !== "string" || Number.isNaN(Date.parse(value)))
  ) {
    validationError("last-activity-at requires an ISO timestamp");
  }
  if (condition.fact === "registration") {
    if (
      !isPlainObject(value) ||
      (value.kind !== "event" && value.kind !== "product") ||
      typeof value.referenceId !== "string" ||
      typeof value.status !== "string"
    ) {
      validationError("registration requires kind, referenceId, and status");
    }
  }
  return { ...condition, value };
}

function canonicalRule(
  rule: AudienceRule,
  depth: number,
  state: { nodes: number },
): AudienceRule {
  state.nodes += 1;
  if (state.nodes > MAX_AUDIENCE_RULE_NODES)
    validationError(`more than ${MAX_AUDIENCE_RULE_NODES} nodes`);
  if (depth > MAX_AUDIENCE_RULE_DEPTH)
    validationError(`deeper than ${MAX_AUDIENCE_RULE_DEPTH} groups`);
  if (rule.kind === "condition") return validateCondition(rule);
  if (
    rule.kind !== "group" ||
    (rule.operator !== "all" && rule.operator !== "any") ||
    rule.rules.length === 0
  ) {
    validationError("groups require all/any and at least one rule");
  }
  const rules = rule.rules
    .map((child) => canonicalRule(child, depth + 1, state))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { kind: "group", operator: rule.operator, rules };
}

export function canonicalizeAudienceRuleAst(
  input: AudienceRuleAst,
): AudienceRuleAst {
  if (input.version !== AUDIENCE_RULE_VERSION)
    validationError("unsupported rule version");
  return {
    version: AUDIENCE_RULE_VERSION,
    root: canonicalRule(input.root, 0, { nodes: 0 }) as AudienceGroup,
  };
}

/** A deterministic portable content hash, used for revision identity not security. */
export function audienceRuleHash(input: AudienceRuleAst): string {
  const text = JSON.stringify(canonicalizeAudienceRuleAst(input));
  let value = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    value ^= BigInt(text.charCodeAt(index));
    value = (value * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${value.toString(16).padStart(16, "0")}`;
}

function compareNumber(
  actual: number,
  operator: AudienceComparison,
  expected: number,
): boolean {
  if (operator === "is") return actual === expected;
  if (operator === "greater-than") return actual > expected;
  if (operator === "greater-than-or-equal") return actual >= expected;
  if (operator === "less-than") return actual < expected;
  return actual <= expected;
}

function compareStrings(
  actual: readonly string[],
  operator: AudienceComparison,
  expected: unknown,
): boolean {
  const expectedValues = (
    Array.isArray(expected) ? expected : [expected]
  ).filter((value): value is string => typeof value === "string");
  const has = expectedValues.some((value) => actual.includes(value));
  return operator === "is" || operator === "any-of" ? has : !has;
}

function evaluateCondition(
  condition: AudienceCondition,
  facts: AudienceFacts,
): AudienceEvaluation {
  const unavailable = (reason: string): AudienceEvaluation => ({
    matches: false,
    unavailable: [condition.fact],
    reasons: [reason],
  });
  switch (condition.fact) {
    case "person-type":
      return facts.personType
        ? {
            matches: compareStrings(
              [facts.personType],
              condition.operator,
              condition.value,
            ),
            unavailable: [],
            reasons: [],
          }
        : unavailable("Person type is unavailable.");
    case "verified-dependent-count":
      return typeof facts.verifiedDependentCount === "number"
        ? {
            matches: compareNumber(
              facts.verifiedDependentCount,
              condition.operator,
              condition.value as number,
            ),
            unavailable: [],
            reasons: [],
          }
        : unavailable("Verified dependent count is unavailable.");
    case "session-count":
      return typeof facts.sessionCount === "number"
        ? {
            matches: compareNumber(
              facts.sessionCount,
              condition.operator,
              condition.value as number,
            ),
            unavailable: [],
            reasons: [],
          }
        : unavailable("Session count is unavailable.");
    case "lifetime-value-minor":
      return typeof facts.lifetimeValueMinor === "number"
        ? {
            matches: compareNumber(
              facts.lifetimeValueMinor,
              condition.operator,
              condition.value as number,
            ),
            unavailable: [],
            reasons: [],
          }
        : unavailable("Lifetime value is unavailable.");
    case "payment-state":
      return facts.paymentStates
        ? {
            matches: compareStrings(
              facts.paymentStates,
              condition.operator,
              condition.value,
            ),
            unavailable: [],
            reasons: [],
          }
        : unavailable("Payment state is unavailable.");
    case "membership-status":
      return facts.membershipStatus
        ? {
            matches: compareStrings(
              [facts.membershipStatus],
              condition.operator,
              condition.value,
            ),
            unavailable: [],
            reasons: [],
          }
        : unavailable("Membership status is unavailable.");
    case "last-activity-at":
      return facts.lastActivityAt
        ? {
            matches:
              condition.operator === "before"
                ? facts.lastActivityAt < String(condition.value)
                : facts.lastActivityAt > String(condition.value),
            unavailable: [],
            reasons: [],
          }
        : unavailable("Last activity is unavailable.");
    case "registration": {
      if (!facts.registrations)
        return unavailable("Registration facts are unavailable.");
      const expected = condition.value as {
        kind: "event" | "product";
        referenceId: string;
        status: string;
      };
      const has = facts.registrations.some(
        (entry) =>
          entry.kind === expected.kind &&
          entry.referenceId === expected.referenceId &&
          entry.status === expected.status,
      );
      return {
        matches: condition.operator === "is" ? has : !has,
        unavailable: [],
        reasons: [],
      };
    }
  }
}

export function evaluateAudienceRule(
  input: AudienceRuleAst,
  facts: AudienceFacts,
): AudienceEvaluation {
  const ast = canonicalizeAudienceRuleAst(input);
  const evaluate = (rule: AudienceRule): AudienceEvaluation => {
    if (rule.kind === "condition") return evaluateCondition(rule, facts);
    const children = rule.rules.map(evaluate);
    return {
      matches:
        rule.operator === "all"
          ? children.every((child) => child.matches)
          : children.some((child) => child.matches),
      unavailable: [...new Set(children.flatMap((child) => child.unavailable))],
      reasons: children.flatMap((child) => child.reasons),
    };
  };
  return evaluate(ast.root);
}

export function audienceRuleRequiresScope(
  input: AudienceRuleAst,
  scope: string,
): boolean {
  const visit = (rule: AudienceRule): boolean =>
    rule.kind === "condition"
      ? audienceFactScopes[rule.fact].includes(scope)
      : rule.rules.some(visit);
  return visit(canonicalizeAudienceRuleAst(input).root);
}
