export type CreditLedgerKind =
  | "purchase"
  | "redemption"
  | "expiry"
  | "refund"
  | "comp"
  | "transfer-in"
  | "transfer-out";

export interface CreditLedgerEntry {
  readonly id: string;
  readonly kind: CreditLedgerKind;
  readonly amountMinor: number;
  readonly currency: string;
  readonly programId?: string;
  readonly occurredAt: string;
}

export function deriveDeferredCreditRevenue(
  entries: readonly CreditLedgerEntry[],
): {
  readonly currency: string;
  readonly deferredLiabilityMinor: number;
  readonly recognizedRevenueMinor: number;
  readonly expiredRevenueMinor: number;
  readonly refundedMinor: number;
} {
  const currencies = new Set(entries.map((entry) => entry.currency));
  if (currencies.size > 1) {
    throw new Error("Deferred revenue must be reported one currency at a time");
  }
  let issuedMinor = 0;
  let recognizedRevenueMinor = 0;
  let expiredRevenueMinor = 0;
  let refundedMinor = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor < 0) {
      throw new Error(`Invalid credit ledger amount on ${entry.id}`);
    }
    if (
      entry.kind === "purchase" ||
      entry.kind === "comp" ||
      entry.kind === "transfer-in"
    ) {
      issuedMinor += entry.amountMinor;
    } else if (entry.kind === "redemption" || entry.kind === "transfer-out") {
      recognizedRevenueMinor += entry.amountMinor;
    } else if (entry.kind === "expiry") {
      expiredRevenueMinor += entry.amountMinor;
    } else if (entry.kind === "refund") {
      refundedMinor += entry.amountMinor;
    }
  }
  return {
    currency: entries[0]?.currency ?? "USD",
    deferredLiabilityMinor:
      issuedMinor -
      recognizedRevenueMinor -
      expiredRevenueMinor -
      refundedMinor,
    recognizedRevenueMinor,
    expiredRevenueMinor,
    refundedMinor,
  };
}

export interface SettlementLine {
  readonly id: string;
  readonly kind: "sale" | "refund" | "fee" | "adjustment";
  readonly amountMinor: number;
  readonly currency: string;
  readonly programId?: string;
  readonly coachPersonId?: string;
  readonly courtId?: string;
}

export function reconcileProcessorPayout(input: {
  readonly lines: readonly SettlementLine[];
  readonly processorDepositMinor: number;
}): {
  readonly expectedDepositMinor: number;
  readonly processorDepositMinor: number;
  readonly driftMinor: number;
  readonly reconciled: boolean;
} {
  const expectedDepositMinor = input.lines.reduce((total, line) => {
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0) {
      throw new Error(`Invalid settlement amount on ${line.id}`);
    }
    if (line.kind === "sale" || line.kind === "adjustment") {
      return total + line.amountMinor;
    }
    return total - line.amountMinor;
  }, 0);
  const driftMinor = expectedDepositMinor - input.processorDepositMinor;
  return {
    expectedDepositMinor,
    processorDepositMinor: input.processorDepositMinor,
    driftMinor,
    reconciled: driftMinor === 0,
  };
}

export function summarizeRevenueDimensions(lines: readonly SettlementLine[]): {
  readonly byProgram: Readonly<Record<string, number>>;
  readonly byCoach: Readonly<Record<string, number>>;
  readonly byCourt: Readonly<Record<string, number>>;
} {
  const byProgram: Record<string, number> = {};
  const byCoach: Record<string, number> = {};
  const byCourt: Record<string, number> = {};
  const add = (
    target: Record<string, number>,
    key: string | undefined,
    amount: number,
  ) => {
    if (key) target[key] = (target[key] ?? 0) + amount;
  };
  for (const line of lines) {
    const signed =
      line.kind === "sale" || line.kind === "adjustment"
        ? line.amountMinor
        : -line.amountMinor;
    add(byProgram, line.programId, signed);
    add(byCoach, line.coachPersonId, signed);
    add(byCourt, line.courtId, signed);
  }
  return { byProgram, byCoach, byCourt };
}

export function classifyBalanceLiability(input: {
  readonly operatorIssuedCreditsMinor: number;
  readonly stripeHeldPlayerBalanceMinor: number;
}): {
  readonly operatorBookLiabilityMinor: number;
  readonly disclosedStripeCustodiedBalanceMinor: number;
} {
  return {
    operatorBookLiabilityMinor: input.operatorIssuedCreditsMinor,
    disclosedStripeCustodiedBalanceMinor: input.stripeHeldPlayerBalanceMinor,
  };
}
