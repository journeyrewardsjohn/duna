import { describe, expect, it } from "vitest";
import {
  eventDivisionCompetitionLabel,
  eventDivisionEntryLabel,
  eventDivisionFilledCount,
  eventDivisionFilledPercent,
  eventDivisionSeedingLabel,
  eventDivisionTeamSize,
} from "./event-division-presentation";
import type { EventDivisionSummary } from "./types";

const kobDivision: EventDivisionSummary = {
  id: "kob",
  name: "KOB Invites Only",
  discipline: "beach-2s",
  ratingBasis: "sand rating",
  price: { amountMinor: 2_000, currency: "USD" },
  teamPrice: { amountMinor: 2_000, currency: "USD" },
  playerPrice: { amountMinor: 2_000, currency: "USD" },
  spotsRemaining: 8,
  capacity: 8,
  teamFormat: "solo",
  teamSize: 1,
  tournamentFormat: "kob-qob",
  seeding: "sand-rating-best-8",
  kobConfig: {
    entryMode: "individual",
    balanceByRating: true,
    avoidRepeatOpponents: true,
    stages: [],
  },
};

describe("event division presentation", () => {
  it("explains individual KOB entry without exposing configuration slugs", () => {
    expect(eventDivisionTeamSize(kobDivision)).toBe(1);
    expect(eventDivisionEntryLabel(kobDivision)).toBe("Individual signup");
    expect(eventDivisionCompetitionLabel(kobDivision)).toBe(
      "King / Queen of the Beach",
    );
    expect(eventDivisionSeedingLabel(kobDivision)).toBe(
      "Best 8 Sand Rating results",
    );
  });

  it("derives truthful capacity progress", () => {
    expect(eventDivisionFilledCount(kobDivision)).toBe(0);
    expect(eventDivisionFilledPercent(kobDivision)).toBe(0);
    expect(
      eventDivisionFilledPercent({
        ...kobDivision,
        spotsRemaining: 2,
      }),
    ).toBe(75);
  });
});
