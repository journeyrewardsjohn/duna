import { getDatabase, isDatabaseConfigured, rateLimitBuckets } from "@duna/db";
import { eq, sql } from "drizzle-orm";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimitInput {
  readonly key: string;
  readonly capacity: number;
  readonly refillPerMinute: number;
  readonly cost?: number;
  readonly now: Date;
}

export interface RateLimitStore {
  consume(input: RateLimitInput): Promise<RateLimitDecision>;
}

interface MemoryBucket {
  tokens: number;
  updatedAt: Date;
  capacity: number;
  refillPerSecond: number;
}

function validate(input: RateLimitInput): void {
  if (
    !Number.isSafeInteger(input.capacity) ||
    input.capacity <= 0 ||
    !Number.isFinite(input.refillPerMinute) ||
    input.refillPerMinute <= 0 ||
    !Number.isFinite(input.cost ?? 1) ||
    (input.cost ?? 1) <= 0 ||
    (input.cost ?? 1) > input.capacity
  ) {
    throw new Error("Rate-limit policy values must be positive");
  }
  if (input.key.length === 0 || input.key.length > 256) {
    throw new Error("Rate-limit key must contain 1 to 256 characters");
  }
}

function decision(
  allowed: boolean,
  tokens: number,
  cost: number,
  refillPerSecond: number,
): RateLimitDecision {
  return {
    allowed,
    remaining: Math.max(0, Math.floor(tokens)),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((cost - tokens) / refillPerSecond)),
  };
}

export class MemoryRateLimitStore implements RateLimitStore {
  readonly #buckets = new Map<string, MemoryBucket>();

  async consume(input: RateLimitInput): Promise<RateLimitDecision> {
    validate(input);
    const cost = input.cost ?? 1;
    const refillPerSecond = input.refillPerMinute / 60;
    const current = this.#buckets.get(input.key);
    const elapsedSeconds = current
      ? Math.max(0, (input.now.getTime() - current.updatedAt.getTime()) / 1_000)
      : 0;
    const replenished = current
      ? Math.min(
          input.capacity,
          current.tokens + elapsedSeconds * refillPerSecond,
        )
      : input.capacity;
    const allowed = replenished >= cost;
    const tokens = allowed ? replenished - cost : replenished;
    this.#buckets.set(input.key, {
      tokens,
      updatedAt: input.now,
      capacity: input.capacity,
      refillPerSecond,
    });
    return decision(allowed, tokens, cost, refillPerSecond);
  }
}

class DatabaseRateLimitStore implements RateLimitStore {
  async consume(input: RateLimitInput): Promise<RateLimitDecision> {
    validate(input);
    const database = getDatabase();
    const cost = input.cost ?? 1;
    const refillPerSecond = input.refillPerMinute / 60;
    const expiresAt = new Date(
      input.now.getTime() +
        Math.max(10 * 60_000, (input.capacity / refillPerSecond) * 2 * 1_000),
    );
    const result = await database.execute(sql`
      INSERT INTO ${rateLimitBuckets} (
        "key",
        "tokens",
        "capacity",
        "refill_per_second",
        "expires_at",
        "created_at",
        "updated_at"
      )
      VALUES (
        ${input.key},
        ${input.capacity - cost},
        ${input.capacity},
        ${refillPerSecond},
        ${expiresAt},
        ${input.now},
        ${input.now}
      )
      ON CONFLICT ("key") DO UPDATE
      SET
        "tokens" =
          LEAST(
            ${input.capacity},
            ${rateLimitBuckets.tokens} +
              GREATEST(
                0,
                EXTRACT(EPOCH FROM (${input.now} - ${rateLimitBuckets.updatedAt}))
              ) * ${refillPerSecond}
          ) - ${cost},
        "capacity" = ${input.capacity},
        "refill_per_second" = ${refillPerSecond},
        "expires_at" = ${expiresAt},
        "updated_at" = ${input.now}
      WHERE
        LEAST(
          ${input.capacity},
          ${rateLimitBuckets.tokens} +
            GREATEST(
              0,
              EXTRACT(EPOCH FROM (${input.now} - ${rateLimitBuckets.updatedAt}))
            ) * ${refillPerSecond}
        ) >= ${cost}
      RETURNING "tokens"
    `);
    const consumed = result.rows[0] as { tokens?: number } | undefined;
    if (typeof consumed?.tokens === "number") {
      return decision(true, consumed.tokens, cost, refillPerSecond);
    }

    const existing = await database.query.rateLimitBuckets.findFirst({
      where: eq(rateLimitBuckets.key, input.key),
    });
    const elapsedSeconds = existing
      ? Math.max(
          0,
          (input.now.getTime() - existing.updatedAt.getTime()) / 1_000,
        )
      : 0;
    const tokens = existing
      ? Math.min(
          input.capacity,
          existing.tokens + elapsedSeconds * refillPerSecond,
        )
      : 0;
    return decision(false, tokens, cost, refillPerSecond);
  }
}

const memoryStore = new MemoryRateLimitStore();
const databaseStore = new DatabaseRateLimitStore();

export function consumeRateLimit(
  input: RateLimitInput,
  store: RateLimitStore = isDatabaseConfigured() ? databaseStore : memoryStore,
): Promise<RateLimitDecision> {
  return store.consume(input);
}
