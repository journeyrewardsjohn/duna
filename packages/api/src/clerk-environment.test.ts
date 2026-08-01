import { describe, expect, it } from "vitest";
import {
  isClerkConfigured,
  resolveClerkCredentials,
} from "./clerk-environment";

describe("Clerk environment resolution", () => {
  it("prefers a complete production credential pair", () => {
    expect(
      resolveClerkCredentials({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_production",
        CLERK_SECRET_KEY: "sk_live_production",
        CLERK_PUB_KEY_DEV: "pk_test_development",
        CLERK_SECRET_KEY_DEV: "sk_test_development",
      }),
    ).toEqual({
      publishableKey: "pk_live_production",
      secretKey: "sk_live_production",
      source: "production",
    });
  });

  it("falls back to the complete development credential pair", () => {
    expect(
      resolveClerkCredentials({
        CLERK_PUB_KEY_DEV: "pk_test_development",
        CLERK_SECRET_KEY_DEV: "sk_test_development",
      }),
    ).toEqual({
      publishableKey: "pk_test_development",
      secretKey: "sk_test_development",
      source: "development",
    });
  });

  it("does not combine partial credentials from different instances", () => {
    const environment = {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_production",
      CLERK_SECRET_KEY_DEV: "sk_test_development",
    };
    expect(resolveClerkCredentials(environment)).toBeUndefined();
    expect(isClerkConfigured(environment)).toBe(false);
  });
});
