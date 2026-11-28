import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { format } from "prettier";
import { describe, expect, it } from "vitest";
import {
  buildTidelineTokensCss,
  buildTidelineTokensTs,
  canonicalTidelineSource,
  contrastRatio,
  mergeTidelineAdditions,
  resolveTidelineColors,
  resolveTidelineZoneColors,
  TIDELINE_CONTRACT_TOKENS,
  TIDELINE_RAMP_RENAMES,
  TIDELINE_RETIRED_TOKENS,
  TIDELINE_VALUE_ADJUSTMENTS,
  type TidelineTokenSource,
} from "./token-build";
import { tidelineColors, tidelineTokens } from "./tokens";

// The package build also compiles this test into dist/, where the token and
// style sources are not copied. Always read them from src/.
const here = import.meta.dirname.replace(
  /([\\/])dist([\\/]tideline[\\/]tokens)$/,
  "$1src$2",
);
const repo = join(here, "../../../../..");
const read = (name: string) => readFileSync(join(here, name), "utf8");
const contract = JSON.parse(
  readFileSync(join(repo, TIDELINE_CONTRACT_TOKENS), "utf8"),
) as TidelineTokenSource;
const published = JSON.parse(read("tokens.json")) as TidelineTokenSource;
const additions = JSON.parse(
  read("tokens.additions.json"),
) as Partial<TidelineTokenSource>;
const source = mergeTidelineAdditions(published, additions);
const css = read("tokens.css");

type Token = { name: string; value: string | Record<string, string> };
const groupTokens = (from: TidelineTokenSource, group: string): Token[] =>
  (from[group] as { tokens: Token[] } | undefined)?.tokens ?? [];
const tokenValue = (from: TidelineTokenSource, group: string, name: string) =>
  groupTokens(from, group).find((token) => token.name === name)?.value;

/** Every file under a folder, skipping build output. */
function files(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (["node_modules", "dist", ".next"].includes(name)) return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("Tideline token pipeline", () => {
  it("tokens.json is the contract with the canonical renames (run `pnpm tideline:tokens`)", async () => {
    expect(read("tokens.json")).toBe(
      await format(JSON.stringify(canonicalTidelineSource(contract)), {
        parser: "json",
      }),
    );
  });

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

  it("is version 4.1.1", () => {
    expect(published.version).toBe("4.1.1");
    expect(css).toMatch(/^\/\* Tideline 4\.1\.1 tokens\./);
    expect(tidelineTokens.version).toBe("4.1.1");
  });

  it("emits every token under the --td- prefix, inside the tideline layer", () => {
    expect(css).toContain("@layer tideline {");
    const properties = css.match(/^\s+--[a-z0-9-]+(?=:)/gm) ?? [];
    expect(properties.length).toBeGreaterThan(200);
    expect(properties.every((name) => name.trim().startsWith("--td-"))).toBe(
      true,
    );
  });

  it("selects themes and zones on a .td wrapper, never on :root", () => {
    expect(css).not.toMatch(/^\s*(:root|html|body)\b/m);
    expect(css).toContain('.td[data-theme="dark"]');
    expect(css).toContain('.td[data-theme="live"],\n  .td[data-zone="live"]');
    expect(css).toContain('.td[data-zone="hq"] {');
    expect(css).toContain('.td[data-zone="hq"][data-theme="dark"] {');
    const selectors = css.match(/^ {2,4}[^\s@}-].*(?=,$| \{$)/gm) ?? [];
    expect(
      selectors.every((selector) => selector.trim().startsWith(".td")),
    ).toBe(true);
  });

  it("turns aliases into var() references and rejects unknown ones", () => {
    expect(css).toContain("--td-on-danger: var(--td-haze-0);");
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
    expect(tidelineTokens.color.light.action).toBe("#0e1a22");
    expect(tidelineColors("dark", "live")).toBe(tidelineTokens.color.live);
    expect(tidelineColors("light", "hq").ground).toBe("#ffffff");
    expect(tidelineColors("dark", "hq").ground).toBe("#0e1a22");
    expect(tidelineTokens.type.body).toMatchObject({
      family: "ui",
      fontSize: 14,
      lineHeight: 20,
    });
    // A unitless line height becomes pixels, and em tracking becomes points.
    expect(tidelineTokens.type["heading-32"].letterSpacing).toBe(-0.64);
    expect(tidelineTokens.duration["delay-loading"]).toBe(250);
  });

  it("additions never override a published token", () => {
    const clash = mergeTidelineAdditions(published, {
      color: { themes: [], tokens: [{ name: "action", value: "#ff0000" }] },
      reducedMotion: { "duration-rise": "999ms" },
    } as Partial<TidelineTokenSource>);
    expect(resolveTidelineColors(clash).light!.action).toBe("#0e1a22");
    // An addition for a name design has not published does take effect.
    expect(css).toContain("--td-type-micro-size: 12px;");
    expect(css).toContain("--td-ease-cross:");
  });
});

describe("Tideline 4.1.1 names", () => {
  const colorNames = new Set(
    groupTokens(published, "color").map((t) => t.name),
  );

  it("renames the ramps that collide with brand words, keeping their values", () => {
    for (const [from, to] of Object.entries(TIDELINE_RAMP_RENAMES)) {
      const ramp = groupTokens(contract, "color").filter((token) =>
        new RegExp(`^${from}-\\d+$`).test(token.name),
      );
      expect(ramp.length, `${from}-* in the contract`).toBeGreaterThan(0);
      for (const token of ramp) {
        const renamed = token.name.replace(`${from}-`, `${to}-`);
        expect(colorNames.has(token.name), token.name).toBe(false);
        expect(tokenValue(published, "color", renamed), renamed).toBe(
          token.value,
        );
      }
    }
    expect(css).not.toMatch(/--td-(salt|night|flare|sunburst|sun)-\d/);
    expect(css).not.toMatch(/\{(salt|night|flare|sunburst|sun)-\d+\}/);
  });

  it("names the brand colours with the brand words", () => {
    expect(tidelineTokens.color.light).toMatchObject({
      "brand-night-court": "#0e1a22",
      "brand-salt": "#f4f2ec",
      "brand-dune": "#d9c3a0",
      "brand-hardwood": "#b5814f",
      "brand-solar": "#f2542d",
    });
    // No token named salt or night-court that is not the brand value.
    for (const name of colorNames) {
      expect(name).not.toMatch(/^(salt|night-court|night)(-|$)/);
    }
  });

  it("keeps every semantic role name, with the contract's value", () => {
    const adjusted = new Set(
      TIDELINE_VALUE_ADJUSTMENTS.map((a) => `${a.token}:${a.theme}`),
    );
    for (const token of groupTokens(contract, "color")) {
      if (typeof token.value === "string") continue;
      const value = tokenValue(published, "color", token.name);
      expect(value, token.name).toBeDefined();
      for (const [theme, raw] of Object.entries(token.value)) {
        if (adjusted.has(`${token.name}:${theme}`)) continue;
        const renamed = raw.replaceAll(
          /\{(salt|night|flare|sunburst|sun)-(\d+)\}/g,
          (_m, ramp: keyof typeof TIDELINE_RAMP_RENAMES, step: string) =>
            `{${TIDELINE_RAMP_RENAMES[ramp]}-${step}}`,
        );
        expect((value as Record<string, string>)[theme]).toBe(renamed);
      }
    }
  });

  it("only adjusts a published value for a stated reason", () => {
    for (const adjustment of TIDELINE_VALUE_ADJUSTMENTS) {
      expect(adjustment.reason.length).toBeGreaterThan(40);
      const value = tokenValue(contract, "color", adjustment.token) as Record<
        string,
        string
      >;
      expect(value[adjustment.theme]).toBe(adjustment.from);
    }
  });
});

describe("Tideline contrast (WCAG 2.2 AA)", () => {
  /**
   * Thresholds: 4.5:1 for text (WCAG 1.4.3, normal-size text, so it covers
   * every size), 3:1 for control edges, focus rings, fills that carry meaning
   * and indicators (WCAG 1.4.11). Disabled labels are exempt (1.4.3) and are
   * not listed. Dune (`sun`, `energy`) is a non-text identity accent at
   * 1.7:1 on white: it never carries meaning alone, and the stylesheets use
   * `sun-ink` / `energy-ink` for warm text and small marks (tested below).
   */
  const textGrounds = [
    "ground",
    "surface",
    "surface-subtle",
    "surface-raised",
    "surface-sunken",
    "surface-warm",
    "action-soft",
  ];
  const textPairs: Array<[string, string]> = [
    ...["text", "text-2", "text-3"].flatMap((text) =>
      textGrounds.map((ground): [string, string] => [text, ground]),
    ),
    ...[
      "link",
      "positive",
      "danger",
      "warning",
      "info",
      "attention",
      "sun-ink",
      "energy-ink",
      "live-ink",
    ].flatMap((text) =>
      ["ground", "surface"].map((ground): [string, string] => [text, ground]),
    ),
    ["on-action", "action"],
    ["on-action", "action-hover"],
    ["on-action-soft", "action-soft"],
    ["on-danger", "danger"],
    ["on-energy", "energy"],
    ["on-attention", "attention"],
    ["on-selected", "selected"],
    ["text-inverse", "text"],
    ["text-3", "action-disabled"],
    ["positive", "positive-wash"],
    ["warning", "warning-wash"],
    ["danger", "danger-wash"],
    ["info", "info-wash"],
    ["attention", "attention-wash"],
    ["live-ink", "live-wash"],
    ["sun-ink", "sun-wash"],
    ["energy-ink", "energy-wash"],
    ["on-mesh", "mesh-night-court-base"],
    ["on-mesh", "mesh-tidewater-base"],
    ["brand-night-court", "live"],
    ["text", "hq-nav-selected-wash"],
    ["text-2", "hq-nav-selected-wash"],
  ];
  const graphicPairs: Array<[string, string]> = [
    ...["ground", "surface", "surface-subtle"].flatMap((ground) =>
      [
        "border-control",
        "focus",
        "action",
        "selected-ring",
        "live",
        "energy-ink",
      ].map((mark): [string, string] => [mark, ground]),
    ),
  ];

  const zones = {
    player: resolveTidelineColors(source),
    ...resolveTidelineZoneColors(source),
  };
  const opaque = (value: string) => value.slice(0, 7);

  it("covers both zones in all three themes", () => {
    expect(Object.keys(zones).sort()).toEqual(["hq", "player"]);
    for (const colors of Object.values(zones)) {
      expect(Object.keys(colors).sort()).toEqual(["dark", "light", "live"]);
    }
  });

  for (const [zone, colors] of Object.entries(zones)) {
    for (const theme of Object.keys(colors)) {
      const c = colors[theme]!;
      it(`text pairs reach 4.5:1 in ${theme} (${zone} zone)`, () => {
        for (const [foreground, background] of textPairs) {
          const ratio = contrastRatio(
            opaque(c[foreground]!),
            opaque(c[background]!),
          );
          expect(
            ratio,
            `${foreground} on ${background} in ${theme} (${zone}) is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`controls, focus and indicators reach 3:1 in ${theme} (${zone} zone)`, () => {
        for (const [foreground, background] of graphicPairs) {
          const ratio = contrastRatio(c[foreground]!, c[background]!);
          expect(
            ratio,
            `${foreground} on ${background} in ${theme} (${zone}) is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }

  it("the primary label is Salt on Night Court in light and Night Court on Dune in dark and live", () => {
    const colors = resolveTidelineColors(source);
    expect(colors.light).toMatchObject({
      action: "#0e1a22",
      "on-action": "#f4f2ec",
    });
    for (const theme of ["dark", "live"]) {
      expect(colors[theme]).toMatchObject({
        action: "#d9c3a0",
        "on-action": "#0e1a22",
      });
    }
  });

  it("stylesheets never use Dune alone for text or icons", () => {
    const sheets = files(join(here, "..")).filter((path) =>
      path.endsWith(".css"),
    );
    for (const path of sheets) {
      if (path.includes(`${join("tideline", "tokens")}`)) continue;
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /(?:^|[\s;{])(?:color|stroke|fill):\s*var\(--td-(?:energy|sun|brand-dune)\)/m,
      );
    }
  });
});

describe("Tideline zones", () => {
  const sand = new Set(
    groupTokens(published, "color")
      .filter((token) =>
        /^(sand|dune|hardwood|umber)-\d+$|^brand-(salt|dune|hardwood)$/.test(
          token.name,
        ),
      )
      .map((token) => (token.value as string).toLowerCase()),
  );

  it("paints the player ground Salt and HQ white / cool neutral", () => {
    expect(tidelineColors("light").ground).toBe("#f4f2ec");
    const hq = tidelineColors("light", "hq");
    expect(hq.ground).toBe("#ffffff");
    for (const role of [
      "ground",
      "surface",
      "surface-warm",
      "surface-subtle",
    ]) {
      const value = hq[role as keyof typeof hq].toLowerCase();
      // Never Salt, Dune or any sand tone (contract R6).
      expect(sand.has(value), `${role} ${value}`).toBe(false);
    }
    expect(tidelineColors("dark", "hq").ground).toBe("#0e1a22");
    expect(tidelineColors("dark", "hq")["surface-warm"]).toBe(
      tidelineColors("dark")["surface-warm"],
    );
  });

  it("carries the HQ shell measurements and the navigation wash", () => {
    expect(tidelineTokens.size).toMatchObject({
      "hq-sidebar-expanded": 248,
      "hq-sidebar-collapsed": 64,
      "hq-top-bar": 56,
    });
    expect(tidelineTokens.color.light["hq-nav-selected-wash"]).toBe("#eceef0");
    expect(tidelineTokens.color.dark["hq-nav-selected-wash"]).toBe("#22343f");
  });
});

describe("Tideline colour discipline", () => {
  /** Tokens allowed to resolve to Solar: the live states and the ramp itself. */
  const solarNames = /^(live|live-ink|live-wash|solar-\d+|brand-solar)$/;
  const solarValues = new Set(
    groupTokens(published, "color")
      .filter((token) => /^(solar-\d+|brand-solar)$/.test(token.name))
      .map((token) => (token.value as string).toLowerCase()),
  );

  it("only live-state tokens resolve to or reference Solar", () => {
    const colors = resolveTidelineColors(source);
    for (const [theme, values] of Object.entries(colors)) {
      for (const [name, value] of Object.entries(values)) {
        if (solarValues.has(value.toLowerCase())) {
          expect(name, `${name} in ${theme} is ${value}`).toMatch(solarNames);
        }
      }
    }
    for (const token of groupTokens(published, "color")) {
      const raw = JSON.stringify(token.value);
      if (/\{(solar-\d+|brand-solar)\}/.test(raw)) {
        expect(token.name).toMatch(solarNames);
      }
    }
    expect(colors.light!.live).toBe("#f2542d");
  });

  it("family stylesheets use Solar only inside live-state selectors", () => {
    const sheets = files(join(here, "..")).filter(
      (path) => path.endsWith(".css") && !path.includes("tokens"),
    );
    const solar = /var\(--td-(?:live(?:-ink|-wash)?|solar-\d+|brand-solar)\)/;
    for (const path of sheets) {
      const stack: string[] = [];
      let buffer = "";
      for (const char of readFileSync(path, "utf8").replaceAll(
        /\/\*[\s\S]*?\*\//g,
        "",
      )) {
        if (char === "{") {
          stack.push(buffer.trim());
          buffer = "";
        } else if (char === "}") {
          stack.pop();
          buffer = "";
        } else if (char === ";") {
          if (solar.test(buffer)) {
            expect(stack.join(" "), `${path}: ${buffer.trim()}`).toMatch(
              /live|record/i,
            );
          }
          buffer = "";
        } else {
          buffer += char;
        }
      }
    }
  });

  it("no retired orange value appears in the library, the gallery or the token sources", () => {
    // The retired flare, sunburst and old sun values (Tideline 3.x and earlier),
    // the same list as the design-system guard. Written without the leading
    // hash so this list does not trip the guard itself.
    const retired = [
      "e8683a",
      "b84a20",
      "f28a64",
      "f4794c",
      "e0602f",
      "a8431c",
      "e5532d",
      "a8321a",
      "ff6a3d",
      "ff8a5c",
      "f5a443",
      "ea8f1f",
      "8c4d06",
      "fff4e3",
      "f6c27e",
      "fed9a6",
      "fff1dc",
      "e8b188",
      "da9461",
      "c27538",
      "9a5420",
      "6e3a14",
      "f0bf98",
      "f6d3b6",
      "fcebdd",
    ].map((hex) => `#${hex}`);
    const pattern = new RegExp(`(?:${retired.join("|")})(?![0-9a-f])`, "i");
    const scanned = [
      ...files(join(here, "..")),
      ...files(join(repo, "apps/hq/app/tideline")),
    ].filter(
      (path) => /\.(css|json|ts|tsx)$/.test(path) && !path.endsWith(".test.ts"),
    );
    expect(scanned.length).toBeGreaterThan(50);
    for (const path of scanned) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(pattern);
    }
  });
});

describe("Tideline type, icons and motion", () => {
  it("sets the brand title in Jost Medium 500 and everything else in Geist", () => {
    const font = tidelineTokens.font;
    expect(font.brand).toMatch(/^"Jost", "Geist",/);
    for (const family of ["ui", "display", "numeric"] as const) {
      expect(font[family]).toMatch(/^"Geist",/);
    }
    expect(font.mono).toMatch(/^"Geist Mono",/);
    // Generic families stay a failure fallback only, at the end.
    for (const stack of Object.values(font)) {
      expect(stack).toMatch(/(sans-serif|monospace)$/);
      // No serif anywhere (contract R2): `serif` only as part of `sans-serif`.
      expect(stack.replaceAll("sans-serif", "")).not.toMatch(/serif/);
    }
    expect(tidelineTokens.brandType).toEqual({
      family: "brand",
      fontWeight: 500,
      letterSpacingEm: -0.015,
      minFontSize: 22,
    });
  });

  it("keeps the type scale at or above the 12px floor", () => {
    const type = source.type.groups.flatMap((group) => group.styles);
    const size = (name: string) =>
      Number.parseInt(type.find((style) => style.name === name)!.fontSize, 10);
    expect(size("body")).toBeGreaterThanOrEqual(14);
    expect(size("label")).toBeGreaterThanOrEqual(14);
    expect(size("phone-body")).toBeGreaterThanOrEqual(15);
    expect(size("meta")).toBeGreaterThanOrEqual(13);
    expect(size("micro")).toBeGreaterThanOrEqual(12);
    // The published 11px `tab-label` stays in tokens.json but is not generated.
    expect(size("tab-label")).toBeLessThan(12);
    expect(css).not.toContain("--td-type-tab-label");
    expect(read("tokens.ts")).not.toContain('"tab-label"');
    for (const style of Object.values(tidelineTokens.type)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(12);
    }
  });

  it("sizes icons 14 / 16 / 20 / 24 and retires the 18px size", () => {
    expect(tidelineTokens.size).toMatchObject({
      "size-icon-chip": 14,
      "size-icon-inline": 16,
      "size-icon-control": 20,
      "size-icon-nav": 24,
      "size-brand-mark-max": 24,
    });
    expect(tidelineTokens.icon).toMatchObject({
      "icon-stroke": 1.75,
      "icon-linecap": "square",
      "icon-linejoin": "miter",
    });
    for (const retired of Object.keys(TIDELINE_RETIRED_TOKENS)) {
      expect(css).not.toMatch(new RegExp(`--td-${retired}:`));
    }
    const library = [
      ...files(join(here, "..")),
      ...files(join(repo, "apps/hq/app/tideline")),
    ].filter((path) => /\.(css|tsx?)$/.test(path) && !path.includes("tokens"));
    for (const path of library) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /--td-size-icon\)|\b18px\b[^;]*icon|\.td-icon\s*\{[^}]*\b18px/,
      );
    }
  });

  it("names the three motion verbs: Rise, Rally and Cross", () => {
    expect(tidelineTokens.duration).toMatchObject({
      "duration-rise": 600,
      "duration-rally": 600,
      "stagger-rally": 120,
      "duration-cross": 320,
    });
    expect(tidelineTokens.easing).toMatchObject({
      "ease-rise": "cubic-bezier(.2, .8, .2, 1)",
      "ease-rally": "cubic-bezier(.2, .8, .2, 1)",
    });
    expect(tidelineTokens.easing["ease-cross"]).toMatch(/^cubic-bezier\(/);
  });

  it("falls back to at most a 200ms fade under reduced motion", () => {
    const reduced = tidelineTokens.reducedMotion;
    for (const verb of ["duration-rise", "duration-rally", "duration-cross"]) {
      expect(reduced[verb as keyof typeof reduced]).toBeLessThanOrEqual(200);
    }
    expect(reduced["stagger-rally"]).toBe(0);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("--td-duration-rise: 200ms;");
  });

  it("nothing bounces: every easing stays inside 0..1", () => {
    const curves = [
      ...Object.values(tidelineTokens.easing),
      ...files(join(here, ".."))
        .filter((path) => path.endsWith(".css") && !path.includes("tokens"))
        .flatMap(
          (path) =>
            readFileSync(path, "utf8").match(/cubic-bezier\([^)]*\)/g) ?? [],
        ),
    ];
    for (const curve of curves) {
      const points = curve
        .replace(/^cubic-bezier\(|\)$/g, "")
        .split(",")
        .map(Number);
      expect(points, curve).toHaveLength(4);
      for (const point of points) {
        expect(point, curve).toBeGreaterThanOrEqual(0);
        expect(point, curve).toBeLessThanOrEqual(1);
      }
    }
    const motion = files(join(here, ".."))
      .filter((path) => path.endsWith(".css"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(motion).not.toMatch(/\blinear\(|\bspring\b|steps\(/);
  });
});
