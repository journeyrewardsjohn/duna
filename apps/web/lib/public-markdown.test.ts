import type { EventSummary } from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  canonicalPathFromMarkdownRequest,
  markdownPathForCanonical,
  renderAgentsGuide,
  renderConsumerEventMarkdown,
  renderSitemapMarkdown,
  renderStaticPageMarkdown,
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

    const index = renderSitemapMarkdown([
      { url: "https://duna.coach/events/golden-hour-4s" },
    ]);
    expect(index).toContain("https://duna.coach/events/golden-hour-4s.md");
  });

  it("documents the distinct club-owner and solo-coach operating paths", () => {
    const markdown = renderStaticPageMarkdown("/run-your-club");
    expect(markdown).toContain("Solo coaches can manage a mobile calendar");
    expect(markdown).toContain("Club owners can coordinate venues");
    expect(markdown).toContain("Players control health-data sharing");
    expect(markdown).toContain("Duna AI suggestions remain reviewable");
  });
});
