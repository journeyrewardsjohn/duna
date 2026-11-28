import { describe, expect, it } from "vitest";
import { operatorModules } from "./navigation";

// Setup on Home, the dedicated guide, mobile navigation, and the shared
// readiness steps in Settings are checked in the browser journeys.
describe("HQ setup navigation", () => {
  it("keeps Get started in the Today group, right after Home", () => {
    const today = operatorModules.filter((module) => module.group === "Today");

    expect(today.map((module) => module.slug).slice(0, 2)).toEqual([
      "overview",
      "setup",
    ]);
    expect(today.find((module) => module.slug === "setup")).toMatchObject({
      label: "Get started",
    });
  });

  it("gives every module a unique route slug", () => {
    const slugs = operatorModules.map((module) => module.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
