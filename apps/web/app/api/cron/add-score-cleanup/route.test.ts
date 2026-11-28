import { afterEach, describe, expect, it, vi } from "vitest";

const cleanUp = vi.hoisted(() =>
  vi.fn(async () => ({ draftsDeleted: 2, providerContentCleared: 1 })),
);
vi.mock("@duna/api", () => ({ cleanUpScoreDrafts: cleanUp }));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  cleanUp.mockClear();
});

describe("add-score cleanup cron", () => {
  it("refuses a call without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    const response = await GET(
      new Request("https://duna.coach/api/cron/add-score-cleanup"),
    );
    expect(response.status).toBe(401);
    expect(cleanUp).not.toHaveBeenCalled();
  });

  it("cleans up and reports counts only", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    const response = await GET(
      new Request("https://duna.coach/api/cron/add-score-cleanup", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      draftsDeleted: 2,
      providerContentCleared: 1,
    });
  });
});
