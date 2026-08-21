import { describe, expect, it } from "vitest";
import {
  calculateCatalogInstallmentQuote,
  catalogOrderItemKind,
} from "./catalog-checkout";
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

  it("quotes a fixed pay-over-time total without losing cents", () => {
    expect(
      calculateCatalogInstallmentQuote({
        upfrontAmountMinor: 48_000,
        installmentCount: 4,
        priceIncreasePercent: 10,
      }),
    ).toEqual({
      installmentAmountMinor: 13_200,
      totalAmountMinor: 52_800,
      savingsAmountMinor: 4_800,
    });
    expect(
      calculateCatalogInstallmentQuote({
        upfrontAmountMinor: 10_001,
        installmentCount: 3,
        priceIncreasePercent: 0,
      }),
    ).toEqual({
      installmentAmountMinor: 3_334,
      totalAmountMinor: 10_002,
      savingsAmountMinor: 1,
    });
  });

  it("rejects installment pricing outside the supported guardrails", () => {
    expect(() =>
      calculateCatalogInstallmentQuote({
        upfrontAmountMinor: 48_000,
        installmentCount: 25,
        priceIncreasePercent: 10,
      }),
    ).toThrow("between 2 and 24");
    expect(() =>
      calculateCatalogInstallmentQuote({
        upfrontAmountMinor: 48_000,
        installmentCount: 4,
        priceIncreasePercent: 101,
      }),
    ).toThrow("between 0 and 100");
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
