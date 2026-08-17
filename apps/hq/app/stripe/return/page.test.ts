import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Stripe organization return", () => {
  it("restores the organization encoded into the onboarding return URL", () => {
    expect(source).toContain("canAccessWorkspace(organizationId)");
    expect(source).toContain("switchToOrganization(organizationId");
    expect(source).toContain("returnTo: destination");
  });

  it("keeps the organization intent when an expired session needs sign-in", () => {
    expect(source).toContain("/stripe/return?organizationId=");
    expect(source).toContain("encodeURIComponent(recoveryPath)");
  });
});
