import { describe, expect, it } from "vitest";
import { loadDemoOperatorWorkspace } from "./operator-service";
import { getOrganizationSetupReadiness } from "./organization-setup";

describe("organization setup readiness", () => {
  it("returns ordered, actionable setup steps from live workspace facts", () => {
    const workspace = loadDemoOperatorWorkspace(
      "10000000-0000-4000-8000-000000000001",
      new Date("2026-09-08T14:00:00.000Z"),
    );
    const readiness = getOrganizationSetupReadiness(workspace);

    expect(readiness.steps.map(({ id }) => id)).toEqual([
      "business",
      "venue",
      "people",
      "brand",
      "payments",
      "offering",
    ]);
    expect(readiness.totalCount).toBe(6);
    expect(readiness.completedCount).toBeGreaterThanOrEqual(0);
    expect(readiness.completedCount).toBeLessThanOrEqual(6);
    if (readiness.nextStep) {
      expect(readiness.nextStep.href).toMatch(/^\//);
    } else {
      expect(readiness.complete).toBe(true);
    }
  });

  it("does not mark a published brand ready without identity assets", () => {
    const workspace = loadDemoOperatorWorkspace(
      "10000000-0000-4000-8000-000000000001",
      new Date("2026-09-08T14:00:00.000Z"),
    );
    const readiness = getOrganizationSetupReadiness({
      ...workspace,
      theme: {
        ...workspace.theme,
        publishedAt: "2026-09-08T14:00:00.000Z",
        logoUrl: undefined,
        markUrl: undefined,
      },
    });

    expect(readiness.steps.find(({ id }) => id === "brand")?.complete).toBe(
      false,
    );
  });
});
