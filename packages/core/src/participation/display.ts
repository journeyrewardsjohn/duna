/**
 * The display model (participation.md §7): ONE function every surface calls
 * for a session — web, HQ, Player, Pro, notices and Ask Duna. It returns
 * tokens (render with `renderParticipationCopy`) and numbers, never layout.
 */
import {
  participationToken,
  renderParticipationCopy,
  type ParticipationToken,
} from "./copy";
import { formatParticipationTime, type ParticipationTimeLabel } from "./lock";
import {
  formatParticipationMoney,
  lateCancellationCharge,
  participationReservePerPlayer,
  participationRuleHasMinimum,
  perPlayerPrice,
  priceTierForGroupSize,
  type ParticipationPriceTier,
  type ResolvedParticipationRule,
} from "./rules";
import {
  deriveParticipationState,
  type ParticipationDecisionOutcome,
  type ParticipationState,
} from "./state";

export type ParticipationTone = "neutral" | "positive" | "caution" | "critical";

export interface ParticipationDisplayInput {
  /** Undefined: a capacity-only session ("3 spots left"). */
  readonly rule?: ResolvedParticipationRule;
  readonly title?: string;
  readonly capacity: number;
  /** Confirmed places (paid, or an unexpired pay-in-person reservation). */
  readonly booked: number;
  /** Unpaid checkouts holding a place (count for capacity, not the minimum). */
  readonly held?: number;
  readonly waiting?: number;
  readonly outcome?: ParticipationDecisionOutcome | null;
  readonly decidedGroupSize?: number | null;
  /** The effective lock (with any extension). */
  readonly lockAt?: Date;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly now: Date;
  readonly timeZone?: string;
  readonly viewerTimeZone?: string;
  readonly clubName?: string;
  /** Staff only: who cancelled. */
  readonly cancelledByName?: string;
  readonly attendanceClosed?: boolean;
  /** How the viewer pays; the ladder is credits (cards follow in PART-10). */
  readonly payment?: {
    readonly method: "credit" | "card" | "cash";
    readonly fixedCredits?: number;
  };
  /** The viewer's own booking, when they have one, or the quantity they would book. */
  readonly viewer?: {
    readonly booked: boolean;
    readonly quantity: number;
    readonly reservedCredits?: number;
    readonly absent?: boolean;
  };
  /** Free cancellation deadline for a session without a group rule (the refund window). */
  readonly freeCancelUntil?: Date;
}

export interface ParticipationLadderRow {
  readonly minParticipants: number;
  readonly maxParticipants: number;
  readonly creditsPerPlayer: number;
  readonly current: boolean;
  readonly label: ParticipationToken;
}

export interface ParticipationDisplay {
  /** "open" means no group rule: only capacity is shown. */
  readonly state: ParticipationState | "open";
  readonly hasGroupRule: boolean;
  readonly tone: ParticipationTone;
  readonly numbers: {
    readonly booked: number;
    readonly held: number;
    readonly capacity: number;
    readonly minimum: number;
    readonly needed: number;
    readonly spotsLeft: number;
    readonly waiting: number;
    readonly groupSize?: number;
  };
  readonly lock?: ParticipationTimeLabel;
  readonly status: ParticipationToken;
  readonly line?: ParticipationToken;
  readonly staff: ParticipationToken;
  readonly price?: {
    readonly unit: "credits";
    readonly reservePerPlayer: number;
    readonly nowPerPlayer: number;
    /** The most this booking can cost: reserve × places. */
    readonly maxCharge: number;
    readonly finalPerPlayer?: number;
    readonly ladder: readonly ParticipationLadderRow[];
    readonly line?: ParticipationToken;
    readonly currentRow?: ParticipationToken;
  };
  readonly cancellation: {
    readonly allowed: boolean;
    readonly free: boolean;
    readonly freeUntil?: ParticipationTimeLabel;
    /** Credits a late cancellation costs (decision 4). */
    readonly lateCharge?: number;
    readonly line?: ParticipationToken;
  };
  readonly a11y: ParticipationToken;
}

/**
 * The line under the price before the group is decided, true in every state
 * of the ladder (participation.md §7):
 * - a cheaper rung is still reachable and none is reached yet: "3 credits
 *   now. If more join by Thu 6:00 PM, the difference comes back."
 * - the group already reached a cheaper rung than the one reserved: "3
 *   credits now; 1 comes back when the group is confirmed Thu 6:00 PM."
 *   (", more if more join." when an even cheaper rung is still reachable).
 *   The amount is what comes back if the group holds at today's size.
 * - every rung costs the same: "3 credits now." (nothing about differences).
 * Card payers get the same three lines in money, back "to your card".
 */
export function participationPriceLine(input: {
  readonly tiers: readonly ParticipationPriceTier[];
  readonly unit: "credits" | "minor";
  readonly capacity: number;
  /** The group as it stands (confirmed places, at least 1). */
  readonly groupSize: number;
  readonly quantity: number;
  /** The lock, already formatted ("Thu 6:00 PM"). */
  readonly lock: string;
  /** Required for card (minor-unit) lines. */
  readonly currency?: string;
}): ParticipationToken | undefined {
  const reserve = participationReservePerPlayer(input.tiers, input.unit);
  if (reserve === undefined) return undefined;
  if (input.unit === "minor" && !input.currency) return undefined;
  const size = Math.max(1, Math.trunc(input.groupSize));
  const capacity = Math.max(size, Math.trunc(input.capacity));
  const quantity = Math.max(1, Math.trunc(input.quantity));
  const current = perPlayerPrice(input.tiers, size, input.unit) ?? reserve;
  const atCapacity =
    perPlayerPrice(input.tiers, capacity, input.unit) ?? current;
  const back = Math.max(0, reserve - current) * quantity;
  const moreReachable = capacity > size && atCapacity < current;
  const card = input.unit === "minor";
  const amount = (value: number) =>
    card ? formatParticipationMoney(value, input.currency!) : value;
  const max = amount(reserve * quantity);
  if (back > 0) {
    return participationToken(
      card
        ? moreReachable
          ? "price.card-now-returning-more"
          : "price.card-now-returning"
        : moreReachable
          ? "price.now-returning-more"
          : "price.now-returning",
      { max, back: amount(back), lock: input.lock },
    );
  }
  if (moreReachable) {
    return participationToken(card ? "price.card-now" : "price.now", {
      max,
      lock: input.lock,
    });
  }
  return participationToken(card ? "price.card-now-fixed" : "price.now-fixed", {
    max,
  });
}

function toneFor(state: ParticipationState | "open"): ParticipationTone {
  switch (state) {
    case "needs-players":
      return "caution";
    case "cancelled-low":
    case "cancelled-club":
      return "critical";
    case "minimum-reached":
    case "confirmed":
    case "running-small":
      return "positive";
    default:
      return "neutral";
  }
}

export function participationDisplay(
  input: ParticipationDisplayInput,
): ParticipationDisplay {
  const rule = input.rule;
  const capacity = Math.max(1, input.capacity);
  const booked = Math.max(0, input.booked);
  const held = Math.max(0, input.held ?? 0);
  const waiting = Math.max(0, input.waiting ?? 0);
  const grouped = rule !== undefined && participationRuleHasMinimum(rule);
  const minimum = rule?.minParticipants ?? 1;
  const needed = Math.max(0, minimum - booked);
  const spotsLeft = Math.max(0, capacity - booked - held);
  const unit = rule?.unit ?? "player";
  const lock =
    input.lockAt && rule
      ? formatParticipationTime({
          at: input.lockAt,
          now: input.now,
          timeZone: input.timeZone,
          viewerTimeZone: input.viewerTimeZone,
        })
      : undefined;
  const lockLabel = lock?.labelWithViewer ?? lock?.label ?? "";
  const derived = deriveParticipationState({
    booked,
    minParticipants: minimum,
    capacity,
    outcome: input.outcome,
    now: input.now,
    endsAt: input.endsAt,
    attendanceClosed: input.attendanceClosed,
  });
  // A capacity-only session never enters the minimum states, but it can be
  // cancelled by the club and it can end.
  const state: ParticipationState | "open" =
    grouped ||
    derived === "cancelled-club" ||
    derived === "done" ||
    derived === "settled"
      ? derived
      : derived === "full"
        ? "full"
        : "open";
  const groupSize =
    input.decidedGroupSize ?? (input.outcome ? booked : undefined);
  const hasTiers = (rule?.tiers.length ?? 0) > 0;

  let status: ParticipationToken;
  let line: ParticipationToken | undefined;
  let staff: ParticipationToken;
  switch (state) {
    case "open":
      status = participationToken("status.spots", { n: spotsLeft });
      staff = participationToken("staff.on-track", { booked, capacity });
      break;
    case "needs-players":
      status = participationToken("status.needs", { n: needed });
      line =
        rule?.minimumPolicy === "cancel"
          ? participationToken("line.needs-cancel", {
              lock: lockLabel,
              n: needed,
            })
          : hasTiers
            ? participationToken("line.needs-run-tiers", { n: needed })
            : participationToken("line.needs-run");
      staff = participationToken("staff.at-risk", {
        n: needed,
        lock: lockLabel,
      });
      break;
    case "minimum-reached":
      status = participationToken("status.reached");
      line = participationToken("line.reached", { lock: lockLabel });
      staff = participationToken("staff.on-track", { booked, capacity });
      break;
    case "full":
      status = participationToken("status.full");
      line =
        waiting > 0
          ? participationToken("line.full-waiting", { n: waiting })
          : rule?.waitlist
            ? participationToken("line.full-waitlist")
            : undefined;
      staff = participationToken("staff.full", { waiting });
      break;
    case "confirmed":
      status = participationToken("status.confirmed", {
        n: groupSize ?? booked,
        unit,
      });
      staff = participationToken("staff.confirmed", { booked });
      break;
    case "running-small":
      status = participationToken("status.confirmed-small");
      staff = participationToken("staff.running-small", {
        booked,
        min: minimum,
      });
      break;
    case "cancelled-low":
      status = participationToken("status.cancelled-low");
      staff = participationToken("staff.cancelled-low", {
        booked: groupSize ?? booked,
        min: minimum,
      });
      break;
    case "cancelled-club":
      status = participationToken("status.cancelled-club", {
        club: input.clubName ?? "the club",
      });
      staff = participationToken("staff.cancelled-club", {
        name: input.cancelledByName ?? input.clubName ?? "the club",
      });
      break;
    case "done":
      status = participationToken("status.done");
      line = input.viewer?.absent
        ? participationToken("line.absent")
        : undefined;
      staff = participationToken("staff.mark-attendance");
      break;
    case "settled":
      status = participationToken("status.done");
      line = input.viewer?.absent
        ? participationToken("line.absent")
        : undefined;
      staff = participationToken("staff.done");
      break;
  }
  // "Show 1 place being booked rather than Full while a hold is open" (§8).
  if (
    (state === "needs-players" ||
      state === "minimum-reached" ||
      state === "open") &&
    held > 0 &&
    spotsLeft === 0
  ) {
    line = participationToken("line.place-being-booked", { n: held });
  }

  // Price by group size, in credits, for credit payers (or anyone browsing).
  // Card payers get no ladder line until `PARTICIPATION_POLICY.cardLadderCharged`
  // (checkout charges cards the fixed price today): promising money back to a
  // card would be untrue. `participationPriceLine` already speaks card.
  let price: ParticipationDisplay["price"];
  const method = input.payment?.method ?? "credit";
  const quantity = Math.max(1, input.viewer?.quantity ?? 1);
  if (rule && hasTiers && method === "credit") {
    const reserve = participationReservePerPlayer(rule.tiers, "credits");
    if (reserve !== undefined) {
      const decided = input.outcome !== undefined && input.outcome !== null;
      const sizeNow = decided
        ? Math.max(1, groupSize ?? booked)
        : Math.max(1, booked);
      const currentTier = priceTierForGroupSize(rule.tiers, sizeNow);
      const finalPerPlayer = decided
        ? perPlayerPrice(rule.tiers, sizeNow, "credits")
        : undefined;
      price = {
        unit: "credits",
        reservePerPlayer: reserve,
        nowPerPlayer: perPlayerPrice(rule.tiers, sizeNow, "credits") ?? reserve,
        maxCharge: (finalPerPlayer ?? reserve) * quantity,
        ...(finalPerPlayer !== undefined ? { finalPerPlayer } : {}),
        ladder: rule.tiers
          .filter((tier) => tier.creditsPerPlayer !== undefined)
          .map((tier, index, all) => ({
            minParticipants: tier.minParticipants,
            maxParticipants: tier.maxParticipants,
            creditsPerPlayer: tier.creditsPerPlayer!,
            current: tier === currentTier,
            label: participationToken("price.ladder-row", {
              min: tier.minParticipants,
              max: tier.maxParticipants,
              credits: tier.creditsPerPlayer,
              unit,
              last:
                index === all.length - 1 && tier.maxParticipants >= capacity
                  ? 1
                  : 0,
            }),
          })),
        line: decided
          ? participationToken("price.decided", {
              final: (finalPerPlayer ?? reserve) * quantity,
            })
          : participationPriceLine({
              tiers: rule.tiers,
              unit: "credits",
              capacity,
              groupSize: sizeNow,
              quantity,
              lock: lockLabel,
            }),
        currentRow: participationToken("price.ladder-now", { n: sizeNow }),
      };
    }
  }

  // Cancelling (decision 1: the lock is the free-cancellation deadline).
  const started = input.now >= input.startsAt;
  const cancelledState =
    state === "cancelled-low" || state === "cancelled-club";
  const freeDeadline = rule ? input.lockAt : input.freeCancelUntil;
  const free = freeDeadline ? input.now < freeDeadline : !started;
  const reserved = input.viewer?.reservedCredits ?? 0;
  const lateCharge =
    !free && rule
      ? lateCancellationCharge({
          tiers: rule.tiers,
          finalGroupSize: groupSize ?? booked,
          quantity,
          reserved,
        })
      : undefined;
  const freeUntil = freeDeadline
    ? formatParticipationTime({
        at: freeDeadline,
        now: input.now,
        timeZone: input.timeZone,
        viewerTimeZone: input.viewerTimeZone,
      })
    : undefined;
  const cancellation: ParticipationDisplay["cancellation"] = {
    allowed:
      !started && !cancelledState && state !== "done" && state !== "settled",
    free: free && !started,
    ...(freeUntil ? { freeUntil } : {}),
    ...(lateCharge !== undefined ? { lateCharge } : {}),
    line: started
      ? participationToken("cancel.closed")
      : free
        ? freeUntil
          ? participationToken("cancel.free", {
              lock: freeUntil.labelWithViewer ?? freeUntil.label,
            })
          : undefined
        : lateCharge !== undefined && lateCharge > 0
          ? participationToken("cancel.late", { final: lateCharge })
          : participationToken("cancel.late-nothing"),
  };

  const statusText = renderParticipationCopy(status);
  const a11y = participationToken("a11y.summary", {
    title: input.title ?? "Session",
    status: statusText,
    line: line ? renderParticipationCopy(line) : undefined,
    booked,
    capacity,
  });

  return {
    state,
    hasGroupRule: grouped,
    tone: toneFor(state),
    numbers: {
      booked,
      held,
      capacity,
      minimum,
      needed,
      spotsLeft,
      waiting,
      ...(groupSize !== undefined ? { groupSize } : {}),
    },
    ...(lock ? { lock } : {}),
    status,
    ...(line ? { line } : {}),
    staff,
    ...(price ? { price } : {}),
    cancellation,
    a11y,
  };
}

/** The display model rendered to English strings (fixtures, logs-free previews, tests). */
export function renderParticipationDisplay(display: ParticipationDisplay): {
  readonly status: string;
  readonly line?: string;
  readonly staff: string;
  readonly price?: string;
  readonly ladder: readonly string[];
  readonly cancellation?: string;
  readonly a11y: string;
} {
  return {
    status: renderParticipationCopy(display.status),
    ...(display.line ? { line: renderParticipationCopy(display.line) } : {}),
    staff: renderParticipationCopy(display.staff),
    ...(display.price?.line
      ? { price: renderParticipationCopy(display.price.line) }
      : {}),
    ladder:
      display.price?.ladder.map((row) => renderParticipationCopy(row.label)) ??
      [],
    ...(display.cancellation.line
      ? { cancellation: renderParticipationCopy(display.cancellation.line) }
      : {}),
    a11y: renderParticipationCopy(display.a11y),
  };
}
