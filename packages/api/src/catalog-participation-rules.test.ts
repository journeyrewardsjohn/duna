import { describe, expect, it } from "vitest";
import {
  bookingParticipationSnapshot,
  catalogItemParticipationRules,
  normalizeParticipationConfiguration,
  occurrenceParticipationState,
  readBookingSnapshot,
} from "./catalog-participation-rules";

const schedule = {
  mode: "recurring",
  timezone: "America/Los_Angeles",
  startsOn: "2026-12-01",
  endsOn: "2027-03-01",
  weekly: [{ weekday: 2, startsAt: "17:00" }],
  oneOff: [],
  blackoutDates: [],
};
const tiers = [
  { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
  { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
  { minParticipants: 7, creditsPerPlayer: 1 },
];

describe("participation configuration on catalog items", () => {
  it("leaves a capacity-only offer untouched", () => {
    const configuration = { capacity: 12, sessionSchedule: schedule };
    expect(
      normalizeParticipationConfiguration({
        type: "service",
        configuration,
        allowCredits: true,
        creditCost: 2,
      }),
    ).toBe(configuration);
    expect(catalogItemParticipationRules(configuration, 12)).toBeUndefined();
  });

  it("normalizes tiers against the capacity without storing it twice", () => {
    const normalized = normalizeParticipationConfiguration({
      type: "service",
      configuration: {
        capacity: 12,
        sessionSchedule: schedule,
        participation: { creditTiers: tiers },
      },
      allowCredits: true,
      creditCost: 3,
    });
    expect(normalized.participation).toEqual({
      minParticipants: 1,
      minimumPolicy: "run",
      cutoffMinutesBeforeStart: 1_440,
      settlementBasis: "cutoff",
      creditTiers: [
        { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
        { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
        { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
      ],
    });
  });

  it("rejects invalid tiers with the operator-facing reason", () => {
    expect(() =>
      normalizeParticipationConfiguration({
        type: "service",
        configuration: {
          capacity: 12,
          sessionSchedule: schedule,
          participation: {
            creditTiers: [
              { minParticipants: 1, maxParticipants: 4, creditsPerPlayer: 3 },
              { minParticipants: 6, creditsPerPlayer: 1 },
            ],
          },
        },
        allowCredits: true,
        creditCost: 3,
      }),
    ).toThrow("leaves a gap");
  });

  it("requires the credit price to be the highest tier", () => {
    expect(() =>
      normalizeParticipationConfiguration({
        type: "service",
        configuration: {
          capacity: 12,
          sessionSchedule: schedule,
          participation: { creditTiers: tiers },
        },
        allowCredits: true,
        creditCost: 2,
      }),
    ).toThrow("Set the credit price to 3 credits");
  });

  it("requires preset session dates for rules that act on a headcount", () => {
    expect(() =>
      normalizeParticipationConfiguration({
        type: "service",
        configuration: {
          capacity: 12,
          sessionSchedule: { ...schedule, mode: "flexible" },
          participation: { minParticipants: 4, minimumPolicy: "cancel" },
        },
        allowCredits: false,
      }),
    ).toThrow("need preset session dates");
  });

  it("only applies to services", () => {
    expect(() =>
      normalizeParticipationConfiguration({
        type: "good",
        configuration: { participation: { minParticipants: 2 } },
        allowCredits: false,
      }),
    ).toThrow("available on scheduled services");
  });
});

describe("occurrence participation state", () => {
  const rules = catalogItemParticipationRules(
    {
      participation: {
        minParticipants: 2,
        minimumPolicy: "cancel",
        cutoffMinutesBeforeStart: 120,
        creditTiers: [
          { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
          { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
        ],
      },
    },
    12,
  )!;
  const occurrence = {
    capacity: 12,
    startsAt: new Date("2026-12-10T17:00:00.000Z"),
    participationOutcome: null,
    settledHeadcount: null,
    participationSettledAt: null,
  };

  it("tells a booking page how many players are still needed", () => {
    expect(
      occurrenceParticipationState({ rules, occurrence, bookedCount: 1 }),
    ).toEqual({
      capacity: 12,
      bookedCount: 1,
      spotsRemaining: 11,
      minParticipants: 2,
      minimumMet: false,
      playersNeeded: 1,
      decisionAt: "2026-12-10T15:00:00.000Z",
      status: "open",
      currentCreditsPerPlayer: 2,
      nextCreditsPerPlayer: 2,
      bookingCreditsPerPlayer: 2,
      settledHeadcount: undefined,
    });
  });

  it("previews the cheaper tier one more player unlocks", () => {
    expect(
      occurrenceParticipationState({ rules, occurrence, bookedCount: 6 }),
    ).toMatchObject({
      currentCreditsPerPlayer: 2,
      nextCreditsPerPlayer: 1,
      bookingCreditsPerPlayer: 2,
    });
  });

  it("prices new bookings at the final tier once headcount is settled", () => {
    expect(
      occurrenceParticipationState({
        rules,
        occurrence: {
          ...occurrence,
          participationOutcome: "minimum-met",
          settledHeadcount: 8,
          participationSettledAt: new Date("2026-12-10T15:00:00.000Z"),
        },
        bookedCount: 8,
      }),
    ).toMatchObject({
      status: "confirmed",
      settledHeadcount: 8,
      currentCreditsPerPlayer: 1,
      bookingCreditsPerPlayer: 1,
    });
  });

  it("round-trips the rules a booking agreed to", () => {
    const snapshot = bookingParticipationSnapshot({
      rules,
      creditsPerPlayer: 2,
    });
    expect(
      readBookingSnapshot(
        JSON.parse(JSON.stringify({ participation: snapshot })),
      ),
    ).toEqual(snapshot);
    expect(readBookingSnapshot({})).toBeUndefined();
  });
});
