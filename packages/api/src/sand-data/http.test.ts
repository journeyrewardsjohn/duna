import { afterEach, describe, expect, it } from "vitest";
import { parseFirecrawlJsonDocument, scrapeEngine } from "./http";

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
