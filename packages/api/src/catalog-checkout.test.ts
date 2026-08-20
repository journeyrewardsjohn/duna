import { describe, expect, it } from "vitest";
import { catalogOrderItemKind } from "./catalog-checkout";
import { catalogCheckoutResultSchema } from "./contracts";

describe("catalog transaction pricing", () => {
  it.each([
    [{ type: "event", subtype: "tournament" }, "registration"],
    [{ type: "service", subtype: "court-rental" }, "booking"],
    [{ type: "good", subtype: "apparel" }, "merchandise"],
    [{ type: "good", subtype: "digital-content" }, "merchandise"],
    [{ type: "plan", subtype: "membership" }, "membership"],
    [{ type: "plan", subtype: "credit-pack" }, "package"],
    [{ type: "plan", subtype: "bundle" }, "package"],
  ] as const)("maps %o to %s pricing", (input, expected) => {
    expect(catalogOrderItemKind(input)).toBe(expected);
  });
});

describe("native catalog payment contract", () => {
  const nativeResult = {
    mode: "stripe" as const,
    orderId: "7ca11da7-6ddb-4956-bce3-d2f2f5a450e9",
    orderStatus: "pending" as const,
    paymentSheet: {
      publishableKey: "pk_test_duna",
      paymentIntentId: "pi_catalog",
      paymentIntentClientSecret: "pi_catalog_secret_test",
      customerId: "cus_duna",
      customerSessionClientSecret: "cuss_test_duna",
    },
    expiresAt: "2026-08-12T20:00:00.000Z",
    paymentMethod: "card" as const,
    quantity: 1,
    amountMinor: 70000,
    creditsApplied: 0,
    currency: "USD" as const,
  };

  it("returns one complete native PaymentSheet bundle", () => {
    expect(catalogCheckoutResultSchema.parse(nativeResult)).toEqual(
      nativeResult,
    );
  });

  it("rejects a partial native PaymentSheet bundle", () => {
    const partialPaymentSheet = Object.fromEntries(
      Object.entries(nativeResult.paymentSheet).filter(
        ([key]) => key !== "customerSessionClientSecret",
      ),
    );
    expect(() =>
      catalogCheckoutResultSchema.parse({
        ...nativeResult,
        paymentSheet: partialPaymentSheet,
      }),
    ).toThrow();
  });
});
