import { readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "prettier";
import { describe, expect, it } from "vitest";
import {
  buildTidelineNativeTokensTs,
  contrastRatio,
  cubicBezierPoints,
  mergeTidelineAdditions,
  nativeShadowLayers,
  oklchToHex,
  type TidelineTokenSource,
} from "../../tideline/tokens/token-build";
import { nativeColors, nativeTokens } from "./index";

const here = import.meta.dirname;
const tokensDir = join(here, "../../tideline/tokens");
const source = mergeTidelineAdditions(
  JSON.parse(
    readFileSync(join(tokensDir, "tokens.json"), "utf8"),
  ) as TidelineTokenSource,
  JSON.parse(
    readFileSync(join(tokensDir, "tokens.additions.json"), "utf8"),
  ) as Partial<TidelineTokenSource>,
);

describe("native tokens (generated)", () => {
  it("tokens.native.ts is current with tokens.json (run `pnpm tideline:tokens`)", async () => {
    expect(readFileSync(join(here, "tokens.native.ts"), "utf8")).toBe(
      await format(buildTidelineNativeTokensTs(source), {
        parser: "typescript",
      }),
    );
  });

  it("matches the snapshot of the values components rely on", () => {
    expect({
      brand: nativeTokens.brand,
      light: nativeColors("light"),
      dark: nativeColors("dark"),
      live: nativeColors("live"),
      hq: nativeColors("light", "hq"),
      space: nativeTokens.space,
      radius: nativeTokens.radius,
      icon: nativeTokens.icon,
      type: nativeTokens.type,
      brandType: nativeTokens.brandType,
      fontWeights: nativeTokens.fontWeights,
      motion: nativeTokens.motion,
      shadow: nativeTokens.shadow.light,
    }).toMatchSnapshot();
  });

  it("carries the brand colours and the action pairs", () => {
    expect(nativeTokens.brand).toEqual({
      "night-court": "#0e1a22",
      salt: "#f4f2ec",
      dune: "#d9c3a0",
      hardwood: "#b5814f",
      solar: "#f2542d",
    });
    expect(nativeColors("light").ground).toBe("#f4f2ec");
    expect(nativeColors("light").action).toBe("#0e1a22");
    expect(nativeColors("light")["on-action"]).toBe("#f4f2ec");
    expect(nativeColors("dark").action).toBe("#d9c3a0");
    expect(nativeColors("dark")["on-action"]).toBe("#0e1a22");
    expect(nativeColors("light", "hq").ground).toBe("#ffffff");
  });

  it("the live zone wins over the theme", () => {
    expect(nativeColors("light", "live")).toBe(nativeTokens.color.live);
    expect(nativeColors("dark", "live")).toBe(nativeTokens.color.live);
  });

  it("every colour is a hex string React Native can parse", () => {
    const all = [
      ...Object.values(nativeTokens.brand),
      ...Object.values(nativeTokens.ramp),
      ...Object.values(nativeTokens.color).flatMap((roles) =>
        Object.values(roles),
      ),
      ...Object.values(nativeTokens.zone).flatMap((themes) =>
        Object.values(themes).flatMap((roles) => Object.values(roles)),
      ),
    ];
    for (const value of all)
      expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
  });

  it("text roles keep 4.5:1 on the ground and the action label on the action", () => {
    for (const theme of ["light", "dark", "live"] as const) {
      const colors = nativeColors(theme);
      expect(contrastRatio(colors.text, colors.ground)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(colors["text-2"], colors.surface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(colors["on-action"], colors.action),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("motion: Rise 600, Rally 600 at 120 apart, Cross 320, reduced to a 200 ms fade, nothing overshoots", () => {
    const { duration, easing, reduced } = nativeTokens.motion;
    expect([
      duration.rise,
      duration.rally,
      duration["stagger-rally"],
      duration.cross,
    ]).toEqual([600, 600, 120, 320]);
    expect([
      reduced.rise,
      reduced.rally,
      reduced.cross,
      reduced["stagger-rally"],
    ]).toEqual([200, 200, 200, 0]);
    expect(duration["fade-reduced"]).toBe(200);
    for (const points of Object.values(easing)) {
      expect(points).toHaveLength(4);
      for (const point of points) {
        expect(point).toBeGreaterThanOrEqual(0);
        expect(point).toBeLessThanOrEqual(1);
      }
    }
  });

  it("icons are 14 / 16 / 20 / 24 with a 1.75 square stroke", () => {
    expect(nativeTokens.icon.size).toEqual({
      chip: 14,
      inline: 16,
      control: 20,
      nav: 24,
    });
    expect(nativeTokens.icon.stroke).toBe(1.75);
    expect(nativeTokens.icon.linecap).toBe("square");
  });

  it("no type style is below the 12 pt floor", () => {
    for (const style of Object.values(nativeTokens.type)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(12);
    }
  });

  it("converts the builder's inputs", () => {
    expect(cubicBezierPoints("cubic-bezier(.2, .8, .2, 1)")).toEqual([
      0.2, 0.8, 0.2, 1,
    ]);
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
    expect(
      nativeShadowLayers("inset 0 1px 0 #ffffff08, 0 4px 12px -2px #0b122014"),
    ).toEqual([
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 0,
        spreadDistance: 0,
        color: "#ffffff08",
        inset: true,
      },
      {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 12,
        spreadDistance: -2,
        color: "#0b122014",
      },
    ]);
  });
});
