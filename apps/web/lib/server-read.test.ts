import { describe, expect, it, vi } from "vitest";
import {
  rateLimitRetryAfterSeconds,
  readWithRateLimitRetry,
  settleServerRead,
} from "./server-read";

function refused(seconds: number) {
  return Object.assign(
    new Error(`Rate limit exceeded. Retry in ${seconds} seconds.`),
    { code: "TOO_MANY_REQUESTS" },
  );
}

const noWait = () => Promise.resolve();

describe("rate-limit refusals during a server read", () => {
  it("reads the stated delay only from TOO_MANY_REQUESTS", () => {
    expect(rateLimitRetryAfterSeconds(refused(1))).toBe(1);
    expect(rateLimitRetryAfterSeconds(refused(30))).toBe(30);
    expect(
      rateLimitRetryAfterSeconds(
        Object.assign(new Error("Nope"), { code: "FORBIDDEN" }),
      ),
    ).toBeUndefined();
    expect(rateLimitRetryAfterSeconds("boom")).toBeUndefined();
  });

  it("waits the stated second and reads once more", async () => {
    const sleep = vi.fn(noWait);
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(refused(1))
      .mockResolvedValueOnce("inbox");
    await expect(readWithRateLimitRetry(read, sleep)).resolves.toBe("inbox");
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not wait out a longer delay, and retries only once", async () => {
    const long = vi.fn().mockRejectedValue(refused(30));
    await expect(readWithRateLimitRetry(long, noWait)).rejects.toThrow(
      /Retry in 30/,
    );
    expect(long).toHaveBeenCalledTimes(1);

    const twice = vi.fn().mockRejectedValue(refused(1));
    await expect(readWithRateLimitRetry(twice, noWait)).rejects.toThrow(
      /Rate limit/,
    );
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it("never retries other failures", async () => {
    const read = vi.fn().mockRejectedValue(new Error("database down"));
    await expect(readWithRateLimitRetry(read, noWait)).rejects.toThrow(
      "database down",
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("settles into the busy state, or the error state with a reference", async () => {
    await expect(
      settleServerRead(() => Promise.resolve(3), "web.test.read.failed"),
    ).resolves.toEqual({ ok: true, value: 3 });

    const busy = await settleServerRead(
      () => Promise.reject(refused(5)),
      "web.test.read.failed",
      noWait,
    );
    expect(busy).toMatchObject({ ok: false, busy: true });
    expect(busy.ok ? "" : busy.reference).toMatch(/^evt_/);

    const failed = await settleServerRead(
      () => Promise.reject(new Error("database down")),
      "web.test.read.failed",
      noWait,
    );
    expect(failed).toMatchObject({ ok: false, busy: false });
    expect(failed.ok ? "" : failed.reference).not.toBe("");
  });
});
