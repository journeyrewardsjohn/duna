import { describe, expect, it } from "vitest";
import { countryCode, countryFlag } from "./country-flag";

describe("countryFlag", () => {
  it("renders two and three letter federation codes", () => {
    expect(countryCode("SWE")).toBe("SE");
    expect(countryCode("US")).toBe("US");
    expect(countryCode("BLR")).toBe("BY");
    expect(countryCode("ISR")).toBe("IL");
    expect(countryCode("SVK")).toBe("SK");
    expect(countryCode("TUR")).toBe("TR");
  });

  it("uses a neutral flag when the federation is unknown", () => {
    expect(countryCode("XYZ")).toBeUndefined();
    expect(countryFlag("XYZ")).toBe("INTL");
  });
});
