import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: mocks.useAuth,
}));

import { renderForTest } from "@/lib/render-for-test";
import { AuthControls } from "./auth-controls";

// What this file can prove without a browser: the first paint of the account
// control in each session state. Opening the menu, Escape, outside-click
// dismissal, and focus return need a WorkOS session that demo mode does not
// have; the organization switcher shares that dismissal code and is driven in
// tests/e2e/hq-ui-contracts.spec.ts.
describe("HQ account control", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.useAuth.mockReturnValue({
      loading: false,
      organizationId: "org_1",
      signOut: vi.fn(),
      user: {
        email: "mara@example.com",
        firstName: "Mara",
        lastName: "Santos",
        profilePictureUrl: null,
      },
    });
  });

  it("exposes the signed-in account menu as a closed, labelled disclosure", () => {
    const control = renderForTest(AuthControls, { configured: true });
    const [trigger] = control.elements("button");

    expect(control.elements("button")).toHaveLength(1);
    expect(trigger).toMatchObject({
      "aria-expanded": "false",
      "aria-label": "Open account menu for Mara Santos",
      type: "button",
    });
    expect(trigger?.["aria-controls"]).toBeTruthy();
    expect(control.text).toBe("MS");
    // The panel is not in the document until the trigger opens it.
    expect(control.html).not.toContain("hq-auth-menu__panel");
  });

  it("offers sign-in when the session has no user", () => {
    mocks.useAuth.mockReturnValue({
      loading: false,
      organizationId: undefined,
      signOut: vi.fn(),
      user: null,
    });
    const control = renderForTest(AuthControls, { configured: true });

    expect(control.elements("a")).toEqual([
      expect.objectContaining({ href: "/sign-in" }),
    ]);
    expect(control.elements("button")).toHaveLength(0);
  });

  it("renders nothing while the session is still loading", () => {
    mocks.useAuth.mockReturnValue({
      loading: true,
      organizationId: undefined,
      signOut: vi.fn(),
      user: null,
    });

    expect(renderForTest(AuthControls, { configured: true }).html).toBe("");
  });

  it("labels the preview environment instead of pretending to be signed in", () => {
    const control = renderForTest(AuthControls, { configured: false });

    expect(control.text).toBe("Preview");
    expect(mocks.useAuth).not.toHaveBeenCalled();
  });
});
