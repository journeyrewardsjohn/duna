import { afterEach, describe, expect, it } from "vitest";
import { scrapeEngine } from "./http";

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
});
