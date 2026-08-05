import { describe, expect, it } from "vitest";
import { googleMapsSearchUrl, nativeMapUrl } from "./map-links";

describe("map links", () => {
  it("encodes international addresses and place ids", () => {
    expect(
      googleMapsSearchUrl({
        address: "Rennbahnstraße 96, 22111 Hamburg, Germany",
        googlePlaceId: "ChIJ venue+id",
      }),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=Rennbahnstra%C3%9Fe%2096%2C%2022111%20Hamburg%2C%20Germany&query_place_id=ChIJ%20venue%2Bid",
    );
  });

  it("builds native iOS and Android map links", () => {
    const location = {
      address: "Rennbahnstraße 96, 22111 Hamburg, Germany",
      label: "Hamburg-Horn racecourse",
      latitude: 53.554,
      longitude: 10.087,
    } as const;

    expect(nativeMapUrl({ ...location, platform: "ios" })).toBe(
      "https://maps.apple.com/?q=Hamburg-Horn%20racecourse&ll=53.554,10.087",
    );
    expect(nativeMapUrl({ ...location, platform: "android" })).toBe(
      "geo:53.554,10.087?q=53.554%2C10.087(Hamburg-Horn%20racecourse)",
    );
  });
});
