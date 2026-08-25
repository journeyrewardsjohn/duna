import { describe, expect, it } from "vitest";
import {
  dunaAppColors,
  dunaAppShape,
  dunaLaunchFilmMinimumMs,
  mobileControl,
  mobileGrid,
  resolveDunaMobileTokens,
} from "./mobile";

describe("Duna mobile design tokens", () => {
  it("keeps layout rhythm on the five-point grid", () => {
    for (const [name, value] of Object.entries(mobileGrid)) {
      if (name === "hairline" || name === "half") continue;
      expect(value % 5).toBe(0);
    }
    expect(mobileControl.minimumTarget).toBeGreaterThanOrEqual(48);
    expect(mobileControl.primaryTarget).toBeGreaterThanOrEqual(56);
  });

  it("keeps the full bundled launch film on screen", () => {
    expect(dunaLaunchFilmMinimumMs).toBeGreaterThanOrEqual(10_042);
  });

  it("keeps product surfaces neutral and Duna accents role-based", () => {
    expect(dunaAppColors.page).toBe("#FCFCFF");
    expect(dunaAppColors.ink).toBe("#18181B");
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
});
