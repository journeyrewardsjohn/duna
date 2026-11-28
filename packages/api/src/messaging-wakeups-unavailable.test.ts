import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoActor } from "./context";
import { openMessagingUpdatesStream } from "./messaging-wakeups";

afterEach(() => vi.unstubAllEnvs());

describe("live updates that are not set up", () => {
  const actor = createDemoActor();

  it("tells an EventSource not to reconnect (204), without an error status", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const response = await openMessagingUpdatesStream({
      actor,
      accept: "text/event-stream",
    });
    expect(response.status).toBe(204);
  });

  it("answers the client's JSON readiness probe with the not-configured body", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    for (const accept of ["application/json", undefined, null]) {
      const response = await openMessagingUpdatesStream({ actor, accept });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        state: "provider-not-configured",
        status: "not-configured",
        provider: "messagingWakeups",
      });
    }
  });

  it("treats the kill switch the same way", async () => {
    vi.stubEnv("MESSAGING_SSE_ENABLED", "false");
    const response = await openMessagingUpdatesStream({
      actor,
      accept: "application/json",
    });
    expect(response.status).toBe(200);
  });

  it("answers the probe as ready, without opening a stream, when configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await openMessagingUpdatesStream({
      actor,
      accept: "application/json",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "ready" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
