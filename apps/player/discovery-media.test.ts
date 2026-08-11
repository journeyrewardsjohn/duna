import { describe, expect, it } from "vitest";
import { resolveDiscoveryMediaUrl } from "./discovery-media";

describe("resolveDiscoveryMediaUrl", () => {
  const webBaseUrl = "https://duna.coach";

  it("turns web-root media paths into URLs the native image loader can fetch", () => {
    expect(
      resolveDiscoveryMediaUrl(
        "/media/event-library/duna-event-golden-hour-pickup.webp",
        webBaseUrl,
      ),
    ).toBe(
      "https://duna.coach/media/event-library/duna-event-golden-hour-pickup.webp",
    );
  });

  it("preserves absolute image and video URLs", () => {
    expect(
      resolveDiscoveryMediaUrl(
        "https://cdn.example.com/event/hero.jpg",
        webBaseUrl,
      ),
    ).toBe("https://cdn.example.com/event/hero.jpg");
    expect(
      resolveDiscoveryMediaUrl(
        "https://cdn.example.com/event/hero.m3u8",
        webBaseUrl,
      ),
    ).toBe("https://cdn.example.com/event/hero.m3u8");
  });

  it("returns no media for blank values", () => {
    expect(resolveDiscoveryMediaUrl("  ", webBaseUrl)).toBeUndefined();
    expect(resolveDiscoveryMediaUrl(undefined, webBaseUrl)).toBeUndefined();
  });
});
