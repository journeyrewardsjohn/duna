import { describe, expect, it } from "vitest";
import {
  admissionPassReady,
  checkoutRosterComplete,
  initialPurchaseKind,
  presentThenPollCheckout,
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

  it("presents a Wallet pass after a confirmed tournament registration", () => {
    expect(
      admissionPassReady({
        checkoutComplete: true,
        eventKind: "tournament",
        purchaseKind: "entry",
        registrationStatus: "confirmed",
      }),
    ).toBe(true);
  });

  it("presents Wallet only after admission tickets are issued", () => {
    expect(
      admissionPassReady({
        checkoutComplete: true,
        eventKind: "tournament",
        fulfillmentStatus: "pending-approval",
        purchaseKind: "ticket",
      }),
    ).toBe(false);
    expect(
      admissionPassReady({
        checkoutComplete: true,
        eventKind: "tournament",
        fulfillmentStatus: "confirmed",
        purchaseKind: "ticket",
      }),
    ).toBe(true);
  });

  it("does not offer tournament admission for unrelated bookings", () => {
    expect(
      admissionPassReady({
        checkoutComplete: true,
        eventKind: "pickup",
        purchaseKind: "entry",
        registrationStatus: "confirmed",
      }),
    ).toBe(false);
  });

  it("opens the native payment sheet before reading checkout status", async () => {
    const calls: string[] = [];
    let statusReads = 0;
    const result = await presentThenPollCheckout({
      present: async () => {
        calls.push("present");
        return "completed";
      },
      readStatus: async () => {
        calls.push("status");
        statusReads += 1;
        return { complete: statusReads > 1 };
      },
      isComplete: (status) => status.complete,
      maxPolls: 3,
      delayMs: () => 0,
      sleep: async () => {
        calls.push("wait");
      },
    });

    expect(result).toEqual({ cancelled: false, status: { complete: true } });
    expect(calls).toEqual(["present", "status", "wait", "status"]);
  });

  it("does not read checkout status when payment is cancelled", async () => {
    let statusRead = false;
    const result = await presentThenPollCheckout({
      present: async () => "cancelled",
      readStatus: async () => {
        statusRead = true;
        return { complete: false };
      },
      isComplete: (status) => status.complete,
      maxPolls: 3,
      delayMs: () => 0,
    });

    expect(result).toEqual({ cancelled: true });
    expect(statusRead).toBe(false);
  });
});
