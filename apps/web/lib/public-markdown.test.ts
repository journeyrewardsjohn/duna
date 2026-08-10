import type { EventSummary } from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  canonicalPathFromMarkdownRequest,
  markdownPathForCanonical,
  renderAgentsGuide,
  renderConsumerEventMarkdown,
  renderDiscoveryMarkdown,
  renderSitemapMarkdown,
  renderStaticPageMarkdown,
  renderVenueSummaryMarkdown,
} from "./public-markdown";

const event = {
  id: "6b53f4fe-2b1a-401f-8581-81210f0200ad",
  slug: "golden-hour-4s",
  title: "Golden Hour 4s",
  kind: "tournament",
  organizationName: "Beach Elite",
  venueName: "Hermosa Beach Pier Courts",
  startsAt: "2026-08-29T18:00:00-07:00",
  endsAt: "2026-08-29T21:00:00-07:00",
  timezone: "America/Los_Angeles",
  price: { amountMinor: 4000, currency: "USD" },
  spotsRemaining: 3,
  capacity: 16,
  location: {
    mode: "venue",
    venueName: "Hermosa Beach Pier Courts",
    address: "1 Pier Ave, Hermosa Beach, CA 90254",
    latitude: 33.8616,
    longitude: -118.4047,
    confidence: "confirmed",
  },
  divisions: [
    {
      id: "8fe7fdc2-a482-4a3e-8335-30b18b7fb944",
      name: "Open 4s",
      discipline: "beach-4s",
      ratingBasis: "Team average",
      price: { amountMinor: 4000, currency: "USD" },
      teamPrice: { amountMinor: 16000, currency: "USD" },
      playerPrice: { amountMinor: 4000, currency: "USD" },
      spotsRemaining: 3,
      capacity: 16,
    },
  ],
  tags: ["4s"],
} as EventSummary;

describe("public Markdown representations", () => {
  it("maps canonical paths to deterministic Markdown paths", () => {
    expect(markdownPathForCanonical("/")).toBe("/index.md");
    expect(markdownPathForCanonical("/events/golden-hour-4s")).toBe(
      "/events/golden-hour-4s.md",
    );
    expect(canonicalPathFromMarkdownRequest("/events/golden-hour-4s.md")).toBe(
      "/events/golden-hour-4s",
    );
  });

  it("preserves event geography, timezone, pricing, and action links", () => {
    const markdown = renderConsumerEventMarkdown(event);
    expect(markdown).toContain('entity_type: "sports_event"');
    expect(markdown).toContain("America/Los_Angeles");
    expect(markdown).toContain("33.8616, -118.4047");
    expect(markdown).toContain("Open 4s");
    expect(markdown).toContain("https://duna.coach/events/golden-hour-4s");
    expect(markdown).toContain("Do not claim a place is reserved");
  });

  it("publishes the machine routing contract and paired sitemap", () => {
    const guide = renderAgentsGuide();
    expect(guide).toContain("Every canonical public page");
    expect(guide).toContain("find_where_to_watch");
    expect(guide).toContain("Do not infer geography");
    expect(guide).toContain("https://duna.coach/discover.md");

    const index = renderSitemapMarkdown([
      { url: "https://duna.coach/events/golden-hour-4s" },
    ]);
    expect(index).toContain("https://duna.coach/events/golden-hour-4s.md");
  });

  it("publishes a canonical machine-readable discovery index", () => {
    const markdown = renderDiscoveryMarkdown([
      {
        id: "venue:one",
        entityType: "venue",
        kind: "court-booking",
        title: "Pier Courts",
        subtitle: "Hermosa Beach, CA",
        href: "/venues/6b53f4fe-2b1a-401f-8581-81210f0200ad",
        latitude: 33.86,
        longitude: -118.4,
        courtCount: 8,
        openNow: true,
        tags: ["courts"],
      },
    ]);
    expect(markdown).toContain('entity_type: "collection_page"');
    expect(markdown).toContain("Nearby searches expand through 10, 30, 60");
    expect(markdown).toContain("https://duna.coach/venues/");
    expect(markdown).toContain("8 courts");
  });

  it("does not imply bookability for a venue without published inventory", () => {
    const markdown = renderVenueSummaryMarkdown({
      id: "6b53f4fe-2b1a-401f-8581-81210f0200ad",
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
    });
    expect(markdown).toContain("sports_activity_location");
    expect(markdown).toContain(
      "Live court inventory and online rates have not been published",
    );
    expect(markdown).toContain("Do not claim a court is available");
  });

  it("documents the distinct club-owner and solo-coach operating paths", () => {
    const markdown = renderStaticPageMarkdown("/run-your-club");
    expect(markdown).toContain("Solo coaches can manage a mobile calendar");
    expect(markdown).toContain("Club owners can coordinate venues");
    expect(markdown).toContain("Players control health-data sharing");
    expect(markdown).toContain("Duna AI suggestions remain reviewable");
  });
});
