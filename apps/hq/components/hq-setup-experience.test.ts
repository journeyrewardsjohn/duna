import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const setupPage = readFileSync(
  new URL("../app/setup/page.tsx", import.meta.url),
  "utf8",
);
const overview = readFileSync(
  new URL("./operator-overview.tsx", import.meta.url),
  "utf8",
);
const navigation = readFileSync(
  new URL("./navigation.ts", import.meta.url),
  "utf8",
);
const actionCenter = readFileSync(
  new URL("../../../packages/ui/src/duna-action-center.tsx", import.meta.url),
  "utf8",
);
const operatorShell = readFileSync(
  new URL("./operator-shell.tsx", import.meta.url),
  "utf8",
);
const settingsCenter = readFileSync(
  new URL("./settings-center.tsx", import.meta.url),
  "utf8",
);

describe("HQ setup experience", () => {
  it("makes setup visible from navigation, home, and the dedicated guide", () => {
    expect(navigation).toContain('slug: "setup"');
    expect(navigation).toContain('label: "Get started"');
    expect(overview).toContain('className="hq-setup-strip"');
    expect(setupPage).toContain("getOrganizationSetupReadiness");
    expect(setupPage).toContain("Ask Duna to guide me");
  });

  it("keeps mobile navigation understandable without hiding secondary tools", () => {
    expect(operatorShell).toContain("mobilePrimaryModules");
    expect(operatorShell).toContain("All HQ tools");
    expect(operatorShell).toContain("More");
  });

  it("does not let a late suggestions response erase an active AI question", () => {
    expect(actionCenter).toContain(
      'current.some(({ role }) => role === "user")',
    );
  });

  it("uses one readiness model across setup, settings, and Duna AI", () => {
    expect(settingsCenter).toContain("getOrganizationSetupReadiness");
    expect(settingsCenter).toContain("setupReadiness.steps.map");
  });
});
