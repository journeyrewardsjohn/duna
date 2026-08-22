import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoActor } from "./context";
import {
  createAudience,
  getAudienceBuilderWorkspace,
  listAudiences,
  previewAudienceRule,
} from "./audience-service";

describe("audience service", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps demo projections usable without a database and validates a rule preview", async () => {
    const actor = createDemoActor(["manager"]);
    await expect(listAudiences(actor)).resolves.toHaveLength(1);
    const ruleAst = {
      version: 1 as const,
      root: {
        kind: "group" as const,
        operator: "all" as const,
        rules: [
          {
            kind: "condition" as const,
            fact: "person-type" as const,
            operator: "is" as const,
            value: "player",
          },
        ],
      },
    };
    await expect(
      previewAudienceRule(actor, {
        mode: "dynamic",
        ruleAst,
        includePersonIds: [],
        excludePersonIds: [],
      }),
    ).resolves.toMatchObject({
      candidateCount: 5,
      estimatedSize: 3,
    });
    await expect(getAudienceBuilderWorkspace(actor)).resolves.toMatchObject({
      candidateCount: 5,
      people: expect.arrayContaining([
        expect.objectContaining({
          displayName: "Elena Patel",
          roles: ["parent"],
        }),
      ]),
    });
    await expect(
      createAudience({
        actor,
        name: "Practice roster",
        mode: "static",
        ruleAst,
        includePersonIds: [],
        excludePersonIds: [],
        now: new Date(),
      }),
    ).resolves.toMatchObject({ name: "Practice roster", mode: "static" });
  });

  it("fails closed for a connected organization when the database is unavailable", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const actor = {
      ...createDemoActor(["manager"]),
      isDemo: false,
      organizationId: "00000000-0000-4000-8000-000000000099",
    };
    await expect(listAudiences(actor)).rejects.toMatchObject({
      code: "DATABASE_REQUIRED",
    });
  });
});
