import { describe, expect, it } from "vitest";
import { consumeRateLimit, MemoryRateLimitStore } from "./rate-limit";

describe("token-bucket rate limiting", () => {
  it("denies exhausted callers and reports a retry window", async () => {
    const store = new MemoryRateLimitStore();
    const base = {
      key: "messages:person-1",
      capacity: 2,
      refillPerMinute: 2,
      now: new Date("2026-07-30T12:00:00.000Z"),
    };
    await expect(consumeRateLimit(base, store)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(consumeRateLimit(base, store)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(consumeRateLimit(base, store)).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 30,
    });
  });

  it("refills deterministically over elapsed time", async () => {
    const store = new MemoryRateLimitStore();
    const input = {
      key: "checkout:person-1",
      capacity: 1,
      refillPerMinute: 1,
    };
    await consumeRateLimit(
      { ...input, now: new Date("2026-07-30T12:00:00.000Z") },
      store,
    );
    await expect(
      consumeRateLimit(
        { ...input, now: new Date("2026-07-30T12:01:00.000Z") },
        store,
      ),
    ).resolves.toMatchObject({ allowed: true });
  });
});
