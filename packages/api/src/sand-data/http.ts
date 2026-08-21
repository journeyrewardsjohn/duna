import { Firecrawl, type ScrapeOptions } from "@mendable/firecrawl-js";
import {
  assertScraperEnabled,
  type ManagedScraperSource,
  type ScraperControl,
} from "./scraper-controls";
import { SandDataUpstreamError } from "./types";

type ScrapeEngine = "firecrawl" | "native";

const nextRequestAt = new Map<ManagedScraperSource, number>();
const requestTimes = new Map<ManagedScraperSource, number[]>();
let firecrawl: Firecrawl | undefined;

function firecrawlKey(): string | undefined {
  return (
    process.env.FIRECRAWL_API_KEY?.trim() ||
    process.env.FIRECRAWL_API?.trim() ||
    undefined
  );
}

export function scrapeEngine(source: ManagedScraperSource): ScrapeEngine {
  if (source === "avp-league") return "firecrawl";
  if (
    source === "avp-tournaments" ||
    source === "fivb-12ndr" ||
    source === "volleyball-life" ||
    source === "volleyball-world" ||
    process.env.SAND_SCRAPER_ENGINE === "native"
  ) {
    return "native";
  }
  return firecrawlKey() ? "firecrawl" : "native";
}

function resolveScrapeEngine(
  source: ManagedScraperSource,
  control: ScraperControl,
): ScrapeEngine {
  if (
    source === "avp-tournaments" ||
    source === "fivb-12ndr" ||
    source === "volleyball-life" ||
    source === "volleyball-world"
  ) {
    return "native";
  }
  if (control.engine === "native" || control.engine === "firecrawl") {
    return control.engine;
  }
  return scrapeEngine(source);
}

async function acquireSourceSlot(
  source: ManagedScraperSource,
  control: ScraperControl,
): Promise<void> {
  for (;;) {
    const now = Date.now();
    const next = nextRequestAt.get(source) ?? now;
    const times = requestTimes.get(source) ?? [];
    while (times.length > 0 && now - times[0]! >= 60 * 60 * 1_000) {
      times.shift();
    }
    const oldest = times[0];
    const hourlyWait =
      times.length >= control.maxRequestsPerHour && oldest !== undefined
        ? 60 * 60 * 1_000 - (now - oldest) + 25
        : 0;
    const spacingWait = Math.max(0, next - now);
    const waitMs = Math.max(hourlyWait, spacingWait);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    times.push(now);
    requestTimes.set(source, times);
    nextRequestAt.set(source, now + control.minRequestIntervalMs);
    return;
  }
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("timeout") ||
    message.includes("429") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    /\b5\d\d\b/.test(message)
  );
}

async function withRetry<T>(
  source: ManagedScraperSource,
  control: ScraperControl,
  action: () => Promise<T>,
): Promise<T> {
  let latest: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await acquireSourceSlot(source, control);
      return await action();
    } catch (error) {
      latest = error;
      if (attempt === 3 || !isRetryable(error)) throw error;
      const delay = 750 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw latest;
}

function firecrawlClient(source: ManagedScraperSource): Firecrawl {
  const apiKey = firecrawlKey();
  if (!apiKey) {
    throw new SandDataUpstreamError(
      source,
      "not-configured",
      "FIRECRAWL_API_KEY is required for rendered scraping.",
    );
  }
  firecrawl ??= new Firecrawl({
    apiKey,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
  return firecrawl;
}

function firecrawlFormats(
  control: ScraperControl,
): NonNullable<ScrapeOptions["formats"]> {
  return [
    "html",
    "rawHtml",
    ...(control.firecrawlChangeTracking
      ? [{ type: "changeTracking" as const, modes: ["git-diff" as const] }]
      : []),
  ];
}

export function parseFirecrawlJsonDocument<T>(document: string): T {
  const candidates = [
    document,
    document.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] ?? "",
    document.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "",
  ];
  for (const candidate of candidates) {
    const value = candidate
      .replace(/<[^>]+>/g, "")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&amp;", "&")
      .trim();
    if (!value) continue;
    try {
      return JSON.parse(value) as T;
    } catch {
      // Firecrawl can return either a raw JSON document or an HTML-wrapped one.
    }
  }
  throw new Error("Firecrawl returned no JSON document.");
}

async function scrapeJsonThroughFirecrawl<T>(
  source: ManagedScraperSource,
  url: string,
  control: ScraperControl,
  timeoutMs: number | undefined,
): Promise<T> {
  const document = await withRetry(source, control, () =>
    firecrawlClient(source).scrape(url, {
      formats: firecrawlFormats(control),
      onlyMainContent: false,
      timeout: timeoutMs ?? 60_000,
      blockAds: true,
      ...(control.firecrawlCacheTtlSeconds !== undefined
        ? {
            maxAge: control.firecrawlCacheTtlSeconds * 1_000,
            storeInCache: true,
          }
        : {}),
    }),
  );
  return parseFirecrawlJsonDocument<T>(document.rawHtml ?? document.html ?? "");
}

const nativeHeaders = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (compatible; DunaSandData/1.0; +https://duna.sport)",
};

export async function scrapeHtml(
  source: ManagedScraperSource,
  url: string,
  options: {
    readonly waitForMs?: number;
    readonly timeoutMs?: number;
    readonly proxy?: ScrapeOptions["proxy"];
  } = {},
): Promise<{ readonly html: string; readonly engine: ScrapeEngine }> {
  const control = await assertScraperEnabled(source);
  const engine = resolveScrapeEngine(source, control);
  try {
    if (engine === "firecrawl") {
      const document = await withRetry(source, control, () =>
        firecrawlClient(source).scrape(url, {
          formats: firecrawlFormats(control),
          onlyMainContent: false,
          waitFor: options.waitForMs,
          timeout: options.timeoutMs ?? 60_000,
          proxy: options.proxy,
          blockAds: true,
          ...(control.firecrawlCacheTtlSeconds !== undefined
            ? {
                maxAge: control.firecrawlCacheTtlSeconds * 1_000,
                storeInCache: true,
              }
            : {}),
        }),
      );
      const html =
        source === "avp-league"
          ? (document.html ?? document.rawHtml ?? "")
          : (document.rawHtml ?? document.html ?? "");
      if (!html) {
        throw new SandDataUpstreamError(
          source,
          "invalid-response",
          `${source} returned an empty rendered page.`,
        );
      }
      return { html, engine };
    }

    const html = await withRetry(source, control, async () => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 60_000,
      );
      try {
        const response = await fetch(url, {
          headers: nativeHeaders,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        return response.text();
      } finally {
        clearTimeout(timer);
      }
    });
    return { html, engine };
  } catch (error) {
    if (error instanceof SandDataUpstreamError) throw error;
    throw new SandDataUpstreamError(
      source,
      "unavailable",
      error instanceof Error ? error.message : `${source} is unavailable.`,
    );
  }
}

export async function scrapeJson<T>(
  source: ManagedScraperSource,
  url: string,
  options: {
    readonly method?: "GET" | "POST";
    readonly body?: unknown;
    readonly headers?: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
  } = {},
): Promise<T> {
  let control: ScraperControl | undefined;
  try {
    control = await assertScraperEnabled(source);
    return await withRetry(source, control, async () => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 45_000,
      );
      try {
        const hasBody = options.body !== undefined;
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            "User-Agent": "DunaSandData/1.0 (+https://duna.sport)",
            ...options.headers,
          },
          method: options.method ?? (hasBody ? "POST" : "GET"),
          body: hasBody ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        return (await response.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    });
  } catch (error) {
    const fallbackControl = control;
    const supportsFirecrawlFallback =
      source === "volleyball-life" &&
      options.body === undefined &&
      options.method !== "POST" &&
      fallbackControl !== undefined &&
      Boolean(firecrawlKey());
    if (supportsFirecrawlFallback) {
      try {
        return await scrapeJsonThroughFirecrawl<T>(
          source,
          url,
          fallbackControl!,
          options.timeoutMs,
        );
      } catch (fallbackError) {
        throw new SandDataUpstreamError(
          source,
          "unavailable",
          `${error instanceof Error ? error.message : `${source} is unavailable.`} Firecrawl fallback: ${fallbackError instanceof Error ? fallbackError.message : "unavailable"}`,
        );
      }
    }
    throw new SandDataUpstreamError(
      source,
      "unavailable",
      error instanceof Error ? error.message : `${source} is unavailable.`,
    );
  }
}
