import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const authSource = readFileSync(
  new URL("./auth-controls.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("./operator-shell.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/design-v3.css", import.meta.url),
  "utf8",
);

describe("HQ account menu", () => {
  it("keeps personal, organization, workspace, and sign-out actions together", () => {
    expect(authSource).toContain('href="/account"');
    expect(authSource).toContain('href="/settings"');
    expect(authSource).toContain('href="/onboarding"');
    expect(authSource).toContain("returnTo: new URL(");
    expect(shellSource).toContain("organizationName={organization.name}");
  });

  it("preserves keyboard, focus, and dismissal behavior", () => {
    expect(authSource).toContain("aria-controls={menuId}");
    expect(authSource).toContain("aria-expanded={menuOpen}");
    expect(authSource).toContain('event.key !== "Escape"');
    expect(authSource).toContain('document.addEventListener("pointerdown"');
    expect(authSource).toContain("triggerRef.current?.focus()");
  });

  it("uses an opaque menu surface", () => {
    expect(styles).toMatch(
      /\.hq-auth-menu__panel \{[\s\S]*?background: var\(--surface-1\);/,
    );
  });
});
