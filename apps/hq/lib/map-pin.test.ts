import { describe, expect, it } from "vitest";
import { moveMapCoordinate, nudgeMapCoordinate } from "./map-pin";

describe("exact venue pin math", () => {
  it("moves east and south with positive pixel deltas", () => {
    const moved = moveMapCoordinate({
      latitude: 33.8847,
      longitude: -118.4109,
      deltaX: 80,
      deltaY: 80,
      zoom: 17,
    });
    expect(moved.longitude).toBeGreaterThan(-118.4109);
    expect(moved.latitude).toBeLessThan(33.8847);
  });

  it("supports keyboard nudging", () => {
    const moved = nudgeMapCoordinate({
      latitude: 33.8847,
      longitude: -118.4109,
      direction: "up",
    });
    expect(moved.latitude).toBeGreaterThan(33.8847);
    expect(moved.longitude).toBeCloseTo(-118.4109, 6);
  });
});
