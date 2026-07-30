export type WalletLedgerStatus =
  "pending" | "available" | "complete" | "held" | "reversed";
export type WalletTaxCharacter =
  "none" | "prize" | "contractor" | "affiliate" | "refund";

export interface WalletLedgerEntry {
  readonly id: string;
  readonly direction: "credit" | "debit";
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: WalletLedgerStatus;
  readonly taxCharacter: WalletTaxCharacter;
  readonly reasonCode: string;
  readonly occurredAt: string;
}

export interface WalletBalance {
  readonly currency: string;
  readonly availableMinor: number;
  readonly pendingMinor: number;
  readonly heldMinor: number;
  readonly totalMinor: number;
}

function signedAmount(entry: WalletLedgerEntry): number {
  return entry.direction === "credit" ? entry.amountMinor : -entry.amountMinor;
}

export function foldWalletLedger(
  entries: readonly WalletLedgerEntry[],
): WalletBalance {
  const currencies = new Set(entries.map((entry) => entry.currency));
  if (currencies.size > 1) {
    throw new Error("A wallet balance fold cannot mix currencies");
  }
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new Error(`Invalid minor-unit amount on entry ${entry.id}`);
    }
  }

  let availableMinor = 0;
  let pendingMinor = 0;
  let heldMinor = 0;
  for (const entry of entries) {
    if (entry.status === "reversed") continue;
    const amount = signedAmount(entry);
    if (entry.status === "available" || entry.status === "complete") {
      availableMinor += amount;
    } else if (entry.status === "pending") {
      pendingMinor += amount;
    } else if (entry.status === "held") {
      heldMinor += amount;
    }
  }

  return {
    currency: entries[0]?.currency ?? "USD",
    availableMinor,
    pendingMinor,
    heldMinor,
    totalMinor: availableMinor + pendingMinor + heldMinor,
  };
}

export interface WalletSpendDecision {
  readonly allowed: boolean;
  readonly cardRemainderMinor: number;
  readonly walletAppliedMinor: number;
  readonly guardianApprovalRequired: boolean;
  readonly reasons: readonly (
    "spending-blocked" | "negative-balance" | "guardian-approval-required"
  )[];
}

export function authorizeWalletSpend(input: {
  readonly availableMinor: number;
  readonly orderTotalMinor: number;
  readonly spendingBlocked: boolean;
  readonly isMinor: boolean;
  readonly guardianApprovalThresholdMinor: number;
  readonly guardianApproved: boolean;
}): WalletSpendDecision {
  if (
    !Number.isSafeInteger(input.availableMinor) ||
    !Number.isSafeInteger(input.orderTotalMinor) ||
    input.orderTotalMinor < 0
  ) {
    throw new Error("Wallet spend amounts must be safe integer minor units");
  }
  const reasons: WalletSpendDecision["reasons"][number][] = [];
  if (input.spendingBlocked) reasons.push("spending-blocked");
  if (input.availableMinor < 0) reasons.push("negative-balance");
  const walletAppliedMinor = Math.max(
    0,
    Math.min(input.availableMinor, input.orderTotalMinor),
  );
  const guardianApprovalRequired =
    input.isMinor &&
    input.orderTotalMinor > input.guardianApprovalThresholdMinor &&
    !input.guardianApproved;
  if (guardianApprovalRequired) reasons.push("guardian-approval-required");

  return {
    allowed: reasons.length === 0,
    walletAppliedMinor,
    cardRemainderMinor: input.orderTotalMinor - walletAppliedMinor,
    guardianApprovalRequired,
    reasons,
  };
}

export interface TaxRailDecision {
  readonly prizeIncomeMinor: number;
  readonly contractorIncomeMinor: number;
  readonly affiliateIncomeMinor: number;
  readonly taxFormCollectionRequired: boolean;
  readonly prize1099MiscExpected: boolean;
  readonly contractor1099NecExpected: boolean;
}

export function evaluateTaxRails(input: {
  readonly entries: readonly WalletLedgerEntry[];
  readonly collectionThresholdMinor?: number;
  readonly reportingThresholdMinor?: number;
}): TaxRailDecision {
  const eligible = input.entries.filter(
    (entry) =>
      entry.direction === "credit" &&
      (entry.status === "available" || entry.status === "complete"),
  );
  const sum = (taxCharacter: WalletTaxCharacter) =>
    eligible
      .filter((entry) => entry.taxCharacter === taxCharacter)
      .reduce((total, entry) => total + entry.amountMinor, 0);
  const prizeIncomeMinor = sum("prize");
  const contractorIncomeMinor = sum("contractor");
  const affiliateIncomeMinor = sum("affiliate");
  const collectionThresholdMinor = input.collectionThresholdMinor ?? 40_000;
  const reportingThresholdMinor = input.reportingThresholdMinor ?? 60_000;

  return {
    prizeIncomeMinor,
    contractorIncomeMinor,
    affiliateIncomeMinor,
    taxFormCollectionRequired:
      prizeIncomeMinor + contractorIncomeMinor + affiliateIncomeMinor >=
      collectionThresholdMinor,
    prize1099MiscExpected: prizeIncomeMinor >= reportingThresholdMinor,
    contractor1099NecExpected:
      contractorIncomeMinor + affiliateIncomeMinor >= reportingThresholdMinor,
  };
}

export interface TeamPotContribution {
  readonly personId: string;
  readonly amountMinor: number;
}

export function evaluateTeamPot(input: {
  readonly targetMinor: number;
  readonly contributions: readonly TeamPotContribution[];
}): {
  readonly fundedMinor: number;
  readonly remainingMinor: number;
  readonly fullyFunded: boolean;
} {
  if (
    !Number.isSafeInteger(input.targetMinor) ||
    input.targetMinor < 0 ||
    input.contributions.some(
      (contribution) =>
        !Number.isSafeInteger(contribution.amountMinor) ||
        contribution.amountMinor < 0,
    )
  ) {
    throw new Error("Team pot values must be nonnegative minor units");
  }
  const fundedMinor = input.contributions.reduce(
    (total, contribution) => total + contribution.amountMinor,
    0,
  );
  return {
    fundedMinor,
    remainingMinor: Math.max(0, input.targetMinor - fundedMinor),
    fullyFunded: fundedMinor >= input.targetMinor,
  };
}

export function reconcileWalletBalance(input: {
  readonly ledgerEntries: readonly WalletLedgerEntry[];
  readonly processorAvailableMinor: number;
  readonly processorPendingMinor: number;
}): {
  readonly ledger: WalletBalance;
  readonly availableDriftMinor: number;
  readonly pendingDriftMinor: number;
  readonly incident: boolean;
} {
  const ledger = foldWalletLedger(input.ledgerEntries);
  const availableDriftMinor =
    ledger.availableMinor - input.processorAvailableMinor;
  const pendingDriftMinor = ledger.pendingMinor - input.processorPendingMinor;
  return {
    ledger,
    availableDriftMinor,
    pendingDriftMinor,
    incident: availableDriftMinor !== 0 || pendingDriftMinor !== 0,
  };
}
