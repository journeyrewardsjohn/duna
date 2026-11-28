import { describe, expect, it } from "vitest";
import {
  fitBox,
  initialCamera,
  mainCluster,
  MIN_SPAN_DEGREES,
} from "./map-region";

const edges = { top: 20, right: 0, bottom: 34, left: 0 };
const pin = { latitude: 33.89, longitude: -118.41 };

describe("Find map: where it opens", () => {
  it("keeps the phone behaviour", () => {
    expect(
      initialCamera({ pins: [pin], where: pin, compact: true, edges }),
    ).toEqual({
      kind: "center",
      centerCoordinate: [-118.41, 33.89],
      zoomLevel: 11,
    });
    const camera = initialCamera({
      pins: [pin],
      where: null,
      compact: true,
      edges,
    });
    expect(camera).toMatchObject({
      kind: "bounds",
      ne: [-118.41, 33.89],
      sw: [-118.41, 33.89],
    });
  });

  it("never opens a wide pane at continent zoom on one pin", () => {
    const camera = initialCamera({
      pins: [pin],
      where: null,
      compact: false,
      edges,
    });
    if (camera.kind !== "bounds") throw new Error("expected bounds");
    expect(camera.ne[0] - camera.sw[0]).toBeCloseTo(MIN_SPAN_DEGREES);
    expect(camera.ne[1] - camera.sw[1]).toBeCloseTo(MIN_SPAN_DEGREES);
    expect(camera.padding.right).toBeGreaterThan(camera.padding.left);
  });

  it("fits the results and the chosen place together in a wide pane", () => {
    const far = { latitude: 34.05, longitude: -118.24 };
    const camera = initialCamera({
      pins: [pin],
      where: far,
      compact: false,
      edges,
    });
    expect(camera).toMatchObject({
      kind: "bounds",
      ne: [-118.24, 34.05],
      sw: [-118.41, 33.89],
    });
  });

  it("fits the main cluster, not one far-away result", () => {
    const la = Array.from({ length: 6 }, (_, index) => ({
      latitude: 33.86 + index * 0.01,
      longitude: -118.41 + index * 0.01,
    }));
    const charlotte = { latitude: 35.16, longitude: -80.99 };
    const camera = initialCamera({
      pins: [...la, charlotte],
      where: null,
      compact: false,
      edges,
    });
    if (camera.kind !== "bounds") throw new Error("expected bounds");
    expect(camera.ne[0]).toBeLessThan(-118);
    expect(mainCluster([pin, charlotte])).toHaveLength(2);
  });

  it("falls back without pins", () => {
    expect(fitBox([])).toBeNull();
    expect(
      initialCamera({ pins: [], where: null, compact: false, edges }).kind,
    ).toBe("center");
  });
});
