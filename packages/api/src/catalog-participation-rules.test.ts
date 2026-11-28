import { describe, expect, it } from "vitest";
import {
  bookingParticipationSnapshot,
  catalogItemParticipationRules,
  normalizeParticipationConfiguration,
  occurrenceParticipationState,
  participationOpenedAt,
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
const savedAt = new Date("2026-11-20T09:00:00.000Z");
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
        now: savedAt,
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
      now: savedAt,
      type: "service",
      configuration: {
        capacity: 12,
        sessionSchedule: schedule,
        participation: { creditTiers: tiers },
      },
      allowCredits: true,
      creditCost: 3,
    });
    const ladder = [
      { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
      { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
      { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
    ];
    // Version 2, plus the 289 keys the HQ form still reads. No lock is
    // stored: the session inherits the club default, then the refund window.
    expect(normalized.participation).toEqual({
      version: 2,
      unit: "player",
      minParticipants: 1,
      minimumPolicy: "run",
      waitlist: false,
      tiers: ladder,
      settlementBasis: "cutoff",
      creditTiers: [
        { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
        { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
        { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
      ],
      effectiveFrom: "2026-11-20T09:00:00.000Z",
    });
  });

  it("restamps when the rules took effect only when they change", () => {
    const save = (
      participation: Record<string, unknown>,
      previousConfiguration: Readonly<Record<string, unknown>> | undefined,
      now: Date,
    ) =>
      normalizeParticipationConfiguration({
        type: "service",
        configuration: {
          capacity: 12,
          sessionSchedule: schedule,
          participation,
        },
        allowCredits: true,
        creditCost: 3,
        previousConfiguration,
        now,
      });
    const first = save({ creditTiers: tiers }, undefined, savedAt);
    const later = new Date("2026-12-01T09:00:00.000Z");
    // Saving the same rules again (as the builder does on every edit) keeps
    // the original moment, whatever order the stored keys come back in.
    const resaved = save(
      { creditTiers: tiers },
      JSON.parse(JSON.stringify(first)) as Record<string, unknown>,
      later,
    );
    expect(resaved.participation).toEqual(first.participation);
    const changed = save(
      { creditTiers: tiers, minimumPolicy: "cancel", minParticipants: 1 },
      first,
      later,
    );
    expect(changed.participation).toMatchObject({
      minimumPolicy: "cancel",
      effectiveFrom: "2026-12-01T09:00:00.000Z",
    });
    expect(
      participationOpenedAt({
        occurrenceCreatedAt: new Date("2026-11-01T00:00:00.000Z"),
        itemPublishedAt: new Date("2026-11-10T00:00:00.000Z"),
        configuration: changed,
      }).toISOString(),
    ).toBe("2026-12-01T09:00:00.000Z");
    expect(
      participationOpenedAt({
        occurrenceCreatedAt: new Date("2026-11-01T00:00:00.000Z"),
        itemPublishedAt: null,
        configuration: {},
      }).toISOString(),
    ).toBe("2026-11-01T00:00:00.000Z");
  });

  it("rejects invalid tiers with the operator-facing reason", () => {
    expect(() =>
      normalizeParticipationConfiguration({
        now: savedAt,
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
    ).toThrow("Prices must cover every group size from 1 to 12. 5 is missing.");
  });

  it("requires the credit price to be the highest tier", () => {
    expect(() =>
      normalizeParticipationConfiguration({
        now: savedAt,
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
        now: savedAt,
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
        now: savedAt,
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
      decisionAt: "2026-12-10T15:00:00.000Z",      lockAt: "2026-12-10T15:00:00.000Z",      freeCancelUntil: "2026-12-10T15:00:00.000Z",
      status: "open",
      currentCreditsPerPlayer: 2,
      nextCreditsPerPlayer: 2,
      bookingCreditsPerPlayer: 2,
      settledHeadcount: undefined,
    });
  });

  it("reports the later decision time for a session that opened late", () => {
    expect(
      occurrenceParticipationState({
        rules,
        occurrence,
        bookedCount: 0,
        openedAt: new Date("2026-12-10T16:00:00.000Z"),
      }).decisionAt,
    ).toBe("2026-12-10T16:30:00.000Z");
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
