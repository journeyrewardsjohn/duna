import { hqHref } from "@duna/core/hq-routes";
import {
  deliveryState,
  formatAmount,
  formatClubDate,
  obligationStatusCopy,
  type ObligationStatus,
  type Tone,
} from "./money-model";

/**
 * One row of Money › Transactions: a sale as the club thinks of it. Built
 * from a Duna Pay sale record when there is one (delivery and release
 * state), or from the payment record otherwise (a credit-paid order, a
 * membership invoice). Every amount is one the backend returned.
 */
export interface SaleRow {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly buyer?: string;
  readonly occurredAt?: string;
  readonly date?: string;
  readonly paidWith?: string;
  readonly gross: string;
  readonly grossMinor: number;
  readonly fees?: string;
  readonly net?: string;
  readonly refunded?: string;
  readonly status?: ObligationStatus;
  readonly state: { readonly label: string; readonly tone: Tone };
  readonly delivery?: { readonly label: string; readonly tone: Tone };
  readonly release?: string;
}

type Obligation = {
  readonly id: string;
  readonly orderId: string;
  readonly title: string;
  readonly buyer?: { readonly displayName: string };
  readonly status: ObligationStatus;
  readonly gross: { amountMinor: number; currency: string };
  readonly applicationFee: { amountMinor: number; currency: string };
  readonly proceeds: { amountMinor: number; currency: string };
  readonly released: { amountMinor: number; currency: string };
  readonly refunded: { amountMinor: number; currency: string };
  readonly settledAt?: string;
  readonly deliveryEndsAt?: string;
  readonly nextReleaseAt?: string;
};

type Payment = {
  readonly id: string;
  readonly occurredAt: string;
  readonly status: string;
  readonly buyerName: string;
  readonly description: string;
  readonly source: string;
  readonly currency: string;
  readonly grossMinor: number;
  readonly processingFeeMinor?: number;
  readonly organizationFeeMinor?: number;
  readonly refundMinor?: number;
  readonly netMinor?: number;
};

/** The order a payment record belongs to, when its id names one. */
export function paymentOrderId(id: string): string | undefined {
  const match =
    /^(?:order:)?([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(id);
  return match?.[1];
}

/** A payment record's status in words (the older payment records). */
export function paymentStatusLabel(status: string): {
  label: string;
  tone: Tone;
} {
  const known: Record<string, { label: string; tone: Tone }> = {
    succeeded: { label: "Paid", tone: "positive" },
    paid: { label: "Paid", tone: "positive" },
    pending: { label: "Pending", tone: "neutral" },
    refunded: { label: "Refunded", tone: "neutral" },
    "partially-refunded": { label: "Partly refunded", tone: "info" },
    disputed: { label: "Disputed", tone: "attention" },
    failed: { label: "Failed", tone: "attention" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  };
  return (
    known[status] ?? {
      label: status
        .replaceAll(/[-_]/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase()),
      tone: "neutral",
    }
  );
}

function releaseLine(item: Obligation, timeZone: string): string {
  if (item.status === "released")
    return `Paid out ${formatAmount(item.released)}`;
  if (item.status === "cancelled" || item.status === "refunded")
    return "Nothing to pay out";
  const next = formatClubDate(item.nextReleaseAt, timeZone);
  if (item.released.amountMinor > 0) {
    return `${formatAmount(item.released)} paid out${next ? ` · more from ${next}` : ""}`;
  }
  return next ? `Payable from ${next}` : "Not payable yet";
}

export function saleRows(input: {
  readonly obligations: readonly Obligation[];
  readonly payments: readonly Payment[];
  readonly timeZone: string;
}): SaleRow[] {
  const covered = new Set(input.obligations.map((item) => item.orderId));
  const rows: SaleRow[] = input.obligations.map((item) => {
    const occurredAt = item.settledAt ?? item.deliveryEndsAt;
    const refunded =
      item.refunded.amountMinor > 0 ? formatAmount(item.refunded) : undefined;
    return {
      id: item.id,
      href: hqHref("moneyTransaction", { transactionId: item.id }),
      title: item.title,
      buyer: item.buyer?.displayName,
      occurredAt,
      date: formatClubDate(occurredAt, input.timeZone),
      // Duna Pay records a sale only for what was paid by card.
      paidWith: "Card",
      gross: formatAmount(item.gross),
      grossMinor: item.gross.amountMinor,
      fees: formatAmount(item.applicationFee),
      net: formatAmount(item.proceeds),
      refunded,
      status: item.status,
      state: obligationStatusCopy(item.status),
      delivery: deliveryState(item.status),
      release: releaseLine(item, input.timeZone),
    };
  });
  for (const payment of input.payments) {
    if (payment.id.startsWith("payout:")) continue;
    const orderId = paymentOrderId(payment.id);
    if (orderId && covered.has(orderId)) continue;
    const money = (amountMinor: number) =>
      formatAmount({ amountMinor, currency: payment.currency });
    const fees =
      payment.processingFeeMinor !== undefined ||
      payment.organizationFeeMinor !== undefined
        ? (payment.processingFeeMinor ?? 0) +
          (payment.organizationFeeMinor ?? 0)
        : undefined;
    rows.push({
      id: payment.id,
      href: hqHref("moneyTransaction", { transactionId: payment.id }),
      title: payment.description,
      buyer: payment.buyerName,
      occurredAt: payment.occurredAt,
      date: formatClubDate(payment.occurredAt, input.timeZone),
      gross: money(payment.grossMinor),
      grossMinor: payment.grossMinor,
      fees: fees === undefined ? undefined : money(fees),
      net: payment.netMinor === undefined ? undefined : money(payment.netMinor),
      refunded: payment.refundMinor ? money(payment.refundMinor) : undefined,
      state: paymentStatusLabel(payment.status),
    });
  }
  return rows.sort((a, b) =>
    (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
  );
}
