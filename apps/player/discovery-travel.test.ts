import { describe, expect, it } from "vitest";
import {
  buildDrivingMatrixRequest,
  formatDrivingDistance,
  formatDrivingDuration,
  parseDrivingMatrix,
} from "./discovery-travel";

describe("discovery driving estimates", () => {
  it("builds one-to-many traffic requests without exceeding Matrix limits", () => {
    const request = buildDrivingMatrixRequest(
      { latitude: 33.9, longitude: -118.4 },
      Array.from({ length: 12 }, (_, index) => ({
        id: `result-${index}`,
        latitude: 33.91 + index / 100,
        longitude: -118.41 - index / 100,
      })),
      "pk.test",
    );
    expect(request?.destinationIds).toHaveLength(9);
    expect(request?.url).toContain("mapbox/driving-traffic");
    expect(request?.url).toContain("sources=0");
    expect(request?.url).toContain("annotations=distance,duration");
  });

  it("parses nullable Matrix rows and formats both unit systems", () => {
    const estimates = parseDrivingMatrix(["near", "unroutable"], {
      code: "Ok",
      distances: [[16_093.44, null]],
      durations: [[3_900, null]],
    });
    expect(estimates.near).toEqual({
      distanceMeters: 16_093.44,
      durationSeconds: 3_900,
    });
    expect(estimates.unroutable).toBeUndefined();
    expect(formatDrivingDistance(16_093.44, "imperial")).toBe("10 mi");
    expect(formatDrivingDistance(16_093.44, "metric")).toBe("16 km");
    expect(formatDrivingDuration(3_900)).toBe("1 hr 5 min");
  });
});
