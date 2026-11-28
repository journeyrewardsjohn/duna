/**
 * Collect a payment as one flow that keeps its context (M-R4, owner's
 * point 11): who → what for → how much → how → collect → result. A pure
 * reducer (unit-tested in `collect-flow.test.ts`): every choice stays in
 * state, Back never forgets one, and the summary card reads the same state
 * at every step. Money moves only through `operator.startPaymentCollection`
 * and the Tap to Pay SDK, from the screen, after the person presses Collect.
 */
import { formatCredits, formatMoney } from "../../shared/money-format";

export type CollectStep =
  "who" | "what" | "amount" | "how" | "collecting" | "result";
export const STEPS: readonly CollectStep[] = ["who", "what", "amount", "how"];

export type Tender = "card-present" | "organization-credit" | "wallet-cash";
export type CollectResult = "approved" | "declined" | "error";

export interface CollectItem {
  /** `session:<id>`, `catalog-item:<id>` or `custom`. */
  readonly key: string;
  readonly type: "session" | "catalog-item" | "custom";
  readonly id?: string;
  readonly label: string;
  readonly detail?: string;
  readonly suggestedAmountMinor?: number;
  readonly creditAmount?: number;
}

export interface CollectState {
  readonly step: CollectStep;
  readonly payerId?: string;
  readonly item?: CollectItem;
  readonly amountMinor?: number;
  /** The person typed an amount (an item's price no longer overwrites it). */
  readonly amountEdited: boolean;
  readonly tender?: Tender;
  readonly result?: CollectResult;
}

export type CollectAction =
  | { readonly type: "choose-payer"; readonly payerId: string }
  | { readonly type: "choose-item"; readonly item: CollectItem }
  | { readonly type: "set-amount"; readonly amountMinor: number | null }
  | { readonly type: "confirm-amount" }
  | { readonly type: "choose-tender"; readonly tender: Tender }
  | { readonly type: "back" }
  | { readonly type: "go"; readonly step: CollectStep }
  | { readonly type: "start" }
  | { readonly type: "finish"; readonly result: CollectResult }
  | { readonly type: "retry" }
  | { readonly type: "change-payment" }
  | { readonly type: "reset" };

export function initialCollect(payerId?: string): CollectState {
  return payerId
    ? { step: "what", payerId, amountEdited: false }
    : { step: "who", amountEdited: false };
}

export function collectReducer(
  state: CollectState,
  action: CollectAction,
): CollectState {
  switch (action.type) {
    case "choose-payer":
      return {
        ...state,
        payerId: action.payerId,
        // A different payer cannot keep a tender chosen for the last one.
        ...(state.payerId !== action.payerId ? { tender: undefined } : {}),
        step: "what",
      };
    case "choose-item": {
      const same = state.item?.key === action.item.key;
      const price = action.item.suggestedAmountMinor;
      return {
        ...state,
        item: action.item,
        amountMinor:
          same && state.amountEdited
            ? state.amountMinor
            : (price ?? (same ? state.amountMinor : undefined)),
        amountEdited: same ? state.amountEdited : false,
        tender: same ? state.tender : undefined,
        step: "amount",
      };
    }
    case "set-amount":
      return {
        ...state,
        amountMinor: action.amountMinor ?? undefined,
        amountEdited: true,
      };
    case "confirm-amount":
      return state.amountMinor && state.amountMinor > 0
        ? { ...state, step: "how" }
        : state;
    case "choose-tender":
      return { ...state, tender: action.tender };
    case "back": {
      const index = STEPS.indexOf(state.step);
      if (index <= 0) return state;
      return { ...state, step: STEPS[index - 1]! };
    }
    case "go": {
      // Only back to a step already passed (tapping the summary card).
      const target = STEPS.indexOf(action.step);
      const current = STEPS.indexOf(state.step);
      if (target < 0 || current < 0 || target > current) return state;
      return { ...state, step: action.step };
    }
    case "start":
      return state.step === "how" && state.tender && ready(state)
        ? { ...state, step: "collecting", result: undefined }
        : state;
    case "finish":
      return { ...state, step: "result", result: action.result };
    case "retry":
      return { ...state, step: "collecting", result: undefined };
    case "change-payment":
      return { ...state, step: "how", result: undefined };
    case "reset":
      return initialCollect();
  }
}

/** Everything needed to collect is chosen. */
export function ready(state: CollectState): boolean {
  return Boolean(
    state.payerId && state.item && state.amountMinor && state.amountMinor > 0,
  );
}

/** Whether the amount may be changed from the item's price. */
export function amountEditable(
  item: CollectItem | undefined,
  canEditPrice: boolean,
): boolean {
  if (
    !item ||
    item.type === "custom" ||
    item.suggestedAmountMinor === undefined
  )
    return true;
  return canEditPrice;
}

export interface PayerInput {
  readonly personId: string;
  readonly displayName: string;
  readonly creditBalance: number;
  readonly cashWalletEnabled: boolean;
  readonly cashAvailableMinor: number;
  readonly cashCurrency?: string;
}

export interface TenderOption {
  readonly tender: Tender;
  readonly title: string;
  readonly available: boolean;
  /** Why it is or isn't available, in one line. */
  readonly reason: string;
}

export function tenderOptions(input: {
  readonly terminal: { readonly ready: boolean; readonly reason?: string };
  readonly payer?: PayerInput;
  readonly item?: CollectItem;
  readonly amountMinor?: number;
  readonly currency: string;
}): readonly TenderOption[] {
  const first = input.payer?.displayName.split(/\s+/)[0] ?? "This player";
  const amount = input.amountMinor ?? 0;
  const credits = input.item?.creditAmount;
  const balance = input.payer?.creditBalance ?? 0;
  const walletCurrency = input.payer?.cashCurrency ?? input.currency;
  const wallet = input.payer?.cashAvailableMinor ?? 0;
  return [
    {
      tender: "card-present",
      title: "Tap to Pay",
      available: input.terminal.ready,
      reason: input.terminal.ready
        ? "A contactless card or phone, held to this iPhone"
        : (input.terminal.reason ??
          "Tap to Pay isn't set up for your club yet"),
    },
    {
      tender: "organization-credit",
      title: "Club credits",
      available: Boolean(credits && balance >= credits),
      reason: !credits
        ? "Choose an item with a credit price to pay with credits"
        : balance >= credits
          ? `Uses ${formatCredits(credits)} of ${first}'s ${balance}`
          : `Needs ${formatCredits(credits)}; ${first} has ${balance}`,
    },
    {
      tender: "wallet-cash",
      title: "Cash wallet",
      available: Boolean(
        input.payer?.cashWalletEnabled && wallet >= amount && amount > 0,
      ),
      reason: !input.payer?.cashWalletEnabled
        ? `${first} has no cash wallet at your club`
        : wallet >= amount
          ? `${formatMoney(wallet, walletCurrency)} in ${first}'s wallet`
          : `${formatMoney(wallet, walletCurrency)} in the wallet; this is ${formatMoney(amount, input.currency)}`,
    },
  ];
}

/** The verb on the primary button at each step. */
export function primaryLabel(state: CollectState, currency: string): string {
  switch (state.step) {
    case "who":
    case "what":
      return "Continue";
    case "amount":
      return "Continue";
    case "how":
      return state.tender === "organization-credit"
        ? `Take ${formatCredits(state.item?.creditAmount ?? 0)}`
        : state.tender === "wallet-cash"
          ? `Take ${formatMoney(state.amountMinor ?? 0, currency)} from wallet`
          : `Collect ${formatMoney(state.amountMinor ?? 0, currency)}`;
    default:
      return "Collect";
  }
}

/** Step names for the progress line and VoiceOver. */
export const STEP_TITLES: Readonly<Record<CollectStep, string>> = {
  who: "Who is paying?",
  what: "What is it for?",
  amount: "How much?",
  how: "How are they paying?",
  collecting: "Collecting",
  result: "Done",
};
