import type { OperatorWorkspace } from "@duna/api";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ setCatalogItemStatusAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { renderForTest } from "@/lib/render-for-test";
import { ProductDraftReady } from "./product-draft-ready";

const itemId = "50000000-0000-4000-8000-000000000001";
const item = {
  id: itemId,
  title: "Private serve lesson",
  shortSummary: "One hour of serve mechanics with video review.",
  type: "service",
  status: "draft",
  configuration: {},
  variants: [
    {
      id: "variant-1",
      prices: [{ active: true, paymentKind: "card", amountMinor: 9_000 }],
    },
  ],
  media: [],
} as unknown as OperatorWorkspace["catalog"][number];

// The demo catalog is empty, so a saved draft cannot be reached in the
// browser; the builder's own gates are covered here.
describe("guided product draft workflow", () => {
  it("takes a saved draft to an explicit publish decision", () => {
    const page = renderForTest(ProductDraftReady, { currency: "USD", item });

    expect(page.text).toContain("Your changes are saved.");
    expect(page.text).toContain("Private serve lesson is private for now.");
    expect(page.text).toContain("$90.00");

    // Publishing is a confirmed status change for this item, not navigation.
    const hidden = Object.fromEntries(
      page
        .elements("input")
        .filter((input) => input.type === "hidden")
        .map((input) => [input.name, input.value]),
    );
    expect(hidden).toMatchObject({
      catalogItemId: itemId,
      status: "active",
      confirmed: "true",
    });
    expect(page.text).toContain("Publish Live");

    const links = page.elements("a").map((link) => link.href);
    expect(links).toContain(`/offerings/${itemId}`);
    expect(links).toContain("/offerings");
    expect(page.text).toContain("Edit draft");
    expect(page.text).toContain("See all products");
  });
});
