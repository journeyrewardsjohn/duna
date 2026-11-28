import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATIONS,
  durationLabel,
  normalizeDurations,
  resolveDuration,
  timeSlots,
  type DayAvailability,
} from "./time-slots";

const day: DayAvailability = {
  openMinute: 8 * 60,
  closeMinute: 22 * 60,
  blocks: [],
};
const run = (availability: DayAvailability, duration: number, extra = {}) =>
  timeSlots({ availability, duration, locale: "en-US", ...extra });

describe("durations", () => {
  it("defaults to 60/90/120/180", () => {
    expect(DEFAULT_DURATIONS).toEqual([60, 90, 120, 180]);
    expect(normalizeDurations()).toEqual([60, 90, 120, 180]);
    expect(normalizeDurations([])).toEqual([60, 90, 120, 180]);
  });
  it("cleans a club's own set", () => {
    expect(normalizeDurations([120, 60, 60, 0, -5, 45.5, 90])).toEqual([
      60, 90, 120,
    ]);
    expect(normalizeDurations([0, -1])).toEqual([60, 90, 120, 180]);
  });
  it("resolves a duration the club has not enabled to the nearest", () => {
    expect(resolveDuration([60, 120], 120)).toBe(120);
    expect(resolveDuration([60, 120], 100)).toBe(120);
    expect(resolveDuration([60, 120], 90)).toBe(60); // tie goes shorter
    expect(resolveDuration([], 150)).toBe(120);
  });
  it("labels durations", () => {
    expect(durationLabel(60)).toEqual({ hours: 1, minutes: 0, text: "60 min" });
    expect(durationLabel(90).text).toBe("90 min");
    expect(durationLabel(120).text).toBe("2 h");
    expect(durationLabel(150)).toEqual({
      hours: 2,
      minutes: 30,
      text: "2 h 30 min",
    });
    expect(durationLabel(180).text).toBe("3 h");
  });
});

describe("timeSlots", () => {
  it("offers every half hour that fits before closing", () => {
    const m = run(day, 90);
    expect(m.duration).toBe(90);
    expect(m.selectableStarts[0]).toBe(8 * 60);
    expect(m.selectableStarts.at(-1)).toBe(20 * 60 + 30); // 8:30 PM + 90 = 10:00 PM
    expect(m.slots.at(-1)).toMatchObject({
      startMinute: 21 * 60 + 30,
      available: false,
      reason: "runs-past-closing",
    });
  });

  it("never returns a slot that runs past closing", () => {
    for (const d of DEFAULT_DURATIONS) {
      const m = run(day, d);
      for (const start of m.selectableStarts)
        expect(start + d).toBeLessThanOrEqual(day.closeMinute);
    }
  });

  it("never returns a slot across an unavailable block, and says why", () => {
    const availability: DayAvailability = {
      ...day,
      blocks: [
        { startMinute: 10 * 60, endMinute: 11 * 60, reason: "booked" },
        { startMinute: 15 * 60, endMinute: 16 * 60, reason: "maintenance" },
      ],
    };
    const m = run(availability, 120);
    for (const start of m.selectableStarts) {
      for (const b of availability.blocks) {
        expect(start < b.endMinute && start + 120 > b.startMinute).toBe(false);
      }
    }
    const nine = m.slots.find((s) => s.startMinute === 9 * 60);
    expect(nine).toMatchObject({ available: false, reason: "booked" });
    // A block that ends exactly at the start is fine.
    expect(m.slots.find((s) => s.startMinute === 11 * 60)?.available).toBe(
      true,
    );
    expect(m.slots.find((s) => s.startMinute === 14 * 60 + 30)?.reason).toBe(
      "maintenance",
    );
  });

  it("marks starts before now as in the past, and ignores null now", () => {
    const m = run({ ...day, nowMinute: 9 * 60 + 10 }, 60);
    expect(m.slots.find((s) => s.startMinute === 9 * 60)).toMatchObject({
      available: false,
      reason: "in-the-past",
    });
    expect(m.slots.find((s) => s.startMinute === 9 * 60 + 30)?.available).toBe(
      true,
    );
    expect(run({ ...day, nowMinute: null }, 60).slots[0]?.available).toBe(true);
  });

  it("past wins over a block, a block wins over closing", () => {
    const a: DayAvailability = {
      openMinute: 20 * 60,
      closeMinute: 22 * 60,
      nowMinute: 21 * 60,
      blocks: [{ startMinute: 20 * 60, endMinute: 22 * 60, reason: "held" }],
    };
    const m = run(a, 180, { enabledDurations: [180] });
    expect(m.slots[0]?.reason).toBe("in-the-past");
    expect(m.slots[2]?.reason).toBe("held");
  });

  it("labels the longest case, 10:30 PM", () => {
    const m = run(
      { openMinute: 22 * 60 + 30, closeMinute: 24 * 60, blocks: [] },
      60,
    );
    expect(m.slots[0]?.start.text).toBe("10:30 PM");
    expect(m.slots[0]?.end.text).toBe("11:30 PM");
  });

  it("supports closing after midnight", () => {
    const m = run(
      { openMinute: 22 * 60, closeMinute: 25 * 60, blocks: [] },
      120,
    );
    expect(m.selectableStarts.at(-1)).toBe(23 * 60);
    expect(m.slots.find((s) => s.startMinute === 23 * 60)?.end.text).toBe(
      "1:00 AM",
    );
  });

  it("lists enabled durations with selected and selectable flags", () => {
    const tight: DayAvailability = {
      openMinute: 8 * 60,
      closeMinute: 9 * 60 + 30,
      blocks: [],
    };
    const m = run(tight, 90, { enabledDurations: [60, 90, 120] });
    expect(
      m.durations.map((d) => [d.minutes, d.selected, d.selectable]),
    ).toEqual([
      [60, false, true],
      [90, true, true],
      [120, false, false],
    ]);
    expect(m.durations[2]?.label.text).toBe("2 h");
  });

  it("falls back to an enabled duration when the chosen one is not enabled", () => {
    const m = run(day, 150, { enabledDurations: [60, 120] });
    expect(m.duration).toBe(120);
    expect(m.durations.find((d) => d.selected)?.minutes).toBe(120);
  });

  it("honours a custom step and rejects a bad one", () => {
    expect(
      run(day, 60, { step: 60 })
        .slots.slice(0, 2)
        .map((s) => s.startMinute),
    ).toEqual([480, 540]);
    expect(() => run(day, 60, { step: 0 })).toThrow(RangeError);
    expect(() => run(day, 60, { step: 7.5 })).toThrow(RangeError);
  });

  it("returns nothing for a closed day", () => {
    const m = run({ openMinute: 600, closeMinute: 600, blocks: [] }, 60);
    expect(m.slots).toEqual([]);
    expect(m.selectableStarts).toEqual([]);
    expect(m.durations.every((d) => !d.selectable)).toBe(true);
  });
});
