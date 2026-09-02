import { describe, expect, it } from "vitest";
import {
  courtCalibrationChecklist,
  deriveNetLine,
  edgeVisibility,
  geometryFromGuidance,
  geometrySettings,
  moveAntennaAnchor,
  moveCourtCorner,
  moveNetTopAnchor,
  moveNetTopLine,
  toggleAntennas,
  visibleCornerCount,
  withNearLineOffscreen,
} from "./court-calibration";

describe("court calibration geometry", () => {
  it("keeps an intentionally off-screen near line instead of clamping it", () => {
    const partial = withNearLineOffscreen(geometryFromGuidance(undefined));

    expect(partial.corners[2].y).toBeGreaterThan(1);
    expect(partial.corners[3].y).toBeGreaterThan(1);
    expect(partial.nearLineVisible).toBe(false);
    expect(partial.edgeVisibility.near).toBe(false);
    expect(visibleCornerCount(partial)).toBe(2);
  });

  it("derives the ground-plane net line halfway along a 16-by-8 court", () => {
    const geometry = geometryFromGuidance(undefined);
    const net = deriveNetLine(geometry.corners);

    expect(net[0].x).toBeCloseTo(
      (geometry.corners[0].x + geometry.corners[3].x) / 2,
    );
    expect(net[1].y).toBeCloseTo(
      (geometry.corners[1].y + geometry.corners[2].y) / 2,
    );
  });

  it("preserves manual geometry fields for Vision remote sync", () => {
    let geometry = moveCourtCorner(geometryFromGuidance(undefined), 3, {
      x: -0.12,
      y: 1.18,
    });
    geometry = toggleAntennas(geometry, true);
    const saved = geometrySettings(geometry);
    const restored = geometryFromGuidance(undefined, saved);

    expect(restored.corners[3]).toEqual({ x: -0.12, y: 1.18 });
    expect(restored.mode).toBe("manual");
    expect(restored.antennaPoints).toHaveLength(2);
    expect(restored.edgeVisibility).toEqual(
      edgeVisibility(restored.corners, restored.netTopLine),
    );
  });

  it("keeps antenna tips attached to the net and lets each tip be refined", () => {
    let geometry = toggleAntennas(geometryFromGuidance(undefined), true);
    const originalTip = geometry.antennaPoints![0];
    const originalNet = geometry.netLine[0];
    geometry = moveNetTopAnchor(geometry, 0, {
      x: originalNet.x + 0.1,
      y: originalNet.y - 0.2,
    });

    expect(geometry.antennaPoints![0]).toEqual({
      x: originalTip.x + 0.1,
      y: originalTip.y - 0.2,
    });
    geometry = moveAntennaAnchor(geometry, 0, { x: 0.2, y: 0.12 });
    expect(geometry.antennaPoints![0]).toEqual({ x: 0.2, y: 0.12 });
  });

  it("moves the complete net and its antennas as one rigid guide", () => {
    let geometry = toggleAntennas(geometryFromGuidance(undefined), true);
    const originalNet = geometry.netTopLine ?? geometry.netLine;
    const originalAntennas = geometry.antennaPoints!;
    const center = {
      x: (originalNet[0].x + originalNet[1].x) / 2 + 0.12,
      y: (originalNet[0].y + originalNet[1].y) / 2 - 0.08,
    };

    geometry = moveNetTopLine(geometry, center);

    expect(geometry.netTopLine![0]).toEqual({
      x: originalNet[0].x + 0.12,
      y: originalNet[0].y - 0.08,
    });
    expect(geometry.netTopLine![1].x - geometry.netTopLine![0].x).toBeCloseTo(
      originalNet[1].x - originalNet[0].x,
    );
    expect(geometry.antennaPoints![1]).toEqual({
      x: originalAntennas[1].x + 0.12,
      y: originalAntennas[1].y - 0.08,
    });
  });

  it("walks the player through each missing calibration signal", () => {
    const initial = courtCalibrationChecklist(undefined, "landscape");
    expect(initial.find((step) => step.active)?.id).toBe("ground");

    const framed = courtCalibrationChecklist(
      {
        acceptable: false,
        calibratedAt: "2026-08-17T12:00:00.000Z",
        confidence: 0.8,
        courtDetected: true,
        groundPlaneDetected: true,
        lidarAvailable: true,
        netDetected: true,
        orientationMatches: true,
        preferredOrientation: "landscape",
        qualityGrade: "good",
        qualityScore: 72,
        visibleCornerCount: 3,
        warnings: [],
      },
      "landscape",
    );

    expect(framed.find((step) => step.active)?.id).toBe("coverage");
    expect(framed.find((step) => step.id === "ground")?.detail).toContain(
      "LiDAR",
    );

    const obstructed = courtCalibrationChecklist(
      {
        acceptable: false,
        calibratedAt: "2026-09-02T12:00:00.000Z",
        confidence: 0.22,
        foregroundObstructionLikely: true,
        orientationMatches: true,
        preferredOrientation: "landscape",
        qualityGrade: "limited",
        qualityScore: 48,
        warnings: ["A close grid may be crossing the camera view."],
      },
      "landscape",
    );
    expect(obstructed.find((step) => step.active)?.id).toBe("clear-view");
    expect(
      obstructed.find((step) => step.id === "clear-view")?.detail,
    ).toContain("close grid");
  });
});
