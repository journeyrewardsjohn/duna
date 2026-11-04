import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ recover: vi.fn(), drain: vi.fn() }));
vi.mock("@duna/api", () => ({ recoverReadyWorkflowJobs: mocks.recover }));
vi.mock("@duna/api/sendblue-outbox", () => ({
  drainPhoneReplies: mocks.drain,
}));
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-workflow-secret");
  mocks.recover.mockReset().mockResolvedValue([]);
  mocks.drain.mockReset().mockResolvedValue({ processed: 0 });
});
describe("workflow recovery authentication", () => {
  it.each([undefined, "Bearer wrong", "Basic test-workflow-secret"])(
    "rejects missing or invalid auth without work: %s",
    async (authorization) => {
      const response = await GET(
        new Request("https://hq.duna.coach/api/cron/workflows", {
          headers: authorization ? { authorization } : {},
        }),
      );
      expect(response.status).toBe(401);
      expect(mocks.recover).not.toHaveBeenCalled();
      expect(mocks.drain).not.toHaveBeenCalled();
    },
  );
  it("runs recovery and phone reconciliation for the exact configured bearer", async () => {
    const response = await GET(
      new Request("https://hq.duna.coach/api/cron/workflows", {
        headers: { authorization: "Bearer test-workflow-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.recover).toHaveBeenCalledOnce();
    expect(mocks.drain).toHaveBeenCalledOnce();
  });
});
