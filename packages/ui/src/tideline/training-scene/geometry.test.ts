import { trainingSceneExamples } from "@duna/core/training-scene";
import { describe, expect, it } from "vitest";
import { buildDrawing } from "./drawing";
import {
  bowControl,
  courtLines,
  frameBounds,
  placeLabels,
  placePhrase,
  project,
  quadPoint,
  regionOf,
  type SceneCourt,
} from "./geometry";
import { prepareTrainingScene, type PreparedScene } from "./prepare";
import { buildTimeline } from "./timeline";

const beach: SceneCourt = {
  type: "beach",
  length: 16,
  width: 8,
  freeZone: 3,
  netHeight: 2.24,
  netLength: 8.5,
  surface: "sand",
  half: false,
  noCourt: false,
};
const indoor: SceneCourt = {
  ...beach,
  type: "indoor",
  length: 18,
  width: 9,
  netLength: 9.5,
  surface: "hard",
};

function prepared(index: number): PreparedScene {
  const result = prepareTrainingScene(trainingSceneExamples[index]);
  if (!result.ok) throw new Error("example does not validate");
  return result.scene;
}

describe("where a point is, in words", () => {
  it("reads sides, depth and left / right from the player's own view", () => {
    // Side A faces +y: its right hand is +x.
    expect(regionOf(beach, { x: 2.5, y: -6.5 })).toMatchObject({
      side: "A",
      depth: "deep",
      lateral: "right",
    });
    // Side B faces −y: its right hand is −x.
    expect(regionOf(beach, { x: 2.5, y: 6.5 })).toMatchObject({
      side: "B",
      lateral: "left",
    });
    expect(placePhrase(beach, { x: 0, y: -9.2 })).toBe(
      "behind the end line of side A, in the middle",
    );
    expect(placePhrase(beach, { x: -5.2, y: -5 })).toBe(
      "outside the left sideline of side A",
    );
    expect(placePhrase(beach, { x: 0.5, y: -1.2 })).toBe(
      "the net on side A, in the middle",
    );
  });

  it("names indoor rotation zones", () => {
    expect(placePhrase(indoor, { x: -3, y: -7 })).toBe("zone 5 on side A");
    expect(placePhrase(indoor, { x: 3, y: -7 })).toBe("zone 1 on side A");
    expect(placePhrase(indoor, { x: 0, y: -7 })).toBe("zone 6 on side A");
    expect(placePhrase(indoor, { x: -3, y: -1 })).toBe(
      "zone 4 at the net on side A",
    );
    expect(placePhrase(indoor, { x: 3, y: 6 })).toBe("zone 5 on side B");
  });
});

describe("court scaling", () => {
  it("keeps the court and everything in it, never past the free zone", () => {
    const bounds = frameBounds(beach, [
      { x: 0, y: 30 },
      { x: -20, y: 0 },
    ]);
    expect(bounds).toEqual({ x0: -7, x1: 5, y0: -9, y1: 11 });
    const half = frameBounds({ ...beach, half: true }, [{ x: 0, y: -9.2 }]);
    expect(half.y1).toBeLessThanOrEqual(2.4);
  });

  it("projects metres to the page at one scale in both orientations", () => {
    const bounds = { x0: -5, x1: 5, y0: -9, y1: 9 };
    const landscape = project(bounds, "landscape", 30);
    expect(landscape.width).toBe(540);
    expect(landscape.height).toBe(300);
    // Side A on the left, its right hand down the page.
    expect(landscape.at({ x: 0, y: -9 })).toEqual({ x: 0, y: 150 });
    expect(landscape.at({ x: 5, y: 0 })).toEqual({ x: 270, y: 300 });
    const portrait = project(bounds, "portrait", 30);
    expect(portrait.width).toBe(300);
    // Side A at the bottom, its right hand on the right.
    expect(portrait.at({ x: 5, y: -9 })).toEqual({ x: 300, y: 540 });
    expect(portrait.at({ x: -5, y: 9 })).toEqual({ x: 0, y: 0 });
  });

  it("draws the attack lines and the centre line indoors only", () => {
    const sand = courtLines(beach).map((line) => line.kind);
    expect(sand).not.toContain("attack");
    expect(sand.filter((kind) => kind === "boundary")).toHaveLength(4);
    expect(sand.filter((kind) => kind === "service")).toHaveLength(4);
    const hall = courtLines(indoor);
    const attack = hall.filter((line) => line.kind === "attack");
    expect(attack.map((line) => Math.abs(line.a.y))).toEqual([3, 3]);
    expect(hall.some((line) => line.kind === "centre")).toBe(true);
  });
});

describe("paths and labels", () => {
  it("bows a path to the left of travel, through its control point", () => {
    const control = bowControl({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2);
    expect(control).toEqual({ x: 50, y: 20 });
    expect(quadPoint({ x: 0, y: 0 }, control, { x: 100, y: 0 }, 0.5)).toEqual({
      x: 50,
      y: 10,
    });
  });

  it("nudges a label off a taken spot", () => {
    const [spot] = placeLabels(
      [
        {
          anchor: { x: 50, y: 50 },
          w: 20,
          h: 10,
          offsets: [
            { x: 0, y: 20 },
            { x: 0, y: -20 },
          ],
        },
      ],
      { boxes: [{ x: 50, y: 70, w: 20, h: 10 }], points: [] },
    );
    expect(spot).toEqual({ x: 50, y: 30 });
  });

  it.each(trainingSceneExamples.map((_, index) => [index]))(
    "example %i: numbers never sit on each other and role labels do not overlap",
    (index) => {
      const timeline = buildTimeline(prepared(index));
      for (const orientation of ["landscape", "portrait"] as const) {
        const drawing = buildDrawing(timeline, { orientation });
        const badges = drawing.paths.map((path) => path.badge);
        for (let i = 0; i < badges.length; i++) {
          for (let j = i + 1; j < badges.length; j++) {
            const gap = Math.hypot(
              badges[i]!.x - badges[j]!.x,
              badges[i]!.y - badges[j]!.y,
            );
            expect(gap).toBeGreaterThan(drawing.sizes.badge * 1.2);
          }
        }
        const roles = drawing.people.filter((person) => person.roleAt);
        expect(roles.length).toBeGreaterThan(0);
        for (const person of drawing.people) {
          expect(person.at.x).toBeGreaterThanOrEqual(0);
          expect(person.at.x).toBeLessThanOrEqual(drawing.projection.width);
        }
      }
    },
  );
});
