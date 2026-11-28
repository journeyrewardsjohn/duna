import { describe, expect, it } from "vitest";
import { nativeTokens } from "./native/tokens/tokens.native";
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

  it("maps the legacy colour names onto Tideline 4.1.1 roles", () => {
    const light = nativeTokens.color.light;
    expect(dunaAppColors.page).toBe(light.ground);
    expect(dunaAppColors.page).toBe("#f4f2ec");
    expect(dunaAppColors.ink).toBe("#0e1a22");
    expect(dunaAppColors.navy).toBe(light.action);
    expect(dunaAppShape.cardRadius).toBe(20);
    expect(dunaAppShape.sectionRadius).toBe(28);
  });

  it("carries no retired orange", () => {
    const values = [
      ...Object.values(dunaAppColors),
      ...(["light", "dark"] as const).flatMap((theme) =>
        (["editorial", "athletic", "live"] as const).flatMap((zone) =>
          Object.values(resolveDunaMobileTokens(theme, zone)),
        ),
      ),
    ].map((value) => String(value).toLowerCase());
    for (const retired of ["#e8683a", "#b84a20", "#f28a64", "#f4794c"]) {
      expect(values).not.toContain(retired);
    }
  });

  it("translates theme and zone semantics for native surfaces", () => {
    const setup = resolveDunaMobileTokens("light", "athletic");
    const recording = resolveDunaMobileTokens("dark", "live");

    expect(setup.ground).not.toBe(recording.ground);
    expect(setup.buttonPrimaryBackground).toBe("#0e1a22");
    expect(recording.buttonPrimaryBackground).toBe("#d9c3a0");
    // Solar only in the live zone.
    expect(recording.flare).toBe("#f2542d");
    expect(setup.flare).not.toBe("#f2542d");
  });
});
