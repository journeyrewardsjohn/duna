/**
 * Money and Duna Pay in words (H10). Pure: every state the backend can
 * return has a label, a tone, one plain sentence and the one next step, and
 * every amount and date is formatted the same way on every screen. Copy never
 * names the payment processor (the identity-verification step says who
 * checks the documents; see `verificationNote`) and never states a number
 * the backend did not return.
 */
import type {
  PayAccount,
  payDisputeStatusSchema,
  payHoldKindSchema,
  payHoldStatusSchema,
  payObligationStatusSchema,
  payDeliveryRuleSchema,
  payRecoveryKindSchema,
  payRecoveryStatusSchema,
  payRefundSourceSchema,
  payReserveStatusSchema,
  payReserveTriggerSchema,
  payTrancheStatusSchema,
  payBankStatusSchema,
} from "@duna/api";
import { formatMoney } from "@duna/core";
import type { TidelineTone } from "@duna/ui/tideline";
import type { z } from "zod";

export type AccountStatus = PayAccount["status"];
export type BankStatus = z.infer<typeof payBankStatusSchema>;
export type ObligationStatus = z.infer<typeof payObligationStatusSchema>;
export type DeliveryRule = z.infer<typeof payDeliveryRuleSchema>;
export type TrancheStatus = z.infer<typeof payTrancheStatusSchema>;
export type DisputeStatus = z.infer<typeof payDisputeStatusSchema>;
export type HoldKind = z.infer<typeof payHoldKindSchema>;
export type HoldStatus = z.infer<typeof payHoldStatusSchema>;
export type ReserveStatus = z.infer<typeof payReserveStatusSchema>;
export type ReserveTrigger = z.infer<typeof payReserveTriggerSchema>;
export type RefundSource = z.infer<typeof payRefundSourceSchema>;
export type RecoveryKind = z.infer<typeof payRecoveryKindSchema>;
export type RecoveryStatus = z.infer<typeof payRecoveryStatusSchema>;

export type Tone = TidelineTone | "neutral";

/** A state in words: what it is, what it means, and the one thing to do. */
export interface StateCopy {
  readonly label: string;
  readonly tone: Tone;
  readonly sentence: string;
  /** The next step, or undefined when there is nothing to do. */
  readonly next?: string;
}

// ── Formatting ──────────────────────────────────────────────────────────────

export interface MoneyValue {
  readonly amountMinor: number;
  readonly currency: string;
}

/** "$48.00" from an amount the backend returned. Never called on a guess. */
export function formatAmount(value: MoneyValue): string {
  return formatMoney(value.amountMinor, value.currency);
}

/** "−$12.00" for money going out, "$12.00" otherwise. */
export function formatSigned(value: MoneyValue): string {
  const text = formatMoney(Math.abs(value.amountMinor), value.currency);
  return value.amountMinor < 0 ? `−${text}` : text;
}

/** "Dec 4, 2026" in the club's time zone. */
export function formatClubDate(
  iso: string | undefined,
  timeZone: string,
): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

/** "Dec 4" in the club's time zone (lists, where the year is plain). */
export function formatClubDay(
  iso: string | undefined,
  timeZone: string,
): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

/** "Dec 4, 2026, 3:00 PM" in the club's time zone. */
export function formatClubDateTime(
  iso: string | undefined,
  timeZone: string,
): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

/** Whole days from `now` to `iso` (negative when past). */
export function daysUntil(iso: string, now: Date): number {
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

/** "Due in 3 days", "Due today", "4 days overdue". */
export function deadlineLabel(iso: string, now: Date): string {
  const days = daysUntil(iso, now);
  if (days < 0) return `${-days} ${-days === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/** "10%" from basis points the backend returned. */
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

// ── Duna Pay account ────────────────────────────────────────────────────────

const accountCopy: Record<AccountStatus, StateCopy> = {
  "not-started": {
    label: "Not started",
    tone: "neutral",
    sentence: "Duna Pay isn't set up yet, so players can't pay you online.",
    next: "Start with your business details",
  },
  "in-progress": {
    label: "In progress",
    tone: "info",
    sentence:
      "You've started setting up Duna Pay. A few details are still missing before it can be checked.",
    next: "Continue verification",
  },
  verifying: {
    label: "Being checked",
    tone: "info",
    sentence:
      "Your details are being checked. There's nothing to do right now; this page updates when the check finishes.",
  },
  "action-needed": {
    label: "Action needed",
    tone: "attention",
    sentence:
      "Duna Pay needs something from you to keep payments and payouts running.",
    next: "Fix what's needed",
  },
  restricted: {
    label: "Paused",
    tone: "danger",
    sentence:
      "Payments or payouts are paused until the items below are fixed. Nothing is lost: money already taken stays yours.",
    next: "Fix it now",
  },
  ready: {
    label: "Ready",
    tone: "positive",
    sentence: "Duna Pay is ready. Players can pay you and payouts are on.",
  },
};

export function accountStatusCopy(status: AccountStatus): StateCopy {
  return accountCopy[status];
}

/** The one sentence at the top of the Duna Pay page, with the deadline when there is one. */
export function accountSentence(
  account: Pick<PayAccount, "status" | "requirementsDueBy">,
  timeZone: string,
): string {
  const copy = accountCopy[account.status];
  if (account.status === "action-needed" && account.requirementsDueBy) {
    return `Duna Pay needs something from you by ${formatClubDate(account.requirementsDueBy, timeZone)} to keep payments and payouts running.`;
  }
  return copy.sentence;
}

const bankCopy: Record<BankStatus, StateCopy> = {
  missing: {
    label: "No bank yet",
    tone: "neutral",
    sentence: "Add the bank account payouts should go to.",
    next: "Add a payout bank",
  },
  pending: {
    label: "Being checked",
    tone: "info",
    sentence: "Your payout bank is being checked.",
  },
  verified: {
    label: "Verified",
    tone: "positive",
    sentence: "Payouts go to this bank account.",
  },
  errored: {
    label: "Needs a new bank",
    tone: "attention",
    sentence:
      "The bank declined payouts to this account. Add another account so payouts can resume.",
    next: "Replace the payout bank",
  },
};

export function bankStatusCopy(status: BankStatus): StateCopy {
  return bankCopy[status];
}

/**
 * The only place product copy may say who checks identity documents
 * (agent rules: the processor is named only where Duna Pay explains
 * identity verification).
 */
export const verificationNote =
  "Identity verification is handled by Stripe, Duna Pay's payment partner. Duna never sees or stores your ID documents or full bank details.";

/** What "ready" unlocks, in plain words. */
export const readyUnlocks = [
  "Players pay for bookings, lessons, programs, events and memberships online, with every fee shown before they pay.",
  "Paid offerings and events can be published to your club page.",
  "Payouts go to your bank on the schedule you choose.",
  "Refunds, disputes and holds are handled here in Money.",
] as const;

/** What a club needs ready before it starts (no numbers, no processor). */
export const whatYouNeed = [
  "Your business's legal name and type (or your own name, if you run it yourself)",
  "Your tax ID",
  "A government ID for the owner or the person who runs the club",
  "The bank account payouts should go to",
  "A short description of what you sell",
] as const;

// ── Sales (obligations) and their delivery ──────────────────────────────────

const obligationCopy: Record<ObligationStatus, StateCopy> = {
  "pending-settlement": {
    label: "Payment clearing",
    tone: "neutral",
    sentence:
      "The player has paid. The money is still clearing and is not payable yet.",
  },
  "awaiting-delivery": {
    label: "Waiting for the session",
    tone: "info",
    sentence:
      "The money has cleared. It is paid out once the session or booking has taken place.",
  },
  "partially-released": {
    label: "Partly paid out",
    tone: "info",
    sentence:
      "Part of this sale has been paid out; the rest follows as the remaining sessions take place.",
  },
  released: {
    label: "Paid out",
    tone: "positive",
    sentence: "Everything the club is owed for this sale has been paid out.",
  },
  held: {
    label: "Held",
    tone: "warning",
    sentence:
      "Money from this sale is held and will not be paid out until the hold ends.",
    next: "See why it's held",
  },
  disputed: {
    label: "Disputed",
    tone: "attention",
    sentence:
      "The buyer disputed this payment with their bank. The amount is held until the dispute is decided.",
    next: "Respond to the dispute",
  },
  "partially-refunded": {
    label: "Partly refunded",
    tone: "info",
    sentence: "Part of this sale was refunded. The rest is paid out as normal.",
  },
  refunded: {
    label: "Refunded",
    tone: "neutral",
    sentence: "This sale was refunded in full. Nothing more is paid out.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    sentence:
      "The session did not take place, so nothing was released. The money waits for the refund.",
    next: "Refund the buyer",
  },
};

export function obligationStatusCopy(status: ObligationStatus): StateCopy {
  return obligationCopy[status];
}

const ruleCopy: Record<DeliveryRule, string> = {
  "scheduled-end": "Paid out after the booking or session has ended.",
  "event-last-day": "Paid out after the last day of the event.",
  "pro-rata-sessions": "Paid out session by session, as each one takes place.",
  "pro-rata-weekly": "Paid out in equal weekly portions while it runs.",
  "membership-period":
    "Paid out once the payment has cleared and the full-refund window has closed.",
  "credit-pack-reserve":
    "Paid out as credits are used or once cleared, with part held for unused credits.",
  "goods-fulfilment": "Paid out once the item is handed over or shipped.",
  instant: "Paid out as soon as the payment clears.",
};

export function deliveryRuleCopy(rule: DeliveryRule): string {
  return ruleCopy[rule];
}

/** The delivery column: delivered, waiting, or cancelled with nothing released. */
export function deliveryState(status: ObligationStatus): {
  label: string;
  tone: Tone;
} {
  switch (status) {
    case "pending-settlement":
    case "awaiting-delivery":
      return { label: "Waiting for the session", tone: "info" };
    case "partially-released":
      return { label: "Partly delivered", tone: "info" };
    case "cancelled":
      return { label: "Cancelled: nothing released", tone: "neutral" };
    case "refunded":
      return { label: "Refunded", tone: "neutral" };
    default:
      return { label: "Delivered", tone: "positive" };
  }
}

const trancheCopy: Record<TrancheStatus, StateCopy> = {
  scheduled: {
    label: "Scheduled",
    tone: "neutral",
    sentence: "Waits for its session or date.",
  },
  delivered: {
    label: "Delivered",
    tone: "info",
    sentence:
      "Delivered; waiting for the money to clear or the first-payout date.",
  },
  releasable: {
    label: "Ready to pay out",
    tone: "positive",
    sentence: "Goes out with the next payout.",
  },
  held: {
    label: "Held",
    tone: "warning",
    sentence: "Held until the hold on this sale ends.",
  },
  released: {
    label: "Paid out",
    tone: "positive",
    sentence: "Included in a payout.",
  },
  reversed: {
    label: "Refunded",
    tone: "neutral",
    sentence: "A refund took this portion back before it was paid out.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    sentence: "Its session did not happen, so nothing was released.",
  },
};

export function trancheStatusCopy(status: TrancheStatus): StateCopy {
  return trancheCopy[status];
}

// ── Payouts ─────────────────────────────────────────────────────────────────

/** Payout states as the payment network reports them. Unknown ones are said plainly. */
export function payoutStatusCopy(status: string): StateCopy {
  switch (status) {
    case "paid":
      return {
        label: "Paid",
        tone: "positive",
        sentence: "The bank has received this payout.",
      };
    case "in_transit":
      return {
        label: "On the way",
        tone: "info",
        sentence: "On its way to your bank.",
      };
    case "pending":
      return {
        label: "Pending",
        tone: "neutral",
        sentence: "Created and waiting to be sent to your bank.",
      };
    case "failed":
      return {
        label: "Failed",
        tone: "attention",
        sentence:
          "The bank returned this payout. The money is back in your balance and goes out with the next payout once your bank details are fixed.",
        next: "Check the payout bank",
      };
    case "canceled":
    case "cancelled":
      return {
        label: "Cancelled",
        tone: "neutral",
        sentence:
          "This payout was cancelled. The money is back in your balance.",
      };
    default:
      return {
        label: status
          .replaceAll("_", " ")
          .replace(/^\w/, (c) => c.toUpperCase()),
        tone: "neutral",
        sentence: "Duna is waiting for the bank to confirm this payout.",
      };
  }
}

export type PayoutInterval = "manual" | "daily" | "weekly" | "monthly";
export type Weekday =
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

const weekdayLabel: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
}

/** "Every business day", "Every Friday", "On the 1st of each month", "Only when you ask". */
export function payoutRhythm(settings: {
  readonly interval: PayoutInterval;
  readonly weeklyDay: Weekday;
  readonly monthlyDay: number;
}): string {
  switch (settings.interval) {
    case "daily":
      return "Every business day";
    case "weekly":
      return `Every ${weekdayLabel[settings.weeklyDay]}`;
    case "monthly":
      return `On the ${ordinal(settings.monthlyDay)} of each month`;
    case "manual":
      return "Only when you ask";
  }
}

export const weekdays = Object.keys(weekdayLabel) as Weekday[];
export function weekdayName(day: Weekday): string {
  return weekdayLabel[day];
}

/** A statement descriptor the backend will accept: 5–22 of A–Z, 0–9, space, dot, dash. */
export function descriptorProblem(value: string): string | undefined {
  if (value === "") return undefined;
  if (value.length < 5) return "Use at least 5 characters.";
  if (value.length > 22) return "Use 22 characters or fewer.";
  if (!/^[A-Z0-9 .-]+$/.test(value)) {
    return "Use capital letters, numbers, spaces, dots and dashes only.";
  }
  return undefined;
}

/** Upper-cases and drops what a bank statement can't show. */
export function cleanDescriptor(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, "")
    .slice(0, 22);
}

// ── Disputes ────────────────────────────────────────────────────────────────

const disputeCopy: Record<DisputeStatus, StateCopy> = {
  "needs-response": {
    label: "Needs your response",
    tone: "attention",
    sentence:
      "The buyer's bank has questioned this payment. The amount is held while it's decided. Send your side before the deadline.",
    next: "Write your response",
  },
  "evidence-submitted": {
    label: "Response sent",
    tone: "info",
    sentence:
      "Your response has been sent to the buyer's bank. Nothing more to do; the decision usually takes a few weeks.",
  },
  "under-review": {
    label: "Under review",
    tone: "info",
    sentence:
      "The buyer's bank is reviewing the response. The amount stays held until it decides.",
  },
  won: {
    label: "Won",
    tone: "positive",
    sentence:
      "The bank decided in your favour. The held amount is released and paid out as normal.",
  },
  lost: {
    label: "Lost",
    tone: "neutral",
    sentence:
      "The bank decided for the buyer. The amount and the dispute fee were taken from the sale.",
  },
  accepted: {
    label: "Accepted",
    tone: "neutral",
    sentence:
      "The dispute was accepted without a response. The amount went back to the buyer.",
  },
  "warning-closed": {
    label: "Inquiry closed",
    tone: "neutral",
    sentence:
      "The bank asked about this payment and then closed the inquiry. Nothing was held.",
  },
};

export function disputeStatusCopy(status: DisputeStatus): StateCopy {
  return disputeCopy[status];
}

export const OPEN_DISPUTE_STATUSES: readonly DisputeStatus[] = [
  "needs-response",
  "evidence-submitted",
  "under-review",
];

/** The bank's reason code in words. */
export function disputeReason(reason: string): string {
  const reasons: Record<string, string> = {
    product_not_received:
      "The buyer says they didn't receive what they paid for",
    product_unacceptable: "The buyer says it wasn't as described",
    duplicate: "The buyer says they were charged twice",
    fraudulent: "The cardholder says they didn't make this payment",
    subscription_canceled: "The buyer says they had cancelled",
    credit_not_processed: "The buyer says a refund was promised but not given",
    unrecognized: "The buyer doesn't recognise the payment",
    general: "The buyer's bank gave a general reason",
  };
  return reasons[reason] ?? `Reason given: ${reason.replaceAll("_", " ")}`;
}

/** Disputes needing a response first, earliest club deadline first; then the rest, newest first. */
export function sortDisputes<
  T extends {
    readonly status: DisputeStatus;
    readonly organizationEvidenceDueBy?: string;
    readonly evidenceDueBy?: string;
    readonly openedAt: string;
  },
>(items: readonly T[]): T[] {
  const due = (item: T) =>
    item.organizationEvidenceDueBy ?? item.evidenceDueBy ?? "9999";
  return [...items].sort((a, b) => {
    const aOpen = a.status === "needs-response" ? 0 : 1;
    const bOpen = b.status === "needs-response" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    if (aOpen === 0) return due(a).localeCompare(due(b));
    return b.openedAt.localeCompare(a.openedAt);
  });
}

// ── Holds, reserves and recovery ────────────────────────────────────────────

const holdKindCopy: Record<HoldKind, string> = {
  dispute: "Held while a card dispute is decided.",
  "first-payout-delay":
    "A new club's first payout waits a short time after its first payment.",
  "rolling-reserve": "Part of recent sales held as a rolling reserve.",
  "unredeemed-credit-reserve":
    "Part of the value of unused credits, held until they're used.",
  "negative-balance":
    "Recovered from new sales to cover a refund or dispute after a payout.",
  closure: "Held while the club's account is being closed.",
  "manual-review": "Held while Duna reviews a payment.",
};

/** Why money is held, by the kind of hold. */
export function holdReason(kind: HoldKind): string {
  return holdKindCopy[kind];
}

const holdStatusMap: Record<HoldStatus, StateCopy> = {
  active: {
    label: "Held",
    tone: "warning",
    sentence: "Not paid out while the hold lasts.",
  },
  released: {
    label: "Released",
    tone: "positive",
    sentence: "The hold ended and the money is paid out as normal.",
  },
  applied: {
    label: "Used",
    tone: "neutral",
    sentence: "The held money covered a refund, dispute or amount owed.",
  },
};

export function holdStatusCopy(status: HoldStatus): StateCopy {
  return holdStatusMap[status];
}

const reserveStatusMap: Record<ReserveStatus, StateCopy> = {
  proposed: {
    label: "Proposed",
    tone: "info",
    sentence:
      "Duna has proposed this reserve. Nothing is held unless a Duna person activates it after sending you written notice.",
    next: "Ask for a review",
  },
  active: {
    label: "Active",
    tone: "warning",
    sentence: "Part of new sales is held under this reserve until it ends.",
    next: "Ask for a review",
  },
  "under-review": {
    label: "Under review",
    tone: "info",
    sentence: "You asked for a review. A Duna person will reply.",
  },
  released: {
    label: "Ended",
    tone: "positive",
    sentence: "This reserve has ended and its money was released.",
  },
};

export function reserveStatusCopy(status: ReserveStatus): StateCopy {
  return reserveStatusMap[status];
}

const triggerCopy: Record<ReserveTrigger, string> = {
  "new-organization-high-volume": "A new club taking a lot of payments quickly",
  "refund-rate": "A high share of refunds recently",
  "dispute-rate": "A high share of card disputes recently",
  "long-dated-sales": "Many sales for sessions far in the future",
  "business-change": "A change to the business",
  "processor-requirement": "A requirement from the payment network",
  "standing-credit-reserve": "Unused credits players have paid for",
  closure: "The club's account is closing",
};

export function reserveTrigger(trigger: ReserveTrigger): string {
  return triggerCopy[trigger];
}

const refundSourceCopy: Record<RefundSource, string> = {
  "held-funds": "From this sale's money not yet paid out",
  "available-balance": "From your balance waiting to be paid out",
  "future-proceeds": "From your next sales",
  "bank-debit": "Debited from your bank",
};

export function refundSource(source: RefundSource): string {
  return refundSourceCopy[source];
}

const recoveryKindCopy: Record<RecoveryKind, string> = {
  "set-off": "Taken from new sales",
  "bank-debit": "Debited from your bank",
  invoice: "Invoice for a person to send",
};

export function recoveryKind(kind: RecoveryKind): string {
  return recoveryKindCopy[kind];
}

const recoveryStatusMap: Record<RecoveryStatus, StateCopy> = {
  pending: {
    label: "Owed",
    tone: "attention",
    sentence:
      "An amount is owed after a refund or dispute that came after a payout.",
    next: "Recovered automatically from new sales",
  },
  collected: {
    label: "Settled",
    tone: "positive",
    sentence: "The amount owed has been recovered.",
  },
  failed: {
    label: "Not collected",
    tone: "attention",
    sentence:
      "Collecting the amount owed didn't work. Duna will contact you before trying another way.",
    next: "Contact Duna support",
  },
  "written-off": {
    label: "Written off",
    tone: "neutral",
    sentence: "Duna closed this amount; nothing more is owed.",
  },
};

export function recoveryStatusCopy(status: RecoveryStatus): StateCopy {
  return recoveryStatusMap[status];
}

// ── Refunds ─────────────────────────────────────────────────────────────────

export type RefundMethod = "card" | "credits";

/** How much may still be refunded on a sale, from what the backend returned. */
export function refundableMinor(input: {
  readonly grossMinor: number;
  readonly refundedMinor: number;
}): number {
  return Math.max(0, input.grossMinor - input.refundedMinor);
}

/** The amount problem for a refund draft, or undefined when it can be sent. */
export function refundAmountProblem(input: {
  readonly amountMinor: number | null;
  readonly refundableMinor: number;
  readonly method: RefundMethod;
}): string | undefined {
  if (input.method === "credits") return undefined;
  if (input.amountMinor === null || input.amountMinor <= 0) {
    return "Enter how much to refund.";
  }
  if (input.amountMinor > input.refundableMinor) {
    return "That's more than is left to refund on this sale.";
  }
  return undefined;
}

/** What the strong confirmation says the refund does, in words (no invented numbers). */
export function refundConsequence(input: {
  readonly method: RefundMethod;
  readonly full: boolean;
  readonly buyerName: string;
}): string {
  if (input.method === "credits") {
    return `${input.buyerName}'s credits are restored; no money moves. A refund cannot be undone.`;
  }
  return `${input.buyerName} is refunded to the card they paid with. The refund comes out of this sale first, then your balance. Duna's fees on the refunded part are returned in proportion. ${input.full ? "The sale is closed." : "The rest of the sale is paid out as normal."} A refund cannot be undone.`;
}

// ── Transactions list ───────────────────────────────────────────────────────

export type SaleFilter =
  "all" | "waiting" | "paid-out" | "held" | "refunded" | "cancelled";

export const saleFilters: readonly { value: SaleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "waiting", label: "Waiting" },
  { value: "paid-out", label: "Paid out" },
  { value: "held", label: "Held or disputed" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

export function matchesSaleFilter(
  status: ObligationStatus | undefined,
  filter: SaleFilter,
): boolean {
  if (filter === "all") return true;
  if (!status) return false;
  switch (filter) {
    case "waiting":
      return (
        status === "pending-settlement" ||
        status === "awaiting-delivery" ||
        status === "partially-released"
      );
    case "paid-out":
      return status === "released" || status === "partially-released";
    case "held":
      return status === "held" || status === "disputed";
    case "refunded":
      return status === "refunded" || status === "partially-refunded";
    case "cancelled":
      return status === "cancelled";
  }
}

/** Case- and accent-insensitive search over what a person would type. */
export function matchesSearch(
  query: string,
  fields: readonly (string | undefined)[],
): boolean {
  const normal = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const words = normal(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normal(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

// ── Delivery facts ──────────────────────────────────────────────────────────

const deliveryEventCopy: Record<string, string> = {
  "booking-ended": "The booking ended",
  "session-ended": "A session took place",
  "event-last-day-ended": "The event's last day ended",
  "weekly-portion-elapsed": "Another week of the program passed",
  "membership-payment-received": "The membership payment came in",
  "refund-window-ended": "The full-refund window closed",
  "credit-redeemed": "A credit was used",
  "credit-refunded": "An unused credit was refunded",
  "goods-fulfilled": "The item was handed over",
  "goods-shipped": "The item was shipped",
  "goods-cancel-offered":
    "The buyer was offered a cancellation (past the ship-by date)",
  "access-granted": "Access was given",
  "paid-in-person": "Paid in person",
  "delivery-cancelled": "The session was cancelled, so nothing was released",
};

/** A delivery fact in words. */
export function deliveryEventLabel(kind: string): string {
  return deliveryEventCopy[kind] ?? "Delivery recorded";
}
