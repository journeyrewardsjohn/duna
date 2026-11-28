/**
 * Protection shared by the three Places routes (autocomplete, details, map):
 * a per-address budget, a short cache of identical requests, and the
 * provider's session token passed through as its billing model expects.
 *
 * Budgets suit a person typing (the Where picker waits 120 ms between
 * keystrokes and needs three characters) and stop a script. The limiter is
 * the repo's own (`@duna/api/rate-limit`): the database-backed bucket table
 * when a database is configured, memory otherwise. Bucket keys hold a one-way
 * hash of the address, never the address.
 */
import { createHash } from "node:crypto";
import { consumeRateLimit } from "@duna/api/rate-limit";
import { log } from "@duna/observability";
import { NextResponse } from "next/server";

export const PLACES_BUDGETS = {
  /** Typing: 60 at once, 60 a minute. */
  autocomplete: { capacity: 60, refillPerMinute: 60 },
  /** Choosing a place: 20 at once, 10 a minute. */
  details: { capacity: 20, refillPerMinute: 10 },
  /** Map previews: 30 at once, 30 a minute (the CDN caches the images). */
  map: { capacity: 30, refillPerMinute: 30 },
} as const;

export type PlacesRoute = keyof typeof PLACES_BUDGETS;

/** What a person sees when they hit the budget (the kit's quiet retry tone). */
export const PLACES_RATE_LIMITED_MESSAGE =
  "Lots of searches just now. Try again in a few seconds.";

export function clientAddress(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    undefined
  );
}

function addressKey(request: Request): string {
  const address = clientAddress(request);
  if (!address) return "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 32);
}

/** A 429 response when this address is over its budget; undefined otherwise. */
export async function placesRateLimit(
  request: Request,
  route: PlacesRoute,
  now = new Date(),
): Promise<NextResponse | undefined> {
  const budget = PLACES_BUDGETS[route];
  let decision;
  try {
    decision = await consumeRateLimit({
      key: `places.${route}:${addressKey(request)}`,
      capacity: budget.capacity,
      refillPerMinute: budget.refillPerMinute,
      now,
    });
  } catch (error) {
    // The limiter failing must not take search down with it.
    log.warn("places.rateLimit.unavailable", {
      route,
      error: error instanceof Error ? error.name : "unknown",
    });
    return undefined;
  }
  if (decision.allowed) return undefined;
  log.info("places.rateLimited", { route });
  return NextResponse.json(
    {
      error: PLACES_RATE_LIMITED_MESSAGE,
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
    },
  );
}

/**
 * The provider's session token: one per open picker, from the browser.
 * Anything that is not a plain token is ignored (the call still works; it is
 * just billed on its own).
 */
export function sessionTokenFrom(request: Request): string | undefined {
  const value = new URL(request.url).searchParams.get("session")?.trim();
  return value && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : undefined;
}

/** Region bias from the hosting edge's country header, when present. */
export function regionCodeFrom(request: Request): string | undefined {
  const country = request.headers.get("x-vercel-ip-country")?.trim();
  return country && /^[A-Za-z]{2}$/.test(country)
    ? country.toLowerCase()
    : undefined;
}

/**
 * A small in-process cache of identical requests (same text, same region;
 * same place id) for a few minutes. Kept short: it saves repeat calls while
 * someone types and deletes, and nothing from the provider is stored longer.
 */
export class ShortCache<T> {
  readonly #entries = new Map<string, { value: T; expiresAt: number }>();
  constructor(
    readonly ttlMs: number,
    readonly maxEntries: number,
  ) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.#entries.delete(key);
      return undefined;
    }
    // Most recently used goes to the end.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.#entries.size > this.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}

/** Ten minutes: long enough for a session of typing, short by design. */
export const PLACES_CACHE_TTL_MS = 10 * 60_000;
