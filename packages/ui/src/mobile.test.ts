import { describe, expect, it } from "vitest";
import {
  dunaAppColors,
  dunaAppShape,
  mobileControl,
  mobileGrid,
  resolveDunaMobileTokens,
  resolveDunaSandColors,
} from "./mobile";

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

describe("Duna mobile design tokens", () => {
  it("keeps layout rhythm on the five-point grid", () => {
    for (const [name, value] of Object.entries(mobileGrid)) {
      if (name === "hairline" || name === "half") continue;
      expect(value % 5).toBe(0);
    }
    expect(mobileControl.minimumTarget).toBeGreaterThanOrEqual(48);
    expect(mobileControl.primaryTarget).toBeGreaterThanOrEqual(56);
  });

  it("keeps product surfaces neutral and Duna accents role-based", () => {
    expect(dunaAppColors.page).toBe("#F1EDE6");
    expect(dunaAppColors.ink).toBe("#32332F");
    expect(dunaAppColors.navy).toBe("#142335");
    expect(dunaAppColors.blush).toBe("#FECFC0");
    expect(dunaAppShape.cardRadius).toBe(20);
    expect(dunaAppShape.sectionRadius).toBe(28);
  });

  it("translates theme and zone semantics for native surfaces", () => {
    const setup = resolveDunaMobileTokens("light", "athletic");
    const recording = resolveDunaMobileTokens("dark", "live");

    expect(setup.ground).not.toBe(recording.ground);
    expect(setup.buttonPrimaryBackground).toBe("#1B1B19");
    expect(recording.buttonPrimaryBackground).toBe("#EDF1F2");
  });

  it("keeps secondary reading text legible across sand surfaces in both appearances", () => {
    for (const theme of ["light", "dark"] as const) {
      const colors = resolveDunaSandColors(theme);
      for (const foreground of [colors.ink, colors.muted]) {
        for (const background of [
          colors.canvas,
          colors.surface,
          colors.inset,
        ]) {
          const values = [luminance(foreground), luminance(background)].sort(
            (a, b) => b - a,
          );
          expect(
            (values[0]! + 0.05) / (values[1]! + 0.05),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("dissolves photography into the active ground without a pale seam", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const zone of ["editorial", "athletic", "live"] as const) {
        const tokens = resolveDunaMobileTokens(theme, zone);
        expect(tokens.dissolve).toBe(tokens.ground);
      }
    }
  });
});
