import type {
  CourtBookingInventory,
  DiscoveryMapItem,
  VenueSummary,
} from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  discoveryCollectionJsonLd,
  venueJsonLd,
  venueSummaryJsonLd,
} from "./discovery-seo";

describe("discovery structured data", () => {
  it("publishes canonical entity references without inventing hidden facts", () => {
    const item = {
      id: "event:one",
      entityType: "event",
      kind: "tournament",
      title: "Golden Hour",
      subtitle: "Hermosa Beach",
      href: "/events/golden-hour",
      latitude: 33.86,
      longitude: -118.4,
      startsAt: "2026-08-29T18:00:00.000Z",
      endsAt: "2026-08-29T21:00:00.000Z",
      price: { amountMinor: 4000, currency: "USD" },
      spotsRemaining: 3,
      tags: ["tournament"],
    } satisfies DiscoveryMapItem;
    const json = JSON.stringify(discoveryCollectionJsonLd([item]));
    expect(json).toContain("CollectionPage");
    expect(json).toContain("ItemList");
    expect(json).toContain("https://duna.coach/events/golden-hour#entity");
    expect(json).toContain('"price":40');
    expect(json).not.toContain("aggregateRating");
  });

  it("describes public court inventory and its authenticated booking offers", () => {
    const inventory = {
      venue: {
        id: "e2460419-5d9f-4ba1-9829-b86cd855ed79",
        name: "Pier Courts",
        city: "Hermosa Beach",
        region: "CA",
        timezone: "America/Los_Angeles",
        organizationName: "Beach Elite",
        organizationId: "0459f4ec-aeed-4a6f-83f1-e2ad23c18cec",
        organizationSlug: "beach-elite",
        paymentsReady: true,
        capacity: 24,
        amenities: ["Showers"],
        latitude: 33.86,
        longitude: -118.4,
      },
      courts: [
        {
          id: "a5e07636-767b-4f31-8a5b-5013f5b56673",
          name: "Court 1",
          surface: "Sand",
          lit: true,
          capacity: 4,
          bookingPolicy: "Public",
          minimumDurationMinutes: 60,
          maximumDurationMinutes: 120,
          durationOptionsMinutes: [60],
          bookingIncrementMinutes: 30,
          minimumNoticeMinutes: 60,
          maximumAdvanceDays: 30,
          cancellationPolicy: {
            title: "Flexible",
            markdown: "Cancel 24 hours before play.",
            requireFullScroll: false,
          },
          pricing: {
            name: "Hourly",
            currency: "USD",
            baseAmountMinor: 5000,
            rateUnitMinutes: 60,
          },
        },
      ],
    } as CourtBookingInventory;
    const json = JSON.stringify(venueJsonLd(inventory));
    expect(json).toContain("SportsActivityLocation");
    expect(json).toContain("Court 1 rental");
    expect(json).toContain('"price":50');
    expect(json).toContain("https://duna.coach/venues/");
  });

  it("keeps a public venue indexable before live rental inventory exists", () => {
    const venue = {
      id: "e2460419-5d9f-4ba1-9829-b86cd855ed79",
      organizationId: "7ee5d312-b88a-43cd-95fa-a9c89339e0a4",
      name: "Pier Courts",
      city: "Hermosa Beach",
      region: "CA",
      timezone: "America/Los_Angeles",
      courtCount: 8,
      openNow: true,
      latitude: 33.86,
      longitude: -118.4,
      tags: ["Oceanfront"],
    } satisfies VenueSummary;
    const json = JSON.stringify(venueSummaryJsonLd(venue));
    expect(json).toContain("SportsActivityLocation");
    expect(json).toContain('"value":8');
    expect(json).not.toContain("makesOffer");
  });
});
