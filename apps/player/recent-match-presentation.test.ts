import { demoMatches, demoPlayer } from "@duna/core/demo";
import { describe, expect, it } from "vitest";
import { presentRecentMatch } from "./recent-match-presentation";

describe("recent match presentation", () => {
  it("orients a win and every set score to the current player", () => {
    const match = demoMatches[0]!;
    expect(presentRecentMatch(match, demoPlayer.id)).toMatchObject({
      matchScore: "2–1",
      opponentLabel: "Noa + Elena",
      outcome: "win",
      outcomeCode: "W",
      partnerLabel: "Theo",
      ratingDeltaLabel: "+0.08",
      setScore: "21–17  18–21  15–12",
      statusLabel: "Verified",
    });
  });

  it("reverses team-B scores and preserves a negative rating outcome", () => {
    const match = {
      ...demoMatches[0]!,
      ratingDelta: -0.04,
      score: [
        [21, 18],
        [21, 16],
      ] as const,
      winner: "A" as const,
    };
    expect(presentRecentMatch(match, match.teamB[0]!.id)).toMatchObject({
      matchScore: "0–2",
      outcome: "loss",
      outcomeCode: "L",
      ratingDeltaLabel: "−0.04",
      setScore: "18–21  16–21",
    });
  });

  it("surfaces verification states without using color alone", () => {
    const match = {
      ...demoMatches[0]!,
      confirmationRequired: true,
      status: "pending-verification" as const,
    };
    expect(presentRecentMatch(match, demoPlayer.id).statusLabel).toBe(
      "Pending",
    );
    expect(
      presentRecentMatch(
        { ...demoMatches[0]!, status: "complete" },
        demoPlayer.id,
      ).statusLabel,
    ).toBe("Complete");
  });
});
