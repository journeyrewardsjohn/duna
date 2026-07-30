import { describe, expect, it } from "vitest";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
  MemoryIdempotencyStore,
} from "./idempotency";

describe("mutation idempotency", () => {
  it("executes once and replays the stored result", async () => {
    const store = new MemoryIdempotencyStore();
    let calls = 0;
    const invoke = () =>
      executeIdempotent({
        key: "4fb79cf6-9f6a-4bb2-b96f-3204bda0da4a",
        procedure: "player.createPickup",
        request: { title: "Golden hour", nested: { capacity: 12 } },
        now: new Date("2026-07-30T12:00:00Z"),
        store,
        execute: async () => ({ id: `pickup-${++calls}` }),
      });

    expect(await invoke()).toEqual({
      result: { id: "pickup-1" },
      replayed: false,
    });
    expect(await invoke()).toEqual({
      result: { id: "pickup-1" },
      replayed: true,
    });
    expect(calls).toBe(1);
  });

  it("rejects reuse of a key with different input", async () => {
    const store = new MemoryIdempotencyStore();
    const common = {
      key: "4fb79cf6-9f6a-4bb2-b96f-3204bda0da4b",
      procedure: "payments.refund",
      now: new Date("2026-07-30T12:00:00Z"),
      store,
    } as const;
    await executeIdempotent({
      ...common,
      request: { amountMinor: 1_000 },
      execute: async () => ({ refunded: 1_000 }),
    });
    await expect(
      executeIdempotent({
        ...common,
        request: { amountMinor: 2_000 },
        execute: async () => ({ refunded: 2_000 }),
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("does not execute a concurrent duplicate", async () => {
    const store = new MemoryIdempotencyStore();
    let release: (() => void) | undefined;
    const first = executeIdempotent({
      key: "4fb79cf6-9f6a-4bb2-b96f-3204bda0da4c",
      procedure: "wallet.distributePurse",
      request: { purseId: "purse-1" },
      now: new Date("2026-07-30T12:00:00Z"),
      store,
      execute: () =>
        new Promise<{ distributed: boolean }>((resolve) => {
          release = () => resolve({ distributed: true });
        }),
    });
    await Promise.resolve();
    await expect(
      executeIdempotent({
        key: "4fb79cf6-9f6a-4bb2-b96f-3204bda0da4c",
        procedure: "wallet.distributePurse",
        request: { purseId: "purse-1" },
        now: new Date("2026-07-30T12:00:01Z"),
        store,
        execute: async () => ({ distributed: true }),
      }),
    ).rejects.toBeInstanceOf(IdempotencyInProgressError);
    release?.();
    await first;
  });

  it("releases a claim after failure so a safe retry can execute", async () => {
    const store = new MemoryIdempotencyStore();
    const input = {
      key: "4fb79cf6-9f6a-4bb2-b96f-3204bda0da4d",
      procedure: "events.publish",
      request: { sessionId: "session-1" },
      now: new Date("2026-07-30T12:00:00Z"),
      store,
    } as const;
    await expect(
      executeIdempotent({
        ...input,
        execute: async () => {
          throw new Error("temporary failure");
        },
      }),
    ).rejects.toThrow("temporary failure");
    await expect(
      executeIdempotent({
        ...input,
        execute: async () => ({ published: true }),
      }),
    ).resolves.toMatchObject({ result: { published: true } });
  });
});
