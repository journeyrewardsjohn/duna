import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoActor } from "./context";
import { transactionSummarySchema } from "./contracts";
import { getTransaction, listTransactions } from "./transaction-service";

describe("transactions v2 projection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns a demo-safe read-only list and stable detail timeline", async () => {
    const actor = createDemoActor(["manager"]);
    const [first] = await listTransactions(actor);
    expect(first).toMatchObject({ status: "succeeded", currency: "USD" });
    expect(first?.amountStatus).toBe("complete");
    await expect(getTransaction(actor, first!.id)).resolves.toMatchObject({
      id: first!.id,
      people: [
        expect.objectContaining({
          name: "Maya Chen",
          profileHref: expect.stringMatching(/^\/members\//),
        }),
      ],
      items: [
        expect.objectContaining({
          description: "Camp registration",
          href: expect.stringMatching(/^\/events\//),
        }),
      ],
      evidence: expect.objectContaining({
        ipAddress: expect.any(String),
        userAgent: expect.any(String),
      }),
      timeline: [
        expect.objectContaining({ kind: "payment", status: "succeeded" }),
      ],
    });
  });

  it("accepts source-prefixed canonical transaction identifiers", async () => {
    const [first] = await listTransactions(createDemoActor(["manager"]));
    expect(first).toBeDefined();
    expect(
      transactionSummarySchema.parse({
        ...first!,
        id: "order:00000000-0000-4000-8000-000000000093",
      }).id,
    ).toBe("order:00000000-0000-4000-8000-000000000093");
  });

  it("fails closed instead of returning fixtures to a connected organization", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const actor = {
      ...createDemoActor(["manager"]),
      isDemo: false,
      organizationId: "00000000-0000-4000-8000-000000000099",
    };
    await expect(listTransactions(actor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
