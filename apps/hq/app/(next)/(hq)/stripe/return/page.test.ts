import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessWorkspace: vi.fn(),
  redirect: vi.fn((destination: string) => {
    // next/navigation's redirect never returns; model that with a throw.
    throw new Error(`redirect:${destination}`);
  }),
  switchToOrganization: vi.fn(),
  withAuth: vi.fn(),
  authConfigured: vi.fn(() => true),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  switchToOrganization: mocks.switchToOrganization,
  withAuth: mocks.withAuth,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@duna/api/workos-environment", () => ({
  isWorkOSAuthKitConfigured: mocks.authConfigured,
}));
vi.mock("@/lib/workspace-options", () => ({
  canAccessWorkspace: mocks.canAccessWorkspace,
}));

import StripeOrganizationReturnPage from "./page";

const organizationId = "20000000-0000-4000-8000-000000000001";

function open(searchParams: { organizationId?: string; result?: string }) {
  return StripeOrganizationReturnPage({
    searchParams: Promise.resolve(searchParams),
  });
}

describe("Stripe organization return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withAuth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.canAccessWorkspace.mockResolvedValue(true);
    mocks.authConfigured.mockReturnValue(true);
  });

  it("goes straight to Duna Pay setup without sign-in (demo, local)", async () => {
    mocks.authConfigured.mockReturnValue(false);
    await expect(open({ organizationId })).rejects.toThrow(
      "redirect:/money/duna-pay?stripe=return",
    );
    expect(mocks.withAuth).not.toHaveBeenCalled();
  });

  it("restores the organization encoded into the onboarding return URL", async () => {
    await open({ organizationId });

    expect(mocks.canAccessWorkspace).toHaveBeenCalledWith(organizationId);
    expect(mocks.switchToOrganization).toHaveBeenCalledWith(organizationId, {
      returnTo: "/money/duna-pay?stripe=return",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns to the refresh state when Stripe asks to restart onboarding", async () => {
    await open({ organizationId, result: "refresh" });

    expect(mocks.switchToOrganization).toHaveBeenCalledWith(organizationId, {
      returnTo: "/money/duna-pay?stripe=refresh",
    });
  });

  it("keeps the organization intent when an expired session needs sign-in", async () => {
    mocks.withAuth.mockResolvedValue({ user: null });

    await expect(open({ organizationId, result: "refresh" })).rejects.toThrow(
      "redirect:",
    );

    const destination = new URL(
      mocks.redirect.mock.calls[0]?.[0] ?? "",
      "https://hq.duna.local",
    );
    expect(destination.pathname).toBe("/sign-in");
    const recovery = new URL(
      destination.searchParams.get("returnTo") ?? "",
      "https://hq.duna.local",
    );
    expect(recovery.pathname).toBe("/stripe/return");
    expect(recovery.searchParams.get("organizationId")).toBe(organizationId);
    expect(recovery.searchParams.get("result")).toBe("refresh");
    expect(mocks.switchToOrganization).not.toHaveBeenCalled();
  });

  it("refuses an organization the signed-in person cannot access", async () => {
    mocks.canAccessWorkspace.mockResolvedValue(false);

    await expect(open({ organizationId })).rejects.toThrow(
      "redirect:/setup/start?error=workspace",
    );
    expect(mocks.switchToOrganization).not.toHaveBeenCalled();
  });

  it("refuses a return URL without an organization", async () => {
    await expect(open({})).rejects.toThrow(
      "redirect:/setup/start?error=workspace",
    );
    expect(mocks.canAccessWorkspace).not.toHaveBeenCalled();
    expect(mocks.switchToOrganization).not.toHaveBeenCalled();
  });
});
