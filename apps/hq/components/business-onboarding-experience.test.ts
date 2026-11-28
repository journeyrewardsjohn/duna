import { ORGANIZATION_PLANS, formatMoney } from "@duna/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOrganizationMemberships: vi.fn(),
  withAuth: vi.fn(),
}));

vi.mock("@duna/api/workos-environment", () => ({
  isWorkOSAuthKitConfigured: () => true,
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({
    userManagement: {
      listOrganizationMemberships: mocks.listOrganizationMemberships,
    },
    organizations: { getOrganization: vi.fn() },
  }),
  switchToOrganization: vi.fn(),
  withAuth: mocks.withAuth,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import OrganizationOnboardingPage from "@/app/(legacy)/setup/start/page";
import { renderElementForTest } from "@/lib/render-for-test";

describe("business onboarding experience", () => {
  beforeEach(() => {
    mocks.withAuth.mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com" },
    });
    mocks.listOrganizationMemberships.mockResolvedValue({ data: [] });
  });

  it("presents the shared Duna HQ plans as the pricing comparison", async () => {
    const page = renderElementForTest(
      await OrganizationOnboardingPage({ searchParams: Promise.resolve({}) }),
    );

    // Monthly or annual is one radio decision.
    const intervals = page
      .elements("input")
      .filter((input) => input.name === "interval");
    expect(intervals.map((input) => input.value).sort()).toEqual([
      "month",
      "year",
    ]);
    expect(intervals.every((input) => input.type === "radio")).toBe(true);

    // Each plan shows the catalog name, price, and platform fee from
    // @duna/core, never a number typed into the page.
    const plans = page
      .elements("input")
      .filter((input) => input.name === "plan" && input.type === "radio")
      .map((input) => input.value as keyof typeof ORGANIZATION_PLANS);
    expect(plans.length).toBeGreaterThan(1);
    for (const plan of plans) {
      const definition = ORGANIZATION_PLANS[plan];
      expect(page.text).toContain(definition.productName);
      expect(page.text).toContain(`${definition.defaultCommissionBps / 100}%`);
      if (definition.monthlyPriceMinor > 0) {
        expect(page.text).toContain(
          formatMoney(definition.monthlyPriceMinor, "USD").replace(/\.00$/, ""),
        );
      }
    }
    expect(
      plans.filter((plan) => ORGANIZATION_PLANS[plan].monthlyPriceMinor > 0),
    ).not.toHaveLength(0);
  });
});
