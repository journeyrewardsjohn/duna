import { Firecrawl, type ScrapeOptions } from "@mendable/firecrawl-js";
import {
  assertScraperEnabled,
  prefersFirecrawlAfterNativeFailures,
  recordNativeFallbackSuccess,
  recordNativeTransportSuccess,
  type ManagedScraperSource,
  type ScraperControl,
} from "./scraper-controls";
import { SandDataUpstreamError } from "./types";

export type ScrapeEngine = "firecrawl" | "native";

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
    source === "bvbinfo" ||
    source === "fivb-12ndr" ||
    source === "volleyball-life" ||
    source === "volleyball-world" ||
    process.env.SAND_SCRAPER_ENGINE === "native"
  ) {
    return "native";
  }
  return firecrawlKey() ? "firecrawl" : "native";
}

export function resolvedScrapeEngine(
  source: ManagedScraperSource,
  control: ScraperControl,
  now = new Date(),
): ScrapeEngine {
  if (firecrawlKey() && prefersFirecrawlAfterNativeFailures(control, now)) {
    return "firecrawl";
  }
  if (
    source === "avp-tournaments" ||
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
      ? [
          "markdown" as const,
          { type: "changeTracking" as const, modes: ["git-diff" as const] },
        ]
      : []),
  ];
}

function firecrawlResponseError(
  document: { readonly metadata?: unknown },
  url: string,
): Error | undefined {
  const metadata =
    document.metadata && typeof document.metadata === "object"
      ? (document.metadata as { readonly statusCode?: unknown })
      : undefined;
  const statusCode =
    typeof metadata?.statusCode === "number"
      ? metadata.statusCode
      : Number(metadata?.statusCode);
  return Number.isFinite(statusCode) && statusCode >= 400
    ? new Error(`HTTP ${statusCode} for ${url}`)
    : undefined;
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
  options: {
    readonly timeoutMs?: number;
    readonly maxAgeMs?: number;
  },
): Promise<T> {
  const document = await withRetry(source, control, () =>
    firecrawlClient(source).scrape(
      url,
      firecrawlScrapeOptions(control, options),
    ),
  );
  const responseError = firecrawlResponseError(document, url);
  if (responseError) throw responseError;
  return parseFirecrawlJsonDocument<T>(document.rawHtml ?? document.html ?? "");
}

const nativeHeaders = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (compatible; DunaSandData/1.0; +https://duna.sport)",
};

export interface HtmlScrapeOptions {
  readonly waitForMs?: number;
  readonly waitForSelector?: string;
  readonly waitAfterSelectorMs?: number;
  readonly timeoutMs?: number;
  readonly proxy?: ScrapeOptions["proxy"];
  readonly maxAgeMs?: number;
  readonly includeRawHtml?: boolean;
}

export function firecrawlScrapeOptions(
  control: ScraperControl,
  options: HtmlScrapeOptions = {},
): ScrapeOptions {
  const maxAgeMs =
    options.maxAgeMs ??
    (control.firecrawlCacheTtlSeconds !== undefined
      ? control.firecrawlCacheTtlSeconds * 1_000
      : undefined);
  return {
    formats: firecrawlFormats(control),
    // Parsers consume navigation, table headings, and repeated result rows,
    // so main-content heuristics must not discard surrounding structure.
    onlyMainContent: false,
    timeout: options.timeoutMs ?? 60_000,
    proxy: options.proxy ?? "auto",
    blockAds: true,
    removeBase64Images: true,
    location: { country: "US", languages: ["en-US"] },
    ...(options.waitForSelector
      ? {
          actions: [
            { type: "wait" as const, selector: options.waitForSelector },
            ...(options.waitAfterSelectorMs !== undefined
              ? [
                  {
                    type: "wait" as const,
                    milliseconds: options.waitAfterSelectorMs,
                  },
                ]
              : []),
          ],
        }
      : options.waitForMs !== undefined
        ? { waitFor: options.waitForMs }
        : {}),
    ...(maxAgeMs !== undefined
      ? {
          maxAge: maxAgeMs,
          storeInCache: true,
        }
      : {}),
  };
}

async function scrapeHtmlThroughFirecrawl(
  source: ManagedScraperSource,
  url: string,
  control: ScraperControl,
  options: HtmlScrapeOptions,
): Promise<{ readonly html: string; readonly rawHtml?: string }> {
  const document = await withRetry(source, control, () =>
    firecrawlClient(source).scrape(
      url,
      firecrawlScrapeOptions(control, options),
    ),
  );
  const responseError = firecrawlResponseError(document, url);
  if (responseError) throw responseError;
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
  return {
    html,
    ...(options.includeRawHtml && document.rawHtml
      ? { rawHtml: document.rawHtml }
      : {}),
  };
}

function errorMessage(source: ManagedScraperSource, error: unknown): string {
  return error instanceof Error ? error.message : `${source} is unavailable.`;
}

export async function scrapeHtml(
  source: ManagedScraperSource,
  url: string,
  options: HtmlScrapeOptions = {},
): Promise<{
  readonly html: string;
  readonly rawHtml?: string;
  readonly engine: ScrapeEngine;
}> {
  const control = await assertScraperEnabled(source);
  const engine = resolvedScrapeEngine(source, control);
  if (engine === "firecrawl") {
    try {
      const document = await scrapeHtmlThroughFirecrawl(
        source,
        url,
        control,
        options,
      );
      return {
        ...document,
        engine,
      };
    } catch (error) {
      if (error instanceof SandDataUpstreamError) throw error;
      throw new SandDataUpstreamError(
        source,
        "unavailable",
        errorMessage(source, error),
      );
    }
  }

  try {
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
    await recordNativeTransportSuccess({ control }).catch(() => undefined);
    return { html, engine };
  } catch (nativeError) {
    if (firecrawlKey()) {
      try {
        const document = await scrapeHtmlThroughFirecrawl(
          source,
          url,
          control,
          options,
        );
        await recordNativeFallbackSuccess({
          control,
          nativeError: errorMessage(source, nativeError),
        }).catch(() => undefined);
        return { ...document, engine: "firecrawl" };
      } catch (fallbackError) {
        throw new SandDataUpstreamError(
          source,
          "unavailable",
          `${errorMessage(source, nativeError)} Firecrawl fallback: ${errorMessage(source, fallbackError)}`,
        );
      }
    }
    throw new SandDataUpstreamError(
      source,
      "unavailable",
      errorMessage(source, nativeError),
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
    readonly maxAgeMs?: number;
  } = {},
): Promise<T> {
  const control = await assertScraperEnabled(source);
  const supportsFirecrawl =
    options.body === undefined && options.method !== "POST";
  if (
    supportsFirecrawl &&
    resolvedScrapeEngine(source, control) === "firecrawl"
  ) {
    try {
      return await scrapeJsonThroughFirecrawl<T>(source, url, control, options);
    } catch (error) {
      throw new SandDataUpstreamError(
        source,
        "unavailable",
        errorMessage(source, error),
      );
    }
  }

  try {
    const value = await withRetry(source, control, async () => {
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
    await recordNativeTransportSuccess({ control }).catch(() => undefined);
    return value;
  } catch (error) {
    const supportsFirecrawlFallback =
      supportsFirecrawl && Boolean(firecrawlKey());
    if (supportsFirecrawlFallback) {
      try {
        const value = await scrapeJsonThroughFirecrawl<T>(
          source,
          url,
          control,
          options,
        );
        await recordNativeFallbackSuccess({
          control,
          nativeError: errorMessage(source, error),
        }).catch(() => undefined);
        return value;
      } catch (fallbackError) {
        throw new SandDataUpstreamError(
          source,
          "unavailable",
          `${errorMessage(source, error)} Firecrawl fallback: ${errorMessage(source, fallbackError)}`,
        );
      }
    }
    throw new SandDataUpstreamError(
      source,
      "unavailable",
      errorMessage(source, error),
    );
  }
}
