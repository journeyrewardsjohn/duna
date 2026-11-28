import { describe, expect, it } from "vitest";
import {
  JUNIOR_RULE,
  MARKETING_CHOICES,
  marketingDisclosure,
  publicPreview,
  visibilityChoices,
  visibilitySentence,
  VISIBILITY_CHOICES,
} from "./privacy-model";

describe("privacy in plain sentences", () => {
  it("maps every choice to one sentence", () => {
    expect(VISIBILITY_CHOICES.map((choice) => choice.value)).toEqual([
      "public",
      "members",
      "private",
    ]);
    expect(visibilitySentence("public")).toBe(
      "Anyone can open your profile page: your name, handle, home area and Sand Rating, and matches where every player is public.",
    );
    expect(visibilitySentence("members")).toMatch(/^You have no public page\./);
    expect(visibilitySentence("private")).toMatch(/^You have no public page\./);
  });

  it("juniors are private by rule: one choice, no public page", () => {
    expect(visibilityChoices(true).map((choice) => choice.value)).toEqual([
      "private",
    ]);
    expect(visibilityChoices(false)).toHaveLength(3);
    const junior = publicPreview({
      visibility: "public",
      isMinor: true,
      handle: "remy",
      ratingProvisional: true,
    });
    expect(junior.published).toBe(false);
    expect(junior.summary).toBe(JUNIOR_RULE);
  });

  it("previews exactly what the public page shows", () => {
    const open = publicPreview({
      visibility: "public",
      isMinor: false,
      handle: "maralewis",
      ratingProvisional: false,
    });
    expect(open.published).toBe(true);
    expect(open.path).toBe("/players/maralewis");
    expect(open.shows).toContain("Your Sand Rating");
    expect(open.hidden).toContain("Email and phone");
    expect(
      publicPreview({
        visibility: "public",
        isMinor: false,
        handle: "new",
        ratingProvisional: true,
      }).shows,
    ).toContain("Your Sand Rating, once it is no longer provisional");
    const closed = publicPreview({
      visibility: "private",
      isMinor: false,
      handle: "maralewis",
      ratingProvisional: false,
    });
    expect(closed.published).toBe(false);
    expect(closed.path).toBeUndefined();
    expect(closed.summary).toBe(visibilitySentence("private"));
  });

  it("records the sentence the person read as the consent's disclosure", () => {
    for (const choice of MARKETING_CHOICES) {
      expect(marketingDisclosure(choice.scope)).toBe(choice.sentence);
    }
    expect(marketingDisclosure("marketing-sms")).toMatch(
      /Reply STOP to opt out\.$/,
    );
  });
});
