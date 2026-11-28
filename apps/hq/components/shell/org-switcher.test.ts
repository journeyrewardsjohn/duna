import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/workspace-actions", () => ({ switchWorkspaceAction: vi.fn() }));

import { createOrganizationHref, orgSwitcherEntries } from "./org-switcher";

const organization = {
  id: "org-current",
  name: "Sunset Beach Club",
  plan: "club" as const,
  timezone: "America/Los_Angeles",
  stripeStatus: "connected" as const,
};

describe("organisation switcher", () => {
  it("lists the person's organisations with the current one first", () => {
    expect(
      orgSwitcherEntries({
        organization,
        currentWorkspaceId: "org-b",
        workspaces: [
          { id: "org-c", name: "Zuma Juniors" },
          { id: "org-b", name: "Ocean Park" },
          { id: "org-a", name: "Avalon Beach" },
        ],
      }),
    ).toEqual([
      { id: "org-b", name: "Ocean Park", current: true },
      { id: "org-a", name: "Avalon Beach", current: false },
      { id: "org-c", name: "Zuma Juniors", current: false },
    ]);
  });

  it("shows the current organisation when sign-in offers no list (demo)", () => {
    expect(orgSwitcherEntries({ organization, workspaces: [] })).toEqual([
      { id: "org-current", name: "Sunset Beach Club", current: true },
    ]);
  });

  it("has nothing to switch to without an organisation", () => {
    expect(orgSwitcherEntries({ workspaces: [] })).toEqual([]);
  });

  it("creates a new organisation in Club setup's first run", () => {
    expect(createOrganizationHref).toBe("/setup/start?mode=create");
  });
});
