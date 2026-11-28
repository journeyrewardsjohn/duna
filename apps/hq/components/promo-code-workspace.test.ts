import type { PromoCodeWorkspace } from "@duna/api";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(legacy)/marketing/promo-codes/actions", () => ({
  createPromoCodeAction: vi.fn(),
  deactivatePromoCodeAction: vi.fn(),
  duplicatePromoCodeAction: vi.fn(),
}));

import { renderForTest } from "@/lib/render-for-test";
import { PromoCodeWorkspaceView } from "./promo-code-workspace";

type Promo = PromoCodeWorkspace["promoCodes"][number];

function promo(overrides: Partial<Promo>): Promo {
  const id = overrides.id ?? "40000000-0000-4000-8000-000000000001";
  return {
    id,
    code: "SUMMER20",
    name: "Summer clinic launch",
    currency: "USD",
    discountType: "percent",
    discountValue: 2000,
    active: true,
    activeNow: true,
    lifecycle: "active",
    revision: 1,
    appliesToAllPlans: true,
    appliesToAllProducts: true,
    appliesToAllServices: true,
    catalogItems: [],
    members: [],
    stripeSyncStatus: "synced",
    metrics: {
      redemptions: 3,
      grossSalesMinor: 30_000,
      netSalesMinor: 24_000,
      discountsMinor: 6_000,
    },
    lineage: [
      {
        id,
        code: "SUMMER20",
        name: "Summer clinic launch",
        revision: 1,
        supersedesPromoCodeId: null,
        active: true,
        lifecycle: "active",
        createdAt: "2026-07-01T16:00:00.000Z",
      },
    ],
    ...overrides,
  } as Promo;
}

function workspace(promoCodes: Promo[] = []): PromoCodeWorkspace {
  return {
    organization: {
      id: "10000000-0000-4000-8000-000000000001",
      name: "South Bay Volleyball Club",
      currency: "USD",
    },
    catalog: [],
    members: [],
    promoCodes,
  } as PromoCodeWorkspace;
}

describe("promo code creation workspace", () => {
  it("presents the promotion as a guided four-stage decision flow", () => {
    const view = renderForTest(PromoCodeWorkspaceView, {
      workspace: workspace(),
    });
    const stepper = view.html.slice(
      view.html.indexOf('aria-label="Promotion creation steps"'),
      view.html.indexOf("<form"),
    );

    for (const label of [
      "The offer",
      "Eligible purchases",
      "Availability",
      "Review and create",
    ]) {
      expect(stepper).toContain(label);
    }
    // Only the first stage is open; later stages unlock in order.
    expect(stepper.match(/aria-current="step"/g)).toHaveLength(1);
    expect(stepper.match(/<button[^>]*\sdisabled=""/g)).toHaveLength(3);
  });

  it("keeps a live summary beside the active stage", () => {
    const view = renderForTest(PromoCodeWorkspaceView, {
      workspace: workspace(),
    });

    expect(view.elements("aside")).toContainEqual(
      expect.objectContaining({
        class: "promo-preview",
        "aria-label": "Promotion preview",
      }),
    );
    expect(view.text).toContain("What you’re creating");
  });

  it("offers optional offer constraints without asking for them up front", () => {
    const view = renderForTest(PromoCodeWorkspaceView, {
      workspace: workspace(),
    });

    expect(view.text).toContain("Set a minimum purchase");
    expect(view.text).toContain("Cap the discount");
    // The amount fields stay hidden until the operator turns a limit on.
    const visibleNames = view
      .elements("input")
      .filter((input) => input.type !== "hidden")
      .map((input) => input.name);
    expect(visibleNames).not.toContain("minimumPurchase");
    expect(visibleNames).not.toContain("maximumDiscount");
  });

  it("submits the complete draft from any stage", () => {
    const hidden = renderForTest(PromoCodeWorkspaceView, {
      workspace: workspace(),
    })
      .elements("input")
      .filter((input) => input.type === "hidden")
      .map((input) => input.name);

    for (const field of [
      "name",
      "code",
      "discountType",
      "discountValue",
      "minimumPurchase",
      "maximumDiscount",
    ]) {
      expect(hidden).toContain(field);
    }
  });

  it("explains how deactivation preserves campaign history", () => {
    const view = renderForTest(PromoCodeWorkspaceView, {
      workspace: workspace([
        promo({}),
        promo({
          id: "40000000-0000-4000-8000-000000000002",
          code: "SPRING10",
          active: false,
          activeNow: false,
          lifecycle: "inactive",
        }),
      ]),
    });

    expect(view.text).toContain(
      "Deactivate a code to stop future redemptions. Its history stays here for reporting.",
    );
    expect(view.text).toContain("Deactivate code");
    expect(view.text).toContain("Deactivated · history retained");
  });

  it("offers a linked successor only for the newest version and shows the history", () => {
    const first = "40000000-0000-4000-8000-000000000001";
    const second = "40000000-0000-4000-8000-000000000002";
    const lineage = [
      {
        id: first,
        code: "SUMMER20",
        name: "Summer clinic launch",
        revision: 1,
        supersedesPromoCodeId: null,
        active: false,
        lifecycle: "inactive" as const,
        createdAt: "2026-07-01T16:00:00.000Z",
      },
      {
        id: second,
        code: "SUMMER25",
        name: "Summer clinic launch",
        revision: 2,
        supersedesPromoCodeId: first,
        active: true,
        lifecycle: "active" as const,
        createdAt: "2026-07-10T16:00:00.000Z",
      },
    ];
    const view = renderForTest(PromoCodeWorkspaceView, {
      workspace: workspace([
        promo({
          id: first,
          active: false,
          activeNow: false,
          lifecycle: "inactive",
          lineage,
        }),
        promo({ id: second, code: "SUMMER25", revision: 2, lineage }),
      ]),
    });

    expect(view.text).toContain("Version history · 2");
    expect(view.text).toContain("V1 SUMMER20");
    expect(view.text).toContain("V2 SUMMER25");
    // The superseded code cannot be branched again.
    expect(view.text.match(/Edit as new version/g)).toHaveLength(1);
  });
});
