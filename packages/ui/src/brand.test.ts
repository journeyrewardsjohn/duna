import { describe, expect, it } from "vitest";
import { normalizeClubColor, playerAccents } from "./brand";

describe("normalizeClubColor", () => {
  it("preserves hue while clamping chroma into the Duna band", () => {
    const red = normalizeClubColor("#FF0000");
    const green = normalizeClubColor("#00FF00");
    expect(red.chroma).toBeLessThanOrEqual(0.15);
    expect(green.chroma).toBeLessThanOrEqual(0.15);
    expect(red.core).not.toBe("#FF0000");
    expect(green.core).not.toBe("#00FF00");
  });

  it("returns four deterministic, render-safe tones", () => {
    const first = normalizeClubColor("#527A87");
    const second = normalizeClubColor("#527a87");
    expect(first).toEqual(second);
    for (const value of [first.tint, first.edge, first.core, first.ink]) {
      expect(value).toMatch(/^#[\dA-F]{6}$/);
    }
  });

  it("keeps player identity to a curated ten-color set", () => {
    expect(playerAccents).toHaveLength(10);
    expect(new Set(playerAccents.map((accent) => accent.color)).size).toBe(10);
    expect(
      playerAccents.some((accent) => String(accent.color) === "#E8683A"),
    ).toBe(false);
  });
});
