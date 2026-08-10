import { distance, point } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { VenueLayoutGeoGeometry } from "@duna/api";
import { rectangleCoordinates } from "./venue-layout-geometry";

function dimensionsAt(latitude: number, rotationDegrees: number) {
  const geometry: VenueLayoutGeoGeometry = {
    coordinateSpace: "geo",
    shape: "rectangle",
    center: { latitude, longitude: -149.9 },
    widthMeters: 8,
    heightMeters: 16,
    rotationDegrees,
    bufferMeters: 3,
  };
  const corners = rectangleCoordinates(geometry);
  return {
    width: distance(point(corners[0]!), point(corners[1]!), {
      units: "meters",
    }),
    height: distance(point(corners[1]!), point(corners[2]!), {
      units: "meters",
    }),
  };
}

describe("venue layout map geometry", () => {
  it.each([
    ["Equator", 0],
    ["Anchorage", 61.2181],
  ])("preserves court dimensions at %s", (_label, latitude) => {
    const dimensions = dimensionsAt(latitude, 0);
    expect(dimensions.width).toBeCloseTo(8, 2);
    expect(dimensions.height).toBeCloseTo(16, 2);
  });

  it("preserves dimensions after rotation", () => {
    const dimensions = dimensionsAt(33.8847, 37);
    expect(dimensions.width).toBeCloseTo(8, 2);
    expect(dimensions.height).toBeCloseTo(16, 2);
  });

  it("expands each edge by the safety buffer", () => {
    const geometry: VenueLayoutGeoGeometry = {
      coordinateSpace: "geo",
      shape: "rectangle",
      center: { latitude: 33.8847, longitude: -118.4109 },
      widthMeters: 8,
      heightMeters: 16,
      rotationDegrees: 0,
      bufferMeters: 3,
    };
    const corners = rectangleCoordinates(geometry, geometry.bufferMeters);
    expect(
      distance(point(corners[0]!), point(corners[1]!), { units: "meters" }),
    ).toBeCloseTo(14, 2);
    expect(
      distance(point(corners[1]!), point(corners[2]!), { units: "meters" }),
    ).toBeCloseTo(22, 2);
  });
});
