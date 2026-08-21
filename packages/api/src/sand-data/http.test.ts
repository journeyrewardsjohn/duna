import { describe, expect, it } from "vitest";
import { parseFirecrawlJsonDocument } from "./http";

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
