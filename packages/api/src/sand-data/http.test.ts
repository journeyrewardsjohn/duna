import { afterEach, describe, expect, it, vi } from "vitest";
const { firecrawlScrapeMock } = vi.hoisted(() => ({
  firecrawlScrapeMock: vi.fn(),
}));
vi.mock("@mendable/firecrawl-js", () => ({
  Firecrawl: class {
    scrape = firecrawlScrapeMock;
  },
}));
import {
  firecrawlPreferenceWindowMs,
  nextNativeFallbackState,
  resetAdaptiveTransportLearningForTests,
  type ScraperControl,
} from "./scraper-controls";
import {
  firecrawlScrapeOptions,
  parseFirecrawlJsonDocument,
  resolvedScrapeEngine,
  scrapeHtml,
  scrapeEngine,
} from "./http";

describe("parseFirecrawlJsonDocument", () => {
  it("accepts a raw JSON response from a rendered public endpoint", () => {
    expect(parseFirecrawlJsonDocument<{ id: number }>(`{"id":5520}`)).toEqual({
      id: 5520,
    });
  });

  it("accepts JSON wrapped in a rendered document", () => {
    expect(
      parseFirecrawlJsonDocument<{ name: string }>(
        "<html><body><pre>{&quot;name&quot;:&quot;John Sutton&quot;}</pre></body></html>",
      ),
    ).toEqual({ name: "John Sutton" });
  });
});
describe("sand data scrape engine routing", () => {
  const originalFirecrawlKey = process.env.FIRECRAWL_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    firecrawlScrapeMock.mockReset();
    resetAdaptiveTransportLearningForTests();
    if (originalFirecrawlKey === undefined) {
      delete process.env.FIRECRAWL_API_KEY;
    } else {
      process.env.FIRECRAWL_API_KEY = originalFirecrawlKey;
    }
  });

  it("falls back to Firecrawl when a native page returns 404", async () => {
    process.env.FIRECRAWL_API_KEY = "configured-in-production";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    firecrawlScrapeMock.mockResolvedValue({
      rawHtml: "<html><body>rendered fallback</body></html>",
      metadata: { statusCode: 200 },
    });

    await expect(
      scrapeHtml("avp-tournaments", "https://example.com/missing"),
    ).resolves.toEqual({
      html: "<html><body>rendered fallback</body></html>",
      engine: "firecrawl",
    });
  });

  it("promotes Firecrawl after three paired fallback successes", () => {
    const now = new Date("2026-08-21T12:00:00.000Z");
    const first = nextNativeFallbackState({
      nativeError: "HTTP 404",
      now,
    });
    const second = nextNativeFallbackState({
      current: first,
      nativeError: "HTTP 403",
      now,
    });
    const third = nextNativeFallbackState({
      current: second,
      nativeError: "fetch failed",
      now,
    });

    expect(first.firecrawlPreferredUntil).toBeUndefined();
    expect(second.firecrawlPreferredUntil).toBeUndefined();
    expect(third.nativeFailureStreak).toBe(3);
    expect(third.firecrawlPreferredUntil).toBe(
      new Date(now.getTime() + firecrawlPreferenceWindowMs).toISOString(),
    );
  });

  it("uses the learned Firecrawl default only until its recovery probe", () => {
    process.env.FIRECRAWL_API_KEY = "configured-in-production";
    const control: ScraperControl = {
      source: "fivb-12ndr",
      enabled: true,
      engine: "native",
      minRequestIntervalMs: 5_000,
      maxRequestsPerHour: 90,
      liveTransportEnabled: false,
      firecrawlChangeTracking: true,
      adaptiveTransport: {
        nativeFailureStreak: 3,
        firecrawlPreferredUntil: "2026-08-21T18:00:00.000Z",
      },
    };

    expect(
      resolvedScrapeEngine(
        "fivb-12ndr",
        control,
        new Date("2026-08-21T17:59:59.000Z"),
      ),
    ).toBe("firecrawl");
    expect(
      resolvedScrapeEngine(
        "fivb-12ndr",
        control,
        new Date("2026-08-21T18:00:01.000Z"),
      ),
    ).toBe("native");
  });

  it("keeps the server-rendered 12ndr feed on native HTTP", () => {
    process.env.FIRECRAWL_API_KEY = "configured-in-production";
    expect(scrapeEngine("fivb-12ndr")).toBe("native");
  });

  it("keeps server-rendered BVBInfo on native HTTP", () => {
    process.env.FIRECRAWL_API_KEY = "configured-in-production";
    expect(scrapeEngine("bvbinfo")).toBe("native");
  });

  it("reports the same resolved engine used by the transport", () => {
    process.env.FIRECRAWL_API_KEY = "configured-in-production";
    const autoFivb: ScraperControl = {
      source: "fivb-12ndr",
      enabled: true,
      engine: "auto",
      minRequestIntervalMs: 5_000,
      maxRequestsPerHour: 90,
      liveTransportEnabled: false,
      firecrawlChangeTracking: true,
    };
    const renderedAvp: ScraperControl = {
      ...autoFivb,
      source: "avp-league",
    };

    expect(resolvedScrapeEngine("fivb-12ndr", autoFivb)).toBe("native");
    expect(resolvedScrapeEngine("avp-league", renderedAvp)).toBe("firecrawl");
  });

  it("builds a rendered Firecrawl request with valid change tracking", () => {
    const control: ScraperControl = {
      source: "avp-league",
      enabled: true,
      engine: "firecrawl",
      minRequestIntervalMs: 5_000,
      maxRequestsPerHour: 60,
      liveTransportEnabled: false,
      firecrawlCacheTtlSeconds: 3_600,
      firecrawlChangeTracking: true,
    };
    const options = firecrawlScrapeOptions(control, {
      waitForSelector: "#league-app table",
      timeoutMs: 90_000,
    });

    expect(options.formats).toEqual([
      "html",
      "rawHtml",
      "markdown",
      { type: "changeTracking", modes: ["git-diff"] },
    ]);
    expect(options.actions).toEqual([
      { type: "wait", selector: "#league-app table" },
    ]);
    expect(options.waitFor).toBeUndefined();
    expect(options.maxAge).toBe(3_600_000);
    expect(options.proxy).toBe("auto");
    expect(options.onlyMainContent).toBe(false);
    expect(options.removeBase64Images).toBe(true);
  });
});
