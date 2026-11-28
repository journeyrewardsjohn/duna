/**
 * Guards both directions of the native boundary:
 * - `packages/ui/src/native/**` never imports DOM code: the package root, the
 *   web library (`tideline/`, except the pure interaction core and the token
 *   builder in tests), `web.tsx`, the web `Icon` component, `react-dom` or
 *   `@ui-sdk/*`;
 * - web code (`apps/web`, `apps/hq`, and `packages/ui` outside `native/`)
 *   never imports `@duna/ui/native*` or the native folder.
 * It also keeps the retired orange out of the native layer and Solar inside
 * live states.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const repo = join(here, "../../../..");
const skip = new Set([
  "node_modules",
  ".next",
  "dist",
  ".expo",
  "ios",
  "android",
  "build",
  ".turbo",
]);

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    if (skip.has(name)) return [];
    const path = join(root, name);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.(tsx?|mts)$/.test(name)
        ? [path]
        : [];
  });
}

const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (m) => m[1]!,
  );

/** Pure, DOM-free files outside `native/` that native code may import. */
const ALLOWED_OUTSIDE = [
  "icons/glyph-index",
  "icons/glyphs",
  "brand/geometry",
  "tideline/interactions/interaction-core",
  // The legacy native palette the layout primitives default to (no DOM).
  "mobile",
];

describe("native boundary", () => {
  it("native code never imports DOM code", () => {
    const offenders: string[] = [];
    for (const file of files(here)) {
      const test = /\.test\.tsx?$/.test(file) || file.includes("test-support");
      for (const spec of importsOf(readFileSync(file, "utf8"))) {
        const bad =
          spec === "@duna/ui" ||
          spec.startsWith("@duna/ui/tideline") ||
          spec === "@duna/ui/icons" ||
          spec === "react-dom" ||
          spec.startsWith("@ui-sdk/") ||
          /(^|\/)web(\.tsx)?$/.test(spec) ||
          (spec.startsWith("../") &&
            /\.\.\/(\.\.\/)+/.test(spec) &&
            !spec.startsWith("../layout") &&
            !ALLOWED_OUTSIDE.some((allowed) => spec.endsWith(allowed)) &&
            !(
              test &&
              (spec.endsWith("tideline/tokens/token-build") ||
                spec.endsWith("icons/index"))
            ));
        if (bad) offenders.push(`${relative(repo, file)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the shared pure files really are DOM-free", () => {
    for (const allowed of ALLOWED_OUTSIDE) {
      const source = readFileSync(join(here, "..", `${allowed}.ts`), "utf8");
      expect(
        importsOf(source).filter((spec) => !spec.startsWith("./")),
        allowed,
      ).toEqual([]);
      expect(source, allowed).not.toMatch(
        /document\.|window\.|react-dom|<(?:div|span|svg|path|button)\b/,
      );
    }
  });

  it("web never imports the native layer", () => {
    const roots = [
      join(repo, "apps/web"),
      join(repo, "apps/hq"),
      join(here, ".."),
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of files(root)) {
        if (file.startsWith(here)) continue;
        for (const spec of importsOf(readFileSync(file, "utf8"))) {
          // The generated token data is pure (no React Native); the legacy
          // palettes in mobile.ts and tokens.ts read it.
          if (spec.endsWith("native/tokens/tokens.native")) continue;
          if (
            spec.startsWith("@duna/ui/native") ||
            /(^|\/)native(\/|$)/.test(spec)
          ) {
            offenders.push(`${relative(repo, file)} imports ${spec}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no retired orange, and Solar only in the live states", () => {
    const retired =
      /#(?:e8683a|b84a20|f28a64|f4794c|e0602f|a8431c|e5532d|ff6a3d|ff8a5c)(?![0-9a-f])/i;
    for (const file of files(here)) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(repo, file)).not.toMatch(retired);
      if (/\.test\.|test-support|tokens\.native\.ts$/.test(file)) continue;
      const solar =
        /brand\.solar|colors\.live\b|colors\["live(?:-ink|-wash)?"\]|tone="live(?:-ink|-wash)?"/;
      if (solar.test(source)) {
        expect(relative(here, file), "Solar outside a live state").toMatch(
          /loaders\/loaders\.tsx$|foundations\//,
        );
      }
    }
  });
});
