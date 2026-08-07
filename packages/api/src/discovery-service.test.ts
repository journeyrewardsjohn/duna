import type { EventSummary, VenueSummary } from "@duna/core";
import { describe, expect, it } from "vitest";
import type { PublicCoach } from "./contracts";
import { buildDiscoveryMap } from "./discovery-service";
import type { PublicProEvent } from "./sand-data/service";

const venue: VenueSummary = {
  id: "venue-1",
  organizationId: "1f39d495-cd8d-4217-87f5-4466f8bf2533",
  name: "Center Court",
  city: "Manhattan Beach",
  region: "CA",
  timezone: "America/Los_Angeles",
  courtCount: 8,
  openNow: true,
  latitude: 33.8847,
  longitude: -118.4109,
  tags: ["sand"],
};

const event: EventSummary = {
  id: "event-1",
  slug: "weekend-open",
  title: "Weekend Open",
  kind: "tournament",
  organizationId: venue.organizationId,
  organizationName: "South Bay Volleyball",
  venueName: venue.name,
  startsAt: "2026-08-08T16:00:00.000Z",
  endsAt: "2026-08-09T01:00:00.000Z",
  timezone: venue.timezone,
  price: { amountMinor: 2500, currency: "USD" },
  spotsRemaining: 12,
  capacity: 32,
  tags: ["open"],
};

const coach: PublicCoach = {
  personId: "51f19947-43e0-4f7e-87ea-ee65626b537d",
  organizationId: venue.organizationId,
  organizationSlug: "south-bay-volleyball",
  organizationName: "South Bay Volleyball",
  displayName: "Maya Chen",
  handle: "maya-chen",
  homeMarket: "South Bay",
  availability: [],
  services: [],
  upcomingSessions: [],
};

describe("buildDiscoveryMap", () => {
  it("inherits verified venue coordinates for events and coaches", () => {
    const result = buildDiscoveryMap({
      events: [event],
      venues: [venue],
      coaches: [coach],
      now: new Date("2026-08-05T12:00:00.000Z"),
    });

    expect(result.generatedAt).toBe("2026-08-05T12:00:00.000Z");
    expect(result.items).toHaveLength(3);
    expect(
      result.items.find((item) => item.entityType === "event"),
    ).toMatchObject({
      latitude: venue.latitude,
      longitude: venue.longitude,
      imageUrl: expect.stringContaining("/media/event-library/"),
    });
    expect(
      result.items.find((item) => item.entityType === "coach"),
    ).toMatchObject({
      latitude: venue.latitude,
      longitude: venue.longitude,
    });
  });

  it("leaves an item unmapped when no verified coordinate exists", () => {
    const result = buildDiscoveryMap({
      events: [{ ...event, organizationId: undefined, venueName: "TBD" }],
      venues: [],
      coaches: [],
    });

    expect(result.items[0]).not.toHaveProperty("latitude");
    expect(result.items[0]).not.toHaveProperty("longitude");
  });

  it("keeps expired play out of the live discovery feed", () => {
    const result = buildDiscoveryMap({
      events: [
        event,
        {
          ...event,
          id: "event-past",
          slug: "past-open",
          startsAt: "2026-08-01T16:00:00.000Z",
          endsAt: "2026-08-01T22:00:00.000Z",
        },
      ],
      venues: [venue],
      coaches: [],
      now: new Date("2026-08-05T12:00:00.000Z"),
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "venue:venue-1",
      "event:event-1",
    ]);
  });

  it("uses professional event posters before the default media library", () => {
    const proEvent = {
      id: "pro-event-1",
      slug: "bpt-elite16-hamburg-womens-2026-08-05",
      name: "BPT Elite16 Hamburg",
      tour: "bpt",
      source: "fivb",
      genderCategory: "women",
      startsOn: "2026-08-05",
      endsOn: "2026-08-09",
      status: "live",
      live: true,
      poster: {
        url: "https://example.com/hamburg-official-poster.jpg",
        alt: "Official Hamburg event poster",
        kind: "poster",
      },
    } as unknown as PublicProEvent;
    const result = buildDiscoveryMap({
      events: [],
      venues: [],
      coaches: [],
      proEvents: [proEvent],
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.items[0]).toMatchObject({
      entityType: "pro-tour",
      imageUrl: "https://example.com/hamburg-official-poster.jpg",
      imageFit: "contain",
    });
  });
});
