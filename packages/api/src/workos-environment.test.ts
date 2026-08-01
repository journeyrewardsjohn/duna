import { describe, expect, it } from "vitest";
import {
  isWorkOSAuthKitConfigured,
  isWorkOSConfigured,
  resolveWorkOSCredentials,
} from "./workos-environment";

describe("WorkOS environment resolution", () => {
  it("resolves a complete API credential pair", () => {
    expect(
      resolveWorkOSCredentials({
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_API_KEY: "sk_test",
      }),
    ).toEqual({
      clientId: "client_test",
      apiKey: "sk_test",
    });
  });

  it("does not configure WorkOS from a partial credential pair", () => {
    expect(
      resolveWorkOSCredentials({ WORKOS_CLIENT_ID: "client_test" }),
    ).toBeUndefined();
    expect(isWorkOSConfigured({ WORKOS_API_KEY: "sk_test" })).toBe(false);
  });

  it("requires the encrypted session inputs for AuthKit", () => {
    expect(
      isWorkOSAuthKitConfigured({
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_API_KEY: "sk_test",
        WORKOS_COOKIE_PASSWORD: "a".repeat(32),
      }),
    ).toBe(true);
    expect(
      isWorkOSAuthKitConfigured({
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_API_KEY: "sk_test",
        WORKOS_COOKIE_PASSWORD: "too-short",
      }),
    ).toBe(false);
  });
});
