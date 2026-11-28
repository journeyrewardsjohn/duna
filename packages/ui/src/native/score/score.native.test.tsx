import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { MotionPreference } from "../motion/reduced-motion";
import { render } from "../test-support/render";
import { testAnimations } from "../test-support/react-native";
import {
  RATING_RING_RISE_MS,
  RatingRing,
  ratingChipText,
  ratingRingView,
} from "./RatingRing";

describe("native RatingRing", () => {
  it("speaks everything the drawing says", () => {
    const { accessibilityLabel, model } = ratingRingView({
      value: 3.42,
      delta: 0.08,
      reliability: 3,
      px: 96,
      locale: "en-US",
    });
    expect(model.state).toBe("up");
    expect(accessibilityLabel).toBe(
      "Sand Rating 3.42, up 0.08. 84% of the way to 3.50. Reliability 3 of 3.",
    );
  });

  it("is one image to VoiceOver and shows the number inside at card size", () => {
    const renderer = render(
      createElement(RatingRing, {
        value: 3.42,
        delta: 0.08,
        reliability: 2,
        size: "card",
      }),
    );
    const image = renderer.root.findByProps({ accessibilityRole: "image" });
    expect(image.props.accessible).toBe(true);
    expect(image.props.accessibilityLabel).toContain("Reliability 2 of 3");
    const texts = renderer.root
      .findAll((node) => (node.type as unknown) === "Text")
      .map((node) => node.props.children);
    expect(texts).toContain("3.42");
    expect(texts).toContain("▲ +0.08");
    // Three band segments and the tick at 120 pt.
    expect(
      renderer.root.findAll((node) => (node.type as unknown) === "Path"),
    ).toHaveLength(3);
    expect(
      renderer.root.findAll((node) => (node.type as unknown) === "Line"),
    ).toHaveLength(1);
  });

  it("a provisional ring is dotted, faded and never shows 0.00", () => {
    const renderer = render(
      createElement(RatingRing, {
        value: null,
        matchesLeft: 3,
        reliability: 1,
        size: "card",
      }),
    );
    const texts = renderer.root
      .findAll((node) => (node.type as unknown) === "Text")
      .map((node) => node.props.children);
    expect(texts).toContain("—");
    expect(texts).toContain("3 more matches");
    const track = renderer.root.findAll(
      (node) => (node.type as unknown) === "Circle",
    )[0]!;
    expect(track.props.strokeDasharray).toBe("1 9");
  });

  it("Rises the arc for 900 ms, and not at all under reduced motion", () => {
    testAnimations.length = 0;
    render(
      createElement(RatingRing, { value: 3.3, delta: 0.1, reliability: 3 }),
    );
    expect(testAnimations).toContainEqual(
      expect.objectContaining({
        kind: "timing",
        config: expect.objectContaining({ duration: RATING_RING_RISE_MS }),
      }),
    );
    testAnimations.length = 0;
    render(
      createElement(
        MotionPreference,
        { reduceMotion: true },
        createElement(RatingRing, { value: 3.3, delta: 0.1, reliability: 3 }),
      ),
    );
    expect(testAnimations.filter((a) => a.kind === "timing")).toHaveLength(0);
  });

  it("chip words match the web ring", () => {
    expect(
      ratingChipText({
        kind: "delta",
        direction: "down",
        text: "−0.04",
        amount: "0.04",
      }),
    ).toBe("▼ −0.04");
    expect(ratingChipText({ kind: "reached", goalText: "3.50" })).toBe(
      "Reached 3.50",
    );
    expect(ratingChipText({ kind: "matches-left", count: 1 })).toBe(
      "1 more match",
    );
  });
});
