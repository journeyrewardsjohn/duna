import { describe, expect, it } from "vitest";
import { mobileControl, mobileGrid, resolveDunaMobileTokens } from "./mobile";

describe("Duna mobile design tokens", () => {
  it("keeps layout rhythm on the five-point grid", () => {
    for (const [name, value] of Object.entries(mobileGrid)) {
      if (name === "hairline" || name === "half") continue;
      expect(value % 5).toBe(0);
    }
    expect(mobileControl.minimumTarget).toBeGreaterThanOrEqual(48);
    expect(mobileControl.primaryTarget).toBeGreaterThanOrEqual(56);
  });

  it("translates theme and zone semantics for native surfaces", () => {
    const setup = resolveDunaMobileTokens("light", "athletic");
    const recording = resolveDunaMobileTokens("dark", "live");

    expect(setup.ground).not.toBe(recording.ground);
    expect(setup.buttonPrimaryBackground).toBe("#1B1B19");
    expect(recording.buttonPrimaryBackground).toBe("#EDF1F2");
  });
});
