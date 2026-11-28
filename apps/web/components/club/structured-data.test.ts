import type { EventSummary, PublicOrganizationStorefront } from "@duna/api";
import { demoEvents } from "@duna/core/demo";
import { demoOrganizationStorefront } from "@duna/core/demo/storefront";
import { describe, expect, it } from "vitest";
import { coachJsonLd } from "../coach/coach-model";
import { eventJsonLd } from "../event/structured-data";
import { offeringPrice } from "./offers";
import {
  clubJsonLd,
  offeringJsonLd,
  serializeGraph,
  type JsonLd,
} from "./structured-data";

const now = new Date("2026-12-08T17:00:00.000Z");
const storefront = demoOrganizationStorefront(
  "south-bay-volleyball",
  now,
)! as unknown as PublicOrganizationStorefront;

const graph = (value: JsonLd) => value["@graph"] as readonly JsonLd[];
const ofType = (value: JsonLd, type: string) =>
  graph(value).filter((node) => node["@type"] === type);

describe("structured data builders", () => {
  it("club: a SportsClub with each venue a SportsActivityLocation and all-in offers", () => {
    const value = clubJsonLd({
      storefront,
      coaches: [{ handle: "theopark", displayName: "Theo Park" }],
      now,
    });
    const [club] = ofType(value, "SportsClub");
    expect(club!.name).toBe("South Bay Volleyball Club");
    expect(String(club!["@id"])).toMatch(/\/clubs\/south-bay-volleyball#club$/);
    const venues = ofType(value, "SportsActivityLocation");
    expect(venues).toHaveLength(storefront.venues.length);
    expect(venues[0]!.geo).toMatchObject({ "@type": "GeoCoordinates" });
    const offers = club!.makesOffer as readonly JsonLd[];
    const openPlay = storefront.catalog.find(
      (item) => item.slug === "evening-open-play",
    )!;
    expect(
      offers.find((offer) => offer.name === "Evening open play"),
    ).toMatchObject({
      price: (offeringPrice(openPlay).card!.allInMinor / 100).toFixed(2),
      priceCurrency: "USD",
    });
    expect(ofType(value, "BreadcrumbList")).toHaveLength(1);
    // Nothing the page does not show: no ratings, reviews or member counts.
    expect(JSON.stringify(value)).not.toMatch(
      /aggregateRating|review|memberCount/,
    );
  });

  it("offering: a Product for goods and plans, a Service for sessions, sold-out offers marked", () => {
    const jersey = storefront.catalog.find(
      (item) => item.slug === "club-practice-jersey",
    )!;
    const product = ofType(
      offeringJsonLd({ storefront, item: jersey, now }),
      "Product",
    )[0]!;
    const offers = product.offers as readonly JsonLd[];
    expect(offers).toHaveLength(3);
    expect(offers.find((offer) => offer.name === "Medium")!.availability).toBe(
      "https://schema.org/SoldOut",
    );
    const clinic = storefront.catalog.find(
      (item) => item.slug === "serve-receive-clinic",
    )!;
    expect(
      ofType(offeringJsonLd({ storefront, item: clinic, now }), "Service"),
    ).toHaveLength(1);
  });

  it("event: a SportsEvent with no attendees or performers", () => {
    const event = demoEvents.find(
      (candidate) => candidate.slug === "sunset-open-qualifier",
    )! as EventSummary;
    const value = eventJsonLd({
      ...event,
      lifecycleStatus: "completed",
      live: false,
    });
    const [sports] = ofType(value, "SportsEvent");
    expect(sports!.startDate).toBe(event.startsAt);
    expect(sports!.attendee).toBeUndefined();
    expect(sports!.performer).toBeUndefined();
    expect((sports!.offers as readonly JsonLd[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(value)).not.toMatch(/registrationTeams|displayName/);
  });

  it("event: a cancelled event says so", () => {
    const event = demoEvents[0]! as EventSummary;
    const [sports] = ofType(
      eventJsonLd({ ...event, lifecycleStatus: "cancelled" }),
      "SportsEvent",
    );
    expect(sports!.eventStatus).toBe("https://schema.org/EventCancelled");
  });

  it("coach: a Person with the clubs they coach at and no invented credentials", () => {
    const value = coachJsonLd({
      coach: {
        personId: "10000000-0000-4000-8000-000000000011",
        handle: "theopark",
        displayName: "Theo Park",
      },
      clubs: [
        { slug: "south-bay-volleyball", name: "South Bay Volleyball Club" },
      ],
      offerings: [],
    });
    const [person] = ofType(value, "Person");
    expect(person!.jobTitle).toBe("Volleyball coach");
    expect(person!.worksFor).toHaveLength(1);
    expect(JSON.stringify(value)).not.toMatch(/hasCredential|award|review/);
  });

  it("serialises safely inside a script tag", () => {
    expect(serializeGraph({ name: "</script><script>" })).not.toContain(
      "</script>",
    );
  });
});
