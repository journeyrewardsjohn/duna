/**
 * Who pays for a refund (payout-policy §6, Duna Pay terms §9.4,
 * Booking and Refund Policy §2). Pure; integer minor units; never creates or
 * loses a cent: playerRefund = clubBears + applicationFeeRefunded + tax.
 *
 * Two rules, chosen by the `refundFeeRule` setting:
 * - `pro-rata` (what the refund executor does today: the processor refund
 *   with reverse_transfer and refund_application_fee): every component is
 *   returned in proportion. Duna returns its fee share, including the
 *   Service Fee and the processing estimate.
 * - `policy` (the owner's proposed default in the drafts): when the club
 *   cancels or does not deliver, the player gets everything back, the
 *   Organization Fee goes back to the club pro rata, the processing cost is
 *   borne by the club and the Service Fee is refunded by Duna; when the
 *   player cancels within policy or the club gives a courtesy refund, the
 *   player gets the price of the refunded items back and Duna keeps the
 *   Service Fee; on Duna's error, Duna bears the processing cost.
 */
export type RefundCause = "club" | "player" | "duna-error";
export type RefundFeeRule = "pro-rata" | "policy";

export interface RefundableSale {
  /** What the buyer paid. */
  readonly grossMinor: number;
  /** Price of the items (before Service Fee and tax). */
  readonly itemsMinor: number;
  readonly serviceFeeMinor: number;
  readonly organizationFeeMinor: number;
  readonly processingFeeMinor: number;
  readonly taxMinor: number;
}

export interface RefundSplit {
  /** Paid back to the buyer. */
  readonly playerRefundMinor: number;
  /** Taken from the club's proceeds. */
  readonly clubBearsMinor: number;
  /** Duna's application fee returned (to the buyer or the club). */
  readonly applicationFeeRefundedMinor: number;
  readonly serviceFeeKeptMinor: number;
  readonly taxRefundedMinor: number;
}

function share(total: number, part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((total * part) / whole);
}

function assertSale(sale: RefundableSale): void {
  const parts = [
    sale.grossMinor,
    sale.itemsMinor,
    sale.serviceFeeMinor,
    sale.organizationFeeMinor,
    sale.processingFeeMinor,
    sale.taxMinor,
  ];
  if (parts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Refund amounts must be non-negative minor units.");
  }
  if (sale.itemsMinor + sale.serviceFeeMinor + sale.taxMinor !== sale.grossMinor) {
    throw new Error("Gross must equal items + Service Fee + tax.");
  }
  if (sale.organizationFeeMinor + sale.processingFeeMinor > sale.itemsMinor) {
    throw new Error("Club fees cannot exceed the item price.");
  }
}

/**
 * Split a refund of `itemsRefundedMinor` of the item price (the whole price
 * for a full refund).
 */
export function refundSplit(input: {
  readonly sale: RefundableSale;
  readonly itemsRefundedMinor: number;
  readonly cause: RefundCause;
  readonly rule: RefundFeeRule;
}): RefundSplit {
  const { sale } = input;
  assertSale(sale);
  const items = input.itemsRefundedMinor;
  if (!Number.isSafeInteger(items) || items < 0 || items > sale.itemsMinor) {
    throw new Error("Refunded items must be between 0 and the item price.");
  }
  const taxRefundedMinor = share(sale.taxMinor, items, sale.itemsMinor);
  const serviceShare = share(sale.serviceFeeMinor, items, sale.itemsMinor);
  const organizationFeeShare = share(sale.organizationFeeMinor, items, sale.itemsMinor);
  const processingShare = share(sale.processingFeeMinor, items, sale.itemsMinor);

  if (input.rule === "pro-rata") {
    const applicationFeeRefundedMinor =
      serviceShare + organizationFeeShare + processingShare;
    const clubBearsMinor = items - organizationFeeShare - processingShare;
    return {
      playerRefundMinor: items + serviceShare + taxRefundedMinor,
      clubBearsMinor,
      applicationFeeRefundedMinor,
      serviceFeeKeptMinor: 0,
      taxRefundedMinor,
    };
  }
  const serviceRefunded = input.cause === "player" ? 0 : serviceShare;
  // The club's proceeds fall by the items refunded less the Organization Fee
  // returned to it; it bears the processing cost unless Duna erred.
  const processingBorneByDuna = input.cause === "duna-error" ? processingShare : 0;
  const clubBearsMinor = items - organizationFeeShare - processingBorneByDuna;
  return {
    playerRefundMinor: items + serviceRefunded + taxRefundedMinor,
    clubBearsMinor,
    applicationFeeRefundedMinor: serviceRefunded + organizationFeeShare + processingBorneByDuna,
    serviceFeeKeptMinor: serviceShare - serviceRefunded,
    taxRefundedMinor,
  };
}

/**
 * Split an amount across parts in proportion to weights (largest remainder;
 * the parts always sum to the amount). Used for split refunds across lines.
 */
export function allocateProportionally(amount: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Amounts must be non-negative minor units.");
  }
  if (!weights.length) return [];
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) {
    const base = Math.floor(amount / weights.length);
    return weights.map((_, index) => base + (index < amount - base * weights.length ? 1 : 0));
  }
  const exact = weights.map((weight) => (amount * Math.max(0, weight)) / total);
  const floors = exact.map(Math.floor);
  let remainder = amount - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index]! += 1;
    remainder -= 1;
  }
  return floors;
}
