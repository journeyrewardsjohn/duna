import {
  getDatabase,
  idempotencyRecords,
  isDatabaseConfigured,
} from "@duna/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import { stableHash } from "./canonical";

type JsonObject = Readonly<Record<string, unknown>>;

type IdempotencyClaim =
  | { readonly kind: "claimed" }
  | { readonly kind: "replay"; readonly result: JsonObject }
  | { readonly kind: "conflict" }
  | { readonly kind: "in-progress" };

export interface IdempotencyStore {
  claim(input: {
    readonly key: string;
    readonly procedure: string;
    readonly personId?: string;
    readonly organizationId?: string;
    readonly requestHash: string;
    readonly now: Date;
    readonly expiresAt: Date;
  }): Promise<IdempotencyClaim>;
  complete(input: {
    readonly key: string;
    readonly procedure: string;
    readonly requestHash: string;
    readonly result: JsonObject;
    readonly resultHash: string;
  }): Promise<void>;
  abandon(input: {
    readonly key: string;
    readonly procedure: string;
    readonly requestHash: string;
  }): Promise<void>;
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was already used with different input");
  }
}

export class IdempotencyInProgressError extends Error {
  constructor() {
    super("An equivalent request is already in progress");
  }
}

interface MemoryRecord {
  readonly requestHash: string;
  readonly expiresAt: Date;
  result?: JsonObject;
  resultHash?: string;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #records = new Map<string, MemoryRecord>();

  async claim(
    input: Parameters<IdempotencyStore["claim"]>[0],
  ): Promise<IdempotencyClaim> {
    const id = `${input.procedure}:${input.key}`;
    const existing = this.#records.get(id);
    if (existing && existing.expiresAt <= input.now) this.#records.delete(id);
    const current = this.#records.get(id);
    if (!current) {
      this.#records.set(id, {
        requestHash: input.requestHash,
        expiresAt: input.expiresAt,
      });
      return { kind: "claimed" };
    }
    if (current.requestHash !== input.requestHash) return { kind: "conflict" };
    if (current.result) return { kind: "replay", result: current.result };
    return { kind: "in-progress" };
  }

  async complete(
    input: Parameters<IdempotencyStore["complete"]>[0],
  ): Promise<void> {
    const id = `${input.procedure}:${input.key}`;
    const record = this.#records.get(id);
    if (!record || record.requestHash !== input.requestHash) {
      throw new Error("Idempotency claim was lost before completion");
    }
    record.result = input.result;
    record.resultHash = input.resultHash;
  }

  async abandon(
    input: Parameters<IdempotencyStore["abandon"]>[0],
  ): Promise<void> {
    const id = `${input.procedure}:${input.key}`;
    const record = this.#records.get(id);
    if (record?.requestHash === input.requestHash && !record.result) {
      this.#records.delete(id);
    }
  }
}

export class DatabaseIdempotencyStore implements IdempotencyStore {
  async claim(
    input: Parameters<IdempotencyStore["claim"]>[0],
  ): Promise<IdempotencyClaim> {
    const db = getDatabase();
    const whereKey = and(
      eq(idempotencyRecords.procedure, input.procedure),
      eq(idempotencyRecords.key, input.key),
    );
    await db
      .delete(idempotencyRecords)
      .where(and(whereKey, lt(idempotencyRecords.expiresAt, input.now)));
    const inserted = await db
      .insert(idempotencyRecords)
      .values({
        key: input.key,
        procedure: input.procedure,
        personId: input.personId,
        organizationId: input.organizationId,
        requestHash: input.requestHash,
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyRecords.id });
    if (inserted[0]) return { kind: "claimed" };

    const existing = await db.query.idempotencyRecords.findFirst({
      where: whereKey,
    });
    if (!existing) return { kind: "in-progress" };
    if (existing.requestHash !== input.requestHash) return { kind: "conflict" };
    if (existing.result) {
      return { kind: "replay", result: existing.result };
    }
    return { kind: "in-progress" };
  }

  async complete(
    input: Parameters<IdempotencyStore["complete"]>[0],
  ): Promise<void> {
    const db = getDatabase();
    await db
      .update(idempotencyRecords)
      .set({ result: input.result, resultHash: input.resultHash })
      .where(
        and(
          eq(idempotencyRecords.procedure, input.procedure),
          eq(idempotencyRecords.key, input.key),
          eq(idempotencyRecords.requestHash, input.requestHash),
        ),
      );
  }

  async abandon(
    input: Parameters<IdempotencyStore["abandon"]>[0],
  ): Promise<void> {
    const db = getDatabase();
    await db
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.procedure, input.procedure),
          eq(idempotencyRecords.key, input.key),
          eq(idempotencyRecords.requestHash, input.requestHash),
          isNull(idempotencyRecords.result),
        ),
      );
  }
}

const memoryStore = new MemoryIdempotencyStore();
const databaseStore = new DatabaseIdempotencyStore();

export async function executeIdempotent<T extends object>(input: {
  readonly key: string;
  readonly procedure: string;
  readonly personId?: string;
  readonly organizationId?: string;
  readonly request: JsonObject;
  readonly now: Date;
  readonly ttlMilliseconds?: number;
  readonly store?: IdempotencyStore;
  readonly execute: () => Promise<T>;
}): Promise<{ readonly result: T; readonly replayed: boolean }> {
  const requestHash = stableHash(input.request);
  const store =
    input.store ?? (isDatabaseConfigured() ? databaseStore : memoryStore);
  const claim = await store.claim({
    key: input.key,
    procedure: input.procedure,
    personId: input.personId,
    organizationId: input.organizationId,
    requestHash,
    now: input.now,
    expiresAt: new Date(
      input.now.getTime() + (input.ttlMilliseconds ?? 24 * 60 * 60_000),
    ),
  });
  if (claim.kind === "conflict") throw new IdempotencyConflictError();
  if (claim.kind === "in-progress") throw new IdempotencyInProgressError();
  if (claim.kind === "replay") {
    return { result: claim.result as T, replayed: true };
  }

  try {
    const result = await input.execute();
    await store.complete({
      key: input.key,
      procedure: input.procedure,
      requestHash,
      result: result as JsonObject,
      resultHash: stableHash(result),
    });
    return { result, replayed: false };
  } catch (error) {
    await store.abandon({
      key: input.key,
      procedure: input.procedure,
      requestHash,
    });
    throw error;
  }
}
