import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { catalogCheckoutFailure } from "./catalog-checkout-error";

describe("catalog checkout failures", () => {
  it("keeps authentication requirements out of generic error copy", () => {
    expect(
      catalogCheckoutFailure(
        new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" }),
      ),
    ).toEqual({ authRequired: true });
  });

  it("keeps non-authentication checkout failures visible", () => {
    expect(
      catalogCheckoutFailure(new Error("Inventory is unavailable.")),
    ).toEqual({
      authRequired: false,
      error: "Inventory is unavailable.",
    });
  });
});
