/**
 * The front desk's court-booking flows (H-SCHEDULE-2), the pure part: the
 * shapes `operator.schedule.*` answers (SCHED-API, contracts in
 * `packages/api/src/contracts/schedule.ts`) and the words the screen puts on
 * them. Money words come from the answer's own fields: an amount is shown
 * only when the API returned it (callers without a money permission get the
 * same answer without amounts), and nothing here invents a price.
 */
import type {
  ScheduleCancelLine,
  ScheduleConflict,
  ScheduleMessageDraft,
  SchedulePaymentState,
} from "@duna/api";
import {
  clockRange,
  money,
  namesWords,
  plural,
  type ScheduleItem,
} from "./schedule-model";

export type PaymentIntent = "pay-at-desk" | "send-payment-link" | "free";
export type RefundChoice = "full" | "none" | "by-policy";
export type CancelCause = "club" | "player-asked";
export type BlockScope =
  "this" | "this-occurrence" | "this-and-following" | "all";
export type DeskMethod = "cash" | "card-at-desk-external" | "other";

export interface BookingPreview {
  readonly available: boolean;
  readonly conflicts: readonly ScheduleConflict[];
  readonly price?: {
    readonly rateMinor: number;
    readonly totalMinor: number;
    readonly currency: string;
    readonly ratePlanName: string;
    readonly priceKind: "base" | "public" | "member";
  };
  readonly priceUnavailable?: string;
  readonly paymentLinkAvailable: boolean;
  readonly timeZone: string;
}

export interface BookingCreated {
  readonly id: string;
  readonly status: "confirmed" | "held";
  readonly paymentState: SchedulePaymentState;
  readonly paymentLink?: { readonly url: string; readonly expiresAt: string };
  readonly totalMinor?: number;
  readonly currency: string;
  readonly priceSource: "rate" | "staff" | "free";
}

export interface Place {
  readonly courtId: string;
  readonly courtName: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface MovePreview {
  readonly bookingId: string;
  readonly from: Place;
  readonly to: Place;
  readonly available: boolean;
  readonly conflicts: readonly ScheduleConflict[];
  readonly price: {
    readonly action: "unchanged" | "reprice" | "kept";
    readonly currentTotalMinor?: number;
    readonly newTotalMinor?: number;
    readonly differenceMinor?: number;
    readonly currency?: string;
  };
  readonly requiresPriceConfirmation: boolean;
  readonly materialChange: boolean;
  readonly draft: ScheduleMessageDraft;
  readonly previewToken: string;
}

/** Where a message for the people affected can be reviewed (never sent from here). */
export interface DraftHandoff {
  readonly title: string;
  readonly recipients: readonly string[];
  readonly body?: string;
  /** Inbox's thread (a Concierge Send review), or a new message to the first person. */
  readonly href: string;
}

export interface CancelPreview {
  readonly bookingId: string;
  readonly refund: RefundChoice;
  readonly cause: CancelCause;
  readonly policy: {
    readonly title: string;
    readonly refundBeforeHours?: number;
    readonly insideRefundWindow: boolean;
  };
  readonly lines: readonly ScheduleCancelLine[];
  readonly totalRefundMinor?: number;
  readonly currency?: string;
  readonly needsMoneyPermission: boolean;
  readonly draft: ScheduleMessageDraft;
  readonly previewToken: string;
}

export interface BlockPreview {
  readonly id: string;
  readonly kind: "one-off" | "weekly";
  readonly scope: BlockScope;
  readonly reason?: string;
  readonly cancelledUnder: readonly {
    readonly id: string;
    readonly kind: "session" | "booking";
    readonly title: string;
    readonly startsAt: string;
  }[];
}

/** A conflict from the shared rule, in the calendar's words. */
export function conflictSentence(
  conflict: ScheduleConflict,
  courtName: string,
  timeZone: string,
): string {
  const when = clockRange(conflict.startsAt, conflict.endsAt, timeZone);
  switch (conflict.what) {
    case "booking":
      return `${courtName} is booked ${when}`;
    case "session":
      return `A session is on ${courtName} ${when}`;
    case "block":
      return `${courtName} is blocked ${when}`;
    case "closed":
      return `${courtName} is closed ${when}`;
    case "hours":
      return `${courtName} isn't open ${when}`;
  }
}

/** How one payer's money comes back, in words (no amount: see `cancelLineAmount`). */
export function cancelLineWords(line: ScheduleCancelLine): string {
  switch (line.action) {
    case "refund-card":
      return "Refunded to the card they paid with";
    case "hand-back-at-desk":
      return "Paid at the desk, so hand it back at the desk";
    case "release":
      return line.method === "unpaid"
        ? "Hadn't paid; the payment due is cancelled"
        : "Nothing paid; their place is released";
    case "keep":
      return line.method === "free"
        ? "Free booking, nothing to return"
        : "Keeps what they paid";
  }
}

/** "$48.00 back" or "$48.00 kept", only when the answer carried amounts. */
export function cancelLineAmount(
  line: ScheduleCancelLine,
  currency: string | undefined,
): string | undefined {
  if (line.refundMinor === undefined || line.paidMinor === undefined) {
    return undefined;
  }
  if (line.paidMinor === 0) return undefined;
  return line.refundMinor > 0
    ? `${money(line.refundMinor, currency)} back`
    : `${money(line.paidMinor, currency)} kept`;
}

/** The policy line a cancellation sheet shows. */
export function policyWords(preview: CancelPreview): string {
  const window =
    preview.policy.refundBeforeHours !== undefined
      ? `refunds up to ${plural(preview.policy.refundBeforeHours, "hour")} before the start`
      : undefined;
  const inside = preview.policy.insideRefundWindow
    ? "This cancellation is inside that window."
    : "This cancellation is past that window.";
  return [
    `${preview.policy.title}${window ? `: ${window}.` : "."}`,
    window ? inside : undefined,
    preview.cause === "club"
      ? "The club is cancelling, so every payer gets their money back in full."
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

/** "Alex Rivera (booker) and Noa Klein": who a draft would be for. */
export function draftRecipients(draft: ScheduleMessageDraft): string[] {
  return draft.recipients.map((recipient) =>
    recipient.role === "guardian" && recipient.forName
      ? `${recipient.name} (for ${recipient.forName})`
      : recipient.name,
  );
}

/** Where to review a draft: the Concierge thread, else a new message. */
export function draftHref(
  draft: ScheduleMessageDraft | undefined,
  concierge: { readonly conversationId: string } | undefined,
): string | undefined {
  if (concierge) {
    return `/inbox?thread=${encodeURIComponent(concierge.conversationId)}`;
  }
  const first = draft?.recipients.find((recipient) => recipient.personId);
  return first?.personId
    ? `/inbox/create?recipient=${encodeURIComponent(first.personId)}`
    : undefined;
}

export function handoffFor(
  title: string,
  draft: ScheduleMessageDraft | undefined,
  concierge: { readonly conversationId: string } | undefined,
): DraftHandoff | null {
  const href = draftHref(draft, concierge);
  if (!href || !draft || draft.recipients.length === 0) return null;
  return {
    title,
    recipients: draftRecipients(draft),
    body: draft.body,
    href,
  };
}

/** "Unpaid", "Part paid": a booking's payment state in words. */
export const paymentStateWords: Readonly<Record<SchedulePaymentState, string>> =
  {
    free: "Free",
    unpaid: "Unpaid",
    "part-paid": "Part paid",
    paid: "Paid",
    refunded: "Refunded",
    cancelled: "Payment cancelled",
  };

export const deskMethodWords: Readonly<Record<DeskMethod, string>> = {
  cash: "Cash",
  "card-at-desk-external": "Card, on the club's own terminal",
  other: "Other",
};

/** Who would be told, for a confirmation: "Alex Rivera and Noa Klein". */
export function recipientsWords(draft: ScheduleMessageDraft): string {
  return namesWords(draftRecipients(draft));
}

/** A mobile number in the international format the API takes, or an error. */
export function mobileProblem(value: string): string | undefined {
  const trimmed = value.replace(/[\s().-]/g, "");
  if (trimmed === "") return undefined;
  return /^\+[1-9]\d{6,14}$/.test(trimmed)
    ? undefined
    : "Use the international format, for example +13105550100.";
}

export function normalisedMobile(value: string): string | undefined {
  const trimmed = value.replace(/[\s().-]/g, "");
  return trimmed === "" ? undefined : trimmed;
}

/** One court booking's money, as `operator.schedule.bookingPayments` answers. */
export interface BookingPayment {
  readonly bookingId: string;
  readonly orderId?: string;
  readonly totalMinor: number;
  readonly paidMinor: number;
  readonly currency: string;
  readonly paymentState: SchedulePaymentState;
  readonly due: boolean;
}

/** Court bookings with what the API says is paid and due (`bookingPayments`). */
export function withBookingPayments(
  items: readonly ScheduleItem[],
  payments: readonly BookingPayment[],
): ScheduleItem[] {
  const byBooking = new Map(
    payments.map((payment) => [payment.bookingId, payment]),
  );
  return items.map((item) => {
    const payment =
      item.source === "court-booking" ? byBooking.get(item.id) : undefined;
    if (!payment) return item;
    const due = payment.due;
    return {
      ...item,
      amountMinor: payment.totalMinor,
      paidMinor: due ? payment.paidMinor : payment.totalMinor,
      currency: payment.currency,
      paymentState: payment.paymentState,
      people: item.people.map((person, index) =>
        // The booker carries the order; a split share shows on the invite.
        index === 0 && due && person.payment !== "paid"
          ? { ...person, payment: "due" as const }
          : person,
      ),
    };
  });
}
