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
    expect(countryCode("GER")).toBe("DE");
  });

  it("covers standard ISO alpha-3 countries beyond the tour aliases", () => {
    expect(countryCode("DEU")).toBe("DE");
    expect(countryCode("KAZ")).toBe("KZ");
    expect(countryCode("ZAF")).toBe("ZA");
  });

  it("uses a neutral flag when the federation is unknown", () => {
    expect(countryCode("XYZ")).toBeUndefined();
    expect(countryFlag("XYZ")).toBe("INTL");
  });
});
