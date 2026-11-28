import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  foregroundFor,
  monogramFor,
  NIGHT_COURT,
  parseHexColor,
  relativeLuminance,
  SALT,
} from "./club-mark";

describe("monogramFor", () => {
  it("takes the first letters of the first two words", () => {
    expect(monogramFor("Santa Monica Beach Club").text).toBe("SM");
    expect(monogramFor("  beach   house ").text).toBe("BH");
  });
  it("skips connectors", () => {
    expect(monogramFor("The Beach Club").text).toBe("BC");
    expect(monogramFor("Sand & Sun").text).toBe("SS");
    expect(monogramFor("Club of the Dunes").text).toBe("CD");
    expect(monogramFor("The Of And").text).toBe("TO"); // only connectors: use them
  });
  it("treats hyphens and slashes as word breaks", () => {
    expect(monogramFor("Manhattan-Beach Volley").text).toBe("MB");
    expect(monogramFor("North/South").text).toBe("NS");
  });
  it("one word gives its first two characters", () => {
    expect(monogramFor("Dunes").text).toBe("DU");
    expect(monogramFor("X").text).toBe("X");
  });
  it("counts digits and ignores punctuation and emoji", () => {
    expect(monogramFor("9 Mile Court").text).toBe("9M");
    expect(monogramFor("(Sandbar)").text).toBe("SA");
    expect(monogramFor("\u{1F3D6}️ Beach Club").text).toBe("BC");
    expect(monogramFor("Beach \u{1F3D0}").text).toBe("BE");
  });
  it("handles non-Latin scripts and combining marks", () => {
    expect(monogramFor("沙滩俱乐部").text).toBe("沙滩");
    expect(monogramFor("Берег Клуб").text).toBe("БК");
    expect(monogramFor("école").text).toBe("ÉC");
    expect(monogramFor("école").text).toBe("ÉC");
  });
  it("upper-cases by locale", () => {
    expect(monogramFor("istanbul", "tr").text).toBe("İS");
    expect(monogramFor("istanbul").text).toBe("IS");
  });
  it("returns null for nothing usable", () => {
    expect(monogramFor("").text).toBeNull();
    expect(monogramFor("   ").text).toBeNull();
    expect(monogramFor(null).text).toBeNull();
    expect(monogramFor(undefined).text).toBeNull();
    expect(monogramFor("\u{1F3D6}\u{1F3D0}").text).toBeNull();
    expect(monogramFor("---").text).toBeNull();
  });
});

describe("colour maths", () => {
  it("parses hex forms", () => {
    expect(parseHexColor("#0E1A22")).toEqual({ r: 14, g: 26, b: 34 });
    expect(parseHexColor("fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor(" #abc ")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseHexColor("#12")).toBeNull();
    expect(parseHexColor("red")).toBeNull();
  });
  it("computes WCAG contrast", () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(relativeLuminance(white)).toBeCloseTo(1, 5);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 3);
    expect(contrastRatio(white, white)).toBe(1);
  });
});

describe("foregroundFor", () => {
  it("light colours get Night Court, dark colours get Salt", () => {
    expect(foregroundFor("#D9C3A0")).toMatchObject({
      foreground: NIGHT_COURT,
      passesText: true,
    });
    expect(foregroundFor("#FFFFFF").foreground).toBe(NIGHT_COURT);
    expect(foregroundFor("#0E1A22").foreground).toBe(SALT);
    expect(foregroundFor("#1D3557")).toMatchObject({
      foreground: SALT,
      passesText: true,
    });
  });
  it("mid-tones pick the better side and may fail text but pass graphics", () => {
    const mid = foregroundFor("#808080");
    expect(mid.ratio).toBeGreaterThan(4);
    const hard = foregroundFor("#6A6A6A");
    expect(hard.passesGraphics).toBe(true);
  });
  it("flags a colour that fails everything", () => {
    const worst = foregroundFor("#707070");
    expect(worst.passesText).toBe(worst.ratio >= 4.5);
    expect(worst.passesGraphics).toBe(true);
  });
  it("an unreadable colour falls back to Night Court", () => {
    for (const bad of ["not-a-colour", "", null, undefined]) {
      expect(foregroundFor(bad)).toMatchObject({
        validBackground: false,
        foreground: SALT,
      });
    }
    expect(foregroundFor("#D9C3A0").validBackground).toBe(true);
  });
  it("Night Court or Salt always reaches 3:1 on any grey, though mid-tones can miss 4.5:1", () => {
    let lowest = 100;
    for (let v = 0; v <= 255; v += 5) {
      const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      lowest = Math.min(lowest, foregroundFor(hex).ratio);
    }
    expect(lowest).toBeGreaterThanOrEqual(3.9);
    expect(foregroundFor("#777777").passesText).toBe(false);
  });
});
