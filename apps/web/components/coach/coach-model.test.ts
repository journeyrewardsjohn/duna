import type { PublicCatalogItem } from "@duna/api";
import { demoOrganizationStorefront } from "@duna/core/demo/storefront";
import { describe, expect, it } from "vitest";
import {
  coachClubs,
  coachCredentials,
  coachOfferings,
  nextSlots,
  weeklyHours,
} from "./coach-model";

const now = new Date("2026-12-08T17:00:00.000Z");
const storefront = demoOrganizationStorefront("south-bay-volleyball", now)!;
const catalog = storefront.catalog as unknown as readonly PublicCatalogItem[];
const theo = "10000000-0000-4000-8000-000000000011";

describe("coach profile model", () => {
  it("credentials are only what the data has", () => {
    expect(
      coachCredentials({ playingExperience: "collegiate", yearsPlaying: 9 }),
    ).toEqual(["Played in college", "9 years playing"]);
    expect(coachCredentials({ playingExperience: "not-set" })).toEqual([]);
    expect(coachCredentials({})).toEqual([]);
  });

  it("lists each club once", () => {
    expect(
      coachClubs([
        { organizationSlug: "a", organizationName: "A" },
        { organizationSlug: "a", organizationName: "A" },
        { organizationSlug: "b", organizationName: "B" },
      ]),
    ).toEqual([
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ]);
  });

  it("what you can book: listed services plus the club's sessions this coach is on", () => {
    const offerings = coachOfferings({
      coach: { personId: theo, services: [] },
      clubSlug: storefront.slug,
      clubName: storefront.name,
      catalog,
    });
    expect(offerings.map((offering) => offering.item.slug).sort()).toEqual([
      "private-lesson-theo-park",
      "serve-receive-clinic",
    ]);
    const slots = nextSlots({ personId: theo, offerings, now });
    expect(slots.length).toBeGreaterThan(0);
    const times = slots.map((slot) => Date.parse(slot.occurrence.startsAt));
    expect(times).toEqual([...times].sort((left, right) => left - right));
    expect(slots[0]!.offering.item.slug).toBe("private-lesson-theo-park");
  });

  it("weekly hours read as days and times; malformed windows are skipped", () => {
    expect(
      weeklyHours([
        { weekday: 2, startsAt: "16:00", endsAt: "20:00" },
        { weekday: 9, startsAt: "08:00", endsAt: "09:00" },
        { startsAt: "08:00" },
      ]),
    ).toEqual([{ day: "Tuesday", hours: "4:00 PM – 8:00 PM" }]);
  });
});
