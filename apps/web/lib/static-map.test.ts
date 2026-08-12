import { describe, expect, it } from "vitest";
import {
  geocodedCoordinates,
  mapboxStaticImageUrl,
  publicMapboxToken,
} from "./static-map";

describe("static map helpers", () => {
  it("uses only a public Mapbox token", () => {
    expect(
      publicMapboxToken({
        MAPBOX_API_TOKEN: "sk.private",
        MAPBOX_API_TOKEN_PUBLIC: "pk.public",
      }),
    ).toBe("pk.public");
  });

  it("reads forward-geocoding coordinates in longitude latitude order", () => {
    expect(
      geocodedCoordinates({
        features: [{ geometry: { coordinates: [-81.016, 35.115] } }],
      }),
    ).toEqual({ latitude: 35.115, longitude: -81.016 });
  });

  it("builds a pinned raster preview around the canonical point", () => {
    expect(
      mapboxStaticImageUrl({
        latitude: 35.115,
        longitude: -81.016,
        token: "pk.public",
      }),
    ).toContain("pin-s+0d6370(-81.016,35.115)/-81.016,35.115,15/960x540@2x");
  });
});
