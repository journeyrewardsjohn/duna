import { providerKeys, providersForFeature } from "@duna/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isProviderUsable,
  providerNotConfiguredBody,
  providerNotConfiguredResponse,
  loadProviderReadiness,
  providerStatus,
} from "./provider-readiness";

const stripe = {
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
};

describe("provider readiness", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is not-configured when any required group is missing or blank", () => {
    expect(providerStatus("email", {})).toBe("not-configured");
    expect(providerStatus("email", { RESEND_API_KEY: "re_x" })).toBe(
      "not-configured",
    );
    expect(
      providerStatus("email", {
        RESEND_API_KEY: "re_x",
        RESEND_FROM_EMAIL: "   ",
      }),
    ).toBe("not-configured");
    expect(
      providerStatus("email", {
        RESEND_API_KEY: "re_x",
        RESEND_FROM_EMAIL: "club@example.com",
      }),
    ).toBe("configured");
  });

  it("accepts any alternative name in a group", () => {
    expect(providerStatus("aiGateway", { VERCEL_OIDC_TOKEN: "t" })).toBe(
      "configured",
    );
  });

  it("derives Stripe test versus live from the key prefix", () => {
    expect(providerStatus("stripe", stripe)).toBe("configured");
    expect(
      providerStatus("stripeConnect", {
        ...stripe,
        STRIPE_SECRET_KEY: "sk_test_example",
      }),
    ).toBe("test-mode");
    expect(
      providerStatus("stripe", { ...stripe, STRIPE_SECRET_KEY: "rk_test_x" }),
    ).toBe("test-mode");
  });

  it("reports names only, never values", () => {
    const readiness = loadProviderReadiness({
      ...stripe,
      STRIPE_SECRET_KEY: "sk_test_secret_value",
    });
    const serialized = JSON.stringify(readiness);
    expect(serialized).not.toContain("sk_test_secret_value");
    expect(serialized).not.toContain("whsec_example");
    expect(readiness.providers.map((p) => p.key)).toEqual([...providerKeys]);
    const email = readiness.providers.find((p) => p.key === "email")!;
    expect(email.missing).toEqual(["RESEND_API_KEY", "RESEND_FROM_EMAIL"]);
  });

  it("makes no network call while deciding, and a gated adapter skips the call when not configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const key of providerKeys) providerStatus(key, {});
    loadProviderReadiness({});

    // The pattern every provider adapter follows.
    async function sendEmail() {
      if (!isProviderUsable("email", {})) {
        return { state: "provider-not-configured" as const };
      }
      await fetch("https://api.resend.com/emails", { method: "POST" });
      return { state: "sent" as const };
    }
    await expect(sendEmail()).resolves.toEqual({
      state: "provider-not-configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps flagged features to their providers", () => {
    expect(providersForFeature("concierge.channel.imessage")).toEqual([
      "imessage",
    ]);
    expect(providersForFeature("team.contractorPayouts")).toEqual([
      "stripeConnect",
    ]);
    expect(providersForFeature("training.scene3d")).toEqual([]);
  });

  it("answers a not-configured provider with a 200 body, not an error status", async () => {
    const response = providerNotConfiguredResponse("mapbox", "No map key yet.");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      state: "provider-not-configured",
      status: "not-configured",
      provider: "mapbox",
      message: "No map key yet.",
    });
    expect(providerNotConfiguredBody("mapbox")).not.toHaveProperty("message");
  });
});
