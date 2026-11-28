import { describe, expect, it } from "vitest";
import {
  nextHalfPoint,
  ratingRingLayout,
  ratingRingModel,
  RATING_RING_GEOMETRY,
  reliabilityBand,
} from "./rating-ring";

const base = { locale: "en-US", reliability: 3 };

describe("nextHalfPoint", () => {
  it("rounds up to the next half point and keeps exact ones", () => {
    expect(nextHalfPoint(3.42)).toBe(3.5);
    expect(nextHalfPoint(3.5)).toBe(3.5);
    expect(nextHalfPoint(3.51)).toBe(4);
    expect(nextHalfPoint(3)).toBe(3);
  });
});

describe("reliabilityBand", () => {
  it("makes three segments with an 8-unit gap on r 84", () => {
    const band = reliabilityBand(2);
    expect(band).toHaveLength(3);
    expect(band.map((s) => s.filled)).toEqual([true, true, false]);
    const gapDeg = (8 / 84) * (180 / Math.PI);
    expect(band[0]?.sweepDeg).toBeCloseTo(120 - gapDeg, 6);
    expect((band[1]?.startDeg ?? 0) - (band[0]?.endDeg ?? 0)).toBeCloseTo(
      gapDeg,
      6,
    );
    expect(RATING_RING_GEOMETRY.band.radius).toBe(84);
  });

  it("clamps and rounds the filled count", () => {
    expect(reliabilityBand(-4).some((s) => s.filled)).toBe(false);
    expect(reliabilityBand(9).every((s) => s.filled)).toBe(true);
    expect(reliabilityBand(1.6).filter((s) => s.filled)).toHaveLength(2);
  });
});

describe("ratingRingModel", () => {
  it("up: arc grows to the new value with a +delta chip", () => {
    const m = ratingRingModel({ ...base, value: 3.42, delta: 0.08 });
    expect(m.state).toBe("up");
    expect(m.goal).toBe(3.5);
    expect(m.progressFraction).toBeCloseTo(0.84, 4);
    expect(m.progress.sweepDeg).toBeCloseTo(302.4, 1);
    expect(m.progressFrom.fraction).toBeCloseTo(0.68, 4);
    expect(m.label.number).toBe("3.42");
    expect(m.label.chip).toEqual({
      kind: "delta",
      direction: "up",
      text: "+0.08",
      amount: "0.08",
    });
    expect(m.dotted).toBe(false);
    expect(m.opacity).toBe(1);
    expect(m.band.filter((s) => s.filled)).toHaveLength(3);
  });

  it("down: retreats with a minus chip", () => {
    const m = ratingRingModel({ ...base, value: 3.3, delta: -0.04 });
    expect(m.state).toBe("down");
    expect(m.label.chip).toMatchObject({ direction: "down", text: "−0.04" });
    expect(m.progressFrom.fraction).toBeGreaterThan(m.progress.fraction);
  });

  it("steady: no chip when the rating did not change", () => {
    const m = ratingRingModel({ ...base, value: 3.3 });
    expect(m.state).toBe("steady");
    expect(m.label.chip).toBeNull();
    const zero = ratingRingModel({ ...base, value: 3.3, delta: 0 });
    expect(zero.state).toBe("steady");
  });

  it("reached: full arc and a reached chip at the goal", () => {
    const m = ratingRingModel({ ...base, value: 3.5, delta: 0.1 });
    expect(m.state).toBe("reached");
    expect(m.progress.fraction).toBe(1);
    expect(m.label.chip).toEqual({ kind: "reached", goalText: "3.50" });
  });

  it("a change that crosses a half point restarts the old arc at zero", () => {
    const m = ratingRingModel({ ...base, value: 3.54, delta: 0.1, goal: 4 });
    expect(m.progressFrom.fraction).toBe(0);
    expect(m.progressFraction).toBeCloseTo(0.08, 4);
  });

  it("honours an explicit goal and clamps progress", () => {
    const below = ratingRingModel({ ...base, value: 2.0, goal: 4 });
    expect(below.progressFraction).toBe(0);
    const above = ratingRingModel({ ...base, value: 5, goal: 4 });
    expect(above.state).toBe("reached");
    expect(above.progressFraction).toBe(1);
  });

  it("provisional: em dash, dotted, 45%, one segment, matches left", () => {
    const m = ratingRingModel({ ...base, value: 3.4, matchesLeft: 3 });
    expect(m.state).toBe("provisional");
    expect(m.label.number).toBeNull();
    expect(m.label.chip).toEqual({ kind: "matches-left", count: 3 });
    expect(m.dotted).toBe(true);
    expect(m.opacity).toBe(0.45);
    expect(m.band.filter((s) => s.filled)).toHaveLength(1);
    expect(m.progress.fraction).toBe(0);
    expect(m.goal).toBeNull();
  });

  it("null value is provisional with no chip", () => {
    const m = ratingRingModel({ ...base, value: null });
    expect(m.state).toBe("provisional");
    expect(m.label.chip).toBeNull();
  });

  it("formats numbers for the locale", () => {
    const m = ratingRingModel({
      locale: "de-DE",
      reliability: 2,
      value: 3.42,
      delta: 0.08,
    });
    expect(m.label.number).toBe("3,42");
  });
});

describe("ratingRingLayout", () => {
  it("follows the four size bands", () => {
    expect(ratingRingLayout(240).band).toBe("full");
    expect(ratingRingLayout(240).showLabel).toBe(true);
    expect(ratingRingLayout(239).band).toBe("medium");
    expect(ratingRingLayout(120).numberScale).toBe(0.25);
    expect(ratingRingLayout(119).band).toBe("compact");
    expect(ratingRingLayout(60)).toMatchObject({
      showChip: false,
      arcStroke: 14,
      numberScale: 0.3,
    });
    const tiny = ratingRingLayout(59);
    expect(tiny.band).toBe("arc-only");
    expect(tiny.showNumber).toBe(false);
    expect(tiny.numberScale).toBeNull();
  });
});
