import { describe, expect, it } from "vitest";
import { resolveCanonicalEventLocation } from "./event-location";

describe("canonical public event location", () => {
  it("prefers the connected venue over an ambiguous blueprint label", () => {
    expect(
      resolveCanonicalEventLocation({
        blueprint: {
          mode: "venue",
          venueName: "The Strand",
          latitude: 38.9,
          longitude: -76.99,
        },
        venue: {
          address: "9800 Windygap Rd · Charlotte, NC, 28278 · US",
          googlePlaceId: "strand-charlotte",
          latitude: 35.115,
          longitude: -81.016,
          name: "The Strand",
        },
      }),
    ).toMatchObject({
      address: "9800 Windygap Rd · Charlotte, NC, 28278 · US",
      confidence: "confirmed",
      googlePlaceId: "strand-charlotte",
      latitude: 35.115,
      longitude: -81.016,
      venueName: "The Strand",
    });
  });

  it("preserves online event destinations", () => {
    expect(
      resolveCanonicalEventLocation({
        blueprint: {
          mode: "online",
          onlineUrl: "https://example.com/live",
          venueName: "Live stream",
        },
        venue: { name: "Unused court" },
      }),
    ).toMatchObject({ mode: "online", onlineUrl: "https://example.com/live" });
  });

  it("does not combine a canonical venue address with stale blueprint coordinates", () => {
    expect(
      resolveCanonicalEventLocation({
        blueprint: {
          mode: "venue",
          venueName: "The Strand",
          latitude: 38.9,
          longitude: -76.99,
        },
        venue: {
          address: "9800 Windygap Rd · Charlotte, NC, 28278 · US",
          name: "The Strand",
        },
      }),
    ).toEqual({
      address: "9800 Windygap Rd · Charlotte, NC, 28278 · US",
      confidence: "approximate",
      mode: "venue",
      venueName: "The Strand",
    });
  });
});
