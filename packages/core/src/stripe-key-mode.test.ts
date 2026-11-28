import { describe, expect, it } from "vitest";
import { assertStripeBootstrapAllowed, stripeKeyMode } from "./stripe-key-mode";

describe("Stripe key mode (defect 6)", () => {
  it("reads the mode from the key prefix", () => {
    expect(stripeKeyMode("sk_test_x")).toBe("sandbox");
    expect(stripeKeyMode("rk_test_x")).toBe("sandbox");
    expect(stripeKeyMode("sk_live_x")).toBe("live");
    expect(stripeKeyMode("rk_live_x")).toBe("live");
    expect(stripeKeyMode("pk_live_x")).toBeUndefined();
    expect(stripeKeyMode(undefined)).toBeUndefined();
  });

  it("accepts live keys with an explicit confirmation, sandbox keys without", () => {
    expect(assertStripeBootstrapAllowed({ key: "sk_test_x", argv: [] })).toBe(
      "sandbox",
    );
    expect(() =>
      assertStripeBootstrapAllowed({ key: "sk_live_x", argv: [] }),
    ).toThrow(/--confirm-live/);
    expect(
      assertStripeBootstrapAllowed({
        key: "sk_live_x",
        argv: ["--confirm-live"],
      }),
    ).toBe("live");
    expect(() =>
      assertStripeBootstrapAllowed({ key: "nope", argv: [] }),
    ).toThrow();
  });
});
