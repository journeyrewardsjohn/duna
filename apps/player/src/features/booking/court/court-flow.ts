/**
 * Book a court, one flow (M-P3; owner feedback 28 Nov, images 37 to 42): the
 * state machine. Pure; tested in `court-flow.test.ts`.
 *
 *   time ─(continue)─▶ players ─(continue)─▶ pay ─(pay)─▶ confirming ─▶ confirmed
 *    ▲  ◀────(back)────  │  ◀────(back)─────  │ ◀─(payment cancelled)─┘   │
 *    │                                         └◀─────(retry)───── failed ◀┘
 *
 * The rules the owner asked for:
 * - Nothing is asked twice. The venue, day, length, start time and court the
 *   person chose on the court-times screen arrive in `initialFlowState`; the
 *   flow opens on "Who's playing" and never shows a second time picker.
 * - Back keeps every choice: going back from paying to the roster, or from
 *   the roster to the time, changes the step and nothing else.
 * - Only a change that makes a choice impossible clears it: a new day or
 *   length clears the start time and court (they were for the old day); a
 *   new start time clears a court that is not open then. The roster, the way
 *   to pay and the policy acceptance survive.
 * - A person confirms every payment: `pay` is the only way into
 *   `confirming`, and only from the pay step with the policy accepted.
 */
import type { BookingParticipant } from "../../courts/court-types";

export type CourtFlowStep =
  "time" | "players" | "pay" | "confirming" | "confirmed" | "failed";

export interface CourtSelection {
  readonly venueId: string;
  /** YYYY-MM-DD in the venue's zone. */
  readonly date: string;
  readonly durationMinutes: number;
  /** "YYYY-MM-DDTHH:mm" in the venue's zone, as availability gives it. */
  readonly localStartsAt?: string;
  readonly courtId?: string;
}

/** What happened to the person's money when a booking did not finish. */
export type MoneyOutcome =
  /** Stopped before the payment sheet completed: nothing was charged. */
  | "not-charged"
  /** The payment went through; Duna is still confirming the court. */
  | "received-pending"
  /** The payment went through and was refunded (the order says so). */
  | "refunded"
  /** The payment went through but the court could not be held. */
  | "received-unresolved";

export interface CourtFlowFailure {
  readonly message: string;
  readonly money: MoneyOutcome;
  readonly reference?: string;
}

/** Steps of "Confirming reservation", tied to the checkout status. */
export type ConfirmingPhase = 0 | 1 | 2 | 3;

export interface CourtFlowState {
  readonly step: CourtFlowStep;
  readonly selection: CourtSelection;
  /** "host" creates a match others can see; "private" is just this group. */
  readonly intent: "private" | "host";
  /** Everyone but the booker (the booker is always first; see roster.ts). */
  readonly guests: readonly BookingParticipant[];
  readonly paymentMode: "full" | "split";
  readonly policyAccepted: boolean;
  /** The whole policy was scrolled to the end (when the venue requires it). */
  readonly policyRead: boolean;
  /** Completed confirming steps: payment received, court secured, match + invites. */
  readonly phase: ConfirmingPhase;
  /** One key per pay attempt (reused if the same attempt is retried). */
  readonly attempt: number;
  readonly failure?: CourtFlowFailure;
  readonly bookingId?: string;
}

export type CourtFlowEvent =
  | { readonly type: "set-date"; readonly date: string }
  | { readonly type: "set-duration"; readonly durationMinutes: number }
  | {
      readonly type: "choose-time";
      readonly localStartsAt: string;
      /** Courts open at that start; a chosen court that is not open is cleared. */
      readonly openCourtIds: readonly string[];
    }
  | { readonly type: "choose-court"; readonly courtId: string }
  | { readonly type: "continue" }
  | { readonly type: "back" }
  | { readonly type: "set-intent"; readonly intent: "private" | "host" }
  | {
      readonly type: "set-guests";
      readonly guests: readonly BookingParticipant[];
    }
  | { readonly type: "set-payment-mode"; readonly mode: "full" | "split" }
  | { readonly type: "accept-policy"; readonly read: boolean }
  | { readonly type: "decline-policy" }
  | { readonly type: "pay" }
  | { readonly type: "payment-cancelled" }
  | { readonly type: "progress"; readonly phase: ConfirmingPhase }
  | { readonly type: "confirmed"; readonly bookingId?: string }
  | { readonly type: "failed"; readonly failure: CourtFlowFailure }
  | { readonly type: "retry" };

export function initialFlowState(input: {
  readonly selection: CourtSelection;
  readonly intent?: "private" | "host";
}): CourtFlowState {
  const chosen = Boolean(
    input.selection.localStartsAt && input.selection.courtId,
  );
  return {
    // The time and court were chosen on the court-times screen: never ask again.
    step: chosen ? "players" : "time",
    selection: input.selection,
    intent: input.intent ?? "private",
    guests: [],
    paymentMode: "full",
    policyAccepted: false,
    policyRead: false,
    phase: 0,
    attempt: 0,
  };
}

/** Whether "Continue" can move on from this step. Pure. */
export function canContinue(
  state: CourtFlowState,
  input: {
    readonly policyRequired?: boolean;
    readonly requireFullScroll?: boolean;
  } = {},
): boolean {
  switch (state.step) {
    case "time":
      return Boolean(state.selection.localStartsAt && state.selection.courtId);
    case "players":
      return state.paymentMode === "full" || state.guests.length > 0;
    case "pay":
      return (
        canContinue({ ...state, step: "players" }) &&
        (!input.policyRequired ||
          (state.policyAccepted &&
            (!input.requireFullScroll || state.policyRead)))
      );
    default:
      return false;
  }
}

function withoutFailure(state: CourtFlowState): CourtFlowState {
  const next = { ...state };
  delete (next as { failure?: CourtFlowFailure }).failure;
  return next;
}

const BACK: Partial<Record<CourtFlowStep, CourtFlowStep>> = {
  players: "time",
  pay: "players",
};

export function courtFlowReducer(
  state: CourtFlowState,
  event: CourtFlowEvent,
): CourtFlowState {
  const busy = state.step === "confirming";
  switch (event.type) {
    case "set-date":
      if (busy || event.date === state.selection.date) return state;
      return {
        ...state,
        selection: {
          venueId: state.selection.venueId,
          date: event.date,
          durationMinutes: state.selection.durationMinutes,
        },
        policyAccepted: false,
        policyRead: false,
      };
    case "set-duration":
      if (busy || event.durationMinutes === state.selection.durationMinutes)
        return state;
      return {
        ...state,
        selection: {
          venueId: state.selection.venueId,
          date: state.selection.date,
          durationMinutes: event.durationMinutes,
        },
        policyAccepted: false,
        policyRead: false,
      };
    case "choose-time": {
      if (busy) return state;
      const keepCourt =
        state.selection.courtId !== undefined &&
        event.openCourtIds.includes(state.selection.courtId);
      const onlyCourt =
        event.openCourtIds.length === 1 ? event.openCourtIds[0] : undefined;
      const courtId = keepCourt ? state.selection.courtId : onlyCourt;
      return {
        ...state,
        selection: {
          venueId: state.selection.venueId,
          date: state.selection.date,
          durationMinutes: state.selection.durationMinutes,
          localStartsAt: event.localStartsAt,
          ...(courtId ? { courtId } : {}),
        },
      };
    }
    case "choose-court":
      if (busy) return state;
      if (state.selection.courtId === event.courtId) return state;
      // A different court can carry a different cancellation policy.
      return {
        ...state,
        selection: { ...state.selection, courtId: event.courtId },
        policyAccepted: false,
        policyRead: false,
      };
    case "continue":
      if (state.step === "time" && canContinue(state))
        return { ...state, step: "players" };
      if (state.step === "players" && canContinue(state))
        return { ...state, step: "pay" };
      return state;
    case "back": {
      const previous = BACK[state.step];
      return previous ? { ...state, step: previous } : state;
    }
    case "set-intent":
      if (busy) return state;
      return { ...state, intent: event.intent };
    case "set-guests":
      if (busy) return state;
      return {
        ...state,
        guests: event.guests,
        // Splitting needs someone to split with.
        paymentMode: event.guests.length === 0 ? "full" : state.paymentMode,
      };
    case "set-payment-mode":
      if (busy) return state;
      if (event.mode === "split" && state.guests.length === 0) return state;
      return { ...state, paymentMode: event.mode };
    case "accept-policy":
      return {
        ...state,
        policyAccepted: true,
        policyRead: state.policyRead || event.read,
      };
    case "decline-policy":
      return { ...state, policyAccepted: false };
    case "pay":
      // Single flight, and only from the pay step.
      if (state.step !== "pay") return state;
      return withoutFailure({
        ...state,
        step: "confirming",
        phase: 0,
        attempt: state.attempt + 1,
      });
    case "payment-cancelled":
      // Nothing was charged: back to paying with every choice intact.
      if (!busy) return state;
      return { ...state, step: "pay", phase: 0 };
    case "progress":
      if (!busy) return state;
      return {
        ...state,
        phase: Math.max(state.phase, event.phase) as ConfirmingPhase,
      };
    case "confirmed":
      if (!busy) return state;
      return {
        ...state,
        step: "confirmed",
        phase: 3,
        ...(event.bookingId ? { bookingId: event.bookingId } : {}),
      };
    case "failed":
      if (!busy) return state;
      return { ...state, step: "failed", failure: event.failure };
    case "retry":
      if (state.step !== "failed") return state;
      return { ...state, step: "pay", phase: 0 };
  }
}

/** The status fields the confirming steps read (courtCheckoutStatus). */
export interface CheckoutStatusLike {
  readonly bookingStatus: string;
  readonly orderStatus?: string;
  readonly complete: boolean;
  readonly sharePaid: boolean;
  readonly awaitingParticipants: boolean;
  readonly match?: { readonly id: string };
}

/**
 * How many of the three steps are done for this status: payment received,
 * court secured, match and invitations. A private booking has no match, so
 * its third step is done when the court is (invitations go out with it).
 * Pure.
 */
export function confirmingPhase(
  status: CheckoutStatusLike,
  intent: "private" | "host",
): ConfirmingPhase {
  if (!status.sharePaid) return 0;
  const secured =
    status.complete ||
    status.awaitingParticipants ||
    status.bookingStatus === "confirmed";
  if (!secured) return 1;
  if (intent === "host" && !status.match) return 2;
  return 3;
}

/** The checkout has settled (done, or definitely not happening). Pure. */
export function checkoutSettled(
  status: CheckoutStatusLike,
  intent: "private" | "host",
): boolean {
  if (
    ["cancelled", "expired", "refunded"].includes(status.bookingStatus) ||
    ["failed", "cancelled", "refunded"].includes(status.orderStatus ?? "")
  )
    return true;
  return confirmingPhase(status, intent) === 3;
}

/** What happened to the money once polling stopped without success. Pure. */
export function moneyOutcome(
  status: CheckoutStatusLike | undefined,
): MoneyOutcome {
  if (!status) return "received-pending";
  if (
    status.orderStatus === "refunded" ||
    status.orderStatus === "partially-refunded"
  )
    return "refunded";
  if (status.orderStatus === "failed" || status.orderStatus === "cancelled")
    return status.sharePaid ? "received-unresolved" : "not-charged";
  if (["cancelled", "expired", "refunded"].includes(status.bookingStatus))
    return status.sharePaid ? "received-unresolved" : "not-charged";
  return status.sharePaid ? "received-pending" : "not-charged";
}

/** The plain words for each money outcome (never a promise the backend did not make). */
export const MONEY_WORDS: Readonly<Record<MoneyOutcome, string>> = {
  "not-charged": "Nothing was charged.",
  "received-pending":
    "Your payment went through. Duna is still confirming your court and will put it in Plans; you won't be charged twice.",
  refunded: "Your payment was refunded to the card you used.",
  "received-unresolved":
    "Your payment went through but the court couldn't be held. Contact the club or Duna support with the reference below so it can be returned.",
};
