/**
 * Who gets what back when a court booking is cancelled (SCHED-API).
 *
 * `planCourtCancellation` is pure and is the ONLY place this is decided:
 * the preview (`operator.schedule.cancelCourtBookingPreview`) and the
 * cancellation (`operator.schedule.cancelCourtBooking`) both call it with
 * the same loaded rows, so the preview can never promise something the
 * cancellation does not do (proved in schedule.integration.test.ts).
 *
 * Money rules, from the existing code and the legal register only:
 * - the reservation policy is the court's snapshot taken when the booking
 *   was made (`normalizeCourtCancellationPolicy`): inside
 *   `refundBeforeHours` before the start, a refund is due; later, it is not;
 * - when the club cancels (`cause: "club"`), every payer gets their money
 *   back in full (the refund floor, docs/legal/README.md O10);
 * - card money goes back through `refundOrganizationOrder`, the club's
 *   refund path (refund record → Duna Pay funding order); money paid at the
 *   desk is handed back at the desk and recorded, never moved by Duna.
 */
import type { ScheduleCancelLine } from "../../contracts/schedule";

export type RefundChoice = "full" | "none" | "by-policy";
export type CancelCause = "club" | "player-asked";

export interface PlanBooking {
  readonly startsAt: Date;
  readonly orderId: string | null;
  readonly personId: string;
  readonly refundBeforeHours?: number;
}

export interface PlanParticipant {
  readonly id: string;
  readonly personId: string | null;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly orderId: string | null;
}

export interface PlanOrder {
  readonly id: string;
  readonly status: string;
  readonly totalMinor: number;
  readonly currency: string;
  readonly stripePaymentIntentId: string | null;
  /** Refunds already pending or succeeded on this order. */
  readonly refundedMinor: number;
}

export interface PlannedLine extends Required<
  Pick<ScheduleCancelLine, "name" | "method" | "action">
> {
  readonly participantId?: string;
  readonly orderId?: string;
  readonly paidMinor: number;
  readonly refundMinor: number;
  readonly currency?: string;
}

export interface CourtCancellationPlan {
  readonly insideRefundWindow: boolean;
  readonly lines: readonly PlannedLine[];
  readonly totalRefundMinor: number;
  readonly currency?: string;
  /** True when some line moves money (a card refund or a desk hand-back). */
  readonly movesMoney: boolean;
  /** Paid money exists that the chosen refund keeps. */
  readonly keepsPaidMoney: boolean;
}

const PAID = new Set(["paid", "partially-refunded"]);
const GONE = new Set(["cancelled", "declined"]);

export function insideRefundWindow(
  booking: Pick<PlanBooking, "startsAt" | "refundBeforeHours">,
  now: Date,
): boolean {
  const hours = booking.refundBeforeHours ?? 0;
  return now.getTime() <= booking.startsAt.getTime() - hours * 3_600_000;
}

export function planCourtCancellation(input: {
  readonly booking: PlanBooking;
  readonly participants: readonly PlanParticipant[];
  readonly orders: readonly PlanOrder[];
  readonly refund: RefundChoice;
  readonly cause: CancelCause;
  readonly now: Date;
}): CourtCancellationPlan {
  const inside = insideRefundWindow(input.booking, input.now);
  const ordersById = new Map(input.orders.map((order) => [order.id, order]));
  const organizer =
    input.participants.find((row) => row.role === "organizer") ??
    input.participants.find((row) => row.personId === input.booking.personId);
  const refundFor = (paidMinor: number) => {
    if (paidMinor <= 0) return 0;
    if (input.cause === "club") return paidMinor;
    if (input.refund === "full") return paidMinor;
    if (input.refund === "none") return 0;
    return inside ? paidMinor : 0;
  };
  const lineForOrder = (
    order: PlanOrder,
    payer: PlanParticipant | undefined,
  ): PlannedLine => {
    const base = {
      ...(payer ? { participantId: payer.id } : {}),
      orderId: order.id,
      name: payer?.name ?? "Booker",
      currency: order.currency,
    };
    const desk = !order.stripePaymentIntentId;
    if (!PAID.has(order.status)) {
      return {
        ...base,
        method: "unpaid",
        action: "release",
        paidMinor: 0,
        refundMinor: 0,
      };
    }
    const paidMinor = Math.max(0, order.totalMinor - order.refundedMinor);
    const refundMinor = refundFor(paidMinor);
    return {
      ...base,
      method: desk ? "desk" : "card",
      action:
        refundMinor > 0 ? (desk ? "hand-back-at-desk" : "refund-card") : "keep",
      paidMinor,
      refundMinor,
    };
  };
  const lines: PlannedLine[] = [];
  const covered = new Set<string>();
  if (input.booking.orderId) {
    const order = ordersById.get(input.booking.orderId);
    if (order) {
      lines.push(lineForOrder(order, organizer));
      covered.add(order.id);
      if (organizer) covered.add(`participant:${organizer.id}`);
    }
  }
  for (const participant of input.participants) {
    if (covered.has(`participant:${participant.id}`)) continue;
    const order = participant.orderId
      ? ordersById.get(participant.orderId)
      : undefined;
    if (order && !covered.has(order.id)) {
      lines.push(lineForOrder(order, participant));
      covered.add(order.id);
      continue;
    }
    if (GONE.has(participant.status)) continue;
    lines.push({
      participantId: participant.id,
      name: participant.name,
      method: participant.status === "paid" ? "free" : "nothing-paid",
      action: "release",
      paidMinor: 0,
      refundMinor: 0,
    });
  }
  const totalRefundMinor = lines.reduce(
    (total, line) => total + line.refundMinor,
    0,
  );
  return {
    insideRefundWindow: inside,
    lines,
    totalRefundMinor,
    currency: lines.find((line) => line.currency)?.currency,
    movesMoney: lines.some((line) => line.refundMinor > 0),
    keepsPaidMoney: lines.some(
      (line) => line.paidMinor > 0 && line.refundMinor < line.paidMinor,
    ),
  };
}
