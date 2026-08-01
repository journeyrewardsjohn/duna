export type LedgerSide = "debit" | "credit";
export type LedgerAccountType =
  "asset" | "liability" | "equity" | "revenue" | "expense" | "memo";
export type LedgerUnitKind = "money" | "organization-credit";

export interface LedgerPosting {
  readonly accountId: string;
  readonly side: LedgerSide;
  readonly amount: number;
  readonly unit: string;
  readonly unitKind: LedgerUnitKind;
  readonly currency?: string;
}

export interface LedgerBalanceGroup {
  readonly unit: string;
  readonly unitKind: LedgerUnitKind;
  readonly currency?: string;
  readonly debitTotal: number;
  readonly creditTotal: number;
}

function postingGroupKey(posting: LedgerPosting): string {
  return [
    posting.unitKind,
    posting.unit,
    posting.currency?.toUpperCase() ?? "",
  ].join(":");
}

function assertPosting(posting: LedgerPosting): void {
  if (!posting.accountId.trim()) {
    throw new Error("Every ledger posting requires an account");
  }
  if (!posting.unit.trim()) {
    throw new Error("Every ledger posting requires a unit");
  }
  if (!Number.isSafeInteger(posting.amount) || posting.amount <= 0) {
    throw new Error("Ledger amounts must be positive safe integers");
  }
  if (posting.unitKind === "money") {
    if (!posting.currency || !/^[A-Z]{3}$/.test(posting.currency)) {
      throw new Error("Money postings require an uppercase ISO currency");
    }
  } else if (posting.currency) {
    throw new Error("Organization-credit postings cannot carry a currency");
  }
}

export function summarizeLedgerJournal(
  postings: readonly LedgerPosting[],
): readonly LedgerBalanceGroup[] {
  if (postings.length < 2) {
    throw new Error("A journal requires at least two postings");
  }
  const groups = new Map<string, LedgerBalanceGroup>();
  for (const posting of postings) {
    assertPosting(posting);
    const key = postingGroupKey(posting);
    const current = groups.get(key) ?? {
      unit: posting.unit,
      unitKind: posting.unitKind,
      currency: posting.currency,
      debitTotal: 0,
      creditTotal: 0,
    };
    groups.set(key, {
      ...current,
      debitTotal:
        current.debitTotal + (posting.side === "debit" ? posting.amount : 0),
      creditTotal:
        current.creditTotal + (posting.side === "credit" ? posting.amount : 0),
    });
  }
  return [...groups.values()];
}

export function assertBalancedJournal(
  postings: readonly LedgerPosting[],
): readonly LedgerBalanceGroup[] {
  const groups = summarizeLedgerJournal(postings);
  for (const group of groups) {
    if (group.debitTotal !== group.creditTotal) {
      throw new Error(
        `Unbalanced ${group.unit} journal: debits ${group.debitTotal}, credits ${group.creditTotal}`,
      );
    }
  }
  return groups;
}

export function accountBalance(input: {
  readonly normalSide: LedgerSide;
  readonly postings: readonly Pick<LedgerPosting, "side" | "amount">[];
}): number {
  for (const posting of input.postings) {
    if (!Number.isSafeInteger(posting.amount) || posting.amount <= 0) {
      throw new Error("Ledger amounts must be positive safe integers");
    }
  }
  const signed = input.postings.reduce(
    (total, posting) =>
      total +
      (posting.side === input.normalSide ? posting.amount : -posting.amount),
    0,
  );
  if (!Number.isSafeInteger(signed)) {
    throw new Error("Ledger balance exceeds safe integer bounds");
  }
  return signed;
}

export function reverseLedgerPostings(
  postings: readonly LedgerPosting[],
): readonly LedgerPosting[] {
  assertBalancedJournal(postings);
  return postings.map((posting) => ({
    ...posting,
    side: posting.side === "debit" ? "credit" : "debit",
  }));
}

export interface CreditGrant {
  readonly id: string;
  readonly remainingCredits: number;
  readonly expiresAt?: string;
  readonly createdAt: string;
}

export interface CreditAllocation {
  readonly grantId: string;
  readonly credits: number;
}

export function allocateOrganizationCredits(input: {
  readonly credits: number;
  readonly grants: readonly CreditGrant[];
  readonly now: string;
}): {
  readonly allocations: readonly CreditAllocation[];
  readonly remainingUnfundedCredits: number;
} {
  if (!Number.isSafeInteger(input.credits) || input.credits < 0) {
    throw new Error("Credit spend must be a nonnegative safe integer");
  }
  const now = new Date(input.now).getTime();
  if (!Number.isFinite(now))
    throw new Error("Credit allocation time is invalid");

  const eligible = input.grants
    .filter((grant) => {
      if (
        !Number.isSafeInteger(grant.remainingCredits) ||
        grant.remainingCredits < 0
      ) {
        throw new Error(`Invalid credit grant ${grant.id}`);
      }
      return (
        grant.remainingCredits > 0 &&
        (!grant.expiresAt || new Date(grant.expiresAt).getTime() > now)
      );
    })
    .toSorted((left, right) => {
      const leftExpiry = left.expiresAt
        ? new Date(left.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      const rightExpiry = right.expiresAt
        ? new Date(right.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      return (
        leftExpiry - rightExpiry ||
        new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime() ||
        left.id.localeCompare(right.id)
      );
    });

  let remaining = input.credits;
  const allocations: CreditAllocation[] = [];
  for (const grant of eligible) {
    if (remaining === 0) break;
    const credits = Math.min(remaining, grant.remainingCredits);
    allocations.push({ grantId: grant.id, credits });
    remaining -= credits;
  }
  return { allocations, remainingUnfundedCredits: remaining };
}

export function ledgerAccountNormalSide(
  accountType: LedgerAccountType,
): LedgerSide {
  return accountType === "asset" || accountType === "expense"
    ? "debit"
    : "credit";
}
