import { describe, expect, it } from "vitest";
import {
  catalogCheckoutResumeReturnPath,
  consumeCatalogCheckoutResumeIntent,
  saveCatalogCheckoutResumeIntent,
  type CatalogCheckoutResumeInput,
} from "./catalog-checkout-resume";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const intent: CatalogCheckoutResumeInput = {
  organizationSlug: "beach-elite-vb-academy-X3N0ZSW4",
  productSlug: "beach-elite-academy-membership",
  checkoutRole: "product",
  variantId: "variant-1",
  selectedPriceId: "price-1",
  paymentMethod: "card",
  paymentOption: "upfront",
  quantity: 1,
  occurrenceId: "",
  recordingConsentAccepted: false,
  membershipPolicyAccepted: true,
  addMembership: true,
  idempotencyKey: "purchase-attempt-1",
  membershipIdempotencyKey: "membership-attempt-1",
};

describe("catalog checkout resume intent", () => {
  it("builds an exact product return path that requests checkout resumption", () => {
    expect(
      catalogCheckoutResumeReturnPath({
        organizationSlug: intent.organizationSlug,
        productSlug: intent.productSlug,
      }),
    ).toBe(
      "/clubs/beach-elite-vb-academy-X3N0ZSW4/products/beach-elite-academy-membership?resume_checkout=1#purchase",
    );
  });

  it("restores a matching intent once with its original idempotency keys", () => {
    const storage = memoryStorage();
    expect(saveCatalogCheckoutResumeIntent(storage, intent, 1_000)).toBe(true);

    expect(
      consumeCatalogCheckoutResumeIntent(
        storage,
        {
          organizationSlug: intent.organizationSlug,
          productSlug: intent.productSlug,
        },
        2_000,
      ),
    ).toMatchObject(intent);
    expect(
      consumeCatalogCheckoutResumeIntent(
        storage,
        {
          organizationSlug: intent.organizationSlug,
          productSlug: intent.productSlug,
        },
        2_000,
      ),
    ).toBeUndefined();
  });

  it("discards expired, malformed, or differently scoped intents", () => {
    const expiredStorage = memoryStorage();
    saveCatalogCheckoutResumeIntent(expiredStorage, intent, 1_000);
    expect(
      consumeCatalogCheckoutResumeIntent(
        expiredStorage,
        {
          organizationSlug: intent.organizationSlug,
          productSlug: intent.productSlug,
        },
        1_000 + 16 * 60 * 1_000,
      ),
    ).toBeUndefined();

    const wrongProductStorage = memoryStorage();
    saveCatalogCheckoutResumeIntent(wrongProductStorage, intent, 1_000);
    expect(
      consumeCatalogCheckoutResumeIntent(
        wrongProductStorage,
        {
          organizationSlug: intent.organizationSlug,
          productSlug: "another-product",
        },
        2_000,
      ),
    ).toBeUndefined();

    const malformedStorage = memoryStorage();
    malformedStorage.setItem("duna.catalog-checkout-resume.v1", "not-json");
    expect(
      consumeCatalogCheckoutResumeIntent(
        malformedStorage,
        {
          organizationSlug: intent.organizationSlug,
          productSlug: intent.productSlug,
        },
        2_000,
      ),
    ).toBeUndefined();
  });
});
