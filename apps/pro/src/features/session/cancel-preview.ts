/**
 * What a cancellation does to each person's money, in words, from the
 * backend's own preview (M-R4). One shape for the three sources the
 * cancel sheets read, so the sheet always restates "who gets what back"
 * before a person confirms. Pure and unit-tested.
 */
import { formatCredits, formatMoney } from "../../shared/money-format";

export interface CancelPreviewLine {
  readonly key: string;
  readonly name: string;
  /** "Card refund $30.00", "Nothing paid · invitation released". */
  readonly outcome: string;
}

export interface CancelPreview {
  readonly lines: readonly CancelPreviewLine[];
  /** "$30.00 back to cards · 2 credits restored", or a plain sentence. */
  readonly total: string;
  /** The policy line, when the server gave one. */
  readonly policy?: string;
  /** Whether the person has to choose how much to refund. */
  readonly refundChoice: boolean;
}

/**
 * `operator.sessionDetail` → `cancellationPreview` (calendar sessions). The
 * amounts are absent for roles without club money (PRIV-2): the sheet then
 * says who is refunded, not how much.
 */
export interface SessionCancellationPreviewInput {
  readonly registrationCount: number;
  readonly cashRefundMinor?: number;
  readonly creditsToRestore: number;
  readonly currency: string;
  readonly orders: readonly {
    readonly orderId: string;
    readonly buyerName: string;
    readonly totalMinor?: number;
    readonly cashRefundMinor?: number;
    readonly creditsToRestore: number;
  }[];
}

function totalLine(
  cashMinor: number | undefined,
  credits: number,
  currency: string,
) {
  const parts = [
    cashMinor === undefined
      ? "Card payments refunded the way they were paid"
      : cashMinor > 0
        ? `${formatMoney(cashMinor, currency)} back to cards`
        : null,
    credits > 0 ? `${formatCredits(credits)} restored` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No money to return";
}

export function previewFromSession(
  input: SessionCancellationPreviewInput,
): CancelPreview {
  return {
    lines: input.orders.map((order) => ({
      key: order.orderId,
      name: order.buyerName,
      outcome:
        [
          order.cashRefundMinor === undefined
            ? "Refunded the way they paid"
            : order.cashRefundMinor > 0
              ? `Card refund ${formatMoney(order.cashRefundMinor, input.currency)}`
              : null,
          order.creditsToRestore > 0
            ? `${formatCredits(order.creditsToRestore)} back`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Nothing paid",
    })),
    total: totalLine(
      input.cashRefundMinor,
      input.creditsToRestore,
      input.currency,
    ),
    refundChoice: false,
  };
}

/** `operator.participation.cancelPreview` (group sessions). */
export interface GroupCancelPreviewInput {
  readonly bookings: readonly {
    readonly bookingId: string;
    readonly displayName: string;
    readonly method: "credits" | "card" | "cash" | "free" | "unpaid";
    readonly outcome:
      "credits-restored" | "refund-submitted" | "released" | "review-required";
    readonly creditsBack?: number;
    readonly cardRefundMinor?: number;
    readonly currency?: string;
  }[];
  readonly totals: {
    readonly cardRefunds: number;
    readonly reviewRequired: number;
    readonly creditsBack?: number;
    readonly cardRefundMinor?: number;
    readonly currency?: string;
  };
}

export function previewFromGroup(
  input: GroupCancelPreviewInput,
): CancelPreview {
  const lines = input.bookings.map((booking) => {
    let outcome: string;
    switch (booking.outcome) {
      case "credits-restored":
        outcome =
          booking.creditsBack !== undefined
            ? `${formatCredits(booking.creditsBack)} back`
            : "Credits back";
        break;
      case "refund-submitted":
        outcome =
          booking.cardRefundMinor !== undefined && booking.currency
            ? `Card refund ${formatMoney(booking.cardRefundMinor, booking.currency)}`
            : "Card refund";
        break;
      case "released":
        outcome =
          booking.method === "free" ? "Free · place released" : "Nothing paid";
        break;
      case "review-required":
        outcome =
          booking.method === "cash"
            ? "Paid at the desk · hand it back there"
            : "Needs a look before refunding";
        break;
    }
    return { key: booking.bookingId, name: booking.displayName, outcome };
  });
  const { totals } = input;
  const total =
    totals.cardRefundMinor !== undefined && totals.currency
      ? totalLine(
          totals.cardRefundMinor,
          totals.creditsBack ?? 0,
          totals.currency,
        )
      : [
          totals.cardRefunds
            ? `${totals.cardRefunds} card refund${totals.cardRefunds === 1 ? "" : "s"}`
            : null,
          totals.creditsBack
            ? `${formatCredits(totals.creditsBack)} restored`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "No money to return";
  return {
    lines,
    total:
      totals.reviewRequired > 0
        ? `${total} · ${totals.reviewRequired} to hand back at the desk`
        : total,
    refundChoice: false,
  };
}

/** `operator.schedule.cancelCourtBookingPreview` (SCHED-API contract). */
export interface CourtBookingPreviewInput {
  readonly policy: {
    readonly title: string;
    readonly refundBeforeHours?: number;
    readonly insideRefundWindow: boolean;
  };
  readonly lines: readonly {
    readonly participantId?: string;
    readonly orderId?: string;
    readonly name: string;
    readonly method: "card" | "desk" | "unpaid" | "free" | "nothing-paid";
    readonly action: "release" | "refund-card" | "hand-back-at-desk" | "keep";
    readonly paidMinor?: number;
    readonly refundMinor?: number;
  }[];
  readonly totalRefundMinor?: number;
  readonly currency?: string;
}

export function previewFromCourtBooking(
  input: CourtBookingPreviewInput,
): CancelPreview {
  const currency = input.currency;
  const amount = (minor?: number) =>
    minor !== undefined && currency ? ` ${formatMoney(minor, currency)}` : "";
  const lines = input.lines.map((line, index) => {
    let outcome: string;
    switch (line.action) {
      case "refund-card":
        outcome = `Card refund${amount(line.refundMinor)}`;
        break;
      case "hand-back-at-desk":
        outcome = `Paid at the desk · hand back${amount(line.refundMinor)}`;
        break;
      case "keep":
        outcome = `Paid${amount(line.paidMinor)} · kept under the policy`;
        break;
      case "release":
        outcome =
          line.method === "unpaid"
            ? "Not paid yet · their share is cancelled"
            : "Nothing paid · invitation released";
        break;
    }
    return {
      key: line.participantId ?? line.orderId ?? `${line.name}:${index}`,
      name: line.name,
      outcome,
    };
  });
  const hours = input.policy.refundBeforeHours;
  return {
    lines,
    total:
      input.totalRefundMinor !== undefined && currency
        ? input.totalRefundMinor > 0
          ? `${formatMoney(input.totalRefundMinor, currency)} back to the players`
          : "No money goes back"
        : "Amounts need permission to see payments",
    policy: `${input.policy.title}${
      hours !== undefined ? ` · full refund up to ${hours} hours before` : ""
    } · ${input.policy.insideRefundWindow ? "inside the refund window" : "past the refund window"}`,
    refundChoice: true,
  };
}
