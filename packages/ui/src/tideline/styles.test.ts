import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The package build also compiles this test into dist/, where the style
// sources are not copied. Always read them from src/.
const here = import.meta.dirname.replace(
  /([\\/])dist([\\/]tideline)$/,
  "$1src$2",
);
const repo = join(here, "../../../..");
const read = (path: string) => readFileSync(join(here, path), "utf8");
const stripComments = (css: string) => css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

/** Folders under tideline/ that hold a component family (they have index.ts). */
const families = readdirSync(here)
  .filter((name) => statSync(join(here, name)).isDirectory())
  .filter((name) => existsSync(join(here, name, "index.ts")))
  .sort();
/** Family stylesheets: `<family>/<family>.css`, excluding generated tokens. */
const stylesheets = families
  .filter((name) => existsSync(join(here, name, `${name}.css`)))
  .map((name) => ({ name, css: stripComments(read(`${name}/${name}.css`)) }));
const all = stylesheets.map((sheet) => sheet.css).join("\n");

describe("Tideline folder convention", () => {
  it("the styles index only declares the layers and imports, one per family", () => {
    const lines = stripComments(read("styles.css"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines[0]).toBe("@layer ui-sdk, tideline;");
    expect(lines[1]).toBe('@import "./tokens/tokens.css";');
    const imports = lines.slice(2);
    for (const line of imports) {
      expect(line).toMatch(/^@import "\.\/([a-z-]+)\/\1\.css";$/);
    }
    const imported = imports.map((line) => line.split("/")[1]);
    expect(new Set(imported).size, "a family is imported twice").toBe(
      imported.length,
    );
    expect([...imported].sort()).toEqual(stylesheets.map(({ name }) => name));
  });

  it("the package barrel is one export line per family", () => {
    const lines = read("index.ts")
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      expect(line).toMatch(/^export \* from "\.\/[a-z-]+";$/);
    }
    const exported = lines.map((line) => line.split('"./')[1]!.slice(0, -2));
    expect(new Set(exported).size, "a family is exported twice").toBe(
      exported.length,
    );
    expect([...exported].sort()).toEqual(families);
  });

  it("only Tideline imports UI SDK", () => {
    const offenders: string[] = [];
    const skip = new Set([
      "node_modules",
      ".next",
      ".turbo",
      ".expo",
      ".eve",
      "dist",
      "ios",
      "android",
      "build",
    ]);
    const tideline = join(repo, "packages/ui/src/tideline");
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!skip.has(entry.name) && path !== tideline) walk(path);
        } else if (/\.(c|m)?(t|j)sx?$/.test(entry.name)) {
          if (
            /from\s+["']@ui-sdk\/|import\(\s*["']@ui-sdk\//.test(
              readFileSync(path, "utf8"),
            )
          ) {
            offenders.push(path.slice(repo.length + 1));
          }
        }
      }
    };
    for (const root of ["apps", "packages"]) walk(join(repo, root));
    expect(offenders).toEqual([]);
  });

  it("keeps the library out of the shared and React Native entries", () => {
    for (const entry of ["index.ts", "mobile.ts", "tokens.ts", "theme.ts"]) {
      expect(readFileSync(join(here, "..", entry), "utf8")).not.toContain(
        "tideline",
      );
    }
  });
});

describe("Tideline stylesheet rules", () => {
  it("keeps every rule inside the tideline layer and the .td scope", () => {
    for (const { name, css } of stylesheets) {
      const body = css.trim();
      expect(body.startsWith("@layer tideline {"), name).toBe(true);
      // Inside the layer the only top-level blocks are `.td` and keyframes.
      const topLevel = body.match(/^ {2}[^\s}][^{]*(?=\{$)/gm) ?? [];
      expect(
        topLevel.every(
          (rule) =>
            rule.trim() === ".td" || rule.trim().startsWith("@keyframes td-"),
        ),
        `${name}: ${topLevel.join(" | ")}`,
      ).toBe(true);
    }
  });

  it("uses tokens, not raw colours", () => {
    expect(all).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(all).not.toMatch(/\brgba?\(/);
  });

  it("never sets text below the 12px tab-label floor", () => {
    const sizes = [...all.matchAll(/font-size:\s*(\d+)px/g)].map((match) =>
      Number(match[1]),
    );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    // The published 11px `tab-label` is under the floor, so nothing uses it.
    expect(all).not.toContain("--td-type-tab-label");
  });

  it("uses no important declarations", () => {
    // The cascade layer and specificity win instead; legacy-bridge.css hands
    // properties back from unlayered host CSS.
    for (const { name, css } of stylesheets) {
      expect(css, `${name}.css`).not.toMatch(/!\s*important/i);
    }
    expect(stripComments(read("legacy-bridge.css"))).not.toMatch(
      /!\s*important/i,
    );
  });

  it("sets the primary label colour for links and children", () => {
    const button = stylesheets.find(({ name }) => name === "button")!.css;
    expect(button).toMatch(
      /a\.td-btn--primary:is\(:link, :visited, :hover, :active, :focus\)/,
    );
    expect(button).toContain("-webkit-text-fill-color: var(--td-on-action);");
    // Against unlayered host CSS the bridge hands both properties back.
    const bridge = stripComments(read("legacy-bridge.css"));
    expect(bridge).toContain("color: revert-layer;");
    expect(bridge).toContain("-webkit-text-fill-color: revert-layer;");
  });

  it("gives every loop a reduced-motion resting state in its own family", () => {
    const animated = new Set(
      [...all.matchAll(/animation:\s*(td-[a-z-]+)/g)].map((match) => match[1]),
    );
    expect(animated).toEqual(
      new Set([
        "td-spin",
        "td-pulse",
        "td-sunrise",
        "td-sweep",
        "td-shimmer",
        "td-tide-sweep",
        // The brand loaders (loops with a resting state).
        "td-crest-swell",
        "td-crest-grow",
        "td-cross-travel",
        "td-cross-arc",
        "td-serve-draw",
        // The Undo window's line (once).
        "td-toast-countdown",
        // The motion verbs and the first open (once each).
        "td-rise",
        "td-cross",
        "td-fade-out",
        "td-digit",
        "td-line-stand",
        "td-crest-rise",
        "td-draw",
        "td-page-turn",
      ]),
    );
    const marker = "@media (prefers-reduced-motion: reduce)";
    for (const { name, css } of stylesheets) {
      if (!/animation:\s*td-/.test(css)) continue;
      expect(css, `${name}.css has no reduced-motion block`).toContain(marker);
    }
    const reduced = (name: string) => {
      const css = stylesheets.find((sheet) => sheet.name === name)!.css;
      return css.slice(css.lastIndexOf(marker));
    };
    for (const [name, selector] of [
      ["loaders", ".td-spinner"],
      ["loaders", ".td-sunrise__arc"],
      ["loaders", ".td-sweep::after"],
      ["loaders", ".td-skel"],
      ["surfaces", ".td-chip--live::before"],
      ["progress", ".td-progress__fill[data-indeterminate]"],
      ["loaders", ".td-rallyloader__crest"],
      ["loaders", ".td-crossing__travel"],
      ["loaders", ".td-serve__stroke"],
      ["toast", ".td-toast__countdown"],
      ["motion", ".td-firstopen"],
    ] as const) {
      expect(reduced(name), selector).toContain(selector);
    }
  });
});
