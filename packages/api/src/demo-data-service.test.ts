import { describe, expect, it } from "vitest";
import { isBeachEliteDemoOrganization } from "./demo-data-service";

describe("Beach Elite Demo data targeting", () => {
  it("only recognizes the named QA organization and its legacy Demo identity", () => {
    expect(
      isBeachEliteDemoOrganization({
        name: "Beach Elite Academy",
        slug: "beach-elite-academy",
      }),
    ).toBe(true);
    expect(isBeachEliteDemoOrganization({ name: "Demo", slug: "demo" })).toBe(
      true,
    );
    expect(
      isBeachEliteDemoOrganization({
        name: "Another Club",
        slug: "another-club",
      }),
    ).toBe(false);
  });
});
