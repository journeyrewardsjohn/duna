import { describe, expect, it } from "vitest";
import {
  UNAVAILABLE_POSTURE,
  derivePostureSnapshot,
  foldAxis,
  foldFromDivision,
  parseRegionsEvent,
  postureFromHingeStatus,
  type NativeRegions,
} from "./posture";

const zero = { top: 0, left: 0, bottom: 0, right: 0 };

function regions(overrides: Partial<NativeRegions> = {}): NativeRegions {
  return {
    available: true,
    hingeStatus: "fullyOpen",
    window: { width: 951, height: 669 },
    safeArea: { top: 24, left: 0, bottom: 20, right: 0 },
    division: [],
    occlusion: [],
    ...overrides,
  };
}

describe("parseRegionsEvent", () => {
  it("accepts a well-formed payload", () => {
    const parsed = parseRegionsEvent({
      available: true,
      hingeStatus: "partiallyOpen",
      window: { width: 669, height: 951 },
      safeArea: { top: 20, left: 0, bottom: 20, right: 0 },
      division: [
        {
          id: "fold",
          x: 0,
          y: 463,
          width: 669,
          height: 25,
          margins: { top: 4, left: 0, bottom: 4, right: 0 },
          active: true,
        },
      ],
      occlusion: [],
    });
    expect(parsed?.division[0]).toMatchObject({ y: 463, active: true });
    expect(parsed?.hingeStatus).toBe("partiallyOpen");
  });

  it("rejects malformed payloads instead of guessing", () => {
    expect(parseRegionsEvent(null)).toBeNull();
    expect(parseRegionsEvent({ window: { width: "951" } })).toBeNull();
    expect(
      parseRegionsEvent({
        window: { width: 951, height: 669 },
        safeArea: { top: Number.NaN, left: 0, bottom: 0, right: 0 },
      }),
    ).toBeNull();
  });

  it("drops invalid regions and unknown statuses", () => {
    const parsed = parseRegionsEvent({
      available: true,
      hingeStatus: "sideways",
      window: { width: 951, height: 669 },
      safeArea: zero,
      division: [{ x: 1 }, { x: 0, y: 0, width: -2, height: 3 }],
      occlusion: "nope",
    });
    expect(parsed?.division).toEqual([]);
    expect(parsed?.occlusion).toEqual([]);
    expect(parsed?.hingeStatus).toBe("unavailable");
  });
});

describe("postureFromHingeStatus", () => {
  it("maps UIKit hinge statuses", () => {
    expect(postureFromHingeStatus("closed")).toBe("closed");
    expect(postureFromHingeStatus("partiallyOpen")).toBe("half-open");
    expect(postureFromHingeStatus("fullyOpen")).toBe("open");
    expect(postureFromHingeStatus("none")).toBe("not-foldable");
    expect(postureFromHingeStatus("unknown")).toBe("unknown");
    expect(postureFromHingeStatus(undefined)).toBe("unknown");
  });
});

describe("fold", () => {
  it("reads the axis from the band's shape", () => {
    expect(foldAxis({ x: 463, y: 0, width: 25, height: 669 })).toBe("vertical");
    expect(foldAxis({ x: 0, y: 463, width: 669, height: 25 })).toBe(
      "horizontal",
    );
  });

  it("prefers the active division region", () => {
    const fold = foldFromDivision([
      {
        id: "a",
        x: 0,
        y: 0,
        width: 10,
        height: 100,
        margins: zero,
        active: false,
      },
      {
        id: "b",
        x: 400,
        y: 0,
        width: 20,
        height: 669,
        margins: zero,
        active: true,
      },
    ]);
    expect(fold).toMatchObject({ axis: "vertical", active: true });
    expect(fold?.rect.x).toBe(400);
  });

  it("ignores empty regions", () => {
    expect(foldFromDivision([])).toBeNull();
    expect(
      foldFromDivision([
        {
          id: "a",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          margins: zero,
          active: true,
        },
      ]),
    ).toBeNull();
  });
});

describe("derivePostureSnapshot", () => {
  it("derives nothing when no API is present (iOS 26, web, Android without the module)", () => {
    expect(
      derivePostureSnapshot({
        nativeModuleLinked: false,
        regions: null,
        hingeAvailable: false,
        hinge: null,
      }),
    ).toEqual(UNAVAILABLE_POSTURE);
  });

  it("reports not-foldable on an iPhone or iPad running iOS 27.1+", () => {
    const snapshot = derivePostureSnapshot({
      nativeModuleLinked: true,
      regions: regions({ hingeStatus: "none" }),
      hingeAvailable: true,
      hinge: null,
    });
    expect(snapshot.posture).toBe("not-foldable");
    expect(snapshot.isAvailable).toBe(true);
    expect(snapshot.fold).toBeNull();
  });

  it("uses the hinge for posture and the division region for the fold", () => {
    const snapshot = derivePostureSnapshot({
      nativeModuleLinked: true,
      regions: regions({
        window: { width: 669, height: 951 },
        division: [
          {
            id: "f",
            x: 0,
            y: 463,
            width: 669,
            height: 25,
            margins: zero,
            active: true,
          },
        ],
      }),
      hingeAvailable: true,
      hinge: { angle: 120, status: "partiallyOpen" },
    });
    expect(snapshot.posture).toBe("half-open");
    expect(snapshot.hingeAngle).toBe(120);
    expect(snapshot.fold).toMatchObject({ axis: "horizontal", active: true });
  });

  it("drops the fold when closed and keeps only active occlusions", () => {
    const snapshot = derivePostureSnapshot({
      nativeModuleLinked: true,
      regions: regions({
        division: [
          {
            id: "f",
            x: 463,
            y: 0,
            width: 25,
            height: 669,
            margins: zero,
            active: false,
          },
        ],
        occlusion: [
          {
            id: "cam",
            x: 0,
            y: 0,
            width: 80,
            height: 30,
            margins: zero,
            active: true,
          },
          {
            id: "old",
            x: 0,
            y: 0,
            width: 80,
            height: 30,
            margins: zero,
            active: false,
          },
        ],
      }),
      hingeAvailable: true,
      hinge: { angle: 0, status: "closed" },
    });
    expect(snapshot.posture).toBe("closed");
    expect(snapshot.fold).toBeNull();
    expect(snapshot.occlusions.map((region) => region.id)).toEqual(["cam"]);
  });

  it("falls back to the observer's hinge status before expo-hinge reports", () => {
    const snapshot = derivePostureSnapshot({
      nativeModuleLinked: true,
      regions: regions({ hingeStatus: "fullyOpen" }),
      hingeAvailable: false,
      hinge: null,
    });
    expect(snapshot.posture).toBe("open");
  });

  it("ignores regions when the native module is not linked", () => {
    const snapshot = derivePostureSnapshot({
      nativeModuleLinked: false,
      regions: regions({
        division: [
          {
            id: "f",
            x: 463,
            y: 0,
            width: 25,
            height: 669,
            margins: zero,
            active: true,
          },
        ],
      }),
      hingeAvailable: true,
      hinge: { angle: 180, status: "fullyOpen" },
    });
    expect(snapshot.isAvailable).toBe(false);
    expect(snapshot.posture).toBe("open");
    expect(snapshot.fold).toBeNull();
  });
});
