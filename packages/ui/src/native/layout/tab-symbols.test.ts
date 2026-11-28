import { describe, expect, it } from "vitest";
import { tabSymbolsSupported } from "./tab-symbols";

describe("tabSymbolsSupported", () => {
  it("drops symbols only on iPad before iPadOS 27 (the floating bar never finishes layout)", () => {
    expect(
      tabSymbolsSupported({ os: "ios", isPad: true, version: "26.5" }),
    ).toBe(false);
    expect(
      tabSymbolsSupported({ os: "ios", isPad: true, version: "18.4" }),
    ).toBe(false);
  });

  it("keeps symbols on iPadOS 27, iPhone (the Duo included) and Android", () => {
    expect(
      tabSymbolsSupported({ os: "ios", isPad: true, version: "27.2" }),
    ).toBe(true);
    expect(
      tabSymbolsSupported({ os: "ios", isPad: false, version: "26.5" }),
    ).toBe(true);
    expect(
      tabSymbolsSupported({ os: "android", isPad: false, version: 36 }),
    ).toBe(true);
  });

  it("keeps symbols when the version cannot be read", () => {
    expect(tabSymbolsSupported({ os: "ios", isPad: true, version: "" })).toBe(
      true,
    );
  });
});
