import { describe, expect, it } from "vitest";
import { professionalEventSlug } from "./service";

describe("professionalEventSlug", () => {
  it("creates one stable gender segment when the name already includes it", () => {
    expect(
      professionalEventSlug({
        name: "BPT Elite Gstaad - Men's",
        genderCategory: "men",
        startsOn: "2026-07-01",
      }),
    ).toBe("bpt-elite-gstaad-mens-2026-07-01");
  });

  it("normalizes punctuation and women's division labels for SEO", () => {
    expect(
      professionalEventSlug({
        name: "Elite 16 — Montréal | Women",
        genderCategory: "women",
        startsOn: "2026-08-20",
      }),
    ).toBe("elite-16-montreal-womens-2026-08-20");
  });
});
