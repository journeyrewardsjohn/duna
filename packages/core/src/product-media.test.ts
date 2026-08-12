import { describe, expect, it } from "vitest";
import { DUNA_PRODUCT_MEDIA, productMediaForKind } from "./product-media";

describe("product media library", () => {
  it("keeps a unique, optimized cover set for commerce cards", () => {
    expect(DUNA_PRODUCT_MEDIA).toHaveLength(10);
    expect(new Set(DUNA_PRODUCT_MEDIA.map((item) => item.id)).size).toBe(10);
    expect(
      DUNA_PRODUCT_MEDIA.every((item) =>
        item.path.startsWith("/media/product-library/duna-product-"),
      ),
    ).toBe(true);
    expect(
      DUNA_PRODUCT_MEDIA.every((item) => item.path.endsWith(".webp")),
    ).toBe(true);
  });

  it.each([
    ["membership", "club-community"],
    ["credit-pack", "credit-pack"],
    ["bundle", "training-bundle"],
    ["private-lesson", "private-lesson"],
    ["group-lesson", "group-lesson"],
    ["apparel", "club-apparel"],
  ])("prioritizes %s imagery", (kind, expectedId) => {
    expect(productMediaForKind(kind)[0]?.id).toBe(expectedId);
  });

  it("keeps every image available after prioritizing a subtype", () => {
    expect(productMediaForKind("membership")).toHaveLength(
      DUNA_PRODUCT_MEDIA.length,
    );
  });
});
