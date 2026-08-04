import { describe, expect, it } from "vitest";
import { countryFlag } from "./country-flag";

describe("countryFlag", () => {
  it("renders two and three letter federation codes", () => {
    expect(countryFlag("SWE")).toBe("🇸🇪");
    expect(countryFlag("US")).toBe("🇺🇸");
  });

  it("uses a neutral flag when the federation is unknown", () => {
    expect(countryFlag("XYZ")).toBe("🏳️");
  });
});
