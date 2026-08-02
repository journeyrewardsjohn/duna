import { Firecrawl, type ScrapeOptions } from "@mendable/firecrawl-js";
import { SandDataUpstreamError, type SandDataSource } from "./types";

type ScrapeEngine = "firecrawl" | "native";

const sourceSpacingMs: Readonly<Record<SandDataSource, number>> = {
  bvbinfo: 2_000,
  "fivb-12ndr": 3_000,
  "volleyball-life": 1_000,
  "volleyball-world": 1_000,
};
const nextRequestAt = new Map<SandDataSource, number>();
let firecrawl: Firecrawl | undefined;

function firecrawlKey(): string | undefined {
  return (
    process.env.FIRECRAWL_API_KEY?.trim() ||
    process.env.FIRECRAWL_API?.trim() ||
    undefined
  );
}

export function scrapeEngine(source: SandDataSource): ScrapeEngine {
  if (
    source === "volleyball-life" ||
    source === "volleyball-world" ||
    process.env.SAND_SCRAPER_ENGINE === "native"
  ) {
    return "native";
  }
  return firecrawlKey() ? "firecrawl" : "native";
}

async function acquireSourceSlot(source: SandDataSource): Promise<void> {
  const now = Date.now();
  const next = nextRequestAt.get(source) ?? now;
  if (next > now) {
    await new Promise((resolve) => setTimeout(resolve, next - now));
  }
  nextRequestAt.set(source, Date.now() + sourceSpacingMs[source]);
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
  source: SandDataSource,
  action: () => Promise<T>,
): Promise<T> {
  let latest: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await acquireSourceSlot(source);
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

function firecrawlClient(): Firecrawl {
  const apiKey = firecrawlKey();
  if (!apiKey) {
    throw new SandDataUpstreamError(
      "bvbinfo",
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

const nativeHeaders = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (compatible; DunaSandData/1.0; +https://duna.sport)",
};

export async function scrapeHtml(
  source: SandDataSource,
  url: string,
  options: {
    readonly waitForMs?: number;
    readonly timeoutMs?: number;
    readonly proxy?: ScrapeOptions["proxy"];
  } = {},
): Promise<{ readonly html: string; readonly engine: ScrapeEngine }> {
  const engine = scrapeEngine(source);
  try {
    if (engine === "firecrawl") {
      const document = await withRetry(source, () =>
        firecrawlClient().scrape(url, {
          formats: ["html", "rawHtml"],
          onlyMainContent: false,
          waitFor: options.waitForMs,
          timeout: options.timeoutMs ?? 60_000,
          proxy: options.proxy,
          blockAds: true,
        }),
      );
      const html = document.rawHtml ?? document.html ?? "";
      if (!html) {
        throw new SandDataUpstreamError(
          source,
          "invalid-response",
          `${source} returned an empty rendered page.`,
        );
      }
      return { html, engine };
    }

    const html = await withRetry(source, async () => {
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
  source: SandDataSource,
  url: string,
  options: {
    readonly method?: "GET" | "POST";
    readonly body?: unknown;
  } = {},
): Promise<T> {
  try {
    return await withRetry(source, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        const hasBody = options.body !== undefined;
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            "User-Agent": "DunaSandData/1.0 (+https://duna.sport)",
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
    throw new SandDataUpstreamError(
      source,
      "unavailable",
      error instanceof Error ? error.message : `${source} is unavailable.`,
    );
  }
}
