import { afterEach, describe, expect, it } from "vitest";
import type { ScraperControl } from "./scraper-controls";
import {
  firecrawlScrapeOptions,
  parseFirecrawlJsonDocument,
  resolvedScrapeEngine,
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
    if (originalFirecrawlKey === undefined) {
      delete process.env.FIRECRAWL_API_KEY;
    } else {
      process.env.FIRECRAWL_API_KEY = originalFirecrawlKey;
    }
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
