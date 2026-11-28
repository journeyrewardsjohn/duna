import { legalDemo } from "@duna/core/demo/legal";
import {
  legalAcceptanceSurfaces,
  legalAcceptedAs,
  legalDocumentAudiences,
} from "@duna/db/schema";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  legalAcceptanceMethodSchema,
  legalAcceptanceSchema,
  legalDocumentVersionSchema,
  legalRequirementSchema,
  legalRequirementStateSchema,
} from "./legal";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("legal contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const document of legalDemo.documents)
      legalDocumentVersionSchema.parse(document);
    for (const acceptance of legalDemo.acceptances)
      legalAcceptanceSchema.parse(acceptance);
    for (const requirement of legalDemo.requirements)
      legalRequirementSchema.parse(requirement);
  });

  it("covers every state", () => {
    expectCoverage(
      legalDocumentAudiences,
      legalDemo.documents.map((d) => d.audience),
    );
    expectCoverage(
      legalAcceptedAs,
      legalDemo.acceptances.map((a) => a.acceptedAs),
    );
    expectCoverage(
      legalAcceptanceSurfaces,
      legalDemo.acceptances.map((a) => a.surface),
    );
    expectCoverage(
      legalAcceptanceMethodSchema.options,
      legalDemo.acceptances.map((a) => a.acceptanceMethod),
    );
    expectCoverage(
      legalRequirementStateSchema.options,
      legalDemo.requirements.map((r) => r.state),
    );
  });

  it("registers every drafted document in the legal center manifest", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../../../../apps/web/content/legal/index.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { documents: { slug: string }[] };
    const keys = new Set(legalDemo.documents.map((d) => d.documentKey));
    for (const { slug } of manifest.documents) {
      if (slug !== "legal-center") expect(keys.has(slug), slug).toBe(true);
    }
  });
});

describe("legal routers in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = (roles?: Parameters<typeof createDemoActor>[0]) =>
    createCaller(createApiContext({ actor: createDemoActor(roles) }));

  it("serves fixtures in demo mode", async () => {
    const api = caller();
    const documents = await api.public.legal.documents({});
    expect(new Set(documents.map((d) => d.documentKey)).size).toBe(
      documents.length,
    );
    const accepted = await api.player.legal.accept({
      documents: [
        {
          documentKey: "terms",
          version: "1.0-draft",
          documentHash: "a".repeat(64),
        },
      ],
      onBehalfOfPersonId: legalDemo.requirements[2]!.forPerson!.personId,
      surface: "guardian-flow",
    });
    expect(accepted[0]).toMatchObject({ acceptedAs: "guardian" });
    const organization = await api.operator.legal.accept({
      documents: [
        {
          documentKey: "hq-terms",
          version: "1.0-draft",
          documentHash: "b".repeat(64),
        },
      ],
      surface: "hq-settings",
    });
    expect(organization[0]).toMatchObject({
      acceptedAs: "organization-authority",
    });
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .player.legal.myAcceptances()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
