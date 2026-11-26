import { validateParticipationRules } from "@duna/core";
import { describe, expect, it } from "vitest";
import {
  highestParticipationTierCredits,
  initialParticipationDraft,
  participationConfiguration,
  resolveParticipationTiers,
  type ParticipationDraft,
} from "./product-participation-draft";

const blank = initialParticipationDraft({});
const academy: ParticipationDraft = {
  ...blank,
  tiersEnabled: true,
  tierRows: [
    { upTo: 1, credits: 3 },
    { upTo: 6, credits: 2 },
    { upTo: 12, credits: 1 },
  ],
};

describe("product participation draft", () => {
  it("adds nothing to a capacity-only offer", () => {
    expect(blank).toMatchObject({
      minPlayers: 1,
      minimumPolicy: "run",
      cutoffMinutes: 1_440,
      settlementBasis: "cutoff",
      tiersEnabled: false,
    });
    expect(participationConfiguration(blank, 12)).toBeUndefined();
  });

  it("builds the academy tiers the server accepts", () => {
    const configuration = participationConfiguration(academy, 12);
    expect(configuration?.creditTiers).toEqual([
      { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
      { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
      { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
    ]);
    expect(highestParticipationTierCredits(academy, 12)).toBe(3);
    expect(
      validateParticipationRules(configuration, {
        capacity: 12,
        allowCredits: true,
        creditCost: highestParticipationTierCredits(academy, 12),
      }).issues,
    ).toEqual([]);
  });

  it("can never produce a gap, an overlap, or a tier past the capacity", () => {
    const messy: ParticipationDraft = {
      ...academy,
      minPlayers: 3,
      tierRows: [
        { upTo: 1, credits: 5 },
        { upTo: 99, credits: 0 },
        { upTo: 2, credits: 2 },
      ],
    };
    for (const capacity of [3, 4, 5, 8, 20]) {
      const tiers = resolveParticipationTiers(messy, capacity);
      expect(tiers[0]?.minParticipants).toBe(3);
      expect(tiers.at(-1)?.maxParticipants).toBe(capacity);
      tiers.forEach((tier, index) => {
        expect(tier.maxParticipants).toBeGreaterThanOrEqual(
          tier.minParticipants,
        );
        expect(tier.creditsPerPlayer).toBeGreaterThanOrEqual(1);
        if (index > 0) {
          expect(tier.minParticipants).toBe(
            tiers[index - 1]!.maxParticipants + 1,
          );
        }
      });
      expect(
        validateParticipationRules(
          participationConfiguration(messy, capacity),
          {
            capacity,
            allowCredits: true,
            creditCost: highestParticipationTierCredits(messy, capacity),
          },
        ).issues,
      ).toEqual([]);
    }
  });

  it("saves a minimum with its policy and cutoff when there are no tiers", () => {
    expect(
      participationConfiguration(
        {
          ...blank,
          minPlayers: 4,
          minimumPolicy: "cancel",
          cutoffMinutes: 120,
        },
        12,
      ),
    ).toEqual({
      minParticipants: 4,
      minimumPolicy: "cancel",
      cutoffMinutesBeforeStart: 120,
      settlementBasis: "cutoff",
      creditTiers: [],
    });
  });

  it("reopens a saved offer with the rules it was saved with", () => {
    const saved = participationConfiguration(
      { ...academy, settlementBasis: "attendance", cutoffMinutes: 0 },
      12,
    );
    const reopened = initialParticipationDraft({ participation: saved });
    expect(reopened).toMatchObject({
      tiersEnabled: true,
      settlementBasis: "attendance",
      cutoffMinutes: 0,
    });
    expect(participationConfiguration(reopened, 12)).toEqual(saved);
  });
});
