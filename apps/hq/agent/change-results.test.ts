import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { listAskDunaActions } from "@duna/api";
import { operatorForSession } from "./runtime";
import changeResults from "./tools/change_results";

vi.mock("@duna/api", () => ({ listAskDunaActions: vi.fn() }));
vi.mock("./runtime", () => ({ operatorForSession: vi.fn() }));

describe("Ask Duna saved action tool", () => {
  it("returns JSON-only receipts from database rows without losing their outcome", async () => {
    const context = {} as Parameters<typeof changeResults.execute>[1];
    const operator = {
      actor: { personId: "operator-one", organizationId: "organization-one" },
      conversationId: "conversation-one",
    } as Awaited<ReturnType<typeof operatorForSession>>;
    vi.mocked(operatorForSession).mockResolvedValue(operator);
    const createdAt = new Date("2026-10-16T14:00:00Z");
    const updatedAt = new Date("2026-10-16T14:01:00Z");
    const expiresAt = new Date("2026-10-16T14:15:00Z");
    const rows = [
      {
        id: "action-one",
        conversationId: operator.conversationId,
        operation: "operator.createAudience",
        input: { name: "Empty release check", includePersonIds: [] },
        summary: "Create an empty audience",
        status: "succeeded",
        result: { id: "audience-one", memberCount: 0 },
        createdAt,
        updatedAt,
        expiresAt,
      },
      {
        id: "action-two",
        conversationId: operator.conversationId,
        operation: "operator.archiveAudience",
        input: { id: "audience-one" },
        summary: "Archive the empty audience",
        status: "uncertain",
        result: { error: "Check the affected record before trying again." },
        createdAt,
        updatedAt,
        expiresAt,
      },
    ];
    vi.mocked(listAskDunaActions).mockResolvedValue(rows);

    const output = await changeResults.execute({}, context);

    expect(operatorForSession).toHaveBeenCalledWith(context);
    expect(listAskDunaActions).toHaveBeenCalledWith(
      operator.actor,
      operator.conversationId,
    );
    // A JSON stringify check alone misses this regression: Date has toJSON(),
    // but the durable tool runtime requires actual JSON values at its boundary.
    expect(z.json().safeParse(rows).success).toBe(false);
    expect(z.json().parse(output)).toEqual(JSON.parse(JSON.stringify(rows)));
    if (!Array.isArray(output)) throw new Error("Expected saved action rows");
    expect(output[0]!.status).toBe("succeeded");
    expect(output[0]!.result).toEqual({ id: "audience-one", memberCount: 0 });
    expect(output[1]!.status).toBe("uncertain");
    expect(rows[0]!.createdAt).toBe(createdAt);
  });
});
