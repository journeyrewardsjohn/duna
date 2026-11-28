import { hqRoutes } from "@duna/core/hq-routes";
import { glyphAliasNames, glyphNames } from "@duna/ui/icons";
import { describe, expect, it } from "vitest";
import {
  operatorModules,
  operatorNavigationGroups,
  operatorNavigationItems,
} from "./navigation";

// Setup on Home, the dedicated guide, mobile navigation, and the shared
// readiness steps in Settings are checked in the browser journeys.
describe("HQ navigation (docs/design/tideline-4.1.1/ia-hq.md)", () => {
  it("lists the owner's groups and items in order", () => {
    const groups = operatorNavigationGroups.map((group) => [
      group,
      operatorNavigationItems
        .filter((item) => item.group === group)
        .map((item) => item.label),
    ]);

    expect(groups).toEqual([
      ["Run the day", ["Today", "Schedule", "Inbox"]],
      [
        "People and play",
        ["People", "Team", "Training", "Events", "Offerings"],
      ],
      ["Money and setup", ["Money", "Club setup"]],
      ["Grow", ["Website", "Marketing", "Reports"]],
    ]);
    // Groups are contiguous, so the shell can draw one hairline per group.
    expect(operatorNavigationItems.map((item) => item.group)).toEqual(
      operatorNavigationGroups.flatMap((group) =>
        operatorNavigationItems
          .filter((item) => item.group === group)
          .map(() => group),
      ),
    );
  });

  it("keeps Club setup on the setup home", () => {
    expect(
      operatorNavigationItems.find((item) => item.slug === "setup"),
    ).toMatchObject({ label: "Club setup", href: hqRoutes.setup });
  });

  it("gives every module a unique id and address", () => {
    const slugs = operatorModules.map((module) => module.slug);
    const hrefs = operatorModules.map((module) => module.href);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("draws every item with a Duna icon", () => {
    const names = new Set<string>([...glyphNames, ...glyphAliasNames]);
    for (const item of operatorModules) {
      expect(names.has(item.icon), `${item.slug}: ${item.icon}`).toBe(true);
    }
  });
});
