import { describe, expect, it } from "vitest";
import { connectAccountSupportsOnBehalfOf } from "./stripe-connect";

describe("connected-account settlement merchant support", () => {
  it("keeps recipient-only transfer accounts off on_behalf_of", () => {
    expect(
      connectAccountSupportsOnBehalfOf({
        charges_enabled: true,
        capabilities: { transfers: "active" },
      }),
    ).toBe(false);
  });

  it("does not infer card capability from charges_enabled", () => {
    expect(
      connectAccountSupportsOnBehalfOf({
        charges_enabled: true,
        capabilities: {},
      }),
    ).toBe(false);
  });

  it("allows legacy accounts with active card payments", () => {
    expect(
      connectAccountSupportsOnBehalfOf({
        charges_enabled: true,
        capabilities: { card_payments: "active", transfers: "active" },
      }),
    ).toBe(true);
  });

  it("allows Accounts v2 merchant capability payloads", () => {
    expect(
      connectAccountSupportsOnBehalfOf({
        configuration: {
          merchant: {
            applied: true,
            capabilities: { card_payments: { status: "active" } },
          },
        },
      }),
    ).toBe(true);
  });
});
