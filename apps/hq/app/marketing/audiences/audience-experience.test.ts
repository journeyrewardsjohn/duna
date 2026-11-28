import { describe, expect, it } from "vitest";
import { renderForTest } from "@/lib/render-for-test";
import { AudienceOverview } from "./audience-overview";

// The rule builder, people selection and preview are covered by the persona
// journeys when this screen is rebuilt. Demo mode always has one saved
// audience, so the empty state is rendered here.
describe("HQ Audience overview", () => {
  it("gives an empty workspace one unmistakable way to start", () => {
    const overview = renderForTest(AudienceOverview, {
      audiences: [],
      candidateCount: 12,
    });

    expect(overview.text).toContain("Build a reusable group of people");
    const start = overview
      .elements("a")
      .filter((link) => link.href === "/marketing/audiences/create");
    expect(start).toHaveLength(1);
    expect(overview.text).toContain("Create your first audience");
    // No table, search, or result count for records that do not exist.
    expect(overview.elements("table")).toHaveLength(0);
    expect(overview.elements("input")).toHaveLength(0);
  });
});
