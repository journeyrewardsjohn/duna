/**
 * Booking a group session (M-P1, PART-11): the sheet's state machine and
 * the decisions it shows. Pure; tested in `booking-machine.test.ts`.
 *
 *   choose ─(review)─▶ confirm ─(submit)─▶ submitting ─▶ success
 *     ▲                  │                     │  └──▶ paying ─▶ success
 *     └──(edit)──────────┘                     └──▶ failed ─(retry)─▶ confirm
 *
 * A person confirms every payment (interaction kit, tier 2 "strong"): the
 * confirm step restates who, how much, the most they can be charged and
 * the cancellation deadline, and the button is the verb with the amount.
 * Waitlist and cancel follow the same shape with their own steps.
 */

export type PaymentMethod = "credit" | "card" | "cash";

export interface Participant {
  readonly personId: string | null;
  readonly name: string;
  /** A child the person is the verified guardian of. */
  readonly dependent: boolean;
}

export interface BookingDraft {
  readonly participant: Participant;
  readonly method: PaymentMethod;
}

export type BookingStep =
  | { readonly kind: "choose" }
  | { readonly kind: "confirm" }
  | { readonly kind: "submitting" }
  | { readonly kind: "paying" }
  | {
      readonly kind: "success";
      readonly outcome: "booked" | "reserved" | "waitlisted";
      readonly position?: number;
    }
  | {
      readonly kind: "failed";
      readonly message: string;
      readonly reference?: string;
    }
  | { readonly kind: "cancel-confirm" }
  | { readonly kind: "cancelled" };

export interface BookingState {
  readonly draft: BookingDraft;
  readonly step: BookingStep;
  /** One key per confirmed attempt; reused when the same attempt is retried. */
  readonly attempt: number;
  /** Late cancellation needs "I understand" before the button works. */
  readonly lateAcknowledged: boolean;
}

export type BookingEvent =
  | { readonly type: "choose-participant"; readonly participant: Participant }
  | { readonly type: "choose-method"; readonly method: PaymentMethod }
  | { readonly type: "review" }
  | { readonly type: "edit" }
  | { readonly type: "submit" }
  | { readonly type: "payment-sheet" }
  | {
      readonly type: "succeeded";
      readonly outcome: "booked" | "reserved" | "waitlisted";
      readonly position?: number;
    }
  | { readonly type: "payment-cancelled" }
  | {
      readonly type: "failed";
      readonly message: string;
      readonly reference?: string;
    }
  | { readonly type: "retry" }
  | { readonly type: "start-cancel" }
  | { readonly type: "acknowledge-late"; readonly value: boolean }
  | { readonly type: "cancelled" }
  | { readonly type: "reset"; readonly draft: BookingDraft };

export function initialBookingState(draft: BookingDraft): BookingState {
  return {
    draft,
    step: { kind: "choose" },
    attempt: 0,
    lateAcknowledged: false,
  };
}

function busy(step: BookingStep): boolean {
  return step.kind === "submitting" || step.kind === "paying";
}

export function bookingReducer(
  state: BookingState,
  event: BookingEvent,
): BookingState {
  switch (event.type) {
    case "choose-participant":
      if (state.step.kind !== "choose") return state;
      return {
        ...state,
        draft: { ...state.draft, participant: event.participant },
      };
    case "choose-method":
      if (state.step.kind !== "choose") return state;
      return { ...state, draft: { ...state.draft, method: event.method } };
    case "review":
      if (state.step.kind !== "choose") return state;
      return { ...state, step: { kind: "confirm" } };
    case "edit":
      if (state.step.kind !== "confirm" && state.step.kind !== "failed")
        return state;
      return { ...state, step: { kind: "choose" } };
    case "submit":
      // Single flight: a second tap while submitting does nothing.
      if (state.step.kind !== "confirm" && state.step.kind !== "cancel-confirm")
        return state;
      return {
        ...state,
        step: { kind: "submitting" },
        attempt: state.attempt + 1,
      };
    case "payment-sheet":
      if (state.step.kind !== "submitting") return state;
      return { ...state, step: { kind: "paying" } };
    case "payment-cancelled":
      if (state.step.kind !== "paying") return state;
      // Nothing was charged; back to the confirmation.
      return { ...state, step: { kind: "confirm" } };
    case "succeeded":
      if (!busy(state.step)) return state;
      return {
        ...state,
        step: {
          kind: "success",
          outcome: event.outcome,
          ...(event.position !== undefined ? { position: event.position } : {}),
        },
      };
    case "failed":
      if (!busy(state.step)) return state;
      return {
        ...state,
        step: {
          kind: "failed",
          message: event.message,
          ...(event.reference ? { reference: event.reference } : {}),
        },
      };
    case "retry":
      if (state.step.kind !== "failed") return state;
      return { ...state, step: { kind: "confirm" } };
    case "start-cancel":
      if (busy(state.step)) return state;
      return {
        ...state,
        step: { kind: "cancel-confirm" },
        lateAcknowledged: false,
      };
    case "acknowledge-late":
      if (state.step.kind !== "cancel-confirm") return state;
      return { ...state, lateAcknowledged: event.value };
    case "cancelled":
      if (!busy(state.step)) return state;
      return { ...state, step: { kind: "cancelled" } };
    case "reset":
      return initialBookingState(event.draft);
  }
}

/** What the detail screen's main button does for this session and person. */
export type PrimaryAction =
  | "book"
  | "join-waitlist"
  | "on-waitlist"
  | "already-booked"
  | "closed"
  | "preview";

export function primaryAction(input: {
  readonly displayState: string;
  readonly alreadyBooked: boolean;
  readonly waitlisted: boolean;
  /** The session's rule allows a waitlist (unknown: offer it when full). */
  readonly waitlist: boolean | undefined;
  readonly demo: boolean;
}): PrimaryAction {
  if (input.demo) return "preview";
  if (input.alreadyBooked) return "already-booked";
  if (input.waitlisted) return "on-waitlist";
  switch (input.displayState) {
    case "full":
      return input.waitlist === false ? "closed" : "join-waitlist";
    case "cancelled-low":
    case "cancelled-club":
    case "done":
    case "settled":
      return "closed";
    default:
      return "book";
  }
}

/** The payment methods to offer, in order; dependents pay with credits only. */
export function methodsFor(input: {
  readonly prices: readonly { readonly kind: PaymentMethod }[];
  readonly dependent: boolean;
}): readonly PaymentMethod[] {
  const kinds = new Set(input.prices.map((price) => price.kind));
  const order: readonly PaymentMethod[] = input.dependent
    ? ["credit"]
    : ["credit", "card", "cash"];
  return order.filter((kind) => kinds.has(kind));
}

/** The words on the confirm button: the verb, with the amount when there is one. */
export function confirmVerb(input: {
  readonly method: PaymentMethod;
  readonly credits?: number;
  readonly amount?: string;
}): string {
  if (input.method === "cash") return "Reserve and pay at the club";
  if (input.method === "credit" && input.credits !== undefined)
    return `Book for ${input.credits} credit${input.credits === 1 ? "" : "s"}`;
  if (input.method === "card" && input.amount) return `Pay ${input.amount}`;
  return "Book";
}

/** Whether the cancel button may be pressed now. */
export function canConfirmCancel(input: {
  readonly free: boolean;
  readonly lateAcknowledged: boolean;
}): boolean {
  return input.free || input.lateAcknowledged;
}
