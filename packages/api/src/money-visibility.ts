import type { ApiActor } from "./context";

/**
 * PRIV-2: who may see a club's money, decided once, on the server, from the
 * actor. See docs/product/money-visibility.md.
 *
 * Two tiers:
 * - `amounts`: money belonging to the club or to another person (collected,
 *   net, refunds, order totals, what a person paid, lifetime spend, credit
 *   value, margins, costs, payouts, staff pay). Only `payments:read` or
 *   `payments:write`.
 * - `paidState`: whether someone has paid (flags and counts, no amounts).
 *   Also `payments:collect`, because the person taking a payment has to know
 *   who still owes.
 *
 * Public list prices (session price, entry fee, rate plans, catalog prices)
 * are never redacted.
 */
export interface MoneyVisibility {
  readonly amounts: boolean;
  readonly paidState: boolean;
}

type ScopedActor = Pick<ApiActor, "scopes">;

function holds(actor: ScopedActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

export function moneyVisibilityFor(actor: ScopedActor): MoneyVisibility {
  const amounts =
    holds(actor, "payments:read") || holds(actor, "payments:write");
  return {
    amounts,
    paidState: amounts || holds(actor, "payments:collect"),
  };
}

/** Club money and other people's money: `payments:read` or `payments:write`. */
export function canSeeClubMoney(actor: ScopedActor): boolean {
  return moneyVisibilityFor(actor).amounts;
}

/**
 * The money fields of each operator output, by path. `a[].b` means field `b`
 * of every element of array `a`. Removing a whole object (`finance`) is
 * allowed when every field in it is money. The schema test in
 * money-visibility.test.ts fails when one of these outputs gains a money-like
 * field that is not listed here or in REVIEWED_VISIBLE_PATHS.
 */
export const MONEY_PATHS = {
  sessionDetail: {
    amounts: [
      "attendees[].paidMinor",
      "attendees[].refundedMinor",
      "cancellationPreview.cashRefundMinor",
      "cancellationPreview.creditValueMinor",
      "cancellationPreview.orders[].totalMinor",
      "cancellationPreview.orders[].cashRefundMinor",
      "cancellationPreview.orders[].creditValueMinor",
      "finance",
      "operations.refundSummary.cashRefundMinor",
    ],
    paidState: [
      "attendees[].paymentStatus",
      "teams[].fullyPaid",
      "teams[].fullyPaidAt",
      "teams[].paidPlayers",
      "teams[].roster[].paid",
    ],
  },
  divisionDetail: {
    amounts: [],
    paidState: [
      "teams[].fullyPaid",
      "teams[].fullyPaidAt",
      "teams[].paidPlayers",
      "teams[].roster[].paid",
    ],
  },
  activityDetail: {
    amounts: [
      "activity.totalAmountMinor",
      "activity.fundedAmountMinor",
      "participants[].shareAmountMinor",
    ],
    paidState: [],
  },
  workspace: {
    amounts: [
      "people[].lifetimeSpendMinor",
      "people[].recentPurchases[].amountMinor",
      "staff[].hourlyRateMinor",
      "staff[].incomeGoalMinor",
      "productPerformance[].grossBookedMinor",
      "productPerformance[].netSalesMinor",
      "productPerformance[].cogsMinor",
      "productPerformance[].grossProfitMinor",
      "productPerformance[].grossMarginBps",
      "productCustomers[].grossBookedMinor",
      "inventory[].unitCostMinor",
      "inventory[].totalCostMinor",
      "inventory[].bookValueMinor",
      "ledger.creditLiability",
    ],
    paidState: [],
  },
  memberProfile: {
    amounts: [
      "relationship.lifetimeSpendMinor",
      "relationship.recentPurchases[].amountMinor",
      "creditGrants[].initialValueMinor",
      "creditGrants[].remainingValueMinor",
      "purchases[].amountMinor",
      "purchases[].refundedMinor",
      "purchases[].refunds[].amountMinor",
    ],
    paidState: [],
  },
} as const satisfies Record<
  string,
  { readonly amounts: readonly string[]; readonly paidState: readonly string[] }
>;

export type MoneyRedactedOutput = keyof typeof MONEY_PATHS;

/**
 * Money-like fields in these outputs that are deliberately left visible:
 * public list prices, credit counts (not money), and counts of paid things
 * that carry no amount. Listed so the schema test can tell "reviewed" from
 * "new and unreviewed".
 */
export const REVIEWED_VISIBLE_PATHS: Record<
  MoneyRedactedOutput,
  readonly string[]
> = {
  sessionDetail: [
    "session.priceMinor",
    "entryDivisions[].entryFeeMinor",
    "operations.refundStatus",
    "operations.refundSummary",
    "operations.refundCompletedAt",
  ],
  divisionDetail: [
    "division.entryFeeMinor",
    "division.kobConfig.balanceByRating",
  ],
  activityDetail: ["participants[].reliability"],
  workspace: [
    "ratePlans[].baseAmountMinor",
    "ratePlans[].memberAmountMinor",
    "ratePlans[].nonMemberAmountMinor",
    "venues[].courts[].cancellationPolicy.refundBeforeHours",
    "sessions[].priceMinor",
    "people[].creditBalance",
    "catalog[].variants[].prices",
    "catalog[].variants[].prices[].amountMinor",
    "catalog[].variants[].prices[].creditAmount",
    "productPerformance[].paidPurchases",
    "productPerformance[].refundedOrders",
  ],
  memberProfile: [
    "relationship.creditBalance",
    "plans[].priceMinor",
    // The refund records stay (reason, status); their amounts are redacted.
    "purchases[].refunds",
  ],
};

function omitPath(value: unknown, segments: readonly string[]): unknown {
  if (value === null || value === undefined || segments.length === 0) {
    return value;
  }
  const [head, ...rest] = segments as [string, ...string[]];
  const isArray = head.endsWith("[]");
  const key = isArray ? head.slice(0, -2) : head;
  if (typeof value !== "object" || !(key in value)) return value;
  const record = value as Record<string, unknown>;
  if (rest.length === 0 && !isArray) {
    const kept = { ...record };
    delete kept[key];
    return kept;
  }
  const child = record[key];
  const next =
    isArray && Array.isArray(child)
      ? child.map((element) => omitPath(element, rest))
      : isArray
        ? child
        : omitPath(child, rest);
  return { ...record, [key]: next };
}

/**
 * Returns `value` without the money the actor may not see. The one place a
 * procedure output loses money; procedures call this rather than deciding
 * for themselves.
 */
export function redactMoney<T>(
  output: MoneyRedactedOutput,
  value: T,
  actor: ScopedActor,
): T {
  const visibility = moneyVisibilityFor(actor);
  const paths = [
    ...(visibility.amounts ? [] : MONEY_PATHS[output].amounts),
    ...(visibility.paidState ? [] : MONEY_PATHS[output].paidState),
  ];
  return paths.reduce<unknown>(
    (current, path) => omitPath(current, path.split(".")),
    value,
  ) as T;
}

/** Dashboard and Duna AI metrics: figures marked `money` need `amounts`. */
export function redactMoneyMetrics<
  T extends { readonly metrics: readonly { readonly money?: boolean }[] },
>(value: T, actor: ScopedActor): T {
  if (canSeeClubMoney(actor)) return value;
  return {
    ...value,
    metrics: value.metrics.filter((metric) => !metric.money),
  };
}
