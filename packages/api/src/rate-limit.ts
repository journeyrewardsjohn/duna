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

/**
 * Browser-test budget override for the per-procedure tRPC limits
 * (`rateLimitMiddleware` in auth.ts).
 *
 * The Playwright suite drives every page as ONE demo actor from several
 * workers and three viewports at once, so the real per-actor budget (180 calls
 * a minute) runs out and server renders fail with TOO_MANY_REQUESTS. The
 * Playwright web servers (playwright.config.ts) start with
 * `DUNA_E2E_RATE_LIMIT_MULTIPLIER`, which multiplies each procedure's capacity
 * and refill rate. It is a whole number from 1 to 100 and anything else counts
 * as 1. It is IGNORED on a production deployment (`VERCEL_ENV` is
 * `"production"`), so production limits never change.
 *
 * Only the tRPC procedure budgets read it. Limiters that call
 * `consumeRateLimit` directly (Places search, Add a score drafts, Ask Duna,
 * client error reports) keep their real budgets in every environment.
 */
export const E2E_RATE_LIMIT_MULTIPLIER_ENV = "DUNA_E2E_RATE_LIMIT_MULTIPLIER";

export function e2eRateLimitMultiplier(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  if (env.VERCEL_ENV === "production") return 1;
  const raw = env[E2E_RATE_LIMIT_MULTIPLIER_ENV];
  if (!raw || !/^\d{1,3}$/.test(raw)) return 1;
  const value = Number.parseInt(raw, 10);
  return value >= 1 && value <= 100 ? value : 1;
}

const memoryStore = new MemoryRateLimitStore();
const databaseStore = new DatabaseRateLimitStore();

export function consumeRateLimit(
  input: RateLimitInput,
  store: RateLimitStore = isDatabaseConfigured() ? databaseStore : memoryStore,
): Promise<RateLimitDecision> {
  return store.consume(input);
}
