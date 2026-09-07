import { describe, expect, it } from "vitest";
import {
  courtBookingMatchFormat,
  courtBookingMatchTitle,
} from "./database-repository";
import {
  resolveCourtParticipantForPickup,
  resolvePickupParticipantForCourtParticipant,
} from "./court-booking-roster-link";

describe("court booking match defaults", () => {
  it("names the match in the venue timezone without another setup step", () => {
    expect(
      courtBookingMatchTitle({
        startsAt: new Date("2026-09-06T01:30:00.000Z"),
        timeZone: "America/New_York",
        venueName: "The Strand",
      }),
    ).toBe("Saturday match at The Strand");
  });

  it("chooses a team format from the durable roster capacity", () => {
    expect(courtBookingMatchFormat(4)).toBe("2s");
    expect(courtBookingMatchFormat(6)).toBe("3s");
    expect(courtBookingMatchFormat(8)).toBe("4s");
    expect(courtBookingMatchFormat(12)).toBe("6s");
  });
});

describe("court booking match roster links", () => {
  const duplicateCourtGuests = [
    { id: "court-slot-a", personId: null, invitedName: "Alex Smith" },
    { id: "court-slot-b", personId: null, invitedName: "Alex Smith" },
  ] as const;

  it("uses the durable reservation place even when guest names are identical", () => {
    const resolution = resolveCourtParticipantForPickup({
      pickupParticipant: {
        courtBookingParticipantId: "court-slot-b",
        personId: "placeholder-b",
        displayName: "Alex Smith",
      },
      courtParticipants: duplicateCourtGuests,
    });

    expect(resolution).toEqual({
      kind: "matched",
      value: duplicateCourtGuests[1],
    });
  });

  it("refuses to guess between duplicate legacy guest names", () => {
    expect(
      resolveCourtParticipantForPickup({
        pickupParticipant: {
          courtBookingParticipantId: null,
          personId: "placeholder-a",
          displayName: "  ALEX   smith ",
        },
        courtParticipants: duplicateCourtGuests,
      }),
    ).toEqual({ kind: "ambiguous" });
  });

  it("does not fall back to a name when a durable link is invalid", () => {
    expect(
      resolveCourtParticipantForPickup({
        pickupParticipant: {
          courtBookingParticipantId: "missing-slot",
          personId: "placeholder-a",
          displayName: "Alex Smith",
        },
        courtParticipants: duplicateCourtGuests,
      }),
    ).toEqual({ kind: "missing" });
  });

  it("claims only an unlinked legacy placeholder during invitation acceptance", () => {
    const linkedPlaceholder = {
      courtBookingParticipantId: "court-slot-a",
      personId: "placeholder-a",
      displayName: "Alex Smith",
    };
    const availablePlaceholder = {
      courtBookingParticipantId: null,
      personId: "placeholder-b",
      displayName: "Alex Smith",
    };

    expect(
      resolvePickupParticipantForCourtParticipant({
        courtParticipant: duplicateCourtGuests[1],
        pickupParticipants: [linkedPlaceholder, availablePlaceholder],
      }),
    ).toBe(availablePlaceholder);
  });
});
