import { describe, expect, it } from "vitest";
import {
  activeModuleForPath,
  isPhoneBarModule,
  moduleLabel,
  navigationGroups,
  parseSidebarMode,
} from "./nav-state";

describe("HQ shell navigation state", () => {
  it("groups the sidebar in the owner's order with no hidden areas", () => {
    expect(
      navigationGroups().map((group) => [
        group.name,
        group.items.map((item) => item.label),
      ]),
    ).toEqual([
      ["Run the day", ["Today", "Schedule", "Inbox"]],
      [
        "People and play",
        ["People", "Team", "Training", "Events", "Offerings"],
      ],
      ["Money and setup", ["Money", "Club setup"]],
      ["Grow", ["Website", "Marketing", "Reports"]],
    ]);
  });

  it("marks exactly one current area for a path", () => {
    expect(activeModuleForPath("/")).toBe("today");
    expect(activeModuleForPath("/people/123")).toBe("people");
    expect(activeModuleForPath("/money/transactions/t1")).toBe("money");
    expect(activeModuleForPath("/training/programs/create")).toBe("training");
    expect(activeModuleForPath("/setup/places/v1/layout")).toBe("setup");
    expect(activeModuleForPath("/setup/start?mode=create")).toBe("setup");
    expect(activeModuleForPath("/events?type=league")).toBe("events");
    expect(activeModuleForPath("/ask/abc")).toBe("ask");
    expect(activeModuleForPath("/settings")).toBe("settings");
  });

  it("never claims a wrong area for an unknown or look-alike path", () => {
    expect(activeModuleForPath("/peoplex")).toBeUndefined();
    expect(activeModuleForPath("/unknown/page")).toBeUndefined();
    expect(activeModuleForPath("/people/")).toBe("people");
  });

  it("labels areas for the top bar and Ask Duna", () => {
    expect(moduleLabel("setup")).toBe("Club setup");
    expect(moduleLabel(undefined)).toBe("HQ");
  });

  it("remembers only the two sidebar choices", () => {
    expect(parseSidebarMode("collapsed")).toBe("collapsed");
    expect(parseSidebarMode("expanded")).toBe("expanded");
    expect(parseSidebarMode("narrow")).toBeUndefined();
    expect(parseSidebarMode(undefined)).toBeUndefined();
  });

  it("keeps four areas in the phone bar; the rest are under More", () => {
    expect(isPhoneBarModule("today")).toBe(true);
    expect(isPhoneBarModule("money")).toBe(false);
  });
});
