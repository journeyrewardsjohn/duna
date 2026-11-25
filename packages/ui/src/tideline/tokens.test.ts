import { readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "prettier";
import { describe, expect, it } from "vitest";
import {
  buildTidelineTokensCss,
  buildTidelineTokensTs,
  contrastRatio,
  resolveTidelineColors,
  type TidelineTokenSource,
} from "./token-build";
import { tidelineColors, tidelineTokens } from "./tokens";

const here = import.meta.dirname;
const read = (name: string) => readFileSync(join(here, name), "utf8");
const source = JSON.parse(read("tokens.json")) as TidelineTokenSource;
const css = read("tokens.css");
const stylesheet = read("tideline.css");

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
    expect(css).toContain("--td-link: var(--td-tide-600);");
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
    expect(tidelineTokens.color.light.action).toBe("#0b1220");
    expect(tidelineColors("dark", "live")).toBe(tidelineTokens.color.live);
    expect(tidelineTokens.type.body).toMatchObject({
      family: "ui",
      fontSize: 14,
      lineHeight: 20,
    });
    // A unitless line height becomes pixels, and em tracking becomes points.
    expect(tidelineTokens.type.display.letterSpacing).toBe(-0.64);
    expect(tidelineTokens.duration["duration-loading-delay"]).toBe(250);
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
        ["action", "surface"],
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

  it("the light primary button is readable on the dark meshes", () => {
    for (const theme of Object.keys(colors)) {
      expect(
        contrastRatio(colors[theme]!["tide-900"]!, colors[theme]!["on-mesh"]!),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Tideline stylesheet rules", () => {
  const withoutComments = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, "");

  it("keeps every rule inside the tideline layer and the .td scope", () => {
    expect(
      withoutComments.trimStart().startsWith("@layer ui-sdk, tideline;"),
    ).toBe(true);
    const body = withoutComments
      .replace("@layer ui-sdk, tideline;", "")
      .replace('@import "./tokens.css";', "")
      .trim();
    expect(body.startsWith("@layer tideline {")).toBe(true);
    // Inside the layer the only top-level blocks are `.td` and keyframes.
    const topLevel = body.match(/^ {2}[^\s}][^{]*(?=\{$)/gm) ?? [];
    expect(
      topLevel.every(
        (rule) =>
          rule.trim() === ".td" || rule.trim().startsWith("@keyframes td-"),
      ),
      topLevel.join(" | "),
    ).toBe(true);
  });

  it("uses tokens, not raw colours", () => {
    expect(withoutComments).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(withoutComments).not.toMatch(/\brgba?\(/);
  });

  it("never sets text below the 12px tab-label floor", () => {
    const sizes = [...withoutComments.matchAll(/font-size:\s*(\d+)px/g)].map(
      (match) => Number(match[1]),
    );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    const type = source.type.groups.flatMap((group) => group.styles);
    const size = (name: string) =>
      Number.parseInt(type.find((style) => style.name === name)!.fontSize, 10);
    // Tideline 3: 14 body and controls on desktop, 15 and up on phones.
    expect(size("body")).toBeGreaterThanOrEqual(14);
    expect(size("label")).toBeGreaterThanOrEqual(14);
    expect(size("phone-body")).toBeGreaterThanOrEqual(15);
    expect(size("caption")).toBeGreaterThanOrEqual(13);
    expect(size("tab-label")).toBeGreaterThanOrEqual(12);
    expect(type.find((style) => style.name === "tab-label")!.fontWeight).toBe(
      600,
    );
  });

  it("locks the primary label colour for links and children", () => {
    expect(withoutComments).toMatch(
      /a\.td-btn--primary:is\(:link, :visited, :hover, :active\)/,
    );
    expect(withoutComments).toContain(
      "-webkit-text-fill-color: var(--td-on-action);",
    );
  });

  it("gives every loop a reduced-motion resting state", () => {
    const animated = new Set(
      [...withoutComments.matchAll(/animation:\s*(td-[a-z-]+)/g)].map(
        (match) => match[1],
      ),
    );
    expect(animated).toEqual(
      new Set([
        "td-spin",
        "td-pulse",
        "td-sunrise",
        "td-sweep",
        "td-shimmer",
        "td-tide-sweep",
      ]),
    );
    const reduced = withoutComments.slice(
      withoutComments.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );
    for (const selector of [
      ".td-spinner",
      ".td-sunrise__arc",
      ".td-sweep::after",
      ".td-skel",
      ".td-chip--live::before",
      ".td-progress__fill[data-indeterminate]",
    ]) {
      expect(reduced, selector).toContain(selector);
    }
  });
});
