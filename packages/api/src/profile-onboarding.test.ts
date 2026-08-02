import { describe, expect, it } from "vitest";
import { inferPlayingExperienceNarrative } from "./profile-onboarding";

describe("inferPlayingExperienceNarrative", () => {
  it("extracts a structured collegiate indoor history without inventing fields", () => {
    expect(
      inferPlayingExperienceNarrative(
        "I played indoor in college and have played beach for six years. I am 5 ft 10 in.",
      ),
    ).toMatchObject({
      playingExperience: "collegiate",
      playedIndoorPrior: true,
      yearsPlaying: 6,
      heightMillimeters: 1_778,
      confidence: "high",
    });
  });

  it("respects explicit negative indoor experience", () => {
    expect(
      inferPlayingExperienceNarrative(
        "Recreational beach player for 3 years. I have never played indoor.",
      ),
    ).toMatchObject({
      playingExperience: "amateur",
      playedIndoorPrior: false,
      yearsPlaying: 3,
      confidence: "high",
    });
  });

  it("extracts the college name for a collegiate player", () => {
    expect(
      inferPlayingExperienceNarrative(
        "I played collegiate indoor at Duke University for four years.",
      ),
    ).toMatchObject({
      playingExperience: "collegiate",
      playedIndoorPrior: true,
      yearsPlaying: 4,
      collegeName: "Duke University",
    });
  });

  it("leaves unknown answers undefined for human review", () => {
    const inferred = inferPlayingExperienceNarrative(
      "I like playing on weekends with friends.",
    );
    expect(inferred.playingExperience).toBeUndefined();
    expect(inferred.yearsPlaying).toBeUndefined();
    expect(inferred.heightMillimeters).toBeUndefined();
    expect(inferred.confidence).toBe("low");
  });
});
