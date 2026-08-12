import { describe, expect, it } from "vitest";
import {
  checkoutRosterComplete,
  initialPurchaseKind,
} from "./event-checkout-state";

describe("event checkout state", () => {
  it("never applies a playing roster requirement to spectator tickets", () => {
    expect(
      checkoutRosterComplete({
        eventKind: "tournament",
        purchaseKind: "ticket",
        selectedTeamSize: 2,
        teammateCount: 0,
      }),
    ).toBe(true);
  });

  it("keeps team entries blocked until the team is complete", () => {
    expect(
      checkoutRosterComplete({
        eventKind: "tournament",
        purchaseKind: "entry",
        selectedTeamSize: 2,
        teammateCount: 0,
      }),
    ).toBe(false);
    expect(
      checkoutRosterComplete({
        eventKind: "tournament",
        purchaseKind: "entry",
        selectedTeamSize: 2,
        teammateCount: 1,
      }),
    ).toBe(true);
  });

  it("opens a ticket-only event on the ticket flow", () => {
    expect(initialPurchaseKind({ hasDivisions: false, hasTickets: true })).toBe(
      "ticket",
    );
  });
});
