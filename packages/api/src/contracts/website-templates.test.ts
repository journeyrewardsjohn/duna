import { websiteTemplatesDemo } from "@duna/core/demo/website-templates";
import { websiteSiteOrigins, websiteTemplateStatuses } from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import { expectCoverage } from "./w3-test-support";
import {
  websiteTemplatesSiteStartSchema,
  websiteTemplatesTemplateSchema,
} from "./website-templates";

// The connected path is simulated by switching only the data-source rule.
const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("website-templates contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const template of websiteTemplatesDemo.templates)
      websiteTemplatesTemplateSchema.parse(template);
    for (const start of websiteTemplatesDemo.siteStarts)
      websiteTemplatesSiteStartSchema.parse(start);
  });

  it("covers every state and offers exactly five templates", () => {
    expectCoverage(
      websiteTemplateStatuses,
      websiteTemplatesDemo.templates.map((t) => t.status),
    );
    expectCoverage(
      websiteSiteOrigins,
      websiteTemplatesDemo.siteStarts.map((s) => s.origin),
    );
    expect(
      websiteTemplatesDemo.templates.filter((t) => t.status === "available"),
    ).toHaveLength(5);
  });
});

describe("websiteTemplates routers in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("serves fixtures in demo mode", async () => {
    const { templates } = await caller().public.websiteTemplates.templates();
    expect(templates).toHaveLength(5);
    const operator = caller().operator.websiteTemplates;
    const all = await operator.templates({ includeUnavailable: true });
    expect(all.templates).toHaveLength(7);
    const start = await operator.start({
      origin: "template",
      siteName: "Junior program",
      templateId: templates[1]!.templateId,
    });
    expect(start.templateName).toBe(templates[1]!.name);
    const answered = await operator.saveAnswers({
      siteId: start.siteId,
      answers: { "coach-photos": false },
    });
    expect(answered.remainingQuestions).toEqual([]);
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .public.websiteTemplates.templates()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
