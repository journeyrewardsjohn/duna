import { describe, expect, it } from "vitest";
import {
  catalogAuthenticationHref,
  catalogPurchaseAuthContext,
} from "./catalog-auth";

describe("catalog authentication handoff", () => {
  it("keeps the exact product return path and purchase context", () => {
    const href = catalogAuthenticationHref({
      returnTo:
        "/clubs/beach-elite-vb-academy-X3N0ZSW4/products/beach-elite-academy-membership#purchase",
      productTitle: "Beach Elite Academy Membership",
      organizationName: "Beach Elite VB Academy",
    });
    const url = new URL(href, "https://duna.coach");

    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("returnTo")).toBe(
      "/clubs/beach-elite-vb-academy-X3N0ZSW4/products/beach-elite-academy-membership#purchase",
    );
    expect(url.searchParams.get("product")).toBe(
      "Beach Elite Academy Membership",
    );
    expect(url.searchParams.get("organization")).toBe("Beach Elite VB Academy");
  });

  it("normalizes display-only context and rejects unsafe return paths", () => {
    expect(
      catalogPurchaseAuthContext({
        product: "  Beach Elite\n Academy Membership  ",
        organization: " Beach Elite VB Academy ",
      }),
    ).toEqual({
      productTitle: "Beach Elite Academy Membership",
      organizationName: "Beach Elite VB Academy",
    });
    expect(
      catalogPurchaseAuthContext({
        product: ["Membership", "Outside offer"],
        organization: "Beach Elite",
      }),
    ).toBeUndefined();

    const href = catalogAuthenticationHref({
      mode: "sign-up",
      returnTo: "//outside.example/checkout",
      productTitle: "Membership",
      organizationName: "Beach Elite",
    });
    expect(
      new URL(href, "https://duna.coach").searchParams.get("returnTo"),
    ).toBe("/app");
  });
});
