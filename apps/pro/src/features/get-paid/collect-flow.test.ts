import { describe, expect, it } from "vitest";
import {
  amountEditable,
  collectReducer,
  initialCollect,
  primaryLabel,
  ready,
  tenderOptions,
  type CollectAction,
  type CollectItem,
  type CollectState,
} from "./collect-flow";

const membership: CollectItem = {
  key: "catalog-item:m1",
  type: "catalog-item",
  id: "m1",
  label: "Beach Elite Academy Membership",
  suggestedAmountMinor: 5_000,
};
const clinic: CollectItem = {
  key: "session:s1",
  type: "session",
  id: "s1",
  label: "Sunset clinic",
  suggestedAmountMinor: 3_000,
  creditAmount: 2,
};
const custom: CollectItem = {
  key: "custom",
  type: "custom",
  label: "Lost ball",
};

const run = (
  actions: readonly CollectAction[],
  from: CollectState = initialCollect(),
) => actions.reduce(collectReducer, from);

describe("collect flow", () => {
  it("keeps every choice on the way through (the summary card reads them)", () => {
    const state = run([
      { type: "choose-payer", payerId: "mara" },
      { type: "choose-item", item: membership },
      { type: "confirm-amount" },
      { type: "choose-tender", tender: "card-present" },
    ]);
    expect(state).toMatchObject({
      step: "how",
      payerId: "mara",
      item: membership,
      amountMinor: 5_000,
      tender: "card-present",
    });
    expect(ready(state)).toBe(true);
    expect(primaryLabel(state, "USD")).toBe("Collect $50.00");
  });

  it("Back keeps the choices, and going forward again needs no re-entry", () => {
    const forward = run([
      { type: "choose-payer", payerId: "mara" },
      { type: "choose-item", item: membership },
      { type: "set-amount", amountMinor: 4_500 },
      { type: "confirm-amount" },
      { type: "choose-tender", tender: "card-present" },
    ]);
    const back = run(
      [{ type: "back" }, { type: "back" }, { type: "back" }],
      forward,
    );
    expect(back.step).toBe("who");
    expect(back).toMatchObject({
      payerId: "mara",
      item: membership,
      amountMinor: 4_500,
      tender: "card-present",
    });
    const again = run(
      [
        { type: "choose-payer", payerId: "mara" },
        { type: "choose-item", item: membership },
      ],
      back,
    );
    // Same payer and item: the typed amount and the tender stay.
    expect(again).toMatchObject({
      step: "amount",
      amountMinor: 4_500,
      tender: "card-present",
    });
  });

  it("an item prefills its price; a different item replaces it", () => {
    const state = run([
      { type: "choose-payer", payerId: "mara" },
      { type: "choose-item", item: membership },
      { type: "set-amount", amountMinor: 4_000 },
      { type: "back" },
      { type: "choose-item", item: clinic },
    ]);
    expect(state.amountMinor).toBe(3_000);
    expect(state.amountEdited).toBe(false);
    const customState = run(
      [{ type: "back" }, { type: "choose-item", item: custom }],
      state,
    );
    // A custom item has no price: the last amount stays for the person to change.
    expect(customState.amountMinor).toBeUndefined();
  });

  it("a different payer clears the tender; the summary card can jump back but not ahead", () => {
    const state = run([
      { type: "choose-payer", payerId: "mara" },
      { type: "choose-item", item: membership },
      { type: "confirm-amount" },
      { type: "choose-tender", tender: "wallet-cash" },
      { type: "go", step: "who" },
      { type: "choose-payer", payerId: "theo" },
    ]);
    expect(state.tender).toBeUndefined();
    expect(state.item).toEqual(membership);
    expect(run([{ type: "go", step: "how" }], initialCollect()).step).toBe(
      "who",
    );
  });

  it("opening from a person's page starts at what-for with them chosen", () => {
    expect(initialCollect("mara")).toEqual({
      step: "what",
      payerId: "mara",
      amountEdited: false,
    });
  });

  it("collect only starts when everything is chosen; a decline can retry or change payment", () => {
    const noTender = run([
      { type: "choose-payer", payerId: "mara" },
      { type: "choose-item", item: membership },
      { type: "confirm-amount" },
      { type: "start" },
    ]);
    expect(noTender.step).toBe("how");
    const collecting = run(
      [{ type: "choose-tender", tender: "card-present" }, { type: "start" }],
      noTender,
    );
    expect(collecting.step).toBe("collecting");
    const declined = run([{ type: "finish", result: "declined" }], collecting);
    expect(declined).toMatchObject({
      step: "result",
      result: "declined",
      payerId: "mara",
    });
    expect(run([{ type: "change-payment" }], declined)).toMatchObject({
      step: "how",
      tender: "card-present",
      amountMinor: 5_000,
    });
    expect(run([{ type: "retry" }], declined).step).toBe("collecting");
    expect(run([{ type: "reset" }], declined)).toEqual(initialCollect());
  });

  it("zero is not an amount", () => {
    const state = run([
      { type: "choose-payer", payerId: "mara" },
      { type: "choose-item", item: custom },
      { type: "set-amount", amountMinor: 0 },
      { type: "confirm-amount" },
    ]);
    expect(state.step).toBe("amount");
  });

  it("the item's price is editable only with the permission; custom always", () => {
    expect(amountEditable(membership, false)).toBe(false);
    expect(amountEditable(membership, true)).toBe(true);
    expect(amountEditable(custom, false)).toBe(true);
  });
});

describe("how they can pay, and why not", () => {
  const payer = {
    personId: "mara",
    displayName: "Mara Lewis",
    creditBalance: 1,
    cashWalletEnabled: false,
    cashAvailableMinor: 0,
  };
  it("says why each tender is or isn't available", () => {
    const options = tenderOptions({
      terminal: {
        ready: false,
        reason: "Add your club's address in Duna HQ to use Tap to Pay.",
      },
      payer,
      item: clinic,
      amountMinor: 3_000,
      currency: "USD",
    });
    expect(options.map((o) => [o.tender, o.available, o.reason])).toEqual([
      [
        "card-present",
        false,
        "Add your club's address in Duna HQ to use Tap to Pay.",
      ],
      ["organization-credit", false, "Needs 2 credits; Mara has 1"],
      ["wallet-cash", false, "Mara has no cash wallet at your club"],
    ]);
    const rich = tenderOptions({
      terminal: { ready: true },
      payer: {
        ...payer,
        creditBalance: 5,
        cashWalletEnabled: true,
        cashAvailableMinor: 8_000,
      },
      item: clinic,
      amountMinor: 3_000,
      currency: "USD",
    });
    expect(rich.every((o) => o.available)).toBe(true);
    expect(rich[1]!.reason).toBe("Uses 2 credits of Mara's 5");
    expect(rich[2]!.reason).toBe("$80.00 in Mara's wallet");
  });
});
