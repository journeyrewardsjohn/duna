/**
 * The payout policy in one place (docs/plan/payout-policy.md §3–§4).
 *
 *   computeReleasePlan(obligation, events, context, now) → tranches + status
 *
 * Pure and deterministic: the same inputs always give the same plan, so the
 * release job can recompute it on every run, under retries, webhook replays
 * and concurrent runs, and only ever append facts (delivery events) or move
 * a tranche forward.
 *
 * The rules:
 * - Money is releasable when it is SETTLED (the processor reports the funds
 *   available) AND DELIVERED (a delivery event for that portion exists), and
 *   no hold covers the sale. Time alone never delivers anything: the release
 *   job records a delivery event only after it has checked the source (the
 *   booking, session, occurrence or fulfilment) was not cancelled.
 * - Releasable time = later of settlement, delivery, the refund window (when
 *   the sale has one) and the organisation's first-payout date.
 * - Each product's delivery rule splits the proceeds into tranches (one, one
 *   per session, one per week, one per redeemed credit ...). Splits never
 *   create or lose a cent: integer shares with the remainder on the earliest
 *   tranches.
 * - Released tranches are immutable. Refunds reduce what is still payable,
 *   taken from the latest unreleased portions first; whatever a refund takes
 *   beyond the unreleased money is `overReleasedMinor`, to be recovered
 *   (§5.5).
 * - A cancelled delivery (session cancelled under its minimum, club cancels,
 *   goods cancelled) releases nothing for that portion.
 */
import type {
  payDeliveryEventKinds,
  payDeliveryRules,
  payObligationStatuses,
  payTrancheKinds,
  payTrancheStatuses,
} from "@duna/db/schema";
import { addBusinessDays } from "./business-days";
import type { PayPolicySettings } from "./policy-settings";

export type PayDeliveryRule = (typeof payDeliveryRules)[number];
export type PayDeliveryEventKind = (typeof payDeliveryEventKinds)[number];
export type PayObligationStatus = (typeof payObligationStatuses)[number];
export type PayTrancheKind = (typeof payTrancheKinds)[number];
export type PayTrancheStatus = (typeof payTrancheStatuses)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** A weekly schedule longer than two years is treated as two years of portions. */
const MAX_WEEKLY_PORTIONS = 104;
/** Credit packs larger than this release in proportional groups of credits. */
const MAX_CREDIT_TRANCHES = 366;

export interface ReleasedTranche {
  readonly sequence: number;
  readonly amountMinor: number;
  readonly releasedAt: Date;
  readonly payoutId?: string;
}

export interface ReleaseObligation {
  readonly id: string;
  readonly deliveryRule: PayDeliveryRule;
  /** gross − application fee − tax (the organisation's proceeds). */
  readonly proceedsMinor: number;
  /** Proceeds taken back by refunds funded from this sale. */
  readonly refundedProceedsMinor: number;
  /** Amount under an open dispute (0 when none). */
  readonly disputedMinor: number;
  readonly createdAt: Date;
  readonly settledAt?: Date;
  readonly deliveryStartsAt?: Date;
  readonly deliveryEndsAt?: Date;
  readonly refundWindowEndsAt?: Date;
  readonly shipByAt?: Date;
  /** pro-rata-sessions: the session schedule fixed at sale time. */
  readonly sessions?: readonly { readonly id: string; readonly endsAt: Date }[];
  /** Start tranche share fixed at sale time (0 when not eligible). */
  readonly startTrancheBps?: number;
  /** credit-pack-reserve: release on settlement, or per redeemed credit. */
  readonly creditRelease?: "settlement" | "redemption";
  readonly creditsGranted?: number;
  readonly released: readonly ReleasedTranche[];
}

export interface ReleaseEvent {
  /** The stored event id; a fact recorded twice counts once. */
  readonly id?: string;
  readonly kind: PayDeliveryEventKind;
  readonly occurredAt: Date;
  readonly sessionId?: string;
  /** Tranche sequence for weekly portions. */
  readonly sequence?: number;
  /** Credits redeemed or refunded. */
  readonly credits?: number;
}

export interface ReleaseContext {
  readonly policy: PayPolicySettings;
  /** payout-policy §5.3 (null once waived). */
  readonly firstPayoutNotBefore?: Date;
  /** An active dispute, manual-review or closure hold names this obligation. */
  readonly obligationHeld: boolean;
}

export interface PlannedTranche {
  readonly sequence: number;
  readonly kind: PayTrancheKind;
  readonly status: PayTrancheStatus;
  /** What this portion pays (after refunds); fixed once released. */
  readonly amountMinor: number;
  /** The share before refunds. */
  readonly baseAmountMinor: number;
  readonly sessionId?: string;
  readonly deliveryDueAt?: Date;
  readonly deliveredAt?: Date;
  /** Actual once delivered and settled; otherwise the expected date. */
  readonly releasableAt?: Date;
  readonly releasedAt?: Date;
  readonly payoutId?: string;
}

export interface ReleasePlan {
  readonly tranches: readonly PlannedTranche[];
  readonly status: PayObligationStatus;
  readonly releasedMinor: number;
  /** Payable now (status `releasable`). */
  readonly releasableMinor: number;
  /** Still owed and not yet released (includes held and undelivered). */
  readonly unreleasedMinor: number;
  /** Released beyond what is now owed (refund or loss after payout). */
  readonly overReleasedMinor: number;
  readonly nextReleaseAt?: Date;
}

// ── Integer splitting ────────────────────────────────────────────────────────

/** Split `total` into `parts` integers that sum to it; earlier parts get the remainder. */
export function splitEvenly(total: number, parts: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Amounts must be non-negative integer minor units.");
  }
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new Error("A split needs at least one part.");
  }
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from(
    { length: parts },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/** Basis-point share, rounded down so a share never exceeds its whole. */
export function basisPointShare(total: number, bps: number): number {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error("Basis points must be an integer between 0 and 10000.");
  }
  return Math.floor((total * bps) / 10_000);
}

// ── Tranche skeleton (base amounts, independent of events) ──────────────────

interface TrancheSkeleton {
  readonly sequence: number;
  readonly kind: PayTrancheKind;
  readonly baseAmountMinor: number;
  readonly sessionId?: string;
  readonly deliveryDueAt?: Date;
  /** Credit packs released by redemption: the cumulative credits this tranche needs. */
  readonly creditsThrough?: number;
}

function single(
  obligation: ReleaseObligation,
  kind: PayTrancheKind,
  dueAt: Date | undefined,
): TrancheSkeleton[] {
  return [
    {
      sequence: 0,
      kind,
      baseAmountMinor: obligation.proceedsMinor,
      deliveryDueAt: dueAt,
    },
  ];
}

function weeklySkeleton(obligation: ReleaseObligation): TrancheSkeleton[] {
  const startsAt = obligation.deliveryStartsAt ?? obligation.createdAt;
  const endsAt =
    obligation.deliveryEndsAt && obligation.deliveryEndsAt > startsAt
      ? obligation.deliveryEndsAt
      : startsAt;
  const weeks = Math.min(
    MAX_WEEKLY_PORTIONS,
    Math.max(
      1,
      Math.ceil((endsAt.getTime() - startsAt.getTime()) / (7 * DAY_MS)),
    ),
  );
  const amounts = splitEvenly(obligation.proceedsMinor, weeks);
  const span = endsAt.getTime() - startsAt.getTime();
  return amounts.map((amount, index) => ({
    sequence: index,
    kind: "weekly-portion" as const,
    baseAmountMinor: amount,
    deliveryDueAt:
      index === weeks - 1
        ? endsAt
        : new Date(
            startsAt.getTime() +
              Math.min(span, Math.round(((index + 1) * span) / weeks)),
          ),
  }));
}

function sessionSkeleton(
  obligation: ReleaseObligation,
  policy: PayPolicySettings,
): TrancheSkeleton[] {
  const sessions = [...(obligation.sessions ?? [])].sort(
    (left, right) =>
      left.endsAt.getTime() - right.endsAt.getTime() ||
      left.id.localeCompare(right.id),
  );
  if (!sessions.length) return weeklySkeleton(obligation);
  const bps = Math.min(
    Math.max(0, obligation.startTrancheBps ?? 0),
    policy.startTrancheMaxBps,
  );
  const start = basisPointShare(obligation.proceedsMinor, bps);
  const shares = splitEvenly(obligation.proceedsMinor - start, sessions.length);
  const skeleton: TrancheSkeleton[] = [];
  if (start > 0) {
    skeleton.push({
      sequence: 0,
      kind: "start-tranche",
      baseAmountMinor: start,
      sessionId: sessions[0]!.id,
      deliveryDueAt: sessions[0]!.endsAt,
    });
  }
  sessions.forEach((session, index) => {
    skeleton.push({
      sequence: skeleton.length,
      kind: "session-share",
      baseAmountMinor: shares[index]!,
      sessionId: session.id,
      deliveryDueAt: session.endsAt,
    });
  });
  return skeleton;
}

function creditSkeleton(obligation: ReleaseObligation): TrancheSkeleton[] {
  const credits = obligation.creditsGranted ?? 0;
  if (obligation.creditRelease !== "redemption") {
    return single(obligation, "full", obligation.createdAt);
  }
  if (credits < 1) {
    // Redemption-released but the grant is not known yet: nothing delivers.
    return [
      {
        sequence: 0,
        kind: "session-share",
        baseAmountMinor: obligation.proceedsMinor,
        creditsThrough: Number.MAX_SAFE_INTEGER,
      },
    ];
  }
  const count = Math.min(credits, MAX_CREDIT_TRANCHES);
  const amounts = splitEvenly(obligation.proceedsMinor, count);
  return amounts.map((amount, index) => ({
    sequence: index,
    kind: "session-share" as const,
    baseAmountMinor: amount,
    creditsThrough: Math.ceil(((index + 1) * credits) / count),
  }));
}

export function trancheSkeleton(
  obligation: ReleaseObligation,
  policy: PayPolicySettings,
): readonly TrancheSkeleton[] {
  switch (obligation.deliveryRule) {
    case "scheduled-end":
    case "event-last-day":
      return single(obligation, "full", obligation.deliveryEndsAt);
    case "pro-rata-sessions":
      return sessionSkeleton(obligation, policy);
    case "pro-rata-weekly":
      return weeklySkeleton(obligation);
    case "membership-period":
      return single(obligation, "membership-period", obligation.createdAt);
    case "credit-pack-reserve":
      return creditSkeleton(obligation);
    case "goods-fulfilment":
      return single(obligation, "full", obligation.shipByAt);
    case "instant":
      return single(obligation, "full", obligation.createdAt);
  }
}

// ── Delivery facts ───────────────────────────────────────────────────────────

/** Event kinds that deliver a whole-sale ("full") tranche, by rule. */
const WHOLE_DELIVERY: Readonly<
  Record<PayDeliveryRule, ReadonlySet<PayDeliveryEventKind>>
> = {
  "scheduled-end": new Set([
    "booking-ended",
    "session-ended",
    "event-last-day-ended",
    "paid-in-person",
  ]),
  "event-last-day": new Set(["event-last-day-ended", "session-ended"]),
  "pro-rata-sessions": new Set(),
  "pro-rata-weekly": new Set(),
  "membership-period": new Set(["membership-payment-received"]),
  "credit-pack-reserve": new Set(["access-granted", "paid-in-person"]),
  "goods-fulfilment": new Set(["goods-fulfilled", "goods-shipped"]),
  instant: new Set(["access-granted", "paid-in-person"]),
};

function earliest(dates: readonly (Date | undefined)[]): Date | undefined {
  let found: Date | undefined;
  for (const date of dates) {
    if (date && (!found || date < found)) found = date;
  }
  return found;
}

function latest(dates: readonly (Date | undefined)[]): Date | undefined {
  let found: Date | undefined;
  for (const date of dates) {
    if (date && (!found || date > found)) found = date;
  }
  return found;
}

interface DeliveryState {
  readonly deliveredAt?: Date;
  readonly cancelled: boolean;
}

function deliveryState(
  obligation: ReleaseObligation,
  tranche: TrancheSkeleton,
  events: readonly ReleaseEvent[],
  now: Date,
): DeliveryState {
  const past = events.filter((event) => event.occurredAt <= now);
  const rule = obligation.deliveryRule;
  let deliveredAt: Date | undefined;
  let specificCancel = false;

  if (tranche.creditsThrough !== undefined) {
    // Redemption-released credit pack: cumulative credits redeemed / refunded.
    let redeemed = 0;
    for (const event of [...past].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    )) {
      if (event.kind !== "credit-redeemed") continue;
      redeemed += Math.max(0, event.credits ?? 0);
      if (!deliveredAt && redeemed >= tranche.creditsThrough) {
        deliveredAt = event.occurredAt;
      }
    }
    const refunded = past
      .filter((event) => event.kind === "credit-refunded")
      .reduce((sum, event) => sum + Math.max(0, event.credits ?? 0), 0);
    const granted = obligation.creditsGranted ?? 0;
    specificCancel =
      !deliveredAt &&
      granted > 0 &&
      granted - refunded < tranche.creditsThrough;
  } else if (tranche.kind === "weekly-portion") {
    deliveredAt = earliest(
      past
        .filter(
          (event) =>
            event.kind === "weekly-portion-elapsed" &&
            event.sequence === tranche.sequence,
        )
        .map((event) => event.occurredAt),
    );
    specificCancel = past.some(
      (event) =>
        event.kind === "delivery-cancelled" &&
        event.sequence === tranche.sequence,
    );
  } else if (tranche.sessionId) {
    deliveredAt = earliest(
      past
        .filter(
          (event) =>
            event.kind === "session-ended" &&
            event.sessionId === tranche.sessionId,
        )
        .map((event) => event.occurredAt),
    );
    specificCancel = past.some(
      (event) =>
        event.kind === "delivery-cancelled" &&
        event.sessionId === tranche.sessionId,
    );
  } else {
    deliveredAt = earliest(
      past
        .filter((event) => WHOLE_DELIVERY[rule].has(event.kind))
        .map((event) => event.occurredAt),
    );
  }

  // A cancellation of the whole sale cancels every portion not delivered before it.
  const wholeCancelAt = earliest(
    past
      .filter(
        (event) =>
          event.kind === "delivery-cancelled" &&
          event.sessionId === undefined &&
          event.sequence === undefined,
      )
      .map((event) => event.occurredAt),
  );
  const wholeCancel =
    wholeCancelAt !== undefined &&
    (!deliveredAt || deliveredAt > wholeCancelAt);
  const cancelled = specificCancel || wholeCancel;
  return { deliveredAt: cancelled ? undefined : deliveredAt, cancelled };
}

function settledBy(obligation: ReleaseObligation, now: Date): boolean {
  return obligation.settledAt !== undefined && obligation.settledAt <= now;
}

function releasableTime(
  obligation: ReleaseObligation,
  context: ReleaseContext,
  deliveredOrDue: Date | undefined,
): Date | undefined {
  const settledAt = obligation.settledAt;
  const membershipFloor =
    obligation.deliveryRule === "membership-period" && settledAt
      ? addBusinessDays(settledAt, context.policy.membershipMinimumBusinessDays)
      : undefined;
  return latest([
    settledAt,
    deliveredOrDue,
    obligation.refundWindowEndsAt,
    context.firstPayoutNotBefore,
    membershipFloor,
  ]);
}

function uniqueEvents(events: readonly ReleaseEvent[]): ReleaseEvent[] {
  const seen = new Set<string>();
  const unique: ReleaseEvent[] = [];
  for (const event of events) {
    if (event.id !== undefined) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
    }
    unique.push(event);
  }
  return unique;
}

// ── The plan ─────────────────────────────────────────────────────────────────

function assertObligation(obligation: ReleaseObligation): void {
  for (const value of [
    obligation.proceedsMinor,
    obligation.refundedProceedsMinor,
    obligation.disputedMinor,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Obligation amounts must be non-negative minor units.");
    }
  }
  for (const tranche of obligation.released) {
    if (!Number.isSafeInteger(tranche.amountMinor) || tranche.amountMinor < 0) {
      throw new Error("Released amounts must be non-negative minor units.");
    }
  }
}

export function computeReleasePlan(
  obligation: ReleaseObligation,
  rawEvents: readonly ReleaseEvent[],
  context: ReleaseContext,
  now: Date,
): ReleasePlan {
  assertObligation(obligation);
  const events = uniqueEvents(rawEvents);
  const skeleton = trancheSkeleton(obligation, context.policy);
  const released = new Map(
    obligation.released.map((tranche) => [tranche.sequence, tranche]),
  );
  const releasedMinor = obligation.released.reduce(
    (sum, tranche) => sum + tranche.amountMinor,
    0,
  );
  const owedMinor = Math.max(
    0,
    obligation.proceedsMinor - obligation.refundedProceedsMinor,
  );
  const overReleasedMinor = Math.max(0, releasedMinor - owedMinor);

  // What is still payable, assigned to unreleased portions: delivered or
  // scheduled portions first, earliest first; cancelled portions last (their
  // money waits for the refund that the cancellation requires).
  let budget = Math.max(0, owedMinor - releasedMinor);
  const states = skeleton.map((tranche) =>
    released.has(tranche.sequence)
      ? undefined
      : deliveryState(obligation, tranche, events, now),
  );
  const amounts = new Map<number, number>();
  const assign = (predicate: (index: number) => boolean) => {
    skeleton.forEach((tranche, index) => {
      if (released.has(tranche.sequence) || !predicate(index)) return;
      const amount = Math.min(budget, tranche.baseAmountMinor);
      amounts.set(tranche.sequence, amount);
      budget -= amount;
    });
  };
  assign((index) => !states[index]!.cancelled);
  assign((index) => states[index]!.cancelled);
  if (budget > 0) {
    // Only reachable when a released portion was paid less than its share;
    // the difference stays payable with the last open portion.
    const last = [...skeleton]
      .reverse()
      .find(
        (tranche, reverseIndex) =>
          !released.has(tranche.sequence) &&
          !states[skeleton.length - 1 - reverseIndex]!.cancelled,
      );
    if (last) {
      amounts.set(last.sequence, (amounts.get(last.sequence) ?? 0) + budget);
      budget = 0;
    }
  }

  const settled = settledBy(obligation, now);
  const held = context.obligationHeld || obligation.disputedMinor > 0;
  const tranches: PlannedTranche[] = skeleton.map((tranche, index) => {
    const done = released.get(tranche.sequence);
    if (done) {
      return {
        sequence: tranche.sequence,
        kind: tranche.kind,
        status: "released",
        amountMinor: done.amountMinor,
        baseAmountMinor: tranche.baseAmountMinor,
        sessionId: tranche.sessionId,
        deliveryDueAt: tranche.deliveryDueAt,
        releasedAt: done.releasedAt,
        payoutId: done.payoutId,
      };
    }
    const state = states[index]!;
    const amountMinor = amounts.get(tranche.sequence) ?? 0;
    const releasableAt = releasableTime(
      obligation,
      context,
      state.deliveredAt ?? tranche.deliveryDueAt,
    );
    let status: PayTrancheStatus;
    if (state.cancelled) status = "cancelled";
    else if (amountMinor === 0 && tranche.baseAmountMinor > 0)
      status = "reversed";
    else if (
      state.deliveredAt &&
      settled &&
      releasableAt !== undefined &&
      releasableAt <= now
    )
      status = held ? "held" : "releasable";
    else if (state.deliveredAt) status = held ? "held" : "delivered";
    else status = "scheduled";
    return {
      sequence: tranche.sequence,
      kind: tranche.kind,
      status,
      amountMinor,
      baseAmountMinor: tranche.baseAmountMinor,
      sessionId: tranche.sessionId,
      deliveryDueAt: tranche.deliveryDueAt,
      deliveredAt: state.deliveredAt,
      releasableAt:
        status === "cancelled" || status === "reversed"
          ? undefined
          : releasableAt,
    };
  });

  const open = tranches.filter(
    (tranche) =>
      tranche.status !== "released" &&
      tranche.status !== "cancelled" &&
      tranche.status !== "reversed",
  );
  const releasableMinor = tranches
    .filter((tranche) => tranche.status === "releasable")
    .reduce((sum, tranche) => sum + tranche.amountMinor, 0);
  const unreleasedMinor = open.reduce(
    (sum, tranche) => sum + tranche.amountMinor,
    0,
  );
  const nextReleaseAt = earliest(
    open
      .filter((tranche) => tranche.amountMinor > 0)
      .map((tranche) => tranche.releasableAt),
  );

  let status: PayObligationStatus;
  const everyPortionCancelled =
    releasedMinor === 0 &&
    tranches.length > 0 &&
    tranches.every(
      (tranche) =>
        tranche.status === "cancelled" || tranche.status === "reversed",
    ) &&
    tranches.some((tranche) => tranche.status === "cancelled");
  if (
    obligation.proceedsMinor > 0 &&
    obligation.refundedProceedsMinor >= obligation.proceedsMinor
  )
    status = "refunded";
  else if (obligation.disputedMinor > 0) status = "disputed";
  else if (everyPortionCancelled) status = "cancelled";
  else if (context.obligationHeld) status = "held";
  else if (obligation.refundedProceedsMinor > 0) status = "partially-refunded";
  else if (!settled) status = "pending-settlement";
  else if (releasedMinor > 0 && unreleasedMinor === 0) status = "released";
  else if (releasedMinor > 0) status = "partially-released";
  else status = "awaiting-delivery";

  return {
    tranches,
    status,
    releasedMinor,
    releasableMinor,
    unreleasedMinor,
    overReleasedMinor,
    nextReleaseAt,
  };
}
