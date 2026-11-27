/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// App.tsx is the native entry point. Feature code belongs in its own module so
// screens can change independently; this budget stops the entry growing back
// into a monolith. Lower it when the entry shrinks. Never raise it to make room
// for feature code.
const appEntryLineBudget = 40;

describe("Pro app entry", () => {
  it("stays within its line budget", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const lineCount = source.trimEnd().split("\n").length;

    expect(
      lineCount,
      `App.tsx has ${lineCount} lines; the budget is ${appEntryLineBudget}. Move feature code into its own module instead of raising the budget.`,
    ).toBeLessThanOrEqual(appEntryLineBudget);
  });
});
