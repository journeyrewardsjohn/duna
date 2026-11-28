/**
 * Motion never gates content (docs/mobile/DESIGN_SYSTEM.md). An `Animated`
 * completion callback (`.start(({ finished }) => ...)`) can silently never
 * fire on the native driver, so nothing may depend on one directly: callbacks
 * go through `runWithWatchdog`, whose `onFinish` also runs when the watchdog
 * fires. This asserts that no source file in the kit or the apps passes a
 * callback to `.start(`; only `watchdog.ts` does.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const repo = join(here, "../../../../..");
const roots = [
  join(repo, "packages/ui/src/native"),
  join(repo, "apps/player/src"),
  join(repo, "apps/pro/src"),
];
const skip = new Set(["node_modules", "test-support"]);

function sources(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    if (skip.has(name)) return [];
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// `.start(` given an inline function: a completion callback.
const WITH_CALLBACK =
  /\.start\(\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>|\.start\(\s*function/;

describe("motion never gates content", () => {
  it("no completion callback is passed to Animated .start() outside watchdog.ts", () => {
    const offenders = roots
      .flatMap(sources)
      .filter((file) => !file.endsWith("motion/watchdog.ts"))
      .filter((file) => WITH_CALLBACK.test(readFileSync(file, "utf8")))
      .map((file) => relative(repo, file));
    expect(offenders).toEqual([]);
  });
});
