import { describe, expect, it } from "vitest";
import {
  canPayForEveryone,
  unpaidAdditionalPlayers,
  type BookingPaymentRosterMember,
} from "./booking-payment-state";

const captain: BookingPaymentRosterMember = {
  personId: "captain",
  displayName: "Captain",
  status: "captain",
  paid: false,
};

describe("booking balance payment actions", () => {
  it("never offers a team payment for a one-player division", () => {
    expect(canPayForEveryone({ expectedTeamSize: 1, roster: [captain] })).toBe(
      false,
    );
    expect(unpaidAdditionalPlayers([captain])).toEqual([]);
  });

  it("offers a team payment only when another unpaid player is covered", () => {
    const teammate: BookingPaymentRosterMember = {
      personId: "teammate",
      displayName: "Teammate",
      status: "selected",
      paid: false,
    };
    expect(
      canPayForEveryone({
        expectedTeamSize: 2,
        roster: [captain, teammate],
      }),
    ).toBe(true);
    expect(unpaidAdditionalPlayers([captain, teammate])).toEqual([
      { person: { id: "teammate", displayName: "Teammate" } },
    ]);
  });

  it("hides the team payment when only the captain remains unpaid", () => {
    expect(
      canPayForEveryone({
        expectedTeamSize: 2,
        roster: [captain, { ...captain, personId: "paid", paid: true }],
      }),
    ).toBe(false);
  });
});
