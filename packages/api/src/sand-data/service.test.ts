import { describe, expect, it } from "vitest";
import { parsePlayerSourceProfile, professionalEventSlug } from "./service";

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

describe("parsePlayerSourceProfile", () => {
  it("normalizes VolleyballLife player links to a stable source identity", () => {
    expect(
      parsePlayerSourceProfile(
        "volleyball-life",
        "https://www.volleyballlife.com/playerprofile/000653?tab=matches",
      ),
    ).toEqual({
      externalId: "653",
      profileUrl: "https://volleyballlife.com/playerprofile/653",
    });
  });

  it("accepts a BVBInfo numeric player id", () => {
    expect(parsePlayerSourceProfile("bvbinfo", "8737")).toEqual({
      externalId: "8737",
      profileUrl: "http://www.bvbinfo.com/player.asp?ID=8737&Page=1",
    });
  });

  it("rejects lookalike source domains", () => {
    expect(() =>
      parsePlayerSourceProfile(
        "volleyball-life",
        "https://volleyballlife.example/playerprofile/653",
      ),
    ).toThrow("VolleyballLife");
  });
});
