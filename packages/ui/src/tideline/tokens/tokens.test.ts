import { readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "prettier";
import { describe, expect, it } from "vitest";
import {
  buildTidelineTokensCss,
  buildTidelineTokensTs,
  contrastRatio,
  mergeTidelineAdditions,
  resolveTidelineColors,
  type TidelineTokenSource,
} from "./token-build";
import { tidelineColors, tidelineTokens } from "./tokens";

// The package build also compiles this test into dist/, where the token and
// style sources are not copied. Always read them from src/.
const here = import.meta.dirname.replace(
  /([\\/])dist([\\/]tideline[\\/]tokens)$/,
  "$1src$2",
);
const read = (name: string) => readFileSync(join(here, name), "utf8");
const published = JSON.parse(read("tokens.json")) as TidelineTokenSource;
const additions = JSON.parse(
  read("tokens.additions.json"),
) as Partial<TidelineTokenSource>;
const source = mergeTidelineAdditions(published, additions);
const css = read("tokens.css");

describe("Tideline token pipeline", () => {
  it("tokens.css is current with tokens.json (run `pnpm tideline:tokens`)", async () => {
    expect(css).toBe(
      await format(buildTidelineTokensCss(source), { parser: "css" }),
    );
  });

  it("tokens.ts is current with tokens.json (run `pnpm tideline:tokens`)", async () => {
    expect(read("tokens.ts")).toBe(
      await format(buildTidelineTokensTs(source), { parser: "typescript" }),
    );
  });

  it("emits every token under the --td- prefix, inside the tideline layer", () => {
    expect(css).toContain("@layer tideline {");
    const properties = css.match(/^\s+--[a-z0-9-]+(?=:)/gm) ?? [];
    expect(properties.length).toBeGreaterThan(200);
    expect(properties.every((name) => name.trim().startsWith("--td-"))).toBe(
      true,
    );
  });

  it("selects themes on a .td wrapper, never on :root", () => {
    expect(css).not.toMatch(/^\s*(:root|html|body)\b/m);
    expect(css).toContain('.td[data-theme="dark"]');
    expect(css).toContain('.td[data-theme="live"],\n  .td[data-zone="live"]');
    const selectors = css.match(/^ {2}[^\s@}].*(?=,$| \{$)/gm) ?? [];
    expect(
      selectors.every((selector) => selector.trim().startsWith(".td")),
    ).toBe(true);
  });

  it("turns aliases into var() references and rejects unknown ones", () => {
    expect(css).toContain("--td-on-energy: var(--td-tide-950);");
    const broken = structuredClone(source);
    broken.color.tokens.push({ name: "broken", value: "{no-such-token}" });
    expect(() => buildTidelineTokensCss(broken)).toThrow(/no-such-token/);
  });

  it("picks up a token added to any group without code changes", () => {
    const next = structuredClone(source) as TidelineTokenSource & {
      duration: { tokens: Array<{ name: string; value: string }> };
    };
    next.duration.tokens.push({ name: "duration-new", value: "999ms" });
    expect(buildTidelineTokensCss(next)).toContain("--td-duration-new: 999ms;");
    expect(buildTidelineTokensTs(next)).toContain('"duration-new": 999');
  });

  it("resolves native values: numbers for lengths and times, pixels for type", () => {
    expect(tidelineTokens.spacing["space-4"]).toBe(16);
    expect(tidelineTokens.duration["duration-base"]).toBe(180);
    expect(tidelineTokens.color.light.action).toBe("#0f1a2b");
    expect(tidelineColors("dark", "live")).toBe(tidelineTokens.color.live);
    expect(tidelineTokens.type.body).toMatchObject({
      family: "ui",
      fontSize: 14,
      lineHeight: 20,
    });
    // A unitless line height becomes pixels, and em tracking becomes points.
    expect(tidelineTokens.type["heading-32"].letterSpacing).toBe(-0.64);
    expect(tidelineTokens.duration["delay-loading"]).toBe(250);
  });
});

describe("Tideline contrast (WCAG AA)", () => {
  const colors = resolveTidelineColors(source);
  const textPairs: Array<[foreground: string, background: string]> = [
    ["on-action", "action"],
    ["on-action", "action-hover"],
    ["on-action-soft", "action-soft"],
    ["on-danger", "danger"],
    ["on-energy", "energy"],
    ["text", "ground"],
    ["text", "surface"],
    ["text-2", "surface"],
    ["text-2", "ground"],
    ["text-3", "surface"],
    ["text-inverse", "text"],
    ["positive", "positive-wash"],
    ["warning", "warning-wash"],
    ["danger", "danger-wash"],
    ["info", "info-wash"],
    ["attention", "attention-wash"],
    ["attention", "surface"],
    ["live-ink", "live-wash"],
    ["danger", "surface"],
  ];

  for (const theme of Object.keys(colors)) {
    it(`text pairs reach 4.5:1 in ${theme}`, () => {
      for (const [foreground, background] of textPairs) {
        const ratio = contrastRatio(
          colors[theme]![foreground]!,
          colors[theme]![background]!,
        );
        expect(
          ratio,
          `${foreground} on ${background} in ${theme} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`control edges and focus reach 3:1 in ${theme}`, () => {
      for (const [foreground, background] of [
        ["border-control", "surface"],
        ["focus", "surface"],
        ["focus", "ground"],
      ] as const) {
        expect(
          contrastRatio(
            colors[theme]![foreground]!,
            colors[theme]![background]!,
          ),
          `${foreground} on ${background} in ${theme}`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("the primary button label is white in every theme", () => {
    for (const theme of Object.keys(colors)) {
      expect(colors[theme]!["on-action"]).toBe("#ffffff");
    }
  });

  it("additions never override a published token", () => {
    const clash = mergeTidelineAdditions(published, {
      color: { themes: [], tokens: [{ name: "action", value: "#ff0000" }] },
    } as Partial<TidelineTokenSource>);
    expect(resolveTidelineColors(clash).light!.action).toBe("#0f1a2b");
    // An addition for a name design has not published does take effect.
    expect(css).toContain("--td-type-micro-size: 12px;");
  });

  it("keeps the type scale at or above the 12px floor", () => {
    const type = source.type.groups.flatMap((group) => group.styles);
    const size = (name: string) =>
      Number.parseInt(type.find((style) => style.name === name)!.fontSize, 10);
    // Tideline 3: 14 body and controls on desktop, 15 and up on phones.
    expect(size("body")).toBeGreaterThanOrEqual(14);
    expect(size("label")).toBeGreaterThanOrEqual(14);
    expect(size("phone-body")).toBeGreaterThanOrEqual(15);
    expect(size("meta")).toBeGreaterThanOrEqual(13);
    expect(size("micro")).toBeGreaterThanOrEqual(12);
    // The published 11px `tab-label` stays in tokens.json but is not generated.
    expect(size("tab-label")).toBeLessThan(12);
    expect(css).not.toContain("--td-type-tab-label");
    expect(read("tokens.ts")).not.toContain('"tab-label"');
  });
});
